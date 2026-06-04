import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateVersion,
  cancelInstallVersionTask,
  detectBackend,
  getBackendInstallGuide,
  getBackendSnapshot,
  getInstallVersionTask,
  healthCheck,
  installVersion,
  listRemote,
  MOCK_BACKEND_SNAPSHOT,
  MOCK_REMOTE_VERSIONS,
  readProjectVersion,
  setDefaultVersion,
  startInstallBackendTask,
  startInstallVersionTask,
  takeManualUiCommand,
  uninstallVersion,
  writeManualUiCommandResult,
  writeManualUiSnapshot,
  writeProjectVersion,
} from "./backend";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("backend API", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads the environment summary from Tauri", async () => {
    invokeMock.mockResolvedValue({
      currentNodeVersion: "v22.11.0",
      npmVersion: "10.9.0",
      pnpmVersion: "9.12.3",
      yarnVersion: null,
      nodePath: "/Users/me/.nvm/versions/node/v22.11.0/bin/node",
      npmPath: "/Users/me/.nvm/versions/node/v22.11.0/bin/npm",
      backendKind: "nvm-sh",
      platform: "macos",
      arch: "arm64",
      versionSource: "nvm-sh",
      defaultVersion: "v20.18.1",
      defaultExists: true,
      defaultMatchesCurrent: false,
      defaultPackagesPath: "/Users/me/.nvm/default-packages",
      defaultPackagesExists: true,
      defaultPackagesEntries: ["pnpm", "typescript"],
      health: { backend: "nvm-sh", items: [] },
      installedVersions: [],
    });

    await expect(getBackendSnapshot()).resolves.toMatchObject({
      currentNodeVersion: "v22.11.0",
      backendKind: "nvm-sh",
      arch: "arm64",
      defaultVersion: "v20.18.1",
    });
    expect(invokeMock).toHaveBeenCalledWith("environment_summary");
  });

  it("falls back to mock data when Tauri is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    await expect(getBackendSnapshot()).resolves.toEqual(MOCK_BACKEND_SNAPSHOT);
  });

  it("rethrows environment summary errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("environment_summary failed"));

    await expect(getBackendSnapshot()).rejects.toThrow("environment_summary failed");
  });

  it("runs health check through Tauri", async () => {
    invokeMock.mockResolvedValue({
      backend: "nvm-sh",
      items: [
        {
          key: "nvm_script",
          status: "success",
          summary: "~/.nvm/nvm.sh detected",
          detail: "/Users/me/.nvm/nvm.sh",
        },
      ],
    });

    await expect(healthCheck()).resolves.toMatchObject({
      backend: "nvm-sh",
      items: [{ key: "nvm_script", status: "success" }],
    });
    expect(invokeMock).toHaveBeenCalledWith("health_check");
  });

  it("falls back to mock health data when Tauri is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    await expect(healthCheck()).resolves.toEqual(MOCK_BACKEND_SNAPSHOT.health);
    expect(invokeMock).toHaveBeenCalledWith("health_check");
  });

  it("rethrows health check errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("health_check failed"));

    await expect(healthCheck()).rejects.toThrow("health_check failed");
    expect(invokeMock).toHaveBeenCalledWith("health_check");
  });

  it("loads the backend install guide from Tauri", async () => {
    invokeMock.mockResolvedValue({
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
    });

    await expect(getBackendInstallGuide()).resolves.toMatchObject({
      backendKind: "nvm-sh",
      installScriptUrl: "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh",
      targetPath: "~/.nvm",
    });
    expect(invokeMock).toHaveBeenCalledWith("backend_install_guide");
  });

  it("falls back to the Windows install guide when Tauri is unavailable", async () => {
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    try {
      await expect(getBackendInstallGuide()).resolves.toMatchObject({
        backendKind: "nvm-windows",
        installerUrl:
          "https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe",
        requiresAdmin: true,
      });
      expect(invokeMock).toHaveBeenCalledWith("backend_install_guide");
    } finally {
      Object.defineProperty(window.navigator, "userAgent", {
        configurable: true,
        value: originalUserAgent,
      });
    }
  });

  it("rethrows backend install guide errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("backend_install_guide failed"));

    await expect(getBackendInstallGuide()).rejects.toThrow("backend_install_guide failed");
    expect(invokeMock).toHaveBeenCalledWith("backend_install_guide");
  });

  it("reads project .nvmrc through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue({
      status: "success",
      data: {
        projectDir: "/tmp/project",
        nvmrcPath: "/tmp/project/.nvmrc",
        rawContent: "v22.11.0\n",
        version: "v22.11.0",
        isValid: true,
        isInstalled: true,
        inherited: false,
        message: null,
      },
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    });

    await expect(readProjectVersion("/tmp/project")).resolves.toMatchObject({
      status: "success",
      data: {
        version: "v22.11.0",
        isInstalled: true,
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("read_project_version", {
      projectDir: "/tmp/project",
    });
  });

  it("writes project .nvmrc through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue({
      status: "success",
      data: {
        projectDir: "/tmp/project",
        nvmrcPath: "/tmp/project/.nvmrc",
        rawContent: "v20.18.1\n",
        version: "v20.18.1",
        isValid: true,
        isInstalled: false,
        inherited: false,
        message: null,
      },
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    });

    await expect(writeProjectVersion("/tmp/project", "v20.18.1")).resolves.toMatchObject({
      status: "success",
      data: {
        version: "v20.18.1",
        nvmrcPath: "/tmp/project/.nvmrc",
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("write_project_version", {
      projectDir: "/tmp/project",
      version: "v20.18.1",
    });
  });

  it("installs a version through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "install complete",
      stderr: "",
      exitCode: 0,
      message: null,
    });

    await expect(
      installVersion({
        version: "v20.18.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: true,
      }),
    ).resolves.toMatchObject({
      status: "success",
      stdout: "install complete",
    });
    expect(invokeMock).toHaveBeenCalledWith("install_version", {
      options: {
        version: "v20.18.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: true,
      },
    });
  });

  it("activates a version through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "using v22.11.0",
      stderr: "",
      exitCode: 0,
      message: null,
    });

    await expect(
      activateVersion({
        version: "v22.11.0",
        arch: null,
      }),
    ).resolves.toMatchObject({
      status: "success",
      stdout: "using v22.11.0",
    });
    expect(invokeMock).toHaveBeenCalledWith("activate_version", {
      options: {
        version: "v22.11.0",
        arch: null,
      },
    });
  });

  it("writes a manual ui snapshot through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue(undefined);

    const snapshot = {
      schemaVersion: 1 as const,
      capturedAt: "2026-06-03T05:36:00.000Z",
      viewport: { width: 1280, height: 820 },
      window: null,
      app: {
        screen: "home",
        title: "Home",
        locale: "zh-CN",
        theme: "dark",
        backendKind: "missing",
        currentNodeVersion: null,
        defaultVersion: null,
        versionSource: "unknown",
        selectedProjectDir: null,
        selectedProjectVersion: null,
        activityTaskCount: 1,
        runningTaskCount: 0,
        writeLocked: false,
        manualBridgeLastCommandId: null,
        manualBridgeLastCommandStatus: null,
        manualBridgeLastError: null,
        flags: {
          backendInstallPending: false,
          versionActionPending: false,
          remoteLoading: false,
          remoteInstallPending: false,
          projectInstallPending: false,
          projectWritePending: false,
        },
      },
      dialogs: [],
      elements: [],
    };

    await expect(writeManualUiSnapshot(snapshot)).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("write_manual_ui_snapshot", {
      snapshot,
    });
  });

  it("takes a manual ui command through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue({
      id: "cmd-1",
      kind: "navigate",
      screen: "versions",
    });

    await expect(takeManualUiCommand()).resolves.toEqual({
      id: "cmd-1",
      kind: "navigate",
      screen: "versions",
    });
    expect(invokeMock).toHaveBeenCalledWith("take_manual_ui_command");
  });

  it("falls back to null when manual ui command polling is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    await expect(takeManualUiCommand()).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("take_manual_ui_command");
  });

  it("rethrows unexpected manual ui command polling errors", async () => {
    invokeMock.mockRejectedValue(new Error("manual ui command path is not configured"));

    await expect(takeManualUiCommand()).rejects.toThrow("manual ui command path is not configured");
    expect(invokeMock).toHaveBeenCalledWith("take_manual_ui_command");
  });

  it("writes a manual ui command result through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue(undefined);

    const result = {
      id: "cmd-1",
      kind: "navigate" as const,
      status: "success" as const,
      message: null,
      completedAt: "2026-06-03T08:00:00.000Z",
      screen: "versions",
      dialogTitles: [],
    };

    await expect(writeManualUiCommandResult(result)).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("write_manual_ui_command_result", {
      result,
    });
  });

  it("sets default through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "default -> v22.11.0",
      stderr: "",
      exitCode: 0,
      message: null,
    });

    await expect(setDefaultVersion("v22.11.0")).resolves.toMatchObject({
      status: "success",
      stdout: "default -> v22.11.0",
    });
    expect(invokeMock).toHaveBeenCalledWith("set_default_version", {
      version: "v22.11.0",
    });
  });

  it("uninstalls a version through a structured Tauri command", async () => {
    invokeMock.mockResolvedValue({
      status: "success",
      data: null,
      stdout: "uninstalled v20.18.1",
      stderr: "",
      exitCode: 0,
      message: null,
    });

    await expect(uninstallVersion("v20.18.1")).resolves.toMatchObject({
      status: "success",
      stdout: "uninstalled v20.18.1",
    });
    expect(invokeMock).toHaveBeenCalledWith("uninstall_version", {
      version: "v20.18.1",
    });
  });

  it("loads remote versions through Tauri", async () => {
    invokeMock.mockResolvedValue({
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
    });

    await expect(listRemote()).resolves.toMatchObject({
      status: "success",
      data: [{ version: "v24.4.1" }],
    });
    expect(invokeMock).toHaveBeenCalledWith("list_remote");
  });

  it("falls back to mock remote versions when Tauri is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    await expect(listRemote()).resolves.toEqual({
      status: "success",
      data: MOCK_REMOTE_VERSIONS,
      stdout: "",
      stderr: "",
      exitCode: 0,
      message: null,
    });
    expect(invokeMock).toHaveBeenCalledWith("list_remote");
  });

  it("rethrows remote listing errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("list_remote failed"));

    await expect(listRemote()).rejects.toThrow("list_remote failed");
    expect(invokeMock).toHaveBeenCalledWith("list_remote");
  });

  it("detects backend through Tauri command", async () => {
    invokeMock.mockResolvedValue({
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
      executablePath: "/Users/me/.nvm/nvm.sh",
      version: "0.40.3",
      root: null,
      symlinkPath: null,
      arch: "arm64",
      health: {
        backend: "nvm-sh",
        items: [],
      },
    });

    await expect(detectBackend()).resolves.toMatchObject({
      kind: "nvm-sh",
      version: "0.40.3",
      nvmDir: "/Users/me/.nvm",
    });
    expect(invokeMock).toHaveBeenCalledWith("detect_backend");
  });

  it("returns null when backend detection is unavailable outside Tauri", async () => {
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    await expect(detectBackend()).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("detect_backend");
  });

  it("rethrows backend detection errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("detect_backend failed"));

    await expect(detectBackend()).rejects.toThrow("detect_backend failed");
    expect(invokeMock).toHaveBeenCalledWith("detect_backend");
  });

  it("falls back to a mock backend install task when Tauri is unavailable", async () => {
    vi.useFakeTimers();
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
    });
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    try {
      const running = await startInstallBackendTask();
      expect(running.status).toBe("running");
      expect(running.stdout).toContain("install.sh");

      await vi.advanceTimersByTimeAsync(150);

      await expect(getInstallVersionTask(running.taskId)).resolves.toMatchObject({
        status: "success",
        stdout: expect.stringContaining("backend install finished"),
      });
      expect(invokeMock).toHaveBeenCalledWith("start_install_backend_task");
    } finally {
      Object.defineProperty(window.navigator, "userAgent", {
        configurable: true,
        value: originalUserAgent,
      });
      vi.useRealTimers();
    }
  });

  it("rethrows backend install task errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("start_install_backend_task failed"));

    await expect(startInstallBackendTask()).rejects.toThrow("start_install_backend_task failed");
    expect(invokeMock).toHaveBeenCalledWith("start_install_backend_task");
  });

  it("falls back to a mock version install task when Tauri is unavailable", async () => {
    vi.useFakeTimers();
    invokeMock.mockRejectedValue(new Error("not in tauri"));

    try {
      const running = await startInstallVersionTask({
        version: "v20.18.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      });
      expect(running.status).toBe("running");
      expect(running.stdout).toContain("nvm install v20.18.1");

      await vi.advanceTimersByTimeAsync(150);

      await expect(getInstallVersionTask(running.taskId)).resolves.toMatchObject({
        status: "success",
        stdout: expect.stringContaining("installed v20.18.1"),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rethrows version install task errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("start_install_version_task failed"));

    await expect(
      startInstallVersionTask({
        version: "v20.18.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      }),
    ).rejects.toThrow("start_install_version_task failed");
    expect(invokeMock).toHaveBeenCalledWith("start_install_version_task", {
      options: {
        version: "v20.18.1",
        arch: null,
        reinstallPackagesFrom: null,
        latestNpm: false,
        sourceInstall: false,
      },
    });
  });

  it("rethrows install task polling errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("get_install_version_task failed"));

    await expect(getInstallVersionTask("task-1")).rejects.toThrow("get_install_version_task failed");
    expect(invokeMock).toHaveBeenCalledWith("get_install_version_task", {
      taskId: "task-1",
    });
  });

  it("rethrows install task cancellation errors from a real Tauri runtime", async () => {
    invokeMock.mockRejectedValue(new Error("cancel_install_version_task failed"));

    await expect(cancelInstallVersionTask("task-1")).rejects.toThrow("cancel_install_version_task failed");
    expect(invokeMock).toHaveBeenCalledWith("cancel_install_version_task", {
      taskId: "task-1",
    });
  });
});
