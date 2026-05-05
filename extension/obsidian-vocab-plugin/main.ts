import { Plugin, Editor, MarkdownView, Notice, ItemView, WorkspaceLeaf } from "obsidian";

const VIEW_TYPE_VOCAB = "vocab-webview";

class VocabWebView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
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
    // Remove Obsidian default padding and margin
    (this.containerEl as HTMLElement).style.padding = "0";
    (container as HTMLElement).style.padding = "0";
    (container as HTMLElement).style.margin = "0";
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
        zoom = event.deltaY < 0
          ? Math.min(zoom + 0.1, 2)
          : Math.max(zoom - 0.1, 0.5);

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
}

export default class VocabPlugin extends Plugin {
  FIREBASE_SERVER_DOC_URL = "https://firestore.googleapis.com/v1/projects/vocabpro-5604c/databases/(default)/documents/vocabpro/server";

  FALLBACK_SERVER_CANDIDATES = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "https://127.0.0.1:3000"
  ];

  activeServerUrl: string | null = null;
  serverStatus: "unknown" | "up" | "down" = "unknown";

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
    const candidates: string[] = [];

    if (firebase?.local) candidates.push(firebase.local);
    if (firebase?.host) candidates.push(firebase.host);

    candidates.push(...this.FALLBACK_SERVER_CANDIDATES);

    return [...new Set(candidates)];
  }

  async resolveServerUrl() {
    if (this.activeServerUrl) return this.activeServerUrl;
    if (this.serverStatus === "up" && this.activeServerUrl) return this.activeServerUrl;

    const candidates = await this.getDetectedServerCandidates();

    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/health`);
        if (res.ok) {
          this.activeServerUrl = url;
          this.serverStatus = "up";
          return url;
        }
      } catch {}
    }

    this.serverStatus = "down";
    throw new Error("Vocab server is not running. Please start your local server.");
  }

  async sendCommand(command: string, text: string) {
    try {
      const server = await this.resolveServerUrl();

      const res = await fetch(`${server}/api/studybuddy/interactive/command`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command, text }),
      });

      if (!res.ok) throw new Error(await res.text() || "Request failed");

      return await res.json();
    } catch (err) {
      const message = (err as Error).message || "Unknown error";

      if (message.includes("not running")) {
        new Notice("Vocab is not running. Please start it first.");
      } else {
        new Notice("Server error: " + message);
      }
    }
  }


  async onload() {
    console.log("Vocab Plugin loaded");

    // Warm up server detection in background
    this.resolveServerUrl().catch(() => {
      // ignore error, handled later when user clicks
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
          active: true,
        });
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor: Editor, view: MarkdownView) => {
        const selectedText = editor.getSelection();

        if (!selectedText) return;

        if (this.serverStatus === "down") {
          menu.addItem((item) => {
            item
              .setTitle("⚠️ Vocab server not running")
              .setDisabled(true);
          });
          return;
        }

        if (this.serverStatus === "unknown") {
          menu.addItem((item) => {
            item
              .setTitle("⏳ Checking Vocab server...")
              .setDisabled(true);
          });

          this.resolveServerUrl().catch(() => {});
          return;
        }


        const actions = [
          { label: "Listen", command: "speak" },
          { label: "Search", command: "search" },
          { label: "Add to Library", command: "add_to_library" },
          { label: "Explain", command: "ask_ai" },
          { label: "Translate", command: "vi" },
          { label: "Example", command: "examples" },
          { label: "Paraphrase", command: "paraphrase" },
          { label: "Speak", command: "mimic" },
        ];

        menu.addSeparator();

        // Keep main actions below
        actions.forEach(({ label, command }) => {
          menu.addItem((item) => {
            item
              .setTitle(`Vocab ${label}`)
              .onClick(async () => {
                new Notice(`${label}...`);
                await this.sendCommand(command, selectedText);
              });
          });
        });

        menu.addSeparator();

        menu.addItem((item) => {
          item.setTitle("Vocab Settings → Zoom In").onClick(() => {
            document.dispatchEvent(new CustomEvent("vocab-zoom-in"));
          });
        });

        menu.addItem((item) => {
          item.setTitle("Vocab Settings → Zoom Out").onClick(() => {
            document.dispatchEvent(new CustomEvent("vocab-zoom-out"));
          });
        });
      })
    );
  }
}