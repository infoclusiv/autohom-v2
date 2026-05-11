# Implementation Roadmap — AI-Ready Observability for AutoHom v2

Repository context: `infoclusiv/autohom-v2`  
Target output: phased implementation roadmap only  
Application code changes in this step: **none**  
Recommended future artifact path inside the repository: `docs/observability/implementation_roadmap.md`

---

## Source documents reviewed

This roadmap is based on the existing observability discovery and architecture documents:

- `docs/observability/project_understanding.md`
- `docs/observability/observability_classification.md`
- `docs/observability/critical_workflows.md`
- `docs/observability/failure_surface_map.md`
- `docs/observability/observability_architecture_proposal.md`

The roadmap assumes the current AutoHom v2 architecture documented in those files:

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

---

## Roadmap objective

Implement observability in small, safe phases that move AutoHom v2 from partial console/job logging toward a complete AI-ready diagnostic system.

The goal is **not** to add generic logs everywhere.

The goal is to produce compact, correlated evidence that can answer:

- What user action or browser event started the workflow?
- Which `job_id`, `pdf_id`, `flow_run_id`, `trace_id`, agent, tab, and download were involved?
- What was the last successful phase?
- What was expected to happen next?
- What actually happened instead?
- Which state transition was missing, invalid, duplicated, or late?
- Which decision caused the system to choose a path?
- Which evidence proves the root cause?
- Can an AI coding agent read one diagnostic package and propose a precise fix?

---

## Implementation principles

1. **Start with a minimal safe layer.**  
   Do not begin with screenshots, DOM capture, or heavy exporters. First create the schema, architecture baseline, and append-only event foundation.

2. **Keep each phase independently mergeable.**  
   Each phase should be implementable and testable without depending on all later phases.

3. **Prefer structured domain events over noisy debug logs.**  
   Emit events at workflow boundaries, state transitions, decisions, failures, and external interactions.

4. **Use one shared vocabulary across Python and JavaScript.**  
   Python backend events and Chrome extension events must be mergeable into one timeline.

5. **Do not block the automation because observability fails.**  
   Observability must be best-effort and safe. If event capture fails, the main workflow should continue unless the phase explicitly tests failure behavior.

6. **Avoid sensitive or huge payloads by default.**  
   Do not store full PDFs, Excel files, full page HTML, or huge raw logs in diagnostic output unless a later explicit debug mode is added.

7. **Make evidence AI-readable.**  
   The final diagnostic package should be compact enough for an AI coding agent to consume without exceeding context limits.

8. **Keep the first implementation local-only.**  
   No external log aggregation, no cloud observability platform, and no full OpenTelemetry deployment in early phases.

---

## Suggested implementation order

The phases below are intentionally sequential:

1. Documentation and architecture baseline
2. Structured event model
3. Unified timeline
4. Correlation IDs and execution context
5. State machine instrumentation
6. Decision logging
7. Evidence capture
8. Diagnostic export package
9. Test harness
10. Verification and regression protection

A future AI coding agent should implement one phase at a time, run the phase-specific tests, and stop for review before continuing to the next phase.

---

# Phase 1 — Documentation and architecture baseline

## 1. Goal

Create a safe baseline that documents exactly where observability will live, what it will record, how it will remain compact, and how it will be introduced without changing runtime behavior.

This phase should produce the architectural scaffolding and repository documentation needed before writing instrumentation code.

The purpose is to prevent the future coding agent from randomly adding `print`, `console.log`, or duplicated logging systems in unrelated files.

## 2. Files likely to be created

- `docs/observability/implementation_roadmap.md`
- `docs/observability/event_schema.md`
- `docs/observability/event_taxonomy.md`
- `docs/observability/correlation_model.md`
- `docs/observability/state_machines.md`
- `docs/observability/diagnostic_package_spec.md`
- `docs/observability/observability_rollout_notes.md`

Optional if useful:

- `docs/observability/component_map.md`
- `docs/observability/evidence_capture_policy.md`
- `docs/observability/testing_strategy.md`

## 3. Files likely to be modified

None required in application code.

Optional documentation-only modification:

- `README.md` may add a short link to the observability docs, but this is optional and should not be done unless requested.

## 4. Expected output

A documentation-only baseline that defines:

- Observability goals and non-goals.
- Required event envelope fields.
- Event naming convention.
- Initial event taxonomy.
- Required identifiers and propagation rules.
- State machines to instrument later.
- Diagnostic export structure.
- Evidence capture policy.
- Rollout sequence.
- What is explicitly out of scope in early phases.

Recommended event envelope draft:

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
  "reply_to": "req_...",
  "connection_id": "conn_...",
  "runtime_instance_id": "rt_...",
  "agent_id": "ilovepdf-converter",
  "agent_type": "ilovepdf-converter",
  "sidepanel_session_id": "sp_...",
  "process_run_id": "proc_...",
  "extension_start_id": "extstart_...",
  "tab_id": 123,
  "download_id": 456,
  "message": "Human-readable short message",
  "expected": {},
  "actual": {},
  "data": {},
  "duration_ms": 12
}
```

## 5. Acceptance criteria

- Documentation exists and is clear enough for an AI coding agent to implement Phase 2 without guessing the architecture.
- The docs explicitly say this is **not** a generic logging layer.
- The docs identify Python and Chrome extension observability boundaries separately.
- The docs define required IDs: `trace_id`, `job_id`, `pdf_id`, `flow_run_id`, `request_id`, `connection_id`, `runtime_instance_id`, `tab_id`, `download_id`, `sidepanel_session_id`, and `process_run_id`.
- The docs define at least the following event domains:
  - `process.*`
  - `state.*`
  - `http.*`
  - `ws.*`
  - `agent.*`
  - `sidepanel.*`
  - `user.action.*`
  - `workflow.*`
  - `flow.*`
  - `conversion.*`
  - `runtime.*`
  - `tab.*`
  - `content.*`
  - `selector.*`
  - `download.*`
  - `zoho.*`
  - `diagnostic.*`
- The docs include a privacy and payload-size policy.
- No runtime behavior changes.
- No application code is modified unless the user explicitly allows documentation links in README.

## 6. Risks

- The documentation could become too abstract and not executable.
- The event taxonomy could become too large before implementation starts.
- The future coding agent might treat this as permission to instrument every line of code.
- The docs could conflict with existing job events if the current event model is not reviewed carefully during Phase 2.

## 7. How to test it

Documentation review checklist:

- Ask an AI coding agent: “Using only these observability docs, identify the first five files you would change for Phase 2.” The answer should be consistent with this roadmap.
- Verify that each event field has a purpose.
- Verify that each state machine maps to a documented workflow or failure surface.
- Verify that the docs explain what not to capture.
- Verify that there are no instructions to modify production logic yet.

No automated runtime test is required in this phase.

## 8. What not to do in this phase

- Do not add telemetry code.
- Do not modify `app.py`, `http_server.py`, `multi_agent_ws_server.py`, `job_store.py`, or extension JavaScript files.
- Do not add screenshots, DOM capture, or diagnostic export endpoints yet.
- Do not add OpenTelemetry.
- Do not create a dashboard.
- Do not add heavy dependencies.
- Do not change job, flow, or conversion behavior.

---

# Phase 2 — Structured event model

## 1. Goal

Create the minimal shared structured event foundation for Python and JavaScript.

This phase introduces a safe append-only event model but should instrument only a few low-risk locations at first. The priority is schema consistency and safety, not complete coverage.

## 2. Files likely to be created

Python:

- `app-python-zoho/observability/__init__.py`
- `app-python-zoho/observability/schema.py`
- `app-python-zoho/observability/event_writer.py`
- `app-python-zoho/observability/sanitize.py`
- `app-python-zoho/observability/clock.py`
- `app-python-zoho/observability/config.py`

Chrome extension:

- `autohom-extension/observability/eventEnvelope.js`
- `autohom-extension/observability/eventWriter.js`
- `autohom-extension/observability/sanitize.js`
- `autohom-extension/observability/clock.js`

Documentation updates:

- `docs/observability/event_schema.md`
- `docs/observability/event_taxonomy.md`

## 3. Files likely to be modified

Python, minimal first instrumentation:

- `app-python-zoho/app.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`

Chrome extension, minimal first instrumentation:

- `autohom-extension/background-main.js`
- `autohom-extension/sidepanel.js`
- `autohom-extension/ilovepdf-background/bridge.js`

Optional configuration file if needed:

- `app-python-zoho/config.py`
- `autohom-extension/ilovepdf/config.js`

## 4. Expected output

A small observability utility layer that can emit normalized JSON events from both Python and JavaScript.

Minimum Python behavior:

- Build event dictionaries with consistent fields.
- Add ISO timestamp and monotonic time.
- Sanitize large/sensitive values.
- Write events to an in-memory buffer and/or JSONL file.
- Fail safely if writing fails.

Minimum JavaScript behavior:

- Build event objects with the same field names.
- Add ISO timestamp and monotonic time using browser-safe APIs.
- Sanitize payloads.
- Store locally in a bounded buffer or send to Python only in later phases.
- Fail safely if event capture fails.

Recommended first events:

Python:

- `process.started`
- `state.load.started`
- `state.load.succeeded`
- `state.load.failed`
- `state.save.succeeded`
- `state.save.failed`
- `http.server.starting`
- `ws.server.starting`

JavaScript:

- `extension.bootstrap.started`
- `extension.bootstrap.succeeded`
- `extension.bootstrap.failed`
- `sidepanel.opened`
- `bridge.ws.connect_attempted`

## 5. Acceptance criteria

- Python can create a valid event with the agreed schema.
- JavaScript can create a valid event with the agreed schema.
- Events include at minimum:
  - `schema_version`
  - `ts`
  - `monotonic_ms`
  - `severity`
  - `component`
  - `event`
  - `message`
  - `data`
- Optional fields are omitted or set to `null` consistently.
- Event writer failures do not crash the application.
- Large fields are truncated or summarized.
- No full PDF, Excel, or full HTML content is captured.
- The system can be run with observability enabled without changing the main workflow outcome.
- Existing job events still work.
- Existing side panel behavior still works.

## 6. Risks

- Event capture could become noisy immediately.
- Python and JavaScript schema implementations could drift.
- Writing JSONL files on every event could become slow if not buffered or bounded.
- The extension service worker lifecycle could lose in-memory events if the storage strategy is not considered.
- Instrumentation might accidentally include sensitive file paths or large payloads without sanitization.

## 7. How to test it

Manual tests:

1. Start Python backend.
2. Open the Chrome extension side panel.
3. Confirm the app still starts and side panel still refreshes.
4. Confirm structured events are created in the expected sink.
5. Confirm malformed data passed into the event writer is sanitized, not fatal.

Suggested unit tests:

Python:

- `tests/observability/test_schema.py`
- `tests/observability/test_event_writer.py`
- `tests/observability/test_sanitize.py`

JavaScript:

- A lightweight Node-based test if the repo already supports it, or a simple browser-console test harness later.

Checks:

- Validate event schema required fields.
- Validate timestamp format.
- Validate max string length truncation.
- Validate nested object truncation.
- Validate safe failure when the sink cannot write.

## 8. What not to do in this phase

- Do not instrument every workflow yet.
- Do not implement unified timelines yet.
- Do not introduce correlation propagation yet beyond accepting optional IDs.
- Do not implement screenshots or DOM snapshots.
- Do not implement diagnostic exports.
- Do not create a UI dashboard.
- Do not replace existing job store logic.
- Do not change WebSocket protocol behavior except adding optional metadata only if safe.

---

# Phase 3 — Unified timeline

## 1. Goal

Create a unified timeline collector that can reconstruct events for a job, PDF, flow run, trace, process run, or agent connection.

This phase turns structured events into a useful debugging sequence.

## 2. Files likely to be created

Python:

- `app-python-zoho/observability/timeline.py`
- `app-python-zoho/observability/event_store.py`
- `app-python-zoho/observability/query.py`

Optional:

- `app-python-zoho/observability/jsonl_store.py`
- `app-python-zoho/observability/memory_store.py`

Documentation:

- `docs/observability/unified_timeline.md`

## 3. Files likely to be modified

Python:

- `app-python-zoho/http_server.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/app.py`

Chrome extension, only if event forwarding to Python is introduced here:

- `autohom-extension/sidepanel.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/observability/eventWriter.js`

Possible API routes:

- `GET /api/events/recent`
- `GET /api/jobs/{job_id}/timeline`
- `GET /api/traces/{trace_id}/timeline`

If new routes are added, they should be local-only and read-only.

## 4. Expected output

A timeline service that can:

- Store events in append-only order.
- Sort by `ts` and `monotonic_ms` where available.
- Filter by:
  - `trace_id`
  - `job_id`
  - `pdf_id`
  - `flow_run_id`
  - `request_id`
  - `connection_id`
  - `runtime_instance_id`
  - `tab_id`
  - `download_id`
  - `component`
  - `severity`
- Return compact timelines for diagnostics.
- Detect when the timeline is incomplete or truncated.

Recommended response shape:

```json
{
  "ok": true,
  "query": { "job_id": "job_..." },
  "event_count": 42,
  "truncated": false,
  "timeline": [
    {
      "ts": "...",
      "component": "python.http",
      "event": "conversion.requested",
      "phase": "requested",
      "message": "Convert clicked for job",
      "job_id": "job_...",
      "trace_id": "trace_..."
    }
  ]
}
```

## 5. Acceptance criteria

- Events can be queried by `job_id`.
- Events can be queried by `trace_id` when present.
- Current `/api/jobs/{job_id}/diagnostics` can include or reference the unified timeline without breaking existing UI behavior.
- Timeline output is sorted and compact.
- Timeline output clearly states if events were truncated.
- The timeline does not include full file contents or full HTML.
- Timeline generation handles missing fields safely.
- The side panel can still show recent logs or diagnostics.

## 6. Risks

- Existing `JobStore` events and new observability events may duplicate each other.
- Timeline queries could become slow if the store grows without bounds.
- JavaScript events may remain isolated in the extension unless a forwarding path is designed.
- Event ordering across Python and browser contexts may be imperfect due clock differences.

## 7. How to test it

Manual tests:

1. Start backend.
2. Open side panel.
3. Trigger a folder scan or a job diagnostics request.
4. Call the new timeline endpoint or existing diagnostics endpoint.
5. Verify events appear in chronological order.
6. Verify the output is useful even when only Python events exist.

Suggested automated tests:

- Add synthetic events with mixed timestamps and verify ordering.
- Add events with same `job_id` and different `trace_id`; verify filters.
- Add many events and verify truncation metadata.
- Add malformed/partial events and verify query does not crash.

## 8. What not to do in this phase

- Do not require perfect distributed tracing yet.
- Do not block conversion if extension events are not yet forwarded.
- Do not add heavy databases.
- Do not capture screenshots or DOM.
- Do not implement full diagnostic package ZIP export yet.
- Do not make timelines so verbose they exceed AI context quickly.

---

# Phase 4 — Correlation IDs and execution context

## 1. Goal

Propagate correlation identifiers across the actual workflow path so a single conversion attempt can be traced end-to-end.

This is the phase where timelines become causally useful.

## 2. Files likely to be created

Python:

- `app-python-zoho/observability/context.py`
- `app-python-zoho/observability/ids.py`

Chrome extension:

- `autohom-extension/observability/context.js`
- `autohom-extension/observability/ids.js`

Documentation:

- `docs/observability/correlation_model.md` update

## 3. Files likely to be modified

Python:

- `app-python-zoho/app.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/agent_registry.py`

Chrome extension:

- `autohom-extension/sidepanel.js`
- `autohom-extension/background-main.js`
- `autohom-extension/background-zoho.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/router.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`

## 4. Expected output

A consistent execution context object passed through workflow boundaries.

Minimum context fields:

```json
{
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "flow_id": "pdf_to_excel",
  "flow_run_id": "flowrun_...",
  "user_action_id": "ua_...",
  "request_id": "req_...",
  "reply_to": "req_...",
  "connection_id": "conn_...",
  "runtime_instance_id": "rt_...",
  "sidepanel_session_id": "sp_...",
  "process_run_id": "proc_...",
  "extension_start_id": "extstart_...",
  "tab_id": 123,
  "download_id": 456
}
```

Required propagation examples:

### Convert button path

```text
sidepanel user click
  creates user_action_id + trace_id
  -> POST /api/jobs/{job_id}/actions/convert-pdf
  -> Python validates job and attaches job_id/pdf_id
  -> WebSocket CONVERT_PDF includes trace_id/job_id/pdf_id/request_id
  -> extension bridge ACK includes reply_to/request_id/trace_id/job_id/pdf_id
  -> runtime queue item includes same context
  -> content script receives context
  -> download tracker receives context
  -> final CONVERSION_STATUS includes trace_id/job_id/pdf_id
  -> Python state update/timeline uses same trace_id
```

### Flow path

```text
sidepanel run flow
  creates trace_id + user_action_id
  -> Python creates flow_run_id
  -> each flow step gets request_id and inherits trace_id/job_id/pdf_id/flow_run_id
  -> conversion command and final status retain same trace_id and flow_run_id where possible
```

### Zoho mapping path

```text
chrome.downloads.onCreated
  creates trace_id + download_id
  -> pending mapping stores trace_id/download_id
  -> user confirmation carries trace_id into import request
  -> Python job mapping update records trace_id/job_id/zoho_url
```

## 5. Acceptance criteria

- A conversion attempt has one `trace_id` from user click to final status where possible.
- WebSocket commands have `request_id` and responses include `reply_to` or equivalent pairing.
- Side panel actions include `user_action_id`.
- Python process startup has a stable `process_run_id`.
- Extension bootstrap has a stable `extension_start_id` and `runtime_instance_id`.
- Agent connections have `connection_id`.
- Flow runs have `flow_run_id`.
- Timeline queries by `trace_id` show events from multiple components.
- Backward compatibility is preserved if older messages lack new optional fields.
- Existing conversion commands still work.

## 6. Risks

- Adding fields to WebSocket payloads could break code that assumes exact payload shape.
- Multiple IDs could become confusing if naming is inconsistent.
- Trace IDs could be regenerated accidentally at sub-steps instead of propagated.
- Extension service worker restarts could lose runtime context unless persisted in queue items or message payloads.
- Existing job IDs and PDF IDs may be missing in some workflows, especially Zoho-only mappings.

## 7. How to test it

Manual test path:

1. Start Python backend.
2. Open side panel.
3. Trigger a convert action for a scanned PDF job.
4. Inspect the timeline by `job_id` and `trace_id`.
5. Verify the same `trace_id` appears in:
   - side panel action event
   - Python HTTP event
   - WebSocket command event
   - extension bridge event
   - runtime queue event, if instrumented
   - final conversion status event, if completed

Harness tests:

- Generate context in Python and verify ID format.
- Generate context in JS and verify ID format.
- Simulate a WebSocket command and ACK with `request_id`/`reply_to`.
- Simulate missing old-style payload and verify fallback behavior.
- Verify a flow run uses one `trace_id` and one `flow_run_id`.

## 8. What not to do in this phase

- Do not implement state machine validation yet.
- Do not add DOM snapshots or screenshots.
- Do not change business logic outcomes.
- Do not make correlation IDs required for old persisted jobs.
- Do not fail a conversion just because a trace ID is missing; generate one and record the fallback.
- Do not add external tracing platforms.

---

# Phase 5 — State machine instrumentation

## 1. Goal

Make the most important workflow states explicit and visible through structured state-transition events.

This phase should reveal where a workflow got stuck, moved too early, moved too late, or contradicted another state.

## 2. Files likely to be created

Python:

- `app-python-zoho/observability/state_machine.py`
- `app-python-zoho/observability/state_transition.py`
- `app-python-zoho/observability/state_rules.py`

Chrome extension:

- `autohom-extension/observability/stateMachine.js`
- `autohom-extension/observability/stateTransition.js`

Documentation:

- `docs/observability/state_machines.md` update

## 3. Files likely to be modified

Python:

- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/agent_registry.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/pdf_scanner.py`

Chrome extension:

- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf-background/router.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/background-zoho.js`
- `autohom-extension/sidepanel.js`

## 4. Expected output

Structured `state.transition` events for core state machines.

Recommended first state machines:

### Job conversion state machine

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

### Flow run state machine

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

### Agent connection state machine

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

### Runtime queue state machine

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

### Download tracker state machine

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

Recommended event shape:

```json
{
  "event": "state.transition",
  "component": "extension.runtime",
  "state_machine": "conversion",
  "entity_id": "job_...",
  "from": "queued",
  "to": "runtime_queued",
  "reason": "ILovePDFRuntime accepted queue item",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "expected": { "previous_state": "queued" },
  "actual": { "previous_state": "queued" }
}
```

## 5. Acceptance criteria

- Job conversion transitions are emitted for the main convert path.
- Flow run transitions are emitted for the `pdf_to_excel` path.
- Agent connection transitions are emitted for connect, handshake, registered, disconnected, stale, or duplicate runtime cases.
- Runtime queue transitions are emitted when a conversion is enqueued, started, completed, or fails.
- Download tracker transitions are emitted for tracking started, candidate seen, matched, completed, timeout, interrupted, or replaced.
- Invalid or suspicious transitions are recorded as `state.invalid_transition` or `state.conflict_detected`, not silently ignored.
- Timeline can show the last known state per entity.
- Existing statuses in `JobStore` and `StateManager` are not broken.
- The system remains backward compatible with existing state records.

## 6. Risks

- Defining states too granularly could create event noise.
- Defining states too vaguely could fail to diagnose actual stuck points.
- Existing code may have implicit transitions that do not map perfectly to the proposed state machine.
- Strict validation could break real workflows if introduced too early.
- State transitions across Python and extension could be duplicated unless carefully named by component and state machine.

## 7. How to test it

Manual tests:

1. Scan a PDF folder.
2. Confirm PDF and job state transitions appear.
3. Trigger conversion with agent disconnected.
4. Confirm transition to `agent_missing` or validation failure is visible.
5. Connect agent and trigger conversion.
6. Confirm transitions from queued to command sent to acknowledged to runtime queued.

Harness tests:

- Simulate missing PDF file and verify `file_missing` transition.
- Simulate agent missing and verify no WebSocket command is sent.
- Simulate WebSocket ACK timeout and verify timeout transition.
- Simulate late completion after flow timeout and verify `state.conflict_detected`.
- Simulate download tracker replacement and verify explicit transition.

## 8. What not to do in this phase

- Do not fully rewrite workflow logic as a new orchestration engine.
- Do not enforce all invalid transitions as fatal errors yet.
- Do not add browser screenshots or DOM capture yet.
- Do not implement export package ZIPs yet.
- Do not rename existing persisted statuses without migration.
- Do not add a global giant state machine; keep domain-specific state machines.

---

# Phase 6 — Decision logging

## 1. Goal

Instrument the important automation decisions that explain why the system chose one path instead of another.

This phase helps diagnose failures where the code technically “worked” but made the wrong assumption.

## 2. Files likely to be created

Python:

- `app-python-zoho/observability/decision.py`
- `app-python-zoho/observability/policy.py`

Chrome extension:

- `autohom-extension/observability/decision.js`
- `autohom-extension/observability/policy.js`

Documentation:

- `docs/observability/decision_logging.md`

## 3. Files likely to be modified

Python:

- `app-python-zoho/http_server.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/agent_registry.py`
- `app-python-zoho/pdf_scanner.py`
- `app-python-zoho/job_store.py`

Chrome extension:

- `autohom-extension/background-zoho.js`
- `autohom-extension/sidepanel.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`
- `autohom-extension/ilovepdf/domHelpers.js`

## 4. Expected output

Decision events at high-impact points only.

Recommended decision event shape:

```json
{
  "event": "decision.made",
  "component": "extension.downloadTracker",
  "decision_name": "download_match",
  "chosen_action": "accept_candidate",
  "reason": "Candidate matched expected stem, tab ID, host, extension, and time window",
  "input_context": {
    "expected_stem": "acta_123",
    "candidate_filename": "acta_123.xlsx",
    "candidate_host": "www.ilovepdf.com",
    "same_tab": true,
    "within_time_window": true
  },
  "options_considered": ["accept_candidate", "reject_candidate", "continue_waiting"],
  "expected": { "candidate_should_be_excel": true },
  "actual": { "extension": "xlsx", "state": "complete" },
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "download_id": 456
}
```

Required decision points:

### Python decisions

- Accept or reject HTTP conversion request.
- Determine if job has enough PDF data to convert.
- Determine if `ilovepdf-converter` agent is connected.
- Accept or reject WebSocket handshake.
- Detect duplicate runtime.
- Decide flow precondition pass/failure.
- Decide flow timeout.
- Resolve status payload to job/PDF.
- Decide whether state conflict exists.

### Extension decisions

- Detect whether a Chrome download is a PDF.
- Resolve Zoho Case URL from active tab or attachment URL.
- Confirm/reject pending Zoho mapping.
- Reuse or create iLovePDF tab.
- Consider content script ready or not ready.
- Choose selector or fallback selector.
- Decide whether a channel-closed error is ignorable.
- Match or reject Chrome download candidate.
- Decide whether runtime queue is already running or idle.
- Decide whether tracker replacement is a concurrency problem.

## 5. Acceptance criteria

- Decision events are present for the highest-risk branches.
- Each decision event includes inputs, chosen action, and reason.
- Rejected alternatives are included where useful, especially download matching and tab selection.
- Decision logs remain compact.
- Decision logs do not dump full payloads, HTML, PDFs, or Excel contents.
- Decision logs are linked to `trace_id`, `job_id`, `pdf_id`, `request_id`, `tab_id`, or `download_id` when available.
- The timeline can show decisions before failures.

## 6. Risks

- Decision logging can become verbose if added to every `if` statement.
- Logging too many inputs could leak sensitive data or create huge events.
- Decision logs may duplicate state-transition events unless the difference is clear:
  - decision = why a branch was chosen
  - transition = what state changed
- Wrong decision names can make timelines harder to read.

## 7. How to test it

Manual tests:

1. Trigger conversion with disconnected agent.
2. Verify a decision explains why the request was rejected.
3. Trigger Zoho PDF detection with a non-Zoho active tab.
4. Verify a decision explains why the mapping was rejected or ignored.
5. Trigger conversion and inspect tab reuse/create decision.

Harness tests:

- Simulate download candidates and verify accepted/rejected decisions.
- Simulate malformed handshake and verify registration decision.
- Simulate missing flow preconditions and verify decision log.
- Simulate selector fallback and verify chosen selector decision.

## 8. What not to do in this phase

- Do not log every branch in the codebase.
- Do not log raw request bodies if they contain large or sensitive values.
- Do not add screenshots or DOM snapshots yet unless already available from a later phase.
- Do not block workflows based only on decision logging failures.
- Do not turn decision logs into user-facing notifications.
- Do not implement AI/LLM decision observability; this project does not currently run an LLM agent.

---

# Phase 7 — Evidence capture

## 1. Goal

Capture concrete evidence when fragile automation fails, especially browser automation, DOM selector failures, content-script readiness failures, download ambiguity, missing files, and state persistence errors.

This phase adds the evidence that lets an AI coding agent move from “what failed” to “why it failed.”

## 2. Files likely to be created

Python:

- `app-python-zoho/observability/evidence.py`
- `app-python-zoho/observability/file_metadata.py`
- `app-python-zoho/observability/snapshots.py`
- `app-python-zoho/observability/evidence_store.py`

Chrome extension:

- `autohom-extension/observability/evidence.js`
- `autohom-extension/observability/domSnapshot.js`
- `autohom-extension/observability/selectorDiagnostics.js`
- `autohom-extension/observability/screenshotCapture.js`
- `autohom-extension/observability/downloadEvidence.js`

Possible local storage directories:

- `app-python-zoho/diagnostics/`
- `app-python-zoho/diagnostics/evidence/`
- `app-python-zoho/diagnostics/screenshots/`
- `app-python-zoho/diagnostics/dom/`

Documentation:

- `docs/observability/evidence_capture_policy.md`

## 3. Files likely to be modified

Python:

- `app-python-zoho/http_server.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/pdf_scanner.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/flow_orchestrator.py`

Chrome extension:

- `autohom-extension/manifest.json` only if screenshot APIs or permissions require changes. Prefer existing permissions if possible.
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf-background/router.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`
- `autohom-extension/ilovepdf/domHelpers.js`
- `autohom-extension/background-zoho.js`

## 4. Expected output

Evidence capture on failures and selected critical phase boundaries.

Required evidence types:

### Browser automation evidence

- Current tab URL.
- Page title.
- Document ready state.
- Content script readiness result.
- Selector diagnostics:
  - selector name
  - selector value
  - match count
  - visible count
  - first match summary
  - fallback selector used or not used
- Compact DOM summary:
  - title
  - URL
  - visible buttons summary
  - visible inputs summary
  - relevant forms/cards/containers summary
- Screenshot on failure where feasible.
- Last message sent to content script.
- Last response or error from content script.

### Download evidence

- Expected filename stem.
- Tracker start time.
- Candidate downloads seen.
- Candidate accept/reject reasons.
- Matched download ID.
- Final filename.
- Final URL.
- MIME/extension if available.
- Chrome download state.
- Interrupt reason if interrupted.

### File evidence

- PDF path.
- File exists or missing.
- Size.
- Modified time.
- Optional safe hash prefix.
- State PDF ID.
- Job PDF path.
- Serve endpoint status.
- Output Excel metadata if available.

### State evidence

- Relevant job snapshot.
- Relevant PDF snapshot.
- Relevant flow run snapshot.
- Relevant agent registry snapshot.
- Relevant runtime queue snapshot.
- Relevant state file metadata.

Recommended evidence event shape:

```json
{
  "event": "evidence.capture.succeeded",
  "component": "extension.content.ilovepdf",
  "evidence_type": "selector_diagnostics",
  "evidence_ref": "diagnostics/evidence/trace_.../selector_convert_button.json",
  "summary": {
    "selector_name": "convert_button",
    "match_count": 0,
    "visible_count": 0,
    "fallback_used": true
  },
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "tab_id": 123
}
```

## 5. Acceptance criteria

- Browser automation failures capture at least selector diagnostics and current URL/page title.
- Content-script readiness failures include attempts, tab ID, URL, and last error.
- Download timeouts include candidate downloads and rejection reasons.
- Missing file failures include file metadata and expected path.
- Evidence files are stored under a bounded diagnostics directory or bounded local store.
- Evidence capture failures are themselves recorded but do not crash the main workflow.
- Screenshots are captured only on failure or explicit diagnostic mode, not continuously.
- Full page HTML is not captured by default.
- Full PDFs and Excel files are not copied into diagnostics by default.
- Diagnostic evidence is linkable from the unified timeline.

## 6. Risks

- Screenshots may require additional permissions or may fail in extension contexts.
- Evidence files can grow too large if retention is not bounded.
- DOM snapshots can accidentally include sensitive data if too broad.
- Capturing evidence at every phase can slow automation.
- Browser APIs may not be available from all extension contexts.
- Evidence capture after a failure may run too late if the tab closed or navigated away.

## 7. How to test it

Manual tests:

1. Break a selector intentionally in a local branch or use a test flag.
2. Trigger conversion.
3. Confirm selector diagnostics are captured.
4. Confirm screenshot is captured if supported.
5. Delete a scanned PDF before conversion.
6. Confirm missing file evidence is captured.
7. Trigger a download timeout scenario.
8. Confirm download candidates and timeout context are captured.

Harness tests:

- Selector diagnostics with fake DOM fixtures.
- DOM summary generation with sample HTML snippets.
- File metadata extraction for existing/missing/read-protected files.
- Evidence store retention behavior.
- Screenshot capture failure path.
- Download candidate matching evidence.

## 8. What not to do in this phase

- Do not capture full HTML by default.
- Do not capture full PDF or Excel contents by default.
- Do not capture screenshots continuously.
- Do not add remote uploads of evidence.
- Do not add external logging services.
- Do not make evidence capture mandatory for workflow success.
- Do not change business behavior to “fix” failures while adding evidence.

---

# Phase 8 — Diagnostic export package

## 1. Goal

Generate a compact AI-ready diagnostic package for a `job_id`, `flow_run_id`, or `trace_id`.

This package should let an AI coding agent diagnose a failure without reading huge raw logs or the entire repository.

## 2. Files likely to be created

Python:

- `app-python-zoho/observability/diagnostic_exporter.py`
- `app-python-zoho/observability/package_builder.py`
- `app-python-zoho/observability/markdown_report.py`
- `app-python-zoho/observability/redaction.py`
- `app-python-zoho/observability/repro_steps.py`

Possible output directories:

- `app-python-zoho/diagnostics/packages/`
- `app-python-zoho/diagnostics/packages/{diagnostic_export_id}/`

Documentation:

- `docs/observability/diagnostic_package_spec.md`
- `docs/observability/diagnostic_export_usage.md`

## 3. Files likely to be modified

Python:

- `app-python-zoho/http_server.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/observability/timeline.py`
- `app-python-zoho/observability/evidence_store.py`

Chrome extension:

- `autohom-extension/sidepanel.js` if adding a “Export diagnostics” button.

Optional API routes:

- `GET /api/jobs/{job_id}/diagnostic-package`
- `POST /api/jobs/{job_id}/diagnostic-package`
- `GET /api/traces/{trace_id}/diagnostic-package`
- `GET /api/diagnostics/packages/{diagnostic_export_id}`

## 4. Expected output

A diagnostic package containing:

```text
diagnostic-package-{timestamp}-{job_id-or-trace_id}/
  manifest.json
  summary.md
  timeline.jsonl
  state_transitions.jsonl
  decisions.jsonl
  errors.jsonl
  evidence_index.json
  job_snapshot.json
  pdf_snapshot.json
  flow_run_snapshot.json
  agent_snapshot.json
  runtime_snapshot.json        # if available
  download_snapshot.json       # if available
  config_snapshot.json
  environment_snapshot.json
  reproduction_notes.md
  ai_debug_prompt.md
  evidence/
    selector_*.json
    dom_*.json
    screenshot_*.png
    download_candidates_*.json
```

Minimum `summary.md` sections:

1. Diagnostic package metadata.
2. User-facing symptom.
3. Workflow involved.
4. Last successful phase.
5. Expected next phase.
6. Actual observed behavior.
7. Most likely failure surface.
8. Timeline summary.
9. State-transition summary.
10. Decisions made before failure.
11. Evidence included.
12. Evidence missing.
13. Suggested reproduction path.
14. Suggested files for AI agent to inspect.

Minimum `ai_debug_prompt.md` shape:

```markdown
You have access to the AutoHom v2 repository.
Analyze this diagnostic package first.
Do not implement changes until you identify the most likely failure surface.

Focus on:
- Last successful phase
- Expected next phase
- Actual observed behavior
- State transitions
- Decision logs
- Evidence files

Then propose a small, targeted fix plan.
```

## 5. Acceptance criteria

- A package can be generated for a known `job_id`.
- A package can be generated for a known `trace_id` if correlation exists.
- Package includes timeline, state transitions, decisions, errors, snapshots, and evidence index.
- Package includes missing-evidence notes when evidence is unavailable.
- Package is compact enough for AI review.
- Package avoids full PDFs, Excel files, and full HTML by default.
- Exporting diagnostics does not mutate job state except recording a `diagnostic.package.created` event.
- Export failures are recorded with `diagnostic.package.failed`.
- The package can be opened from the side panel or downloaded through local HTTP if that UI is implemented.

## 6. Risks

- Package generation could accidentally include sensitive local paths or full payloads.
- Package generation could become too large if timelines and evidence are not capped.
- Package creation could fail if evidence references are missing or stale.
- Building ZIP downloads may introduce complexity; a directory package may be safer first.
- The side panel download path may require extra browser handling.

## 7. How to test it

Manual tests:

1. Run a successful scan.
2. Export diagnostics for a job.
3. Open `summary.md` and confirm it is understandable.
4. Trigger a controlled failure such as missing PDF or disconnected agent.
5. Export diagnostics.
6. Confirm package identifies last successful phase and expected-vs-actual condition.

Automated tests:

- Build package from synthetic events and snapshots.
- Verify required package files exist.
- Verify redaction/truncation behavior.
- Verify missing evidence is reported, not fatal.
- Verify package manifest is valid JSON.
- Verify timeline line count limits.

## 8. What not to do in this phase

- Do not include entire repository source code in the package.
- Do not include full raw logs if they are huge.
- Do not include full PDFs, Excel files, or full HTML by default.
- Do not require internet access or external services.
- Do not implement advanced dashboards.
- Do not generate packages automatically for every event unless a retention policy exists.
- Do not overwrite previous diagnostic packages without explicit cleanup policy.

---

# Phase 9 — Test harness

## 1. Goal

Create reproducible harnesses for the most important failure surfaces so that observability and future fixes can be verified without relying only on manual browser reproduction.

The harness should validate both behavior and diagnostic evidence.

## 2. Files likely to be created

Python harnesses:

- `app-python-zoho/tests/observability/test_event_schema.py`
- `app-python-zoho/tests/observability/test_timeline.py`
- `app-python-zoho/tests/observability/test_correlation.py`
- `app-python-zoho/tests/observability/test_state_transitions.py`
- `app-python-zoho/tests/observability/test_diagnostic_exporter.py`
- `app-python-zoho/tests/harness/test_backend_startup_failures.py`
- `app-python-zoho/tests/harness/test_pdf_file_failures.py`
- `app-python-zoho/tests/harness/test_ws_protocol.py`
- `app-python-zoho/tests/harness/mock_agent.py`

Chrome/extension harnesses if the project supports JS tests:

- `autohom-extension/tests/observability/eventEnvelope.test.js`
- `autohom-extension/tests/observability/context.test.js`
- `autohom-extension/tests/observability/selectorDiagnostics.test.js`
- `autohom-extension/tests/harness/downloadMatching.test.js`
- `autohom-extension/tests/harness/domFixtures/`

Repository-level scripts:

- `scripts/run_observability_tests.py`
- `scripts/run_harness_backend.py`
- `scripts/run_harness_ws.py`

Documentation:

- `docs/observability/harness_guide.md`

## 3. Files likely to be modified

Python:

- `app-python-zoho/requirements.txt` if test dependencies are needed. Prefer minimal dependencies.
- Existing Python modules only if testability hooks are required.

Chrome extension:

- `package.json` only if a JS test runner is introduced. Avoid this if the project does not already use Node tooling.
- Existing modules only if pure functions need to be exported for tests.

CI or scripts:

- Add local scripts only; do not require cloud CI unless requested.

## 4. Expected output

A set of reproducible tests/harnesses for:

### Structured event model

- Valid event creation.
- Required fields.
- Sanitization.
- Truncation.
- Safe writer failure.

### Timeline and correlation

- Event ordering.
- Query by `job_id` and `trace_id`.
- Missing/partial IDs.
- Truncated event buffers.

### WebSocket protocol

- Valid agent handshake.
- Invalid handshake.
- Duplicate runtime.
- Command sent and ACK received.
- ACK timeout.
- Unexpected response.
- Final status with mismatched `job_id` or `pdf_id`.

### State machines

- Valid conversion transitions.
- Invalid transition recording.
- Flow timeout and late completion conflict.
- Agent stale/disconnected transition.
- Download tracker timeout/replaced transition.

### File pipeline

- Missing PDF file after scan.
- Invalid folder.
- State save failure.
- File metadata evidence.

### Browser/DOM evidence

- Selector success/failure using static DOM fixtures.
- Candidate button summaries.
- Compact DOM snapshot generation.
- Download candidate matching decisions.

### Diagnostic package

- Package generation from synthetic events.
- Missing evidence handling.
- Redaction and compaction.
- AI prompt included.

## 5. Acceptance criteria

- Harnesses can be run locally on Windows without requiring external cloud services.
- Core Python observability tests pass.
- WebSocket mock agent can simulate ACK, timeout, unexpected response, and final status.
- State transition tests catch invalid transitions without breaking valid ones.
- Diagnostic export tests produce a valid package.
- Evidence capture tests do not require real iLovePDF for basic selector/DOM logic.
- Browser-dependent tests are clearly separated from pure unit tests.
- The harness itself emits or verifies structured diagnostic events.

## 6. Risks

- Adding a JS test stack can increase project complexity.
- Browser automation tests can be flaky if they depend on live iLovePDF.
- Mock harnesses can diverge from real Chrome extension behavior.
- Tests can become too broad and slow if not separated by type.
- Windows path handling can cause failures if tests assume POSIX paths.

## 7. How to test it

Run test tiers separately:

```bash
# Python unit tests
python -m pytest app-python-zoho/tests/observability

# Python harness tests
python -m pytest app-python-zoho/tests/harness

# Optional JS tests if implemented
npm test --prefix autohom-extension

# Local harness script
python scripts/run_observability_tests.py
```

Recommended test tiers:

1. Fast unit tests.
2. Protocol harness tests.
3. File-state harness tests.
4. Browser/manual harness tests.
5. Full end-to-end manual verification.

## 8. What not to do in this phase

- Do not require live iLovePDF for every test.
- Do not require Zoho credentials for tests.
- Do not introduce a heavy browser automation framework unless explicitly approved.
- Do not make all tests depend on Chrome being open.
- Do not require admin permissions.
- Do not use tests to change production state files without temporary directories.
- Do not make the harness rely on huge log files.

---

# Phase 10 — Verification and regression protection

## 1. Goal

Create a durable verification process that prevents future features from bypassing observability requirements.

This phase turns observability from a one-time implementation into a project standard.

## 2. Files likely to be created

Documentation:

- `docs/observability/definition_of_done.md`
- `docs/observability/feature_observability_checklist.md`
- `docs/observability/regression_scenarios.md`
- `docs/observability/release_verification.md`
- `docs/observability/ai_agent_implementation_prompt.md`
- `docs/observability/ai_agent_review_prompt.md`

Tests/scripts:

- `scripts/check_observability_contracts.py`
- `scripts/generate_diagnostic_sample.py`
- `scripts/verify_diagnostic_package.py`

Optional templates:

- `.github/pull_request_template.md` if the project uses PRs.
- `docs/templates/feature_plan_with_observability.md`
- `docs/templates/bug_report_with_diagnostics.md`

## 3. Files likely to be modified

- `README.md` optionally link to observability docs.
- Test configuration files if they exist.
- Existing CI/local scripts if present.
- Side panel documentation if export button or diagnostics workflow is added.

## 4. Expected output

A verification framework that ensures:

- Every new feature has observability coverage.
- Every critical workflow has structured success and failure events.
- Every relevant state mutation has state visibility.
- Every fragile automation decision has a decision log.
- Every major failure can produce a diagnostic export.
- Regression scenarios can be re-run by a human or AI coding agent.

Recommended regression scenarios:

1. Backend startup with ports free.
2. Backend startup with WebSocket port occupied.
3. Corrupt `state.json` handling.
4. Side panel opened with backend running.
5. Side panel opened with backend stopped.
6. Scan valid PDF folder.
7. Scan invalid folder.
8. Convert with agent disconnected.
9. Convert with mock agent ACK timeout.
10. Convert with missing PDF file.
11. Flow timeout with late conversion completion.
12. Download tracker timeout.
13. Zoho mapping import with Python stopped.
14. Diagnostic package generation after success.
15. Diagnostic package generation after failure.

Recommended AI review prompt:

```markdown
You are reviewing an AutoHom v2 feature implementation.
Check whether the feature satisfies the observability Definition of Done.
Do not only inspect functionality.
Verify structured events, success/failure events, expected-vs-actual evidence, state visibility, diagnostic context, harness coverage, and export path.
List missing observability requirements before approving the implementation.
```

## 5. Acceptance criteria

- A formal Definition of Done exists for future features.
- A feature observability checklist exists and is specific to AutoHom v2.
- Regression scenarios are documented and runnable manually or through harnesses.
- At least one sample diagnostic package can be generated and verified.
- AI agent implementation/review prompts exist.
- The project has a repeatable way to verify diagnostic package shape.
- New features cannot be considered complete unless they meet the observability Definition of Done.

## 6. Risks

- The checklist could become bureaucratic if too long.
- Developers or AI agents may mark checklist items complete without real tests.
- Regression tests can become stale if workflows change.
- Diagnostic package verification can miss semantic quality if it only checks file existence.
- Strict gates can slow development if not phased in gradually.

## 7. How to test it

Process test:

1. Take a small existing action, such as “open Zoho” or “scan folder.”
2. Apply the new checklist.
3. Verify whether the feature has structured events, success/failure events, expected-vs-actual evidence, and diagnostics.
4. Generate a sample diagnostic package.
5. Ask an AI coding agent to review the package and identify the most likely failure point.

Script tests:

- Run `scripts/verify_diagnostic_package.py` against a sample package.
- Run `scripts/check_observability_contracts.py` if implemented.
- Confirm required docs exist.
- Confirm sample regression scenarios are listed.

## 8. What not to do in this phase

- Do not block development on perfect coverage for every old feature immediately.
- Do not require enterprise observability tools.
- Do not require every low-level helper function to emit events.
- Do not turn the checklist into a generic template that ignores AutoHom v2’s actual workflows.
- Do not treat diagnostic package file existence as proof of diagnostic usefulness.
- Do not let AI agents implement new features without observability planning.

---

# Definition of Done for future features in AutoHom v2

A feature is not complete unless it has the following observability coverage.

## 1. Structured events

The feature must emit structured events using the shared event envelope.

Minimum fields:

- `schema_version`
- `ts`
- `monotonic_ms`
- `severity`
- `component`
- `event`
- `message`
- relevant IDs such as `trace_id`, `job_id`, `pdf_id`, `flow_run_id`, `request_id`, `tab_id`, or `download_id`

## 2. Start event

The feature must emit a clear start event when the workflow begins.

Examples:

- `user.action.clicked`
- `workflow.started`
- `conversion.requested`
- `zoho.mapping.import_requested`
- `download.tracker.started`

## 3. Success event

The feature must emit a success event when the expected outcome is reached.

Examples:

- `workflow.completed`
- `conversion.completed`
- `zoho.mapping.import_succeeded`
- `download.completed`
- `pdf.file.serve_succeeded`

## 4. Failure event

The feature must emit a failure event when the expected outcome is not reached.

Examples:

- `workflow.failed`
- `conversion.failed`
- `conversion.download_page.timeout`
- `zoho.mapping.import_failed`
- `pdf.file.serve_failed`
- `state.save.failed`

Failures must include a compact error summary and relevant diagnostic context.

## 5. Expected-vs-actual condition where relevant

If the feature depends on a condition, the event must record what was expected and what actually happened.

Examples:

```json
{
  "expected": { "agent_connected": true },
  "actual": { "agent_connected": false, "agent_type": "ilovepdf-converter" }
}
```

```json
{
  "expected": { "url_contains": "/descarga/" },
  "actual": { "current_url": "https://www.ilovepdf.com/pdf_to_excel" }
}
```

## 6. State visibility where relevant

If the feature mutates state, it must emit a state-transition event or equivalent state visibility.

Required fields:

- state machine name
- entity ID
- previous state
- new state
- reason
- component
- correlation IDs

Example:

```json
{
  "event": "state.transition",
  "state_machine": "conversion",
  "entity_id": "job_...",
  "from": "queued",
  "to": "completed",
  "reason": "Chrome download completed and final status reached Python"
}
```

## 7. Diagnostic context

The feature must include enough context to diagnose failure without reading the entire app.

Context may include:

- related `job_id`, `pdf_id`, `flow_run_id`, `trace_id`
- component and phase
- request/response summary
- WebSocket request ID and reply ID
- agent ID/type
- tab ID and current URL
- download ID and candidate summary
- file path metadata
- state snapshot reference
- config/selector version

## 8. Decision logging where relevant

If the feature makes an important decision, it must log the decision inputs and reason.

Examples:

- Agent accepted or rejected.
- Tab reused or created.
- Selector selected or fallback used.
- Download candidate accepted or rejected.
- Zoho URL resolved or rejected.
- Flow precondition passed or failed.

## 9. Evidence capture where relevant

If the feature touches browser automation, external websites, local files, downloads, or state persistence, it must capture evidence on failure.

Examples:

- Selector diagnostics.
- Compact DOM summary.
- Screenshot on browser automation failure.
- File metadata for missing or served PDFs.
- Download candidates for download timeout.
- State snapshot for persistence failure.
- Agent registry snapshot for connection failure.

## 10. Test or harness scenario

The feature must have at least one test or harness scenario that verifies observability output, not only functional output.

Minimum test expectations:

- Start event exists.
- Success or failure event exists.
- Required IDs are present.
- Expected-vs-actual is present for relevant failures.
- Timeline can include the event.
- Diagnostic package can include the event when relevant.

## 11. AI-ready export path when relevant

If the feature can fail in a way that requires debugging, its events and evidence must appear in the diagnostic export package.

The package should include:

- timeline entries
- state transitions
- decisions
- error summary
- evidence references
- relevant snapshots
- reproduction notes

## 12. Backward compatibility

New observability fields must not break existing persisted jobs, PDFs, flow runs, or extension messages.

If old records lack `trace_id` or other fields, the system should:

- generate fallback context where safe,
- record a missing-context event,
- continue the workflow.

## 13. Payload safety

The feature must not capture by default:

- full PDFs,
- full Excel files,
- full page HTML,
- huge raw logs,
- secrets,
- authentication tokens,
- unnecessary personal data.

All captured data must be compact and sanitized.

---

# Recommended AI coding agent prompt for implementing one phase

Use this prompt when handing a single phase to an AI coding agent:

```markdown
You have access to the full AutoHom v2 repository.

Implement only Phase [N]: [PHASE NAME] from `docs/observability/implementation_roadmap.md`.

Do not implement later phases.
Do not refactor unrelated code.
Do not change user-facing workflow behavior unless explicitly required by this phase.
Do not add screenshots, DOM capture, diagnostic exports, or test harnesses unless they belong to this phase.

Before coding:
1. Read the phase carefully.
2. Identify the exact files to create or modify.
3. Create a small implementation plan.
4. Confirm how the phase will be tested.

During implementation:
1. Keep changes small and reversible.
2. Preserve backward compatibility.
3. Make observability best-effort and non-fatal.
4. Avoid large or sensitive payloads.
5. Use the shared event schema and naming conventions.

After implementation:
1. Run the phase-specific tests.
2. Summarize files changed.
3. Summarize events added.
4. Explain how to verify the phase manually.
5. Explicitly list anything deferred to later phases.
```

---

# Recommended review checklist after each phase

Use this checklist after each phase is implemented:

```markdown
## Phase review checklist

- [ ] The phase implemented only its own scope.
- [ ] No later-phase features were added prematurely.
- [ ] Existing workflows still work.
- [ ] Observability failures are non-fatal.
- [ ] Events use the shared schema.
- [ ] Events use the agreed taxonomy.
- [ ] Large and sensitive payloads are sanitized.
- [ ] Tests or manual verification steps were run.
- [ ] The side panel still loads.
- [ ] Python backend still starts.
- [ ] Extension bridge still connects.
- [ ] Conversion path is not broken.
- [ ] Any deferred work is documented.
```

---

# Final roadmap note

The safest path is to merge observability in this order:

1. Document the contract.
2. Add the event schema.
3. Build the timeline.
4. Add correlation.
5. Make states explicit.
6. Explain decisions.
7. Capture browser/file/download evidence.
8. Export diagnostic packages.
9. Build harnesses.
10. Enforce the Definition of Done.

This produces a professional observability layer gradually, without a risky one-shot rewrite.
