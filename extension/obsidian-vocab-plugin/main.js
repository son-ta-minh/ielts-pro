var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VocabPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE_VOCAB = "vocab-webview";
var VocabWebView = class extends import_obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
  }
  getViewType() {
    return VIEW_TYPE_VOCAB;
  }
  getDisplayText() {
    return "Vocab";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    this.containerEl.style.padding = "0";
    container.style.padding = "0";
    container.style.margin = "0";
    container.empty();
    const iframe = document.createElement("iframe");
    const baseUrl = "https://son-ta-minh.github.io/ielts-pro/";
    const cacheBuster = `t=${Date.now()}`;
    iframe.src = baseUrl.includes("?") ? `${baseUrl}&${cacheBuster}` : `${baseUrl}?${cacheBuster}`;
    iframe.setAttribute("loading", "eager");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.display = "block";
    iframe.style.border = "none";
    let zoom = 0.9;
    const wrapper = document.createElement("div");
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.style.overflow = "auto";
    wrapper.style.position = "relative";
    iframe.style.transformOrigin = "0 0";
    iframe.style.transform = `scale(${zoom})`;
    iframe.style.width = `${100 / zoom}%`;
    iframe.style.height = `${100 / zoom}%`;
    wrapper.appendChild(iframe);
    container.appendChild(wrapper);
    wrapper.addEventListener("wheel", (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const prevZoom = zoom;
        zoom = event.deltaY < 0 ? Math.min(zoom + 0.1, 2) : Math.max(zoom - 0.1, 0.5);
        iframe.style.transform = `scale(${zoom})`;
        iframe.style.width = `${100 / zoom}%`;
        iframe.style.height = `${100 / zoom}%`;
      }
    });
    document.addEventListener("vocab-zoom-in", () => {
      zoom = Math.min(zoom + 0.1, 2);
      iframe.style.transform = `scale(${zoom})`;
      iframe.style.width = `${100 / zoom}%`;
      iframe.style.height = `${100 / zoom}%`;
    });
    document.addEventListener("vocab-zoom-out", () => {
      zoom = Math.max(zoom - 0.1, 0.5);
      iframe.style.transform = `scale(${zoom})`;
      iframe.style.width = `${100 / zoom}%`;
      iframe.style.height = `${100 / zoom}%`;
    });
  }
};
var VocabPlugin = class extends import_obsidian.Plugin {
  FIREBASE_SERVER_DOC_URL = "https://firestore.googleapis.com/v1/projects/vocabpro-5604c/databases/(default)/documents/vocabpro/server";
  FALLBACK_SERVER_CANDIDATES = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000"
  ];
  activeServerUrl = null;
  async getCurrentHostConfig() {
    try {
      const res = await fetch(this.FIREBASE_SERVER_DOC_URL);
      if (!res.ok) return null;
      const payload = await res.json();
      const fields = payload?.fields || {};
      return {
        host: fields?.host?.stringValue || null,
        local: fields?.local?.stringValue || null
      };
    } catch {
      return null;
    }
  }
  async getDetectedServerCandidates() {
    const firebase = await this.getCurrentHostConfig();
    const candidates = [];
    if (firebase?.local) candidates.push(firebase.local);
    if (firebase?.host) candidates.push(firebase.host);
    candidates.push(...this.FALLBACK_SERVER_CANDIDATES);
    return [...new Set(candidates)];
  }
  async resolveServerUrl() {
    if (this.activeServerUrl) return this.activeServerUrl;
    const candidates = await this.getDetectedServerCandidates();
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/health`);
        if (res.ok) {
          this.activeServerUrl = url;
          return url;
        }
      } catch {
      }
    }
    throw new Error("Vocab server is not running. Please start your local server.");
  }
  async sendCommand(command, text) {
    try {
      const server = await this.resolveServerUrl();
      const res = await fetch(`${server}/api/studybuddy/interactive/command`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ command, text })
      });
      if (!res.ok) throw new Error(await res.text() || "Request failed");
      return await res.json();
    } catch (err) {
      const message = err.message || "Unknown error";
      if (message.includes("not running")) {
        new import_obsidian.Notice("Vocab is not running. Please start it first.");
      } else {
        new import_obsidian.Notice("Server error: " + message);
      }
    }
  }
  async onload() {
    console.log("Vocab Plugin loaded");
    this.resolveServerUrl().catch(() => {
    });
    this.registerView(
      VIEW_TYPE_VOCAB,
      (leaf) => new VocabWebView(leaf)
    );
    this.addCommand({
      id: "open-vocab-web",
      name: "Start Vocab",
      callback: async () => {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_VOCAB);
        if (existing.length > 0) {
          this.app.workspace.revealLeaf(existing[0]);
          return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({
          type: VIEW_TYPE_VOCAB,
          active: true
        });
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const selectedText = editor.getSelection();
        if (!selectedText) return;
        this.resolveServerUrl().then(() => {
        }).catch(() => {
          menu.addItem((item) => {
            item.setTitle("\u26A0\uFE0F Vocab server not running").setDisabled(true);
          });
        });
        const actions = [
          { label: "Listen", command: "speak" },
          { label: "Search", command: "search" },
          { label: "Add to Library", command: "add_to_library" },
          { label: "Explain", command: "ask_ai" },
          { label: "Translate", command: "vi" },
          { label: "Example", command: "examples" },
          { label: "Paraphrase", command: "paraphrase" },
          { label: "Speak", command: "mimic" }
        ];
        menu.addSeparator();
        actions.forEach(({ label, command }) => {
          menu.addItem((item) => {
            item.setTitle(`Vocab ${label}`).onClick(async () => {
              new import_obsidian.Notice(`${label}...`);
              await this.sendCommand(command, selectedText);
            });
          });
        });
        menu.addSeparator();
        menu.addItem((item) => {
          item.setTitle("Vocab Settings \u2192 Zoom In").onClick(() => {
            document.dispatchEvent(new CustomEvent("vocab-zoom-in"));
          });
        });
        menu.addItem((item) => {
          item.setTitle("Vocab Settings \u2192 Zoom Out").onClick(() => {
            document.dispatchEvent(new CustomEvent("vocab-zoom-out"));
          });
        });
      })
    );
  }
};
