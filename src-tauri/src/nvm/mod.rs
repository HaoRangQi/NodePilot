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
    ActivateOptions, BackendDetection, BackendKind, CapabilitySet, CommandResult, HealthCheckItem,
    HealthCheckResult, InstallOptions, VersionInfo,
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

#[cfg(windows)]
fn platform_adapter_detection() -> BackendDetection {
    NvmWindowsAdapter::default().detect()
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
