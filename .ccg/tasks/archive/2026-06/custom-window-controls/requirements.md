# Requirements

- Remove the native Tauri window header by disabling native decorations for the main window.
- Add three compact custom window control buttons in the top-left of the application UI.
- Keep the buttons visual-only in the surface while preserving accessible labels and keyboard focus.
- Preserve the existing app navigation and content layout without overlapping the brand mark or page header.
- Use Tauri v2 window APIs for minimize, maximize/restore, and close.

# Analysis Notes

- Scope is `M / medium / frontend` because this touches both Tauri window configuration and React/CSS UI shell behavior.
- `.ccg/spec` has no readable project spec entries in this workspace.
- CCG dual-model analysis was attempted. Claude returned actionable guidance; gemini failed locally because no auth method or `GEMINI_API_KEY` is configured.
- TDD Route: `light`. This is a visual shell change with a small interaction surface; add a focused React test before production edits, then verify with frontend test/build and a local visual check.
