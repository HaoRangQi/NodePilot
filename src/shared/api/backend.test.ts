import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBackendSnapshot, MOCK_BACKEND_SNAPSHOT } from "./backend";

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
});
