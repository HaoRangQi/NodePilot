export type BackendKind = "nvm-sh" | "nvm-windows" | "missing" | "unsupported";

export type BackendInstallKind = "script" | "external-installer";

export type TaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export type VersionSource = "nvm-sh" | "nvm-windows" | "system" | "unknown";

export type VersionState = "ok" | "missing" | "damaged";

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

export type CapabilitySet = {
  canInstall: boolean;
  canUninstall: boolean;
  canActivate: boolean;
  canSetDefault: boolean;
  supportsAlias: boolean;
  supportsProjectNvmrc: boolean;
  supportsArchSelection: boolean;
  supportsProxy: boolean;
  supportsMirror: boolean;
  supportsSourceInstall: boolean;
  supportsOfflineInstall: boolean;
  requiresAdminForActivation: boolean;
};

export type BackendDetection = {
  kind: BackendKind;
  capabilities: CapabilitySet;
  nvmDir: string | null;
  executablePath: string | null;
  version: string | null;
  root: string | null;
  symlinkPath: string | null;
  arch: string | null;
  health: HealthCheckResult;
};

export type BackendInstallGuide = {
  backendKind: BackendKind;
  installKind: BackendInstallKind;
  displayName: string;
  officialSourceLabel: string;
  officialSourceUrl: string;
  installScriptUrl: string | null;
  installCommand: string | null;
  installerUrl: string | null;
  targetPath: string | null;
  requiresAdmin: boolean;
  postInstallSteps: string[];
  detectionHint: string;
};

export type VersionInfo = {
  version: string;
  npmVersion: string | null;
  path: string | null;
  state?: VersionState | null;
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
  defaultPackagesPath: string | null;
  defaultPackagesExists: boolean;
  defaultPackagesEntries: string[];
  health: HealthCheckResult;
  installedVersions: VersionInfo[];
};

export type ProjectVersionInfo = {
  projectDir: string;
  nvmrcPath: string | null;
  rawContent: string | null;
  version: string | null;
  isValid: boolean;
  isInstalled: boolean;
  inherited: boolean;
  message: string | null;
};

export type InstallOptions = {
  version: string;
  arch: string | null;
  reinstallPackagesFrom: string | null;
  latestNpm: boolean;
  sourceInstall: boolean;
};

export type InstallTaskSnapshot = {
  taskId: string;
  status: TaskStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  message: string | null;
  cancelRequested: boolean;
};

export type ManualUiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ManualUiPoint = {
  x: number;
  y: number;
};

export type ManualUiSize = {
  width: number;
  height: number;
};

export type ManualUiWindowSnapshot = {
  scaleFactor: number | null;
  innerPositionPhysical: ManualUiPoint | null;
  outerPositionPhysical: ManualUiPoint | null;
  innerSizePhysical: ManualUiSize | null;
  outerSizePhysical: ManualUiSize | null;
  clientOriginLogical: ManualUiPoint | null;
  clientOriginPhysical: ManualUiPoint | null;
};

export type ManualUiDialogSnapshot = {
  id: string;
  title: string;
  rect: ManualUiRect;
  screenRectLogical: ManualUiRect | null;
  screenRectPhysical: ManualUiRect | null;
};

export type ManualUiElementSnapshot = {
  id: string;
  role: string;
  label: string;
  text: string;
  context: string | null;
  dialog: string | null;
  disabled: boolean;
  rect: ManualUiRect;
  screenRectLogical: ManualUiRect | null;
  screenRectPhysical: ManualUiRect | null;
  screenCenterLogical: ManualUiPoint | null;
  screenCenterPhysical: ManualUiPoint | null;
};

export type ManualUiSnapshotAppFlags = {
  backendInstallPending: boolean;
  versionActionPending: boolean;
  remoteLoading: boolean;
  remoteInstallPending: boolean;
  projectInstallPending: boolean;
  projectWritePending: boolean;
};

export type ManualUiSnapshotAppState = {
  screen: string;
  title: string;
  locale: string;
  theme: string;
  backendKind: string;
  currentNodeVersion: string | null;
  defaultVersion: string | null;
  versionSource: string;
  selectedProjectDir: string | null;
  selectedProjectVersion: string | null;
  activityTaskCount: number;
  runningTaskCount: number;
  writeLocked: boolean;
  manualBridgeLastCommandId: string | null;
  manualBridgeLastCommandStatus: string | null;
  manualBridgeLastError: string | null;
  flags: ManualUiSnapshotAppFlags;
};

export type ManualUiSnapshot = {
  schemaVersion: 1;
  capturedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  window: ManualUiWindowSnapshot | null;
  app: ManualUiSnapshotAppState;
  dialogs: ManualUiDialogSnapshot[];
  elements: ManualUiElementSnapshot[];
};

export type ManualUiCommand =
  | {
      id: string;
      kind: "navigate";
      screen: string;
    }
  | {
      id: string;
      kind: "click";
      manualId: string;
    }
  | {
      id: string;
      kind: "read-project";
      projectDir: string;
    };

export type ManualUiCommandResult = {
  id: string;
  kind: ManualUiCommand["kind"];
  status: "success" | "failed";
  message: string | null;
  completedAt: string;
  screen: string;
  dialogTitles: string[];
};

export type ActivateOptions = {
  version: string;
  arch: string | null;
};

export type CommandResult<T> = {
  status: TaskStatus;
  data: T | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  message: string | null;
};
