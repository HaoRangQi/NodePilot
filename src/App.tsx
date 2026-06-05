import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import nodePilotLogo from "./assets/nodepilot-logo.svg";
import {
  activateVersion as activateVersionCommand,
  cancelInstallVersionTask,
  detectBackend,
  getBackendInstallGuide,
  getBackendSnapshot,
  getInstallVersionTask,
  healthCheck,
  installVersion,
  listRemote,
  readProjectVersion,
  setDefaultVersion as setDefaultVersionCommand,
  startInstallBackendTask,
  startInstallVersionTask,
  uninstallVersion as uninstallVersionCommand,
  writeProjectVersion,
} from "./shared/api/backend";
import {
  canStartTask,
  durationLabel,
  redactLog,
  taskStatusKey,
  type ActivityAccess,
  type ActivityTask,
  type ActivityTaskType,
} from "./shared/activity/model";
import {
  getManualUiSnapshotConfig,
  type ManualUiSnapshotAppState,
} from "./shared/manual-ui";
import { useManualUiCommandBridge } from "./shared/use-manual-ui-command-bridge";
import { useManualUiSnapshot } from "./shared/use-manual-ui-snapshot";
import type {
  ActivateOptions,
  BackendDetection,
  BackendInstallGuide,
  CommandResult,
  EnvironmentSummary,
  HealthCheckItem,
  InstallOptions,
  InstallTaskSnapshot,
  ManualUiCommand,
  ProjectVersionInfo,
  TaskStatus,
  VersionInfo,
} from "./shared/types/backend";
import type { StatusKey } from "./shared/types/ui";
import "./App.css";

type Screen = "home" | "versions" | "remote" | "projects" | "activity" | "settings";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type Theme = "system" | "light" | "dark";
type Locale = "zh-CN" | "en-US";

type Version = {
  version: string;
  npm: string | null;
  path: string | null;
  arch: string | null;
  status: StatusKey[];
};

type RemoteVersionRow = {
  version: string;
  line: string;
  statuses: StatusKey[];
  installed: boolean;
  isLts: boolean;
  isLatest: boolean;
  major: string;
};

type ProjectRecord = ProjectVersionInfo & {
  name: string;
};

type HomeActionKey = "install_nvm" | "set_default" | "fix_path" | "apply_project" | "check_admin";

type HomeAction = {
  key: HomeActionKey;
  title: string;
  description: string;
};

type RemoteFilterKind = "all" | "lts" | "latest" | "installed" | "uninstalled";

type RemoteCache = {
  versions: VersionInfo[];
  updatedAt: string | null;
};

type ProjectEditorState = {
  projectDir: string;
  projectName: string;
  targetPath: string;
  originalValue: string;
  draftValue: string;
  inherited: boolean;
};

type UninstallTarget = {
  version: string;
  isCurrent: boolean;
  isDefault: boolean;
  isLastManaged: boolean;
};

type VersionDetails = {
  version: string;
  nodePath: string;
  npmPath: string;
  globalPackagesPath: string;
  nodeCheck: string;
  npmCheck: string;
};

type RemoteInstallRequest = {
  version: string;
  reinstallPackagesFrom: "none" | "current" | "default";
  latestNpm: boolean;
  sourceInstall: boolean;
  arch: "system" | "32" | "64" | "all";
};

type BackendInstallDialogState = {
  guide: BackendInstallGuide;
};

const PROJECT_NAME = "NodePilot";
const LOCALE_STORAGE_KEY = "nodepilot.locale";
const THEME_STORAGE_KEY = "nodepilot.theme";
const RECENT_PROJECTS_STORAGE_KEY = "nodepilot.recentProjects";
const REMOTE_CACHE_STORAGE_KEY = "nodepilot.remoteCache";
const ALL_FILTER = "all";
const MAX_ACTIVITY_TASKS = 40;
const INSTALL_TASK_POLL_MS = 250;
const INITIAL_BACKEND_SNAPSHOT: EnvironmentSummary = {
  currentNodeVersion: null,
  npmVersion: null,
  pnpmVersion: null,
  yarnVersion: null,
  nodePath: null,
  npmPath: null,
  backendKind: "unsupported",
  platform: typeof navigator === "undefined" ? "unknown" : /win/i.test(navigator.userAgent) ? "windows" : "macos",
  arch: "unknown",
  versionSource: "unknown",
  defaultVersion: null,
  defaultExists: false,
  defaultMatchesCurrent: false,
  defaultPackagesPath: null,
  defaultPackagesExists: false,
  defaultPackagesEntries: [],
  health: {
    backend: "unsupported",
    items: [],
  },
  installedVersions: [],
};

const navigation: Array<{ id: Screen; icon: string }> = [
  { id: "home", icon: "⌂" },
  { id: "versions", icon: "▦" },
  { id: "remote", icon: "⇣" },
  { id: "projects", icon: "◇" },
  { id: "activity", icon: "≡" },
  { id: "settings", icon: "⚙" },
];

const translations = {
  "zh-CN": {
    localeLabel: "中文",
    appSubtitle: "本地 Node 版本管理原型",
    navigation: {
      home: "总览",
      versions: "本地版本",
      remote: "远程版本",
      projects: "项目",
      activity: "活动",
      settings: "设置",
    },
    navAria: {
      primary: "主导航",
      open: "打开",
    },
    windowControls: {
      group: "窗口控制",
      close: "关闭窗口",
      minimize: "最小化窗口",
      maximize: "最大化窗口",
    },
    status: {
      current: "当前",
      default: "默认",
      lts: "LTS",
      project: "项目",
      system: "系统",
      issue: "问题",
      latest: "最新",
      installed: "已安装",
      available: "可安装",
      ready: "就绪",
      needsInstall: "需安装",
      ok: "正常",
      warn: "警告",
      missing: "缺失",
      damaged: "损坏",
      cancelled: "已取消",
      success: "成功",
      failed: "失败",
      running: "运行中",
    },
    common: {
      refresh: "刷新",
      applyProject: "应用项目版本",
      install: "安装",
      uninstall: "卸载",
      useVersion: "使用版本",
      setDefault: "设为默认",
      confirmBeforeUninstall: "卸载前确认",
      cancel: "取消",
      confirm: "确认",
      installed: "已安装",
      copy: "复制",
    },
    home: {
      eyebrow: "当前环境",
      title: "Node v22.11.0",
      description:
        "当前通过 nvm-sh 在 macOS arm64 上运行。默认版本是 v20.18.1；新的 shell 会使用 default alias。",
      npmLabel: "npm",
      pnpmLabel: "pnpm",
      yarnLabel: "yarn",
      nodePathLabel: "Node 路径",
      npmPathLabel: "npm 路径",
      platformLabel: "平台",
      sourceLabel: "来源",
      unavailable: "未检测到",
      npmHint: "~/.nvm/versions/node/v22.11.0/bin/npm",
      backendLabel: "Backend",
      backendHint: "~/.nvm/nvm.sh 已检测到",
      defaultLabel: "Default",
      defaultHint: "本地可用",
      healthEyebrow: "健康检查",
      healthTitle: "环境检查",
      checks: [
        "nvm 已从 ~/.nvm/nvm.sh 加载",
        "部分 shell 中 system Node 仍排在 PATH 前面",
        "项目 website 请求 lts/*，但最新 LTS 尚未安装",
      ],
      nextEyebrow: "下一步",
      nextTitle: "推荐修复",
      defaultMissing: "default 指向版本不存在",
      defaultMatches: "default 与当前版本一致",
      defaultDiffers: "default 与当前版本不一致",
      sourceNotNvm: "当前 Node 来源不是 nvm 管理版本，建议检查 PATH。",
      projectVersionMissing: ".nvmrc 要求 {version}，但本地尚未安装。",
      nvmUseScope: "macOS/Linux 的 nvm use 只影响当前任务 shell；default alias 影响新的 shell。",
      windowsUseScope: "Windows 的 nvm use 会切换全局 symlink，可能需要管理员权限。",
      installNvmTitle: "安装 nvm",
      installNvmDescription: "先安装当前平台支持的 nvm backend。",
      installGuideEyebrow: "安装引导",
      installGuideTitle: "缺少 nvm backend",
      installGuideLoading: "正在加载当前平台的官方安装流程……",
      installGuideError: "加载安装引导失败。",
      installBackendLabel: "Backend",
      installSourceLabel: "官方来源",
      installScriptUrlLabel: "安装脚本 URL",
      installInstallerUrlLabel: "Installer URL",
      installTargetLabel: "目标路径",
      installCommandLabel: "将执行的命令",
      installFollowUpLabel: "安装后操作",
      installDetectionHintLabel: "重新检测提示",
      installPrivilegeLabel: "权限要求",
      installRequiresAdmin: "需要管理员权限",
      installNoAdmin: "不需要管理员权限",
      installOpenSource: "打开官方来源",
      installConfirmTitle: "确认安装 nvm backend",
      installConfirmDescription:
        "NodePilot 会按当前平台的官方安装流程执行，并把 stdout、stderr 和退出码写入 Activity。",
      installConfirmButton: "确认安装",
      installTaskStarted: "安装任务已启动，日志会写入 Activity。",
      installTaskRunning: "正在安装 {backend}。",
      installTaskSuccess: "{backend} 安装完成，正在重新检测环境。",
      installTaskCancelled: "已取消 {backend} 安装任务。",
      installTaskFailed: "{backend} 安装失败。",
      installTaskRedetectFailed: "安装流程已结束，但当前仍未检测到 nvm。",
      installTaskWindowsPathFailed: "安装器已退出，但当前仍未检测到 `nvm.exe` 进入 PATH。",
      setDefaultTitle: "将当前版本设为 default",
      setDefaultDescription: "让当前环境和新 shell 行为保持一致。",
      fixPathTitle: "复制 PATH 修复片段",
      fixPathDescription: "手动更新 shell profile。",
      applyProjectTitle: "应用项目版本",
      applyProjectDescription: "当前 `.nvmrc` 与已激活版本不一致，建议切换到项目要求的 Node 版本。",
      adminTitle: "检查管理员权限",
      adminDescription: "Windows 切换版本可能需要重新以管理员权限运行，或改为手动处理。",
      actions: [
        ["将 v22.11.0 设为默认", "让当前环境和新 shell 行为保持一致"],
        ["安装最新 LTS", "满足 ~/Work/website 的 .nvmrc 要求"],
        ["复制 PATH 修复片段", "手动更新 shell profile"],
      ],
    },
    versions: {
      eyebrow: "本地",
      title: "已安装版本",
      emptyTitle: "还没有已安装的 Node 版本",
      emptyDescription: "检测到 nvm backend 后，这里会显示本地已安装版本。先去 Remote 安装一个版本，再回来管理切换。",
      npmColumn: "npm",
      confirmDialogTitle: "确认卸载版本",
      confirmDialogDescription: "你将卸载 {version}。",
      confirmDialogMockNote: "此操作会调用 backend 卸载所选 Node 版本。",
      deleteCurrentWarning: "正在删除当前版本。",
      deleteDefaultWarning: "正在删除默认版本。",
      deleteLastManagedWarning: "这是最后一个 nvm 管理版本。",
      activateFailed: "切换版本失败",
      setDefaultFailed: "设置默认版本失败",
      uninstallFailed: "卸载版本失败",
      uninstallInUse: "卸载 {version} 失败：该版本看起来仍在使用中。",
      uninstallPermissionDenied: "卸载 {version} 失败：当前权限不足，或系统拒绝访问安装目录。",
      uninstallMissingVersion: "卸载 {version} 失败：目标版本看起来并未安装。",
      uninstallBusy: "卸载 {version} 失败：目标目录仍被其他进程占用。",
      uninstallUnknownReason: "卸载 {version} 失败：{reason}",
      uninstallFixInUse: "先切换到其他 Node 版本，并关闭仍在使用该版本的终端或进程后再重试。",
      uninstallFixPermissionDenied: "关闭占用该版本的工具；如果是 Windows，全局切换或删除时可能还需要管理员权限。",
      uninstallFixMissingVersion: "先刷新本地版本列表；如果该版本已被手动删除，可以忽略这条记录。",
      uninstallFixBusy: "关闭引用该安装目录的终端、编辑器或后台进程后再重试。",
      uninstallFixGeneric: "查看 stderr 日志；必要时手动执行 `nvm uninstall {version}` 进一步确认。",
      windowsSymlinkNotice: "Windows 下的 nvm use 会更新全局 symlink，并且切换时可能需要管理员权限。",
      copyVersion: "复制版本号",
      openInstallDir: "打开安装目录",
      viewDetails: "查看详情",
      detailTitle: "版本详情",
      nodePath: "Node 路径",
      npmPath: "npm 路径",
      globalPackagesPath: "global packages 路径",
      nodeCheck: "node -v 验证",
      npmCheck: "npm -v 验证",
    },
    remote: {
      eyebrow: "远程",
      title: "可用 Node 版本",
      installLatest: "安装最新版本",
      installLts: "安装最新 LTS",
      installMajor: "安装 v{major}.x 最新 patch",
      installDialogTitle: "安装远程版本",
      installDialogHint: "安装任务会进入 Activity，并在完成后刷新本地版本状态。",
      installDialogVersion: "目标版本",
      installDialogPackages: "迁移全局包",
      installDialogNone: "不迁移",
      installDialogCurrent: "从 current 迁移",
      installDialogDefault: "从 default 迁移",
      installDialogLatestNpm: "同时安装 latest npm",
      installDialogSourceInstall: "从源码编译安装",
      installDialogArch: "架构",
      installDialogArchSystem: "系统默认",
      installDialogArch32: "32-bit",
      installDialogArch64: "64-bit",
      installDialogArchAll: "all",
      installDialogConfirm: "确认安装",
      refreshRemote: "刷新远程列表",
      search: "搜索 v22、lts、latest",
      lastUpdated: "上次刷新",
      cached: "已缓存",
      loading: "正在刷新远程列表……",
      loadFailed: "拉取远程版本失败。",
      installFailed: "安装远程版本失败。",
      empty: "没有匹配的远程版本。",
      filterAll: "全部",
      filterLts: "LTS",
      filterLatest: "Latest",
      filterInstalled: "已安装",
      filterUninstalled: "未安装",
      majorAll: "全部 major",
      latestLine: "Latest",
      unknownLine: "未标注",
      installDisabled: "当前动作没有可安装的远程版本。",
    },
    projects: {
      eyebrow: "项目",
      title: ".nvmrc 工作区状态",
      chooseDirectory: "选择目录",
      installVersion: "安装 .nvmrc 版本",
      createNvmrc: "创建 .nvmrc",
      editNvmrc: "修改 .nvmrc",
      apply: "应用",
      applyVersion: "按 .nvmrc 应用版本",
      openDirectory: "打开目录",
      copyCommand: "复制推荐命令",
      targetPath: "目标路径",
      versionInput: "版本内容",
      diffPreview: "写入预览",
      writeConfirm: "确认写入",
      writeHint: "只会写入当前项目目录下的 .nvmrc，不会执行 nvm install。",
      installFailed: "安装 .nvmrc 指定版本失败",
      writeFailed: "写入 .nvmrc 失败",
      applyFailed: "按 .nvmrc 应用版本失败",
      selectProjectFirst: "请先选择一个项目目录。",
      installUnavailable: "当前 .nvmrc 不可直接安装，通常是版本已安装、内容非法或没有版本值。",
      applyUnavailable: "当前 .nvmrc 不可直接应用，通常是版本未安装或内容非法。",
      emptyTitle: "还没有选择项目",
      emptyDescription: "选择一个项目目录后，NodePilot 会读取当前目录或父目录中的 .nvmrc。",
      recentTitle: "最近项目",
      nvmrcPath: ".nvmrc 路径",
      nvmrcContent: ".nvmrc 内容",
      inherited: "父目录继承",
      local: "当前目录",
      valid: "合法",
      invalid: "非法",
      installed: "版本已安装",
      notInstalled: "版本未安装",
      noNvmrc: "未找到 .nvmrc",
      readFailed: "读取 .nvmrc 失败",
    },
    activity: {
      eyebrow: "活动",
      title: "任务日志",
      actionNames: {
        detect: "检测环境",
        health_check: "健康检查",
        remote_refresh: "刷新远程列表",
        install_backend: "安装 nvm",
        install: "安装版本",
        uninstall: "卸载版本",
        activate: "使用版本",
        set_default: "设置默认版本",
        project_nvmrc_read: "读取 .nvmrc",
        project_nvmrc_write: "写入 .nvmrc",
      },
      stdout: "stdout",
      stderr: "stderr",
      exitCode: "退出码",
      duration: "耗时",
      access: "访问",
      read: "只读",
      write: "写操作",
      copyLogs: "复制日志",
      cancelTask: "取消任务",
      cancelRequested: "已请求取消，等待任务退出。",
      collapseLogs: "折叠日志",
      expandLogs: "展开日志",
      writeLockActive: "写操作正在运行，新的写操作会排队；只读操作允许并行。",
      repair: "推荐修复",
    },
    settings: {
      backendEyebrow: "Backend",
      backendTitle: "Backend 状态",
      backendType: "Backend 类型",
      backendVersion: "nvm 版本",
      backendPath: "nvm 路径",
      versionStore: "Node 版本存储",
      windowsRoot: "Windows root/symlink",
      activationBehavior: "切换行为",
      activationCopy: "只影响当前任务环境；default alias 影响新的 shell。",
      shellEyebrow: "Shell",
      shellTitle: "Profile 检测",
      shellIntegration: "Shell 集成片段",
      copyShellSnippet: "复制 shell 片段",
      shellReadonlyHint: "仅提供复制，不会自动修改你的 profile。",
      profileLoaded: "已加载 nvm",
      profileMissing: "未检测到 nvm 片段",
      profileUnavailable: "当前 backend 不提供该检测",
      networkEyebrow: "网络",
      networkTitle: "Mirror 与 proxy",
      nodeMirror: "Node mirror",
      npmMirror: "npm mirror",
      proxy: "Proxy",
      diagnosticsEyebrow: "诊断",
      diagnosticsTitle: "环境诊断",
      diagnosticsEmpty: "当前没有额外诊断项。",
      defaultPackagesEyebrow: "Packages",
      defaultPackagesTitle: "default-packages",
      defaultPackagesPath: "default-packages 路径",
      defaultPackagesContent: "default packages 内容",
      defaultPackagesMissing: "未检测到 default-packages 文件",
      defaultPackagesEmpty: "文件存在，但当前没有包条目",
      notConfigured: "未配置",
      readOnly: "只读",
      appearanceEyebrow: "外观",
      appearanceTitle: "主题",
      languageTitle: "语言",
      system: "跟随系统",
      light: "浅色",
      dark: "深色",
    },
  },
  "en-US": {
    localeLabel: "English",
    appSubtitle: "Local Node version manager prototype",
    navigation: {
      home: "Home",
      versions: "Versions",
      remote: "Remote",
      projects: "Projects",
      activity: "Activity",
      settings: "Settings",
    },
    navAria: {
      primary: "Primary navigation",
      open: "Open",
    },
    windowControls: {
      group: "Window controls",
      close: "Close window",
      minimize: "Minimize window",
      maximize: "Maximize window",
    },
    status: {
      current: "Current",
      default: "Default",
      lts: "LTS",
      project: "Project",
      system: "System",
      issue: "Issue",
      latest: "Latest",
      installed: "Installed",
      available: "Available",
      ready: "Ready",
      needsInstall: "Needs install",
      ok: "OK",
      warn: "Warn",
      missing: "Missing",
      damaged: "Damaged",
      cancelled: "Cancelled",
      success: "Success",
      failed: "Failed",
      running: "Running",
    },
    common: {
      refresh: "Refresh",
      applyProject: "Apply project",
      install: "Install",
      uninstall: "Uninstall",
      useVersion: "Use version",
      setDefault: "Set default",
      confirmBeforeUninstall: "Confirm before uninstall",
      cancel: "Cancel",
      confirm: "Confirm",
      installed: "Installed",
      copy: "Copy",
    },
    home: {
      eyebrow: "Current environment",
      title: "Node v22.11.0",
      description:
        "Running through nvm-sh on macOS arm64. Default version is v20.18.1; new shells will use the default alias.",
      npmLabel: "npm",
      pnpmLabel: "pnpm",
      yarnLabel: "yarn",
      nodePathLabel: "Node path",
      npmPathLabel: "npm path",
      platformLabel: "Platform",
      sourceLabel: "Source",
      unavailable: "Not detected",
      npmHint: "~/.nvm/versions/node/v22.11.0/bin/npm",
      backendLabel: "Backend",
      backendHint: "~/.nvm/nvm.sh detected",
      defaultLabel: "Default",
      defaultHint: "Available locally",
      healthEyebrow: "Health",
      healthTitle: "Environment checks",
      checks: [
        "nvm is loaded from ~/.nvm/nvm.sh",
        "System Node is still earlier in PATH for some shells",
        "Project website requests lts/*, but latest LTS is not installed",
      ],
      nextEyebrow: "Next actions",
      nextTitle: "Recommended fixes",
      defaultMissing: "default points to a missing version",
      defaultMatches: "default matches the current version",
      defaultDiffers: "default differs from the current version",
      sourceNotNvm: "Current Node is not managed by nvm. Check PATH ordering.",
      projectVersionMissing: ".nvmrc requires {version}, but it is not installed locally.",
      nvmUseScope: "On macOS/Linux, nvm use only affects this task shell; default alias affects new shells.",
      windowsUseScope: "On Windows, nvm use switches the global symlink and may require administrator permissions.",
      installNvmTitle: "Install nvm",
      installNvmDescription: "Install the supported nvm backend for this platform first.",
      installGuideEyebrow: "Setup",
      installGuideTitle: "Missing nvm backend",
      installGuideLoading: "Loading the official install flow for this platform…",
      installGuideError: "Failed to load the install guide.",
      installBackendLabel: "Backend",
      installSourceLabel: "Official source",
      installScriptUrlLabel: "Install script URL",
      installInstallerUrlLabel: "Installer URL",
      installTargetLabel: "Target path",
      installCommandLabel: "Command",
      installFollowUpLabel: "After install",
      installDetectionHintLabel: "Detection hint",
      installPrivilegeLabel: "Privileges",
      installRequiresAdmin: "Administrator required",
      installNoAdmin: "No administrator rights required",
      installOpenSource: "Open official source",
      installConfirmTitle: "Confirm nvm backend install",
      installConfirmDescription:
        "NodePilot will run the official install flow for this platform and capture stdout, stderr, and the exit code in Activity.",
      installConfirmButton: "Install backend",
      installTaskStarted: "The install task has started and will stream logs in Activity.",
      installTaskRunning: "Installing {backend}.",
      installTaskSuccess: "Installed {backend}. Refreshing backend detection.",
      installTaskCancelled: "Cancelled installation for {backend}.",
      installTaskFailed: "Failed to install {backend}.",
      installTaskRedetectFailed: "The installer finished, but nvm is still not detected.",
      installTaskWindowsPathFailed: "The installer finished, but `nvm.exe` is still not available on PATH.",
      setDefaultTitle: "Set current as default",
      setDefaultDescription: "Align current and new shell behavior.",
      fixPathTitle: "Copy PATH fix",
      fixPathDescription: "Update the shell profile manually.",
      applyProjectTitle: "Apply project version",
      applyProjectDescription:
        "The current `.nvmrc` target differs from the active version. Switch to the Node version required by this project.",
      adminTitle: "Check administrator rights",
      adminDescription:
        "Windows version switching may require rerunning with administrator permissions or handling the change manually.",
      actions: [
        ["Set v22.11.0 as default", "Align current and new shell behavior"],
        ["Install latest LTS", "Required by ~/Work/website .nvmrc"],
        ["Copy PATH fix", "Manual shell profile update"],
      ],
    },
    versions: {
      eyebrow: "Local",
      title: "Installed versions",
      emptyTitle: "No installed Node versions yet",
      emptyDescription:
        "Once a supported nvm backend is detected, local Node installs appear here. Install a version from Remote first, then return here to switch and manage it.",
      npmColumn: "npm",
      confirmDialogTitle: "Confirm uninstall",
      confirmDialogDescription: "You are about to uninstall {version}.",
      confirmDialogMockNote: "This action calls the backend and removes the selected Node version.",
      deleteCurrentWarning: "The current version is being removed.",
      deleteDefaultWarning: "The default version is being removed.",
      deleteLastManagedWarning: "This is the last nvm-managed version.",
      activateFailed: "Failed to switch the active version",
      setDefaultFailed: "Failed to set the default version",
      uninstallFailed: "Failed to uninstall the version",
      uninstallInUse: "Failed to uninstall {version}: the version still appears to be in use.",
      uninstallPermissionDenied:
        "Failed to uninstall {version}: access was denied or the install directory is blocked.",
      uninstallMissingVersion: "Failed to uninstall {version}: the target version does not appear to be installed.",
      uninstallBusy: "Failed to uninstall {version}: another process is still using the install directory.",
      uninstallUnknownReason: "Failed to uninstall {version}: {reason}",
      uninstallFixInUse:
        "Switch to another Node version first, then close shells or processes still using this version and try again.",
      uninstallFixPermissionDenied:
        "Close tools using this version; on Windows you may also need administrator rights before retrying.",
      uninstallFixMissingVersion:
        "Refresh the local version list first. If the version was already removed manually, you can ignore this entry.",
      uninstallFixBusy:
        "Close terminals, editors, or background processes that still reference this install directory, then try again.",
      uninstallFixGeneric:
        "Review stderr for the concrete backend error. If needed, run `nvm uninstall {version}` manually to confirm.",
      windowsSymlinkNotice:
        "On Windows, nvm use updates the global symlink and version switching may require administrator permissions.",
      copyVersion: "Copy version",
      openInstallDir: "Open install directory",
      viewDetails: "View details",
      detailTitle: "Version details",
      nodePath: "Node path",
      npmPath: "npm path",
      globalPackagesPath: "Global packages path",
      nodeCheck: "node -v check",
      npmCheck: "npm -v check",
    },
    remote: {
      eyebrow: "Remote",
      title: "Available Node releases",
      installLatest: "Install latest",
      installLts: "Install latest LTS",
      installMajor: "Install latest v{major}.x",
      installDialogTitle: "Install remote release",
      installDialogHint: "The install task will appear in Activity and refresh local versions when it completes.",
      installDialogVersion: "Target version",
      installDialogPackages: "Migrate global packages",
      installDialogNone: "Do not migrate",
      installDialogCurrent: "From current",
      installDialogDefault: "From default",
      installDialogLatestNpm: "Install latest npm too",
      installDialogSourceInstall: "Build from source",
      installDialogArch: "Architecture",
      installDialogArchSystem: "System default",
      installDialogArch32: "32-bit",
      installDialogArch64: "64-bit",
      installDialogArchAll: "all",
      installDialogConfirm: "Confirm install",
      refreshRemote: "Refresh remote",
      search: "Search v22, lts, latest",
      lastUpdated: "Last refreshed",
      cached: "Cached",
      loading: "Refreshing remote releases…",
      loadFailed: "Failed to load remote releases.",
      installFailed: "Failed to install the remote release.",
      empty: "No remote releases match the current filters.",
      filterAll: "All",
      filterLts: "LTS",
      filterLatest: "Latest",
      filterInstalled: "Installed",
      filterUninstalled: "Uninstalled",
      majorAll: "All majors",
      latestLine: "Latest",
      unknownLine: "Unlabeled",
      installDisabled: "No installable release is available for this action.",
    },
    projects: {
      eyebrow: "Projects",
      title: ".nvmrc workspace status",
      chooseDirectory: "Choose directory",
      installVersion: "Install .nvmrc version",
      createNvmrc: "Create .nvmrc",
      editNvmrc: "Edit .nvmrc",
      apply: "Apply",
      applyVersion: "Apply .nvmrc version",
      openDirectory: "Open directory",
      copyCommand: "Copy suggested command",
      targetPath: "Target path",
      versionInput: "Version value",
      diffPreview: "Write preview",
      writeConfirm: "Confirm write",
      writeHint: "This only writes .nvmrc in the current project directory. It does not run nvm install.",
      installFailed: "Failed to install the version requested by .nvmrc",
      writeFailed: "Failed to write .nvmrc",
      applyFailed: "Failed to apply the version requested by .nvmrc",
      selectProjectFirst: "Select a project directory first.",
      installUnavailable:
        "This .nvmrc cannot be installed directly, usually because the version is already installed, invalid, or missing.",
      applyUnavailable: "This .nvmrc cannot be applied directly, usually because the version is invalid or not installed.",
      emptyTitle: "No project selected",
      emptyDescription: "Choose a project directory and NodePilot will read .nvmrc from that folder or a parent folder.",
      recentTitle: "Recent projects",
      nvmrcPath: ".nvmrc path",
      nvmrcContent: ".nvmrc content",
      inherited: "Inherited from parent",
      local: "Current directory",
      valid: "Valid",
      invalid: "Invalid",
      installed: "Version installed",
      notInstalled: "Version not installed",
      noNvmrc: ".nvmrc not found",
      readFailed: "Failed to read .nvmrc",
    },
    activity: {
      eyebrow: "Activity",
      title: "Task log",
      actionNames: {
        detect: "Detect environment",
        health_check: "Health check",
        remote_refresh: "Remote refresh",
        install_backend: "Install nvm",
        install: "Install version",
        uninstall: "Uninstall version",
        activate: "Use version",
        set_default: "Set default",
        project_nvmrc_read: "Read .nvmrc",
        project_nvmrc_write: "Write .nvmrc",
      },
      stdout: "stdout",
      stderr: "stderr",
      exitCode: "Exit code",
      duration: "Duration",
      access: "Access",
      read: "Read",
      write: "Write",
      copyLogs: "Copy logs",
      cancelTask: "Cancel task",
      cancelRequested: "Cancellation requested. Waiting for the task to exit.",
      collapseLogs: "Collapse logs",
      expandLogs: "Expand logs",
      writeLockActive: "A write task is running. New write tasks queue; read tasks may run in parallel.",
      repair: "Recommended fix",
    },
    settings: {
      backendEyebrow: "Backend",
      backendTitle: "Backend status",
      backendType: "Backend type",
      backendVersion: "nvm version",
      backendPath: "nvm path",
      versionStore: "Node version store",
      windowsRoot: "Windows root/symlink",
      activationBehavior: "Activation behavior",
      activationCopy: "Current task only; default alias affects new shells.",
      shellEyebrow: "Shell",
      shellTitle: "Profile checks",
      shellIntegration: "Shell integration snippet",
      copyShellSnippet: "Copy shell snippet",
      shellReadonlyHint: "Copy only. NodePilot will not modify your profile automatically.",
      profileLoaded: "nvm snippet loaded",
      profileMissing: "nvm snippet missing",
      profileUnavailable: "No profile checks for this backend",
      networkEyebrow: "Network",
      networkTitle: "Mirror and proxy",
      nodeMirror: "Node mirror",
      npmMirror: "npm mirror",
      proxy: "Proxy",
      diagnosticsEyebrow: "Diagnostics",
      diagnosticsTitle: "Environment diagnostics",
      diagnosticsEmpty: "No additional diagnostics are currently reported.",
      defaultPackagesEyebrow: "Packages",
      defaultPackagesTitle: "default-packages",
      defaultPackagesPath: "default-packages path",
      defaultPackagesContent: "default packages content",
      defaultPackagesMissing: "default-packages file not detected",
      defaultPackagesEmpty: "File exists, but no package entries are configured",
      notConfigured: "Not configured",
      readOnly: "Read only",
      appearanceEyebrow: "Appearance",
      appearanceTitle: "Theme",
      languageTitle: "Language",
      system: "System",
      light: "Light",
      dark: "Dark",
    },
  },
} as const;

type Copy = (typeof translations)[Locale];

function getInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en-US") return stored;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "system" || stored === "light" || stored === "dark") return stored;
  return "system";
}

function getSystemTheme(): Exclude<Theme, "system"> {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

type WindowControlAction = "close" | "minimize" | "maximize";

const windowControlItems: Array<{ action: WindowControlAction; className: string }> = [
  { action: "close", className: "window-control-close" },
  { action: "minimize", className: "window-control-minimize" },
  { action: "maximize", className: "window-control-maximize" },
];

async function runWindowControl(action: WindowControlAction): Promise<void> {
  try {
    const currentWindow = getCurrentWindow();

    switch (action) {
      case "close":
        await currentWindow.close();
        break;
      case "minimize":
        await currentWindow.minimize();
        break;
      case "maximize":
        await currentWindow.toggleMaximize();
        break;
    }
  } catch (error) {
    console.error(`Unable to ${action} the current window.`, error);
  }
}

async function startWindowDrag(): Promise<void> {
  try {
    await getCurrentWindow().startDragging();
  } catch (error) {
    console.error("Unable to drag the current window.", error);
  }
}

function handleWindowDragMouseDown(event: ReactMouseEvent<HTMLElement>): void {
  if (event.button !== 0) return;
  if (event.target instanceof HTMLElement && event.target.closest("button, a, input, select, textarea")) {
    return;
  }
  void startWindowDrag();
}

function statusTone(status: StatusKey): Tone {
  if (["current", "default", "ready", "installed", "success", "ok"].includes(status)) {
    return "success";
  }
  if (["issue", "failed", "needsInstall", "missing", "damaged"].includes(status)) return "danger";
  if (status === "cancelled") return "warning";
  if (["running", "project", "latest"].includes(status)) return "info";
  if (["system", "available", "lts", "warn"].includes(status)) return "warning";
  return "neutral";
}

function taskStatusToStatusKey(status: TaskStatus): StatusKey {
  switch (status) {
    case "success":
      return "ok";
    case "failed":
      return "issue";
    case "pending":
      return "warn";
    case "running":
      return "running";
    case "cancelled":
      return "cancelled";
  }
}

function backendLabel(kind: EnvironmentSummary["backendKind"]): string {
  switch (kind) {
    case "nvm-sh":
      return "nvm-sh";
    case "nvm-windows":
      return "nvm-windows";
    case "missing":
      return "missing";
    case "unsupported":
      return "unsupported";
  }
}

function backendHint(snapshot: EnvironmentSummary, copy: Copy): string {
  const scopeHint =
    snapshot.backendKind === "nvm-windows" ? copy.home.windowsUseScope : copy.home.nvmUseScope;
  return `${snapshot.platform} ${snapshot.arch} · ${scopeHint}`;
}

function defaultHint(snapshot: EnvironmentSummary, copy: Copy): string {
  if (!snapshot.defaultVersion) return copy.home.unavailable;
  if (!snapshot.defaultExists) return copy.home.defaultMissing;
  return snapshot.defaultMatchesCurrent ? copy.home.defaultMatches : copy.home.defaultDiffers;
}

function healthChecks(
  snapshot: EnvironmentSummary,
  selectedProject: ProjectRecord | null,
  copy: Copy,
): HealthCheckItem[] {
  const diagnostics = settingsDiagnostics(snapshot);
  const checks = (diagnostics.length > 0 ? diagnostics : snapshot.health.items).slice(0, 5);
  if (
    selectedProject !== null &&
    Boolean(selectedProject.nvmrcPath) &&
    selectedProject.isValid &&
    Boolean(selectedProject.version) &&
    !selectedProject.isInstalled
  ) {
    checks.push({
      key: "project_nvmrc_missing_version",
      status: "failed",
      summary: fillVersionTemplate(copy.home.projectVersionMissing, selectedProject.version ?? ""),
      detail: selectedProject.nvmrcPath ?? selectedProject.projectDir,
    });
  }
  if (snapshot.versionSource !== "nvm-sh" && snapshot.versionSource !== "nvm-windows") {
    checks.push({
      key: "version_source",
      status: "failed",
      summary: copy.home.sourceNotNvm,
      detail: snapshot.nodePath,
    });
  }
  return checks;
}

function recommendedActions(
  snapshot: EnvironmentSummary,
  selectedProject: ProjectRecord | null,
  copy: Copy,
): HomeAction[] {
  const actions: HomeAction[] = [];
  const hasMissingNvm = snapshot.backendKind === "missing";
  const hasPathIssue = snapshot.health.items.some(
    (item) =>
      ((item.key === "node_path_source" || item.key === "windows_node_install_conflict") &&
        item.status !== "success") ||
      (item.key === "npm_prefix" && item.status === "failed"),
  );
  const hasPermissionIssue = snapshot.health.items.some(
    (item) => item.key === "admin_required" && item.status !== "success",
  );
  const projectVersion = selectedProject?.version ?? null;
  const hasProjectVersionMismatch =
    selectedProject !== null &&
    Boolean(selectedProject.nvmrcPath) &&
    selectedProject.isValid &&
    selectedProject.isInstalled &&
    projectVersion !== null &&
    !versionsMatch(projectVersion, snapshot.currentNodeVersion);

  if (hasMissingNvm) {
    actions.push({
      key: "install_nvm",
      title: copy.home.installNvmTitle,
      description: copy.home.installNvmDescription,
    });
  }
  if (!snapshot.defaultVersion || !snapshot.defaultExists || !snapshot.defaultMatchesCurrent) {
    actions.push({
      key: "set_default",
      title: copy.home.setDefaultTitle,
      description: copy.home.setDefaultDescription,
    });
  }
  if (hasPathIssue) {
    actions.push({
      key: "fix_path",
      title: copy.home.fixPathTitle,
      description: copy.home.fixPathDescription,
    });
  }
  if (hasProjectVersionMismatch) {
    actions.push({
      key: "apply_project",
      title: copy.home.applyProjectTitle,
      description: copy.home.applyProjectDescription,
    });
  }
  if (hasPermissionIssue) {
    actions.push({
      key: "check_admin",
      title: copy.home.adminTitle,
      description: copy.home.adminDescription,
    });
  }

  return actions.length > 0
    ? actions
    : copy.home.actions.map(([title, description], index) => ({
        key: (["set_default", "install_nvm", "fix_path"][index] ?? "fix_path") as HomeActionKey,
        title,
        description,
      }));
}

function formatHealthCheckStdout(health: Pick<EnvironmentSummary, "health">["health"]): string {
  if (health.items.length === 0) return "items=0";

  return health.items
    .map((item) => `${item.status} ${item.key}: ${item.summary}`)
    .join("\n");
}

function settingsDiagnostics(snapshot: EnvironmentSummary): HealthCheckItem[] {
  return snapshot.health.items.filter((item) => !item.key.startsWith("profile_"));
}

function versionRows(snapshot: EnvironmentSummary): Version[] {
  return snapshot.installedVersions.map((version) => {
    const status: StatusKey[] = [];
    if (versionsMatch(version.version, snapshot.currentNodeVersion) || version.isCurrent) {
      status.push("current");
    }
    if (versionsMatch(version.version, snapshot.defaultVersion) || version.isDefault) {
      status.push("default");
    }
    if (version.isLts) status.push("lts");
    if (version.isSystem) status.push("system");
    const derivedState = version.state ?? (!version.path ? "missing" : "ok");
    if (derivedState === "damaged") status.push("damaged");
    if (derivedState === "missing") status.push("missing");
    if ((status.includes("missing") || status.includes("damaged")) && status.includes("installed")) {
      status.splice(status.indexOf("installed"), 1);
    }
    const uniqueStatus = Array.from(new Set(status));
    if (uniqueStatus.length === 0) uniqueStatus.push("installed");

    return {
      version: version.version,
      npm: version.npmVersion,
      path: version.path,
      arch: version.arch ?? snapshot.arch,
      status: uniqueStatus,
    };
  });
}

function npmPathFromNodePath(nodePath: string | null): string | null {
  if (!nodePath) return null;
  if (nodePath.endsWith("/bin/node")) {
    return nodePath.replace(/\/bin\/node$/, "/bin/npm");
  }
  if (nodePath.endsWith("\\node.exe")) {
    return nodePath.replace(/\\node\.exe$/, "\\npm.cmd");
  }
  return null;
}

function globalPackagesPathFromNodePath(nodePath: string | null): string | null {
  if (!nodePath) return null;
  if (nodePath.endsWith("/bin/node")) {
    return nodePath.replace(/\/bin\/node$/, "/lib/node_modules");
  }
  if (nodePath.endsWith("\\node.exe")) {
    return nodePath.replace(/\\node\.exe$/, "\\node_modules");
  }
  return null;
}

function buildVersionDetails(version: Version): VersionDetails {
  const nodePath = version.path ?? "";
  const npmPath = npmPathFromNodePath(version.path) ?? "";
  const globalPackagesPath = globalPackagesPathFromNodePath(version.path) ?? "";

  return {
    version: version.version,
    nodePath,
    npmPath,
    globalPackagesPath,
    nodeCheck: version.version,
    npmCheck: version.npm ?? "",
  };
}

function projectNameFromPath(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

function fillVersionTemplate(template: string, version: string) {
  return fillTemplate(template, { version });
}

function fillBackendTemplate(template: string, backend: string) {
  return fillTemplate(template, { backend });
}

function fillTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.split(`{${key}}`).join(value),
    template,
  );
}

function projectStatus(project: ProjectVersionInfo): StatusKey {
  if (!project.nvmrcPath) return "missing";
  if (!project.isValid) return "failed";
  return project.isInstalled ? "ready" : "needsInstall";
}

function projectStatusLabel(project: ProjectVersionInfo, copy: Copy) {
  if (!project.nvmrcPath) return copy.projects.noNvmrc;
  if (!project.isValid) return copy.projects.invalid;
  return project.isInstalled ? copy.projects.installed : copy.projects.notInstalled;
}

function recentProjectsFromStorage(): ProjectRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isProjectRecord).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: ProjectRecord[]) {
  localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(projects.slice(0, 8)));
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectRecord>;
  return typeof candidate.name === "string" && typeof candidate.projectDir === "string";
}

function projectRecordFromResult(info: ProjectVersionInfo): ProjectRecord {
  return {
    ...info,
    name: projectNameFromPath(info.projectDir),
  };
}

function joinProjectPath(projectDir: string, leaf: string): string {
  const separator = projectDir.includes("\\") ? "\\" : "/";
  return `${projectDir.replace(/[\\/]$/, "")}${separator}${leaf}`;
}

function targetProjectNvmrcPath(project: ProjectVersionInfo): string {
  if (project.nvmrcPath && !project.inherited) return project.nvmrcPath;
  return joinProjectPath(project.projectDir, ".nvmrc");
}

function currentProjectEditableValue(project: ProjectVersionInfo): string {
  if (!project.nvmrcPath || project.inherited) return "";
  return project.rawContent?.trim() ?? project.version ?? "";
}

function projectEditorFromRecord(project: ProjectRecord): ProjectEditorState {
  return {
    projectDir: project.projectDir,
    projectName: project.name,
    targetPath: targetProjectNvmrcPath(project),
    originalValue: currentProjectEditableValue(project),
    draftValue: project.version ?? "",
    inherited: project.inherited,
  };
}

function projectSuggestedCommand(project: ProjectVersionInfo): string | null {
  if (!project.version || !project.isValid) return null;
  const version = project.version.trim();
  if (!version) return null;
  return project.isInstalled
    ? `nvm use ${version}`
    : `nvm install ${version}\nnvm use ${version}`;
}

function projectDiffPreview(editor: ProjectEditorState): string {
  const before = editor.originalValue.trim();
  const after = editor.draftValue.trim();

  if (!before && !after) return "(no changes)";
  if (!before) return `+ ${after}`;
  if (!after) return `- ${before}`;
  if (before === after) return `  ${after}`;
  return `- ${before}\n+ ${after}`;
}

function fillMajorTemplate(template: string, major: string) {
  return template.split("{major}").join(major);
}

function installCommand(options: InstallOptions): string {
  const parts = ["nvm", "install"];
  if (options.sourceInstall) {
    parts.push("-s");
  }
  parts.push(options.version);
  if (options.reinstallPackagesFrom) {
    parts.push(`--reinstall-packages-from=${options.reinstallPackagesFrom}`);
  }
  if (options.latestNpm) {
    parts.push("--latest-npm");
  }
  if (options.arch) {
    parts.push(options.arch);
  }
  return parts.join(" ");
}

function remoteCacheFromStorage(): RemoteCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMOTE_CACHE_STORAGE_KEY) ?? "null");
    return isRemoteCache(parsed) ? parsed : { versions: [], updatedAt: null };
  } catch {
    return { versions: [], updatedAt: null };
  }
}

function saveRemoteCache(cache: RemoteCache) {
  localStorage.setItem(REMOTE_CACHE_STORAGE_KEY, JSON.stringify(cache));
}

function isRemoteCache(value: unknown): value is RemoteCache {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RemoteCache>;
  return (
    Array.isArray(candidate.versions) &&
    candidate.versions.every(isVersionInfo) &&
    (typeof candidate.updatedAt === "string" || candidate.updatedAt === null)
  );
}

function isVersionInfo(value: unknown): value is VersionInfo {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VersionInfo>;
  return typeof candidate.version === "string";
}

function displayVersion(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}

function majorFromVersion(version: string): string {
  return normalizeVersion(version).split(".")[0] ?? normalizeVersion(version);
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function remoteLineLabel(version: VersionInfo, copy: Copy, isLatest: boolean): string {
  if (version.isLts) {
    return `LTS ${version.line ?? copy.remote.unknownLine}`;
  }
  if (version.line) return version.line;
  if (isLatest) return copy.remote.latestLine;
  return copy.remote.unknownLine;
}

function remoteRows(
  remoteVersions: VersionInfo[],
  installedVersions: VersionInfo[],
  copy: Copy,
): RemoteVersionRow[] {
  const sorted = remoteVersions
    .slice()
    .sort((left, right) => compareVersions(right.version, left.version));
  const latestVersion = sorted[0]?.version ?? null;

  return sorted.map((version) => {
    const installed = installedVersions.some((item) => versionsMatch(item.version, version.version));
    const isLatest = latestVersion !== null && versionsMatch(version.version, latestVersion);
    const statuses: StatusKey[] = [];
    if (isLatest) statuses.push("latest");
    if (version.isLts) statuses.push("lts");
    statuses.push(installed ? "installed" : "available");

    return {
      version: displayVersion(version.version),
      line: remoteLineLabel(version, copy, isLatest),
      statuses,
      installed,
      isLts: version.isLts,
      isLatest,
      major: majorFromVersion(version.version),
    };
  });
}

function remoteMajorOptions(rows: RemoteVersionRow[]): string[] {
  return Array.from(new Set(rows.map((item) => item.major))).sort((left, right) => compareVersions(left, right));
}

function remoteMatchesFilter(
  row: RemoteVersionRow,
  filter: RemoteFilterKind,
  major: string,
  query: string,
): boolean {
  if (filter === "lts" && !row.isLts) return false;
  if (filter === "latest" && !row.isLatest) return false;
  if (filter === "installed" && !row.installed) return false;
  if (filter === "uninstalled" && row.installed) return false;
  if (major !== ALL_FILTER && row.major !== major) return false;
  if (!query) return true;

  const haystack = [
    row.version,
    row.line,
    row.major,
    row.isLts ? "lts" : "",
    row.isLatest ? "latest" : "",
    row.installed ? "installed" : "available",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function formatLastUpdated(updatedAt: string | null, locale: Locale, fallback: string): string {
  if (!updatedAt) return fallback;

  try {
    return new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(updatedAt));
  } catch {
    return updatedAt;
  }
}

function installDirectoryFromPath(path: string | null): string | null {
  if (!path) return null;
  if (path.endsWith("/bin/node")) return path.replace(/\/bin\/node$/, "");
  if (path.endsWith("\\node.exe")) return path.replace(/\\node\.exe$/, "");
  const slashIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slashIndex > 0 ? path.slice(0, slashIndex) : null;
}

function versionsMatch(left: string, right: string | null): boolean {
  if (!right) return false;
  return normalizeVersion(left) === normalizeVersion(right);
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, "");
}

function shellIntegrationSnippet(nvmDir: string | null): string {
  const snippetNvmDir = nvmDir ?? "$HOME/.nvm";
  return [
    `export NVM_DIR="${snippetNvmDir}"`,
    "[ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\"",
  ].join("\n");
}

function Chip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={`chip chip-${tone}`}>{label}</span>;
}

function WindowControls({ copy }: { copy: Copy }) {
  return (
    <div
      className="window-chrome"
      onMouseDown={handleWindowDragMouseDown}
      onDoubleClick={() => void runWindowControl("maximize")}
    >
      <div
        className="window-controls"
        role="group"
        aria-label={copy.windowControls.group}
        onDoubleClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {windowControlItems.map((item) => (
          <button
            aria-label={copy.windowControls[item.action]}
            className={`window-control ${item.className}`}
            key={item.action}
            onClick={() => void runWindowControl(item.action)}
            title={copy.windowControls[item.action]}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="section-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  );
}

function InstallGuideDetailRows({
  copy,
  guide,
  officialSourceValue,
}: {
  copy: Copy;
  guide: BackendInstallGuide;
  officialSourceValue: string;
}) {
  const assetUrl = guide.installScriptUrl ?? guide.installerUrl;
  const assetLabel = guide.installScriptUrl
    ? copy.home.installScriptUrlLabel
    : guide.installerUrl
      ? copy.home.installInstallerUrlLabel
      : null;

  return (
    <>
      <div>
        <dt>{copy.home.installSourceLabel}</dt>
        <dd className="mono">{officialSourceValue}</dd>
      </div>
      {assetUrl && assetLabel && (
        <div>
          <dt>{assetLabel}</dt>
          <dd className="mono">{assetUrl}</dd>
        </div>
      )}
      <div>
        <dt>{copy.home.installTargetLabel}</dt>
        <dd className="mono">{guide.targetPath ?? copy.home.unavailable}</dd>
      </div>
      <div>
        <dt>{copy.home.installCommandLabel}</dt>
        <dd>
          <pre>{guide.installCommand ?? guide.installerUrl ?? guide.officialSourceUrl}</pre>
        </dd>
      </div>
    </>
  );
}

function MissingBackendPanel({
  copy,
  guide,
  loading,
  error,
  installPending,
  writeLocked,
  onOpenSource,
  onInstall,
}: {
  copy: Copy;
  guide: BackendInstallGuide | null;
  loading: boolean;
  error: string | null;
  installPending: boolean;
  writeLocked: boolean;
  onOpenSource: (guide: BackendInstallGuide) => void;
  onInstall: (guide: BackendInstallGuide) => void;
}) {
  return (
    <article className="panel">
      <SectionHeader eyebrow={copy.home.installGuideEyebrow} title={copy.home.installGuideTitle} />
      {loading && <div className="activity-notice">{copy.home.installGuideLoading}</div>}
      {error && <div className="repair-note">{error}</div>}
      {guide && (
        <>
          <div className="chip-row">
            <Chip label={guide.displayName} tone="info" />
            <Chip
              label={guide.requiresAdmin ? copy.home.installRequiresAdmin : copy.home.installNoAdmin}
              tone={guide.requiresAdmin ? "warning" : "success"}
            />
          </div>
          <dl className="settings-list">
            <div>
              <dt>{copy.home.installBackendLabel}</dt>
              <dd>{guide.displayName}</dd>
            </div>
            <InstallGuideDetailRows
              copy={copy}
              guide={guide}
              officialSourceValue={guide.officialSourceLabel}
            />
            <div>
              <dt>{copy.home.installDetectionHintLabel}</dt>
              <dd>{guide.detectionHint}</dd>
            </div>
          </dl>
          <div className="check-list">
            <div className="check-row">
              <Chip label={copy.home.installPrivilegeLabel} tone="neutral" />
              <span>{guide.requiresAdmin ? copy.home.installRequiresAdmin : copy.home.installNoAdmin}</span>
            </div>
            {guide.postInstallSteps.map((step) => (
              <div className="check-row" key={step}>
                <Chip label={copy.home.installFollowUpLabel} tone="info" />
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="row-actions">
            <button
              className="button-tonal"
              type="button"
              data-manual-id="home:open-install-source"
              onClick={() => onOpenSource(guide)}
            >
              {copy.home.installOpenSource}
            </button>
            <button
              className="button-primary"
              type="button"
              data-manual-id="home:install-backend"
              onClick={() => onInstall(guide)}
              disabled={installPending || writeLocked}
            >
              {copy.home.installConfirmButton}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function HomeScreen({
  copy,
  snapshot,
  selectedProject,
  backendInstallGuide,
  backendInstallGuideLoading,
  backendInstallGuideError,
  backendInstallPending,
  writeLocked,
  onRefresh,
  onHomeAction,
  onOpenInstallSource,
  onRequestBackendInstall,
}: {
  copy: Copy;
  snapshot: EnvironmentSummary;
  selectedProject: ProjectRecord | null;
  backendInstallGuide: BackendInstallGuide | null;
  backendInstallGuideLoading: boolean;
  backendInstallGuideError: string | null;
  backendInstallPending: boolean;
  writeLocked: boolean;
  onRefresh: () => void;
  onHomeAction: (action: HomeActionKey) => void;
  onOpenInstallSource: (guide: BackendInstallGuide) => void;
  onRequestBackendInstall: (guide: BackendInstallGuide) => void;
}) {
  const checks = healthChecks(snapshot, selectedProject, copy);
  const actions = recommendedActions(snapshot, selectedProject, copy);
  const currentVersion = snapshot.currentNodeVersion ?? copy.home.unavailable;
  const hasMissingNvm = snapshot.backendKind === "missing";

  return (
    <section className="screen-grid">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">{copy.home.eyebrow}</span>
          <h1>Node {currentVersion}</h1>
          <p>{backendHint(snapshot, copy)}</p>
        </div>
        <div className="hero-actions">
          <button
            className="button-primary"
            type="button"
            data-manual-id="home:refresh"
            onClick={onRefresh}
          >
            {copy.common.refresh}
          </button>
          <button
            className="button-tonal"
            type="button"
            data-manual-id="home:apply-project"
            onClick={() => onHomeAction("apply_project")}
          >
            {copy.common.applyProject}
          </button>
        </div>
      </div>

      {hasMissingNvm && (
        <MissingBackendPanel
          copy={copy}
          guide={backendInstallGuide}
          loading={backendInstallGuideLoading}
          error={backendInstallGuideError}
          installPending={backendInstallPending}
          writeLocked={writeLocked}
          onOpenSource={onOpenInstallSource}
          onInstall={onRequestBackendInstall}
        />
      )}

      <div className="metric-grid">
        <article className="metric">
          <span>{copy.home.npmLabel}</span>
          <strong>{snapshot.npmVersion ?? copy.home.unavailable}</strong>
          <small>{snapshot.npmPath ?? copy.home.unavailable}</small>
        </article>
        <article className="metric">
          <span>{copy.home.backendLabel}</span>
          <strong>{backendLabel(snapshot.backendKind)}</strong>
          <small>
            {copy.home.platformLabel}: {snapshot.platform} / {snapshot.arch}
          </small>
        </article>
        <article className="metric">
          <span>{copy.home.defaultLabel}</span>
          <strong>{snapshot.defaultVersion ?? copy.home.unavailable}</strong>
          <small>{defaultHint(snapshot, copy)}</small>
        </article>
        <article className="metric">
          <span>{copy.home.nodePathLabel}</span>
          <strong>{snapshot.versionSource}</strong>
          <small>{snapshot.nodePath ?? copy.home.unavailable}</small>
        </article>
        <article className="metric">
          <span>{copy.home.pnpmLabel}</span>
          <strong>{snapshot.pnpmVersion ?? copy.home.unavailable}</strong>
          <small>{copy.home.sourceLabel}: {snapshot.versionSource}</small>
        </article>
        <article className="metric">
          <span>{copy.home.yarnLabel}</span>
          <strong>{snapshot.yarnVersion ?? copy.home.unavailable}</strong>
          <small>
            {copy.home.npmPathLabel}: {snapshot.npmPath ?? copy.home.unavailable}
          </small>
        </article>
      </div>

      <article className="panel">
        <SectionHeader eyebrow={copy.home.healthEyebrow} title={copy.home.healthTitle} />
        <div className="check-list">
          {checks.map((item) => {
            const status = taskStatusToStatusKey(item.status);
            return (
              <div className="check-row" key={item.key}>
                <Chip label={copy.status[status]} tone={statusTone(status)} />
                <div className="check-copy">
                  <span title={item.detail ?? undefined}>{item.summary}</span>
                  {item.detail && <small>{item.detail}</small>}
                </div>
              </div>
            );
          })}
          {checks.length === 0 && (
            <div className="check-row">
              <Chip label={copy.status.ok} tone="success" />
              <span>{copy.home.defaultMatches}</span>
            </div>
          )}
        </div>
      </article>

      <article className="panel">
        <SectionHeader eyebrow={copy.home.nextEyebrow} title={copy.home.nextTitle} />
        <div className="action-list">
          {actions.map(({ key, title, description }) => (
            <button className="action-button" type="button" key={title} onClick={() => onHomeAction(key)}>
              <span>{title}</span>
              <small>{description}</small>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

function VersionsScreen({
  copy,
  snapshot,
  versionError,
  versionActionPending,
  onUseVersion,
  onSetDefault,
  onRequestUninstall,
  onCopyVersion,
  onOpenInstallDirectory,
  onViewDetails,
}: {
  copy: Copy;
  snapshot: EnvironmentSummary;
  versionError: string | null;
  versionActionPending: boolean;
  onUseVersion: (version: string) => void;
  onSetDefault: (version: string) => void;
  onRequestUninstall: (version: Version) => void;
  onCopyVersion: (version: string) => void;
  onOpenInstallDirectory: (version: Version) => void;
  onViewDetails: (version: Version) => void;
}) {
  const versions = versionRows(snapshot);

  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.versions.eyebrow} title={copy.versions.title} />
      {snapshot.backendKind === "nvm-windows" && (
        <div className="activity-notice">{copy.versions.windowsSymlinkNotice}</div>
      )}
      {versionError && <div className="repair-note">{versionError}</div>}
      {versions.length > 0 ? (
        <div className="table-panel">
          {versions.map((item) => (
            <article className="version-row" key={item.version}>
              <div>
                <h3>{item.version}</h3>
                <p>{item.path ?? copy.home.unavailable}</p>
              </div>
              <div className="chip-row">
                {item.status.map((status) => (
                  <Chip key={status} label={copy.status[status]} tone={statusTone(status)} />
                ))}
              </div>
              <span className="mono">{item.npm ?? copy.home.unavailable}</span>
              <span>{item.arch ?? copy.home.unavailable}</span>
              <div className="row-actions">
                <button
                  className="icon-button"
                  type="button"
                  data-manual-id={`versions:use:${item.version}`}
                  aria-label={`${copy.common.useVersion} ${item.version}`}
                  title={copy.common.useVersion}
                  disabled={versionActionPending}
                  onClick={() => onUseVersion(item.version)}
                >
                  ⇄
                </button>
                <button
                  className="icon-button"
                  type="button"
                  data-manual-id={`versions:set-default:${item.version}`}
                  aria-label={`${copy.common.setDefault} ${item.version}`}
                  title={copy.common.setDefault}
                  disabled={versionActionPending}
                  onClick={() => onSetDefault(item.version)}
                >
                  ★
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`${copy.versions.copyVersion} ${item.version}`}
                  title={copy.versions.copyVersion}
                  onClick={() => onCopyVersion(item.version)}
                >
                  ⧉
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`${copy.versions.openInstallDir} ${item.version}`}
                  title={copy.versions.openInstallDir}
                  onClick={() => onOpenInstallDirectory(item)}
                >
                  ↗
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`${copy.versions.viewDetails} ${item.version}`}
                  title={copy.versions.viewDetails}
                  onClick={() => onViewDetails(item)}
                >
                  ⓘ
                </button>
                <button
                  className="danger-button"
                  type="button"
                  data-manual-id={`versions:uninstall:${item.version}`}
                  aria-label={`${copy.common.uninstall} ${item.version}`}
                  title={copy.common.confirmBeforeUninstall}
                  disabled={versionActionPending}
                  onClick={() => onRequestUninstall(item)}
                >
                  {copy.common.uninstall}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <article className="panel">
          <h3>{copy.versions.emptyTitle}</h3>
          <p className="activity-summary">{copy.versions.emptyDescription}</p>
        </article>
      )}
    </section>
  );
}

function ConfirmDialog({
  title,
  description,
  note,
  warnings = [],
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  note?: string;
  warnings?: string[];
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="dialog-panel"
        data-manual-id="dialog:confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        {note && <p>{note}</p>}
        {warnings.length > 0 && (
          <div className="dialog-warning-list">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button
            className="button-muted"
            type="button"
            data-manual-id="dialog:confirm:cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className="danger-button"
            type="button"
            data-manual-id="dialog:confirm:submit"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function BackendInstallDialog({
  copy,
  guide,
  pending,
  onCancel,
  onConfirm,
}: {
  copy: Copy;
  guide: BackendInstallGuide;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="dialog-panel"
        data-manual-id="dialog:backend-install"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backend-install-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="backend-install-title">
          {copy.home.installConfirmTitle} · {guide.displayName}
        </h2>
        <p>{copy.home.installConfirmDescription}</p>
        <dl className="settings-list">
          <InstallGuideDetailRows
            copy={copy}
            guide={guide}
            officialSourceValue={guide.officialSourceUrl}
          />
        </dl>
        <div className="dialog-warning-list">
          {guide.postInstallSteps.map((step) => (
            <p key={step}>{step}</p>
          ))}
        </div>
        <div className="dialog-actions">
          <button
            className="button-muted"
            type="button"
            data-manual-id="dialog:backend-install:cancel"
            onClick={onCancel}
            disabled={pending}
          >
            {copy.common.cancel}
          </button>
          <button
            className="button-primary"
            type="button"
            data-manual-id="dialog:backend-install:confirm"
            onClick={onConfirm}
            disabled={pending}
          >
            {copy.home.installConfirmButton}
          </button>
        </div>
      </section>
    </div>
  );
}

function VersionDetailsDialog({
  copy,
  details,
  onClose,
}: {
  copy: Copy;
  details: VersionDetails;
  onClose: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="version-details-title">
          {copy.versions.detailTitle} · {details.version}
        </h2>
        <dl className="settings-list">
          <div>
            <dt>{copy.versions.nodePath}</dt>
            <dd className="mono">{details.nodePath || copy.home.unavailable}</dd>
          </div>
          <div>
            <dt>{copy.versions.npmPath}</dt>
            <dd className="mono">{details.npmPath || copy.home.unavailable}</dd>
          </div>
          <div>
            <dt>{copy.versions.globalPackagesPath}</dt>
            <dd className="mono">{details.globalPackagesPath || copy.home.unavailable}</dd>
          </div>
          <div>
            <dt>{copy.versions.nodeCheck}</dt>
            <dd className="mono">{details.nodeCheck || copy.home.unavailable}</dd>
          </div>
          <div>
            <dt>{copy.versions.npmCheck}</dt>
            <dd className="mono">{details.npmCheck || copy.home.unavailable}</dd>
          </div>
        </dl>
        <div className="dialog-actions">
          <button className="button-tonal" type="button" onClick={onClose}>
            {copy.common.cancel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ProjectEditorDialog({
  copy,
  editor,
  pending,
  onChange,
  onClose,
  onConfirm,
}: {
  copy: Copy;
  editor: ProjectEditorState;
  pending: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const draftValue = editor.draftValue.trim();
  const hasChanges = draftValue !== editor.originalValue.trim();

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog-panel"
        data-manual-id="dialog:project-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="project-editor-title">
          {editor.originalValue ? copy.projects.editNvmrc : copy.projects.createNvmrc}
          {" · "}
          {editor.projectName}
        </h2>
        <p>{copy.projects.writeHint}</p>
        <div className="field-stack">
          <label htmlFor="project-target-path">{copy.projects.targetPath}</label>
          <input
            id="project-target-path"
            className="text-input mono"
            type="text"
            value={editor.targetPath}
            readOnly
          />
        </div>
        <div className="field-stack">
          <label htmlFor="project-version-input">{copy.projects.versionInput}</label>
          <textarea
            id="project-version-input"
            className="text-input mono text-area"
            value={editor.draftValue}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
          />
        </div>
        <div className="field-stack">
          <label>{copy.projects.diffPreview}</label>
          <pre>{projectDiffPreview(editor)}</pre>
        </div>
        <div className="dialog-actions">
          <button
            className="button-muted"
            type="button"
            data-manual-id="dialog:project-editor:cancel"
            onClick={onClose}
            disabled={pending}
          >
            {copy.common.cancel}
          </button>
          <button
            className="button-primary"
            type="button"
            data-manual-id="dialog:project-editor:confirm"
            onClick={onConfirm}
            disabled={pending || !draftValue || !hasChanges}
          >
            {copy.projects.writeConfirm}
          </button>
        </div>
      </section>
    </div>
  );
}

function RemoteInstallDialog({
  copy,
  snapshot,
  supportsSourceInstall,
  request,
  pending,
  onClose,
  onChange,
  onConfirm,
}: {
  copy: Copy;
  snapshot: EnvironmentSummary;
  supportsSourceInstall: boolean;
  request: RemoteInstallRequest;
  pending: boolean;
  onClose: () => void;
  onChange: (next: RemoteInstallRequest) => void;
  onConfirm: () => void;
}) {
  const canMigrateFromCurrent = Boolean(snapshot.currentNodeVersion);
  const canMigrateFromDefault = Boolean(snapshot.defaultVersion);
  const showPackageOptions = snapshot.backendKind === "nvm-sh";
  const showSourceInstall = showPackageOptions && supportsSourceInstall;
  const showArchOptions = snapshot.backendKind === "nvm-windows";

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog-panel"
        data-manual-id="dialog:remote-install"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-install-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="remote-install-title">
          {copy.remote.installDialogTitle} · {request.version}
        </h2>
        <p>{copy.remote.installDialogHint}</p>
        <div className="field-stack">
          <label htmlFor="remote-install-version">{copy.remote.installDialogVersion}</label>
          <input
            id="remote-install-version"
            className="text-input mono"
            type="text"
            value={request.version}
            readOnly
          />
        </div>
        {showPackageOptions && (
          <div className="field-stack">
            <label htmlFor="remote-install-packages">{copy.remote.installDialogPackages}</label>
            <select
              id="remote-install-packages"
              className="text-input"
              value={request.reinstallPackagesFrom}
              onChange={(event) =>
                onChange({
                  ...request,
                  reinstallPackagesFrom: event.target.value as RemoteInstallRequest["reinstallPackagesFrom"],
                })
              }
            >
              <option value="none">{copy.remote.installDialogNone}</option>
              <option value="current" disabled={!canMigrateFromCurrent}>
                {copy.remote.installDialogCurrent}
              </option>
              <option value="default" disabled={!canMigrateFromDefault}>
                {copy.remote.installDialogDefault}
              </option>
            </select>
          </div>
        )}
        {showArchOptions && (
          <div className="field-stack">
            <label htmlFor="remote-install-arch">{copy.remote.installDialogArch}</label>
            <select
              id="remote-install-arch"
              className="text-input"
              value={request.arch}
              onChange={(event) =>
                onChange({
                  ...request,
                  arch: event.target.value as RemoteInstallRequest["arch"],
                })
              }
            >
              <option value="system">{copy.remote.installDialogArchSystem}</option>
              <option value="32">{copy.remote.installDialogArch32}</option>
              <option value="64">{copy.remote.installDialogArch64}</option>
              <option value="all">{copy.remote.installDialogArchAll}</option>
            </select>
          </div>
        )}
        {showPackageOptions && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={request.latestNpm}
              onChange={(event) =>
                onChange({
                  ...request,
                  latestNpm: event.target.checked,
                })
              }
            />
            <span>{copy.remote.installDialogLatestNpm}</span>
          </label>
        )}
        {showSourceInstall && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={request.sourceInstall}
              onChange={(event) =>
                onChange({
                  ...request,
                  sourceInstall: event.target.checked,
                })
              }
            />
            <span>{copy.remote.installDialogSourceInstall}</span>
          </label>
        )}
        <div className="dialog-actions">
          <button
            className="button-muted"
            type="button"
            data-manual-id="dialog:remote-install:cancel"
            onClick={onClose}
            disabled={pending}
          >
            {copy.common.cancel}
          </button>
          <button
            className="button-primary"
            type="button"
            data-manual-id="dialog:remote-install:confirm"
            onClick={onConfirm}
            disabled={pending}
          >
            {copy.remote.installDialogConfirm}
          </button>
        </div>
      </section>
    </div>
  );
}

function RemoteScreen({
  copy,
  locale,
  snapshot,
  remoteCache,
  remoteLoading,
  remoteError,
  remoteInstallPending,
  remoteWriteLocked,
  onRefresh,
  onRequestInstall,
}: {
  copy: Copy;
  locale: Locale;
  snapshot: EnvironmentSummary;
  remoteCache: RemoteCache;
  remoteLoading: boolean;
  remoteError: string | null;
  remoteInstallPending: boolean;
  remoteWriteLocked: boolean;
  onRefresh: () => void;
  onRequestInstall: (version: string) => void;
}) {
  const [filter, setFilter] = useState<RemoteFilterKind>("all");
  const [major, setMajor] = useState<string>(ALL_FILTER);
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => remoteRows(remoteCache.versions, snapshot.installedVersions, copy),
    [copy, remoteCache.versions, snapshot.installedVersions],
  );
  const majorOptions = useMemo(() => remoteMajorOptions(rows), [rows]);
  const filteredRows = useMemo(
    () => rows.filter((row) => remoteMatchesFilter(row, filter, major, query.trim())),
    [filter, major, query, rows],
  );
  const lastUpdated = formatLastUpdated(remoteCache.updatedAt, locale, copy.home.unavailable);
  const latestRow = rows.find((row) => row.isLatest) ?? null;
  const latestLtsRow = rows.find((row) => row.isLts) ?? null;
  const latestMajorRow = major === ALL_FILTER ? null : rows.find((row) => row.major === major) ?? null;
  const installDisabled = remoteInstallPending || remoteWriteLocked;

  useEffect(() => {
    if (major === ALL_FILTER || majorOptions.includes(major)) return;
    setMajor(ALL_FILTER);
  }, [major, majorOptions]);

  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.remote.eyebrow} title={copy.remote.title} />
      <div className="toolbar">
        <button
          className="button-primary"
          type="button"
          data-manual-id="remote:install-latest"
          disabled={installDisabled || latestRow === null}
          title={latestRow ? copy.common.install : copy.remote.installDisabled}
          onClick={() => latestRow && onRequestInstall(latestRow.version)}
        >
          {copy.remote.installLatest}
        </button>
        <button
          className="button-primary"
          type="button"
          data-manual-id="remote:install-latest-lts"
          disabled={installDisabled || latestLtsRow === null}
          title={latestLtsRow ? copy.common.install : copy.remote.installDisabled}
          onClick={() => latestLtsRow && onRequestInstall(latestLtsRow.version)}
        >
          {copy.remote.installLts}
        </button>
        <button
          className="button-tonal"
          type="button"
          data-manual-id="remote:refresh"
          onClick={onRefresh}
          disabled={remoteLoading}
        >
          {copy.remote.refreshRemote}
        </button>
        <div className="toolbar-meta">
          <span>
            {copy.remote.lastUpdated}: {lastUpdated}
          </span>
          {remoteCache.updatedAt && <Chip label={copy.remote.cached} tone="neutral" />}
        </div>
        <input
          className="search-box"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.remote.search}
          aria-label={copy.remote.search}
        />
      </div>
      <div className="toolbar toolbar-secondary">
        <div className="segmented" aria-label={copy.remote.title}>
          <SegmentedButton selected={filter === "all"} onClick={() => setFilter("all")}>
            {copy.remote.filterAll}
          </SegmentedButton>
          <SegmentedButton selected={filter === "lts"} onClick={() => setFilter("lts")}>
            {copy.remote.filterLts}
          </SegmentedButton>
          <SegmentedButton selected={filter === "latest"} onClick={() => setFilter("latest")}>
            {copy.remote.filterLatest}
          </SegmentedButton>
          <SegmentedButton selected={filter === "installed"} onClick={() => setFilter("installed")}>
            {copy.remote.filterInstalled}
          </SegmentedButton>
          <SegmentedButton selected={filter === "uninstalled"} onClick={() => setFilter("uninstalled")}>
            {copy.remote.filterUninstalled}
          </SegmentedButton>
        </div>
        <div className="row-actions">
          <select
            className="toolbar-select"
            value={major}
            onChange={(event) => setMajor(event.target.value)}
            aria-label={copy.remote.majorAll}
          >
            <option value={ALL_FILTER}>{copy.remote.majorAll}</option>
            {majorOptions.map((item) => (
              <option key={item} value={item}>
                v{item}
              </option>
            ))}
          </select>
          <button
            className="button-tonal"
            type="button"
            data-manual-id={`remote:install-major:${latestMajorRow?.major ?? "x"}`}
            disabled={installDisabled || latestMajorRow === null}
            title={latestMajorRow ? copy.common.install : copy.remote.installDisabled}
            onClick={() => latestMajorRow && onRequestInstall(latestMajorRow.version)}
          >
            {fillMajorTemplate(copy.remote.installMajor, latestMajorRow?.major ?? "x")}
          </button>
        </div>
      </div>
      {remoteLoading && <div className="activity-notice">{copy.remote.loading}</div>}
      {remoteError && <div className="repair-note">{remoteError}</div>}
      <div className="remote-grid">
        {filteredRows.map((item) => (
          <article className="remote-card" key={item.version}>
            <div>
              <h3>{item.version}</h3>
              <p>{item.line}</p>
            </div>
            <div className="chip-row">
              {item.statuses.map((status) => (
                <Chip key={`${item.version}-${status}`} label={copy.status[status]} tone={statusTone(status)} />
              ))}
            </div>
            <button
              className={item.installed ? "button-muted" : "button-primary"}
              type="button"
              data-manual-id={`remote:install:${item.version}`}
              disabled={installDisabled || item.installed}
              title={item.installed ? copy.common.installed : copy.common.install}
              aria-label={`${copy.common.install} ${item.version}`}
              onClick={() => onRequestInstall(item.version)}
            >
              {item.installed ? copy.common.installed : copy.common.install}
            </button>
          </article>
        ))}
        {filteredRows.length === 0 && (
          <article className="remote-card remote-empty">
            <div>
              <h3>{copy.remote.empty}</h3>
              <p>{copy.remote.search}</p>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function ProjectsScreen({
  copy,
  projects,
  selectedProject,
  projectError,
  projectInstallPending,
  onChooseDirectory,
  onEditProject,
  onInstallProjectVersion,
  onApplyProjectVersion,
  onCopySuggestedCommand,
  onReadProject,
  onOpenProjectDirectory,
}: {
  copy: Copy;
  projects: ProjectRecord[];
  selectedProject: ProjectRecord | null;
  projectError: string | null;
  projectInstallPending: boolean;
  onChooseDirectory: () => void;
  onEditProject: () => void;
  onInstallProjectVersion: () => void;
  onApplyProjectVersion: () => void;
  onCopySuggestedCommand: () => void;
  onReadProject: (projectDir: string) => void;
  onOpenProjectDirectory: (projectDir: string) => void;
}) {
  const canInstallProjectVersion =
    selectedProject !== null &&
    selectedProject.isValid &&
    !selectedProject.isInstalled &&
    Boolean(selectedProject.version);
  const canApplyProjectVersion =
    selectedProject !== null &&
    selectedProject.isValid &&
    selectedProject.isInstalled &&
    Boolean(selectedProject.version);
  const suggestedCommand = selectedProject ? projectSuggestedCommand(selectedProject) : null;

  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.projects.eyebrow} title={copy.projects.title} />
      <div className="toolbar">
        <button
          className="button-primary"
          type="button"
          data-manual-id="projects:choose-directory"
          onClick={onChooseDirectory}
        >
          {copy.projects.chooseDirectory}
        </button>
        <button
          className="button-tonal"
          type="button"
          data-manual-id="projects:edit-nvmrc"
          onClick={onEditProject}
          disabled={!selectedProject}
        >
          {selectedProject?.nvmrcPath && !selectedProject.inherited
            ? copy.projects.editNvmrc
            : copy.projects.createNvmrc}
        </button>
        {selectedProject && (
          <button
            className="button-muted"
            type="button"
            onClick={() => onOpenProjectDirectory(selectedProject.projectDir)}
          >
            {copy.projects.openDirectory}
          </button>
        )}
      </div>

      {projectError && <div className="repair-note">{projectError}</div>}

      {selectedProject ? (
        <article className="project-detail panel">
          <div>
            <span className="eyebrow">{copy.projects.nvmrcPath}</span>
            <h3>{selectedProject.name}</h3>
            <p>{selectedProject.projectDir}</p>
          </div>
          <div className="chip-row">
            <Chip
              label={projectStatusLabel(selectedProject, copy)}
              tone={statusTone(projectStatus(selectedProject))}
            />
            {selectedProject.nvmrcPath && (
              <Chip
                label={selectedProject.inherited ? copy.projects.inherited : copy.projects.local}
                tone="info"
              />
            )}
          </div>
          <div className="row-actions">
            <button
              className="button-tonal"
              type="button"
              data-manual-id="projects:install-version"
              onClick={onInstallProjectVersion}
              disabled={projectInstallPending || !canInstallProjectVersion}
              title={
                canInstallProjectVersion && !projectInstallPending
                  ? copy.projects.installVersion
                  : copy.projects.installUnavailable
              }
            >
              {copy.projects.installVersion}
            </button>
            <button
              className="button-primary"
              type="button"
              data-manual-id="projects:apply-version"
              onClick={onApplyProjectVersion}
              disabled={!canApplyProjectVersion}
              title={canApplyProjectVersion ? copy.projects.applyVersion : copy.projects.applyUnavailable}
            >
              {copy.projects.applyVersion}
            </button>
            <button
              className="button-tonal"
              type="button"
              onClick={onCopySuggestedCommand}
              disabled={!suggestedCommand}
            >
              {copy.projects.copyCommand}
            </button>
          </div>
          <dl className="settings-list">
            <div>
              <dt>{copy.projects.nvmrcPath}</dt>
              <dd>{selectedProject.nvmrcPath ?? copy.projects.noNvmrc}</dd>
            </div>
            <div>
              <dt>{copy.projects.targetPath}</dt>
              <dd>{targetProjectNvmrcPath(selectedProject)}</dd>
            </div>
            <div>
              <dt>{copy.projects.nvmrcContent}</dt>
              <dd className="mono">{selectedProject.version ?? selectedProject.message ?? copy.projects.noNvmrc}</dd>
            </div>
          </dl>
        </article>
      ) : (
        <article className="panel">
          <h3>{copy.projects.emptyTitle}</h3>
          <p className="activity-summary">{copy.projects.emptyDescription}</p>
        </article>
      )}

      <SectionHeader eyebrow={copy.projects.eyebrow} title={copy.projects.recentTitle} />
      <div className="project-list">
        {projects.map((project) => (
          <article className="project-row" key={project.projectDir}>
            <div>
              <h3>{project.name}</h3>
              <p>{project.projectDir}</p>
            </div>
            <span className="mono">{project.version ?? "-"}</span>
            <Chip label={projectStatusLabel(project, copy)} tone={statusTone(projectStatus(project))} />
            <div className="row-actions">
              <button className="button-tonal" type="button" onClick={() => onReadProject(project.projectDir)}>
                {copy.projects.apply}
              </button>
              <button
                className="icon-button"
                type="button"
                title={copy.projects.openDirectory}
                aria-label={`${copy.projects.openDirectory} ${project.name}`}
                onClick={() => onOpenProjectDirectory(project.projectDir)}
              >
                ↗
              </button>
            </div>
          </article>
        ))}
        {projects.length === 0 && (
          <article className="project-row">
            <div>
              <h3>{copy.projects.emptyTitle}</h3>
              <p>{copy.projects.emptyDescription}</p>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function logBlock(label: string, value: string) {
  return (
    <div className="log-block">
      <span>{label}</span>
      <pre>{redactLog(value || "(empty)")}</pre>
    </div>
  );
}

function formatTaskLogs(copy: Copy, task: ActivityTask): string {
  return [
    `${copy.activity.actionNames[task.type]} · ${task.command}`,
    `${copy.activity.stdout}\n${redactLog(task.stdout || "(empty)")}`,
    `${copy.activity.stderr}\n${redactLog(task.stderr || "(empty)")}`,
  ].join("\n\n");
}

function copyTaskLogs(copy: Copy, task: ActivityTask) {
  if (!navigator.clipboard) return;
  void navigator.clipboard.writeText(formatTaskLogs(copy, task));
}

function copyText(value: string) {
  if (!navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}

function ActivityScreen({
  copy,
  tasks,
  onCancelTask,
}: {
  copy: Copy;
  tasks: ActivityTask[];
  onCancelTask: (taskId: string) => void;
}) {
  const [collapsedTasks, setCollapsedTasks] = useState<string[]>([]);
  const writeLockActive = !canStartTask(tasks, "write");

  function isCollapsed(taskId: string) {
    return collapsedTasks.includes(taskId);
  }

  function toggleLogs(taskId: string) {
    setCollapsedTasks((current) =>
      current.includes(taskId)
        ? current.filter((value) => value !== taskId)
        : [...current, taskId],
    );
  }

  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.activity.eyebrow} title={copy.activity.title} />
      {writeLockActive && <div className="activity-notice">{copy.activity.writeLockActive}</div>}
      <div className="activity-list">
        {tasks.map((item) => (
          <article className="activity-card" key={item.id}>
            <div className="activity-header">
              <div>
                <h3>{copy.activity.actionNames[item.type]}</h3>
                <p>
                  {item.command} · {copy.activity.duration}: {durationLabel(item)} ·{" "}
                  {copy.activity.access}: {item.access === "read" ? copy.activity.read : copy.activity.write}
                </p>
              </div>
              <div className="chip-row">
                <Chip
                  label={copy.status[taskStatusKey(item.status)]}
                  tone={statusTone(taskStatusKey(item.status))}
                />
                {item.exitCode !== null && (
                  <Chip label={`${copy.activity.exitCode} ${item.exitCode}`} tone="neutral" />
                )}
              </div>
            </div>
            <p className="activity-summary">{item.summary}</p>
            <div className="row-actions">
              <button className="button-muted" type="button" onClick={() => copyTaskLogs(copy, item)}>
                {copy.activity.copyLogs}
              </button>
              {item.cancelable && item.status === "running" && (
                <button
                  className="button-muted"
                  type="button"
                  onClick={() => onCancelTask(item.id)}
                  disabled={item.cancelRequested}
                >
                  {copy.activity.cancelTask}
                </button>
              )}
              <button className="button-tonal" type="button" onClick={() => toggleLogs(item.id)}>
                {isCollapsed(item.id) ? copy.activity.expandLogs : copy.activity.collapseLogs}
              </button>
            </div>
            {item.cancelRequested && item.status === "running" && (
              <div className="activity-notice">{copy.activity.cancelRequested}</div>
            )}
            {!isCollapsed(item.id) && (
              <div className="log-grid">
                {logBlock(copy.activity.stdout, item.stdout)}
                {logBlock(copy.activity.stderr, item.stderr)}
              </div>
            )}
            {item.status === "failed" && (
              <div className="repair-note">
                <strong>{copy.activity.repair}: </strong>
                {item.recommendation ?? item.summary}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function SegmentedButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button className={selected ? "selected" : undefined} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function SettingsScreen({
  copy,
  snapshot,
  backendDetection,
  locale,
  setLocale,
  theme,
  setTheme,
}: {
  copy: Copy;
  snapshot: EnvironmentSummary;
  backendDetection: BackendDetection | null;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const backendType = backendLabel(backendDetection?.kind ?? snapshot.backendKind);
  const backendVersion = backendDetection?.version ?? copy.home.unavailable;
  const backendPath =
    backendDetection?.executablePath ??
    backendDetection?.nvmDir ??
    snapshot.nodePath ??
    copy.home.unavailable;
  const versionStore =
    backendDetection?.kind === "nvm-sh"
      ? backendDetection.nvmDir
        ? `${backendDetection.nvmDir}/versions/node`
        : copy.home.unavailable
      : backendDetection?.kind === "nvm-windows"
        ? backendDetection.root ?? copy.home.unavailable
        : copy.home.unavailable;
  const windowsRoot =
    backendDetection?.kind === "nvm-windows"
      ? [backendDetection.root, backendDetection.symlinkPath].filter(Boolean).join(" -> ") || copy.home.unavailable
      : copy.home.unavailable;
  const shellSnippet = shellIntegrationSnippet(backendDetection?.nvmDir ?? null);
  const profileFiles = [".zshrc", ".bashrc", ".bash_profile", ".profile"] as const;
  const diagnostics = settingsDiagnostics(snapshot);
  const defaultPackagesContent = snapshot.defaultPackagesExists
    ? snapshot.defaultPackagesEntries.length > 0
      ? snapshot.defaultPackagesEntries.join("\n")
      : copy.settings.defaultPackagesEmpty
    : copy.settings.defaultPackagesMissing;

  return (
    <section className="screen-grid">
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.backendEyebrow} title={copy.settings.backendTitle} />
        <dl className="settings-list">
          <div>
            <dt>{copy.settings.backendType}</dt>
            <dd>{backendType}</dd>
          </div>
          <div>
            <dt>{copy.settings.backendVersion}</dt>
            <dd>{backendVersion}</dd>
          </div>
          <div>
            <dt>{copy.settings.backendPath}</dt>
            <dd>{backendPath}</dd>
          </div>
          <div>
            <dt>{copy.settings.versionStore}</dt>
            <dd>{versionStore}</dd>
          </div>
          <div>
            <dt>{copy.settings.windowsRoot}</dt>
            <dd>{windowsRoot}</dd>
          </div>
          <div>
            <dt>{copy.settings.activationBehavior}</dt>
            <dd>{copy.settings.activationCopy}</dd>
          </div>
        </dl>
      </article>
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.shellEyebrow} title={copy.settings.shellTitle} />
        <div className="check-list">
          {profileFiles.map((file) => {
            const key = `profile_${file}`;
            const item = backendDetection?.health.items.find((entry) => entry.key === key);
            const status: StatusKey = item ? taskStatusToStatusKey(item.status) : "missing";
            const summary = item?.summary ?? copy.settings.profileUnavailable;
            return (
              <div className="check-row" key={file}>
                <Chip label={`${file} · ${copy.status[status]}`} tone={statusTone(status)} />
                <span>{summary}</span>
              </div>
            );
          })}
        </div>
        <div className="settings-subsection">
          <h3>{copy.settings.shellIntegration}</h3>
          <pre>{shellSnippet}</pre>
          <div className="row-actions">
            <button className="button-tonal" type="button" onClick={() => copyText(shellSnippet)}>
              {copy.settings.copyShellSnippet}
            </button>
          </div>
          <p className="activity-summary">{copy.settings.shellReadonlyHint}</p>
        </div>
      </article>
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.networkEyebrow} title={copy.settings.networkTitle} />
        <div className="chip-row">
          <Chip label={copy.settings.readOnly} tone="neutral" />
        </div>
        <dl className="settings-list">
          <div>
            <dt>{copy.settings.nodeMirror}</dt>
            <dd>https://nodejs.org/dist</dd>
          </div>
          <div>
            <dt>{copy.settings.npmMirror}</dt>
            <dd>{copy.settings.notConfigured}</dd>
          </div>
          <div>
            <dt>{copy.settings.proxy}</dt>
            <dd>{copy.settings.notConfigured}</dd>
          </div>
        </dl>
      </article>
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.diagnosticsEyebrow} title={copy.settings.diagnosticsTitle} />
        {diagnostics.length > 0 ? (
          <div className="check-list">
            {diagnostics.map((item) => {
              const status = taskStatusToStatusKey(item.status);
              return (
                <div className="check-row" key={item.key}>
                  <Chip label={copy.status[status]} tone={statusTone(status)} />
                  <div className="check-copy">
                    <span>{item.summary}</span>
                    {item.detail && <small className="mono">{item.detail}</small>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="activity-summary">{copy.settings.diagnosticsEmpty}</p>
        )}
      </article>
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.defaultPackagesEyebrow} title={copy.settings.defaultPackagesTitle} />
        <div className="chip-row">
          <Chip label={copy.settings.readOnly} tone="neutral" />
          <Chip
            label={snapshot.defaultPackagesExists ? copy.status.ok : copy.status.missing}
            tone={statusTone(snapshot.defaultPackagesExists ? "ok" : "missing")}
          />
        </div>
        <dl className="settings-list">
          <div>
            <dt>{copy.settings.defaultPackagesPath}</dt>
            <dd>{snapshot.defaultPackagesPath ?? copy.home.unavailable}</dd>
          </div>
          <div>
            <dt>{copy.settings.defaultPackagesContent}</dt>
            <dd>
              <pre>{defaultPackagesContent}</pre>
            </dd>
          </div>
        </dl>
      </article>
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.appearanceEyebrow} title={copy.settings.appearanceTitle} />
        <div className="segmented" aria-label={copy.settings.appearanceTitle}>
          <SegmentedButton selected={theme === "system"} onClick={() => setTheme("system")}>
            {copy.settings.system}
          </SegmentedButton>
          <SegmentedButton selected={theme === "light"} onClick={() => setTheme("light")}>
            {copy.settings.light}
          </SegmentedButton>
          <SegmentedButton selected={theme === "dark"} onClick={() => setTheme("dark")}>
            {copy.settings.dark}
          </SegmentedButton>
        </div>
        <div className="settings-subsection">
          <h3>{copy.settings.languageTitle}</h3>
          <div className="segmented" aria-label={copy.settings.languageTitle}>
            <SegmentedButton selected={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>
              中文
            </SegmentedButton>
            <SegmentedButton selected={locale === "en-US"} onClick={() => setLocale("en-US")}>
              English
            </SegmentedButton>
          </div>
        </div>
      </article>
    </section>
  );
}

function App() {
  const rootRef = useRef<HTMLElement | null>(null);
  const [activeScreen, setActiveScreen] = useState<Screen>("home");
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [systemTheme, setSystemTheme] = useState<Exclude<Theme, "system">>(getSystemTheme);
  const [backendSnapshot, setBackendSnapshot] =
    useState<EnvironmentSummary>(INITIAL_BACKEND_SNAPSHOT);
  const [backendDetection, setBackendDetection] = useState<BackendDetection | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectRecord[]>(recentProjectsFromStorage);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(
    () => recentProjectsFromStorage()[0] ?? null,
  );
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState<ProjectEditorState | null>(null);
  const [projectInstallPending, setProjectInstallPending] = useState(false);
  const [projectWritePending, setProjectWritePending] = useState(false);
  const [versionActionPending, setVersionActionPending] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [remoteCache, setRemoteCache] = useState<RemoteCache>(remoteCacheFromStorage);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [backendInstallGuide, setBackendInstallGuide] = useState<BackendInstallGuide | null>(null);
  const [backendInstallGuideLoading, setBackendInstallGuideLoading] = useState(false);
  const [backendInstallGuideError, setBackendInstallGuideError] = useState<string | null>(null);
  const [backendInstallPending, setBackendInstallPending] = useState(false);
  const [backendInstallDialog, setBackendInstallDialog] = useState<BackendInstallDialogState | null>(null);
  const [remoteInstallPending, setRemoteInstallPending] = useState(false);
  const [remoteInstallRequest, setRemoteInstallRequest] = useState<RemoteInstallRequest | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<UninstallTarget | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<VersionDetails | null>(null);
  const [activityTasks, setActivityTasks] = useState<ActivityTask[]>([]);
  const [manualBridgeState, setManualBridgeState] = useState({
    lastCommandId: null as string | null,
    lastCommandStatus: null as string | null,
    lastError: null as string | null,
  });
  const activeScreenRef = useRef<Screen>("home");
  const manualProjectInitRef = useRef<string | null>(null);
  const backendRefreshSequenceRef = useRef(0);
  const backendSnapshotEpochRef = useRef(0);
  const activityTaskSequenceRef = useRef(0);
  const activityTasksRef = useRef<ActivityTask[]>([]);
  const manualUiConfig = useMemo(() => getManualUiSnapshotConfig(), []);
  const copy = translations[locale];
  const activeTheme = theme === "system" ? systemTheme : theme;
  const writeLocked = !canStartTask(activityTasks, "write");

  const activeTitle = useMemo(() => copy.navigation[activeScreen], [activeScreen, copy]);
  const manualUiAppState: ManualUiSnapshotAppState = useMemo(
    () => ({
      screen: activeScreen,
      title: activeTitle,
      locale,
      theme: activeTheme,
      backendKind: backendSnapshot.backendKind,
      currentNodeVersion: backendSnapshot.currentNodeVersion,
      defaultVersion: backendSnapshot.defaultVersion,
      versionSource: backendSnapshot.versionSource,
      selectedProjectDir: selectedProject?.projectDir ?? null,
      selectedProjectVersion: selectedProject?.version ?? null,
      activityTaskCount: activityTasks.length,
      runningTaskCount: activityTasks.filter(
        (task) => task.status === "running" || task.status === "pending",
      ).length,
      writeLocked,
      manualBridgeLastCommandId: manualBridgeState.lastCommandId,
      manualBridgeLastCommandStatus: manualBridgeState.lastCommandStatus,
      manualBridgeLastError: manualBridgeState.lastError,
      flags: {
        backendInstallPending,
        versionActionPending,
        remoteLoading,
        remoteInstallPending,
        projectInstallPending,
        projectWritePending,
      },
    }),
    [
      activeScreen,
      activeTitle,
      locale,
      activeTheme,
      backendSnapshot.backendKind,
      backendSnapshot.currentNodeVersion,
      backendSnapshot.defaultVersion,
      backendSnapshot.versionSource,
      selectedProject,
      activityTasks,
      writeLocked,
      manualBridgeState.lastCommandId,
      manualBridgeState.lastCommandStatus,
      manualBridgeState.lastError,
      backendInstallPending,
      versionActionPending,
      remoteLoading,
      remoteInstallPending,
      projectInstallPending,
      projectWritePending,
    ],
  );

  activeScreenRef.current = activeScreen;
  useManualUiSnapshot(rootRef, manualUiAppState);
  useManualUiCommandBridge({
    execute: executeManualUiCommand,
    readState: readManualUiCommandState,
    onStateChange: setManualBridgeState,
  });

  function navigateToScreen(screen: Screen) {
    activeScreenRef.current = screen;
    setActiveScreen(screen);
  }

  function nextActivityTaskId() {
    activityTaskSequenceRef.current += 1;
    return `activity-${Date.now()}-${activityTaskSequenceRef.current}`;
  }

  function replaceActivityTasks(nextTasks: ActivityTask[]) {
    activityTasksRef.current = nextTasks;
    setActivityTasks(nextTasks);
  }

  function prependActivityTask(task: ActivityTask) {
    replaceActivityTasks([task, ...activityTasksRef.current].slice(0, MAX_ACTIVITY_TASKS));
  }

  function updateActivityTask(taskId: string, update: (task: ActivityTask) => ActivityTask) {
    replaceActivityTasks(
      activityTasksRef.current.map((task) => (task.id === taskId ? update(task) : task)),
    );
  }

  function createActivityTask(params: {
    type: ActivityTaskType;
    access: ActivityAccess;
    command: string;
    summary: string;
  }) {
    const task: ActivityTask = {
      id: nextActivityTaskId(),
      type: params.type,
      title: copy.activity.actionNames[params.type],
      status: "running",
      access: params.access,
      backendTaskId: null,
      cancelable: false,
      cancelRequested: false,
      startedAt: new Date().toISOString(),
      endedAt: null,
      command: params.command,
      stdout: "",
      stderr: "",
      exitCode: null,
      summary: params.summary,
      recommendation: null,
    };
    prependActivityTask(task);
    return task.id;
  }

  function finishActivityTask(
    taskId: string,
    result: {
      status: "success" | "failed" | "cancelled";
      stdout: string;
      stderr: string;
      exitCode: number | null;
      summary: string;
      recommendation?: string | null;
    },
  ) {
    updateActivityTask(taskId, (task) => ({
      ...task,
      status: result.status,
      endedAt: new Date().toISOString(),
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      summary: result.summary,
      recommendation: result.recommendation ?? null,
    }));
  }

  function updateInstallTaskSnapshot(taskId: string, snapshot: InstallTaskSnapshot, summary: string) {
    updateActivityTask(taskId, (task) => ({
      ...task,
      backendTaskId: snapshot.taskId,
      cancelable: task.cancelable && snapshot.status === "running",
      cancelRequested: snapshot.cancelRequested,
      status: snapshot.status,
      stdout: snapshot.stdout,
      stderr: snapshot.stderr,
      exitCode: snapshot.exitCode,
      summary,
      endedAt:
        snapshot.status === "running" || snapshot.status === "pending" ? null : new Date().toISOString(),
    }));
  }

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function errorStderr(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function backendInstallRedetectFailure(
    guide: BackendInstallGuide,
    snapshot: EnvironmentSummary,
    detection: BackendDetection | null,
  ) {
    const windowsPathIssue =
      guide.backendKind === "nvm-windows" &&
      snapshot.backendKind !== "nvm-windows" &&
      detection?.kind !== "nvm-windows";
    const summary = windowsPathIssue
      ? copy.home.installTaskWindowsPathFailed
      : copy.home.installTaskRedetectFailed;
    const recommendation = guide.detectionHint;

    return {
      summary,
      recommendation,
      userMessage: `${summary} ${recommendation}`.trim(),
    };
  }

  function classifyUninstallFailure(context: {
    version: string;
    message: string;
    stderr: string;
  }) {
    const combined = `${context.message}\n${context.stderr}`.toLowerCase();
    const reason = (context.stderr || context.message).replace(/\s+/g, " ").trim();

    if (
      combined.includes("currently use") ||
      combined.includes("currently using") ||
      combined.includes("in use") ||
      combined.includes("active version") ||
      combined.includes("current version")
    ) {
      const summary = fillVersionTemplate(copy.versions.uninstallInUse, context.version);
      const recommendation = fillVersionTemplate(copy.versions.uninstallFixInUse, context.version);
      return { summary, recommendation, userMessage: `${summary} ${recommendation}` };
    }

    if (
      combined.includes("permission denied") ||
      combined.includes("access is denied") ||
      combined.includes("operation not permitted") ||
      combined.includes("eperm")
    ) {
      const summary = fillVersionTemplate(copy.versions.uninstallPermissionDenied, context.version);
      const recommendation = fillVersionTemplate(copy.versions.uninstallFixPermissionDenied, context.version);
      return { summary, recommendation, userMessage: `${summary} ${recommendation}` };
    }

    if (
      combined.includes("not installed") ||
      combined.includes("not found") ||
      combined.includes("could not find") ||
      combined.includes("no such file")
    ) {
      const summary = fillVersionTemplate(copy.versions.uninstallMissingVersion, context.version);
      const recommendation = fillVersionTemplate(copy.versions.uninstallFixMissingVersion, context.version);
      return { summary, recommendation, userMessage: `${summary} ${recommendation}` };
    }

    if (
      combined.includes("resource busy") ||
      combined.includes("text file busy") ||
      combined.includes("device or resource busy") ||
      combined.includes("ebusy") ||
      combined.includes("busy")
    ) {
      const summary = fillVersionTemplate(copy.versions.uninstallBusy, context.version);
      const recommendation = fillVersionTemplate(copy.versions.uninstallFixBusy, context.version);
      return { summary, recommendation, userMessage: `${summary} ${recommendation}` };
    }

    const summary = fillTemplate(copy.versions.uninstallUnknownReason, {
      version: context.version,
      reason: reason || context.message,
    });
    const recommendation = fillVersionTemplate(copy.versions.uninstallFixGeneric, context.version);
    return { summary, recommendation, userMessage: `${summary} ${recommendation}` };
  }

  function installTaskSummary(
    snapshot: Pick<InstallTaskSnapshot, "status" | "cancelRequested">,
    version: string,
  ): string {
    if (snapshot.cancelRequested && snapshot.status === "running") {
      return `Cancellation requested for ${version}.`;
    }
    switch (snapshot.status) {
      case "success":
        return `Installed ${version}.`;
      case "failed":
        return `Failed to install ${version}.`;
      case "cancelled":
        return `Cancelled install for ${version}.`;
      case "pending":
      case "running":
        return `Installing ${version} from the remote release list.`;
    }
  }

  function markBackendSnapshotMutation() {
    backendSnapshotEpochRef.current += 1;
  }

  function commitBackendSnapshot(snapshot: EnvironmentSummary, detection: BackendDetection | null) {
    markBackendSnapshotMutation();
    setBackendSnapshot(snapshot);
    setBackendDetection(detection);
  }

  function replaceBackendSnapshot(snapshot: EnvironmentSummary) {
    markBackendSnapshotMutation();
    setBackendSnapshot(snapshot);
  }

  function refreshBackendSnapshot() {
    const requestId = backendRefreshSequenceRef.current + 1;
    backendRefreshSequenceRef.current = requestId;
    const refreshEpoch = backendSnapshotEpochRef.current;
    const taskId = createActivityTask({
      type: "detect",
      access: "read",
      command: "detect backend and current node",
      summary: "Refreshing backend snapshot.",
    });
    const healthTaskId = createActivityTask({
      type: "health_check",
      access: "read",
      command: "run environment health checks",
      summary: "Running environment health checks.",
    });

    void Promise.all([getBackendSnapshot(), detectBackend()])
      .then(([snapshot, detection]) => {
        if (requestId !== backendRefreshSequenceRef.current || refreshEpoch !== backendSnapshotEpochRef.current) {
          finishActivityTask(taskId, {
            status: "cancelled",
            stdout: "",
            stderr: "",
            exitCode: null,
            summary: "Skipped a stale backend refresh result.",
          });
          finishActivityTask(healthTaskId, {
            status: "cancelled",
            stdout: "",
            stderr: "",
            exitCode: null,
            summary: "Skipped a stale health check result.",
          });
          return;
        }

        setBackendSnapshot(snapshot);
        setBackendDetection(detection);
        finishActivityTask(taskId, {
          status: "success",
          stdout: [
            `backend=${snapshot.backendKind}`,
            `current=${snapshot.currentNodeVersion ?? "unknown"}`,
            `default=${snapshot.defaultVersion ?? "unknown"}`,
          ].join("\n"),
          stderr: "",
          exitCode: 0,
          summary: "Backend and current Node detected.",
        });
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, "Failed to refresh backend snapshot.");
        finishActivityTask(taskId, {
          status: "failed",
          stdout: "",
          stderr: errorStderr(error),
          exitCode: null,
          summary: message,
          recommendation: message,
        });
      });

    void healthCheck()
      .then((result) => {
        if (requestId !== backendRefreshSequenceRef.current || refreshEpoch !== backendSnapshotEpochRef.current) {
          finishActivityTask(healthTaskId, {
            status: "cancelled",
            stdout: "",
            stderr: "",
            exitCode: null,
            summary: "Skipped a stale health check result.",
          });
          return;
        }

        finishActivityTask(healthTaskId, {
          status: "success",
          stdout: formatHealthCheckStdout(result),
          stderr: "",
          exitCode: 0,
          summary: `Completed ${result.items.length} health check${result.items.length === 1 ? "" : "s"}.`,
        });
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, "Failed to run health checks.");
        finishActivityTask(healthTaskId, {
          status: "failed",
          stdout: "",
          stderr: errorStderr(error),
          exitCode: null,
          summary: message,
          recommendation: message,
        });
      });
  }

  function refreshRemoteVersions() {
    setRemoteLoading(true);
    setRemoteError(null);
    const taskId = createActivityTask({
      type: "remote_refresh",
      access: "read",
      command: "list remote versions",
      summary: "Refreshing remote release list.",
    });
    void listRemote()
      .then((result) => {
        if (result.status === "failed" || !result.data) {
          const message = result.message ?? copy.remote.loadFailed;
          setRemoteError(message);
          finishActivityTask(taskId, {
            status: "failed",
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            summary: message,
            recommendation: message,
          });
          return;
        }

        const nextCache = {
          versions: result.data,
          updatedAt: new Date().toISOString(),
        };
        setRemoteCache(nextCache);
        saveRemoteCache(nextCache);
        finishActivityTask(taskId, {
          status: "success",
          stdout: result.stdout || `versions=${result.data.length}`,
          stderr: result.stderr,
          exitCode: result.exitCode,
          summary: `Loaded ${result.data.length} remote release${result.data.length === 1 ? "" : "s"}.`,
        });
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, copy.remote.loadFailed);
        setRemoteError(message);
        finishActivityTask(taskId, {
          status: "failed",
          stdout: "",
          stderr: errorStderr(error),
          exitCode: null,
          summary: message,
          recommendation: message,
        });
      })
      .finally(() => setRemoteLoading(false));
  }

  function loadBackendInstallGuide(openDialog = false) {
    setBackendInstallGuideLoading(true);
    setBackendInstallGuideError(null);
    void getBackendInstallGuide()
      .then((guide) => {
        setBackendInstallGuide(guide);
        if (openDialog) {
          setBackendInstallDialog({ guide });
        }
      })
      .catch((error: unknown) => {
        setBackendInstallGuideError(errorMessage(error, copy.home.installGuideError));
      })
      .finally(() => setBackendInstallGuideLoading(false));
  }

  function storeProject(project: ProjectRecord) {
    setSelectedProject(project);
    setRecentProjects((current) => {
      const next = [project, ...current.filter((item) => item.projectDir !== project.projectDir)].slice(0, 8);
      saveRecentProjects(next);
      return next;
    });
  }

  async function readProject(projectDir: string): Promise<ProjectRecord | null> {
    setProjectError(null);
    const taskId = createActivityTask({
      type: "project_nvmrc_read",
      access: "read",
      command: `read ${projectDir}/.nvmrc`,
      summary: "Reading project .nvmrc.",
    });
    try {
      const result: CommandResult<ProjectVersionInfo> = await readProjectVersion(projectDir);
      if (result.status === "failed" || !result.data) {
        const message = result.message ?? copy.projects.readFailed;
        setProjectError(message);
        finishActivityTask(taskId, {
          status: result.status === "cancelled" ? "cancelled" : "failed",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          summary: message,
          recommendation: result.status === "failed" ? message : null,
        });
        return null;
      }

      const project = projectRecordFromResult(result.data);
      storeProject(project);
      finishActivityTask(taskId, {
        status: "success",
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        summary: `.nvmrc resolved for ${projectDir}.`,
      });
      return project;
    } catch (error: unknown) {
      const message = errorMessage(error, copy.projects.readFailed);
      setProjectError(message);
      finishActivityTask(taskId, {
        status: "failed",
        stdout: "",
        stderr: errorStderr(error),
        exitCode: null,
        summary: message,
        recommendation: message,
      });
      return null;
    }
  }

  function chooseProjectDirectory() {
    void open({ directory: true, multiple: false })
      .then((selected) => {
        if (typeof selected === "string") {
          void readProject(selected);
        }
      })
      .catch((error: unknown) => {
        setProjectError(error instanceof Error ? error.message : copy.projects.readFailed);
      });
  }

  function openProjectDirectory(projectDir: string) {
    void openPath(projectDir).catch((error: unknown) => {
      setProjectError(error instanceof Error ? error.message : copy.projects.readFailed);
    });
  }

  function openProjectEditor() {
    if (!selectedProject) {
      setProjectError(copy.projects.selectProjectFirst);
      return;
    }

    setProjectError(null);
    setProjectEditor(projectEditorFromRecord(selectedProject));
  }

  function openInstallGuideSource(guide: BackendInstallGuide) {
    void openUrl(guide.officialSourceUrl).catch((error: unknown) => {
      setBackendInstallGuideError(errorMessage(error, copy.home.installGuideError));
    });
  }

  function requestBackendInstall(guide: BackendInstallGuide) {
    setBackendInstallGuideError(null);
    setBackendInstallDialog({ guide });
  }

  function backendInstallTaskSummary(
    snapshot: Pick<InstallTaskSnapshot, "status" | "cancelRequested">,
    guide: BackendInstallGuide,
  ) {
    if (snapshot.cancelRequested && snapshot.status === "running") {
      return copy.activity.cancelRequested;
    }

    switch (snapshot.status) {
      case "success":
        return fillBackendTemplate(copy.home.installTaskSuccess, guide.displayName);
      case "failed":
        return fillBackendTemplate(copy.home.installTaskFailed, guide.displayName);
      case "cancelled":
        return fillBackendTemplate(copy.home.installTaskCancelled, guide.displayName);
      case "pending":
      case "running":
        return fillBackendTemplate(copy.home.installTaskRunning, guide.displayName);
    }
  }

  function confirmBackendInstall() {
    if (!backendInstallDialog || backendInstallPending || !canStartTask(activityTasksRef.current, "write")) {
      return;
    }

    const { guide } = backendInstallDialog;
    const command = guide.installCommand ?? guide.installerUrl ?? guide.officialSourceUrl;
    setBackendInstallPending(true);
    setBackendInstallGuideError(null);
    setBackendInstallDialog(null);

    const taskId = createActivityTask({
      type: "install_backend",
      access: "write",
      command,
      summary: fillBackendTemplate(copy.home.installTaskRunning, guide.displayName),
    });
    updateActivityTask(taskId, (task) => ({
      ...task,
      cancelable: true,
    }));

    void startInstallBackendTask()
      .then((snapshot) => {
        updateInstallTaskSnapshot(taskId, snapshot, backendInstallTaskSummary(snapshot, guide));

        const pollTask = () => {
          void getInstallVersionTask(snapshot.taskId)
            .then(async (nextSnapshot) => {
              if (!nextSnapshot) {
                finishActivityTask(taskId, {
                  status: "failed",
                  stdout: "",
                  stderr: "Install backend task not found.",
                  exitCode: null,
                  summary: fillBackendTemplate(copy.home.installTaskFailed, guide.displayName),
                  recommendation: guide.detectionHint,
                });
                setBackendInstallPending(false);
                return;
              }

              updateInstallTaskSnapshot(taskId, nextSnapshot, backendInstallTaskSummary(nextSnapshot, guide));

              if (nextSnapshot.status === "running" || nextSnapshot.status === "pending") {
                window.setTimeout(pollTask, INSTALL_TASK_POLL_MS);
                return;
              }

              if (nextSnapshot.status === "success") {
                const [snapshotSummary, detection] = await Promise.all([
                  getBackendSnapshot(),
                  detectBackend(),
                ]);
                commitBackendSnapshot(snapshotSummary, detection);

                if (snapshotSummary.backendKind === "missing") {
                  const failure = backendInstallRedetectFailure(guide, snapshotSummary, detection);
                  finishActivityTask(taskId, {
                    status: "failed",
                    stdout: nextSnapshot.stdout,
                    stderr: nextSnapshot.stderr,
                    exitCode: nextSnapshot.exitCode,
                    summary: failure.summary,
                    recommendation: failure.recommendation,
                  });
                  setBackendInstallGuideError(failure.userMessage);
                } else {
                  finishActivityTask(taskId, {
                    status: "success",
                    stdout: nextSnapshot.stdout,
                    stderr: nextSnapshot.stderr,
                    exitCode: nextSnapshot.exitCode,
                    summary: fillBackendTemplate(copy.home.installTaskSuccess, guide.displayName),
                  });
                }
              } else if (nextSnapshot.status === "cancelled") {
                finishActivityTask(taskId, {
                  status: "cancelled",
                  stdout: nextSnapshot.stdout,
                  stderr: nextSnapshot.stderr,
                  exitCode: nextSnapshot.exitCode,
                  summary: fillBackendTemplate(copy.home.installTaskCancelled, guide.displayName),
                });
              } else {
                finishActivityTask(taskId, {
                  status: "failed",
                  stdout: nextSnapshot.stdout,
                  stderr: nextSnapshot.stderr,
                  exitCode: nextSnapshot.exitCode,
                  summary:
                    nextSnapshot.message ?? fillBackendTemplate(copy.home.installTaskFailed, guide.displayName),
                  recommendation: guide.detectionHint,
                });
              }

              setBackendInstallPending(false);
            })
            .catch((error: unknown) => {
              const message = errorMessage(
                error,
                fillBackendTemplate(copy.home.installTaskFailed, guide.displayName),
              );
              finishActivityTask(taskId, {
                status: "failed",
                stdout: "",
                stderr: errorStderr(error),
                exitCode: null,
                summary: message,
                recommendation: guide.detectionHint,
              });
              setBackendInstallPending(false);
            });
        };

        window.setTimeout(pollTask, INSTALL_TASK_POLL_MS);
      })
      .catch((error: unknown) => {
        const message = errorMessage(
          error,
          fillBackendTemplate(copy.home.installTaskFailed, guide.displayName),
        );
        finishActivityTask(taskId, {
          status: "failed",
          stdout: "",
          stderr: errorStderr(error),
          exitCode: null,
          summary: message,
          recommendation: guide.detectionHint,
        });
        setBackendInstallPending(false);
      });
  }

  function handleHomeAction(action: HomeActionKey) {
    switch (action) {
      case "install_nvm":
        if (backendInstallGuide) {
          requestBackendInstall(backendInstallGuide);
        } else {
          loadBackendInstallGuide(true);
        }
        break;
      case "apply_project":
        applyProjectVersion();
        break;
      case "fix_path":
        copyText(shellIntegrationSnippet(backendDetection?.nvmDir ?? null));
        break;
      case "set_default":
        if (backendSnapshot.currentNodeVersion) {
          setDefaultVersion(backendSnapshot.currentNodeVersion);
        }
        break;
      case "check_admin":
        navigateToScreen("activity");
        break;
    }
  }

  function syncCurrentVersion(version: string) {
    markBackendSnapshotMutation();
    setBackendSnapshot((current) => {
      const installedVersions = current.installedVersions.map((item) => ({
        ...item,
        isCurrent: versionsMatch(item.version, version),
      }));
      const currentNodeVersion =
        installedVersions.find((item) => item.isCurrent)?.version ?? current.currentNodeVersion;
      return {
        ...current,
        currentNodeVersion,
        defaultMatchesCurrent:
          current.defaultVersion !== null &&
          currentNodeVersion !== null &&
          versionsMatch(current.defaultVersion, currentNodeVersion),
        installedVersions,
      };
    });
  }

  function syncDefaultVersion(version: string) {
    markBackendSnapshotMutation();
    setBackendSnapshot((current) => {
      const installedVersions = current.installedVersions.map((item) => ({
        ...item,
        isDefault: versionsMatch(item.version, version),
      }));
      return {
        ...current,
        defaultVersion: version,
        defaultExists: installedVersions.some((item) => versionsMatch(item.version, version)),
        defaultMatchesCurrent:
          current.currentNodeVersion !== null && versionsMatch(version, current.currentNodeVersion),
        installedVersions,
      };
    });
  }

  function syncUninstall(target: UninstallTarget) {
    markBackendSnapshotMutation();
    setBackendSnapshot((current) => {
      const removingVersion = target.version;
      const installedVersions = current.installedVersions.filter(
        (item) => !versionsMatch(item.version, removingVersion),
      );
      const nextCurrentVersion = target.isCurrent ? installedVersions[0]?.version ?? null : current.currentNodeVersion;
      const defaultExists =
        current.defaultVersion !== null &&
        installedVersions.some((item) => versionsMatch(item.version, current.defaultVersion));
      return {
        ...current,
        currentNodeVersion: nextCurrentVersion,
        defaultExists,
        defaultMatchesCurrent:
          defaultExists &&
          current.defaultVersion !== null &&
          nextCurrentVersion !== null &&
          versionsMatch(current.defaultVersion, nextCurrentVersion),
        installedVersions: installedVersions.map((item) => ({
          ...item,
          isCurrent: nextCurrentVersion !== null && versionsMatch(item.version, nextCurrentVersion),
        })),
      };
    });
  }

  function runVersionMutation(
    task: {
      type: ActivityTaskType;
      command: string;
      startSummary: string;
      successSummary: string;
    },
    command: () => Promise<CommandResult<null>>,
    onSuccess: () => void,
    onError: (message: string) => void,
    fallbackMessage: string,
    classifyFailure?: (context: {
      message: string;
      stdout: string;
      stderr: string;
      exitCode: number | null;
    }) => {
      summary: string;
      recommendation: string | null;
      userMessage: string;
    },
  ) {
    if (versionActionPending || !canStartTask(activityTasksRef.current, "write")) return;

    setVersionActionPending(true);
    setVersionError(null);
    const taskId = createActivityTask({
      type: task.type,
      access: "write",
      command: task.command,
      summary: task.startSummary,
    });
    void command()
      .then((result) => {
        if (result.status === "failed" || result.status === "cancelled") {
          const message = result.message ?? fallbackMessage;
          if (result.status === "cancelled") {
            onError(message);
            finishActivityTask(taskId, {
              status: "cancelled",
              stdout: result.stdout,
              stderr: result.stderr,
              exitCode: result.exitCode,
              summary: message,
              recommendation: null,
            });
            return;
          }

          const failure =
            classifyFailure?.({
              message,
              stdout: result.stdout,
              stderr: result.stderr,
              exitCode: result.exitCode,
            }) ?? {
              summary: message,
              recommendation: message,
              userMessage: message,
            };
          onError(failure.userMessage);
          finishActivityTask(taskId, {
            status: "failed",
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            summary: failure.summary,
            recommendation: failure.recommendation,
          });
          return;
        }

        onSuccess();
        finishActivityTask(taskId, {
          status: "success",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          summary: task.successSummary,
        });
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, fallbackMessage);
        const stderr = errorStderr(error);
        const failure =
          classifyFailure?.({
            message,
            stdout: "",
            stderr,
            exitCode: null,
          }) ?? {
            summary: message,
            recommendation: message,
            userMessage: message,
          };
        onError(failure.userMessage);
        finishActivityTask(taskId, {
          status: "failed",
          stdout: "",
          stderr,
          exitCode: null,
          summary: failure.summary,
          recommendation: failure.recommendation,
        });
      })
      .finally(() => setVersionActionPending(false));
  }

  function applyProjectVersion() {
    if (!selectedProject?.version || !selectedProject.isValid || !selectedProject.isInstalled) {
      setProjectError(copy.projects.applyUnavailable);
      return;
    }

    setProjectError(null);
    const options: ActivateOptions = {
      version: selectedProject.version,
      arch: null,
    };
    runVersionMutation(
      {
        type: "activate",
        command: `nvm use ${selectedProject.version}`,
        startSummary: "Applying the version requested by .nvmrc.",
        successSummary: `Applied ${selectedProject.version}.`,
      },
      () => activateVersionCommand(options),
      () => syncCurrentVersion(selectedProject.version!),
      (message) => setProjectError(message),
      copy.projects.applyFailed,
    );
  }

  function installProjectVersion() {
    if (!selectedProject?.version || !selectedProject.isValid || selectedProject.isInstalled) {
      setProjectError(copy.projects.installUnavailable);
      return;
    }

    const projectDir = selectedProject.projectDir;

    setProjectInstallPending(true);
    setProjectError(null);
    const taskId = createActivityTask({
      type: "install",
      access: "write",
      command: `nvm install ${selectedProject.version}`,
      summary: "Installing the version requested by .nvmrc.",
    });
    void installVersion({
      version: selectedProject.version,
      arch: null,
      reinstallPackagesFrom: null,
      latestNpm: false,
      sourceInstall: false,
    })
      .then(async (result) => {
        if (result.status === "failed") {
          const message = result.message ?? copy.projects.installFailed;
          setProjectError(message);
          finishActivityTask(taskId, {
            status: "failed",
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            summary: message,
            recommendation: message,
          });
          return;
        }

        const [snapshot, detection, projectResult] = await Promise.all([
          getBackendSnapshot(),
          detectBackend(),
          readProjectVersion(projectDir),
        ]);

        commitBackendSnapshot(snapshot, detection);

        if (projectResult.status === "failed" || !projectResult.data) {
          const message = projectResult.message ?? copy.projects.readFailed;
          setProjectError(message);
          finishActivityTask(taskId, {
            status: "failed",
            stdout: result.stdout,
            stderr: projectResult.stderr,
            exitCode: projectResult.exitCode,
            summary: message,
            recommendation: message,
          });
          return;
        }

        storeProject(projectRecordFromResult(projectResult.data));
        finishActivityTask(taskId, {
          status: "success",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          summary: `Installed ${selectedProject.version}.`,
        });
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, copy.projects.installFailed);
        setProjectError(message);
        finishActivityTask(taskId, {
          status: "failed",
          stdout: "",
          stderr: errorStderr(error),
          exitCode: null,
          summary: message,
          recommendation: message,
        });
      })
      .finally(() => setProjectInstallPending(false));
  }

  function requestRemoteInstall(version: string) {
    setRemoteInstallRequest({
      version,
      reinstallPackagesFrom: "none",
      latestNpm: false,
      sourceInstall: false,
      arch: "system",
    });
  }

  function confirmRemoteInstall() {
    if (!remoteInstallRequest) return;

    const options: InstallOptions = {
      version: remoteInstallRequest.version,
      arch: remoteInstallRequest.arch === "system" ? null : remoteInstallRequest.arch,
      reinstallPackagesFrom:
        remoteInstallRequest.reinstallPackagesFrom === "current"
          ? backendSnapshot.currentNodeVersion
          : remoteInstallRequest.reinstallPackagesFrom === "default"
            ? backendSnapshot.defaultVersion
            : null,
      latestNpm: remoteInstallRequest.latestNpm,
      sourceInstall: remoteInstallRequest.sourceInstall,
    };
    setRemoteInstallRequest(null);
    installRemoteVersion(options);
  }

  function installRemoteVersion(options: InstallOptions) {
    if (remoteInstallPending || !canStartTask(activityTasksRef.current, "write")) return;

    setRemoteInstallPending(true);
    setRemoteError(null);
    const taskId = createActivityTask({
      type: "install",
      access: "write",
      command: installCommand(options),
      summary: `Installing ${options.version} from the remote release list.`,
    });
    updateActivityTask(taskId, (task) => ({
      ...task,
      cancelable: true,
    }));
    void startInstallVersionTask(options)
      .then((snapshot) => {
        updateInstallTaskSnapshot(taskId, snapshot, installTaskSummary(snapshot, options.version));

        const pollTask = () => {
          void getInstallVersionTask(snapshot.taskId)
            .then(async (nextSnapshot) => {
              if (!nextSnapshot) {
                const message = copy.remote.installFailed;
                setRemoteError(message);
                finishActivityTask(taskId, {
                  status: "failed",
                  stdout: "",
                  stderr: "Install task not found.",
                  exitCode: null,
                  summary: message,
                  recommendation: message,
                });
                setRemoteInstallPending(false);
                return;
              }

              updateInstallTaskSnapshot(
                taskId,
                nextSnapshot,
                installTaskSummary(nextSnapshot, options.version),
              );

              if (nextSnapshot.status === "running" || nextSnapshot.status === "pending") {
                window.setTimeout(pollTask, INSTALL_TASK_POLL_MS);
                return;
              }

              if (nextSnapshot.status === "success") {
                const snapshotSummary = await getBackendSnapshot();
                replaceBackendSnapshot(snapshotSummary);
                finishActivityTask(taskId, {
                  status: "success",
                  stdout: nextSnapshot.stdout,
                  stderr: nextSnapshot.stderr,
                  exitCode: nextSnapshot.exitCode,
                  summary: `Installed ${options.version}.`,
                });
              } else if (nextSnapshot.status === "cancelled") {
                finishActivityTask(taskId, {
                  status: "cancelled",
                  stdout: nextSnapshot.stdout,
                  stderr: nextSnapshot.stderr,
                  exitCode: nextSnapshot.exitCode,
                  summary: `Cancelled install for ${options.version}.`,
                });
              } else {
                const message = nextSnapshot.message ?? copy.remote.installFailed;
                setRemoteError(message);
                finishActivityTask(taskId, {
                  status: "failed",
                  stdout: nextSnapshot.stdout,
                  stderr: nextSnapshot.stderr,
                  exitCode: nextSnapshot.exitCode,
                  summary: message,
                  recommendation: message,
                });
              }

              setRemoteInstallPending(false);
            })
            .catch((error: unknown) => {
              const message = errorMessage(error, copy.remote.installFailed);
              setRemoteError(message);
              finishActivityTask(taskId, {
                status: "failed",
                stdout: "",
                stderr: errorStderr(error),
                exitCode: null,
                summary: message,
                recommendation: message,
              });
              setRemoteInstallPending(false);
            });
        };

        window.setTimeout(pollTask, INSTALL_TASK_POLL_MS);
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, copy.remote.installFailed);
        setRemoteError(message);
        finishActivityTask(taskId, {
          status: "failed",
          stdout: "",
          stderr: errorStderr(error),
          exitCode: null,
          summary: message,
          recommendation: message,
        });
        setRemoteInstallPending(false);
      })
  }

  function cancelActivityTask(taskId: string) {
    const task = activityTasksRef.current.find((item) => item.id === taskId);
    if (!task || !task.cancelable || !task.backendTaskId || task.cancelRequested || task.status !== "running") {
      return;
    }

    updateActivityTask(taskId, (current) => ({
      ...current,
      cancelRequested: true,
      summary: copy.activity.cancelRequested,
    }));

    void cancelInstallVersionTask(task.backendTaskId)
      .then((snapshot) => {
        if (!snapshot) return;
        updateInstallTaskSnapshot(taskId, snapshot, currentSummaryForInstallTask(snapshot, task));
      })
      .catch((error: unknown) => {
        updateActivityTask(taskId, (current) => ({
          ...current,
          cancelRequested: false,
          summary: errorMessage(error, copy.remote.installFailed),
        }));
      });
  }

  function currentSummaryForInstallTask(snapshot: InstallTaskSnapshot, task: ActivityTask): string {
    if (snapshot.cancelRequested && snapshot.status === "running") {
      return copy.activity.cancelRequested;
    }
    return task.summary;
  }

  function copyProjectCommand() {
    if (!selectedProject) {
      setProjectError(copy.projects.selectProjectFirst);
      return;
    }

    const command = projectSuggestedCommand(selectedProject);
    if (!command) {
      setProjectError(copy.projects.applyUnavailable);
      return;
    }

    setProjectError(null);
    copyText(command);
  }

  function confirmProjectWrite() {
    if (!projectEditor) return;

    const nextVersion = projectEditor.draftValue.trim();
    if (!nextVersion) return;

    setProjectWritePending(true);
    setProjectError(null);
    const taskId = createActivityTask({
      type: "project_nvmrc_write",
      access: "write",
      command: `write ${projectEditor.projectDir}/.nvmrc ${nextVersion}`,
      summary: "Writing project .nvmrc.",
    });
    void writeProjectVersion(projectEditor.projectDir, nextVersion)
      .then((result) => {
        if (result.status === "failed" || !result.data) {
          const message = result.message ?? copy.projects.writeFailed;
          setProjectError(message);
          finishActivityTask(taskId, {
            status: result.status === "cancelled" ? "cancelled" : "failed",
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            summary: message,
            recommendation: result.status === "failed" ? message : null,
          });
          return;
        }

        storeProject(projectRecordFromResult(result.data));
        setProjectEditor(null);
        finishActivityTask(taskId, {
          status: "success",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          summary: `Wrote ${result.data.nvmrcPath ?? ".nvmrc"}.`,
        });
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, copy.projects.writeFailed);
        setProjectError(message);
        finishActivityTask(taskId, {
          status: "failed",
          stdout: "",
          stderr: errorStderr(error),
          exitCode: null,
          summary: message,
          recommendation: message,
        });
      })
      .finally(() => setProjectWritePending(false));
  }

  function useVersion(version: string) {
    const options: ActivateOptions = {
      version,
      arch: null,
    };
    runVersionMutation(
      {
        type: "activate",
        command: `nvm use ${version}`,
        startSummary: `Switching active version to ${version}.`,
        successSummary: `Active version switched to ${version}.`,
      },
      () => activateVersionCommand(options),
      () => syncCurrentVersion(version),
      (message) => setVersionError(message),
      copy.versions.activateFailed,
    );
  }

  function setDefaultVersion(version: string) {
    runVersionMutation(
      {
        type: "set_default",
        command: `nvm alias default ${version}`,
        startSummary: `Setting default version to ${version}.`,
        successSummary: `Default version set to ${version}.`,
      },
      () => setDefaultVersionCommand(version),
      () => syncDefaultVersion(version),
      (message) => setVersionError(message),
      copy.versions.setDefaultFailed,
    );
  }

  function requestUninstall(version: Version) {
    const managedVersions = backendSnapshot.installedVersions.filter(
      (item) => !item.isSystem && item.path,
    );
    setUninstallTarget({
      version: version.version,
      isCurrent: version.status.includes("current"),
      isDefault: version.status.includes("default"),
      isLastManaged:
        managedVersions.filter((item) => versionsMatch(item.version, version.version)).length > 0 &&
        managedVersions.length <= 1,
    });
  }

  function confirmUninstall() {
    if (!uninstallTarget) return;
    if (versionActionPending || !canStartTask(activityTasksRef.current, "write")) return;
    const target = uninstallTarget;
    setUninstallTarget(null);
    runVersionMutation(
      {
        type: "uninstall",
        command: `nvm uninstall ${target.version}`,
        startSummary: `Removing ${target.version}.`,
        successSummary: `Removed ${target.version}.`,
      },
      () => uninstallVersionCommand(target.version),
      () => {
        syncUninstall(target);
      },
      (message) => setVersionError(message),
      copy.versions.uninstallFailed,
      ({ message, stderr }) =>
        classifyUninstallFailure({
          version: target.version,
          message,
          stderr,
        }),
    );
  }

  function openInstallDirectory(version: Version) {
    const targetPath = installDirectoryFromPath(version.path);
    if (!targetPath) return;
    void openPath(targetPath).catch((error: unknown) => {
      setProjectError(error instanceof Error ? error.message : copy.projects.readFailed);
    });
  }

  async function executeManualUiCommand(command: ManualUiCommand) {
    switch (command.kind) {
      case "navigate":
        if (!isScreen(command.screen)) {
          throw new Error(`Unsupported screen: ${command.screen}`);
        }
        navigateToScreen(command.screen);
        return;
      case "click": {
        const target = findManualUiElement(command.manualId);
        if (!target) {
          throw new Error(`Manual UI element not found: ${command.manualId}`);
        }
        if (isElementDisabled(target)) {
          throw new Error(`Manual UI element is disabled: ${command.manualId}`);
        }
        target.click();
        return;
      }
      case "read-project": {
        navigateToScreen("projects");
        const project = await readProject(command.projectDir);
        if (!project) {
          throw new Error(copy.projects.readFailed);
        }
        return;
      }
    }
  }

  function readManualUiCommandState() {
    const root = rootRef.current;
    const dialogTitles = root
      ? Array.from(root.querySelectorAll<HTMLElement>("[role='dialog']")).map((dialog) =>
          normalizeManualUiText(
            dialog.querySelector("h1, h2, h3")?.textContent ?? dialog.textContent ?? "",
          ),
        ).filter((value): value is string => value.length > 0)
      : [];

    return {
      screen: activeScreenRef.current,
      dialogTitles,
    };
  }

  function findManualUiElement(manualId: string): HTMLElement | null {
    const root = rootRef.current;
    if (!root) return null;

    return (
      Array.from(root.querySelectorAll<HTMLElement>("[data-manual-id]")).find(
        (element) => element.dataset.manualId === manualId,
      ) ?? null
    );
  }

  useEffect(() => {
    refreshBackendSnapshot();
    refreshRemoteVersions();
  }, []);

  useEffect(() => {
    if (!manualUiConfig.enabled || !manualUiConfig.presetProjectDir) return;
    if (manualProjectInitRef.current === manualUiConfig.presetProjectDir) return;

    manualProjectInitRef.current = manualUiConfig.presetProjectDir;
    void readProject(manualUiConfig.presetProjectDir);
  }, [manualUiConfig]);

  useEffect(() => {
    if (backendSnapshot.backendKind !== "missing") return;
    if (backendInstallGuide || backendInstallGuideLoading) return;
    loadBackendInstallGuide();
  }, [backendInstallGuide, backendInstallGuideLoading, backendSnapshot.backendKind]);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (theme === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    document.documentElement.style.colorScheme = activeTheme;
  }, [theme, activeTheme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!uninstallTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUninstallTarget(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [uninstallTarget]);

  useEffect(() => {
    if (!projectEditor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !projectWritePending) {
        setProjectEditor(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectEditor, projectWritePending]);

  function renderScreen() {
    switch (activeScreen) {
      case "versions":
        return (
          <VersionsScreen
            copy={copy}
            snapshot={backendSnapshot}
            versionError={versionError}
            versionActionPending={versionActionPending}
            onUseVersion={useVersion}
            onSetDefault={setDefaultVersion}
            onRequestUninstall={requestUninstall}
            onCopyVersion={copyText}
            onOpenInstallDirectory={openInstallDirectory}
            onViewDetails={(version) => setDetailsTarget(buildVersionDetails(version))}
          />
        );
      case "remote":
        return (
          <RemoteScreen
            copy={copy}
            locale={locale}
            snapshot={backendSnapshot}
            remoteCache={remoteCache}
            remoteLoading={remoteLoading}
            remoteError={remoteError}
            remoteInstallPending={remoteInstallPending}
            remoteWriteLocked={writeLocked}
            onRefresh={refreshRemoteVersions}
            onRequestInstall={requestRemoteInstall}
          />
        );
      case "projects":
        return (
          <ProjectsScreen
            copy={copy}
            projects={recentProjects}
            selectedProject={selectedProject}
            projectError={projectError}
            projectInstallPending={projectInstallPending}
            onChooseDirectory={chooseProjectDirectory}
            onEditProject={openProjectEditor}
            onInstallProjectVersion={installProjectVersion}
            onApplyProjectVersion={applyProjectVersion}
            onCopySuggestedCommand={copyProjectCommand}
            onReadProject={readProject}
            onOpenProjectDirectory={openProjectDirectory}
          />
        );
      case "activity":
        return <ActivityScreen copy={copy} tasks={activityTasks} onCancelTask={cancelActivityTask} />;
      case "settings":
        return (
          <SettingsScreen
            copy={copy}
            snapshot={backendSnapshot}
            backendDetection={backendDetection}
            locale={locale}
            setLocale={setLocale}
            theme={theme}
            setTheme={setTheme}
          />
        );
      case "home":
      default:
        return (
          <HomeScreen
            copy={copy}
            snapshot={backendSnapshot}
            selectedProject={selectedProject}
            backendInstallGuide={backendInstallGuide}
            backendInstallGuideLoading={backendInstallGuideLoading}
            backendInstallGuideError={backendInstallGuideError}
            backendInstallPending={backendInstallPending}
            writeLocked={writeLocked}
            onRefresh={refreshBackendSnapshot}
            onHomeAction={handleHomeAction}
            onOpenInstallSource={openInstallGuideSource}
            onRequestBackendInstall={requestBackendInstall}
          />
        );
    }
  }

  return (
    <main className="app-shell" data-theme={activeTheme} ref={rootRef}>
      <WindowControls copy={copy} />
      <aside className="navigation-rail" aria-label={copy.navAria.primary}>
        <div className="brand-mark" aria-label={PROJECT_NAME}>
          <img src={nodePilotLogo} alt="" aria-hidden="true" />
        </div>
        <nav>
          {navigation.map((item) => {
            const label = copy.navigation[item.id];

            return (
              <button
                className={activeScreen === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                data-manual-id={`nav:${item.id}`}
                onClick={() => navigateToScreen(item.id)}
                title={label}
                type="button"
                aria-label={`${copy.navAria.open} ${label}`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <strong>{label}</strong>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="content-shell">
        <header className="top-bar" onMouseDown={handleWindowDragMouseDown}>
          <div>
            <span className="eyebrow">
              {PROJECT_NAME} · {copy.appSubtitle}
            </span>
            <h1>{activeTitle}</h1>
          </div>
          <div className="status-strip">
            <Chip label={backendLabel(backendSnapshot.backendKind)} tone="info" />
            <Chip
              label={`${copy.status.current} ${backendSnapshot.currentNodeVersion ?? copy.home.unavailable}`}
              tone="success"
            />
            <Chip
              label={`${copy.status.default} ${backendSnapshot.defaultVersion ?? copy.home.unavailable}`}
              tone={backendSnapshot.defaultMatchesCurrent ? "success" : "warning"}
            />
          </div>
        </header>
        {renderScreen()}
      </section>
      {uninstallTarget && (
        <ConfirmDialog
          title={copy.versions.confirmDialogTitle}
          description={fillVersionTemplate(
            copy.versions.confirmDialogDescription,
            uninstallTarget.version,
          )}
          note={copy.versions.confirmDialogMockNote}
          warnings={[
            uninstallTarget.isCurrent ? copy.versions.deleteCurrentWarning : null,
            uninstallTarget.isDefault ? copy.versions.deleteDefaultWarning : null,
            uninstallTarget.isLastManaged ? copy.versions.deleteLastManagedWarning : null,
          ].flatMap((value) => (value ? [value] : []))}
          cancelLabel={copy.common.cancel}
          confirmLabel={copy.common.confirm}
          onCancel={() => setUninstallTarget(null)}
          onConfirm={confirmUninstall}
        />
      )}
      {detailsTarget && (
        <VersionDetailsDialog copy={copy} details={detailsTarget} onClose={() => setDetailsTarget(null)} />
      )}
      {projectEditor && (
        <ProjectEditorDialog
          copy={copy}
          editor={projectEditor}
          pending={projectWritePending}
          onChange={(value) =>
            setProjectEditor((current) => (current ? { ...current, draftValue: value } : current))
          }
          onClose={() => setProjectEditor(null)}
          onConfirm={confirmProjectWrite}
        />
      )}
      {backendInstallDialog && (
        <BackendInstallDialog
          copy={copy}
          guide={backendInstallDialog.guide}
          pending={backendInstallPending}
          onCancel={() => setBackendInstallDialog(null)}
          onConfirm={confirmBackendInstall}
        />
      )}
      {remoteInstallRequest && (
        <RemoteInstallDialog
          copy={copy}
          snapshot={backendSnapshot}
          supportsSourceInstall={
            backendDetection?.capabilities.supportsSourceInstall ??
            (backendSnapshot.backendKind === "nvm-sh")
          }
          request={remoteInstallRequest}
          pending={remoteInstallPending}
          onClose={() => setRemoteInstallRequest(null)}
          onChange={setRemoteInstallRequest}
          onConfirm={confirmRemoteInstall}
        />
      )}
    </main>
  );
}

export default App;

function isScreen(value: string): value is Screen {
  return navigation.some((item) => item.id === value);
}

function isElementDisabled(element: HTMLElement): boolean {
  if ("disabled" in element && typeof element.disabled === "boolean") {
    return element.disabled;
  }

  return element.getAttribute("aria-disabled") === "true";
}

function normalizeManualUiText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
