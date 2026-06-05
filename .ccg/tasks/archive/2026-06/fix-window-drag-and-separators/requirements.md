# Requirements

- Restore dragging for the custom undecorated Tauri window.
- Remove the top chrome bottom separator line.
- Remove the navigation rail right separator line.
- Keep the macOS-style top-left controls and rounded window shell.

# Notes

- `core:window:default` does not grant `start_dragging`; `core:window:allow-start-dragging` must be explicit in the capability file.
- Electron-style `-webkit-app-region` was removed so React mouse events can reliably call Tauri's drag API.
