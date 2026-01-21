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