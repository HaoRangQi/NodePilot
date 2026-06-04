import { invoke } from "@tauri-apps/api/core";
import type {
  ActivateOptions,
  BackendDetection,
  BackendInstallGuide,
  CommandResult,
  EnvironmentSummary,
  HealthCheckResult,
  InstallOptions,
  InstallTaskSnapshot,
  ManualUiCommand,
  ManualUiCommandResult,
  ManualUiSnapshot,
  ProjectVersionInfo,
  VersionInfo,
} from "../types/backend";

export type BackendSnapshot = EnvironmentSummary;
export type BackendDetect = BackendDetection;

let mockInstallTaskSequence = 0;
const mockInstallTasks = new Map<string, InstallTaskSnapshot>();

const MOCK_NVM_SH_INSTALL_GUIDE: BackendInstallGuide = {
  backendKind: "nvm-sh",
  installKind: "script",
  displayName: "nvm-sh",
  officialSourceLabel: "nvm-sh README (v0.40.4)",
  officialSourceUrl: "https://github.com/nvm-sh/nvm#installing-and-updating",
  installScriptUrl: "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh",
  installCommand:
    "if command -v curl >/dev/null 2>&1; then curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash; elif command -v wget >/dev/null 2>&1; then wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash; else echo 'curl or wget is required to install nvm.' >&2; exit 1; fi",
  installerUrl: null,
  targetPath: "~/.nvm",
  requiresAdmin: false,
  postInstallSteps: [
    "Open a new shell after the installer updates your profile, or source the updated profile manually.",
    "Run `command -v nvm` to verify that the shell can load nvm.",
  ],
  detectionHint: "If nvm is still missing, source your shell profile and refresh detection again.",
};

const MOCK_NVM_WINDOWS_INSTALL_GUIDE: BackendInstallGuide = {
  backendKind: "nvm-windows",
  installKind: "external-installer",
  displayName: "nvm-windows",
  officialSourceLabel: "nvm-windows releases (1.2.2)",
  officialSourceUrl: "https://github.com/coreybutler/nvm-windows/releases",
  installScriptUrl: null,
  installCommand: "Download nvm-setup.exe to %TEMP% and run the interactive installer.",
  installerUrl: "https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe",
  targetPath: "%TEMP%\\nodepilot-nvm-setup.exe",
  requiresAdmin: true,
  postInstallSteps: [
    "Complete the installer UI. NodePilot does not perform a silent installation.",
    "After the installer exits, verify that `nvm.exe` is on PATH and refresh detection.",
  ],
  detectionHint:
    "If nvm is still missing after the installer exits, reopen PowerShell or Command Prompt and verify `nvm version` manually.",
};

export const MOCK_BACKEND_SNAPSHOT: EnvironmentSummary = {
  currentNodeVersion: "v22.11.0",
  npmVersion: "10.9.0",
  pnpmVersion: "9.12.3",
  yarnVersion: "1.22.22",
  nodePath: "~/.nvm/versions/node/v22.11.0/bin/node",
  npmPath: "~/.nvm/versions/node/v22.11.0/bin/npm",
  backendKind: "nvm-sh",
  platform: "macos",
  arch: "arm64",
  versionSource: "nvm-sh",
  defaultVersion: "v20.18.1",
  defaultExists: true,
  defaultMatchesCurrent: false,
  defaultPackagesPath: "~/.nvm/default-packages",
  defaultPackagesExists: true,
  defaultPackagesEntries: ["pnpm", "typescript", "tsx"],
  health: {
    backend: "nvm-sh",
    items: [
      {
        key: "nvm_script",
        status: "success",
        summary: "nvm loaded from ~/.nvm/nvm.sh",
        detail: "~/.nvm/nvm.sh",
      },
      {
        key: "node_path_source",
        status: "failed",
        summary: "System Node is still earlier in PATH for some shells",
        detail: "/usr/local/bin/node",
      },
      {
        key: "project_nvmrc",
        status: "pending",
        summary: "Project website requests lts/*, but latest LTS is not installed",
        detail: "~/Work/website/.nvmrc",
      },
    ],
  },
  installedVersions: [
    {
      version: "v22.11.0",
      npmVersion: "10.9.0",
      path: "~/.nvm/versions/node/v22.11.0/bin/node",
      arch: "arm64",
      isCurrent: true,
      isDefault: false,
      isLts: true,
      isSystem: false,
      line: "Jod",
    },
    {
      version: "v20.18.1",
      npmVersion: "10.8.2",
      path: "~/.nvm/versions/node/v20.18.1/bin/node",
      arch: "arm64",
      isCurrent: false,
      isDefault: true,
      isLts: true,
      isSystem: false,
      line: "Iron",
    },
  ],
};

export const MOCK_REMOTE_VERSIONS: VersionInfo[] = [
  {
    version: "v24.4.1",
    npmVersion: null,
    path: null,
    arch: null,
    isCurrent: false,
    isDefault: false,
    isLts: false,
    isSystem: false,
    line: null,
  },
  {
    version: "v22.11.0",
    npmVersion: null,
    path: null,
    arch: null,
    isCurrent: false,
    isDefault: false,
    isLts: true,
    isSystem: false,
    line: "Jod",
  },
  {
    version: "v20.18.1",
    npmVersion: null,
    path: null,
    arch: null,
    isCurrent: false,
    isDefault: false,
    isLts: true,
    isSystem: false,
    line: "Iron",
  },
  {
    version: "v18.20.4",
    npmVersion: null,
    path: null,
    arch: null,
    isCurrent: false,
    isDefault: false,
    isLts: true,
    isSystem: false,
    line: "Hydrogen",
  },
  {
    version: "v16.20.2",
    npmVersion: null,
    path: null,
    arch: null,
    isCurrent: false,
    isDefault: false,
    isLts: false,
    isSystem: false,
    line: null,
  },
];

export async function getBackendSnapshot(): Promise<EnvironmentSummary> {
  try {
    return await invoke<EnvironmentSummary>("environment_summary");
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    return MOCK_BACKEND_SNAPSHOT;
  }
}

export async function healthCheck(): Promise<HealthCheckResult> {
  try {
    return await invoke<HealthCheckResult>("health_check");
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    return MOCK_BACKEND_SNAPSHOT.health;
  }
}

export async function listRemote(): Promise<CommandResult<VersionInfo[]>> {
  try {
    return await invoke<CommandResult<VersionInfo[]>>("list_remote");
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    return {
      status: "success",
      data: MOCK_REMOTE_VERSIONS,
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    };
  }
}

export async function readProjectVersion(projectDir: string): Promise<CommandResult<ProjectVersionInfo>> {
  return await invoke<CommandResult<ProjectVersionInfo>>("read_project_version", { projectDir });
}

export async function writeProjectVersion(
  projectDir: string,
  version: string,
): Promise<CommandResult<ProjectVersionInfo>> {
  return await invoke<CommandResult<ProjectVersionInfo>>("write_project_version", {
    projectDir,
    version,
  });
}

export async function installVersion(options: InstallOptions): Promise<CommandResult<null>> {
  return await invoke<CommandResult<null>>("install_version", { options });
}

export async function getBackendInstallGuide(): Promise<BackendInstallGuide> {
  try {
    return await invoke<BackendInstallGuide>("backend_install_guide");
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    return mockBackendInstallGuide();
  }
}

export async function startInstallBackendTask(): Promise<InstallTaskSnapshot> {
  try {
    return await invoke<InstallTaskSnapshot>("start_install_backend_task");
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    const guide = mockBackendInstallGuide();
    const taskId = `mock-install-task-${(mockInstallTaskSequence += 1)}`;
    const command = guide.installCommand ?? guide.installerUrl ?? guide.officialSourceUrl;
    const running: InstallTaskSnapshot = {
      taskId,
      status: "running",
      stdout: `${command}\n`,
      stderr: "",
      exitCode: null,
      message: null,
      cancelRequested: false,
    };
    mockInstallTasks.set(taskId, running);
    window.setTimeout(() => {
      const current = mockInstallTasks.get(taskId);
      if (!current || current.status !== "running") return;
      mockInstallTasks.set(taskId, {
        ...current,
        status: "success",
        stdout: `${current.stdout}backend install finished\n`,
        exitCode: 0,
        message: null,
      });
    }, 120);
    return running;
  }
}

export async function startInstallVersionTask(options: InstallOptions): Promise<InstallTaskSnapshot> {
  try {
    return await invoke<InstallTaskSnapshot>("start_install_version_task", { options });
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    const taskId = `mock-install-task-${(mockInstallTaskSequence += 1)}`;
    const command = ["nvm", "install", options.sourceInstall ? "-s" : null, options.version]
      .filter(Boolean)
      .join(" ");
    const running: InstallTaskSnapshot = {
      taskId,
      status: "running",
      stdout: `${command}\n`,
      stderr: "",
      exitCode: null,
      message: null,
      cancelRequested: false,
    };
    mockInstallTasks.set(taskId, running);
    window.setTimeout(() => {
      const current = mockInstallTasks.get(taskId);
      if (!current || current.status !== "running") return;
      mockInstallTasks.set(taskId, {
        ...current,
        status: "success",
        stdout: `${current.stdout}installed ${options.version}\n`,
        exitCode: 0,
        message: null,
      });
    }, 120);
    return running;
  }
}

export async function getInstallVersionTask(taskId: string): Promise<InstallTaskSnapshot | null> {
  try {
    return await invoke<InstallTaskSnapshot | null>("get_install_version_task", { taskId });
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    return mockInstallTasks.get(taskId) ?? null;
  }
}

export async function cancelInstallVersionTask(taskId: string): Promise<InstallTaskSnapshot | null> {
  try {
    return await invoke<InstallTaskSnapshot | null>("cancel_install_version_task", { taskId });
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    const current = mockInstallTasks.get(taskId);
    if (!current) return null;
    const cancelled: InstallTaskSnapshot = {
      ...current,
      status: "cancelled",
      cancelRequested: true,
      exitCode: null,
      message: "Install task cancelled.",
    };
    mockInstallTasks.set(taskId, cancelled);
    return cancelled;
  }
}

export async function writeManualUiSnapshot(snapshot: ManualUiSnapshot): Promise<void> {
  await invoke("write_manual_ui_snapshot", { snapshot });
}

export async function takeManualUiCommand(): Promise<ManualUiCommand | null> {
  try {
    return await invoke<ManualUiCommand | null>("take_manual_ui_command");
  } catch (error) {
    if (isTauriUnavailableError(error)) {
      return null;
    }
    throw error;
  }
}

function isTauriUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not in tauri") ||
    normalized.includes("__tauri_internal") ||
    normalized.includes("window.__tauri_internal") ||
    normalized.includes("window.__tauri_invoke__ is not a function")
  );
}

export async function writeManualUiCommandResult(result: ManualUiCommandResult): Promise<void> {
  await invoke("write_manual_ui_command_result", { result });
}

export async function activateVersion(options: ActivateOptions): Promise<CommandResult<null>> {
  return await invoke<CommandResult<null>>("activate_version", { options });
}

export async function setDefaultVersion(version: string): Promise<CommandResult<null>> {
  return await invoke<CommandResult<null>>("set_default_version", { version });
}

export async function uninstallVersion(version: string): Promise<CommandResult<null>> {
  return await invoke<CommandResult<null>>("uninstall_version", { version });
}

export async function detectBackend(): Promise<BackendDetection | null> {
  try {
    return await invoke<BackendDetection>("detect_backend");
  } catch (error) {
    if (!isTauriUnavailableError(error)) {
      throw error;
    }
    return null;
  }
}

function mockBackendInstallGuide(): BackendInstallGuide {
  const platform = inferMockPlatform();
  return platform === "windows" ? MOCK_NVM_WINDOWS_INSTALL_GUIDE : MOCK_NVM_SH_INSTALL_GUIDE;
}

function inferMockPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("win")) return "windows";
  return "macos";
}
