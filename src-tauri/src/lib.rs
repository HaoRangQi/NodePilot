pub mod nvm;
pub mod tasks;

use nvm::types::{
    BackendDetection, CommandResult, EnvironmentSummary, HealthCheckResult, VersionInfo,
};
use nvm::types::{BackendKind, CapabilitySet};

#[tauri::command]
fn backend_capabilities(kind: BackendKind) -> CapabilitySet {
    match kind {
        BackendKind::NvmSh => CapabilitySet::nvm_sh(),
        BackendKind::NvmWindows => CapabilitySet::nvm_windows(),
        BackendKind::Missing | BackendKind::Unsupported => CapabilitySet::missing(),
    }
}

#[tauri::command]
fn detect_backend() -> BackendDetection {
    nvm::detect_backend()
}

#[tauri::command]
fn health_check() -> HealthCheckResult {
    nvm::health_check()
}

#[tauri::command]
fn list_installed() -> CommandResult<Vec<VersionInfo>> {
    nvm::list_installed()
}

#[tauri::command]
fn list_remote() -> CommandResult<Vec<VersionInfo>> {
    nvm::list_remote()
}

#[tauri::command]
fn environment_summary() -> EnvironmentSummary {
    nvm::environment_summary()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            backend_capabilities,
            detect_backend,
            health_check,
            list_installed,
            list_remote,
            environment_summary
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
