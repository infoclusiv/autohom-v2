"""Compact ID helpers for observability events."""

from __future__ import annotations

import uuid


def _normalize_prefix(prefix: str) -> str:
    safe = "".join(ch for ch in str(prefix or "id").strip().lower() if ch.isalnum() or ch in {"_", "-"})
    return safe or "id"


def new_id(prefix: str) -> str:
    return f"{_normalize_prefix(prefix)}_{uuid.uuid4().hex}"


def new_trace_id() -> str:
    return new_id("trace")


def new_request_id() -> str:
    return new_id("req")


def new_connection_id() -> str:
    return new_id("conn")


def new_runtime_instance_id() -> str:
    return new_id("rt")
