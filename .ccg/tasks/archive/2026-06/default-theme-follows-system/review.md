# Review

## Findings

- `getInitialTheme()` already returned `system` when no stored theme existed.
- The app still persisted `"system"` on mount, which turned the default into a stored override.

## Resolution

- When `theme === "system"`, remove `nodepilot.theme` from localStorage instead of writing it.
- Keep `light` and `dark` persistence unchanged.
- Added a regression test that simulates a dark system preference with no stored theme.

## Verification

- `pnpm test src/App.test.tsx -- --runInBand`: 46 tests passed.
- `pnpm test`: 12 files passed, 120 tests passed.
- `pnpm build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.
- Running `pnpm tauri dev` session received Vite HMR update for `src/App.tsx`.
