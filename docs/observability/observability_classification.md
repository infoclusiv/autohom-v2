# Observability Classification for AutoHom v2

Repository: `infoclusiv/autohom-v2`  
Branch reviewed: `main`  
Required input read: `docs/observability/project_understanding.md`  
Output artifact: `observability_classification.md`  
Scope: classification only. No application code was modified.

---

## Executive classification

AutoHom v2 does **not** need a generic logging layer as its primary observability architecture.

This project needs a **hybrid observability architecture** centered on:

1. **Workflow-based observability** for end-to-end job and flow runs.
2. **State-machine observability** for job status, flow status, agent connection status, queue state, tab state, download state, and file state.
3. **Event-driven observability** for WebSocket messages, Chrome extension events, Chrome downloads events, runtime queue events, and side-panel initiated actions.
4. **Browser/UI evidence observability** for fragile third-party browser automation on iLovePDF and Zoho CRM.
5. **Data/file-pipeline observability** for local PDFs, generated Excel downloads, local file paths, scan results, and state persistence.
6. **Light request-based observability** for the local HTTP API, but only as one layer inside the larger workflow trace.

The correct mental model is:

> AutoHom v2 is a local multi-component automation orchestrator where a user-triggered job moves through Python state, local HTTP requests, WebSocket commands, Chrome extension background logic, content-script DOM automation, Chrome downloads, and local filesystem state.

Therefore, the most important debugging artifact should be a **single AI-ready diagnostic package per job / flow run**, not a pile of disconnected logs.

---

## Evidence baseline

This classification is based on the project-understanding document and repository files, especially:

- `docs/observability/project_understanding.md`
- `README.md`
- `app-python-zoho/app.py`
- `app-python-zoho/config.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/pdf_scanner.py`
- `app-python-zoho/flows/flows.json`
- `autohom-extension/manifest.json`
- `autohom-extension/background-main.js`
- `autohom-extension/background-zoho.js`
- `autohom-extension/sidepanel.js`
- `autohom-extension/ilovepdf/config.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf-background/router.js`

---

# 1. Execution model classification

## Summary

AutoHom v2 is a **local, long-running, UI-driven, browser-automation workflow system** with asynchronous events, background workers, WebSocket coordination, and file-processing steps.

It is not a simple synchronous request/response application.

| Execution model | Classification | Reasoning | Observability implication |
|---|---:|---|---|
| Synchronous request/response | Present, but secondary | The side panel calls local HTTP endpoints such as `/api/jobs`, `/api/config`, `/api/jobs/{job_id}/actions/convert-pdf`, `/api/jobs/{job_id}/flows/run`, and `/api/jobs/{job_id}/diagnostics`. These requests matter, but they only initiate or inspect larger workflows. | Capture HTTP request/response summaries, but correlate them to `job_id`, `flow_run_id`, `pdf_id`, and `trace_id`. Do not treat HTTP as the full unit of observability. |
| Asynchronous events | Primary | Chrome download events, Chrome tab events, WebSocket messages, service-worker reconnects, content-script messages, runtime queue events, and download-tracker events all happen asynchronously. | Use an append-only event timeline with monotonic timestamps and correlation IDs. |
| Long-running workflow | Primary | PDF conversion is not completed inside one HTTP request. A job can be queued, acknowledged, automated in-browser, moved to the download page, downloaded, reported back, and persisted. `FlowOrchestrator` can wait up to 180 seconds for conversion completion. | Model each job/flow as a traceable workflow run. Include elapsed time per phase, timeout boundaries, and last known phase. |
| Background jobs | Present | The Python WebSocket server runs in a daemon thread; flows run in daemon threads; the Chrome extension service worker runs in the background; the iLovePDF runtime keeps an in-memory conversion queue. | Capture thread/service-worker lifecycle, queue state, active job, reconnect attempts, and background failures. |
| UI-driven interactions | Present | The side panel triggers folder scans, job conversions, flow runs, mapping confirmations, and diagnostic viewing. | Record user action events from the side panel, including which button/action initiated a workflow. |
| Browser automation | Critical / primary | The iLovePDF workflow depends on Chrome tabs, content scripts, DOM selectors, upload inputs, conversion buttons, download pages, and Chrome downloads. Zoho mapping depends on Chrome active tab and download events. | Require browser evidence: selector checks, DOM snapshots, current URL, tab ID, screenshots on failure, content-script readiness status, and download state. |
| File-processing pipeline | Primary | Local PDFs are scanned, served by Python, uploaded into iLovePDF, and converted into Excel downloads. State persists local file paths and output file paths. | Capture file metadata, path existence, file size/hash where safe, PDF ID, expected output, actual output, and download confirmation. |
| AI-agent decision loop | Not currently present | The repository does not appear to contain runtime LLM calls or autonomous AI decision-making. AI-assisted debugging is a future goal, not the current runtime. | Do not build agent-memory/LLM-decision observability yet. However, build diagnostic exports that are AI-readable. |
| Real-time messaging | Present | Python and the extension coordinate through WebSocket messages such as `AGENT_CONNECTED`, `PING`, `PONG`, `CONVERT_PDF`, `CONVERT_PDF_ACK`, and `CONVERSION_STATUS`. | Capture WebSocket message envelopes, request IDs, reply IDs, expected responses, timeout results, and agent identity. |
| Multi-process orchestration | Primary | The system spans a Python process, an HTTP server, a WebSocket server thread, a Chrome extension service worker, content scripts, Chrome tabs, Chrome downloads, and third-party websites. | Use cross-component correlation. Every component must emit events that can be merged into one timeline. |
| Other: third-party website automation | Critical | iLovePDF and Zoho are external websites whose DOM, URLs, timing, and behavior can change independently of the application. | Capture external-site context: URL, page phase, selector profile version, selector match counts, page readiness, and failure screenshots. |

## Execution model conclusion

The required execution observability is **workflow-first and event-first**.

A good trace should answer:

- What user action started this job?
- Which PDF and Zoho mapping were involved?
- Which Python HTTP endpoint received the action?
- Which flow run was created?
- Which agent received the WebSocket command?
- Did the agent acknowledge the command?
- Was the conversion queued or already blocked by another conversion?
- Which tab was used?
- Was the content script ready?
- Was the PDF fetched from Python successfully?
- Which DOM selector failed or succeeded?
- Did the page reach `/descarga/`?
- Did Chrome confirm the expected Excel download?
- Was state persisted correctly?
- What was the last known good phase before failure?

---

# 2. State model classification

## Summary

AutoHom v2 is strongly **stateful**. It has persistent local JSON state, per-job state, per-flow-run state, per-agent connection state, per-session Chrome extension state, browser/DOM state, queue state, download state, and local filesystem state.

| State model | Classification | Reasoning | Observability implication |
|---|---:|---|---|
| Stateless | No | The backend persists `state.json`, tracks PDFs, jobs, flow runs, events, current folder, conversion status, and Excel paths. The extension also uses Chrome storage for mappings and session state. | Avoid purely stateless request logs. Debugging requires before/after state snapshots and transitions. |
| Stateful | Primary | `StateManager` persists folder, PDFs, jobs, flow runs, and events. `JobStore` updates job statuses and appends events. The extension runtime keeps queue and active conversion state. | Add state transition records with old value, new value, reason, component, and correlation IDs. |
| Workflow state machine | Present but currently implicit | Job statuses exist across domains such as `zoho`, `conversion`, `site2`, and `flow`. Flow runs have statuses. Runtime phases include queue, tab ready, content ready, uploading, converting, downloading, completed, and error. But the state machine is not yet explicit. | Make state transitions explicit. Define allowed states and invalid transitions for conversion, flow, agent, tab, and download. |
| Per-user state | Low / not primary | The app appears local and single-operator. There is no multi-user authentication or user account model in the inspected files. | Do not prioritize user identity observability. Use local operator/session metadata only if useful. |
| Per-session state | Present | Chrome `storage.session` stores pending downloads. WebSocket connections have connection IDs and runtime instance IDs. Service-worker lifecycle/reconnects affect behavior. | Track `session_id`, `runtime_instance_id`, `connection_id`, `service_worker_start_id`, and reconnect attempts. |
| Per-task state | Critical | Each PDF/job/flow has its own lifecycle. `job_id`, `pdf_id`, `flow_run_id`, and `download_id` are central debugging keys. | Every event should include `job_id` when available, plus `pdf_id`, `flow_run_id`, `step_id`, `agent_type`, and `request_id`. |
| External system state | Critical | Zoho page URL, iLovePDF page URL/phase, Chrome downloads state, and third-party DOM state all affect success. | Capture external state at decision points: active tab URL, resolved Zoho task URL, iLovePDF URL, download item state, selector availability. |
| Browser/DOM state | Critical | The automation depends on content script readiness, DOM selectors, input assignment, conversion button click, download button click, and page navigation to `/descarga/`. | On browser automation failures, collect DOM summary, selector diagnostics, current URL, document ready state, visible button candidates, and screenshot. |
| File system state | Critical | The backend scans local folders, serves local PDFs, checks file existence, and tracks output Excel downloads. | Record file path existence, filename, size, modified time, safe hash, resolved absolute path, and expected-vs-actual output file. |

## State model conclusion

The project needs **state-machine observability layered over workflow observability**.

The key state machines should be:

1. **Job state machine**
   - `zoho`: `not_mapped -> mapped`
   - `conversion`: `not_started -> pending -> queued -> starting -> uploading -> converting -> downloading -> completed | error`
   - `flow`: `idle -> running -> completed | error`
   - `site2`: `not_started -> queued -> uploading -> completed | error` when implemented

2. **Flow run state machine**
   - `started -> running -> step_started -> step_acknowledged -> waiting_for_completion -> completed | error | timeout`

3. **Agent connection state machine**
   - `disconnected -> socket_connected -> handshake_received -> connected -> stale -> pinging -> disconnected | duplicate_runtime | error`

4. **Runtime queue state machine**
   - `idle -> enqueued -> running -> waiting_tab -> waiting_content_script -> uploading -> converting -> waiting_download_page -> waiting_download -> completed | error`

5. **Tab/content-script state machine**
   - `no_tab -> tab_created | tab_reused -> tab_loading -> page_complete -> content_ready | content_not_ready -> reloaded -> content_ready | failed`

6. **Download tracker state machine**
   - `not_tracking -> tracking_started -> download_matched -> complete | interrupted | timeout | replaced | cancelled`

7. **File state machine**
   - `folder_configured -> scanned -> pdf_registered -> file_served -> uploaded -> output_detected -> excel_path_recorded`

---

# 3. Communication model classification

## Summary

AutoHom v2 communicates through local function calls, local HTTP, WebSockets, Chrome extension messages, Chrome APIs, local file I/O, and third-party browser UI interactions.

| Communication model | Classification | Reasoning | Observability implication |
|---|---:|---|---|
| Function calls | Present | Python components call each other directly: HTTP handlers call `JobStore`, `StateManager`, `FlowOrchestrator`, and `MultiAgentWebSocketServer`. Extension modules also call each other directly. | Internal function logs should not be noisy. Capture important domain events and state transitions instead. |
| HTTP APIs | Important | Side panel communicates with Python via local HTTP. The iLovePDF content/runtime also calls Python endpoints to fetch PDF files and update PDF status. | Capture endpoint, method, status code, duration, request size, response summary, and correlation IDs. Avoid logging full PDF contents. |
| WebSockets | Critical | Python sends conversion commands to extension agents and receives acknowledgements/status updates. Request/reply timing is critical. | Capture message type, request ID, reply ID, agent type, payload summary, send timestamp, receive timestamp, timeout, and unexpected action. |
| Message queues | No external broker; internal queue present | There is no external queue like RabbitMQ/Redis, but `ILovePDFRuntime` has an in-memory conversion queue. | Treat the runtime queue as observable state: enqueue, dequeue, queue length, active job, replacement/cancel conditions. |
| Browser extension messages | Critical | Background scripts and content scripts communicate through `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`. Side panel receives progress and mapping events. | Capture message type, sender context, target tab, response/ack result, channel-closed errors, and whether the error was ignored intentionally. |
| Database reads/writes | Not a DB; JSON state persistence | The project does not use a database, but `state.json` acts as the persistence layer. | Capture state read/write errors, save duration, state version, and compact state snapshots for diagnostics. |
| File input/output | Critical | Local PDFs are scanned/read/served; state is persisted to JSON; converted files are downloaded. | Capture file metadata and file-operation results. Never copy full PDFs or Excel files into diagnostic logs by default. |
| Third-party APIs | Not formal APIs; third-party websites and Chrome APIs | iLovePDF and Zoho are automated through browser UI, not official APIs. Chrome extension APIs are central. | Capture external website UI state and Chrome API results/errors. Do not call these “API traces” as if they were stable service contracts. |
| CLI commands | Minimal | Startup is done by running `python app.py`. There is no primary CLI workflow beyond startup. | Capture process startup config and dependency/runtime environment, but CLI tracing is not a priority. |
| Other: Chrome APIs | Critical | The extension uses `downloads`, `storage`, `tabs`, `sidePanel`, `notifications`, `alarms`, and `activeTab`. | Add evidence for Chrome downloads, tabs, storage, notifications, alarms, and active tab assumptions. |
| Other: DOM operations | Critical | Uploading a PDF and clicking conversion/download buttons depend on DOM operations. | Add selector diagnostics and expected-vs-actual DOM evidence. |

## Communication model conclusion

The observability layer must define a **common event envelope** that can be emitted from Python and JavaScript and merged later.

Recommended common event fields:

```json
{
  "timestamp": "ISO-8601 wall clock time",
  "monotonic_ms": 123456,
  "trace_id": "trace/job/run id",
  "job_id": "job_xxx",
  "flow_run_id": "run_xxx",
  "pdf_id": "pdf_xxx",
  "request_id": "py_... or chrome_...",
  "reply_to": "request id if applicable",
  "component": "python.http | python.ws | python.flow | extension.bridge | extension.runtime | extension.content | chrome.downloads",
  "event": "conversion.status",
  "phase": "uploading | converting | downloading | ...",
  "severity": "debug | info | warn | error",
  "message": "human readable message",
  "data": {},
  "expected": {},
  "actual": {},
  "duration_ms": 0
}
```

---

# 4. Critical evidence types

## Summary

AutoHom v2 requires evidence that can reconstruct the complete job lifecycle across process, WebSocket, Chrome extension, DOM, downloads, and filesystem boundaries.

| Evidence type | Classification | Why useful / not useful | Recommended scope |
|---|---:|---|---|
| Structured logs | Required | Console `print` and ad-hoc JS logs are not enough for AI diagnosis. Logs must be machine-readable and correlated. | JSONL events from Python and extension, using a shared schema. |
| Unified timeline | Required / central | Failures cross boundaries: side panel → HTTP → Python state → WebSocket → extension queue → tab/content script → DOM → Chrome download → Python state. | Produce one timeline per `job_id` / `flow_run_id`, sorted by timestamp and monotonic time. |
| Distributed traces | Required in lightweight form | Full OpenTelemetry may be heavier than needed initially, but the project needs trace semantics across Python and Chrome extension components. | Use trace IDs/span IDs conceptually. Optional later mapping to OpenTelemetry. |
| State transitions | Required | Most bugs will be “state did not move from X to Y” or “state moved too early/late.” | Record old state, new state, reason, component, and correlation key. |
| Decision logs | Required, but not AI-agent decision logs | The project makes automation decisions: choose active Zoho tab, resolve task URL, reuse/create tab, wait/reload content script, ignore channel-closed error, match expected download, declare timeout. | Log decision inputs and rationale. Example: `download.match.decision` with expected stem, candidate filename, tab ID, host, time window. |
| Request/response records | Required, summarized | HTTP and Chrome message requests initiate actions and reveal validation failures. | Record method/action, target, status, duration, error summary, payload keys. Avoid full file content. |
| WebSocket messages | Required / critical | WebSocket timing and message pairing are essential: `CONVERT_PDF`, `CONVERT_PDF_ACK`, `CONVERSION_STATUS`, `PING`, `PONG`, timeout. | Capture envelopes with `requestId`, `replyTo`, agent, expected actions, actual action, elapsed time, and timeout. |
| DOM snapshots | Required on browser failures | iLovePDF automation can fail because selectors changed, content script was not ready, page state changed, or button text changed. | On failure and key phase boundaries, capture compact DOM summaries, not full HTML by default. Include selector results and candidate elements. |
| Screenshots | Required on browser failures | An AI/debugger can often understand UI state faster from screenshots than logs. | Capture failure screenshots and optionally before-click screenshots for upload/convert/download phases. |
| Input/output files | Required as metadata, not full payload | Need to verify PDF exists, was served, and Excel output matched expected conversion. | Capture filename, path, size, modified time, hash prefix, MIME/extension, download ID, final filename. Do not include full PDFs/Excel files by default. |
| Database snapshots | Not applicable as DB, but state snapshots required | No DB exists, but `state.json` is the persistence layer. | Include compact `state.json` snapshot filtered to the relevant job/PDF/flow plus recent global events. |
| Configuration snapshots | Required | Ports, paths, flow definitions, selector profiles, timing constants, extension version, and permissions affect failures. | Include backend config, extension config, site profile selectors, flow definition, timing constants, manifest version. |
| Environment information | Required | Local automation depends on OS, Python version, Chrome version, extension version, dependency versions, working directory, permissions, and filesystem paths. | Include OS, Python, packages, Chrome version if available, extension version, current folder, ports, process IDs where possible. |
| Test harness results | Required for future reliability | The roadmap mentions protocol validation. Browser automation needs regression harnesses for WebSocket protocol, state transitions, and selector readiness. | Include latest harness results in diagnostic package when available. |
| Recent code diffs | Required for AI debugging package, not runtime telemetry | AI diagnosis improves when recent code changes are available. | Include `git diff --stat`, changed files, and relevant diff snippets in exported diagnostic package. |

## Critical evidence ranking

### Tier 1 — must-have

These are required for the first serious observability implementation:

1. Unified per-job timeline.
2. Structured events with correlation IDs.
3. State transitions for job, flow, agent, queue, tab, and download.
4. WebSocket message capture with request/reply correlation.
5. Browser automation phase events.
6. Failure reason with expected-vs-actual evidence.
7. Relevant `state.json` snapshot for the job.
8. Config/selector/timing snapshot.
9. File metadata for input PDF and output Excel.

### Tier 2 — highly recommended

These should be implemented immediately after Tier 1:

1. DOM snapshots on failure.
2. Screenshots on failure.
3. Chrome download candidate/match diagnostics.
4. Content-script readiness diagnostics.
5. Service-worker lifecycle and reconnect history.
6. Recent code diffs in diagnostic export.
7. Test harness results.

### Tier 3 — useful later

These are useful but not first priority:

1. Full OpenTelemetry exporter.
2. Metrics dashboard.
3. Long-term trend analysis.
4. External log aggregation.
5. Multi-user analytics.

---

# 5. Required observability style

## Final style choice

AutoHom v2 needs:

> **Hybrid observability: workflow-based + state-machine + event-driven + browser/UI evidence + data-pipeline observability, with lightweight request-based and WebSocket tracing.**

## Why hybrid observability is required

A single style is not enough because the project has multiple failure surfaces:

- HTTP endpoint succeeds but WebSocket agent never responds.
- WebSocket `CONVERT_PDF_ACK` succeeds but content script is not ready.
- Content script is ready but a DOM selector fails.
- DOM click succeeds but the iLovePDF page never reaches `/descarga/`.
- Download button is clicked but Chrome download matching times out.
- Chrome download completes but Python state is not updated.
- PDF file exists in state but no longer exists on disk.
- Zoho mapping is stored in Chrome storage but not imported into Python.
- Extension service worker reconnects and loses in-memory queue context.
- Flow runner times out while extension later reports success.

Generic logs would show fragments, but not the complete causal chain.

## Observability styles evaluated

| Style | Fit | Decision | Reasoning |
|---|---:|---|---|
| Basic structured logging | Low alone, necessary as foundation | Use only as foundation | Structured logging is required, but insufficient because the project needs correlation, timelines, state transitions, and browser evidence. |
| Request-based observability | Medium | Use as supporting layer | Useful for `/api/...` endpoints, but a PDF conversion outlives the request. A request can only trigger the workflow. |
| Workflow-based observability | Very high | Required | Jobs and flows are the main user/system unit. The PDF-to-Excel conversion must be traced end-to-end. |
| Event-driven observability | Very high | Required | Chrome events, WebSocket events, tab events, download events, and extension messages are central. |
| State-machine observability | Very high | Required | Debugging depends on knowing which state changed, which expected state did not happen, and why. |
| Agent-decision observability | Low as AI-agent style, medium as automation-decision style | Use limited automation decision logs | The project is not an LLM agent. However, automation decisions must be logged: tab selection, selector choice, download matching, retry/reload decisions, mapping decisions. |
| Browser/UI evidence observability | Very high | Required | iLovePDF/Zoho are browser UI automations. DOM and screenshots are essential failure evidence. |
| Data-pipeline observability | High | Required | The job moves data from local PDF file → served PDF → iLovePDF upload → converted Excel download → state update. |
| Hybrid observability | Very high | Required | The architecture spans multiple models and failure surfaces. |

---

# 6. Reasoning by mechanism

## 6.1 Basic structured logging

### Needed?

Yes, but not sufficient.

### Why

Current logging is partly console-based and partly in-memory/job-event based. This helps during manual debugging, but an AI diagnostic workflow needs structured, compact, correlated events.

### What it should capture

- `timestamp`
- `component`
- `event`
- `severity`
- `job_id`
- `pdf_id`
- `flow_run_id`
- `request_id`
- `agent_type`
- `tab_id`
- `download_id`
- `phase`
- `message`
- `expected`
- `actual`
- `data`

### What it should not become

It should not become massive raw logs with every variable dump. The project needs compact evidence, not 10 MB of unstructured logs.

---

## 6.2 Request-based observability

### Needed?

Yes, but only as a layer.

### Why

The side panel uses local HTTP calls for scanning, config, listing jobs, triggering conversions, running flows, viewing diagnostics, and opening Zoho. HTTP request failures can explain why a user action did not start.

### What to capture

- Endpoint and method.
- Status code.
- Duration.
- Request body summary.
- Response summary.
- Validation failure.
- Associated job/PDF/flow IDs.
- Whether the request started a background workflow.

### Why not enough

The conversion workflow continues through WebSocket, Chrome extension, DOM automation, and downloads after the HTTP response returns.

---

## 6.3 Workflow-based observability

### Needed?

Yes. This is the primary style.

### Why

The central domain object is a job or flow, not a request. A user wants to know why a specific PDF did or did not become an Excel file.

### Required workflow trace

For `pdf_to_excel`, the trace should include:

1. User clicked convert or run flow.
2. HTTP endpoint accepted action.
3. Job status changed to queued.
4. WebSocket command sent.
5. Agent acknowledged command.
6. Runtime queued conversion.
7. Runtime started conversion.
8. iLovePDF tab created or reused.
9. Content script readiness checked.
10. PDF fetch URL generated.
11. PDF upload attempted.
12. Conversion button clicked.
13. Download page detected.
14. Download tracker started.
15. Download button clicked.
16. Chrome download matched.
17. Chrome download completed.
18. Extension sent completion to Python.
19. Python updated PDF/job state.
20. Flow completed or failed.

### Main output

A per-job diagnostic timeline that an AI agent can read without needing full raw logs.

---

## 6.4 Event-driven observability

### Needed?

Yes.

### Why

Many actions are not request-bound. They are triggered by browser events, WebSocket messages, tab updates, storage events, download events, timers, alarms, and content-script messages.

### What to capture

- Chrome download created/changed events.
- Chrome tab created/updated/removed events.
- `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage` attempts/responses.
- WebSocket open/message/close/error/reconnect events.
- Keepalive PING/PONG events.
- Runtime queue events.
- Flow step events.

### Key requirement

Events must share correlation IDs. Otherwise they become disconnected noise.

---

## 6.5 State-machine observability

### Needed?

Yes.

### Why

The application already uses statuses, but the transitions are not fully explicit as a formal state machine. Browser automation failures are easier to diagnose when the system records both the expected next state and the actual observed state.

### Examples

- Expected: `conversion=queued -> uploading`; actual: stayed `queued` because agent was disconnected.
- Expected: `tab_loading -> content_ready`; actual: `content_not_ready` after max attempts.
- Expected: `waiting_download_page -> download_page_loaded`; actual: timeout after 60 seconds.
- Expected: `download_tracking -> complete`; actual: matched no download candidate.

### Required event format

```json
{
  "event": "state.transition",
  "state_machine": "conversion",
  "from": "queued",
  "to": "uploading",
  "reason": "content script accepted START_CONVERSION",
  "job_id": "job_...",
  "pdf_id": "...",
  "component": "extension.content"
}
```

---

## 6.6 Agent-decision observability

### Needed?

Not as LLM-agent observability. Yes as automation-decision observability.

### Why

The project does not currently implement an AI agent loop. However, it makes important automation decisions that should be observable:

- Whether a download is a PDF.
- Whether an active Zoho tab maps to a Case URL.
- Whether to reuse or create an iLovePDF tab.
- Whether a content-script channel-closed error is ignorable.
- Whether a Chrome download matches the expected output.
- Whether a stale connection should be pinged or closed.
- Whether a flow step has required fields.

### Required decision evidence

Each important decision should capture:

- Inputs considered.
- Rule used.
- Result.
- Confidence or match reason when relevant.
- Rejected alternatives when relevant.

Example:

```json
{
  "event": "download.match.decision",
  "component": "extension.downloadTracker",
  "pdf_id": "...",
  "expected_stem": "acta123",
  "candidate_filename": "acta123.xlsx",
  "candidate_host": "www.ilovepdf.com",
  "same_tab": true,
  "within_time_window": true,
  "decision": "matched"
}
```

---

## 6.7 Browser/UI evidence observability

### Needed?

Yes. This is one of the most important mechanisms.

### Why

The highest-risk failure surface is third-party browser UI automation. Logs alone often cannot reveal whether the site changed, a button was hidden, a selector failed, the page had a modal, the upload input was missing, or the content script ran on the wrong page.

### Required evidence

On failure and optionally at key phase boundaries:

- Current tab URL.
- Page title.
- Document ready state.
- Content script context.
- Site profile version/selectors.
- Selector result table:
  - selector name
  - selector value
  - match count
  - visible count
  - first match tag/text/attributes summary
- Screenshot.
- Compact DOM snapshot.
- Candidate buttons/inputs summary.
- Last Chrome message sent to the tab.
- Last response or error from content script.

### Avoid

Do not store full page HTML by default. It can be huge, noisy, and may contain sensitive information. Store compact snapshots unless a debug mode explicitly enables full HTML capture.

---

## 6.8 Data-pipeline observability

### Needed?

Yes.

### Why

The user-facing output is an Excel file created from a local PDF. The pipeline must prove that:

- The PDF existed.
- The PDF was scanned.
- The PDF was associated with a job.
- The PDF was served through Python.
- The browser fetched the PDF.
- The PDF was uploaded into iLovePDF.
- The output download was detected.
- The output file matched expected data.
- The job state recorded the result.

### Required evidence

- Input PDF metadata:
  - `pdf_id`
  - filename
  - absolute path
  - existence
  - size
  - modified time
  - optional hash prefix
- Served file evidence:
  - request to `/api/pdfs/{pdf_id}/file`
  - response status
  - content length if available
- Output evidence:
  - Chrome download ID
  - final filename
  - final URL
  - extension/MIME evidence
  - completed/interrupted status
  - final local path if accessible
- State update evidence:
  - `excel_path` set or not set
  - `conversion=completed` or `error`

---

# 7. Recommended observability architecture for this project

## 7.1 Core principle

Every significant event should be attributable to one or more of these IDs:

- `trace_id`
- `job_id`
- `flow_run_id`
- `pdf_id`
- `request_id`
- `agent_id`
- `agent_type`
- `runtime_instance_id`
- `connection_id`
- `tab_id`
- `download_id`

The project should not rely on timestamps alone to connect events.

---

## 7.2 Recommended layers

### Layer 1 — Shared event schema

Create one event schema used by Python and extension code.

The schema should be compact enough for AI diagnosis and structured enough for filtering.

Minimum fields:

- `ts`
- `monotonic_ms`
- `severity`
- `component`
- `event`
- `phase`
- `trace_id`
- `job_id`
- `flow_run_id`
- `pdf_id`
- `agent_type`
- `request_id`
- `tab_id`
- `download_id`
- `message`
- `expected`
- `actual`
- `data`

### Layer 2 — Workflow timeline collector

The system should collect events into a per-job timeline.

The timeline should be available through diagnostics, ideally:

- `GET /api/jobs/{job_id}/diagnostics`
- and/or a future export endpoint like `GET /api/jobs/{job_id}/diagnostic-package`

### Layer 3 — State transition ledger

Every important state mutation should create a `state.transition` event.

State machines:

- job conversion state
- job flow state
- flow run state
- agent connection state
- runtime queue state
- tab/content-script state
- download tracker state
- file state

### Layer 4 — Message tracing

Add traceable records for:

- HTTP request/response summaries.
- WebSocket send/receive pairs.
- Chrome runtime/tab messages.
- Content-script responses.
- Chrome downloads events.

### Layer 5 — Browser evidence capture

On browser automation failure, capture:

- Screenshot.
- DOM selector summary.
- URL/title/ready state.
- Site profile snapshot.
- Candidate element summaries.

### Layer 6 — Diagnostic package exporter

Create a compact export that an AI coding agent can inspect.

Recommended package structure:

```text
diagnostics/
  job_<job_id>_<timestamp>/
    summary.md
    timeline.jsonl
    state_snapshot.json
    config_snapshot.json
    env_snapshot.json
    websocket_messages.jsonl
    http_requests.jsonl
    browser_events.jsonl
    dom_snapshot_failure.json
    screenshot_failure.png
    file_metadata.json
    recent_code_diff.patch
    test_harness_results.json
```

The first version can produce a single JSON/Markdown package instead of a folder, but the folder layout is better long-term.

---

# 8. What the project does not need first

## Full OpenTelemetry-first architecture

OpenTelemetry concepts are useful, especially traces and spans. However, adopting a full OTEL stack immediately may be too heavy for a local browser-extension automation project.

Recommended path:

1. Start with a project-native event schema and correlation IDs.
2. Build AI-ready diagnostic exports.
3. Later map events/spans to OpenTelemetry if needed.

## Metrics-only monitoring

Metrics like counts, durations, and failure rates are useful, but they will not explain why a specific PDF failed to convert. This project needs evidence-rich traces first.

## Cloud log aggregation

The app is local-only. Cloud logging is not required for the first observability architecture. Local diagnostic packages are more aligned with the user’s AI-assisted debugging workflow.

## AI-agent memory observability

There is no active AI-agent runtime in the repository. Do not design memory/LLM-decision observability until an actual AI component exists.

## Database observability

There is no database. Focus on `state.json` snapshots and state persistence integrity.

---

# 9. Failure modes this observability must explain

The architecture should be able to diagnose these project-specific failure modes:

## Python/backend failure modes

- HTTP API not running.
- WebSocket server not running.
- Port conflict on `7790` or `8769`.
- Invalid configured PDF folder.
- PDF file listed in state but missing on disk.
- `state.json` corrupted or not saved.
- Flow definition missing or disabled.
- Required job fields missing.
- Flow timeout while waiting for conversion completion.
- Agent not connected when conversion starts.
- WebSocket request timed out.
- Unexpected WebSocket response action.

## Extension/agent failure modes

- Service worker not awake.
- WebSocket connection failed or closed.
- Duplicate runtime instance rejected.
- Reconnect loop.
- Agent connected but did not receive command.
- Agent received command but did not acknowledge.
- Conversion queued but never started.
- Queue blocked by previous job.
- Runtime state lost after service worker lifecycle event.

## Chrome/browser automation failure modes

- iLovePDF tab not created.
- Existing tab reused but wrong page state.
- Tab closed before download page loaded.
- Content script not ready after max attempts.
- Message channel closed unexpectedly.
- PDF fetch from Python failed.
- Upload input missing or rejected DataTransfer assignment.
- Convert button selector changed.
- Download page `/descarga/` never reached.
- Download button selector changed.
- Page modal/cookie banner blocked click.
- iLovePDF UI changed.

## Chrome download failure modes

- Download tracker never matched a candidate.
- Wrong download matched.
- Download interrupted.
- Download completed but filename did not look like Excel.
- Download happened outside expected time window.
- Download event came from another tab.
- Download path not available to Python.

## Zoho mapping failure modes

- Active tab was not a relevant Zoho Case URL.
- `resolveTaskUrl` could not resolve a task URL.
- PDF download detected but pending mapping not confirmed.
- Mapping saved in Chrome storage but failed to import into Python.
- Filename mismatch between Zoho mapping and scanned PDF.

## State consistency failure modes

- Job conversion status says completed but `excel_path` is empty.
- PDF status and job status disagree.
- Flow status says running after conversion failed.
- Recent events do not include the actual failing step.
- State saved after partial update only.

---

# 10. Minimum viable observability design

The first implementation should not try to instrument everything at once. The minimum viable design should include:

## MVP 1 — Correlation and structured events

- Create a shared event envelope.
- Emit JSON events in Python for:
  - HTTP action start/end.
  - job status transition.
  - flow start/step/failure/completion.
  - WebSocket send/ack/status/timeout.
  - state save failure.
- Emit JSON events in extension for:
  - WebSocket open/close/reconnect.
  - command received/acknowledged.
  - queue enqueue/start/end.
  - tab ready/content ready.
  - upload/conversion/download phases.
  - download tracker match/complete/error.

## MVP 2 — Per-job diagnostic timeline

Enhance diagnostics so that one job shows:

- Current job state.
- Related PDF state.
- Related flow run state.
- Related agent state.
- Timeline of events sorted by time.
- Last known phase.
- Last error.
- Expected vs actual for the failure.

## MVP 3 — Browser failure evidence

On content-script or browser automation failure:

- Capture screenshot.
- Capture compact DOM selector summary.
- Capture URL/title/ready state.
- Attach evidence references to the job diagnostic package.

## MVP 4 — AI-ready export

Create an export file/folder that contains:

- `summary.md`
- `timeline.jsonl`
- `state_snapshot.json`
- `config_snapshot.json`
- `browser_evidence.json`
- `file_metadata.json`
- optional screenshot(s)

---

# 11. Final classification

## Execution model

AutoHom v2 is classified as:

> **Long-running local workflow orchestration with asynchronous events, UI-driven actions, browser automation, file-processing pipeline behavior, real-time WebSocket messaging, and multi-process coordination.**

## State model

AutoHom v2 is classified as:

> **Stateful, per-task/per-session workflow state machine with external browser/DOM state and local filesystem state.**

## Communication model

AutoHom v2 is classified as:

> **Hybrid local communication model: internal function calls, local HTTP API, WebSocket agent protocol, Chrome extension messaging, Chrome APIs, local file I/O, and third-party website UI automation.**

## Critical evidence types

AutoHom v2 requires:

> **Structured logs, unified timelines, lightweight distributed traces, state transitions, automation decision logs, HTTP/WebSocket/message records, DOM snapshots, screenshots, file metadata, state snapshots, config/environment snapshots, test harness results, and recent code diffs for AI debugging.**

## Required observability style

AutoHom v2 should use:

> **Hybrid observability** with workflow-based, event-driven, state-machine, browser/UI evidence, and data-pipeline observability as the core architecture.

## Most important design rule

Do not add generic logs first.

Instead, design the system so that for any failed job, the diagnostic package can answer:

> “What was supposed to happen, what actually happened, where did the workflow stop, what state changed or did not change, what did the browser show, what messages were exchanged, and what exact evidence should an AI agent inspect next?”
