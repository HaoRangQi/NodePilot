# Phase 4 Versions 只读列表接入 - Evidence

No evidence has been recorded yet.

## EvidenceBundleDraft

- Artifact key: frontend-tests
- Type: command
- Source: pnpm test
- Summary: Vitest passed: 2 files / 7 tests, including Versions rendering installedVersions from backend snapshot.
- Verifier: terminal output 2026-06-01 23:05

## EvidenceBundleDraft

- Artifact key: frontend-build
- Type: command
- Source: pnpm build
- Summary: TypeScript and Vite production build passed after removing static localVersions.
- Verifier: terminal output 2026-06-01 23:05

## EvidenceBundleDraft

- Artifact key: rust-tests
- Type: command
- Source: cargo test --manifest-path src-tauri/Cargo.toml
- Summary: Rust tests still passed: 20 tests.
- Verifier: terminal output 2026-06-01 23:05

## EvidenceBundleDraft

- Artifact key: ui-versions-check
- Type: browser
- Source: Browser DOM check at http://localhost:1420/ Versions
- Summary: Versions screen rendered 2 version rows from snapshot, current/default/LTS chips, no horizontal overflow, no Tauri default page.
- Verifier: browser output 2026-06-01 23:06
