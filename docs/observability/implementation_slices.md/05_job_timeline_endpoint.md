# Slice 05 — Job Timeline Endpoint

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: Python read-only diagnostics endpoint  
Depends on: `docs/observability/implementation_slices/04_extension_event_writer.md`  
Application behavior changes: **adds read-only local diagnostics endpoint only**  
Runtime instrumentation: **none in this slice**  
Status: `ready_for_implementation`

---

## 1. Goal

Create a compact read-only timeline endpoint for observability events related to a specific `job_id`.

This slice should expose events already stored in the Python observability event store through a local API endpoint.

The purpose is to make stored observability events useful for AI-assisted debugging without instrumenting conversion, WebSocket, runtime queue, download tracker, or browser automation yet.

This slice must not create new workflow events. It only reads and formats events that already exist in the event store.

---

## 2. Scope

Implement a minimal timeline query layer and local HTTP endpoint:

```text
GET /api/jobs/{job_id}/timeline
```

The endpoint should:

1. Query the Python observability event store by `job_id`.
2. Return a compact chronological timeline.
3. Include metadata indicating whether the response is complete or truncated.
4. Tolerate old jobs or jobs with no observability events.
5. Avoid exposing huge payloads.
6. Avoid stack traces.
7. Avoid changing existing diagnostics behavior unless a small additive field is explicitly safer.

This slice should not add timeline UI in the side panel yet.

This slice should not modify conversion logic, WebSocket logic, JobStore logic, StateManager logic, or Chrome extension files.

---

## 3. Required documents to read first

Before implementing this slice, read:

- `docs/observability/implementation_slices/00_execution_contract.md`
- `docs/observability/implementation_slices/01_schema_and_ids.md`
- `docs/observability/implementation_slices/02_python_event_store.md`
- `docs/observability/implementation_slices/03_observability_ingestion_endpoint.md`
- `docs/observability/implementation_slices/04_extension_event_writer.md`
- `docs/observability/implementation_slices/05_job_timeline_endpoint.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `02_python_event_store.md` as the event query contract.

Use `03_observability_ingestion_endpoint.md` as the way events enter the store.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may create this file:

```text
app-python-zoho/observability/timeline.py
```

The coding agent may modify this file to add the read-only endpoint:

```text
app-python-zoho/http_server.py
```

The coding agent may modify these files only if a small export or query compatibility adjustment is required:

```text
app-python-zoho/observability/__init__.py
app-python-zoho/observability/event_store.py
app-python-zoho/observability/event_writer.py
app-python-zoho/observability/sanitize.py
```

The coding agent may add optional tests only if the repository already has a compatible test structure:

```text
tests/observability/test_timeline.py
tests/observability/test_job_timeline_endpoint.py
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
- Why no runtime behavior besides adding the read-only endpoint changed.

Do not modify `app.py` for convenience.

---

## 6. Forbidden files

Do not modify these Python runtime files in this slice:

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

Add this local read-only endpoint:

```text
GET /api/jobs/{job_id}/timeline
```

The endpoint should be registered on the existing Python local HTTP server.

Do not add a new server process.

Do not add external hosting.

Do not add cloud dependencies.

Do not add authentication or a new security framework unless the existing local API already has a standard pattern that must be followed.

---

## 8. Query parameters

The endpoint should support a small set of optional query parameters.

Recommended parameters:

```text
limit
trace_id
component
severity
event
```

### 8.1 `limit`

Default:

```text
200
```

Maximum:

```text
500
```

If a higher value is provided, clamp it to the maximum.

Invalid limit values should fall back safely to the default.

### 8.2 `trace_id`

If present, filter events by both `job_id` and `trace_id`.

### 8.3 `component`

If present, filter events by component.

### 8.4 `severity`

If present, filter events by severity.

### 8.5 `event`

If present, filter events by event name.

Do not add broad search, regex search, SQL-like query syntax, or arbitrary filters in this slice.

---

## 9. Response shape

Recommended success response:

```json
{
  "ok": true,
  "job_id": "job_123",
  "query": {
    "job_id": "job_123",
    "trace_id": null,
    "component": null,
    "severity": null,
    "event": null,
    "limit": 200
  },
  "event_count": 3,
  "total_matching": 3,
  "truncated": false,
  "dropped_events_total": 0,
  "timeline": [
    {
      "ts": "2026-05-10T00:00:00.000Z",
      "monotonic_ms": 123.45,
      "component": "python.http",
      "event": "conversion.requested",
      "phase": "requested",
      "severity": "info",
      "message": "Conversion requested",
      "trace_id": "trace_abc",
      "job_id": "job_123",
      "pdf_id": "pdf_123",
      "request_id": "req_123",
      "reply_to": null,
      "agent_type": null,
      "connection_id": null,
      "runtime_instance_id": null,
      "tab_id": null,
      "download_id": null,
      "expected": {},
      "actual": {},
      "data": {},
      "duration_ms": null,
      "truncated": false
    }
  ]
}
```

Recommended no-events response:

```json
{
  "ok": true,
  "job_id": "job_123",
  "event_count": 0,
  "total_matching": 0,
  "truncated": false,
  "dropped_events_total": 0,
  "timeline": [],
  "message": "No observability events found for job_id"
}
```

Recommended invalid request response:

```json
{
  "ok": false,
  "job_id": "",
  "error": "job_id is required"
}
```

Do not expose stack traces in responses.

---

## 10. Timeline formatting behavior

Create timeline formatting helper logic in:

```text
app-python-zoho/observability/timeline.py
```

Recommended functions:

```python
build_job_timeline(
    *,
    job_id: str,
    trace_id: str | None = None,
    component: str | None = None,
    severity: str | None = None,
    event: str | None = None,
    limit: int = 200,
    store=None,
) -> dict
```

Optional helpers:

```python
normalize_timeline_event(event: dict) -> dict
sort_timeline_events(events: list[dict]) -> list[dict]
parse_limit(value, default=200, maximum=500) -> int
```

Requirements:

- Query by `job_id`.
- Apply optional filters.
- Return compact event objects.
- Preserve useful event fields.
- Remove or summarize large raw fields.
- Include metadata.
- Tolerate missing fields.
- Tolerate malformed events.
- Never raise uncaught exceptions for malformed events.

---

## 11. Timeline event field allowlist

Timeline output should include only compact, useful fields.

Recommended allowlist:

```text
ts
monotonic_ms
severity
component
event
phase
trace_id
job_id
pdf_id
request_id
reply_to
agent_id
agent_type
connection_id
runtime_instance_id
tab_id
download_id
message
expected
actual
data
duration_ms
truncated
```

Optional internal field if already present and useful:

```text
seq
```

Do not return:

- Full PDFs.
- Full Excel data.
- Binary blobs.
- Full HTML.
- Huge request bodies.
- Huge response bodies.
- Cookies.
- Authorization headers.
- Secrets.
- Access tokens.
- Refresh tokens.
- Raw stack traces unless compact and sanitized.

---

## 12. Ordering behavior

Timeline should be chronological and stable.

Recommended ordering:

1. Sort by `ts` when valid.
2. Use `monotonic_ms` when useful.
3. Use store append sequence as tie-breaker if available.
4. Fall back to store order if timestamps are missing or invalid.

Do not fail the request because of invalid timestamps.

If ordering is approximate, return stable best-effort ordering.

---

## 13. Completeness metadata

The response must make it clear whether results are complete.

Recommended metadata:

```text
event_count
total_matching
truncated
limit
dropped_events_total
store_max_events
```

Optional metadata:

```text
oldest_event_ts
newest_event_ts
filters_applied
```

If the store reports dropped events, include that count.

If `total_matching` is greater than returned count, set:

```json
"truncated": true
```

This helps AI agents know whether evidence is incomplete.

---

## 14. Safe failure behavior

The endpoint must not crash the server for:

- Missing `job_id`.
- Empty `job_id`.
- Unknown `job_id`.
- No events for `job_id`.
- Invalid query parameters.
- Event store unavailable.
- Malformed stored events.
- Timeline formatting errors.

Return a safe JSON response instead.

Avoid HTTP 500 where possible.

If an unexpected error occurs, return:

```json
{
  "ok": false,
  "error": "Failed to build observability timeline"
}
```

Do not expose stack traces.

---

## 15. Relationship with existing diagnostics endpoint

If the project already has:

```text
GET /api/jobs/{job_id}/diagnostics
```

this slice should not rewrite it.

Preferred approach:

- Add the new endpoint `GET /api/jobs/{job_id}/timeline`.
- Do not change existing diagnostics response in this slice.

Optional additive behavior is allowed only if safe:

- Existing diagnostics may include a link or small field pointing to the timeline endpoint.
- Do not change existing diagnostics structure if the side panel depends on it.

If the agent modifies existing diagnostics, it must explain why and verify backward compatibility.

---

## 16. No runtime instrumentation in this slice

Do not add event emission calls to:

```text
app-python-zoho/http_server.py
app-python-zoho/multi_agent_ws_server.py
app-python-zoho/job_store.py
app-python-zoho/state_manager.py
app-python-zoho/flow_orchestrator.py
app-python-zoho/pdf_scanner.py
```

The only allowed `http_server.py` change is adding the read-only timeline endpoint and any required route helper.

This slice reads events only.

It does not create events.

---

## 17. No extension changes in this slice

Do not modify the Chrome extension.

Do not wire the extension event writer into:

```text
bridge.js
runtime.js
downloadTracker.js
sidepanel.js
content.js
background-main.js
background-zoho.js
```

Extension workflow instrumentation belongs to later slices.

---

## 18. Required acceptance criteria

This slice is complete when:

- `app-python-zoho/observability/timeline.py` exists.
- `GET /api/jobs/{job_id}/timeline` exists.
- The endpoint is read-only.
- The endpoint queries the Python observability event store.
- The endpoint returns events filtered by `job_id`.
- The endpoint supports `limit`.
- The endpoint safely clamps invalid or large `limit` values.
- The endpoint optionally supports `trace_id`, `component`, `severity`, and `event` filters.
- Timeline events are compact and sanitized.
- Timeline output includes completeness metadata.
- Empty timelines return `ok: true` and an empty array.
- Missing or invalid `job_id` is handled safely.
- Malformed stored events do not crash the endpoint.
- No runtime workflow instrumentation is added.
- No browser extension files are modified.
- No WebSocket behavior is changed.
- No conversion behavior is changed.
- No JobStore or StateManager behavior is changed.
- No OpenTelemetry, dashboard, screenshots, DOM snapshots, or external logging services are added.
- No heavy dependencies are added.

---

## 19. Manual test plan

The coding agent should test this slice by using the ingestion endpoint from Slice 03 to insert sample events, then query the timeline endpoint.

Start the Python local API.

Insert one event:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"component":"manual.test","event":"manual.timeline.one","severity":"info","job_id":"job_timeline_manual_1","trace_id":"trace_timeline_manual_1","message":"First timeline event","data":{"password":"should_not_be_visible","large_text":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}}'
```

Insert a second event:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"component":"manual.test","event":"manual.timeline.two","severity":"warning","job_id":"job_timeline_manual_1","trace_id":"trace_timeline_manual_1","message":"Second timeline event"}'
```

Query the timeline:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/job_timeline_manual_1/timeline"
```

Expected result:

- `ok` is `true`.
- `event_count` is at least `2`.
- `timeline` contains events for `job_timeline_manual_1`.
- Sensitive data is redacted.
- Large values are truncated.
- No server crash.

Query with filter:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/job_timeline_manual_1/timeline?severity=warning"
```

Expected result:

- Only warning events are returned, if filter is implemented.
- No server crash.

Query unknown job:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/job_unknown/timeline"
```

Expected result:

- `ok` is `true`.
- `timeline` is an empty array.
- No server crash.

If curl is preferred, equivalent curl commands are acceptable.

The completion report must include the actual commands used.

---

## 20. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_timeline.py
tests/observability/test_job_timeline_endpoint.py
```

Recommended `test_timeline.py` cases:

- Build timeline for `job_id`.
- Return empty timeline for unknown `job_id`.
- Filter by `trace_id`.
- Filter by `component`.
- Filter by `severity`.
- Filter by event name.
- Clamp `limit`.
- Include metadata.
- Sort events stably.
- Handle malformed event objects.
- Avoid exposing huge fields.

Recommended endpoint test cases:

- `GET /api/jobs/{job_id}/timeline` returns success.
- Unknown `job_id` returns empty timeline.
- Invalid `limit` falls back safely.
- Large `limit` is clamped.
- Event store errors return safe response.
- Response has no stack trace.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 21. Out of scope

Do not implement:

- Event emission in conversion endpoints.
- Event emission in WebSocket handlers.
- Event emission in JobStore.
- Event emission in StateManager.
- Event emission in FlowOrchestrator.
- Event emission in PDF scanner.
- Extension event forwarding changes.
- JavaScript workflow instrumentation.
- Timeline UI in the side panel.
- Full diagnostics package.
- ZIP export.
- `bug_report.md` generation.
- Trace summary inference.
- State machine validation.
- Decision logging.
- Screenshots.
- DOM snapshots.
- Dashboard.
- Metrics.
- OpenTelemetry.
- External log aggregation.
- Database persistence.
- Generic logging across the codebase.

---

## 22. Rollback notes

Rollback should be small.

Delete:

```text
app-python-zoho/observability/timeline.py
```

Revert endpoint changes in:

```text
app-python-zoho/http_server.py
```

If modified only for exports, revert minor changes in:

```text
app-python-zoho/observability/__init__.py
```

If tests were added, delete:

```text
tests/observability/test_timeline.py
tests/observability/test_job_timeline_endpoint.py
```

If `app-python-zoho/app.py` was conditionally modified, revert that route registration change.

Because this slice should only add a read-only endpoint, rollback should not affect existing automation behavior.

---

## 23. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 05 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Tests run

### Tests not run and why

### Manual timeline endpoint checks

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
06_convert_pdf_python_events.md
```

The agent must stop after this report.

---

## 24. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/05_job_timeline_endpoint.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/implementation_slices/03_observability_ingestion_endpoint.md
- docs/observability/implementation_slices/04_extension_event_writer.md
- docs/observability/implementation_slices/05_job_timeline_endpoint.md
- docs/observability/final_pre_implementation_review.md

Your task is to add only the read-only Python timeline endpoint:

GET /api/jobs/{job_id}/timeline

You may create or modify only the files listed in the “Allowed files” section of Slice 05.

You may modify app-python-zoho/app.py only if route registration cannot be done from http_server.py alone, and you must explain why.

Do not modify any forbidden file.

Do not modify browser extension files.

Do not add event emission to runtime workflows.

Do not instrument WebSocket, conversion, runtime queue, download tracker, side panel, JobStore, StateManager, or flow orchestration.

Do not add trace summary inference yet.

Do not add dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, OpenTelemetry, databases, cloud services, or heavy dependencies.

The endpoint must be local, read-only, bounded, compact, sanitized, and safe for malformed or missing events.

When done, provide the required Slice 05 completion report and stop.
```
