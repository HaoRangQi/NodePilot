# NodePilot

NodePilot 是一个本地桌面版 Node 版本与项目运行环境管理器。首版目标是把 `nvm-sh/nvm` 和 `nvm-windows` 的常用能力整理成一个 Material You / Material 3 风格的工具型界面。

当前仓库先落地静态 UI 原型：不执行 shell，不接真实 nvm 后端，只用 mock 数据展示 Home、Versions、Remote、Projects、Activity 和 Settings 六个主视图，方便先评审信息架构、双语文案和 Light / Dark 主题。

## 支持范围

- 计划支持 macOS / Linux 的 `nvm-sh/nvm`。
- 计划支持 Windows 的 `nvm-windows`。
- 不支持 Volta、fnm、asdf、Docker 和 WSL 管理。
- 不包含账号、云同步、遥测、商业化入口和团队管理。

## 本地开发

```bash
pnpm install
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
```

## 当前限制

- 当前版本是 UI 原型，没有真实 backend command。
- 所有版本、项目、健康检查和日志内容都是 mock 数据。
- `Light / Dark` 主题和 `中文 / English` 语言选择保存在浏览器本地存储中。

## 故障排查

- 如果 `pnpm build` 失败，先确认 Node 与 pnpm 可用，并重新安装依赖。
- 如果 `cargo test` 失败，确认本机 Rust toolchain 已安装。
- 如果 `pnpm tauri dev` 无法打开窗口，确认 Tauri 2 的系统依赖已安装。
