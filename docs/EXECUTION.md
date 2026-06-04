# NodePilot Execution Document

## Purpose

NodePilot 是一个本地桌面版 Node 版本与项目运行环境管理器。它使用 Tauri 2、React、Vite、TypeScript 和 Material You / Material 3 工具型界面。

首版只做本地能力：

- 管理 `nvm-sh/nvm` 和 `nvm-windows`。
- 管理本地 Node 版本、远程安装、默认版本和项目 `.nvmrc`。
- 提供环境诊断、任务日志和失败修复建议。
- 所有配置、项目记录和日志只保存在本机。

明确不做：

- 账号系统。
- 云同步。
- 遥测。
- 商业化入口。
- 团队管理。
- Volta、fnm、asdf、Docker、WSL 管理。

## Execution Rules

- 每完成一个功能点，把对应 `- [ ]` 改成 `- [x]`。
- 只有实现并通过对应验证后才能勾选。
- 如果某项被发现不可行，保留未勾选，并在该项后追加原因。
- 阶段验证未通过时，不勾选该阶段的验证项。
- 后续实现必须优先更新本文档，保证文档状态等于项目真实状态。

## Current Repository State

- [x] 已生成 Tauri 2 + React + Vite + TypeScript 脚手架。
- [x] 已安装 pnpm 依赖并生成 `pnpm-lock.yaml`。
- [x] 已替换默认示例 UI。
- [x] 已实现 NodePilot backend 类型、parser 与测试基线。
- [x] 前端已接入 Tauri backend 命令，并在不可用时保留 mock fallback。
- [x] 已提供 macOS / Linux、Windows 手工验收准备脚本、结果模板、标记命令、回填命令与快速指引。
- [x] 已将非首发必要的未完成项迁移到 [`docs/PHASE2.md`](./PHASE2.md)。
- [ ] 已完成端到端验证。（原因：当前已完成自动化验证、打包验证，以及隔离环境下的 `nvm-sh` backend 实机脚本验证；其余非阻塞项已迁入 `docs/PHASE2.md`，但 macOS / Linux、Windows 的逐项桌面 UI 人工验收还未完成。）

## Phase 0: Project Baseline

### 0.1 Project Initialization

- [x] 初始化 Tauri 2 项目。
- [x] 使用 React + Vite + TypeScript 前端模板。
- [x] 使用 pnpm 作为 package manager。
- [x] 生成 `src-tauri/` Rust 工程。
- [x] 生成 `package.json`、`vite.config.ts`、`tsconfig.json`。
- [x] 生成 `pnpm-lock.yaml`。
- [x] 将 package 名称改为 `nodepilot`。
- [x] 将 Tauri product name 改为 `NodePilot`。
- [x] 将 Tauri identifier 固定为 `app.nodepilot.desktop`。

### 0.2 Directory Structure

- [x] 创建 `src/features/home/`。
- [x] 创建 `src/features/versions/`。
- [x] 创建 `src/features/remote/`。
- [x] 创建 `src/features/projects/`。
- [x] 创建 `src/features/activity/`。
- [x] 创建 `src/features/settings/`。
- [x] 创建 `src/shared/api/`。
- [x] 创建 `src/shared/components/`。
- [x] 创建 `src/shared/types/`。
- [x] 创建 `src/styles/`。
- [x] 创建 `src-tauri/src/nvm/`。
- [x] 创建 `src-tauri/src/tasks/`。

### 0.3 Testing Baseline

- [x] 添加前端测试框架。
- [x] 添加前端测试脚本 `pnpm test`。
- [x] 添加 Rust 单元测试入口。
- [x] 添加基础 parser 测试。
- [x] 确认 `pnpm build` 可运行。
- [x] 确认 `cargo test` 可运行。
- [x] 确认 `pnpm tauri dev` 可启动。

### 0.4 Phase Verification

- [x] `pnpm test` 通过。
- [x] `pnpm build` 通过。
- [x] `cargo test` 通过。
- [x] `pnpm tauri dev` 能启动桌面窗口。

## Phase 1: Backend Capability and Platform Adapters

### 1.1 Shared Backend Types

- [x] 定义 `BackendKind`：`NvmSh`、`NvmWindows`、`Missing`、`Unsupported`。
- [x] 定义 `CapabilitySet`。
- [x] 定义 `VersionInfo`。
- [x] 定义 `RemoteVersionInfo`。
- [x] 定义 `HealthCheckResult`。
- [x] 定义 `HealthCheckItem`。
- [x] 定义 `TaskStatus`。
- [x] 定义 `CommandResult`。
- [x] 定义 `InstallOptions`。
- [x] 定义 `ActivateOptions`。

### 1.2 Backend Interface

- [x] 定义 `detect_backend()`。
- [x] 定义 `health_check()`。
- [x] 定义 `list_installed()`。
- [x] 定义 `list_remote()`。
- [x] 定义 `install()`。
- [x] 定义 `uninstall()`。
- [x] 定义 `activate()`。
- [x] 定义 `set_default()`。
- [x] 定义 `read_project_version()`。
- [x] 定义 `write_project_version()`。

### 1.3 macOS/Linux `nvm-sh` Adapter

- [x] 检测 `NVM_DIR`。
- [x] 检测 `~/.nvm/nvm.sh`。
- [x] 检测 `~/.zshrc` 是否加载 nvm。
- [x] 检测 `~/.bashrc` 是否加载 nvm。
- [x] 检测 `~/.bash_profile` 是否加载 nvm。
- [x] 检测 `~/.profile` 是否加载 nvm。
- [x] 支持 `nvm --version`。
- [x] 支持 `nvm current`。
- [x] 支持 `nvm ls --no-colors`。
- [x] 支持 `nvm ls-remote --no-colors`。
- [x] 支持 `nvm install`。
- [x] 支持 `nvm uninstall`。
- [x] 支持 `nvm use`，并标注只影响当前任务环境。
- [x] 支持 `nvm alias default`。

### 1.4 Windows `nvm-windows` Adapter

- [x] 检测 `nvm.exe`。
- [x] 检测 `nvm version`。
- [x] 检测 `nvm current`。
- [x] 检测 `nvm root`。
- [x] 检测 `nvm arch`。
- [x] 检测管理员权限。
- [x] 支持 `nvm list`。
- [x] 支持 `nvm list available`。
- [x] 支持 `nvm install <version> [arch]`。
- [x] 支持 `nvm uninstall <version>`。
- [x] 支持 `nvm use <version> [arch]`。
- [x] 标注 Windows 切换会更新全局 symlink。

### 1.5 Capability Flags

- [x] `canInstall`。
- [x] `canUninstall`。
- [x] `canActivate`。
- [x] `canSetDefault`。
- [x] `supportsAlias`。
- [x] `supportsProjectNvmrc`。
- [x] `supportsArchSelection`。
- [x] `supportsProxy`。
- [x] `supportsMirror`。
- [x] `supportsSourceInstall`。
- [x] `supportsOfflineInstall`。
- [x] `requiresAdminForActivation`。

### 1.6 Command Safety

- [x] 前端只传结构化参数，不传 shell 字符串。
- [x] 后端校验版本号。
- [x] 后端校验路径。
- [x] 后端校验 URL。
- [x] 后端拒绝 `;`、`&&`、`|`、反引号等 shell 注入字符。
- [x] 日志脱敏 token、auth header、secret。

### 1.7 Parser Tests

- [x] 测试解析 `nvm ls --no-colors`。
- [x] 测试解析 `nvm ls-remote --no-colors`。
- [x] 测试解析 `nvm current`。
- [x] 测试解析 `nvm alias default`。
- [x] 测试解析 `nvm-windows list`。
- [x] 测试解析 `nvm-windows list available`。
- [x] 测试失败输出不会被当作成功数据。

## Phase 2: Home Environment Overview and Health Checks

### 2.1 Environment Summary

- [x] 展示当前 Node 版本。
- [x] 展示当前 npm 版本。
- [x] 展示当前 pnpm 版本。
- [x] 展示当前 yarn 版本。
- [x] 展示 Node 可执行文件路径。
- [x] 展示 npm 可执行文件路径。
- [x] 展示 backend 类型。
- [x] 展示系统平台。
- [x] 展示 CPU 架构。

### 2.2 Version Source

- [x] 识别 Node 来源为 `nvm-sh`。
- [x] 识别 Node 来源为 `nvm-windows`。
- [x] 识别 Node 来源为 system Node。
- [x] 无法识别时显示 unknown。
- [x] 当来源不是 nvm 时给出提示。

### 2.3 Default Version

- [x] 展示 default 版本。
- [x] 标注 default 是否存在。
- [x] 标注 default 是否与当前版本一致。
- [x] macOS/Linux 文案说明 default 影响新 shell。
- [x] Windows 文案说明 `nvm use` 持久切换 symlink。

### 2.4 Health Checks

- [x] 检测 nvm 未安装。
- [x] 检测 nvm 已安装但未加载。
- [x] 检测 Node PATH 不来自 nvm。
- [x] 检测 npm prefix 冲突。
- [x] 检测 Windows 管理员权限不足。
- [x] 检测 Windows 旧 Node 安装冲突。
- [x] 检测 Apple Silicon 安装旧版本风险。
- [x] 检测 `.nvmrc` 指向版本未安装。
- [x] 检测 default 指向版本不存在。

### 2.5 Recommended Actions

- [x] 未安装 nvm 时推荐安装。
- [x] default 缺失时推荐设置 default。
- [x] PATH 冲突时推荐修复路径。
- [x] `.nvmrc` 与当前版本不一致时推荐应用项目版本。
- [x] 权限不足时推荐重新以管理员权限运行或手动操作。

### 2.6 Phase Verification

- [x] 模拟正常状态。
- [x] 模拟 nvm 未安装状态。
- [x] 模拟 PATH 冲突状态。
- [x] 模拟 Windows 权限不足状态。

## Phase 3: nvm Installation and Initialization

### 3.1 Missing nvm Flow

- [x] 未检测到 nvm 时显示安装引导。
- [x] 安装引导说明将安装哪个 backend。
- [x] 安装引导显示官方来源。
- [x] 安装前必须要求用户确认。

### 3.2 macOS/Linux Install Flow

- [x] 展示官方安装脚本 URL。
- [x] 展示将执行的命令。
- [x] 展示目标路径。
- [x] 用户确认后执行。
- [x] 显示实时日志。
- [x] 安装后重新检测 backend。
- [x] 提示用户重新打开 shell 或 source profile。

### 3.3 Windows Install Flow

- [x] 引导下载 `nvm-windows` installer。
- [x] 提示需要管理员权限。
- [x] 不做静默安装。
- [x] 安装后重新检测 `nvm.exe`。
- [x] 检测 PATH 是否生效。

### 3.4 Install Failure Handling

- [x] 显示失败退出码。
- [x] 显示 stdout。
- [x] 显示 stderr。
- [x] 提供复制日志按钮。
- [x] 给出下一步修复建议。

### 3.5 Phase Verification

- [x] 验证 nvm 缺失场景。
- [x] 验证安装失败场景。
- [x] 验证安装成功后重新检测。

## Phase 4: Local Versions

### 4.1 Version List

- [x] 展示版本号。
- [x] 展示 Current 状态。
- [x] 展示 Default 状态。
- [x] 展示 LTS 状态。
- [x] 展示 System 状态。
- [x] 展示架构。
- [x] 展示安装路径。
- [x] 展示 npm 版本，若可获得。
- [x] 展示损坏或缺失状态，若检测到。

### 4.2 Version Actions

- [x] 使用此版本。
- [x] 设为默认版本。
- [x] 卸载版本。
- [x] 复制版本号。
- [x] 打开安装目录。
- [x] 查看版本详情。

### 4.3 Deletion Protection

- [x] 删除当前版本前二次确认。
- [x] 删除默认版本前二次确认。
- [x] 删除最后一个 nvm 管理版本前二次确认。
- [x] 删除失败时显示原因和建议。

### 4.4 Version Details

- [x] 展示 Node 路径。
- [x] 展示 npm 路径。
- [x] 展示 global package 路径。
- [x] 展示 `node -v` 验证结果。
- [x] 展示 `npm -v` 验证结果。

### 4.5 Phase Verification

- [x] 验证多个本地版本渲染。
- [x] 验证切换版本。
- [x] 验证设置 default。
- [x] 验证卸载版本。
- [x] 验证操作后刷新状态。

## Phase 5: Remote Versions

### 5.1 Remote List

- [x] 拉取远程版本列表。
- [x] 展示远程刷新时间。
- [x] 缓存远程列表。
- [x] 支持手动刷新。
- [x] 远程失败时展示错误。

### 5.2 Filters

- [x] 筛选 LTS。
- [x] 筛选 latest。
- [x] 按 major 筛选。
- [x] 筛选已安装。
- [x] 筛选未安装。
- [x] 按版本号搜索。

### 5.3 Install Actions

- [x] 安装 latest。
- [x] 安装 latest LTS。
- [x] 安装指定版本。
- [x] 安装某个 major 的最新 patch。
- [x] 安装完成后刷新本地版本。

### 5.4 Install Options

- [x] 迁移 global packages from current。
- [x] 迁移 global packages from default。
- [x] 安装 latest npm。
- [ ] 离线安装，若 backend 支持。（原因：当前首版支持范围内的 `nvm-sh` 与 `nvm-windows` capability 均未提供 offline install；该项已转入 [`docs/PHASE2.md`](./PHASE2.md)，不阻塞首版交付。）
- [x] 从源码编译，若 backend 支持。
- [x] Windows 架构选择：system、32、64、all。

### 5.5 Task Control

- [x] 安装任务显示实时日志。
- [x] 安装任务可取消。
- [x] 写操作互斥。
- [x] 重复点击防抖。

### 5.6 Phase Verification

- [x] 验证远程列表失败。
- [x] 验证安装成功。
- [x] 验证取消安装。
- [x] 验证重复点击不会创建重复任务。

## Phase 6: Projects and `.nvmrc`

### 6.1 Project Selection

- [x] 支持选择项目目录。
- [x] 保存最近项目列表。
- [x] 最近项目只保存在本地。
- [x] 支持打开项目目录。

### 6.2 `.nvmrc` Detection

- [x] 读取当前目录 `.nvmrc`。
- [x] 向父目录查找 `.nvmrc`。
- [x] 展示 `.nvmrc` 文件路径。
- [x] 展示 `.nvmrc` 内容。
- [x] 校验 `.nvmrc` 是否合法。
- [x] 检查 `.nvmrc` 指向版本是否已安装。

### 6.3 Project Actions

- [x] 按 `.nvmrc` 安装版本。
- [x] 按 `.nvmrc` 应用版本。
- [x] 创建 `.nvmrc`。
- [x] 修改 `.nvmrc`。
- [x] 写入前展示 diff。
- [x] 写入前要求确认。
- [x] 复制推荐命令。

### 6.4 Phase Verification

- [x] 验证无 `.nvmrc`。
- [x] 验证合法 `.nvmrc`。
- [x] 验证版本未安装。
- [x] 验证父目录继承。

## Phase 7: Activity Task Center

当前状态：已完成前端本地基础模型、mock UI 和单测覆盖；真实 detect、health_check、remote_refresh、install、uninstall、activate、set_default、project `.nvmrc` read/write 已自动进入 Activity。真实任务 runner 已限制写操作串行，并允许只读操作并行；持久化任务日志仍待后续接入。

### 7.1 Task Types

- [x] 定义并可展示 detect 任务类型。
- [x] 定义并可展示 health_check 任务类型。
- [x] 定义并可展示 remote_refresh 任务类型。
- [x] 定义并可展示 install 任务类型。
- [x] 定义并可展示 uninstall 任务类型。
- [x] 定义并可展示 activate 任务类型。
- [x] 定义并可展示 set_default 任务类型。
- [x] 定义并可展示 project_nvmrc_read 任务类型。
- [x] 定义并可展示 project_nvmrc_write 任务类型。
- [x] 真实 detect 操作自动进入 Activity。
- [x] 真实 health_check 操作自动进入 Activity。
- [x] 真实 remote_refresh 操作自动进入 Activity。
- [x] 真实 install 操作自动进入 Activity。
- [x] 真实 uninstall 操作自动进入 Activity。
- [x] 真实 activate 操作自动进入 Activity。
- [x] 真实 set_default 操作自动进入 Activity。
- [x] 真实 project_nvmrc_read 操作自动进入 Activity。
- [x] 真实 project_nvmrc_write 操作自动进入 Activity。

### 7.2 Task State

- [x] 支持 pending。
- [x] 支持 running。
- [x] 支持 success。
- [x] 支持 failed。
- [x] 支持 cancelled。
- [x] 记录开始时间。
- [x] 记录结束时间。
- [x] 记录耗时。

### 7.3 Logs

- [x] stdout 分区展示。
- [x] stderr 分区展示。
- [x] 日志可复制。
- [x] 日志可折叠。
- [x] 失败任务展示摘要。
- [x] 失败任务展示退出码。
- [x] 失败任务展示推荐修复动作。

### 7.4 Safety

- [x] 前端任务模型支持写操作互斥判断。
- [x] 前端任务模型允许只读操作并行。
- [x] 真实任务 runner 强制写操作全局互斥。
- [x] 真实任务 runner 允许只读操作并行。
- [x] 日志脱敏 token。
- [x] 日志脱敏 auth header。
- [x] 日志脱敏 secret。

### 7.5 Phase Verification

- [x] 验证成功任务。
- [x] 验证失败任务。
- [x] 验证取消任务。
- [x] 验证敏感信息脱敏。

## Phase 8: Settings and Configuration

### 8.1 Backend Settings

- [x] 展示 backend 类型。
- [x] 展示 nvm 版本。
- [x] 展示 nvm 路径。
- [x] 展示 Node 版本存储路径。
- [x] Windows 展示 symlink/root 信息。

### 8.2 Shell Integration

- [x] 展示 `.zshrc` 检测结果。
- [x] 展示 `.bashrc` 检测结果。
- [x] 展示 `.bash_profile` 检测结果。
- [x] 展示 `.profile` 检测结果。
- [x] 支持复制 shell 集成片段。
- [x] 不默认修改用户 profile。

### 8.3 Mirrors and Proxy

- [x] 展示 Node mirror。
- [x] 展示 npm mirror。
- [x] 展示 proxy。
- [x] 首版以只读为主。
- [ ] 编辑功能单独进入后续阶段。（原因：首版按只读配置范围交付，mirror / proxy 编辑已转入 [`docs/PHASE2.md`](./PHASE2.md)，不阻塞首版交付。）

### 8.4 Default Packages

- [x] 检测 `$NVM_DIR/default-packages`。
- [x] 展示 default packages 内容。
- [x] 首版可只读。

### 8.5 Appearance and Language

- [x] 支持 system theme。
- [x] 支持 light theme。
- [x] 支持 dark theme。
- [x] 保存主题选择到本地。
- [x] 支持中文界面文案。
- [x] 支持英文界面文案。
- [x] 保存语言选择到本地。

### 8.6 Phase Verification

- [x] 验证配置缺失。
- [x] 验证配置存在。
- [x] 验证权限不足。
- [x] 验证路径异常。

## Phase 9: UI and Interaction Acceptance

### 9.1 Layout

- [x] 首屏直接进入 Home 管理界面。
- [x] 不做营销页。
- [x] 使用工具型布局。
- [x] 避免大面积装饰卡片。
- [x] 保持信息密度适合桌面端。

### 9.2 Material You / Material 3

- [x] 定义 Material 3 color tokens。
- [x] 定义 typography tokens。
- [x] 定义 shape tokens。
- [x] 定义 elevation tokens。
- [x] 支持 light/dark theme。
- [x] 支持用户显式切换 light/dark theme。
- [x] 支持中英文界面切换。
- [x] 配色不使用单一色相堆叠。

### 9.3 Components

- [x] 状态 chip 包含文字，不只依赖颜色。
- [x] 危险操作使用低强调按钮。
- [x] 危险操作必须 confirm dialog。
- [x] icon button 必须有 tooltip。
- [x] icon button 必须有 `aria-label`。
- [x] 日志使用 monospace。
- [x] 长日志不溢出布局。

### 9.4 Responsive Desktop

- [x] 验证 960px 宽度。
- [x] 验证 1280px 宽度。
- [x] 验证 1440px 宽度。
- [x] 无文本重叠。
- [x] 无按钮文字截断。
- [x] 无空白主视图。

## Phase 10: Release Readiness

### 10.1 Automated Verification

- [x] `pnpm test` 通过。
- [x] `pnpm build` 通过。
- [x] `cargo test` 通过。
- [x] `pnpm tauri build` 通过。

补充说明：仓库已提供 `pnpm verify:all` 作为发布前自动回归入口；同时提供 `pnpm verify:artifacts`，顺序执行 `pnpm verify:tauri-dev:smoke`、`pnpm verify:nvm-sh:e2e` 与 `pnpm verify:nvm-windows:probe`，并把结果写入 `docs/verification/`。另外提供 `pnpm verify:tauri-dev:smoke`，用于单独自动验证 `pnpm tauri dev` 的启动与清理链路；提供 `pnpm verify:tauri-dev:bridge`，作为可选辅助脚本尝试验证真实桌面窗口里的 `navigate / click nav / read-project` 受控链路；提供 `pnpm verify:manual:nvm-sh:prep` 与 `pnpm verify:manual:nvm-windows:prep`，用于生成双平台的手工验收准备材料，并生成结果模板与 checklist；提供 `pnpm verify:manual:mark <MANUAL-RESULT.json> <item...>`，用于逐项标记手工验收结果；提供 `pnpm verify:manual:sync <MANUAL-RESULT.json>`，用于把逐项手工验收结果稳定回填到执行文档；提供 `pnpm verify:release:candidate`，用于串行执行 `pnpm verify:all` 并一次性生成双平台手工验收包与统一的 `RELEASE-CANDIDATE.md` / `RELEASE-CANDIDATE.json` 摘要。相关操作入口见 [`docs/manual/README.md`](./manual/README.md)。这组脚本都不替代下面的桌面 UI / 人工验收项；历史目录中若存在 `tauri-dev-bridge` 产物，也只表示曾单独运行过辅助脚本，不属于默认自动化证据。

自动化验证产物已落盘到 [`docs/verification/README.md`](./verification/README.md)，其中包含最近一次 `nvm-sh` e2e 与 `nvm-windows` probe 的结果快照。

### 10.2 Manual macOS/Linux Verification

辅助说明：可先运行 `pnpm verify:manual:nvm-sh:prep`，生成临时 `HOME/NVM_DIR`、测试项目目录、自动化前置脚本与日志、launcher、结果模板与 checklist；逐项完成后，再运行 `pnpm verify:manual:sync <MANUAL-RESULT.json>` 回填勾选状态。

在执行人工验收前，建议先确认 [`docs/verification/README.md`](./verification/README.md) 中最近一次 `tauri-dev-smoke` 与 `nvm-sh-e2e` 已通过。当前默认自动化链已经覆盖 `install nvm`、`detect`、`list remote`、`install Node`、`list installed`、`activate Node`、`set default`、`read/apply .nvmrc`、`uninstall Node` 的 backend 语义，以及 `tauri dev` 启动与清理链路；因此 `10.2` 的人工验收重点只看桌面写操作结果承载、Activity 日志、错误反馈，以及 macOS/Linux 作用范围文案。`pnpm verify:tauri-dev:bridge` 仍可单独作为辅助脚本使用，但当前不作为默认自动化证据。

- [ ] detect。
- [ ] install nvm。
- [ ] list installed。
- [ ] list remote。
- [ ] install Node。
- [ ] activate Node。
- [ ] set default。
- [ ] uninstall Node。
- [ ] read `.nvmrc`。
- [ ] apply `.nvmrc`。

### 10.3 Manual Windows Verification

辅助说明：可先运行 `pnpm verify:manual:nvm-windows:prep`，生成自动化前置脚本与日志、`PowerShell helper`、结果模板和 UI checklist，再到真实 Windows 主机执行下列人工验收；逐项完成后，再运行 `pnpm verify:manual:sync <MANUAL-RESULT.json>` 回填勾选状态。

在执行人工验收前，建议先确认 [`docs/verification/README.md`](./verification/README.md) 与 `pnpm verify:nvm-windows:probe` 的输出。当前自动化链已经覆盖 probe binary 编译 / 运行路径，以及非 Windows 宿主上的 skip contract；在真实 Windows 主机上，还可进一步辅助验证 `detect / list / install / use / uninstall` 的 backend 读写链路。因此 `10.3` 的人工验收重点只看 NodePilot 的桌面 UI 是否正确反映 `nvm-windows` 状态、install/use/uninstall 后是否刷新、admin 权限提示是否在正确时机出现，以及 arch 选择是否按预期暴露。

- [ ] detect `nvm-windows`。
- [ ] list installed。
- [ ] list available。
- [ ] install Node。
- [ ] use Node。
- [ ] uninstall Node。
- [ ] admin 权限提示。
- [ ] arch 选择。

### 10.4 Product Constraints

- [x] 无账号系统。
- [x] 无云同步。
- [x] 无遥测。
- [x] 无商业化入口。
- [x] 无团队管理。
- [x] 所有数据只保存在本机。

### 10.5 Documentation

- [x] README 描述产品定位。
- [x] README 描述支持平台。
- [x] README 描述安装方式。
- [x] README 描述已知限制。
- [x] README 描述故障排查。
