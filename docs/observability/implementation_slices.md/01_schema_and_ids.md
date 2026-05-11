# Slice 01 — Schema, IDs, and Sanitization Helpers

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: first code foundation  
Depends on: `docs/observability/implementation_slices/00_execution_contract.md`  
Application behavior changes: **none expected**  
Runtime instrumentation: **none in this slice**  
Status: `ready_for_implementation`

---

## 1. Goal

Create the minimal observability helper layer for AutoHom v2 without wiring it into runtime behavior yet.

This slice creates:

1. A compact structured event envelope.
2. Safe ID generation helpers.
3. Payload sanitization helpers.
4. Matching Python and Chrome extension helper files.

The purpose is to give later slices a safe foundation for structured observability events without modifying the existing automation flow.

This slice must not instrument conversion, WebSocket, side panel, runtime queue, download tracker, or diagnostics endpoints yet.

---

## 2. Scope

Implement only foundational helper files.

This slice should create small, reusable modules that later slices can call.

The implementation must be conservative, local-only, dependency-light, and safe to import.

No existing app behavior should change after this slice.

---

## 3. Required documents to read first

Before implementing this slice, read:

- `docs/observability/implementation_slices/00_execution_contract.md`
- `docs/observability/final_pre_implementation_review.md`
- `docs/observability/implementation_roadmap.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `final_pre_implementation_review.md` as the scope reducer.

The roadmap is context, not permission to implement everything.

---

## 4. Allowed files

The coding agent may create these files:

### Python

```text
app-python-zoho/observability/__init__.py
app-python-zoho/observability/schema.py
app-python-zoho/observability/ids.py
app-python-zoho/observability/sanitize.py
```

### Chrome extension

```text
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/ids.js
autohom-extension/observability/sanitize.js
```

### Optional tests, only if the repository already has a compatible test structure

```text
tests/observability/test_schema.py
tests/observability/test_ids.py
tests/observability/test_sanitize.py
```

If the repository does not already have a clear test convention, do not invent a large testing framework in this slice. Instead, provide a simple manual verification note in the completion report.

---

## 5. Forbidden files

Do not modify these files in this slice:

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

Do not modify these Chrome extension files in this slice:

```text
autohom-extension/background-main.js
autohom-extension/background-zoho.js
autohom-extension/sidepanel.js
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

### 6.1 Python helper behavior

Create a small Python observability package under:

```text
app-python-zoho/observability/
```

The package must be safe to import.

It must not start services, open sockets, write files, mutate application state, or import heavy dependencies at import time.

It should expose enough functionality for later slices to build, sanitize, and identify events.

Recommended Python modules:

```text
schema.py
ids.py
sanitize.py
```

---

### 6.2 Python `ids.py`

Implement ID helpers.

Recommended functions:

```python
new_id(prefix: str) -> str
new_trace_id() -> str
new_request_id() -> str
new_connection_id() -> str
new_runtime_instance_id() -> str
```

Optional but allowed:

```python
new_download_id() -> str
new_tab_correlation_id() -> str
```

Requirements:

- Use Python standard library only.
- Prefer `uuid.uuid4().hex` or equivalent.
- IDs must be strings.
- IDs must have a readable prefix.
- IDs must be safe for JSON.
- IDs must not include spaces.
- IDs must not include local file paths.
- IDs must not include machine/user information.
- Do not require network access.
- Do not require external packages.

Recommended format:

```text
trace_0123456789abcdef
req_0123456789abcdef
conn_0123456789abcdef
rt_0123456789abcdef
```

The exact suffix length can differ, but it should be stable and compact.

---

### 6.3 Python `sanitize.py`

Implement safe sanitization helpers.

Recommended constants:

```python
MAX_STRING_LENGTH = 2000
MAX_ARRAY_ITEMS = 50
MAX_OBJECT_KEYS = 100
MAX_DEPTH = 4
```

Recommended functions:

```python
sanitize_value(value, *, max_depth=MAX_DEPTH)
sanitize_event(event: dict) -> dict
```

Optional but useful:

```python
is_truncated(value) -> bool
redact_sensitive_key(key: str, value)
```

Sanitization rules:

- Long strings must be truncated.
- Truncated strings should include a clear marker such as `...[truncated]`.
- Deep nested objects must be summarized or truncated.
- Large lists must be truncated.
- Large dictionaries must be truncated.
- Bytes and binary-like values must be replaced with a summary.
- Exceptions must be converted to a safe string summary.
- Unknown objects must be represented with a safe string, not raw repr if it is huge.
- Sanitization must never raise an uncaught exception.
- The sanitizer should mark events with `truncated: true` when any value is truncated or summarized.

Never store:

- Full PDFs.
- Full Excel files.
- Binary blobs.
- Full HTML.
- Huge request bodies.
- Huge response bodies.
- Access tokens.
- Cookies.
- Authorization headers.

Sensitive key names should be redacted if they appear in event `data`, `expected`, or `actual`.

Recommended sensitive key fragments:

```text
token
secret
password
authorization
cookie
set-cookie
api_key
apikey
access_token
refresh_token
```

When redacted, use:

```text
[redacted]
```

---

### 6.4 Python `schema.py`

Implement a compact event envelope builder.

Recommended constants:

```python
SCHEMA_VERSION = "1.0"

ALLOWED_SEVERITIES = {
    "debug",
    "info",
    "warning",
    "error",
    "critical",
}
```

Recommended function:

```python
build_event(
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

Requirements:

- Add `schema_version`.
- Add UTC ISO timestamp field `ts`.
- Add monotonic timestamp field `monotonic_ms`.
- Add `severity`.
- Add `component`.
- Add `event`.
- Add optional fields only when provided, or consistently set them to `None`.
- Sanitize `message`, `expected`, `actual`, and `data`.
- Sanitize the final event before returning it.
- Invalid severity should be normalized to `info` or `warning`, not crash.
- Missing `component` or `event` should not crash, but should produce a safe fallback such as:
  - `component: "unknown"`
  - `event: "unknown.event"`

Recommended timestamp format:

```text
2026-05-10T00:00:00.000Z
```

Do not use local timezone-specific strings.

---

### 6.5 Python `__init__.py`

Expose a minimal public API.

Recommended exports:

```python
from .schema import build_event
from .ids import (
    new_id,
    new_trace_id,
    new_request_id,
    new_connection_id,
    new_runtime_instance_id,
)
from .sanitize import sanitize_event, sanitize_value
```

Keep the file small.

Do not perform runtime initialization in `__init__.py`.

---

## 7. Chrome extension helper behavior

Create a matching helper layer under:

```text
autohom-extension/observability/
```

This layer must not be wired into the extension runtime yet.

It should be safe to load later from background/service-worker scripts.

Because the existing extension module style may vary, keep these files dependency-free and browser-compatible.

Do not modify the manifest in this slice.

Do not import these files from existing extension scripts in this slice.

---

### 7.1 JavaScript `ids.js`

Implement ID helpers.

Recommended global namespace:

```javascript
globalThis.AutoHomObservabilityIds
```

Recommended functions:

```javascript
newId(prefix)
newTraceId()
newRequestId()
newConnectionId()
newRuntimeInstanceId()
```

Requirements:

- Use `crypto.randomUUID()` if available.
- Use a safe random fallback if `crypto.randomUUID()` is unavailable.
- IDs must be strings.
- IDs must have readable prefixes.
- IDs must not include local file paths.
- IDs must not include machine/user information.
- No external dependencies.

Recommended format:

```text
trace_0123456789abcdef
req_0123456789abcdef
conn_0123456789abcdef
rt_0123456789abcdef
```

---

### 7.2 JavaScript `sanitize.js`

Implement sanitization helpers.

Recommended global namespace:

```javascript
globalThis.AutoHomObservabilitySanitize
```

Recommended constants:

```javascript
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 100;
const MAX_DEPTH = 4;
```

Recommended functions:

```javascript
sanitizeValue(value, options)
sanitizeEvent(event)
```

Requirements:

- Long strings must be truncated.
- Deep objects must be summarized or truncated.
- Large arrays must be truncated.
- Large plain objects must be truncated.
- Errors must become compact summaries.
- DOM nodes must not be serialized.
- Blobs, ArrayBuffers, Files, and binary-like objects must not be stored raw.
- HTML strings that look huge must be truncated.
- Sensitive keys must be redacted.
- Sanitization must never throw uncaught errors.
- Add `truncated: true` to events when truncation/redaction/summarization occurred.

Sensitive key fragments:

```text
token
secret
password
authorization
cookie
set-cookie
api_key
apikey
access_token
refresh_token
```

Use:

```text
[redacted]
```

for redacted values.

---

### 7.3 JavaScript `eventEnvelope.js`

Implement a compact event builder.

Recommended global namespace:

```javascript
globalThis.AutoHomObservabilityEventEnvelope
```

Recommended function:

```javascript
buildEvent({
  component,
  event,
  severity = "info",
  phase = null,
  message = null,
  trace_id = null,
  job_id = null,
  pdf_id = null,
  request_id = null,
  reply_to = null,
  agent_id = null,
  agent_type = null,
  connection_id = null,
  runtime_instance_id = null,
  tab_id = null,
  download_id = null,
  expected = null,
  actual = null,
  data = null,
  duration_ms = null
})
```

Requirements:

- Add `schema_version: "1.0"`.
- Add `ts` using `new Date().toISOString()`.
- Add `monotonic_ms` using `performance.now()` when available.
- Add `severity`.
- Add `component`.
- Add `event`.
- Add optional ID fields where provided.
- Sanitize `message`, `expected`, `actual`, and `data`.
- Sanitize the final event before returning it.
- Invalid severity should be normalized safely.
- Missing `component` or `event` should not throw; use safe fallbacks.

No existing extension code should call this helper yet in this slice.

---

## 8. Required event envelope fields

Both Python and JavaScript should produce events compatible with this shape:

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

Not every event needs every field.

Missing optional fields must be tolerated.

---

## 9. Required IDs

This slice should support these ID types:

```text
trace_id
request_id
connection_id
runtime_instance_id
```

It should also allow these IDs to be passed through event builders:

```text
job_id
pdf_id
reply_to
agent_id
agent_type
tab_id
download_id
```

Do not introduce full `flow_run_id`, `diagnostic_export_id`, `sidepanel_session_id`, or `process_run_id` propagation in this slice.

---

## 10. Required event names

This slice does not need to emit runtime events yet.

However, the schema must be able to represent the early event vocabulary from `00_execution_contract.md`, including:

### Python

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

### Chrome extension

```text
extension.bootstrap.started
bridge.ws.connect_attempted
bridge.ws.opened
bridge.ws.closed
bridge.command.received
bridge.command.ack_sent
runtime.queue.enqueued
runtime.queue.started
content.ready.succeeded
content.ready.failed
selector.file_input.failed
selector.convert_button.failed
selector.download_button.failed
download.tracker.started
download.matched
download.completed
download.timeout
conversion.status.send_attempted
conversion.status.send_failed
```

Do not create a large event taxonomy system in this slice.

The event builder should accept event names as strings.

---

## 11. Acceptance criteria

This slice is complete when:

- Python observability package exists.
- Chrome extension observability helper files exist.
- Python can build a sanitized event dictionary.
- JavaScript can build a sanitized event object.
- Python can generate `trace_id`, `request_id`, `connection_id`, and `runtime_instance_id`.
- JavaScript can generate equivalent IDs.
- Long strings are truncated.
- Deep objects are truncated or summarized.
- Arrays are limited.
- Sensitive fields are redacted.
- Binary-like values are not stored raw.
- Missing optional event fields do not crash.
- Invalid severity does not crash.
- No runtime behavior changes are made.
- No existing business logic files are modified.
- No endpoint is added.
- No event store is added.
- No WebSocket behavior is changed.
- No side panel behavior is changed.
- No browser automation behavior is changed.
- No heavy dependencies are added.

---

## 12. Manual test plan

The coding agent should perform simple manual checks.

### Python manual check

Run a small Python snippet from the repository root or appropriate working directory:

```python
from observability.schema import build_event
from observability.ids import new_trace_id, new_request_id

event = build_event(
    component="python.test",
    event="process.started",
    severity="info",
    trace_id=new_trace_id(),
    request_id=new_request_id(),
    message="Manual observability schema test",
    data={
        "large_text": "x" * 5000,
        "password": "should_not_be_visible",
        "nested": {"a": {"b": {"c": {"d": {"e": "too deep"}}}}},
    },
)

print(event)
```

If imports require the `app-python-zoho` directory to be on `PYTHONPATH`, explain the exact command used.

Expected result:

- Event prints successfully.
- `schema_version` is present.
- `ts` is present.
- `monotonic_ms` is present.
- IDs are present.
- Long string is truncated.
- Password is redacted.
- Deep object is summarized/truncated.
- No exception is raised.

### JavaScript manual check

If the repository has a simple way to run Node-based checks, test the helpers with a small snippet.

If not, explain how they can be tested later from the browser console once loaded.

Expected result:

- Event object is created.
- `schema_version` is present.
- `ts` is present.
- `monotonic_ms` is present.
- IDs are generated.
- Long strings are truncated.
- Sensitive fields are redacted.
- No exception is raised.

---

## 13. Automated test plan

If compatible with the existing project test setup, add tests for:

### Python

```text
tests/observability/test_ids.py
tests/observability/test_schema.py
tests/observability/test_sanitize.py
```

Test cases:

- `new_trace_id()` returns a string beginning with `trace_`.
- `new_request_id()` returns a string beginning with `req_`.
- `build_event()` returns required envelope fields.
- Missing optional fields do not crash.
- Invalid severity is normalized.
- Long strings are truncated.
- Sensitive keys are redacted.
- Deep objects are truncated.
- Arrays are limited.
- Binary values are summarized.

Do not add a new test framework dependency in this slice.

If tests cannot be added cleanly, the completion report must say why.

---

## 14. Out of scope

Do not implement:

- Event writer.
- Event store.
- JSONL persistence.
- In-memory event buffer.
- HTTP ingestion endpoint.
- `GET /api/jobs/{job_id}/timeline`.
- Diagnostics endpoint changes.
- WebSocket instrumentation.
- Conversion instrumentation.
- Runtime queue instrumentation.
- Download tracker instrumentation.
- Selector failure instrumentation.
- Tab lifecycle instrumentation.
- Screenshots.
- DOM snapshots.
- OpenTelemetry.
- Dashboard.
- Metrics.
- Full diagnostic package export.
- `implementation_ledger.md` updates unless a separate slice explicitly requires it.

---

## 15. Rollback notes

This slice should be easy to roll back because it only creates isolated helper files.

Rollback should consist of deleting:

```text
app-python-zoho/observability/
autohom-extension/observability/
```

and any optional tests created for this slice.

Because no runtime files should be modified, rollback should not affect application behavior.

---

## 16. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 01 completion report

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
02_python_event_store.md
```

The agent must stop after this report.

---

## 17. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/01_schema_and_ids.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/final_pre_implementation_review.md

Your task is to create the minimal observability schema, ID helpers, and sanitization helpers for Python and the Chrome extension.

You may create only the files listed in the “Allowed files” section of Slice 01.

Do not modify any forbidden file.

Do not wire these helpers into runtime code yet.

Do not add endpoints.

Do not add event stores.

Do not modify WebSocket behavior.

Do not modify browser automation behavior.

Do not modify side panel behavior.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, global state machines, or heavy dependencies.

Observability must remain isolated and best-effort.

When done, provide the required Slice 01 completion report and stop.
```
