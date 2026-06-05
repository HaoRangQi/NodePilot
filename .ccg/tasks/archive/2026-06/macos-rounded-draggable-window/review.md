# Review

## Findings

- `data-tauri-drag-region` alone did not drag the live Tauri dev window.
  - Resolution: added explicit `getCurrentWindow().startDragging()` on left mouse down in the custom chrome.
- Control buttons could start drag through event bubbling.
  - Resolution: stopped mouse down propagation on `.window-controls`.
- CSS-only border radius on an opaque undecorated window would still expose square native corners.
  - Resolution: enabled `transparent` and `macOSPrivateApi`, cleared root/html/body backgrounds, and clipped `.app-shell` with `border-radius`.

## Verification

- `pnpm test src/App.test.tsx -- --runInBand`: 45 tests passed.
- `pnpm test`: 12 files passed, 119 tests passed.
- `pnpm build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.
- `pnpm tauri dev`: compiled and launched `target/debug/nodepilot` without the transparent window warning after enabling `macOSPrivateApi`.
