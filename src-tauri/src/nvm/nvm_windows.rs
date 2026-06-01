use crate::tasks::TaskStatus;

use super::{
    parser::{parse_nvm_current, parse_nvm_windows_available, parse_nvm_windows_list},
    runner::{map_output, SafeCommand},
    types::{
        BackendDetection, BackendKind, CapabilitySet, CommandResult, HealthCheckItem,
        HealthCheckResult, VersionInfo,
    },
};

#[derive(Debug, Clone)]
pub struct NvmWindowsAdapter {
    executable: String,
}

impl Default for NvmWindowsAdapter {
    fn default() -> Self {
        Self {
            executable: "nvm.exe".into(),
        }
    }
}

impl NvmWindowsAdapter {
    pub fn detect(&self) -> BackendDetection {
        let version_result = self.run(["version"]);
        let root = self
            .run(["root"])
            .data
            .map(|value| value.trim().to_string());
        let arch = self
            .run(["arch"])
            .data
            .map(|value| value.trim().to_string());
        let installed = version_result.status == TaskStatus::Success;

        BackendDetection {
            kind: if installed {
                BackendKind::NvmWindows
            } else {
                BackendKind::Missing
            },
            capabilities: if installed {
                CapabilitySet::nvm_windows()
            } else {
                CapabilitySet::missing()
            },
            nvm_dir: None,
            executable_path: Some(self.executable.clone()),
            version: version_result.data.map(|value| value.trim().to_string()),
            root,
            arch,
            health: self.health_check(),
        }
    }

    pub fn health_check(&self) -> HealthCheckResult {
        let version_result = self.run(["version"]);
        HealthCheckResult {
            backend: if version_result.status == TaskStatus::Success {
                BackendKind::NvmWindows
            } else {
                BackendKind::Missing
            },
            items: vec![
                HealthCheckItem {
                    key: "nvm_exe".into(),
                    status: version_result.status,
                    summary: if version_result.status == TaskStatus::Success {
                        "nvm.exe detected"
                    } else {
                        "nvm.exe was not found"
                    }
                    .into(),
                    detail: version_result.message.or(Some(version_result.stderr)),
                },
                HealthCheckItem {
                    key: "admin_required".into(),
                    status: TaskStatus::Pending,
                    summary: "Windows activation may require administrator permissions".into(),
                    detail: None,
                },
            ],
        }
    }

    pub fn current(&self) -> CommandResult<String> {
        map_output(self.run(["current"]), parse_nvm_current)
    }

    pub fn list_installed(&self) -> CommandResult<Vec<VersionInfo>> {
        map_output(self.run(["list"]), parse_nvm_windows_list)
    }

    pub fn list_remote(&self) -> CommandResult<Vec<VersionInfo>> {
        map_output(self.run(["list", "available"]), parse_nvm_windows_available)
    }

    fn run<const N: usize>(&self, args: [&str; N]) -> CommandResult<String> {
        SafeCommand::new(self.executable.clone(), args).run()
    }
}
