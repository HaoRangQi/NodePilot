import { invoke } from "@tauri-apps/api/core";
import type { EnvironmentSummary } from "../types/backend";

export type BackendSnapshot = EnvironmentSummary;

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

export async function getBackendSnapshot(): Promise<EnvironmentSummary> {
  try {
    return await invoke<EnvironmentSummary>("environment_summary");
  } catch {
    return MOCK_BACKEND_SNAPSHOT;
  }
}
