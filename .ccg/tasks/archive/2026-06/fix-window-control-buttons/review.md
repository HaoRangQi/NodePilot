# Review

## Findings

- Critical: none.
- Warning: none.
- Info: External model review was not required for this S/low-risk fix; the functional change is four capability entries.

## Verification

- Reproduced the missing-permission condition with:
  `jq -e '.permissions as $p | ["core:window:allow-close", "core:window:allow-minimize", "core:window:allow-toggle-maximize", "core:window:allow-start-dragging"] | all(. as $permission | $p | index($permission))' src-tauri/capabilities/default.json`
  It returned `false` before the fix.
- The same check returned `true` after the fix.
- Tauri generated capability output contains:
  - `core:window:allow-close`
  - `core:window:allow-minimize`
  - `core:window:allow-start-dragging`
  - `core:window:allow-toggle-maximize`
- `pnpm test` passed: 12 files, 120 tests.
- `pnpm build` passed.
- `git diff --check` passed.
- Existing `pnpm tauri dev` native app process restarted after the capability change and is running at `http://localhost:1420/`.
