"""WebSocket server — patrón de conexión estable de clusiv-v5/chatgpt_bridge.py.

Implementa: bootstrap handshake, identity validation, duplicate detection,
connection replacement, keepalive probe, request/response waiters.
"""

import asyncio
import collections
import json
import threading
import time

from config import (
    EXTENSION_ID, EXTENSION_TYPE, DISPLAY_NAME,
    WS_HOST, WS_PORT,
    HEARTBEAT_PROBE_INTERVAL_S, HEARTBEAT_STALE_AFTER_S,
    HEARTBEAT_PING_TIMEOUT_S, BOOTSTRAP_PING_TIMEOUT_S,
)

try:
    import websockets
except ImportError:
    websockets = None

_LAST_ERROR_UNSET = object()


class ILovePDFBridgeSession:
    """Single-extension WebSocket bridge session (simplified from clusiv-v5)."""

    def __init__(self, state_manager=None):
        self.expected_extension_id = EXTENSION_ID
        self.expected_extension_type = EXTENSION_TYPE
        self.display_name = DISPLAY_NAME
        self.host = WS_HOST
        self.port = WS_PORT
        self.state_manager = state_manager

        self._active_ws_connection = None
        self._active_connection_meta = {
            "connection_id": None, "extension_type": None,
            "runtime_instance_id": None, "instance_id": None,
            "extension_id": None, "client_id": None, "version": "",
        }
        self._ws_loop = None
        self._ws_server = None
        self._ws_server_thread = None
        self._ws_server_started = threading.Event()
        self._ws_server_error = None
        self._extension_connected_event = threading.Event()

        self._ws_request_waiters = {}
        self._ws_request_waiters_lock = threading.Lock()
        self._connection_counter = 0
        self._connection_events = collections.deque(maxlen=100)

        self._bridge_state = self._build_default_bridge_state()
        # Callback for status updates (set by http_server for SSE/polling)
        self.on_status_change = None

    # ─── Default State ────────────────────────────────────────────────────

    def _build_default_bridge_state(self):
        return {
            "connected": False, "version": "", "status": "disconnected",
            "message": f"Esperando conexión de {self.display_name}.",
            "last_error": None, "host": self.host, "port": self.port,
            "last_seen": 0.0,
        }

    def get_bridge_state(self):
        state = dict(self._bridge_state)
        state["running"] = bool(
            self._ws_server is not None
            and self._ws_server_thread
            and self._ws_server_thread.is_alive()
        )
        state["connectionId"] = self._active_connection_meta.get("connection_id")
        ls = float(self._bridge_state.get("last_seen") or 0.0)
        state["lastSeenSecondsAgo"] = round(time.time() - ls, 1) if ls else None
        state["recentEvents"] = list(self._connection_events)[-20:]
        return state

    # ─── Logging ──────────────────────────────────────────────────────────

    def _log(self, msg):
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [Bridge] {msg}")

    def _log_conn(self, event, *, connection_id="", **extra):
        entry = {
            "t": round(time.time(), 3), "ts": time.strftime("%H:%M:%S"),
            "ev": str(event), "cid": str(connection_id or ""),
        }
        if extra:
            entry["d"] = {k: str(v) for k, v in extra.items()}
        self._connection_events.append(entry)

    def _touch_last_seen(self):
        self._bridge_state["last_seen"] = time.time()

    # ─── Status ───────────────────────────────────────────────────────────

    def _set_connection_status(self, *, connected=None, version=None,
                                status=None, message=None,
                                last_error=_LAST_ERROR_UNSET):
        if connected is not None:
            self._bridge_state["connected"] = bool(connected)
        if version is not None:
            self._bridge_state["version"] = str(version or "")
        if status is not None:
            self._bridge_state["status"] = str(status or "")
        if message is not None:
            self._bridge_state["message"] = str(message or "")
        if last_error is not _LAST_ERROR_UNSET:
            self._bridge_state["last_error"] = last_error
        if self._bridge_state["connected"]:
            self._touch_last_seen()
        self._log(f"[{self._bridge_state['status']}] {self._bridge_state['message']}")
        if self.on_status_change:
            try:
                self.on_status_change(self.get_bridge_state())
            except Exception:
                pass

    # ─── Identity Validation ──────────────────────────────────────────────

    def _validate_extension_identity(self, payload):
        actual_id = str(payload.get("extensionId") or "").strip()
        actual_type = str(payload.get("extensionType") or "").strip()
        if not actual_id:
            return False, "extensionId missing in handshake."
        if actual_id != self.expected_extension_id:
            return False, f"Unexpected extensionId: {actual_id}"
        if not actual_type:
            return False, "extensionType missing in handshake."
        if actual_type != self.expected_extension_type:
            return False, f"Unexpected extensionType: {actual_type}"
        return True, ""

    # ─── Connection Meta ──────────────────────────────────────────────────

    def _make_connection_id(self):
        self._connection_counter += 1
        return f"conn-{self._connection_counter}"

    def _build_connection_meta(self, payload=None, *, connection_id=""):
        data = dict(payload or {})
        runtime_id = str(data.get("runtimeInstanceId") or data.get("instanceId") or "default").strip() or "default"
        client_id = str(data.get("clientId") or data.get("extensionClientId") or self.expected_extension_id).strip()
        version = str(data.get("version") or "").strip()
        return {
            "connection_id": str(connection_id or ""),
            "extension_type": self.expected_extension_type,
            "runtime_instance_id": runtime_id,
            "instance_id": runtime_id,
            "extension_id": self.expected_extension_id,
            "client_id": client_id or self.expected_extension_id,
            "version": version,
        }

    def _same_runtime_identity(self, left, right):
        lc = str((left or {}).get("client_id") or "").strip()
        rc = str((right or {}).get("client_id") or "").strip()
        lr = str((left or {}).get("runtime_instance_id") or "").strip()
        rr = str((right or {}).get("runtime_instance_id") or "").strip()
        return bool(lc and rc and lr and rr and lc == rc and lr == rr)

    def _clear_connection_identity(self):
        for key in ("connection_id", "extension_type", "runtime_instance_id",
                     "instance_id", "extension_id", "client_id"):
            self._active_connection_meta[key] = None
        self._active_connection_meta["version"] = ""
        self._extension_connected_event.clear()

    # ─── Accept Connection ────────────────────────────────────────────────

    async def _accept_authenticated_connection(self, websocket, payload, *, action, connection_id):
        active_ws = self._active_ws_connection
        ok, error = self._validate_extension_identity(payload)
        if not ok:
            self._log_conn("auth_rejected", connection_id=connection_id, error=error)
            if websocket is active_ws or not self._extension_connected_event.is_set():
                self._set_connection_status(connected=False, status="rejected",
                                            message=error, last_error=error)
            await websocket.close(code=1008, reason="Unexpected extension identity")
            return False, "rejected"

        meta = self._build_connection_meta(payload, connection_id=connection_id)
        version = meta.get("version") or self._bridge_state.get("version") or ""
        meta["version"] = str(version or "")

        same_socket = websocket is active_ws
        replacing = active_ws is not None and not same_socket

        if replacing and self._extension_connected_event.is_set():
            if self._same_runtime_identity(self._active_connection_meta, meta):
                self._log_conn("auth_duplicate", connection_id=connection_id)
                await websocket.close(code=1008, reason="Duplicate active runtime")
                return False, "duplicate"

        if same_socket and self._extension_connected_event.is_set() and self._bridge_state.get("connected"):
            self._active_connection_meta = dict(meta)
            self._touch_last_seen()
            self._log_conn("auth_refreshed", connection_id=connection_id, action=action)
            return True, "refreshed"

        prev_ws = active_ws if replacing else None
        self._active_ws_connection = websocket
        self._active_connection_meta = dict(meta)
        self._extension_connected_event.set()
        self._set_connection_status(
            connected=True, version=version, status="connected",
            message=f"{self.display_name} v{version or '?'} conectada.", last_error=None,
        )

        if prev_ws is not None:
            self._log_conn("auth_replacing_prev", connection_id=connection_id)
            try:
                await prev_ws.close(code=1001, reason="Replaced by newer connection")
            except Exception:
                pass

        self._log_conn("auth_promoted", connection_id=connection_id, replacing=replacing)
        return True, "promoted"

    # ─── Bootstrap ────────────────────────────────────────────────────────

    async def _bootstrap_extension_connection(self, websocket, handshake_event, connection_id=""):
        try:
            self._log_conn("bootstrap_ping_sent", connection_id=connection_id)
            await websocket.send(json.dumps({
                "action": "PING", "source": "bootstrap",
                "requestId": self._make_ws_request_id(),
                "targetExtensionType": self.expected_extension_type,
                "targetExtensionId": self.expected_extension_id,
            }))
            await asyncio.wait_for(handshake_event.wait(), timeout=BOOTSTRAP_PING_TIMEOUT_S)
            self._log_conn("bootstrap_ok", connection_id=connection_id)
        except asyncio.TimeoutError:
            if handshake_event.is_set() or websocket is self._active_ws_connection:
                return
            if not self._extension_connected_event.is_set():
                self._set_connection_status(
                    connected=False, status="disconnected",
                    message=f"{self.display_name} no respondió al PING inicial.",
                    last_error="Bootstrap timeout",
                )
            try:
                await websocket.close(code=1008, reason="Handshake timeout")
            except Exception:
                pass
        except (asyncio.CancelledError, Exception):
            return

    # ─── Keepalive ────────────────────────────────────────────────────────

    async def _keepalive_probe(self, websocket, connection_id=""):
        try:
            while websocket is self._active_ws_connection:
                await asyncio.sleep(HEARTBEAT_PROBE_INTERVAL_S)
                if websocket is not self._active_ws_connection:
                    break
                if not self._extension_connected_event.is_set():
                    continue
                last_seen = float(self._bridge_state.get("last_seen") or 0.0)
                if not last_seen:
                    continue
                stale = round(time.time() - last_seen, 1)
                if stale <= HEARTBEAT_STALE_AFTER_S:
                    continue

                self._log_conn("keepalive_ping", connection_id=connection_id, stale_s=stale)
                ok, _, _ = await asyncio.to_thread(self.ping_extension, HEARTBEAT_PING_TIMEOUT_S)
                if ok:
                    continue
                if websocket is not self._active_ws_connection:
                    continue

                self._log_conn("keepalive_failed", connection_id=connection_id)
                self._set_connection_status(
                    connected=False, status="connected_unresponsive",
                    message=f"{self.display_name} dejó de responder al heartbeat.",
                )
                try:
                    await websocket.close()
                except Exception:
                    pass
                break
        except asyncio.CancelledError:
            return

    # ─── WebSocket Handler ────────────────────────────────────────────────

    async def ws_handler(self, websocket):
        connection_id = self._make_connection_id()
        handshake_event = asyncio.Event()
        bootstrap_task = asyncio.create_task(
            self._bootstrap_extension_connection(websocket, handshake_event, connection_id)
        )
        keepalive_task = None
        self._log_conn("ws_handler_start", connection_id=connection_id)

        if not self._active_ws_connection or not self._extension_connected_event.is_set():
            self._set_connection_status(
                connected=False, status="socket_connected",
                message=f"Socket abierto. Esperando handshake de {self.display_name}.",
            )

        try:
            async for message in websocket:
                data = json.loads(message)
                action = data.get("action")

                if action in ("PONG", "EXTENSION_CONNECTED"):
                    accepted, _ = await self._accept_authenticated_connection(
                        websocket, data, action=action, connection_id=connection_id,
                    )
                    if accepted:
                        handshake_event.set()
                        if websocket is self._active_ws_connection and keepalive_task is None:
                            keepalive_task = asyncio.create_task(
                                self._keepalive_probe(websocket, connection_id)
                            )
                        if action == "PONG":
                            self._resolve_ws_waiter(data)
                    continue

                if websocket is not self._active_ws_connection:
                    continue

                self._touch_last_seen()

                # ─── Business Messages ────────────────────────────────
                if action == "CONVERSION_STATUS":
                    pdf_id = data.get("pdfId")
                    status = data.get("status", "")
                    msg = data.get("message", "")
                    if pdf_id and self.state_manager:
                        self.state_manager.set_pdf_status(pdf_id, status, msg)
                    self._log_conn(
                        "conversion_status",
                        connection_id=connection_id,
                        pdf_id=pdf_id,
                        status=status,
                        message=msg,
                    )
                    self._log(f"[CONVERSION] pdfId={pdf_id} status={status} message={msg}")
                    self._resolve_ws_waiter(data)
                    continue

                # Generic waiter resolution
                self._resolve_ws_waiter(data)

        except Exception as ex:
            self._log_conn("ws_handler_exception", connection_id=connection_id, error=str(ex))
            if websocket is self._active_ws_connection:
                self._set_connection_status(
                    connected=False, status="error",
                    message=f"Bridge cerrado con error.", last_error=str(ex),
                )
        finally:
            is_active = websocket is self._active_ws_connection
            bootstrap_task.cancel()
            if keepalive_task:
                keepalive_task.cancel()
            for t in [bootstrap_task] + ([keepalive_task] if keepalive_task else []):
                try:
                    await t
                except asyncio.CancelledError:
                    pass
            if is_active:
                self._active_ws_connection = None
                self._clear_connection_identity()
                self._set_connection_status(
                    connected=False, version="", status="disconnected",
                    message=f"Esperando reconexión de {self.display_name}.",
                )

    # ─── Send / Request-Response ──────────────────────────────────────────

    def _make_ws_request_id(self, prefix="py"):
        return f"{prefix}_{int(time.time() * 1000)}_{threading.get_ident()}"

    def _register_ws_waiter(self, request_id):
        event = threading.Event()
        waiter = {"event": event, "payload": None}
        with self._ws_request_waiters_lock:
            self._ws_request_waiters[request_id] = waiter
        return waiter

    def _resolve_ws_waiter(self, data):
        request_id = data.get("requestId") or data.get("replyTo")
        if not request_id:
            return False
        with self._ws_request_waiters_lock:
            waiter = self._ws_request_waiters.get(request_id)
        if not waiter:
            return False
        waiter["payload"] = data
        waiter["event"].set()
        return True

    def _pop_ws_waiter(self, request_id):
        with self._ws_request_waiters_lock:
            return self._ws_request_waiters.pop(request_id, None)

    def send_ws_msg(self, msg_dict):
        if not isinstance(msg_dict, dict):
            return False
        allow_ping = str(msg_dict.get("action", "") or "") == "PING"
        if not (self._active_ws_connection and self._ws_loop
                and (self._extension_connected_event.is_set() or allow_ping)):
            return False

        payload = dict(msg_dict)
        payload.setdefault("targetExtensionType", self.expected_extension_type)
        payload.setdefault("targetExtensionId", self.expected_extension_id)

        try:
            future = asyncio.run_coroutine_threadsafe(
                self._active_ws_connection.send(json.dumps(payload)), self._ws_loop,
            )
            future.result(timeout=3)
            return True
        except Exception as ex:
            self._active_ws_connection = None
            self._clear_connection_identity()
            self._set_connection_status(
                connected=False, status="disconnected",
                message=f"{self.display_name} dejó de responder.", last_error=str(ex),
            )
            return False

    def send_ws_request_and_wait(self, msg_dict, expected_actions=None, timeout_s=10.0):
        if not isinstance(msg_dict, dict):
            return False, None, "Invalid message."
        request_id = str(msg_dict.get("requestId") or self._make_ws_request_id())
        payload = dict(msg_dict)
        payload["requestId"] = request_id
        waiter = self._register_ws_waiter(request_id)

        if not self.send_ws_msg(payload):
            self._pop_ws_waiter(request_id)
            return False, None, "Extension not connected."

        if not waiter["event"].wait(timeout_s):
            self._pop_ws_waiter(request_id)
            return False, None, f"Timeout waiting for response (requestId={request_id})."

        data = waiter.get("payload")
        self._pop_ws_waiter(request_id)

        if expected_actions:
            if (data or {}).get("action") not in set(expected_actions):
                return False, data, "Unexpected response action."
        return True, data, ""

    def ping_extension(self, timeout_s=6.0):
        return self.send_ws_request_and_wait(
            {"action": "PING", "source": "keepalive"},
            expected_actions={"PONG"}, timeout_s=timeout_s,
        )

    def is_connected(self):
        return bool(self._bridge_state.get("connected"))

    # ─── Server Lifecycle ─────────────────────────────────────────────────

    def start_ws_server(self, timeout_s=3.0):
        if websockets is None:
            err = "websockets package not installed."
            self._ws_server_error = err
            return False, err

        if self._ws_server_thread and self._ws_server_thread.is_alive() and self._ws_loop:
            return True, "WebSocket server already running."

        self._ws_server_started.clear()
        self._ws_server_error = None
        self._set_connection_status(
            connected=False, status="listening",
            message=f"WebSocket server escuchando en ws://{self.host}:{self.port}",
        )

        self._stop_event_async = None  # will be set inside the loop

        def _run_server():
            self._ws_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._ws_loop)

            async def _server_main():
                self._stop_event_async = asyncio.Event()
                try:
                    async with websockets.serve(
                        self.ws_handler, self.host, self.port,
                        ping_interval=None,
                        ping_timeout=None,
                    ) as server:
                        self._ws_server = server
                        self._ws_server_started.set()
                        self._log(f"WebSocket server running on ws://{self.host}:{self.port}")
                        await self._stop_event_async.wait()
                except Exception as ex:
                    self._ws_server_error = str(ex)
                    self._ws_server_started.set()
                    self._log(f"Server startup error: {ex}")
                finally:
                    self._ws_server = None

            try:
                self._ws_loop.run_until_complete(_server_main())
            finally:
                if not self._ws_loop.is_closed():
                    self._ws_loop.close()
                self._ws_loop = None

        self._ws_server_thread = threading.Thread(target=_run_server, daemon=True)
        self._ws_server_thread.start()
        self._ws_server_started.wait(timeout_s)

        if self._ws_server_error:
            return False, self._ws_server_error
        return True, f"WebSocket server started on ws://{self.host}:{self.port}"

    def stop_ws_server(self, timeout_s=5.0):
        if not self._ws_loop or not self._stop_event_async:
            return
        try:
            self._ws_loop.call_soon_threadsafe(self._stop_event_async.set)
        except Exception:
            pass
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if self._ws_loop is None:
                break
            time.sleep(0.1)
