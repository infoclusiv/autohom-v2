/**
 * ilovepdf/conversionAutomator.js — Fase 1 convertir, fase 2 descargar.
 */

const ILovePDFConversion = {
  /**
   * Run the full conversion flow when a task needs both phases.
   */
  async runConversion(siteProfile) {
    const { selectors, timing } = siteProfile;

    await ILovePDFConversion.startConversion(siteProfile);
    await ILovePDFUtils.sleep(timing.afterConvertClickDelayMs);

    if (selectors.progressIndicator || selectors.downloadReadyIndicator || selectors.downloadButton) {
      ILovePDFUtils.log("info", "Conversion Step 3: Monitoring progress...");
      await ILovePDFConversion._waitForProgressComplete(siteProfile);
    }

    await ILovePDFConversion.startDownload(siteProfile);
    ILovePDFUtils.log("info", "[Conversion] phase2.done", { url: location.href });
    return true;
  },

  async startConversion(siteProfile) {
    const { selectors, timing } = siteProfile;
    const deadline = Date.now() + timing.elementWaitTimeoutMs;

    ILovePDFUtils.log("info", "[Conversion] phase1.wait_convert", { url: location.href });

    while (Date.now() < deadline) {
      const configured = ILovePDFDom.querySafe(selectors.convertButton);
      if (configured && ILovePDFDom.isElementVisible(configured) && !configured.disabled) {
        ILovePDFUtils.log("info", "[Conversion] phase1.click_convert", {
          url: location.href,
          strategy: "configured_selector",
        });
        ILovePDFDom.clickElement(configured);
        return true;
      }

      const { element, strategy } = ILovePDFDom.findConvertButton();
      if (element) {
        chrome.runtime.sendMessage({
          type: "ILOVEPDF_SELECTOR_FALLBACK",
          selectorName: "convertButton",
          configuredSelector: selectors.convertButton || "",
          usedStrategy: strategy,
          url: location.href,
        }).catch(() => {});

        ILovePDFUtils.log("info", "[Conversion] phase1.click_convert", {
          url: location.href,
          strategy,
        });
        ILovePDFDom.clickElement(element);
        return true;
      }

      await ILovePDFUtils.sleep(timing.pollIntervalMs || 500);
    }

    chrome.runtime.sendMessage({
      type: "ILOVEPDF_SELECTOR_BROKEN",
      selectorName: "convertButton",
      configuredSelector: selectors.convertButton || "",
      url: location.href,
    }).catch(() => {});

    throw new Error("Botón Convertir no encontrado con ninguna estrategia.");
  },

  async startDownload(siteProfile) {
    const { selectors, timing } = siteProfile;
    const deadline = Date.now() + timing.elementWaitTimeoutMs;

    ILovePDFUtils.log("info", "[Conversion] phase2.wait_download", { url: location.href });

    while (Date.now() < deadline) {
      const configured = ILovePDFDom.querySafe(selectors.downloadButton);
      if (ILovePDFConversion._isClickableDownloadTarget(configured)) {
        ILovePDFUtils.log("info", "[Conversion] phase2.click_download", {
          url: location.href,
          strategy: "configured_selector",
        });
        ILovePDFDom.clickElement(configured);
        await ILovePDFUtils.sleep(timing.afterDownloadClickDelayMs);
        return true;
      }

      if (configured && ILovePDFDom.isElementVisible(configured)) {
        ILovePDFUtils.log("warn", "[Conversion] phase2.invalid_configured_target", {
          url: location.href,
          tagName: configured.tagName,
          id: configured.id || "",
          className: configured.className || "",
          selector: selectors.downloadButton || "",
        });
      }

      const { element, strategy } = ILovePDFDom.findDownloadButton();
      if (ILovePDFConversion._isClickableDownloadTarget(element)) {
        chrome.runtime.sendMessage({
          type: "ILOVEPDF_SELECTOR_FALLBACK",
          selectorName: "downloadButton",
          configuredSelector: selectors.downloadButton || "",
          usedStrategy: strategy,
          url: location.href,
        }).catch(() => {});

        ILovePDFUtils.log("info", "[Conversion] phase2.click_download", {
          url: location.href,
          strategy,
        });
        ILovePDFDom.clickElement(element);
        await ILovePDFUtils.sleep(timing.afterDownloadClickDelayMs);
        return true;
      }

      await ILovePDFUtils.sleep(timing.pollIntervalMs || 500);
    }

    chrome.runtime.sendMessage({
      type: "ILOVEPDF_SELECTOR_BROKEN",
      selectorName: "downloadButton",
      configuredSelector: selectors.downloadButton || "",
      url: location.href,
    }).catch(() => {});

    ILovePDFUtils.log("warn", "[Conversion] phase2.download_missing_auto", { url: location.href });
    await ILovePDFUtils.sleep(timing.afterDownloadClickDelayMs);
    return true;
  },

  /**
   * Wait for the progress indicator to disappear or the download section to appear.
   */
  async _waitForProgressComplete(siteProfile) {
    const { selectors, timing } = siteProfile;
    const deadline = Date.now() + timing.elementWaitTimeoutMs;

    while (Date.now() < deadline) {
      const downloadBtn = ILovePDFDom.querySafe(selectors.downloadButton);
      if (downloadBtn && ILovePDFDom.isElementVisible(downloadBtn)) {
        ILovePDFUtils.log("info", "Progress complete - download button visible.");
        return;
      }

      const semanticDownload = ILovePDFDom.findDownloadButton();
      if (semanticDownload.element) {
        ILovePDFUtils.log("info", "Progress complete - semantic download button visible.", {
          strategy: semanticDownload.strategy,
        });
        return;
      }

      if (selectors.downloadReadyIndicator) {
        const readyEl = ILovePDFDom.querySafe(selectors.downloadReadyIndicator);
        if (readyEl && ILovePDFDom.isElementVisible(readyEl)) {
          ILovePDFUtils.log("info", "Progress complete - download ready indicator found.");
          return;
        }
      }

      await ILovePDFUtils.sleep(timing.pollIntervalMs || 500);
    }

    ILovePDFUtils.log("warn", "Progress wait timed out, proceeding anyway...");
  },

  _isClickableDownloadTarget(element) {
    if (!element || !ILovePDFDom.isElementVisible(element)) {
      return false;
    }

    const tagName = String(element.tagName || "").toUpperCase();
    if (tagName === "A") {
      return !!(element.href || element.getAttribute("download"));
    }

    if (tagName === "BUTTON") {
      return !element.disabled;
    }

    if (tagName === "INPUT") {
      const type = String(element.type || "").toLowerCase();
      return type === "button" || type === "submit";
    }

    const role = String(element.getAttribute("role") || "").toLowerCase();
    if (role === "button") {
      return true;
    }

    return false;
  },
};
