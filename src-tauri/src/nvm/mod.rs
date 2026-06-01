pub mod parser;
pub mod safety;
pub mod types;

use types::{
    ActivateOptions, BackendKind, CommandResult, HealthCheckResult, InstallOptions, VersionInfo,
};

pub trait NodeVersionBackend {
    fn detect(&self) -> BackendKind;
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
