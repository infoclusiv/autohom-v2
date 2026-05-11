# Slice 02 — Python Event Store and Safe Event Writer

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: Python observability foundation  
Depends on: `docs/observability/implementation_slices/01_schema_and_ids.md`  
Application behavior changes: **none expected**  
Runtime instrumentation: **none in this slice**  
Status: `ready_for_implementation`

---

## 1. Goal

Create the minimal Python-side event storage and writing layer for AutoHom v2.

This slice should add a bounded, append-only, in-process event store and a safe event writer wrapper.

The goal is to make later slices able to record structured observability events without changing current runtime behavior yet.

This slice must not connect the event writer to HTTP routes, WebSocket handlers, job conversion logic, state persistence, or browser extension ingestion.

---

## 2. Scope

Implement only the Python event storage foundation.

This slice should create:

1. A bounded in-memory event store.
2. A safe event writer that uses the schema and sanitizer from Slice 01.
3. Query helpers for retrieving events by common observability fields.
4. Optional Python tests if the repository test setup supports them.

This slice should not introduce persistence as a hard requirement. JSONL persistence may be designed later, but this slice should prefer a simple in-memory store to avoid side effects.

If the coding agent adds optional file persistence in this slice, it must be disabled by default, bounded, and best-effort. However, the preferred implementation for this slice is memory-only.

---

## 3. Required documents to read first

Before implementing this slice, read:

- `docs/observability/implementation_slices/00_execution_contract.md`
- `docs/observability/implementation_slices/01_schema_and_ids.md`
- `docs/observability/implementation_slices/02_python_event_store.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `01_schema_and_ids.md` as the foundation contract.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may create these files:

```text
app-python-zoho/observability/event_store.py
app-python-zoho/observability/event_writer.py
```

The coding agent may modify these files only if needed to expose the new APIs:

```text
app-python-zoho/observability/__init__.py
```

The coding agent may add optional tests only if the repository already has a compatible test structure:

```text
tests/observability/test_event_store.py
tests/observability/test_event_writer.py
```

If the repository does not already have a clear test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Forbidden files

Do not modify application runtime files in this slice:

```text
app-python-zoho/app.py
app-python-zoho/http_server.py
app-python-zoho/multi_agent_ws_server.py
app-python-zoho/agent_registry.py
app-python-zoho/state_manager.py
app-python-zoho/job_store.py
app-python-zoho/flow_orchestrator.py
app-python-zoho/pdf_scanner.py
```

Do not modify Chrome extension files in this slice:

```text
autohom-extension/background-main.js
autohom-extension/background-zoho.js
autohom-extension/sidepanel.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/eventWriter.js
autohom-extension/observability/ids.js
autohom-extension/observability/sanitize.js
autohom-extension/ilovepdf-background/bridge.js
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/tabManager.js
autohom-extension/ilovepdf-background/downloadTracker.js
autohom-extension/ilovepdf-background/router.js
autohom-extension/ilovepdf/content.js
autohom-extension/ilovepdf/pdfUploader.js
autohom-extension/ilovepdf/conversionAutomator.js
autohom-extension/ilovepdf/domHelpers.js
autohom-extension/ilovepdf/config.js
```

Do not modify:

```text
manifest.json
package.json
requirements.txt
pyproject.toml
README.md
```

If the agent believes any forbidden file must be modified, it must stop and explain why.

---

## 6. Required behavior

### 6.1 Event store behavior

Create a Python event store under:

```text
app-python-zoho/observability/event_store.py
```

The event store must be:

- Bounded.
- Append-only from the caller perspective.
- Safe to use from multiple app areas later.
- Dependency-light.
- Safe if given malformed events.
- Queryable by common event fields.
- Able to report truncation or dropped-event metadata.

The event store must not:

- Start background threads.
- Open sockets.
- Require external services.
- Require databases.
- Require cloud services.
- Write files by default.
- Import the application runtime.
- Mutate jobs or state.
- Block the main automation if an event cannot be stored.

---

### 6.2 Recommended event store API

Recommended class:

```python
class ObservabilityEventStore:
    def __init__(
        self,
        *,
        max_events: int = 5000,
        max_event_size_bytes: int = 32_000,
    ):
        ...
```

Recommended methods:

```python
append(event: dict) -> dict
append_many(events: list[dict]) -> dict
query(
    *,
    job_id: str | None = None,
    trace_id: str | None = None,
    pdf_id: str | None = None,
    request_id: str | None = None,
    component: str | None = None,
    severity: str | None = None,
    event: str | None = None,
    limit: int = 200,
) -> dict
recent(limit: int = 200) -> dict
clear() -> None
stats() -> dict
```

Recommended append result shape:

```json
{
  "ok": true,
  "stored": 1,
  "dropped": 0,
  "truncated": false,
  "reason": null
}
```

Recommended query result shape:

```json
{
  "ok": true,
  "count": 3,
  "total_matching": 3,
  "truncated": false,
  "dropped_events_total": 0,
  "events": []
}
```

Exact shapes may differ, but they must be clear, compact, and predictable.

---

### 6.3 Store limits

The store must enforce limits.

Required defaults:

```python
DEFAULT_MAX_EVENTS = 5000
DEFAULT_QUERY_LIMIT = 200
DEFAULT_MAX_EVENT_SIZE_BYTES = 32_000
```

Allowed adjustments are acceptable if the agent explains them.

Rules:

- If the store exceeds `max_events`, drop the oldest events first.
- Track how many events were dropped due to capacity.
- If a single event is too large, sanitize/truncate it if possible.
- If the event remains too large, store a compact replacement event that explains the original was dropped or summarized.
- Never store unbounded payloads.
- Never store binary data raw.
- Never store full PDFs, Excel files, blobs, full HTML, or huge request/response bodies.

---

### 6.4 Event ordering

The store should preserve append order.

Query results should be stable and predictable.

Recommended ordering:

1. Sort by `ts` if available.
2. Use append sequence as tie-breaker.
3. If timestamp parsing is unreliable, keep append order.

The store may add an internal sequence number such as `_seq` or `seq` if helpful.

If an internal sequence field is added, it must be compact and safe for diagnostic output.

---

### 6.5 Thread safety

The store should be safe for basic concurrent access.

Preferred approach:

```python
threading.RLock
```

Use Python standard library only.

The implementation does not need to solve distributed concurrency.

---

### 6.6 Event writer behavior

Create a Python event writer under:

```text
app-python-zoho/observability/event_writer.py
```

The event writer should wrap event construction and storage.

It must be best-effort.

If event building, sanitization, or storing fails, it must not raise uncaught exceptions to the caller.

Recommended class:

```python
class ObservabilityEventWriter:
    def __init__(self, store: ObservabilityEventStore | None = None):
        ...
```

Recommended methods:

```python
emit(
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
) -> dict
```

Optional methods:

```python
emit_event(event: dict) -> dict
emit_many(events: list[dict]) -> dict
query(**filters) -> dict
recent(limit: int = 200) -> dict
stats() -> dict
```

Recommended behavior:

- Use `build_event()` from `schema.py`.
- Use `sanitize_event()` from `sanitize.py`.
- Store the final event in the event store.
- Return a compact result.
- Never throw uncaught exceptions to runtime callers.
- If something fails, return:

```json
{
  "ok": false,
  "stored": 0,
  "dropped": 1,
  "reason": "..."
}
```

---

### 6.7 Default store and writer

It is acceptable to expose a default process-local store/writer for future slices.

Recommended module-level helpers:

```python
default_event_store = ObservabilityEventStore()
default_event_writer = ObservabilityEventWriter(default_event_store)

def emit_observability_event(**kwargs) -> dict:
    ...
```

If a default writer is added, it must be:

- Lazy or lightweight.
- Safe to import.
- Not connected to runtime automatically.
- Not writing files.
- Not starting threads.

Do not emit any startup event in this slice.

---

### 6.8 `__init__.py` exports

If modifying:

```text
app-python-zoho/observability/__init__.py
```

Expose only small helper APIs.

Recommended exports:

```python
from .event_store import ObservabilityEventStore
from .event_writer import ObservabilityEventWriter, emit_observability_event
```

Keep existing exports from Slice 01.

Do not perform runtime initialization in `__init__.py`.

---

## 7. Required query filters

The store must support filtering by:

```text
job_id
trace_id
pdf_id
request_id
component
severity
event
```

Optional, but useful if simple:

```text
agent_type
connection_id
runtime_instance_id
tab_id
download_id
```

Filters should be exact-match.

Missing fields must not crash the query.

Malformed events must not crash the query.

---

## 8. Required metadata

Store/query responses should include useful metadata.

Recommended metadata fields:

```text
ok
count
total_matching
truncated
limit
dropped_events_total
max_events
```

Optional:

```text
oldest_event_ts
newest_event_ts
store_size
```

This helps later diagnostics know whether the returned timeline is complete.

---

## 9. Required event fields compatibility

The event store must accept events shaped like this:

```json
{
  "schema_version": "1.0",
  "ts": "2026-05-10T00:00:00.000Z",
  "monotonic_ms": 0,
  "severity": "info",
  "component": "python.http",
  "event": "conversion.requested",
  "phase": "requested",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "reply_to": "req_...",
  "agent_id": "agent_...",
  "agent_type": "ilovepdf-converter",
  "connection_id": "conn_...",
  "runtime_instance_id": "rt_...",
  "tab_id": 123,
  "download_id": 456,
  "message": "Short human-readable message",
  "expected": {},
  "actual": {},
  "data": {},
  "duration_ms": 0,
  "truncated": false
}
```

The store must tolerate:

- Missing optional fields.
- Unknown additional fields.
- Invalid timestamps.
- Missing `trace_id`.
- Missing `job_id`.
- Legacy-like events that do not perfectly match the schema.

---

## 10. Required event names support

This slice does not need to emit runtime events yet.

However, the writer must be able to store event names from the initial vocabulary, including:

```text
process.started
state.load.succeeded
state.load.failed
state.save.succeeded
state.save.failed
http.request.received
http.request.failed
conversion.requested
conversion.validation.failed
conversion.command.sent
conversion.command.timeout
conversion.status.received
conversion.completed
conversion.failed
ws.connection.opened
ws.connection.closed
agent.registration.succeeded
agent.registration.failed
```

Do not enforce a strict taxonomy in this slice.

The writer should accept event names as strings.

---

## 11. Acceptance criteria

This slice is complete when:

- `app-python-zoho/observability/event_store.py` exists.
- `app-python-zoho/observability/event_writer.py` exists.
- The store can append one valid event.
- The store can append multiple events.
- The store can query by `job_id`.
- The store can query by `trace_id`.
- The store can query by `pdf_id`.
- The store can query by `request_id`.
- The store can query by `component`.
- The store can query by `severity`.
- The store enforces a maximum number of events.
- The store drops oldest events when capacity is exceeded.
- The store tracks dropped events.
- Query output includes truncation/completeness metadata.
- The writer can build and store an event using `build_event()`.
- Writer failures do not raise uncaught exceptions.
- Malformed events do not crash the store.
- No runtime files are modified.
- No HTTP endpoint is added.
- No WebSocket behavior is changed.
- No browser extension files are modified.
- No state migration is introduced.
- No file persistence is required.
- No heavy dependencies are added.

---

## 12. Manual test plan

The coding agent should run a small manual check from the repository.

The exact command may depend on the project layout. If needed, set `PYTHONPATH` to include `app-python-zoho`.

Example:

```bash
PYTHONPATH=app-python-zoho python - <<'PY'
from observability.event_store import ObservabilityEventStore
from observability.event_writer import ObservabilityEventWriter
from observability.ids import new_trace_id

store = ObservabilityEventStore(max_events=3)
writer = ObservabilityEventWriter(store)

trace_id = new_trace_id()

writer.emit(
    component="python.test",
    event="conversion.requested",
    severity="info",
    trace_id=trace_id,
    job_id="job_manual_1",
    pdf_id="pdf_manual_1",
    request_id="req_manual_1",
    message="Manual event store test",
    data={"large_text": "x" * 5000, "password": "hidden"},
)

writer.emit(
    component="python.test",
    event="conversion.command.sent",
    severity="info",
    trace_id=trace_id,
    job_id="job_manual_1",
)

print(store.query(job_id="job_manual_1"))
print(store.query(trace_id=trace_id))
print(store.stats())
PY
```

Expected result:

- No exception is raised.
- Query by `job_id` returns events.
- Query by `trace_id` returns events.
- Large string is truncated.
- Sensitive value is redacted.
- Store stats are returned.

Capacity check:

```bash
PYTHONPATH=app-python-zoho python - <<'PY'
from observability.event_store import ObservabilityEventStore
from observability.event_writer import ObservabilityEventWriter

store = ObservabilityEventStore(max_events=2)
writer = ObservabilityEventWriter(store)

for i in range(5):
    writer.emit(
        component="python.test",
        event="test.event",
        job_id=f"job_{i}",
        message=f"event {i}",
    )

print(store.recent(limit=10))
print(store.stats())
PY
```

Expected result:

- Store contains only the newest 2 events.
- Dropped event count is greater than zero.
- No exception is raised.

---

## 13. Automated test plan

If compatible with the existing project test setup, add tests for:

```text
tests/observability/test_event_store.py
tests/observability/test_event_writer.py
```

Recommended tests:

### `test_event_store.py`

- Append valid event.
- Append malformed event.
- Query by `job_id`.
- Query by `trace_id`.
- Query by `pdf_id`.
- Query by `request_id`.
- Query by `component`.
- Query by `severity`.
- Enforce `max_events`.
- Drop oldest events first.
- Track dropped count.
- Return metadata.
- Respect query limit.
- Do not crash on missing fields.

### `test_event_writer.py`

- `emit()` builds and stores event.
- `emit_event()` stores prebuilt event if implemented.
- Invalid severity is safe.
- Long values are sanitized.
- Sensitive fields are redacted.
- Store failure is caught and returned as `ok: false`.
- Writer does not throw uncaught exceptions.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 14. Out of scope

Do not implement:

- HTTP ingestion endpoint.
- `POST /api/observability/events`.
- `GET /api/jobs/{job_id}/timeline`.
- Diagnostics endpoint changes.
- Event forwarding from the Chrome extension.
- JavaScript event writer.
- WebSocket instrumentation.
- Conversion instrumentation.
- Runtime queue instrumentation.
- Download tracker instrumentation.
- Selector failure instrumentation.
- Tab lifecycle instrumentation.
- JSONL persistence as a required behavior.
- External database.
- SQLite.
- DuckDB.
- OpenTelemetry.
- Dashboard.
- Metrics.
- Screenshots.
- DOM snapshots.
- Full diagnostic package export.
- State machine validation.
- State migration.
- Generic logging across the codebase.

---

## 15. Rollback notes

This slice should be easy to roll back.

Rollback should consist of deleting:

```text
app-python-zoho/observability/event_store.py
app-python-zoho/observability/event_writer.py
```

and reverting any minor export changes in:

```text
app-python-zoho/observability/__init__.py
```

Also delete optional tests created for this slice.

Because no runtime files should be modified, rollback should not affect application behavior.

---

## 16. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 02 completion report

### Implemented

### Changed files

### Tests run

### Tests not run and why

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
03_observability_ingestion_endpoint.md
```

The agent must stop after this report.

---

## 17. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/02_python_event_store.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/final_pre_implementation_review.md

Your task is to create the Python bounded event store and safe event writer only.

You may create or modify only the files listed in the “Allowed files” section of Slice 02.

Do not modify any forbidden file.

Do not wire the event writer into runtime code yet.

Do not add HTTP endpoints.

Do not add WebSocket instrumentation.

Do not modify conversion logic.

Do not modify JobStore or StateManager.

Do not modify browser extension files.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, global state machines, databases, or heavy dependencies.

The store must be bounded, local, compact, queryable, and best-effort.

When done, provide the required Slice 02 completion report and stop.
```
