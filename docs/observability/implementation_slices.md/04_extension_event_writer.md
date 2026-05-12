# Slice 04 — Chrome Extension Event Writer

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: Chrome extension observability foundation  
Depends on: `docs/observability/implementation_slices/03_observability_ingestion_endpoint.md`  
Application behavior changes: **none expected**  
Runtime instrumentation: **none in this slice**  
Status: `ready_for_implementation`

---

## 1. Goal

Create the Chrome extension-side event writer that can send compact observability events to the local Python ingestion endpoint created in Slice 03.

This slice creates the reusable best-effort event forwarding helper only.

It must not instrument the extension workflows yet.

The goal is to prepare a safe bridge from the Chrome extension to Python diagnostics without changing existing browser automation behavior.

---

## 2. Scope

Implement only the extension observability event writer helper.

The writer should:

1. Build or accept compact observability events.
2. Sanitize events before sending.
3. Send events to the local Python endpoint:

```text
http://localhost:7790/api/observability/events
```

4. Keep a small bounded in-memory buffer if sending fails.
5. Retry buffered events only when explicitly asked or when later code calls the writer again.
6. Never block browser automation.
7. Never throw uncaught errors into production extension code.
8. Never capture full page HTML, PDFs, Excel files, blobs, cookies, tokens, or large payloads.

This slice should not add calls to the writer from `bridge.js`, `runtime.js`, `downloadTracker.js`, `sidepanel.js`, or content scripts yet.

---

## 3. Required documents to read first

Before implementing this slice, read:

- `docs/observability/implementation_slices/00_execution_contract.md`
- `docs/observability/implementation_slices/01_schema_and_ids.md`
- `docs/observability/implementation_slices/02_python_event_store.md`
- `docs/observability/implementation_slices/03_observability_ingestion_endpoint.md`
- `docs/observability/implementation_slices/04_extension_event_writer.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use `01_schema_and_ids.md` for event envelope, ID, and sanitization conventions.

Use `03_observability_ingestion_endpoint.md` for the Python endpoint contract.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may create this file:

```text
autohom-extension/observability/eventWriter.js
```

The coding agent may modify these files only if needed to keep helper APIs compatible:

```text
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/sanitize.js
autohom-extension/observability/ids.js
```

The coding agent may add optional tests only if the repository already has a compatible JavaScript test setup:

```text
tests/observability/test_extension_event_writer.js
```

If the repository does not already have a clear JavaScript test convention, do not invent a large testing framework in this slice. Instead, include manual verification steps in the completion report.

---

## 5. Forbidden files

Do not modify extension runtime files in this slice:

```text
autohom-extension/background-main.js
autohom-extension/background-zoho.js
autohom-extension/sidepanel.js
autohom-extension/ilovepdf-background/bridge.js
autohom-extension/ilovepdf-background/runtime.js
autohom-extension/ilovepdf-background/tabManager.js
autohom-extension/ilovepdf-background/downloadTracker.js
autohom-extension/ilovepdf-background/router.js
autohom-extension/ilovepdf/content.js
autohom-extension/ilovepdf/pdfUploader.js
autohom-extension/ilovepdf/conversionAutomator.js
autohom-extension/ilovepdf/domHelpers.js
autohom-extension/ilovepdf/config.js
```

Do not modify Python runtime files in this slice:

```text
app-python-zoho/app.py
app-python-zoho/http_server.py
app-python-zoho/multi_agent_ws_server.py
app-python-zoho/agent_registry.py
app-python-zoho/state_manager.py
app-python-zoho/job_store.py
app-python-zoho/flow_orchestrator.py
app-python-zoho/pdf_scanner.py
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

## 6. Required behavior

### 6.1 Event writer helper

Create:

```text
autohom-extension/observability/eventWriter.js
```

The file should define a small browser-compatible helper.

Recommended global namespace:

```javascript
globalThis.AutoHomObservabilityEventWriter
```

The helper must not assume a bundler.

The helper must not require external packages.

The helper must work in a Chrome extension service worker context where possible.

The helper should be compatible with the helper namespace pattern from Slice 01:

```javascript
globalThis.AutoHomObservabilityEventEnvelope
globalThis.AutoHomObservabilitySanitize
globalThis.AutoHomObservabilityIds
```

If those helpers are not loaded, the writer should fail safely or use minimal safe fallbacks where reasonable.

---

### 6.2 Recommended public API

Recommended API shape:

```javascript
globalThis.AutoHomObservabilityEventWriter = {
  configure,
  emit,
  emitEvent,
  emitMany,
  flush,
  getBufferStats,
  clearBuffer,
};
```

Recommended functions:

```javascript
configure(options)
```

```javascript
emit({
  component,
  event,
  severity = "info",
  phase = null,
  message = null,
  trace_id = null,
  job_id = null,
  pdf_id = null,
  request_id = null,
  reply_to = null,
  agent_id = null,
  agent_type = null,
  connection_id = null,
  runtime_instance_id = null,
  tab_id = null,
  download_id = null,
  expected = null,
  actual = null,
  data = null,
  duration_ms = null,
})
```

```javascript
emitEvent(eventObject)
```

```javascript
emitMany(eventObjects)
```

```javascript
flush()
```

```javascript
getBufferStats()
```

```javascript
clearBuffer()
```

Exact implementation can differ, but it must be small, clear, and safe.

---

## 7. Endpoint configuration

Default endpoint:

```text
http://localhost:7790/api/observability/events
```

Recommended config:

```javascript
const DEFAULT_ENDPOINT_URL = "http://localhost:7790/api/observability/events";
const DEFAULT_MAX_BUFFER_EVENTS = 100;
const DEFAULT_MAX_BATCH_EVENTS = 25;
const DEFAULT_REQUEST_TIMEOUT_MS = 1500;
```

Requirements:

- Endpoint should be configurable through `configure({ endpointUrl })`.
- Defaults should be local-only.
- Do not use external network endpoints.
- Do not send events to cloud services.
- Do not add analytics services.
- Do not add OpenTelemetry exporters.
- Do not add Sentry, Datadog, New Relic, or hosted log providers.

---

## 8. Sending behavior

The writer should send events using `fetch`.

Recommended request:

```javascript
fetch(endpointUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ events }),
})
```

Requirements:

- Send batches using the Slice 03 batch payload shape:

```json
{
  "events": []
}
```

- Use best-effort behavior.
- Catch all network errors.
- Catch JSON/stringify errors.
- Catch timeout errors if timeout is implemented.
- Do not throw uncaught exceptions to callers.
- Return a compact result object.

Recommended success result:

```json
{
  "ok": true,
  "sent": 1,
  "buffered": 0,
  "dropped": 0
}
```

Recommended failure result:

```json
{
  "ok": false,
  "sent": 0,
  "buffered": 1,
  "dropped": 0,
  "reason": "send_failed"
}
```

Do not log noisy console output by default.

Optional debug logging is allowed only if disabled by default.

---

## 9. Timeout behavior

The writer may implement request timeout with `AbortController`.

If implemented:

- Timeout must be short.
- Timeout must not block automation.
- Timeout failures must be caught.
- Timeout should result in buffering if the event is safe to buffer.

Recommended default:

```text
1500 ms
```

If `AbortController` is not available, skip timeout rather than adding a polyfill.

Do not add dependencies.

---

## 10. Buffer behavior

The writer should keep a small bounded in-memory buffer.

Requirements:

- Default maximum buffer size: `100` events.
- If the buffer is full, drop the oldest events first.
- Track dropped event count.
- Buffer must be in-memory only in this slice.
- Do not use `chrome.storage` in this slice unless there is a strong reason.
- Do not use IndexedDB.
- Do not write files.
- Do not persist unbounded data.
- Do not block automation while flushing.
- Do not create a background interval by default.

Recommended buffer stats:

```json
{
  "buffered": 4,
  "dropped": 2,
  "maxBufferEvents": 100,
  "lastSendOk": true,
  "lastError": null
}
```

The buffer may be lost when the service worker restarts. That is acceptable for this slice.

---

## 11. Retry behavior

This slice should avoid complex retry loops.

Recommended behavior:

- `emit()` attempts to send the new event.
- If sending fails, the event is buffered.
- Future calls to `emit()` may attempt to flush buffered events before or after sending the new event.
- `flush()` explicitly attempts to send buffered events.
- No infinite retry loop.
- No timer-based background retry unless disabled by default.
- No service-worker keepalive hacks.

The purpose is evidence capture, not guaranteed delivery.

---

## 12. Event building behavior

The writer should support two paths:

### 12.1 `emit()`

`emit()` should build a structured event using:

```javascript
globalThis.AutoHomObservabilityEventEnvelope.buildEvent(...)
```

If `buildEvent` is unavailable, it may build a minimal fallback event safely.

### 12.2 `emitEvent()`

`emitEvent()` should accept an already-built event object, sanitize it, then send or buffer it.

### 12.3 `emitMany()`

`emitMany()` should accept an array of already-built event objects, sanitize them, limit batch size, then send or buffer them.

---

## 13. Sanitization behavior

The writer must sanitize events before sending.

Use:

```javascript
globalThis.AutoHomObservabilitySanitize.sanitizeEvent(...)
```

if available.

If unavailable, use a minimal fallback sanitizer that:

- Rejects or summarizes non-object values.
- Truncates long strings.
- Redacts sensitive key names.
- Avoids serializing DOM nodes.
- Avoids serializing `Blob`, `File`, `ArrayBuffer`, and binary-like data.
- Avoids full HTML capture.

Sensitive key fragments:

```text
token
secret
password
authorization
cookie
set-cookie
api_key
apikey
access_token
refresh_token
```

Use:

```text
[redacted]
```

for redacted values.

Never send:

- Full PDFs.
- Full Excel files.
- Binary blobs.
- Full HTML.
- Full request bodies.
- Full response bodies.
- Cookies.
- Authorization headers.
- Access tokens.
- Refresh tokens.
- Passwords.

---

## 14. Batch limits

Required defaults:

```javascript
DEFAULT_MAX_BATCH_EVENTS = 25;
DEFAULT_MAX_BUFFER_EVENTS = 100;
```

Rules:

- `emitMany()` must not send unbounded arrays.
- If more than `maxBatchEvents` are provided, split into batches or store only the allowed subset and report the rest.
- Prefer split batches if simple.
- If splitting is not implemented, return clear dropped/buffered metadata.
- Do not create huge request bodies.

---

## 15. No workflow instrumentation in this slice

Do not add event calls to any production workflow yet.

Specifically, do not add calls such as:

```javascript
AutoHomObservabilityEventWriter.emit(...)
```

inside:

```text
bridge.js
runtime.js
downloadTracker.js
sidepanel.js
content.js
pdfUploader.js
conversionAutomator.js
background-main.js
background-zoho.js
```

Those calls belong to later slices.

This slice creates the helper only.

---

## 16. No manifest changes in this slice

Do not modify:

```text
manifest.json
```

This slice should not wire the helper into the service worker or content scripts yet.

If the helper needs to be loaded later, later slices will decide the safest loading strategy based on current extension architecture.

---

## 17. Compatibility requirements

The helper should be compatible with:

- Chrome extension service worker context.
- Browser global namespace style.
- No bundler.
- No external dependencies.
- Manifest V3 constraints.
- Python local API running on `localhost:7790`.

The helper must tolerate:

- Python backend offline.
- Python endpoint missing.
- Network errors.
- CORS or fetch failures.
- Invalid event objects.
- Missing helper namespaces.
- JSON serialization failures.
- Service worker restarts losing the in-memory buffer.

All failures must be safe.

---

## 18. Optional debug mode

Optional debug configuration is allowed:

```javascript
configure({ debug: true })
```

If implemented:

- Debug must be false by default.
- Debug output must be compact.
- Debug must not print full events with sensitive data.
- Debug must not spam console output.

Do not use debug mode as primary observability.

---

## 19. Required acceptance criteria

This slice is complete when:

- `autohom-extension/observability/eventWriter.js` exists.
- The writer exposes a small public API.
- The writer can build and send a single event.
- The writer can accept a prebuilt event.
- The writer can accept multiple events.
- The writer sends events to `POST /api/observability/events` using the batch payload shape.
- The writer sanitizes events before sending.
- The writer buffers events when sending fails.
- The writer enforces a maximum buffer size.
- The writer drops oldest buffered events when capacity is exceeded.
- The writer tracks dropped event count.
- The writer supports explicit `flush()`.
- The writer returns compact result objects.
- Network failures do not throw uncaught errors.
- Invalid event input does not throw uncaught errors.
- No production workflow files are modified.
- No manifest changes are made.
- No Python files are modified.
- No OpenTelemetry, dashboard, screenshots, DOM snapshots, or external logging services are added.
- No heavy dependencies are added.

---

## 20. Manual test plan

Manual testing may be performed in a browser-like environment or by temporarily loading the helper in a controlled console context.

Do not permanently wire the helper into production extension files for this test.

### 20.1 Backend available test

Start the Python backend with the Slice 03 endpoint available.

Load or evaluate the helper files in this order in a controlled context:

```text
autohom-extension/observability/ids.js
autohom-extension/observability/sanitize.js
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/eventWriter.js
```

Then run:

```javascript
await globalThis.AutoHomObservabilityEventWriter.emit({
  component: "extension.manual",
  event: "extension.writer.manual_test",
  severity: "info",
  trace_id: "trace_manual_extension_1",
  job_id: "job_manual_extension_1",
  message: "Manual extension writer test",
  data: {
    password: "should_not_be_visible",
    largeText: "x".repeat(5000)
  }
});
```

Expected result:

- Function returns a compact result.
- No uncaught exception.
- Python endpoint receives/stores the event.
- Sensitive value is redacted.
- Large string is truncated.

### 20.2 Backend unavailable test

Stop the Python backend or configure an invalid endpoint:

```javascript
globalThis.AutoHomObservabilityEventWriter.configure({
  endpointUrl: "http://localhost:1/api/observability/events"
});

await globalThis.AutoHomObservabilityEventWriter.emit({
  component: "extension.manual",
  event: "extension.writer.backend_unavailable",
  severity: "warning",
  message: "Backend unavailable test"
});

globalThis.AutoHomObservabilityEventWriter.getBufferStats();
```

Expected result:

- No uncaught exception.
- Event is buffered or dropped safely.
- Buffer stats show the event or dropped count.

### 20.3 Buffer limit test

Configure a small buffer:

```javascript
globalThis.AutoHomObservabilityEventWriter.configure({
  endpointUrl: "http://localhost:1/api/observability/events",
  maxBufferEvents: 2
});

for (let i = 0; i < 5; i++) {
  await globalThis.AutoHomObservabilityEventWriter.emit({
    component: "extension.manual",
    event: "extension.writer.buffer_test",
    message: `buffer test ${i}`
  });
}

globalThis.AutoHomObservabilityEventWriter.getBufferStats();
```

Expected result:

- Buffer size does not exceed 2.
- Dropped count is greater than 0.
- No uncaught exception.

---

## 21. Automated test plan

If compatible with the existing project test setup, add:

```text
tests/observability/test_extension_event_writer.js
```

Recommended tests:

- Writer API exists.
- `emit()` builds event and calls fetch.
- `emitEvent()` accepts prebuilt event.
- `emitMany()` handles arrays.
- Successful fetch returns `ok: true`.
- Failed fetch buffers event.
- Buffer limit drops oldest event.
- `flush()` sends buffered events.
- Sanitization redacts sensitive keys.
- Long strings are truncated.
- Invalid event input does not throw.
- Missing `fetch` or failed `fetch` is handled safely.

Do not add new test dependencies.

If tests cannot be added cleanly, the completion report must say why.

---

## 22. Out of scope

Do not implement:

- Event calls inside `bridge.js`.
- Event calls inside `runtime.js`.
- Event calls inside `downloadTracker.js`.
- Event calls inside `content.js`.
- Event calls inside `sidepanel.js`.
- Event calls inside `background-main.js`.
- Event calls inside `background-zoho.js`.
- Manifest wiring.
- WebSocket instrumentation.
- Conversion instrumentation.
- Runtime queue instrumentation.
- Download tracker instrumentation.
- Selector failure instrumentation.
- Tab lifecycle instrumentation.
- Python endpoint changes.
- Timeline endpoint.
- Diagnostics endpoint changes.
- Dashboard.
- Metrics.
- OpenTelemetry.
- External log aggregation.
- Persistent storage.
- `chrome.storage` buffering.
- IndexedDB.
- Screenshots.
- DOM snapshots.
- Full diagnostic package export.
- State machine validation.
- Generic logging across the codebase.

---

## 23. Rollback notes

Rollback should be small.

Delete:

```text
autohom-extension/observability/eventWriter.js
```

Revert any compatibility-only changes made to:

```text
autohom-extension/observability/eventEnvelope.js
autohom-extension/observability/sanitize.js
autohom-extension/observability/ids.js
```

Delete optional tests if created:

```text
tests/observability/test_extension_event_writer.js
```

Because this slice must not wire the helper into runtime files, rollback should not affect existing automation behavior.

---

## 24. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 04 completion report

### Implemented

### Changed files

### Tests run

### Tests not run and why

### Manual extension writer checks

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
05_job_timeline_endpoint.md
```

The agent must stop after this report.

---

## 25. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/04_extension_event_writer.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/implementation_slices/03_observability_ingestion_endpoint.md
- docs/observability/implementation_slices/04_extension_event_writer.md
- docs/observability/final_pre_implementation_review.md

Your task is to create only the Chrome extension-side best-effort observability event writer.

You may create or modify only the files listed in the “Allowed files” section of Slice 04.

Do not modify any forbidden file.

Do not modify manifest.json.

Do not modify Python files.

Do not instrument bridge.js, runtime.js, downloadTracker.js, sidepanel.js, content.js, background-main.js, or background-zoho.js.

Do not add event calls to production workflows yet.

Do not add timeline endpoints.

Do not add WebSocket instrumentation.

Do not modify conversion logic.

Do not add OpenTelemetry, dashboards, screenshots, DOM snapshots, diagnostic ZIP exports, global state machines, persistent storage, databases, cloud services, or heavy dependencies.

The writer must be local, bounded, sanitized, best-effort, safe for malformed payloads, and safe when Python is unavailable.

When done, provide the required Slice 04 completion report and stop.
```
