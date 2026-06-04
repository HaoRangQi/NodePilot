# NodePilot 二期计划

## 目的

本文收口“不阻塞首版交付，但明确值得继续做”的后续项。

当前首版的发布边界很明确：

- 首版非人工部分已经交付。
- 首版仍需人工完成的，只剩 [`docs/EXECUTION.md`](./EXECUTION.md) 中的 `10.2 Manual macOS/Linux Verification` 和 `10.3 Manual Windows Verification`。
- 商业化、账号、云同步、遥测仍然不进入二期范围。

## 二期项

### 1. 验证链稳定化

- [ ] 稳定 `pnpm verify:tauri-dev:bridge`，降低真实桌面窗口导航、点击和项目读取链路的抖动。
- [ ] 继续补齐桌面 UI 自动化覆盖，尽量减少对人工点击验收的依赖。
- [ ] 在真实 Windows 主机沉淀一次可复用的 `pnpm verify:nvm-windows:probe` 写操作验证产物。

### 2. Backend 能力补全

- [ ] 评估并实现 `offline install`，前提是 `nvm-sh` 或 `nvm-windows` 确实存在可靠支撑能力。
- [ ] 增加 mirror / proxy 编辑能力，并保留参数白名单校验、敏感信息脱敏和失败提示。

## 不在二期范围

- 商业化入口。
- 账号系统。
- 云同步。
- 遥测。
- 团队管理。
- Volta、fnm、asdf、Docker、WSL 管理。
