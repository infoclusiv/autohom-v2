"""Best-effort event writer for the Python observability foundation."""

from __future__ import annotations

from typing import Any

from .event_store import ObservabilityEventStore
from .sanitize import sanitize_event
from .schema import build_event


class ObservabilityEventWriter:
    """Constructs and stores events without surfacing failures to callers."""

    def __init__(self, store: ObservabilityEventStore | None = None):
        self.store = store or ObservabilityEventStore()

    def emit(
        self,
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
        try:
            built_event = build_event(
                component=component,
                event=event,
                severity=severity,
                phase=phase,
                message=message,
                trace_id=trace_id,
                job_id=job_id,
                pdf_id=pdf_id,
                request_id=request_id,
                reply_to=reply_to,
                agent_id=agent_id,
                agent_type=agent_type,
                connection_id=connection_id,
                runtime_instance_id=runtime_instance_id,
                tab_id=tab_id,
                download_id=download_id,
                expected=expected,
                actual=actual,
                data=data,
                duration_ms=duration_ms,
            )
        except Exception as ex:
            return {
                "ok": False,
                "stored": 0,
                "dropped": 1,
                "truncated": False,
                "reason": f"build_failed:{type(ex).__name__}",
            }
        return self.emit_event(built_event)

    def emit_event(self, event: dict | Any) -> dict:
        try:
            return self.store.append(event)
        except Exception as ex:
            return {
                "ok": False,
                "stored": 0,
                "dropped": 1,
                "truncated": False,
                "reason": f"store_failed:{type(ex).__name__}",
            }

    def emit_many(self, events: list[dict] | Any) -> dict:
        try:
            items = events if isinstance(events, list) else [events]
            return self.store.append_many(items)
        except Exception as ex:
            count = len(events) if isinstance(events, list) else 1
            return {
                "ok": False,
                "stored": 0,
                "dropped": count,
                "truncated": False,
                "reason": f"batch_store_failed:{type(ex).__name__}",
            }

    def query(self, **filters: Any) -> dict:
        try:
            return self.store.query(**filters)
        except Exception as ex:
            return {
                "ok": False,
                "count": 0,
                "total_matching": 0,
                "truncated": False,
                "limit": filters.get("limit"),
                "dropped_events_total": self.store.stats().get("dropped_events_total", 0),
                "max_events": self.store.max_events,
                "events": [],
                "reason": f"query_failed:{type(ex).__name__}",
            }

    def recent(self, limit: int = 200) -> dict:
        try:
            return self.store.recent(limit=limit)
        except Exception as ex:
            return {
                "ok": False,
                "count": 0,
                "total_matching": 0,
                "truncated": False,
                "limit": limit,
                "dropped_events_total": self.store.stats().get("dropped_events_total", 0),
                "max_events": self.store.max_events,
                "events": [],
                "reason": f"recent_failed:{type(ex).__name__}",
            }

    def stats(self) -> dict:
        try:
            return self.store.stats()
        except Exception as ex:
            return {
                "ok": False,
                "reason": f"stats_failed:{type(ex).__name__}",
            }


default_event_store = ObservabilityEventStore()
default_event_writer = ObservabilityEventWriter(default_event_store)


def emit_observability_event(**kwargs: Any) -> dict:
    return default_event_writer.emit(**kwargs)
