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
- [ ] 已完成端到端验证。

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
- [ ] 支持 `nvm install`。
- [ ] 支持 `nvm uninstall`。
- [ ] 支持 `nvm use`，并标注只影响当前任务环境。
- [ ] 支持 `nvm alias default`。

### 1.4 Windows `nvm-windows` Adapter

- [x] 检测 `nvm.exe`。
- [x] 检测 `nvm version`。
- [x] 检测 `nvm current`。
- [x] 检测 `nvm root`。
- [x] 检测 `nvm arch`。
- [ ] 检测管理员权限。
- [x] 支持 `nvm list`。
- [x] 支持 `nvm list available`。
- [ ] 支持 `nvm install <version> [arch]`。
- [ ] 支持 `nvm uninstall <version>`。
- [ ] 支持 `nvm use <version> [arch]`。
- [ ] 标注 Windows 切换会更新全局 symlink。

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

- [ ] 展示当前 Node 版本。
- [ ] 展示当前 npm 版本。
- [ ] 展示当前 pnpm 版本。
- [ ] 展示当前 yarn 版本。
- [ ] 展示 Node 可执行文件路径。
- [ ] 展示 npm 可执行文件路径。
- [ ] 展示 backend 类型。
- [ ] 展示系统平台。
- [ ] 展示 CPU 架构。

### 2.2 Version Source

- [ ] 识别 Node 来源为 `nvm-sh`。
- [ ] 识别 Node 来源为 `nvm-windows`。
- [ ] 识别 Node 来源为 system Node。
- [ ] 无法识别时显示 unknown。
- [ ] 当来源不是 nvm 时给出提示。

### 2.3 Default Version

- [ ] 展示 default 版本。
- [ ] 标注 default 是否存在。
- [ ] 标注 default 是否与当前版本一致。
- [ ] macOS/Linux 文案说明 default 影响新 shell。
- [ ] Windows 文案说明 `nvm use` 持久切换 symlink。

### 2.4 Health Checks

- [ ] 检测 nvm 未安装。
- [ ] 检测 nvm 已安装但未加载。
- [ ] 检测 Node PATH 不来自 nvm。
- [ ] 检测 npm prefix 冲突。
- [ ] 检测 Windows 管理员权限不足。
- [ ] 检测 Windows 旧 Node 安装冲突。
- [ ] 检测 Apple Silicon 安装旧版本风险。
- [ ] 检测 `.nvmrc` 指向版本未安装。
- [ ] 检测 default 指向版本不存在。

### 2.5 Recommended Actions

- [ ] 未安装 nvm 时推荐安装。
- [ ] default 缺失时推荐设置 default。
- [ ] PATH 冲突时推荐修复路径。
- [ ] `.nvmrc` 与当前版本不一致时推荐应用项目版本。
- [ ] 权限不足时推荐重新以管理员权限运行或手动操作。

### 2.6 Phase Verification

- [ ] 模拟正常状态。
- [ ] 模拟 nvm 未安装状态。
- [ ] 模拟 PATH 冲突状态。
- [ ] 模拟 Windows 权限不足状态。

## Phase 3: nvm Installation and Initialization

### 3.1 Missing nvm Flow

- [ ] 未检测到 nvm 时显示安装引导。
- [ ] 安装引导说明将安装哪个 backend。
- [ ] 安装引导显示官方来源。
- [ ] 安装前必须要求用户确认。

### 3.2 macOS/Linux Install Flow

- [ ] 展示官方安装脚本 URL。
- [ ] 展示将执行的命令。
- [ ] 展示目标路径。
- [ ] 用户确认后执行。
- [ ] 显示实时日志。
- [ ] 安装后重新检测 backend。
- [ ] 提示用户重新打开 shell 或 source profile。

### 3.3 Windows Install Flow

- [ ] 引导下载 `nvm-windows` installer。
- [ ] 提示需要管理员权限。
- [ ] 不做静默安装。
- [ ] 安装后重新检测 `nvm.exe`。
- [ ] 检测 PATH 是否生效。

### 3.4 Install Failure Handling

- [ ] 显示失败退出码。
- [ ] 显示 stdout。
- [ ] 显示 stderr。
- [ ] 提供复制日志按钮。
- [ ] 给出下一步修复建议。

### 3.5 Phase Verification

- [ ] 验证 nvm 缺失场景。
- [ ] 验证安装失败场景。
- [ ] 验证安装成功后重新检测。

## Phase 4: Local Versions

### 4.1 Version List

- [ ] 展示版本号。
- [ ] 展示 Current 状态。
- [ ] 展示 Default 状态。
- [ ] 展示 LTS 状态。
- [ ] 展示 System 状态。
- [ ] 展示架构。
- [ ] 展示安装路径。
- [ ] 展示 npm 版本，若可获得。
- [ ] 展示损坏或缺失状态，若检测到。

### 4.2 Version Actions

- [ ] 使用此版本。
- [ ] 设为默认版本。
- [ ] 卸载版本。
- [ ] 复制版本号。
- [ ] 打开安装目录。
- [ ] 查看版本详情。

### 4.3 Deletion Protection

- [ ] 删除当前版本前二次确认。
- [ ] 删除默认版本前二次确认。
- [ ] 删除最后一个 nvm 管理版本前二次确认。
- [ ] 删除失败时显示原因和建议。

### 4.4 Version Details

- [ ] 展示 Node 路径。
- [ ] 展示 npm 路径。
- [ ] 展示 global package 路径。
- [ ] 展示 `node -v` 验证结果。
- [ ] 展示 `npm -v` 验证结果。

### 4.5 Phase Verification

- [ ] 验证多个本地版本渲染。
- [ ] 验证切换版本。
- [ ] 验证设置 default。
- [ ] 验证卸载版本。
- [ ] 验证操作后刷新状态。

## Phase 5: Remote Versions

### 5.1 Remote List

- [ ] 拉取远程版本列表。
- [ ] 展示远程刷新时间。
- [ ] 缓存远程列表。
- [ ] 支持手动刷新。
- [ ] 远程失败时展示错误。

### 5.2 Filters

- [ ] 筛选 LTS。
- [ ] 筛选 latest。
- [ ] 按 major 筛选。
- [ ] 筛选已安装。
- [ ] 筛选未安装。
- [ ] 按版本号搜索。

### 5.3 Install Actions

- [ ] 安装 latest。
- [ ] 安装 latest LTS。
- [ ] 安装指定版本。
- [ ] 安装某个 major 的最新 patch。
- [ ] 安装完成后刷新本地版本。

### 5.4 Install Options

- [ ] 迁移 global packages from current。
- [ ] 迁移 global packages from default。
- [ ] 安装 latest npm。
- [ ] 离线安装，若 backend 支持。
- [ ] 从源码编译，若 backend 支持。
- [ ] Windows 架构选择：system、32、64、all。

### 5.5 Task Control

- [ ] 安装任务显示实时日志。
- [ ] 安装任务可取消。
- [ ] 写操作互斥。
- [ ] 重复点击防抖。

### 5.6 Phase Verification

- [ ] 验证远程列表失败。
- [ ] 验证安装成功。
- [ ] 验证取消安装。
- [ ] 验证重复点击不会创建重复任务。

## Phase 6: Projects and `.nvmrc`

### 6.1 Project Selection

- [ ] 支持选择项目目录。
- [ ] 保存最近项目列表。
- [ ] 最近项目只保存在本地。
- [ ] 支持打开项目目录。

### 6.2 `.nvmrc` Detection

- [ ] 读取当前目录 `.nvmrc`。
- [ ] 向父目录查找 `.nvmrc`。
- [ ] 展示 `.nvmrc` 文件路径。
- [ ] 展示 `.nvmrc` 内容。
- [ ] 校验 `.nvmrc` 是否合法。
- [ ] 检查 `.nvmrc` 指向版本是否已安装。

### 6.3 Project Actions

- [ ] 按 `.nvmrc` 安装版本。
- [ ] 按 `.nvmrc` 应用版本。
- [ ] 创建 `.nvmrc`。
- [ ] 修改 `.nvmrc`。
- [ ] 写入前展示 diff。
- [ ] 写入前要求确认。
- [ ] 复制推荐命令。

### 6.4 Phase Verification

- [ ] 验证无 `.nvmrc`。
- [ ] 验证合法 `.nvmrc`。
- [ ] 验证版本未安装。
- [ ] 验证父目录继承。

## Phase 7: Activity Task Center

### 7.1 Task Types

- [ ] 记录 detect。
- [ ] 记录 health_check。
- [ ] 记录 remote_refresh。
- [ ] 记录 install。
- [ ] 记录 uninstall。
- [ ] 记录 activate。
- [ ] 记录 set_default。
- [ ] 记录 project_nvmrc_read。
- [ ] 记录 project_nvmrc_write。

### 7.2 Task State

- [ ] 支持 pending。
- [ ] 支持 running。
- [ ] 支持 success。
- [ ] 支持 failed。
- [ ] 支持 cancelled。
- [ ] 记录开始时间。
- [ ] 记录结束时间。
- [ ] 记录耗时。

### 7.3 Logs

- [ ] stdout 分区展示。
- [ ] stderr 分区展示。
- [ ] 日志可复制。
- [ ] 日志可折叠。
- [ ] 失败任务展示摘要。
- [ ] 失败任务展示退出码。
- [ ] 失败任务展示推荐修复动作。

### 7.4 Safety

- [ ] 写操作全局互斥。
- [ ] 只读操作允许并行。
- [ ] 日志脱敏 token。
- [ ] 日志脱敏 auth header。
- [ ] 日志脱敏 secret。

### 7.5 Phase Verification

- [ ] 验证成功任务。
- [ ] 验证失败任务。
- [ ] 验证取消任务。
- [ ] 验证敏感信息脱敏。

## Phase 8: Settings and Configuration

### 8.1 Backend Settings

- [ ] 展示 backend 类型。
- [ ] 展示 nvm 版本。
- [ ] 展示 nvm 路径。
- [ ] 展示 Node 版本存储路径。
- [ ] Windows 展示 symlink/root 信息。

### 8.2 Shell Integration

- [ ] 展示 `.zshrc` 检测结果。
- [ ] 展示 `.bashrc` 检测结果。
- [ ] 展示 `.bash_profile` 检测结果。
- [ ] 展示 `.profile` 检测结果。
- [ ] 支持复制 shell 集成片段。
- [ ] 不默认修改用户 profile。

### 8.3 Mirrors and Proxy

- [ ] 展示 Node mirror。
- [ ] 展示 npm mirror。
- [ ] 展示 proxy。
- [ ] 首版以只读为主。
- [ ] 编辑功能单独进入后续阶段。

### 8.4 Default Packages

- [ ] 检测 `$NVM_DIR/default-packages`。
- [ ] 展示 default packages 内容。
- [ ] 首版可只读。

### 8.5 Appearance and Language

- [ ] 支持 system theme。
- [x] 支持 light theme。
- [x] 支持 dark theme。
- [x] 保存主题选择到本地。
- [x] 支持中文界面文案。
- [x] 支持英文界面文案。
- [x] 保存语言选择到本地。

### 8.6 Phase Verification

- [ ] 验证配置缺失。
- [ ] 验证配置存在。
- [ ] 验证权限不足。
- [ ] 验证路径异常。

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
- [ ] 危险操作必须 confirm dialog。
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
- [ ] `pnpm tauri build` 通过。

### 10.2 Manual macOS/Linux Verification

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

- [ ] detect `nvm-windows`。
- [ ] list installed。
- [ ] list available。
- [ ] install Node。
- [ ] use Node。
- [ ] uninstall Node。
- [ ] admin 权限提示。
- [ ] arch 选择。

### 10.4 Product Constraints

- [ ] 无账号系统。
- [ ] 无云同步。
- [ ] 无遥测。
- [ ] 无商业化入口。
- [ ] 无团队管理。
- [ ] 所有数据只保存在本机。

### 10.5 Documentation

- [x] README 描述产品定位。
- [x] README 描述支持平台。
- [x] README 描述安装方式。
- [x] README 描述已知限制。
- [x] README 描述故障排查。
