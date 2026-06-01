# Phase 4 Versions 只读列表接入 - Intent

## TaskIntentDraft

- Requested outcome: 按 docs/EXECUTION.md 推进 Phase 4.1，让 Versions 页面使用 Tauri 后端返回的 installedVersions/snapshot 数据展示本地版本列表。
- Goal: 完成 Versions 本地版本列表的只读数据接入。
- Success evidence:
- 前端测试、pnpm build、cargo test 通过；Versions 页面使用 backend snapshot；docs/EXECUTION.md 只勾真实完成项。
- Stop condition: 完成并验证；或发现后端数据不足导致部分 Phase 4.1 保持未勾；或验证失败继续修复。
- Non-goals:
- 安装/卸载/切换/默认版本写操作、详情抽屉、打开目录、复制版本号。
- Scope: src/App.tsx, src/App.test.tsx, src/shared/types/backend.ts, docs/EXECUTION.md
- Change kinds:
- implementation
- Risk hints:
- 不能把 mock path/npm 当真实 backend 能力；不能实现或勾选写操作。

## BaselineReadSetHint

- docs/EXECUTION.md Phase 4.1
- src/shared/types/backend.ts VersionInfo
- src/App.tsx VersionsScreen

## ImpactStatementDraft

- Compatibility boundary: 不实现 use/default/uninstall 写操作，不修改 Rust adapter 写操作。
- Affected layers:
- frontend/backend-contract
- Owners:
- NodePilot Versions read-only list
- Invariants:
- 前端不执行 shell；写操作按钮只是 UI 预留，不声称功能完成。
- Non-goals:
- 安装/卸载/切换/默认版本写操作、详情抽屉、打开目录、复制版本号。

These records are Method Pack drafts / hints, not authoritative runtime decisions.
