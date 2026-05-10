/**
 * ilovepdf-background/router.js
 * Message router for iLovePDF runtime messages.
 */

function persistSelectorAlert(alert) {
  chrome.storage.local.get("ilovepdf_selector_alerts", (result) => {
    const existing = Array.isArray(result.ilovepdf_selector_alerts)
      ? result.ilovepdf_selector_alerts
      : [];
    const next = existing.filter((entry) => entry.selectorName !== alert.selectorName);
    next.unshift(alert);
    chrome.storage.local.set({ ilovepdf_selector_alerts: next.slice(0, 20) });
  });
}

(function registerILovePDFRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case "ILOVEPDF_CONVERT": {
        ILovePDFRuntime.queueConversion({
          jobId: message.jobId || "",
          pdfId: message.pdfId,
          filename: message.filename,
        });
        sendResponse({ ok: true, queued: true });
        return false;
      }

      case "ILOVEPDF_CONVERT_ALL": {
        const pdfList = Array.isArray(message.pdfs) ? message.pdfs : [];
        ILovePDFRuntime.queueAll(pdfList);
        sendResponse({ ok: true, queued: pdfList.length });
        return false;
      }

      case "ILOVEPDF_STATUS": {
        sendResponse({
          ok: true,
          runtime: ILovePDFRuntime.getState(),
          bridgeConnected: ILovePDFBridge.isConnected(),
        });
        return false;
      }

      case "ILOVEPDF_CONVERSION_RESULT": {
        const { jobId, pdfId, status, message: msg } = message;

        if (status === "completed") {
          return false;
        }

        if (status === "error") {
          ILovePDFDownloadTracker.failIfTracking(pdfId, msg || "Content script reported a phase 2 error.");
        }

        ILovePDFBridge.sendStatus({
          jobId: jobId || "",
          pdfId,
          status,
          message: msg,
        });
        chrome.runtime.sendMessage({
          type: "ILOVEPDF_PROGRESS",
          jobId: jobId || "",
          pdfId,
          status,
          message: msg,
        }).catch(() => {});
        return false;
      }

      case "ILOVEPDF_ENSURE_BRIDGE": {
        if (!ILovePDFBridge.isConnected()) {
          ILovePDFBridge.connect();
        }
        sendResponse({ ok: true, connected: ILovePDFBridge.isConnected() });
        return false;
      }

      case "ILOVEPDF_SELECTOR_FALLBACK": {
        const alert = {
          level: "warning",
          selectorName: message.selectorName,
          configuredSelector: message.configuredSelector,
          usedStrategy: message.usedStrategy,
          url: message.url,
          timestamp: Date.now(),
        };

        chrome.runtime.sendMessage({
          type: "ILOVEPDF_SELECTOR_ALERT",
          ...alert,
        }).catch(() => {});

        persistSelectorAlert(alert);
        sendResponse({ ok: true });
        return false;
      }

      case "ILOVEPDF_SELECTOR_BROKEN": {
        const alert = {
          level: "error",
          selectorName: message.selectorName,
          configuredSelector: message.configuredSelector,
          usedStrategy: null,
          url: message.url,
          timestamp: Date.now(),
        };

        chrome.runtime.sendMessage({
          type: "ILOVEPDF_SELECTOR_ALERT",
          ...alert,
        }).catch(() => {});

        persistSelectorAlert(alert);
        sendResponse({ ok: true });
        return false;
      }

      default:
        return false;
    }
  });
})();
