export type BackendKind = "nvm-sh" | "nvm-windows" | "missing" | "unsupported";

export type TaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export type VersionSource = "nvm-sh" | "nvm-windows" | "system" | "unknown";

export type HealthCheckItem = {
  key: string;
  status: TaskStatus;
  summary: string;
  detail: string | null;
};

export type HealthCheckResult = {
  backend: BackendKind;
  items: HealthCheckItem[];
};

export type VersionInfo = {
  version: string;
  npmVersion: string | null;
  path: string | null;
  arch: string | null;
  isCurrent: boolean;
  isDefault: boolean;
  isLts: boolean;
  isSystem: boolean;
  line: string | null;
};

export type EnvironmentSummary = {
  currentNodeVersion: string | null;
  npmVersion: string | null;
  pnpmVersion: string | null;
  yarnVersion: string | null;
  nodePath: string | null;
  npmPath: string | null;
  backendKind: BackendKind;
  platform: string;
  arch: string;
  versionSource: VersionSource;
  defaultVersion: string | null;
  defaultExists: boolean;
  defaultMatchesCurrent: boolean;
  health: HealthCheckResult;
  installedVersions: VersionInfo[];
};
