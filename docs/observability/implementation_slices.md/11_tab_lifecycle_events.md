# Slice 11 — Tab Lifecycle Events

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: Chrome extension tab lifecycle instrumentation  
Depends on: `docs/observability/implementation_slices/10_trace_summary.md`  
Application behavior changes: **observability-only, best-effort**  
Runtime instrumentation: **tab close / tab lifecycle observation only**  
Status: `ready_for_implementation`

---

## 1. Goal

Instrument tab lifecycle decisions and tab close events for the direct PDF-to-Excel conversion path.

This slice should help diagnose the known failure mode where a browser tab may close before the workflow has reached a terminal status.

The goal is to answer:

- Was a tab close requested?
- Which component requested the close?
- What job/trace/tab/download was active at the time?
- Was the tab closed before final `CONVERSION_STATUS`?
- Was the tab closed while the download tracker was active?
- Was the tab closed before a terminal conversion event?
- Did the tab disappear unexpectedly?
- Did observability capture this without changing tab behavior?

This slice is observation-only.

It must not block tab closure.

It must not delay tab closure.

It must not change tab reuse behavior.

It must not change tab creation behavior.

It must not change conversion, download, timeout, queue, selector, or final-status behavior.

---

## 2. Scope

Instrument only compact tab lifecycle events in the Chrome extension.

Primary target file:

```text
autohom-extension/ilovepdf-background/tabManager.js
```

Conditional files only if tab close/remove logic lives elsewhere:

```text
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/downloadTracker.js
autohom-extension/ilovepdf-background/router.js
autohom-extension/ilovepdf-background/bridge.js
```

This slice should emit events such as:

```text
tab.close.requested
tab.close.decision
tab.close.allowed
tab.close.blocked
tab.closed
tab.closed_before_terminal_status
```

Important: `tab.close.blocked` is only an event name describing an existing decision if the current code already blocks a close. This slice must not introduce new blocking behavior.

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
- `docs/observability/implementation_slices/11_tab_lifecycle_events.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `final_pre_implementation_review.md` as the scope reducer.

The review explicitly identifies premature tab closure as a risk that should be observed before behavior changes.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may modify this file:

```text
autohom-extension/ilovepdf-background/tabManager.js
```

The coding agent may modify these observability helper files only if a tiny compatibility adjustment is required:

```text
autohom-extension/observability/eventWriter.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/sanitize.js
```

The coding agent may add optional tests only if the repository already has a compatible JavaScript test setup:

```text
tests/observability/test_tab_lifecycle_events.js
```

If the repository does not already have a clear JavaScript test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Conditional allowed files

The coding agent may modify these files only if the current tab close, tab remove, tab reuse, or tab lifecycle decision logic actually lives there:

```text
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/downloadTracker.js
autohom-extension/ilovepdf-background/router.js
autohom-extension/ilovepdf-background/bridge.js
```

Before modifying any conditional file, the agent must verify that:

- The tab close or lifecycle boundary is actually located there, or
- Required metadata such as `trace_id`, `job_id`, `pdf_id`, `request_id`, `tab_id`, or terminal status must be passed through that file.

If a conditional file is modified, the completion report must explain:

- Why it was necessary.
- What event or metadata was added.
- Why no tab behavior changed.

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
app-python-zoho/observability/trace_summary.py
```

Do not modify these Chrome extension files in this slice:

```text
autohom-extension/background-main.js
autohom-extension/background-zoho.js
autohom-extension/sidepanel.js
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

## 7. Required event names

Use this small event set:

```text
tab.close.requested
tab.close.decision
tab.close.allowed
tab.close.blocked
tab.closed
tab.closed_before_terminal_status
```

Optional only if the current code has clear tab lifecycle boundaries:

```text
tab.created
tab.reused
tab.removed_external
tab.not_found
```

Do not add broad browser telemetry.

Do not emit high-volume tab events for unrelated tabs.

Only instrument tabs involved in the iLovePDF / direct PDF-to-Excel conversion path.

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

The most important fields for this slice are:

```text
trace_id
job_id
pdf_id
request_id
tab_id
download_id
```

Rules:

- Preserve `trace_id`, `job_id`, `pdf_id`, and `request_id` from the runtime task/context.
- Include `tab_id` whenever available.
- Include `download_id` if the current context knows that a download is active or recently completed.
- Do not require these fields to exist.
- Do not fail tab handling if metadata is missing.
- Do not mutate task objects in ways that change behavior.

---

## 9. Required behavior

### 9.1 `tab.close.requested`

Emit when current code requests tab closure/removal for a conversion-related tab.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.close.requested",
  "phase": "tab_close",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "download_id": 456,
  "message": "Tab close requested for conversion tab",
  "data": {
    "requested_by": "tabManager",
    "reason": "existing compact reason"
  }
}
```

Only use the existing reason if available.

Do not create new close reasons that change logic.

---

### 9.2 `tab.close.decision`

Emit if the code currently computes a decision before closing or preserving a tab.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.close.decision",
  "phase": "tab_close",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Tab close decision evaluated",
  "expected": {
    "terminal_status_before_close": true
  },
  "actual": {
    "terminal_status_before_close": false,
    "download_tracker_active": true,
    "final_status_sent": false
  },
  "data": {
    "decision": "existing decision",
    "reason": "existing compact reason"
  }
}
```

Important:

- Do not add new decision logic.
- Do not block or allow differently.
- Only report what the existing logic is doing.

---

### 9.3 `tab.close.allowed`

Emit if the current code proceeds with closing/removing a conversion-related tab.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.close.allowed",
  "phase": "tab_close",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Tab close allowed by existing logic",
  "data": {
    "reason": "existing compact reason"
  }
}
```

This event means the existing logic allowed tab closure.

It does not mean this slice introduced the permission.

---

### 9.4 `tab.close.blocked`

Emit only if the current code already blocks/prevents tab closure.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.close.blocked",
  "phase": "tab_close",
  "severity": "warning",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Tab close blocked by existing logic",
  "data": {
    "reason": "existing compact reason"
  }
}
```

Do not implement new blocking behavior in this slice.

If the current code never blocks tab close, do not emit this event.

---

### 9.5 `tab.closed`

Emit after the tab close/remove operation completes or after current code detects that the tab is closed.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.closed",
  "phase": "tab_closed",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Conversion tab closed",
  "data": {
    "closed_by": "existing compact source"
  }
}
```

If `chrome.tabs.remove` fails, capture a compact failure event only if the existing code catches it.

Do not change error handling semantics.

---

### 9.6 `tab.closed_before_terminal_status`

Emit when the code can observe that a conversion-related tab closed before a terminal workflow status.

This event is highly valuable for diagnosing premature closure.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.closed_before_terminal_status",
  "phase": "tab_closed",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "download_id": 456,
  "message": "Tab closed before terminal conversion status",
  "expected": {
    "terminal_status_before_tab_close": true
  },
  "actual": {
    "terminal_status_before_tab_close": false,
    "download_completed": false,
    "download_tracker_active": true,
    "final_status_sent": false
  }
}
```

Only emit this if the current code has enough context to determine it.

If the code cannot know terminal status reliably, emit a more cautious event such as `tab.closed` with a note in `data`, rather than pretending certainty.

---

## 10. Optional tab lifecycle events

### 10.1 `tab.created`

Emit only if the current tab manager clearly creates a conversion tab.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.created",
  "phase": "tab_created",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Conversion tab created"
}
```

Do not change tab creation behavior.

---

### 10.2 `tab.reused`

Emit only if the current tab manager clearly reuses an existing conversion tab.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.reused",
  "phase": "tab_reused",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Existing conversion tab reused"
}
```

Do not change tab reuse behavior.

---

### 10.3 `tab.removed_external`

Emit only if the code can detect the tab was removed externally, such as by the user or browser, not by the extension's own close request.

Recommended fields:

```json
{
  "component": "extension.tabManager",
  "event": "tab.removed_external",
  "phase": "tab_removed",
  "severity": "warning",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "tab_id": 123,
  "message": "Conversion tab was removed externally"
}
```

Do not add high-volume listeners for all tabs.

Only observe conversion-related tabs.

---

## 11. Terminal status definition

For this slice, terminal status means the current workflow has reached one of these kinds of outcomes, if the code can observe them:

```text
conversion.completed
conversion.failed
conversion.status.received with terminal status
download.completed followed by final status send attempt
runtime failure with final status send attempt
existing TASK_FULLY_COMPLETED / RESPONSE_COMPLETED marker if present
```

Do not invent a new terminal status system.

Do not add a strict state machine.

Do not write terminal status into persisted state.

Use existing data only.

If the current code cannot know terminal status at the tab manager boundary, still emit tab close events but do not emit `tab.closed_before_terminal_status`.

---

## 12. Event writer usage

Use the extension event writer from Slice 04:

```javascript
globalThis.AutoHomObservabilityEventWriter.emit(...)
```

Requirements:

- Event emission must be best-effort.
- Event writer failures must not affect tab behavior.
- Missing event writer must not affect tab behavior.
- Do not add noisy `console.log`.
- Do not print full event payloads.
- Do not send events externally.

Recommended helper pattern:

```javascript
async function emitTabLifecycleEvent(payload) {
  try {
    if (globalThis.AutoHomObservabilityEventWriter?.emit) {
      await globalThis.AutoHomObservabilityEventWriter.emit(payload);
    }
  } catch (_) {
    // Observability must never change tab behavior.
  }
}
```

The exact implementation can differ.

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
- tab ID.
- download ID.
- compact close reason.
- compact decision.
- booleans such as `download_tracker_active`, `final_status_sent`, `terminal_status_before_close`.
- compact sanitized error reason.

---

## 14. No behavior changes

This slice must not change:

- Tab close behavior.
- Tab reuse behavior.
- Tab creation behavior.
- Tab cleanup behavior.
- Tab remove timing.
- Runtime queue behavior.
- Content readiness behavior.
- Selector behavior.
- Upload behavior.
- Download matching behavior.
- Download timeout behavior.
- Final status behavior.
- WebSocket behavior.
- Conversion behavior.
- State persistence.
- UI behavior.

The automation should work exactly as before, with additional best-effort events only.

---

## 15. Timeline expectation

After this slice, a timeline may include:

```json
{
  "timeline": [
    {
      "component": "extension.downloadTracker",
      "event": "download.tracker.started",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "tab_id": 123
    },
    {
      "component": "extension.tabManager",
      "event": "tab.close.requested",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "tab_id": 123
    },
    {
      "component": "extension.tabManager",
      "event": "tab.closed_before_terminal_status",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "tab_id": 123
    }
  ]
}
```

This should make premature tab close visible to the AI agent without changing current app behavior.

---

## 16. Trace summary interaction

If Slice 10 trace summary exists, this slice may not need to modify it.

Optional only if simple and isolated:

- Add `tab.closed_before_terminal_status` as a terminal/failure event in the trace summary mapping.
- Add a boolean flag such as `has_tab_closed_before_terminal_status`.

This optional change may only be made in:

```text
app-python-zoho/observability/trace_summary.py
app-python-zoho/observability/timeline.py
```

However, Python files are otherwise forbidden for this slice.

If updating trace summary would require broader changes, skip it and leave it for a later refinement.

Because the main goal is event capture, trace summary integration is optional.

---

## 17. Required acceptance criteria

This slice is complete when:

- Tab close requests emit `tab.close.requested` for conversion-related tabs.
- Existing close decisions emit `tab.close.decision` if such a decision point exists.
- Actual close/remove operations emit `tab.close.allowed` and/or `tab.closed` where accurate.
- `tab.close.blocked` is emitted only if current code already blocks close.
- `tab.closed_before_terminal_status` is emitted only when the code can accurately determine premature closure.
- Events include `trace_id`, `job_id`, `pdf_id`, `request_id`, and `tab_id` when available.
- Events include `download_id` when available.
- Event writer failures do not affect tab behavior.
- Missing event writer does not affect tab behavior.
- Missing metadata does not affect tab behavior.
- No new tab-blocking behavior is added.
- No tab close timing changes are made.
- No runtime/download/selector/final-status behavior changes are made.
- No screenshots, DOM snapshots, full HTML, OpenTelemetry, dashboards, or external logging are added.
- No heavy dependencies are added.

---

## 18. Manual test plan

The coding agent should manually test through the existing direct conversion flow where possible.

### 18.1 Normal tab close path

1. Start the Python backend.
2. Load the Chrome extension.
3. Trigger a direct PDF-to-Excel conversion.
4. Let the workflow proceed to whatever existing tab cleanup behavior it currently has.
5. Query timeline:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/<JOB_ID>/timeline"
```

Expected result:

- Timeline includes `tab.close.requested` if the tab was closed.
- Timeline includes `tab.closed` if the tab close completed.
- Existing tab behavior remains unchanged.

### 18.2 Premature tab close observation

If safe, reproduce or simulate the existing premature tab close condition without changing app logic.

Expected result:

- Timeline includes `tab.closed_before_terminal_status` if the code has enough context to determine it.
- If not enough context exists, timeline at least includes `tab.close.requested` / `tab.closed` around the relevant phase.
- Existing behavior is unchanged.

If this cannot be safely reproduced, explain in the completion report.

### 18.3 Event writer failure safety

If practical, configure the event writer to a bad endpoint or stop Python backend.

Expected result:

- Tab behavior remains exactly as before.
- Event writer buffers/drops safely.
- No uncaught exception from observability.

---

## 19. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_tab_lifecycle_events.js
```

Recommended tests:

- Tab close request emits `tab.close.requested`.
- Tab close completion emits `tab.closed`.
- Existing close decision emits `tab.close.decision` if applicable.
- Premature close condition emits `tab.closed_before_terminal_status` when context exists.
- Missing event writer does not throw.
- Event writer failure does not change tab close behavior.
- Missing metadata does not throw.
- No full task object is sent in event data.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 20. Out of scope

Do not implement:

- New tab close policy.
- New tab close blocking behavior.
- New tab cleanup strategy.
- New tab reuse strategy.
- Timeout changes.
- Retry changes.
- Selector instrumentation.
- Download tracker instrumentation.
- Runtime queue instrumentation.
- Content readiness instrumentation.
- WebSocket instrumentation.
- Python state save events.
- State migration.
- Job status changes.
- Side panel timeline UI.
- Diagnostics ZIP export.
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

---

## 21. Rollback notes

Rollback should be limited to tab lifecycle event additions.

Revert observability changes in:

```text
autohom-extension/ilovepdf-background/tabManager.js
```

If conditionally modified, revert narrow propagation changes in:

```text
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/downloadTracker.js
autohom-extension/ilovepdf-background/router.js
autohom-extension/ilovepdf-background/bridge.js
```

If helper compatibility changes were made, revert them in:

```text
autohom-extension/observability/eventWriter.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/sanitize.js
```

If tests were added, delete:

```text
tests/observability/test_tab_lifecycle_events.js
```

Because this slice should only add best-effort observation, rollback should restore the exact previous tab behavior.

---

## 22. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 11 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Events added

### IDs propagated

### Tab behavior preserved

### Tests run

### Tests not run and why

### Manual tab lifecycle checks

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
12_minimal_tests.md
```

The agent must stop after this report.

---

## 23. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/11_tab_lifecycle_events.md

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
- docs/observability/implementation_slices/11_tab_lifecycle_events.md
- docs/observability/final_pre_implementation_review.md

Your task is to instrument only conversion-related tab lifecycle observation.

Add events for:
- tab.close.requested
- tab.close.decision, only if such a decision point already exists
- tab.close.allowed
- tab.close.blocked, only if current code already blocks close
- tab.closed
- tab.closed_before_terminal_status, only when the code can accurately determine premature closure

Optional only if current code clearly exposes them:
- tab.created
- tab.reused
- tab.removed_external
- tab.not_found

Preserve and propagate when available:
- trace_id
- job_id
- pdf_id
- request_id
- agent_type
- runtime_instance_id
- tab_id
- download_id

You may modify only the files listed in the “Allowed files” section of Slice 11.

You may modify conditional files only if the actual tab lifecycle boundary or metadata propagation lives there, and you must explain why.

Do not modify any forbidden file.

Do not modify Python files, except optional trace summary integration only if explicitly safe and isolated.

Do not modify manifest.json.

Do not change tab close behavior, tab timing, tab reuse, tab creation, tab cleanup, queue behavior, selector behavior, download behavior, final status behavior, WebSocket behavior, conversion behavior, state persistence, or UI behavior.

Do not add screenshots, DOM snapshots, DOM summaries, diagnostic ZIP exports, OpenTelemetry, dashboards, databases, cloud services, or heavy dependencies.

Observability must be best-effort: if event emission fails, tab behavior must continue exactly as before.

When done, provide the required Slice 11 completion report and stop.
```
