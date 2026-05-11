# Observability Architecture Proposal — AutoHom v2

Repository reviewed: `infoclusiv/autohom-v2`  
Scope: observability architecture design only.  
Application code modification: **none**.  
Output artifact: `observability_architecture_proposal.md`

## Source documents read

This proposal is based on the project-specific observability discovery documents already present in the repository:

- `docs/observability/project_understanding.md`
- `docs/observability/observability_classification.md`
- `docs/observability/critical_workflows.md`
- `docs/observability/failure_surface_map.md`

## Executive recommendation

AutoHom v2 should not implement a generic “more logs everywhere” layer.

The project needs a **hybrid, workflow-first observability architecture** that can reconstruct one complete automation attempt across:

```text
Side panel user action
  -> local Python HTTP API
  -> JobStore / StateManager
  -> WebSocket command to Chrome extension agent
  -> Chrome extension service worker
  -> iLovePDF runtime queue
  -> Chrome tab / content script
  -> iLovePDF DOM automation
  -> local PDF fetch from Python
  -> iLovePDF conversion/download page
  -> Chrome downloads API
  -> WebSocket final status back to Python
  -> state.json persistence
  -> side panel refresh / diagnostics
```

The primary output should be an **AI-ready diagnostic package per job or flow run**, not disconnected console logs.

The smallest professional implementation should focus on:

1. A shared event schema for Python and Chrome extension code.
2. Correlation IDs propagated across HTTP, WebSocket, extension messages, tabs, downloads, jobs, PDFs, and flow runs.
3. Explicit state-transition events for job conversion, flow runs, agents, runtime queue, tabs/content scripts, downloads, and Zoho mappings.
4. Decision logs for fragile automation choices: agent availability, tab reuse, selector matching, content-script readiness, download matching, and state conflict handling.
5. Evidence capture on failure: screenshots, compact DOM summaries, selector diagnostics, download candidates, file metadata, config snapshots, and stack traces.
6. A compact export format another AI agent can read without needing the entire repository or huge raw logs.

---

# 1. Observability goals

## 1.1 What this layer must help detect

The observability layer should detect the failure patterns that are specific to AutoHom v2:

### Required

1. **A conversion starts but never completes**
   - Example symptom: job remains `queued`, `converting`, or flow times out.
   - Must detect whether the break happened in HTTP, WebSocket, extension queue, tab creation, content-script readiness, DOM upload, iLovePDF navigation, download tracking, final status delivery, or Python persistence.

2. **A WebSocket command is accepted but browser automation stops later**
   - Example symptom: Python receives `CONVERT_PDF_ACK`, but never receives final `CONVERSION_STATUS`.
   - Must detect queue state, runtime state, tab state, content-script state, and WebSocket state at the moment progress stopped.

3. **The Chrome extension agent is missing, stale, duplicated, or disconnected**
   - Example symptom: side panel shows no agent, or Python thinks an agent is connected but commands timeout.
   - Must detect service-worker lifecycle, runtime instance ID, connection ID, reconnect attempts, close codes, keepalive PING/PONG, and duplicate runtime handling.

4. **iLovePDF DOM automation fails**
   - Example symptom: upload input, convert button, download page, or download button cannot be found.
   - Must capture URL, page title, document readiness, selector diagnostics, visible candidates, screenshots, and compact DOM evidence.

5. **Chrome download matching is ambiguous or wrong**
   - Example symptom: file downloads but job remains failed, or wrong file is recorded.
   - Must capture download candidates, matching rules, expected filename stem, tab ID, final URL, MIME/extension, state, interrupt reason, and timing.

6. **Zoho mapping is saved in Chrome but not imported into Python**
   - Example symptom: user confirms a mapping, but the job remains unmapped or missing in the side panel.
   - Must detect pending mapping creation, confirmation, Chrome storage result, Python import request, API response, and resulting job update.

7. **PDF file state is inconsistent**
   - Example symptom: scanned job exists, but `/api/pdfs/{pdf_id}/file` returns missing file.
   - Must capture PDF path, existence, size, modified time, scan time, serve time, and missing-file transitions.

8. **State persists incorrectly or silently resets**
   - Example symptom: app starts with empty jobs even though state existed before.
   - Must capture state file path, load status, parse errors, default-state fallback, save failures, job/PDF counts before and after, and relevant state snapshots.

9. **Side panel masks backend/API failure as an empty UI**
   - Example symptom: user sees no jobs or stale jobs but cannot tell whether backend is unreachable.
   - Must capture side panel refresh batch, endpoint failures, previous render state, new render state, and backend disconnected state.

10. **Flow status contradicts conversion status**
    - Example symptom: `pdf_to_excel` flow times out, but conversion completes later.
    - Must detect state conflicts such as `flow=error` while `conversion=completed`.

## 1.2 What this layer must help explain

The diagnostic output should be able to answer:

- What user action or browser event started the workflow?
- Which `job_id`, `pdf_id`, `flow_run_id`, tab, download, and agent were involved?
- What was the last successful phase?
- What was the expected next phase?
- What actually happened instead?
- Which component made the decision that led to the next action?
- Which state transition was missing, invalid, duplicated, or late?
- Which evidence proves the root cause: WebSocket timeout, missing file, broken selector, content script not ready, wrong tab, download mismatch, persistence failure, or UI refresh failure?

## 1.3 What this layer must help reproduce

The layer should produce enough information to reproduce failures through harnesses:

- Backend startup with occupied ports or corrupted `state.json`.
- Agent registration with invalid, duplicate, stale, or disconnected WebSocket clients.
- Conversion request with missing PDF fields or disconnected agent.
- Runtime queue stuck after ACK.
- Content-script readiness failure.
- Selector failure on iLovePDF upload/convert/download controls.
- Slow conversion that exceeds flow timeout.
- Chrome download mismatch or timeout.
- Zoho mapping import failure when Python is stopped.
- Side panel refresh failure when backend is unreachable.

## 1.4 What this layer must help fix

The layer should make fixes more precise by identifying:

- The exact component and phase where the workflow broke.
- The code boundary involved: HTTP handler, WebSocket server, agent registry, flow orchestrator, extension bridge, runtime queue, tab manager, content script, PDF uploader, conversion automator, download tracker, state manager, or side panel.
- The missing contract: message field, expected status, selector, tab URL, file existence, download matching rule, timeout, or persistence rule.
- Whether the issue is deterministic, intermittent, timing-related, third-party DOM-related, state-related, or UI-rendering-related.

## 1.5 Explicit non-goals

### Unnecessary for the first implementation

- Full enterprise OpenTelemetry deployment.
- External log aggregation service.
- Metrics dashboards as the primary solution.
- Multi-user analytics.
- Capturing full PDFs, full Excel files, or full page HTML by default.
- LLM-agent memory observability, because the runtime project is not an AI agent.

---

# 2. Recommended observability model

## 2.1 Model decision

AutoHom v2 needs a **hybrid model**:

| Observability mechanism | Decision | Why |
|---|---|---|
| Structured logging | Required | Current console and ad-hoc logs cannot reliably reconstruct cross-component causality. |
| Lightweight tracing | Required | A conversion crosses HTTP, WebSocket, extension runtime, content scripts, tabs, downloads, and state persistence. |
| State machines | Required | Most failures are state progression failures: `queued` never becomes `completed`, agent goes stale, tab never becomes ready, download never matches. |
| Decision logs | Required | Automation depends on decisions: detect PDF, resolve Zoho URL, select tab, choose selector, match download, accept/reject handshake, declare timeout. |
| Evidence capture | Required | Browser automation failures require screenshots, DOM summaries, selector diagnostics, URL/page state, download evidence, and file metadata. |
| Diagnostic exports | Required | The final artifact should be AI-readable and compact, not a massive log dump. |
| Test harnesses | Required | Many failures can be reproduced with protocol, state, file, and simulated browser harnesses. |
| Metrics | Optional, later | Useful for trends and health, but not enough to debug individual job failures. |
| Full OpenTelemetry | Optional, later | Good maturity path, but too heavy as the first layer for a local Chrome-extension automation system. |

## 2.2 Why generic logging is insufficient

A log line like `conversion failed` does not explain whether the failure occurred because:

- the side panel clicked the wrong stale job,
- the job had no `pdf_id`,
- the agent was disconnected,
- the WebSocket request timed out,
- the extension ACKed but lost runtime state,
- the iLovePDF tab was not ready,
- the content script was not injected,
- the PDF fetch from Python failed,
- the upload input selector broke,
- the convert button was hidden,
- the page never reached `/descarga/`,
- the download button click did not happen,
- Chrome downloaded a file but the tracker rejected it,
- the final status could not be delivered to Python,
- state save failed,
- or the UI refresh hid the real backend failure.

The observability model must therefore be **workflow-first**, with correlated events and evidence.

## 2.3 Required architecture layers

### Layer A — Shared event envelope

Required for both Python and JavaScript extension code.

Every event should use a shared shape:

```json
{
  "schema_version": "1.0",
  "ts": "2026-05-10T12:34:56.789Z",
  "monotonic_ms": 123456,
  "severity": "info",
  "component": "python.http",
  "event": "conversion.request.accepted",
  "phase": "queued",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "flow_id": "pdf_to_excel",
  "flow_run_id": "flowrun_...",
  "user_action_id": "ua_...",
  "request_id": "req_...",
  "connection_id": "conn_...",
  "runtime_instance_id": "rt_...",
  "agent_id": "ilovepdf-converter",
  "agent_type": "ilovepdf-converter",
  "tab_id": 123,
  "download_id": 456,
  "message": "Conversion command accepted and sent to agent",
  "expected": {},
  "actual": {},
  "data": {},
  "duration_ms": 12
}
```

Fields can be omitted when not applicable, but the schema should be consistent.

### Layer B — Correlation propagation

Required.

Correlation IDs must be carried across:

- Side panel action.
- HTTP request to Python.
- Python job update.
- WebSocket command payload.
- Extension bridge receive/ACK.
- Runtime queue item.
- Tab/content-script messages.
- PDF fetch request.
- Download tracker.
- Final status back to Python.
- State persistence.
- Diagnostic export.

### Layer C — State-transition ledger

Required.

Every important state mutation should produce a `state.transition` event with:

- state machine name,
- entity ID,
- previous state,
- new state,
- reason,
- component,
- correlation IDs,
- expected condition,
- actual condition if abnormal.

### Layer D — Decision log stream

Required.

Decision logs should be compact and only used at high-impact decision points. They should explain why the system chose one path over another.

### Layer E — Evidence capture

Required on failures; optional at important phase boundaries.

Evidence should be compact by default:

- screenshots on browser automation failure,
- compact DOM summaries, not full HTML,
- selector match tables,
- file metadata, not file contents,
- request/response summaries, not full PDFs,
- state snapshots filtered to the relevant job/PDF/flow.

### Layer F — Diagnostic package exporter

Required.

A diagnostic package should be generated for a `job_id`, `flow_run_id`, or `trace_id`, containing timeline, transitions, decisions, evidence, state, config, errors, and reproduction instructions.

### Layer G — Harnesses

Required in phases.

Harnesses should test protocol, state machines, failure scenarios, and browser automation assumptions without requiring the user to manually reproduce every failure.

---

# 3. Core concepts and identifiers

## 3.1 Required identifiers

These identifiers make sense for AutoHom v2 and should be used consistently.

| Identifier | Required? | Scope | Purpose |
|---|---:|---|---|
| `trace_id` | Required | One end-to-end workflow attempt | Connects side panel action, HTTP request, WebSocket command, extension runtime, tab, download, status update, and persistence. |
| `job_id` | Required | Existing job entity | Primary user-facing unit. Most diagnostics should be exportable by `job_id`. |
| `pdf_id` | Required | Existing PDF entity | Connects scanned file, Python serve endpoint, upload, conversion, and output. |
| `flow_id` | Required when flow is used | Flow definition, e.g. `pdf_to_excel` | Identifies configured workflow definition from `flows.json`. |
| `flow_run_id` | Required when flow is used | One execution of a flow | Separates repeated runs of the same flow on the same job. |
| `user_action_id` | Required for side panel actions | One click/action in the UI | Connects a button click to the backend request and resulting workflow. |
| `request_id` | Required | HTTP, WebSocket, and Chrome message attempts | Pairs requests and responses, especially `CONVERT_PDF`, ACKs, final status, and content-script messages. |
| `reply_to` | Required for responses | Message response correlation | Connects `CONVERT_PDF_ACK` or content-script response to the original `request_id`. |
| `connection_id` | Required for WebSocket | One Python-side socket connection | Explains stale/duplicate/disconnected agents. |
| `runtime_instance_id` | Required for extension runtime | One Chrome extension service-worker/runtime instance | Explains service-worker restarts and duplicate runtime rejection. |
| `agent_id` | Required | Registered automation agent | Identifies the specific connected agent instance. |
| `agent_type` | Required | Agent capability type | Example: `ilovepdf-converter`. Useful when future agents are added. |
| `sidepanel_session_id` | Required for UI diagnostics | One side panel page/session | Separates refresh failures and user actions across side panel reloads. |
| `component_id` | Required | Specific emitting component | Example: `python.http`, `python.ws`, `extension.bridge`, `extension.runtime`, `extension.content.ilovepdf`. |
| `tab_id` | Required for browser automation | Chrome tab used for iLovePDF or Zoho | Needed for tab reuse, content-script messages, and download matching. |
| `download_id` | Required for Chrome downloads | Chrome download item | Needed for output matching and completed/interrupted evidence. |
| `diagnostic_export_id` | Required for exports | One generated diagnostic package | Makes exported artifacts reproducible and referenceable. |
| `process_run_id` | Required for Python process lifecycle | One Python backend startup | Connects startup events, port bind, state load, and later requests. |
| `extension_start_id` | Required for extension lifecycle | One service-worker bootstrap | Explains import/bootstrap/reconnect history. |

## 3.2 Optional identifiers

| Identifier | Optional? | Why |
|---|---:|---|
| `correlation_id` | Optional alias | If the codebase already uses `trace_id`, avoid having both. Prefer `trace_id` for end-to-end workflows. Use `correlation_id` only as an external compatibility alias. |
| `span_id` | Optional later | Useful if later mapping to OpenTelemetry. Not necessary in the first implementation. |
| `external_request_id` | Optional | There is no official external API call to iLovePDF/Zoho. Use `request_id` for HTTP/WS/Chrome messages. Add `external_request_id` only if future formal APIs are integrated. |
| `task_id` | Optional / not recommended now | The project already has `job_id`, `pdf_id`, `flow_run_id`, and `request_id`. A generic `task_id` would create confusion unless future background tasks need it. |
| `workflow_id` | Optional naming concern | Prefer `flow_id` for configured flows and `trace_id` for an execution. `workflow_id` is too ambiguous here. |
| `session_id` | Optional generic | Use more precise names: `sidepanel_session_id`, `runtime_instance_id`, `connection_id`, and `process_run_id`. |

## 3.3 Identifier propagation rules

### Rule 1 — A side panel conversion click creates a new `trace_id`

When the user clicks Convert or Run Flow:

- side panel creates `user_action_id`, `trace_id`, and `sidepanel_session_id`,
- sends them to Python in request body or headers,
- Python attaches them to job events,
- WebSocket command includes the same `trace_id`, `job_id`, `pdf_id`, and `request_id`,
- extension uses the same values in ACK, queue, runtime, content-script, download, and final status events.

### Rule 2 — A Zoho download event also creates a `trace_id`

When `chrome.downloads.onCreated` detects a PDF:

- extension creates `trace_id` and `download_id`,
- pending mapping stores the `trace_id`,
- confirmation/import carries the same `trace_id` into Python,
- job update event records it.

### Rule 3 — A flow run creates `flow_run_id`, not a new disconnected trace

For `pdf_to_excel` flow:

- `trace_id` represents the end-to-end user-triggered attempt,
- `flow_run_id` represents this specific flow execution,
- each step has a `step_id` or `step_index`, but it should not replace `flow_run_id`.

### Rule 4 — WebSocket commands must be paired

Every command sent from Python to an agent must include:

- `request_id`,
- `trace_id`,
- `job_id`,
- `pdf_id`,
- expected response actions,
- timeout deadline.

Every response must include:

- `reply_to`,
- `request_id` if it starts a new sub-operation,
- same `trace_id`, `job_id`, `pdf_id` where possible.

---

# 4. Event taxonomy

## 4.1 Event naming convention

Use dot-separated, lower-case event names:

```text
<domain>.<entity_or_phase>.<action_or_result>
```

Examples:

- `workflow.started`
- `conversion.command.sent`
- `agent.registration.succeeded`
- `selector.convert_button.failed`
- `download.candidate.rejected`
- `state.transition`

Do not create noisy events for every variable. Emit events at phase boundaries, decisions, failures, state transitions, and external interactions.

## 4.2 Required event categories

### Process and backend readiness

Required:

- `process.started`
- `process.ready`
- `process.shutdown_requested`
- `process.stopped`
- `state.load.started`
- `state.load.succeeded`
- `state.load.failed`
- `state.default_created`
- `state.save.started`
- `state.save.succeeded`
- `state.save.failed`
- `ws.server.starting`
- `ws.server.ready`
- `ws.server.failed`
- `http.server.starting`
- `http.server.ready`
- `http.server.failed`
- `flow.config.loaded`
- `flow.config.failed`

### Side panel and user actions

Required:

- `sidepanel.opened`
- `sidepanel.refresh.started`
- `sidepanel.refresh.endpoint_succeeded`
- `sidepanel.refresh.endpoint_failed`
- `sidepanel.refresh.completed`
- `sidepanel.backend.disconnected`
- `user.action.clicked`
- `user.action.request_sent`
- `user.action.request_succeeded`
- `user.action.request_failed`

### HTTP API

Required:

- `http.request.received`
- `http.request.validated`
- `http.request.rejected`
- `http.response.sent`
- `http.request.failed`

Use for important endpoints:

- `/api/config`
- `/api/scan`
- `/api/folder-dialog`
- `/api/jobs/{job_id}/actions/convert-pdf`
- `/api/jobs/{job_id}/flows/run`
- `/api/jobs/import-zoho-mapping`
- `/api/pdfs/{pdf_id}/file`
- `/api/pdfs/{pdf_id}/status`
- `/api/jobs/{job_id}/diagnostics`
- future diagnostic export endpoint

### WebSocket and agent lifecycle

Required:

- `ws.connection.opened`
- `ws.connection.closed`
- `ws.connection.failed`
- `ws.message.received`
- `ws.message.sent`
- `ws.message.invalid`
- `ws.command.sent`
- `ws.command.acknowledged`
- `ws.command.timeout`
- `ws.command.unexpected_response`
- `agent.handshake.received`
- `agent.registration.succeeded`
- `agent.registration.failed`
- `agent.duplicate_runtime.rejected`
- `agent.keepalive.ping_sent`
- `agent.keepalive.pong_received`
- `agent.keepalive.timeout`
- `agent.disconnected`

### Workflow and flow execution

Required:

- `workflow.started`
- `workflow.completed`
- `workflow.failed`
- `workflow.timeout`
- `flow.run.started`
- `flow.run.completed`
- `flow.run.failed`
- `flow.run.timeout`
- `flow.step.started`
- `flow.step.precondition_checked`
- `flow.step.precondition_failed`
- `flow.step.command_sent`
- `flow.step.acknowledged`
- `flow.step.wait_started`
- `flow.step.completed`
- `flow.step.failed`

### Job, PDF, and file pipeline

Required:

- `folder.validation.succeeded`
- `folder.validation.failed`
- `scan.started`
- `scan.completed`
- `scan.failed`
- `pdf.discovered`
- `pdf.registered`
- `pdf.updated`
- `pdf.missing`
- `pdf.file.serve_requested`
- `pdf.file.serve_succeeded`
- `pdf.file.serve_failed`
- `job.created`
- `job.updated`
- `job.sync.completed`
- `excel.output.recorded`
- `excel.output.verified`
- `excel.output.path_ambiguous`

### Conversion lifecycle

Required:

- `conversion.requested`
- `conversion.validation.succeeded`
- `conversion.validation.failed`
- `conversion.command.sent`
- `conversion.command.acknowledged`
- `conversion.queued`
- `conversion.started`
- `conversion.upload.started`
- `conversion.upload.succeeded`
- `conversion.upload.failed`
- `conversion.convert_button.clicked`
- `conversion.download_page.wait_started`
- `conversion.download_page.reached`
- `conversion.download_page.timeout`
- `conversion.download.started`
- `conversion.completed`
- `conversion.failed`
- `conversion.status.received`
- `conversion.status.unmatched_job`
- `conversion.status.unmatched_pdf`
- `conversion.status.delivery_failed`

### Extension runtime, tabs, content scripts

Required:

- `extension.bootstrap.started`
- `extension.bootstrap.succeeded`
- `extension.bootstrap.failed`
- `bridge.ws.connect_attempted`
- `bridge.ws.opened`
- `bridge.ws.closed`
- `bridge.ws.error`
- `bridge.reconnect.scheduled`
- `bridge.handshake.sent`
- `runtime.queue.enqueued`
- `runtime.queue.dequeued`
- `runtime.queue.completed`
- `runtime.queue.failed`
- `runtime.concurrent_guard.triggered`
- `tab.find_or_create.started`
- `tab.reused`
- `tab.created`
- `tab.updated`
- `tab.closed`
- `tab.failed`
- `content.ready.check_started`
- `content.ready.succeeded`
- `content.ready.failed`
- `content.message.sent`
- `content.message.succeeded`
- `content.message.failed`

### DOM and selector diagnostics

Required on failures; optional on key phase boundaries:

- `selector.file_input.checked`
- `selector.file_input.failed`
- `selector.convert_button.checked`
- `selector.convert_button.failed`
- `selector.download_button.checked`
- `selector.download_button.failed`
- `selector.fallback.used`
- `dom.snapshot.captured`
- `screenshot.captured`
- `evidence.capture.failed`

### Chrome download tracking

Required:

- `download.tracker.started`
- `download.candidate.seen`
- `download.candidate.accepted`
- `download.candidate.rejected`
- `download.matched`
- `download.completed`
- `download.interrupted`
- `download.timeout`
- `download.tracker.replaced`

### Zoho mapping

Required:

- `zoho.download.created`
- `zoho.download.ignored`
- `zoho.pdf.detected`
- `zoho.task_url.resolve_started`
- `zoho.task_url.resolved`
- `zoho.task_url.resolve_failed`
- `zoho.mapping.pending_created`
- `zoho.mapping.confirmed`
- `zoho.mapping.rejected`
- `zoho.mapping.local_saved`
- `zoho.mapping.import_requested`
- `zoho.mapping.import_succeeded`
- `zoho.mapping.import_failed`

### State and decisions

Required:

- `state.transition`
- `state.invalid_transition`
- `state.conflict_detected`
- `decision.made`
- `policy.check.passed`
- `policy.check.failed`

### Diagnostics and export

Required:

- `diagnostic.requested`
- `diagnostic.timeline.generated`
- `diagnostic.evidence.included`
- `diagnostic.evidence.missing`
- `diagnostic.package.created`
- `diagnostic.package.failed`
- `diagnostic.events.truncated`

## 4.3 Optional event categories for later

- `metric.sampled`
- `otel.span.started`
- `otel.span.completed`
- `dashboard.health.updated`
- `trend.failure_rate.updated`

These are useful after the minimum viable layer exists.

---

# 5. State machine design

## 5.1 Overall recommendation

AutoHom v2 should not use one giant global state machine for everything.

It should use **small, explicit state machines per domain**, connected by `trace_id`, `job_id`, `pdf_id`, and `flow_run_id`.

### Required state machines

1. Backend process readiness state machine.
2. Job conversion state machine.
3. Flow run state machine.
4. Agent connection state machine.
5. Extension runtime queue state machine.
6. Tab/content-script state machine.
7. Download tracker state machine.
8. PDF/file state machine.
9. Zoho mapping state machine.

### Optional later

- Side panel UI state machine.
- Site2 upload state machine, when that feature becomes active.

### Unnecessary now

- Formal global workflow engine with a heavy orchestration framework.
- Distributed transaction state machine.
- Cloud service health state machine.

## 5.2 Backend process readiness state machine

Required.

```text
not_started
  -> starting
  -> state_loading
  -> state_ready | state_default_created | state_failed
  -> ws_starting
  -> ws_ready | ws_failed
  -> http_starting
  -> http_ready | http_failed
  -> ready
  -> shutting_down
  -> stopped
```

Important invalid states:

- `http_ready` while `ws_failed` for normal operation.
- `ready` while `state_failed`.
- `ready` while flows are unreadable, if flows are required for user action.

## 5.3 Job conversion state machine

Required.

```text
not_started
  -> pending
  -> queued
  -> command_sent
  -> acknowledged
  -> runtime_queued
  -> running
  -> waiting_tab
  -> content_ready
  -> fetching_pdf
  -> uploading
  -> converting
  -> waiting_download_page
  -> waiting_download
  -> downloading
  -> completed
```

Failure terminal states:

```text
error
timeout
cancelled
file_missing
agent_missing
```

Important invalid transitions:

- `completed -> uploading`
- `error -> completed` without `late_completion_detected` event
- `queued -> completed` without ACK/runtime evidence
- `pending -> downloading` without upload/convert/download page evidence
- `completed` without output evidence

## 5.4 Flow run state machine

Required for `pdf_to_excel` and future flows.

```text
created
  -> started
  -> step_prechecking
  -> step_running
  -> step_acknowledged
  -> waiting_for_completion
  -> step_completed
  -> completed
```

Failure terminal states:

```text
failed
timeout
cancelled
```

Important invalid transitions:

- `completed` while any required step failed.
- `failed` while job conversion later becomes `completed` without a conflict marker.
- `waiting_for_completion -> completed` without observed job status condition.

## 5.5 Agent connection state machine

Required.

```text
disconnected
  -> socket_connecting
  -> socket_open
  -> handshake_received
  -> registered
  -> connected
  -> pinging
  -> connected
```

Failure/stale branches:

```text
connected -> stale -> disconnected
connected -> duplicate_runtime_rejected -> disconnected
socket_open -> handshake_failed -> disconnected
connected -> ws_closed -> disconnected
connected -> command_timeout -> stale | disconnected
```

Important invalid states:

- Agent marked connected with stale `last_seen` beyond configured threshold.
- Command sent to agent without current `connection_id`.
- Duplicate runtime accepted without explicit replacement policy.

## 5.6 Extension runtime queue state machine

Required.

```text
idle
  -> enqueued
  -> dequeued
  -> running
  -> waiting_tab
  -> waiting_content_script
  -> upload_phase
  -> convert_phase
  -> waiting_download_page
  -> download_phase
  -> completed
  -> idle
```

Failure terminal or branch states:

```text
runtime_error
content_not_ready
tab_failed
selector_failed
download_timeout
status_delivery_failed
```

Important invalid states:

- `_running=true` with no active `job_id` or `pdf_id`.
- Queue has items but runtime remains idle past threshold.
- New tracker replaces active tracker without explicit concurrency guard event.

## 5.7 Tab/content-script state machine

Required.

```text
no_tab
  -> finding_tab
  -> tab_reused | tab_created
  -> tab_loading
  -> page_complete
  -> content_ping_sent
  -> content_ready
```

Failure branches:

```text
content_ping_sent -> content_not_ready -> tab_reload -> content_ping_sent
content_not_ready -> failed
page_complete -> wrong_url -> failed
```

Important invalid states:

- Sending `START_CONVERSION` before content readiness.
- Sending download action on upload page instead of `/descarga/` page.
- Tracking a download against the wrong tab.

## 5.8 Download tracker state machine

Required.

```text
not_tracking
  -> tracking_started
  -> candidate_seen
  -> candidate_accepted | candidate_rejected
  -> matched
  -> completed
```

Failure branches:

```text
tracking_started -> timeout
matched -> interrupted
tracking_started -> replaced
```

Important invalid states:

- `completed` without a matched Chrome download ID.
- Output recorded without final download state.
- Tracker replaced while runtime says only one job is active.

## 5.9 PDF/file state machine

Required.

```text
unknown
  -> discovered
  -> registered
  -> available
  -> served
  -> uploaded
  -> converted
  -> output_recorded
  -> output_verified
```

Failure branches:

```text
available -> missing
served -> fetch_failed
output_recorded -> path_ambiguous
```

Important invalid states:

- Job marked convertible while PDF file is missing.
- `excel_path` set to a filename that cannot be verified later.
- Same `pdf_id` maps to multiple paths without collision event.

## 5.10 Zoho mapping state machine

Required.

```text
download_seen
  -> pdf_detected
  -> task_url_resolved
  -> pending_confirmation
  -> confirmed | rejected
  -> local_saved
  -> import_requested
  -> imported
```

Failure branches:

```text
download_seen -> ignored_not_pdf
pdf_detected -> no_task_url
pending_confirmation -> pending_missing
import_requested -> import_failed
```

Important invalid states:

- Mapping confirmed locally but import failed silently.
- Pending mapping removed before Python import succeeds.
- Zoho URL resolved from wrong active tab.

---

# 6. Decision logging design

Decision logs should be used only where the system chooses between meaningful alternatives. Each record should include:

- `decision_name`
- `input_context`
- `options_considered`
- `chosen_action`
- `reason`
- `expected_condition`
- `risk`
- `evidence_to_capture`

## 6.1 Required decision points

### 1. State load fallback decision

| Field | Design |
|---|---|
| Decision name | `state.load.fallback_decision` |
| Input context | `state.json` path, file exists, size, modified time, parse result, read exception if any. |
| Options considered | Load existing state; create default state; stop startup. |
| Chosen action | Usually load existing state; create default only if no file or explicitly recoverable. |
| Reason | Existing valid state should preserve jobs/PDFs/events; invalid state should not be silently overwritten. |
| Expected condition | State loaded with valid schema and counts. |
| Risk | Silent data loss if corrupt/unreadable state becomes default. |
| Evidence to capture | File metadata, parse error, state counts, backup path if created. |

### 2. Agent registration decision

| Field | Design |
|---|---|
| Decision name | `agent.registration.decision` |
| Input context | Handshake payload, `agentId`, `agentType`, `runtimeInstanceId`, extension version, current registry entries. |
| Options considered | Accept; reject invalid; reject duplicate; replace stale existing agent. |
| Chosen action | Accept only valid `ilovepdf-converter`; reject duplicates unless clear replacement policy exists. |
| Reason | Prevent commands from going to stale or duplicate agents. |
| Expected condition | Exactly one active healthy `ilovepdf-converter` for conversion. |
| Risk | Duplicate runtime can lead to commands sent to wrong/stale socket. |
| Evidence to capture | Registry snapshot before/after, close code/reason, runtime instance, connection ID. |

### 3. Side panel action routing decision

| Field | Design |
|---|---|
| Decision name | `sidepanel.action.route_decision` |
| Input context | Button clicked, job ID, job snapshot, selected flow ID, bridge/agent state. |
| Options considered | Convert PDF; run flow; open Zoho; send Site2; show diagnostics; reject disabled action. |
| Chosen action | Endpoint/action matching the button. |
| Reason | Makes UI click traceable to backend operation. |
| Expected condition | Backend receives request with same `user_action_id` and `trace_id`. |
| Risk | Stale job ID or disabled/future action creates confusing workflow. |
| Evidence to capture | UI state, action payload, endpoint, response, toast. |

### 4. PDF detection decision in Zoho download listener

| Field | Design |
|---|---|
| Decision name | `zoho.download.pdf_detection_decision` |
| Input context | Chrome download item filename, URL, MIME, active tab URL. |
| Options considered | Treat as PDF; ignore as non-PDF; wait for more metadata. |
| Chosen action | Create pending mapping only when evidence indicates PDF. |
| Reason | Avoid missing actas and avoid false positives. |
| Expected condition | PDF downloads from Zoho produce pending cards. |
| Risk | Filename/MIME variations can hide real PDFs. |
| Evidence to capture | Filename, URL host/path summary, MIME, detection rule matched. |

### 5. Zoho task URL resolution decision

| Field | Design |
|---|---|
| Decision name | `zoho.task_url.resolve_decision` |
| Input context | Active tab URL, download URL, parsed Zoho path/query, module, parent ID, current Zoho tabs if available. |
| Options considered | Direct Case URL; ViewAttachment parent URL; reject no task; choose active tab; search open Zoho tabs later. |
| Chosen action | Resolve to canonical Case URL or reject mapping. |
| Reason | Correct mapping depends on correct Case URL. |
| Expected condition | Resolved URL points to the Case associated with the downloaded PDF. |
| Risk | Active tab may not be the originating Zoho case. |
| Evidence to capture | Active tab ID/URL/title, resolved URL, rejected alternatives. |

### 6. Mapping import decision

| Field | Design |
|---|---|
| Decision name | `zoho.mapping.import_decision` |
| Input context | Pending mapping, Chrome local save result, Python API availability, filename/job match. |
| Options considered | Import now; save local only and mark pending import; reject. |
| Chosen action | Save local and import to Python; if import fails, keep visible retry state. |
| Reason | User should not lose mapping when Python is down. |
| Expected condition | Python job has `zoho_url` after confirmation. |
| Risk | Local mapping exists but Python job remains unmapped. |
| Evidence to capture | Mapping payload summary, API status, job before/after. |

### 7. Conversion precondition decision

| Field | Design |
|---|---|
| Decision name | `conversion.precondition_decision` |
| Input context | Job snapshot, `pdf_id`, `pdf_path`, file existence, agent connected state, bridge state. |
| Options considered | Start conversion; reject missing PDF; reject missing agent; reject invalid job. |
| Chosen action | Only dispatch command when required fields and agent are valid. |
| Reason | Prevent stuck jobs caused by invalid input. |
| Expected condition | Command dispatch has a valid file and reachable agent. |
| Risk | Job moves to queued even though conversion cannot run. |
| Evidence to capture | Job snapshot, file metadata, agent snapshot, validation failures. |

### 8. WebSocket command wait decision

| Field | Design |
|---|---|
| Decision name | `ws.command.response_decision` |
| Input context | Request ID, expected actions, timeout, received action, reply ID, connection state. |
| Options considered | Accept ACK/status; reject unexpected response; timeout; mark stale agent. |
| Chosen action | Accept only matching expected response or fail with detailed timeout. |
| Reason | Distinguishes command delivery from automation success. |
| Expected condition | ACK arrives quickly; final status arrives later by workflow events. |
| Risk | ACK success can hide later browser failure. |
| Evidence to capture | Sent payload summary, response payload summary, connection history, timeout deadline. |

### 9. Flow step precondition decision

| Field | Design |
|---|---|
| Decision name | `flow.step.precondition_decision` |
| Input context | Flow definition, step requires list, job snapshot, agent state. |
| Options considered | Run step; skip optional step; fail step; fail flow. |
| Chosen action | Fail required step if fields/agent missing. |
| Reason | Flow should not start invalid browser automation. |
| Expected condition | Required fields exist before command. |
| Risk | Flow error may not indicate which field was missing. |
| Evidence to capture | Step definition, required fields, missing fields, job snapshot. |

### 10. iLovePDF tab reuse/create decision

| Field | Design |
|---|---|
| Decision name | `ilovepdf.tab.selection_decision` |
| Input context | Existing tabs, URLs, active conversion, required URL, current job. |
| Options considered | Reuse existing iLovePDF tab; create new tab; reload; fail. |
| Chosen action | Reuse only valid iLovePDF tab or create new one. |
| Reason | Wrong tab causes content-script and download tracking failures. |
| Expected condition | Selected tab is on iLovePDF and can receive content messages. |
| Risk | Message sent to wrong or closed tab. |
| Evidence to capture | Candidate tabs, selected tab ID/URL/title, reason rejected tabs were skipped. |

### 11. Content-script readiness decision

| Field | Design |
|---|---|
| Decision name | `content.ready.decision` |
| Input context | Tab ID, URL, ping attempts, response/errors, reload attempts, page status. |
| Options considered | Continue; retry; reload tab; fail. |
| Chosen action | Continue only after content script responds ready. |
| Reason | DOM automation cannot run without content script. |
| Expected condition | Content script responds to PING within retry budget. |
| Risk | Chrome message channel errors can be mistaken for page failure. |
| Evidence to capture | Attempt count, error messages, tab URL, reload result. |

### 12. Selector/fallback decision

| Field | Design |
|---|---|
| Decision name | `selector.match_decision` |
| Input context | Selector name, configured selectors, fallback selectors, page URL, match counts, visibility, disabled state. |
| Options considered | Use primary selector; use fallback; fail selector; wait/retry. |
| Chosen action | Use visible actionable element or fail with evidence. |
| Reason | Third-party DOM changes are a primary failure surface. |
| Expected condition | Exactly one or at least one valid actionable element exists. |
| Risk | Wrong element clicked; hidden element selected; broken selector hidden by fallback. |
| Evidence to capture | Selector table, candidate elements, screenshot, compact DOM summary. |

### 13. Download matching decision

| Field | Design |
|---|---|
| Decision name | `download.match_decision` |
| Input context | Expected PDF filename stem, conversion start time, tab ID, download candidates, filenames, URLs, MIME, state. |
| Options considered | Accept candidate; reject wrong stem; reject wrong host; reject outside time window; reject wrong file type; timeout. |
| Chosen action | Match only candidate satisfying rules and record rejected candidates. |
| Reason | Prevent wrong Excel file from being attached to a job. |
| Expected condition | One completed spreadsheet-like download from iLovePDF matches this job. |
| Risk | Unrelated downloads or filename changes cause false match/miss. |
| Evidence to capture | Candidate table with accept/reject reasons, matched ID, final filename/path. |

### 14. Final status resolution decision

| Field | Design |
|---|---|
| Decision name | `conversion.status.resolve_decision` |
| Input context | Incoming `CONVERSION_STATUS`, `jobId`, `pdfId`, current job/PDF state, request trace. |
| Options considered | Update matching job/PDF; reject unmatched PDF; reject unmatched job; mark conflict; create recovery event. |
| Chosen action | Update exact matching job/PDF and record output evidence. |
| Reason | Prevent status from updating the wrong job or leaving inconsistent state. |
| Expected condition | Job/PDF IDs match existing state and transition is valid. |
| Risk | Final status missing or mismatched causes stale jobs. |
| Evidence to capture | Incoming payload summary, resolved entities, before/after state, conflict markers. |

### 15. Diagnostic export compaction decision

| Field | Design |
|---|---|
| Decision name | `diagnostic.export.compaction_decision` |
| Input context | Event count, evidence count, file sizes, trace/job IDs, failure severity. |
| Options considered | Include all; include relevant subset; summarize old repeated events; exclude large payloads. |
| Chosen action | Include all critical causal events; summarize repetitive non-critical events. |
| Reason | Avoid 10 MB+ logs while preserving root cause. |
| Expected condition | AI agent can diagnose without reading raw massive logs. |
| Risk | Over-compaction hides root cause. |
| Evidence to capture | Truncation counts, omitted categories, reason for omission, path to full raw logs if available. |

---

# 7. Evidence capture design

## 7.1 Required evidence types

### 1. Screenshots

Required on browser automation failure.

Capture when:

- content script is not ready after retries,
- upload input cannot be found,
- convert button cannot be found,
- download page timeout occurs,
- download button cannot be found,
- download tracking times out,
- unexpected iLovePDF URL/page state occurs.

Recommended file path:

```text
evidence/screenshots/{trace_id}/{phase}_{tab_id}_{timestamp}.png
```

Do not capture screenshots for every routine success in the minimum layer.

### 2. Compact DOM snapshots

Required on browser automation failure.

Capture:

- URL,
- title,
- document ready state,
- body text excerpt,
- forms summary,
- file inputs summary,
- buttons/links summary,
- selector match table,
- visible candidate elements,
- modal/dialog summary if detectable.

Avoid full HTML by default.

Recommended file path:

```text
evidence/dom/{trace_id}/{phase}_{tab_id}_{timestamp}.json
```

### 3. Selector diagnostics

Required for iLovePDF automation.

Each selector check should record:

- selector name,
- configured selector value,
- fallback selector value if used,
- match count,
- visible count,
- disabled count,
- chosen element summary,
- rejection reason if failed.

### 4. WebSocket message envelopes

Required.

Capture:

- action type,
- request ID,
- reply ID,
- agent ID/type,
- connection ID,
- runtime instance ID,
- payload keys and safe summaries,
- expected response actions,
- timeout,
- response time,
- close code/reason if failed.

Do not log full large blobs.

### 5. HTTP request/response summaries

Required for key endpoints.

Capture:

- method,
- path template,
- status,
- duration,
- request ID,
- trace ID,
- job/pdf/flow IDs,
- safe body keys,
- validation result,
- response summary,
- exception stack if failed.

Do not capture PDF file content.

### 6. File metadata

Required.

For input PDFs:

- `pdf_id`,
- filename,
- absolute path,
- existence,
- size,
- modified time,
- optional hash prefix,
- scan time,
- serve time.

For output Excel downloads:

- Chrome download ID,
- final filename,
- final URL host/path summary,
- MIME if available,
- file extension,
- state,
- interrupt reason,
- final local path if available,
- existence/size if accessible.

Do not include full PDF or Excel files by default.

### 7. Configuration snapshots

Required in diagnostic packages.

Include:

- Python HTTP/WS host and ports,
- state file path,
- current PDF folder,
- flow definitions relevant to the job,
- extension manifest version,
- iLovePDF bridge URL/API base URL,
- selector configuration for iLovePDF,
- timing constants/retry limits,
- Chrome extension permissions relevant to downloads/tabs/storage/side panel,
- environment info: OS, Python version, dependency versions, Chrome/extension version if available.

### 8. State snapshots

Required in diagnostic packages.

Include filtered state only:

- target job,
- target PDF,
- target flow run,
- recent related events,
- agent registry snapshot,
- bridge state,
- runtime queue snapshot if available,
- relevant Chrome pending mapping if Zoho mapping issue,
- state file metadata.

Avoid dumping entire state if large.

### 9. Error stack traces

Required.

Capture for:

- Python exceptions,
- HTTP handler failures,
- state load/save failures,
- WebSocket parse/send failures,
- extension bootstrap/import failures,
- Chrome API promise/callback errors,
- content-script exceptions,
- DOM automation exceptions.

### 10. Chrome download candidate table

Required when download tracking is active or fails.

Each candidate should record:

- download ID,
- filename,
- final URL host/path summary,
- referrer if safe,
- tab ID if available,
- MIME/extension,
- state,
- start time/end time,
- accept/reject reason.

## 7.2 Optional evidence types

- Full DOM HTML on explicit debug mode only.
- Full raw event stream archive if compact export references it.
- Video recording of browser automation, later only if needed.
- Performance timings for dashboard trends.
- OpenTelemetry spans for external visualization.

## 7.3 Unnecessary or risky evidence by default

- Full PDF files.
- Full Excel files.
- Full page HTML from Zoho CRM.
- Full Chrome storage dumps.
- Browser cookies, tokens, auth headers, or personal data.
- Every console log line without filtering.

## 7.4 Evidence capture timing

### Always capture as structured events

- State transitions.
- WebSocket command send/receive/timeout.
- HTTP validation failures.
- Flow step start/finish/fail.
- Agent connect/disconnect/stale.
- Download candidate accept/reject.

### Capture richer evidence only on failure

- Screenshot.
- DOM summary.
- Selector table.
- Tab list snapshot.
- Runtime queue snapshot.
- State conflict snapshot.

### Capture compact snapshots at phase boundaries

Recommended for:

- before WebSocket command send,
- after ACK,
- before upload,
- before convert button click,
- before download click,
- after download completion,
- before final state persistence.

---

# 8. Diagnostic package design

## 8.1 Export unit

The main export unit should be:

- primary: `job_id`,
- secondary: `flow_run_id`,
- tertiary: `trace_id`.

Recommended future endpoints/commands:

```text
GET /api/jobs/{job_id}/diagnostic-package
GET /api/flows/{flow_run_id}/diagnostic-package
GET /api/traces/{trace_id}/diagnostic-package
```

For the first implementation, one endpoint or local export command for `job_id` is enough.

## 8.2 Package structure

Recommended ZIP or folder structure:

```text
diagnostics/
  {diagnostic_export_id}/
    README.md
    manifest.json
    summary.md
    root_cause_hypotheses.md
    reproduction.md

    timeline/
      timeline.jsonl
      timeline.compact.md
      missing_events.json

    state/
      job.json
      pdf.json
      flow_run.json
      relevant_state_snapshot.json
      state_file_metadata.json
      agent_registry_snapshot.json
      bridge_snapshot.json
      runtime_queue_snapshot.json
      sidepanel_snapshot.json
      zoho_mapping_snapshot.json

    transitions/
      state_transitions.jsonl
      invalid_transitions.jsonl
      conflicts.jsonl

    decisions/
      decisions.jsonl
      decision_summary.md

    communication/
      http_events.jsonl
      websocket_events.jsonl
      chrome_message_events.jsonl
      chrome_download_events.jsonl

    evidence/
      screenshots/
      dom_snapshots/
      selector_diagnostics.jsonl
      download_candidates.jsonl
      file_metadata.json
      errors.jsonl
      stack_traces/

    config/
      backend_config.json
      flow_definition.json
      extension_manifest_summary.json
      ilovepdf_config.json
      selector_profile.json
      timing_constants.json
      environment.json

    harness/
      latest_harness_results.json
      suggested_reproduction_commands.md

    git/
      git_context.md
      changed_files.txt
      diff_stat.txt
```

## 8.3 File descriptions

### `README.md`

Human-readable entry point:

- export ID,
- generated timestamp,
- repository/branch if available,
- job ID,
- PDF ID,
- flow run ID,
- trace ID,
- failure status,
- where to start reading.

### `manifest.json`

Machine-readable package manifest:

- schema version,
- export version,
- included files,
- omitted files/reasons,
- redaction settings,
- event counts,
- evidence counts,
- time range.

### `summary.md`

Concise AI-ready summary:

- what the user attempted,
- final observed status,
- last successful event,
- first failing event,
- likely failure category,
- key evidence paths,
- recommended next debugging target.

### `root_cause_hypotheses.md`

Ranked hypotheses generated from evidence, not guesses:

- hypothesis,
- supporting evidence,
- contradicting evidence,
- next check.

### `reproduction.md`

Steps to reproduce using actual job context:

- required preconditions,
- PDF metadata,
- agent state,
- iLovePDF URL/phase,
- commands/harnesses to run,
- expected vs actual result.

### `timeline/timeline.jsonl`

Full compact event timeline for this job/trace:

- sorted by timestamp and monotonic time,
- includes Python and extension events,
- includes warnings/errors,
- includes state transitions and decisions by reference.

### `timeline/timeline.compact.md`

Human-friendly narrative timeline:

```text
00:00.000 user.action.clicked convert job_x
00:00.030 http.request.received /api/jobs/{job_id}/actions/convert-pdf
00:00.050 conversion.validation.succeeded
00:00.070 ws.command.sent CONVERT_PDF request req_x
00:00.180 ws.command.acknowledged CONVERT_PDF_ACK
00:00.250 runtime.queue.enqueued
...
02:00.000 download.timeout
```

### `timeline/missing_events.json`

Automatically detected expected events that never appeared:

- expected event,
- reason it was expected,
- timeout threshold,
- last known preceding event.

Example:

```json
{
  "expected_event": "conversion.completed",
  "after_event": "download.tracker.started",
  "missing_after_ms": 120000,
  "likely_surface": "download_tracker_or_download_button"
}
```

### `state/*.json`

Relevant state snapshots only:

- target job,
- target PDF,
- target flow run,
- registry/bridge/runtime states,
- state file metadata,
- current folder,
- pending Zoho mapping if relevant.

### `transitions/*.jsonl`

State transition ledger filtered to this job/trace.

Must include:

- `state_machine`,
- entity ID,
- from,
- to,
- reason,
- expected,
- actual,
- component.

### `decisions/*.jsonl`

Decision records filtered to this job/trace.

Must include the high-impact decisions described in section 6.

### `communication/*.jsonl`

Separated communication evidence:

- HTTP requests/responses,
- WebSocket messages,
- Chrome runtime/tabs messages,
- Chrome download events.

### `evidence/screenshots/`

Screenshots captured on browser automation failures.

### `evidence/dom_snapshots/`

Compact DOM summaries captured on browser automation failures.

### `evidence/selector_diagnostics.jsonl`

Selector checks for upload input, convert button, download button, fallback use, and candidate elements.

### `evidence/download_candidates.jsonl`

Download candidate evaluation table with accept/reject reasons.

### `evidence/file_metadata.json`

Input/output file evidence.

### `config/*.json`

Config and environment snapshot needed to reproduce.

### `harness/*`

Latest harness results and suggested reproduction commands.

### `git/*`

Optional but useful for AI debugging:

- branch,
- latest commit,
- changed files,
- diff stat,
- relevant uncommitted changes if available.

## 8.4 Diagnostic package quality rules

### Required

- Must be readable without internet access.
- Must include enough context to diagnose one job/flow.
- Must include expected-vs-actual at the first failure point.
- Must clearly mark missing evidence.
- Must not exceed reasonable size by default.
- Must avoid full file payloads and sensitive raw page data by default.

### Optional

- Include raw logs as compressed secondary artifact.
- Include full DOM or video only in explicit debug mode.

---

# 9. Documentation design

## 9.1 Required documentation files

The following docs should be created or updated before implementation.

### `docs/observability/observability.md`

Purpose:

- The main user-facing overview of how observability works in AutoHom v2.

Should include:

- goals,
- architecture layers,
- event schema overview,
- diagnostic package workflow,
- required vs optional evidence,
- how to export diagnostics,
- privacy/safety notes.

### `docs/observability/event_schema.md`

Purpose:

- Define the shared event envelope used by Python and extension code.

Should include:

- required fields,
- optional fields,
- examples for Python HTTP event,
- WebSocket command event,
- extension runtime event,
- selector failure event,
- download candidate event,
- state transition event,
- decision event.

### `docs/observability/state_machines.md`

Purpose:

- Define allowed states and transitions.

Should include:

- backend readiness,
- job conversion,
- flow run,
- agent connection,
- runtime queue,
- tab/content script,
- download tracker,
- PDF/file,
- Zoho mapping,
- invalid transition policy.

### `docs/observability/contracts.md`

Purpose:

- Define component contracts between Python, extension, content scripts, and browser APIs.

Should include:

- HTTP API diagnostic contract,
- WebSocket message contract,
- `CONVERT_PDF` payload contract,
- `CONVERT_PDF_ACK` payload contract,
- `CONVERSION_STATUS` payload contract,
- content-script message contract,
- download tracker evidence contract,
- state transition contract.

### `docs/observability/diagnostic_export.md`

Purpose:

- Define the diagnostic package structure.

Should include:

- export units,
- folder layout,
- file formats,
- size limits,
- redaction rules,
- examples,
- how an AI agent should read the package.

### `docs/observability/testing_harness.md`

Purpose:

- Define how to reproduce critical workflows and failures.

Should include:

- backend startup harness,
- WebSocket mock agent harness,
- flow harness,
- scanner/file harness,
- download tracker harness,
- DOM selector harness,
- side panel API failure harness,
- manual browser failure checklist.

### `docs/observability/implementation_roadmap.md`

Purpose:

- Phase-by-phase plan for the coding agent.

Should include:

- Phase 1 minimum viable schema and emitters,
- Phase 2 state transitions,
- Phase 3 browser evidence,
- Phase 4 diagnostic exports,
- Phase 5 harnesses,
- Phase 6 optional metrics/OpenTelemetry.

## 9.2 Optional documentation files

### `docs/architecture.md`

Optional because `project_understanding.md` already exists. Create only if the project needs a stable non-observability architecture document.

### `docs/diagnostics/playbooks.md`

Useful later for common failures:

- agent disconnected,
- job stuck queued,
- selector broken,
- download timeout,
- state reset,
- Zoho mapping missing.

### `docs/observability/privacy_and_redaction.md`

Useful if diagnostic packages may be shared externally.

## 9.3 Unnecessary documentation now

- Large vendor-specific OpenTelemetry manual.
- Cloud observability runbook.
- Multi-user analytics documentation.
- Kubernetes/deployment monitoring docs.

---

# 10. Test harness design

## 10.1 Harness strategy

AutoHom v2 needs a layered harness strategy. Not every failure should require manually opening Zoho and iLovePDF.

The harnesses should reproduce failures at the smallest possible boundary:

1. Python-only harnesses for state, files, HTTP, flows.
2. WebSocket mock-agent harnesses for protocol and timeouts.
3. Chrome-extension harnesses for bridge/runtime queue logic.
4. DOM fixture harnesses for iLovePDF selectors.
5. Download tracker harnesses using synthetic Chrome download events where possible.
6. End-to-end manual/headed harness for the real browser and iLovePDF.

## 10.2 Required harnesses for minimum viable observability

### 1. Backend startup harness

Purpose:

- Verify startup readiness and failure evidence.

Scenarios:

- ports available,
- HTTP port occupied,
- WS port occupied,
- missing/corrupt `state.json`,
- read-only state path,
- invalid `flows.json`.

Expected evidence:

- `process.started`,
- `state.load.*`,
- `ws.server.*`,
- `http.server.*`,
- config snapshot,
- stack traces on failure.

### 2. State transition harness

Purpose:

- Ensure job/PDF/flow transitions are valid and logged.

Scenarios:

- normal conversion transitions,
- invalid transition attempt,
- completed job receives late error,
- flow timeout then late conversion completion,
- state save failure.

Expected evidence:

- `state.transition`,
- `state.invalid_transition`,
- `state.conflict_detected`,
- before/after snapshots.

### 3. HTTP API harness

Purpose:

- Verify key endpoint observability.

Scenarios:

- convert valid job,
- convert job missing PDF,
- convert with agent disconnected,
- import Zoho mapping,
- scan invalid folder,
- serve missing PDF,
- request diagnostics.

Expected evidence:

- request/response events,
- validation decision logs,
- job/PDF evidence.

### 4. WebSocket mock-agent harness

Purpose:

- Reproduce protocol failures without Chrome.

Scenarios:

- valid handshake,
- malformed handshake,
- duplicate runtime,
- ACK success,
- delayed ACK timeout,
- unexpected response action,
- final `CONVERSION_STATUS` with wrong `jobId`/`pdfId`,
- socket closes after command sent.

Expected evidence:

- connection ID,
- runtime instance ID,
- command/response pairing,
- timeouts,
- stale/disconnect events.

### 5. Flow orchestrator harness

Purpose:

- Test `pdf_to_excel` flow behavior.

Scenarios:

- missing flow ID,
- missing required fields,
- agent not connected,
- command timeout,
- conversion completes before wait timeout,
- conversion completes after wait timeout.

Expected evidence:

- flow step events,
- precondition decisions,
- timeout/conflict events.

### 6. File scanner and serve harness

Purpose:

- Verify PDF lifecycle evidence.

Scenarios:

- valid folder with PDFs,
- empty folder,
- invalid folder,
- file deleted after scan,
- same filename in different folders,
- read permission failure.

Expected evidence:

- scan summary,
- file metadata,
- PDF ID collision detection,
- file missing state transition.

## 10.3 Required harnesses after minimum viable layer

### 7. DOM selector fixture harness

Purpose:

- Test iLovePDF selector logic without real iLovePDF.

Approach:

- Use local static HTML fixtures representing:
  - normal upload page,
  - upload page with changed input selector,
  - convert button missing,
  - convert button hidden/disabled,
  - download page normal,
  - download button missing,
  - modal overlay blocking button.

Expected evidence:

- selector diagnostics,
- fallback decision logs,
- compact DOM snapshots.

### 8. Extension runtime queue harness

Purpose:

- Test queue, active job, and final status delivery logic.

Scenarios:

- single conversion success,
- two conversions queued,
- runtime error after ACK,
- service worker restart simulation,
- status delivery failure when WebSocket closed,
- tracker replacement guard.

Expected evidence:

- runtime queue state,
- current job/PDF,
- concurrency guard events,
- final status delivery events.

### 9. Download tracker harness

Purpose:

- Test candidate evaluation and matching.

Scenarios:

- correct Excel download,
- unrelated download during conversion,
- expected filename changed,
- interrupted download,
- timeout,
- tracker replaced.

Expected evidence:

- candidate table,
- accept/reject reasons,
- matched download ID,
- timeout evidence.

### 10. Side panel API failure harness

Purpose:

- Ensure UI does not hide backend failure.

Scenarios:

- Python stopped,
- `/api/jobs` fails while other endpoints succeed,
- stale job ID action,
- invalid JSON response,
- slow endpoint.

Expected evidence:

- refresh batch ID,
- endpoint-level failures,
- previous vs new render state,
- backend disconnected marker.

## 10.4 Optional mature harnesses

- Headed end-to-end Chrome extension harness with real iLovePDF.
- Visual regression harness for side panel.
- Browser automation replay harness from diagnostic package.
- Synthetic slow-network harness.
- Long-run soak test with repeated conversions and service-worker restarts.

---

# 11. Minimum viable observability layer

## 11.1 Goal

Implement the smallest professional observability layer that can diagnose the most common and highest-risk AutoHom v2 failures without overengineering.

The first version should answer:

- Which job/PDF/flow failed?
- What started it?
- Which phase was last successful?
- What was expected next?
- Which component failed?
- Was the agent connected?
- Did WebSocket command/ACK happen?
- Did runtime queue start?
- Was the iLovePDF tab/content script ready?
- Did selector/file/download evidence exist?
- Was state updated/persisted?

## 11.2 Required MVO components

### 1. Shared event schema

Create a small shared schema spec and implement emitters:

- Python event emitter.
- Extension event emitter.
- Event severity and categories.
- JSONL local storage for events.
- Existing `JobStore` event integration.

### 2. Correlation IDs

Implement and propagate:

- `trace_id`,
- `job_id`,
- `pdf_id`,
- `flow_id`,
- `flow_run_id`,
- `user_action_id`,
- `request_id`,
- `connection_id`,
- `runtime_instance_id`,
- `agent_id`,
- `tab_id`,
- `download_id`.

Do not add generic `task_id` or duplicate `correlation_id` unless needed for compatibility.

### 3. State transition ledger

Implement `state.transition` and `state.invalid_transition` for:

- job conversion,
- flow run,
- agent connection,
- runtime queue,
- tab/content readiness,
- download tracker,
- PDF/file,
- Zoho mapping.

### 4. WebSocket protocol observability

Required first because it is a core boundary.

Capture:

- connection open/close/error,
- handshake received/sent,
- registration accepted/rejected,
- duplicate runtime,
- PING/PONG,
- command sent,
- ACK received,
- timeout,
- unexpected response,
- final status received.

### 5. Conversion trace

Implement the end-to-end trace for:

```text
sidepanel click -> HTTP convert endpoint -> job queued -> WS command -> ACK -> runtime queue -> tab/content -> upload -> convert -> download -> final status -> state update
```

### 6. Failure evidence capture for iLovePDF

Implement on-failure evidence only:

- screenshot,
- compact DOM summary,
- selector diagnostics,
- current URL/title/ready state,
- tab ID,
- content-script error.

### 7. Download tracker evidence

Capture candidate evaluation and final match/timeout.

### 8. File metadata evidence

Capture PDF file metadata during scan, before serve, and when serve fails.

### 9. Basic diagnostic package export

Implement export by `job_id`:

```text
GET /api/jobs/{job_id}/diagnostic-package
```

or a local command/script if easier for the first version.

Minimum package files:

```text
README.md
summary.md
manifest.json
timeline.jsonl
state/job.json
state/pdf.json
state/flow_run.json
state/agent_registry_snapshot.json
transitions/state_transitions.jsonl
decisions/decisions.jsonl
communication/websocket_events.jsonl
communication/http_events.jsonl
evidence/selector_diagnostics.jsonl
evidence/download_candidates.jsonl
evidence/file_metadata.json
config/environment.json
config/flow_definition.json
```

Screenshots/DOM snapshots should be included if captured.

### 10. MVO harnesses

Implement at least:

- WebSocket mock-agent harness.
- HTTP convert precondition harness.
- state transition harness.
- file scanner/serve missing file harness.
- flow timeout harness.

## 11.3 Explicitly optional in MVO

- OpenTelemetry exporter.
- external dashboard,
- long-term metrics,
- video recording,
- full DOM capture,
- full raw logs archive,
- real iLovePDF automated E2E harness.

## 11.4 Explicitly unnecessary in MVO

- Cloud logging service.
- Kubernetes-style monitoring.
- Multi-user audit logging.
- LLM-agent internal reasoning logs.
- Capturing complete PDFs/Excel files in diagnostics.

## 11.5 Suggested MVO implementation phases for another AI agent

### Phase 1 — Schema and emitters

- Add `docs/observability/event_schema.md`.
- Create Python event utility.
- Create extension event utility.
- Ensure events can be written locally and attached to job events.

### Phase 2 — Correlation and core traces

- Generate/propagate `trace_id`, `user_action_id`, `request_id`.
- Add correlation to side panel, HTTP endpoints, WebSocket commands, and extension ACK/status.

### Phase 3 — State transitions

- Add state transition helpers.
- Instrument job conversion, flow run, agent, runtime queue, tab/content, download tracker, PDF/file.

### Phase 4 — Failure evidence

- Add screenshot/DOM/selector diagnostics for iLovePDF failures.
- Add download candidate evidence.
- Add file metadata evidence.

### Phase 5 — Diagnostic export

- Build export by `job_id`.
- Include timeline, transitions, decisions, evidence, state, config.
- Add compact summary and missing-event detection.

### Phase 6 — Harnesses

- Add protocol and state harnesses.
- Add scanner/serve missing file harness.
- Add flow timeout harness.

---

# 12. Full observability layer

## 12.1 Mature target

A mature AutoHom v2 observability layer should provide:

1. A complete trace per job/flow run.
2. Explicit state machines with invalid-transition enforcement or warnings.
3. Rich browser evidence on failure.
4. Diagnostic package export usable by an AI agent.
5. Reproducible harnesses for protocol, state, file, DOM, download, and UI refresh failures.
6. Optional dashboards/metrics for long-term health.
7. Optional OpenTelemetry-compatible output.

## 12.2 Mature capabilities

### Full trace explorer

A local UI or endpoint that shows:

- timeline,
- state transitions,
- decisions,
- communication messages,
- evidence links,
- missing expected events,
- root-cause category.

### State-machine validation

Add automated checks:

- invalid transitions,
- missing expected next event,
- late completion after timeout,
- output recorded without download evidence,
- agent connected but stale,
- flow/job status conflict.

### AI-ready diagnostic summaries

Automatically generate:

- “last known good phase”,
- “first bad phase”,
- “expected vs actual”,
- “likely component”,
- “evidence supporting this conclusion”,
- “suggested reproduction harness”.

### Browser evidence maturity

Add:

- screenshot before important clicks in debug mode,
- DOM fixture comparison,
- selector profile versioning,
- selector regression tests,
- modal/overlay detection,
- page language/layout detection.

### Download evidence maturity

Add:

- stronger final path verification,
- output hash/size evidence,
- candidate scoring,
- mismatch explanations,
- retry/recovery rules for safe cases.

### Harness maturity

Add:

- headed Chrome extension E2E harness,
- synthetic iLovePDF fixture pages,
- download event simulator,
- service-worker restart simulator,
- repeated conversion soak test,
- side panel visual/interaction tests.

### Metrics maturity

Useful later metrics:

- conversion success rate,
- average conversion duration,
- WebSocket reconnect count,
- command timeout count,
- selector failure count,
- download timeout count,
- state save failure count,
- side panel backend disconnect count,
- Zoho import failure count.

### OpenTelemetry maturity

Optional mapping:

- `trace_id` -> OTel trace ID,
- workflow phases -> spans,
- events -> span events,
- state transitions -> events/logs,
- metrics -> OTel metrics.

Keep this optional until the internal event model is stable.

## 12.3 What should remain intentionally simple

Even in the mature version, avoid overengineering:

- Keep local-first storage.
- Keep per-job exports compact.
- Avoid forcing every function into a span.
- Avoid storing huge raw logs by default.
- Avoid capturing sensitive full browser/CRM content unless explicitly enabled.
- Avoid introducing external infrastructure unless the local diagnostic package becomes insufficient.

---

# Final implementation guidance for the next AI agent

The next AI agent should implement this architecture phase by phase, starting with the minimum viable layer.

## Required first deliverables

1. `docs/observability/event_schema.md`
2. `docs/observability/state_machines.md`
3. Python event emitter.
4. Extension event emitter.
5. Correlation ID propagation from side panel to Python to WebSocket to extension runtime.
6. State transition events for conversion, flow, agent, runtime, tab/content, download, PDF/file.
7. WebSocket command/ACK/status observability.
8. Failure evidence capture for iLovePDF selector/content/download failures.
9. Job diagnostic package export.
10. WebSocket mock-agent harness and state/file harnesses.

## Required implementation discipline

- Do not add noisy logs everywhere.
- Every event must answer a diagnostic question.
- Every event should include correlation IDs when available.
- Every failure should include expected vs actual.
- Every state mutation should explain why it happened.
- Evidence should be compact by default.
- Diagnostic exports should be readable by another AI agent without requiring huge context windows.

## Success criteria

The observability implementation is successful when a failed conversion can be diagnosed from a package that clearly shows:

1. the user action or event that started it,
2. the involved job/PDF/flow/agent/tab/download IDs,
3. the complete timeline,
4. all state transitions,
5. the first missing or invalid expected event,
6. key decisions and reasons,
7. browser/download/file evidence,
8. final root-cause hypothesis,
9. reproducible harness or manual steps,
10. and the smallest likely code area to fix.
