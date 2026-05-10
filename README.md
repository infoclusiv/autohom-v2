# AutoHom v2

**AutoHom v2** is a local automation orchestrator that connects a Python backend with one or more Chrome extension agents through WebSockets. Its current implementation focuses on automating a workflow around Zoho CRM, local PDF files, and PDF-to-Excel conversion through iLovePDF.

The project is designed as a central control panel for browser-based automations: the Python app keeps state, exposes an HTTP API, manages jobs and flows, and communicates with specialized extension agents that execute actions inside websites.

> Current main workflow: detect/map PDF files from Zoho CRM, scan local PDFs, create jobs, send conversion commands to an iLovePDF Chrome extension agent, track conversion status, and expose diagnostics per job.

---

## Main Features

- Local Python orchestration server.
- HTTP API running on `http://localhost:7790`.
- WebSocket server running on `ws://localhost:8769`.
- Chrome Extension Manifest V3.
- Zoho CRM PDF download detection and task URL mapping.
- iLovePDF PDF-to-Excel automation agent.
- Local folder scanning for `.pdf` files.
- Persistent local state in `state.json`.
- Job-based execution model.
- Flow-based automation model.
- Multi-agent WebSocket architecture.
- Per-job diagnostics and recent event tracking.
- Side panel UI for jobs, agents, flows, logs, and folder scanning.

---

## Architecture Overview

AutoHom v2 is split into two main parts:

```text
autohom-v2/
├── app-python-zoho/
│   ├── app.py
│   ├── config.py
│   ├── http_server.py
│   ├── multi_agent_ws_server.py
│   ├── agent_registry.py
│   ├── state_manager.py
│   ├── job_store.py
│   ├── flow_orchestrator.py
│   ├── pdf_scanner.py
│   ├── requirements.txt
│   └── flows/
│       └── flows.json
│
└── autohom-extension/
    ├── manifest.json
    ├── background-main.js
    ├── background-zoho.js
    ├── sidepanel.html
    ├── sidepanel.js
    ├── ilovepdf/
    └── ilovepdf-background/
```

### Python Backend

The Python backend is the central orchestrator. It starts:

1. A shared state manager.
2. A job store.
3. A multi-agent WebSocket server.
4. A flow orchestrator.
5. An HTTP API.

The main entry point is:

```bash
app-python-zoho/app.py
```

### Chrome Extension

The Chrome extension acts as the browser automation layer. It has two main responsibilities:

1. Detect and map PDF downloads from Zoho CRM.
2. Connect to the Python backend as an `ilovepdf-converter` agent and execute PDF-to-Excel conversions through iLovePDF.

The extension uses:

- `background-main.js` as the service worker entry point.
- `background-zoho.js` for Zoho CRM download detection and mapping.
- `ilovepdf-background/bridge.js` as the WebSocket client.
- `sidepanel.js` as the local control panel UI.

---

## How It Works

### 1. Start the Python Orchestrator

The Python backend starts the HTTP API and WebSocket server.

```bash
cd app-python-zoho
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Expected services:

```text
HTTP API:   http://localhost:7790
WebSocket:  ws://localhost:8769
```

### 2. Load the Chrome Extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `autohom-extension/` folder.

### 3. Open the Side Panel

Click the extension icon to open the side panel.

The side panel shows:

- Python bridge status.
- Connected agents.
- Available flows.
- Jobs created from local PDFs or Zoho mappings.
- Job statuses.
- Conversion actions.
- Recent logs and diagnostics.

### 4. Select or Scan a PDF Folder

From the side panel, select a local folder containing PDF files.

The Python backend scans the folder and creates or updates jobs for each PDF.

### 5. Map Zoho Downloads

When a PDF is downloaded from Zoho CRM, the extension detects it and asks whether it should be mapped to the related Zoho Case URL.

Confirmed mappings are sent to:

```text
POST /api/jobs/import-zoho-mapping
```

### 6. Convert PDF to Excel

When a job is converted, the backend sends a `CONVERT_PDF` command to the connected `ilovepdf-converter` agent.

The extension opens and automates iLovePDF, uploads the PDF, starts conversion, tracks the download, and sends status updates back to Python.

---

## Available Flows

Flows are configured in:

```text
app-python-zoho/flows/flows.json
```

Current flows:

### `pdf_to_excel`

Converts a local PDF to Excel using the iLovePDF agent.

Required fields:

```text
pdf_id
pdf_filename
```

Produced field:

```text
excel_path
```

### `pdf_to_excel_to_site2`

Planned flow for converting a PDF to Excel and sending the Excel file to a second website.

Current status:

```text
enabled: false
```

The `site2-uploader` agent is not fully implemented yet.

---

## HTTP API

Base URL:

```text
http://localhost:7790/api
```

Important endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/config` | Get current backend configuration. |
| `POST` | `/config` | Set the current PDF folder and scan it. |
| `POST` | `/folder-dialog` | Open native folder picker. |
| `POST` | `/scan` | Scan current PDF folder. |
| `GET` | `/pdfs` | List tracked PDFs. |
| `GET` | `/pdfs/{pdf_id}/file` | Serve a local PDF file. |
| `POST` | `/pdfs/{pdf_id}/status` | Update PDF status. |
| `POST` | `/pdfs/clear` | Clear tracked PDFs. |
| `GET` | `/bridge` | Get WebSocket bridge and agent state. |
| `GET` | `/agents` | List connected automation agents. |
| `GET` | `/jobs` | List all jobs. |
| `GET` | `/jobs/{job_id}` | Get one job. |
| `GET` | `/jobs/{job_id}/diagnostics` | Get job events, agents, and recent errors. |
| `POST` | `/jobs/import-zoho-mapping` | Import a Zoho PDF mapping. |
| `POST` | `/jobs/{job_id}/actions/open-zoho` | Return the Zoho URL for a job. |
| `POST` | `/jobs/{job_id}/actions/convert-pdf` | Queue PDF conversion. |
| `POST` | `/jobs/{job_id}/actions/send-excel-site2` | Planned Site 2 upload action. |
| `POST` | `/jobs/{job_id}/flows/run` | Run a flow for a job. |
| `GET` | `/flows` | List available flows. |
| `GET` | `/events/recent` | List recent backend events. |

---

## WebSocket Agent Protocol

The backend expects browser automation agents to connect to:

```text
ws://localhost:8769
```

Agents identify themselves with an `AGENT_CONNECTED` message.

Current main agent type:

```text
ilovepdf-converter
```

Supported agent capability examples:

```text
convert_pdf_to_excel
detect_excel_download
```

Common message actions:

| Action | Direction | Purpose |
|---|---|---|
| `AGENT_CONNECTED` | Extension → Python | Register browser automation agent. |
| `PING` | Python → Extension | Keepalive probe. |
| `PONG` | Extension → Python | Keepalive response. |
| `CONVERT_PDF` | Python → Extension | Ask agent to convert a PDF. |
| `CONVERT_PDF_ACK` | Extension → Python | Confirm command received. |
| `CONVERSION_STATUS` | Extension → Python | Report conversion progress, error, or completion. |

---

## State and Diagnostics

AutoHom v2 keeps local state in:

```text
app-python-zoho/state.json
```

The state includes:

- Current PDF folder.
- PDFs discovered by scanner.
- Jobs.
- Flow runs.
- Recent events.

Each job can include:

- PDF ID.
- PDF filename.
- Local PDF path.
- Zoho URL.
- Excel output path.
- Statuses for Zoho, conversion, Site 2, and flow.
- Step results.
- Recent job events.
- Last error.

Diagnostics can be requested with:

```text
GET /api/jobs/{job_id}/diagnostics
```

This is useful for debugging browser automation failures because it provides job context, events, connected agents, and recent errors.

---

## Requirements

### Python

- Python 3.10 or newer recommended.
- `aiohttp`
- `websockets`

Install dependencies:

```bash
cd app-python-zoho
pip install -r requirements.txt
```

### Browser

- Google Chrome or Chromium-based browser.
- Chrome Extensions Developer Mode enabled.
- Access to:
  - Zoho CRM
  - iLovePDF

---

## Development Notes

### Local-only design

This project is designed to run locally. The backend listens on `localhost`, and the extension communicates with it through local HTTP and WebSocket connections.

### Site automation fragility

The iLovePDF automation depends on DOM selectors. If iLovePDF changes its page structure, selectors may need to be updated in the site profile configuration.

### Multi-agent direction

The current architecture is moving from a single-extension bridge to a multi-agent model. This allows future specialized agents such as:

- `ilovepdf-converter`
- `site2-uploader`
- Additional website-specific automation agents

### Current limitations

- The `site2-uploader` flow is planned but not fully implemented.
- The project currently uses permissive CORS for local development.
- The repository does not currently include a license file.
- Third-party website automation may break if external websites change their UI.

---

## Suggested Roadmap

- Implement the `site2-uploader` agent.
- Add stronger diagnostic exports for AI-assisted debugging.
- Add structured observability around flows, agent decisions, and expected-vs-actual failures.
- Add tests or a harness for WebSocket agent protocol validation.
- Add a `.env` or config layer for ports and runtime options.
- Add a license file.
- Add screenshots or GIFs of the side panel.
- Add a safer production/security mode for CORS and local file serving.

---

## License

No license file is currently included in the repository.

Before publishing for external use, add an explicit license such as MIT, Apache-2.0, or a private/internal-use license depending on how the project should be shared.
