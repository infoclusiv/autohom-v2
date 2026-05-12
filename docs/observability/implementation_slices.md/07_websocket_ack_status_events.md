# Slice 07 — WebSocket ACK and Final Status Events

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: cross-component WebSocket boundary instrumentation  
Depends on: `docs/observability/implementation_slices/06_convert_pdf_python_events.md`  
Application behavior changes: **observability-only, best-effort**  
Runtime instrumentation: **WebSocket command / ACK / final status boundary only**  
Status: `ready_for_implementation`

---

## 1. Goal

Instrument the WebSocket boundary for the direct PDF-to-Excel conversion path.

This slice should make the message handoff between Python and the Chrome extension visible.

It should answer:

- Did Python send the `CONVERT_PDF` command?
- Which `trace_id`, `request_id`, `job_id`, and `pdf_id` were attached?
- Did the extension bridge receive the command?
- Did the extension send an ACK for the command?
- Did Python observe an ACK or timeout condition, if the current protocol supports it?
- Did the extension attempt to send final `CONVERSION_STATUS`?
- Did Python receive final `CONVERSION_STATUS`?
- Was the final status `completed` or `failed`?
- Did final status delivery fail before reaching Python?

This slice should not instrument runtime queue internals, content script readiness, iLovePDF selectors, download tracker, tab lifecycle, screenshots, DOM snapshots, or state machine validation.

---

## 2. Scope

Instrument only the WebSocket protocol boundary for the direct conversion path.

Target boundary:

```text
Python direct convert path
  -> existing WebSocket CONVERT_PDF command send
  -> Chrome extension bridge receives command
  -> extension bridge sends ACK if supported
  -> extension later sends final CONVERSION_STATUS
  -> Python receives final status
```

This slice should focus on message visibility and correlation.

It must preserve existing WebSocket behavior and message compatibility.

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
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `06_convert_pdf_python_events.md` for the Python-side `trace_id` and `request_id` context.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may modify these files:

```text
app-python-zoho/multi_agent_ws_server.py
autohom-extension/ilovepdf-background/bridge.js
```

The coding agent may modify these files only if they are required to preserve or pass through existing `trace_id` / `request_id` metadata created in Slice 06:

```text
app-python-zoho/http_server.py
app-python-zoho/observability/__init__.py
app-python-zoho/observability/event_writer.py
app-python-zoho/observability/ids.py
autohom-extension/observability/eventWriter.js
autohom-extension/observability/eventEnvelope.js
```

The coding agent may create this helper file only if it keeps protocol handling small and does not introduce a new protocol framework:

```text
app-python-zoho/observability/ws_protocol_events.py
```

The coding agent may add optional tests only if the repository already has a compatible test structure:

```text
tests/observability/test_websocket_ack_status_events.py
```

If the repository does not already have a clear test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Conditional allowed files

The coding agent may modify these files only if the current code handles WebSocket registration/status delivery in them rather than in `bridge.js` or `multi_agent_ws_server.py`:

```text
autohom-extension/background-main.js
autohom-extension/ilovepdf-background/router.js
```

This is conditional.

Before modifying either file, the agent must verify that:

- The actual `CONVERT_PDF` receive path or `CONVERSION_STATUS` send path lives there.
- The change is only a narrow observability event addition or metadata pass-through.
- No runtime queue, content script, selector, download tracker, or tab behavior is changed.

If a conditional file is modified, the completion report must clearly explain why.

---

## 6. Forbidden files

Do not modify these Python files in this slice:

```text
app-python-zoho/app.py
app-python-zoho/agent_registry.py
app-python-zoho/state_manager.py
app-python-zoho/job_store.py
app-python-zoho/flow_orchestrator.py
app-python-zoho/pdf_scanner.py
```

Do not modify these Chrome extension files in this slice:

```text
autohom-extension/background-zoho.js
autohom-extension/sidepanel.js
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/tabManager.js
autohom-extension/ilovepdf-background/downloadTracker.js
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

Use a small event set.

### Python events

```text
ws.connection.opened
ws.connection.closed
agent.registration.succeeded
agent.registration.failed
conversion.command.sent
conversion.command.timeout
conversion.status.received
conversion.completed
conversion.failed
```

Optional only if the current protocol clearly supports ACK receipt:

```text
conversion.command.ack_received
```

### Chrome extension events

```text
bridge.command.received
bridge.command.ack_sent
conversion.status.send_attempted
conversion.status.send_failed
```

Optional only if easy and truthful:

```text
conversion.status.send_succeeded
```

Do not create broad new taxonomy in this slice.

Do not emit runtime queue, content, selector, download, or tab events.

---

## 8. Required IDs and correlation

Events should include these fields when available:

```text
trace_id
job_id
pdf_id
request_id
reply_to
agent_id
agent_type
connection_id
runtime_instance_id
tab_id
download_id
```

The essential fields for this slice are:

```text
trace_id
job_id
pdf_id
request_id
reply_to
agent_type
connection_id
runtime_instance_id
```

Rules:

- Preserve `trace_id` created in Slice 06.
- Preserve `request_id` created in Slice 06.
- If an ACK message exists, it should include `reply_to` equal to the command `request_id`.
- If a final status message exists, it should preserve the same `trace_id`, `job_id`, and `pdf_id` when available.
- Do not break old messages that do not contain observability metadata.
- Do not require old messages to have these fields.
- If metadata is missing, emit a best-effort event and continue.

---

## 9. Python-side required behavior

### 9.1 WebSocket connection events

Where the Python WebSocket server detects agent connections, disconnections, or registration, emit best-effort events.

Recommended events:

```text
ws.connection.opened
ws.connection.closed
agent.registration.succeeded
agent.registration.failed
```

Recommended fields:

```json
{
  "component": "python.websocket",
  "event": "ws.connection.opened",
  "severity": "info",
  "agent_type": "ilovepdf-converter",
  "connection_id": "conn_...",
  "message": "WebSocket connection opened"
}
```

Do not change connection handling behavior.

Do not reject connections because observability fails.

Do not change heartbeat/ping behavior.

---

### 9.2 Command sent event

When Python actually sends the `CONVERT_PDF` command to the extension/agent, emit:

```text
conversion.command.sent
```

Recommended fields:

```json
{
  "component": "python.websocket",
  "event": "conversion.command.sent",
  "phase": "command_sent",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "connection_id": "conn_...",
  "message": "CONVERT_PDF command sent to extension agent"
}
```

Important:

- Emit this only when the command has actually been sent to the WebSocket/agent layer.
- If the code only schedules a send, use the event from Slice 06 (`conversion.command.handoff_requested`) and do not duplicate misleading events.
- Do not change the command payload except optional backward-compatible metadata if safe.

---

### 9.3 Command timeout event

If the existing Python code has a command timeout, ACK timeout, or send timeout condition, emit:

```text
conversion.command.timeout
```

Recommended fields:

```json
{
  "component": "python.websocket",
  "event": "conversion.command.timeout",
  "phase": "command_wait",
  "severity": "warning",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "connection_id": "conn_...",
  "expected": {
    "ack_or_status_received": true
  },
  "actual": {
    "ack_or_status_received": false
  },
  "message": "CONVERT_PDF command timed out waiting for response"
}
```

Only emit this if a timeout exists in current code.

Do not introduce new timeout behavior in this slice.

Do not change timeout durations.

Do not fail requests differently.

---

### 9.4 Final status received event

When Python receives final `CONVERSION_STATUS` from the extension, emit:

```text
conversion.status.received
```

Recommended fields:

```json
{
  "component": "python.websocket",
  "event": "conversion.status.received",
  "phase": "final_status",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "connection_id": "conn_...",
  "message": "Final conversion status received from extension",
  "data": {
    "status": "completed"
  }
}
```

Do not store full payloads.

Keep `data` compact.

---

### 9.5 Completed/failed final events

If final status clearly indicates completion, emit:

```text
conversion.completed
```

If final status clearly indicates failure, emit:

```text
conversion.failed
```

Recommended completed event:

```json
{
  "component": "python.websocket",
  "event": "conversion.completed",
  "phase": "completed",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "message": "PDF-to-Excel conversion completed"
}
```

Recommended failed event:

```json
{
  "component": "python.websocket",
  "event": "conversion.failed",
  "phase": "failed",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "message": "PDF-to-Excel conversion failed",
  "actual": {
    "reason": "compact sanitized reason"
  }
}
```

Do not change how final status updates state.

Do not rewrite state persistence.

Do not modify `StateManager` or `JobStore` in this slice.

---

## 10. Extension-side required behavior

### 10.1 Command received event

When the extension bridge receives a `CONVERT_PDF` command, emit:

```text
bridge.command.received
```

Recommended fields:

```json
{
  "component": "extension.bridge",
  "event": "bridge.command.received",
  "phase": "command_received",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "runtime_instance_id": "rt_...",
  "message": "CONVERT_PDF command received by extension bridge"
}
```

Use the extension event writer from Slice 04.

If the event writer is unavailable, fail safely.

Do not block command processing.

---

### 10.2 ACK sent event

If the extension already sends an ACK for `CONVERT_PDF`, preserve that behavior and emit:

```text
bridge.command.ack_sent
```

Recommended fields:

```json
{
  "component": "extension.bridge",
  "event": "bridge.command.ack_sent",
  "phase": "ack",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "ack_...",
  "reply_to": "req_...",
  "agent_type": "ilovepdf-converter",
  "runtime_instance_id": "rt_...",
  "message": "ACK sent for CONVERT_PDF command"
}
```

If no ACK exists today, do not invent a new ACK protocol unless the existing code already has a safe response/ack pattern.

If adding `reply_to` is safe and backward compatible, add it.

If adding `reply_to` could break consumers, do not add it. Emit the event with whatever metadata is available.

Do not change command execution order.

---

### 10.3 Final status send attempted event

When the extension attempts to send final `CONVERSION_STATUS` to Python, emit:

```text
conversion.status.send_attempted
```

Recommended fields:

```json
{
  "component": "extension.bridge",
  "event": "conversion.status.send_attempted",
  "phase": "final_status_send",
  "severity": "info",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "runtime_instance_id": "rt_...",
  "message": "Attempting to send final conversion status to Python",
  "data": {
    "status": "completed"
  }
}
```

Do not include full result payloads.

Do not include full file contents.

Do not include full download paths unless already considered safe.

---

### 10.4 Final status send failed event

If sending final status to Python fails, emit:

```text
conversion.status.send_failed
```

Recommended fields:

```json
{
  "component": "extension.bridge",
  "event": "conversion.status.send_failed",
  "phase": "final_status_send",
  "severity": "error",
  "trace_id": "trace_...",
  "job_id": "job_...",
  "pdf_id": "pdf_...",
  "request_id": "req_...",
  "agent_type": "ilovepdf-converter",
  "runtime_instance_id": "rt_...",
  "message": "Failed to send final conversion status to Python",
  "actual": {
    "error": "compact sanitized error"
  }
}
```

Do not throw uncaught errors from observability.

Do not retry aggressively.

Do not alter existing status-send behavior.

---

## 11. Message compatibility rules

This slice must be backward compatible.

A coding agent must not:

- Rename WebSocket message types.
- Remove existing fields.
- Make new observability fields required.
- Change command ordering.
- Change ACK semantics.
- Change final status semantics.
- Change timeout durations.
- Change queue behavior.
- Change tab behavior.
- Change runtime behavior.
- Change download behavior.
- Change state persistence.

Optional metadata fields may be added only if the existing code tolerates them.

If the payload shape is fragile, do not modify payload shape; emit events around it instead.

---

## 12. Best-effort observability rule

All Python event emission must be best-effort.

All extension event emission must be best-effort.

If event emission fails:

- Do not fail WebSocket command handling.
- Do not fail conversion.
- Do not fail ACK.
- Do not fail final status delivery.
- Do not close sockets.
- Do not throw uncaught exceptions.

---

## 13. Data safety

Events must not include:

- Full PDF contents.
- Full Excel contents.
- Binary blobs.
- Full request bodies.
- Full response bodies.
- Full WebSocket payloads.
- Full page HTML.
- Cookies.
- Authorization headers.
- Access tokens.
- Refresh tokens.
- Passwords.
- Huge stack traces.

Prefer compact fields:

- `trace_id`
- `job_id`
- `pdf_id`
- `request_id`
- `reply_to`
- `agent_type`
- `connection_id`
- `runtime_instance_id`
- message type
- status
- compact error reason

---

## 14. Timeline expectation

After this slice, a direct conversion timeline should be able to show Python and extension boundary events.

Example:

```json
{
  "timeline": [
    {
      "component": "python.http",
      "event": "conversion.requested",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "python.websocket",
      "event": "conversion.command.sent",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "extension.bridge",
      "event": "bridge.command.received",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "request_id": "req_abc"
    },
    {
      "component": "extension.bridge",
      "event": "bridge.command.ack_sent",
      "job_id": "job_123",
      "trace_id": "trace_abc",
      "reply_to": "req_abc"
    },
    {
      "component": "extension.bridge",
      "event": "conversion.status.send_attempted",
      "job_id": "job_123",
      "trace_id": "trace_abc"
    },
    {
      "component": "python.websocket",
      "event": "conversion.status.received",
      "job_id": "job_123",
      "trace_id": "trace_abc"
    },
    {
      "component": "python.websocket",
      "event": "conversion.completed",
      "job_id": "job_123",
      "trace_id": "trace_abc"
    }
  ]
}
```

The timeline may not yet include runtime queue, content, selector, download, or tab events.

That is expected.

---

## 15. Required acceptance criteria

This slice is complete when:

- Python emits `conversion.command.sent` at the true WebSocket send boundary, if such boundary exists.
- Python emits `conversion.command.timeout` only if the current code has a timeout condition.
- Python emits `conversion.status.received` when final `CONVERSION_STATUS` is received.
- Python emits `conversion.completed` for clearly successful final status.
- Python emits `conversion.failed` for clearly failed final status.
- Python emits WebSocket connection/registration events where safe and clear.
- Extension emits `bridge.command.received` when it receives `CONVERT_PDF`.
- Extension emits `bridge.command.ack_sent` if ACK exists.
- Extension emits `conversion.status.send_attempted` when attempting final status send.
- Extension emits `conversion.status.send_failed` when final status send fails.
- Events preserve `trace_id`, `job_id`, `pdf_id`, and `request_id` when available.
- ACK events use `reply_to` when safe and available.
- Old messages without observability metadata still work.
- Observability failures do not break command handling.
- No runtime queue instrumentation is added.
- No download tracker instrumentation is added.
- No selector instrumentation is added.
- No tab lifecycle instrumentation is added.
- No state migration is introduced.
- No selectors, timeouts, queue semantics, tab behavior, or business logic are changed.
- No OpenTelemetry, dashboard, screenshots, DOM snapshots, or external logging services are added.
- No heavy dependencies are added.

---

## 16. Manual test plan

The coding agent should perform manual tests using the existing direct conversion flow where possible.

### 16.1 Normal conversion path

1. Start Python backend.
2. Start/load Chrome extension.
3. Ensure the iLovePDF converter agent connects.
4. Trigger direct PDF-to-Excel conversion.
5. Query timeline:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:7790/api/jobs/<JOB_ID>/timeline"
```

Expected result:

- Timeline includes Python-side command send event if command was actually sent.
- Timeline includes extension bridge command received event.
- Timeline includes ACK event if the protocol supports ACK.
- Timeline includes final status send attempted event.
- Timeline includes Python final status received event when status arrives.
- Timeline includes conversion completed/failed depending on final status.
- Same `trace_id` appears across Python and extension events when metadata is available.

### 16.2 Agent disconnected or unavailable

If safe, trigger direct conversion while converter agent is unavailable.

Expected result:

- Existing behavior is unchanged.
- Relevant Python event from Slice 06 or this slice is visible.
- No extension events are expected if command never reaches extension.
- No server crash.

### 16.3 Final status send failure

If practical and safe, simulate Python backend unavailable before extension sends final status.

Expected result:

- Extension emits or buffers `conversion.status.send_failed` if event forwarding is possible.
- No uncaught exception.
- Existing behavior is not made worse.

If this cannot be safely simulated, explain in completion report.

---

## 17. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_websocket_ack_status_events.py
```

Recommended tests:

- Command sent emits `conversion.command.sent`.
- Final status received emits `conversion.status.received`.
- Completed final status emits `conversion.completed`.
- Failed final status emits `conversion.failed`.
- Missing observability metadata does not crash.
- Event writer failure does not break WebSocket handling.
- Optional metadata does not break old payloads.
- ACK `reply_to` is preserved when supported.

For JavaScript, if there is an existing test setup:

- Bridge command receive emits `bridge.command.received`.
- ACK path emits `bridge.command.ack_sent`.
- Final status send attempt emits `conversion.status.send_attempted`.
- Send failure emits `conversion.status.send_failed`.
- Event writer failure does not break bridge handling.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 18. Out of scope

Do not implement:

- Runtime queue events.
- `runtime.queue.enqueued`.
- `runtime.queue.started`.
- Content readiness events.
- Selector failure events.
- Download tracker events.
- Tab lifecycle events.
- DOM summaries.
- Screenshots.
- Trace summary inference.
- Side panel timeline UI.
- Diagnostics ZIP export.
- State machine validation.
- Decision logging framework.
- Site2 observability.
- New timeout behavior.
- New ACK protocol if none exists.
- Persistent event storage.
- OpenTelemetry.
- Dashboard.
- Metrics.
- Generic logging across the codebase.

---

## 19. Rollback notes

Rollback should be limited to WebSocket boundary event additions.

Revert observability changes in:

```text
app-python-zoho/multi_agent_ws_server.py
autohom-extension/ilovepdf-background/bridge.js
```

If conditionally modified, revert changes in:

```text
app-python-zoho/http_server.py
autohom-extension/background-main.js
autohom-extension/ilovepdf-background/router.js
```

If created, delete:

```text
app-python-zoho/observability/ws_protocol_events.py
```

If tests were added, delete:

```text
tests/observability/test_websocket_ack_status_events.py
```

Because this slice should only add best-effort observability events and optional metadata, rollback should restore the exact previous WebSocket behavior.

---

## 20. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 07 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Events added

### IDs propagated

### Message compatibility notes

### Tests run

### Tests not run and why

### Manual WebSocket boundary checks

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
08_runtime_and_content_events.md
```

The agent must stop after this report.

---

## 21. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/07_websocket_ack_status_events.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/implementation_slices/03_observability_ingestion_endpoint.md
- docs/observability/implementation_slices/04_extension_event_writer.md
- docs/observability/implementation_slices/05_job_timeline_endpoint.md
- docs/observability/implementation_slices/06_convert_pdf_python_events.md
- docs/observability/implementation_slices/07_websocket_ack_status_events.md
- docs/observability/final_pre_implementation_review.md

Your task is to instrument only the WebSocket boundary for direct CONVERT_PDF command, ACK if supported, and final CONVERSION_STATUS delivery.

Add Python events for:
- ws.connection.opened
- ws.connection.closed
- agent.registration.succeeded / agent.registration.failed where safe
- conversion.command.sent
- conversion.command.timeout only if existing timeout logic exists
- conversion.status.received
- conversion.completed
- conversion.failed

Add extension events for:
- bridge.command.received
- bridge.command.ack_sent if ACK exists
- conversion.status.send_attempted
- conversion.status.send_failed

Preserve and propagate:
- trace_id
- job_id
- pdf_id
- request_id
- reply_to where safe
- agent_type
- connection_id
- runtime_instance_id where available

You may modify only the files listed in the “Allowed files” section of Slice 07.

Do not modify any forbidden file.

Do not instrument runtime queue, content readiness, selector failures, download tracker, tab lifecycle, side panel UI, JobStore, StateManager, or flow orchestration.

Do not create a new ACK protocol if one does not already exist.

Do not change selectors, timeouts, tab behavior, queue behavior, command semantics, conversion behavior, final status semantics, or state persistence behavior.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, global state machines, databases, cloud services, or heavy dependencies.

Observability must be best-effort: if event emission fails, the WebSocket/conversion flow must continue exactly as before.

When done, provide the required Slice 07 completion report and stop.
```
