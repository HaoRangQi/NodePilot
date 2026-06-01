pub mod nvm;
pub mod tasks;

use nvm::types::{BackendKind, CapabilitySet};

#[tauri::command]
fn backend_capabilities(kind: BackendKind) -> CapabilitySet {
    match kind {
        BackendKind::NvmSh => CapabilitySet::nvm_sh(),
        BackendKind::NvmWindows => CapabilitySet::nvm_windows(),
        BackendKind::Missing | BackendKind::Unsupported => CapabilitySet {
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
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![backend_capabilities])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
