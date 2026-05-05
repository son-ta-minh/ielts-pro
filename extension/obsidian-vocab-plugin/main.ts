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
    container.empty();

    const iframe = document.createElement("iframe");
    iframe.src = "https://son-ta-minh.github.io/ielts-pro/";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";

    container.appendChild(iframe);
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

    const candidates = await this.getDetectedServerCandidates();

    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/health`);
        if (res.ok) {
          this.activeServerUrl = url;
          return url;
        }
      } catch {}
    }

    throw new Error("Cannot reach server");
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

      if (!res.ok) throw new Error("Request failed");

      return await res.json();
    } catch (err) {
      console.error("Command error:", err);
      new Notice("Server error");
    }
  }


  async onload() {
    console.log("Vocab Plugin loaded");

    this.registerView(
      VIEW_TYPE_VOCAB,
      (leaf) => new VocabWebView(leaf)
    );

    this.addCommand({
      id: "open-vocab-web",
      name: "Start Vocab",
      callback: async () => {
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
      })
    );
  }
}