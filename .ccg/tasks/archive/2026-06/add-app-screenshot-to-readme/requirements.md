# Add App Screenshot To README

## User Request

Capture an app screenshot and place it in the README.

## Scope

- Generate a stable screenshot of the NodePilot app UI.
- Save the screenshot as a repository asset.
- Add the screenshot to both Chinese and English README files.
- Update README asset documentation so it no longer only references the logo.

## Screenshot Approach

System `screencapture` could not capture the native Tauri window in this environment due macOS screen-recording restrictions, so the final screenshot was captured with Chrome DevTools Protocol against the local Vite app at `http://localhost:1420/`.

A temporary, read-only Tauri IPC mock was injected before page load so the screenshot shows the complete app state rather than the initial unsupported browser-only state. This mock was not written into the project.
