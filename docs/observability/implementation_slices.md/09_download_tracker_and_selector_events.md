# Slice 09 — Download Tracker and Selector Failure Events

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: Chrome extension DOM/download boundary instrumentation  
Depends on: `docs/observability/implementation_slices/08_runtime_and_content_events.md`  
Application behavior changes: **observability-only, best-effort**  
Runtime instrumentation: **selector failure summaries and download tracker events only**  
Status: `ready_for_implementation`

---

## 1. Goal

Instrument the iLovePDF DOM automation and Chrome download tracking boundary with compact observability events.

This slice should make it clear whether a direct PDF-to-Excel conversion reached:

```text
content ready
  -> file input / upload selector
  -> convert button selector
  -> download button selector
  -> download tracker started
  -> download candidate matched
  -> download completed
  -> download timeout
```

The goal is to answer:

- Did the automation fail because an iLovePDF selector was missing?
- Which selector phase failed?
- Was the download tracker started?
- Did Chrome report a matching download?
- Did the download complete?
- Did the tracker timeout?
- Was the same `trace_id`, `request_id`, `job_id`, `pdf_id`, `tab_id`, and `download_id` preserved?
- Did observability collect useful metadata without changing browser automation behavior?

This slice must not implement screenshots, DOM snapshots, full HTML capture, tab lifecycle decisions, state machine validation, or side panel UI.

---

## 2. Scope

Instrument only compact selector failure and download tracker events.

Primary files:

```text
autohom-extension/ilovepdf/pdfUploader.js
autohom-extension/ilovepdf/conversionAutomator.js
autohom-extension/ilovepdf-background/downloadTracker.js
```

Possible conditional files:

```text
autohom-extension/ilovepdf/domHelpers.js
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/tabManager.js
```

This slice should not alter selector definitions, click behavior, upload behavior, download matching rules, timeout values, tab behavior, or final status behavior.

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
- `docs/observability/implementation_slices/09_download_tracker_and_selector_events.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `08_runtime_and_content_events.md` for runtime/content context propagation.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may modify these files:

```text
autohom-extension/ilovepdf/pdfUploader.js
autohom-extension/ilovepdf/conversionAutomator.js
autohom-extension/ilovepdf-background/downloadTracker.js
```

The coding agent may modify these observability helper files only if a tiny compatibility adjustment is required:

```text
autohom-extension/observability/eventWriter.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/sanitize.js
```

The coding agent may add optional tests only if the repository already has a compatible JavaScript test setup:

```text
tests/observability/test_download_tracker_selector_events.js
```

If the repository does not already have a clear JavaScript test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Conditional allowed files

The coding agent may modify these files only if they are the actual current location for selector lookup helpers, download tracker start calls, or metadata propagation:

```text
autohom-extension/ilovepdf/domHelpers.js
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/tabManager.js
autohom-extension/ilovepdf-background/router.js
```

Before modifying any conditional file, the agent must verify that:

- The selector failure point cannot be instrumented in `pdfUploader.js` or `conversionAutomator.js`, or
- The download tracker cannot receive metadata without a narrow pass-through, or
- `tab_id`, `trace_id`, `request_id`, `job_id`, or `pdf_id` would otherwise be unavailable to the event.

If a conditional file is modified, the completion report must explain:

- Why it was necessary.
- What exact metadata/event was added.
- Why behavior did not change.

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
autohom-extension/ilovepdf-background/bridge.js
autohom-extension/ilovepdf/content.js
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

Use this selector failure event set:

```text
selector.file_input.failed
selector.convert_button.failed
selector.download_button.failed
```

Use this download tracker event set:

```text
download.tracker.started
download.matched
download.completed
download.timeout
```

Optional, only if the existing tracker already exposes these clear states:

```text
download.interrupted
download.candidate.rejected
download.tracker.failed
```

Do not add tab lifecycle events in this slice:

```text
tab.close.requested
tab.close.allowed
tab.close.blocked
tab.closed
tab.closed_before_terminal_status
```

Those belong to the later tab lifecycle slice.

---

## 8. Required IDs and correlation

Events should include these fields when available:

```text
trace_id
job_id
pdf_id
request_id
agent_type
runtime_instance_id
tab_id
download_id
```

Rules:

- Preserve `trace_id`, `job_id`, `pdf_id`, and `request_id` from the runtime task context.
- Preserve `tab_id` when the current code knows the tab.
- Include `download_id` when Chrome provides it.
- Do not require these fields to exist.
- Do not fail automation if metadata is missing.
- Do not mutate task objects in ways that change behavior.
- If metadata propagation is risky, emit events with available fields and explain limitations.

---

## 9. Selector failure events

### 9.1 General selector failure rules

Selector failure events must be compact.

Allowed metadata:

```text
selector_name
selector_value
phase
url
match_count, only if cheap and already available
error, compact sanitized message
```

Do not capture:

- Full HTML.
- DOM snapshots.
- Screenshots.
- Element outerHTML.
- Page text.
- Form values.
- Cookies.
- Tokens.
- Full stack traces.

Do not change selectors.

Do not change selector retry behavior.

Do not change timeouts.

Do not change click or upload logic.

---

### 9.2 `selector.file_input.failed`

Emit when the file input selector cannot be found or used during upload.

Recommended fields:

```json
{
  "component": "extension.ilovepdf.uploader",
  "event": "selector.file_input.failed",
  "phase": "upload_selector",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "File input selector failed during PDF upload",
  "expected": {
    "file_input_found": true
  },
  "actual": {
    "file_input_found": false,
    "selector_name": "file_input",
    "selector_value": "compact selector string"
  },
  "data": {
    "url": "https://www.ilovepdf.com/..."
  }
}
```

Only include URL if already available and safe.

Do not include local file contents.

---

### 9.3 `selector.convert_button.failed`

Emit when the convert button selector cannot be found or used.

Recommended fields:

```json
{
  "component": "extension.ilovepdf.automator",
  "event": "selector.convert_button.failed",
  "phase": "convert_selector",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Convert button selector failed",
  "expected": {
    "convert_button_found": true
  },
  "actual": {
    "convert_button_found": false,
    "selector_name": "convert_button",
    "selector_value": "compact selector string"
  }
}
```

Do not change click behavior.

---

### 9.4 `selector.download_button.failed`

Emit when the download button selector cannot be found or used.

Recommended fields:

```json
{
  "component": "extension.ilovepdf.automator",
  "event": "selector.download_button.failed",
  "phase": "download_selector",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Download button selector failed",
  "expected": {
    "download_button_found": true
  },
  "actual": {
    "download_button_found": false,
    "selector_name": "download_button",
    "selector_value": "compact selector string"
  }
}
```

Do not add screenshots or DOM capture.

---

## 10. Download tracker events

### 10.1 General download tracker rules

Download tracker events should report Chrome download lifecycle evidence.

Allowed metadata:

```text
download_id
filename
filename_stem
url, if already available and safe
final_url, if already available and safe
mime
state
interrupt_reason
expected_filename_stem
candidate_filename_stem
matched
match_reason
timeout_ms, existing value only
duration_ms
```

Do not capture:

- File contents.
- Excel contents.
- Full local absolute paths unless the project already treats them as safe.
- Binary data.
- Full download URLs with sensitive tokens.
- Cookies or authorization headers.

Prefer filename/stem over full path.

If only full path is available, sanitize or strip to basename unless existing diagnostics already expose the full path safely.

---

### 10.2 `download.tracker.started`

Emit when the existing download tracker starts watching for the converted Excel file.

Recommended fields:

```json
{
  "component": "extension.downloadTracker",
  "event": "download.tracker.started",
  "phase": "download_wait",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Download tracker started",
  "expected": {
    "download_completed": true
  },
  "data": {
    "expected_filename_stem": "invoice_123",
    "timeout_ms": 120000
  }
}
```

Use existing timeout value only.

Do not change timeout duration.

Do not change matching rules.

---

### 10.3 `download.matched`

Emit when the download tracker identifies a candidate download as matching the expected conversion output.

Recommended fields:

```json
{
  "component": "extension.downloadTracker",
  "event": "download.matched",
  "phase": "download_match",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "download_id": 456,
  "message": "Matching converted download detected",
  "actual": {
    "matched": true,
    "filename": "converted.xlsx",
    "state": "in_progress"
  },
  "data": {
    "match_reason": "existing tracker match rule"
  }
}
```

Do not change match criteria.

Do not mark a download matched unless the existing code already considers it matched.

---

### 10.4 `download.completed`

Emit when the tracked download completes.

Recommended fields:

```json
{
  "component": "extension.downloadTracker",
  "event": "download.completed",
  "phase": "download_completed",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "download_id": 456,
  "message": "Tracked converted download completed",
  "actual": {
    "state": "complete",
    "filename": "converted.xlsx"
  },
  "duration_ms": 43000
}
```

Do not read file contents.

Do not verify Excel contents in this slice.

---

### 10.5 `download.timeout`

Emit when the existing download tracker times out waiting for a matching/completed download.

Recommended fields:

```json
{
  "component": "extension.downloadTracker",
  "event": "download.timeout",
  "phase": "download_wait",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Download tracker timed out waiting for converted file",
  "expected": {
    "download_completed": true
  },
  "actual": {
    "download_completed": false,
    "last_known_state": "none"
  },
  "data": {
    "timeout_ms": 120000
  }
}
```

Use existing timeout values only.

Do not add new timeout behavior.

---

### 10.6 Optional `download.interrupted`

Only emit if the existing tracker receives Chrome interrupt reason/state.

Recommended fields:

```json
{
  "component": "extension.downloadTracker",
  "event": "download.interrupted",
  "phase": "download_interrupted",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "download_id": 456,
  "message": "Tracked converted download was interrupted",
  "actual": {
    "state": "interrupted",
    "interrupt_reason": "NETWORK_FAILED"
  }
}
```

Do not add if state is not available.

---

### 10.7 Optional `download.candidate.rejected`

Only emit if the tracker already evaluates candidates and rejects them.

This can be useful but may become noisy.

If implemented, it must be rate-limited or compact.

Recommended fields:

```json
{
  "component": "extension.downloadTracker",
  "event": "download.candidate.rejected",
  "phase": "download_match",
  "severity": "debug",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "download_id": 456,
  "message": "Download candidate rejected by existing match rule",
  "actual": {
    "matched": false,
    "reason": "filename_mismatch"
  }
}
```

Do not add if it creates too much event noise.

---

## 11. Event writer usage

Use the extension event writer from Slice 04:

```javascript
globalThis.AutoHomObservabilityEventWriter.emit(...)
```

Requirements:

- Event emission must be best-effort.
- Event writer failures must not break upload/conversion/download behavior.
- Missing event writer must not break automation.
- Do not add noisy `console.log`.
- Do not print full payloads.
- Do not send events externally.

Recommended helper pattern:

```javascript
async function emitIlovePdfEvent(payload) {
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

If the uploader, automator, and download tracker receive a task/context object, preserve observability metadata from that object.

Recommended metadata fields:

```javascript
{
  trace_id,
  job_id,
  pdf_id,
  request_id,
  agent_type,
  runtime_instance_id,
  tab_id
}
```

Do not require this exact structure.

Do not rename existing fields.

Do not remove existing fields.

Do not change task semantics.

If metadata cannot reach a given function safely, emit what is available and explain the limitation.

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
- Element `outerHTML`.
- Page text.
- Cookies.
- Authorization headers.
- Access tokens.
- Refresh tokens.
- Passwords.
- Huge stack traces.
- Full absolute local paths unless already treated as safe by the project.

Allowed compact metadata:

- IDs.
- selector name.
- compact selector string.
- phase.
- URL if safe.
- match count if cheap.
- download ID.
- filename or basename.
- Chrome download state.
- interrupt reason.
- timeout duration.
- compact sanitized error reason.

---

## 14. No behavior changes

This slice must not change:

- Selector values.
- Selector lookup strategy.
- Retry counts.
- Timeout values.
- Click behavior.
- Upload behavior.
- Conversion behavior.
- Download matching behavior.
- Download timeout behavior.
- Tab creation.
- Tab reuse.
- Tab close behavior.
- Final status behavior.
- Queue behavior.
- State persistence.
- UI behavior.

The automation should work exactly as before, with additional best-effort events only.

---

## 15. Timeline expectation

After this slice, a direct conversion timeline may include:

```json
{
  "timeline": [
    {
      "component": "extension.runtime",
      "event": "runtime.queue.started",
      "job_id": "job_123",
      "trace_id": "trace_abc"
    },
    {
      "component": "extension.content",
      "event": "content.ready.succeeded",
      "job_id": "job_123",
      "trace_id": "trace_abc"
    },
    {
      "component": "extension.downloadTracker",
      "event": "download.tracker.started",
      "job_id": "job_123",
      "trace_id": "trace_abc"
    },
    {
      "component": "extension.downloadTracker",
      "event": "download.matched",
      "download_id": 456,
      "job_id": "job_123",
      "trace_id": "trace_abc"
    },
    {
      "component": "extension.downloadTracker",
      "event": "download.completed",
      "download_id": 456,
      "job_id": "job_123",
      "trace_id": "trace_abc"
    }
  ]
}
```

A selector failure timeline may show:

```json
{
  "component": "extension.ilovepdf.uploader",
  "event": "selector.file_input.failed",
  "phase": "upload_selector",
  "job_id": "job_123",
  "trace_id": "trace_abc"
}
```

This is enough to tell whether the failure happened at DOM selector level or download tracking level.

---

## 16. Required acceptance criteria

This slice is complete when:

- File input selector failure emits `selector.file_input.failed`.
- Convert button selector failure emits `selector.convert_button.failed`.
- Download button selector failure emits `selector.download_button.failed`.
- Download tracker start emits `download.tracker.started`.
- Matching download emits `download.matched`.
- Completed tracked download emits `download.completed`.
- Existing download timeout emits `download.timeout`.
- Events include `trace_id`, `job_id`, `pdf_id`, and `request_id` when available.
- Events include `tab_id` and `download_id` when available.
- Events contain compact metadata only.
- Event writer failures do not break automation.
- Missing event writer does not break automation.
- Missing observability metadata does not break automation.
- Selector values are not changed.
- Timeout values are not changed.
- Download matching logic is not changed.
- Tab lifecycle behavior is not changed.
- No Python files are modified.
- No side panel UI is modified.
- No screenshots, DOM snapshots, full HTML, OpenTelemetry, dashboards, or external logging are added.
- No heavy dependencies are added.

---

## 17. Manual test plan

The coding agent should manually test through the existing direct conversion flow where possible.

### 17.1 Normal download path

1. Start the Python backend.
2. Load the Chrome extension.
3. Trigger a direct PDF-to-Excel conversion.
4. Query timeline:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/<JOB_ID>/timeline"
```

Expected result:

- Timeline includes `download.tracker.started`.
- Timeline includes `download.matched` if a matching download is detected.
- Timeline includes `download.completed` if the tracked download completes.
- Existing conversion behavior remains unchanged.

### 17.2 Selector failure path

If safe, temporarily test using an existing failure condition or a non-invasive test mode.

Expected result:

- The relevant selector failure event appears.
- No full HTML or screenshot is captured.
- Existing failure behavior remains unchanged.

Do not permanently change selectors to force a failure.

If selector failure cannot be safely simulated, explain in completion report.

### 17.3 Download timeout path

If safe, trigger an existing timeout condition without changing timeout values.

Expected result:

- `download.timeout` appears.
- Existing timeout behavior remains unchanged.

If not practical, explain in completion report.

### 17.4 Event writer failure safety

If practical, configure event writer to a bad endpoint or stop Python backend.

Expected result:

- Automation continues according to existing behavior.
- Event writer buffers/drops safely.
- No uncaught exception from observability.

---

## 18. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_download_tracker_selector_events.js
```

Recommended tests:

- File input selector failure emits event.
- Convert button selector failure emits event.
- Download button selector failure emits event.
- Download tracker start emits event.
- Download match emits event.
- Download completion emits event.
- Download timeout emits event.
- Missing event writer does not throw.
- Event writer failure does not interrupt automation.
- Metadata is preserved when present.
- Full HTML/task objects are not sent.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 19. Out of scope

Do not implement:

- Tab lifecycle events.
- `tab.close.requested`.
- `tab.close.allowed`.
- `tab.close.blocked`.
- `tab.closed`.
- `tab.closed_before_terminal_status`.
- Screenshots.
- DOM snapshots.
- DOM summaries.
- Full HTML capture.
- Excel verification.
- PDF verification.
- Python event changes.
- State persistence events.
- Trace summary inference.
- Side panel timeline UI.
- Diagnostics ZIP export.
- OpenTelemetry.
- Dashboard.
- Metrics.
- Generic logging across the codebase.
- New download matching mechanism.
- New selector strategy.
- Timeout changes.
- Retry behavior changes.

---

## 20. Rollback notes

Rollback should be limited to selector/download tracker event additions.

Revert observability changes in:

```text
autohom-extension/ilovepdf/pdfUploader.js
autohom-extension/ilovepdf/conversionAutomator.js
autohom-extension/ilovepdf-background/downloadTracker.js
```

If conditionally modified, revert narrow propagation changes in:

```text
autohom-extension/ilovepdf/domHelpers.js
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/tabManager.js
autohom-extension/ilovepdf-background/router.js
```

If helper compatibility changes were made, revert them in:

```text
autohom-extension/observability/eventWriter.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/sanitize.js
```

If tests were added, delete:

```text
tests/observability/test_download_tracker_selector_events.js
```

Because this slice should only add best-effort event emission, rollback should restore the exact previous selector/download behavior.

---

## 21. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 09 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Events added

### IDs propagated

### Selector behavior preserved

### Download tracker behavior preserved

### Tests run

### Tests not run and why

### Manual selector/download checks

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
10_trace_summary.md
```

The agent must stop after this report.

---

## 22. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/09_download_tracker_and_selector_events.md

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
- docs/observability/implementation_slices/09_download_tracker_and_selector_events.md
- docs/observability/final_pre_implementation_review.md

Your task is to instrument only selector failure summaries and download tracker lifecycle events.

Add selector events for:
- selector.file_input.failed
- selector.convert_button.failed
- selector.download_button.failed

Add download tracker events for:
- download.tracker.started
- download.matched
- download.completed
- download.timeout

Optional only if current code clearly exposes them:
- download.interrupted
- download.candidate.rejected
- download.tracker.failed

Preserve and propagate when available:
- trace_id
- job_id
- pdf_id
- request_id
- agent_type
- runtime_instance_id
- tab_id
- download_id

You may modify only the files listed in the “Allowed files” section of Slice 09.

You may modify conditional files only if the actual selector/download boundary or metadata propagation lives there, and you must explain why.

Do not modify any forbidden file.

Do not modify Python files.

Do not modify manifest.json.

Do not instrument tab lifecycle, screenshots, DOM snapshots, DOM summaries, side panel UI, JobStore, StateManager, or flow orchestration.

Do not change selectors, selector strategy, upload behavior, click behavior, timeout values, retry behavior, download matching behavior, tab behavior, queue behavior, final status behavior, or state persistence.

Do not capture full HTML, screenshots, PDFs, Excel contents, binary blobs, cookies, tokens, or huge payloads.

Do not add OpenTelemetry, dashboards, diagnostic ZIP exports, global state machines, databases, cloud services, or heavy dependencies.

Observability must be best-effort: if event emission fails, the selector/download flow must continue exactly as before.

When done, provide the required Slice 09 completion report and stop.
```
