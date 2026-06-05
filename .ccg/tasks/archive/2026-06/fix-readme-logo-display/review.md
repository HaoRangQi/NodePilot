# Review

## Findings

- Critical: none.
- Warning: none.
- Info: External model review was not required for this S/low-risk README asset display fix.

## Verification

- `rg -n "nodepilot-logo-readme\\.png|raw\\.githubusercontent.*nodepilot-logo" README.md README.en.md src` returned no matches.
- `git diff --check` passed.
- `pnpm build` passed.
- README header logo now references `src/assets/nodepilot-logo.svg` with `width="104"`.
- README app screenshot now uses `width="960"`.
- `src/assets/nodepilot-logo-readme.png` was deleted to avoid future stale-path reuse.
