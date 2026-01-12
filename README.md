# IELTS Vocab Pro 🚀

> **A serious, minimalist vocabulary review tool for high-band IELTS learners.**

![IELTS Vocab Pro Dashboard](https://via.placeholder.com/1200x600.png?text=IELTS+Vocab+Pro+Dashboard)

## 📖 Introduction

**IELTS Vocab Pro** is not your typical gamified language app. It is a specialized tool designed for serious learners aiming for Band 7.0+ in IELTS Speaking and Writing.

It combines the science of **Spaced Repetition Systems (SRS)** with the generative power of **Google Gemini AI** to automate the tedious parts of vocabulary management—finding definitions, IPAs, and examples—allowing you to focus entirely on retention and usage in context.

---

### 🌟 Manifesto: Build *Your* Vocabulary.

This app is built on a core philosophy: **Relevance > Quantity.**

We do not provide pre-set lists of "Top 1000 Words" you will never use. Instead, we provide the tools for you to **curate and master the words you actually encounter** in your reading, listening, and daily life.

1.  **Track what you see:** Found a cool word in an article? Add it.
2.  **Ignore the noise:** Don't waste brainpower on words irrelevant to your context.
3.  **Own the definition:** Use AI to refine definitions into your native language for instant comprehension.

---

## 💡 Philosophy

Most vocabulary apps fail IELTS learners in three ways:
1.  **Lack of Context:** Flashcards are often isolated.
2.  **Input Friction:** Manually typing definitions and IPA for hundreds of words is exhausting.
3.  **Data Clutter:** Adding "leaves" when you already have "leave" creates duplicates and messes up learning stats.

**IELTS Vocab Pro solves this:**
*   **AI Automation:** Input a raw list (e.g., `ubiquitous; mitigate`), and the AI fills in the IPA, **native language definition**, collocations, and word families.
*   **Smart Merging:** The system detects headwords (e.g., merging "leaves" into "leave") to keep your library clean.
*   **Contextual Units:** Group words into "Units" and let AI generate an essay using those specific words so you see them in action.

---

## ✨ Key Features

### 1. 🧠 Smart Review (SRS)
*   An adaptive algorithm schedules reviews based on your performance (Easy, Hard, Forgot).
*   **Drill Modes:** Standard, Spelling, Meaning, IPA, and Preposition gap-fill.
*   **Audio:** High-quality TTS (System or AI-based) for pronunciation practice.

### 2. ⚡ AI Refine & Merge
*   **Batch Processing:** Add dozens of words at once.
*   **Auto-Enrichment:** Automatically fetches IPA, **native definitions**, essential IELTS collocations, and synonyms.
*   **Duplicate Prevention:** Intelligently maps variations to their base form (Lemma) to prevent library bloat.

### 3. 🧪 Unit Lab (Context Mastery)
*   Create custom study units (e.g., "Environment", "Technology").
*   **AI Essay Generation:** The app generates a band-scoring essay weaving your target vocabulary together.
*   **Live Highlight:** Interact with words directly inside the reading passage.

### 4. 🔄 Paraphrase Practice
*   A dedicated lab to practice the #1 IELTS skill: Paraphrasing.
*   **Scenario Generation:** AI creates context-specific sentences (Academic vs. Casual).
*   **Strict Evaluation:** Receive a score (0-100) based on Meaning, Lexical Resource, and Grammar, plus a model answer.

### 5. 🔒 Offline First & Privacy
*   **Local Database:** All data lives in your browser (IndexedDB).
*   **JSON/CSV Support:** Full backup and restore capabilities.
*   **API Security:** Your API key is stored locally and used directly with Google's endpoints.

---

## 🛠 Tech Stack

*   **Core:** React 19, TypeScript, Vite.
*   **Styling:** Tailwind CSS, Lucide React.
*   **State/Data:** Raw IndexedDB (for performance).
*   **AI:** Google GenAI SDK (Gemini 2.5/3.0 Models).
*   **Charts:** Recharts.

---

## 🚀 Installation & Setup

### Prerequisites
*   Node.js (v18+).
*   A **Google Gemini API Key**.

### Steps

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/ielts-vocab-pro.git
    cd ielts-vocab-pro
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure API Key:**
    *   Create a file named `.env` in the root directory.
    *   Add your key:
        ```env
        API_KEY=your_actual_google_api_key_here
        ```
    *   *Alternatively:* You can skip this and enter the key manually in the **Settings** tab of the application.

4.  **Run the app:**
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

---

## 📖 User Guide

### 1. Adding Vocabulary
*   Navigate to **Library** or click **Add**.
*   Type or paste words separated by semicolons (e.g., `resilient; ubiquitous; mitigate`).
*   Click **Add with AI** to auto-fill details based on your selected **Native Language**.

### 2. Refining Data
*   If you have imported a raw CSV, select the words in the library list.
*   Click the **Refine** button at the bottom.
*   The AI will normalize the words, fix definitions, and merge duplicates.

### 3. Studying
*   Check the **Dashboard** daily for "Review Due" items.
*   Use **Unit Lab** to create a thematic collection. Click "AI Refine" inside a Unit to generate a reading passage containing your words.

### 4. Paraphrasing
*   Go to **Paraphrase** tab.
*   Choose a mode (e.g., "Make it more Academic").
*   Write your version and get instant feedback.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License. Free for personal and educational use.