# Manual Verification Guide

本目录收口 NodePilot 的桌面 UI / backend 联动手工验收入口。

这些步骤只负责“准备人工验收环境”和“给出检查顺序”，不代表 `docs/EXECUTION.md` 中的 `10.2 / 10.3` 已完成。只有在真实桌面窗口里逐项操作并核对结果后，才能勾选对应项。

## 一键生成发布候选验收包

如果你想把“自动化回归 + 双平台手工验收材料”一次性收口到同一个临时目录，直接运行：

```bash
pnpm verify:release:candidate
```

它会先执行 `pnpm verify:all`，再生成：

- `RELEASE-CANDIDATE.md`
- `RELEASE-CANDIDATE.json`
- macOS / Linux 手工验收包
- Windows 手工验收包

命令输出会直接给出这些路径。该脚本不会自动勾选 `10.2 / 10.3`，只负责把发布候选版所需材料收齐。

## macOS / Linux 最快路径

1. 运行：

```bash
pnpm verify:manual:nvm-sh:prep
```

2. 读取命令输出里的这几个路径：
   - `launchScriptPath`
   - `automationScriptPath`
   - `automationLogPath`
   - `guidePath`
   - `projectDir`
   - `snapshotPath`
   - `resultPath`
   - `checklistPath`
3. 先运行 `automationScriptPath`，确认自动化前置链路已通过。
4. 打开 `guidePath`，先核对其中的隔离环境、自动化边界与建议验收顺序。
5. 运行 `launchScriptPath`，在隔离的 `HOME/NVM_DIR` 中启动 NodePilot。
   - 生成的 launcher 会保留当前 `CARGO_HOME` / `RUSTUP_HOME`，避免 `pnpm tauri dev` 因找不到 Rust toolchain 而失败。
   - 同时会开启结构化 UI snapshot 输出，持续写入 `snapshotPath`。
   - snapshot 会记录当前 screen、dialog、按钮/输入框 label 与窗口内坐标，便于真实桌面点击前先核对目标元素。
6. 按 `guidePath` 中的功能顺序执行并逐项记录结果：
   - `detect / install nvm`
   - `list installed / list remote`
   - `install Node`
   - `activate / set default`
   - `read / apply .nvmrc`
   - `uninstall Node`
7. 每完成一项，就运行：

```bash
pnpm verify:manual:mark /path/to/MANUAL-RESULT.json detect install_nvm
pnpm verify:manual:mark /path/to/MANUAL-RESULT.json --note install_nvm="installed from UI"
```

也可以直接编辑 `resultPath`，把对应字段改成 `true`。
8. 回到仓库运行：

```bash
pnpm verify:manual:sync /path/to/MANUAL-RESULT.json
```

生成结果包括：

- 隔离的临时 `HOME`
- 隔离的 `NVM_DIR`
- 预置 `.nvmrc` 的测试项目目录
- 自动化前置脚本与日志
- 一键启动 `pnpm tauri dev` 的 launcher
- 持续刷新的 `MANUAL-UI-SNAPSHOT.json`
- 对应的手工验收清单
- 可回填 `docs/EXECUTION.md` 的结果模板

建议先把自动化和人工边界分开：

- `pnpm verify:tauri-dev:smoke` 负责验证 `tauri dev` 启动、dev server 可用、桌面进程拉起与清理。
- `pnpm verify:tauri-dev:bridge` 可选用于验证真实桌面窗口里的 `navigate / click nav / read-project` 受控链路；它当前不计入默认自动化证据。
- `pnpm verify:nvm-sh:e2e` 负责验证 macOS/Linux 下 backend 语义链路，例如 `install nvm`、`detect`、`list remote`、`install/use/default/uninstall`、`read/apply .nvmrc`。
- 后续人工验收只需要聚焦剩余桌面 UI 行为是否正确承载这些事实：版本状态刷新、日志展示、文案说明、错误反馈，以及安装 / 切换 / 卸载这类真实写操作。

## Windows 最快路径

1. 在当前仓库运行：

```bash
pnpm verify:manual:nvm-windows:prep
```

2. 读取命令输出里的这几个路径：
   - `powerShellPath`
   - `automationScriptPath`
   - `automationLogPath`
   - `guidePath`
   - `resultPath`
   - `checklistPath`
3. 把生成的材料带到真实 Windows 验证环境。
4. 先执行 `automationScriptPath`，确认自动化前置链路已通过。
5. 如需让 probe 执行真实写操作，显式设置：

```powershell
$env:NODEPILOT_WINDOWS_E2E_WRITE=1
$env:NODEPILOT_WINDOWS_E2E_TARGET_VERSION=20.18.1
pnpm verify:nvm-windows:probe
```

6. 启动 NodePilot 桌面应用，按 `guidePath` 中的 checklist 执行：
   - `detect nvm-windows`
   - `list installed / list available`
   - `install / use / uninstall`
   - `admin` 权限提示
   - `arch` 选择
7. 每完成一项，就运行：

```bash
pnpm verify:manual:mark /path/to/MANUAL-RESULT.json detect_nvm_windows list_installed
pnpm verify:manual:mark /path/to/MANUAL-RESULT.json --note detect_nvm_windows="verified on Windows 11"
```

也可以直接编辑 `resultPath`，把对应字段改成 `true`。
8. 回到仓库运行：

```bash
pnpm verify:manual:sync /path/to/MANUAL-RESULT.json
```

建议先把自动化和人工边界分开：

- `pnpm verify:nvm-windows:probe` 负责 probe binary、非 Windows skip contract，以及在真实 Windows 主机上的 backend 能力读写探测。
- 后续人工验收只需要聚焦 NodePilot 的桌面 UI 是否正确承载这些行为：状态展示、install/use/uninstall 刷新、admin 提示、arch 选择。

## 边界说明

- `pnpm verify:manual:nvm-sh:prep` 和 `pnpm verify:manual:nvm-windows:prep` 只负责生成手工验收材料。
- `pnpm verify:manual:mark` 只负责更新结果模板和 checklist，不会自动改动执行文档。
- `pnpm verify:nvm-sh:e2e` 和 `pnpm verify:nvm-windows:probe` 只提供自动化辅助证据，不替代真实桌面 UI 验收。
- 当前自动化链可以覆盖 backend / dev 链路与部分平台能力，但不能替代 macOS 桌面窗口的真实交互验收。
- `snapshotPath` 只提供 UI 结构观测与坐标辅助，不代表对应按钮已经被真实点击，也不自动回填 `10.2` 勾选状态。
- Tauri 官方 WebDriver 桌面支持当前只覆盖 Windows 和 Linux，macOS 不提供 WKWebView driver，因此 `10.2` 仍需要真实人工点击验收。
- `docs/EXECUTION.md` 中的 `10.2 / 10.3` 当前仍应保持未勾选，直到人工逐项完成。
