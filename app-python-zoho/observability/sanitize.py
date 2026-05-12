"""Payload sanitization helpers for structured events."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

MAX_STRING_LENGTH = 2000
MAX_ARRAY_ITEMS = 50
MAX_OBJECT_KEYS = 100
MAX_DEPTH = 4

TRUNCATED_SUFFIX = "...[truncated]"
REDACTED_VALUE = "[redacted]"
SENSITIVE_KEY_FRAGMENTS = (
    "token",
    "secret",
    "password",
    "authorization",
    "cookie",
    "set-cookie",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
)


def _truncate_string(value: str) -> tuple[str, bool]:
    text = str(value)
    if len(text) <= MAX_STRING_LENGTH:
        return text, False
    limit = max(0, MAX_STRING_LENGTH - len(TRUNCATED_SUFFIX))
    return f"{text[:limit]}{TRUNCATED_SUFFIX}", True


def _is_sensitive_key(key: Any) -> bool:
    lowered = str(key or "").strip().lower()
    return any(fragment in lowered for fragment in SENSITIVE_KEY_FRAGMENTS)


def _summarize_binary(value: Any) -> str:
    try:
        size = len(value)
    except Exception:
        size = "unknown"
    return f"[binary:{type(value).__name__} size={size}]"


def _summarize_object(value: Any) -> str:
    try:
        text = str(value)
    except Exception:
        text = f"<unprintable {type(value).__name__}>"
    truncated, _ = _truncate_string(text)
    return truncated


def sanitize_value(value: Any, *, max_depth: int = MAX_DEPTH) -> Any:
    sanitized, _ = _sanitize_value(value, depth=0, max_depth=max_depth)
    return sanitized


def _sanitize_value(value: Any, *, depth: int, max_depth: int) -> tuple[Any, bool]:
    try:
        if value is None or isinstance(value, (bool, int, float)):
            return value, False

        if isinstance(value, str):
            return _truncate_string(value)

        if isinstance(value, bytes):
            return _summarize_binary(value), True

        if isinstance(value, BaseException):
            return _truncate_string(f"{type(value).__name__}: {value}")

        if depth >= max_depth:
            return f"[truncated:{type(value).__name__}:depth]", True

        if isinstance(value, Mapping):
            items = list(value.items())
            truncated = len(items) > MAX_OBJECT_KEYS
            result = {}
            for key, item_value in items[:MAX_OBJECT_KEYS]:
                safe_key = str(key)
                if _is_sensitive_key(safe_key):
                    result[safe_key] = REDACTED_VALUE
                    truncated = True
                    continue
                sanitized_item, item_truncated = _sanitize_value(
                    item_value,
                    depth=depth + 1,
                    max_depth=max_depth,
                )
                result[safe_key] = sanitized_item
                truncated = truncated or item_truncated
            if len(items) > MAX_OBJECT_KEYS:
                result["_truncated_keys"] = len(items) - MAX_OBJECT_KEYS
            return result, truncated

        if isinstance(value, (list, tuple, set, frozenset)):
            values = list(value)
            truncated = len(values) > MAX_ARRAY_ITEMS
            result = []
            for item in values[:MAX_ARRAY_ITEMS]:
                sanitized_item, item_truncated = _sanitize_value(
                    item,
                    depth=depth + 1,
                    max_depth=max_depth,
                )
                result.append(sanitized_item)
                truncated = truncated or item_truncated
            if len(values) > MAX_ARRAY_ITEMS:
                result.append(f"[+{len(values) - MAX_ARRAY_ITEMS} more items]")
            return result, truncated

        return _summarize_object(value), True
    except Exception as ex:
        return f"[sanitize_error:{type(ex).__name__}]", True


def sanitize_event(event: dict) -> dict:
    try:
        raw = dict(event or {})
    except Exception:
        raw = {"event": "unknown.event", "component": "unknown"}

    sanitized, truncated = _sanitize_value(raw, depth=0, max_depth=MAX_DEPTH)
    if not isinstance(sanitized, dict):
        sanitized = {"data": sanitized}
        truncated = True
    sanitized["truncated"] = bool(truncated or sanitized.get("truncated"))
    return sanitized
