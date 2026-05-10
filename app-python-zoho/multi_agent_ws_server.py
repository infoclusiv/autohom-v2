"""Multi-agent WebSocket server with backward-compatible bridge behavior."""

import asyncio
import collections
import json
import threading
import time

from agent_registry import AgentRegistry
from config import (
    DISPLAY_NAME,
    HEARTBEAT_PING_TIMEOUT_S,
    HEARTBEAT_PROBE_INTERVAL_S,
    HEARTBEAT_STALE_AFTER_S,
    WS_HOST,
    WS_PORT,
)

try:
    import websockets
except ImportError:
    websockets = None


class MultiAgentWebSocketServer:
    def __init__(self, state_manager=None, job_store=None, agent_registry=None):
        self.state_manager = state_manager
        self.job_store = job_store
        self.agent_registry = agent_registry or AgentRegistry()
        self.display_name = DISPLAY_NAME
        self.host = WS_HOST
        self.port = WS_PORT
        self.on_status_change = None

        self._ws_loop = None
        self._ws_server = None
        self._ws_server_thread = None
        self._ws_server_started = threading.Event()
        self._ws_server_error = None
        self._stop_event_async = None
        self._connection_counter = 0
        self._request_counter = 0
        self._connection_events = collections.deque(maxlen=200)
        self._ws_request_waiters = {}
        self._ws_request_waiters_lock = threading.Lock()
        self._bridge_state = self._build_bridge_state()

    def _build_bridge_state(self):
        return {
            "connected": False,
            "version": "",
            "status": "disconnected",
            "message": f"Esperando conexion de {self.display_name}.",
            "last_error": None,
            "host": self.host,
            "port": self.port,
            "last_seen": 0.0,
        }

    def _log(self, msg):
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [Bridge] {msg}")

    def _log_event(self, event, **extra):
        self._connection_events.append({
            "t": round(time.time(), 3),
            "ts": time.strftime("%H:%M:%S"),
            "ev": event,
            "d": {k: str(v) for k, v in extra.items()},
        })

    def _set_status(self, *, connected=None, version=None, status=None, message=None, last_error=None):
        if connected is not None:
            self._bridge_state["connected"] = bool(connected)
        if version is not None:
            self._bridge_state["version"] = str(version or "")
        if status is not None:
            self._bridge_state["status"] = status
        if message is not None:
            self._bridge_state["message"] = message
        if last_error is not None:
            self._bridge_state["last_error"] = last_error
        if self._bridge_state["connected"]:
            self._bridge_state["last_seen"] = time.time()
        if self.on_status_change:
            try:
                self.on_status_change(self.get_bridge_state())
            except Exception:
                pass

    def get_bridge_state(self):
        state = dict(self._bridge_state)
        state["running"] = bool(
            self._ws_server is not None and self._ws_server_thread and self._ws_server_thread.is_alive()
        )
        state["agents"] = self.agent_registry.list_agents()
        state["recentEvents"] = list(self._connection_events)[-20:]
        return state

    def list_agents(self):
        return self.agent_registry.list_agents()

    def is_connected(self, agent_type=None):
        if agent_type:
            return self.agent_registry.is_connected(agent_type)
        return bool(self.agent_registry.list_agents())

    def ping_extension(self, timeout_s=6.0):
        return self.send_agent_request(
            "ilovepdf-converter",
            {"action": "PING", "source": "keepalive"},
            expected_actions={"PONG"},
            timeout_s=timeout_s,
        )

    def _make_connection_id(self):
        self._connection_counter += 1
        return f"conn-{self._connection_counter}"

    def _make_request_id(self):
        self._request_counter += 1
        return f"py_{int(time.time() * 1000)}_{self._request_counter}"

    def _register_waiter(self, request_id):
        event = threading.Event()
        waiter = {"event": event, "payload": None}
        with self._ws_request_waiters_lock:
            self._ws_request_waiters[request_id] = waiter
        return waiter

    def _resolve_waiter(self, data):
        request_id = data.get("replyTo") or data.get("requestId")
        if not request_id:
            return False
        with self._ws_request_waiters_lock:
            waiter = self._ws_request_waiters.get(request_id)
        if not waiter:
            return False
        waiter["payload"] = data
        waiter["event"].set()
        return True

    def _pop_waiter(self, request_id):
        with self._ws_request_waiters_lock:
            return self._ws_request_waiters.pop(request_id, None)

    def _normalize_handshake(self, payload, connection_id):
        action = str(payload.get("action") or "")
        if action == "EXTENSION_CONNECTED":
            payload = dict(payload)
            payload["agentId"] = payload.get("extensionId") or payload.get("agentId")
            payload["agentType"] = payload.get("extensionType") or payload.get("agentType")
            payload.setdefault("capabilities", ["convert_pdf_to_excel", "detect_excel_download"])
        return {
            "connection_id": connection_id,
            "agent_id": str(payload.get("agentId") or "").strip(),
            "agent_type": str(payload.get("agentType") or "").strip(),
            "capabilities": list(payload.get("capabilities") or []),
            "runtime_instance_id": str(payload.get("runtimeInstanceId") or payload.get("instanceId") or "default").strip(),
            "version": str(payload.get("version") or "").strip(),
        }

    async def ws_handler(self, websocket):
        connection_id = self._make_connection_id()
        keepalive_task = None
        self._log_event("ws.open", connection_id=connection_id)
        self._set_status(connected=False, status="socket_connected", message="Socket abierto. Esperando handshake.")

        try:
            async for raw_message in websocket:
                data = json.loads(raw_message)
                action = str(data.get("action") or "")

                if action in {"AGENT_CONNECTED", "EXTENSION_CONNECTED"}:
                    meta = self._normalize_handshake(data, connection_id)
                    if not meta["agent_id"] or not meta["agent_type"]:
                        await websocket.close(code=1008, reason="Invalid handshake")
                        return
                    try:
                        registered = self.agent_registry.register(websocket, meta)
                    except ValueError as ex:
                        if str(ex) == "duplicate_runtime":
                            await websocket.close(code=1008, reason="Duplicate runtime")
                            return
                        raise
                    self._set_status(
                        connected=True,
                        version=registered.get("version"),
                        status="connected",
                        message=f"Agente {registered['agent_type']} conectado.",
                        last_error=None,
                    )
                    if self.job_store:
                        self.job_store.append_event("", {
                            "event": "agent.connected",
                            "agent_type": registered["agent_type"],
                            "message": f"{registered['agent_type']} connected",
                            "data": registered,
                        })
                    if keepalive_task is None:
                        keepalive_task = asyncio.create_task(self._keepalive_probe(connection_id, registered["agent_type"]))
                    continue

                if action == "PONG":
                    self.agent_registry.touch(connection_id)
                    self._bridge_state["last_seen"] = time.time()
                    self._resolve_waiter(data)
                    continue

                self.agent_registry.touch(connection_id)
                self._bridge_state["last_seen"] = time.time()

                if action == "CONVERSION_STATUS":
                    self._handle_conversion_status(data)
                    self._resolve_waiter(data)
                    continue

                self._resolve_waiter(data)

        except Exception as ex:
            self._log(f"WebSocket error: {ex}")
            self._set_status(connected=False, status="error", message="Bridge cerrado con error.", last_error=str(ex))
        finally:
            if keepalive_task:
                keepalive_task.cancel()
                try:
                    await keepalive_task
                except asyncio.CancelledError:
                    pass
            disconnected = self.agent_registry.unregister_by_connection_id(connection_id)
            if disconnected and self.job_store:
                self.job_store.append_event("", {
                    "event": "agent.disconnected",
                    "agent_type": disconnected.get("agent_type"),
                    "message": f"{disconnected.get('agent_type')} disconnected",
                })
            remaining = self.agent_registry.list_agents()
            self._set_status(
                connected=bool(remaining),
                version=remaining[0].get("version") if remaining else "",
                status="connected" if remaining else "disconnected",
                message="Agentes conectados." if remaining else f"Esperando reconexion de {self.display_name}.",
            )

    def _handle_conversion_status(self, data):
        pdf_id = data.get("pdfId")
        job_id = data.get("jobId")
        status = str(data.get("status") or "")
        message = str(data.get("message") or "")
        excel_path = str(data.get("excelPath") or data.get("downloadedFilename") or "").strip()

        if pdf_id and self.state_manager:
            self.state_manager.set_pdf_status(pdf_id, status, message)
        if job_id and self.job_store:
            self.job_store.update_job_status(job_id, "conversion", status, message)
            if excel_path and status == "completed":
                self.job_store.set_excel_path(job_id, excel_path)
            self.job_store.append_event(job_id, {
                "event": "conversion.status",
                "agent_type": "ilovepdf-converter",
                "message": message or f"conversion -> {status}",
                "data": data,
            })

    async def _keepalive_probe(self, connection_id, agent_type):
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_PROBE_INTERVAL_S)
                agent = self.agent_registry.get_agent(agent_type)
                if not agent or agent.get("connection_id") != connection_id:
                    return
                stale_s = time.time() - float(agent.get("last_seen") or 0)
                if stale_s <= HEARTBEAT_STALE_AFTER_S:
                    continue
                ok, _, _ = await asyncio.to_thread(
                    self.send_agent_request,
                    agent_type,
                    {"action": "PING", "targetAgentType": agent_type},
                    {"PONG"},
                    HEARTBEAT_PING_TIMEOUT_S,
                )
                if not ok:
                    websocket = self.agent_registry.get_websocket(agent_type)
                    if websocket:
                        await websocket.close()
                    return
        except asyncio.CancelledError:
            return

    def send_agent_request(self, agent_type, payload, expected_actions=None, timeout_s=30):
        request_id = str(payload.get("requestId") or self._make_request_id())
        message = dict(payload)
        message["requestId"] = request_id
        message.setdefault("targetAgentType", agent_type)

        websocket = self.agent_registry.get_websocket(agent_type)
        if websocket is None or self._ws_loop is None:
            return False, None, f"{agent_type} agent not connected"

        waiter = self._register_waiter(request_id)
        try:
            future = asyncio.run_coroutine_threadsafe(
                websocket.send(json.dumps(message)),
                self._ws_loop,
            )
            future.result(timeout=3)
            if self.job_store:
                self.job_store.append_event(message.get("jobId", ""), {
                    "event": "command.sent",
                    "agent_type": agent_type,
                    "message": f"Sent {message.get('action')}",
                    "data": message,
                })
            if not waiter["event"].wait(timeout_s):
                if self.job_store:
                    self.job_store.append_event(message.get("jobId", ""), {
                        "event": "command.timeout",
                        "agent_type": agent_type,
                        "message": f"Timeout waiting for {message.get('action')}",
                        "data": {"request_id": request_id},
                    })
                return False, None, f"Timeout waiting for response (requestId={request_id})."
            data = waiter.get("payload")
            if expected_actions and (data or {}).get("action") not in set(expected_actions):
                return False, data, "Unexpected response action."
            return True, data, ""
        except Exception as ex:
            return False, None, str(ex)
        finally:
            self._pop_waiter(request_id)

    def start_ws_server(self, timeout_s=3.0):
        if websockets is None:
            self._ws_server_error = "websockets package not installed."
            return False, self._ws_server_error
        if self._ws_server_thread and self._ws_server_thread.is_alive() and self._ws_loop:
            return True, "WebSocket server already running."

        self._ws_server_started.clear()
        self._ws_server_error = None
        self._set_status(
            connected=False,
            status="listening",
            message=f"WebSocket server escuchando en ws://{self.host}:{self.port}",
        )

        def run_server():
            self._ws_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._ws_loop)

            async def server_main():
                self._stop_event_async = asyncio.Event()
                try:
                    async with websockets.serve(
                        self.ws_handler,
                        self.host,
                        self.port,
                        ping_interval=None,
                        ping_timeout=None,
                    ) as server:
                        self._ws_server = server
                        self._ws_server_started.set()
                        await self._stop_event_async.wait()
                except Exception as ex:
                    self._ws_server_error = str(ex)
                    self._ws_server_started.set()
                finally:
                    self._ws_server = None

            try:
                self._ws_loop.run_until_complete(server_main())
            finally:
                if self._ws_loop and not self._ws_loop.is_closed():
                    self._ws_loop.close()
                self._ws_loop = None

        self._ws_server_thread = threading.Thread(target=run_server, daemon=True)
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
