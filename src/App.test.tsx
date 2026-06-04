import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MOCK_BACKEND_SNAPSHOT } from "./shared/api/backend";
import type {
  BackendInstallGuide,
  CommandResult,
  EnvironmentSummary,
  InstallTaskSnapshot,
  ProjectVersionInfo,
  VersionInfo,
} from "./shared/types/backend";

const getBackendSnapshotMock = vi.hoisted(() => vi.fn());
const getBackendInstallGuideMock = vi.hoisted(() => vi.fn());
const detectBackendMock = vi.hoisted(() => vi.fn());
const healthCheckMock = vi.hoisted(() => vi.fn());
const activateVersionMock = vi.hoisted(() => vi.fn());
const installVersionMock = vi.hoisted(() => vi.fn());
const startInstallBackendTaskMock = vi.hoisted(() => vi.fn());
const startInstallVersionTaskMock = vi.hoisted(() => vi.fn());
const getInstallVersionTaskMock = vi.hoisted(() => vi.fn());
const cancelInstallVersionTaskMock = vi.hoisted(() => vi.fn());
const listRemoteMock = vi.hoisted(() => vi.fn());
const readProjectVersionMock = vi.hoisted(() => vi.fn());
const setDefaultVersionMock = vi.hoisted(() => vi.fn());
const uninstallVersionMock = vi.hoisted(() => vi.fn());
const takeManualUiCommandMock = vi.hoisted(() => vi.fn());
const writeManualUiCommandResultMock = vi.hoisted(() => vi.fn());
const writeManualUiSnapshotMock = vi.hoisted(() => vi.fn());
const writeProjectVersionMock = vi.hoisted(() => vi.fn());
const writeTextMock = vi.hoisted(() => vi.fn());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

vi.mock("./shared/api/backend", async () => {
  const actual = await vi.importActual<typeof import("./shared/api/backend")>("./shared/api/backend");

  return {
    ...actual,
    activateVersion: activateVersionMock,
    cancelInstallVersionTask: cancelInstallVersionTaskMock,
    detectBackend: detectBackendMock,
    getBackendInstallGuide: getBackendInstallGuideMock,
    getBackendSnapshot: getBackendSnapshotMock,
    getInstallVersionTask: getInstallVersionTaskMock,
    healthCheck: healthCheckMock,
    installVersion: installVersionMock,
    listRemote: listRemoteMock,
    readProjectVersion: readProjectVersionMock,
    setDefaultVersion: setDefaultVersionMock,
    startInstallBackendTask: startInstallBackendTaskMock,
    startInstallVersionTask: startInstallVersionTaskMock,
    takeManualUiCommand: takeManualUiCommandMock,
    uninstallVersion: uninstallVersionMock,
    writeManualUiCommandResult: writeManualUiCommandResultMock,
    writeManualUiSnapshot: writeManualUiSnapshotMock,
    writeProjectVersion: writeProjectVersionMock,
  };
});

describe("App", () => {
  beforeEach(() => {
    let installTaskSequence = 0;
    const installTaskStates = new Map<string, InstallTaskSnapshot & { label: string }>();

    localStorage.clear();
    localStorage.setItem("nodepilot.locale", "en-US");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
    writeTextMock.mockReset();
    writeTextMock.mockResolvedValue(undefined);
    getBackendSnapshotMock.mockReset();
    getBackendSnapshotMock.mockResolvedValue(MOCK_BACKEND_SNAPSHOT);
    detectBackendMock.mockReset();
    detectBackendMock.mockResolvedValue(null);
    getBackendInstallGuideMock.mockReset();
    getBackendInstallGuideMock.mockResolvedValue({
      backendKind: "nvm-sh",
      installKind: "script",
      displayName: "nvm-sh",
      officialSourceLabel: "nvm-sh README (v0.40.4)",
      officialSourceUrl: "https://github.com/nvm-sh/nvm#installing-and-updating",
      installScriptUrl: "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh",
      installCommand:
        "if command -v curl >/dev/null 2>&1; then curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash; fi",
      installerUrl: null,
      targetPath: "~/.nvm",
      requiresAdmin: false,
      postInstallSteps: [
        "Open a new shell after the installer updates your profile, or source the updated profile manually.",
      ],
      detectionHint: "If nvm is still missing, source your shell profile and refresh detection again.",
    } satisfies BackendInstallGuide);
    healthCheckMock.mockReset();
    healthCheckMock.mockResolvedValue(MOCK_BACKEND_SNAPSHOT.health);
    activateVersionMock.mockReset();
    activateVersionMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<null>);
    installVersionMock.mockReset();
    installVersionMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<null>);
    startInstallBackendTaskMock.mockReset();
    startInstallBackendTaskMock.mockImplementation(async () => {
      const taskId = `install-task-${(installTaskSequence += 1)}`;
      const snapshot: InstallTaskSnapshot & { label: string } = {
        taskId,
        status: "running",
        stdout: "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash\n",
        stderr: "",
        exitCode: null,
        message: null,
        cancelRequested: false,
        label: "backend",
      };
      installTaskStates.set(taskId, snapshot);
      return snapshot;
    });
    startInstallVersionTaskMock.mockReset();
    startInstallVersionTaskMock.mockImplementation(async (options: { version: string }) => {
      const taskId = `install-task-${(installTaskSequence += 1)}`;
      const snapshot: InstallTaskSnapshot & { label: string } = {
        taskId,
        status: "running",
        stdout: `nvm install ${options.version}\n`,
        stderr: "",
        exitCode: null,
        message: null,
        cancelRequested: false,
        label: options.version,
      };
      installTaskStates.set(taskId, snapshot);
      return snapshot;
    });
    getInstallVersionTaskMock.mockReset();
    getInstallVersionTaskMock.mockImplementation(async (taskId: string) => {
      const current = installTaskStates.get(taskId);
      if (!current) return null;
      if (current.status === "running" && !current.cancelRequested) {
        const next: InstallTaskSnapshot & { label: string } = {
          ...current,
          status: "success",
          stdout: `${current.stdout}installed ${current.label}\n`,
          exitCode: 0,
          message: null,
        };
        installTaskStates.set(taskId, next);
        return next;
      }
      return current;
    });
    cancelInstallVersionTaskMock.mockReset();
    cancelInstallVersionTaskMock.mockImplementation(async (taskId: string) => {
      const current = installTaskStates.get(taskId);
      if (!current) return null;
      const next: InstallTaskSnapshot & { label: string } = {
        ...current,
        status: "cancelled",
        cancelRequested: true,
        message: "Install task cancelled.",
      };
      installTaskStates.set(taskId, next);
      return next;
    });
    listRemoteMock.mockReset();
    listRemoteMock.mockResolvedValue({
      status: "success",
      data: [],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);
    readProjectVersionMock.mockReset();
    setDefaultVersionMock.mockReset();
    setDefaultVersionMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<null>);
    uninstallVersionMock.mockReset();
    uninstallVersionMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<null>);
    takeManualUiCommandMock.mockReset();
    takeManualUiCommandMock.mockResolvedValue(null);
    writeManualUiCommandResultMock.mockReset();
    writeManualUiCommandResultMock.mockResolvedValue(undefined);
    writeManualUiSnapshotMock.mockReset();
    writeManualUiSnapshotMock.mockResolvedValue(undefined);
    writeProjectVersionMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("renders the NodePilot management shell", async () => {
    render(<App />);

    expect(screen.getByLabelText("NodePilot")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    });
    expect(screen.getAllByText("nvm-sh").length).toBeGreaterThan(0);
  });

  it("uses the persisted locale and theme", () => {
    localStorage.setItem("nodepilot.locale", "en-US");
    localStorage.setItem("nodepilot.theme", "dark");

    const { container } = render(<App />);

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveAttribute("data-theme", "dark");
  });

  it("renders the backend snapshot on Home", async () => {
    const snapshot: EnvironmentSummary = {
      ...MOCK_BACKEND_SNAPSHOT,
      currentNodeVersion: "v18.20.4",
      npmVersion: "10.7.0",
      pnpmVersion: null,
      backendKind: "nvm-windows",
      arch: "x64",
      versionSource: "nvm-windows",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "nvm-windows",
        items: [
          {
            key: "admin_required",
            status: "pending",
            summary: "Windows activation may require administrator permissions",
            detail: null,
          },
        ],
      },
    };
    getBackendSnapshotMock.mockResolvedValueOnce(snapshot);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v18.20.4" })).toBeInTheDocument();
    });
    expect(screen.getAllByText("nvm-windows").length).toBeGreaterThan(0);
    expect(screen.getByText("10.7.0")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "Platform: macos / x64"),
    ).toBeInTheDocument();
    expect(screen.getByText("Windows activation may require administrator permissions")).toBeInTheDocument();
    expect(screen.getByText("Check administrator rights")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Windows version switching may require rerunning with administrator permissions or handling the change manually.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a Home health check when the selected .nvmrc version is not installed", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "website",
          projectDir: "/tmp/website",
          nvmrcPath: "/tmp/website/.nvmrc",
          rawContent: "v20.18.1\n",
          version: "v20.18.1",
          isValid: true,
          isInstalled: false,
          inherited: false,
          message: ".nvmrc points to a Node version that is not installed locally",
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    });
    expect(screen.getByText(".nvmrc requires v20.18.1, but it is not installed locally.")).toBeInTheDocument();
  });

  it("shows Apple Silicon legacy Node risk in Home diagnostics", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      currentNodeVersion: "v14.21.3",
      defaultVersion: "v12.22.12",
      defaultExists: true,
      defaultMatchesCurrent: false,
      arch: "arm64",
      platform: "macos",
      health: {
        backend: "nvm-sh",
        items: [
          {
            key: "nvm_script",
            status: "success",
            summary: "~/.nvm/nvm.sh detected",
            detail: "~/.nvm/nvm.sh",
          },
          {
            key: "profile_.zshrc",
            status: "success",
            summary: ".zshrc loads nvm",
            detail: "~/.zshrc",
          },
          {
            key: "apple_silicon_legacy_node",
            status: "failed",
            summary: "Apple Silicon may require Rosetta 2 or source builds for Node versions before v16",
            detail: "current v14.21.3, default v12.22.12",
          },
        ],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v14.21.3" })).toBeInTheDocument();
    });
    expect(
      screen.getByText("Apple Silicon may require Rosetta 2 or source builds for Node versions before v16"),
    ).toBeInTheDocument();
    expect(screen.getByText("current v14.21.3, default v12.22.12")).toBeInTheDocument();
  });

  it("recommends applying the project version when .nvmrc differs from the active version", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "website",
          projectDir: "/tmp/website",
          nvmrcPath: "/tmp/website/.nvmrc",
          rawContent: "v20.18.1\n",
          version: "v20.18.1",
          isValid: true,
          isInstalled: true,
          inherited: false,
          message: null,
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    });
    expect(screen.getByText("Apply project version")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The current `.nvmrc` target differs from the active version. Switch to the Node version required by this project.",
      ),
    ).toBeInTheDocument();
  });

  it("recommends rerunning with administrator permissions when Windows activation is blocked", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "nvm-windows",
      versionSource: "nvm-windows",
      health: {
        backend: "nvm-windows",
        items: [
          {
            key: "admin_required",
            status: "failed",
            summary: "Windows activation requires running the app as administrator",
            detail: "nvm-windows `use` can fail without an elevated process.",
          },
        ],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Check administrator rights")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Windows version switching may require rerunning with administrator permissions or handling the change manually.",
      ),
    ).toBeInTheDocument();
  });

  it("recommends fixing PATH when Windows still has legacy Node installations", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "nvm-windows",
      versionSource: "nvm-windows",
      defaultVersion: "v22.11.0",
      defaultExists: true,
      defaultMatchesCurrent: true,
      health: {
        backend: "nvm-windows",
        items: [
          {
            key: "windows_node_install_conflict",
            status: "pending",
            summary: "PATH still contains additional Node installations after the nvm-windows managed symlink",
            detail: "managed paths:\nC:\\Users\\me\\AppData\\Roaming\\nvm\nC:\\Program Files\\nodejs",
          },
        ],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Copy PATH fix")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "PATH still contains additional Node installations after the nvm-windows managed symlink",
      ),
    ).toBeInTheDocument();
  });

  it("renders default-packages in Settings", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "default-packages" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("~/.nvm/default-packages")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          (element.textContent?.includes("pnpm\ntypescript\ntsx") ?? false),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Read only").length).toBeGreaterThan(0);
  });

  it("renders missing default-packages state in Settings", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      defaultPackagesPath: "~/.nvm/default-packages",
      defaultPackagesExists: false,
      defaultPackagesEntries: [],
    } satisfies EnvironmentSummary);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));

    await waitFor(() => {
      expect(screen.getByText("default-packages file not detected")).toBeInTheDocument();
    });
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("renders missing backend and PATH conflict recommendations", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_script",
            status: "failed",
            summary: "~/.nvm/nvm.sh is missing",
            detail: null,
          },
          {
            key: "node_path_source",
            status: "failed",
            summary: "Node PATH does not appear to come from the detected backend",
            detail: "/usr/local/bin/node",
          },
        ],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Install nvm")).toBeInTheDocument();
    });
    expect(screen.getByText("Copy PATH fix")).toBeInTheDocument();
    expect(screen.getByText("Current Node is not managed by nvm. Check PATH ordering.")).toBeInTheDocument();
  });

  it("renders backend install guide when nvm is missing", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_script",
            status: "failed",
            summary: "~/.nvm/nvm.sh is missing",
            detail: null,
          },
        ],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    const heading = await screen.findByRole("heading", { name: "Missing nvm backend" });
    const panel = heading.closest(".panel");
    expect(panel).not.toBeNull();
    await waitFor(() => {
      expect(within(panel as HTMLElement).getAllByText("nvm-sh").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("nvm-sh README (v0.40.4)")).toBeInTheDocument();
    expect(screen.getByText("https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh")).toBeInTheDocument();
    expect(screen.getByText("~/.nvm")).toBeInTheDocument();
    expect(screen.getAllByText("No administrator rights required").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Open a new shell after the installer updates your profile, or source the updated profile manually."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("If nvm is still missing, source your shell profile and refresh detection again."),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "PRE" &&
        (element.textContent?.includes("install.sh") ?? false),
      ),
    ).toBeInTheDocument();
  });

  it("renders the Windows backend install guide when nvm is missing", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_exe",
            status: "failed",
            summary: "nvm.exe is missing",
            detail: null,
          },
        ],
      },
    } satisfies EnvironmentSummary);
    getBackendInstallGuideMock.mockResolvedValueOnce({
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
    } satisfies BackendInstallGuide);

    render(<App />);

    const heading = await screen.findByRole("heading", { name: "Missing nvm backend" });
    const panel = heading.closest(".panel");
    expect(panel).not.toBeNull();
    await waitFor(() => {
      expect(within(panel as HTMLElement).getAllByText("nvm-windows").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("nvm-windows releases (1.2.2)")).toBeInTheDocument();
    expect(screen.getByText("https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe")).toBeInTheDocument();
    expect(screen.getByText("%TEMP%\\nodepilot-nvm-setup.exe")).toBeInTheDocument();
    expect(screen.getAllByText("Administrator required").length).toBeGreaterThan(0);
    expect(screen.getByText("Complete the installer UI. NodePilot does not perform a silent installation.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Install backend" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("https://github.com/coreybutler/nvm-windows/releases")).toBeInTheDocument();
    expect(within(dialog).getByText("https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe")).toBeInTheDocument();
  });

  it("starts backend install from Home and refreshes detection after success", async () => {
    const missingSnapshot: EnvironmentSummary = {
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_script",
            status: "failed",
            summary: "~/.nvm/nvm.sh is missing",
            detail: null,
          },
        ],
      },
    };
    getBackendSnapshotMock
      .mockResolvedValueOnce(missingSnapshot)
      .mockResolvedValueOnce({
        ...MOCK_BACKEND_SNAPSHOT,
        backendKind: "nvm-sh",
        versionSource: "nvm-sh",
      } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Install backend" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install backend" }));

    const dialog = await screen.findByRole("dialog");
    expect(startInstallBackendTaskMock).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        "NodePilot will run the official install flow for this platform and capture stdout, stderr, and the exit code in Activity.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("https://github.com/nvm-sh/nvm#installing-and-updating")).toBeInTheDocument();
    expect(within(dialog).getByText("https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh")).toBeInTheDocument();
    expect(within(dialog).getByText("~/.nvm")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Open a new shell after the installer updates your profile, or source the updated profile manually.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Install backend" }));

    await waitFor(() => {
      expect(startInstallBackendTaskMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Missing nvm backend" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));
    await waitFor(() => {
      expect(screen.getByText("Install nvm")).toBeInTheDocument();
    });
    const installTask = screen.getByText("Install nvm").closest(".activity-card");
    expect(installTask).not.toBeNull();
    expect(within(installTask as HTMLElement).getByText("Success")).toBeInTheDocument();
    expect(
      within(installTask as HTMLElement).getByText(
        (_, element) =>
          element?.tagName === "PRE" && (element.textContent?.includes("installed backend") ?? false),
      ),
    ).toBeInTheDocument();
  });

  it("refreshes detection after Windows backend install succeeds", async () => {
    const missingSnapshot: EnvironmentSummary = {
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_exe",
            status: "failed",
            summary: "nvm.exe is missing",
            detail: null,
          },
        ],
      },
    };
    getBackendSnapshotMock
      .mockResolvedValueOnce(missingSnapshot)
      .mockResolvedValueOnce({
        ...MOCK_BACKEND_SNAPSHOT,
        backendKind: "nvm-windows",
        versionSource: "nvm-windows",
      } satisfies EnvironmentSummary);
    getBackendInstallGuideMock.mockResolvedValueOnce({
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
    } satisfies BackendInstallGuide);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("nvm-windows releases (1.2.2)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install backend" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Install backend" }));

    await waitFor(() => {
      expect(startInstallBackendTaskMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Missing nvm backend" })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("nvm-windows").length).toBeGreaterThan(0);
  });

  it("surfaces a Windows PATH warning when backend install finishes but nvm.exe is still missing", async () => {
    const missingSnapshot: EnvironmentSummary = {
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_exe",
            status: "failed",
            summary: "nvm.exe is missing",
            detail: null,
          },
        ],
      },
    };
    getBackendSnapshotMock.mockResolvedValue(missingSnapshot);
    getBackendInstallGuideMock.mockResolvedValueOnce({
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
    } satisfies BackendInstallGuide);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("nvm-windows releases (1.2.2)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install backend" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Install backend" }));

    await waitFor(() => {
      expect(startInstallBackendTaskMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        screen.getByText(
          "The installer finished, but `nvm.exe` is still not available on PATH. If nvm is still missing after the installer exits, reopen PowerShell or Command Prompt and verify `nvm version` manually.",
        ),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getByText("Install nvm")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
    expect(screen.getByText("The installer finished, but `nvm.exe` is still not available on PATH.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "If nvm is still missing after the installer exits, reopen PowerShell or Command Prompt and verify `nvm version` manually.",
      ),
    ).toBeInTheDocument();
  });

  it("records backend install failures with logs and recommendation", async () => {
    const missingSnapshot: EnvironmentSummary = {
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_script",
            status: "failed",
            summary: "~/.nvm/nvm.sh is missing",
            detail: null,
          },
        ],
      },
    };
    getBackendSnapshotMock.mockResolvedValue(missingSnapshot);
    startInstallBackendTaskMock.mockResolvedValueOnce({
      taskId: "install-task-backend-failed",
      status: "running",
      stdout: "curl install.sh\n",
      stderr: "",
      exitCode: null,
      message: null,
      cancelRequested: false,
    } satisfies InstallTaskSnapshot);
    getInstallVersionTaskMock.mockResolvedValueOnce({
      taskId: "install-task-backend-failed",
      status: "failed",
      stdout: "curl install.sh\n",
      stderr: "profile not writable",
      exitCode: 1,
      message: "command failed: nvm install script",
      cancelRequested: false,
    } satisfies InstallTaskSnapshot);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Install backend" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Install backend" }));
    fireEvent.click((await screen.findByRole("dialog")).querySelector("button.button-primary") as HTMLButtonElement);

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getByText("Install nvm")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
    const installTask = screen.getByText("Install nvm").closest(".activity-card");
    expect(installTask).not.toBeNull();
    expect(screen.getByText(/Recommended fix:/)).toBeInTheDocument();
    expect(screen.getByText("If nvm is still missing, source your shell profile and refresh detection again.")).toBeInTheDocument();
    expect(screen.getByText("Exit code 1")).toBeInTheDocument();
    expect(
      within(installTask as HTMLElement).getByText(
        (_, element) => element?.tagName === "PRE" && (element.textContent?.includes("curl install.sh") ?? false),
      ),
    ).toBeInTheDocument();
    expect(
      within(installTask as HTMLElement).getByText(
        (_, element) =>
          element?.tagName === "PRE" && (element.textContent?.includes("profile not writable") ?? false),
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(installTask as HTMLElement).getByRole("button", { name: "Copy logs" }));
    const copiedLog = writeTextMock.mock.calls[writeTextMock.mock.calls.length - 1]?.[0] as string;
    expect(copiedLog).toContain("Install nvm");
    expect(copiedLog).toContain("curl install.sh");
    expect(copiedLog).toContain("profile not writable");
  });

  it("renders Settings diagnostics for permission and path issues", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "nvm-windows",
      health: {
        backend: "nvm-windows",
        items: [
          {
            key: "admin_required",
            status: "pending",
            summary: "Windows activation may require administrator permissions",
            detail: null,
          },
          {
            key: "node_path_source",
            status: "failed",
            summary: "Node PATH does not appear to come from the detected backend",
            detail: "/usr/local/bin/node",
          },
        ],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Environment diagnostics" })).toBeInTheDocument();
    });
    expect(screen.getByText("Windows activation may require administrator permissions")).toBeInTheDocument();
    expect(screen.getByText("Node PATH does not appear to come from the detected backend")).toBeInTheDocument();
    expect(screen.getByText("/usr/local/bin/node")).toBeInTheDocument();
  });

  it("renders installed versions from the backend snapshot", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      defaultVersion: "v21.7.3",
      installedVersions: [
        {
          version: "v21.7.3",
          npmVersion: null,
          path: null,
          arch: "arm64",
          isCurrent: true,
          isDefault: false,
          isLts: false,
          isSystem: false,
          line: null,
        },
        {
          version: "system",
          npmVersion: "9.8.1",
          path: "/usr/local/bin/node",
          arch: "x64",
          isCurrent: false,
          isDefault: false,
          isLts: false,
          isSystem: true,
          line: null,
        },
      ],
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    expect(screen.getByRole("heading", { name: "v21.7.3" })).toBeInTheDocument();
    expect(screen.getAllByText("Not detected").length).toBeGreaterThan(0);
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "v18.20.4" })).not.toBeInTheDocument();
  });

  it("writes a manual ui snapshot when manual verification mode is enabled", async () => {
    vi.stubEnv("VITE_NODEPILOT_MANUAL_UI_SNAPSHOT", "1");

    render(<App />);

    await waitFor(() => {
      expect(writeManualUiSnapshotMock).toHaveBeenCalled();
    });

    const matchingSnapshot = writeManualUiSnapshotMock.mock.calls
      .map(([snapshot]) => snapshot)
      .find(
        (snapshot) =>
          snapshot?.schemaVersion === 1 &&
          snapshot?.app?.screen === "home" &&
          snapshot?.app?.backendKind === "nvm-sh" &&
          Array.isArray(snapshot?.elements) &&
          snapshot.elements.some((element: { role?: string }) => element.role === "button"),
      );

    expect(matchingSnapshot).toBeDefined();
  });

  it("executes a manual ui navigate command and writes the observed result", async () => {
    vi.stubEnv("VITE_NODEPILOT_MANUAL_UI_SNAPSHOT", "1");
    takeManualUiCommandMock
      .mockResolvedValueOnce({
        id: "cmd-1",
        kind: "navigate",
        screen: "versions",
      })
      .mockResolvedValue(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Installed versions" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(writeManualUiCommandResultMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "cmd-1",
          kind: "navigate",
          status: "success",
          screen: "versions",
        }),
      );
    });
  });

  it("keeps an unsupported empty snapshot when backend refresh fails in Tauri", async () => {
    getBackendSnapshotMock.mockRejectedValueOnce(new Error("environment_summary failed"));
    detectBackendMock.mockResolvedValueOnce(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node Not detected" })).toBeInTheDocument();
    });

    expect(screen.getAllByText("unsupported").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    expect(screen.getByText("No installed Node versions yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Once a supported nvm backend is detected, local Node installs appear here. Install a version from Remote first, then return here to switch and manage it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use version Not detected" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set default Not detected" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Uninstall Not detected" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getAllByText("environment_summary failed").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  });

  it("auto-loads the preset manual project directory when manual mode provides one", async () => {
    vi.stubEnv("VITE_NODEPILOT_MANUAL_UI_SNAPSHOT", "1");
    vi.stubEnv("VITE_NODEPILOT_MANUAL_PROJECT_DIR", "/tmp/manual-project");
    readProjectVersionMock.mockResolvedValueOnce({
      status: "success",
      data: {
        projectDir: "/tmp/manual-project",
        nvmrcPath: "/tmp/manual-project/.nvmrc",
        rawContent: "v24.16.0\n",
        version: "v24.16.0",
        isValid: true,
        isInstalled: true,
        inherited: false,
        message: null,
      },
      stdout: "resolved .nvmrc",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<ProjectVersionInfo>);

    render(<App />);

    await waitFor(() => {
      expect(readProjectVersionMock).toHaveBeenCalledWith("/tmp/manual-project");
    });
  });

  it("renders damaged and missing version states from the backend snapshot", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      installedVersions: [
        {
          version: "v22.11.0",
          npmVersion: null,
          path: null,
          arch: "arm64",
          state: "damaged",
          isCurrent: true,
          isDefault: false,
          isLts: true,
          isSystem: false,
          line: "Jod",
        },
        {
          version: "v20.18.1",
          npmVersion: null,
          path: null,
          arch: "arm64",
          state: "missing",
          isCurrent: false,
          isDefault: true,
          isLts: true,
          isSystem: false,
          line: "Iron",
        },
      ],
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    expect(screen.getByRole("heading", { name: "v22.11.0" })).toBeInTheDocument();
    expect(screen.getByText("Damaged")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("shows the Windows symlink notice in Versions for nvm-windows", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "nvm-windows",
      versionSource: "nvm-windows",
      health: {
        backend: "nvm-windows",
        items: [],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("nvm-windows").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    expect(
      screen.getByText(
        "On Windows, nvm use updates the global symlink and version switching may require administrator permissions.",
      ),
    ).toBeInTheDocument();
  });

  it("renders remote versions from the backend command", async () => {
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "v22.11.0" })).toBeInTheDocument();
    expect(screen.getByText("LTS Jod")).toBeInTheDocument();
    expect(screen.getAllByText("Latest").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Installed").length).toBeGreaterThan(0);
    expect(listRemoteMock).toHaveBeenCalledTimes(1);
  });

  it("filters and searches remote versions", async () => {
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });

    const filterGroup = screen.getByLabelText("Available Node releases");

    fireEvent.click(within(filterGroup).getByRole("button", { name: "Installed" }));
    expect(screen.getByRole("heading", { name: "v22.11.0" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "v20.18.1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "v24.4.1" })).not.toBeInTheDocument();

    fireEvent.click(within(filterGroup).getByRole("button", { name: "Latest" }));
    expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "v22.11.0" })).not.toBeInTheDocument();

    fireEvent.click(within(filterGroup).getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search v22, lts, latest" }), {
      target: { value: "iron" },
    });
    expect(screen.getByRole("heading", { name: "v20.18.1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "v24.4.1" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "All majors" }), {
      target: { value: "22" },
    });
    expect(screen.getByText("No remote releases match the current filters.")).toBeInTheDocument();
  });

  it("renders remote load failure", async () => {
    listRemoteMock.mockResolvedValueOnce({
      status: "failed",
      data: null,
      stdout: "",
      stderr: "network timeout",
      exitCode: 1,
      message: "Failed to load remote releases.",
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to load remote releases.")).toBeInTheDocument();
    });
  });

  it("installs latest, latest LTS, selected version, and latest patch for a major from Remote", async () => {
    const baseSnapshot: EnvironmentSummary = {
      ...MOCK_BACKEND_SNAPSHOT,
      currentNodeVersion: "v18.20.4",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      installedVersions: [
        {
          version: "v18.20.4",
          npmVersion: null,
          path: "~/.nvm/versions/node/v18.20.4/bin/node",
          arch: "arm64",
          isCurrent: true,
          isDefault: false,
          isLts: true,
          isSystem: false,
          line: "Hydrogen",
        },
      ],
    };
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
          version: "v22.10.0",
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    getBackendSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({
        ...baseSnapshot,
        installedVersions: [
          ...baseSnapshot.installedVersions,
          {
            version: "v24.4.1",
            npmVersion: null,
            path: "~/.nvm/versions/node/v24.4.1/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: false,
            isSystem: false,
            line: null,
          },
        ],
      } satisfies EnvironmentSummary)
      .mockResolvedValueOnce({
        ...baseSnapshot,
        installedVersions: [
          ...baseSnapshot.installedVersions,
          {
            version: "v24.4.1",
            npmVersion: null,
            path: "~/.nvm/versions/node/v24.4.1/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: false,
            isSystem: false,
            line: null,
          },
          {
            version: "v22.11.0",
            npmVersion: null,
            path: "~/.nvm/versions/node/v22.11.0/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: true,
            isSystem: false,
            line: "Jod",
          },
        ],
      } satisfies EnvironmentSummary)
      .mockResolvedValueOnce({
        ...baseSnapshot,
        installedVersions: [
          ...baseSnapshot.installedVersions,
          {
            version: "v24.4.1",
            npmVersion: null,
            path: "~/.nvm/versions/node/v24.4.1/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: false,
            isSystem: false,
            line: null,
          },
          {
            version: "v22.11.0",
            npmVersion: null,
            path: "~/.nvm/versions/node/v22.11.0/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: true,
            isSystem: false,
            line: "Jod",
          },
          {
            version: "v22.10.0",
            npmVersion: null,
            path: "~/.nvm/versions/node/v22.10.0/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: false,
            isSystem: false,
            line: null,
          },
        ],
      } satisfies EnvironmentSummary)
      .mockResolvedValue({
        ...baseSnapshot,
        installedVersions: [
          ...baseSnapshot.installedVersions,
          {
            version: "v24.4.1",
            npmVersion: null,
            path: "~/.nvm/versions/node/v24.4.1/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: false,
            isSystem: false,
            line: null,
          },
          {
            version: "v22.11.0",
            npmVersion: null,
            path: "~/.nvm/versions/node/v22.11.0/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: true,
            isSystem: false,
            line: "Jod",
          },
          {
            version: "v20.18.1",
            npmVersion: null,
            path: "~/.nvm/versions/node/v20.18.1/bin/node",
            arch: "arm64",
            isCurrent: false,
            isDefault: false,
            isLts: true,
            isSystem: false,
            line: "Iron",
          },
        ],
      } satisfies EnvironmentSummary);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));
    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(1, {
        version: "v24.4.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      });
    });
    await waitFor(() => {
      const latestCard = screen.getByRole("heading", { name: "v24.4.1" }).closest("article");
      expect(latestCard).not.toBeNull();
      expect(within(latestCard as HTMLElement).getByRole("button", { name: "Install v24.4.1" })).toHaveTextContent(
        "Installed",
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Install latest LTS" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest LTS" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm install" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));
    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(2, {
        version: "v22.11.0",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      });
    });
    await waitFor(() => {
      const latestLtsCard = screen.getByRole("heading", { name: "v22.11.0" }).closest("article");
      expect(latestLtsCard).not.toBeNull();
      expect(within(latestLtsCard as HTMLElement).getByRole("button", { name: "Install v22.11.0" })).toHaveTextContent(
        "Installed",
      );
    });
    await waitFor(() => {
      const v22100CardReady = screen.getByRole("heading", { name: "v22.10.0" }).closest("article");
      expect(v22100CardReady).not.toBeNull();
      expect(within(v22100CardReady as HTMLElement).getByRole("button", { name: "Install v22.10.0" })).not.toBeDisabled();
    });

    const v22100Card = screen.getByRole("heading", { name: "v22.10.0" }).closest("article");
    expect(v22100Card).not.toBeNull();
    fireEvent.click(within(v22100Card as HTMLElement).getByRole("button", { name: "Install v22.10.0" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm install" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));
    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(3, {
        version: "v22.10.0",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      });
    });
    await waitFor(() => {
      const v22100InstalledCard = screen.getByRole("heading", { name: "v22.10.0" }).closest("article");
      expect(v22100InstalledCard).not.toBeNull();
      expect(
        within(v22100InstalledCard as HTMLElement).getByRole("button", { name: "Install v22.10.0" }),
      ).toHaveTextContent("Installed");
    });

    fireEvent.change(screen.getByRole("combobox", { name: "All majors" }), {
      target: { value: "20" },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Install latest v20.x" })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Install latest v20.x" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm install" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));
    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(4, {
        version: "v20.18.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      });
    });
  });

  it("prevents duplicate remote installs while a write task is running", async () => {
    const runningSnapshot: InstallTaskSnapshot = {
      taskId: "install-task-running",
      status: "running",
      stdout: "nvm install v24.4.1\n",
      stderr: "",
      exitCode: null,
      message: null,
      cancelRequested: false,
    };
    let currentSnapshot = runningSnapshot;
    startInstallVersionTaskMock.mockResolvedValueOnce(runningSnapshot);
    getInstallVersionTaskMock.mockImplementation(async () => currentSnapshot);
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));

    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));
    expect(screen.getByText(/A write task is running/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel task" })).toBeInTheDocument();

    currentSnapshot = {
      ...runningSnapshot,
      status: "success",
      stdout: "installed v24.4.1",
      exitCode: 0,
      message: null,
    };

    await waitFor(() => {
      expect(screen.queryByText(/A write task is running/)).not.toBeInTheDocument();
    });
  });

  it("passes remote install options for current/default package migration and latest npm", async () => {
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Migrate global packages")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Migrate global packages"), {
      target: { value: "current" },
    });
    fireEvent.click(screen.getByLabelText("Install latest npm too"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));

    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(1, {
        version: "v24.4.1",
        arch: null,
        reinstallPackagesFrom: "v22.11.0",
        latestNpm: true,
        sourceInstall: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Install latest LTS" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest LTS" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Migrate global packages")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Migrate global packages"), {
      target: { value: "default" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));

    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(2, {
        version: "v22.11.0",
        arch: null,
        reinstallPackagesFrom: "v20.18.1",
        latestNpm: false,
        sourceInstall: false,
      });
    });
  });

  it("passes remote source install for nvm-sh", async () => {
    detectBackendMock.mockResolvedValueOnce({
      kind: "nvm-sh",
      capabilities: {
        canInstall: true,
        canUninstall: true,
        canActivate: true,
        canSetDefault: true,
        supportsAlias: true,
        supportsProjectNvmrc: true,
        supportsArchSelection: false,
        supportsProxy: true,
        supportsMirror: true,
        supportsSourceInstall: true,
        supportsOfflineInstall: false,
        requiresAdminForActivation: false,
      },
      nvmDir: "/Users/me/.nvm",
      executablePath: null,
      version: "0.40.4",
      root: null,
      symlinkPath: null,
      arch: "arm64",
      health: { backend: "nvm-sh", items: [] },
    });
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Build from source")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Build from source"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));

    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(1, {
        version: "v24.4.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: true,
      });
    });
  });

  it("passes remote install arch selection for nvm-windows", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "nvm-windows",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
    } satisfies EnvironmentSummary);
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getAllByText("nvm-windows").length).toBeGreaterThan(0);
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));
    expect(screen.queryByLabelText("Migrate global packages")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Build from source")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Architecture"), {
      target: { value: "64" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));

    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenNthCalledWith(1, {
        version: "v24.4.1",
        arch: "64",
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      });
    });
  });

  it("cancels a running remote install task from Activity", async () => {
    const runningSnapshot: InstallTaskSnapshot = {
      taskId: "install-task-cancel",
      status: "running",
      stdout: "nvm install v24.4.1\n",
      stderr: "",
      exitCode: null,
      message: null,
      cancelRequested: false,
    };
    let currentSnapshot = runningSnapshot;
    startInstallVersionTaskMock.mockResolvedValueOnce(runningSnapshot);
    getInstallVersionTaskMock.mockImplementation(async () => currentSnapshot);
    cancelInstallVersionTaskMock.mockImplementation(async () => {
      currentSnapshot = {
        ...currentSnapshot,
        status: "cancelled",
        cancelRequested: true,
        message: "Install task cancelled.",
      };
      return currentSnapshot;
    });
    listRemoteMock.mockResolvedValueOnce({
      status: "success",
      data: [
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
      ],
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<VersionInfo[]>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Remote" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "v24.4.1" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));

    await waitFor(() => {
      expect(startInstallVersionTaskMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel task" }));

    await waitFor(() => {
      expect(cancelInstallVersionTaskMock).toHaveBeenCalledWith("install-task-cancel");
    });
    await waitFor(() => {
      expect(screen.getByText("Cancelled")).toBeInTheDocument();
    });
  });

  it("edits and confirms .nvmrc writes", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "NodePilot",
          projectDir: "/tmp/nodepilot",
          nvmrcPath: "/tmp/nodepilot/.nvmrc",
          rawContent: "v22.11.0\n",
          version: "v22.11.0",
          isValid: true,
          isInstalled: true,
          inherited: false,
          message: null,
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );
    writeProjectVersionMock.mockResolvedValueOnce({
      status: "success",
      data: {
        projectDir: "/tmp/nodepilot",
        nvmrcPath: "/tmp/nodepilot/.nvmrc",
        rawContent: "v20.18.1\n",
        version: "v20.18.1",
        isValid: true,
        isInstalled: true,
        inherited: false,
        message: null,
      },
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<ProjectVersionInfo>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit .nvmrc" }));

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("Version value");
    fireEvent.change(input, { target: { value: "v20.18.1" } });

    const diffPreview = within(dialog).getByText(
      (_, element) =>
        element?.tagName === "PRE" &&
        (element.textContent?.includes("- v22.11.0") ?? false) &&
        (element.textContent?.includes("+ v20.18.1") ?? false),
    );
    expect(diffPreview).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm write" }));

    await waitFor(() => {
      expect(writeProjectVersionMock).toHaveBeenCalledWith("/tmp/nodepilot", "v20.18.1");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByText("v20.18.1").length).toBeGreaterThan(0);
  });

  it("creates a local .nvmrc override for inherited project config", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "website",
          projectDir: "/tmp/website/packages/app",
          nvmrcPath: "/tmp/website/.nvmrc",
          rawContent: "v22.11.0\n",
          version: "v22.11.0",
          isValid: true,
          isInstalled: true,
          inherited: true,
          message: null,
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );
    writeProjectVersionMock.mockResolvedValueOnce({
      status: "success",
      data: {
        projectDir: "/tmp/website/packages/app",
        nvmrcPath: "/tmp/website/packages/app/.nvmrc",
        rawContent: "v20.18.1\n",
        version: "v20.18.1",
        isValid: true,
        isInstalled: true,
        inherited: false,
        message: null,
      },
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<ProjectVersionInfo>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Create .nvmrc" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByDisplayValue("/tmp/website/packages/app/.nvmrc")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Version value"), {
      target: { value: "v20.18.1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm write" }));

    await waitFor(() => {
      expect(writeProjectVersionMock).toHaveBeenCalledWith("/tmp/website/packages/app", "v20.18.1");
    });
    expect(screen.getAllByText("/tmp/website/packages/app/.nvmrc").length).toBeGreaterThan(0);
  });

  it("applies .nvmrc version and copies the suggested command", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "service-api",
          projectDir: "/tmp/service-api",
          nvmrcPath: "/tmp/service-api/.nvmrc",
          rawContent: "v20.18.1\n",
          version: "v20.18.1",
          isValid: true,
          isInstalled: true,
          inherited: false,
          message: null,
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Projects" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply .nvmrc version" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy suggested command" }));
    expect(writeTextMock).toHaveBeenCalledWith("nvm use v20.18.1");

    fireEvent.click(screen.getByRole("button", { name: "Apply .nvmrc version" }));
    await waitFor(() => {
      expect(activateVersionMock).toHaveBeenCalledWith({
        version: "v20.18.1",
        arch: null,
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Current v20.18.1")).toBeInTheDocument();
    });
  });

  it("uses, sets default, and uninstalls versions through backend commands", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use version v20.18.1" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Use version v20.18.1" }));
    await waitFor(() => {
      expect(activateVersionMock).toHaveBeenCalledWith({
        version: "v20.18.1",
        arch: null,
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Current v20.18.1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Set default v22.11.0" }));
    await waitFor(() => {
      expect(setDefaultVersionMock).toHaveBeenCalledWith("v22.11.0");
    });
    expect(screen.getByText("Default v22.11.0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Uninstall v20.18.1" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(uninstallVersionMock).toHaveBeenCalledWith("v20.18.1");
    });
    expect(screen.queryByRole("heading", { name: "v20.18.1" })).not.toBeInTheDocument();
  });

  it("shows uninstall failure reason and recommendation when a version is still in use", async () => {
    uninstallVersionMock.mockResolvedValueOnce({
      status: "failed",
      data: null,
      stdout: "",
      stderr: "Version is currently in use by another process.",
      exitCode: 1,
      message: "command failed: nvm uninstall",
    } satisfies CommandResult<null>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Uninstall v20.18.1" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Uninstall v20.18.1" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(uninstallVersionMock).toHaveBeenCalledWith("v20.18.1");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "v20.18.1" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Failed to uninstall v20.18.1: the version still appears to be in use. Switch to another Node version first, then close shells or processes still using this version and try again.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));
    await waitFor(() => {
      expect(screen.getByText("Uninstall version")).toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
    expect(screen.getByText("Failed to uninstall v20.18.1: the version still appears to be in use.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Switch to another Node version first, then close shells or processes still using this version and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("installs the version requested by .nvmrc and refreshes project state", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "website",
          projectDir: "/tmp/website",
          nvmrcPath: "/tmp/website/.nvmrc",
          rawContent: "lts/*\n",
          version: "lts/*",
          isValid: true,
          isInstalled: false,
          inherited: false,
          message: null,
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );

    readProjectVersionMock.mockResolvedValueOnce({
      status: "success",
      data: {
        projectDir: "/tmp/website",
        nvmrcPath: "/tmp/website/.nvmrc",
        rawContent: "lts/*\n",
        version: "lts/*",
        isValid: true,
        isInstalled: true,
        inherited: false,
        message: null,
      },
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<ProjectVersionInfo>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Install .nvmrc version" }));

    await waitFor(() => {
      expect(installVersionMock).toHaveBeenCalledWith({
        version: "lts/*",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      });
    });
    await waitFor(() => {
      expect(readProjectVersionMock).toHaveBeenCalledWith("/tmp/website");
    });
    expect(screen.getAllByText("Version installed").length).toBeGreaterThan(0);
  });

  it("renders initial detect and remote tasks in Activity", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getByText("Detect environment")).toBeInTheDocument();
    });
    expect(screen.getByText("Health check")).toBeInTheDocument();
    expect(screen.getByText("Remote refresh")).toBeInTheDocument();
    expect(screen.getAllByText("Success").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("stdout").length).toBeGreaterThan(0);
    expect(screen.getAllByText("stderr").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Exit code 0").length).toBeGreaterThan(0);

    const remoteTask = screen.getByText("Remote refresh").closest("article");
    expect(remoteTask).not.toBeNull();
    fireEvent.click(within(remoteTask as HTMLElement).getByRole("button", { name: "Copy logs" }));
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedLog = writeTextMock.mock.calls[0][0] as string;
    expect(copiedLog).toContain("Remote refresh");
    expect(copiedLog).toContain("versions=0");

    fireEvent.click(screen.getAllByRole("button", { name: "Collapse logs" })[0]);

    expect(screen.getByRole("button", { name: "Expand logs" })).toBeInTheDocument();
  });

  it("records failed install tasks with redacted logs in Activity", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "website",
          projectDir: "/tmp/website",
          nvmrcPath: "/tmp/website/.nvmrc",
          rawContent: "lts/*\n",
          version: "lts/*",
          isValid: true,
          isInstalled: false,
          inherited: false,
          message: null,
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );
    installVersionMock.mockResolvedValueOnce({
      status: "failed",
      data: null,
      stdout: "Found .nvmrc with version lts/*\ntoken=abc123",
      stderr: "Requested version is not installed locally.\nAuthorization: Bearer abc",
      exitCode: 3,
      message: "Requested project version is not installed.",
    } satisfies CommandResult<null>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Install .nvmrc version" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getByText("Install version")).toBeInTheDocument();
    });
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Exit code 3")).toBeInTheDocument();
    expect(screen.getByText(/Recommended fix:/)).toBeInTheDocument();
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "PRE" && (element.textContent?.includes("token=[REDACTED]") ?? false),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          (element.textContent?.includes("authorization: [REDACTED]") ?? false),
      ),
    ).toBeInTheDocument();

    const installTask = screen.getByText("Install version").closest("article");
    expect(installTask).not.toBeNull();
    fireEvent.click(within(installTask as HTMLElement).getByRole("button", { name: "Copy logs" }));
    const copiedLog = writeTextMock.mock.calls[writeTextMock.mock.calls.length - 1]?.[0] as string;
    expect(copiedLog).toContain("token=[REDACTED]");
    expect(copiedLog).toContain("authorization: [REDACTED]");
    expect(copiedLog).not.toContain("abc123");
  });

  it("shows write lock while a version activation task is running", async () => {
    const activation = deferred<CommandResult<null>>();
    activateVersionMock.mockReturnValueOnce(activation.promise);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use version v20.18.1" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Use version v20.18.1" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getByText("Use version")).toBeInTheDocument();
    });
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText(/A write task is running/)).toBeInTheDocument();

    activation.resolve({
      status: "success",
      data: null,
      stdout: "using v20.18.1",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<null>);

    await waitFor(() => {
      expect(screen.queryByText(/A write task is running/)).not.toBeInTheDocument();
    });
  });

  it("records project .nvmrc read tasks in Activity", async () => {
    localStorage.setItem(
      "nodepilot.recentProjects",
      JSON.stringify([
        {
          name: "service-api",
          projectDir: "/tmp/service-api",
          nvmrcPath: "/tmp/service-api/.nvmrc",
          rawContent: "v20.18.1\n",
          version: "v20.18.1",
          isValid: true,
          isInstalled: true,
          inherited: false,
          message: null,
        } satisfies ProjectVersionInfo & { name: string },
      ]),
    );
    readProjectVersionMock.mockResolvedValueOnce({
      status: "success",
      data: {
        projectDir: "/tmp/service-api",
        nvmrcPath: "/tmp/service-api/.nvmrc",
        rawContent: "v20.18.1\n",
        version: "v20.18.1",
        isValid: true,
        isInstalled: true,
        inherited: false,
        message: null,
      },
      stdout: "resolved .nvmrc",
      stderr: "",
      exitCode: 0,
      message: null,
    } satisfies CommandResult<ProjectVersionInfo>);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getByText("Read .nvmrc")).toBeInTheDocument();
    });
    expect(readProjectVersionMock).toHaveBeenCalledWith("/tmp/service-api");
    const readTask = screen.getByText("Read .nvmrc").closest("article");
    expect(readTask).not.toBeNull();
    expect(within(readTask as HTMLElement).getByText("Success")).toBeInTheDocument();
  });
});
