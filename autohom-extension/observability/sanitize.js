(function initAutoHomObservabilitySanitize(globalScope) {
  const MAX_STRING_LENGTH = 2000;
  const MAX_ARRAY_ITEMS = 50;
  const MAX_OBJECT_KEYS = 100;
  const MAX_DEPTH = 4;
  const TRUNCATED_SUFFIX = "...[truncated]";
  const REDACTED_VALUE = "[redacted]";
  const SENSITIVE_KEY_FRAGMENTS = [
    "token",
    "secret",
    "password",
    "authorization",
    "cookie",
    "set-cookie",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
  ];

  function truncateString(value) {
    const text = String(value);
    if (text.length <= MAX_STRING_LENGTH) {
      return { value: text, truncated: false };
    }
    const limit = Math.max(0, MAX_STRING_LENGTH - TRUNCATED_SUFFIX.length);
    return {
      value: `${text.slice(0, limit)}${TRUNCATED_SUFFIX}`,
      truncated: true,
    };
  }

  function isSensitiveKey(key) {
    const lowered = String(key || "").trim().toLowerCase();
    return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment));
  }

  function summarizeBinary(value) {
    const size = typeof value?.size === "number"
      ? value.size
      : typeof value?.byteLength === "number"
        ? value.byteLength
        : "unknown";
    return `[binary:${value?.constructor?.name || typeof value} size=${size}]`;
  }

  function summarizeObject(value) {
    try {
      return truncateString(String(value)).value;
    } catch (_) {
      return `[object:${value?.constructor?.name || typeof value}]`;
    }
  }

  function sanitizeValue(value, options = {}) {
    const sanitized = sanitizeInternal(value, 0, options.maxDepth ?? MAX_DEPTH);
    return sanitized.value;
  }

  function sanitizeInternal(value, depth, maxDepth) {
    try {
      if (value == null || typeof value === "boolean" || typeof value === "number") {
        return { value, truncated: false };
      }

      if (typeof value === "string") {
        return truncateString(value);
      }

      if (typeof value === "bigint") {
        return { value: String(value), truncated: true };
      }

      if (typeof value === "function") {
        return { value: `[function:${value.name || "anonymous"}]`, truncated: true };
      }

      if (value instanceof Error) {
        return truncateString(`${value.name || "Error"}: ${value.message || ""}`);
      }

      if (
        (typeof Node !== "undefined" && value instanceof Node) ||
        (typeof Element !== "undefined" && value instanceof Element)
      ) {
        return { value: "[dom-node]", truncated: true };
      }

      if (
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value) ||
        (typeof Blob !== "undefined" && value instanceof Blob) ||
        (typeof File !== "undefined" && value instanceof File)
      ) {
        return { value: summarizeBinary(value), truncated: true };
      }

      if (depth >= maxDepth) {
        return {
          value: `[truncated:${value?.constructor?.name || typeof value}:depth]`,
          truncated: true,
        };
      }

      if (Array.isArray(value)) {
        let truncated = value.length > MAX_ARRAY_ITEMS;
        const result = [];
        for (const item of value.slice(0, MAX_ARRAY_ITEMS)) {
          const sanitizedItem = sanitizeInternal(item, depth + 1, maxDepth);
          result.push(sanitizedItem.value);
          truncated = truncated || sanitizedItem.truncated;
        }
        if (value.length > MAX_ARRAY_ITEMS) {
          result.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`);
        }
        return { value: result, truncated };
      }

      if (typeof value === "object") {
        const keys = Object.keys(value);
        let truncated = keys.length > MAX_OBJECT_KEYS;
        const result = {};
        for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
          if (isSensitiveKey(key)) {
            result[key] = REDACTED_VALUE;
            truncated = true;
            continue;
          }
          const sanitizedItem = sanitizeInternal(value[key], depth + 1, maxDepth);
          result[key] = sanitizedItem.value;
          truncated = truncated || sanitizedItem.truncated;
        }
        if (keys.length > MAX_OBJECT_KEYS) {
          result._truncated_keys = keys.length - MAX_OBJECT_KEYS;
        }
        return { value: result, truncated };
      }

      return { value: summarizeObject(value), truncated: true };
    } catch (error) {
      return {
        value: `[sanitize_error:${error?.name || "Error"}]`,
        truncated: true,
      };
    }
  }

  function sanitizeEvent(event) {
    const baseEvent = event && typeof event === "object" ? { ...event } : {
      component: "unknown",
      event: "unknown.event",
    };
    const sanitized = sanitizeInternal(baseEvent, 0, MAX_DEPTH);
    const result = sanitized.value && typeof sanitized.value === "object"
      ? sanitized.value
      : { data: sanitized.value };
    result.truncated = Boolean(sanitized.truncated || result.truncated);
    return result;
  }

  globalScope.AutoHomObservabilitySanitize = {
    MAX_STRING_LENGTH,
    MAX_ARRAY_ITEMS,
    MAX_OBJECT_KEYS,
    MAX_DEPTH,
    sanitizeValue,
    sanitizeEvent,
  };
})(globalThis);
