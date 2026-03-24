(function () {
  const FIREBASE_SERVER_DOC_URL = "https://firestore.googleapis.com/v1/projects/vocabpro-5604c/databases/(default)/documents/vocabpro/server";
  const FALLBACK_SERVER_CANDIDATES = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000"
  ];

  const ACTIONS = [
    { command: "ask_ai", label: "Explain", icon: "🎓" },
    { command: "vi", label: "Translate", icon: "🇻🇳" },
    { command: "speak", label: "Listen", icon: "📢" },
    { command: "mimic", label: "Speak", icon: "🎤" },
    { command: "examples", label: "Example", icon: "📝" },
    { command: "paraphrase", label: "Rephrase", icon: "♻️" },
    { command: "add_to_library", label: "Add Library", icon: "🏛" },
    { command: "mark", label: "Mark", icon: "📌" }
  ];

  let activeServerUrl = null;
  let activeSelectionText = "";
  let currentAnchorEl = null;
  let currentHighlightEl = null;
  let hideTimer = null;
  let isInteractingWithUI = false;

  function toOrigin(url) {
    try {
      return new URL(url).origin;
    } catch (_) {
      return null;
    }
  }

  function looksLikeVocabProApp() {
    const title = (document.title || "").trim().toLowerCase();
    if (title === "vocab pro") return true;

    const rootEl = document.getElementById("root");
    const viteEntry = document.querySelector('script[type="module"][src="/index.tsx"]');
    const appMarkers = document.querySelector('[data-app="vocab-pro"], [data-testid="vocab-pro-app"]');

    return !!(rootEl && (viteEntry || appMarkers));
  }

  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.zIndex = "2147483647";
  root.style.display = "none";
  root.style.padding = "6px 8px";
  root.style.borderRadius = "12px";
  root.style.border = "1px solid rgba(0,0,0,0.06)";
  root.style.background = "rgba(255,255,255,0.85)";
  root.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
  root.style.backdropFilter = "blur(12px)";
  root.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  root.style.userSelect = "none";

  root.addEventListener("mousedown", () => {
    isInteractingWithUI = true;
  });

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "repeat(4, auto)";
  row.style.gap = "6px";
  row.style.maxWidth = "280px";
  root.appendChild(row);

  const buttonMap = new Map();

  function addWordToPanel(word) {
    // Avoid duplicates
    const existing = Array.from(list.querySelectorAll("li span")).map(s => s.textContent.replace(/^\+ /, ""));
    if (existing.includes(word)) return;

    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.gap = "6px";
    li.style.padding = "2px 4px";
    li.style.borderRadius = "6px";
    li.style.background = "#ffffff";
    li.style.border = "1px solid #e5e7eb";

    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.style.cursor = "pointer";
    addBtn.style.fontWeight = "700";
    addBtn.style.padding = "0 4px";

    addBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      activeSelectionText = word;
      void handleAction("add_to_library");
      li.style.background = "#d1fae5";
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "-";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.style.fontWeight = "700";
    deleteBtn.style.padding = "0 4px";
    deleteBtn.style.color = "#ef4444";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation(); // prevent triggering li click
      li.remove(); // remove from DOM

      // Remove from localStorage
      const savedWords = JSON.parse(localStorage.getItem("markedWords") || "[]");
      const updatedWords = savedWords.filter(w => w !== word);
      localStorage.setItem("markedWords", JSON.stringify(updatedWords));
    });

    const textSpan = document.createElement("span");
    textSpan.textContent = word;

    li.appendChild(addBtn);
    li.appendChild(deleteBtn);
    li.appendChild(textSpan);

    li.addEventListener("click", () => {
      activeSelectionText = word;
      void handleAction("speak");
    });

    list.appendChild(li);

    // Save updated list to localStorage
    const savedWords = JSON.parse(localStorage.getItem("markedWords") || "[]");
    if (!savedWords.includes(word)) {
      savedWords.push(word);
      localStorage.setItem("markedWords", JSON.stringify(savedWords));
    }
  }

  function setButtonState(button, state) {
    const baseLabel = button.dataset.label || "";
    const icon = button.dataset.icon || "";
    button.disabled = state === "loading";
    button.style.minWidth = "auto";
    button.style.height = "36px";
    button.style.padding = "0 12px";
    button.style.borderRadius = "8px";
    button.style.border = "1px solid transparent";
    button.style.fontSize = "14px";
    button.style.fontWeight = "700";
    button.style.letterSpacing = "0.02em";
    button.style.cursor = state === "loading" ? "wait" : "pointer";
    button.style.transition = "all 120ms ease";
    button.style.background = "transparent";
    button.style.color = "#374151";
    button.style.width = "100%";
    button.style.textAlign = "center";

    if (state === "success") {
      button.textContent = "✓";
      button.style.background = "rgba(34,197,94,0.12)";
      button.style.color = "#16a34a";
      return;
    }

    if (state === "loading") {
      button.textContent = "...";
      button.style.background = "rgba(0,0,0,0.08)";
      button.style.color = "#111827";
      return;
    }

    button.textContent = icon;
    button.style.background = "transparent";
    button.style.color = "#374151";

    button.onmouseenter = () => {
      if (button.disabled) return;
      button.style.background = "rgba(0,0,0,0.06)";
    };
    button.onmouseleave = () => {
      if (button.disabled) return;
      button.style.background = "transparent";
    };
  }

  function flashButtonSuccess(button) {
    setButtonState(button, "success");
    window.setTimeout(() => {
      setButtonState(button, "default");
    }, 900);
  }

  function removeAnchor() {
    if (currentAnchorEl && currentAnchorEl.parentNode) {
      currentAnchorEl.parentNode.removeChild(currentAnchorEl);
    }
    if (currentHighlightEl && currentHighlightEl.parentNode) {
      const parent = currentHighlightEl.parentNode;
      parent.replaceChild(document.createTextNode(currentHighlightEl.textContent), currentHighlightEl);
      parent.normalize();
    }
    currentAnchorEl = null;
    currentHighlightEl = null;
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
    }, 500);
  }

  function showToolbar(x, y) {
    const padding = 12;
    const toolbarWidth = root.offsetWidth || 280;
    const toolbarHeight = root.offsetHeight || 40;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    if (left + toolbarWidth + padding > viewportWidth) {
      left = viewportWidth - toolbarWidth - padding;
    }

    let top = y - toolbarHeight - 8; // default above selection
    if (top < padding) {
      // if not enough space above, display below selection
      top = y + 8;
      if (top + toolbarHeight + padding > viewportHeight) {
        // if still exceeds viewport bottom, adjust top
        top = viewportHeight - toolbarHeight - padding;
      }
    }

    root.style.left = `${Math.max(padding, left)}px`;
    root.style.top = `${top}px`;
    root.style.display = "block";
  }

  function createAnchor(range) {
    removeAnchor();

    const highlight = document.createElement("span");
    highlight.style.textDecoration = "underline";
    highlight.style.textDecorationColor = "#22c55e";
    highlight.style.textDecorationThickness = "2px";
    highlight.style.textUnderlineOffset = "2px";

    const selectedText = range.toString();
    highlight.textContent = selectedText;

    range.deleteContents();
    range.insertNode(highlight);
    currentHighlightEl = highlight;

    const anchor = document.createElement("span");
    anchor.textContent = " Vocab";
    anchor.style.padding = "2px 8px";
    anchor.style.height = "20px";
    anchor.style.marginLeft = "6px";
    anchor.style.fontSize = "11px";
    anchor.style.fontWeight = "700";

    anchor.style.display = "inline-flex";
    anchor.style.alignItems = "center";
    anchor.style.justifyContent = "center";
    anchor.style.borderRadius = "999px";
    anchor.style.whiteSpace = "nowrap";

    anchor.style.background = "#22c55e";
    anchor.style.color = "#ffffff";
    anchor.style.cursor = "pointer";
    anchor.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";

    anchor.addEventListener("mousedown", () => {
      isInteractingWithUI = true;
    });

    anchor.addEventListener("mouseenter", () => {
      const rect = anchor.getBoundingClientRect();
      showToolbar(rect.left, rect.top - 48);
    });

    anchor.addEventListener("mouseleave", scheduleHideToolbar);

    const clone = document.createRange();
    clone.setStartAfter(highlight);
    clone.collapse(true);
    clone.insertNode(anchor);
    currentAnchorEl = anchor;
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

  async function shouldDisableOnCurrentPage() {
    if (looksLikeVocabProApp()) {
      return true;
    }

    const currentOrigin = window.location.origin;
    const firebaseHost = await getCurrentHostConfig();
    const knownOrigins = uniqueUrls([
      firebaseHost?.host || "",
      firebaseHost?.local || "",
      ...FALLBACK_SERVER_CANDIDATES
    ])
      .map(toOrigin)
      .filter(Boolean);

    return knownOrigins.includes(currentOrigin);
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

    if (command === "mark") {
      try {

        addWordToPanel(text);
        flashButtonSuccess(button);

      } catch (_) {
        window.alert("Mark failed");
        setButtonState(button, "default");
      }
      return;
    }

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

  async function init() {
    if (await shouldDisableOnCurrentPage()) {
      return;
    }

    ACTIONS.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.label = action.label;
      button.dataset.icon = action.icon;
      button.title = action.label;
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
      if (isInteractingWithUI) {
        isInteractingWithUI = false;
        return;
      }

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

      createAnchor(range);
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
  }

  void init();

  /* Floating Copy Panel */
  const floatingPanel = document.createElement("div");
floatingPanel.style.position = "fixed";
floatingPanel.style.bottom = "20px";
floatingPanel.style.right = "20px";
floatingPanel.style.width = "260px";
floatingPanel.style.maxHeight = "600px";
floatingPanel.style.overflowY = "auto";
floatingPanel.style.background = "#f9fafb"; 
floatingPanel.style.border = "1px solid #d1d5db";
floatingPanel.style.borderRadius = "12px";
floatingPanel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
floatingPanel.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
floatingPanel.style.fontSize = "12px";
floatingPanel.style.color = "#111827";
floatingPanel.style.zIndex = "2147483647";
floatingPanel.style.cursor = "default";
floatingPanel.style.resize = "both"; // allow both horizontal and vertical resizing
floatingPanel.style.overflow = "auto"; // ensures scrollbars appear if content overflows
document.body.appendChild(floatingPanel);

// Header
const header = document.createElement("div");
header.style.padding = "2px 8px";         // smaller top/bottom padding → shorter container
header.style.height = "28px";             // optional explicit height
header.style.lineHeight = "1";            // keeps text vertically centered
header.style.fontSize = "12px";           // keep font size readable
header.style.fontWeight = "700";          // keep bold
header.style.background = "#5340a1";      // light, neutral background
header.style.borderBottom = "1px solid #d1d5db";
header.style.color = "#ffffff";      // light, neutral background
header.style.display = "flex";
header.style.justifyContent = "space-between";
header.style.alignItems = "center";
header.style.borderTopLeftRadius = "8px";
header.style.borderTopRightRadius = "8px";

const title = document.createElement("span");
title.textContent = "Marked Words";
header.appendChild(title);

const closeBtn = document.createElement("button");
closeBtn.textContent = "×";
closeBtn.style.background = "transparent";
closeBtn.style.border = "none";
closeBtn.style.cursor = "pointer";
closeBtn.style.fontSize = "16px";
closeBtn.style.fontWeight = "700";
closeBtn.addEventListener("click", () => {
  floatingPanel.style.display = "none";
});
header.appendChild(closeBtn);
floatingPanel.appendChild(header);
floatingPanel.style.userSelect = "none";

// Content list
const list = document.createElement("ul");
list.style.listStyle = "none";
list.style.margin = "0";
list.style.padding = "6px 10px";
list.style.display = "flex";
list.style.flexDirection = "column";
list.style.gap = "4px";
floatingPanel.appendChild(list);
list.style.userSelect = "none";

// Load saved words after creating list
const savedWords = JSON.parse(localStorage.getItem("markedWords") || "[]");
savedWords.forEach(word => addWordToPanel(word));

  // Drag functionality
  let isDragging = false;
  let offsetX, offsetY;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - floatingPanel.getBoundingClientRect().left;
    offsetY = e.clientY - floatingPanel.getBoundingClientRect().top;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    floatingPanel.style.left = `${e.clientX - offsetX}px`;
    floatingPanel.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

})();
