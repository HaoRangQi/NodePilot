# Fix Window Control Buttons

## User Request

The three custom buttons in the upper-left corner do not work.

## Scope

- Diagnose why close, minimize, and maximize buttons do not affect the Tauri window.
- Keep the existing custom button UI unchanged.
- Apply the smallest fix at the canonical owner.

## Root Cause

The React buttons were already wired to `getCurrentWindow().close()`, `minimize()`, and `toggleMaximize()`, but `src-tauri/capabilities/default.json` only granted `core:window:allow-start-dragging`.

Tauri v2 requires explicit permissions for window commands, so the custom buttons were blocked by capability configuration.
