# Slice 03 — Observability Ingestion Endpoint

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: local Python HTTP ingestion endpoint  
Depends on: `docs/observability/implementation_slices/02_python_event_store.md`  
Application behavior changes: **minimal local endpoint addition only**  
Runtime instrumentation: **none in this slice**  
Status: `ready_for_implementation`

---

## 1. Goal

Add a local Python HTTP endpoint that can receive compact observability events and store them in the Python observability event store.

This endpoint is the future bridge between the Chrome extension and Python diagnostics.

The endpoint must be best-effort, local-only, safe, compact, and non-blocking from the perspective of the main automation.

This slice must not instrument the extension, WebSocket flow, conversion flow, runtime queue, download tracker, side panel, or diagnostics timeline yet.

---

## 2. Scope

Implement only the Python receiving endpoint:

```text
POST /api/observability/events
```

The endpoint should accept either:

1. A single event object.
2. A batch object with an `events` array.

The endpoint should sanitize incoming events server-side and store them using the Python event store/writer created in Slice 02.

This slice should not add a query endpoint, timeline endpoint, UI, dashboard, or browser extension event forwarding.

---

## 3. Required documents to read first

Before implementing this slice, read:

- `docs/observability/implementation_slices/00_execution_contract.md`
- `docs/observability/implementation_slices/01_schema_and_ids.md`
- `docs/observability/implementation_slices/02_python_event_store.md`
- `docs/observability/implementation_slices/03_observability_ingestion_endpoint.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `02_python_event_store.md` as the event storage contract.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may modify this file:

```text
app-python-zoho/http_server.py
```

The coding agent may modify these files only if the endpoint needs a small helper or export adjustment:

```text
app-python-zoho/observability/__init__.py
app-python-zoho/observability/event_writer.py
app-python-zoho/observability/event_store.py
app-python-zoho/observability/sanitize.py
```

The coding agent may create this file only if keeping endpoint parsing logic separate is cleaner and does not require broader wiring:

```text
app-python-zoho/observability/ingestion.py
```

The coding agent may add optional tests only if the repository already has a compatible test structure:

```text
tests/observability/test_ingestion_endpoint.py
```

If the repository does not already have a clear test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Conditional allowed file

The coding agent may modify this file only if route registration is not fully contained in `http_server.py`:

```text
app-python-zoho/app.py
```

This is conditional.

Before modifying `app.py`, the agent must verify that the endpoint cannot be registered from `http_server.py` alone.

If `app.py` is modified, the completion report must clearly explain:

- Why it was necessary.
- What exact route registration was added.
- Why no runtime behavior besides adding the endpoint changed.

Do not modify `app.py` for convenience.

---

## 6. Forbidden files

Do not modify these files in this slice:

```text
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

## 7. Required endpoint

Add this local endpoint:

```text
POST /api/observability/events
```

The endpoint should be registered on the existing Python local HTTP server.

The existing server is expected to be local to AutoHom v2. Do not add external hosting, cloud dependencies, or new server processes.

---

## 8. Request shapes

The endpoint must accept both of these shapes.

### 8.1 Single event object

```json
{
  "schema_version": "1.0",
  "ts": "2026-05-10T00:00:00.000Z",
  "severity": "info",
  "component": "extension.runtime",
  "event": "runtime.queue.enqueued",
  "trace_id": "trace_abc",
  "job_id": "job_123",
  "pdf_id": "pdf_123",
  "message": "Conversion queued in extension runtime",
  "data": {
    "queue_length": 1
  }
}
```

### 8.2 Batch object

```json
{
  "events": [
    {
      "schema_version": "1.0",
      "ts": "2026-05-10T00:00:00.000Z",
      "severity": "info",
      "component": "extension.runtime",
      "event": "runtime.queue.enqueued",
      "trace_id": "trace_abc",
      "job_id": "job_123",
      "message": "Conversion queued in extension runtime"
    }
  ]
}
```

The endpoint may also accept this shape if simple:

```json
{
  "event": {
    "schema_version": "1.0",
    "component": "extension.bridge",
    "event": "bridge.command.received"
  }
}
```

But this third shape is optional.

---

## 9. Response shape

Recommended success response:

```json
{
  "ok": true,
  "stored": 3,
  "dropped": 0,
  "rejected": 0,
  "truncated": false
}
```

Recommended partial success response:

```json
{
  "ok": true,
  "stored": 2,
  "dropped": 1,
  "rejected": 0,
  "truncated": true,
  "warnings": [
    "1 event exceeded size limits and was summarized"
  ]
}
```

Recommended invalid request response:

```json
{
  "ok": false,
  "stored": 0,
  "dropped": 0,
  "rejected": 1,
  "error": "Invalid JSON body or unsupported event payload"
}
```

HTTP status recommendations:

- `200` for full success.
- `202` for accepted with partial drops/truncation if useful.
- `400` for invalid JSON or unsupported payload shape.
- `413` for body too large if the existing framework makes this easy.
- `500` should be avoided where possible; return safe errors instead.

Do not leak stack traces in JSON responses.

---

## 10. Required behavior

### 10.1 Best-effort behavior

The endpoint must not affect existing automation behavior.

If storing an event fails, the endpoint should return a safe response and not crash the server.

The endpoint must not raise uncaught exceptions for:

- Invalid JSON.
- Empty body.
- Missing fields.
- Unexpected payload type.
- A single malformed event inside a batch.
- Oversized values.
- Unsupported values such as binary-like content.
- Event store errors.

---

### 10.2 Server-side sanitization

All incoming events must be sanitized server-side.

Use the sanitizer from:

```text
app-python-zoho/observability/sanitize.py
```

The endpoint must not trust extension-side sanitization.

Sanitization must prevent storing:

- Full PDFs.
- Full Excel files.
- Binary blobs.
- Full page HTML.
- Huge request bodies.
- Huge response bodies.
- Access tokens.
- Cookies.
- Authorization headers.
- Passwords.
- API keys.

Sensitive values should be redacted.

Large values should be truncated.

Nested objects should be bounded.

Arrays should be bounded.

Events should include or preserve `truncated: true` when data is truncated, redacted, or summarized.

---

### 10.3 Batch limits

The endpoint should enforce simple batch limits.

Recommended constants:

```python
MAX_INGEST_EVENTS_PER_REQUEST = 100
MAX_INGEST_BODY_BYTES = 512_000
```

Exact values can differ if the agent explains why.

Rules:

- If a batch exceeds the max event count, store only up to the allowed limit or reject the request.
- Prefer storing the allowed subset and returning clear metadata.
- Do not allow unbounded arrays.
- Do not allow a single request to create unbounded memory usage.

---

### 10.4 Payload type handling

The endpoint should accept JSON only.

If the content type is not JSON, the endpoint may still attempt to parse JSON if that matches existing server style, but should fail safely.

Unsupported payload types should produce a `400` response.

---

### 10.5 Event normalization

Incoming events may be incomplete.

The endpoint should tolerate missing fields.

If an event lacks `component`, use:

```text
unknown
```

or:

```text
extension.unknown
```

If an event lacks `event`, use:

```text
unknown.event
```

If an event lacks `severity`, use:

```text
info
```

If an event lacks `schema_version`, use:

```text
1.0
```

If an event lacks `ts`, the server may add one through the event builder or sanitizer path.

Do not reject events solely because optional IDs are missing.

---

### 10.6 Store integration

The endpoint should store incoming events in the default Python observability event store/writer from Slice 02.

Preferred approach:

- Use `emit_event()` or equivalent if implemented.
- If only `append()` is available, sanitize and append safely.
- If the incoming event is already built by the extension, preserve useful fields.
- Do not rebuild in a way that loses extension fields such as `component`, `event`, `trace_id`, `job_id`, `tab_id`, or `download_id`.

The endpoint should return accurate counts:

```text
stored
dropped
rejected
truncated
```

---

## 11. Optional helper: `ingestion.py`

If useful, create:

```text
app-python-zoho/observability/ingestion.py
```

Recommended functions:

```python
extract_events_from_payload(payload) -> tuple[list[dict], list[str]]
ingest_observability_events(payload, writer=None) -> dict
```

This can keep `http_server.py` small.

Requirements:

- Must use Python standard library only.
- Must not import application runtime modules.
- Must not start services.
- Must not write files.
- Must be safe for malformed payloads.

---

## 12. No runtime instrumentation in this slice

This endpoint only receives events when something calls it.

Do not add calls to the event writer from:

- Convert endpoints.
- WebSocket handlers.
- JobStore.
- StateManager.
- Flow orchestrator.
- PDF scanner.
- Extension scripts.
- Side panel.

Those are later slices.

---

## 13. No extension changes in this slice

Do not modify the Chrome extension to send events yet.

The extension event writer and forwarding behavior belongs to:

```text
04_extension_event_writer.md
```

This slice only prepares the Python receiving side.

---

## 14. Security and locality

The endpoint is intended for local development/runtime only.

Do not expose it externally.

Do not add authentication in this slice unless the existing local API already has a standard pattern.

Do not add a new security framework.

Do not store secrets.

Do not store raw headers.

Do not store cookies.

Do not store authorization values.

If the existing local server already uses CORS handling, follow the existing project style.

Do not add broad CORS changes unless necessary for the local Chrome extension to call the endpoint later.

If CORS must be adjusted, keep it local and explain the change in the completion report.

---

## 15. Required acceptance criteria

This slice is complete when:

- `POST /api/observability/events` exists.
- The endpoint accepts a single event object.
- The endpoint accepts a batch object with `events`.
- The endpoint rejects unsupported payload shapes safely.
- The endpoint handles invalid JSON safely.
- The endpoint sanitizes incoming events server-side.
- The endpoint stores accepted events in the Python event store.
- The endpoint returns stored/dropped/rejected counts.
- The endpoint enforces a reasonable batch limit.
- The endpoint does not expose stack traces.
- The endpoint does not require cloud services.
- The endpoint does not add heavy dependencies.
- The endpoint does not modify browser extension files.
- The endpoint does not instrument runtime workflows.
- The endpoint does not modify WebSocket behavior.
- The endpoint does not modify conversion behavior.
- Existing app behavior is preserved.
- Observability failure does not crash the server.

---

## 16. Manual test plan

The coding agent should run the backend and test the endpoint manually.

The exact startup command may depend on the project.

After starting the Python local API, test a single event:

```bash
curl -X POST http://localhost:7790/api/observability/events ^
  -H "Content-Type: application/json" ^
  -d "{"schema_version":"1.0","component":"manual.test","event":"test.single","severity":"info","job_id":"job_manual_1","trace_id":"trace_manual_1","message":"manual single event","data":{"password":"should_not_be_visible","large_text":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}}"
```

For PowerShell, the agent may use:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"schema_version":"1.0","component":"manual.test","event":"test.single","severity":"info","job_id":"job_manual_1","trace_id":"trace_manual_1","message":"manual single event","data":{"password":"should_not_be_visible","large_text":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}}'
```

Expected result:

```json
{
  "ok": true,
  "stored": 1
}
```

Test a batch:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"events":[{"component":"manual.test","event":"test.batch.one","job_id":"job_manual_2"},{"component":"manual.test","event":"test.batch.two","job_id":"job_manual_2"}]}'
```

Expected result:

```json
{
  "ok": true,
  "stored": 2
}
```

Test invalid payload:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"not_events":"invalid"}'
```

Expected result:

- Safe error response.
- No server crash.
- No stack trace.

If curl/PowerShell commands differ because of the local environment, the completion report must include the actual commands used.

---

## 17. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_ingestion_endpoint.py
```

Recommended tests:

- Single event payload returns success.
- Batch payload returns success.
- Empty body returns safe error.
- Invalid JSON returns safe error.
- Unsupported shape returns safe error.
- Batch over limit is handled safely.
- Sensitive fields are redacted before storage.
- Large fields are truncated before storage.
- Store failure returns safe response.
- Endpoint does not raise uncaught exceptions.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 18. Out of scope

Do not implement:

- Extension event forwarding.
- JavaScript event writer changes.
- WebSocket instrumentation.
- Conversion instrumentation.
- Runtime queue instrumentation.
- Download tracker instrumentation.
- Selector failure instrumentation.
- Tab lifecycle instrumentation.
- `GET /api/jobs/{job_id}/timeline`.
- `GET /api/events/recent`.
- Diagnostics endpoint changes.
- Dashboard.
- Metrics.
- OpenTelemetry.
- External log aggregation.
- JSONL persistence as a required behavior.
- Database persistence.
- Screenshots.
- DOM snapshots.
- Full diagnostic package export.
- State machine validation.
- State migration.
- Generic logging across the codebase.

---

## 19. Rollback notes

Rollback should be small.

Revert the endpoint registration and handler changes in:

```text
app-python-zoho/http_server.py
```

If created, delete:

```text
app-python-zoho/observability/ingestion.py
```

If modified only for exports, revert minor changes in:

```text
app-python-zoho/observability/__init__.py
```

If tests were added, delete:

```text
tests/observability/test_ingestion_endpoint.py
```

Because this slice should only add a local endpoint, rollback should not affect existing automation behavior.

---

## 20. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 03 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Tests run

### Tests not run and why

### Manual endpoint checks

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
04_extension_event_writer.md
```

The agent must stop after this report.

---

## 21. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/03_observability_ingestion_endpoint.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/implementation_slices/03_observability_ingestion_endpoint.md
- docs/observability/final_pre_implementation_review.md

Your task is to add only the local Python observability ingestion endpoint:

POST /api/observability/events

You may modify only the files listed in the “Allowed files” section of Slice 03.

You may modify app-python-zoho/app.py only if route registration cannot be done from http_server.py alone, and you must explain why.

Do not modify any forbidden file.

Do not modify browser extension files.

Do not add extension event forwarding yet.

Do not add timeline endpoints.

Do not instrument WebSocket, conversion, runtime queue, download tracker, side panel, JobStore, StateManager, or flow orchestration.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, global state machines, databases, or heavy dependencies.

The endpoint must be local, bounded, sanitized, best-effort, and safe for malformed payloads.

When done, provide the required Slice 03 completion report and stop.
```
