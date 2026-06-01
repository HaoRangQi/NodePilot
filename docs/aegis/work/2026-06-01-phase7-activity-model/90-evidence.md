# Phase 7 Activity 基础模型 - Evidence

## EvidenceBundleDraft

- Artifact key: frontend-tests
- Type: command
- Source: `pnpm test`
- Summary: Vitest passed: 3 files / 12 tests. Activity UI test covers task states, stdout/stderr split logs, log collapse, copy logs, and sensitive log redaction.
- Verifier: terminal output 2026-06-01 23:40

## EvidenceBundleDraft

- Artifact key: frontend-build
- Type: command
- Source: `pnpm build`
- Summary: TypeScript and Vite production build passed after Activity model/UI and `index.html` title update.
- Verifier: terminal output 2026-06-01 23:40

## EvidenceBundleDraft

- Artifact key: rust-tests
- Type: command
- Source: `cargo test --manifest-path src-tauri/Cargo.toml`
- Summary: Rust test suite still passed: 20 tests.
- Verifier: terminal output 2026-06-01 23:40

## EvidenceBundleDraft

- Artifact key: ui-activity-check
- Type: browser
- Source: Browser viewport checks at `http://localhost:1420/` Activity
- Summary: Activity screen checked at 960, 1280, and 1440 px. No horizontal overflow, no out-of-viewport controls, title is NodePilot, write-lock notice is visible, 12 log blocks are present, redacted token is visible, raw token is absent.
- Verifier: browser output 2026-06-01 23:37
