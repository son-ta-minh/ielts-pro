# 📖 Working Principles

### 1. User Authority
- **User Ownership**: The user is the sole owner of UI/UX and product direction.
- **Explicit Instructions**: Implement exactly what is requested. Do not make autonomous design or flow decisions unless asked.

### 2. Code Architecture
- **Separation of Concerns**: Strictly separate presentational code (JSX/Styles in `_UI.tsx`) from logic and state (`.tsx`).
- **Reusability**: Do not duplicate code. Build reusable components and utilities.
- **Configuration**: Use `settingsManager.ts` for system constants, model names, and feature flags. Avoid hardcoding.

### 3. Development Strategy
- **Minimal Changes**: Touch only the files necessary to fulfill the immediate request. Minimize token usage.
- **Source of Truth**: Trust the provided file contents implicitly. Do not rely on AI memory of previous code versions.
- **No Unsolicited Refactoring**: Do not refactor, optimize, or fix unrelated bugs unless explicitly instructed.