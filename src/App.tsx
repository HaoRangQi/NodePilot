import { useMemo, useState } from "react";
import "./App.css";

type Screen = "home" | "versions" | "remote" | "projects" | "activity" | "settings";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

type Version = {
  version: string;
  npm: string;
  path: string;
  arch: string;
  status: string[];
};

type RemoteVersion = {
  version: string;
  line: string;
  status: string;
  installed: boolean;
};

type Project = {
  name: string;
  path: string;
  nvmrc: string;
  state: string;
};

type ActivityItem = {
  action: string;
  status: "Success" | "Failed" | "Running";
  time: string;
  command: string;
  output: string;
};

const navigation: Array<{ id: Screen; label: string; icon: string }> = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "versions", label: "Versions", icon: "▦" },
  { id: "remote", label: "Remote", icon: "⇣" },
  { id: "projects", label: "Projects", icon: "◇" },
  { id: "activity", label: "Activity", icon: "≡" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const localVersions: Version[] = [
  {
    version: "v22.11.0",
    npm: "10.9.0",
    path: "~/.nvm/versions/node/v22.11.0/bin/node",
    arch: "arm64",
    status: ["Current", "LTS"],
  },
  {
    version: "v20.18.1",
    npm: "10.8.2",
    path: "~/.nvm/versions/node/v20.18.1/bin/node",
    arch: "arm64",
    status: ["Default", "LTS"],
  },
  {
    version: "v18.20.4",
    npm: "10.7.0",
    path: "~/.nvm/versions/node/v18.20.4/bin/node",
    arch: "x64",
    status: ["Project"],
  },
  {
    version: "system",
    npm: "9.8.1",
    path: "/usr/local/bin/node",
    arch: "arm64",
    status: ["System", "Issue"],
  },
];

const remoteVersions: RemoteVersion[] = [
  { version: "v24.4.1", line: "Current", status: "Latest", installed: false },
  { version: "v22.11.0", line: "LTS Jod", status: "Installed", installed: true },
  { version: "v20.18.1", line: "LTS Iron", status: "Installed", installed: true },
  { version: "v18.20.4", line: "LTS Hydrogen", status: "Installed", installed: true },
  { version: "v16.20.2", line: "Maintenance", status: "Available", installed: false },
];

const projects: Project[] = [
  {
    name: "nvmUI",
    path: "~/Downloads/Projects/nvmUI",
    nvmrc: "v22.11.0",
    state: "Ready",
  },
  {
    name: "legacy-dashboard",
    path: "~/Work/legacy-dashboard",
    nvmrc: "v18.20.4",
    state: "Installed",
  },
  {
    name: "website",
    path: "~/Work/website",
    nvmrc: "lts/*",
    state: "Needs install",
  },
];

const activity: ActivityItem[] = [
  {
    action: "Health check",
    status: "Success",
    time: "14:08",
    command: "detect backend and current node",
    output: "backend=nvm-sh current=v22.11.0 default=v20.18.1",
  },
  {
    action: "Remote refresh",
    status: "Running",
    time: "14:06",
    command: "nvm ls-remote --no-colors",
    output: "Fetching Node release index from configured mirror...",
  },
  {
    action: "Apply project version",
    status: "Failed",
    time: "13:52",
    command: "nvm use",
    output: "Found .nvmrc with version lts/*\nRequested version is not installed locally.",
  },
];

function statusTone(label: string): Tone {
  if (["Current", "Default", "Ready", "Installed", "Success"].includes(label)) return "success";
  if (["Issue", "Failed", "Needs install"].includes(label)) return "danger";
  if (["Running", "Project", "Latest"].includes(label)) return "info";
  if (["System", "Available", "LTS"].includes(label)) return "warning";
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

function HomeScreen() {
  return (
    <section className="screen-grid">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">Current environment</span>
          <h1>Node v22.11.0</h1>
          <p>
            Running through <strong>nvm-sh</strong> on macOS arm64. Default version is
            <strong> v20.18.1</strong>; new shells will use the default alias.
          </p>
        </div>
        <div className="hero-actions">
          <button className="button-primary" type="button">
            Refresh
          </button>
          <button className="button-tonal" type="button">
            Apply project
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <article className="metric">
          <span>npm</span>
          <strong>10.9.0</strong>
          <small>~/.nvm/versions/node/v22.11.0/bin/npm</small>
        </article>
        <article className="metric">
          <span>Backend</span>
          <strong>nvm-sh</strong>
          <small>~/.nvm/nvm.sh detected</small>
        </article>
        <article className="metric">
          <span>Default</span>
          <strong>v20.18.1</strong>
          <small>Available locally</small>
        </article>
      </div>

      <article className="panel">
        <SectionHeader eyebrow="Health" title="Environment checks" />
        <div className="check-list">
          <div className="check-row">
            <Chip label="OK" tone="success" />
            <span>nvm is loaded from ~/.nvm/nvm.sh</span>
          </div>
          <div className="check-row">
            <Chip label="Issue" tone="danger" />
            <span>System Node is still earlier in PATH for some shells</span>
          </div>
          <div className="check-row">
            <Chip label="Warn" tone="warning" />
            <span>Project website requests lts/*, but latest LTS is not installed</span>
          </div>
        </div>
      </article>

      <article className="panel">
        <SectionHeader eyebrow="Next actions" title="Recommended fixes" />
        <div className="action-list">
          <button className="action-button" type="button">
            <span>Set v22.11.0 as default</span>
            <small>Align current and new shell behavior</small>
          </button>
          <button className="action-button" type="button">
            <span>Install latest LTS</span>
            <small>Required by ~/Work/website .nvmrc</small>
          </button>
          <button className="action-button" type="button">
            <span>Copy PATH fix</span>
            <small>Manual shell profile update</small>
          </button>
        </div>
      </article>
    </section>
  );
}

function VersionsScreen() {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow="Local" title="Installed versions" />
      <div className="table-panel">
        {localVersions.map((item) => (
          <article className="version-row" key={item.version}>
            <div>
              <h3>{item.version}</h3>
              <p>{item.path}</p>
            </div>
            <div className="chip-row">
              {item.status.map((status) => (
                <Chip key={status} label={status} tone={statusTone(status)} />
              ))}
            </div>
            <span className="mono">{item.npm}</span>
            <span>{item.arch}</span>
            <div className="row-actions">
              <button className="icon-button" type="button" aria-label={`Use ${item.version}`} title="Use version">
                ⇄
              </button>
              <button className="icon-button" type="button" aria-label={`Set ${item.version} as default`} title="Set default">
                ★
              </button>
              <button className="danger-button" type="button" aria-label={`Uninstall ${item.version}`} title="Confirm before uninstall">
                Uninstall
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RemoteScreen() {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow="Remote" title="Available Node releases" />
      <div className="toolbar">
        <button className="button-primary" type="button">
          Install latest LTS
        </button>
        <button className="button-tonal" type="button">
          Refresh remote
        </button>
        <div className="search-box">Search v22, lts, latest</div>
      </div>
      <div className="remote-grid">
        {remoteVersions.map((item) => (
          <article className="remote-card" key={item.version}>
            <div>
              <h3>{item.version}</h3>
              <p>{item.line}</p>
            </div>
            <Chip label={item.status} tone={statusTone(item.status)} />
            <button className={item.installed ? "button-muted" : "button-primary"} type="button">
              {item.installed ? "Installed" : "Install"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProjectsScreen() {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow="Projects" title=".nvmrc workspace status" />
      <div className="toolbar">
        <button className="button-primary" type="button">
          Choose directory
        </button>
        <button className="button-tonal" type="button">
          Create .nvmrc
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
            <Chip label={project.state} tone={statusTone(project.state)} />
            <button className="button-tonal" type="button">
              Apply
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ActivityScreen() {
  return (
    <section className="screen-stack">
      <SectionHeader eyebrow="Activity" title="Task log" />
      <div className="activity-list">
        {activity.map((item) => (
          <article className="activity-card" key={`${item.action}-${item.time}`}>
            <div className="activity-header">
              <div>
                <h3>{item.action}</h3>
                <p>{item.time} · {item.command}</p>
              </div>
              <Chip label={item.status} tone={statusTone(item.status)} />
            </div>
            <pre>{item.output}</pre>
            {item.status === "Failed" && (
              <div className="repair-note">
                Recommended: install the requested LTS line, then apply the project version again.
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsScreen() {
  return (
    <section className="screen-grid">
      <article className="panel">
        <SectionHeader eyebrow="Backend" title="nvm-sh detected" />
        <dl className="settings-list">
          <div>
            <dt>NVM_DIR</dt>
            <dd>~/.nvm</dd>
          </div>
          <div>
            <dt>Version store</dt>
            <dd>~/.nvm/versions/node</dd>
          </div>
          <div>
            <dt>Activation behavior</dt>
            <dd>Current task only; default alias affects new shells.</dd>
          </div>
        </dl>
      </article>
      <article className="panel">
        <SectionHeader eyebrow="Shell" title="Profile integration" />
        <div className="check-list">
          <div className="check-row">
            <Chip label="OK" tone="success" />
            <span>.zshrc loads nvm.sh</span>
          </div>
          <div className="check-row">
            <Chip label="Missing" tone="warning" />
            <span>.bash_profile has no nvm snippet</span>
          </div>
        </div>
      </article>
      <article className="panel">
        <SectionHeader eyebrow="Network" title="Mirror and proxy" />
        <dl className="settings-list">
          <div>
            <dt>Node mirror</dt>
            <dd>https://nodejs.org/dist</dd>
          </div>
          <div>
            <dt>Proxy</dt>
            <dd>Not configured</dd>
          </div>
        </dl>
      </article>
      <article className="panel">
        <SectionHeader eyebrow="Appearance" title="Theme" />
        <div className="segmented">
          <button className="selected" type="button">System</button>
          <button type="button">Light</button>
          <button type="button">Dark</button>
        </div>
      </article>
    </section>
  );
}

function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>("home");

  const activeTitle = useMemo(
    () => navigation.find((item) => item.id === activeScreen)?.label ?? "Home",
    [activeScreen],
  );

  function renderScreen() {
    switch (activeScreen) {
      case "versions":
        return <VersionsScreen />;
      case "remote":
        return <RemoteScreen />;
      case "projects":
        return <ProjectsScreen />;
      case "activity":
        return <ActivityScreen />;
      case "settings":
        return <SettingsScreen />;
      case "home":
      default:
        return <HomeScreen />;
    }
  }

  return (
    <main className="app-shell">
      <aside className="navigation-rail" aria-label="Primary navigation">
        <div className="brand-mark" aria-label="nvmUI">
          n
        </div>
        <nav>
          {navigation.map((item) => (
            <button
              className={activeScreen === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              title={item.label}
              type="button"
              aria-label={`Open ${item.label}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>
      </aside>

      <section className="content-shell">
        <header className="top-bar">
          <div>
            <span className="eyebrow">nvmUI prototype</span>
            <h1>{activeTitle}</h1>
          </div>
          <div className="status-strip">
            <Chip label="nvm-sh" tone="info" />
            <Chip label="Current v22.11.0" tone="success" />
            <Chip label="Default v20.18.1" tone="warning" />
          </div>
        </header>
        {renderScreen()}
      </section>
    </main>
  );
}

export default App;
