# Review

## Findings

- The shell used three different structural backgrounds:
  - `.app-shell`: tinted gradient over background.
  - `.window-chrome`: semi-transparent mix over background.
  - `.navigation-rail`: semi-transparent surface-container mix.
- These differences remained visible after separator borders were removed.

## Resolution

- `.app-shell`, `.window-chrome`, and `.navigation-rail` now all use `var(--md-sys-color-background)`.
- Dark mode uses the same unified structural background rule.
- Cards remain distinct content surfaces.

## Verification

- `pnpm build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.
- Running `pnpm tauri dev` session received Vite HMR update for `src/App.css`.
