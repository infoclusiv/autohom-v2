(function initAutoHomObservabilityIds(globalScope) {
  const cryptoApi = globalScope.crypto || null;

  function normalizePrefix(prefix) {
    const safe = String(prefix || "id")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "");
    return safe || "id";
  }

  function randomHex(size) {
    const targetSize = Math.max(8, Number(size) || 32);

    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return cryptoApi.randomUUID().replace(/-/g, "");
    }

    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      const bytes = new Uint8Array(Math.ceil(targetSize / 2));
      cryptoApi.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    let output = "";
    while (output.length < targetSize) {
      output += Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, "0");
    }
    return output.slice(0, targetSize);
  }

  function newId(prefix) {
    return `${normalizePrefix(prefix)}_${randomHex(32)}`;
  }

  globalScope.AutoHomObservabilityIds = {
    newId,
    newTraceId() {
      return newId("trace");
    },
    newRequestId() {
      return newId("req");
    },
    newConnectionId() {
      return newId("conn");
    },
    newRuntimeInstanceId() {
      return newId("rt");
    },
  };
})(globalThis);
