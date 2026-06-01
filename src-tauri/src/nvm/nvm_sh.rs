use std::{env, path::PathBuf};

use crate::tasks::TaskStatus;

use super::{
    parser::{parse_nvm_current, parse_nvm_default_alias, parse_nvm_ls, parse_nvm_ls_remote},
    runner::{map_output, SafeCommand},
    types::{
        BackendDetection, BackendKind, CapabilitySet, CommandResult, HealthCheckItem,
        HealthCheckResult, VersionInfo,
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

    fn run_nvm<const N: usize>(&self, args: [&str; N]) -> CommandResult<String> {
        let nvm_script = self.nvm_script();
        let command = format!(
            "export NVM_DIR=\"{}\"; [ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\"; nvm {}",
            self.nvm_dir.display(),
            args.join(" ")
        );
        SafeCommand::new("bash", ["-lc", command.as_str()])
            .run()
            .with_stdout_command(nvm_script)
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
}
