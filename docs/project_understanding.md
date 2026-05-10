# Project Understanding Report

## Evidence baseline

Repository reviewed: `infoclusiv/autohom-v2` on branch `main`.

This report is based on the repository metadata and the following inspected files:

- `README.md`
- `app-python-zoho/app.py`
- `app-python-zoho/config.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/agent_registry.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/pdf_scanner.py`
- `app-python-zoho/requirements.txt`
- `app-python-zoho/flows/flows.json`
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

No repository files were modified while preparing this artifact.

---

## 1. Project purpose

AutoHom v2 is a local browser automation orchestrator for managing a workflow that connects Zoho CRM PDF downloads, local PDF files, PDF-to-Excel conversion through iLovePDF, and a central side-panel UI.

The application solves the problem of coordinating fragile browser-based automation across multiple moving parts:

- A local Python backend that stores state, exposes an HTTP API, tracks jobs, tracks flows, and runs a WebSocket server.
- A Chrome extension that detects relevant Zoho CRM PDF downloads, maps them to Zoho Case URLs, connects to the Python backend as an automation agent, and automates iLovePDF.
- A side-panel UI that lets the user scan a local PDF folder, view jobs, view connected agents, run conversion actions, run flows, and inspect recent job logs.

The primary user appears to be a local operator using Chrome and a local Python process to manage “actas de homologación” PDFs downloaded or mapped from Zoho CRM, then convert those PDFs into Excel files through iLovePDF.

The main user-facing outcome is a local control panel where the user can:

- Select or scan a local PDF folder.
- See jobs created from scanned PDFs or Zoho mappings.
- Map PDFs downloaded from Zoho CRM to the related Zoho task/case URL.
- Trigger PDF-to-Excel conversion.
- See job statuses, agent status, flow status, and recent logs.

The main system-facing outcome is a persisted local job/state model that coordinates browser automation commands and receives status updates from Chrome extension agents.

Repository evidence:

- `README.md` describes AutoHom v2 as a “local automation orchestrator” connecting a Python backend with Chrome extension agents through WebSockets, focused on Zoho CRM, local PDF files, and iLovePDF PDF-to-Excel conversion.
- `app-python-zoho/app.py` is titled “Entry point for the central orchestrator” and starts the state manager, job store, WebSocket server, flow orchestrator, and HTTP API.
- `app-python-zoho/http_server.py` exposes endpoints for PDFs, jobs, agents, flows, diagnostics, scanning, config, Zoho mappings, and PDF conversion actions.
- `autohom-extension/manifest.json` names the extension “Zoho Acta Mapper” and describes it as mapping Zoho CRM PDFs with task URLs and converting PDF to Excel through iLovePDF.
- `autohom-extension/sidepanel.html` titles the UI “AutoHom Central Panel” and labels it as a panel for “Jobs, agentes y flujos sobre Python Orchestrator.”
- `autohom-extension/sidepanel.js` calls the local API at `http://localhost:7790/api`, refreshes bridge/jobs/agents/flows/config, renders job cards, and triggers actions such as `convert`, `run-flow`, `open-zoho`, and `logs`.
- `app-python-zoho/flows/flows.json` defines a `pdf_to_excel` flow that uses the `ilovepdf-converter` agent and a planned `pdf_to_excel_to_site2` flow.

---

## 2. Application type

This project combines several system types.

### Local automation system

The dominant type is a local automation system. It coordinates local state, file scanning, browser automation, external website interactions, and user-triggered workflows.

Evidence:

- `README.md` describes the project as a local automation orchestrator.
- `app-python-zoho/app.py` starts the central orchestrator.
- `app-python-zoho/flow_orchestrator.py` runs background flows by sending commands to browser automation agents.
- `autohom-extension/ilovepdf-background/runtime.js` manages a sequential conversion queue for iLovePDF.

### Local HTTP API

The Python backend exposes a local HTTP API.

Evidence:

- `app-python-zoho/config.py` defines `HTTP_HOST = "localhost"` and `HTTP_PORT = 7790`.
- `app-python-zoho/http_server.py` creates an `aiohttp` application and registers endpoints under `/api/...`.
- `app-python-zoho/requirements.txt` includes `aiohttp>=3.9`.
- `autohom-extension/sidepanel.js` uses `API_BASE = 'http://localhost:7790/api'`.

### WebSocket server and multi-agent bridge

The Python backend also acts as a WebSocket server for browser agents.

Evidence:

- `app-python-zoho/config.py` defines `WS_HOST = "localhost"` and `WS_PORT = 8769`.
- `app-python-zoho/multi_agent_ws_server.py` implements `MultiAgentWebSocketServer`.
- `app-python-zoho/multi_agent_ws_server.py` expects agent messages such as `AGENT_CONNECTED`, `PING`, `PONG`, `CONVERT_PDF`, `CONVERT_PDF_ACK`, and `CONVERSION_STATUS`.
- `autohom-extension/ilovepdf-background/bridge.js` connects to `CONFIG_ILOVEPDF.BRIDGE_URL`, sends `AGENT_CONNECTED`, handles `PING`, and handles `CONVERT_PDF`.

### Chrome browser extension

The browser automation layer is a Chrome Extension Manifest V3 extension.

Evidence:

- `autohom-extension/manifest.json` declares `"manifest_version": 3`.
- `autohom-extension/manifest.json` declares `background-main.js` as the service worker.
- `autohom-extension/manifest.json` declares content scripts for `https://crm.zoho.com/*` and `https://www.ilovepdf.com/*`.
- `autohom-extension/background-main.js` imports Zoho and iLovePDF background modules.
- `autohom-extension/content.js` runs inside Zoho CRM.
- `autohom-extension/ilovepdf/content.js` runs inside iLovePDF.

### Side-panel web UI inside the extension

The project includes a local browser-extension UI, not a standalone web app served by the backend.

Evidence:

- `autohom-extension/manifest.json` declares a `side_panel` default path of `sidepanel.html`.
- `autohom-extension/sidepanel.html` contains the UI shell and status panels.
- `autohom-extension/sidepanel.js` renders jobs, agents, flows, stats, pending downloads, and diagnostic logs.

### Background worker behavior

Several runtime components behave as background workers, even if they are not deployed as separate worker services.

Evidence:

- `app-python-zoho/flow_orchestrator.py` starts each flow in a daemon thread.
- `app-python-zoho/multi_agent_ws_server.py` runs the WebSocket server in a daemon thread with its own asyncio event loop.
- `autohom-extension/background-main.js` is a Chrome extension service worker.
- `autohom-extension/ilovepdf-background/runtime.js` implements a sequential in-memory conversion queue.

### Not primarily an AI agent

The repository is not itself an AI agent. It is intended to support automation and diagnostics that may later help AI-assisted debugging, but the inspected runtime code does not show LLM calls or AI decision-making.

Evidence:

- No inspected file contains an LLM provider integration.
- `README.md` mentions future “AI-assisted debugging” diagnostic exports as a roadmap item, not as current runtime behavior.
- The active runtime revolves around local HTTP, WebSocket, Chrome extension automation, local file scanning, and state persistence.

### Not a mobile app, microservice, or conventional monolith

The project is not a mobile app. It also does not look like a cloud microservice architecture. It is closer to a local monolith-plus-extension architecture: one local Python orchestrator plus one Chrome extension that contains multiple automation modules.

Evidence:

- Runtime endpoints are bound to `localhost` in `app-python-zoho/config.py`.
- Browser permissions target Zoho CRM, iLovePDF, and local HTTP endpoints in `autohom-extension/manifest.json`.
- There is no inspected cloud deployment config, container config, service mesh, queue broker, or mobile framework.

---

## 3. Runtime architecture

### Main runtime components

The main runtime components are:

1. **Python central orchestrator**
   - Entry point: `app-python-zoho/app.py`
   - HTTP API: `app-python-zoho/http_server.py`
   - WebSocket server: `app-python-zoho/multi_agent_ws_server.py`
   - Agent registry: `app-python-zoho/agent_registry.py`
   - State persistence: `app-python-zoho/state_manager.py`
   - Job model: `app-python-zoho/job_store.py`
   - Flow runner: `app-python-zoho/flow_orchestrator.py`
   - PDF scanner: `app-python-zoho/pdf_scanner.py`
   - Flow config: `app-python-zoho/flows/flows.json`

2. **Chrome extension service worker**
   - Entry point: `autohom-extension/background-main.js`
   - Imports Zoho mapping and iLovePDF automation modules.
   - Connects to the Python WebSocket server through `ILovePDFBridge.connect()`.

3. **Zoho CRM extension modules**
   - Download detection and mapping: `autohom-extension/background-zoho.js`
   - Zoho page URL reporting: `autohom-extension/content.js`

4. **iLovePDF background automation modules**
   - WebSocket bridge client: `autohom-extension/ilovepdf-background/bridge.js`
   - Sequential queue/runtime: `autohom-extension/ilovepdf-background/runtime.js`
   - Tab management: `autohom-extension/ilovepdf-background/tabManager.js`
   - Download confirmation: `autohom-extension/ilovepdf-background/downloadTracker.js`
   - Runtime message router: `autohom-extension/ilovepdf-background/router.js`

5. **iLovePDF content automation modules**
   - Site config/selectors: `autohom-extension/ilovepdf/config.js`
   - DOM helpers: `autohom-extension/ilovepdf/domHelpers.js`
   - PDF upload automation: `autohom-extension/ilovepdf/pdfUploader.js`
   - Conversion/download click automation: `autohom-extension/ilovepdf/conversionAutomator.js`
   - Content-script message handler: `autohom-extension/ilovepdf/content.js`

6. **Chrome extension side panel**
   - UI markup/styles: `autohom-extension/sidepanel.html`
   - UI logic and API calls: `autohom-extension/sidepanel.js`

### What starts first

The normal startup sequence appears to be:

1. The user starts the Python orchestrator by running `python app.py` inside `app-python-zoho`.
2. `app-python-zoho/app.py` creates:
   - `StateManager`
   - `JobStore`
   - `MultiAgentWebSocketServer`
   - `FlowOrchestrator`
3. `app-python-zoho/app.py` starts the WebSocket server first through `ws_server.start_ws_server()`.
4. `app-python-zoho/app.py` creates the HTTP API with `create_app(...)`.
5. `app-python-zoho/app.py` starts the `aiohttp` server on `http://localhost:7790`.
6. The user loads/uses the Chrome extension.
7. `autohom-extension/background-main.js` imports extension modules and calls:
   - `ILovePDFBridge.connect()`
   - `ILovePDFBridge.setupAlarmReconnect()`
8. `autohom-extension/ilovepdf-background/bridge.js` opens a WebSocket connection to `ws://localhost:8769`.
9. The extension identifies itself to Python by sending `AGENT_CONNECTED`.

Evidence:

- `app-python-zoho/app.py` constructs the Python components and starts the WebSocket server before creating/running the HTTP API.
- `app-python-zoho/config.py` defines the local HTTP and WebSocket ports.
- `autohom-extension/background-main.js` imports `bridge.js`, `runtime.js`, `router.js`, and then initializes the bridge.
- `autohom-extension/ilovepdf-background/bridge.js` creates a `WebSocket(CONFIG_ILOVEPDF.BRIDGE_URL)` and sends `AGENT_CONNECTED` when opened.
- `autohom-extension/ilovepdf/config.js` defines `BRIDGE_URL: "ws://localhost:8769"` and `API_BASE_URL: "http://localhost:7790/api"`.

### How components communicate

#### Side panel to Python

The side panel communicates with the Python backend through local HTTP requests.

Examples:

- `GET /api/bridge`
- `GET /api/jobs`
- `GET /api/agents`
- `GET /api/flows`
- `GET /api/config`
- `POST /api/config`
- `POST /api/folder-dialog`
- `POST /api/jobs/{job_id}/actions/convert-pdf`
- `POST /api/jobs/{job_id}/flows/run`
- `GET /api/jobs/{job_id}/diagnostics`

Evidence:

- `autohom-extension/sidepanel.js`
- `app-python-zoho/http_server.py`

#### Extension service worker to Python

The iLovePDF agent communicates with Python through WebSocket messages.

Main actions:

- Extension to Python:
  - `AGENT_CONNECTED`
  - `PONG`
  - `CONVERT_PDF_ACK`
  - `CONVERSION_STATUS`
- Python to extension:
  - `PING`
  - `CONVERT_PDF`

Evidence:

- `app-python-zoho/multi_agent_ws_server.py`
- `autohom-extension/ilovepdf-background/bridge.js`

#### Python to local files

The Python backend scans local folders and serves local PDF files to the extension.

Evidence:

- `app-python-zoho/pdf_scanner.py` scans a configured folder for `.pdf` files.
- `app-python-zoho/http_server.py` serves a PDF from `/api/pdfs/{pdf_id}/file` using `web.FileResponse`.
- `app-python-zoho/state_manager.py` persists state to `STATE_FILE`.
- `app-python-zoho/config.py` defines `STATE_FILE = os.path.join(BASE_DIR, "state.json")`.

#### Extension content scripts to service worker

The content scripts communicate with the extension service worker through `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`.

Evidence:

- `autohom-extension/content.js` reports Zoho URL changes with `chrome.runtime.sendMessage`.
- `autohom-extension/ilovepdf/content.js` receives `START_CONVERSION`, `START_DOWNLOAD`, and `PING`.
- `autohom-extension/ilovepdf-background/runtime.js` sends `START_CONVERSION` and `START_DOWNLOAD` messages to iLovePDF tabs.
- `autohom-extension/ilovepdf-background/router.js` receives content-script conversion events and forwards status to the bridge.

#### Extension to Chrome APIs

The extension depends on Chrome extension APIs.

Evidence:

- `autohom-extension/manifest.json` requests permissions for `downloads`, `storage`, `tabs`, `sidePanel`, `notifications`, `alarms`, and `activeTab`.
- `autohom-extension/background-zoho.js` uses `chrome.downloads`, `chrome.storage`, `chrome.runtime`, `chrome.notifications`, `chrome.tabs`, and `chrome.sidePanel`.
- `autohom-extension/ilovepdf-background/downloadTracker.js` uses `chrome.downloads`.
- `autohom-extension/ilovepdf-background/tabManager.js` uses `chrome.tabs`.
- `autohom-extension/ilovepdf-background/bridge.js` uses `chrome.alarms`.

### External systems and services

The app interacts with:

- **Zoho CRM**
  - Host permission: `https://crm.zoho.com/*`
  - Used to detect/download/map PDF actas to Zoho Case URLs.
  - Evidence: `autohom-extension/manifest.json`, `autohom-extension/background-zoho.js`, `autohom-extension/content.js`.

- **iLovePDF**
  - Host permission: `https://www.ilovepdf.com/*`
  - Used to convert PDFs to Excel.
  - Evidence: `autohom-extension/manifest.json`, `autohom-extension/ilovepdf/config.js`, `autohom-extension/ilovepdf/content.js`, `autohom-extension/ilovepdf/pdfUploader.js`, `autohom-extension/ilovepdf/conversionAutomator.js`.

- **Local file system**
  - Local PDF folders are scanned.
  - Local PDFs are served by the Python API.
  - Local state is persisted to `app-python-zoho/state.json` at runtime.
  - Evidence: `app-python-zoho/pdf_scanner.py`, `app-python-zoho/http_server.py`, `app-python-zoho/state_manager.py`.

- **Chrome browser**
  - Required for Manifest V3 extension, side panel, downloads, tabs, notifications, alarms, and content scripts.
  - Evidence: `autohom-extension/manifest.json`.

---

## 4. Main workflows

### Workflow: Start Python central orchestrator

**Trigger:**  
The user runs `python app.py` from the `app-python-zoho` directory.

**Steps:**

1. `app-python-zoho/app.py` prints startup information.
2. It creates `StateManager`, which loads persisted state from `app-python-zoho/state.json` if it exists.
3. It creates `JobStore`.
4. It creates `MultiAgentWebSocketServer`.
5. It creates `FlowOrchestrator`.
6. It starts the WebSocket server on `ws://localhost:8769`.
7. It creates the HTTP API application with `create_app(...)`.
8. It registers shutdown handlers for `SIGINT` and `SIGTERM`.
9. It starts the HTTP API on `http://localhost:7790`.

**Expected result:**  
The local backend is ready to receive HTTP requests from the side panel and WebSocket connections from browser automation agents.

**Involved components:**

- Python process
- `StateManager`
- `JobStore`
- `MultiAgentWebSocketServer`
- `FlowOrchestrator`
- `aiohttp` HTTP API

**Repository evidence:**

- `app-python-zoho/app.py`
- `app-python-zoho/config.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/requirements.txt`

---

### Workflow: Chrome extension startup and iLovePDF agent registration

**Trigger:**  
Chrome loads or wakes the extension service worker.

**Steps:**

1. Chrome starts `background-main.js` as the Manifest V3 service worker.
2. `background-main.js` imports Zoho and iLovePDF modules through `importScripts`.
3. `background-main.js` calls `ILovePDFBridge.connect()`.
4. `ILovePDFBridge` opens a WebSocket connection to `ws://localhost:8769`.
5. On WebSocket open, the extension sends `AGENT_CONNECTED` with identity and capabilities.
6. Python receives the handshake in `MultiAgentWebSocketServer.ws_handler`.
7. Python normalizes/registers the agent through `AgentRegistry`.
8. Python updates bridge status and records an `agent.connected` event if a `JobStore` is available.
9. Python starts a keepalive probe for that connection.

**Expected result:**  
The `ilovepdf-converter` agent appears as connected and can receive conversion commands from Python.

**Involved components:**

- Chrome extension service worker
- `ILovePDFBridge`
- Python WebSocket server
- `AgentRegistry`
- `JobStore`

**Repository evidence:**

- `autohom-extension/manifest.json`
- `autohom-extension/background-main.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf/config.js`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/agent_registry.py`
- `app-python-zoho/job_store.py`

---

### Workflow: Open and refresh the side panel

**Trigger:**  
The user clicks the extension action icon, or opens the Chrome extension side panel.

**Steps:**

1. `background-zoho.js` opens `sidepanel.html` when the extension action is clicked.
2. `sidepanel.html` loads `sidepanel.js`.
3. `sidepanel.js` binds UI events.
4. `sidepanel.js` loads pending Zoho downloads from `chrome.storage.session`.
5. `sidepanel.js` calls `refreshAll()`.
6. `refreshAll()` fetches:
   - Bridge state from `/api/bridge`
   - Jobs from `/api/jobs`
   - Agents from `/api/agents`
   - Flows from `/api/flows`
   - Config from `/api/config`
7. The UI renders bridge status, stats, jobs, agents, flows, and pending mapping cards.
8. A periodic refresh runs every five seconds.

**Expected result:**  
The side panel displays current Python bridge status, jobs, mapped/conversion counts, connected agents, available flows, PDF folder config, and quick diagnostics.

**Involved components:**

- Chrome extension action and side panel
- `sidepanel.html`
- `sidepanel.js`
- Python HTTP API
- Python job/agent/flow state

**Repository evidence:**

- `autohom-extension/background-zoho.js`
- `autohom-extension/sidepanel.html`
- `autohom-extension/sidepanel.js`
- `app-python-zoho/http_server.py`

---

### Workflow: Select or scan a local PDF folder

**Trigger:**  
The user selects a folder through the side panel or enters a folder path and clicks scan.

**Steps:**

1. The side panel sends `POST /api/folder-dialog` or `POST /api/config`.
2. For folder selection, Python attempts to open a native folder picker through `tkinter`.
3. Python stores the selected folder in `StateManager`.
4. Python scans the folder through `pdf_scanner.scan_folder`.
5. `scan_folder` lists `.pdf` files and creates PDF descriptors containing ID, filename, and absolute filepath.
6. `StateManager.merge_scanned_pdfs` merges scanned PDFs into state.
7. `JobStore.create_or_update_from_pdf` creates or updates jobs for scanned PDFs.
8. The side panel refreshes jobs and stats.

**Expected result:**  
Each PDF in the selected folder becomes a tracked PDF and corresponding job. Missing previously tracked PDFs are marked missing.

**Involved components:**

- Side panel UI
- Python HTTP API
- `StateManager`
- `pdf_scanner`
- `JobStore`
- Local filesystem

**Repository evidence:**

- `autohom-extension/sidepanel.js`
- `app-python-zoho/http_server.py`
- `app-python-zoho/pdf_scanner.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`

---

### Workflow: Detect and map Zoho CRM PDF download

**Trigger:**  
A PDF download is created while the active Chrome tab is on a relevant Zoho CRM URL.

**Steps:**

1. `background-zoho.js` listens to `chrome.downloads.onCreated`.
2. It checks whether the download appears to be a PDF.
3. It queries the active tab.
4. It resolves the Zoho Case URL from the active tab URL using `resolveTaskUrl`.
5. It extracts a clean filename from the download item or URL.
6. It stores a pending mapping in `chrome.storage.session`.
7. It sends `DOWNLOAD_PENDING` to the side panel and creates a Chrome notification.
8. The user confirms or rejects the mapping from the notification or side panel.
9. If confirmed, `saveMapping` stores the mapping in `chrome.storage.local`.
10. `saveMapping` posts the mapping to Python at `POST /api/jobs/import-zoho-mapping`.
11. Python creates or updates a job through `JobStore.create_or_update_from_zoho_mapping`.

**Expected result:**  
A job is created or updated with the PDF filename and related Zoho Case URL. The job's Zoho status becomes mapped when a URL is present.

**Involved components:**

- Chrome downloads API
- Chrome tabs API
- Chrome storage API
- Chrome notifications API
- Side panel
- Python HTTP API
- `JobStore`

**Repository evidence:**

- `autohom-extension/background-zoho.js`
- `autohom-extension/content.js`
- `autohom-extension/sidepanel.js`
- `app-python-zoho/http_server.py`
- `app-python-zoho/job_store.py`
- `autohom-extension/manifest.json`

---

### Workflow: Convert a PDF to Excel by job action

**Trigger:**  
The user clicks “Convertir PDF” on a job card in the side panel.

**Steps:**

1. `sidepanel.js` posts to `/api/jobs/{job_id}/actions/convert-pdf`.
2. `http_server.py` validates that the job exists.
3. `http_server.py` validates that the job has either `pdf_id` or `pdf_path`.
4. `http_server.py` checks that the `ilovepdf-converter` agent is connected.
5. Python updates the job conversion status to `queued`.
6. Python sends a `CONVERT_PDF` request to the `ilovepdf-converter` WebSocket agent.
7. The extension bridge receives `CONVERT_PDF`.
8. The bridge queues the conversion in `ILovePDFRuntime`.
9. The bridge sends `CONVERT_PDF_ACK` back to Python.
10. Python returns the updated job and response to the side panel.
11. The runtime later continues the browser automation sequence and sends progress/completion updates.

**Expected result:**  
The selected PDF conversion is queued and the iLovePDF agent begins converting it. The job status changes to queued/converting/completed or error depending on later status updates.

**Involved components:**

- Side panel
- Python HTTP API
- `JobStore`
- `MultiAgentWebSocketServer`
- Chrome extension WebSocket bridge
- `ILovePDFRuntime`

**Repository evidence:**

- `autohom-extension/sidepanel.js`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `app-python-zoho/job_store.py`

---

### Workflow: Convert PDF through configured flow

**Trigger:**  
The user clicks “Ejecutar flujo” in the side panel, which runs the `pdf_to_excel` flow for a job.

**Steps:**

1. `sidepanel.js` posts to `/api/jobs/{job_id}/flows/run` with `flowId: 'pdf_to_excel'`.
2. `http_server.py` validates that the job exists.
3. `FlowOrchestrator.start_flow` creates a flow run in `JobStore`.
4. `FlowOrchestrator.start_flow` starts `run_flow` in a daemon thread.
5. `FlowOrchestrator.run_flow` loads the flow definition from `app-python-zoho/flows/flows.json`.
6. It marks the job flow status as running and appends a `flow.started` event.
7. For each step, it validates required job fields.
8. It checks whether the required agent is connected.
9. It sends a WebSocket command to the agent.
10. It appends command and step events.
11. For `CONVERT_PDF`, it waits up to 180 seconds for job conversion status to become `completed`.
12. It marks the flow as completed or error.

**Expected result:**  
The job runs the `pdf_to_excel` flow and either completes after conversion or records an error/timeout.

**Involved components:**

- Side panel
- Python HTTP API
- `FlowOrchestrator`
- `JobStore`
- `MultiAgentWebSocketServer`
- `ilovepdf-converter` agent
- `flows.json`

**Repository evidence:**

- `autohom-extension/sidepanel.js`
- `app-python-zoho/http_server.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/flows/flows.json`
- `app-python-zoho/job_store.py`
- `app-python-zoho/multi_agent_ws_server.py`

---

### Workflow: iLovePDF browser automation sequence

**Trigger:**  
`ILovePDFRuntime.queueConversion` receives a conversion descriptor from the bridge or router.

**Steps:**

1. `ILovePDFRuntime` enqueues the conversion.
2. `_processNext` takes the next PDF if the runtime is not already running.
3. It sends/broadcasts a starting status.
4. It finds or creates an iLovePDF tab through `ILovePDFTabManager.findOrCreateILovePDFTab`.
5. It waits for the iLovePDF content script to be ready.
6. It sends `START_CONVERSION` to the iLovePDF tab.
7. The iLovePDF content script downloads the PDF blob from Python using `/api/pdfs/{pdf_id}/file`.
8. The content script assigns the PDF to the site file input using the DataTransfer API.
9. The content script clicks the conversion button.
10. The runtime waits for the iLovePDF download page URL containing `/descarga/`.
11. The runtime waits again for the content script to be ready on the download page.
12. The runtime starts a Chrome download tracker for the expected converted file.
13. The runtime sends `START_DOWNLOAD` to the content script.
14. The content script clicks the download button.
15. `ILovePDFDownloadTracker` listens for Chrome download creation/changes and resolves when a matching download completes.
16. The runtime sends `CONVERSION_STATUS` with `completed` or `error` back to Python.
17. Python updates job/PDF state and records events.

**Expected result:**  
The selected PDF is converted by iLovePDF and a completed status is sent to Python with download metadata. If any phase fails, an error status is sent.

**Involved components:**

- `ILovePDFRuntime`
- `ILovePDFTabManager`
- iLovePDF content script
- PDF uploader module
- Conversion automator module
- Download tracker module
- Python HTTP API for serving PDF files
- Python WebSocket server for status updates
- iLovePDF website

**Repository evidence:**

- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`
- `autohom-extension/ilovepdf/domHelpers.js`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`

---

### Workflow: View quick diagnostics for a job

**Trigger:**  
The user clicks “Ver logs” on a job card in the side panel.

**Steps:**

1. `sidepanel.js` calls `GET /api/jobs/{job_id}/diagnostics`.
2. `http_server.py` validates that the job exists.
3. Python returns:
   - The job object
   - The job's event list
   - Connected agents
   - Recent errors from the job store
4. The side panel renders recent event lines in the quick diagnostic area.

**Expected result:**  
The user sees recent job events and messages for the selected job.

**Involved components:**

- Side panel
- Python HTTP API
- `JobStore`
- `MultiAgentWebSocketServer`

**Repository evidence:**

- `autohom-extension/sidepanel.js`
- `app-python-zoho/http_server.py`
- `app-python-zoho/job_store.py`

---

## 5. Current observability

The project already contains several observability-related mechanisms, but they are partial and not yet an AI-ready diagnostic package.

### Existing logs

#### Python console logs

The Python backend uses `print(...)` logging for startup, state save errors, scanner errors, HTTP folder dialog errors, and WebSocket bridge logs.

Evidence:

- `app-python-zoho/app.py` prints startup, WebSocket server result, HTTP API start, and shutdown status.
- `app-python-zoho/state_manager.py` prints save errors.
- `app-python-zoho/pdf_scanner.py` prints folder scanning errors.
- `app-python-zoho/http_server.py` prints native folder dialog errors.
- `app-python-zoho/multi_agent_ws_server.py` uses `_log` to print bridge messages with a timestamp.

Useful:

- Helps during local terminal debugging.
- Gives immediate visibility into startup and bridge failures.

Missing or unclear:

- Console logs are not structured JSON.
- There is no obvious log level policy in Python.
- There is no correlation ID that connects a console log to a specific job, flow, request, tab, or WebSocket message.
- Console logs are not persisted except indirectly through runtime state events.

#### Extension console logs

The extension has a shared logging helper.

Evidence:

- `autohom-extension/ilovepdf/utils.js` defines `ILovePDFUtils.log(level, msg, details)`, which writes to `console.error`, `console.warn`, or `console.log`.
- `autohom-extension/background-main.js` uses `console.error` and `console.log` around bootstrap and bridge init.
- `autohom-extension/ilovepdf-background/runtime.js`, `downloadTracker.js`, `conversionAutomator.js`, `pdfUploader.js`, and `content.js` call `ILovePDFUtils.log`.

Useful:

- Provides detailed event-style logs from the iLovePDF automation path.
- Logs include PDF identifiers, job identifiers, filenames, URLs, tab IDs, elapsed time, and strategy names in several places.

Missing or unclear:

- Logs are confined to Chrome extension consoles unless explicitly forwarded.
- There is no centralized export of extension console logs.
- Some logs are structured as JS objects, but not persisted in a unified diagnostic store.
- Logs across service worker and content scripts may be split across different Chrome devtools contexts.

### Existing error handling

The project has explicit error handling across Python and the extension.

Evidence:

- `app-python-zoho/http_server.py` validates JSON bodies, missing jobs, missing files, missing folders, missing agents, and unimplemented Site 2 flow.
- `app-python-zoho/multi_agent_ws_server.py` handles invalid handshake, duplicate runtime, WebSocket errors, timeouts, unexpected responses, and disconnected agents.
- `app-python-zoho/flow_orchestrator.py` handles missing jobs, missing flows, missing required fields, missing agents, command failures, conversion errors, and conversion timeouts.
- `app-python-zoho/state_manager.py` falls back to default state if state file load fails due to invalid JSON or OS errors.
- `autohom-extension/ilovepdf-background/runtime.js` catches conversion errors and sends `CONVERSION_STATUS` with `status: "error"`.
- `autohom-extension/ilovepdf-background/downloadTracker.js` rejects on timeout, interrupted downloads, cancellation, or replacement.
- `autohom-extension/ilovepdf/content.js` reports content-script conversion and download errors.
- `autohom-extension/ilovepdf/conversionAutomator.js` reports broken selectors through `ILOVEPDF_SELECTOR_BROKEN`.

Useful:

- Many operational failures are captured as explicit errors rather than silent failures.
- Job status and flow status are updated when Python-side actions fail.
- Some browser automation failures are converted into status messages sent back to Python.

Missing or unclear:

- Error handling often records the error message but not the full expected-vs-actual DOM or browser state.
- Some catch blocks intentionally suppress errors, especially in `chrome.runtime.sendMessage(...).catch(() => {})`, `saveMapping` fetch error handling, and some side panel refresh calls.
- The project does not appear to capture screenshots, DOM snapshots, network request context, or tab lifecycle snapshots at the time of failure.
- Several failures return generic messages such as “Request failed,” “Unknown error,” or “Unexpected response action.”

### Existing traces or event timelines

The project has basic event timelines stored in state.

Evidence:

- `app-python-zoho/job_store.py` implements `append_event`, with fields:
  - `timestamp`
  - `event`
  - `job_id`
  - `flow_id`
  - `step_id`
  - `agent_type`
  - `message`
  - `data`
- Global events are limited to the last 1000.
- Per-job events are limited to the last 200.
- `app-python-zoho/multi_agent_ws_server.py` keeps `_connection_events` in memory with a max length of 200.
- `app-python-zoho/http_server.py` exposes `GET /api/events/recent`.
- `app-python-zoho/http_server.py` exposes `GET /api/jobs/{job_id}/diagnostics`.

Useful:

- This is already a foundation for observability.
- The data model includes job, flow, step, agent, message, and event payloads.
- It can help reconstruct a flow from job creation to command sent to conversion status.

Missing or unclear:

- Events are not full distributed traces.
- There is no trace ID spanning HTTP request, flow run, WebSocket request, browser tab, content script phase, and Chrome download.
- There is no explicit parent-child relationship between events.
- There is no explicit expected-vs-actual assertion structure.
- There is no diagnostic bundle endpoint that collects job, events, bridge state, agent state, runtime queue state, selector alerts, tab state, download tracker state, and relevant files into one export.

### Existing metrics

No formal metrics system was identified.

Evidence:

- No inspected file exposes Prometheus metrics, OpenTelemetry metrics, counters, histograms, or metrics endpoints.
- Some count-like UI stats exist in `sidepanel.js`, such as number of jobs, mapped jobs, converted jobs, and agents.
- Some bounded event queues exist in `JobStore` and `MultiAgentWebSocketServer`.

Useful:

- Side panel stats provide immediate operational counts.

Missing or unclear:

- No time-series metrics.
- No success/failure rate by workflow.
- No timeout count by phase.
- No average conversion duration, queue duration, download duration, or agent reconnect count.

### Existing debug files or diagnostic exports

No explicit diagnostic export file was identified in inspected source.

Evidence:

- `app-python-zoho/http_server.py` exposes job diagnostics and recent events via API endpoints.
- `app-python-zoho/state_manager.py` persists runtime state to `app-python-zoho/state.json`.
- `README.md` lists “Add stronger diagnostic exports for AI-assisted debugging” as a suggested roadmap item.
- `app-python-zoho/state.json` is referenced by code but was not present as a committed repository file during inspection.

Useful:

- `GET /api/jobs/{job_id}/diagnostics` is a useful partial diagnostic endpoint.
- Runtime state in `state.json` can act as a persistent debug artifact.

Missing or unclear:

- No one-click diagnostic package.
- No export that includes environment, config, recent events, job data, agent data, WebSocket request IDs, browser tab state, selector alerts, and download state.
- No file-level debug archive.

### Existing screenshots

No screenshot capture mechanism was identified.

Evidence:

- No inspected source used Chrome screenshot APIs or persisted image captures.
- Browser automation modules operate via DOM selectors and Chrome download events, but do not capture screenshots.

Useful:

- Not applicable.

Missing or unclear:

- Screenshots would be especially valuable for iLovePDF selector failures and external website UI changes.
- Current selector alerts include selector name, configured selector, used strategy, URL, and timestamp, but not visual evidence.

### Existing test reports and harnesses

No test report or formal harness was identified in inspected source.

Evidence:

- `app-python-zoho/requirements.txt` includes only `websockets` and `aiohttp`; no test framework dependency was found there.
- Search for common test/harness terms did not return indexed results through the available repository search.
- No inspected file was a test file.

Useful:

- Not applicable from inspected evidence.

Missing or unclear:

- There appears to be no automated protocol harness for WebSocket agent interactions.
- There appears to be no mocked Chrome extension test harness.
- There appears to be no deterministic replay harness for a failed conversion or Zoho mapping.
- This should be checked later with a complete repository tree listing before concluding definitively that no tests exist.

### Existing state tracking

State tracking is one of the strongest existing observability foundations.

Evidence:

- `app-python-zoho/state_manager.py` persists:
  - `version`
  - `current_folder`
  - `pdfs`
  - `jobs`
  - `flow_runs`
  - `events`
- `app-python-zoho/job_store.py` defines a job model with:
  - `id`
  - `source`
  - `pdf_id`
  - `pdf_filename`
  - `pdf_path`
  - `zoho_url`
  - `excel_path`
  - `download_id`
  - `statuses`
  - `last_error`
  - timestamps
  - `steps`
  - `events`
- `autohom-extension/ilovepdf-background/runtime.js` tracks in-memory queue state.
- `autohom-extension/ilovepdf-background/downloadTracker.js` tracks active download state.
- `app-python-zoho/agent_registry.py` tracks connected agents by type and connection ID.

Useful:

- State is persisted locally for Python-side jobs/events.
- State can reconstruct much of the backend-side workflow.
- Jobs contain both current state and recent history.

Missing or unclear:

- Extension runtime state is not automatically included in Python diagnostics.
- Browser tab state and content-script state are not persisted centrally.
- Download tracker state is in memory and exposed only through a function, not a Python-facing endpoint.
- State mutations are persisted but not necessarily versioned or recorded as before/after diffs.

### Existing retry logic

The project has several retry/reconnect/wait mechanisms.

Evidence:

- `autohom-extension/ilovepdf-background/bridge.js` schedules WebSocket reconnects and uses a Chrome alarm to reconnect.
- `app-python-zoho/multi_agent_ws_server.py` has heartbeat probes and stale-agent handling.
- `autohom-extension/ilovepdf-background/runtime.js` reloads tabs if content scripts are not ready, then waits again.
- `autohom-extension/ilovepdf-background/tabManager.js` polls for content script readiness.
- `autohom-extension/ilovepdf/domHelpers.js` waits for DOM elements using `MutationObserver`, fallback intervals, and timeouts.
- `autohom-extension/ilovepdf/conversionAutomator.js` tries fallback selector strategies for conversion and download buttons.
- `autohom-extension/ilovepdf/pdfUploader.js` tries fallback methods to find the upload-ready indicator.

Useful:

- Resilience exists for WebSocket reconnects, content script readiness, DOM delays, and selector drift.
- Fallback strategies emit alerts in several cases.

Missing or unclear:

- Retry decisions are not always recorded in the Python-side job event timeline.
- There is no explicit retry budget per job or per phase.
- Some retries happen in extension memory and may disappear if the service worker restarts.
- There is no global view of all retries for one job.

### Existing timeout handling

Timeout handling is present in several layers.

Evidence:

- `app-python-zoho/multi_agent_ws_server.py` waits for WebSocket responses with a configurable timeout and records `command.timeout`.
- `app-python-zoho/flow_orchestrator.py` waits up to 180 seconds for conversion completion.
- `autohom-extension/ilovepdf-background/runtime.js` waits for the iLovePDF download page with `DOWNLOAD_PAGE_WAIT_MS`.
- `autohom-extension/ilovepdf-background/downloadTracker.js` waits for Chrome download completion with `DOWNLOAD_CONFIRM_TIMEOUT_MS`.
- `autohom-extension/ilovepdf/domHelpers.js` waits for elements with timeout support.
- `autohom-extension/ilovepdf/config.js` defines timing constants for reconnects, content script attempts, page load waits, download page waits, download confirmation timeouts, and match windows.

Useful:

- Timeouts are explicit and configurable in several areas.
- Some timeout failures are recorded as job events or sent as statuses.

Missing or unclear:

- Timeout events do not always include a full state snapshot.
- Timeout values are distributed across Python config, flow code, and extension config.
- There is no single timeline showing all timeout windows and elapsed times for a workflow.

---

## 6. Current risks for AI-assisted debugging

### Risk 1: Missing cross-component trace ID

**Why it matters:**  
A failure may span the side panel, Python HTTP endpoint, Python WebSocket request, extension service worker, browser tab, content script, iLovePDF DOM, Chrome downloads API, and persisted state. Without a single trace ID or correlation ID, an AI agent must manually infer which events belong together.

**Where it appears:**

- `app-python-zoho/multi_agent_ws_server.py` generates `requestId` for WebSocket messages.
- `app-python-zoho/job_store.py` records `job_id`, `flow_id`, and `step_id`.
- `autohom-extension/ilovepdf-background/runtime.js` logs `jobId` and `pdfId`.
- `autohom-extension/ilovepdf-background/downloadTracker.js` logs `pdfId` and download metadata.

**Debugging failure it could cause:**  
The AI may confuse events from different jobs, different PDFs, different browser tabs, or different extension service worker sessions, especially during sequential/bulk conversions or reconnects.

---

### Risk 2: Extension logs are not centrally exported

**Why it matters:**  
Most browser automation details live in Chrome extension console logs. Those logs may be split across service worker, side panel, and content script contexts. An AI debugging agent may receive only Python state/events and miss the actual failure phase in the browser.

**Where it appears:**

- `autohom-extension/ilovepdf/utils.js` logs to browser console.
- `autohom-extension/ilovepdf-background/runtime.js` logs detailed conversion phases.
- `autohom-extension/ilovepdf/content.js` logs content-script phases.
- `autohom-extension/ilovepdf-background/downloadTracker.js` logs download matching and failures.

**Debugging failure it could cause:**  
The AI may incorrectly diagnose a backend/WebSocket issue when the real problem is a content script readiness problem, DOM selector mismatch, iLovePDF URL change, or download tracker mismatch.

---

### Risk 3: Browser tab state is not captured in diagnostics

**Why it matters:**  
The most fragile part of the system is browser automation against iLovePDF and Zoho CRM. When a tab is closed, navigates unexpectedly, fails to load a content script, or lands on the wrong URL, the backend may only receive a generic timeout or error.

**Where it appears:**

- `autohom-extension/ilovepdf-background/tabManager.js` finds, creates, updates, and waits for iLovePDF tabs.
- `autohom-extension/ilovepdf-background/runtime.js` waits for `/descarga/` and rejects if the iLovePDF tab is closed.
- `autohom-extension/ilovepdf/content.js` logs `location.href` in content-script phases.

**Debugging failure it could cause:**  
An AI may not know whether the tab was on the upload page, the conversion page, the download page, an error page, a login/captcha page, or had no content script injected.

---

### Risk 4: DOM selector failures lack complete expected-vs-actual evidence

**Why it matters:**  
The iLovePDF automation depends on CSS selectors and fallback semantic strategies. Selector drift is likely when an external website changes its UI. Without DOM snapshots, visible element summaries, or screenshots, the AI only sees that a selector failed.

**Where it appears:**

- `autohom-extension/ilovepdf/config.js` defines iLovePDF selectors.
- `autohom-extension/ilovepdf/domHelpers.js` implements fallback strategies.
- `autohom-extension/ilovepdf/conversionAutomator.js` emits `ILOVEPDF_SELECTOR_FALLBACK` and `ILOVEPDF_SELECTOR_BROKEN`.
- `autohom-extension/ilovepdf-background/router.js` persists selector alerts to `chrome.storage.local`.

**Debugging failure it could cause:**  
The AI may propose random selector changes without seeing the actual DOM state, visible buttons, language, page phase, or page variant.

---

### Risk 5: Some errors are intentionally swallowed

**Why it matters:**  
Silent failures hide causal evidence. This is especially risky in Chrome extension messaging and local HTTP calls where errors may be expected but still useful for diagnostics.

**Where it appears:**

- `autohom-extension/background-zoho.js` suppresses errors when posting Zoho mappings to Python with `catch (_) {}`.
- `autohom-extension/background-zoho.js` suppresses some runtime message errors with `.catch(() => {})`.
- `autohom-extension/sidepanel.js` catches refresh failures and resets local UI arrays without surfacing detailed error context.
- `autohom-extension/ilovepdf/content.js` and related modules use `.catch(() => {})` for several runtime messages.

**Debugging failure it could cause:**  
The AI may see missing job data or stale UI state but not know whether Python was offline, CORS failed, the API returned an error, or Chrome messaging failed.

---

### Risk 6: State changes are not recorded as before/after transitions

**Why it matters:**  
The job state model is useful, but a final state alone may not explain how the system got there. Events help, but they do not always show previous state, next state, reason, actor, and triggering input.

**Where it appears:**

- `app-python-zoho/state_manager.py` persists the current state.
- `app-python-zoho/job_store.py` appends events and updates statuses.
- `app-python-zoho/job_store.py` stores current job status fields.

**Debugging failure it could cause:**  
The AI may not identify which operation overwrote a status, reset a conversion, marked a PDF missing, or lost an Excel path.

---

### Risk 7: Generated runtime state file is not part of the repository

**Why it matters:**  
`state.json` is central to runtime diagnostics, but it is generated at runtime and was not found as a committed file. An AI reviewing only repository files will not see actual job data, event history, configured folder, PDFs, or flow runs.

**Where it appears:**

- `app-python-zoho/config.py` defines `STATE_FILE`.
- `app-python-zoho/state_manager.py` loads and saves that file.
- `app-python-zoho/state.json` was referenced by code but not available as a committed repository file during inspection.

**Debugging failure it could cause:**  
The AI may make architecture-level guesses without the real failing job's event timeline, PDF path, statuses, error message, or agent state.

---

### Risk 8: File system side effects are not fully tracked

**Why it matters:**  
The system interacts with local PDFs and downloaded Excel files. If files are missing, renamed, moved, downloaded to a different folder, or matched incorrectly, the backend may not have enough evidence to explain the failure.

**Where it appears:**

- `app-python-zoho/pdf_scanner.py` scans local PDF folders.
- `app-python-zoho/http_server.py` serves PDFs from local paths.
- `autohom-extension/ilovepdf-background/downloadTracker.js` matches Chrome downloads by tab, time window, host, extension, and normalized filename stem.
- `app-python-zoho/job_store.py` records `pdf_path` and `excel_path`.

**Debugging failure it could cause:**  
The AI may not know whether the source PDF existed at conversion time, whether the file served correctly, where the Excel was downloaded, or whether the matched download belonged to the correct job.

---

### Risk 9: External website interactions are hard to reproduce

**Why it matters:**  
Zoho CRM and iLovePDF are external websites with dynamic UI and authentication/session state. Their pages may change, load slowly, require login, rate-limit, show modals, or alter button selectors.

**Where it appears:**

- `autohom-extension/manifest.json` grants access to Zoho CRM and iLovePDF.
- `autohom-extension/background-zoho.js` depends on active tab URL shape and download metadata.
- `autohom-extension/ilovepdf/config.js` depends on iLovePDF selectors and URL pattern.
- `autohom-extension/ilovepdf/conversionAutomator.js` depends on visible/clickable DOM elements.

**Debugging failure it could cause:**  
The AI may not be able to reproduce the bug without the exact external page state, account/session state, DOM, URL, and timing.

---

### Risk 10: Message ordering and async boundaries are complex

**Why it matters:**  
The system crosses multiple async boundaries: aiohttp requests, a background WebSocket thread, daemon flow threads, Chrome service worker lifecycle, content script messages, tab events, download events, and timeouts.

**Where it appears:**

- `app-python-zoho/multi_agent_ws_server.py` runs the WebSocket server in a separate thread/event loop.
- `app-python-zoho/flow_orchestrator.py` runs flows in daemon threads.
- `autohom-extension/ilovepdf-background/runtime.js` uses asynchronous queue processing.
- `autohom-extension/ilovepdf-background/downloadTracker.js` listens to Chrome download events.
- `autohom-extension/ilovepdf-background/bridge.js` handles WebSocket reconnects and Chrome alarms.

**Debugging failure it could cause:**  
The AI may miss race conditions such as command acknowledged before conversion actually completes, tab reload while content script is not ready, download tracker replacement, service worker restart, or timeout waiters resolving with unexpected messages.

---

### Risk 11: Current diagnostics endpoint is useful but incomplete

**Why it matters:**  
`GET /api/jobs/{job_id}/diagnostics` returns job, events, agents, and recent errors, but a failing browser automation workflow needs more context.

**Where it appears:**

- `app-python-zoho/http_server.py` implements `handle_job_diagnostics`.
- `autohom-extension/sidepanel.js` renders only the last few event lines from diagnostics.

**Debugging failure it could cause:**  
The AI may receive a partial backend-centric view and miss extension runtime queue state, selector alerts, active tab URL, content script readiness, download tracker state, and raw last WebSocket messages.

---

### Risk 12: No formal reproduction harness was identified

**Why it matters:**  
Without a harness, an AI agent may only inspect static code and logs. It cannot deterministically replay a failed WebSocket command, a flow run, a folder scan, a Zoho mapping import, or an iLovePDF conversion status sequence.

**Where it appears:**

- No inspected file contains a test harness.
- `app-python-zoho/requirements.txt` does not include testing dependencies.
- The README roadmap mentions adding tests or a harness for WebSocket protocol validation.

**Debugging failure it could cause:**  
The AI may propose fixes that are not validated against a reproducible scenario, leading to regressions or repeated trial-and-error.

---

### Risk 13: Large or noisy logs may exceed AI context limits

**Why it matters:**  
This project can produce many events and browser logs during retries, polling, tab events, and conversion attempts. If all logs are copied raw, they can exceed an AI agent's context window and obscure the root cause.

**Where it appears:**

- `app-python-zoho/job_store.py` stores up to 1000 global events and 200 events per job.
- `app-python-zoho/multi_agent_ws_server.py` stores up to 200 connection events.
- Extension modules log many phase, retry, fallback, and download events.

**Debugging failure it could cause:**  
The AI may fail to read the full diagnostic context or focus on irrelevant repeated polling/retry entries instead of the causal event.

---

### Risk 14: Planned Site 2 flow is represented but not implemented

**Why it matters:**  
A future AI agent could misunderstand the `pdf_to_excel_to_site2` flow as available because it exists in config, while code explicitly marks the action as not implemented and the flow has `enabled: false`.

**Where it appears:**

- `app-python-zoho/flows/flows.json` defines `pdf_to_excel_to_site2` with `"enabled": false`.
- `app-python-zoho/http_server.py` returns a `501` error for `send-excel-site2`.
- `README.md` says `site2-uploader` is not fully implemented yet.

**Debugging failure it could cause:**  
The AI may debug a non-existent Site 2 integration as if it were a broken implemented feature.

---

## 7. Uncertainties and assumptions

### Uncertainty: Complete repository tree was not independently enumerated

**What is uncertain:**  
The inspected files provide a strong view of the main architecture, but the complete file tree was not independently enumerated through a directory listing during this review.

**Evidence found:**  
`README.md` contains an architecture tree listing the two main project folders and key files. The files referenced by that tree and runtime code were inspected directly.

**Evidence missing:**  
A full repository tree listing including hidden files, optional docs, tests, GitHub workflows, or extra scripts was not available in the inspected evidence.

**Should be checked later:**  
Run a read-only tree listing such as `git ls-tree -r --name-only HEAD` or equivalent in a local clone, then compare the result with this report.

---

### Uncertainty: Tests and harnesses may exist outside inspected files

**What is uncertain:**  
No test or harness files were identified from inspected files or indexed search results, but this should not be treated as a definitive absence until a full tree listing is checked.

**Evidence found:**  

- `app-python-zoho/requirements.txt` lists only `websockets>=12.0` and `aiohttp>=3.9`.
- No inspected source file was a test file.
- Repository search did not return results for common terms such as `pytest`, `unittest`, `test`, `harness`, or `diagnostics`.

**Evidence missing:**  
A full tree listing that confirms whether any `tests/`, `test_*.py`, `*.spec.js`, `*.test.js`, or harness scripts exist.

**Should be checked later:**  
Inspect the full repository tree and run a read-only search for test naming patterns.

---

### Uncertainty: Exact runtime contents of `state.json`

**What is uncertain:**  
The runtime state model is clear from code, but actual runtime state contents are unknown.

**Evidence found:**  

- `app-python-zoho/config.py` defines `STATE_FILE = os.path.join(BASE_DIR, "state.json")`.
- `app-python-zoho/state_manager.py` loads, normalizes, and persists `state.json`.
- `app-python-zoho/job_store.py` stores jobs, flow runs, steps, events, and errors in that state.
- `app-python-zoho/state.json` was not found as a committed file during inspection.

**Evidence missing:**  
A real runtime `state.json` from a failing or representative run.

**Should be checked later:**  
Collect a sanitized runtime `app-python-zoho/state.json` when diagnosing real failures.

---

### Uncertainty: Where converted Excel files are saved and how `excel_path` is resolved

**What is uncertain:**  
The system tracks an `excel_path` field, but the extension currently appears to send `downloadedFilename` from Chrome download metadata and Python maps that into `excel_path` when conversion completes.

**Evidence found:**  

- `app-python-zoho/multi_agent_ws_server.py` reads `excelPath` or `downloadedFilename` from `CONVERSION_STATUS` and stores it through `job_store.set_excel_path`.
- `autohom-extension/ilovepdf-background/downloadTracker.js` resolves with `filename`, `downloadId`, and `finalUrl`.
- `autohom-extension/ilovepdf-background/runtime.js` sends `downloadedFilename` and `downloadId` on completion.
- `app-python-zoho/job_store.py` stores `excel_path`.

**Evidence missing:**  
An explicit full local filesystem path for downloaded Excel files, or logic that maps Chrome download IDs to absolute local paths.

**Should be checked later:**  
Verify real Chrome download metadata and whether `downloadItem.filename` is absolute or relative in the target Chrome environment.

---

### Uncertainty: Whether Chrome service worker lifecycle causes lost runtime state

**What is uncertain:**  
The extension runtime queue, current PDF/job, and download tracker state are stored in memory. Manifest V3 service workers can be suspended/restarted by Chrome.

**Evidence found:**  

- `autohom-extension/manifest.json` uses Manifest V3 and `background-main.js` as a service worker.
- `autohom-extension/ilovepdf-background/runtime.js` stores `_queue`, `_running`, `_currentPdfId`, and `_currentJobId` in memory.
- `autohom-extension/ilovepdf-background/downloadTracker.js` stores `_active` in memory.
- `autohom-extension/ilovepdf-background/bridge.js` creates reconnect timers and alarms.

**Evidence missing:**  
Evidence of persistence/recovery for the runtime queue or active download tracker state across service worker restarts.

**Should be checked later:**  
Test behavior when Chrome suspends/restarts the extension service worker during conversion.

---

### Uncertainty: How reliable the Zoho active-tab mapping is in multi-tab scenarios

**What is uncertain:**  
The Zoho mapping logic uses the active tab at download creation time. In multi-tab or timing-sensitive scenarios, the active tab may not always be the tab that initiated the download.

**Evidence found:**  

- `autohom-extension/background-zoho.js` uses `chrome.tabs.query({ active: true, currentWindow: true })` when a download is created.
- `background-zoho.js` then resolves the task URL from that active tab URL.

**Evidence missing:**  
A robust link between `downloadItem` and the originating Zoho tab, if Chrome exposes that reliably in the target environment.

**Should be checked later:**  
Test downloads from multiple Zoho tabs and confirm whether the active tab is always the correct source tab.

---

### Uncertainty: Current behavior of iLovePDF selectors against the live website

**What is uncertain:**  
Selectors and fallback strategies are defined in code, but the live iLovePDF DOM may change.

**Evidence found:**  

- `autohom-extension/ilovepdf/config.js` defines default selectors.
- `autohom-extension/ilovepdf/domHelpers.js` defines fallback lookup strategies.
- `autohom-extension/ilovepdf/conversionAutomator.js` reports fallback or broken selectors.

**Evidence missing:**  
A current DOM snapshot, screenshot, or successful/failed conversion run against the live iLovePDF page.

**Should be checked later:**  
Collect a failing page DOM summary, selector alert payload, tab URL, and screenshot when selector failures occur.

---

### Uncertainty: Whether `pdf_to_excel_to_site2` should be visible in the UI

**What is uncertain:**  
The flow file marks `pdf_to_excel_to_site2` as disabled, but the side panel renders all flows returned by `/api/flows` without obvious filtering in the inspected code.

**Evidence found:**  

- `app-python-zoho/flows/flows.json` sets `"enabled": false` for `pdf_to_excel_to_site2`.
- `app-python-zoho/flow_orchestrator.py` returns all flows from the JSON file.
- `autohom-extension/sidepanel.js` renders all flows from the API.
- `app-python-zoho/http_server.py` reports Site 2 upload as not implemented.

**Evidence missing:**  
A UI rule or backend rule that filters disabled flows from the side panel.

**Should be checked later:**  
Confirm whether disabled flows should be hidden, shown as planned, or prevented from execution.

---

### Uncertainty: Security boundaries for local API and file serving

**What is uncertain:**  
The backend uses permissive CORS and serves local PDF files by ID. This may be acceptable for a local-only development tool, but the intended security posture is unclear.

**Evidence found:**  

- `app-python-zoho/http_server.py` sets `Access-Control-Allow-Origin: *`.
- `app-python-zoho/http_server.py` serves local PDF files through `/api/pdfs/{pdf_id}/file`.
- `autohom-extension/manifest.json` includes host permissions for `http://127.0.0.1/*` and `http://localhost/*`.
- `README.md` notes permissive CORS as a current limitation.

**Evidence missing:**  
A documented production/security mode or local access policy.

**Should be checked later:**  
Clarify whether this project is strictly personal/local or intended for broader distribution.

---

### Uncertainty: Whether job diagnostics should be considered sufficient for AI debugging

**What is uncertain:**  
The project already has useful job diagnostics, but it is not yet clear how much diagnostic depth is required for the user's AI-assisted debugging workflow.

**Evidence found:**  

- `GET /api/jobs/{job_id}/diagnostics` returns job, events, agents, and recent errors.
- `JobStore` records job events, step results, and statuses.
- `README.md` explicitly lists stronger diagnostic exports for AI-assisted debugging as a future roadmap item.

**Evidence missing:**  
A real failed run diagnostic package and examples of failures that the current diagnostics failed to explain.

**Should be checked later:**  
Collect one or two representative failures and compare current diagnostics against what an AI agent would need to isolate the fault.

---

## Closing note

This artifact is intentionally limited to project understanding and discovery. It does not implement observability, create repository files, create issues, create pull requests, create branches, install dependencies, or propose the final observability solution.
