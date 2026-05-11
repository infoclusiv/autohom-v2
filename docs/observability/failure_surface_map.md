# Failure Surface Map — AutoHom v2

Repository: `infoclusiv/autohom-v2`  
Branch reviewed: `main`  
Output artifact: `failure_surface_map.md`  
Scope: failure-surface discovery only. No application code was modified.

## Required inputs read

- `docs/observability/project_understanding.md`
- `docs/observability/observability_classification.md`
- `docs/observability/critical_workflows.md`

## Evidence baseline

This map connects the documented critical workflows to concrete runtime components in the project:

- Python backend: `app.py`, `http_server.py`, `multi_agent_ws_server.py`, `agent_registry.py`, `state_manager.py`, `job_store.py`, `flow_orchestrator.py`, `pdf_scanner.py`, `flows/flows.json`.
- Chrome extension: `background-main.js`, `background-zoho.js`, `content.js`, `sidepanel.js`, `ilovepdf-background/bridge.js`, `ilovepdf-background/runtime.js`, `ilovepdf-background/tabManager.js`, `ilovepdf-background/downloadTracker.js`, `ilovepdf-background/router.js`, `ilovepdf/content.js`, `ilovepdf/pdfUploader.js`, `ilovepdf/conversionAutomator.js`, `ilovepdf/domHelpers.js`, `ilovepdf/config.js`.

This is **not** an implementation plan and does **not** add telemetry code. It defines where the system can fail and what exact evidence would be needed later for AI-ready diagnosis.

---

## 1. Executive summary

AutoHom v2 has a high-risk failure profile because one user action can cross all of these boundaries:

```text
side panel click
  -> local HTTP API
  -> Python job state
  -> WebSocket command
  -> Chrome extension service worker
  -> in-memory conversion queue
  -> Chrome tab
  -> iLovePDF content script
  -> local PDF fetch from Python
  -> DOM upload and conversion button
  -> third-party iLovePDF navigation
  -> Chrome download events
  -> WebSocket status back to Python
  -> state.json persistence
  -> side panel refresh
```

The highest-priority failure surfaces are:

1. **WebSocket command accepted but browser automation does not complete.**  
   Expected: `CONVERT_PDF_ACK` is followed by `CONVERSION_STATUS completed/error`.  
   Actual symptom: job stays `queued`, `converting`, or flow times out.

2. **Content script or DOM selector failure inside iLovePDF.**  
   Expected: upload input, convert button, download page, and download button are available and actionable.  
   Actual symptom: timeout, selector fallback, no `/descarga/` navigation, or no confirmed Excel download.

3. **Download tracking ambiguity.**  
   Expected: the expected Excel download is matched to the same PDF/job and completed by Chrome.  
   Actual symptom: download exists but job remains error/queued, wrong file is matched, tracker times out, or the app stores only a filename without enough output evidence.

4. **State persistence and state-transition ambiguity.**  
   Expected: every job and PDF moves through valid states and persists to `state.json`.  
   Actual symptom: app continues running with reset/default state, missing jobs, truncated events, or status transitions that hide the root cause.

5. **Zoho mapping appears saved in the extension but is not imported into Python.**  
   Expected: pending mapping confirmation creates or updates a Python job with `zoho_url`.  
   Actual symptom: user sees or remembers confirming a mapping, but the job is missing or not mapped in the side panel.

6. **Side panel masks backend/API failure as an empty or stale UI.**  
   Expected: UI distinguishes “backend unreachable” from “zero jobs”.  
   Actual symptom: user sees no jobs/agents or stale state without a diagnostic trail.

---

## 2. Priority scale

| Priority | Meaning |
|---|---|
| P0 | Blocks the main PDF-to-Excel outcome or can leave the system in a misleading/invalid state. Must be observable first. |
| P1 | Common or high-impact failure that makes diagnosis difficult but may not always block the whole system. |
| P2 | Important secondary workflow failure or usability diagnostic gap. |
| P3 | Future/disabled boundary or lower-frequency issue. |

---

## 3. Failure matrix

| Workflow | Component | Failure point | Expected condition | Actual failure symptom | Required evidence | Required state | Required logs/events | Reproduction strategy | Priority |
|---|---|---|---|---|---|---|---|---|---|
| Python orchestrator startup and backend readiness | `app.py` / OS ports | HTTP port `7790` or WS port `8769` already in use | Backend binds both ports and becomes ready | Python exits, side panel shows disconnected, extension reconnect loop starts | Port, process ID, bind exception, host/port config | `backend=starting`, `ws=listening?`, `http=listening?` | `process.start`, `ws.server.bind.failure`, `http.server.bind.failure`, config snapshot | Start a second instance or bind ports with dummy server | P0 |
| Python orchestrator startup and backend readiness | `StateManager` | `state.json` missing, corrupt, unreadable, or overwritten by default state | Existing state loads and keeps jobs/PDFs/flow runs/events | App starts but jobs disappear or state silently resets | State file path, parse error/OSError, previous file metadata, default-state fallback reason | Before/after state version, job count, PDF count, flow run count | `state.load.start`, `state.load.failure`, `state.default_created`, `state.load.success` | Corrupt `state.json` or remove read permission | P0 |
| Python orchestrator startup and backend readiness | `FlowOrchestrator` | `flows/flows.json` missing or invalid | `/api/flows` lists valid flows, especially `pdf_to_excel` | Side panel shows no flows or run-flow fails later | Flow file path, JSON parse error, flow count, requested flow ID | `flows_ready=false`, available flow IDs | `flow.config.load.failure`, `flow.config.empty`, `flow.config.success` | Rename or corrupt `flows.json` | P1 |
| Chrome extension bootstrap, WebSocket bridge, and agent registration | `background-main.js` / `bridge.js` | Extension service worker import/bootstrap fails | Bridge code loads and attempts WebSocket connection | Agent never appears; no conversion possible | Import error, module name, extension version, service worker start ID | `service_worker=starting/importing/failed` | `extension.bootstrap.start`, `extension.bootstrap.failure`, `bridge.connect.not_attempted` | Break an imported script path or simulate module error | P0 |
| Chrome extension bootstrap, WebSocket bridge, and agent registration | `bridge.js` / `multi_agent_ws_server.py` | WebSocket cannot connect to `ws://localhost:8769` | Agent opens socket and sends `AGENT_CONNECTED` | Side panel shows no agent; Python bridge state disconnected | WS URL, close/error event, reconnect attempt, Python bridge state | `agent=disconnected`, reconnect timer/alarm state | `bridge.ws.connect.attempt`, `bridge.ws.error`, `bridge.reconnect.scheduled`, `ws.connection.open?` | Stop Python and open extension | P0 |
| Chrome extension bootstrap, WebSocket bridge, and agent registration | `multi_agent_ws_server.py` / `AgentRegistry` | Invalid handshake or duplicate runtime rejected | One valid `ilovepdf-converter` runtime registers | Socket opens then closes with policy/duplicate reason; conversion later says agent not connected | Handshake payload summary, `runtimeInstanceId`, `connection_id`, close code/reason | Agent registry before/after, bridge status | `ws.handshake.received`, `agent.registration.failure`, `agent.duplicate_runtime`, `ws.connection.close` | Open duplicate service workers or send malformed handshake in WS harness | P1 |
| Chrome extension bootstrap, WebSocket bridge, and agent registration | Keepalive / WebSocket waiter | Agent becomes stale after service-worker suspension or network interruption | Keepalive detects stale agent and removes/reconnects cleanly | Python thinks agent exists but commands timeout, or agent disappears mid-conversion | Last seen time, keepalive ping request ID, PONG absence, close reason | Agent `last_seen`, registry entry, pending request waiters | `agent.keepalive.ping`, `agent.keepalive.timeout`, `agent.disconnected`, `command.timeout` | Suspend extension service worker or kill Chrome tab/service worker during run | P0 |
| Side panel refresh and user action dispatch | `sidepanel.js` / HTTP API | Backend unreachable during refresh | UI marks backend disconnected and preserves diagnostic context | Jobs/agents may appear empty or stale; user cannot tell if there are zero jobs or a fetch failed | Endpoint, HTTP status/exception, previous render state, batch request ID | `ui=refreshing`, `backend=unknown/disconnected`, previous jobs count | `sidepanel.refresh.start`, `sidepanel.refresh.endpoint.failure`, `sidepanel.backend.disconnected` | Stop Python while side panel is open | P1 |
| Side panel refresh and user action dispatch | `sidepanel.js` | User action button fails after click | Action click creates durable action event and API response is shown | Toast may show error but no backend event links click to workflow | Action type, job ID, endpoint, request/response, toast text | `action=clicked/sent/accepted/failed`, job state before/after | `user.action.clicked`, `user.action.request_sent`, `user.action.response_received`, `user.action.failed` | Click convert/run-flow with Python stopped or invalid job | P1 |
| Local PDF folder configuration, scan, and job synchronization | `http_server.py` / `tkinter` | Native folder dialog unavailable or cancelled | Dialog either returns selected folder or records cancel/unavailable | Folder stays unchanged; user may think selection failed silently | Initial folder, exception, selected flag, current folder before/after | `folder_dialog=opened/cancelled/unavailable`, current folder | `folder.dialog.opened`, `folder.dialog.cancelled`, `folder.dialog.failure` | Run in environment without GUI or cancel dialog | P2 |
| Local PDF folder configuration, scan, and job synchronization | `http_server.py` / filesystem | Invalid folder path or permission denied | Folder path exists and can be scanned | API returns `Folder not found` or scan returns no jobs/errors | Absolute folder path, `os.path.isdir`, permission/OSError details | Current folder before/after, scan result count | `folder.validation.failure`, `scan.failure`, `scan.permission_denied` | Use nonexistent/protected folder | P1 |
| Local PDF folder configuration, scan, and job synchronization | `pdf_scanner.py` / `StateManager.merge_scanned_pdfs` | PDF disappears or is renamed after scan | Registered PDF still exists when conversion starts | Job exists but `/api/pdfs/{pdf_id}/file` returns 404 | PDF ID, filename, last known path, file stat before scan and before serve | PDF `status=pending/missing`, job `pdf_path`, file existence | `pdf.file.discovered`, `pdf.file.missing`, `serve_pdf.file_not_found` | Delete or rename PDF after scan before conversion | P0 |
| Local PDF folder configuration, scan, and job synchronization | `StateManager.make_pdf_id` | PDF ID collision because ID is basename-derived | Each unique file maps to a stable unique PDF/job | Two PDFs with same basename collide or overwrite path/state | Filename, filepath, generated PDF ID, duplicate candidate list | PDF map before/after merge, job IDs affected | `pdf.id.generated`, `pdf.id.collision`, `job.sync.updated` | Put same filename in different folders or rescan changed folder | P1 |
| Local PDF folder configuration, scan, and job synchronization | `StateManager._save` | State save fails but app continues | State changes persist to disk or fail visibly | UI shows current in-memory state, but restart loses changes | OSError, state file path, operation that triggered save | Before/after persisted state metadata, in-memory mutation result | `state.save.start`, `state.save.failure`, `state.save.success` | Make state file/folder read-only | P0 |
| Zoho PDF download detection and mapping import | `background-zoho.js` / Chrome downloads | PDF download not detected as PDF | PDF download triggers pending mapping when Zoho tab is active | User downloads an acta but no pending card/notification appears | Download item filename/url/mime, active tab URL, detection decision | Pending storage before/after, download ID | `zoho.download.created`, `zoho.download.ignored`, `zoho.pdf.detected` | Trigger PDF with missing filename extension or unusual MIME | P1 |
| Zoho PDF download detection and mapping import | `background-zoho.js` / active tab | Active tab is not the originating Zoho Case tab | Mapping uses the correct Zoho Case URL for the downloaded PDF | Pending mapping absent or linked to wrong active Case | Download source URL, active tab URL, all Zoho tabs, resolved task URL | Pending mapping record, `zoho_url`, download ID | `zoho.task_url.resolve.decision`, `zoho.mapping.pending.created`, `zoho.mapping.rejected.no_task_url` | Start download then switch active tab before event handling | P0 |
| Zoho PDF download detection and mapping import | `resolveTaskUrl` | Zoho URL pattern not supported | Direct Case URL or `ViewAttachment` resolves to `/tab/Cases/{id}` | Download is ignored; no Python job/mapping created | Raw active tab URL, parsed path/query, parentId/module/org extraction | `taskUrl=null`, pending key absent | `zoho.task_url.resolve.failure`, `zoho.download.ignored.not_relevant` | Use a Zoho URL variant not matching direct or ViewAttachment | P1 |
| Zoho PDF download detection and mapping import | Chrome storage/session | Pending mapping lost before confirmation | Pending record remains until user confirms/rejects | User sees no pending item or confirmation does nothing | Pending key, storage session get/set/remove results, capturedAt | Pending mapping before/after, side panel pending list | `mapping.pending.store.success`, `mapping.pending.missing`, `mapping.confirm.requested` | Reload extension/service worker before confirming | P1 |
| Zoho PDF download detection and mapping import | `saveMapping` / Python import endpoint | Fetch to `/api/jobs/import-zoho-mapping` fails and is swallowed | Mapping saved locally and imported into Python, or failure remains visible | Chrome local mapping exists but Python job is not mapped | Fetch status/error, request body summary, Python API response, local mapping ID | Chrome local mappings, Python job by filename, job `zoho_url` | `mapping.local.saved`, `mapping.import.request`, `mapping.import.failure`, `job.zoho_mapping.imported` | Stop Python, then confirm mapping | P0 |
| Direct PDF-to-Excel conversion action | `http_server.py` | Job has no `pdf_id` or `pdf_path` | Only jobs with a valid PDF are convertible | API returns 400; UI button may still be available | Job snapshot, source, PDF fields, action request | Job statuses before/after; no conversion state transition | `convert.validation.failure`, `expected.pdf_present`, `actual.pdf_missing` | Create Zoho-only mapping with no scanned PDF and click convert | P1 |
| Direct PDF-to-Excel conversion action | `http_server.py` / WS bridge | `ilovepdf-converter` not connected | Convert action only dispatches when agent connected | API returns 400 or job remains pending | Agent list, bridge state, job ID, action time | `agent.connected=false`, job conversion unchanged | `convert.validation.agent_missing`, `bridge.state.snapshot` | Stop/disconnect extension and click convert | P0 |
| Direct PDF-to-Excel conversion action | `multi_agent_ws_server.py` | WebSocket send succeeds but no expected response within 15s | `CONVERT_PDF_ACK` or `CONVERSION_STATUS` arrives for request ID | API returns 500; job status becomes `error`; extension may later continue | `requestId`, payload, expected actions, timeout, agent registry, WS close events | Pending waiter before/after, job conversion before/after | `command.sent`, `command.timeout`, `conversion.status?`, `agent.last_seen` | Delay/drop ACK in mock agent | P0 |
| Direct PDF-to-Excel conversion action | `bridge.js` / `runtime.js` | Agent ACKs command but queued runtime never completes | ACK is followed by progress and final status | Job stays queued/converting until manual refresh or flow timeout | ACK payload, queue state, current job/PDF, runtime errors, tab state | Runtime `_running`, `_queue.length`, `_currentJobId`, job conversion status | `queue.enqueued`, `queue.start`, `runtime.error`, `conversion.status.final_missing` | Inject runtime error after ACK or close service worker | P0 |
| Configured `pdf_to_excel` flow execution | `flow_orchestrator.py` | Flow ID not found or `flows.json` empty | Requested flow exists and contains valid steps | Flow run becomes error or endpoint returns started but no useful action | Requested flow ID, available flow IDs, flow config load result | Flow run status, job flow status | `flow.start.requested`, `flow.config.missing`, `flow.not_found` | Request invalid `flowId` | P1 |
| Configured `pdf_to_excel` flow execution | `FlowOrchestrator.run_step` | Required fields missing for step | Job has all fields listed in step `requires` | Step fails with missing fields; flow becomes error | Step definition, required fields, job snapshot | Job fields before step, flow run status | `step.precondition.check`, `step.failed.missing_fields`, `flow.failed` | Run flow on job without `pdf_id`/filename | P1 |
| Configured `pdf_to_excel` flow execution | `FlowOrchestrator` / WS | Step command timeout or unexpected response | Agent responds with expected action and matching request ID | Step fails; flow status error; command may later complete outside flow | Request ID, expected actions, actual action, payload, elapsed time | Flow run status, job conversion status, pending waiter | `step.started`, `command.sent`, `command.timeout`, `command.unexpected_response`, `flow.failed` | Mock delayed agent response beyond 15s | P0 |
| Configured `pdf_to_excel` flow execution | `wait_for_job_status` | Conversion completion arrives after 180s timeout | Conversion reaches `completed` before flow timeout | Flow error says timeout; later job may become completed, creating contradictory state | Flow run timeline, conversion status timeline, final status arrival time | Job `flow=error` while `conversion=completed`, flow run `last_error` | `flow.wait.start`, `flow.wait.timeout`, `conversion.status.completed_late`, `state.conflict.detected` | Make iLovePDF conversion slow beyond 180s | P0 |
| iLovePDF browser automation runtime | `ILovePDFTabManager` / Chrome tabs | iLovePDF tab cannot be created/reused or wrong tab is used | Runtime has an iLovePDF tab with content script target | Runtime errors or sends messages to wrong/non-ready tab | Tab ID, URL, creation/reuse decision, active tab list | Runtime current job/PDF, tab state | `tab.find_or_create.start`, `tab.reused`, `tab.created`, `tab.invalid_url`, `tab.failure` | Close tab during conversion or use wrong URL | P0 |
| iLovePDF browser automation runtime | `runtime.js` / content readiness | Content script not ready on upload or download page after reload | `PING` to content script returns ready | Error: `Content script not ready on upload/download page` | Tab URL, ready check attempts, reload result, content script response/error | `content_ready=false`, tab status, runtime phase | `content.ready.check`, `content.not_ready`, `tab.reload`, `content.ready.failure` | Disable content script match or block script injection | P0 |
| iLovePDF browser automation runtime | `pdfUploader.js` / Python serve endpoint | PDF blob fetch fails | `/api/pdfs/{pdf_id}/file` returns PDF blob | Upload phase errors with HTTP status, or job status error | PDF ID, download URL, HTTP status, response text summary, file path exists | PDF state, job `pdf_id`, file metadata | `pdf.fetch.start`, `pdf.fetch.failure`, `serve_pdf.pdf_not_found`, `serve_pdf.file_missing` | Delete file after scan or call with invalid `pdf_id` | P0 |
| iLovePDF browser automation runtime | `pdfUploader.js` / DOM | File input cannot be found or file assignment does not trigger upload | Configured selector or fallback finds file input and upload is accepted | Error: `Could not find file input`; or upload unconfirmed but system continues | Selector profile, selector match counts, DOM summary, file object metadata | Runtime phase `uploading`, content URL | `selector.file_input.check`, `file.assign.attempt`, `upload.confirmation.timeout`, `selector.broken` | Change selector or use iLovePDF page variant | P0 |
| iLovePDF browser automation runtime | `conversionAutomator.js` | Convert button not found | Configured selector/fallback finds clickable convert target | Error: `Botón Convertir no encontrado...`; job status error | Selector values, candidates, visibility/disabled state, screenshot | Runtime phase `converting`, DOM state | `selector.convert_button.check`, `selector.fallback.used`, `selector.broken.convertButton`, `phase1.error` | Change page language/layout or selector | P0 |
| iLovePDF browser automation runtime | `runtime.js` | Page never reaches `/descarga/` | After convert click, tab completes at URL containing `/descarga/` | Timeout waiting for `/descarga/`; tab closed error | Tab update events, current URL sequence, timeout value, page title | Runtime phase `waiting_download_page`, tab state | `download_page.wait.start`, `tab.updated`, `download_page.timeout`, `tab.closed` | Block navigation or close tab after convert click | P0 |
| iLovePDF browser automation runtime | `conversionAutomator.js` | Download button missing but `startDownload` returns success after warning | If no clickable download button, failure should be explicit or tracker should prove actual download | System proceeds to wait for Chrome download and times out later; root cause becomes ambiguous | Selector/candidate data, warning `download_missing_auto`, whether click happened | Runtime phase `download_requested`, tracker active | `selector.download_button.check`, `phase2.download_missing_auto`, `download.click.not_performed`, `download.tracker.timeout` | Remove/change download button selector | P0 |
| iLovePDF browser automation runtime | `downloadTracker.js` | Expected download is not matched | Chrome download from iLovePDF/same tab/spreadsheet/expected stem is matched | Tracker times out even if a file downloaded; or wrong file matched | Download candidates, tab ID, expected stem, start time, finalUrl, mime, state | Tracker `_active`, matchedDownloadId, timeout, download item state | `download.wait.started`, `download.candidate.evaluated`, `download.matched`, `download.rejected.reason`, `download.timeout` | Start unrelated download during conversion or alter filename | P0 |
| iLovePDF browser automation runtime | `downloadTracker.js` | Tracker is replaced while another conversion is active | Sequential runtime ensures one active tracker per conversion | Active tracker rejected as `replaced`; previous job errors or loses final state | Previous active tracker, new PDF ID, queue state, replacement reason | `_active`, `_queue`, `_running`, current job/PDF | `download.tracker.replaced`, `queue.state.snapshot`, `runtime.concurrent_guard` | Force overlapping conversions or call tracker directly twice | P0 |
| iLovePDF browser automation runtime | `bridge.js` | Final `CONVERSION_STATUS` cannot be sent because WS closed | Final status reaches Python and updates job | Extension logs failed send; Python keeps job stale/queued/error from earlier phase | WS readyState, status payload, reconnect state, job ID/PDF ID | Bridge connected flag, job status in Python | `conversion.status.send.attempt`, `conversion.status.send.failure`, `bridge.ws.close`, `status.delivery.pending` | Disconnect Python just before download completes | P0 |
| Conversion status propagation and state persistence | `runtime.js` `_updatePythonStatus` | HTTP status update to `/api/pdfs/{pdf_id}/status` fails and warning is only console-side | Python receives intermediate status updates | Side panel may not show progress; job only updates if final WS status arrives | Fetch exception/status, pdf ID, status payload | PDF status before/after, job conversion status | `python_status.update.attempt`, `python_status.update.failure`, `conversion.progress.lost` | Stop Python during intermediate upload/converting update | P1 |
| Conversion status propagation and state persistence | `multi_agent_ws_server.py` | `CONVERSION_STATUS` has `pdfId`/`jobId` mismatch or missing | Status updates the intended PDF and job exactly once | PDF updates but job does not, or global state is inconsistent | Incoming payload, resolved job, resolved PDF, state update results | Job/PDF before/after, event appended or not | `conversion.status.received`, `conversion.status.unmatched_pdf`, `conversion.status.unmatched_job`, `state.update.result` | Send status with missing/wrong IDs in WS harness | P0 |
| Conversion status propagation and state persistence | `JobStore.set_excel_path` | Completed status stores `downloadedFilename` as `excel_path`, not necessarily a verified local absolute path | Completed job has verified Excel output metadata | UI shows completed but file path may be ambiguous or not openable | Download result filename/path/finalUrl, Chrome downloads item, local existence if accessible | `excel_path`, `download_id`, `converted_at`, output file metadata | `excel.output.recorded`, `excel.output.verified`, `excel.output.path_ambiguous` | Complete conversion and inspect stored path vs actual file path | P1 |
| Conversion status propagation and state persistence | `JobStore` events | Event buffer truncates relevant root-cause events | Diagnostic package preserves causal chain for the job/run | “Ver logs” shows only recent tail; early failure context missing | Full event count, truncation count, job event count, last N range | Job events, global events, ring-buffer limit | `diagnostics.events.truncated`, `event.buffer.snapshot`, `trace.gap.detected` | Generate >200 job events or >1000 global events | P2 |
| Job diagnostics and recent event viewing | `/api/jobs/{job_id}/diagnostics` | Diagnostics lacks browser DOM/screenshot/queue/download evidence | Job diagnostics reconstructs cross-component timeline | User sees symptom but AI cannot identify selector/tab/download cause | Job events, agents, recent errors plus missing evidence flags | Job, agent registry, runtime queue, download tracker, tab/content state | `diagnostic.package.requested`, `diagnostic.evidence.missing`, `diagnostic.timeline.generated` | Click “Ver logs” after a browser automation failure | P1 |
| Job diagnostics and recent event viewing | `get_recent_errors` | Error filter only catches event names containing `error`/`failed` | All critical failures are classified and surfaced | Timeouts, warnings, selector fallback, ignored fetch failures may not appear as recent errors | Event names/severity, hidden warning count | Recent global events and job events | `error.index.updated`, `warning.promoted`, `diagnostics.error_filter.miss` | Trigger warning-only selector/download issue | P2 |
| Open Zoho action from job card | `handle_open_zoho` / side panel | Job has no `zoho_url` or URL invalid | Only mapped jobs expose open-Zoho action and URL is valid | API returns 400 or browser opens nothing/wrong page | Job snapshot, URL validation result, Chrome tab creation result | `zoho=mapped/not_mapped`, URL field | `open_zoho.requested`, `open_zoho.validation.failure`, `open_zoho.tab_created` | Click open-Zoho on unmapped/malformed job | P2 |
| Disabled/future Site2 upload boundary | `handle_send_excel_site2` | Site2 action is visible/triggered while not implemented or agent absent | User sees disabled/not implemented state before action | API returns 400/501; user may think workflow failed unexpectedly | Job `excel_path`, agent list, endpoint response, UI button availability | `site2=not_started`, `site2_agent_connected=false`, feature flag | `site2.action.requested`, `site2.not_implemented`, `site2.precondition.failure` | Click Site2 action after conversion | P3 |

---

## 4. Per-workflow failure surface notes

### Workflow 1 — Python orchestrator startup and backend readiness

**Where failures can happen**

- Loading `state.json`.
- Creating `StateManager`, `JobStore`, `MultiAgentWebSocketServer`, and `FlowOrchestrator`.
- Binding WebSocket port `8769`.
- Binding HTTP port `7790`.
- Reading `flows/flows.json` later through the flow orchestrator.

**Why they can happen**

- Port already in use.
- Missing dependency such as `websockets` or `aiohttp`.
- Corrupt or unreadable `state.json`.
- Invalid working directory.
- File permission restrictions.

**How the failure currently appears**

- Console output, Python exception, process exit, or side panel disconnected state.
- State load failure can be especially dangerous because default state may be used, making the app appear alive but empty.

**Evidence needed**

- Startup config snapshot: host/ports, state file path, flows file path, working directory, Python version.
- Component readiness flags: `state_ready`, `ws_ready`, `http_ready`, `flows_ready`.
- State file parse and save evidence.

**AI context needed**

- Which process was started, from which folder, with which ports and state file.
- Whether the UI symptom is “backend down” or “state reset”.

**Expected vs actual comparison**

- Expected: backend reaches `ready` with state and flows available.
- Actual: backend exits, listens partially, or starts with default/empty state.

**State before/after**

- Before: no backend process or previous persisted state.
- After: backend readiness state and state snapshot counts.

**Deterministic or intermittent**

- Port/dependency/state corruption failures are mostly deterministic.
- Race with another process binding a port can be intermittent.

**Dependencies**

- Timing: low.
- External systems: OS and filesystem.
- UI state: no.
- Files: high.
- Network: local TCP only.
- Permissions: high.

**Harness reproducibility**

- Yes. A backend startup harness can corrupt state, occupy ports, remove files, and assert readiness endpoints.

---

### Workflow 2 — Chrome extension bootstrap, WebSocket bridge, and agent registration

**Where failures can happen**

- `importScripts` in the service worker.
- WebSocket constructor/connect/open.
- `AGENT_CONNECTED` handshake.
- Agent registry duplicate-runtime handling.
- Keepalive PING/PONG.
- Service-worker suspension/reconnect.

**Why they can happen**

- Python backend not running.
- Extension service worker restarted by Chrome.
- Duplicate runtime instance after extension reload.
- Invalid or missing handshake fields.
- WebSocket closes while a command is in flight.

**How the failure currently appears**

- Agent not listed in `/api/agents`.
- `/api/bridge` says disconnected or stale.
- Convert endpoint returns `ilovepdf-converter agent not connected`.
- Command times out despite the extension appearing installed.

**Evidence needed**

- `runtimeInstanceId`, `connection_id`, close code/reason, reconnect attempt number.
- Agent registry before/after registration.
- Last PING/PONG and last successful command.

**AI context needed**

- Manifest V3 service workers are ephemeral; a disconnected agent may be a lifecycle event, not a code failure.
- The bridge has both timer reconnect and alarm reconnect.

**Expected vs actual comparison**

- Expected: `socket_open -> handshake_sent -> agent_registered -> keepalive_ok`.
- Actual: socket closes, registration rejected, or registry says connected while commands time out.

**State before/after**

- Before: no active agent or previous stale agent.
- After: one active `ilovepdf-converter` with recent `last_seen`.

**Deterministic or intermittent**

- Backend stopped is deterministic.
- Service-worker suspension, duplicate runtime, stale socket, and reconnect timing are intermittent.

**Dependencies**

- Timing: high.
- External systems: Chrome extension runtime.
- UI state: medium.
- Network: local WebSocket.
- Permissions: extension permissions.

**Harness reproducibility**

- Yes. Use a mock WebSocket client and controlled service-worker reload/disconnect scenarios.

---

### Workflow 3 — Side panel refresh and user action dispatch

**Where failures can happen**

- Opening the side panel.
- Loading pending downloads from `chrome.storage.session`.
- Fetching `/api/bridge`, `/api/jobs`, `/api/agents`, `/api/flows`, `/api/config`.
- Dispatching actions: convert, run flow, open Zoho, send site2, view logs.

**Why they can happen**

- Backend unreachable.
- API returns non-JSON or error JSON.
- UI action references stale job ID.
- Periodic refresh hides a failure by re-rendering old/empty data.

**How the failure currently appears**

- User sees empty/stale panel, disconnected state, or toast.
- There may be no durable event connecting the click to the backend workflow.

**Evidence needed**

- Side panel session ID.
- Refresh batch ID.
- Endpoint-level request/response summaries.
- Previous and new UI render state.
- User action ID correlated to job/flow ID.

**AI context needed**

- The side panel is not served by Python; it is extension UI calling `localhost:7790`.
- A visual empty state can mean backend down, zero jobs, or fetch failure.

**Expected vs actual comparison**

- Expected: each refresh endpoint returns valid data and render reflects backend state.
- Actual: one or more endpoints fail; UI becomes stale, empty, or misleading.

**State before/after**

- Before: previous render data.
- After: latest endpoint statuses and render counts.

**Deterministic or intermittent**

- Backend stopped is deterministic.
- Periodic refresh races and stale jobs are intermittent.

**Dependencies**

- Timing: medium.
- External systems: Chrome side panel and local HTTP.
- UI state: high.
- Network: local HTTP.

**Harness reproducibility**

- Yes. UI/API harness can simulate endpoint failures and stale job IDs.

---

### Workflow 4 — Local PDF folder configuration, scan, and job synchronization

**Where failures can happen**

- Native folder picker.
- Folder validation.
- Directory listing.
- PDF ID generation.
- Merge scanned PDFs into state.
- Create/update jobs from scanned PDFs.
- Save `state.json`.

**Why they can happen**

- Invalid path.
- Permission denied.
- Files renamed/deleted between scan and conversion.
- ID collision from basename-derived IDs.
- State save failure.

**How the failure currently appears**

- API error for invalid folder.
- Console print for scanning or state save errors.
- Job exists but file serve later returns 404.
- App continues in memory but data disappears after restart.

**Evidence needed**

- Folder path and file metadata: existence, size, modified time, optional hash prefix.
- Scan summary: found, registered, updated, missing.
- Job sync summary.
- State save result.

**AI context needed**

- A job can originate from scanner, Zoho mapping, or both.
- `pdf_id` is based on filename behavior, so collision/rename scenarios matter.

**Expected vs actual comparison**

- Expected: scanned PDFs become valid jobs with existing files.
- Actual: jobs point to missing files, duplicate IDs, or unpersisted state.

**State before/after**

- Before: current folder, PDF map, job map.
- After: scanned PDF list, missing marks, job statuses.

**Deterministic or intermittent**

- Invalid folder deterministic.
- File deletion/rename during workflow intermittent.

**Dependencies**

- Files: high.
- Permissions: high.
- User input: high.
- Timing: medium.

**Harness reproducibility**

- Yes. Use a temporary folder with controlled PDF create/delete/rename and read-only state file.

---

### Workflow 5 — Zoho PDF download detection and mapping import

**Where failures can happen**

- Chrome `downloads.onCreated` event.
- PDF detection by filename/url/MIME.
- Active-tab query.
- `resolveTaskUrl` extraction.
- `chrome.storage.session` pending mapping.
- Notification or side-panel confirmation.
- `saveMapping` local storage.
- Fetch to Python import endpoint.
- Python job matching by PDF ID or normalized filename.

**Why they can happen**

- Active tab is not the originating Zoho tab.
- Zoho URL pattern changed.
- Download item lacks reliable filename/MIME.
- Service worker/session storage loses pending record.
- Python is offline during confirmation.
- Fetch error is swallowed.

**How the failure currently appears**

- No pending card.
- Mapping appears saved in Chrome local storage but no Python job is mapped.
- Job is created without a local PDF path, so conversion later fails.

**Evidence needed**

- Download item summary.
- Active tab URL and resolved task URL decision.
- Pending key lifecycle.
- Import request/response to Python.
- Python job match decision.

**AI context needed**

- Mapping is initiated by Chrome download events, not by Python.
- The app assumes active tab context can identify the Zoho Case.

**Expected vs actual comparison**

- Expected: confirmed Zoho PDF creates/updates a Python job with `zoho_url`.
- Actual: pending mapping ignored/lost, wrong URL mapped, or import fails silently.

**State before/after**

- Before: no pending mapping or previous mappings.
- After: pending removed, local mapping saved, Python job has `zoho_url`.

**Deterministic or intermittent**

- Unsupported URL pattern deterministic.
- Active-tab mismatch and service-worker/session loss intermittent.

**Dependencies**

- Timing: high.
- External systems: Zoho CRM and Chrome downloads/storage.
- UI state: high.
- Network: local HTTP.
- User input: confirmation/rejection.

**Harness reproducibility**

- Partial. Chrome extension harness can simulate download events and active tabs; full Zoho behavior may need browser integration.

---

### Workflow 6 — Direct PDF-to-Excel conversion action

**Where failures can happen**

- Job validation.
- Agent-connected validation.
- Job status transition to `queued`.
- WebSocket `CONVERT_PDF` send.
- 15-second expected response wait.
- Unexpected response action.
- Agent ACKs but runtime fails later.

**Why they can happen**

- Job lacks `pdf_id`/`pdf_path`.
- Agent disconnected/stale.
- WebSocket closes mid-command.
- Extension receives command but cannot continue.
- Response arrives after timeout or without matching request ID.

**How the failure currently appears**

- HTTP 400/500.
- Job status changes to `error` for command timeout.
- Job stays `queued` or `converting` if ACK happens but final status does not.

**Evidence needed**

- Job snapshot before dispatch.
- Agent registry and bridge state.
- WebSocket message envelope: `requestId`, expected actions, timeout, actual response.
- Runtime queue state after ACK.

**AI context needed**

- HTTP success does not mean conversion completed; it may only mean command was accepted/ACKed.
- The actual conversion completes asynchronously in Chrome.

**Expected vs actual comparison**

- Expected: valid job + connected agent + ACK + final conversion status.
- Actual: validation failure, timeout, unexpected response, or no final status.

**State before/after**

- Before: job `conversion=pending/not_started`, agent connected.
- After: `queued -> converting -> completed/error` with matching events.

**Deterministic or intermittent**

- Missing job/PDF deterministic.
- ACK/final status timing intermittent.

**Dependencies**

- Timing: high.
- WebSocket: high.
- UI state: low/medium.
- Files: medium.
- External systems: Chrome extension.

**Harness reproducibility**

- Yes. Mock agent can ACK, delay, send unexpected action, or never respond.

---

### Workflow 7 — Configured `pdf_to_excel` flow execution

**Where failures can happen**

- Flow lookup.
- Flow run creation.
- Daemon thread startup.
- Step `requires` validation.
- Agent-connected check.
- WebSocket command wait.
- 180-second conversion completion wait.
- Flow run status persistence.

**Why they can happen**

- Invalid flow config.
- Missing job fields.
- Agent disconnected.
- Command timeout.
- Conversion completes after the flow timeout.
- Flow thread crashes without enough visible evidence.

**How the failure currently appears**

- Endpoint returns `started`, but the flow later becomes `error`.
- Job flow status can conflict with conversion status if completion arrives late.
- Diagnostics show only step/flow events, not browser evidence.

**Evidence needed**

- Flow definition snapshot.
- Flow run ID and thread lifecycle.
- Step precondition results.
- Command request/response envelope.
- Wait start/end timestamps and final job status.

**AI context needed**

- A flow is a background thread, so the HTTP response does not represent the final result.
- `CONVERT_PDF` has two timeouts: command wait and conversion completion wait.

**Expected vs actual comparison**

- Expected: flow run moves `started -> running -> completed` after conversion completes.
- Actual: flow timeout, missing precondition, command timeout, or contradictory final states.

**State before/after**

- Before: job flow `idle`, conversion pending.
- After: flow run `completed/error`, job flow status, job conversion status.

**Deterministic or intermittent**

- Missing fields deterministic.
- Timeout/late completion intermittent.

**Dependencies**

- Timing: high.
- WebSocket: high.
- External systems: Chrome/iLovePDF.
- Files: medium.

**Harness reproducibility**

- Yes for flow logic with mock agent; browser timeout needs integration harness.

---

### Workflow 8 — iLovePDF browser automation runtime

**Where failures can happen**

- Runtime queue and concurrency guard.
- Tab find/create/reuse.
- Content script readiness.
- PDF fetch from Python.
- File input selector/assignment.
- Upload-ready confirmation.
- Convert button selector/click.
- `/descarga/` page wait.
- Download page content readiness.
- Download button selector/click.
- Chrome download matching and completion.
- Sending final status to Python.

**Why they can happen**

- iLovePDF DOM changes.
- Page not loaded or content script not injected.
- Site shows modal/captcha/error page.
- Local PDF file missing.
- Chrome tab closed.
- Download filename differs from expected PDF stem.
- WebSocket closes before final status.

**How the failure currently appears**

- Job status becomes `error` with a message.
- Runtime logs in extension console.
- Flow timeout if final status never reaches Python.
- User sees iLovePDF page stuck or a downloaded file not reflected in the app.

**Evidence needed**

- Runtime state: `_running`, `_queue`, current job/PDF.
- Tab evidence: tab ID, URL timeline, page title.
- Content script readiness attempts.
- DOM selector match table and fallback decisions.
- Screenshot on failure.
- Download candidates and matching decisions.
- Final status send result.

**AI context needed**

- The highest-risk code is browser UI automation against a third-party site.
- A selector failure and a download tracker timeout can look similar from Python.

**Expected vs actual comparison**

- Expected: queue starts one PDF, upload succeeds, convert button click navigates to `/descarga/`, download completes, status returns to Python.
- Actual: stuck at one phase with insufficient browser evidence.

**State before/after**

- Before: runtime idle or queued, job conversion queued.
- After: runtime idle, job completed/error, tracker inactive, queue drained or next job starts.

**Deterministic or intermittent**

- Selector changes deterministic for a given site version.
- Page timing, service-worker lifecycle, downloads, and tab closure intermittent.

**Dependencies**

- Timing: critical.
- External systems: iLovePDF and Chrome downloads/tabs.
- UI state: critical.
- Files: critical.
- Network: local HTTP plus internet site.

**Harness reproducibility**

- Partial. Unit harness can test queue/tracker logic; full reproduction needs browser automation with controlled pages or a fake iLovePDF fixture.

---

### Workflow 9 — Conversion status propagation and state persistence

**Where failures can happen**

- Content script `reportStatus` to runtime/router.
- Runtime `_updatePythonStatus` HTTP POST.
- Bridge `sendStatus` WebSocket final status.
- Python `_handle_conversion_status`.
- `StateManager.set_pdf_status`.
- `JobStore.update_job_status` and `set_excel_path`.
- State save after mutation.

**Why they can happen**

- Python unavailable for HTTP progress updates.
- WebSocket closed for final update.
- Status payload missing IDs.
- PDF exists but job does not, or job exists but PDF ID does not.
- Save failure after successful in-memory update.

**How the failure currently appears**

- Side panel progress missing or stale.
- Job conversion not updated even though iLovePDF completed.
- Job completed but output path is ambiguous.
- App looks correct until restart, then state is lost.

**Evidence needed**

- All status payloads with `jobId`, `pdfId`, `status`, `message`, `downloadId`, filename/path.
- HTTP progress update result.
- WebSocket final status send result.
- State mutation result and save result.

**AI context needed**

- Progress can reach Python through HTTP `/api/pdfs/{pdf_id}/status`; final completion can reach Python through WebSocket `CONVERSION_STATUS`.
- These paths can fail independently.

**Expected vs actual comparison**

- Expected: every status update maps to a known PDF/job and persists.
- Actual: unmatched IDs, silent HTTP failure, WS delivery failure, ambiguous output path, or unpersisted state.

**State before/after**

- Before: job conversion `queued/converting/downloading`.
- After: job conversion `completed/error`, PDF status, Excel output metadata.

**Deterministic or intermittent**

- Bad IDs deterministic.
- Delivery/save timing intermittent.

**Dependencies**

- Timing: high.
- WebSocket: high.
- HTTP: medium.
- Files/state: high.

**Harness reproducibility**

- Yes. WS/HTTP harness can send malformed/missing IDs, simulate state save failure, and close WS before final status.

---

### Workflow 10 — Job diagnostics and recent event viewing

**Where failures can happen**

- `/api/jobs/{job_id}/diagnostics` returns only job events, agents, and recent errors.
- Browser-side evidence is not included.
- Event buffers truncate earlier context.
- Error filtering misses warnings/timeouts not named `error` or `failed`.

**Why they can happen**

- Current diagnostics are event-tail oriented, not diagnostic-package oriented.
- Browser runtime/DOM/download state is not persisted in job events.

**How the failure currently appears**

- User clicks “Ver logs” and sees some messages but not enough for root-cause diagnosis.
- AI agent sees a timeout but not why the browser got stuck.

**Evidence needed**

- Complete per-job timeline with gap markers.
- Browser evidence bundle: runtime state, tab state, DOM selectors, download candidates.
- Event truncation metadata.
- State snapshot for relevant job/PDF/flow.

**AI context needed**

- Recent logs are not the same as a complete diagnostic package.
- A root cause may exist only in extension console or browser DOM state.

**Expected vs actual comparison**

- Expected: diagnostics explain why expected state did not become actual state.
- Actual: diagnostics show symptoms but not the missing browser/queue/download evidence.

**State before/after**

- Before: job failure or user symptom.
- After: diagnostic package should show causal chain and missing evidence flags.

**Deterministic or intermittent**

- Diagnostic insufficiency deterministic.
- Which evidence is missing depends on failure timing.

**Dependencies**

- Logs/events: high.
- Browser evidence: high.
- State: high.

**Harness reproducibility**

- Yes. Trigger known failures and assert diagnostics contain required evidence types.

---

### Workflow 11 — Open Zoho action from job card

**Where failures can happen**

- Job lacks `zoho_url`.
- URL malformed or stale.
- Side panel fails to open new tab.
- Zoho page requires session/login.

**Why they can happen**

- Job originated from scanner only.
- Mapping import failed.
- Zoho session expired.
- Chrome tabs API failure.

**How the failure currently appears**

- API returns `Job has no zoho_url`.
- Browser may open wrong/blank/login page.

**Evidence needed**

- Job mapping status, URL validation, tab creation result, final tab URL.

**AI context needed**

- This is a user convenience workflow; it is not required for conversion unless mapping context is needed.

**Expected vs actual comparison**

- Expected: mapped job opens correct Zoho Case URL.
- Actual: unmapped/malformed URL or browser tab failure.

**State before/after**

- Before: job `zoho=mapped` and URL present.
- After: Chrome tab created with URL.

**Deterministic or intermittent**

- Missing URL deterministic.
- Zoho auth/session behavior intermittent/external.

**Dependencies**

- UI state: medium.
- External systems: Zoho/Chrome tabs.
- User session: high.

**Harness reproducibility**

- Yes for missing/malformed URL; partial for real Zoho session.

---

### Workflow 12 — Disabled/future Site2 upload boundary

**Where failures can happen**

- User triggers Site2 action though implementation is disabled.
- `excel_path` missing.
- `site2-uploader` agent not connected.
- Future upload agent contract undefined.

**Why they can happen**

- Feature is present as an API/action boundary but returns `501 not implemented`.
- UI may expose the action before implementation is complete.

**How the failure currently appears**

- API returns `site2-uploader flow is not implemented yet` or missing-agent error.

**Evidence needed**

- Feature flag / implementation status.
- UI action availability.
- Job `excel_path` and site2 status.
- Agent list.

**AI context needed**

- This is a future boundary, not a current production failure of the PDF-to-Excel pipeline.

**Expected vs actual comparison**

- Expected: disabled action is clearly shown as unavailable, or implemented action has an agent contract.
- Actual: user can trigger an endpoint that cannot complete.

**State before/after**

- Before: job conversion completed or not.
- After: site2 remains `not_started`, API returns 501/400.

**Deterministic or intermittent**

- Deterministic while unimplemented.

**Dependencies**

- UI state: medium.
- Future external system: high later.

**Harness reproducibility**

- Yes. Call the endpoint with/without `excel_path` and agent.

---

## 5. Silent failures

These failures can happen without enough durable evidence reaching the Python diagnostic trail:

| Silent failure | Why silent | Expected-vs-actual comparison needed | Evidence that must exist later |
|---|---|---|---|
| Zoho mapping import fetch fails in `saveMapping` | The `fetch` exception is swallowed after local Chrome mapping is saved | Expected: local mapping and Python job are both updated. Actual: local mapping exists but Python job is absent/unmapped. | Import request ID, response/error, mapping ID, Python job match result |
| Runtime `_updatePythonStatus` fails | It logs a warning in extension console, but Python may never receive intermediate status | Expected: Python PDF/job status changes for upload/converting/downloading. Actual: status remains stale. | HTTP status update attempt, exception, pdf ID, status payload |
| `chrome.runtime.sendMessage(...).catch(() => {})` | Message delivery errors are intentionally ignored in several places | Expected: side panel receives progress/status/fallback alerts. Actual: UI never receives them. | Message type, target, catch reason, whether it was intentionally ignorable |
| Folder/state save failure | `StateManager._save` prints error but state remains in memory | Expected: mutation persisted. Actual: restart loses mutation. | Save path, OSError, mutation type, post-save verification |
| Diagnostics event truncation | Global events limited to 1000 and job events to 200 | Expected: diagnostic timeline contains root cause. Actual: early root-cause events missing. | Event count, truncation count, first/last retained timestamps |
| Download button missing but `startDownload` returns success after warning | Code proceeds and lets tracker time out | Expected: explicit failure at missing download button. Actual: later timeout hides root cause. | Download selector diagnostics, click-performed boolean, tracker start reason |

---

## 6. Ambiguous failures

These failures produce symptoms that can have multiple root causes unless expected-vs-actual evidence is captured:

| Ambiguous symptom | Possible causes | Evidence needed to disambiguate |
|---|---|---|
| Job stuck in `queued` | Agent ACKed but runtime never started; WS final status lost; service worker suspended; queue blocked; Python state save failed | Command ACK, runtime queue state, service-worker lifecycle, final status delivery, state save result |
| Flow timeout waiting for conversion | iLovePDF slow; convert button failed; download page never loaded; download tracker timeout; final WS status failed; status ID mismatch | Browser phase timeline, tab URL sequence, selector results, download tracker candidates, WS send result |
| Side panel shows no jobs | No PDFs scanned; backend unreachable; API fetch failed; state reset; wrong state file/workdir | Backend status, `/api/jobs` response, state file path, job count before startup, refresh error |
| Mapping missing | Download not detected; active tab wrong; Zoho URL unsupported; pending storage lost; Python import failed; filename matching created different job | Download decision, active tab, pending key lifecycle, import response, job matching decision |
| Excel downloaded but job not completed | Tracker did not match; final status send failed; downloaded file belongs to another tab; Python status update unmatched | Chrome download item, expected stem, tab ID, final WS status, job/PDF ID match |
| Agent appears connected but command times out | Stale socket; registry not updated; service worker suspended; PONG only updated status; WebSocket send future failed | Agent `last_seen`, keepalive history, WebSocket close code, command waiter state |

---

## 7. Failures currently hidden from logs or diagnostics

| Hidden area | Current gap | Diagnostic evidence needed |
|---|---|---|
| Browser DOM state | Python diagnostics do not include selector match counts, page title, URL timeline, screenshot, candidate buttons/inputs | Compact DOM selector table and failure screenshot per browser phase |
| Runtime queue state | Queue/current job are available in JS memory but not persisted into Python job diagnostics | Queue snapshot on enqueue/start/error/final status |
| Download candidate decisions | Tracker logs matches/rejections to extension console but not a structured diagnostic package | Candidate list with match/reject reasons: tab, time window, host, file type, stem |
| Side panel action context | Button clicks are not durable backend events before the API call | Action event with job ID, endpoint, request ID, response status, toast result |
| State save success | Save failures print; successful saves are not tied to mutations | Mutation type, save result, state file metadata |
| Service-worker lifecycle | Reconnect events are not tied to job failures | Service-worker instance ID, boot time, reconnect attempts, close codes, runtime instance ID |

---

## 8. Failures where the app can continue in an invalid or misleading state

| Invalid continuation | Expected condition | Actual invalid state | Risk |
|---|---|---|---|
| Default state after unreadable/corrupt `state.json` | State load failure is visible and recoverable | App starts empty and may overwrite/continue without old jobs | User loses diagnostic history and job context |
| Job completed with ambiguous `excel_path` | Completed conversion has verified output path/metadata | `excel_path` may be set from downloaded filename only | User/agent cannot prove output file exists |
| Flow status `error` while conversion later becomes `completed` | Flow and conversion states remain causally consistent | Late completion creates contradictory state | AI may chase wrong cause |
| Local Chrome mapping saved but Python import failed | Mapping consistency between Chrome and Python | Chrome mapping exists; Python job missing/unmapped | User sees inconsistent systems |
| UI empty after fetch failure | UI distinguishes empty data from unreachable backend | User sees empty/stale state | User may trigger wrong actions or assume data loss |
| Download tracker timeout after download button missing | Missing button failure is the root cause | Later timeout is recorded as symptom | AI lacks the real root cause |

---

## 9. Failures where the user sees a symptom but the system has no diagnostic trail

| User symptom | Likely missing trail |
|---|---|
| “The Excel downloaded, but the app still says converting.” | Download tracker candidate decisions, final `CONVERSION_STATUS` send result, job/PDF match result |
| “The side panel is empty.” | Refresh endpoint failure vs true empty state, state load path, state reset event |
| “I clicked convert and nothing happened.” | User action event, HTTP request ID, bridge state, runtime queue acceptance, tab state |
| “iLovePDF is open but stuck.” | Browser phase, current URL, DOM selector table, screenshot, content script readiness |
| “A Zoho acta was downloaded but no mapping appeared.” | Download event decision, active tab URL, `resolveTaskUrl` result, pending storage write |
| “Ver logs does not explain the failure.” | Cross-component timeline, browser DOM evidence, queue/download snapshots, event truncation metadata |

---

## 10. Failures where an AI agent would lack enough evidence to debug accurately

An AI agent would likely be unable to diagnose accurately when the available evidence only says:

- `Timeout waiting for conversion completion`
- `Content script not ready`
- `Timeout waiting for /descarga/ page`
- `Timeout waiting for Chrome download completion`
- `ilovepdf-converter agent not connected`
- `Failed to download PDF: 404`
- `Job has no pdf_id or pdf_path`
- “No jobs in side panel”

For those messages, the AI would need the missing expected-vs-actual context:

| Error/symptom | AI would need |
|---|---|
| Timeout waiting for conversion completion | Was command ACKed? Did runtime start? Which browser phase was last seen? Was final status sent? Did flow timeout before final status? |
| Content script not ready | Tab URL, content script match pattern, reload attempts, tab status, extension injection errors |
| Timeout waiting for `/descarga/` | Was convert button clicked? Current URL timeline, page errors/modals, selector result, screenshot |
| Chrome download timeout | Candidate downloads, expected stem, tab ID, host, MIME, start time, interrupted downloads |
| Agent not connected | Bridge state, runtime instance ID, reconnect attempts, close code/reason, keepalive history |
| PDF 404 | Job PDF ID/path, file existence, scan timestamp, missing-file state transition |
| Job missing PDF fields | Source of job, mapping import status, scan/job matching result |
| Empty side panel | Backend availability, refresh endpoint errors, state load path, job count in state |

---

## 11. Test harness reproducibility summary

| Workflow | Harness can reproduce? | Best harness type |
|---|---:|---|
| Python startup/backend readiness | Yes | Python startup harness with occupied ports, corrupt state file, missing flows file |
| Extension bootstrap/agent registration | Yes | Mock WebSocket client + Chrome extension lifecycle harness |
| Side panel refresh/action dispatch | Yes | Browser/extension UI harness with mocked API failures and stale job IDs |
| Folder scan/job sync | Yes | Temporary filesystem harness with create/delete/rename/permission scenarios |
| Zoho mapping | Partial/Yes | Chrome extension event simulation for downloads/tabs/storage; full Zoho requires browser integration |
| Direct conversion action | Yes | Mock agent harness for ACK/timeout/unexpected response |
| Configured flow execution | Yes | Flow harness with mock agent and controlled job states/timeouts |
| iLovePDF runtime | Partial | Unit harness for queue/tracker; browser fixture or real browser integration for DOM/navigation |
| Conversion status/state persistence | Yes | HTTP/WS status harness with malformed IDs, delayed statuses, save failures |
| Diagnostics view | Yes | Failure injection harness that asserts diagnostic package completeness |
| Open Zoho | Partial | Mock tab action for URL validation; real Zoho session external |
| Site2 boundary | Yes | Endpoint/action harness validating disabled behavior |

---

## 12. Minimum evidence contract for future observability work

Every failure surface above should eventually produce an event or diagnostic record that includes:

```json
{
  "trace_id": "workflow/job/flow trace id",
  "job_id": "job id when known",
  "pdf_id": "pdf id when known",
  "flow_run_id": "flow run id when known",
  "component": "python.http | python.ws | python.flow | extension.bridge | extension.runtime | extension.content | chrome.downloads | sidepanel",
  "event": "specific event name",
  "phase": "startup | scan | mapping | queued | uploading | converting | waiting_download_page | downloading | completed | error",
  "expected": {
    "condition": "what should have been true"
  },
  "actual": {
    "condition": "what was observed instead"
  },
  "state_before": {},
  "state_after": {},
  "evidence": {},
  "reproduction_hint": "deterministic/intermittent and suggested harness"
}
```

This is not a recommendation to add generic logging. It is a failure evidence contract: each event exists only because it proves or disproves a specific expected condition.

---

## 13. Recommended next discovery artifact

The next artifact should be `observability_architecture_design.md`.

That document should not start by adding logs. It should first define:

1. The shared event schema.
2. The state machines and allowed transitions.
3. The per-job diagnostic package format.
4. The browser evidence capture strategy.
5. The compaction strategy so the output is AI-readable and not a giant raw log dump.
6. The exact implementation phases for Python, extension background, content scripts, side panel, and test harnesses.
