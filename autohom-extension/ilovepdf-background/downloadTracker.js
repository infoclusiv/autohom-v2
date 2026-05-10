/**
 * ilovepdf-background/downloadTracker.js — Confirma la descarga real vía chrome.downloads.
 */

const ILovePDFDownloadTracker = (() => {
  let _active = null;

  chrome.downloads.onCreated.addListener((downloadItem) => {
    _hydrateAndTrack(downloadItem.id, downloadItem, "created");
  });

  chrome.downloads.onChanged.addListener((delta) => {
    _hydrateAndTrack(delta.id, null, "changed");
  });

  function waitForExpectedDownload(pdfDescriptor, options = {}) {
    if (!pdfDescriptor?.pdfId) {
      throw new Error("waitForExpectedDownload requires pdfDescriptor.pdfId");
    }

    if (_active && !_active.settled) {
      _rejectActive(new Error("Download tracker replaced before completion."), "replaced");
    }

    const timeoutMs = options.timeoutMs || CONFIG_ILOVEPDF.TIMING.DOWNLOAD_CONFIRM_TIMEOUT_MS || 120000;

    return new Promise((resolve, reject) => {
      const expectedStem = _normalizeStem(pdfDescriptor.filename || "");

      _active = {
        pdfId: pdfDescriptor.pdfId,
        filename: pdfDescriptor.filename || "",
        expectedStem,
        tabId: typeof options.tabId === "number" ? options.tabId : null,
        startedAt: Date.now(),
        matchedDownloadId: null,
        settled: false,
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          _rejectActive(
            new Error(`Timeout waiting for Chrome download completion after ${timeoutMs}ms`),
            "timeout"
          );
        }, timeoutMs),
      };

      ILovePDFUtils.log("info", "[DownloadTracker] wait.started", {
        pdfId: _active.pdfId,
        filename: _active.filename,
        tabId: _active.tabId,
        timeoutMs,
      });
    });
  }

  function cancelIfTracking(pdfId, reason = "Download tracking cancelled.") {
    if (!_active || _active.settled || _active.pdfId !== pdfId) {
      return false;
    }

    _rejectActive(new Error(reason), "cancelled");
    return true;
  }

  function failIfTracking(pdfId, message = "Download failed before Chrome confirmed completion.") {
    if (!_active || _active.settled || _active.pdfId !== pdfId) {
      return false;
    }

    _rejectActive(new Error(message), "content_error");
    return true;
  }

  function getState() {
    if (!_active || _active.settled) {
      return { active: false };
    }

    return {
      active: true,
      pdfId: _active.pdfId,
      filename: _active.filename,
      tabId: _active.tabId,
      matchedDownloadId: _active.matchedDownloadId,
      startedAt: _active.startedAt,
    };
  }

  async function _hydrateAndTrack(downloadId, knownItem, source) {
    const watch = _active;
    if (!watch || watch.settled) {
      return;
    }

    if (watch.matchedDownloadId !== null && downloadId !== watch.matchedDownloadId) {
      return;
    }

    const item = knownItem || await _loadDownload(downloadId);
    if (!item) {
      return;
    }

    const current = _active;
    if (!current || current.settled) {
      return;
    }

    if (current.matchedDownloadId === null) {
      if (!_matchesExpectedDownload(item, current)) {
        return;
      }

      current.matchedDownloadId = item.id;
      ILovePDFUtils.log("info", `[DownloadTracker] ${source}.matched`, {
        pdfId: current.pdfId,
        downloadId: item.id,
        filename: item.filename || "",
        url: item.finalUrl || item.url || "",
      });
    }

    if (item.state === "complete") {
      _resolveActive({
        pdfId: current.pdfId,
        downloadId: item.id,
        filename: item.filename || current.filename,
        finalUrl: item.finalUrl || item.url || "",
        source,
      }, "complete");
      return;
    }

    if (item.state === "interrupted") {
      _rejectActive(
        new Error(item.error || "Chrome reported an interrupted download."),
        "interrupted",
        {
          pdfId: current.pdfId,
          downloadId: item.id,
          filename: item.filename || current.filename,
          finalUrl: item.finalUrl || item.url || "",
          source,
        }
      );
    }
  }

  async function _loadDownload(downloadId) {
    try {
      const results = await chrome.downloads.search({ id: downloadId });
      return Array.isArray(results) ? results[0] || null : null;
    } catch (error) {
      ILovePDFUtils.log("warn", "[DownloadTracker] download.search_failed", {
        downloadId,
        error: error?.message || String(error),
      });
      return null;
    }
  }

  function _matchesExpectedDownload(downloadItem, watch) {
    if (!downloadItem) {
      return false;
    }

    const sameTab =
      watch.tabId !== null &&
      typeof downloadItem.tabId === "number" &&
      downloadItem.tabId !== -1 &&
      downloadItem.tabId === watch.tabId;

    if (watch.tabId !== null && typeof downloadItem.tabId === "number" && downloadItem.tabId !== -1) {
      if (downloadItem.tabId !== watch.tabId) {
        return false;
      }
    }

    if (!_isWithinMatchWindow(downloadItem, watch.startedAt)) {
      return false;
    }

    const host = _extractHost(downloadItem.finalUrl || downloadItem.url || "");
    const fromILovePDF = host.includes("ilovepdf.com");

    if (_looksLikeSpreadsheet(downloadItem)) {
      return fromILovePDF || sameTab;
    }

    if (fromILovePDF && sameTab) {
      return true;
    }

    const downloadStem = _normalizeStem(downloadItem.filename || downloadItem.finalUrl || downloadItem.url || "");
    if (!downloadStem || !watch.expectedStem) {
      return false;
    }

    return (
      downloadStem === watch.expectedStem ||
      downloadStem.startsWith(watch.expectedStem) ||
      watch.expectedStem.startsWith(downloadStem) ||
      downloadStem.includes(watch.expectedStem) ||
      watch.expectedStem.includes(downloadStem)
    );
  }

  function _looksLikeSpreadsheet(downloadItem) {
    const haystack = [
      downloadItem.filename || "",
      downloadItem.finalUrl || "",
      downloadItem.url || "",
      downloadItem.mime || "",
    ].join(" ").toLowerCase();

    return /\.(xlsx?|csv)(?:$|\b)|spreadsheetml|ms-excel|csv|excel/.test(haystack);
  }

  function _isWithinMatchWindow(downloadItem, startedAt) {
    const windowMs = CONFIG_ILOVEPDF.TIMING.DOWNLOAD_MATCH_WINDOW_MS || 30000;
    const startTime = downloadItem.startTime ? Date.parse(downloadItem.startTime) : NaN;

    if (!Number.isFinite(startTime)) {
      return true;
    }

    return Math.abs(startTime - startedAt) <= windowMs;
  }

  function _extractHost(rawUrl) {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function _normalizeStem(rawName) {
    const basename = String(rawName || "")
      .split(/[\\/]/)
      .pop()
      .replace(/\.crdownload$/i, "")
      .replace(/\.(xlsx?|csv|pdf)$/i, "")
      .toLowerCase();

    return basename.replace(/[^a-z0-9]+/g, "");
  }

  function _resolveActive(result, reason) {
    if (!_active || _active.settled) {
      return;
    }

    const active = _active;
    active.settled = true;
    clearTimeout(active.timeoutId);
    _active = null;

    ILovePDFUtils.log("info", `[DownloadTracker] wait.resolved.${reason}`, result);
    active.resolve(result);
  }

  function _rejectActive(error, reason, details = null) {
    if (!_active || _active.settled) {
      return;
    }

    const active = _active;
    active.settled = true;
    clearTimeout(active.timeoutId);
    _active = null;

    ILovePDFUtils.log("warn", `[DownloadTracker] wait.rejected.${reason}`, {
      pdfId: active.pdfId,
      filename: active.filename,
      downloadId: active.matchedDownloadId,
      error: error?.message || String(error),
      ...(details || {}),
    });
    active.reject(error);
  }

  return {
    waitForExpectedDownload,
    cancelIfTracking,
    failIfTracking,
    getState,
  };
})();