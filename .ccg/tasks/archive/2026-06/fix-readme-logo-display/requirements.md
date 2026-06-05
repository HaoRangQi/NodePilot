# Fix README Logo Display

## User Request

The README logo is too large, visually wrong, and still appears to show the old icon instead of the latest icon.

## Scope

- Replace the README header logo reference with the latest vector icon source.
- Constrain the README logo display size.
- Constrain the app screenshot display size.
- Remove the stale README logo PNG asset so GitHub/browser caching cannot keep surfacing it through the old path.

## Root Cause

The README still referenced `src/assets/nodepilot-logo-readme.png` through a raw GitHub URL. Markdown rendered the 640x640 image at its natural size, and GitHub/browser caching could continue showing the old dark PNG for that path.
