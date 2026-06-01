# Phase 2 Home 只读数据接入 - Checkpoint

- Task ID: 2026-06-01-phase2-home-readonly
- Current todo: 实现环境摘要 command 和前端 Home 接入
- Active slice: Phase 2 Home 只读数据接入
- Blocked on: none
- Next step: 先写覆盖新契约/前端 fallback 的测试，再实现。

## Checkpoint Update

- Current todo: 继续按 docs/EXECUTION.md 推进 Phase 2 后续真实数据/写操作前置能力
- Active slice: Phase 2 Home 只读数据接入
- Completed todos:
- 新增 environment_summary Tauri command；新增 TS backend API/types；Home/top bar 接入只读 snapshot；补测试和文档勾选；关闭超时 explorer。
- Evidence refs:
- pnpm test, pnpm build, cargo test, pnpm tauri dev, Browser Home check
- Blocked on: none
- Next step: 下一切片建议做 Versions 本地列表真实数据接入或 Activity task center 基础模型。

## DriftCheckDraft

- Scope status: 仍在 Phase 2 Home 只读接入范围内。
- Compatibility status: 保持前端不直接执行 shell；新增只读 Tauri command；写操作仍未实现。
- Retirement status: mock fallback 仍保留，后续真实 backend 完整接入后可逐步降级为测试 fixture。
- New risk signals:
- none
- Advisory decision: continue
