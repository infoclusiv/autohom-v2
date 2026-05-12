(function initAutoHomObservabilityEventEnvelope(globalScope) {
  const sanitizeApi = globalScope.AutoHomObservabilitySanitize;
  const SCHEMA_VERSION = "1.0";
  const ALLOWED_SEVERITIES = new Set(["debug", "info", "warning", "error", "critical"]);

  function normalizeSeverity(severity) {
    const candidate = String(severity || "info").trim().toLowerCase();
    return ALLOWED_SEVERITIES.has(candidate) ? candidate : "info";
  }

  function sanitizeText(value) {
    if (value == null) {
      return null;
    }
    if (sanitizeApi && typeof sanitizeApi.sanitizeValue === "function") {
      return sanitizeApi.sanitizeValue(String(value));
    }
    return String(value);
  }

  function monotonicNow() {
    if (globalScope.performance && typeof globalScope.performance.now === "function") {
      return Math.round(globalScope.performance.now());
    }
    return 0;
  }

  function buildEvent({
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
  } = {}) {
    const payload = {
      schema_version: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      monotonic_ms: monotonicNow(),
      severity: normalizeSeverity(severity),
      component: String(component || "unknown"),
      event: String(event || "unknown.event"),
      phase: sanitizeText(phase),
      trace_id: sanitizeText(trace_id),
      job_id: sanitizeText(job_id),
      pdf_id: sanitizeText(pdf_id),
      request_id: sanitizeText(request_id),
      reply_to: sanitizeText(reply_to),
      agent_id: sanitizeText(agent_id),
      agent_type: sanitizeText(agent_type),
      connection_id: sanitizeText(connection_id),
      runtime_instance_id: sanitizeText(runtime_instance_id),
      tab_id: tab_id == null ? null : sanitizeApi?.sanitizeValue(tab_id) ?? tab_id,
      download_id: download_id == null ? null : sanitizeApi?.sanitizeValue(download_id) ?? download_id,
      message: sanitizeText(message),
      expected: sanitizeApi?.sanitizeValue(expected || {}) ?? (expected || {}),
      actual: sanitizeApi?.sanitizeValue(actual || {}) ?? (actual || {}),
      data: sanitizeApi?.sanitizeValue(data || {}) ?? (data || {}),
      duration_ms: duration_ms == null ? null : sanitizeApi?.sanitizeValue(duration_ms) ?? duration_ms,
    };

    if (sanitizeApi && typeof sanitizeApi.sanitizeEvent === "function") {
      return sanitizeApi.sanitizeEvent(payload);
    }
    return payload;
  }

  globalScope.AutoHomObservabilityEventEnvelope = {
    SCHEMA_VERSION,
    buildEvent,
  };
})(globalThis);
