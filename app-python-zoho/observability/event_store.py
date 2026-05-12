"""Bounded in-memory event storage for observability slices."""

from __future__ import annotations

import json
from collections import deque
from collections.abc import Mapping
from datetime import datetime
from threading import RLock
from typing import Any

from .sanitize import sanitize_event

DEFAULT_MAX_EVENTS = 5000
DEFAULT_QUERY_LIMIT = 200
DEFAULT_MAX_EVENT_SIZE_BYTES = 32_000

FILTER_FIELDS = (
    "job_id",
    "trace_id",
    "pdf_id",
    "request_id",
    "component",
    "severity",
    "event",
    "agent_type",
    "connection_id",
    "runtime_instance_id",
    "tab_id",
    "download_id",
)


def _safe_int(value: Any, default: int) -> int:
    try:
        return max(1, int(value))
    except Exception:
        return default


def _json_size_bytes(value: Any) -> int:
    try:
        encoded = json.dumps(value, ensure_ascii=True, separators=(",", ":"), default=str)
    except Exception:
        encoded = json.dumps({"unserializable": str(type(value).__name__)}, ensure_ascii=True)
    return len(encoded.encode("utf-8"))


def _normalize_event_shape(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        candidate = dict(value)
        candidate.setdefault("schema_version", "1.0")
        candidate.setdefault("component", "unknown")
        candidate.setdefault("event", "unknown.event")
        candidate.setdefault("severity", "info")
        return candidate
    return {
        "schema_version": "1.0",
        "component": "unknown",
        "event": "unknown.event",
        "severity": "warning",
        "message": "Stored malformed observability event.",
        "data": {
            "original_type": type(value).__name__,
            "value": value,
        },
        "truncated": True,
    }


def _parse_ts(value: Any) -> tuple[int, str]:
    if not isinstance(value, str) or not value.strip():
        return (1, "")
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(candidate)
    except Exception:
        return (1, str(value))
    return (0, parsed.isoformat())


class ObservabilityEventStore:
    """A best-effort, bounded, append-only event store."""

    def __init__(
        self,
        *,
        max_events: int = DEFAULT_MAX_EVENTS,
        max_event_size_bytes: int = DEFAULT_MAX_EVENT_SIZE_BYTES,
    ):
        self.max_events = _safe_int(max_events, DEFAULT_MAX_EVENTS)
        self.max_event_size_bytes = _safe_int(max_event_size_bytes, DEFAULT_MAX_EVENT_SIZE_BYTES)
        self._events: deque[dict[str, Any]] = deque()
        self._lock = RLock()
        self._next_seq = 1
        self._dropped_events_total = 0
        self._dropped_capacity_total = 0
        self._summarized_events_total = 0
        self._rejected_events_total = 0
        self._stored_events_total = 0

    def append(self, event: dict | Any) -> dict:
        try:
            stored_event, summarized, reason = self._prepare_event(event)
        except Exception as ex:
            with self._lock:
                self._rejected_events_total += 1
                self._dropped_events_total += 1
            return {
                "ok": False,
                "stored": 0,
                "dropped": 1,
                "truncated": False,
                "reason": f"prepare_failed:{type(ex).__name__}",
            }

        with self._lock:
            stored_event["_seq"] = self._next_seq
            self._next_seq += 1
            self._events.append(stored_event)
            self._stored_events_total += 1

            dropped_capacity = 0
            while len(self._events) > self.max_events:
                self._events.popleft()
                dropped_capacity += 1

            if dropped_capacity:
                self._dropped_capacity_total += dropped_capacity
                self._dropped_events_total += dropped_capacity

            if summarized:
                self._summarized_events_total += 1

            return {
                "ok": True,
                "stored": 1,
                "dropped": dropped_capacity,
                "truncated": bool(stored_event.get("truncated")),
                "reason": reason,
                "store_size": len(self._events),
                "max_events": self.max_events,
                "dropped_events_total": self._dropped_events_total,
            }

    def append_many(self, events: list[dict] | Any) -> dict:
        items = events if isinstance(events, list) else [events]
        stored = 0
        dropped = 0
        truncated = False
        reasons: list[str] = []

        for event in items:
            result = self.append(event)
            stored += int(result.get("stored", 0) or 0)
            dropped += int(result.get("dropped", 0) or 0)
            truncated = truncated or bool(result.get("truncated"))
            reason = result.get("reason")
            if reason:
                reasons.append(str(reason))

        return {
            "ok": stored > 0 or not items,
            "stored": stored,
            "dropped": dropped,
            "truncated": truncated,
            "reason": ";".join(reasons[:5]) or None,
            "count": len(items),
            "dropped_events_total": self.stats()["dropped_events_total"],
        }

    def query(
        self,
        *,
        job_id: str | None = None,
        trace_id: str | None = None,
        pdf_id: str | None = None,
        request_id: str | None = None,
        component: str | None = None,
        severity: str | None = None,
        event: str | None = None,
        agent_type: str | None = None,
        connection_id: str | None = None,
        runtime_instance_id: str | None = None,
        tab_id: int | str | None = None,
        download_id: int | str | None = None,
        limit: int = DEFAULT_QUERY_LIMIT,
    ) -> dict:
        filters = {
            "job_id": job_id,
            "trace_id": trace_id,
            "pdf_id": pdf_id,
            "request_id": request_id,
            "component": component,
            "severity": severity,
            "event": event,
            "agent_type": agent_type,
            "connection_id": connection_id,
            "runtime_instance_id": runtime_instance_id,
            "tab_id": tab_id,
            "download_id": download_id,
        }
        return self._query_with_filters(filters, limit=limit)

    def recent(self, limit: int = DEFAULT_QUERY_LIMIT) -> dict:
        normalized_limit = _safe_int(limit, DEFAULT_QUERY_LIMIT)
        with self._lock:
            snapshot = list(self._events)

        ordered = self._ordered_events(snapshot)
        selected = ordered[-normalized_limit:]
        return self._query_result(
            events=selected,
            total_matching=len(ordered),
            limit=normalized_limit,
        )

    def clear(self) -> None:
        with self._lock:
            self._events.clear()
            self._next_seq = 1
            self._dropped_events_total = 0
            self._dropped_capacity_total = 0
            self._summarized_events_total = 0
            self._rejected_events_total = 0
            self._stored_events_total = 0

    def stats(self) -> dict:
        with self._lock:
            snapshot = list(self._events)

        oldest_ts = snapshot[0].get("ts") if snapshot else None
        newest_ts = snapshot[-1].get("ts") if snapshot else None
        return {
            "ok": True,
            "store_size": len(snapshot),
            "max_events": self.max_events,
            "max_event_size_bytes": self.max_event_size_bytes,
            "dropped_events_total": self._dropped_events_total,
            "dropped_capacity_total": self._dropped_capacity_total,
            "rejected_events_total": self._rejected_events_total,
            "summarized_events_total": self._summarized_events_total,
            "stored_events_total": self._stored_events_total,
            "oldest_event_ts": oldest_ts,
            "newest_event_ts": newest_ts,
        }

    def _prepare_event(self, event: dict | Any) -> tuple[dict[str, Any], bool, str | None]:
        summarized = False
        reason = None
        sanitized = sanitize_event(_normalize_event_shape(event))

        if not isinstance(sanitized, dict):
            sanitized = sanitize_event({"data": sanitized, "event": "unknown.event", "component": "unknown"})
            summarized = True
            reason = "non_mapping_event"

        size_bytes = _json_size_bytes(sanitized)
        if size_bytes <= self.max_event_size_bytes:
            return sanitized, summarized, reason

        summarized = True
        reason = "event_summarized_for_size"
        replacement = {
            "schema_version": sanitized.get("schema_version", "1.0"),
            "ts": sanitized.get("ts"),
            "monotonic_ms": sanitized.get("monotonic_ms"),
            "severity": sanitized.get("severity", "warning"),
            "component": sanitized.get("component", "observability.store"),
            "event": sanitized.get("event", "observability.event_summarized"),
            "phase": sanitized.get("phase"),
            "trace_id": sanitized.get("trace_id"),
            "job_id": sanitized.get("job_id"),
            "pdf_id": sanitized.get("pdf_id"),
            "request_id": sanitized.get("request_id"),
            "reply_to": sanitized.get("reply_to"),
            "agent_id": sanitized.get("agent_id"),
            "agent_type": sanitized.get("agent_type"),
            "connection_id": sanitized.get("connection_id"),
            "runtime_instance_id": sanitized.get("runtime_instance_id"),
            "tab_id": sanitized.get("tab_id"),
            "download_id": sanitized.get("download_id"),
            "message": "Event exceeded size limit and was summarized for storage.",
            "expected": {},
            "actual": {},
            "data": {
                "original_event": sanitized.get("event"),
                "original_component": sanitized.get("component"),
                "original_size_bytes": size_bytes,
                "max_event_size_bytes": self.max_event_size_bytes,
            },
            "duration_ms": sanitized.get("duration_ms"),
            "truncated": True,
        }
        summarized_event = sanitize_event(replacement)
        summarized_size = _json_size_bytes(summarized_event)
        if summarized_size <= self.max_event_size_bytes:
            return summarized_event, summarized, reason

        minimal_event = sanitize_event(
            {
                "schema_version": "1.0",
                "component": "observability.store",
                "event": "observability.event_dropped",
                "severity": "warning",
                "message": "Event exceeded size limit and was replaced with a compact summary.",
                "data": {
                    "original_size_bytes": size_bytes,
                    "max_event_size_bytes": self.max_event_size_bytes,
                },
                "truncated": True,
            }
        )
        return minimal_event, True, "event_replaced_for_size"

    def _query_with_filters(self, filters: dict[str, Any], *, limit: int) -> dict:
        normalized_limit = _safe_int(limit, DEFAULT_QUERY_LIMIT)
        with self._lock:
            snapshot = list(self._events)

        matching = [event for event in snapshot if self._matches_filters(event, filters)]
        ordered = self._ordered_events(matching)
        selected = ordered[:normalized_limit]
        return self._query_result(
            events=selected,
            total_matching=len(ordered),
            limit=normalized_limit,
        )

    def _matches_filters(self, event: Mapping[str, Any], filters: Mapping[str, Any]) -> bool:
        for field, expected in filters.items():
            if expected is None:
                continue
            if event.get(field) != expected:
                return False
        return True

    def _ordered_events(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(
            events,
            key=lambda item: (_parse_ts(item.get("ts")), int(item.get("_seq", 0))),
        )

    def _query_result(self, *, events: list[dict[str, Any]], total_matching: int, limit: int) -> dict:
        trimmed_events = [dict(item) for item in events]
        for item in trimmed_events:
            item.pop("_seq", None)

        return {
            "ok": True,
            "count": len(trimmed_events),
            "total_matching": total_matching,
            "truncated": total_matching > len(trimmed_events),
            "limit": limit,
            "dropped_events_total": self._dropped_events_total,
            "max_events": self.max_events,
            "events": trimmed_events,
        }
