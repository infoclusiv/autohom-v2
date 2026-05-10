/**
 * ilovepdf/content.js — Content script para ilovepdf.com.
 *
 * Maneja el flujo partido:
 * START_CONVERSION en la página de upload
 * START_DOWNLOAD en la página /descarga/
 */

(function () {
  "use strict";

  let _siteProfile = null;

  async function loadSiteProfile() {
    _siteProfile = await ILovePDFConfig.loadSiteProfile();
    ILovePDFUtils.log("info", "[Content] site_profile.loaded", _siteProfile.selectors);
  }

  function reportStatus(pdfId, status, message = "") {
    chrome.runtime.sendMessage({
      type: "ILOVEPDF_CONVERSION_RESULT",
      pdfId,
      status,
      message,
    }).catch(() => {});
  }

  function logStage(level, stage, extra = {}) {
    ILovePDFUtils.log(level, `[Content] ${stage}`, {
      url: location.href,
      ...extra,
    });
  }

  async function handleStartConversion(data) {
    const { pdfId, filename, downloadUrl } = data;
    if (!_siteProfile) await loadSiteProfile();

    logStage("info", "phase1.received", { pdfId, filename, downloadUrl });

    try {
      reportStatus(pdfId, "uploading", `Subiendo ${filename}...`);
      await ILovePDFUploader.uploadPdf(
        { pdfId, filename, downloadUrl },
        _siteProfile
      );
      logStage("info", "phase1.uploaded", { pdfId, filename });

      reportStatus(pdfId, "converting", `Convirtiendo ${filename}...`);
      await ILovePDFConversion.startConversion(_siteProfile);
      logStage("info", "phase1.convert_clicked", { pdfId, filename });

      return { success: true, phase: "converted", pdfId };
    } catch (error) {
      const msg = error.message || "Unknown error";
      logStage("error", "phase1.error", { pdfId, filename, error: msg });
      reportStatus(pdfId, "error", msg);
      return { success: false, phase: "converted", pdfId, error: msg };
    }
  }

  async function handleStartDownload(data) {
    const { pdfId, filename } = data;
    try {
      if (!_siteProfile) await loadSiteProfile();

      logStage("info", "phase2.received", { pdfId, filename });
      reportStatus(pdfId, "downloading", `Descargando ${filename}...`);
      await ILovePDFConversion.startDownload(_siteProfile);
      logStage("info", "phase2.download_clicked", { pdfId, filename });

      return { accepted: true, phase: "download_requested", pdfId };
    } catch (error) {
      const msg = error.message || "Unknown error";
      logStage("error", "phase2.error", { pdfId, filename, error: msg });
      reportStatus(pdfId, "error", msg);
      return { accepted: false, phase: "download_requested", pdfId, error: msg };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ ready: true, context: "ilovepdf", url: location.href });
      return false;
    }

    if (message.type === "START_CONVERSION") {
      handleStartConversion(message).then(sendResponse).catch((err) => {
        sendResponse({ success: false, phase: "converted", error: err.message });
      });
      return true;
    }

    if (message.type === "START_DOWNLOAD") {
      handleStartDownload(message).catch((err) => {
        const msg = err?.message || "Unknown error";
        logStage("error", "phase2.unhandled", {
          pdfId: message.pdfId,
          filename: message.filename,
          error: msg,
        });
        reportStatus(message.pdfId, "error", msg);
      });
      sendResponse({ accepted: true, phase: "download_requested", pdfId: message.pdfId });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CONFIG_ILOVEPDF.STORAGE_KEY_SITE_PROFILE]) {
      loadSiteProfile();
    }
  });

  loadSiteProfile();
  logStage("info", "content.loaded");
})();
