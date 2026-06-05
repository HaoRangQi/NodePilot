# Review

## Findings

- Drag did not work because the frontend called `startDragging()` without an explicit `core:window:allow-start-dragging` capability.
  - Resolution: added the permission in `src-tauri/capabilities/default.json`.
- `-webkit-app-region: drag` can prevent the React mouse handler from receiving the event consistently.
  - Resolution: removed app-region CSS and uses Tauri's `startDragging()` API from `onMouseDown`.
- The UI had two visible separator lines: the custom chrome bottom border and navigation rail right border.
  - Resolution: removed both borders.

## Verification

- `pnpm test src/App.test.tsx -- --runInBand`: 45 tests passed.
- `pnpm build`: TypeScript and Vite production build passed.
- `pnpm test`: 12 files passed, 119 tests passed.
- `git diff --check`: passed.
- `pnpm tauri dev`: relaunched and is running `target/debug/nodepilot`.

## External Review

- Not rerun for this follow-up. The fix is directly tied to a live regression report and applies the missing Tauri permission plus local event-path cleanup.
