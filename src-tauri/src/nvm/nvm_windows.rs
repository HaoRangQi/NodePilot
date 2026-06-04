use std::{env, path::PathBuf};

use crate::tasks::TaskStatus;

use super::{
    parser::{parse_nvm_current, parse_nvm_windows_available, parse_nvm_windows_list},
    runner::{into_unit_result, map_output, SafeCommand},
    types::{
        ActivateOptions, BackendDetection, BackendKind, CapabilitySet, CommandResult,
        HealthCheckItem, HealthCheckResult, InstallOptions, VersionInfo,
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
        let symlink_path = symlink_path_from_root(root.as_deref());
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
            symlink_path,
            arch,
            health: self.health_check(),
        }
    }

    pub fn health_check(&self) -> HealthCheckResult {
        let version_result = self.run(["version"]);
        let root = self
            .run(["root"])
            .data
            .map(|value| value.trim().to_string());
        let symlink_path = symlink_path_from_root(root.as_deref());
        let where_node = SafeCommand::new("where.exe", ["node"]).run();
        let admin_elevation = admin_elevation_status();
        let mut items = vec![
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
                ..admin_permission_health(admin_elevation, None)
            },
        ];

        if version_result.status == TaskStatus::Success {
            items.push(windows_node_install_conflict_health(
                root.as_deref(),
                symlink_path.as_deref(),
                where_node.data.as_deref(),
            ));
        }

        HealthCheckResult {
            backend: if version_result.status == TaskStatus::Success {
                BackendKind::NvmWindows
            } else {
                BackendKind::Missing
            },
            items,
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

    pub fn install(&self, options: &InstallOptions) -> CommandResult<()> {
        into_unit_result(self.run(install_args(options)))
    }

    pub fn install_command(&self, options: &InstallOptions) -> SafeCommand {
        SafeCommand::new(self.executable.clone(), install_args(options))
            .with_program_context(self.executable.clone())
    }

    pub fn activate(&self, options: &ActivateOptions) -> CommandResult<()> {
        into_unit_result(self.run(activate_args(options)))
    }

    pub fn uninstall(&self, version: &str) -> CommandResult<()> {
        into_unit_result(self.run(["uninstall", version]))
    }

    pub fn set_default(&self, _version: &str) -> CommandResult<()> {
        CommandResult::failed("set default is not supported by nvm-windows", "")
    }

    fn run(&self, args: impl IntoIterator<Item = impl Into<String>>) -> CommandResult<String> {
        SafeCommand::new(self.executable.clone(), args).run()
    }
}

fn symlink_path_from_root(root: Option<&str>) -> Option<String> {
    env::var("NVM_SYMLINK")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let settings_path = PathBuf::from(root?).join("settings.txt");
            let content = std::fs::read_to_string(settings_path).ok()?;
            content
                .lines()
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    key.trim()
                        .eq_ignore_ascii_case("path")
                        .then(|| value.trim().to_string())
                        .filter(|path| !path.is_empty())
                })
        })
}

fn windows_node_install_conflict_health(
    root: Option<&str>,
    symlink_path: Option<&str>,
    where_node_output: Option<&str>,
) -> HealthCheckItem {
    let managed_paths = [root, symlink_path]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let entries = where_node_output
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    let is_managed = |path: &str| {
        managed_paths
            .iter()
            .any(|managed| windows_path_starts_with(path, managed))
    };
    let first_entry = entries.first().copied();
    let first_is_managed = first_entry.is_some_and(is_managed);
    let has_managed_entry = entries.iter().copied().any(is_managed);
    let has_unmanaged_after_first = entries.iter().skip(1).copied().any(|path| !is_managed(path));
    let detail = where_node_output.map(|output| {
        let managed = managed_paths.join("\n");
        if managed.is_empty() {
            output.trim().to_string()
        } else {
            format!("managed paths:\n{managed}\n\nwhere node:\n{}", output.trim())
        }
    });

    let (status, summary) = if entries.is_empty() {
        (
            TaskStatus::Pending,
            "Unable to verify whether a legacy Node installation still appears in PATH".into(),
        )
    } else if !first_is_managed && has_managed_entry {
        (
            TaskStatus::Failed,
            "A legacy Node installation appears earlier in PATH than the nvm-windows managed node.exe"
                .into(),
        )
    } else if first_is_managed && has_unmanaged_after_first {
        (
            TaskStatus::Pending,
            "PATH still contains additional Node installations after the nvm-windows managed symlink"
                .into(),
        )
    } else if !first_is_managed {
        (
            TaskStatus::Failed,
            "The active node.exe does not appear to come from an nvm-windows managed path".into(),
        )
    } else {
        (
            TaskStatus::Success,
            "No competing global Node installation appears ahead of nvm-windows in PATH".into(),
        )
    };

    HealthCheckItem {
        key: "windows_node_install_conflict".into(),
        status,
        summary,
        detail,
    }
}

fn windows_path_starts_with(path: &str, prefix: &str) -> bool {
    let normalized_path = path.trim().replace('/', "\\").to_ascii_lowercase();
    let normalized_prefix = prefix.trim().replace('/', "\\").to_ascii_lowercase();
    normalized_path.starts_with(&normalized_prefix)
}

fn install_args(options: &InstallOptions) -> Vec<String> {
    let mut args = vec!["install".to_string(), options.version.trim().to_string()];
    if let Some(arch) = options.arch.as_deref() {
        args.push(arch.trim().to_string());
    }
    args
}

fn activate_args(options: &ActivateOptions) -> Vec<String> {
    let mut args = vec!["use".to_string(), options.version.trim().to_string()];
    if let Some(arch) = options.arch.as_deref() {
        args.push(arch.trim().to_string());
    }
    args
}

fn admin_elevation_status() -> Option<bool> {
    let result = SafeCommand::new(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
        ],
    )
    .run();

    if result.status != TaskStatus::Success {
        return None;
    }

    match result.data.as_deref().map(str::trim) {
        Some("True") => Some(true),
        Some("False") => Some(false),
        _ => None,
    }
}

fn admin_permission_health(is_elevated: Option<bool>, detail: Option<String>) -> HealthCheckItem {
    let (status, summary, default_detail) = match is_elevated {
        Some(true) => (
            TaskStatus::Success,
            "Windows activation has administrator permissions available".into(),
            None,
        ),
        Some(false) => (
            TaskStatus::Failed,
            "Windows activation requires running the app as administrator".into(),
            Some("nvm-windows `use` can fail without an elevated process.".into()),
        ),
        None => (
            TaskStatus::Pending,
            "Windows activation may require administrator permissions".into(),
            Some("The current process elevation could not be verified.".into()),
        ),
    };

    HealthCheckItem {
        key: "admin_required".into(),
        status,
        summary,
        detail: detail.or(default_detail),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_symlink_path_from_settings_file() {
        let root = std::env::temp_dir().join("nodepilot-nvm-windows-settings");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("settings.txt"),
            "root: C:\\Users\\me\\AppData\\Roaming\\nvm\npath: C:\\Program Files\\nodejs\narch: 64\n",
        )
        .unwrap();

        let symlink_path = symlink_path_from_root(Some(root.to_str().unwrap()));
        assert_eq!(symlink_path.as_deref(), Some("C:\\Program Files\\nodejs"));

        std::fs::remove_file(root.join("settings.txt")).unwrap();
        std::fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn reports_failed_conflict_when_legacy_node_precedes_managed_path() {
        let item = windows_node_install_conflict_health(
            Some("C:\\Users\\me\\AppData\\Roaming\\nvm"),
            Some("C:\\Program Files\\nodejs"),
            Some(
                "C:\\tools\\nodejs\\node.exe\r\nC:\\Program Files\\nodejs\\node.exe\r\n",
            ),
        );

        assert_eq!(item.key, "windows_node_install_conflict");
        assert_eq!(item.status, TaskStatus::Failed);
        assert!(item.summary.contains("earlier in PATH"));
    }

    #[test]
    fn reports_pending_conflict_when_extra_node_install_remains_after_symlink() {
        let item = windows_node_install_conflict_health(
            Some("C:\\Users\\me\\AppData\\Roaming\\nvm"),
            Some("C:\\Program Files\\nodejs"),
            Some(
                "C:\\Program Files\\nodejs\\node.exe\r\nC:\\tools\\nodejs\\node.exe\r\n",
            ),
        );

        assert_eq!(item.key, "windows_node_install_conflict");
        assert_eq!(item.status, TaskStatus::Pending);
        assert!(item.summary.contains("additional Node installations"));
    }

    #[test]
    fn marks_admin_activation_check_failed_when_not_elevated() {
        let item = admin_permission_health(Some(false), None);

        assert_eq!(item.key, "admin_required");
        assert_eq!(item.status, TaskStatus::Failed);
        assert!(item.summary.contains("administrator"));
    }

    #[test]
    fn marks_admin_activation_check_success_when_elevated() {
        let item = admin_permission_health(Some(true), None);

        assert_eq!(item.key, "admin_required");
        assert_eq!(item.status, TaskStatus::Success);
        assert!(item.summary.contains("administrator"));
    }

    #[test]
    fn marks_admin_activation_check_pending_when_unknown() {
        let item = admin_permission_health(None, None);

        assert_eq!(item.key, "admin_required");
        assert_eq!(item.status, TaskStatus::Pending);
        assert!(
            item.detail
                .as_deref()
                .is_some_and(|detail| detail.contains("could not be verified"))
        );
    }

    #[test]
    fn builds_install_args_with_arch() {
        let args = install_args(&InstallOptions {
            version: "20.18.1".into(),
            arch: Some("64".into()),
            reinstall_packages_from: None,
            latest_npm: false,
            source_install: false,
        });

        assert_eq!(args, vec!["install", "20.18.1", "64"]);
    }

    #[test]
    fn builds_activate_args_with_arch() {
        let args = activate_args(&ActivateOptions {
            version: "20.18.1".into(),
            arch: Some("64".into()),
        });

        assert_eq!(args, vec!["use", "20.18.1", "64"]);
    }
}
