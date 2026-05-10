/**
 * ilovepdf-background/tabManager.js — Tab management for iLovePDF pages.
 *
 * Patrón: autodipsik/background/tabManager.js
 */

const ILovePDFTabManager = (() => {
  function _waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, CONFIG_ILOVEPDF.TIMING.PAGE_LOAD_WAIT_MS);
        }
      });
    });
  }

  async function waitForContentScript(tabId) {
    for (let i = 0; i < CONFIG_ILOVEPDF.TIMING.CONTENT_SCRIPT_MAX_ATTEMPTS; i++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
        if (response?.ready) return true;
      } catch {
        await ILovePDFUtils.sleep(CONFIG_ILOVEPDF.TIMING.CONTENT_SCRIPT_POLL_INTERVAL_MS);
      }
    }
    return false;
  }

  async function findOrCreateILovePDFTab() {
    const profile = await ILovePDFConfig.loadSiteProfile();
    const url = profile.baseUrl;
    const pattern = profile.urlPattern;

    const existingTabs = await chrome.tabs.query({ url: pattern });

    if (existingTabs.length > 0) {
      const tab = existingTabs[0];
      await chrome.tabs.update(tab.id, { active: true });

      // Navigate to the upload page (fresh state for new conversion)
      await chrome.tabs.update(tab.id, { url, active: true });
      await _waitForTabLoad(tab.id);
      return tab;
    }

    const tab = await chrome.tabs.create({ url, active: true });
    await _waitForTabLoad(tab.id);
    return tab;
  }

  async function navigateToUploadPage(tabId) {
    const profile = await ILovePDFConfig.loadSiteProfile();
    await chrome.tabs.update(tabId, { url: profile.baseUrl, active: true });
    await _waitForTabLoad(tabId);
  }

  return { findOrCreateILovePDFTab, waitForContentScript, navigateToUploadPage };
})();
