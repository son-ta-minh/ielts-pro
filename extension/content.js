(function () {
  const FIREBASE_SERVER_DOC_URL = "https://firestore.googleapis.com/v1/projects/vocabpro-5604c/databases/(default)/documents/vocabpro/server";
  const FALLBACK_SERVER_CANDIDATES = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000"
  ];

  const ACTIONS = [
    { command: "vi", label: "VI" },
    { command: "speak", label: "Read" },
    { command: "mimic", label: "Mimi" },
    { command: "add_to_library", label: "Add" },
    { command: "ask_ai", label: "Ask AI" },
    { command: "examples", label: "Example" },
    { command: "paraphrase", label: "Para" }
  ];

  let activeServerUrl = null;
  let activeSelectionText = "";
  let hideTimer = null;

  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.zIndex = "2147483647";
  root.style.display = "none";
  root.style.padding = "6px";
  root.style.borderRadius = "16px";
  root.style.border = "1px solid rgba(17,24,39,0.12)";
  root.style.background = "rgba(255,255,255,0.98)";
  root.style.boxShadow = "0 18px 40px rgba(15,23,42,0.18)";
  root.style.backdropFilter = "blur(14px)";
  root.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  root.style.userSelect = "none";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.flexWrap = "wrap";
  row.style.maxWidth = "320px";
  root.appendChild(row);

  const buttonMap = new Map();

  function setButtonState(button, state) {
    const baseLabel = button.dataset.label || "";
    button.disabled = state === "loading";
    button.style.minWidth = "64px";
    button.style.height = "34px";
    button.style.padding = "0 12px";
    button.style.borderRadius = "999px";
    button.style.border = "1px solid rgba(17,24,39,0.10)";
    button.style.fontSize = "12px";
    button.style.fontWeight = "800";
    button.style.letterSpacing = "0.04em";
    button.style.cursor = state === "loading" ? "wait" : "pointer";
    button.style.transition = "all 120ms ease";

    if (state === "success") {
      button.textContent = "Checked";
      button.style.background = "#dcfce7";
      button.style.color = "#166534";
      button.style.borderColor = "#86efac";
      return;
    }

    if (state === "loading") {
      button.textContent = "Sending";
      button.style.background = "#111827";
      button.style.color = "#ffffff";
      button.style.borderColor = "#111827";
      return;
    }

    button.textContent = baseLabel;
    button.style.background = "#ffffff";
    button.style.color = "#111827";
    button.style.borderColor = "rgba(17,24,39,0.10)";
  }

  function flashButtonSuccess(button) {
    setButtonState(button, "success");
    window.setTimeout(() => {
      setButtonState(button, "default");
    }, 900);
  }

  function hideToolbar() {
    root.style.display = "none";
  }

  function scheduleHideToolbar() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
    }
    hideTimer = window.setTimeout(() => {
      hideToolbar();
    }, 160);
  }

  function showToolbar(x, y) {
    root.style.left = `${Math.max(12, x)}px`;
    root.style.top = `${Math.max(12, y)}px`;
    root.style.display = "block";
  }

  function uniqueUrls(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      const normalized = String(item || "").trim().replace(/\/+$/, "");
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }

  async function getCurrentHostConfig() {
    try {
      const response = await fetch(FIREBASE_SERVER_DOC_URL, { method: "GET" });
      if (!response.ok) return null;
      const payload = await response.json();
      const fields = payload?.fields || {};
      return {
        host: fields?.host?.stringValue || null,
        local: fields?.local?.stringValue || null
      };
    } catch (_) {
      return null;
    }
  }

  async function getDetectedServerCandidates() {
    const firebaseHost = await getCurrentHostConfig();
    const candidates = [];

    if (firebaseHost?.local) {
      try {
        const localUrl = new URL(firebaseHost.local);
        const detectedPort = localUrl.port || (localUrl.protocol === "https:" ? "443" : "80");
        candidates.push(`https://localhost:${detectedPort}`);
        candidates.push(`http://localhost:${detectedPort}`);
        candidates.push(firebaseHost.local);
      } catch (_) {
        candidates.push(firebaseHost.local);
      }
    }

    if (firebaseHost?.host) {
      candidates.push(firebaseHost.host);
    }

    candidates.push(...FALLBACK_SERVER_CANDIDATES);
    return uniqueUrls(candidates);
  }

  async function resolveServerUrl() {
    if (activeServerUrl) return activeServerUrl;

    const candidates = await getDetectedServerCandidates();
    for (const candidate of candidates) {
      try {
        const response = await fetch(`${candidate}/api/health`, {
          method: "GET"
        });
        if (response.ok) {
          activeServerUrl = candidate;
          return candidate;
        }
      } catch (_) {
        // Try next candidate.
      }
    }

    throw new Error("Mini Buddy could not reach the local server.");
  }

  async function sendInteractiveCommand(command, text, connectCode) {
    const serverUrl = await resolveServerUrl();
    const response = await fetch(`${serverUrl}/api/studybuddy/interactive/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        command,
        text,
        connectCode: connectCode || ""
      })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(payload.error || `Server error ${response.status}`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  async function handleAction(command) {
    const button = buttonMap.get(command);
    const text = activeSelectionText.trim();
    if (!button || !text) return;

    setButtonState(button, "loading");

    try {
      await sendInteractiveCommand(command, text);
      flashButtonSuccess(button);
    } catch (error) {
      const requiresCode = error?.payload?.requiresConnectCode === true || error?.status === 409;
      if (requiresCode) {
        const manualCode = window.prompt("Mini Buddy detected multiple Full Buddy sessions. Enter Connect Code:");
        if (manualCode && manualCode.trim()) {
          try {
            await sendInteractiveCommand(command, text, manualCode.trim());
            flashButtonSuccess(button);
            return;
          } catch (retryError) {
            window.alert(retryError?.payload?.error || retryError?.message || "Mini Buddy request failed.");
          }
        }
      } else {
        window.alert(error?.payload?.error || error?.message || "Mini Buddy request failed.");
      }
      setButtonState(button, "default");
    }
  }

  ACTIONS.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.label = action.label;
    setButtonState(button, "default");
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void handleAction(action.command);
    });
    row.appendChild(button);
    buttonMap.set(action.command, button);
  });

  root.addEventListener("mouseenter", () => {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  });
  root.addEventListener("mouseleave", scheduleHideToolbar);

  document.documentElement.appendChild(root);

  document.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    if (!text || !selection || selection.rangeCount === 0) {
      scheduleHideToolbar();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      scheduleHideToolbar();
      return;
    }

    activeSelectionText = text;
    ACTIONS.forEach((action) => {
      const button = buttonMap.get(action.command);
      if (button) setButtonState(button, "default");
    });

    showToolbar(rect.left + rect.width / 2 - 90, rect.top - 52);
  });

  document.addEventListener("mousedown", (event) => {
    if (!root.contains(event.target)) {
      scheduleHideToolbar();
    }
  });

  document.addEventListener("scroll", () => {
    if (root.style.display === "block") {
      scheduleHideToolbar();
    }
  }, true);
})();
