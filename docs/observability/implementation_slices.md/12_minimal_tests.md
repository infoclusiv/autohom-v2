# Slice 12 — Minimal Observability Tests

Repository: `infoclusiv/autohom-v2`  
Area: AI-ready observability implementation  
Slice type: minimal verification and regression test layer  
Depends on: `docs/observability/implementation_slices/11_tab_lifecycle_events.md`  
Application behavior changes: **none**  
Runtime instrumentation: **none in this slice**  
Status: `ready_for_implementation`

---

## 1. Goal

Add minimal automated and/or scriptable tests for the observability foundation implemented in Slices 01–11.

This slice should verify that the observability layer is:

- Safe.
- Bounded.
- Compact.
- Queryable.
- Correlatable.
- Best-effort.
- Backward compatible.
- Useful for AI-assisted debugging.

This slice must not add new runtime features.

This slice must not emit new production events.

This slice must not change conversion behavior, WebSocket behavior, Chrome extension behavior, tab behavior, state persistence, or UI behavior.

---

## 2. Scope

Add focused tests for the observability components already implemented.

Primary test areas:

1. Python event schema.
2. Python ID helpers.
3. Python sanitizer.
4. Python event store.
5. Python event writer.
6. Python ingestion endpoint.
7. Python timeline endpoint.
8. Python trace summary.
9. Chrome extension event envelope helpers.
10. Chrome extension sanitizer.
11. Chrome extension event writer.
12. Optional JavaScript unit tests for runtime/content/download/tab event helper behavior, if the repository already has a compatible JavaScript test setup.

The goal is not to build a full browser automation harness.

The goal is to prevent regressions in the observability foundation.

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
- `docs/observability/implementation_slices/08_runtime_and_content_events.md`
- `docs/observability/implementation_slices/09_download_tracker_and_selector_events.md`
- `docs/observability/implementation_slices/10_trace_summary.md`
- `docs/observability/implementation_slices/11_tab_lifecycle_events.md`
- `docs/observability/implementation_slices/12_minimal_tests.md`
- `docs/observability/final_pre_implementation_review.md`

Use `00_execution_contract.md` as the execution guardrail.

Use the previous slice files as test specifications.

Use `final_pre_implementation_review.md` as the scope reducer.

Do not implement the full roadmap.

---

## 4. Allowed files

The coding agent may create or modify test files only.

Recommended Python tests:

```text
tests/observability/test_ids.py
tests/observability/test_schema.py
tests/observability/test_sanitize.py
tests/observability/test_event_store.py
tests/observability/test_event_writer.py
tests/observability/test_ingestion_endpoint.py
tests/observability/test_timeline.py
tests/observability/test_trace_summary.py
```

Recommended JavaScript tests only if a compatible test runner already exists:

```text
tests/observability/test_extension_event_envelope.js
tests/observability/test_extension_sanitize.js
tests/observability/test_extension_event_writer.js
```

Optional integration-style smoke test file, only if it matches existing conventions:

```text
tests/observability/test_observability_smoke.py
```

The agent may create a small test utility file only if it keeps tests simple:

```text
tests/observability/conftest.py
tests/observability/helpers.py
```

Use whichever paths match the repository's existing test conventions.

---

## 5. Conditional allowed files

The coding agent may modify these files only if absolutely necessary to make existing observability modules importable in tests without changing runtime behavior:

```text
app-python-zoho/observability/__init__.py
```

This is conditional and should usually not be necessary.

Before modifying it, the agent must verify that tests cannot import current public APIs as-is.

If modified, the completion report must explain:

- Why it was necessary.
- What export was added.
- Why runtime behavior did not change.

Do not modify source files to make tests pass unless the change is clearly a bug fix in observability-only code.

---

## 6. Forbidden files

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

Do not modify Chrome extension runtime files in this slice:

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

Do not modify:

```text
manifest.json
package.json
requirements.txt
pyproject.toml
README.md
```

Do not add new test dependencies unless the repository already has a standard way to do so and the user explicitly approves.

If the agent believes a forbidden file must be modified, it must stop and explain why.

---

## 7. Testing principles

Tests should verify behavior, not implementation details.

Tests must be:

- Small.
- Fast.
- Local.
- Deterministic where possible.
- Independent of cloud services.
- Independent of real iLovePDF access.
- Independent of real Chrome tabs unless the repository already has a browser test harness.
- Safe for Windows development.
- Safe for CI if CI exists.

Tests must not:

- Launch real browser automation unless an existing test harness already does this.
- Upload real PDFs to external services.
- Depend on iLovePDF availability.
- Depend on Zoho availability.
- Require cloud credentials.
- Require OpenTelemetry.
- Require dashboards.
- Require external databases.
- Require new npm or Python packages.
- Modify real `state.json`.
- Modify user data.

Use fake events and isolated stores.

---

## 8. Python test requirements

### 8.1 ID helper tests

Test file:

```text
tests/observability/test_ids.py
```

Test cases:

- `new_trace_id()` returns a string.
- Trace ID starts with `trace_`.
- `new_request_id()` returns a string.
- Request ID starts with `req_`.
- `new_connection_id()` returns a string.
- Connection ID starts with `conn_`.
- `new_runtime_instance_id()` returns a string.
- Runtime instance ID starts with `rt_`.
- Generated IDs do not contain spaces.
- Two generated IDs are not identical.

Do not assert exact random suffix values.

---

### 8.2 Schema tests

Test file:

```text
tests/observability/test_schema.py
```

Test cases:

- `build_event()` returns a dictionary.
- Required envelope fields exist:
  - `schema_version`
  - `ts`
  - `monotonic_ms`
  - `severity`
  - `component`
  - `event`
- Missing optional fields do not crash.
- Missing component falls back safely.
- Missing event name falls back safely.
- Invalid severity is normalized safely.
- `trace_id`, `job_id`, `pdf_id`, and `request_id` are preserved when provided.
- `expected`, `actual`, and `data` are sanitized.
- Long message is truncated.
- Sensitive fields are redacted.
- Binary-like values are summarized.

---

### 8.3 Sanitizer tests

Test file:

```text
tests/observability/test_sanitize.py
```

Test cases:

- Long strings are truncated.
- Truncated output includes a marker or event field indicating truncation.
- Deep nested objects are bounded.
- Large arrays are bounded.
- Large dictionaries are bounded.
- Bytes/binary values are not stored raw.
- Exceptions become safe compact summaries.
- Sensitive key names are redacted:
  - `token`
  - `password`
  - `authorization`
  - `cookie`
  - `api_key`
  - `access_token`
  - `refresh_token`
- Sanitizer never raises for malformed/unknown objects.
- Sanitized event remains JSON-serializable.

---

### 8.4 Event store tests

Test file:

```text
tests/observability/test_event_store.py
```

Test cases:

- Store can append one event.
- Store can append multiple events.
- Store can query by `job_id`.
- Store can query by `trace_id`.
- Store can query by `pdf_id`.
- Store can query by `request_id`.
- Store can query by `component`.
- Store can query by `severity`.
- Store can query by event name.
- Missing fields do not crash query.
- Malformed event does not crash append.
- Query limit is respected.
- Max event capacity is enforced.
- Oldest events are dropped first when capacity is exceeded.
- Dropped event count is tracked.
- Query response includes metadata.
- Recent events are returned in stable order.

Use a fresh in-memory store per test.

Do not rely on global/default store state across tests.

---

### 8.5 Event writer tests

Test file:

```text
tests/observability/test_event_writer.py
```

Test cases:

- Writer emits event into store.
- Writer returns compact success result.
- Writer preserves identifiers.
- Writer sanitizes long data.
- Writer redacts sensitive fields.
- Writer handles invalid severity safely.
- Writer does not raise when store append fails.
- Writer returns `ok: false` or equivalent on internal failure.
- Writer can emit a prebuilt event if such API exists.
- Writer can emit multiple events if such API exists.

Use fake/failing store objects for failure tests.

---

### 8.6 Ingestion endpoint tests

Test file:

```text
tests/observability/test_ingestion_endpoint.py
```

Only add endpoint tests if the project already has a clean way to test aiohttp routes or local API handlers.

Recommended test cases:

- Single event JSON payload is accepted.
- Batch event payload is accepted.
- Unsupported shape returns safe error.
- Invalid JSON returns safe error.
- Empty payload returns safe error.
- Batch over limit is handled safely.
- Sensitive fields are sanitized before storage.
- Large fields are truncated before storage.
- Response includes stored/dropped/rejected counts.
- Endpoint does not expose stack traces.
- Store failure returns safe response.

If route testing is hard due to current app structure, implement ingestion helper tests instead, if such helper exists.

Do not start a real long-running server in unit tests unless existing tests already do that.

---

### 8.7 Timeline tests

Test file:

```text
tests/observability/test_timeline.py
```

Test cases:

- Timeline query by `job_id` returns events.
- Unknown `job_id` returns empty timeline.
- Timeline supports `limit`.
- Large limit is clamped.
- Invalid limit falls back safely.
- Timeline filters by `trace_id`.
- Timeline filters by `component`.
- Timeline filters by `severity`.
- Timeline filters by event name.
- Timeline events are compact.
- Timeline output includes completeness metadata.
- Malformed stored events do not crash timeline builder.
- Sensitive/large fields remain sanitized.

Use a fresh store per test.

---

### 8.8 Trace summary tests

Test file:

```text
tests/observability/test_trace_summary.py
```

Test cases:

- Empty timeline returns `status: unknown`.
- Completed timeline returns `status: completed`.
- Failed timeline returns `status: failed`.
- Download timeout returns `status: timeout`.
- Selector failure returns blocked/failed diagnostic status.
- Content readiness failure identifies `extension.content`.
- Missing bridge receive after command sent lists `bridge.command.received`.
- Download completed without final status lists `conversion.status.received`.
- Tab closed before terminal status is treated as a high-value failure signal if Slice 11 integrated it.
- Truncated evidence lowers confidence.
- Malformed events do not crash.
- Missing fields do not crash.
- Summary does not mutate input timeline events.

---

## 9. JavaScript test requirements

Only implement JavaScript tests if the repository already has a compatible test runner.

Do not add a new JS test framework in this slice.

### 9.1 Event envelope tests

Test file:

```text
tests/observability/test_extension_event_envelope.js
```

Recommended test cases:

- `buildEvent()` returns an object.
- Required fields exist.
- Invalid severity is normalized.
- Missing component/event falls back safely.
- IDs are preserved.
- Long strings are sanitized.
- Sensitive fields are redacted.
- Binary-like values are summarized.

---

### 9.2 Extension sanitizer tests

Test file:

```text
tests/observability/test_extension_sanitize.js
```

Recommended test cases:

- Long strings are truncated.
- Large arrays are limited.
- Deep objects are limited.
- Sensitive keys are redacted.
- Errors become compact summaries.
- DOM-like objects are not serialized raw.
- Blob/File/ArrayBuffer-like values are summarized.
- Sanitizer never throws for unexpected inputs.

---

### 9.3 Extension event writer tests

Test file:

```text
tests/observability/test_extension_event_writer.js
```

Recommended test cases:

- Public API exists.
- `emit()` builds and sends an event.
- `emitEvent()` accepts prebuilt event.
- `emitMany()` handles arrays.
- Successful fake `fetch` returns success.
- Failed fake `fetch` buffers event.
- Buffer size is bounded.
- Oldest buffered events are dropped first.
- Dropped count is tracked.
- `flush()` sends buffered events.
- Missing `fetch` fails safely.
- Invalid event input does not throw.
- Sensitive data is not sent raw.

Use mocked/fake `fetch`.

Do not call real Python backend from JS unit tests unless existing test structure already supports integration tests.

---

## 10. Smoke test requirements

Optional smoke test file:

```text
tests/observability/test_observability_smoke.py
```

Recommended purpose:

Verify that the core Python observability pipeline works end-to-end in memory:

```text
build_event
  -> event_writer.emit
  -> event_store.query
  -> build_job_timeline
  -> trace_summary
```

Recommended test case:

- Create a fresh store.
- Emit events for a completed conversion.
- Query timeline by `job_id`.
- Verify timeline count.
- Verify trace summary says completed.
- Verify no sensitive values are present.

Another useful smoke test:

- Emit a `download.timeout` timeline.
- Verify summary identifies timeout and `extension.downloadTracker`.

This smoke test should not start a browser.

This smoke test should not start iLovePDF.

This smoke test should not use real files.

---

## 11. Import strategy

Because the Python app folder is:

```text
app-python-zoho/
```

tests may need to add it to `sys.path` if the repository does not already do this.

Acceptable test-only pattern:

```python
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "app-python-zoho"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))
```

Prefer existing repository test conventions if available.

Do not change runtime package structure just for tests.

---

## 12. Test data safety

Test fixtures must not include:

- Real PDFs.
- Real Excel files.
- Real tokens.
- Real cookies.
- Real user paths.
- Real Zoho data.
- Real customer data.
- Full HTML captures.
- Large binary blobs.

Use fake compact IDs:

```text
job_test_1
pdf_test_1
trace_test_1
req_test_1
```

Use fake secrets only to verify redaction:

```text
password: "secret"
authorization: "Bearer fake"
```

Expected sanitized output should contain:

```text
[redacted]
```

or the redaction marker actually implemented.

---

## 13. No new dependencies

Do not add new dependencies in this slice.

Do not modify:

```text
requirements.txt
package.json
pyproject.toml
```

Use existing test frameworks only.

If no test framework exists, create simple scriptable checks only if they fit existing conventions, or provide manual verification instructions in the completion report.

Do not install packages.

Do not add browser automation test tools.

Do not add Playwright, Selenium, Puppeteer, pytest-aiohttp, Jest, Vitest, or Mocha unless already present and used by the repository.

---

## 14. Required acceptance criteria

This slice is complete when:

- Minimal Python observability tests are added or the agent explains why tests cannot be added.
- Tests cover IDs.
- Tests cover schema building.
- Tests cover sanitization.
- Tests cover event store append/query/limits.
- Tests cover event writer best-effort behavior.
- Tests cover ingestion helper/endpoint if feasible.
- Tests cover timeline builder.
- Tests cover trace summary.
- JavaScript tests are added only if existing test setup supports them.
- No runtime application behavior is changed.
- No Chrome extension runtime behavior is changed.
- No production event emission is added.
- No new dependencies are added.
- No external services are required.
- No real browser automation is required.
- No real PDFs or Excel files are required.
- No secrets or user data are included.
- Tests can be run locally or limitations are clearly documented.

---

## 15. Manual verification plan

If automated tests are implemented, the coding agent must run the relevant test command.

Possible commands, depending on the repository:

```bash
pytest tests/observability
```

or on Windows PowerShell:

```powershell
python -m pytest tests/observability
```

If the repo has a different test command, use the existing command.

If JavaScript tests are implemented and an existing JS test runner exists, use the existing command, such as:

```bash
npm test -- tests/observability
```

or whatever the repository already uses.

If no automated test runner exists, run targeted Python import/manual snippets and report them.

The completion report must include:

- Exact commands run.
- Pass/fail result.
- Any tests skipped and why.
- Any manual verification performed.

---

## 16. Out of scope

Do not implement:

- New observability features.
- New event emitters.
- New runtime instrumentation.
- New endpoint behavior.
- New dashboard.
- New metrics.
- New OpenTelemetry setup.
- New browser automation harness.
- Screenshots.
- DOM snapshots.
- Full diagnostic ZIP export.
- State machine validation.
- State migration.
- Job status changes.
- Side panel UI.
- Real iLovePDF integration tests.
- Real Zoho integration tests.
- New dependencies.
- New package manager scripts unless already required by existing conventions.

---

## 17. Rollback notes

Rollback should be limited to tests.

Delete any test files added under:

```text
tests/observability/
```

If a small export-only change was made in:

```text
app-python-zoho/observability/__init__.py
```

revert that change.

Because this slice should not modify runtime files, rollback should not affect application behavior.

---

## 18. Required completion report

At the end of implementation, the coding agent must report:

```markdown
## Slice 12 completion report

### Implemented

### Changed files

### Conditional files modified and why

### Tests added

### Tests run

### Test results

### Tests not run and why

### Manual verification

### Behavior preserved

### Out of scope items intentionally not implemented

### Risks or follow-up notes

### Next recommended slice
```

The next recommended slice should be:

```text
13_implementation_ledger.md
```

or, if the slice list ends at 12:

```text
Finalize initial observability slice plan and start implementation/review cycle.
```

The agent must stop after this report.

---

## 19. Implementation prompt for coding agent

Use this prompt with the coding agent that can edit the repository:

```text
You have access to the repository `infoclusiv/autohom-v2`.

Implement only:

docs/observability/implementation_slices/12_minimal_tests.md

You must read these first:

- docs/observability/implementation_slices/00_execution_contract.md
- docs/observability/implementation_slices/01_schema_and_ids.md
- docs/observability/implementation_slices/02_python_event_store.md
- docs/observability/implementation_slices/03_observability_ingestion_endpoint.md
- docs/observability/implementation_slices/04_extension_event_writer.md
- docs/observability/implementation_slices/05_job_timeline_endpoint.md
- docs/observability/implementation_slices/06_convert_pdf_python_events.md
- docs/observability/implementation_slices/07_websocket_ack_status_events.md
- docs/observability/implementation_slices/08_runtime_and_content_events.md
- docs/observability/implementation_slices/09_download_tracker_and_selector_events.md
- docs/observability/implementation_slices/10_trace_summary.md
- docs/observability/implementation_slices/11_tab_lifecycle_events.md
- docs/observability/implementation_slices/12_minimal_tests.md
- docs/observability/final_pre_implementation_review.md

Your task is to add minimal tests for the observability foundation only.

Focus on:
- IDs
- schema
- sanitization
- event store
- event writer
- ingestion endpoint or ingestion helper if feasible
- timeline builder
- trace summary
- extension event envelope/sanitizer/writer only if existing JS test setup supports it

You may create or modify only the files listed in the “Allowed files” section of Slice 12.

Do not modify any forbidden file.

Do not modify runtime application files.

Do not modify Chrome extension runtime files.

Do not add new observability features.

Do not add new event emitters.

Do not add new endpoints.

Do not add browser automation harnesses.

Do not add new dependencies.

Do not modify requirements.txt, package.json, pyproject.toml, manifest.json, or README.md.

Do not require real iLovePDF, Zoho, browser tabs, PDFs, Excel files, cloud services, OpenTelemetry, dashboards, screenshots, or DOM snapshots.

Use existing test frameworks only.

If tests cannot be added cleanly, explain why and provide manual verification steps.

When done, run the relevant tests if possible, provide the required Slice 12 completion report, and stop.
```
