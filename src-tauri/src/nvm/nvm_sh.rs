use std::{env, path::PathBuf};

use crate::tasks::TaskStatus;

use super::{
    parser::{parse_nvm_current, parse_nvm_default_alias, parse_nvm_ls, parse_nvm_ls_remote},
    runner::{into_unit_result, map_output, SafeCommand},
    types::{
        ActivateOptions, BackendDetection, BackendKind, CapabilitySet, CommandResult,
        HealthCheckItem, HealthCheckResult, InstallOptions, VersionInfo,
    },
};

const PROFILE_FILES: [&str; 4] = [".zshrc", ".bashrc", ".bash_profile", ".profile"];

#[derive(Debug, Clone)]
pub struct NvmShAdapter {
    home_dir: PathBuf,
    nvm_dir: PathBuf,
}

impl NvmShAdapter {
    pub fn from_env() -> Option<Self> {
        let home_dir = home_dir()?;
        let nvm_dir = env::var("NVM_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home_dir.join(".nvm"));
        Some(Self { home_dir, nvm_dir })
    }

    pub fn detect(&self) -> BackendDetection {
        let nvm_script = self.nvm_script();
        let nvm_loaded = env::var("NVM_DIR").is_ok();
        let script_exists = nvm_script.is_file();
        let version = script_exists
            .then(|| self.run_nvm(["--version"]).data)
            .flatten()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let kind = if script_exists {
            BackendKind::NvmSh
        } else {
            BackendKind::Missing
        };

        BackendDetection {
            kind,
            capabilities: if kind == BackendKind::NvmSh {
                CapabilitySet::nvm_sh()
            } else {
                CapabilitySet::missing()
            },
            nvm_dir: Some(self.nvm_dir.display().to_string()),
            executable_path: Some(nvm_script.display().to_string()),
            version,
            root: None,
            symlink_path: None,
            arch: Some(env::consts::ARCH.to_string()),
            health: self.health_check(),
        }
        .with_loaded_hint(nvm_loaded)
    }

    pub fn health_check(&self) -> HealthCheckResult {
        let nvm_script = self.nvm_script();
        let mut items = vec![
            health_item(
                "nvm_script",
                nvm_script.is_file(),
                "~/.nvm/nvm.sh detected",
                "~/.nvm/nvm.sh is missing",
                Some(nvm_script.display().to_string()),
            ),
            health_item(
                "nvm_dir_env",
                env::var("NVM_DIR").is_ok(),
                "NVM_DIR is set",
                "NVM_DIR is not set for this process",
                env::var("NVM_DIR").ok(),
            ),
        ];

        for profile in PROFILE_FILES {
            let path = self.home_dir.join(profile);
            let loaded = std::fs::read_to_string(&path)
                .map(|content| content.contains("nvm.sh") || content.contains("NVM_DIR"))
                .unwrap_or(false);
            items.push(health_item(
                &format!("profile_{profile}"),
                loaded,
                &format!("{profile} loads nvm"),
                &format!("{profile} has no nvm snippet"),
                path.exists().then(|| path.display().to_string()),
            ));
        }

        HealthCheckResult {
            backend: if nvm_script.is_file() {
                BackendKind::NvmSh
            } else {
                BackendKind::Missing
            },
            items,
        }
    }

    pub fn current(&self) -> CommandResult<String> {
        map_output(self.run_nvm(["current"]), parse_nvm_current)
    }

    pub fn default_alias(&self) -> CommandResult<Option<String>> {
        map_output(self.run_nvm(["alias", "default"]), parse_nvm_default_alias)
    }

    pub fn list_installed(&self) -> CommandResult<Vec<VersionInfo>> {
        map_output(self.run_nvm(["ls", "--no-colors"]), parse_nvm_ls)
    }

    pub fn list_remote(&self) -> CommandResult<Vec<VersionInfo>> {
        map_output(
            self.run_nvm(["ls-remote", "--no-colors"]),
            parse_nvm_ls_remote,
        )
    }

    pub fn install(&self, options: &InstallOptions) -> CommandResult<()> {
        into_unit_result(self.run_nvm(install_args(options)))
    }

    pub fn install_command(&self, options: &InstallOptions) -> SafeCommand {
        self.nvm_command(install_args(options))
    }

    pub fn activate(&self, options: &ActivateOptions) -> CommandResult<()> {
        into_unit_result(self.run_nvm(activate_args(options)))
    }

    pub fn set_default(&self, version: &str) -> CommandResult<()> {
        into_unit_result(self.run_nvm(["alias", "default", version]))
    }

    pub fn uninstall(&self, version: &str) -> CommandResult<()> {
        into_unit_result(self.run_nvm(["uninstall", version]))
    }

    fn run_nvm(&self, args: impl IntoIterator<Item = impl Into<String>>) -> CommandResult<String> {
        self.nvm_command(args).run().with_stdout_command(self.nvm_script())
    }

    fn nvm_command(&self, args: impl IntoIterator<Item = impl Into<String>>) -> SafeCommand {
        let nvm_script = self.nvm_script();
        let mut command_args = vec![
            "-lc".to_string(),
            r#"export NVM_DIR="$1"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; shift; nvm "$@""#
                .to_string(),
            "nodepilot-nvm".to_string(),
            self.nvm_dir.display().to_string(),
        ];
        command_args.extend(args.into_iter().map(Into::into));
        SafeCommand::new("bash", command_args).with_program_context(nvm_script.display().to_string())
    }

    fn nvm_script(&self) -> PathBuf {
        self.nvm_dir.join("nvm.sh")
    }
}

trait DetectionExt {
    fn with_loaded_hint(self, loaded: bool) -> Self;
}

impl DetectionExt for BackendDetection {
    fn with_loaded_hint(mut self, loaded: bool) -> Self {
        if !loaded {
            self.health.items.push(HealthCheckItem {
                key: "nvm_loaded".into(),
                status: TaskStatus::Failed,
                summary: "nvm is not loaded in the current process".into(),
                detail: None,
            });
        }
        self
    }
}

trait CommandResultExt {
    fn with_stdout_command(self, _nvm_script: PathBuf) -> Self;
}

impl CommandResultExt for CommandResult<String> {
    fn with_stdout_command(self, _nvm_script: PathBuf) -> Self {
        self
    }
}

fn install_args(options: &InstallOptions) -> Vec<String> {
    let mut args = vec!["install".to_string()];
    if options.source_install {
        args.push("-s".to_string());
    }
    args.push(options.version.trim().to_string());
    if let Some(reinstall_from) = options.reinstall_packages_from.as_deref() {
        args.push(format!(
            "--reinstall-packages-from={}",
            reinstall_from.trim()
        ));
    }
    if options.latest_npm {
        args.push("--latest-npm".to_string());
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

fn health_item(
    key: &str,
    passed: bool,
    success: &str,
    failure: &str,
    detail: Option<String>,
) -> HealthCheckItem {
    HealthCheckItem {
        key: key.into(),
        status: if passed {
            TaskStatus::Success
        } else {
            TaskStatus::Failed
        },
        summary: if passed { success } else { failure }.into(),
        detail,
    }
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_home_nvm_dir_when_env_missing() {
        let adapter = NvmShAdapter {
            home_dir: PathBuf::from("/tmp/home"),
            nvm_dir: PathBuf::from("/tmp/home/.nvm"),
        };
        assert_eq!(adapter.nvm_script(), PathBuf::from("/tmp/home/.nvm/nvm.sh"));
    }

    #[test]
    fn builds_install_args() {
        let args = install_args(&InstallOptions {
            version: "lts/*".into(),
            arch: None,
            reinstall_packages_from: Some("v20.18.1".into()),
            latest_npm: true,
            source_install: true,
        });

        assert_eq!(
            args,
            vec![
                "install",
                "-s",
                "lts/*",
                "--reinstall-packages-from=v20.18.1",
                "--latest-npm",
            ]
        );
    }

    #[test]
    fn builds_activate_args() {
        let args = activate_args(&ActivateOptions {
            version: "v22.11.0".into(),
            arch: None,
        });

        assert_eq!(args, vec!["use", "v22.11.0"]);
    }
}
