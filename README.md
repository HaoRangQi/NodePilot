# NodePilot

[English README](./README.en.md)

![NodePilot logo](https://raw.githubusercontent.com/HaoRangQi/NodePilot/master/src/assets/nodepilot-logo.svg?v=20260604-1)

NodePilot 是基于 `nvm` 的一个本地桌面版 Node 版本与项目运行环境管理器。它使用 `Tauri 2 + React + Vite + TypeScript + Rust`，把 `nvm-sh/nvm` 与 `nvm-windows` 的常用操作整理成一个 Material You / Material 3 风格的工具型界面。

这个仓库的首版目标不是做“另一个包管理器”，而是把已经被广泛使用的 `nvm` 生态整理成一个更容易观察、切换、诊断和验证的桌面工具。

## 当前状态

当前项目已经完成首版代码、自动化验证链和发布候选材料收口，但还没有完成最终人工签收。

| 状态项 | 当前结果 |
| --- | --- |
| 前端主界面 | 已完成 |
| Rust / Tauri backend | 已完成 |
| `nvm-sh` adapter | 已完成 |
| `nvm-windows` adapter | 已完成 |
| 自动化验证 | 已完成 |
| macOS / Linux 桌面 UI 人工验收 | 待完成 |
| Windows 桌面 UI 人工验收 | 待完成 |

当前仍待人工完成的只剩：

- [`docs/EXECUTION.md`](./docs/EXECUTION.md) 中的 `10.2 Manual macOS/Linux Verification`
- [`docs/EXECUTION.md`](./docs/EXECUTION.md) 中的 `10.3 Manual Windows Verification`

不阻塞首版交付、但明确转入后续阶段的内容见 [`docs/PHASE2.md`](./docs/PHASE2.md)。

## 产品定位

NodePilot 的定位很明确：

- 面向本机环境管理，而不是云端服务。
- 面向 `nvm-sh/nvm` 和 `nvm-windows`，而不是多 runtime 聚合器。
- 面向版本切换、项目 `.nvmrc`、环境诊断和任务日志，而不是团队协作平台。
- 面向可解释、可验证的桌面工具，而不是“隐藏执行细节”的黑盒 UI。

明确不做：

- 账号系统
- 云同步
- 遥测
- 商业化入口
- 团队管理
- Volta、fnm、asdf、Docker、WSL 管理

## 核心能力

### 1. 环境总览

- 检测 backend 类型：`nvm-sh`、`nvm-windows`、`missing`、`unsupported`
- 展示当前 `Node / npm / pnpm / yarn`
- 展示 Node / npm 路径
- 展示平台、架构、版本来源
- 展示 `default` 版本状态和当前版本关系

### 2. 环境诊断

- `nvm` 未安装
- `nvm` 已安装但未加载
- `PATH` 冲突
- `npm prefix` 冲突
- Apple Silicon 旧 Node 版本风险
- Windows 管理员权限不足
- Windows 旧 Node 安装冲突
- `.nvmrc` 指向的版本未安装
- `default` 指向缺失版本

### 3. 本地版本管理

- 列出本机已安装版本
- 标记 `Current / Default / LTS / System / Missing / Damaged`
- `use`
- `set default`
- `uninstall`
- 查看版本详情
- 复制版本号
- 打开安装目录

### 4. 远程版本管理

- 拉取远程版本列表
- 按 `LTS / latest / major / installed / uninstalled` 筛选
- 安装指定版本
- 安装最新版本
- 安装最新 LTS
- 安装某个 major 的最新 patch
- `nvm-sh` 支持 source install
- Windows 支持 `arch` 选择
- 安装日志、取消和写操作互斥

### 5. 项目 `.nvmrc`

- 读取当前目录或父目录的 `.nvmrc`
- 判断 `.nvmrc` 是否合法
- 判断目标版本是否已安装
- 安装 `.nvmrc` 指定版本
- 应用 `.nvmrc` 指定版本
- 写入或修改 `.nvmrc`
- 保存最近项目列表

### 6. Activity 任务中心

- 统一记录读写任务
- 展示 `stdout / stderr / exit code / duration`
- 区分 `pending / running / success / failed / cancelled`
- 对失败任务给出修复建议
- 对日志做敏感信息脱敏

### 7. Settings

- 展示 backend 状态
- 展示 shell profile 检查结果
- 展示 mirror / proxy / `default-packages` 状态
- 复制 shell 集成片段
- 切换 `light / dark / system` 主题
- 切换 `中文 / English`

## 支持矩阵

| 能力 | macOS / Linux (`nvm-sh`) | Windows (`nvm-windows`) |
| --- | --- | --- |
| backend detect | 支持 | 支持 |
| local versions | 支持 | 支持 |
| remote versions | 支持 | 支持 |
| install | 支持 | 支持 |
| uninstall | 支持 | 支持 |
| activate / use | 支持 | 支持 |
| set default | 支持 | 按能力差异展示 |
| `.nvmrc` read / apply | 支持 | 作为 NodePilot 辅助能力支持 |
| source install | 支持 | 不支持 |
| arch selection | 不需要 | 支持 |
| offline install | 首版不支持 | 首版不支持 |

## 界面结构

NodePilot 首版提供 6 个主视图：

| 视图 | 作用 |
| --- | --- |
| Home | 当前环境、健康检查、推荐操作 |
| Versions | 本地版本列表与切换 |
| Remote | 远程版本筛选与安装 |
| Projects | `.nvmrc` 读取、应用和写入 |
| Activity | 任务日志、失败摘要、修复建议 |
| Settings | backend、shell、主题与只读配置状态 |

## 技术架构

| 层 | 技术 | 责任 |
| --- | --- | --- |
| Desktop shell | Tauri 2 | 窗口、命令桥接、打包 |
| Frontend | React + Vite + TypeScript | 视图、交互、状态、文案 |
| Backend | Rust | backend detect、命令执行、安全校验、解析 |
| Runtime adapters | `nvm-sh` / `nvm-windows` | 平台差异处理 |
| Verification | Vitest + Rust tests + local scripts | 自动化验证与发布前收口 |

关键约束：

- 前端不直接执行 shell。
- 所有 backend 调用都走结构化 command。
- 后端对白名单参数做校验。
- 日志默认脱敏。
- 写操作互斥，只读操作允许并行。

## 品牌与图标

当前仓库已经统一使用 `NV` monogram logo：

- 前端品牌位使用 [`src/assets/nodepilot-logo.svg`](./src/assets/nodepilot-logo.svg)
- 桌面打包图标使用 [`src-tauri/icons`](./src-tauri/icons) 中生成的资产

## 前置要求

### 运行本仓库需要

- Node.js
- `pnpm`
- Rust toolchain
- Tauri 2 对应平台依赖

### 推荐环境

- macOS / Linux：本机已有或允许安装 `nvm-sh`
- Windows：本机已有或允许安装 `nvm-windows`

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动前端开发环境

```bash
pnpm dev
```

### 3. 启动桌面开发环境

```bash
pnpm tauri dev
```

### 4. 构建生产包

```bash
pnpm build
pnpm tauri build
```

构建产物默认在：

- `dist/`
- `src-tauri/target/release/`
- `src-tauri/target/release/bundle/`

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm test` | 前端单测 |
| `pnpm build` | 前端生产构建 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust 单测 |
| `pnpm tauri dev` | 启动桌面开发环境 |
| `pnpm tauri build` | 生成桌面安装包 |
| `pnpm verify:all` | 发布前自动回归 |
| `pnpm verify:artifacts` | 生成自动化验证产物 |
| `pnpm verify:release:candidate` | 生成发布候选验收包 |
| `pnpm verify:manual:nvm-sh:prep` | 生成 macOS / Linux 手工验收包 |
| `pnpm verify:manual:nvm-windows:prep` | 生成 Windows 手工验收包 |

## 验证体系

### 自动化验证

`pnpm verify:all` 会顺序执行：

1. `pnpm test`
2. `pnpm build`
3. `cargo test`
4. `pnpm verify:artifacts`
5. `pnpm tauri build`

最近一次自动化验证索引见：

- [`docs/verification/README.md`](./docs/verification/README.md)

其中默认自动化链包括：

- `pnpm verify:tauri-dev:smoke`
- `pnpm verify:nvm-sh:e2e`
- `pnpm verify:nvm-windows:probe`

### 手工验收

手工验收入口见：

- [`docs/manual/README.md`](./docs/manual/README.md)

执行计划与勾选状态见：

- [`docs/EXECUTION.md`](./docs/EXECUTION.md)

注意：

- 自动化验证不替代 `10.2 / 10.3` 的桌面 UI 人工验收。
- `tauri-dev bridge` 当前只作为辅助脚本，不计入默认自动化证据。

## 发布候选版

如果你想一次性收口“自动化回归 + 双平台手工验收材料”，运行：

```bash
pnpm verify:release:candidate
```

它会生成：

- `RELEASE-CANDIDATE.md`
- `RELEASE-CANDIDATE.json`
- macOS / Linux 手工验收包
- Windows 手工验收包

## 仓库结构

```text
src/                     React 前端
src/assets/              品牌资源与 logo
src/shared/              前端共享类型、API、Activity、manual bridge
src-tauri/               Tauri / Rust 工程
src-tauri/src/nvm/       nvm adapters、parser、runner、安全校验
src-tauri/src/tasks/     任务与互斥执行
src-tauri/icons/         桌面图标资产
docs/EXECUTION.md        执行文档与勾选状态
docs/manual/             手工验收说明
docs/verification/       自动化验证产物索引
docs/PHASE2.md           二期项
scripts/                 验证与验收辅助脚本
```

## 当前限制

- `10.2 / 10.3` 人工验收尚未完成，因此还不能声称“最终发布签收完成”。
- 当前自动化已覆盖 backend 语义与桌面开发链路，但没有替代 macOS / Windows 的完整人工点击验收。
- `offline install` 尚未实现。
- mirror / proxy 编辑尚未进入首版。
- 首版只覆盖 `nvm-sh/nvm` 和 `nvm-windows`。
- macOS / Linux 的 `nvm use` 只影响 NodePilot 发起的任务环境，不会改写用户已经打开的 Terminal 会话。
- Windows 的版本切换依赖全局 symlink，部分操作可能需要管理员权限。

## 二期计划

首版之外但明确需要继续做的项，见：

- [`docs/PHASE2.md`](./docs/PHASE2.md)

当前二期重点包括：

- 提高 `tauri-dev bridge` 稳定性
- 补更多桌面 UI 自动化覆盖
- 在真实 Windows 主机沉淀写操作验证产物
- 评估并实现 `offline install`
- 增加 mirror / proxy 编辑能力

## 故障排查

### `pnpm build` 失败

- 确认 Node.js 与 `pnpm` 已安装
- 删除本地损坏依赖后重新安装

### `cargo test` 失败

- 确认 Rust toolchain 已安装
- 确认 `cargo` 与 `rustup` 可用

### `pnpm tauri dev` 无法启动

- 确认 Tauri 2 平台依赖已安装
- 确认本机可以正常启动 Vite dev server

### 安装 `nvm-sh` 后仍未检测到

- 重新打开 shell
- 或手动 `source` 你的 shell profile 后重新检测

### 安装 `nvm-windows` 后仍未检测到

- 重新打开 PowerShell / Command Prompt
- 手动执行 `nvm version` 检查是否已进入 `PATH`

### 版本切换后状态未刷新

- 先看 Activity 里的 `stdout / stderr / exit code`
- 再看对应的修复建议与 PATH / 权限提示

## 如何提 Issue

当前仓库还没有公开配置远程 issue 地址，因此先按下面的最小规范提交：

1. 先确认问题能稳定复现，或需求边界已经写清楚。
2. 提交前先附上环境信息：
   - 操作系统与版本
   - Node.js、`pnpm`、Rust 版本
   - `nvm-sh/nvm` 或 `nvm-windows` 版本
   - NodePilot 当前分支或 commit
3. 如果是 bug，至少提供：
   - 预期结果
   - 实际结果
   - 复现步骤
   - 相关截图或日志
   - 是否能稳定复现
4. 如果是 feature request，至少提供：
   - 使用场景
   - 当前痛点
   - 希望新增的行为
   - 是否影响 `macOS / Linux`、`Windows`，还是双端
5. 如果问题涉及命令执行、安装、切换、`.nvmrc`，优先附上：
   - Activity 日志
   - [`docs/verification/README.md`](./docs/verification/README.md) 中相关验证项是否已通过
   - 是否能在纯命令行 `nvm` 中复现

建议使用下面的 issue 模板：

```md
标题：一句话描述问题或需求

类型：bug / feature / docs / refactor

环境：
- OS:
- Node.js:
- pnpm:
- Rust:
- nvm:
- NodePilot:

背景：

复现步骤 / 使用场景：
1.
2.
3.

预期结果：

实际结果：

补充日志 / 截图：
```

如果后续仓库接入 GitHub Issues、GitLab Issues 或内部缺陷系统，再把实际入口补到这里。

## 如何贡献代码

欢迎提交文档、测试、bugfix 和功能改进，但建议按下面的流程来：

1. 先开 issue，先对齐问题定义和范围，再开始改代码。
2. 从最新主线拉分支，分支名建议清楚表达目的，例如：
   - `feat/project-nvmrc-write`
   - `fix/windows-admin-warning`
   - `docs/readme-contribution-guide`
3. 改动前先跑一次基础验证：

```bash
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

4. 改动时遵守当前仓库约束：
   - 前端不直接执行 shell
   - 后端只接收结构化命令参数
   - 保留白名单校验和日志脱敏
   - 不把商业化、账号、云同步、遥测带进首版范围
5. 改动后至少补对应测试或验证说明：
   - 前端交互改动：补 `Vitest` / `Testing Library`
   - Rust backend 改动：补 Rust 单测
   - 验证链改动：补 `scripts/` 和 `docs/verification/`
6. 提交前再跑一次：

```bash
pnpm verify:all
```

7. 如果改动会影响人工验收流程，同时更新：
   - [`docs/EXECUTION.md`](./docs/EXECUTION.md)
   - [`docs/manual/README.md`](./docs/manual/README.md)
   - [`docs/PHASE2.md`](./docs/PHASE2.md)（如果属于二期）

建议的提交范围：

- 一次提交只解决一个问题
- 优先小而完整的改动
- 避免顺手重构无关模块
- 不要混入大规模格式化噪音

## 代码贡献：GPT / AI 辅助

允许使用 GPT 或其他 AI 工具辅助贡献，但要满足几个底线：

1. AI 生成内容不能直接当作“已验证代码”提交。
2. 最终责任在提交者本人，不在模型。
3. 所有 AI 参与的改动，提交前都要由人类开发者完成阅读、验证和取舍。
4. 涉及命令执行、安全校验、路径处理、安装流程、权限判断的代码，必须人工复核。
5. 涉及 README、手工验收、执行文档的改动，必须确认文档状态和代码真实状态一致。

推荐的 GPT 使用方式：

- 用它整理问题背景和方案选项
- 用它生成测试草稿、文档草稿、重构草稿
- 用它辅助阅读 Rust parser、Tauri command、前端状态流
- 用它总结日志、比对回归结果、梳理验证边界

不推荐直接依赖 GPT 的场景：

- 未经人工验证就提交可执行代码
- 让模型替代安全判断
- 让模型决定发布是否完成
- 把模型输出当作 issue 结论而不核对证据

如果贡献内容明确使用了 GPT 辅助，建议在 PR 描述或提交说明里写清楚：

- GPT 参与了什么
- 人工复核了什么
- 实际跑过哪些验证命令

## 致谢

NodePilot 首版的产品梳理、界面原型、实现推进、验证收口和文档整理过程中，使用了 OpenAI Codex 作为工程协作与开发辅助工具。

Codex 主要参与辅助了这些工作：

- 信息架构与执行文档整理
- Tauri + React + TypeScript 首版实现推进
- 测试、验证脚本与发布前收口
- README、验收文档与贡献说明整理

## 相关文档

- [执行文档](./docs/EXECUTION.md)
- [手工验收指南](./docs/manual/README.md)
- [自动化验证索引](./docs/verification/README.md)
- [二期计划](./docs/PHASE2.md)

## English

English version:

- [README.en.md](./README.en.md)
