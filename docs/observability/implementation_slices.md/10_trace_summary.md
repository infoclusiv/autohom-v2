# Slice 10 — Trace Summary

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: read-only diagnostic interpretation layer  
Depends on: `docs/observability/implementation_slices/09_download_tracker_and_selector_events.md`  
Application behavior changes: **adds read-only timeline summary only**  
Runtime instrumentation: **none in this slice**  
Status: `ready_for_implementation`

---

## 1. Goal

Add a compact `trace_summary` to the job timeline response.

This slice should help an AI coding agent quickly understand the likely state of a direct PDF-to-Excel conversion attempt by summarizing the timeline events that already exist.

The goal is to answer:

- What was the last successful phase?
- What was expected next?
- What actually happened?
- Did the conversion reach final status?
- Did the download complete?
- Did the runtime/content/selector/download boundary fail?
- Which component is the best current suspect?
- Which important events appear to be missing?
- Is the trace complete enough to diagnose, or is evidence missing/truncated?

This slice must not add new event emitters.

This slice must not change conversion, WebSocket, extension runtime, download tracker, tab behavior, state persistence, or side panel behavior.

It only reads existing timeline events and computes a compact summary.

---

## 2. Scope

Implement a read-only trace summary builder and include it in the timeline endpoint response.

Primary target:

```text
GET /api/jobs/{job_id}/timeline
```

The response should include a new field:

```json
{
  "trace_summary": {}
}
```

The summary should be computed from events already stored in the Python observability event store.

This slice should not modify how events are emitted.

This slice should not create a global state machine.

This slice should not enforce valid or invalid transitions.

This slice should not migrate any persisted state.

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
- `docs/observability/implementation_slices/10_trace_summary.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `05_job_timeline_endpoint.md` as the timeline response contract.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may modify this file:

```text
app-python-zoho/observability/timeline.py
```

The coding agent may modify this file only if needed to include `trace_summary` in the endpoint response:

```text
app-python-zoho/http_server.py
```

The coding agent may modify these observability files only if a small export/helper adjustment is required:

```text
app-python-zoho/observability/__init__.py
app-python-zoho/observability/sanitize.py
```

The coding agent may create this helper file only if keeping the summary logic separate is cleaner:

```text
app-python-zoho/observability/trace_summary.py
```

The coding agent may add optional tests only if the repository already has a compatible test structure:

```text
tests/observability/test_trace_summary.py
```

If the repository does not already have a clear test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Forbidden files

Do not modify these Python runtime files in this slice:

```text
app-python-zoho/app.py
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

### 6.1 Add trace summary to timeline response

The timeline response should include:

```json
{
  "trace_summary": {
    "status": "incomplete",
    "last_successful_phase": "runtime_started",
    "expected_next_phase": "content_ready",
    "actual_terminal_event": null,
    "suspected_component": "extension.content",
    "missing_events": ["content.ready.succeeded", "content.ready.failed"],
    "has_final_status": false,
    "has_conversion_completed": false,
    "has_conversion_failed": false,
    "has_download_completed": false,
    "has_download_timeout": false,
    "has_selector_failure": false,
    "evidence_is_truncated": false,
    "confidence": "medium",
    "notes": []
  }
}
```

Exact field names may differ slightly if the agent has a good reason, but the response must stay compact, predictable, and useful to AI debugging.

---

### 6.2 Summary must be heuristic

This summary is not a strict state machine.

It must not enforce workflow transitions.

It must not mark jobs as failed in application state.

It must not change persisted job statuses.

It must not block conversion.

It must not drive runtime behavior.

The summary is a read-only interpretation of timeline evidence.

Use cautious language in fields such as:

```text
suspected_component
confidence
notes
```

Avoid pretending certainty when evidence is missing.

---

## 7. Recommended summary fields

Recommended `trace_summary` fields:

```text
status
last_successful_phase
expected_next_phase
actual_terminal_event
suspected_component
missing_events
has_final_status
has_conversion_completed
has_conversion_failed
has_download_completed
has_download_timeout
has_selector_failure
has_runtime_started
has_content_ready
has_command_sent
has_bridge_received
has_ack
has_state_save_success
evidence_is_truncated
confidence
notes
```

Optional fields:

```text
trace_id
job_id
pdf_id
request_id
first_event
last_event
event_count
terminal_event_count
failure_event_count
warning_event_count
```

Keep the summary compact.

Do not duplicate the full timeline inside the summary.

---

## 8. Status values

Recommended `status` values:

```text
completed
failed
timeout
blocked
in_progress
incomplete
unknown
```

Suggested interpretation:

- `completed`: timeline includes `conversion.completed` or an equivalent successful final status.
- `failed`: timeline includes `conversion.failed` or a clear terminal failure event.
- `timeout`: timeline includes `download.timeout` or `conversion.command.timeout`.
- `blocked`: timeline includes a selector/content/agent validation failure that blocks progress.
- `in_progress`: timeline has recent progress but no terminal event.
- `incomplete`: timeline is missing expected next events after a known phase.
- `unknown`: not enough events to infer anything useful.

Do not write these statuses to `JobStore` or `StateManager`.

These are diagnostic summary statuses only.

---

## 9. Phase model

Use a small phase progression model only for summarization.

Recommended phase order:

```text
requested
validation
handoff
command_sent
bridge_received
ack
runtime_queued
runtime_started
content_ready
upload_selector
convert_selector
download_selector
download_wait
download_match
download_completed
final_status
completed
failed
```

Map known event names to phases.

Example mapping:

```text
conversion.requested -> requested
conversion.validation.failed -> validation
conversion.command.handoff_requested -> handoff
conversion.command.sent -> command_sent
bridge.command.received -> bridge_received
bridge.command.ack_sent -> ack
runtime.queue.enqueued -> runtime_queued
runtime.queue.started -> runtime_started
content.ready.succeeded -> content_ready
content.ready.failed -> content_ready
selector.file_input.failed -> upload_selector
selector.convert_button.failed -> convert_selector
selector.download_button.failed -> download_selector
download.tracker.started -> download_wait
download.matched -> download_match
download.completed -> download_completed
download.timeout -> download_wait
conversion.status.received -> final_status
conversion.completed -> completed
conversion.failed -> failed
```

This mapping is only for diagnostic summary.

Do not use it to control workflow behavior.

---

## 10. Last successful phase

The summary should compute `last_successful_phase` from positive/progress events.

Examples of positive/progress events:

```text
conversion.requested
conversion.command.handoff_requested
conversion.command.sent
bridge.command.received
bridge.command.ack_sent
runtime.queue.enqueued
runtime.queue.started
content.ready.succeeded
download.tracker.started
download.matched
download.completed
conversion.status.received
conversion.completed
```

Failure events should generally not become `last_successful_phase`, but they may influence `actual_terminal_event`.

Example:

If timeline contains:

```text
runtime.queue.started
content.ready.failed
```

then:

```json
{
  "last_successful_phase": "runtime_started",
  "actual_terminal_event": "content.ready.failed",
  "suspected_component": "extension.content"
}
```

---

## 11. Expected next phase

The summary should compute `expected_next_phase` based on the last successful phase and missing/failure events.

Examples:

If last successful phase is:

```text
requested
```

then expected next phase may be:

```text
handoff
```

If last successful phase is:

```text
command_sent
```

then expected next phase may be:

```text
bridge_received
```

If last successful phase is:

```text
runtime_started
```

then expected next phase may be:

```text
content_ready
```

If last successful phase is:

```text
content_ready
```

then expected next phase may be:

```text
upload_or_selector
```

If last successful phase is:

```text
download_wait
```

then expected next phase may be:

```text
download_match_or_timeout
```

If last successful phase is:

```text
download_completed
```

then expected next phase may be:

```text
final_status
```

If conversion is completed or failed, `expected_next_phase` may be `null`.

---

## 12. Missing events

The summary should list important missing events based on what has already happened.

Example:

If timeline has `conversion.command.sent` but not `bridge.command.received`:

```json
"missing_events": ["bridge.command.received"]
```

If timeline has `bridge.command.received` but no ACK event and ACK is expected/supported:

```json
"missing_events": ["bridge.command.ack_sent"]
```

If timeline has `runtime.queue.started` but no content readiness result:

```json
"missing_events": [
  "content.ready.succeeded",
  "content.ready.failed"
]
```

If timeline has `download.tracker.started` but no download outcome:

```json
"missing_events": [
  "download.matched",
  "download.completed",
  "download.timeout"
]
```

If timeline has `download.completed` but no final status:

```json
"missing_events": [
  "conversion.status.received",
  "conversion.completed"
]
```

Do not generate huge missing-event lists.

Keep the list focused on the next few most important events.

Recommended maximum:

```text
10
```

---

## 13. Suspected component

The summary should infer a cautious `suspected_component`.

Examples:

```text
python.http
python.websocket
extension.bridge
extension.runtime
extension.content
extension.ilovepdf.uploader
extension.ilovepdf.automator
extension.downloadTracker
unknown
```

Suggested rules:

- `conversion.validation.failed` -> `python.http`
- `conversion.agent.missing` -> `python.http` or `python.websocket`
- `conversion.command.timeout` -> `python.websocket` or `extension.bridge`
- `bridge.command.received` missing after command sent -> `extension.bridge`
- `runtime.queue.started` missing after bridge received -> `extension.runtime`
- `content.ready.failed` -> `extension.content`
- `selector.file_input.failed` -> `extension.ilovepdf.uploader`
- `selector.convert_button.failed` -> `extension.ilovepdf.automator`
- `selector.download_button.failed` -> `extension.ilovepdf.automator`
- `download.timeout` -> `extension.downloadTracker`
- `conversion.status.send_failed` -> `extension.bridge`
- `download.completed` exists but no final status -> `extension.bridge` or `python.websocket`
- evidence missing/truncated -> `unknown`

This is a diagnostic hint, not a final conclusion.

---

## 14. Terminal events

The summary should identify an `actual_terminal_event` when one exists.

Examples:

```text
conversion.completed
conversion.failed
download.timeout
conversion.command.timeout
content.ready.failed
selector.file_input.failed
selector.convert_button.failed
selector.download_button.failed
conversion.status.send_failed
```

If no terminal/failure event exists, use:

```json
"actual_terminal_event": null
```

Do not infer failure solely from absence unless evidence strongly suggests incompleteness.

Absence should usually produce:

```text
status: incomplete
```

or:

```text
status: in_progress
```

---

## 15. Boolean flags

The summary should expose a few direct boolean flags.

Recommended flags:

```text
has_final_status
has_conversion_completed
has_conversion_failed
has_download_completed
has_download_timeout
has_selector_failure
has_runtime_started
has_content_ready
has_command_sent
has_bridge_received
has_ack
has_state_save_success
```

Rules:

- `has_final_status` is true if `conversion.status.received` exists.
- `has_conversion_completed` is true if `conversion.completed` exists.
- `has_conversion_failed` is true if `conversion.failed` exists.
- `has_download_completed` is true if `download.completed` exists.
- `has_download_timeout` is true if `download.timeout` exists.
- `has_selector_failure` is true if any `selector.*.failed` event exists.
- `has_runtime_started` is true if `runtime.queue.started` exists.
- `has_content_ready` is true if `content.ready.succeeded` exists.
- `has_command_sent` is true if `conversion.command.sent` exists.
- `has_bridge_received` is true if `bridge.command.received` exists.
- `has_ack` is true if `bridge.command.ack_sent` or `conversion.command.ack_received` exists.
- `has_state_save_success` may be false or null until state save events exist.

If a flag is not yet knowable because the event vocabulary has not been implemented, prefer `false` or `null` consistently.

---

## 16. Confidence

Recommended `confidence` values:

```text
high
medium
low
unknown
```

Suggested interpretation:

- `high`: clear terminal event exists.
- `medium`: strong progress and a clear missing/failure boundary exists.
- `low`: few events or evidence may be truncated.
- `unknown`: no useful events.

If `truncated` or dropped-event metadata is present, reduce confidence.

---

## 17. Evidence truncation

If timeline metadata indicates truncation or dropped events, set:

```json
"evidence_is_truncated": true
```

Also add a note:

```text
Timeline evidence may be incomplete because events were truncated or dropped.
```

This is important because AI agents should not over-trust incomplete evidence.

---

## 18. No new event emission

This slice must not emit new events.

Do not add calls to:

```text
emit_observability_event(...)
AutoHomObservabilityEventWriter.emit(...)
```

from runtime workflow files.

This slice only reads, normalizes, and summarizes existing events.

---

## 19. No workflow behavior changes

This slice must not change:

- Conversion behavior.
- WebSocket behavior.
- Extension bridge behavior.
- Runtime queue behavior.
- Content readiness behavior.
- Selector behavior.
- Upload behavior.
- Download matching behavior.
- Download timeout behavior.
- Tab behavior.
- State persistence behavior.
- Side panel UI behavior.

---

## 20. Response compatibility

Adding `trace_summary` to `GET /api/jobs/{job_id}/timeline` should be backward compatible because it is an additive field.

Do not remove existing timeline fields.

Do not rename existing timeline fields.

Do not change existing event shapes.

Do not add this field to other endpoints unless explicitly necessary.

If the existing timeline endpoint response is consumed by UI or tests, verify that adding an extra field does not break them.

---

## 21. Required acceptance criteria

This slice is complete when:

- Timeline response includes `trace_summary`.
- Summary is computed from existing timeline events only.
- Summary includes `status`.
- Summary includes `last_successful_phase`.
- Summary includes `expected_next_phase`.
- Summary includes `actual_terminal_event`.
- Summary includes `suspected_component`.
- Summary includes `missing_events`.
- Summary includes useful boolean flags.
- Summary includes confidence or equivalent uncertainty signal.
- Summary accounts for truncated/dropped evidence.
- Empty timelines return a safe summary with `status: unknown`.
- Malformed events do not crash summary generation.
- Missing event fields do not crash summary generation.
- Summary generation does not emit new events.
- No runtime workflow files are modified.
- No Chrome extension files are modified.
- No JobStore or StateManager files are modified.
- No state migration is introduced.
- No OpenTelemetry, dashboard, screenshots, DOM snapshots, or external logging services are added.
- No heavy dependencies are added.

---

## 22. Manual test plan

The coding agent should use the ingestion endpoint from Slice 03 to insert sample events, then query the timeline endpoint.

### 22.1 Completed conversion sample

Insert sample events:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"events":[{"component":"python.http","event":"conversion.requested","phase":"requested","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"},{"component":"python.websocket","event":"conversion.command.sent","phase":"command_sent","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"},{"component":"extension.bridge","event":"bridge.command.received","phase":"command_received","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"},{"component":"extension.runtime","event":"runtime.queue.started","phase":"runtime_started","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"},{"component":"extension.content","event":"content.ready.succeeded","phase":"content_ready","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"},{"component":"extension.downloadTracker","event":"download.completed","phase":"download_completed","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"},{"component":"python.websocket","event":"conversion.status.received","phase":"final_status","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"},{"component":"python.websocket","event":"conversion.completed","phase":"completed","job_id":"job_summary_complete","trace_id":"trace_summary_complete","request_id":"req_summary_complete"}]}'
```

Query:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/job_summary_complete/timeline"
```

Expected result:

- `trace_summary.status` is `completed`.
- `has_conversion_completed` is true.
- `has_final_status` is true.
- `has_download_completed` is true.
- `expected_next_phase` is null or equivalent.

---

### 22.2 Download timeout sample

Insert sample events:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"events":[{"component":"python.http","event":"conversion.requested","job_id":"job_summary_timeout","trace_id":"trace_summary_timeout"},{"component":"python.websocket","event":"conversion.command.sent","job_id":"job_summary_timeout","trace_id":"trace_summary_timeout"},{"component":"extension.runtime","event":"runtime.queue.started","job_id":"job_summary_timeout","trace_id":"trace_summary_timeout"},{"component":"extension.content","event":"content.ready.succeeded","job_id":"job_summary_timeout","trace_id":"trace_summary_timeout"},{"component":"extension.downloadTracker","event":"download.tracker.started","job_id":"job_summary_timeout","trace_id":"trace_summary_timeout"},{"component":"extension.downloadTracker","event":"download.timeout","job_id":"job_summary_timeout","trace_id":"trace_summary_timeout"}]}'
```

Query:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/job_summary_timeout/timeline"
```

Expected result:

- `trace_summary.status` is `timeout`.
- `actual_terminal_event` is `download.timeout`.
- `suspected_component` is `extension.downloadTracker`.
- `has_download_timeout` is true.
- `has_conversion_completed` is false.

---

### 22.3 Missing bridge receive sample

Insert sample events:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:7790/api/observability/events" `
  -ContentType "application/json" `
  -Body '{"events":[{"component":"python.http","event":"conversion.requested","job_id":"job_summary_missing_bridge","trace_id":"trace_summary_missing_bridge"},{"component":"python.websocket","event":"conversion.command.sent","job_id":"job_summary_missing_bridge","trace_id":"trace_summary_missing_bridge"}]}'
```

Query:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/job_summary_missing_bridge/timeline"
```

Expected result:

- `trace_summary.status` is `incomplete` or `in_progress`.
- `last_successful_phase` is `command_sent`.
- `expected_next_phase` is `bridge_received`.
- `missing_events` includes `bridge.command.received`.
- `suspected_component` is `extension.bridge` or `unknown`.

---

### 22.4 Empty timeline sample

Query:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/job_summary_empty/timeline"
```

Expected result:

- `ok` is true.
- `timeline` is empty.
- `trace_summary.status` is `unknown`.
- No server crash.

The completion report must include the actual commands used or explain equivalent checks.

---

## 23. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_trace_summary.py
```

Recommended tests:

- Empty timeline returns `status: unknown`.
- Completed timeline returns `status: completed`.
- Failed timeline returns `status: failed`.
- Download timeout returns `status: timeout`.
- Selector failure returns `status: blocked` or `failed`.
- Content readiness failure identifies `extension.content`.
- Missing bridge receive after command sent lists `bridge.command.received`.
- Download completed without final status lists `conversion.status.received`.
- Truncated evidence lowers confidence.
- Malformed events do not crash.
- Missing fields do not crash.
- Summary does not mutate input events.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 24. Out of scope

Do not implement:

- New event emission.
- WebSocket instrumentation.
- Runtime queue instrumentation.
- Content readiness instrumentation.
- Selector instrumentation.
- Download tracker instrumentation.
- Tab lifecycle events.
- State save events.
- State migration.
- Job status updates.
- Side panel UI.
- Diagnostics ZIP export.
- `bug_report.md` generation.
- Screenshots.
- DOM snapshots.
- DOM summaries.
- Browser evidence capture.
- OpenTelemetry.
- Dashboard.
- Metrics.
- External log aggregation.
- Generic logging across the codebase.
- Strict state machine validation.
- Enforcement of invalid transitions.

---

## 25. Rollback notes

Rollback should be small.

If created, delete:

```text
app-python-zoho/observability/trace_summary.py
```

Revert summary changes in:

```text
app-python-zoho/observability/timeline.py
```

If modified only to expose the summary, revert minor changes in:

```text
app-python-zoho/http_server.py
app-python-zoho/observability/__init__.py
```

If tests were added, delete:

```text
tests/observability/test_trace_summary.py
```

Because this slice is read-only, rollback should not affect automation behavior.

---

## 26. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 10 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Summary fields added

### Tests run

### Tests not run and why

### Manual trace summary checks

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
11_tab_lifecycle_events.md
```

The agent must stop after this report.

---

## 27. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/10_trace_summary.md

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
- docs/observability/implementation_slices/10_trace_summary.md
- docs/observability/final_pre_implementation_review.md

Your task is to add a compact read-only `trace_summary` to the job timeline response.

The summary must be computed only from existing timeline events.

Add fields such as:
- status
- last_successful_phase
- expected_next_phase
- actual_terminal_event
- suspected_component
- missing_events
- has_final_status
- has_conversion_completed
- has_conversion_failed
- has_download_completed
- has_download_timeout
- has_selector_failure
- evidence_is_truncated
- confidence
- notes

You may create or modify only the files listed in the “Allowed files” section of Slice 10.

Do not modify any forbidden file.

Do not modify Chrome extension files.

Do not add new event emission.

Do not instrument WebSocket, runtime queue, content readiness, selectors, download tracker, tab lifecycle, side panel UI, JobStore, StateManager, or flow orchestration.

Do not change conversion behavior, WebSocket behavior, extension behavior, state persistence, job statuses, tab behavior, download behavior, selector behavior, or UI behavior.

Do not implement a strict state machine.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, databases, cloud services, or heavy dependencies.

This must be read-only and best-effort: if summary generation fails, the timeline endpoint should still return a safe response.

When done, provide the required Slice 10 completion report and stop.
```
