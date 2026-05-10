"""Entry point for the central orchestrator."""

import signal
import sys

from aiohttp import web

from config import HTTP_HOST, HTTP_PORT
from flow_orchestrator import FlowOrchestrator
from http_server import create_app
from job_store import JobStore
from multi_agent_ws_server import MultiAgentWebSocketServer
from state_manager import StateManager


def main():
    print("=" * 50)
    print("  AutoHom Central Orchestrator")
    print("=" * 50)
    print()

    state_manager = StateManager()
    job_store = JobStore(state_manager)
    ws_server = MultiAgentWebSocketServer(state_manager=state_manager, job_store=job_store)
    flow_orchestrator = FlowOrchestrator(job_store=job_store, ws_server=ws_server)

    print(f"[OK] State manager loaded (folder: {state_manager.get_current_folder() or '(none)'})")

    ok, msg = ws_server.start_ws_server()
    if not ok:
        print(f"[ERROR] WebSocket server failed: {msg}")
        sys.exit(1)
    print(f"[OK] {msg}")

    app = create_app(state_manager, ws_server, job_store, flow_orchestrator)

    def shutdown_handler(sig, frame):
        print("\n[SHUTDOWN] Stopping...")
        ws_server.stop_ws_server()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    print(f"[OK] HTTP API starting on http://{HTTP_HOST}:{HTTP_PORT}")
    print()
    print("Ready. Press Ctrl+C to stop.")
    print()

    web.run_app(app, host=HTTP_HOST, port=HTTP_PORT, print=None)


if __name__ == "__main__":
    main()
