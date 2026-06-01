# Phase 7 Activity 基础模型 - Intent

## TaskIntentDraft

- Requested outcome: 按 docs/EXECUTION.md 推进 Phase 7，建立前端 Activity 任务中心基础模型与 UI 展示，覆盖任务状态、stdout/stderr、失败摘要、日志脱敏和读写并发规则。
- Goal: 完成 Activity task center 的本地基础模型，为后续真实写操作接入打底。
- Success evidence:
- 前端测试、pnpm build、cargo test 通过；Activity UI 显示分区日志/状态/失败修复；docs/EXECUTION.md 只勾真实完成项。
- Stop condition: 完成并验证；或发现需要真实任务运行器才能证明的项保持未勾；或验证失败继续修复。
- Non-goals:
- 真实任务取消、真实进程管理、后端持久化、真实写操作互斥执行器。
- Scope: src/shared/activity, src/App.tsx, src/App.css, src/App.test.tsx, docs/EXECUTION.md
- Change kinds:
- implementation
- Risk hints:
- 不能把静态 mock 当真实后端任务；写操作互斥只能先实现模型规则，不能声称真实写操作已接入。

## BaselineReadSetHint

- docs/EXECUTION.md Phase 7
- src/App.tsx ActivityScreen
- src-tauri/src/nvm/safety.rs redaction behavior

## ImpactStatementDraft

- Compatibility boundary: 只做本地模型和 UI，不接真实 install/uninstall/use/default 执行。
- Affected layers:
- frontend-task-model
- Owners:
- NodePilot Activity task center
- Invariants:
- 日志不得展示 token/auth header/secret；前端仍不直接执行 shell；真实写操作未实现。
- Non-goals:
- 真实任务取消、真实进程管理、后端持久化、真实写操作互斥执行器。

These records are Method Pack drafts / hints, not authoritative runtime decisions.
