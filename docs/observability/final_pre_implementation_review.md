# Final Pre-Implementation Review — AutoHom v2 Observability

Repository reviewed: `infoclusiv/autohom-v2`  
Review scope: existing observability discovery/design documents only  
Application code changes: none  
Repository writes: none  
Output artifact: `final_pre_implementation_review.md`

## Reviewed documents

- `docs/observability/project_understanding.md`
- `docs/observability/observability_classification.md`
- `docs/observability/critical_workflows.md`
- `docs/observability/failure_surface_map.md`
- `docs/observability/observability_architecture_proposal.md`
- `docs/observability/implementation_roadmap.md`

## Executive conclusion

The discovery work is directionally correct. AutoHom v2 is not a normal request/response app and should not receive a generic logging layer. The correct observability center is the **job / flow attempt**, especially the PDF-to-Excel workflow that crosses:

```text
side panel
  -> local Python HTTP API
  -> JobStore / StateManager
  -> WebSocket command
  -> Chrome extension service worker
  -> iLovePDF runtime queue
  -> Chrome tab / content script
  -> DOM upload / conversion / download actions
  -> Chrome downloads API
  -> WebSocket final status
  -> Python state persistence
  -> side panel diagnostics
```

The main correction before implementation is to **cut the first implementation down**.

The generated documents are strong as an architectural map, but the implementation roadmap still risks becoming too large if followed literally. The first implementation should not attempt to build every state machine, every decision log, screenshots, DOM snapshots, complete diagnostic packages, harnesses, and full correlation propagation at once.

The recommended first implementation is:

> Build a minimal, safe, cross-component event foundation and one useful direct-conversion trace for the `convert-pdf` path only.

That means: shared event schema, bounded event store, local extension event ingestion, core IDs for the conversion path, WebSocket command/ACK/final-status events, runtime queue events, download tracker events, and a compact per-job timeline exposed through diagnostics.

Do **not** implement OpenTelemetry, dashboards, screenshots, full DOM capture, a global state machine, a heavy workflow engine, or generic logs everywhere.

---

# 1. What is clearly correct

## 1.1 The project classification is correct

The documents correctly identify AutoHom v2 as a local multi-component automation system rather than a simple web app.

The architecture is correctly understood as:

- Python local orchestrator.
- `aiohttp` local API on `localhost:7790`.
- WebSocket server on `localhost:8769`.
- Chrome extension service worker.
- Side-panel UI.
- Zoho CRM mapping flow.
- iLovePDF browser automation flow.
- Local PDF scanning and state persistence.
- Job-centered state model.

This classification matters because a single failure can happen outside the Python request that started the action. A conversion can be accepted by the HTTP API and still fail later inside the extension, DOM automation, Chrome download tracking, or final WebSocket status delivery.

## 1.2 The “not generic logs” principle is correct

The documents correctly reject “add logs everywhere” as the primary solution.

AutoHom v2 needs causal evidence, not more raw text. The valuable debugging artifact is a compact timeline that can answer:

- What action started the job?
- Which PDF/job/flow/agent/tab/download was involved?
- What was the last successful phase?
- What was expected next?
- What actually happened?
- Which component failed to advance the workflow?
- What state transition or final status is missing?

This is the right mental model for AI-assisted debugging.

## 1.3 Workflow-first observability is correct

The focus on a per-job or per-flow-run diagnostic timeline is correct.

The key user-facing question is not “what logs were printed?” but:

> Why did this PDF/job not become a completed Excel output?

Therefore, the observable unit should be:

- `job_id`
- `pdf_id`
- `trace_id`
- `request_id`
- `flow_run_id` when relevant
- `agent_id` / `agent_type`
- `connection_id`
- `runtime_instance_id`
- `tab_id`
- `download_id`

The documents correctly identify that timestamp-only debugging will not be enough.

## 1.4 The critical workflows are mostly correct

The workflow map correctly covers the high-value areas:

1. Python backend startup.
2. Chrome extension bootstrap and WebSocket agent registration.
3. Side-panel refresh and user action dispatch.
4. Local PDF folder scan and job sync.
5. Zoho PDF download detection and mapping import.
6. Direct PDF-to-Excel conversion.
7. Configured `pdf_to_excel` flow execution.
8. iLovePDF browser automation runtime.
9. Conversion status propagation and persistence.
10. Job diagnostics.
11. Open Zoho action.
12. Future/disabled Site2 boundary.

The most important workflows for the first implementation are:

- Chrome extension bootstrap / WebSocket agent registration.
- Direct PDF-to-Excel conversion action.
- iLovePDF browser automation runtime.
- Download tracking.
- Final status propagation to Python.
- State persistence of conversion result.

## 1.5 The failure surfaces are accurate

The failure surface map correctly identifies the most dangerous areas:

- WebSocket command accepted but browser automation never completes.
- Agent appears connected but is stale or disconnected.
- Extension service worker restarts or loses runtime state.
- Content script not ready.
- iLovePDF DOM selector changes.
- Page never reaches the download phase.
- Download tracker times out or matches the wrong file.
- Final `CONVERSION_STATUS` cannot be delivered to Python.
- State save fails or state silently resets.
- Zoho mapping is saved in Chrome but not imported into Python.
- Side panel hides backend/API failure as an empty or stale UI.
- Flow times out but conversion completes later, creating contradictory state.

These are the correct failure categories for this kind of automation.

## 1.6 The non-goals are correct

The architecture proposal correctly excludes these from the first implementation:

- Full enterprise OpenTelemetry.
- External log aggregation.
- Metrics dashboard as the primary solution.
- Multi-user analytics.
- Full PDFs, full Excel files, and full page HTML in diagnostics.
- LLM-agent memory observability.

These exclusions should remain firm.

---

# 2. What is uncertain

## 2.1 Whether the docs exactly match the current code after all recent changes

The documents appear based on a repository inspection, but before a coding agent changes files, it should re-read the exact current versions of these files:

Python:

- `app-python-zoho/app.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/agent_registry.py`
- `app-python-zoho/state_manager.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/flow_orchestrator.py`
- `app-python-zoho/pdf_scanner.py`

Chrome extension:

- `autohom-extension/background-main.js`
- `autohom-extension/background-zoho.js`
- `autohom-extension/sidepanel.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/tabManager.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf-background/router.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`
- `autohom-extension/ilovepdf/domHelpers.js`
- `autohom-extension/ilovepdf/config.js`

Reason: observability must be attached to real boundaries, not only to the documented architecture.

## 2.2 Whether extension events currently reach Python

The roadmap suggests both Python and JavaScript event writers, but a unified timeline only becomes useful if browser/extension events are available to the Python diagnostic API.

This must be decided before implementation.

Recommended answer:

- Python should be the authoritative diagnostic store.
- The extension should send compact observability events to Python through a local best-effort endpoint such as `POST /api/observability/events`.
- If Python is unavailable, the extension should keep a small bounded local buffer and try later, but it must not block automation.

Without this, the “unified timeline” will mostly contain Python-side events and will not diagnose DOM/tab/download failures well.

## 2.3 Whether the existing job event system should be reused or wrapped

The project already has job events and recent diagnostics. It is uncertain whether the first implementation should:

1. Keep the existing job events and add a separate observability event store.
2. Convert existing job events into the new event schema.
3. Write new observability events into the existing job event list.

Recommended answer:

- Do **not** replace the existing job event system in the first implementation.
- Add a small observability event writer/store and optionally mirror high-level events into existing job diagnostics.
- Preserve existing UI behavior.

## 2.4 Whether screenshots are technically reliable in Manifest V3

The documents correctly recommend screenshots for browser failures later. However, in a Chrome extension context, screenshot capture has permission, timing, active-tab, privacy, and service-worker lifecycle implications.

This should be treated as later evidence capture, not first implementation.

## 2.5 Whether Chrome exposes enough local file path information for Excel verification

The docs recommend output verification. That is correct, but Chrome downloads APIs may not always provide a fully reliable local absolute path depending on browser settings and permissions.

The first implementation should record:

- download ID,
- filename,
- final URL,
- MIME/extension if available,
- state,
- interrupt reason,
- expected filename stem,
- matching decision.

Local path verification can come later.

## 2.6 Whether Site2 is active or future-only

The docs mention Site2 as disabled/future. The first implementation should not instrument Site2 deeply unless the current code already has an active Site2 workflow.

Recommended handling:

- Add only a minimal `site2.not_implemented` or `site2.precondition_failed` event if the action exists.
- Do not design Site2 observability until the workflow is real.

## 2.7 Whether the known “tab closes before response” bug is fully represented

The failure map includes tab/content-script/download/status failures, but the known critical contract should be made more explicit:

> A tab should not be closed until the workflow has reached a final terminal condition such as `CONVERSION_STATUS completed/error`, `RESPONSE_COMPLETED`, or `TASK_FULLY_COMPLETED`, depending on the workflow.

For AutoHom v2, the first implementation should include events around tab lifecycle and any close/remove decision:

- `tab.close.requested`
- `tab.close.blocked`
- `tab.close.allowed`
- `tab.closed`
- `tab.closed_before_terminal_status`

This is not necessarily a first-code-change requirement, but it should be added as a missing failure surface if tab closure is part of current runtime behavior.

---

# 3. What may be overengineered

## 3.1 Too many identifiers for the first implementation

The proposed identifier set is correct as a mature target, but too much for the first implementation if applied everywhere.

Full target list includes:

- `trace_id`
- `job_id`
- `pdf_id`
- `flow_id`
- `flow_run_id`
- `user_action_id`
- `request_id`
- `reply_to`
- `connection_id`
- `runtime_instance_id`
- `agent_id`
- `agent_type`
- `sidepanel_session_id`
- `component_id`
- `tab_id`
- `download_id`
- `diagnostic_export_id`
- `process_run_id`
- `extension_start_id`

Recommended first subset:

- `trace_id`
- `job_id`
- `pdf_id`
- `request_id`
- `reply_to`
- `agent_type`
- `connection_id`
- `runtime_instance_id`
- `tab_id`
- `download_id`
- `component`
- `event`
- `phase`
- `severity`
- `message`
- `expected`
- `actual`
- `data`

Postpone:

- `diagnostic_export_id`
- `component_id` as a separate concept
- full `sidepanel_session_id` usage
- full `process_run_id` propagation everywhere
- full `extension_start_id` propagation everywhere
- full flow/run IDs beyond the existing flow path

## 3.2 The event taxonomy is too large for phase one

The event taxonomy is useful as a reference, but it lists many event types. If implemented literally, it may produce noisy logs and confuse the coding agent.

First implementation should use a small event set:

Python:

- `process.started`
- `state.load.succeeded`
- `state.load.failed`
- `state.save.succeeded`
- `state.save.failed`
- `http.request.received`
- `http.request.failed`
- `conversion.requested`
- `conversion.validation.failed`
- `conversion.command.sent`
- `conversion.command.timeout`
- `conversion.status.received`
- `conversion.completed`
- `conversion.failed`
- `ws.connection.opened`
- `ws.connection.closed`
- `agent.registration.succeeded`
- `agent.registration.failed`

Extension:

- `extension.bootstrap.started`
- `bridge.ws.connect_attempted`
- `bridge.ws.opened`
- `bridge.ws.closed`
- `bridge.command.received`
- `bridge.command.ack_sent`
- `runtime.queue.enqueued`
- `runtime.queue.started`
- `content.ready.succeeded`
- `content.ready.failed`
- `selector.file_input.failed`
- `selector.convert_button.failed`
- `selector.download_button.failed`
- `download.tracker.started`
- `download.matched`
- `download.completed`
- `download.timeout`
- `conversion.status.send_attempted`
- `conversion.status.send_failed`

That is enough to diagnose the main PDF-to-Excel path.

## 3.3 State machines are too granular for first implementation

The state-machine model is correct as a design target, but should not be enforced in the first implementation.

Risk:

- The coding agent may rewrite business logic to fit the proposed state machine.
- Existing statuses may not map exactly.
- Strict validation can break currently working flows.
- Too many state events can overwhelm diagnostics.

Recommended first step:

- Emit state-transition-like events for existing status changes.
- Do not enforce invalid transitions.
- Do not migrate `state.json`.
- Do not rename persisted statuses.
- Do not create a global state machine.

## 3.4 Browser evidence capture should be postponed

Screenshots, DOM summaries, selector tables, and compact DOM snapshots are valuable, but not first.

Reasons to postpone:

- They introduce permissions and privacy concerns.
- They can become large.
- They can fail in service-worker contexts.
- They may alter timing.
- They require a policy and size budget.

First implementation should only log selector failure summaries that the code already knows, such as selector name, selector value, match count if cheaply available, URL, phase, and error message.

## 3.5 Diagnostic package ZIP/export may be too early

The architecture correctly wants an AI-ready diagnostic package. However, a complete export package should wait until there is useful data to export.

First implementation should provide:

- `GET /api/jobs/{job_id}/diagnostics` enhanced with a compact timeline, or
- `GET /api/jobs/{job_id}/timeline`

Postpone:

- ZIP package.
- Screenshots bundle.
- DOM snapshots bundle.
- recent Git diff integration.
- harness results inside package.
- markdown bug report generation.

## 3.6 Test harnesses are important but should not block the first event foundation

Harnesses are necessary for long-term reliability. But for the first implementation, unit tests for event schema, sanitization, and timeline query are enough.

Postpone browser automation harnesses until the event model is stable.

---

# 4. What may be missing

## 4.1 A minimal extension-to-Python event ingestion strategy

The documents say Python and JavaScript events should be mergeable, but the first implementation needs a specific mechanism.

Recommended missing piece:

```text
POST /api/observability/events
```

Purpose:

- Receive compact extension events.
- Sanitize again server-side.
- Store in bounded event store.
- Never block automation if it fails.
- Accept both single event and batch.

Example:

```json
{
  "events": [
    {
      "schema_version": "1.0",
      "ts": "...",
      "component": "extension.runtime",
      "event": "runtime.queue.enqueued",
      "trace_id": "trace_...",
      "job_id": "job_...",
      "pdf_id": "pdf_...",
      "message": "Conversion queued in extension runtime"
    }
  ]
}
```

## 4.2 A strict “observability must not change automation behavior” rule in implementation prompts

The docs mention this principle, but the first coding prompt should make it non-negotiable:

- Do not change selectors.
- Do not change timeout values unless strictly needed for metadata.
- Do not change tab close behavior yet.
- Do not change queue semantics.
- Do not change WebSocket command behavior except optional metadata fields.
- Do not fail a workflow because observability failed.

## 4.3 A tab lifecycle / premature close contract

Add a specific failure surface for:

- tab closed before terminal status,
- tab reused while prior job is not terminal,
- tab close requested while download tracker is active,
- tab close requested while final status has not been sent,
- service worker loses the active tab context before final status delivery.

Recommended events later:

- `tab.close.requested`
- `tab.close.decision`
- `tab.close.allowed`
- `tab.close.blocked`
- `tab.closed`
- `tab.closed_before_terminal_status`

## 4.4 A WebSocket message contract document

The docs describe WebSocket actions, but implementation would benefit from a precise protocol contract.

Recommended later document or schema:

- `AGENT_CONNECTED`
- `PING`
- `PONG`
- `CONVERT_PDF`
- `CONVERT_PDF_ACK`
- `CONVERSION_STATUS`

For each:

- required fields,
- optional observability fields,
- expected response,
- timeout,
- terminal/non-terminal meaning,
- backward compatibility behavior.

This should be small and practical, not a large protocol framework.

## 4.5 A size and retention budget

The docs say “compact,” but implementation should define limits.

Recommended initial limits:

- event JSONL max size or rotating files,
- max events in memory,
- max string length,
- max object depth,
- max array length,
- max timeline events returned by diagnostics,
- explicit `truncated: true` marker.

Without this, observability can recreate the original problem: logs too large for AI context.

## 4.6 A “trace completeness” summary

The diagnostic output should include a compact summary, not just a timeline.

Example:

```json
{
  "trace_summary": {
    "last_successful_phase": "download.tracker.started",
    "expected_next_phase": "download.completed",
    "actual_terminal_event": "download.timeout",
    "suspected_component": "extension.downloadTracker",
    "missing_events": ["download.matched", "conversion.status.received"],
    "has_final_status": false,
    "has_state_save_success": false
  }
}
```

This is highly useful for AI debugging and can be computed simply later.

## 4.7 A transition plan for existing persisted jobs

The first implementation must tolerate old jobs in `state.json` that do not contain:

- `trace_id`
- `flow_run_id`
- `observability` fields
- new event schema fields

Recommended behavior:

- Never migrate state automatically in the first observability phase.
- Generate missing trace IDs only for new workflow attempts.
- Treat old events as legacy events in diagnostics.

## 4.8 A clear separation between “events” and “diagnostic evidence”

The docs sometimes combine events, evidence, screenshots, DOM snapshots, state snapshots, and exports under one umbrella.

Implementation should keep them separate:

- Events: small, frequent, structured.
- Evidence: larger, failure-only.
- Exports: assembled on demand.
- Tests/harness results: external supporting artifacts.

Do not store evidence inside every event.

---

# 5. What should be implemented first

## Recommended first implementation: Phase 2A + small Phase 3 slice

Implement only the smallest useful cross-component foundation.

### Goal

Create a compact, safe, correlated timeline for the direct PDF-to-Excel conversion path.

### Scope

Only cover:

```text
sidepanel convert click
  -> Python convert endpoint
  -> job validation
  -> WebSocket CONVERT_PDF sent
  -> extension bridge receives command
  -> ACK sent
  -> runtime queue enqueued/started
  -> content readiness success/failure
  -> selector/download tracker high-level failure/success
  -> final CONVERSION_STATUS sent
  -> Python receives status
  -> job state saved
  -> diagnostics timeline returned
```

### Files to create

Python:

- `app-python-zoho/observability/__init__.py`
- `app-python-zoho/observability/schema.py`
- `app-python-zoho/observability/event_writer.py`
- `app-python-zoho/observability/event_store.py`
- `app-python-zoho/observability/sanitize.py`
- `app-python-zoho/observability/ids.py`

Chrome extension:

- `autohom-extension/observability/eventEnvelope.js`
- `autohom-extension/observability/eventWriter.js`
- `autohom-extension/observability/sanitize.js`
- `autohom-extension/observability/ids.js`

### Files to modify, minimally

Python:

- `app-python-zoho/app.py`
- `app-python-zoho/http_server.py`
- `app-python-zoho/multi_agent_ws_server.py`
- `app-python-zoho/job_store.py`
- `app-python-zoho/state_manager.py`

Chrome extension:

- `autohom-extension/background-main.js`
- `autohom-extension/sidepanel.js`
- `autohom-extension/ilovepdf-background/bridge.js`
- `autohom-extension/ilovepdf-background/runtime.js`
- `autohom-extension/ilovepdf-background/downloadTracker.js`
- `autohom-extension/ilovepdf/content.js`
- `autohom-extension/ilovepdf/pdfUploader.js`
- `autohom-extension/ilovepdf/conversionAutomator.js`

### Required first features

1. Shared compact event schema.
2. Python bounded event store.
3. Python JSONL writer or in-memory store with safe fallback.
4. Extension best-effort event writer.
5. Local endpoint to ingest extension events:
   - `POST /api/observability/events`
6. Basic timeline query:
   - `GET /api/jobs/{job_id}/timeline`, or integrate into existing diagnostics.
7. `trace_id` generated for direct convert requests.
8. `request_id` generated for WebSocket `CONVERT_PDF`.
9. `reply_to` used for ACK where safe.
10. Minimal events around:
    - convert request,
    - validation failure,
    - agent missing,
    - WS command sent,
    - ACK received,
    - command timeout,
    - runtime queued/started,
    - content not ready,
    - selector failure,
    - download tracker start/match/complete/timeout,
    - final status send failure,
    - final status received by Python,
    - state save success/failure.
11. Sanitization and size limits.
12. Tests for schema, sanitizer, event store, and timeline query.

### Acceptance criteria

- Existing app behavior is preserved.
- Existing conversion flow still works.
- Observability failure never blocks conversion.
- A direct conversion attempt produces a timeline queryable by `job_id`.
- Timeline includes both Python and extension events when Python is available.
- Timeline marks missing extension events clearly when not available.
- Large payloads are truncated.
- No full PDFs, Excel files, screenshots, or full HTML are captured.
- No OpenTelemetry or dashboard is introduced.
- No global state machine is introduced.
- No heavy dependencies are added.
- Old jobs without trace IDs still work.

---

# 6. What should be postponed

## 6.1 Full browser evidence capture

Postpone:

- screenshots,
- compact DOM snapshots,
- selector tables with full element summaries,
- before-click screenshots,
- full visual debugging.

Add only cheap selector failure metadata first.

## 6.2 Full diagnostic package export

Postpone:

- ZIP export,
- `bug_report.md` generation,
- screenshot bundle,
- DOM bundle,
- Git diff inclusion,
- harness results inclusion.

Do this after the timeline is useful.

## 6.3 Full state machine validation

Postpone:

- strict invalid transition enforcement,
- persisted state migration,
- state machine engine,
- global workflow state machine,
- fatal errors for invalid transitions.

For now, emit events only.

## 6.4 Complete decision logging

Postpone broad decision logging.

First include only obvious high-value decisions:

- agent available / missing,
- tab reused / created if already easy,
- download candidate accepted / rejected if already in tracker,
- mapping import success / failure if simple.

Do not build a full decision framework yet.

## 6.5 OpenTelemetry integration

Postpone indefinitely until local JSON/timeline observability proves insufficient.

## 6.6 Dashboard and metrics

Postpone:

- dashboards,
- charts,
- health pages,
- failure rate metrics,
- trend analysis.

They are not useful before per-job diagnostic evidence is reliable.

## 6.7 Full harness suite

Postpone browser automation harnesses until the first timeline exists.

Do first:

- event schema tests,
- sanitizer tests,
- event store tests,
- timeline query tests,
- simple WebSocket ACK/timeout unit or integration test if feasible.

## 6.8 Site2 observability

Postpone Site2 until the workflow is active and implemented.

Only record a simple “not implemented / precondition failed” event if the UI exposes the action.

---

# 7. What should never be implemented for this project

## 7.1 Generic logging everywhere

Do not add random `print`, `console.log`, or raw log spam across files.

Every event should answer:

- What workflow did this affect?
- Which entity did this affect?
- What phase changed?
- What expected-vs-actual evidence does it provide?

## 7.2 Full PDFs, Excel files, or full HTML in diagnostics by default

Never store these by default:

- full PDF content,
- full Excel content,
- full page HTML,
- huge response bodies,
- raw blobs,
- sensitive browser page contents.

Store metadata and compact summaries.

## 7.3 External cloud observability as a first-class dependency

Do not require:

- Datadog,
- New Relic,
- Sentry,
- OpenTelemetry collector,
- hosted log aggregation,
- cloud dashboards.

This is a local automation project. The first observability layer should remain local.

## 7.4 A heavy workflow engine replacement

Do not replace the current orchestrator with a new workflow engine just to implement observability.

Do not introduce:

- Temporal,
- Airflow,
- Celery,
- a custom global state machine engine,
- distributed transaction systems.

## 7.5 Observability that changes browser automation timing or behavior

Never let observability:

- click buttons,
- close tabs,
- reload pages,
- change selectors,
- change timeout behavior,
- change queue order,
- change download matching rules,
- block conversion when an event cannot be written.

## 7.6 Full OpenTelemetry as the first implementation

OpenTelemetry concepts are useful, but a full OTel setup is too heavy for the first implementation.

A local event schema with trace-like IDs is enough.

## 7.7 AI-agent memory or LLM calls inside the runtime

The app is not an AI agent runtime. Do not add LLM calls, AI memory, or autonomous diagnosis inside the application runtime.

The correct output is an AI-readable diagnostic package that an external AI coding agent can inspect.

## 7.8 Unlimited retention

Never keep unbounded logs/events.

The event store must have:

- max file size or rotation,
- max memory buffer,
- max event size,
- max returned timeline length,
- truncation metadata.

## 7.9 A one-phase mega-implementation

Do not ask a coding agent to implement all documents at once.

That is the main risk after this discovery phase.

---

# 8. Final implementation priority

## Implement first

1. Minimal event schema.
2. Python event store and safe writer.
3. Extension event envelope and best-effort forwarding to Python.
4. `trace_id` + `request_id` for direct convert path.
5. Core conversion timeline.
6. WebSocket command/ACK/timeout visibility.
7. Runtime queue start/failure visibility.
8. Download tracker success/failure visibility.
9. Final status delivery visibility.
10. Diagnostics endpoint returns compact per-job timeline.

## Implement second

1. State transition events for existing statuses.
2. Flow run trace for `pdf_to_excel`.
3. Zoho mapping trace.
4. More explicit tab/content readiness events.
5. Download candidate accept/reject decision logs.

## Implement third

1. Failure-only DOM summaries.
2. Failure-only screenshots.
3. AI-ready diagnostic export package.
4. Basic harnesses for WebSocket protocol and state conflicts.

## Implement much later, if needed

1. Metrics.
2. Dashboard.
3. OpenTelemetry mapping.
4. More complete browser automation test harnesses.
5. Site2-specific observability.

---

# 9. Recommended first implementation prompt

Use this prompt with the coding agent that can edit the repository.

```text
You have access to the full repository `infoclusiv/autohom-v2`.

Your task is to implement the first minimal observability slice only.

Do not implement the full observability roadmap yet.
Do not add OpenTelemetry.
Do not add dashboards.
Do not add screenshots.
Do not add DOM snapshots.
Do not add a global state machine.
Do not rewrite workflow logic.
Do not change browser automation behavior, selectors, queue semantics, tab behavior, timeout behavior, or business logic.
Observability must be best-effort: if observability fails, the main automation must continue.

Read these documents first:

- docs/observability/project_understanding.md
- docs/observability/observability_classification.md
- docs/observability/critical_workflows.md
- docs/observability/failure_surface_map.md
- docs/observability/observability_architecture_proposal.md
- docs/observability/implementation_roadmap.md
- docs/observability/final_pre_implementation_review.md

Goal:

Implement a minimal, safe, cross-component event foundation and one useful direct PDF-to-Excel conversion timeline.

The first implementation must focus only on this path:

sidepanel convert click
  -> Python convert endpoint
  -> job validation
  -> WebSocket CONVERT_PDF sent
  -> Chrome extension bridge receives command
  -> ACK sent
  -> runtime queue enqueued/started
  -> content readiness success/failure
  -> selector/download-tracker high-level success/failure
  -> final CONVERSION_STATUS sent
  -> Python receives status
  -> job state save success/failure
  -> diagnostics timeline returned by job_id

Create a minimal Python observability package:

- app-python-zoho/observability/__init__.py
- app-python-zoho/observability/schema.py
- app-python-zoho/observability/event_writer.py
- app-python-zoho/observability/event_store.py
- app-python-zoho/observability/sanitize.py
- app-python-zoho/observability/ids.py

Create a minimal Chrome extension observability package:

- autohom-extension/observability/eventEnvelope.js
- autohom-extension/observability/eventWriter.js
- autohom-extension/observability/sanitize.js
- autohom-extension/observability/ids.js

Implement a compact shared event envelope with these fields where applicable:

- schema_version
- ts
- monotonic_ms
- severity
- component
- event
- phase
- trace_id
- job_id
- pdf_id
- request_id
- reply_to
- agent_id
- agent_type
- connection_id
- runtime_instance_id
- tab_id
- download_id
- message
- expected
- actual
- data
- duration_ms

Add sanitization and size limits:

- truncate long strings,
- limit nested object depth,
- limit arrays,
- never store full PDFs, Excel files, blobs, or full HTML,
- never store huge request/response bodies.

Add a bounded Python event store:

- append-only,
- safe if writes fail,
- queryable by job_id, trace_id, pdf_id, request_id, component, severity,
- returns truncation metadata when applicable.

Add a local ingestion endpoint for extension events:

POST /api/observability/events

Requirements for this endpoint:

- accept one event or a batch of events,
- sanitize again server-side,
- store events in the Python event store,
- never throw unhandled errors,
- return a compact success/failure response,
- do not require authentication because this is localhost-only within the current app model,
- do not expose this outside localhost.

Add or enhance a diagnostics/timeline endpoint:

Either:

GET /api/jobs/{job_id}/timeline

or enhance the existing:

GET /api/jobs/{job_id}/diagnostics

The response must include:

- job_id,
- event_count,
- truncated,
- timeline sorted by timestamp/monotonic time where possible,
- clear indication when extension events are missing,
- compact events only.

Instrument only high-value points.

Python instrumentation:

- process startup event if simple,
- state load success/failure,
- state save success/failure,
- convert endpoint request received,
- convert validation failed,
- agent missing,
- CONVERT_PDF command sent,
- CONVERT_PDF ACK received,
- CONVERT_PDF timeout,
- CONVERSION_STATUS received,
- conversion completed/failed,
- diagnostics/timeline requested.

Chrome extension instrumentation:

- extension bootstrap started/succeeded/failed if simple,
- bridge WebSocket connect attempted/opened/closed/error,
- CONVERT_PDF command received,
- CONVERT_PDF ACK sent,
- runtime queue enqueued,
- runtime started,
- content ready succeeded/failed,
- file input selector failure,
- convert button selector failure,
- download button selector failure,
- download tracker started,
- download matched,
- download completed,
- download timeout,
- final CONVERSION_STATUS send attempted,
- final CONVERSION_STATUS send failed.

Correlation requirements:

- Generate trace_id for a direct convert action if one does not already exist.
- Generate request_id for WebSocket CONVERT_PDF.
- Preserve job_id and pdf_id across Python and extension events.
- Use reply_to when ACKing a request where safe.
- Be backward compatible with old messages or old jobs that do not contain trace_id/request_id.
- Do not fail conversion because trace_id is missing; generate one and record that fallback.

Tests:

Add lightweight tests where the project structure allows:

- Python event schema validation.
- Python sanitizer truncation.
- Python event store append/query/truncation.
- Timeline query by job_id.
- Safe handling of malformed events.
- Optional simple JS test or documented manual test if no JS test setup exists.

Manual verification checklist:

1. Start Python backend.
2. Open extension side panel.
3. Trigger direct PDF conversion for a scanned job.
4. Confirm existing conversion behavior still works.
5. Confirm timeline/diagnostics can be queried by job_id.
6. Confirm timeline includes Python events.
7. Confirm timeline includes extension events when Python is reachable.
8. Stop Python and confirm extension observability failure does not crash extension logic.
9. Confirm no full PDFs, Excel files, blobs, or full HTML are recorded.

Definition of done:

- The application still works as before.
- The direct convert path has a compact, correlated timeline.
- The timeline can identify whether the workflow reached:
  - HTTP request,
  - validation,
  - WebSocket command,
  - ACK,
  - runtime queue,
  - content readiness,
  - download tracking,
  - final status delivery,
  - Python status persistence.
- Observability failure is non-fatal.
- No screenshots, DOM snapshots, OpenTelemetry, dashboards, heavy dependencies, state migrations, or global state machines are added.
- The implementation is small enough to review in one PR or one coding-agent pass.
```

---

# 10. Final recommendation

Proceed to implementation only with the minimal first slice above.

Do **not** ask the coding agent to “implement the observability roadmap.” That wording is too broad.

Ask it to implement:

> “Phase 2A: minimal event foundation + direct conversion timeline.”

Once that works and produces useful evidence for one real conversion, continue with:

1. state transition events,
2. flow-run tracing,
3. Zoho mapping tracing,
4. failure-only DOM evidence,
5. AI-ready diagnostic export package.

This keeps the implementation professional, small, and aligned with the real failure surfaces of AutoHom v2.
