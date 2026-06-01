import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Screen = "home" | "versions" | "remote" | "projects" | "activity" | "settings";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type Theme = "light" | "dark";
type Locale = "zh-CN" | "en-US";
type StatusKey =
  | "current"
  | "default"
  | "lts"
  | "project"
  | "system"
  | "issue"
  | "latest"
  | "installed"
  | "available"
  | "ready"
  | "needsInstall"
  | "ok"
  | "warn"
  | "missing"
  | "success"
  | "failed"
  | "running";

type Version = {
  version: string;
  npm: string;
  path: string;
  arch: string;
  status: StatusKey[];
};

type RemoteVersion = {
  version: string;
  line: string;
  status: StatusKey;
  installed: boolean;
};

type Project = {
  name: string;
  path: string;
  nvmrc: string;
  state: StatusKey;
};

type ActivityItem = {
  actionKey: "healthCheck" | "remoteRefresh" | "applyProject";
  status: "success" | "failed" | "running";
  time: string;
  command: string;
  output: string;
};

const PROJECT_NAME = "NodePilot";
const LOCALE_STORAGE_KEY = "nodepilot.locale";
const THEME_STORAGE_KEY = "nodepilot.theme";

const navigation: Array<{ id: Screen; icon: string }> = [
  { id: "home", icon: "⌂" },
  { id: "versions", icon: "▦" },
  { id: "remote", icon: "⇣" },
  { id: "projects", icon: "◇" },
  { id: "activity", icon: "≡" },
  { id: "settings", icon: "⚙" },
];

const localVersions: Version[] = [
  {
    version: "v22.11.0",
    npm: "10.9.0",
    path: "~/.nvm/versions/node/v22.11.0/bin/node",
    arch: "arm64",
    status: ["current", "lts"],
  },
  {
    version: "v20.18.1",
    npm: "10.8.2",
    path: "~/.nvm/versions/node/v20.18.1/bin/node",
    arch: "arm64",
    status: ["default", "lts"],
  },
  {
    version: "v18.20.4",
    npm: "10.7.0",
    path: "~/.nvm/versions/node/v18.20.4/bin/node",
    arch: "x64",
    status: ["project"],
  },
  {
    version: "system",
    npm: "9.8.1",
    path: "/usr/local/bin/node",
    arch: "arm64",
    status: ["system", "issue"],
  },
];

const remoteVersions: RemoteVersion[] = [
  { version: "v24.4.1", line: "Current", status: "latest", installed: false },
  { version: "v22.11.0", line: "LTS Jod", status: "installed", installed: true },
  { version: "v20.18.1", line: "LTS Iron", status: "installed", installed: true },
  { version: "v18.20.4", line: "LTS Hydrogen", status: "installed", installed: true },
  { version: "v16.20.2", line: "Maintenance", status: "available", installed: false },
];

const projects: Project[] = [
  {
    name: "NodePilot",
    path: "~/Downloads/Projects/nvmUI",
    nvmrc: "v22.11.0",
    state: "ready",
  },
  {
    name: "legacy-dashboard",
    path: "~/Work/legacy-dashboard",
    nvmrc: "v18.20.4",
    state: "installed",
  },
  {
    name: "website",
    path: "~/Work/website",
    nvmrc: "lts/*",
    state: "needsInstall",
  },
];

const activity: ActivityItem[] = [
  {
    actionKey: "healthCheck",
    status: "success",
    time: "14:08",
    command: "detect backend and current node",
    output: "backend=nvm-sh current=v22.11.0 default=v20.18.1",
  },
  {
    actionKey: "remoteRefresh",
    status: "running",
    time: "14:06",
    command: "nvm ls-remote --no-colors",
    output: "Fetching Node release index from configured mirror...",
  },
  {
    actionKey: "applyProject",
    status: "failed",
    time: "13:52",
    command: "nvm use",
    output: "Found .nvmrc with version lts/*\nRequested version is not installed locally.",
  },
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
      installed: "已安装",
      copy: "复制",
    },
    home: {
      eyebrow: "当前环境",
      title: "Node v22.11.0",
      description:
        "当前通过 nvm-sh 在 macOS arm64 上运行。默认版本是 v20.18.1；新的 shell 会使用 default alias。",
      npmLabel: "npm",
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
      actions: [
        ["将 v22.11.0 设为默认", "让当前环境和新 shell 行为保持一致"],
        ["安装最新 LTS", "满足 ~/Work/website 的 .nvmrc 要求"],
        ["复制 PATH 修复片段", "手动更新 shell profile"],
      ],
    },
    versions: {
      eyebrow: "本地",
      title: "已安装版本",
      npmColumn: "npm",
    },
    remote: {
      eyebrow: "远程",
      title: "可用 Node 版本",
      installLts: "安装最新 LTS",
      refreshRemote: "刷新远程列表",
      search: "搜索 v22、lts、latest",
    },
    projects: {
      eyebrow: "项目",
      title: ".nvmrc 工作区状态",
      chooseDirectory: "选择目录",
      createNvmrc: "创建 .nvmrc",
      apply: "应用",
    },
    activity: {
      eyebrow: "活动",
      title: "任务日志",
      actionNames: {
        healthCheck: "健康检查",
        remoteRefresh: "刷新远程列表",
        applyProject: "应用项目版本",
      },
      repair:
        "推荐：先安装 .nvmrc 请求的 LTS 版本，然后再次应用项目版本。",
    },
    settings: {
      backendEyebrow: "Backend",
      backendTitle: "已检测到 nvm-sh",
      nvmDir: "NVM_DIR",
      versionStore: "版本存储",
      activationBehavior: "切换行为",
      activationCopy: "只影响当前任务环境；default alias 影响新的 shell。",
      shellEyebrow: "Shell",
      shellTitle: "Profile 集成",
      zshLoaded: ".zshrc 已加载 nvm.sh",
      bashMissing: ".bash_profile 中没有 nvm 片段",
      networkEyebrow: "网络",
      networkTitle: "Mirror 与 proxy",
      nodeMirror: "Node mirror",
      proxy: "Proxy",
      proxyValue: "未配置",
      appearanceEyebrow: "外观",
      appearanceTitle: "主题",
      languageTitle: "语言",
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
      installed: "Installed",
      copy: "Copy",
    },
    home: {
      eyebrow: "Current environment",
      title: "Node v22.11.0",
      description:
        "Running through nvm-sh on macOS arm64. Default version is v20.18.1; new shells will use the default alias.",
      npmLabel: "npm",
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
      actions: [
        ["Set v22.11.0 as default", "Align current and new shell behavior"],
        ["Install latest LTS", "Required by ~/Work/website .nvmrc"],
        ["Copy PATH fix", "Manual shell profile update"],
      ],
    },
    versions: {
      eyebrow: "Local",
      title: "Installed versions",
      npmColumn: "npm",
    },
    remote: {
      eyebrow: "Remote",
      title: "Available Node releases",
      installLts: "Install latest LTS",
      refreshRemote: "Refresh remote",
      search: "Search v22, lts, latest",
    },
    projects: {
      eyebrow: "Projects",
      title: ".nvmrc workspace status",
      chooseDirectory: "Choose directory",
      createNvmrc: "Create .nvmrc",
      apply: "Apply",
    },
    activity: {
      eyebrow: "Activity",
      title: "Task log",
      actionNames: {
        healthCheck: "Health check",
        remoteRefresh: "Remote refresh",
        applyProject: "Apply project version",
      },
      repair:
        "Recommended: install the requested LTS line, then apply the project version again.",
    },
    settings: {
      backendEyebrow: "Backend",
      backendTitle: "nvm-sh detected",
      nvmDir: "NVM_DIR",
      versionStore: "Version store",
      activationBehavior: "Activation behavior",
      activationCopy: "Current task only; default alias affects new shells.",
      shellEyebrow: "Shell",
      shellTitle: "Profile integration",
      zshLoaded: ".zshrc loads nvm.sh",
      bashMissing: ".bash_profile has no nvm snippet",
      networkEyebrow: "Network",
      networkTitle: "Mirror and proxy",
      nodeMirror: "Node mirror",
      proxy: "Proxy",
      proxyValue: "Not configured",
      appearanceEyebrow: "Appearance",
      appearanceTitle: "Theme",
      languageTitle: "Language",
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
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function statusTone(status: StatusKey): Tone {
  if (["current", "default", "ready", "installed", "success", "ok"].includes(status)) {
    return "success";
  }
  if (["issue", "failed", "needsInstall", "missing"].includes(status)) return "danger";
  if (["running", "project", "latest"].includes(status)) return "info";
  if (["system", "available", "lts", "warn"].includes(status)) return "warning";
  return "neutral";
}

function Chip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={`chip chip-${tone}`}>{label}</span>;
}

function SectionHeader({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="section-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  );
}

function HomeScreen({ copy }: { copy: Copy }) {
  return (
    <section className="screen-grid">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">{copy.home.eyebrow}</span>
          <h1>{copy.home.title}</h1>
          <p>{copy.home.description}</p>
        </div>
        <div className="hero-actions">
          <button className="button-primary" type="button">
            {copy.common.refresh}
          </button>
          <button className="button-tonal" type="button">
            {copy.common.applyProject}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <article className="metric">
          <span>{copy.home.npmLabel}</span>
          <strong>10.9.0</strong>
          <small>{copy.home.npmHint}</small>
        </article>
        <article className="metric">
          <span>{copy.home.backendLabel}</span>
          <strong>nvm-sh</strong>
          <small>{copy.home.backendHint}</small>
        </article>
        <article className="metric">
          <span>{copy.home.defaultLabel}</span>
          <strong>v20.18.1</strong>
          <small>{copy.home.defaultHint}</small>
        </article>
      </div>

      <article className="panel">
        <SectionHeader eyebrow={copy.home.healthEyebrow} title={copy.home.healthTitle} />
        <div className="check-list">
          {(["ok", "issue", "warn"] as const).map((status, index) => (
            <div className="check-row" key={status}>
              <Chip label={copy.status[status]} tone={statusTone(status)} />
              <span>{copy.home.checks[index]}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <SectionHeader eyebrow={copy.home.nextEyebrow} title={copy.home.nextTitle} />
        <div className="action-list">
          {copy.home.actions.map(([title, description]) => (
            <button className="action-button" type="button" key={title}>
              <span>{title}</span>
              <small>{description}</small>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

function VersionsScreen({ copy }: { copy: Copy }) {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.versions.eyebrow} title={copy.versions.title} />
      <div className="table-panel">
        {localVersions.map((item) => (
          <article className="version-row" key={item.version}>
            <div>
              <h3>{item.version}</h3>
              <p>{item.path}</p>
            </div>
            <div className="chip-row">
              {item.status.map((status) => (
                <Chip key={status} label={copy.status[status]} tone={statusTone(status)} />
              ))}
            </div>
            <span className="mono">{item.npm}</span>
            <span>{item.arch}</span>
            <div className="row-actions">
              <button
                className="icon-button"
                type="button"
                aria-label={`${copy.common.useVersion} ${item.version}`}
                title={copy.common.useVersion}
              >
                ⇄
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`${copy.common.setDefault} ${item.version}`}
                title={copy.common.setDefault}
              >
                ★
              </button>
              <button
                className="danger-button"
                type="button"
                aria-label={`${copy.common.uninstall} ${item.version}`}
                title={copy.common.confirmBeforeUninstall}
              >
                {copy.common.uninstall}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RemoteScreen({ copy }: { copy: Copy }) {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.remote.eyebrow} title={copy.remote.title} />
      <div className="toolbar">
        <button className="button-primary" type="button">
          {copy.remote.installLts}
        </button>
        <button className="button-tonal" type="button">
          {copy.remote.refreshRemote}
        </button>
        <div className="search-box">{copy.remote.search}</div>
      </div>
      <div className="remote-grid">
        {remoteVersions.map((item) => (
          <article className="remote-card" key={item.version}>
            <div>
              <h3>{item.version}</h3>
              <p>{item.line}</p>
            </div>
            <Chip label={copy.status[item.status]} tone={statusTone(item.status)} />
            <button className={item.installed ? "button-muted" : "button-primary"} type="button">
              {item.installed ? copy.common.installed : copy.common.install}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProjectsScreen({ copy }: { copy: Copy }) {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.projects.eyebrow} title={copy.projects.title} />
      <div className="toolbar">
        <button className="button-primary" type="button">
          {copy.projects.chooseDirectory}
        </button>
        <button className="button-tonal" type="button">
          {copy.projects.createNvmrc}
        </button>
      </div>
      <div className="project-list">
        {projects.map((project) => (
          <article className="project-row" key={project.path}>
            <div>
              <h3>{project.name}</h3>
              <p>{project.path}</p>
            </div>
            <span className="mono">{project.nvmrc}</span>
            <Chip label={copy.status[project.state]} tone={statusTone(project.state)} />
            <button className="button-tonal" type="button">
              {copy.projects.apply}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ActivityScreen({ copy }: { copy: Copy }) {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow={copy.activity.eyebrow} title={copy.activity.title} />
      <div className="activity-list">
        {activity.map((item) => (
          <article className="activity-card" key={`${item.actionKey}-${item.time}`}>
            <div className="activity-header">
              <div>
                <h3>{copy.activity.actionNames[item.actionKey]}</h3>
                <p>
                  {item.time} · {item.command}
                </p>
              </div>
              <Chip label={copy.status[item.status]} tone={statusTone(item.status)} />
            </div>
            <pre>{item.output}</pre>
            {item.status === "failed" && <div className="repair-note">{copy.activity.repair}</div>}
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
  locale,
  setLocale,
  theme,
  setTheme,
}: {
  copy: Copy;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  return (
    <section className="screen-grid">
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.backendEyebrow} title={copy.settings.backendTitle} />
        <dl className="settings-list">
          <div>
            <dt>{copy.settings.nvmDir}</dt>
            <dd>~/.nvm</dd>
          </div>
          <div>
            <dt>{copy.settings.versionStore}</dt>
            <dd>~/.nvm/versions/node</dd>
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
          <div className="check-row">
            <Chip label={copy.status.ok} tone="success" />
            <span>{copy.settings.zshLoaded}</span>
          </div>
          <div className="check-row">
            <Chip label={copy.status.missing} tone="warning" />
            <span>{copy.settings.bashMissing}</span>
          </div>
        </div>
      </article>
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.networkEyebrow} title={copy.settings.networkTitle} />
        <dl className="settings-list">
          <div>
            <dt>{copy.settings.nodeMirror}</dt>
            <dd>https://nodejs.org/dist</dd>
          </div>
          <div>
            <dt>{copy.settings.proxy}</dt>
            <dd>{copy.settings.proxyValue}</dd>
          </div>
        </dl>
      </article>
      <article className="panel">
        <SectionHeader eyebrow={copy.settings.appearanceEyebrow} title={copy.settings.appearanceTitle} />
        <div className="segmented" aria-label={copy.settings.appearanceTitle}>
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
  const [activeScreen, setActiveScreen] = useState<Screen>("home");
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const copy = translations[locale];

  const activeTitle = useMemo(() => copy.navigation[activeScreen], [activeScreen, copy]);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function renderScreen() {
    switch (activeScreen) {
      case "versions":
        return <VersionsScreen copy={copy} />;
      case "remote":
        return <RemoteScreen copy={copy} />;
      case "projects":
        return <ProjectsScreen copy={copy} />;
      case "activity":
        return <ActivityScreen copy={copy} />;
      case "settings":
        return (
          <SettingsScreen
            copy={copy}
            locale={locale}
            setLocale={setLocale}
            theme={theme}
            setTheme={setTheme}
          />
        );
      case "home":
      default:
        return <HomeScreen copy={copy} />;
    }
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <aside className="navigation-rail" aria-label={copy.navAria.primary}>
        <div className="brand-mark" aria-label={PROJECT_NAME}>
          P
        </div>
        <nav>
          {navigation.map((item) => {
            const label = copy.navigation[item.id];

            return (
              <button
                className={activeScreen === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
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
        <header className="top-bar">
          <div>
            <span className="eyebrow">
              {PROJECT_NAME} · {copy.appSubtitle}
            </span>
            <h1>{activeTitle}</h1>
          </div>
          <div className="status-strip">
            <Chip label="nvm-sh" tone="info" />
            <Chip label={`${copy.status.current} v22.11.0`} tone="success" />
            <Chip label={`${copy.status.default} v20.18.1`} tone="warning" />
          </div>
        </header>
        {renderScreen()}
      </section>
    </main>
  );
}

export default App;
