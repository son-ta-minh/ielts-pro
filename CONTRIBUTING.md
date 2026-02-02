# 📖 Working Principles

This document records the principles and conventions we will follow during the development of this project. Each principle is indexed for easy reference.

---

### 0. Core Mandate

#### 0.1. User Ownership of UI/UX
The user is the sole owner of the UI/UX and overall product direction. All changes must be explicitly requested. If a flow or visualization change is needed, the user will provide explicit instructions.

---

### 1. UI/UX Principles

#### 1.1. Separation of Concerns (UI vs. Logic)
Strictly separate presentational components from their underlying logic. Each UI component will be split into two files: a `_UI.tsx` file containing all presentational code (JSX, styles, CSS classes), and a corresponding `.tsx` file for the component's logic and state management. This allows for faster development when purely visual changes are requested, as modifications can be isolated to UI files without affecting business logic, and vice-versa.

#### 1.2. User-Friendly Notifications
Notifications should be user-friendly, concise, and avoid technical jargon. Display notifications only when truly necessary and avoid stating obvious outcomes. For example, a "Restore Complete" notification is redundant if the user can see the library count update on the Dashboard immediately after the action.

#### 1.3. Visual Separation
Avoid using horizontal lines (`<hr>`, `border-t`, `border-b`) as visual separators. Instead, rely on spacing (margins/padding), cards, and background colors to create clear visual hierarchy and separation between elements. This promotes a cleaner, more modern interface.

---

### 2. Project Structure Principles

#### 2.1. Component Granularity
Break down large components into smaller, more focused sub-components, each in its own file. This improves reusability, simplifies maintenance, and minimizes the token count when updating code by avoiding changes to large, monolithic files.

#### 2.2. Configuration Management
System-level data, such as AI model names, algorithm variables, or feature flags, must be managed in a centralized configuration service (`settingsManager.ts`). Avoid hardcoding these values directly in components or services to ensure the application is flexible, maintainable, and easy to update without requiring code changes.

---

### 3. Code Logic Principles

#### 3.1. Reusability
Avoid creating new classes/components hastily. Instead, prioritize designing reusable code that can be applied across different parts of the application. This ensures a consistent UI and logic, simplifies long-term maintenance, and helps to cleanly separate general-purpose functionality from specific feature implementations.

#### 3.2. Grading Logic for Recall-Based Tests
This principle applies specifically to challenges like "Collocation Recall" and "Idiom Recall" where a user must provide multiple correct answers in any order.

-   **Incorrect Approach (DO NOT USE):** Iterating through the user's input textboxes and checking if the content of each box exists in the list of correct answers. This logic fails when a user enters a correct answer multiple times or leaves some boxes empty, as it incorrectly marks textboxes as correct based on their content without ensuring that all unique correct answers have been provided.

-   **Correct Approach (STRICTLY ENFORCE):** The logic must iterate through the **list of correct answers** (the source of truth) and check if each one can be found in a mutable "pool" of user-provided answers.

    1.  Create a mutable array (`userAnswerPool`) of the user's answers, normalized for grading.
    2.  Initialize a `details` object to store the results.
    3.  Loop through the **correct answers list** (`correctItems`) from the challenge data, one by one, using its index.
    4.  For each `correctItem`, search for its normalized form in the `userAnswerPool`.
    5.  If a match is found:
        -   Mark the result for the **correct answer's index** as `true` in the `details` object (e.g., `details[correctItemIndex] = true`).
        -   **Crucially, remove the matched answer** from the `userAnswerPool` to prevent it from being matched again (this correctly handles duplicate user inputs).
    6.  If no match is found, mark the result for the **correct answer's index** as `false` (`details[correctItemIndex] = false`).

-   **Example:**
    -   Correct answers: `["a", "b", "c"]`
    -   User input: `["c", "", ""]`
    -   The loop checks for "a" -> not found -> `details["0"] = false`.
    -   The loop checks for "b" -> not found -> `details["1"] = false`.
    -   The loop checks for "c" -> found -> `details["2"] = true`, and "c" is removed from the user's answer pool.
    -   **Final Result:** A `details` object `{ "0": false, "1": false, "2": true }` is returned, correctly indicating that only the third correct answer was provided.

#### 3.3. Grading Normalization
When grading any test or challenge, both the user's input and the correct answer from the word's data must be normalized before comparison. Use the existing `normalizeAnswerForGrading` utility for this purpose. This ensures that minor differences in casing, punctuation, or whitespace do not cause a correct answer to be marked as incorrect.

#### 3.4. Test Generation Logic (TestModal)
When modifying `TestModal.tsx`, strict adherence to the following logic is required to maintain the distinction between modes:

1.  **Quick Test (`handleQuickStart`):**
    -   **Goal:** A fast, focused check (Max 4 questions).
    -   **Logic:** Do **NOT** select all available types. Use a strict priority queue to select specific challenges:
        1.  Meaning Quiz.
        2.  Collocation (Easy variant - Context/Multi).
        3.  Paraphrase (Easy variant - Context).
        4.  Random from remaining (IPA, Prep, Family, Idiom).
    -   **Constraint:** Pick **specific individual challenges** (not just types) to strictly limit the total count to 4. Do NOT default to adding all challenges of a certain type.

2.  **Master It (`handleMasterStart`):**
    -   **Goal:** Focus on weak spots (Gap filling).
    -   **Logic:** Filter `challengeStats` to find ONLY types where `score < total`.
    -   **Difficulty:** Use `getDeduplicatedSelection(..., 'easy')`. Prioritize recognition (matching/multi-choice) over recall (typing) to facilitate learning.

3.  **Challenge Mode (`handleChallengeStart`):**
    -   **Goal:** Full competency check (Hardcore).
    -   **Logic:** Select ALL available challenge types.
    -   **Difficulty:** Use `getDeduplicatedSelection(..., 'hard')`. Prioritize recall (fill-in-the-blanks) over recognition.

4.  **Deduplication:**
    -   Never simply add all types from `availableChallenges`. Always pass the selection through `getDeduplicatedSelection` (or manual priority logic) to ensure we don't ask the same question twice in different formats (e.g., don't ask Collocation Match AND Collocation Fill in the same session).

---

### 4. AI Interaction Principles

#### 4.1. Prompt Isolation & Centralization
Each AI prompt must reside in its own dedicated file within a `prompts` directory. These individual prompt functions should be exported from a central service file (`promptService.ts`) for consistent use across both direct API calls and manual copy-paste workflows. When updating a prompt, modify only the specifically requested part to ensure focused and fast changes.

---

### 5. Development Process Principles

#### 5.1. Minimal Changes & Conflict Resolution
When implementing a new request, adhere to the principle of minimal changes. If the requested logic conflicts with the existing codebase, do not attempt to resolve the conflict autonomously. Instead, document the issue in `issues.md`. Each entry in `issues.md` should have a unique ID and a concise description of the conflict. This practice prevents incorrect assumptions and maintains code integrity, especially in cases where development context might be lost (e.g., a cancelled generation).

#### 5.2. Source of Truth and Scope of Changes
The provided codebase is the absolute source of truth. The AI's internal memory or previous states of the code are not to be trusted or used as a reference. Modifications must be **the exact changes specified by the user** and nothing more. No modifications, however minor, shall be made to any file unless explicitly requested in the most recent prompt. Every change must be minimal and strictly scoped to address only the latest user request.

#### 5.3. Cloning Procedure
When a "clone" request is received, the following rules must be strictly followed:
1.  **Creation Only:** Create the new file(s) at the specified location by copying the source file(s).
2.  **No Adaptation:** Do not modify any existing code to import or use the newly cloned file(s). The responsibility for integration lies in subsequent, explicit requests.
3.  **Minimal Clone Modifications:** The logic within the cloned file(s) must remain identical to the source, with only the following exceptions being permissible:
    *   **Import Paths:** Update import statements to be relative to the new file's location.
    *   **Class/Component Naming:** Rename the primary class, component, or function to match the new filename (e.g., `MyComponent` in `MyComponent.tsx`).
    *   **Export Statement:** Update the main export statement to use the new name.

#### 5.4. Adaptation of Cloned Components
When instructed to adapt existing code to use a cloned component, the following rules apply:
1.  **Name Replacement:** Replace all instances of the original component's name with the new clone's name.
2.  **Import Path Update:** Modify the import statement to point to the new clone's file path.
3.  **No Autonomous Fixes:** Do not attempt to fix any errors that may arise from the adaptation. Making autonomous changes can introduce unintended side effects and deviate from the principle of minimal changes. The responsibility for resolving conflicts lies in subsequent, explicit user requests.

---

### 6. Code Optimization & Refactoring

#### 6.1. Principle of Explicit Refactoring
Code optimization and refactoring must not be performed independently. Do not optimize, redesign, or refactor any part of the application unless explicitly instructed to do so by the user. If a refactoring task is given, it must strictly adhere to the user's request without introducing unsolicited changes.