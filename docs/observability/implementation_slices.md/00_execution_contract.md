# Slice 00 — Observability Implementation Execution Contract

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: execution control / safety contract  
Application code changes: **none**  
Primary reader: coding agent that will implement future observability slices

---

## 1. Purpose

This file defines the mandatory execution rules for implementing observability in AutoHom v2.

The observability roadmap is intentionally broad. It must **not** be implemented all at once.

Future coding agents must implement observability as small, isolated, reviewable slices. Each slice must have a narrow scope, an explicit file allowlist, clear acceptance criteria, and a review step before continuing.

The goal is to build useful AI-ready diagnostic evidence without destabilizing the existing automation.

---

## 2. Required source documents

Before implementing any observability slice, the coding agent must read these documents:

- `docs/observability/project_understanding.md`
- `docs/observability/observability_classification.md`
- `docs/observability/critical_workflows.md`
- `docs/observability/failure_surface_map.md`
- `docs/observability/observability_architecture_proposal.md`
- `docs/observability/implementation_roadmap.md`
- `docs/observability/final_pre_implementation_review.md`
- `docs/observability/implementation_slices/00_execution_contract.md`

The implementation roadmap is a reference map, not a single implementation task.

The final pre-implementation review is the controlling document for reducing scope. If the roadmap and review conflict, follow the review.

---

## 3. Core implementation rule

Implement **one slice at a time**.

Do not continue to the next slice unless the current slice is complete, tested, reviewed, and accepted.

A future coding agent must never interpret the full roadmap as permission to implement everything in one pass.

---

## 4. First implementation target

The first real implementation target is not the full observability system.

The first target is:

> Build a minimal, safe, cross-component event foundation and one useful direct PDF-to-Excel conversion timeline for the `convert-pdf` path only.

The initial implementation should move toward this path:

```text
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
```

Do not implement unrelated observability before this foundation exists.

---

## 5. Non-negotiable safety rules

Observability must be best-effort.

If observability fails, the main automation must continue.

A coding agent must not:

- Change existing browser automation behavior.
- Change iLovePDF selectors.
- Change Zoho selectors.
- Change timeout values unless a later slice explicitly authorizes it.
- Change tab close behavior unless a later slice explicitly authorizes it.
- Change queue semantics.
- Change WebSocket command semantics except adding backward-compatible optional metadata.
- Change download matching rules.
- Replace the existing `JobStore`.
- Replace the existing `StateManager`.
- Migrate `state.json` automatically.
- Rename existing persisted statuses.
- Break old jobs that do not have observability fields.
- Add heavy dependencies without explicit approval.
- Add network/cloud dependencies.
- Add runtime LLM calls.

---

## 6. Explicitly out of scope for early slices

Do not implement any of the following in early slices:

- OpenTelemetry.
- External observability platforms.
- Datadog.
- New Relic.
- Sentry.
- Cloud log aggregation.
- Dashboards.
- Charts.
- Metrics pages.
- Full diagnostic ZIP export.
- `bug_report.md` generation.
- Screenshots.
- DOM snapshots.
- Full HTML capture.
- Full PDF capture.
- Full Excel capture.
- Full request/response body capture.
- Global state machine engine.
- Heavy workflow engine.
- Temporal.
- Airflow.
- Celery.
- Broad decision logging framework.
- Full browser automation harness.
- Site2-specific observability.
- Autonomous AI diagnosis inside the runtime.

These may be considered only in later reviewed slices, and only if the lightweight timeline foundation proves insufficient.

---

## 7. Required slice structure

Every future implementation slice must contain the following sections:

```markdown
# Slice NN — Title

## Goal

## Scope

## Allowed files

## Forbidden files

## Required behavior

## Required event names, if applicable

## Required IDs, if applicable

## Acceptance criteria

## Manual test plan

## Automated test plan

## Out of scope

## Rollback notes
```

A coding agent must follow the slice file exactly.

If the agent believes additional files are required, it must stop and explain why instead of modifying them silently.

---

## 8. Allowed implementation strategy

Preferred implementation strategy:

1. Read the current slice.
2. Read only the relevant existing source files.
3. Make the smallest safe code changes.
4. Add or update tests where the slice requires them.
5. Run the relevant tests or explain why they could not be run.
6. Report changed files.
7. Report what was implemented.
8. Report what was intentionally not implemented.
9. Stop.

The agent must not start the next slice automatically.

---

## 9. Required event design principles

All observability events must be:

- Structured.
- Compact.
- Correlatable.
- Safe to emit.
- Safe to lose.
- Queryable by important identifiers.
- Useful to an AI coding agent.

Events should answer:

- What workflow did this affect?
- Which entity did this affect?
- What phase changed?
- What was expected?
- What actually happened?
- Which component produced this evidence?

Events must not become generic log spam.

---

## 10. Initial event fields

Future slices should use this event envelope where applicable:

```json
{
  "schema_version": "1.0",
  "ts": "2026-05-10T00:00:00.000Z",
  "monotonic_ms": 0,
  "severity": "info",
  "component": "python.http",
  "event": "conversion.requested",
  "phase": "requested",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "reply_to": "req_...",
  "agent_id": "agent_...",
  "agent_type": "ilovepdf-converter",
  "connection_id": "conn_...",
  "runtime_instance_id": "rt_...",
  "tab_id": 123,
  "download_id": 456,
  "message": "Short human-readable message",
  "expected": {},
  "actual": {},
  "data": {},
  "duration_ms": 0
}
```

Not every event needs every field. Missing fields must be tolerated.

---

## 11. Initial identifier subset

Early slices should focus only on this identifier subset:

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

Postpone broad usage of:

- `diagnostic_export_id`
- `component_id`
- `sidepanel_session_id`
- `process_run_id` propagation everywhere
- `extension_start_id` propagation everywhere
- full flow/run IDs beyond the currently active flow path

---

## 12. Initial event set

Early slices should use a small event vocabulary.

### Python events

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

### Chrome extension events

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

Do not invent broad new taxonomies in early slices unless the slice explicitly allows it.

---

## 13. Data safety and size limits

Future slices must enforce data limits.

At minimum:

- Truncate long strings.
- Limit nested object depth.
- Limit array length.
- Limit event size.
- Limit timeline response length.
- Add `truncated: true` where applicable.
- Never capture full PDFs.
- Never capture full Excel files.
- Never capture binary blobs.
- Never capture full page HTML.
- Never capture huge request or response bodies.

Prefer metadata and compact summaries over raw payloads.

---

## 14. Extension-to-Python event direction

Python should be the authoritative diagnostic store.

The Chrome extension should eventually send compact observability events to Python through a local best-effort endpoint:

```text
POST /api/observability/events
```

If Python is unavailable, the extension may keep a small bounded local buffer and retry later.

The extension must not block automation if event forwarding fails.

---

## 15. Existing job events and diagnostics

The existing job events and diagnostics must not be replaced in early slices.

Future slices may add a separate observability event store and optionally mirror high-level events into existing diagnostics.

Existing UI behavior must be preserved.

Old jobs without observability fields must still work.

---

## 16. Tab lifecycle rule

The known premature-tab-close failure must be observed before being changed.

Future slices may add events such as:

- `tab.close.requested`
- `tab.close.decision`
- `tab.close.allowed`
- `tab.close.blocked`
- `tab.closed`
- `tab.closed_before_terminal_status`

However, early slices must not change tab close behavior unless explicitly authorized.

---

## 17. Review gate

After each slice, a reviewer must check:

- Did the agent modify only allowed files?
- Did the agent avoid forbidden files?
- Did the agent preserve existing automation behavior?
- Did the agent avoid forbidden features?
- Did the agent avoid heavy dependencies?
- Did observability remain best-effort?
- Did tests pass or did the agent clearly explain why tests were not run?
- Did the implementation remain small and reversible?

Only after this review should the next slice be implemented.

---

## 18. Required completion report from coding agent

At the end of every slice, the coding agent must report:

```markdown
## Slice completion report

### Implemented

### Changed files

### Tests run

### Tests not run and why

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes
```

The agent must stop after this report.

---

## 19. Current status

Status: created  
Next recommended slice: `01_schema_and_ids.md`

The next slice should create the minimal Python and Chrome extension observability schema, ID helpers, and sanitization helpers without wiring them into runtime behavior yet.
