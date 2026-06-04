# Verification Artifacts

本目录由 `pnpm verify:artifacts` 生成，用于记录最近一次本地自动化验证快照。

这些产物不替代 [执行文档](../EXECUTION.md) 中的桌面 UI / 人工验收项。

如果目录里看到历史 `tauri-dev-bridge` 产物，那只是辅助脚本留下的单次记录，不属于默认自动化验收链。

## 2026-06-04

- [`tauri dev` smoke](./2026-06-04-tauri-dev-smoke.json)
  - 宿主平台：macOS
  - 结果：success
  - 覆盖：`pnpm tauri dev` 启动、`http://localhost:1420/` 可用、桌面进程拉起、开发进程自动清理
  - 未覆盖：真实界面交互、桌面窗口视觉布局、多视图人工验收
- [`nvm-sh` e2e](./2026-06-04-nvm-sh-e2e.json)
  - 宿主平台：macOS
  - 结果：success
  - 覆盖：`install nvm`、`detect`、`list remote`、`install Node`、`list installed`、`activate Node`、`set default`、`write .nvmrc`、`read .nvmrc`、`apply .nvmrc`、`uninstall Node`
  - 未覆盖：真实桌面 UI 交互、桌面窗口视觉布局、多视图人工验收
- [`nvm-windows` probe](./2026-06-04-nvm-windows-probe.json)
  - 宿主平台：macOS
  - 结果：skipped
  - 覆盖：probe binary 编译 / 运行路径、非 Windows 宿主的 skip contract
  - 未覆盖：Windows 实机 `detect`、`list installed`、`list available`、`install`、`use`、`uninstall`

## Windows probe 约束

- 默认模式只做只读 probe。
- 只有显式设置 `NODEPILOT_WINDOWS_E2E_WRITE=1` 时，才会尝试真实写操作。
- 建议在独立 Windows 验证环境中运行，并保留独立产物文件。
