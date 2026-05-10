"""Configuración central de la app Python para el bridge iLovePDF."""

import os

# ─── Extension Identity ──────────────────────────────────────────────────────
EXTENSION_ID = "zoho-acta-mapper"
EXTENSION_TYPE = "ilovepdf-converter"
DISPLAY_NAME = "Zoho Acta Mapper · iLovePDF"

# ─── WebSocket Server ────────────────────────────────────────────────────────
WS_HOST = "localhost"
WS_PORT = 8769

# ─── HTTP API Server ─────────────────────────────────────────────────────────
HTTP_HOST = "localhost"
HTTP_PORT = 7790

# ─── State ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, "state.json")
FLOWS_FILE = os.path.join(BASE_DIR, "flows", "flows.json")

# ─── Heartbeat / Keepalive ────────────────────────────────────────────────────
HEARTBEAT_PROBE_INTERVAL_S = 15.0
HEARTBEAT_STALE_AFTER_S = 30.0
HEARTBEAT_PING_TIMEOUT_S = 6.0
BOOTSTRAP_PING_TIMEOUT_S = 6.0

# ─── Conversion Rate Limiting ────────────────────────────────────────────────
CONVERSION_DELAY_BETWEEN_S = 20
