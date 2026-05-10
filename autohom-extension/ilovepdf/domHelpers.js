/**
 * ilovepdf/domHelpers.js — DOM interaction helpers for iLovePDF pages.
 */

const ILovePDFDom = {
  /**
   * Wait for an element matching a CSS selector to appear in the DOM.
   */
  async waitForElement(selector, timeoutMs = 60000, pollMs = 500) {
    if (!selector) return null;

    const existing = ILovePDFDom.querySafe(selector);
    if (existing && ILovePDFDom.isElementVisible(existing)) return existing;

    return new Promise((resolve) => {
      let settled = false;
      let fallbackTimer = null;

      function finish(el) {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timeoutTimer);
        clearInterval(fallbackTimer);
        resolve(el);
      }

      const observer = new MutationObserver(() => {
        const el = ILovePDFDom.querySafe(selector);
        if (el && ILovePDFDom.isElementVisible(el)) {
          finish(el);
        }
      });

      const root = document.body || document.documentElement;
      if (root) {
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["style", "class", "hidden"],
        });
      }

      fallbackTimer = setInterval(() => {
        const el = ILovePDFDom.querySafe(selector);
        if (el && ILovePDFDom.isElementVisible(el)) {
          finish(el);
        }
      }, pollMs);

      const timeoutTimer = setTimeout(() => finish(null), timeoutMs);
    });
  },

  /**
   * Check if an element is visible (non-zero dimensions, not hidden).
   */
  isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || el.offsetHeight > 0;
  },

  /**
   * Click an element, dispatching proper mouse events.
   */
  clickElement(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      el.click();
      return true;
    } catch (e) {
      ILovePDFUtils.log("error", "Click failed", e);
      return false;
    }
  },

  /**
   * Safe querySelector that won't throw on invalid selectors.
   */
  querySafe(selector) {
    try {
      return selector ? document.querySelector(selector) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Safe querySelectorAll.
   */
  queryAllSafe(selector) {
    try {
      return selector ? Array.from(document.querySelectorAll(selector)) : [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Try multiple selectors or callbacks in order and return the first visible hit.
   */
  findByStrategies(strategies) {
    for (const strategy of strategies) {
      try {
        const el = typeof strategy === "function"
          ? strategy()
          : ILovePDFDom.querySafe(strategy);
        if (el && ILovePDFDom.isElementVisible(el)) {
          return el;
        }
      } catch (_) {
        // Ignore invalid selectors and continue with the next strategy.
      }
    }
    return null;
  },

  /**
   * Find the convert button using increasingly loose semantic fallbacks.
   */
  findConvertButton() {
    const strategies = [
      { name: "id_processtask", fn: () => ILovePDFDom.querySafe("#processTask") },
      { name: "data_process", fn: () => ILovePDFDom.querySafe('[data-action="process"],[data-type="process"]') },
      {
        name: "text_convertir",
        fn: () => Array.from(document.querySelectorAll("button,[role='button']"))
          .find((el) => /^(convertir|convert|procesar|process)/i.test(el.textContent.trim())
            && ILovePDFDom.isElementVisible(el)
            && !el.disabled),
      },
      {
        name: "text_excel",
        fn: () => Array.from(document.querySelectorAll("button,[role='button']"))
          .find((el) => /excel/i.test(el.textContent)
            && ILovePDFDom.isElementVisible(el)
            && !el.disabled),
      },
      {
        name: "largest_button",
        fn: () => Array.from(document.querySelectorAll("button"))
          .filter((el) => ILovePDFDom.isElementVisible(el) && !el.disabled)
          .sort((a, b) => {
            const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
            const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
            return areaB - areaA;
          })[0] || null,
      },
    ];

    for (const { name, fn } of strategies) {
      try {
        const el = fn();
        if (el) {
          return { element: el, strategy: name };
        }
      } catch (_) {
        // Ignore DOM lookup failures and continue with the next strategy.
      }
    }

    return { element: null, strategy: "none" };
  },

  /**
   * Find the download button on the final download page.
   */
  findDownloadButton() {
    const onDownloadPage = /\/descarga\//i.test(location.pathname) || /\/download\//i.test(location.pathname);
    const strategies = [
      {
        name: "downloader_pickfiles",
        fn: () => onDownloadPage ? ILovePDFDom.querySafe("a.downloader__btn#pickfiles") : null,
      },
      {
        name: "downloader_button",
        fn: () => onDownloadPage ? ILovePDFDom.querySafe("a.downloader__btn.active, a.downloader__btn") : null,
      },
      { name: "id_download", fn: () => ILovePDFDom.querySafe("#download") },
      { name: "class_btn_download", fn: () => ILovePDFDom.querySafe("a.btn-download, .btn-download") },
      {
        name: "href_download_api",
        fn: () => Array.from(document.querySelectorAll("a[href]"))
          .find((el) => /\/download\//i.test(el.href)
            && ILovePDFDom.isElementVisible(el)),
      },
      {
        name: "href_xlsx",
        fn: () => ILovePDFDom.querySafe('[href*=".xlsx"],[href*=".zip"]'),
      },
      { name: "attr_download", fn: () => ILovePDFDom.querySafe("[download]") },
      {
        name: "text_descargar",
        fn: () => onDownloadPage
          ? Array.from(document.querySelectorAll("a,button"))
            .find((el) => /descargar|download/i.test(el.textContent)
              && (/(downloader__btn|btn-download)/i.test(String(el.className || "")) || /\/download\//i.test(el.href || ""))
              && ILovePDFDom.isElementVisible(el))
          : null,
      },
    ];

    for (const { name, fn } of strategies) {
      try {
        const el = fn();
        if (el && ILovePDFDom.isElementVisible(el)) {
          return { element: el, strategy: name };
        }
      } catch (_) {
        // Ignore DOM lookup failures and continue with the next strategy.
      }
    }

    return { element: null, strategy: "none" };
  },

  /**
   * Find the upload-ready indicator after a PDF has been attached.
   */
  findUploadReadyIndicator() {
    const candidates = [
      "#fileGroups",
      ".tool-item-body",
      '[class*="file-item"]',
      '[class*="upload-item"]',
      '[class*="task-item"]',
      ".files",
      ".queue",
    ];

    for (const selector of candidates) {
      try {
        const el = ILovePDFDom.querySafe(selector);
        if (el && (ILovePDFDom.isElementVisible(el) || el.children.length > 0)) {
          return { element: el, strategy: selector };
        }
      } catch (_) {
        // Ignore DOM lookup failures and continue with the next candidate.
      }
    }

    return { element: null, strategy: "none" };
  },
};
