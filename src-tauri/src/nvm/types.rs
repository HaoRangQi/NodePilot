use serde::{Deserialize, Serialize};

use crate::tasks::TaskStatus;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackendKind {
    NvmSh,
    NvmWindows,
    Missing,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitySet {
    pub can_install: bool,
    pub can_uninstall: bool,
    pub can_activate: bool,
    pub can_set_default: bool,
    pub supports_alias: bool,
    pub supports_project_nvmrc: bool,
    pub supports_arch_selection: bool,
    pub supports_proxy: bool,
    pub supports_mirror: bool,
    pub supports_source_install: bool,
    pub supports_offline_install: bool,
    pub requires_admin_for_activation: bool,
}

impl CapabilitySet {
    pub fn missing() -> Self {
        Self {
            can_install: false,
            can_uninstall: false,
            can_activate: false,
            can_set_default: false,
            supports_alias: false,
            supports_project_nvmrc: false,
            supports_arch_selection: false,
            supports_proxy: false,
            supports_mirror: false,
            supports_source_install: false,
            supports_offline_install: false,
            requires_admin_for_activation: false,
        }
    }

    pub fn nvm_sh() -> Self {
        Self {
            can_install: true,
            can_uninstall: true,
            can_activate: true,
            can_set_default: true,
            supports_alias: true,
            supports_project_nvmrc: true,
            supports_arch_selection: false,
            supports_proxy: true,
            supports_mirror: true,
            supports_source_install: true,
            supports_offline_install: false,
            requires_admin_for_activation: false,
        }
    }

    pub fn nvm_windows() -> Self {
        Self {
            can_install: true,
            can_uninstall: true,
            can_activate: true,
            can_set_default: false,
            supports_alias: false,
            supports_project_nvmrc: false,
            supports_arch_selection: true,
            supports_proxy: true,
            supports_mirror: false,
            supports_source_install: false,
            supports_offline_install: false,
            requires_admin_for_activation: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub version: String,
    pub npm_version: Option<String>,
    pub path: Option<String>,
    pub arch: Option<String>,
    pub is_current: bool,
    pub is_default: bool,
    pub is_lts: bool,
    pub is_system: bool,
    pub line: Option<String>,
}

impl VersionInfo {
    pub fn new(version: impl Into<String>) -> Self {
        Self {
            version: version.into(),
            npm_version: None,
            path: None,
            arch: None,
            is_current: false,
            is_default: false,
            is_lts: false,
            is_system: false,
            line: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVersionInfo {
    pub version: String,
    pub line: Option<String>,
    pub is_lts: bool,
    pub is_latest: bool,
    pub is_installed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckItem {
    pub key: String,
    pub status: TaskStatus,
    pub summary: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckResult {
    pub backend: BackendKind,
    pub items: Vec<HealthCheckItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendDetection {
    pub kind: BackendKind,
    pub capabilities: CapabilitySet,
    pub nvm_dir: Option<String>,
    pub executable_path: Option<String>,
    pub version: Option<String>,
    pub root: Option<String>,
    pub arch: Option<String>,
    pub health: HealthCheckResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSummary {
    pub current_node_version: Option<String>,
    pub npm_version: Option<String>,
    pub pnpm_version: Option<String>,
    pub yarn_version: Option<String>,
    pub node_path: Option<String>,
    pub npm_path: Option<String>,
    pub backend_kind: BackendKind,
    pub platform: String,
    pub arch: String,
    pub version_source: String,
    pub default_version: Option<String>,
    pub default_exists: bool,
    pub default_matches_current: bool,
    pub health: HealthCheckResult,
    pub installed_versions: Vec<VersionInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult<T> {
    pub status: TaskStatus,
    pub data: Option<T>,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
}

impl<T> CommandResult<T> {
    pub fn success(data: T) -> Self {
        Self {
            status: TaskStatus::Success,
            data: Some(data),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: Some(0),
            message: None,
        }
    }

    pub fn failed(message: impl Into<String>, stderr: impl Into<String>) -> Self {
        Self {
            status: TaskStatus::Failed,
            data: None,
            stdout: String::new(),
            stderr: stderr.into(),
            exit_code: None,
            message: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    pub version: String,
    pub arch: Option<String>,
    pub reinstall_packages_from: Option<String>,
    pub latest_npm: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateOptions {
    pub version: String,
    pub arch: Option<String>,
}
