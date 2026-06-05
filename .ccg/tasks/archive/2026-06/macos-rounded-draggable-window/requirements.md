# Requirements

- Make the custom undecorated Tauri window visually match macOS rounded window corners.
- Keep the three compact controls in the top-left.
- Restore window dragging from the custom chrome area.
- Prevent dragging from starting when pressing the control buttons.
- Keep the Tauri development app running for manual verification.

# Notes

- Tauri requires `app.macOSPrivateApi = true` for transparent windows on macOS.
- `data-tauri-drag-region` was not enough in the live app, so the chrome also calls `getCurrentWindow().startDragging()` on left mouse down.
