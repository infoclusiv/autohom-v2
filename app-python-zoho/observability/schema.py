"""Event envelope builder for observability slices."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from .sanitize import sanitize_event, sanitize_value

SCHEMA_VERSION = "1.0"

ALLOWED_SEVERITIES = {
    "debug",
    "info",
    "warning",
    "error",
    "critical",
}


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _normalize_severity(severity: str | None) -> str:
    candidate = str(severity or "info").strip().lower()
    return candidate if candidate in ALLOWED_SEVERITIES else "info"


def _optional_text(value: Any) -> Any:
    if value is None:
        return None
    return sanitize_value(str(value))


def build_event(
    *,
    component: str,
    event: str,
    severity: str = "info",
    phase: str | None = None,
    message: str | None = None,
    trace_id: str | None = None,
    job_id: str | None = None,
    pdf_id: str | None = None,
    request_id: str | None = None,
    reply_to: str | None = None,
    agent_id: str | None = None,
    agent_type: str | None = None,
    connection_id: str | None = None,
    runtime_instance_id: str | None = None,
    tab_id: int | str | None = None,
    download_id: int | str | None = None,
    expected: dict | None = None,
    actual: dict | None = None,
    data: dict | None = None,
    duration_ms: int | float | None = None,
) -> dict:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "ts": _utc_timestamp(),
        "monotonic_ms": int(time.monotonic() * 1000),
        "severity": _normalize_severity(severity),
        "component": str(component or "unknown"),
        "event": str(event or "unknown.event"),
        "phase": _optional_text(phase),
        "trace_id": _optional_text(trace_id),
        "job_id": _optional_text(job_id),
        "pdf_id": _optional_text(pdf_id),
        "request_id": _optional_text(request_id),
        "reply_to": _optional_text(reply_to),
        "agent_id": _optional_text(agent_id),
        "agent_type": _optional_text(agent_type),
        "connection_id": _optional_text(connection_id),
        "runtime_instance_id": _optional_text(runtime_instance_id),
        "tab_id": sanitize_value(tab_id) if tab_id is not None else None,
        "download_id": sanitize_value(download_id) if download_id is not None else None,
        "message": _optional_text(message),
        "expected": sanitize_value(expected or {}),
        "actual": sanitize_value(actual or {}),
        "data": sanitize_value(data or {}),
        "duration_ms": sanitize_value(duration_ms) if duration_ms is not None else None,
    }
    return sanitize_event(payload)
