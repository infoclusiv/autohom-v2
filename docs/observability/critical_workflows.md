# Critical Workflows Map — AutoHom v2

Repository: `infoclusiv/autohom-v2`  
Branch reviewed: `main`  
Requested inputs read:

- `docs/observability/project_understanding.md`
- `docs/observability/observability_classification.md`

Scope: critical workflow mapping only.  
No application code was modified.  
This document does **not** design or implement the final observability layer. It only maps what must become observable.

---

## 0. Evidence baseline

This workflow map was created from the two required observability documents plus the following repository files:

### Python backend

- `app-python-zoho/app.py`
- `app-python-zoho/config.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/agent_registry.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/pdf_scanner.py`
- `app-python-zoho/flows/flows.json`

### Chrome extension

- `autohom-extension/manifest.json`
- `autohom-extension/background-main.js`
- `autohom-extension/background-zoho.js`
- `autohom-extension/content.js`
- `autohom-extension/sidepanel.html`
- `autohom-extension/sidepanel.js`
- `autohom-extension/ilovepdf/config.js`
- `autohom-extension/ilovepdf/utils.js`
- `autohom-extension/ilovepdf/domHelpers.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/router.js`

---

## 1. Workflow criticality overview

| # | Workflow | High risk | Hard to reproduce | Hard to debug | Most important for user | Most important for correctness |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Python orchestrator startup and backend readiness | Medium | Medium | Medium | High | Critical |
| 2 | Chrome extension bootstrap, WebSocket bridge, and agent registration | High | High | High | High | Critical |
| 3 | Side panel refresh and user action dispatch | Medium | Medium | Medium | High | High |
| 4 | Local PDF folder configuration, scan, and job synchronization | Medium | Medium | Medium | High | High |
| 5 | Zoho PDF download detection and mapping import | High | High | High | High | High |
| 6 | Direct PDF-to-Excel conversion action | Critical | High | Critical | Critical | Critical |
| 7 | Configured `pdf_to_excel` flow execution | Critical | High | Critical | Critical | Critical |
| 8 | iLovePDF browser automation runtime | Critical | Critical | Critical | Critical | Critical |
| 9 | Conversion status propagation and state persistence | High | High | High | Critical | Critical |
| 10 | Job diagnostics and recent event viewing | Medium | Low | Medium | Medium | High |
| 11 | Open Zoho action from job card | Medium | Medium | Low | Medium | Medium |
| 12 | Disabled/future Site2 upload boundary | Medium now / High later | Medium now / High later | Medium now / High later | Medium later | High later |

The most critical end-to-end user workflow is:

```text
User action in side panel
  -> Python HTTP API
  -> JobStore state update
  -> WebSocket command to ilovepdf-converter agent
  -> Chrome extension bridge
  -> Runtime queue
  -> iLovePDF tab/content script
  -> PDF fetched from local Python API
  -> DOM upload/conversion
  -> iLovePDF download page
  -> Chrome download tracker
  -> WebSocket status back to Python
  -> StateManager / JobStore persisted state
  -> Side panel refresh and diagnostics
```

---

# 2. Workflow maps

---

## Workflow 1 — Python orchestrator startup and backend readiness

### 1. Workflow name

Python orchestrator startup and backend readiness.

### 2. Business or technical purpose

Start the local backend that coordinates all other workflows. Without this process, the side panel cannot read jobs/configuration, the extension cannot register as an agent, PDF files cannot be served, and flow execution cannot run.

### 3. Trigger

The user runs:

```bash
python app.py
```

from `app-python-zoho`.

### 4. Entry point in code

- `app-python-zoho/app.py`
  - `main()`

### 5. Components involved

- Python process
- `StateManager`
- `JobStore`
- `MultiAgentWebSocketServer`
- `FlowOrchestrator`
- `aiohttp` HTTP API created by `create_app(...)`
- `state.json`
- `flows/flows.json`

### 6. Step-by-step execution path

1. `main()` prints the AutoHom startup banner.
2. `StateManager()` loads or initializes local persisted state from `state.json`.
3. `JobStore(state_manager)` wraps the state manager.
4. `MultiAgentWebSocketServer(state_manager=..., job_store=...)` is created.
5. `FlowOrchestrator(job_store=..., ws_server=...)` is created.
6. The current folder is read from state and printed.
7. `ws_server.start_ws_server()` starts the WebSocket server on `localhost:8769`.
8. If WebSocket startup fails, the process exits with status `1`.
9. `create_app(...)` builds the local HTTP API.
10. Signal handlers are registered for `SIGINT` and `SIGTERM`.
11. `aiohttp.web.run_app(...)` starts the HTTP server on `localhost:7790`.
12. The process remains running until stopped.

### 7. Expected final state

- HTTP API is listening on `http://localhost:7790`.
- WebSocket server is listening on `ws://localhost:8769`.
- State is loaded and structurally valid.
- Flow definitions can be listed.
- Extension agents can connect.
- Side panel can call `/api/...`.

### 8. Intermediate states

- `process.starting`
- `state.loading`
- `state.loaded` or `state.default_created`
- `job_store.ready`
- `ws.initializing`
- `ws.listening`
- `http.initializing`
- `http.listening`
- `process.ready`
- `process.shutdown_requested`
- `process.stopped`

### 9. External systems involved

- Local OS process environment.
- Local filesystem.
- TCP ports `7790` and `8769`.
- Python packages: `aiohttp`, `websockets`.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `app-python-zoho/state.json`
- `app-python-zoho/flows/flows.json`
- HTTP socket: `localhost:7790`
- WebSocket socket: `localhost:8769`
- No database.
- No browser page directly touched.

### 11. Success signals

- Console output shows WebSocket server started.
- Console output shows HTTP API starting.
- `/api/bridge` returns a JSON response.
- `/api/jobs` returns a JSON response.
- `/api/flows` returns available flows.
- Extension agent can connect.

### 12. Failure signals

- WebSocket server failed to bind.
- HTTP server failed to bind.
- `state.json` cannot be read or is invalid.
- `flows.json` missing or unreadable.
- Port already in use.
- Missing Python package.
- Side panel shows “Python desconectado”.
- Extension bridge keeps reconnecting.

### 13. Current visibility

- Startup uses `print(...)`.
- WebSocket bridge has compact in-memory connection events.
- `/api/bridge` exposes bridge state.
- `/api/events/recent` exposes recent job events, but startup events are not consistently represented as structured diagnostic events.

### 14. Missing visibility

- No structured startup trace.
- No explicit process/runtime ID.
- No startup config snapshot.
- No port bind diagnostic context.
- No dependency/version snapshot.
- No state file load status event.
- No flow file load validation event.
- No startup readiness event correlated to later extension handshake.

### 15. Recommended observability points

- Emit a `process.start` event before component initialization.
- Emit `state.load.start`, `state.load.success`, `state.load.failure`.
- Emit `ws.server.start`, `ws.server.ready`, `ws.server.failure`.
- Emit `http.server.start`, `http.server.ready`, `http.server.failure`.
- Emit `flow.config.load.success` or `flow.config.load.failure`.
- Capture config snapshot:
  - HTTP host/port
  - WS host/port
  - state file path
  - flows file path
  - Python version
  - working directory
- Capture startup readiness summary:
  - `http_ready`
  - `ws_ready`
  - `state_ready`
  - `flows_ready`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | At beginning of `app.py::main()` before creating `StateManager`. |
| Step event | After each component initialization: state manager, job store, WS server, flow orchestrator, HTTP app. |
| Success event | After `web.run_app` successfully starts listening, or immediately before entering run loop if available. |
| Failure event | Around `StateManager` load, `start_ws_server`, `create_app`, and `web.run_app`. |
| State transition | `backend=starting -> ws_listening -> http_listening -> ready`; `backend=ready -> shutting_down -> stopped`. |
| Decision point | Whether to exit when WebSocket startup fails; whether existing state file is usable or default state is used. |
| External interaction | Opening state file, reading flows file, binding local ports. |
| Input/output artifact | `state.json` and `flows.json` metadata. |
| Evidence snapshot | Startup config, runtime environment, port availability, state version, flow count. |
| Diagnostic context | Process ID, working directory, Python version, package versions, OS, error stack if startup fails. |

---

## Workflow 2 — Chrome extension bootstrap, WebSocket bridge, and agent registration

### 1. Workflow name

Chrome extension bootstrap, WebSocket bridge, and `ilovepdf-converter` agent registration.

### 2. Business or technical purpose

Connect the Chrome extension to the Python orchestrator as a controllable automation agent. This allows Python to dispatch PDF conversion commands and receive status updates from the browser automation layer.

### 3. Trigger

- Chrome loads or wakes the Manifest V3 service worker.
- User opens/uses the extension.
- Chrome alarm reconnect fires.
- Bridge reconnect timer fires after disconnection.

### 4. Entry point in code

- `autohom-extension/background-main.js`
- `ILovePDFBridge.connect()` in `autohom-extension/ilovepdf-background/bridge.js`
- `MultiAgentWebSocketServer.ws_handler(...)` in `app-python-zoho/multi_agent_ws_server.py`

### 5. Components involved

- Chrome Manifest V3 service worker
- `background-main.js`
- `background-zoho.js`
- `ILovePDFBridge`
- `ILovePDFRuntime`
- `ILovePDFTabManager`
- `ILovePDFDownloadTracker`
- Python WebSocket server
- `AgentRegistry`
- `JobStore`
- Chrome alarms API
- WebSocket connection

### 6. Step-by-step execution path

1. Chrome starts the service worker from `background-main.js`.
2. `background-main.js` calls `importScripts(...)` for Zoho and iLovePDF modules.
3. `background-main.js` calls `ILovePDFBridge.connect()`.
4. `bridge.js` checks if a WebSocket is already open or connecting.
5. `bridge.js` creates `new WebSocket(CONFIG_ILOVEPDF.BRIDGE_URL)`.
6. On `onopen`, the bridge sends `AGENT_CONNECTED`.
7. The handshake includes:
   - `agentId`
   - `agentType`
   - `extensionId`
   - `extensionType`
   - `capabilities`
   - `runtimeInstanceId`
   - extension `version`
8. Python receives the WebSocket message.
9. Python normalizes handshake metadata.
10. Python rejects invalid handshakes or duplicate runtime instances.
11. Python registers the agent in `AgentRegistry`.
12. Python updates bridge status to connected.
13. Python appends `agent.connected` to `JobStore` if available.
14. Python starts a keepalive probe.
15. Extension bridge sets reconnect alarm through `setupAlarmReconnect()`.
16. On `PING`, extension sends `PONG`.
17. On WebSocket close/error, extension schedules reconnect.

### 7. Expected final state

- Python bridge state shows connected.
- `AgentRegistry` contains one active `ilovepdf-converter`.
- Side panel `/api/agents` shows the connected agent.
- Python can send `CONVERT_PDF`.
- Extension can send `CONVERSION_STATUS`.
- Keepalive can verify agent health.

### 8. Intermediate states

- `service_worker.importing_modules`
- `service_worker.imported`
- `bridge.connecting`
- `socket.open`
- `handshake.sent`
- `handshake.received`
- `agent.registering`
- `agent.connected`
- `agent.keepalive_active`
- `agent.stale`
- `agent.reconnecting`
- `agent.disconnected`
- `agent.duplicate_runtime_rejected`

### 9. External systems involved

- Chrome extension runtime.
- Chrome alarms API.
- Local WebSocket server on `ws://localhost:8769`.
- Local Python process.
- Browser service worker lifecycle.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `autohom-extension/background-main.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `app-python-zoho/multi_agent_ws_server.py`
- WebSocket: `ws://localhost:8769`
- `chrome.alarms`
- `chrome.runtime`
- `AgentRegistry`
- `JobStore.events`

### 11. Success signals

- `AGENT_CONNECTED` accepted.
- `/api/bridge.connected == true`.
- `/api/agents` includes `ilovepdf-converter`.
- Python receives `PONG` after `PING`.
- Bridge status messages show connected.
- Side panel displays agent count.

### 12. Failure signals

- `importScripts` fails.
- WebSocket constructor throws.
- WebSocket close/error.
- Python rejects invalid handshake.
- Python rejects duplicate runtime.
- Agent not present when user triggers conversion.
- Keepalive fails.
- Side panel shows Python or agent disconnected.
- Reconnect loop never succeeds.

### 13. Current visibility

- Extension logs bridge status with `ILovePDFUtils.log`.
- Python records some bridge connection events in `_connection_events`.
- Python appends `agent.connected` and `agent.disconnected` events.
- `/api/bridge` exposes current bridge state and recent events.
- Side panel shows connected/disconnected status.

### 14. Missing visibility

- No cross-component `connection_id` / `runtime_instance_id` timeline exposed in one place.
- No structured import bootstrap report.
- No service-worker lifecycle event ID.
- No reconnect attempt counter in diagnostics.
- No explicit duplicate-runtime diagnostic package.
- No reasoned decision log for accepting/rejecting a handshake.
- No correlation between a failed conversion and bridge reconnect history.
- No capture of WebSocket close code/reason in job-level diagnostics.

### 15. Recommended observability points

- Extension:
  - `extension.bootstrap.start`
  - `extension.bootstrap.success`
  - `extension.bootstrap.failure`
  - `bridge.ws.connect.attempt`
  - `bridge.ws.open`
  - `bridge.handshake.sent`
  - `bridge.ws.close`
  - `bridge.ws.error`
  - `bridge.reconnect.scheduled`
  - `bridge.reconnect.alarm`
  - `bridge.ping.received`
  - `bridge.pong.sent`
- Python:
  - `ws.connection.open`
  - `ws.handshake.received`
  - `agent.registration.success`
  - `agent.registration.failure`
  - `agent.duplicate_runtime`
  - `agent.keepalive.ping`
  - `agent.keepalive.timeout`
  - `ws.connection.close`
- Include:
  - `connection_id`
  - `runtime_instance_id`
  - `agent_id`
  - `agent_type`
  - `extension_version`
  - `ws_close_code`
  - `ws_close_reason`
  - `reconnect_attempt`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | In `background-main.js` before `importScripts`; in Python when `ws_handler` receives a new socket. |
| Step event | Module import done, WS constructor called, socket open, handshake sent, handshake parsed, agent registered, keepalive started. |
| Success event | After Python registers agent and extension sees bridge status as connected. |
| Failure event | Import failure, WS error/close, invalid handshake, duplicate runtime, keepalive timeout, send failure. |
| State transition | `agent=disconnected -> socket_connected -> handshake_received -> connected -> stale -> disconnected`. |
| Decision point | Reuse existing socket or connect; accept/reject handshake; close duplicate runtime; reconnect scheduling. |
| External interaction | WebSocket connect/send/receive; Chrome alarm creation. |
| Input/output artifact | Agent identity payload and registration metadata. |
| Evidence snapshot | Bridge state, agent registry snapshot, recent WS events, reconnect counters. |
| Diagnostic context | Service worker runtime instance, Chrome extension version, close code/reason, expected URL `ws://localhost:8769`. |

---

## Workflow 3 — Side panel refresh and user action dispatch

### 1. Workflow name

Side panel refresh and user action dispatch.

### 2. Business or technical purpose

Provide the user-facing control panel for jobs, agents, flows, configuration, pending Zoho mappings, conversion actions, flow actions, and diagnostics.

### 3. Trigger

- User opens the extension side panel.
- User clicks refresh.
- Periodic refresh interval every five seconds.
- Extension messages arrive:
  - `DOWNLOAD_PENDING`
  - `MAPPING_SAVED`
  - `ILOVEPDF_PROGRESS`
  - `ILOVEPDF_BRIDGE_STATUS`
- User clicks a job action button.

### 4. Entry point in code

- `autohom-extension/background-zoho.js`
  - `chrome.action.onClicked`
- `autohom-extension/sidepanel.html`
- `autohom-extension/sidepanel.js`
  - `init()`
  - `refreshAll()`
  - `handleJobAction(...)`
  - `handlePendingAction(...)`

### 5. Components involved

- Chrome extension action icon.
- Chrome side panel.
- Side panel JavaScript.
- Python HTTP API.
- Chrome storage session.
- Chrome runtime messages.
- Chrome tabs API.
- Jobs, agents, flows, bridge state.

### 6. Step-by-step execution path

1. User clicks extension icon.
2. `chrome.sidePanel.open(...)` opens `sidepanel.html`.
3. `sidepanel.js` runs `init()`.
4. `bindEvents()` attaches UI event handlers.
5. `loadPendingDownloads()` reads pending mappings from `chrome.storage.session`.
6. `refreshAll()` runs:
   - `GET /api/bridge`
   - `GET /api/jobs`
   - `GET /api/agents`
   - `GET /api/flows`
   - `GET /api/config`
7. UI renders:
   - bridge state
   - stats
   - jobs
   - agents
   - flows
   - folder input
   - pending Zoho mapping cards
8. Every five seconds, `refreshAll()` repeats.
9. When a user clicks a job action, `handleJobAction` calls the relevant API.
10. The UI displays toast notifications and refreshes again.

### 7. Expected final state

- User sees accurate jobs, statuses, agents, flows, and config.
- User can trigger scan, conversion, flow run, open Zoho, send site2 action, or view logs.
- UI reflects status changes within the refresh interval.

### 8. Intermediate states

- `sidepanel.opened`
- `sidepanel.initializing`
- `pending_downloads.loaded`
- `bridge.refreshing`
- `jobs.refreshing`
- `agents.refreshing`
- `flows.refreshing`
- `config.refreshing`
- `ui.rendered`
- `user_action.clicked`
- `user_action.request_sent`
- `user_action.response_received`
- `user_action.failed`

### 9. External systems involved

- Chrome extension side panel runtime.
- Local Python HTTP API.
- Chrome storage.
- Chrome tabs.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- HTTP:
  - `/api/bridge`
  - `/api/jobs`
  - `/api/agents`
  - `/api/flows`
  - `/api/config`
  - `/api/folder-dialog`
  - `/api/jobs/{job_id}/actions/convert-pdf`
  - `/api/jobs/{job_id}/flows/run`
  - `/api/jobs/{job_id}/diagnostics`
  - `/api/jobs/{job_id}/actions/open-zoho`
  - `/api/jobs/{job_id}/actions/send-excel-site2`
- Chrome storage session.
- Chrome tabs for opening Zoho or site profile editor.

### 11. Success signals

- UI renders non-empty or valid empty states.
- Bridge status is accurate.
- Jobs list matches backend.
- Agent count matches backend.
- Flow list loads.
- Toast shows action sent.
- Diagnostics lines render after “Ver logs”.

### 12. Failure signals

- Fetch fails due Python not running.
- JSON parsing fails.
- UI silently falls back to empty jobs/agents.
- Action button returns API error.
- User sees stale status because refresh hides a failed request.
- Pending mapping disappears from UI but was not imported to Python.
- Button click has no visible durable event.

### 13. Current visibility

- User sees bridge state, jobs, status pills, agents, flows, pending items, and limited logs.
- Side panel catches errors and shows toast for some actions.
- Fetch failures during refresh are mostly silent and reset arrays to empty.
- User actions are not consistently recorded as workflow-starting events.

### 14. Missing visibility

- No durable `user.action.clicked` events.
- No request ID per side panel HTTP call.
- No UI-side failure event persisted to Python.
- No distinction between true empty jobs and backend unreachable.
- No correlation from button click to job workflow.
- No side panel session ID.
- No render state snapshot for debugging stale UI.
- No event for “refresh failed but UI hid the failure”.

### 15. Recommended observability points

- Record side panel session lifecycle:
  - `sidepanel.opened`
  - `sidepanel.init.success`
  - `sidepanel.init.failure`
- Record refresh batch:
  - `sidepanel.refresh.start`
  - `sidepanel.refresh.endpoint.success`
  - `sidepanel.refresh.endpoint.failure`
  - `sidepanel.refresh.complete`
- Record user actions:
  - action type
  - job ID
  - flow ID if any
  - endpoint
  - request ID
  - response status
  - toast message
- On errors, send a compact UI diagnostic event to Python if possible.

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | `sidepanel.js::init()` and `refreshAll()` start. |
| Step event | Before/after each API fetch; before/after render. |
| Success event | Refresh batch complete and UI render complete. |
| Failure event | Fetch failure, JSON failure, action response error, Chrome API failure. |
| State transition | `ui=loading -> ready`; `backend_status=unknown -> connected/disconnected`; `action=clicked -> sent -> accepted/failed`. |
| Decision point | Whether to show empty state vs disconnected state; which endpoint to call for each button. |
| External interaction | Fetch calls to Python; Chrome storage; Chrome tabs creation. |
| Input/output artifact | API request/response summaries, UI state snapshot. |
| Evidence snapshot | Jobs count, agents count, flows count, bridge state, selected job ID/action. |
| Diagnostic context | Side panel session ID, URL, extension version, last refresh time, failed endpoint and exception. |

---

## Workflow 4 — Local PDF folder configuration, scan, and job synchronization

### 1. Workflow name

Local PDF folder configuration, scan, and job synchronization.

### 2. Business or technical purpose

Discover local PDF files, register them in persistent state, and create/update jobs so they can be mapped to Zoho and converted to Excel.

### 3. Trigger

- User clicks “browse folder” in side panel.
- User manually enters a folder path and clicks scan.
- Side panel calls `POST /api/config`.
- Side panel calls `POST /api/folder-dialog`.

### 4. Entry point in code

- `sidepanel.js`
  - `browseFolder()`
  - `scanFolder()`
- `http_server.py`
  - `handle_folder_dialog`
  - `handle_set_config`
  - `handle_scan`
- `pdf_scanner.py`
  - `scan_folder(...)`
- `state_manager.py`
  - `set_current_folder(...)`
  - `merge_scanned_pdfs(...)`
- `job_store.py`
  - `create_or_update_from_pdf(...)`

### 5. Components involved

- Side panel UI.
- Python HTTP API.
- Native folder picker via `tkinter`.
- Local filesystem.
- `StateManager`.
- `JobStore`.
- `pdf_scanner`.
- `state.json`.

### 6. Step-by-step execution path

1. User clicks browse or scan.
2. Side panel sends:
   - `POST /api/folder-dialog` with optional initial folder, or
   - `POST /api/config` with folder path.
3. For folder dialog:
   - Python opens native `tkinter` folder selector.
   - If selected, Python stores the folder with `StateManager.set_current_folder`.
4. For manual scan:
   - Python validates `os.path.isdir(folder)`.
   - Python stores normalized absolute folder path.
5. Python calls `_scan_and_merge(...)`.
6. `scan_folder(folder)` lists `.pdf` files.
7. Each PDF receives:
   - `id`
   - `filename`
   - `filepath`
8. `StateManager.merge_scanned_pdfs`:
   - adds new PDFs
   - refreshes existing PDFs
   - marks missing PDFs as `missing`
9. `_sync_jobs_from_pdfs` calls `JobStore.create_or_update_from_pdf` for every PDF.
10. Each job receives/updates:
    - `pdf_id`
    - `pdf_filename`
    - `pdf_path`
    - `statuses.conversion = pending` if appropriate
11. `JobStore` appends `job.updated`.
12. Side panel refreshes jobs and stats.

### 7. Expected final state

- `state.json.current_folder` is set.
- `state.json.pdfs` contains current scanned PDFs.
- Missing PDFs are marked `missing`.
- Corresponding jobs exist in `state.json.jobs`.
- Each scanned PDF job is ready for conversion if agent is connected.

### 8. Intermediate states

- `folder.selecting`
- `folder.selected`
- `folder.validating`
- `folder.invalid`
- `scan.started`
- `scan.file_discovered`
- `scan.completed`
- `pdf.registered`
- `pdf.updated`
- `pdf.missing`
- `job.created`
- `job.updated`
- `job.conversion.pending`
- `state.saved`

### 9. External systems involved

- Local filesystem.
- Native OS folder dialog.
- Local JSON state file.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `/api/folder-dialog`
- `/api/config`
- `/api/scan`
- Local folder path selected by user.
- PDF files in selected folder.
- `state.json`.
- No browser page beyond side panel.
- No WebSocket.
- No queue.

### 11. Success signals

- API returns `ok: true`.
- Side panel folder input shows selected path.
- Jobs list contains scanned PDFs.
- Stats show number of jobs.
- Job events include `job.updated`.
- PDF statuses are `pending`.

### 12. Failure signals

- Folder not found.
- Native folder dialog unavailable.
- Permission denied reading folder.
- OSError while scanning.
- `state.json` save failure.
- No PDFs found.
- Duplicate or unstable PDF IDs due filename-based hash.
- A file disappears after scan.

### 13. Current visibility

- `pdf_scanner` prints OSError.
- `http_server` returns folder validation errors.
- `StateManager` prints save errors.
- `JobStore` appends `job.updated` events.
- Side panel shows updated jobs after refresh.

### 14. Missing visibility

- No scan summary event:
  - folder path
  - files found
  - PDFs registered
  - PDFs missing
  - duration
- No per-file metadata:
  - size
  - modified time
  - path existence
  - optional hash prefix
- No explicit state transition events for PDFs/jobs.
- No diagnostic if PDF ID collision occurs.
- No state persistence success/failure event.
- No permission diagnostics.
- No "folder selected but not scanned" distinction.

### 15. Recommended observability points

- `folder.dialog.opened`
- `folder.dialog.selected`
- `folder.dialog.cancelled`
- `folder.validation.success`
- `folder.validation.failure`
- `scan.started`
- `scan.file.candidate`
- `scan.file.accepted`
- `scan.file.skipped`
- `scan.completed`
- `pdf.state.transition`
- `job.sync.created`
- `job.sync.updated`
- `job.sync.summary`
- `state.save.success`
- `state.save.failure`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | `sidepanel.scanFolder()` and `http_server.handle_set_config/handle_scan`. |
| Step event | Folder validation, directory list start, PDF candidate found, merge start, job sync start. |
| Success event | Scan completed and jobs synchronized. |
| Failure event | Invalid folder, folder dialog failure, OSError, state save failure, empty scan if unexpected. |
| State transition | `pdf=unknown -> pending`; `pdf=pending -> missing`; `job.conversion=not_started -> pending`. |
| Decision point | Whether a file is a PDF; whether an existing PDF is still present; whether an existing job should be updated. |
| External interaction | Local folder read, file stat, state file write. |
| Input/output artifact | Input PDF metadata; output state/job record. |
| Evidence snapshot | Folder path, PDF count, job count, changed IDs, missing IDs. |
| Diagnostic context | OS error, permissions, absolute paths, scan duration, state file path. |

---

## Workflow 5 — Zoho PDF download detection and mapping import

### 1. Workflow name

Zoho PDF download detection and mapping import.

### 2. Business or technical purpose

Detect a PDF downloaded from Zoho CRM, resolve the related Zoho Case URL, ask the user to confirm whether it is an “acta de homologación”, and import that mapping into Python job state.

### 3. Trigger

Chrome emits `chrome.downloads.onCreated` for a PDF while the active tab is a relevant Zoho CRM page.

### 4. Entry point in code

- `autohom-extension/background-zoho.js`
  - `chrome.downloads.onCreated`
  - `resolveTaskUrl(url)`
  - `saveMapping(downloadId, pendingKey)`
- `sidepanel.js`
  - `handlePendingDownload(...)`
  - `handlePendingAction(...)`
- `http_server.py`
  - `handle_import_zoho_mapping`
- `job_store.py`
  - `create_or_update_from_zoho_mapping(...)`

### 5. Components involved

- Chrome downloads API.
- Chrome tabs API.
- Chrome storage session.
- Chrome storage local.
- Chrome notifications API.
- Chrome runtime messages.
- Side panel pending mapping UI.
- Python HTTP API.
- `JobStore`.
- Zoho CRM page.

### 6. Step-by-step execution path

1. Chrome detects a new download.
2. `background-zoho.js` checks whether the item looks like a PDF:
   - filename ends with `.pdf`
   - URL includes `.pdf`
   - MIME includes `pdf`
3. Extension queries the active current-window tab.
4. Extension resolves a Zoho Case URL:
   - direct `/tab/Cases/{id}` URL
   - `ViewAttachment` URL with `parentId` and `module=Cases`
5. If no Zoho Case URL is resolved, workflow exits silently.
6. Extension extracts a clean PDF filename.
7. Extension stores pending mapping under `chrome.storage.session[pending_{downloadId}]`.
8. Extension sends `DOWNLOAD_PENDING` to side panel.
9. Extension creates a Chrome notification with confirm/reject buttons.
10. User confirms mapping from notification or side panel.
11. `saveMapping(...)` reads the pending item.
12. Mapping is stored in `chrome.storage.local.mappings`.
13. Pending item is removed from session storage.
14. Extension posts to `http://localhost:7790/api/jobs/import-zoho-mapping`.
15. Python reads JSON body.
16. `JobStore.create_or_update_from_zoho_mapping` creates or updates a job.
17. Job receives:
    - `source = zoho`
    - `pdf_filename`
    - `zoho_url`
    - `download_id`
    - `statuses.zoho = mapped`
    - `statuses.conversion = pending` if PDF identity exists
18. `JobStore` appends `job.updated`.
19. Extension sends `MAPPING_SAVED`.
20. Side panel refreshes.

### 7. Expected final state

- Pending mapping is removed from session storage.
- Mapping is saved in Chrome local storage.
- Python job exists or is updated.
- Job has `zoho_url`.
- `statuses.zoho = mapped`.
- Side panel shows mapped job.

### 8. Intermediate states

- `download.detected`
- `download.pdf_candidate`
- `zoho.active_tab_checked`
- `zoho.url_resolved`
- `mapping.pending_saved`
- `mapping.user_prompted`
- `mapping.confirmed`
- `mapping.rejected`
- `mapping.local_saved`
- `mapping.import_requested`
- `mapping.imported`
- `job.zoho.mapped`

### 9. External systems involved

- Zoho CRM website.
- Chrome downloads API.
- Chrome tabs API.
- Chrome notifications.
- Chrome storage.
- Local Python HTTP API.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- Zoho CRM active tab.
- Download item metadata.
- `chrome.storage.session`.
- `chrome.storage.local`.
- Chrome notification UI.
- `POST /api/jobs/import-zoho-mapping`.
- `state.json` through `JobStore`.

### 11. Success signals

- Pending card appears in side panel.
- User confirms mapping.
- `MAPPING_SAVED` message sent.
- Python endpoint returns `ok: true`.
- Job shows mapped status.
- Job event `job.updated` with “Zoho mapping imported”.

### 12. Failure signals

- Download not recognized as PDF.
- Active tab is not the Zoho tab related to the download.
- `resolveTaskUrl` returns null.
- Filename extraction fails.
- Notification not shown or dismissed.
- Side panel not open and notification interaction not used.
- `saveMapping` returns because pending item missing.
- Python API not running.
- Fetch to Python fails silently.
- Job is saved in Chrome storage but not imported to Python.
- Mapping matches wrong job due filename normalization.
- Duplicate mappings.

### 13. Current visibility

- Pending items appear in side panel.
- Chrome notification prompts the user.
- Mapping is stored in Chrome local storage.
- Python job receives `job.updated`.
- Fetch to Python is wrapped in `try/catch` but errors are swallowed.

### 14. Missing visibility

- No event for ignored non-PDF downloads.
- No event for active tab mismatch.
- No decision evidence for `resolveTaskUrl`.
- No confirmation that Python import succeeded.
- No durable failure if Python import fails.
- No replay/retry mechanism for mappings saved locally but not imported.
- No correlation between Chrome `downloadId` and Python `job_id`.
- No diagnostic for duplicate or overwritten mapping.

### 15. Recommended observability points

- `zoho.download.created`
- `zoho.download.pdf_detected`
- `zoho.download.ignored_non_pdf`
- `zoho.active_tab.resolved`
- `zoho.active_tab.unusable`
- `zoho.task_url.resolved`
- `zoho.task_url.unresolved`
- `mapping.pending.created`
- `mapping.notification.created`
- `mapping.confirmed`
- `mapping.rejected`
- `mapping.local.saved`
- `mapping.import.start`
- `mapping.import.success`
- `mapping.import.failure`
- `job.zoho.state_transition`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | At beginning of `chrome.downloads.onCreated` handler. |
| Step event | PDF detection, active tab query, Zoho URL resolution, pending save, notification create, user confirmation, Python import. |
| Success event | After Python responds successfully and job is imported. |
| Failure event | Non-PDF skip, unresolved Zoho URL, pending missing, Python fetch failure, import error. |
| State transition | `mapping=detected -> pending -> confirmed/rejected -> imported`; `job.zoho=not_mapped -> mapped`. |
| Decision point | Is this download a PDF? Is active tab a valid Zoho task? Which URL should be mapped? |
| External interaction | Chrome downloads/tabs/storage/notifications; Zoho page URL; Python HTTP API. |
| Input/output artifact | Download metadata, pending mapping, local mapping, Python job mapping. |
| Evidence snapshot | Download ID, filename, active tab URL, resolved task URL, pending key, Python response. |
| Diagnostic context | Current window/tab ID, Chrome download item, exception from fetch, job ID returned by Python. |

---

## Workflow 6 — Direct PDF-to-Excel conversion action

### 1. Workflow name

Direct PDF-to-Excel conversion action.

### 2. Business or technical purpose

Allow the user to convert a selected PDF job into an Excel file using the iLovePDF browser automation agent without explicitly running a configured flow.

### 3. Trigger

User clicks “Convertir PDF” on a job card in the side panel.

### 4. Entry point in code

- `sidepanel.js`
  - `handleJobAction('convert', jobId)`
- `http_server.py`
  - `handle_convert_pdf`
- `multi_agent_ws_server.py`
  - `send_agent_request(...)`
- `bridge.js`
  - WebSocket `onmessage` for `CONVERT_PDF`
- `runtime.js`
  - `ILovePDFRuntime.queueConversion(...)`

### 5. Components involved

- Side panel.
- Python HTTP API.
- `JobStore`.
- `MultiAgentWebSocketServer`.
- `AgentRegistry`.
- WebSocket bridge.
- Chrome extension bridge.
- `ILovePDFRuntime`.
- Later: iLovePDF browser automation workflow.

### 6. Step-by-step execution path

1. User clicks `Convertir PDF`.
2. Side panel sends `POST /api/jobs/{job_id}/actions/convert-pdf`.
3. Python retrieves the job.
4. Python validates job exists.
5. Python validates the job has `pdf_id` or `pdf_path`.
6. Python checks `ilovepdf-converter` agent is connected.
7. Python updates job status:
   - `conversion = queued`
   - message: “Conversion queued from HTTP action”
8. Python sends WebSocket request to `ilovepdf-converter`:
   - `action = CONVERT_PDF`
   - `jobId`
   - `pdfId`
   - `filename`
9. WebSocket request receives `requestId`.
10. Python waits up to 15 seconds for:
    - `CONVERT_PDF_ACK`, or
    - `CONVERSION_STATUS`
11. Extension bridge receives `CONVERT_PDF`.
12. Bridge queues conversion in `ILovePDFRuntime`.
13. Bridge sends `CONVERT_PDF_ACK`.
14. Python resolves waiter and returns response to side panel.
15. Side panel shows “Conversion enviada”.
16. Runtime continues asynchronously.

### 7. Expected final state

Immediate expected final state:

- HTTP request returns `ok: true`.
- Job status is `conversion = queued`.
- Extension runtime queue contains or starts the conversion.
- Bridge sent `CONVERT_PDF_ACK`.

Longer final state belongs to Workflow 8 and Workflow 9:

- Job eventually becomes `completed` or `error`.

### 8. Intermediate states

- `user_action.convert.clicked`
- `http.convert.received`
- `job.validating`
- `agent.validating`
- `job.conversion.queued`
- `ws.command.sent`
- `ws.waiting_ack`
- `bridge.command.received`
- `runtime.queue.enqueued`
- `ws.ack.sent`
- `http.convert.accepted`

### 9. External systems involved

- Local HTTP API.
- Local WebSocket.
- Chrome extension service worker.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `POST /api/jobs/{job_id}/actions/convert-pdf`
- `JobStore`
- `state.json`
- WebSocket message `CONVERT_PDF`
- WebSocket message `CONVERT_PDF_ACK`
- Runtime in-memory queue
- No iLovePDF page yet at this direct workflow boundary.

### 11. Success signals

- API response `ok: true`.
- Job event `conversion.status` or equivalent status update to `queued`.
- Job event `command.sent`.
- WebSocket ACK received.
- Runtime logs `queue.enqueued`.
- Side panel toast shows conversion sent.

### 12. Failure signals

- Job not found.
- Job has no `pdf_id` or `pdf_path`.
- Agent not connected.
- WebSocket not available.
- WebSocket send fails.
- Timeout waiting for ACK/status.
- Unexpected response action.
- Extension receives command but fails before queueing.
- Duplicate/in-flight queue issue not visible.

### 13. Current visibility

- Python returns HTTP errors for validation.
- `JobStore.update_job_status` records `conversion.status`.
- `send_agent_request` appends `command.sent`.
- On timeout, it appends `command.timeout`.
- Extension logs `Received CONVERT_PDF`.
- Runtime logs `queue.enqueued`.

### 14. Missing visibility

- No single trace ID from side panel click to runtime queue.
- No explicit event for each validation decision.
- No queue state snapshot returned to Python.
- No durable extension-side ACK reason/context.
- No record of whether runtime was already busy.
- No mapping between HTTP request ID and WebSocket request ID.
- No evidence package for “HTTP succeeded but browser never converted”.

### 15. Recommended observability points

- `user.action.convert.clicked`
- `http.convert.start`
- `job.validation.success/failure`
- `agent.validation.success/failure`
- `job.conversion.state_transition`
- `ws.command.send.start`
- `ws.command.sent`
- `ws.command.ack.received`
- `ws.command.timeout`
- `bridge.command.received`
- `runtime.queue.enqueued`
- `runtime.queue.snapshot`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | Side panel before POST; Python at start of `handle_convert_pdf`. |
| Step event | Job lookup, PDF validation, agent validation, job status update, WS send, bridge receive, queue enqueue, ACK send. |
| Success event | Python receives ACK/status and returns `ok: true`; extension confirms queue enqueue. |
| Failure event | Validation failure, agent disconnected, WS send failure, timeout, unexpected ACK. |
| State transition | `conversion=not_started/pending -> queued`; `queue=idle -> enqueued/running`. |
| Decision point | Whether job is convertible; whether agent is connected; whether response action is acceptable. |
| External interaction | HTTP request, WebSocket command, Chrome extension queue. |
| Input/output artifact | Job command payload and ACK payload. |
| Evidence snapshot | Job before/after, agent list, queue state, WS request ID. |
| Diagnostic context | HTTP request ID, WebSocket request ID, job ID, PDF ID, filename, agent type, timeout boundary. |

---

## Workflow 7 — Configured `pdf_to_excel` flow execution

### 1. Workflow name

Configured `pdf_to_excel` flow execution.

### 2. Business or technical purpose

Run a defined workflow from `flows.json` that converts a PDF job to Excel through an agent step. This is the project’s formal flow orchestration path.

### 3. Trigger

User clicks “Ejecutar flujo” on a job card.

### 4. Entry point in code

- `sidepanel.js`
  - `handleJobAction('run-flow', jobId)`
- `http_server.py`
  - `handle_run_flow`
- `flow_orchestrator.py`
  - `start_flow(...)`
  - `run_flow(...)`
  - `run_step(...)`
- `flows/flows.json`
  - flow id: `pdf_to_excel`

### 5. Components involved

- Side panel.
- Python HTTP API.
- `FlowOrchestrator`.
- `JobStore`.
- `MultiAgentWebSocketServer`.
- `ilovepdf-converter` agent.
- `flows.json`.
- Daemon thread running the flow.
- Runtime conversion workflow.

### 6. Step-by-step execution path

1. User clicks “Ejecutar flujo”.
2. Side panel sends `POST /api/jobs/{job_id}/flows/run` with `flowId: pdf_to_excel`.
3. Python validates the job exists.
4. Python selects `flow_id`.
5. `FlowOrchestrator.start_flow(flow_id, job_id)` creates a flow run.
6. `JobStore.create_flow_run` creates `run_{timestamp}` with status `started`.
7. `start_flow` spawns a daemon thread for `run_flow`.
8. HTTP response returns `ok: true`, `flow_run_id`, `status: started`.
9. `run_flow` reloads the job and flow definition.
10. If job/flow is missing, run becomes `error`.
11. Job `flow` status becomes `running`.
12. Event `flow.started` is appended.
13. For each step in `flows.json`:
    - Validate required fields.
    - Validate required agent is connected.
    - Append `step.started`.
    - Send WebSocket command.
    - Wait for `CONVERT_PDF_ACK`, `CONVERSION_STATUS`, or `UPLOAD_EXCEL_ACK`.
    - Append `command.ack` if acknowledged.
14. For `CONVERT_PDF`:
    - Job conversion status becomes `queued`.
    - Flow waits up to 180 seconds for `conversion=completed`.
15. If completion is observed:
    - step result becomes `completed`
    - event `step.completed` is appended
16. If any step fails:
    - job flow status becomes `error`
    - event `flow.failed`
    - flow run status becomes `error`
17. If all steps complete:
    - job flow status becomes `completed`
    - event `flow.completed`
    - flow run status becomes `completed`

### 7. Expected final state

- A `flow_run` exists.
- Job status `flow` becomes `completed`.
- Job status `conversion` becomes `completed`.
- Job has `excel_path` or downloaded filename evidence.
- Flow step result is completed.

### 8. Intermediate states

- `flow.requested`
- `flow_run.created`
- `flow.thread.started`
- `flow.definition.loaded`
- `flow.running`
- `step.validating_required_fields`
- `step.validating_agent`
- `step.started`
- `command.sent`
- `command.acknowledged`
- `conversion.queued`
- `flow.waiting_for_conversion`
- `step.completed`
- `flow.completed`
- `flow.failed`
- `flow.timeout`

### 9. External systems involved

- Local HTTP API.
- Local WebSocket.
- Chrome extension agent.
- iLovePDF browser automation.
- Local filesystem/PDF file via downstream workflow.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `POST /api/jobs/{job_id}/flows/run`
- `flows/flows.json`
- `state.json`
- WebSocket `CONVERT_PDF`
- Runtime queue
- iLovePDF page and downloads indirectly through Workflow 8

### 11. Success signals

- HTTP returns `flow_run_id`.
- Job event `flow.started`.
- Job event `step.started`.
- Job event `command.ack`.
- Job event `step.completed`.
- Job event `flow.completed`.
- Flow run status `completed`.
- Conversion status `completed`.

### 12. Failure signals

- Job not found.
- Flow not found.
- Required fields missing:
  - `pdf_id`
  - `pdf_filename`
- Agent not connected.
- WebSocket timeout.
- Unexpected response action.
- Conversion reaches `error`.
- Conversion never reaches `completed` within 180 seconds.
- Daemon thread dies without visible exception.
- Extension reports success after flow has already timed out.

### 13. Current visibility

- Flow events are appended to the job.
- Step results are stored.
- Flow run status is stored.
- WebSocket command events are stored.
- Timeout is returned as a failure.
- Side panel can view recent job logs.

### 14. Missing visibility

- No explicit trace ID shared with extension.
- No run/thread lifecycle event.
- No per-step elapsed duration.
- No flow definition snapshot inside the run.
- No expected-vs-actual state transition record.
- No reasoned decision log for field validation.
- No checkpoint event during 180-second wait.
- No “late success after timeout” reconciliation.
- No exception capture inside the daemon thread boundary.
- No flow-level diagnostic package.

### 15. Recommended observability points

- `flow.request.received`
- `flow.run.created`
- `flow.thread.started`
- `flow.definition.loaded`
- `flow.step.validation.start`
- `flow.step.validation.failure`
- `flow.step.agent_check.success/failure`
- `flow.step.command.sent`
- `flow.step.command.ack`
- `flow.step.wait.start`
- `flow.step.wait.progress`
- `flow.step.wait.timeout`
- `flow.step.completed`
- `flow.completed`
- `flow.failed`
- `flow.thread.exception`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | `handle_run_flow` before calling `start_flow`; `start_flow` when creating run. |
| Step event | Flow definition load, required-field validation, agent validation, WS send, ACK, wait start, wait poll checkpoints. |
| Success event | `flow.completed` and `flow_run.status=completed`. |
| Failure event | Missing job/flow, missing fields, agent disconnected, WS timeout, conversion error, 180-second timeout, thread exception. |
| State transition | `flow=idle -> running -> completed/error`; `flow_run=started -> running -> completed/error`; `conversion=queued -> completed/error`. |
| Decision point | Which flow ID to run; whether required fields exist; whether agent connected; whether waited status counts as success. |
| External interaction | WebSocket command, downstream browser automation. |
| Input/output artifact | Flow definition, command payload, ACK/status payload, step result. |
| Evidence snapshot | Job before run, flow definition, run ID, step list, latest job state at timeout. |
| Diagnostic context | Thread ID, timeout boundary, polling interval, expected statuses, actual latest status. |

---

## Workflow 8 — iLovePDF browser automation runtime

### 1. Workflow name

iLovePDF browser automation runtime.

### 2. Business or technical purpose

Actually perform PDF-to-Excel conversion through the iLovePDF website using Chrome tabs, content scripts, DOM automation, and Chrome download confirmation.

This is the most fragile and highest-risk workflow.

### 3. Trigger

`ILovePDFRuntime.queueConversion(...)` receives a PDF descriptor from:

- WebSocket bridge handling `CONVERT_PDF`, or
- Extension router handling `ILOVEPDF_CONVERT`.

### 4. Entry point in code

- `autohom-extension/ilovepdf-background/runtime.js`
  - `queueConversion(...)`
  - `_processNext()`
  - `_waitForDownloadPage(...)`
- `autohom-extension/ilovepdf-background/tabManager.js`
  - `findOrCreateILovePDFTab(...)`
  - `waitForContentScript(...)`
- `autohom-extension/ilovepdf/content.js`
  - `handleStartConversion(...)`
  - `handleStartDownload(...)`
- `autohom-extension/ilovepdf/pdfUploader.js`
  - `uploadPdf(...)`
  - `downloadPdfBlob(...)`
- `autohom-extension/ilovepdf/conversionAutomator.js`
  - `startConversion(...)`
  - `startDownload(...)`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
  - `waitForExpectedDownload(...)`

### 5. Components involved

- Extension service worker.
- `ILovePDFRuntime`.
- `ILovePDFTabManager`.
- `ILovePDFDownloadTracker`.
- iLovePDF content script.
- Site profile and selectors.
- DOM helpers.
- Python HTTP API serving the PDF.
- iLovePDF website.
- Chrome tabs API.
- Chrome downloads API.
- WebSocket bridge for final status.

### 6. Step-by-step execution path

1. Runtime enqueues PDF descriptor.
2. Runtime logs `queue.enqueued`.
3. `_processNext` exits if already running or queue is empty.
4. Runtime marks `_running = true`.
5. Runtime shifts the next PDF from queue.
6. Runtime sets `_currentPdfId` and `_currentJobId`.
7. Runtime broadcasts status `starting`.
8. Runtime calls `ILovePDFTabManager.findOrCreateILovePDFTab()`.
9. Tab manager loads site profile.
10. Tab manager queries existing iLovePDF tabs.
11. If an existing tab is found:
    - activate it
    - navigate it to upload page
    - wait for load
12. If no tab exists:
    - create a new iLovePDF tab
    - wait for load
13. Runtime waits for content script readiness using `PING`.
14. If not ready:
    - log warning
    - reload tab
    - wait
    - retry readiness
15. If still not ready:
    - throw “Content script not ready on upload page.”
16. Runtime sends `START_CONVERSION` to the tab.
17. iLovePDF content script receives `START_CONVERSION`.
18. Content script reports `uploading`.
19. `ILovePDFUploader.downloadPdfBlob` fetches:
    - `http://localhost:7790/api/pdfs/{pdf_id}/file`
20. Python serves the PDF file.
21. Content script creates a `File` from the blob.
22. Content script locates file input:
    - configured selector
    - upload button click + recheck
    - fallback `input[type="file"]`
23. Content script assigns file using `DataTransfer`.
24. Content script waits for upload ready indicator:
    - configured selector
    - semantic fallback
25. Content script reports `converting`.
26. `ILovePDFConversion.startConversion` waits for convert button:
    - configured selector
    - semantic fallback
27. Content script clicks convert.
28. Runtime waits for the same tab to reach a URL containing `/descarga/`.
29. Runtime waits for content script readiness on download page.
30. If not ready:
    - reload tab
    - wait
    - retry readiness
31. Runtime starts `ILovePDFDownloadTracker.waitForExpectedDownload`.
32. Runtime sends `START_DOWNLOAD` to the content script.
33. Content script reports `downloading`.
34. `ILovePDFConversion.startDownload` waits for download button:
    - configured selector
    - semantic fallback
35. Content script clicks download button.
36. Download tracker listens to `chrome.downloads.onCreated` and `onChanged`.
37. Download tracker matches candidate download by:
    - tab ID
    - time window
    - iLovePDF host
    - spreadsheet-like file type
    - normalized filename stem
38. Download tracker resolves when Chrome reports `state = complete`.
39. Runtime sends `CONVERSION_STATUS completed` to Python via bridge.
40. Runtime broadcasts `completed`.
41. Runtime clears current job/PDF state.
42. Runtime rate-limits before next queue item.
43. Runtime processes next queue item if any.

### 7. Expected final state

- Chrome confirms a completed spreadsheet-like download.
- Extension sends `CONVERSION_STATUS` with:
  - `status = completed`
  - `downloadedFilename`
  - `downloadId`
- Python updates job conversion status to `completed`.
- Job receives `excel_path` or downloaded filename evidence.
- Side panel shows conversion completed.

### 8. Intermediate states

- `queue.enqueued`
- `queue.start`
- `runtime.running`
- `tab.querying`
- `tab.reused`
- `tab.created`
- `tab.loading`
- `tab.ready`
- `content.ready.upload`
- `content.not_ready.upload`
- `pdf.fetch.start`
- `pdf.fetch.success`
- `upload.input_found`
- `upload.file_assigned`
- `upload.ready_indicator_found`
- `upload.ready_indicator_missing_continuing`
- `conversion.button_found`
- `conversion.button_clicked`
- `download_page.waiting`
- `download_page.ready`
- `content.ready.download`
- `download_tracker.started`
- `download.button_found`
- `download.button_clicked`
- `download.matching`
- `download.matched`
- `download.completed`
- `runtime.completed`
- `runtime.error`

### 9. External systems involved

- iLovePDF website.
- Chrome browser/tab runtime.
- Chrome downloads subsystem.
- Local Python HTTP API.
- Local filesystem through served PDF.
- Extension content scripts.
- WebSocket bridge.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- iLovePDF upload page:
  - `https://www.ilovepdf.com/es/pdf_a_excel`
- iLovePDF download page:
  - URL containing `/descarga/`
- `GET /api/pdfs/{pdf_id}/file`
- Runtime in-memory queue.
- Chrome tabs API.
- Chrome downloads API.
- Chrome runtime messages:
  - `START_CONVERSION`
  - `START_DOWNLOAD`
  - `PING`
  - `ILOVEPDF_CONVERSION_RESULT`
  - `ILOVEPDF_PROGRESS`
  - `ILOVEPDF_SELECTOR_FALLBACK`
  - `ILOVEPDF_SELECTOR_BROKEN`
- WebSocket message:
  - `CONVERSION_STATUS`

### 11. Success signals

- Runtime status `starting -> converting -> downloading -> completed`.
- Content script returns success for phase 1.
- Current tab URL reaches `/descarga/`.
- Content script is ready on download page.
- Download tracker matches a spreadsheet-like download.
- Chrome reports download `complete`.
- Bridge sends completed status.
- Python job status becomes `completed`.

### 12. Failure signals

- Runtime stuck running.
- Queue item replaced or lost due service worker lifecycle.
- Tab cannot be created.
- Existing tab navigation fails.
- Content script not ready.
- `chrome.tabs.sendMessage` channel closes unexpectedly.
- Python `/api/pdfs/{pdf_id}/file` returns 404.
- File input selector not found.
- Upload ready indicator not found.
- Convert button not found.
- iLovePDF page never reaches `/descarga/`.
- Tab closes before download page.
- Content script not ready on download page.
- Download button not found.
- Download starts but tracker does not match it.
- Download is interrupted.
- Download confirmation times out.
- Bridge cannot send final status.
- Python records status but not output filename/path.
- Status update by HTTP succeeds but WS final status fails.

### 13. Current visibility

- Runtime logs queue and phase messages.
- Runtime sends progress to side panel.
- Runtime posts status updates to `/api/pdfs/{pdf_id}/status`.
- Content script logs phase events.
- Selector fallback/broken alerts are sent to router and persisted in Chrome storage.
- Download tracker logs started, matched, resolved/rejected.
- Bridge sends final `CONVERSION_STATUS`.
- Python updates job status and records events.

### 14. Missing visibility

- No durable cross-component trace ID for the whole browser automation.
- No DOM snapshot on selector failure.
- No screenshot on failure.
- No selector result table.
- No content script readiness attempt history in Python diagnostics.
- No tab state snapshot on failure.
- No download candidate list when matching fails.
- No proof of successful PDF fetch metadata:
  - content length
  - blob size
  - response status
- No queue state persisted outside service worker memory.
- No service-worker lifecycle correlation.
- No late/final reconciliation between HTTP PDF status updates and WS final status.
- No browser evidence attached to job diagnostics.

### 15. Recommended observability points

- Runtime:
  - `runtime.queue.enqueued`
  - `runtime.queue.dequeued`
  - `runtime.current.set`
  - `runtime.phase.starting`
  - `runtime.phase.converting`
  - `runtime.phase.downloading`
  - `runtime.phase.completed`
  - `runtime.phase.error`
- Tab manager:
  - `tab.query.start`
  - `tab.reuse.decision`
  - `tab.create.start/success/failure`
  - `tab.navigate.start/success/failure`
  - `content_script.ping.attempt`
  - `content_script.ready`
  - `content_script.not_ready`
- Content script:
  - `content.phase1.received`
  - `pdf.fetch.start/success/failure`
  - `upload.input.selector_result`
  - `upload.file.assigned`
  - `upload.ready_indicator.result`
  - `convert.button.selector_result`
  - `convert.button.clicked`
  - `content.phase2.received`
  - `download.button.selector_result`
  - `download.button.clicked`
- Download tracker:
  - `download.wait.started`
  - `download.candidate.seen`
  - `download.match.decision`
  - `download.matched`
  - `download.completed`
  - `download.interrupted`
  - `download.timeout`
- Evidence:
  - `browser.evidence.snapshot`
  - `browser.screenshot.failure`
  - `dom.snapshot.failure`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | `ILovePDFRuntime.queueConversion` and `_processNext` when queue item starts. |
| Step event | Tab selection, content readiness, PDF fetch, upload, convert click, download page wait, download tracker, download click, download completion. |
| Success event | Chrome download complete and final `CONVERSION_STATUS completed` sent. |
| Failure event | Every thrown runtime/content/download error and every timeout. |
| State transition | `runtime=idle -> queued -> running -> waiting_tab -> uploading -> converting -> waiting_download_page -> downloading -> completed/error`. |
| Decision point | Reuse/create tab; reload tab; selector fallback; ignore phase2 channel-closed error; match download candidate. |
| External interaction | iLovePDF DOM, Python file API, Chrome tabs/downloads/runtime, WebSocket. |
| Input/output artifact | Input PDF blob/file metadata; output download metadata. |
| Evidence snapshot | URL, tab ID, page title, document ready state, selector table, download candidates, runtime queue. |
| Diagnostic context | Timing constants, selector profile, attempt counts, elapsed times, active job/PDF IDs. |

---

## Workflow 9 — Conversion status propagation and state persistence

### 1. Workflow name

Conversion status propagation and state persistence.

### 2. Business or technical purpose

Keep Python state, job state, PDF state, and UI status synchronized with the real conversion lifecycle reported by extension runtime and content scripts.

### 3. Trigger

- Runtime broadcasts status changes:
  - `starting`
  - `converting`
  - `downloading`
  - `completed`
  - `error`
- Content script reports conversion result:
  - `uploading`
  - `converting`
  - `downloading`
  - `error`
- Bridge sends final `CONVERSION_STATUS`.
- Runtime posts status to Python HTTP `/api/pdfs/{pdf_id}/status`.

### 4. Entry point in code

- `runtime.js`
  - `_broadcastStatus(...)`
  - `_updatePythonStatus(...)`
- `content.js`
  - `reportStatus(...)`
- `router.js`
  - `ILOVEPDF_CONVERSION_RESULT`
- `bridge.js`
  - `sendStatus(...)`
- `multi_agent_ws_server.py`
  - `_handle_conversion_status(...)`
- `http_server.py`
  - `handle_update_status`
- `state_manager.py`
  - `set_pdf_status(...)`
- `job_store.py`
  - `update_job_status(...)`
  - `set_excel_path(...)`
  - `append_event(...)`

### 5. Components involved

- iLovePDF content script.
- Extension runtime.
- Extension router.
- Extension bridge.
- Python WebSocket server.
- Python HTTP API.
- `StateManager`.
- `JobStore`.
- Side panel refresh loop.

### 6. Step-by-step execution path

1. Runtime or content script emits a status.
2. Runtime sends progress to side panel with `ILOVEPDF_PROGRESS`.
3. Runtime posts to Python:
   - `POST /api/pdfs/{pdf_id}/status`
4. Python updates PDF status in `StateManager`.
5. Python finds matching job by `pdf_id`.
6. Python updates job conversion status.
7. Content script may send `ILOVEPDF_CONVERSION_RESULT` to background router.
8. Router forwards non-completed statuses to Python through WebSocket `CONVERSION_STATUS`.
9. Runtime sends final completed/error status through `ILovePDFBridge.sendStatus`.
10. Python `_handle_conversion_status`:
    - updates PDF status
    - updates job conversion status
    - sets `excel_path` if completed and an output filename/path is present
    - appends `conversion.status` event
11. Side panel refreshes and shows new status.

### 7. Expected final state

- PDF state and job state agree.
- Job conversion status reflects latest real state.
- On completion:
  - conversion is `completed`
  - `excel_path` or downloaded filename is stored
  - `converted_at` is set
- On failure:
  - conversion is `error`
  - `last_error` contains meaningful message
- Side panel displays accurate status.

### 8. Intermediate states

- `status.local_progress`
- `status.http_update.start`
- `status.http_update.success`
- `status.ws_update.start`
- `status.ws_update.success`
- `pdf.status.updated`
- `job.status.updated`
- `job.excel_path.set`
- `event.appended`
- `ui.status.refreshed`

### 9. External systems involved

- Local HTTP API.
- Local WebSocket.
- Chrome runtime messages.
- Local state file.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `POST /api/pdfs/{pdf_id}/status`
- WebSocket `CONVERSION_STATUS`
- `state.json`
- `JobStore`
- `StateManager`
- Side panel refresh endpoints

### 11. Success signals

- HTTP update does not throw.
- WebSocket status arrives in Python.
- `StateManager.set_pdf_status` returns true.
- `JobStore.update_job_status` returns true.
- `JobStore.set_excel_path` runs on completed status.
- Job event `conversion.status` appears.
- Side panel shows completed/error status.

### 12. Failure signals

- HTTP update to Python fails.
- WebSocket send fails.
- PDF ID not found.
- Job by PDF ID not found.
- Job ID missing in payload.
- Status order conflicts:
  - HTTP says `downloading`
  - WebSocket says `completed`
  - later HTTP/status overwrites state incorrectly
- Completed status has no output filename/path.
- `excel_path` stores only a downloaded filename, not full local path.
- `state.json` save failure.
- Side panel shows stale status.

### 13. Current visibility

- `handle_update_status` updates PDF and job.
- `_handle_conversion_status` appends `conversion.status`.
- `JobStore.update_job_status` appends domain status events.
- `StateManager` persists state.
- Side panel displays statuses and last error.

### 14. Missing visibility

- No versioned state transition ledger.
- No old-state/new-state record.
- No status source priority:
  - content script
  - runtime HTTP update
  - bridge WebSocket final update
- No idempotency or stale-status detection.
- No consistency check between PDF and job states.
- No evidence of state write success per update.
- No diagnostic for “completed without output artifact”.
- No reconciliation event when both HTTP and WebSocket status updates arrive.

### 15. Recommended observability points

- `status.emit.start`
- `status.emit.http.start/success/failure`
- `status.emit.ws.start/success/failure`
- `pdf.status.transition`
- `job.conversion.transition`
- `job.excel_path.set`
- `state.persist.success/failure`
- `status.consistency.check`
- `status.stale_ignored`
- `status.conflict.detected`
- `status.completed_missing_artifact`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | Runtime/content script before reporting each status. |
| Step event | HTTP status post, router forward, bridge send, Python receive, state update, event append. |
| Success event | State and job both updated consistently. |
| Failure event | HTTP fetch failure, WS send failure, unknown PDF/job, state save error, missing output artifact. |
| State transition | `conversion=queued -> starting/uploading/converting/downloading/completed/error`; PDF status same. |
| Decision point | Whether to update by `jobId` or find by `pdfId`; whether status is newer or stale; whether to set Excel path. |
| External interaction | HTTP POST, WebSocket send/receive, state file write. |
| Input/output artifact | Status payload; downloaded filename/path; state record after update. |
| Evidence snapshot | Previous job/PDF status, new status, source component, payload, persistence result. |
| Diagnostic context | Correlation ID, job ID, PDF ID, status source, timestamp, ordering, old/new values. |

---

## Workflow 10 — Job diagnostics and recent event viewing

### 1. Workflow name

Job diagnostics and recent event viewing.

### 2. Business or technical purpose

Allow the user to inspect recent events for a job and see enough context to understand why a workflow succeeded or failed.

### 3. Trigger

User clicks “Ver logs” on a job card.

### 4. Entry point in code

- `sidepanel.js`
  - `handleJobAction('logs', jobId)`
- `http_server.py`
  - `handle_job_diagnostics`
- `job_store.py`
  - `get_recent_errors(...)`
- `multi_agent_ws_server.py`
  - `list_agents()`

### 5. Components involved

- Side panel.
- Python HTTP API.
- `JobStore`.
- `MultiAgentWebSocketServer`.
- Agent registry.
- Job events.

### 6. Step-by-step execution path

1. User clicks “Ver logs”.
2. Side panel calls `GET /api/jobs/{job_id}/diagnostics`.
3. Python retrieves job by ID.
4. If missing, Python returns 404.
5. Python returns:
   - job object
   - job events
   - connected agents
   - recent errors
6. Side panel takes the last eight events.
7. Side panel renders event name and message lines in the log container.
8. Side panel refreshes all data.

### 7. Expected final state

- User can see recent job event summaries.
- Diagnostics include enough signal to identify failure phase.
- Agent list reflects current connection state.

### 8. Intermediate states

- `diagnostics.requested`
- `diagnostics.job_loaded`
- `diagnostics.events_loaded`
- `diagnostics.agents_loaded`
- `diagnostics.recent_errors_loaded`
- `diagnostics.rendered`
- `diagnostics.not_found`
- `diagnostics.failed`

### 9. External systems involved

- Local HTTP API only.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `GET /api/jobs/{job_id}/diagnostics`
- `state.json` through `JobStore`
- Agent registry snapshot
- No browser automation interaction
- No WebSocket send

### 11. Success signals

- API returns `ok: true`.
- Job object present.
- Event list present.
- Side panel displays log entries.

### 12. Failure signals

- Job not found.
- Python unreachable.
- Empty events for failed job.
- Recent errors unrelated to selected job.
- Diagnostic output too shallow to identify browser/DOM/download failure.
- Only last eight lines shown, hiding relevant early failure context.

### 13. Current visibility

- Job object.
- Job event list.
- Agent list.
- Recent errors.
- Side panel displays last eight events.

### 14. Missing visibility

- No unified per-job timeline with all cross-component events.
- No browser evidence.
- No screenshots or DOM snapshots.
- No state transition ledger.
- No HTTP/WS request correlation.
- No flow run detail expansion.
- No downloadable diagnostic package.
- No compact “root cause candidates” summary.
- No event severity or component field in current job events.
- No timeline sorting by monotonic timestamps across JS/Python.

### 15. Recommended observability points

- `diagnostics.request.start`
- `diagnostics.request.success/failure`
- `diagnostics.timeline.built`
- `diagnostics.package.exported`
- `diagnostics.missing_evidence`
- `diagnostics.root_cause_candidate`
- Include:
  - current job snapshot
  - status transitions
  - flow run snapshot
  - agent snapshot
  - bridge recent events
  - runtime queue snapshot
  - browser evidence
  - selector alerts
  - download tracker evidence
  - file metadata

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | Side panel before diagnostics fetch; Python at start of handler. |
| Step event | Job lookup, event retrieval, agent retrieval, error retrieval, response building, UI render. |
| Success event | Diagnostics response delivered and rendered. |
| Failure event | Job not found, backend unreachable, malformed response, missing expected diagnostic sections. |
| State transition | `diagnostic_view=idle -> loading -> rendered/error`. |
| Decision point | Which events to show; whether to include only last eight or full timeline; whether evidence is sufficient. |
| External interaction | HTTP GET. |
| Input/output artifact | Diagnostics JSON. |
| Evidence snapshot | Job state, events, agents, recent errors. |
| Diagnostic context | Job ID, event count, current statuses, missing evidence categories. |

---

## Workflow 11 — Open Zoho action from job card

### 1. Workflow name

Open Zoho action from job card.

### 2. Business or technical purpose

Let the user quickly open the Zoho Case page associated with a mapped job.

### 3. Trigger

User clicks “Abrir Zoho” on a job card.

### 4. Entry point in code

- `sidepanel.js`
  - `handleJobAction('open-zoho', jobId)`
- `http_server.py`
  - `handle_open_zoho`

### 5. Components involved

- Side panel.
- Python HTTP API.
- `JobStore`.
- Chrome tabs API.
- Zoho CRM page.

### 6. Step-by-step execution path

1. User clicks “Abrir Zoho”.
2. Side panel sends `POST /api/jobs/{job_id}/actions/open-zoho`.
3. Python retrieves job.
4. Python validates job exists.
5. Python validates job has `zoho_url`.
6. Python returns `zohoUrl`.
7. Side panel creates a new Chrome tab with that URL.

### 7. Expected final state

- A new Chrome tab opens the mapped Zoho Case URL.

### 8. Intermediate states

- `open_zoho.clicked`
- `open_zoho.requested`
- `job.zoho_url.validated`
- `tab.open_requested`
- `tab.opened`

### 9. External systems involved

- Chrome tabs API.
- Zoho CRM page.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `POST /api/jobs/{job_id}/actions/open-zoho`
- Chrome `tabs.create`
- Zoho CRM URL
- `state.json` read through `JobStore`

### 11. Success signals

- API returns `ok: true`.
- `zohoUrl` is present.
- Chrome opens new tab.

### 12. Failure signals

- Job not found.
- Job has no `zoho_url`.
- Invalid or stale Zoho URL.
- Chrome tab creation fails.
- User not logged into Zoho.

### 13. Current visibility

- HTTP validation errors.
- Button disabled if no `zoho_url`.
- No durable event for tab opened.

### 14. Missing visibility

- No `open_zoho` action event.
- No Chrome tab open success/failure record.
- No validation of URL structure.
- No user-facing diagnostic if Zoho login/session blocks access.

### 15. Recommended observability points

- `user.action.open_zoho.clicked`
- `open_zoho.validation.success/failure`
- `open_zoho.tab.create.start/success/failure`
- `open_zoho.url.invalid`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | Side panel button click. |
| Step event | Job lookup, URL validation, tab create call. |
| Success event | Chrome tab created. |
| Failure event | Missing job, missing URL, invalid URL, Chrome tab creation error. |
| State transition | `open_zoho=idle -> requested -> opened/failed`. |
| Decision point | Whether button should be enabled; whether URL is safe/valid. |
| External interaction | Chrome tabs API, Zoho URL. |
| Input/output artifact | `zoho_url`. |
| Evidence snapshot | Job ID, Zoho URL, tab ID if created. |
| Diagnostic context | Current Chrome profile/session, URL host/path, API response. |

---

## Workflow 12 — Disabled/future Site2 upload boundary

### 1. Workflow name

Disabled/future Site2 upload boundary.

### 2. Business or technical purpose

Represent the planned second stage where an Excel file produced from a PDF would be uploaded to another site or service. The route and flow definition exist, but the implementation is not complete.

### 3. Trigger

- User clicks “Enviar a Site2”.
- Future flow `pdf_to_excel_to_site2` is enabled and run.

### 4. Entry point in code

- `sidepanel.js`
  - `handleJobAction('site2', jobId)`
- `http_server.py`
  - `handle_send_excel_site2`
- `flows/flows.json`
  - disabled flow `pdf_to_excel_to_site2`

### 5. Components involved

- Side panel.
- Python HTTP API.
- `JobStore`.
- Planned `site2-uploader` agent.
- Future external Site2 page/API.
- Flow orchestrator in future.

### 6. Step-by-step execution path

Current path:

1. User clicks “Enviar a Site2”.
2. Side panel calls `POST /api/jobs/{job_id}/actions/send-excel-site2`.
3. Python validates job exists.
4. Python validates `excel_path` exists.
5. Python checks whether `site2-uploader` agent is connected.
6. Python currently returns `501 site2-uploader flow is not implemented yet`.

Future flow path:

1. User runs `pdf_to_excel_to_site2`.
2. Flow converts PDF first.
3. Flow validates `excel_path`.
4. Flow sends `UPLOAD_EXCEL` to `site2-uploader`.
5. Site2 agent uploads Excel.
6. Site2 response is recorded.

### 7. Expected final state

Current expected state:

- If user tries this action, system should clearly indicate not implemented.

Future expected state:

- Excel file uploaded to Site2.
- Job `site2` status becomes `completed` or `error`.
- Site2 response artifact is recorded.

### 8. Intermediate states

Current:

- `site2.requested`
- `site2.validating_job`
- `site2.validating_excel_path`
- `site2.validating_agent`
- `site2.not_implemented`

Future:

- `site2.queued`
- `site2.uploading`
- `site2.waiting_response`
- `site2.completed`
- `site2.error`

### 9. External systems involved

Current:

- Local HTTP API only.

Future:

- Site2 browser page or API.
- Planned browser automation agent.
- Local Excel file.

### 10. Files, APIs, databases, browser pages, sockets, queues, or services touched

- `POST /api/jobs/{job_id}/actions/send-excel-site2`
- Future WebSocket command `UPLOAD_EXCEL`
- Future Excel file path
- Future Site2 page/service
- `flows.json`

### 11. Success signals

Current:

- Clear `501` response explains not implemented.

Future:

- Site2 upload acknowledged.
- Job status `site2 = completed`.
- Response artifact stored.

### 12. Failure signals

Current:

- Job not found.
- Missing `excel_path`.
- Missing `site2-uploader` agent.
- Not implemented response.

Future:

- Excel file missing on disk.
- Agent disconnected.
- Upload selector/API failure.
- Site2 rejects file.
- Site2 response not captured.
- Flow continues despite failed upload.

### 13. Current visibility

- HTTP response returns explicit errors.
- Button disabled if no `site2-uploader` agent.
- Flow definition is disabled in `flows.json`.

### 14. Missing visibility

- No clear diagnostic event for attempted not-implemented path.
- No design contract for future `UPLOAD_EXCEL`.
- No expected input/output artifact definition.
- No observability boundary for future Site2.
- No component contract between Python flow and Site2 agent.

### 15. Recommended observability points

- Current:
  - `site2.action.requested`
  - `site2.action.rejected.not_implemented`
  - `site2.action.rejected.missing_excel`
  - `site2.action.rejected.agent_missing`
- Future:
  - `site2.upload.command.sent`
  - `site2.upload.ack`
  - `site2.upload.started`
  - `site2.upload.completed`
  - `site2.upload.failed`
  - `site2.response.captured`
  - `site2.artifact.recorded`

### Event placement for this workflow

| Event type | Where to record |
|---|---|
| Start event | Side panel button click and Python handler start. |
| Step event | Job lookup, Excel path validation, agent check, not-implemented response. |
| Success event | Current: explicit rejection as not implemented. Future: upload completed. |
| Failure event | Missing job, missing Excel path, agent disconnected, future upload failure. |
| State transition | Current: `site2=not_started -> not_implemented_attempted`; future: `site2=queued -> uploading -> completed/error`. |
| Decision point | Whether feature is enabled; whether job has Excel; whether agent exists. |
| External interaction | Current: none beyond HTTP. Future: Site2 page/API and file upload. |
| Input/output artifact | Excel path and future Site2 response. |
| Evidence snapshot | Job state, Excel path, agent list, flow enabled flag. |
| Diagnostic context | Feature flag/flow enabled status, expected agent type, response status code. |

---

# 3. Cross-workflow observability requirements

This section does not design the final implementation. It lists what must be observable across the critical workflows.

## 3.1 Required correlation IDs

Every workflow event should carry as many of these IDs as available:

- `trace_id`
- `job_id`
- `flow_run_id`
- `pdf_id`
- `request_id`
- `reply_to`
- `agent_id`
- `agent_type`
- `runtime_instance_id`
- `connection_id`
- `sidepanel_session_id`
- `tab_id`
- `download_id`
- `pending_mapping_key`
- `chrome_download_id`

## 3.2 Required state machines to observe

### Backend state

- `backend = starting | ws_listening | http_listening | ready | shutting_down | stopped | error`

### Agent state

- `agent = disconnected | socket_connected | handshake_received | connected | stale | pinging | disconnected | duplicate_runtime | error`

### Job conversion state

- `conversion = not_started | pending | queued | starting | uploading | converting | downloading | completed | error`

### Flow state

- `flow = idle | requested | running | waiting_for_conversion | completed | error | timeout`

### Runtime queue state

- `runtime_queue = idle | enqueued | running | waiting_tab | waiting_content | uploading | converting | waiting_download_page | waiting_download | completed | error`

### Tab/content state

- `tab = none | creating | created | reusing | navigating | loading | ready | closed | error`
- `content_script = unknown | pinging | ready | not_ready | reloading | failed`

### Download state

- `download = not_tracking | tracking_started | candidate_seen | matched | complete | interrupted | timeout | replaced | cancelled`

### Mapping state

- `mapping = detected | pending | confirmed | rejected | imported | import_failed`

## 3.3 Required decision points

The following decisions must be recorded with inputs, rule, result, and rejected alternatives when useful:

1. Is a Chrome download a PDF?
2. Is the active tab a valid Zoho CRM Case or attachment URL?
3. Which Zoho URL should be mapped to the PDF?
4. Should a job be created or updated from a mapping?
5. Should a job be considered convertible?
6. Is the required agent connected?
7. Which iLovePDF tab should be reused or created?
8. Should the tab be reloaded because the content script is not ready?
9. Which selector strategy found the upload/convert/download target?
10. Is a channel-closed error ignorable or fatal?
11. Does a Chrome download candidate match the expected Excel output?
12. Should a status update be accepted, ignored as stale, or treated as conflicting?
13. Should a flow wait continue, fail, or time out?
14. Should Site2 action be disabled/rejected/not implemented?

## 3.4 Required external interactions

The following external boundaries must be observable:

- HTTP requests from side panel to Python.
- HTTP requests from content/runtime to Python.
- WebSocket messages between Python and extension.
- Chrome runtime messages between service worker, side panel, and content scripts.
- Chrome tabs creation/update/reload/sendMessage.
- Chrome downloads created/changed/search.
- Chrome storage session/local reads and writes.
- Zoho CRM page URL and download metadata.
- iLovePDF page URL, DOM selectors, and buttons.
- Local filesystem reads/writes.
- State file persistence.

## 3.5 Required input/output artifacts

For each critical job, diagnostics should eventually include metadata for:

### Input artifacts

- PDF ID.
- PDF filename.
- PDF absolute path.
- File exists.
- File size.
- Modified time.
- Optional safe hash prefix.
- Zoho URL if mapped.
- Download ID if created from Zoho.

### Output artifacts

- Excel/download filename.
- Chrome download ID.
- Final URL if available.
- Download state.
- Output path if available.
- Job `excel_path`.
- Site2 response later.

### Runtime artifacts

- Flow definition snapshot.
- Command payload.
- ACK/status payload.
- Selector profile.
- Timing constants.
- Tab ID and URL.
- Download candidates.

## 3.6 Required evidence snapshots

At minimum, failure diagnostics should capture:

- Job snapshot before action.
- Job snapshot after failure.
- Agent registry snapshot.
- Bridge state and recent connection events.
- Flow run and step results.
- Runtime queue state.
- Tab state:
  - tab ID
  - URL
  - title
  - loading status
- Content script readiness attempts.
- Selector result table:
  - selector name
  - configured selector
  - match count
  - visible count
  - fallback strategy
- Compact DOM summary.
- Screenshot on browser automation failure.
- Chrome download tracker state.
- Download candidate list.
- Local file metadata.
- State persistence status.

## 3.7 Required diagnostic context

Every failure event should include:

- What was expected.
- What actually happened.
- Last known successful phase.
- Component that detected failure.
- Component that caused or likely caused failure, if known.
- Elapsed time since workflow start.
- Timeout boundary, if applicable.
- Relevant IDs.
- Relevant external system state.
- User-visible impact.
- Suggested next evidence to inspect.

---

# 4. Highest-risk workflow surfaces

## 4.1 Highest risk overall

1. iLovePDF browser automation runtime.
2. Configured flow execution waiting for conversion completion.
3. WebSocket bridge and agent registration/reconnect.
4. Zoho download detection and mapping import.
5. Conversion status propagation and state persistence.

## 4.2 Hardest to reproduce

1. Service worker lifecycle/reconnect issues.
2. Chrome tab/content script not ready.
3. iLovePDF DOM selector changes.
4. Chrome download matching timeouts.
5. Active Zoho tab mismatch during download detection.
6. Race between flow timeout and late conversion completion.

## 4.3 Hardest to debug without new observability

1. HTTP request succeeds but browser automation fails later.
2. Extension receives command but runtime loses queue state.
3. Content script sends progress but WebSocket final status is missing.
4. iLovePDF reaches download page but Chrome download is not matched.
5. Mapping saved in Chrome local storage but not imported to Python.
6. Job state shows `queued` forever.

## 4.4 Most important for the user

1. Convert selected PDF to Excel.
2. Run `pdf_to_excel` flow.
3. Scan local PDF folder and see jobs.
4. Map Zoho PDFs to their Case URLs.
5. View enough diagnostics to know why a job failed.

## 4.5 Most important for system correctness

1. WebSocket command/request/reply correlation.
2. Job state transitions.
3. Flow run state transitions.
4. Browser automation evidence.
5. Download confirmation.
6. State persistence and consistency between PDF/job/flow state.

---

# 5. Recommended next artifact after this map

The next phase should **not** immediately implement random logs.

The next artifact should be:

```text
observability_points_spec.md
```

It should convert this workflow map into a precise event catalog:

- event names
- required fields
- optional fields
- components that emit each event
- severity levels
- correlation IDs
- expected/actual schema
- compact evidence rules
- failure snapshot rules
- retention limits

Only after that should implementation begin.
