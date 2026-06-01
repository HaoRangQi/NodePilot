pub mod nvm_sh;
pub mod nvm_windows;
pub mod parser;
pub mod runner;
pub mod safety;
pub mod types;

use crate::tasks::TaskStatus;

use nvm_sh::NvmShAdapter;
#[cfg(windows)]
use nvm_windows::NvmWindowsAdapter;
use types::{
    ActivateOptions, BackendDetection, BackendKind, CapabilitySet, CommandResult,
    EnvironmentSummary, HealthCheckItem, HealthCheckResult, InstallOptions, VersionInfo,
};

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
    platform_health_check()
}

pub fn list_installed() -> CommandResult<Vec<VersionInfo>> {
    platform_list_installed()
}

pub fn list_remote() -> CommandResult<Vec<VersionInfo>> {
    platform_list_remote()
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
    let health = environment_health(
        detection.health.clone(),
        &detection,
        node_path.as_deref(),
        npm_prefix.as_deref(),
        default_version.as_deref(),
        default_exists,
    );
    let version_source = version_source(
        detection.kind,
        &installed_versions,
        node_path.as_deref(),
        &detection,
    );

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
    let backend_root = detection.nvm_dir.as_deref().or(detection.root.as_deref());
    let path_matches_backend = node_path
        .zip(backend_root)
        .is_some_and(|(path, root)| path.starts_with(root));

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

fn versions_match(left: &str, right: &str) -> bool {
    normalize_version(left) == normalize_version(right)
}

fn normalize_version(version: &str) -> &str {
    version.trim().trim_start_matches('v')
}

fn command_text<const N: usize>(program: &str, args: [&str; N]) -> Option<String> {
    runner::SafeCommand::new(program, args)
        .run()
        .data
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn environment_health(
    mut health: HealthCheckResult,
    detection: &BackendDetection,
    node_path: Option<&str>,
    npm_prefix: Option<&str>,
    default_version: Option<&str>,
    default_exists: bool,
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

    health
}

fn node_path_health(detection: &BackendDetection, node_path: Option<&str>) -> HealthCheckItem {
    let path = node_path.unwrap_or_default();
    let expected_root = detection.nvm_dir.as_deref().or(detection.root.as_deref());
    let path_matches_backend = expected_root.is_some_and(|root| path.starts_with(root));
    let backend_managed = matches!(detection.kind, BackendKind::NvmSh | BackendKind::NvmWindows);
    let ok = !backend_managed || path_matches_backend;

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
    let expected_root = detection.nvm_dir.as_deref().or(detection.root.as_deref());
    let backend_managed = matches!(detection.kind, BackendKind::NvmSh | BackendKind::NvmWindows);
    let ok = !backend_managed
        || prefix.is_empty()
        || expected_root.is_some_and(|root| prefix.starts_with(root));

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
                arch: Some("arm64".into()),
                health: HealthCheckResult {
                    backend: BackendKind::NvmSh,
                    items: vec![],
                },
            },
            Some("/Users/me/.nvm/versions/node/v22.11.0/bin/node"),
            Some("/usr/local"),
            Some("v20.18.1"),
            false,
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
}

#[cfg(not(windows))]
fn platform_adapter_detection() -> BackendDetection {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.detect())
        .unwrap_or_else(missing_detection)
}

#[cfg(windows)]
fn platform_health_check() -> HealthCheckResult {
    NvmWindowsAdapter::default().health_check()
}

#[cfg(not(windows))]
fn platform_health_check() -> HealthCheckResult {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.health_check())
        .unwrap_or_else(|| missing_detection().health)
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

#[cfg(not(windows))]
fn platform_list_remote() -> CommandResult<Vec<VersionInfo>> {
    NvmShAdapter::from_env()
        .map(|adapter| adapter.list_remote())
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
