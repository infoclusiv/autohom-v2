/**
 * ilovepdf-background/bridge.js
 * WebSocket bridge client for the Python orchestrator.
 */

const ILovePDFBridge = (() => {
  let _ws = null;
  let _connected = false;
  let _reconnectTimer = null;
  const _runtimeInstanceId = ILovePDFUtils.generateUUID();

  function _log(msg) {
    ILovePDFUtils.log("info", `[Bridge] ${msg}`);
  }

  function _buildIdentityPayload() {
    return {
      agentId: CONFIG_ILOVEPDF.AGENT_ID,
      agentType: CONFIG_ILOVEPDF.EXTENSION_TYPE,
      extensionId: CONFIG_ILOVEPDF.EXTENSION_ID,
      extensionType: CONFIG_ILOVEPDF.EXTENSION_TYPE,
      capabilities: ["convert_pdf_to_excel", "detect_excel_download"],
      runtimeInstanceId: _runtimeInstanceId,
      clientId: CONFIG_ILOVEPDF.AGENT_ID,
      version: chrome.runtime.getManifest().version || "1.0.0",
    };
  }

  function connect() {
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      _ws = new WebSocket(CONFIG_ILOVEPDF.BRIDGE_URL);
    } catch (e) {
      _log(`Connection error: ${e.message}`);
      _scheduleReconnect();
      return;
    }

    _ws.onopen = () => {
      _log("WebSocket opened, sending AGENT_CONNECTED...");
      _connected = false;
      _send({
        action: "AGENT_CONNECTED",
        ..._buildIdentityPayload(),
      });
    };

    _ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      const action = data.action;

      if (action === "PING") {
        _send({
          action: "PONG",
          requestId: data.requestId || "",
          replyTo: data.requestId || "",
          agentType: CONFIG_ILOVEPDF.EXTENSION_TYPE,
          ..._buildIdentityPayload(),
        });
        _connected = true;
        _notifyConnectionStatus(true);
        return;
      }

      if (action === "CONVERT_PDF") {
        _log(`Received CONVERT_PDF: ${data.filename}`);
        ILovePDFRuntime.queueConversion({
          jobId: data.jobId || "",
          pdfId: data.pdfId,
          filename: data.filename,
        });
        _send({
          action: "CONVERT_PDF_ACK",
          requestId: data.requestId || "",
          replyTo: data.requestId || "",
          jobId: data.jobId || "",
          pdfId: data.pdfId,
          ok: true,
        });
      }
    };

    _ws.onclose = (event) => {
      _log(`WebSocket closed (code=${event.code}, reason=${event.reason})`);
      _connected = false;
      _ws = null;
      _notifyConnectionStatus(false);
      _scheduleReconnect();
    };

    _ws.onerror = () => {
      _log("WebSocket error");
      _connected = false;
      _notifyConnectionStatus(false);
    };
  }

  function _send(payload) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      try {
        _ws.send(JSON.stringify(payload));
        return true;
      } catch (e) {
        _log(`Send error: ${e.message}`);
      }
    }
    return false;
  }

  function sendStatus(statusPayload) {
    const payload = {
      action: "CONVERSION_STATUS",
      jobId: statusPayload.jobId || "",
      pdfId: statusPayload.pdfId || "",
      status: statusPayload.status || "",
      message: statusPayload.message || "",
      excelPath: statusPayload.excelPath || "",
      downloadedFilename: statusPayload.downloadedFilename || "",
      downloadId: statusPayload.downloadId || null,
    };
    const ok = _send(payload);
    if (!ok) {
      _log(`Failed to send CONVERSION_STATUS pdfId=${payload.pdfId} status=${payload.status}`);
    }
    return ok;
  }

  function _scheduleReconnect() {
    if (_reconnectTimer) return;
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      connect();
    }, CONFIG_ILOVEPDF.TIMING.RECONNECT_INTERVAL_MS);
  }

  function _notifyConnectionStatus(isConnected) {
    chrome.runtime.sendMessage({
      type: "ILOVEPDF_BRIDGE_STATUS",
      connected: isConnected,
    }).catch(() => {});
  }

  function disconnect() {
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    if (_ws) {
      _ws.close(1000, "Extension shutdown");
      _ws = null;
    }
    _connected = false;
  }

  function isConnected() {
    return _connected && _ws && _ws.readyState === WebSocket.OPEN;
  }

  function setupAlarmReconnect() {
    chrome.alarms.create(CONFIG_ILOVEPDF.TIMING.ALARM_RECONNECT_NAME, {
      periodInMinutes: CONFIG_ILOVEPDF.TIMING.ALARM_RECONNECT_PERIOD_MINUTES,
    });
  }

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CONFIG_ILOVEPDF.TIMING.ALARM_RECONNECT_NAME && !isConnected()) {
      _log("Alarm reconnect triggered");
      connect();
    }
  });

  return { connect, disconnect, isConnected, sendStatus, setupAlarmReconnect };
})();
