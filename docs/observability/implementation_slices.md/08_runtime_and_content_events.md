# Slice 08 — Runtime Queue and Content Readiness Events

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: Chrome extension runtime/content instrumentation  
Depends on: `docs/observability/implementation_slices/07_websocket_ack_status_events.md`  
Application behavior changes: **observability-only, best-effort**  
Runtime instrumentation: **extension runtime queue and content readiness only**  
Status: `ready_for_implementation`

---

## 1. Goal

Instrument the Chrome extension runtime queue and content-script readiness boundary for the direct PDF-to-Excel conversion path.

This slice should make the next part of the conversion path visible after the extension bridge receives `CONVERT_PDF`:

```text
extension bridge receives command
  -> runtime queue enqueued
  -> runtime queue started
  -> content script readiness checked
  -> content ready succeeded or failed
```

The goal is to answer:

- Did the command reach the extension runtime?
- Was the conversion task enqueued?
- Did the runtime actually start processing the queued task?
- Was the content script available/ready before DOM automation began?
- Did content readiness fail before selectors, upload, conversion, or download tracking?
- Was the same `trace_id`, `request_id`, `job_id`, and `pdf_id` preserved into runtime/content events?

This slice must not instrument selectors, upload actions, conversion button clicks, download tracker, tab lifecycle, screenshots, DOM snapshots, or Python-side state changes.

---

## 2. Scope

Instrument only:

```text
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf/content.js
```

and, only if necessary, narrow context propagation in files that pass the command from the bridge into runtime.

This slice should emit these core events:

```text
runtime.queue.enqueued
runtime.queue.started
content.ready.succeeded
content.ready.failed
```

Optional only if the existing runtime has clear success/failure boundaries:

```text
runtime.queue.completed
runtime.queue.failed
runtime.queue.dropped
```

Do not create a broad runtime state machine.

Do not change how the queue works.

Do not change browser automation timing.

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
- `docs/observability/implementation_slices/07_websocket_ack_status_events.md`
- `docs/observability/implementation_slices/08_runtime_and_content_events.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `07_websocket_ack_status_events.md` for metadata propagation from the bridge into runtime.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may modify these files:

```text
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf/content.js
```

The coding agent may modify these observability helper files only if a tiny compatibility adjustment is required:

```text
autohom-extension/observability/eventWriter.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/ids.js
autohom-extension/observability/sanitize.js
```

The coding agent may add optional tests only if the repository already has a compatible JavaScript test setup:

```text
tests/observability/test_runtime_content_events.js
```

If the repository does not already have a clear JavaScript test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Conditional allowed files

The coding agent may modify these files only if they are the actual current path that passes a `CONVERT_PDF` task into runtime or checks content readiness:

```text
autohom-extension/ilovepdf-background/bridge.js
autohom-extension/ilovepdf-background/router.js
autohom-extension/ilovepdf-background/tabManager.js
```

This is conditional.

Before modifying any conditional file, the agent must verify that:

- The runtime queue enqueue/start point cannot be instrumented from `runtime.js` alone, or
- The content readiness check actually lives outside `content.js`, or
- Trace/request metadata must be passed through that file to reach runtime/content events.

If a conditional file is modified, the completion report must explain:

- Why it was necessary.
- What exact metadata/event was added.
- Why runtime behavior did not change.

Do not modify conditional files for convenience.

---

## 6. Forbidden files

Do not modify Python files in this slice:

```text
app-python-zoho/app.py
app-python-zoho/http_server.py
app-python-zoho/multi_agent_ws_server.py
app-python-zoho/agent_registry.py
app-python-zoho/state_manager.py
app-python-zoho/job_store.py
app-python-zoho/flow_orchestrator.py
app-python-zoho/pdf_scanner.py
app-python-zoho/observability/schema.py
app-python-zoho/observability/event_writer.py
app-python-zoho/observability/event_store.py
app-python-zoho/observability/timeline.py
```

Do not modify these Chrome extension files in this slice:

```text
autohom-extension/background-main.js
autohom-extension/background-zoho.js
autohom-extension/sidepanel.js
autohom-extension/ilovepdf-background/downloadTracker.js
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

## 7. Required event names

Use this small event set:

```text
runtime.queue.enqueued
runtime.queue.started
content.ready.succeeded
content.ready.failed
```

Optional only if the existing code has a clear boundary:

```text
runtime.queue.completed
runtime.queue.failed
runtime.queue.dropped
```

Do not emit these events in this slice:

```text
selector.file_input.failed
selector.convert_button.failed
selector.download_button.failed
download.tracker.started
download.matched
download.completed
download.timeout
tab.close.requested
tab.close.allowed
tab.close.blocked
tab.closed
tab.closed_before_terminal_status
```

Those belong to later slices.

---

## 8. Required IDs and correlation

Events should preserve and include these fields when available:

```text
trace_id
job_id
pdf_id
request_id
reply_to
agent_type
connection_id
runtime_instance_id
tab_id
```

The essential fields for this slice are:

```text
trace_id
job_id
pdf_id
request_id
agent_type
runtime_instance_id
tab_id
```

Rules:

- Preserve `trace_id` received from the bridge/WebSocket path.
- Preserve `request_id` received from the command path.
- Preserve `job_id` and `pdf_id`.
- Generate a `runtime_instance_id` only if none already exists and doing so does not change behavior.
- Include `tab_id` only when the current code already knows it.
- Do not require any of these fields to exist.
- Do not fail runtime execution if metadata is missing.
- Do not mutate the task object in a way that changes business behavior.
- If metadata propagation is risky, emit events with the fields already available and explain the limitation.

---

## 9. Runtime queue events

### 9.1 `runtime.queue.enqueued`

Emit when the conversion task is added to the runtime queue.

Recommended fields:

```json
{
  "component": "extension.runtime",
  "event": "runtime.queue.enqueued",
  "phase": "queued",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "runtime_instance_id": "rt_...",
  "message": "Conversion task enqueued in extension runtime",
  "data": {
    "queue_length": 1
  }
}
```

Do not change queue ordering.

Do not change enqueue conditions.

Do not reject tasks because observability fails.

Do not add large task payloads to the event.

---

### 9.2 `runtime.queue.started`

Emit when the runtime starts processing the queued conversion task.

Recommended fields:

```json
{
  "component": "extension.runtime",
  "event": "runtime.queue.started",
  "phase": "runtime_started",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "runtime_instance_id": "rt_...",
  "tab_id": 123,
  "message": "Extension runtime started processing conversion task"
}
```

This event means the runtime began processing.

It does not prove content readiness.

It does not prove upload.

It does not prove conversion completion.

---

### 9.3 Optional `runtime.queue.completed`

Only emit this if the runtime has a clear existing task completion boundary that does not duplicate final `CONVERSION_STATUS`.

Recommended fields:

```json
{
  "component": "extension.runtime",
  "event": "runtime.queue.completed",
  "phase": "runtime_completed",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "runtime_instance_id": "rt_...",
  "message": "Extension runtime completed queued task"
}
```

Do not add this if completion is ambiguous.

Final conversion success/failure already belongs to the WebSocket final status event from Slice 07.

---

### 9.4 Optional `runtime.queue.failed`

Only emit this if the runtime catches an error while processing the queued task before download tracking/final status.

Recommended fields:

```json
{
  "component": "extension.runtime",
  "event": "runtime.queue.failed",
  "phase": "runtime_failed",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "runtime_instance_id": "rt_...",
  "message": "Extension runtime failed while processing queued task",
  "actual": {
    "error": "compact sanitized error"
  }
}
```

Do not swallow existing errors differently.

Do not change final status behavior.

Do not add broad error handling if it changes behavior.

---

## 10. Content readiness events

### 10.1 Definition of content readiness

Content readiness means the runtime has enough confidence that the iLovePDF content script is present and able to receive or perform the next automation step.

This may be implemented today as:

- a ping message,
- a readiness response,
- a content script injected event,
- a tab/message check,
- a function in `content.js`,
- a function in `tabManager.js`,
- or a pre-existing runtime check.

Do not invent a new readiness protocol in this slice unless the current code already has a safe pattern.

Prefer instrumenting the existing readiness check.

---

### 10.2 `content.ready.succeeded`

Emit when the existing content readiness check succeeds.

Recommended fields:

```json
{
  "component": "extension.content",
  "event": "content.ready.succeeded",
  "phase": "content_ready",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "runtime_instance_id": "rt_...",
  "tab_id": 123,
  "message": "iLovePDF content script is ready"
}
```

Do not include DOM HTML.

Do not include page content.

Do not include screenshots.

Do not include full tab data.

---

### 10.3 `content.ready.failed`

Emit when the existing content readiness check fails.

Recommended fields:

```json
{
  "component": "extension.content",
  "event": "content.ready.failed",
  "phase": "content_ready",
  "severity": "warning",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "runtime_instance_id": "rt_...",
  "tab_id": 123,
  "message": "iLovePDF content script was not ready",
  "expected": {
    "content_script_ready": true
  },
  "actual": {
    "content_script_ready": false,
    "reason": "compact sanitized reason"
  }
}
```

Only emit this when the existing logic detects readiness failure.

Do not change retry behavior.

Do not change timeout behavior.

Do not reload tabs.

Do not inject scripts differently.

Do not close tabs.

---

## 11. Event writer usage

Use the extension event writer from Slice 04:

```javascript
globalThis.AutoHomObservabilityEventWriter.emit(...)
```

or the equivalent API actually implemented.

Requirements:

- Event emission must be best-effort.
- Event writer failures must not block the runtime.
- Missing event writer must not crash runtime.
- Do not add noisy `console.log` calls.
- Do not print full event payloads by default.
- Do not send events to external services.

Recommended local helper pattern:

```javascript
async function emitRuntimeEvent(payload) {
  try {
    if (globalThis.AutoHomObservabilityEventWriter?.emit) {
      await globalThis.AutoHomObservabilityEventWriter.emit(payload);
    }
  } catch (_) {
    // Observability must never break automation.
  }
}
```

The exact implementation can differ.

---

## 12. Metadata propagation

If runtime receives a task object from the bridge, preserve observability metadata from that task.

Recommended metadata object shape if a helper is needed:

```javascript
const observability = {
  trace_id: task.trace_id,
  job_id: task.job_id,
  pdf_id: task.pdf_id,
  request_id: task.request_id,
  agent_type: task.agent_type,
  runtime_instance_id: task.runtime_instance_id,
};
```

Do not require this exact structure.

Do not rename existing task fields.

Do not remove existing fields.

Do not modify task semantics.

If metadata is missing from incoming command, do not fail.

---

## 13. Data safety

Events must not include:

- Full PDF contents.
- Full Excel contents.
- Binary blobs.
- Full request bodies.
- Full response bodies.
- Full WebSocket payloads.
- Full task objects.
- Full page HTML.
- DOM snapshots.
- Screenshots.
- Cookies.
- Authorization headers.
- Access tokens.
- Refresh tokens.
- Passwords.
- Huge stack traces.

Allowed compact metadata:

- `trace_id`
- `job_id`
- `pdf_id`
- `request_id`
- `agent_type`
- `runtime_instance_id`
- `tab_id`
- queue length
- compact readiness status
- compact sanitized error reason

---

## 14. No behavior changes

This slice must not change:

- Queue ordering.
- Queue concurrency.
- Queue retry behavior.
- Runtime timeouts.
- Content readiness timeout.
- Tab creation.
- Tab reuse.
- Tab close behavior.
- Script injection behavior.
- Message routing behavior.
- Selector behavior.
- Upload behavior.
- Download behavior.
- Final status behavior.
- State persistence.
- UI behavior.

The automation should work exactly as before, with additional best-effort events only.

---

## 15. No selector/download/tab instrumentation

Do not instrument:

```text
pdfUploader.js
conversionAutomator.js
downloadTracker.js
tabManager.js
```

except for conditional content readiness context in `tabManager.js` if the readiness check actually lives there.

Do not add:

```text
selector.file_input.failed
selector.convert_button.failed
selector.download_button.failed
download.tracker.started
download.matched
download.completed
download.timeout
tab.close.requested
tab.close.allowed
tab.close.blocked
tab.closed
tab.closed_before_terminal_status
```

Those belong to later slices.

---

## 16. Timeline expectation

After this slice, a direct conversion timeline may look like:

```json
{
  "timeline": [
    {
      "component": "python.http",
      "event": "conversion.requested",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "extension.bridge",
      "event": "bridge.command.received",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "extension.runtime",
      "event": "runtime.queue.enqueued",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "extension.runtime",
      "event": "runtime.queue.started",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "extension.content",
      "event": "content.ready.succeeded",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    }
  ]
}
```

A content readiness failure may show:

```json
{
  "component": "extension.content",
  "event": "content.ready.failed",
  "phase": "content_ready",
  "job_id": "job_123",
  "trace_id": "trace_abc"
}
```

This is enough to tell whether the failure happened before DOM selectors and download tracking.

---

## 17. Required acceptance criteria

This slice is complete when:

- Runtime emits `runtime.queue.enqueued` when a conversion task enters the runtime queue.
- Runtime emits `runtime.queue.started` when processing begins.
- Content readiness emits `content.ready.succeeded` when the existing readiness check succeeds.
- Content readiness emits `content.ready.failed` when the existing readiness check fails.
- Events include `trace_id`, `job_id`, `pdf_id`, and `request_id` when available.
- Events include `runtime_instance_id` when available or safely generated.
- Events include `tab_id` when available.
- Event writer failures do not break runtime.
- Missing observability metadata does not break runtime.
- Missing event writer does not break runtime.
- Queue behavior is unchanged.
- Content readiness behavior is unchanged.
- No selector instrumentation is added.
- No download tracker instrumentation is added.
- No tab lifecycle instrumentation is added.
- No Python files are modified.
- No side panel UI is modified.
- No manifest changes are made.
- No screenshots, DOM snapshots, OpenTelemetry, dashboards, or external logging are added.
- No heavy dependencies are added.

---

## 18. Manual test plan

The coding agent should manually test through the existing direct conversion flow where possible.

### 18.1 Normal runtime/content path

1. Start the Python backend.
2. Load the Chrome extension.
3. Ensure the extension event writer can reach the Python ingestion endpoint.
4. Trigger a direct PDF-to-Excel conversion.
5. Query timeline:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/<JOB_ID>/timeline"
```

Expected result:

- Timeline includes `runtime.queue.enqueued`.
- Timeline includes `runtime.queue.started`.
- Timeline includes `content.ready.succeeded` if content readiness succeeded.
- Events preserve `trace_id` where available.
- Existing conversion behavior remains unchanged.

### 18.2 Content readiness failure path

If safe, simulate a content readiness failure using an existing failure condition, such as a missing/unready tab or incorrect page state.

Expected result:

- Existing behavior remains unchanged.
- Timeline includes `content.ready.failed` if current code detects readiness failure.
- No uncaught exception.
- No tab reload/close behavior is changed.

If this cannot be safely simulated, the completion report must say why.

### 18.3 Event writer failure safety

If practical, configure the event writer to a bad endpoint or stop the Python backend.

Expected result:

- Runtime still attempts to process the task according to existing behavior.
- Event writer buffers/drops safely.
- No uncaught exception from observability.

---

## 19. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_runtime_content_events.js
```

Recommended tests:

- `runtime.queue.enqueued` event is emitted at enqueue boundary.
- `runtime.queue.started` event is emitted at start boundary.
- `content.ready.succeeded` event is emitted for ready content.
- `content.ready.failed` event is emitted for readiness failure.
- Missing event writer does not throw.
- Event writer failure does not interrupt runtime.
- Missing observability metadata does not throw.
- Metadata is preserved when present.
- No full task object is sent in event data.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 20. Out of scope

Do not implement:

- Selector failure events.
- `selector.file_input.failed`.
- `selector.convert_button.failed`.
- `selector.download_button.failed`.
- Download tracker events.
- `download.tracker.started`.
- `download.matched`.
- `download.completed`.
- `download.timeout`.
- Tab lifecycle events.
- Screenshots.
- DOM snapshots.
- DOM summaries.
- Upload instrumentation.
- Conversion button instrumentation.
- Python event changes.
- State persistence events.
- Trace summary inference.
- Side panel timeline UI.
- Diagnostics ZIP export.
- OpenTelemetry.
- Dashboard.
- Metrics.
- Generic logging across the codebase.
- New queue mechanism.
- New content readiness protocol.
- Timeout changes.
- Retry behavior changes.

---

## 21. Rollback notes

Rollback should be limited to extension runtime/content event additions.

Revert observability changes in:

```text
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf/content.js
```

If conditionally modified, revert narrow propagation changes in:

```text
autohom-extension/ilovepdf-background/bridge.js
autohom-extension/ilovepdf-background/router.js
autohom-extension/ilovepdf-background/tabManager.js
```

If helper compatibility changes were made, revert them in:

```text
autohom-extension/observability/eventWriter.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/ids.js
autohom-extension/observability/sanitize.js
```

If tests were added, delete:

```text
tests/observability/test_runtime_content_events.js
```

Because this slice should only add best-effort event emission, rollback should restore the exact previous runtime/content behavior.

---

## 22. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 08 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Events added

### IDs propagated

### Runtime behavior preserved

### Content readiness behavior preserved

### Tests run

### Tests not run and why

### Manual runtime/content checks

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
09_download_tracker_and_selector_events.md
```

The agent must stop after this report.

---

## 23. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/08_runtime_and_content_events.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/implementation_slices/03_observability_ingestion_endpoint.md
- docs/observability/implementation_slices/04_extension_event_writer.md
- docs/observability/implementation_slices/05_job_timeline_endpoint.md
- docs/observability/implementation_slices/06_convert_pdf_python_events.md
- docs/observability/implementation_slices/07_websocket_ack_status_events.md
- docs/observability/implementation_slices/08_runtime_and_content_events.md
- docs/observability/final_pre_implementation_review.md

Your task is to instrument only the Chrome extension runtime queue and content readiness boundary.

Add events for:
- runtime.queue.enqueued
- runtime.queue.started
- content.ready.succeeded
- content.ready.failed

Optional only if the current code has clear boundaries:
- runtime.queue.completed
- runtime.queue.failed
- runtime.queue.dropped

Preserve and propagate when available:
- trace_id
- job_id
- pdf_id
- request_id
- agent_type
- runtime_instance_id
- tab_id

You may modify only the files listed in the “Allowed files” section of Slice 08.

You may modify conditional files only if the actual enqueue/start/readiness boundary or metadata propagation lives there, and you must explain why.

Do not modify any forbidden file.

Do not modify Python files.

Do not modify manifest.json.

Do not instrument selector failures, upload actions, conversion button clicks, download tracker, tab lifecycle, side panel UI, JobStore, StateManager, or flow orchestration.

Do not change queue order, queue concurrency, timeout behavior, retry behavior, tab behavior, content readiness behavior, selector behavior, upload behavior, download behavior, final status behavior, or state persistence.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, global state machines, databases, cloud services, or heavy dependencies.

Observability must be best-effort: if event emission fails, the runtime/content flow must continue exactly as before.

When done, provide the required Slice 08 completion report and stop.
```
