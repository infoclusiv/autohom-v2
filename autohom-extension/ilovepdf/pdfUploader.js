/**
 * ilovepdf/pdfUploader.js — Descarga PDF desde la app Python y lo sube a iLovePDF.
 *
 * Patrón: autodipsik/content/attachmentAutomator.js (DataTransfer API).
 */

const ILovePDFUploader = {
  /**
   * Download PDF blob from the Python HTTP API.
   */
  async downloadPdfBlob(pdfId) {
    const url = `${CONFIG_ILOVEPDF.API_BASE_URL}/pdfs/${pdfId}/file`;
    ILovePDFUtils.log("info", `Downloading PDF from ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }
    return await response.blob();
  },

  /**
   * Assign a File to an input[type="file"] element using DataTransfer API.
   */
  assignFileToInput(inputEl, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;

    // Dispatch change and input events to trigger the site's upload handlers
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    ILovePDFUtils.log("info", `File assigned: ${file.name} (${file.size} bytes)`);
  },

  /**
   * Full upload flow: download PDF → find file input → assign file.
   */
  async uploadPdf(pdfDescriptor, siteProfile) {
    const { pdfId, filename } = pdfDescriptor;
    const selectors = siteProfile.selectors;
    const timing = siteProfile.timing;

    // 1. Download PDF blob from Python API
    ILovePDFUtils.log("info", `Step 1: Downloading ${filename}...`);
    const blob = await ILovePDFUploader.downloadPdfBlob(pdfId);
    const file = new File([blob], filename, { type: "application/pdf" });

    // 2. Find the file input
    ILovePDFUtils.log("info", "Step 2: Looking for file input...");
    let fileInput = ILovePDFDom.querySafe(selectors.fileInput);

    if (!fileInput) {
      // Some sites hide the input; try clicking the upload button first
      if (selectors.uploadButton) {
        const uploadBtn = await ILovePDFDom.waitForElement(
          selectors.uploadButton, timing.elementWaitTimeoutMs
        );
        if (uploadBtn) {
          ILovePDFDom.clickElement(uploadBtn);
          await ILovePDFUtils.sleep(1000);
        }
      }
      // Re-check for file input
      fileInput = ILovePDFDom.querySafe(selectors.fileInput);
    }

    if (!fileInput) {
      // Last resort: find any input[type="file"] on the page
      fileInput = document.querySelector('input[type="file"]');
    }

    if (!fileInput) {
      throw new Error("Could not find file input element on the page.");
    }

    // 3. Assign the file
    ILovePDFUtils.log("info", "Step 3: Assigning file to input...");
    ILovePDFUploader.assignFileToInput(fileInput, file);

    // 4. Wait for the upload to be acknowledged
    ILovePDFUtils.log("info", "Step 4: Waiting for upload confirmation...");
    const deadline = Date.now() + timing.elementWaitTimeoutMs;
    let uploadConfirmed = false;

    while (Date.now() < deadline) {
      if (selectors.uploadReadyIndicator) {
        const configured = ILovePDFDom.querySafe(selectors.uploadReadyIndicator);
        if (configured && (ILovePDFDom.isElementVisible(configured) || configured.children.length > 0)) {
          uploadConfirmed = true;
          break;
        }
      }

      const { element, strategy } = ILovePDFDom.findUploadReadyIndicator();
      if (element) {
        chrome.runtime.sendMessage({
          type: "ILOVEPDF_SELECTOR_FALLBACK",
          selectorName: "uploadReadyIndicator",
          configuredSelector: selectors.uploadReadyIndicator || "",
          usedStrategy: strategy,
          url: location.href,
        }).catch(() => {});

        uploadConfirmed = true;
        break;
      }

      await ILovePDFUtils.sleep(timing.pollIntervalMs || 500);
    }

    if (!uploadConfirmed) {
      ILovePDFUtils.log("warn", "Upload ready indicator not found by any strategy, continuing...");
    }

    await ILovePDFUtils.sleep(timing.afterUploadDelayMs);
    ILovePDFUtils.log("info", `Upload complete for ${filename}`);
    return true;
  },
};
