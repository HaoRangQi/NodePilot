# Phase 2 Home 只读数据接入 - Intent

## TaskIntentDraft

- Requested outcome: 按 docs/EXECUTION.md 推进 Phase 2，让 Home 从 Tauri 后端读取环境摘要、健康检查和已安装版本，并按真实完成项更新文档。
- Goal: 完成 Phase 2 Home 可验证的只读环境总览切片。
- Success evidence:
- 前端测试、pnpm build、cargo test 通过；Home 使用 Tauri command 数据且有 mock fallback；docs/EXECUTION.md 只勾真实完成项。
- Stop condition: 完成并验证；或发现后端契约/平台限制导致当前切片需重新规划；或验证失败需要继续修复。
- Non-goals:
- 商业化、账号、云同步、遥测、真实写操作、Windows 手动端到端验证。
- Scope: src-tauri/src/nvm, src-tauri/src/lib.rs, src/shared, src/App.tsx, src/App.test.tsx, docs/EXECUTION.md
- Change kinds:
- implementation
- Risk hints:
- 跨 Rust/TS 契约、Tauri invoke fallback、不能误勾未实现 backend 写操作。

## BaselineReadSetHint

- docs/EXECUTION.md Phase 2
- src-tauri/src/nvm/types.rs
- src/App.tsx

## ImpactStatementDraft

- Compatibility boundary: 不实现 install/uninstall/use/default 写操作；不承诺改变用户 shell 环境。
- Affected layers:
- frontend/backend-contract
- Owners:
- NodePilot Home read-only integration
- Invariants:
- 前端禁止直接执行 shell；所有环境读取通过 Tauri command；浏览器测试必须可 fallback。
- Non-goals:
- 商业化、账号、云同步、遥测、真实写操作、Windows 手动端到端验证。

These records are Method Pack drafts / hints, not authoritative runtime decisions.
