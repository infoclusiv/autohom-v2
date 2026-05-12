# Slice 06 — Convert PDF Python Events

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: first narrow workflow instrumentation slice  
Depends on: `docs/observability/implementation_slices/05_job_timeline_endpoint.md`  
Application behavior changes: **observability-only, best-effort**  
Runtime instrumentation: **Python direct `convert-pdf` entry path only**  
Status: `ready_for_implementation`

---

## 1. Goal

Instrument the Python side of the direct PDF-to-Excel conversion request path with compact observability events.

This slice should make a direct `convert-pdf` attempt visible from the moment the Python API receives the request until the point where Python validates the request and hands it off toward the existing WebSocket/agent path.

The goal is to answer early diagnostic questions such as:

- Did the side panel/API request reach Python?
- Which `job_id` and `pdf_id` were involved?
- Was a `trace_id` created for this conversion attempt?
- Was a `request_id` created for the outbound conversion command?
- Did Python reject the request during validation?
- Was the required job/PDF/agent missing?
- Did Python attempt to hand off the command to the existing WebSocket layer?
- Did observability fail without affecting the conversion?

This slice must not instrument extension ACK, final conversion status, runtime queue, content readiness, selector failures, download tracker, or tab lifecycle yet.

Those are later slices.

---

## 2. Scope

Instrument only the Python direct conversion entry path.

The target path is the beginning of:

```text
sidepanel convert click
  -> Python convert endpoint
  -> job validation
  -> optional trace_id/request_id creation
  -> existing WebSocket command handoff
```

This slice should add structured events around Python request receipt, validation, and command handoff.

It must preserve current behavior.

It must not rewrite the conversion flow.

It must not change browser automation behavior.

It must not require the Chrome extension changes from later slices.

---

## 3. Required documents to read first

Before implementing this slice, read:

- `docs/observability/implementation_slices/00_execution_contract.md`
- `docs/observability/implementation_slices/01_schema_and_ids.md`
- `docs/observability/implementation_slices/02_python_event_store.md`
- `docs/observability/implementation_slices/03_observability_ingestion_endpoint.md`
- `docs/observability/implementation_slices/04_extension_event_writer.md`
- `docs/observability/implementation_slices/05_job_timeline_endpoint.md`
- `docs/observability/implementation_slices/06_convert_pdf_python_events.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `05_job_timeline_endpoint.md` to verify events can later be queried by `job_id`.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may modify this file:

```text
app-python-zoho/http_server.py
```

The coding agent may modify these observability files only if a small helper is required:

```text
app-python-zoho/observability/__init__.py
app-python-zoho/observability/event_writer.py
app-python-zoho/observability/ids.py
app-python-zoho/observability/schema.py
```

The coding agent may create this helper file only if it keeps `http_server.py` simpler and does not introduce broader architecture:

```text
app-python-zoho/observability/conversion_context.py
```

The coding agent may add optional tests only if the repository already has a compatible test structure:

```text
tests/observability/test_convert_pdf_python_events.py
```

If the repository does not already have a clear test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Conditional allowed file

The coding agent may modify this file only if the direct convert request currently delegates command construction or command send metadata inside it:

```text
app-python-zoho/multi_agent_ws_server.py
```

This is conditional.

Before modifying `multi_agent_ws_server.py`, the agent must verify that the direct conversion request cannot add optional metadata from `http_server.py` alone.

If `multi_agent_ws_server.py` is modified, the completion report must clearly explain:

- Why it was necessary.
- What exact optional observability metadata was accepted or passed through.
- Why existing WebSocket behavior remains backward compatible.
- Why ACK/final-status handling was not implemented in this slice.

Do not modify `multi_agent_ws_server.py` for broad WebSocket instrumentation. That belongs to Slice 07.

---

## 6. Forbidden files

Do not modify these Python files in this slice:

```text
app-python-zoho/app.py
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

## 7. Required behavior

### 7.1 Find the direct convert endpoint

Identify the existing Python API route used by the side panel or local API to trigger direct PDF-to-Excel conversion.

Likely behavior to look for:

```text
convert-pdf
CONVERT_PDF
pdf_to_excel
conversion request
job action
```

Do not rename the route.

Do not change the route contract.

Do not change the response shape except for optional additive observability fields if safe.

---

### 7.2 Generate or preserve `trace_id`

For each direct conversion attempt:

- If the incoming request already includes a `trace_id`, preserve it.
- If no `trace_id` exists, generate one using the Slice 01 ID helper.
- The `trace_id` should be attached to all events emitted in this Python direct-convert path.
- If safe and backward compatible, include the `trace_id` as optional metadata in the outbound command payload to the existing WebSocket/agent layer.

Do not require old callers to provide `trace_id`.

Do not fail the conversion if `trace_id` generation fails.

If trace generation fails unexpectedly, emit a best-effort event without trace metadata and continue.

---

### 7.3 Generate or preserve `request_id`

For each outbound conversion command attempt:

- If a `request_id` already exists, preserve it.
- If no `request_id` exists, generate one using the Slice 01 ID helper.
- Use `request_id` to identify the Python outbound conversion command.
- If safe and backward compatible, include `request_id` as optional metadata in the outbound command payload.

Do not implement ACK pairing in this slice.

Do not implement `reply_to` handling in this slice.

That belongs to Slice 07.

---

### 7.4 Preserve `job_id` and `pdf_id`

Events must include `job_id` and `pdf_id` when these are available.

If only one is available, include the available value.

Do not fail if an old or unusual request lacks one of these IDs.

Emit a validation failure event if the existing logic rejects the request because required identifiers are missing.

Do not change the existing validation rules.

---

## 8. Required event names

Emit only a small Python-side event set in this slice.

Recommended events:

```text
conversion.requested
conversion.validation.failed
conversion.agent.missing
conversion.command.handoff_requested
conversion.command.handoff_failed
```

Optional, only if the existing code has a clear point where the command is definitely sent:

```text
conversion.command.sent
```

Do not emit ACK/final-status events in this slice:

```text
bridge.command.ack_sent
conversion.status.received
conversion.completed
conversion.failed
conversion.status.send_attempted
conversion.status.send_failed
```

Those belong to Slice 07 and later.

---

## 9. Event details

### 9.1 `conversion.requested`

Emit when the direct conversion request reaches Python.

Recommended fields:

```json
{
  "component": "python.http",
  "event": "conversion.requested",
  "phase": "requested",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "message": "Direct PDF-to-Excel conversion requested",
  "data": {
    "route": "...",
    "source": "http",
    "action": "convert-pdf"
  }
}
```

Do not include raw request bodies.

Do not include full file paths unless already considered safe by existing diagnostics. Prefer filename/stem or IDs.

---

### 9.2 `conversion.validation.failed`

Emit when existing validation rejects the request.

Examples:

- Missing `job_id`.
- Missing `pdf_id`.
- Job not found.
- PDF not found.
- File missing according to existing validation.
- Invalid action.
- Existing precondition failed.

Recommended fields:

```json
{
  "component": "python.http",
  "event": "conversion.validation.failed",
  "phase": "validation",
  "severity": "warning",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "message": "Direct conversion validation failed",
  "expected": {
    "job_exists": true,
    "pdf_available": true
  },
  "actual": {
    "job_exists": false,
    "pdf_available": null
  },
  "data": {
    "reason": "job_not_found"
  }
}
```

Use the actual existing reason when available.

Do not invent validation behavior.

---

### 9.3 `conversion.agent.missing`

Emit when the existing logic detects that no suitable iLovePDF/conversion agent is available.

Recommended fields:

```json
{
  "component": "python.http",
  "event": "conversion.agent.missing",
  "phase": "preflight",
  "severity": "warning",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "message": "No converter agent available for direct conversion",
  "expected": {
    "agent_available": true
  },
  "actual": {
    "agent_available": false
  }
}
```

Only emit this if the current code clearly detects this condition.

Do not add new agent selection logic.

Do not change existing agent availability rules.

---

### 9.4 `conversion.command.handoff_requested`

Emit immediately before Python calls the existing code path that sends or schedules the `CONVERT_PDF` command.

Recommended fields:

```json
{
  "component": "python.http",
  "event": "conversion.command.handoff_requested",
  "phase": "handoff",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "message": "Direct conversion command handoff requested"
}
```

This event means Python is about to hand off the request.

It does not prove the extension received the command.

It does not prove ACK.

It does not prove conversion completion.

---

### 9.5 `conversion.command.handoff_failed`

Emit if the existing handoff/send call raises an error or returns an existing failure response.

Recommended fields:

```json
{
  "component": "python.http",
  "event": "conversion.command.handoff_failed",
  "phase": "handoff",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "message": "Direct conversion command handoff failed",
  "actual": {
    "error": "compact sanitized error"
  }
}
```

Do not expose full stack traces in event data.

Use sanitized compact error information.

Do not swallow existing business errors if the route already returns them. Preserve existing behavior and response semantics.

---

### 9.6 Optional `conversion.command.sent`

Only emit this if there is a clear existing point where Python knows the command was sent to the WebSocket/agent layer.

Do not create misleading `sent` events before the command is actually sent.

If uncertain, use only `conversion.command.handoff_requested` in this slice and leave `conversion.command.sent` for Slice 07.

---

## 10. Optional response metadata

If safe and backward compatible, the direct convert endpoint may include optional observability fields in its response:

```json
{
  "trace_id": "trace_...",
  "request_id": "req_..."
}
```

This is optional.

Do not change success/failure semantics.

Do not break the side panel.

If adding these fields might affect UI assumptions, do not add them.

The timeline endpoint can still be queried by `job_id`.

---

## 11. Optional command metadata

If the existing outbound command is a dictionary/object that tolerates extra fields, add optional metadata:

```json
{
  "trace_id": "trace_...",
  "request_id": "req_..."
}
```

Optional metadata may also include:

```json
{
  "job_id": "job_...",
  "pdf_id": "pdf_..."
}
```

Rules:

- Add only backward-compatible optional fields.
- Do not rename existing fields.
- Do not remove existing fields.
- Do not make the extension require these fields yet.
- Do not change command type names.
- Do not change queue semantics.
- Do not change timeout behavior.
- Do not change tab behavior.

If the payload shape is fragile or exact-match, do not add metadata in this slice. Instead, emit Python-side events only and note this in the completion report.

---

## 12. Best-effort observability rule

All event emission must be best-effort.

If `emit_observability_event()` fails:

- Do not fail the conversion.
- Do not change the HTTP response.
- Do not change existing error behavior.
- Do not raise uncaught exceptions.

Recommended pattern:

```python
try:
    emit_observability_event(...)
except Exception:
    pass
```

or use the safe writer API from Slice 02 if it already catches errors.

Do not add noisy logs for observability failures unless the project already has a controlled debug pattern.

---

## 13. Data safety

Events must not include:

- Full PDF contents.
- Full Excel contents.
- Binary blobs.
- Full request bodies.
- Full response bodies.
- Full file contents.
- Full page HTML.
- Cookies.
- Authorization headers.
- Access tokens.
- Refresh tokens.
- Passwords.
- Unbounded stack traces.

Prefer compact metadata:

- `job_id`
- `pdf_id`
- `trace_id`
- `request_id`
- route name
- action name
- status/reason
- agent type
- sanitized error summary
- filename stem if already safe and useful

---

## 14. No behavior changes

This slice must not change:

- Conversion success/failure semantics.
- Existing HTTP route names.
- Existing request requirements.
- Existing response shape unless optional metadata is clearly safe.
- Existing WebSocket command semantics except optional metadata if safe.
- Existing agent selection rules.
- Existing timeouts.
- Existing queue order.
- Existing tab behavior.
- Existing download matching logic.
- Existing state persistence logic.
- Existing UI behavior.

The conversion flow should work exactly as before, with additional events only.

---

## 15. No extension changes

Do not modify Chrome extension files.

Do not emit extension events in this slice.

Do not add calls to `AutoHomObservabilityEventWriter`.

Extension workflow instrumentation belongs to later slices.

---

## 16. Timeline verification expectation

After this slice, a direct convert request should produce Python-side events queryable through:

```text
GET /api/jobs/{job_id}/timeline
```

The timeline may not yet include extension events.

That is expected.

A successful early timeline might look like:

```json
{
  "timeline": [
    {
      "component": "python.http",
      "event": "conversion.requested",
      "phase": "requested",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "python.http",
      "event": "conversion.command.handoff_requested",
      "phase": "handoff",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    }
  ]
}
```

A validation failure timeline might look like:

```json
{
  "timeline": [
    {
      "component": "python.http",
      "event": "conversion.requested",
      "phase": "requested",
      "job_id": "job_missing",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "python.http",
      "event": "conversion.validation.failed",
      "phase": "validation",
      "job_id": "job_missing",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    }
  ]
}
```

---

## 17. Required acceptance criteria

This slice is complete when:

- Direct `convert-pdf` request path emits `conversion.requested`.
- Validation failures emit `conversion.validation.failed`.
- Missing converter agent/precondition emits a clear event if the existing code detects it.
- Command handoff emits `conversion.command.handoff_requested`.
- Handoff failure emits `conversion.command.handoff_failed` if the existing code exposes such failure.
- A `trace_id` is generated or preserved for new direct conversion attempts.
- A `request_id` is generated or preserved for outbound conversion command attempts.
- Events include `job_id` and `pdf_id` when available.
- Events are queryable by `job_id` through the timeline endpoint from Slice 05.
- Observability failures do not break conversion.
- No Chrome extension files are modified.
- No WebSocket ACK/final-status instrumentation is added.
- No runtime queue instrumentation is added.
- No download tracker instrumentation is added.
- No tab lifecycle instrumentation is added.
- No state migration is introduced.
- No selectors, timeouts, tab behavior, or queue semantics are changed.
- No OpenTelemetry, dashboard, screenshots, DOM snapshots, or external logging services are added.
- No heavy dependencies are added.

---

## 18. Manual test plan

The coding agent should perform manual tests using the existing app flow where possible.

### 18.1 Successful or normal direct convert request

1. Start the Python backend.
2. Ensure the Chrome extension/converter agent is available if required by the current workflow.
3. Trigger a direct PDF-to-Excel conversion from the existing side panel or existing local API.
4. Capture the `job_id` used.
5. Query:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/<JOB_ID>/timeline"
```

Expected result:

- Timeline includes `conversion.requested`.
- Timeline includes `conversion.command.handoff_requested` or `conversion.command.sent` only if accurate.
- Events include `trace_id`.
- Events include `request_id`.
- Existing conversion behavior is unchanged.

### 18.2 Validation failure request

Trigger an existing invalid direct convert request, such as missing/unknown `job_id`, if safe.

Then query the timeline by the relevant `job_id` if available.

Expected result:

- Timeline includes `conversion.requested` if a `job_id` was available.
- Timeline includes `conversion.validation.failed`.
- Existing HTTP error behavior remains unchanged.

If no `job_id` exists for the invalid request, verify through recent events only if such a debug query exists. Do not add a new recent-events endpoint in this slice.

### 18.3 Observability failure safety

If practical, temporarily simulate event writer failure in a controlled way or reason from code.

Expected result:

- Conversion path still returns its normal result.
- Observability failure is contained.
- No uncaught exception is introduced.

The completion report must include the actual test method used.

---

## 19. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_convert_pdf_python_events.py
```

Recommended tests:

- Direct convert handler emits `conversion.requested`.
- Validation failure emits `conversion.validation.failed`.
- Generated `trace_id` is stable across events in one request.
- Generated `request_id` is present before command handoff.
- Event writer failure does not break handler.
- Existing error response remains unchanged.
- Existing success response remains backward compatible.
- Optional metadata is added only if safe.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 20. Out of scope

Do not implement:

- WebSocket ACK instrumentation.
- WebSocket final status instrumentation.
- `conversion.status.received`.
- `conversion.completed`.
- `conversion.failed` based on final status.
- Extension `bridge.command.received`.
- Extension `bridge.command.ack_sent`.
- Runtime queue events.
- Content readiness events.
- Selector failure events.
- Download tracker events.
- Tab lifecycle events.
- Trace summary inference.
- Side panel timeline UI.
- Diagnostics ZIP export.
- Screenshots.
- DOM snapshots.
- OpenTelemetry.
- Dashboard.
- Metrics.
- State machine validation.
- Decision logging framework.
- Site2 observability.
- Generic logging across the codebase.

---

## 21. Rollback notes

Rollback should be small.

Revert observability event emission changes in:

```text
app-python-zoho/http_server.py
```

If conditionally modified, revert optional metadata or narrow helper changes in:

```text
app-python-zoho/multi_agent_ws_server.py
```

If created, delete:

```text
app-python-zoho/observability/conversion_context.py
```

If tests were added, delete:

```text
tests/observability/test_convert_pdf_python_events.py
```

Because this slice should only add best-effort event emission, rollback should restore the exact previous conversion behavior.

---

## 22. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 06 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Events added

### IDs generated or propagated

### Tests run

### Tests not run and why

### Manual convert-pdf checks

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
07_websocket_ack_status_events.md
```

The agent must stop after this report.

---

## 23. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/06_convert_pdf_python_events.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/implementation_slices/03_observability_ingestion_endpoint.md
- docs/observability/implementation_slices/04_extension_event_writer.md
- docs/observability/implementation_slices/05_job_timeline_endpoint.md
- docs/observability/implementation_slices/06_convert_pdf_python_events.md
- docs/observability/final_pre_implementation_review.md

Your task is to instrument only the Python direct convert-pdf request entry path with best-effort observability events.

Add events for:
- conversion.requested
- conversion.validation.failed
- conversion.agent.missing, only if the current code clearly detects this
- conversion.command.handoff_requested
- conversion.command.handoff_failed, only if the existing handoff exposes failure

Generate or preserve:
- trace_id
- request_id

Include job_id and pdf_id when available.

You may modify only the files listed in the “Allowed files” section of Slice 06.

You may modify app-python-zoho/multi_agent_ws_server.py only if optional trace/request metadata cannot be passed from http_server.py alone, and you must explain why.

Do not modify any forbidden file.

Do not modify browser extension files.

Do not instrument ACK handling.

Do not instrument final CONVERSION_STATUS handling.

Do not instrument runtime queue, content readiness, selector failures, download tracker, tab lifecycle, JobStore, StateManager, or side panel UI.

Do not change selectors, timeouts, tab behavior, queue behavior, command semantics, conversion behavior, or response semantics.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, global state machines, databases, cloud services, or heavy dependencies.

Observability must be best-effort: if event emission fails, the conversion flow must continue exactly as before.

When done, provide the required Slice 06 completion report and stop.
```
