# Phase 4 Versions 只读列表接入 - Checkpoint

- Task ID: 2026-06-01-phase4-versions-readonly
- Current todo: 接入 Versions 页面只读 installedVersions
- Active slice: Phase 4.1 Version List
- Blocked on: none
- Next step: 先加测试覆盖 Versions 页面使用 snapshot 数据，再实现。

## Checkpoint Update

- Current todo: 继续按 docs/EXECUTION.md 推进 Phase 4.2/4.3 写操作前置或 Phase 7 Activity
- Active slice: Phase 4.1 Version List
- Completed todos:
- Versions 页面使用 backendSnapshot.installedVersions；删除静态 localVersions；补测试；更新 Phase 4.1 文档勾选；Tauri dev + 浏览器检查通过；超时 explorer 已释放。
- Evidence refs:
- pnpm test, pnpm build, cargo test, pnpm tauri dev, Browser Versions check
- Blocked on: none
- Next step: 下一切片建议做 Activity task center 基础记录模型，为写操作互斥和日志打底。

## DriftCheckDraft

- Scope status: 仍在 Phase 4.1 只读版本列表范围内。
- Compatibility status: 保持前端不执行 shell；使用已有 backend snapshot；写操作仍是 UI 预留。
- Retirement status: Versions mock 列表已移除；mock fallback 仍集中在 shared/api/backend.ts。
- New risk signals:
- none
- Advisory decision: continue
