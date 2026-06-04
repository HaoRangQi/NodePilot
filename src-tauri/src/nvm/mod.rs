pub mod nvm_sh;
pub mod nvm_windows;
pub mod parser;
pub mod project;
pub mod runner;
pub mod safety;
pub mod types;

use crate::tasks::TaskStatus;
use std::{env, path::PathBuf};
use runner::SafeCommand;

use nvm_sh::NvmShAdapter;
#[cfg(windows)]
use nvm_windows::NvmWindowsAdapter;
use types::{
    ActivateOptions, BackendDetection, BackendInstallGuide, BackendInstallKind, BackendKind,
    CapabilitySet, CommandResult, EnvironmentSummary, HealthCheckItem, HealthCheckResult,
    InstallOptions, ProjectVersionInfo, VersionInfo, VersionState,
};

#[cfg(any(test, not(windows)))]
const NVM_SH_RELEASE_TAG: &str = "v0.40.4";
#[cfg(any(test, not(windows)))]
const NVM_SH_OFFICIAL_SOURCE_URL: &str = "https://github.com/nvm-sh/nvm#installing-and-updating";
#[cfg(any(test, not(windows)))]
const NVM_SH_INSTALL_SCRIPT_URL: &str =
    "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh";
#[cfg(any(test, windows))]
const NVM_WINDOWS_RELEASE_TAG: &str = "1.2.2";
#[cfg(any(test, windows))]
const NVM_WINDOWS_OFFICIAL_SOURCE_URL: &str = "https://github.com/coreybutler/nvm-windows/releases";
#[cfg(any(test, windows))]
const NVM_WINDOWS_INSTALLER_URL: &str =
    "https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe";
const APPLE_SILICON_NATIVE_NODE_MAJOR: u64 = 16;

pub trait NodeVersionBackend {
    fn detect_backend(&self) -> BackendKind;
    fn health_check(&self) -> HealthCheckResult;
    fn list_installed(&self) -> CommandResult<Vec<VersionInfo>>;
    fn list_remote(&self) -> CommandResult<Vec<VersionInfo>>;
    fn install(&self, options: InstallOptions) -> CommandResult<()>;
    fn uninstall(&self, version: &str) -> CommandResult<()>;
    fn activate(&self, options: ActivateOptions) -> CommandResult<()>;
    fn set_default(&self, version: &str) -> CommandResult<()>;
    fn read_project_version(&self, path: &str) -> CommandResult<Option<String>>;
    fn write_project_version(&self, path: &str, version: &str) -> CommandResult<()>;
}

pub fn detect_backend() -> BackendDetection {
    platform_adapter_detection()
}

pub fn health_check() -> HealthCheckResult {
    let detection = detect_backend();
    let installed_versions = list_installed().data.unwrap_or_default();
    computed_environment_health(&detection, &installed_versions)
}

pub fn list_installed() -> CommandResult<Vec<VersionInfo>> {
    let detection = detect_backend();
    let result = platform_list_installed();

    match result.data {
        Some(versions) => CommandResult {
            data: Some(enrich_installed_versions(&detection, versions)),
            ..result
        },
        None => result,
    }
}

pub fn list_remote() -> CommandResult<Vec<VersionInfo>> {
    platform_list_remote()
}

pub fn install(options: InstallOptions) -> CommandResult<()> {
    if let Err(result) = validate_install_options(&options) {
        return result;
    }

    platform_install(options)
}

pub fn install_command(options: InstallOptions) -> Result<SafeCommand, String> {
    validate_install_options(&options).map_err(command_result_message)?;
    platform_install_command(options).map_err(command_result_message)
}

pub fn backend_install_guide() -> BackendInstallGuide {
    platform_backend_install_guide()
}

pub fn backend_install_command() -> Result<SafeCommand, String> {
    platform_backend_install_command().map_err(command_result_message)
}

pub fn activate(options: ActivateOptions) -> CommandResult<()> {
    if let Err(message) = safety::validate_version(&options.version) {
        return CommandResult::failed(message, options.version);
    }

    if let Some(arch) = options.arch.as_deref() {
        if let Err(message) = safety::validate_arch(arch) {
            return CommandResult::failed(message, arch);
        }
    }

    platform_activate(options)
}

pub fn set_default(version: &str) -> CommandResult<()> {
    if let Err(message) = safety::validate_version(version) {
        return CommandResult::failed(message, version);
    }

    platform_set_default(version)
}

pub fn uninstall(version: &str) -> CommandResult<()> {
    if let Err(message) = safety::validate_version(version) {
        return CommandResult::failed(message, version);
    }

    platform_uninstall(version)
}

pub fn read_project_version(project_dir: &str) -> CommandResult<ProjectVersionInfo> {
    let installed_versions = list_installed().data.unwrap_or_default();
    project::read_project_version(project_dir, &installed_versions)
}

pub fn write_project_version(project_dir: &str, version: &str) -> CommandResult<ProjectVersionInfo> {
    let installed_versions = list_installed().data.unwrap_or_default();
    project::write_project_version(project_dir, version, &installed_versions)
}

pub fn environment_summary() -> EnvironmentSummary {
    let detection = detect_backend();
    let installed_versions = list_installed().data.unwrap_or_default();
    let current_node_version = command_text("node", ["-v"])
        .or_else(|| current_version_from_installed(&installed_versions));
    let default_version = default_version(detection.kind, &installed_versions);
    let default_exists = default_version
        .as_deref()
        .is_some_and(|target| version_exists(&installed_versions, target));
    let default_matches_current = default_version
        .as_deref()
        .zip(current_node_version.as_deref())
        .is_some_and(|(default, current)| versions_match(default, current));
    let npm_prefix = command_text("npm", ["config", "get", "prefix"]);
    let node_path = command_text("which", ["node"]).or_else(|| command_text("where", ["node"]));
    let npm_path = command_text("which", ["npm"]).or_else(|| command_text("where", ["npm"]));
    let health = build_environment_health(
        detection.health.clone(),
        &detection,
        node_path.as_deref(),
        npm_prefix.as_deref(),
        current_node_version.as_deref(),
        default_version.as_deref(),
        default_exists,
        std::env::consts::OS,
    );
    let version_source = version_source(
        detection.kind,
        &installed_versions,
        node_path.as_deref(),
        &detection,
    );
    let (default_packages_path, default_packages_exists, default_packages_entries) =
        default_packages_state(&detection);

    EnvironmentSummary {
        current_node_version,
        npm_version: command_text("npm", ["-v"]),
        pnpm_version: command_text("pnpm", ["-v"]),
        yarn_version: command_text("yarn", ["-v"]),
        node_path,
        npm_path,
        backend_kind: detection.kind,
        platform: std::env::consts::OS.to_string(),
        arch: detection
            .arch
            .clone()
            .unwrap_or_else(|| std::env::consts::ARCH.to_string()),
        version_source,
        default_version,
        default_exists,
        default_matches_current,
        default_packages_path,
        default_packages_exists,
        default_packages_entries,
        health,
        installed_versions,
    }
}

#[cfg(windows)]
fn platform_adapter_detection() -> BackendDetection {
    NvmWindowsAdapter::default().detect()
}

fn current_version_from_installed(versions: &[VersionInfo]) -> Option<String> {
    versions
        .iter()
        .find(|version| version.is_current)
        .map(|version| version.version.clone())
}

fn default_version_from_installed(versions: &[VersionInfo]) -> Option<String> {
    versions
        .iter()
        .find(|version| version.is_default)
        .map(|version| version.version.clone())
}

fn default_version(kind: BackendKind, versions: &[VersionInfo]) -> Option<String> {
    default_version_from_installed(versions).or_else(|| match kind {
        BackendKind::NvmSh => NvmShAdapter::from_env()
            .and_then(|adapter| adapter.default_alias().data)
            .flatten(),
        BackendKind::NvmWindows | BackendKind::Missing | BackendKind::Unsupported => None,
    })
}

fn version_source(
    kind: BackendKind,
    versions: &[VersionInfo],
    node_path: Option<&str>,
    detection: &BackendDetection,
) -> String {
    let path_matches_backend = path_matches_detected_backend(detection, node_path);

    match kind {
        BackendKind::NvmSh if path_matches_backend || node_path.is_none() => "nvm-sh",
        BackendKind::NvmWindows if path_matches_backend || node_path.is_none() => "nvm-windows",
        BackendKind::NvmSh | BackendKind::NvmWindows => "system",
        BackendKind::Missing | BackendKind::Unsupported => versions
            .iter()
            .any(|version| version.is_system && version.is_current)
            .then_some("system")
            .unwrap_or("unknown"),
    }
    .into()
}

fn version_exists(versions: &[VersionInfo], target: &str) -> bool {
    versions
        .iter()
        .any(|version| versions_match(&version.version, target))
}

fn default_packages_state(detection: &BackendDetection) -> (Option<String>, bool, Vec<String>) {
    let Some(path) = detection
        .nvm_dir
        .as_deref()
        .map(PathBuf::from)
        .map(|dir| dir.join("default-packages"))
    else {
        return (None, false, vec![]);
    };

    let exists = path.is_file();
    let entries = std::fs::read_to_string(&path)
        .map(|content| parse_default_packages(&content))
        .unwrap_or_default();

    (Some(path.display().to_string()), exists, entries)
}

fn parse_default_packages(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
        .collect()
}

fn versions_match(left: &str, right: &str) -> bool {
    normalize_version(left) == normalize_version(right)
}

fn normalize_version(version: &str) -> &str {
    version.trim().trim_start_matches('v')
}

fn normalize_version_owned(version: &str) -> String {
    format!("v{}", normalize_version(version))
}

fn enrich_installed_versions(
    detection: &BackendDetection,
    versions: Vec<VersionInfo>,
) -> Vec<VersionInfo> {
    versions
        .into_iter()
        .map(|version| enrich_installed_version(detection, version))
        .collect()
}

fn enrich_installed_version(detection: &BackendDetection, mut version: VersionInfo) -> VersionInfo {
    if version.is_system {
        version.state = VersionState::Ok;
        return version;
    }

    let (expected_path, version_dir) = managed_version_paths(detection, &version.version);
    match (expected_path, version_dir) {
        (Some(path), _) if path.is_file() => {
            version.path = Some(path.display().to_string());
            version.state = VersionState::Ok;
        }
        (_, Some(dir)) if dir.is_dir() => {
            version.path = None;
            version.state = VersionState::Damaged;
        }
        _ => {
            version.path = None;
            version.state = VersionState::Missing;
        }
    }

    version
}

fn managed_version_paths(
    detection: &BackendDetection,
    version: &str,
) -> (Option<PathBuf>, Option<PathBuf>) {
    match detection.kind {
        BackendKind::NvmSh => nvm_sh_version_paths(detection.nvm_dir.as_deref(), version),
        BackendKind::NvmWindows => nvm_windows_version_paths(detection.root.as_deref(), version),
        BackendKind::Missing | BackendKind::Unsupported => (None, None),
    }
}

fn nvm_sh_version_paths(root: Option<&str>, version: &str) -> (Option<PathBuf>, Option<PathBuf>) {
    let root = root.map(PathBuf::from);
    let version_names = version_candidates(version);
    let dirs = version_names
        .iter()
        .filter_map(|candidate| {
            root.as_ref()
                .map(|base| base.join("versions").join("node").join(candidate))
        })
        .collect::<Vec<_>>();

    let node_path = dirs
        .iter()
        .map(|dir| dir.join("bin").join("node"))
        .find(|path| path.is_file())
        .or_else(|| dirs.first().map(|dir| dir.join("bin").join("node")));
    let version_dir = dirs.into_iter().find(|dir| dir.is_dir()).or_else(|| {
        root.map(|base| {
            base.join("versions")
                .join("node")
                .join(normalize_version_owned(version))
        })
    });

    (node_path, version_dir)
}

fn nvm_windows_version_paths(
    root: Option<&str>,
    version: &str,
) -> (Option<PathBuf>, Option<PathBuf>) {
    let root = root.map(PathBuf::from);
    let version_names = version_candidates(version);
    let dirs = version_names
        .iter()
        .filter_map(|candidate| root.as_ref().map(|base| base.join(candidate)))
        .collect::<Vec<_>>();

    let node_path = dirs
        .iter()
        .map(|dir| dir.join("node.exe"))
        .find(|path| path.is_file())
        .or_else(|| dirs.first().map(|dir| dir.join("node.exe")));
    let version_dir = dirs
        .into_iter()
        .find(|dir| dir.is_dir())
        .or_else(|| root.map(|base| base.join(normalize_version_owned(version))));

    (node_path, version_dir)
}

fn version_candidates(version: &str) -> Vec<String> {
    let normalized = normalize_version(version);
    let raw = version.trim();
    let with_v = normalize_version_owned(version);

    let mut candidates = vec![raw.to_string(), normalized.to_string(), with_v];
    candidates.retain(|candidate| !candidate.is_empty());
    candidates.dedup();
    candidates
}

fn command_path_lines(output: Option<&str>) -> Vec<&str> {
    output
        .into_iter()
        .flat_map(str::lines)
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect()
}

fn managed_backend_paths(detection: &BackendDetection) -> Vec<&str> {
    [
        detection.nvm_dir.as_deref(),
        detection.root.as_deref(),
        detection.symlink_path.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn path_matches_detected_backend(detection: &BackendDetection, path_output: Option<&str>) -> bool {
    let managed_paths = managed_backend_paths(detection);
    let Some(path) = command_path_lines(path_output).into_iter().next() else {
        return false;
    };

    managed_paths
        .iter()
        .any(|managed| path_starts_with_backend(path, managed, detection.kind))
}

fn path_starts_with_backend(path: &str, prefix: &str, kind: BackendKind) -> bool {
    match kind {
        BackendKind::NvmWindows => {
            let normalized_path = path.trim().replace('/', "\\").to_ascii_lowercase();
            let normalized_prefix = prefix.trim().replace('/', "\\").to_ascii_lowercase();
            normalized_path.starts_with(&normalized_prefix)
        }
        BackendKind::NvmSh | BackendKind::Missing | BackendKind::Unsupported => {
            path.trim().starts_with(prefix.trim())
        }
    }
}

#[cfg(any(test, not(windows)))]
fn nvm_sh_target_dir() -> Option<String> {
    env::var("XDG_CONFIG_HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| PathBuf::from(value).join("nvm").display().to_string())
        .or_else(|| {
            env::var("HOME")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .map(|value| PathBuf::from(value).join(".nvm").display().to_string())
        })
}

#[cfg(any(test, not(windows)))]
fn nvm_sh_install_shell_command() -> String {
    format!(
        "set -o pipefail; \
if command -v curl >/dev/null 2>&1; then curl -fsSL {url} | bash; \
elif command -v wget >/dev/null 2>&1; then wget -qO- {url} | bash; \
else echo 'curl or wget is required to install nvm.' >&2; exit 1; fi",
        url = NVM_SH_INSTALL_SCRIPT_URL
    )
}

#[cfg(any(test, windows))]
fn windows_install_script() -> String {
    format!(
        "$installerUrl = '{installer_url}'; \
$installerPath = Join-Path $env:TEMP 'nodepilot-nvm-setup.exe'; \
Write-Output \"Downloading $installerUrl\"; \
Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath; \
Write-Output \"Saved installer to $installerPath\"; \
$process = Start-Process -FilePath $installerPath -Wait -PassThru; \
Write-Output \"Installer exit code: $($process.ExitCode)\"; \
exit $process.ExitCode",
        installer_url = NVM_WINDOWS_INSTALLER_URL
    )
}

#[cfg(any(test, windows))]
fn build_nvm_windows_install_guide() -> BackendInstallGuide {
    BackendInstallGuide {
        backend_kind: BackendKind::NvmWindows,
        install_kind: BackendInstallKind::ExternalInstaller,
        display_name: "nvm-windows".into(),
        official_source_label: format!("nvm-windows releases ({NVM_WINDOWS_RELEASE_TAG})"),
        official_source_url: NVM_WINDOWS_OFFICIAL_SOURCE_URL.into(),
        install_script_url: None,
        install_command: Some(
            "Download nvm-setup.exe to %TEMP% and run the interactive installer.".into(),
        ),
        installer_url: Some(NVM_WINDOWS_INSTALLER_URL.into()),
        target_path: Some(r"%TEMP%\nodepilot-nvm-setup.exe".into()),
        requires_admin: true,
        post_install_steps: vec![
            "Complete the installer UI. NodePilot does not perform a silent installation.".into(),
            "After the installer exits, verify that `nvm.exe` is on PATH and refresh detection."
                .into(),
        ],
        detection_hint: "If nvm is still missing after the installer exits, reopen PowerShell or Command Prompt and verify `nvm version` manually.".into(),
    }
}

#[cfg(any(test, not(windows)))]
fn build_nvm_sh_install_guide() -> BackendInstallGuide {
    BackendInstallGuide {
        backend_kind: BackendKind::NvmSh,
        install_kind: BackendInstallKind::Script,
        display_name: "nvm-sh".into(),
        official_source_label: format!("nvm-sh README ({NVM_SH_RELEASE_TAG})"),
        official_source_url: NVM_SH_OFFICIAL_SOURCE_URL.into(),
        install_script_url: Some(NVM_SH_INSTALL_SCRIPT_URL.into()),
        install_command: Some(nvm_sh_install_shell_command()),
        installer_url: None,
        target_path: nvm_sh_target_dir(),
        requires_admin: false,
        post_install_steps: vec![
            "Open a new shell after the installer updates your profile, or source the updated profile manually.".into(),
            "Run `command -v nvm` to verify that the shell can load nvm.".into(),
        ],
        detection_hint: "If nvm is still missing, source your shell profile and refresh detection again."
            .into(),
    }
}

fn validate_install_options(options: &InstallOptions) -> Result<(), CommandResult<()>> {
    if let Err(message) = safety::validate_version(&options.version) {
        return Err(CommandResult::failed(message, options.version.clone()));
    }

    if let Some(reinstall_from) = options.reinstall_packages_from.as_deref() {
        if let Err(message) = safety::validate_version(reinstall_from) {
            return Err(CommandResult::failed(message, reinstall_from));
        }
    }

    if let Some(arch) = options.arch.as_deref() {
        if let Err(message) = safety::validate_arch(arch) {
            return Err(CommandResult::failed(message, arch));
        }
    }

    Ok(())
}

fn command_result_message(result: CommandResult<()>) -> String {
    result
        .message
        .or_else(|| (!result.stderr.is_empty()).then_some(result.stderr))
        .unwrap_or_else(|| "install command is unavailable".into())
}

fn command_text<const N: usize>(program: &str, args: [&str; N]) -> Option<String> {
    runner::SafeCommand::new(program, args)
        .run()
        .data
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
fn environment_health(
    health: HealthCheckResult,
    detection: &BackendDetection,
    node_path: Option<&str>,
    npm_prefix: Option<&str>,
    current_node_version: Option<&str>,
    default_version: Option<&str>,
    default_exists: bool,
    platform: &str,
) -> HealthCheckResult {
    build_environment_health(
        health,
        detection,
        node_path,
        npm_prefix,
        current_node_version,
        default_version,
        default_exists,
        platform,
    )
}

fn computed_environment_health(
    detection: &BackendDetection,
    installed_versions: &[VersionInfo],
) -> HealthCheckResult {
    let current_node_version = command_text("node", ["-v"])
        .or_else(|| current_version_from_installed(installed_versions));
    let default_version = default_version(detection.kind, installed_versions);
    let default_exists = default_version
        .as_deref()
        .is_some_and(|target| version_exists(installed_versions, target));
    let npm_prefix = command_text("npm", ["config", "get", "prefix"]);
    let node_path = command_text("which", ["node"]).or_else(|| command_text("where", ["node"]));

    build_environment_health(
        detection.health.clone(),
        detection,
        node_path.as_deref(),
        npm_prefix.as_deref(),
        current_node_version.as_deref(),
        default_version.as_deref(),
        default_exists,
        std::env::consts::OS,
    )
}

fn build_environment_health(
    mut health: HealthCheckResult,
    detection: &BackendDetection,
    node_path: Option<&str>,
    npm_prefix: Option<&str>,
    current_node_version: Option<&str>,
    default_version: Option<&str>,
    default_exists: bool,
    platform: &str,
) -> HealthCheckResult {
    health.items.push(node_path_health(detection, node_path));
    health.items.push(npm_prefix_health(detection, npm_prefix));

    if let Some(version) = default_version {
        health.items.push(HealthCheckItem {
            key: "default_version_exists".into(),
            status: if default_exists {
                TaskStatus::Success
            } else {
                TaskStatus::Failed
            },
            summary: if default_exists {
                format!("default version {version} exists locally")
            } else {
                format!("default version {version} is not installed")
            },
            detail: None,
        });
    }

    if let Some(item) = apple_silicon_legacy_node_health(
        detection,
        current_node_version,
        default_version,
        platform,
    ) {
        health.items.push(item);
    }

    health
}

fn apple_silicon_legacy_node_health(
    detection: &BackendDetection,
    current_node_version: Option<&str>,
    default_version: Option<&str>,
    platform: &str,
) -> Option<HealthCheckItem> {
    if platform != "macos" || detection.arch.as_deref() != Some("arm64") {
        return None;
    }

    let current_at_risk = current_node_version
        .and_then(version_major)
        .is_some_and(|major| major < APPLE_SILICON_NATIVE_NODE_MAJOR);
    let default_at_risk = default_version
        .and_then(version_major)
        .is_some_and(|major| major < APPLE_SILICON_NATIVE_NODE_MAJOR);

    if !current_at_risk && !default_at_risk {
        return None;
    }

    let mut targets = Vec::new();
    if current_at_risk {
        if let Some(version) = current_node_version {
            targets.push(format!("current {version}"));
        }
    }
    if default_at_risk {
        if let Some(version) = default_version {
            if !current_node_version.is_some_and(|current| versions_match(current, version)) {
                targets.push(format!("default {version}"));
            }
        }
    }

    Some(HealthCheckItem {
        key: "apple_silicon_legacy_node".into(),
        status: TaskStatus::Failed,
        summary: format!(
            "Apple Silicon may require Rosetta 2 or source builds for Node versions before v{}",
            APPLE_SILICON_NATIVE_NODE_MAJOR
        ),
        detail: (!targets.is_empty()).then(|| targets.join(", ")),
    })
}

fn version_major(version: &str) -> Option<u64> {
    normalize_version(version)
        .split('.')
        .next()
        .and_then(|part| part.parse::<u64>().ok())
}

fn node_path_health(detection: &BackendDetection, node_path: Option<&str>) -> HealthCheckItem {
    let backend_managed = matches!(detection.kind, BackendKind::NvmSh | BackendKind::NvmWindows);
    let ok = !backend_managed || path_matches_detected_backend(detection, node_path);

    HealthCheckItem {
        key: "node_path_source".into(),
        status: if ok {
            TaskStatus::Success
        } else {
            TaskStatus::Failed
        },
        summary: if ok {
            "Node path matches the detected backend".into()
        } else {
            "Node PATH does not appear to come from the detected backend".into()
        },
        detail: node_path.map(str::to_string),
    }
}

fn npm_prefix_health(detection: &BackendDetection, npm_prefix: Option<&str>) -> HealthCheckItem {
    let prefix = npm_prefix.unwrap_or_default();
    let backend_managed = matches!(detection.kind, BackendKind::NvmSh | BackendKind::NvmWindows);
    let managed_paths = managed_backend_paths(detection);
    let ok = !backend_managed
        || prefix.is_empty()
        || managed_paths
            .iter()
            .any(|managed| path_starts_with_backend(prefix, managed, detection.kind));

    HealthCheckItem {
        key: "npm_prefix".into(),
        status: if ok {
            TaskStatus::Success
        } else {
            TaskStatus::Failed
        },
        summary: if ok {
            "npm prefix is compatible with the detected backend".into()
        } else {
            "npm prefix may conflict with the detected backend".into()
        },
        detail: npm_prefix.map(str::to_string),
    }
}

#[cfg(test)]
mod environment_summary_tests {
    use super::*;
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    #[test]
    fn derives_current_and_default_from_installed_versions() {
        let mut current = VersionInfo::new("v22.11.0");
        current.is_current = true;
        let mut default = VersionInfo::new("v20.18.1");
        default.is_default = true;
        let versions = vec![current, default];

        assert_eq!(
            current_version_from_installed(&versions).as_deref(),
            Some("v22.11.0")
        );
        assert_eq!(
            default_version_from_installed(&versions).as_deref(),
            Some("v20.18.1")
        );
    }

    #[test]
    fn maps_backend_kind_to_version_source() {
        let detection = BackendDetection {
            kind: BackendKind::NvmSh,
            capabilities: CapabilitySet::nvm_sh(),
            nvm_dir: Some("/Users/me/.nvm".into()),
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
        };

        assert_eq!(
            version_source(
                BackendKind::NvmSh,
                &[],
                Some("/Users/me/.nvm/versions/node/v22.11.0/bin/node"),
                &detection,
            ),
            "nvm-sh"
        );
        assert_eq!(
            version_source(BackendKind::Missing, &[], None, &detection),
            "unknown"
        );
    }

    #[test]
    fn treats_system_current_as_system_source_when_backend_missing() {
        let mut system = VersionInfo::new("system");
        system.is_current = true;
        system.is_system = true;
        let detection = BackendDetection {
            kind: BackendKind::Missing,
            capabilities: CapabilitySet::missing(),
            nvm_dir: None,
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::Missing,
                items: vec![],
            },
        };

        assert_eq!(
            version_source(
                BackendKind::Missing,
                &[system],
                Some("/usr/local/bin/node"),
                &detection
            ),
            "system"
        );
    }

    #[test]
    fn treats_backend_with_external_node_path_as_system_source() {
        let detection = BackendDetection {
            kind: BackendKind::NvmSh,
            capabilities: CapabilitySet::nvm_sh(),
            nvm_dir: Some("/Users/me/.nvm".into()),
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
        };

        assert_eq!(
            version_source(
                BackendKind::NvmSh,
                &[],
                Some("/usr/local/bin/node"),
                &detection
            ),
            "system"
        );
    }

    #[test]
    fn compares_versions_with_or_without_v_prefix() {
        assert!(versions_match("v22.11.0", "22.11.0"));
        assert!(!versions_match("v22.11.0", "v20.18.1"));
    }

    #[test]
    fn flags_node_path_outside_detected_nvm_dir() {
        let detection = BackendDetection {
            kind: BackendKind::NvmSh,
            capabilities: CapabilitySet::nvm_sh(),
            nvm_dir: Some("/Users/me/.nvm".into()),
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
        };

        let item = node_path_health(&detection, Some("/usr/local/bin/node"));
        assert_eq!(item.status, TaskStatus::Failed);
        assert_eq!(item.key, "node_path_source");
    }

    #[test]
    fn treats_windows_symlink_node_path_as_backend_source() {
        let detection = BackendDetection {
            kind: BackendKind::NvmWindows,
            capabilities: CapabilitySet::nvm_windows(),
            nvm_dir: None,
            executable_path: Some("nvm.exe".into()),
            version: Some("1.2.2".into()),
            root: Some("C:\\Users\\me\\AppData\\Roaming\\nvm".into()),
            symlink_path: Some("C:\\Program Files\\nodejs".into()),
            arch: Some("64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmWindows,
                items: vec![],
            },
        };

        assert_eq!(
            version_source(
                BackendKind::NvmWindows,
                &[],
                Some("C:\\Program Files\\nodejs\\node.exe"),
                &detection,
            ),
            "nvm-windows"
        );
    }

    #[test]
    fn keeps_windows_backend_source_when_first_where_result_is_managed() {
        let detection = BackendDetection {
            kind: BackendKind::NvmWindows,
            capabilities: CapabilitySet::nvm_windows(),
            nvm_dir: None,
            executable_path: Some("nvm.exe".into()),
            version: Some("1.2.2".into()),
            root: Some("C:\\Users\\me\\AppData\\Roaming\\nvm".into()),
            symlink_path: Some("C:\\Program Files\\nodejs".into()),
            arch: Some("64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmWindows,
                items: vec![],
            },
        };

        assert_eq!(
            version_source(
                BackendKind::NvmWindows,
                &[],
                Some("C:\\Program Files\\nodejs\\node.exe\nC:\\tools\\nodejs\\node.exe"),
                &detection,
            ),
            "nvm-windows"
        );
    }

    #[test]
    fn flags_default_version_missing() {
        let health = environment_health(
            HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
            &BackendDetection {
                kind: BackendKind::NvmSh,
                capabilities: CapabilitySet::nvm_sh(),
                nvm_dir: Some("/Users/me/.nvm".into()),
                executable_path: None,
                version: None,
                root: None,
                symlink_path: None,
                arch: Some("arm64".into()),
                health: HealthCheckResult {
                    backend: BackendKind::NvmSh,
                    items: vec![],
                },
            },
            Some("/Users/me/.nvm/versions/node/v22.11.0/bin/node"),
            Some("/usr/local"),
            None,
            Some("v20.18.1"),
            false,
            "macos",
        );

        assert!(health
            .items
            .iter()
            .any(|item| item.key == "default_version_exists" && item.status == TaskStatus::Failed));
        assert!(health
            .items
            .iter()
            .any(|item| item.key == "npm_prefix" && item.status == TaskStatus::Failed));
    }

    #[test]
    fn flags_legacy_node_versions_on_apple_silicon() {
        let detection = BackendDetection {
            kind: BackendKind::NvmSh,
            capabilities: CapabilitySet::nvm_sh(),
            nvm_dir: Some("/Users/me/.nvm".into()),
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
        };

        let health = environment_health(
            HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
            &detection,
            Some("/Users/me/.nvm/versions/node/v14.21.3/bin/node"),
            Some("/Users/me/.nvm/versions/node/v14.21.3"),
            Some("v14.21.3"),
            Some("v12.22.12"),
            true,
            "macos",
        );

        let item = health
            .items
            .iter()
            .find(|item| item.key == "apple_silicon_legacy_node")
            .expect("expected apple silicon risk item");
        assert_eq!(item.status, TaskStatus::Failed);
        assert!(item.summary.contains("Rosetta 2"));
        assert_eq!(item.detail.as_deref(), Some("current v14.21.3, default v12.22.12"));
    }

    #[test]
    fn skips_legacy_node_risk_for_modern_apple_silicon_versions() {
        let detection = BackendDetection {
            kind: BackendKind::NvmSh,
            capabilities: CapabilitySet::nvm_sh(),
            nvm_dir: Some("/Users/me/.nvm".into()),
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
        };

        let health = environment_health(
            HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
            &detection,
            Some("/Users/me/.nvm/versions/node/v20.18.1/bin/node"),
            Some("/Users/me/.nvm/versions/node/v20.18.1"),
            Some("v20.18.1"),
            Some("v20.18.1"),
            true,
            "macos",
        );

        assert!(health
            .items
            .iter()
            .all(|item| item.key != "apple_silicon_legacy_node"));
    }

    #[test]
    fn enriches_nvm_sh_versions_with_ok_missing_and_damaged_states() {
        let temp_dir = std::env::temp_dir().join(format!(
            "nodepilot-version-state-nvm-sh-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let ok_node_path = temp_dir.join("versions/node/v22.11.0/bin/node");
        let damaged_dir = temp_dir.join("versions/node/v20.18.1");
        fs::create_dir_all(ok_node_path.parent().unwrap()).unwrap();
        fs::create_dir_all(&damaged_dir).unwrap();
        fs::write(&ok_node_path, "").unwrap();

        let detection = BackendDetection {
            kind: BackendKind::NvmSh,
            capabilities: CapabilitySet::nvm_sh(),
            nvm_dir: Some(temp_dir.display().to_string()),
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
        };
        let enriched = enrich_installed_versions(
            &detection,
            vec![
                VersionInfo::new("v22.11.0"),
                VersionInfo::new("v20.18.1"),
                VersionInfo::new("v18.20.4"),
            ],
        );

        let ok = enriched.iter().find(|item| item.version == "v22.11.0").unwrap();
        assert_eq!(ok.state, VersionState::Ok);
        assert_eq!(ok.path.as_deref(), Some(ok_node_path.display().to_string().as_str()));

        let damaged = enriched.iter().find(|item| item.version == "v20.18.1").unwrap();
        assert_eq!(damaged.state, VersionState::Damaged);
        assert!(damaged.path.is_none());

        let missing = enriched.iter().find(|item| item.version == "v18.20.4").unwrap();
        assert_eq!(missing.state, VersionState::Missing);
        assert!(missing.path.is_none());

        fs::remove_file(&ok_node_path).unwrap();
        fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn enriches_nvm_windows_versions_with_ok_missing_and_damaged_states() {
        let temp_dir = std::env::temp_dir().join(format!(
            "nodepilot-version-state-nvm-windows-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let ok_node_path = temp_dir.join("v22.11.0/node.exe");
        let damaged_dir = temp_dir.join("v20.18.1");
        fs::create_dir_all(ok_node_path.parent().unwrap()).unwrap();
        fs::create_dir_all(&damaged_dir).unwrap();
        fs::write(&ok_node_path, "").unwrap();

        let detection = BackendDetection {
            kind: BackendKind::NvmWindows,
            capabilities: CapabilitySet::nvm_windows(),
            nvm_dir: None,
            executable_path: Some("nvm.exe".into()),
            version: Some("1.2.2".into()),
            root: Some(temp_dir.display().to_string()),
            symlink_path: Some("C:\\Program Files\\nodejs".into()),
            arch: Some("64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmWindows,
                items: vec![],
            },
        };
        let enriched = enrich_installed_versions(
            &detection,
            vec![
                VersionInfo::new("22.11.0"),
                VersionInfo::new("20.18.1"),
                VersionInfo::new("18.20.4"),
            ],
        );

        let ok = enriched.iter().find(|item| item.version == "22.11.0").unwrap();
        assert_eq!(ok.state, VersionState::Ok);
        assert_eq!(ok.path.as_deref(), Some(ok_node_path.display().to_string().as_str()));

        let damaged = enriched.iter().find(|item| item.version == "20.18.1").unwrap();
        assert_eq!(damaged.state, VersionState::Damaged);
        assert!(damaged.path.is_none());

        let missing = enriched.iter().find(|item| item.version == "18.20.4").unwrap();
        assert_eq!(missing.state, VersionState::Missing);
        assert!(missing.path.is_none());

        fs::remove_file(&ok_node_path).unwrap();
        fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn parses_default_packages_ignoring_comments_and_blanks() {
        let entries = parse_default_packages("\npnpm\n# comment\ntypescript  \n\n tsx\n");

        assert_eq!(entries, vec!["pnpm", "typescript", "tsx"]);
    }

    #[test]
    fn reads_default_packages_from_nvm_dir() {
        let temp_dir = std::env::temp_dir().join(format!(
            "nodepilot-default-packages-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("default-packages");
        fs::write(&file_path, "pnpm\n\n# comment\ntsx\n").unwrap();

        let detection = BackendDetection {
            kind: BackendKind::NvmSh,
            capabilities: CapabilitySet::nvm_sh(),
            nvm_dir: Some(temp_dir.display().to_string()),
            executable_path: None,
            version: None,
            root: None,
            symlink_path: None,
            arch: Some("arm64".into()),
            health: HealthCheckResult {
                backend: BackendKind::NvmSh,
                items: vec![],
            },
        };

        let (path, exists, entries) = default_packages_state(&detection);

        assert_eq!(path.as_deref(), Some(file_path.display().to_string().as_str()));
        assert!(exists);
        assert_eq!(entries, vec!["pnpm", "tsx"]);

        fs::remove_file(&file_path).unwrap();
        fs::remove_dir(&temp_dir).unwrap();
    }
}

#[cfg(not(windows))]
fn platform_adapter_detection() -> BackendDetection {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.detect())
        .unwrap_or_else(missing_detection)
}

#[cfg(windows)]
fn platform_backend_install_guide() -> BackendInstallGuide {
    build_nvm_windows_install_guide()
}

#[cfg(not(windows))]
fn platform_backend_install_guide() -> BackendInstallGuide {
    build_nvm_sh_install_guide()
}

#[cfg(windows)]
fn platform_list_installed() -> CommandResult<Vec<VersionInfo>> {
    NvmWindowsAdapter::default().list_installed()
}

#[cfg(not(windows))]
fn platform_list_installed() -> CommandResult<Vec<VersionInfo>> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.list_installed())
        .unwrap_or_else(|| CommandResult::failed("home directory not found", ""))
}

#[cfg(windows)]
fn platform_list_remote() -> CommandResult<Vec<VersionInfo>> {
    NvmWindowsAdapter::default().list_remote()
}

#[cfg(windows)]
fn platform_install(options: InstallOptions) -> CommandResult<()> {
    NvmWindowsAdapter::default().install(&options)
}

#[cfg(windows)]
fn platform_install_command(options: InstallOptions) -> Result<SafeCommand, CommandResult<()>> {
    Ok(NvmWindowsAdapter::default().install_command(&options))
}

#[cfg(windows)]
fn platform_backend_install_command() -> Result<SafeCommand, CommandResult<()>> {
    let script = windows_install_script();
    Ok(
        SafeCommand::new(
            "powershell.exe",
            vec![
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
                "-Command".to_string(),
                script,
            ],
        )
        .with_program_context("nvm-setup.exe"),
    )
}

#[cfg(windows)]
fn platform_activate(options: ActivateOptions) -> CommandResult<()> {
    NvmWindowsAdapter::default().activate(&options)
}

#[cfg(windows)]
fn platform_set_default(version: &str) -> CommandResult<()> {
    NvmWindowsAdapter::default().set_default(version)
}

#[cfg(windows)]
fn platform_uninstall(version: &str) -> CommandResult<()> {
    NvmWindowsAdapter::default().uninstall(version)
}

#[cfg(not(windows))]
fn platform_list_remote() -> CommandResult<Vec<VersionInfo>> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.list_remote())
        .unwrap_or_else(|| CommandResult::failed("home directory not found", ""))
}

#[cfg(not(windows))]
fn platform_install(options: InstallOptions) -> CommandResult<()> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.install(&options))
        .unwrap_or_else(|| CommandResult::failed("home directory not found", ""))
}

#[cfg(not(windows))]
fn platform_install_command(options: InstallOptions) -> Result<SafeCommand, CommandResult<()>> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.install_command(&options))
        .ok_or_else(|| CommandResult::failed("home directory not found", ""))
}

#[cfg(not(windows))]
fn platform_backend_install_command() -> Result<SafeCommand, CommandResult<()>> {
    Ok(
        SafeCommand::new("bash", vec!["-lc".to_string(), nvm_sh_install_shell_command()])
            .with_program_context("nvm install script"),
    )
}

#[cfg(not(windows))]
fn platform_activate(options: ActivateOptions) -> CommandResult<()> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.activate(&options))
        .unwrap_or_else(|| CommandResult::failed("home directory not found", ""))
}

#[cfg(not(windows))]
fn platform_set_default(version: &str) -> CommandResult<()> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.set_default(version))
        .unwrap_or_else(|| CommandResult::failed("home directory not found", ""))
}

#[cfg(not(windows))]
fn platform_uninstall(version: &str) -> CommandResult<()> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.uninstall(version))
        .unwrap_or_else(|| CommandResult::failed("home directory not found", ""))
}

fn missing_detection() -> BackendDetection {
    BackendDetection {
        kind: BackendKind::Missing,
        capabilities: CapabilitySet::missing(),
        nvm_dir: None,
        executable_path: None,
        version: None,
        root: None,
        symlink_path: None,
        arch: Some(std::env::consts::ARCH.to_string()),
        health: HealthCheckResult {
            backend: BackendKind::Missing,
            items: vec![HealthCheckItem {
                key: "home_dir".into(),
                status: TaskStatus::Failed,
                summary: "home directory could not be detected".into(),
                detail: None,
            }],
        },
    }
}

#[cfg(test)]
mod install_guide_tests {
    use super::*;

    #[test]
    fn builds_nvm_sh_install_guide() {
        let guide = build_nvm_sh_install_guide();

        assert_eq!(guide.backend_kind, BackendKind::NvmSh);
        assert_eq!(guide.install_kind, BackendInstallKind::Script);
        assert_eq!(
            guide.official_source_url.as_str(),
            NVM_SH_OFFICIAL_SOURCE_URL
        );
        assert_eq!(guide.install_script_url.as_deref(), Some(NVM_SH_INSTALL_SCRIPT_URL));
        assert!(guide
            .install_command
            .as_deref()
            .is_some_and(|command| command.contains("set -o pipefail")));
        assert!(guide
            .install_command
            .as_deref()
            .is_some_and(|command| command.contains("curl -fsSL")));
        assert!(guide
            .post_install_steps
            .iter()
            .any(|step| step.contains("Open a new shell")));
    }

    #[test]
    fn builds_nvm_sh_install_command() {
        let command = platform_backend_install_command().expect("expected install command");

        assert_eq!(command.program(), "nvm install script");
    }

    #[test]
    fn builds_nvm_windows_install_guide() {
        let guide = build_nvm_windows_install_guide();

        assert_eq!(guide.backend_kind, BackendKind::NvmWindows);
        assert_eq!(guide.install_kind, BackendInstallKind::ExternalInstaller);
        assert_eq!(
            guide.official_source_url.as_str(),
            NVM_WINDOWS_OFFICIAL_SOURCE_URL
        );
        assert_eq!(guide.installer_url.as_deref(), Some(NVM_WINDOWS_INSTALLER_URL));
        assert_eq!(
            guide.target_path.as_deref(),
            Some(r"%TEMP%\nodepilot-nvm-setup.exe")
        );
        assert!(guide.requires_admin);
        assert!(guide
            .post_install_steps
            .iter()
            .any(|step| step.contains("does not perform a silent installation")));
        assert!(guide
            .post_install_steps
            .iter()
            .any(|step| step.contains("verify that `nvm.exe` is on PATH")));
    }

    #[test]
    fn builds_windows_install_script() {
        let script = windows_install_script();

        assert!(script.contains("Invoke-WebRequest"));
        assert!(script.contains("nodepilot-nvm-setup.exe"));
        assert!(script.contains("Start-Process"));
        assert!(script.contains(NVM_WINDOWS_INSTALLER_URL));
    }
}
