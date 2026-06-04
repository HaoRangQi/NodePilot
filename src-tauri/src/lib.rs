pub mod nvm;
pub mod tasks;

use nvm::types::{
    ActivateOptions, BackendDetection, BackendInstallGuide, CommandResult, EnvironmentSummary,
    HealthCheckResult, InstallOptions, ManualUiCommand, ManualUiCommandResult, ManualUiSnapshot,
    ProjectVersionInfo, VersionInfo,
};
use nvm::types::{BackendKind, CapabilitySet};
use tasks::{
    cancel_install_task, read_install_task, run_task, start_install_task, InstallTaskSnapshot,
    TaskAccess,
};
use std::{
    env,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

#[tauri::command]
fn backend_capabilities(kind: BackendKind) -> CapabilitySet {
    run_task(TaskAccess::Read, || match kind {
        BackendKind::NvmSh => CapabilitySet::nvm_sh(),
        BackendKind::NvmWindows => CapabilitySet::nvm_windows(),
        BackendKind::Missing | BackendKind::Unsupported => CapabilitySet::missing(),
    })
}

#[tauri::command]
fn detect_backend() -> BackendDetection {
    run_task(TaskAccess::Read, nvm::detect_backend)
}

#[tauri::command]
fn health_check() -> HealthCheckResult {
    run_task(TaskAccess::Read, nvm::health_check)
}

#[tauri::command]
fn list_installed() -> CommandResult<Vec<VersionInfo>> {
    run_task(TaskAccess::Read, nvm::list_installed)
}

#[tauri::command]
fn list_remote() -> CommandResult<Vec<VersionInfo>> {
    run_task(TaskAccess::Read, nvm::list_remote)
}

#[tauri::command]
fn install_version(options: InstallOptions) -> CommandResult<()> {
    run_task(TaskAccess::Write, || nvm::install(options))
}

#[tauri::command]
fn backend_install_guide() -> BackendInstallGuide {
    run_task(TaskAccess::Read, nvm::backend_install_guide)
}

#[tauri::command]
fn start_install_backend_task() -> Result<InstallTaskSnapshot, String> {
    let command = nvm::backend_install_command()?;
    start_install_task(command)
}

#[tauri::command]
fn start_install_version_task(options: InstallOptions) -> Result<InstallTaskSnapshot, String> {
    let command = nvm::install_command(options)?;
    start_install_task(command)
}

#[tauri::command]
fn get_install_version_task(task_id: String) -> Option<InstallTaskSnapshot> {
    read_install_task(&task_id)
}

#[tauri::command]
fn cancel_install_version_task(task_id: String) -> Option<InstallTaskSnapshot> {
    cancel_install_task(&task_id)
}

#[tauri::command]
fn activate_version(options: ActivateOptions) -> CommandResult<()> {
    run_task(TaskAccess::Write, || nvm::activate(options))
}

#[tauri::command]
fn set_default_version(version: String) -> CommandResult<()> {
    run_task(TaskAccess::Write, || nvm::set_default(&version))
}

#[tauri::command]
fn uninstall_version(version: String) -> CommandResult<()> {
    run_task(TaskAccess::Write, || nvm::uninstall(&version))
}

#[tauri::command]
fn environment_summary() -> EnvironmentSummary {
    run_task(TaskAccess::Read, nvm::environment_summary)
}

#[tauri::command]
fn read_project_version(project_dir: String) -> CommandResult<ProjectVersionInfo> {
    run_task(TaskAccess::Read, || nvm::read_project_version(&project_dir))
}

#[tauri::command]
fn write_project_version(project_dir: String, version: String) -> CommandResult<ProjectVersionInfo> {
    run_task(TaskAccess::Write, || nvm::write_project_version(&project_dir, &version))
}

#[tauri::command]
fn write_manual_ui_snapshot(snapshot: ManualUiSnapshot) -> Result<(), String> {
    let target_path = manual_ui_snapshot_path()?;
    write_manual_ui_snapshot_to_path(&target_path, &snapshot)
}

#[tauri::command]
fn take_manual_ui_command() -> Result<Option<ManualUiCommand>, String> {
    let target_path = manual_ui_command_path()?;
    take_manual_ui_command_from_path(&target_path)
}

#[tauri::command]
fn write_manual_ui_command_result(result: ManualUiCommandResult) -> Result<(), String> {
    let target_path = manual_ui_command_result_path()?;
    write_manual_ui_command_result_to_path(&target_path, &result)
}

fn manual_ui_snapshot_path() -> Result<PathBuf, String> {
    let value = env::var("NODEPILOT_MANUAL_UI_SNAPSHOT_PATH")
        .map_err(|_| "manual ui snapshot path is not configured".to_string())?;
    nvm::safety::validate_path(&value)?;
    Ok(PathBuf::from(value))
}

fn manual_ui_command_path() -> Result<PathBuf, String> {
    let value = env::var("NODEPILOT_MANUAL_UI_COMMAND_PATH")
        .map_err(|_| "manual ui command path is not configured".to_string())?;
    nvm::safety::validate_path(&value)?;
    Ok(PathBuf::from(value))
}

fn manual_ui_command_result_path() -> Result<PathBuf, String> {
    let value = env::var("NODEPILOT_MANUAL_UI_COMMAND_RESULT_PATH")
        .map_err(|_| "manual ui command result path is not configured".to_string())?;
    nvm::safety::validate_path(&value)?;
    Ok(PathBuf::from(value))
}

fn write_manual_ui_snapshot_to_path(path: &Path, snapshot: &ManualUiSnapshot) -> Result<(), String> {
    let _guard = manual_ui_snapshot_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to prepare manual ui snapshot directory: {error}"))?;
    }

    let content = serde_json::to_string_pretty(snapshot)
        .map_err(|error| format!("failed to serialize manual ui snapshot: {error}"))?;
    fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("failed to write manual ui snapshot: {error}"))
}

fn take_manual_ui_command_from_path(path: &Path) -> Result<Option<ManualUiCommand>, String> {
    let _guard = manual_ui_command_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("failed to read manual ui command: {error}"))?;
    let command = serde_json::from_str::<ManualUiCommand>(&content)
        .map_err(|error| format!("failed to parse manual ui command: {error}"))?;
    fs::remove_file(path).map_err(|error| format!("failed to consume manual ui command: {error}"))?;
    Ok(Some(command))
}

fn write_manual_ui_command_result_to_path(
    path: &Path,
    result: &ManualUiCommandResult,
) -> Result<(), String> {
    let _guard = manual_ui_command_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to prepare manual ui command result directory: {error}"))?;
    }

    let content = serde_json::to_string_pretty(result)
        .map_err(|error| format!("failed to serialize manual ui command result: {error}"))?;
    fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("failed to write manual ui command result: {error}"))
}

fn manual_ui_snapshot_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn manual_ui_command_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            backend_capabilities,
            detect_backend,
            health_check,
            list_installed,
            list_remote,
            install_version,
            backend_install_guide,
            start_install_backend_task,
            start_install_version_task,
            get_install_version_task,
            cancel_install_version_task,
            activate_version,
            set_default_version,
            uninstall_version,
            environment_summary,
            read_project_version,
            write_project_version,
            write_manual_ui_snapshot,
            take_manual_ui_command,
            write_manual_ui_command_result
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_manual_ui_snapshot_json() {
        let temp_dir = std::env::temp_dir().join(format!(
            "nodepilot-manual-ui-{}",
            std::process::id()
        ));
        let target_path = temp_dir.join("snapshot.json");

        let snapshot = ManualUiSnapshot {
            schema_version: 1,
            captured_at: "2026-06-03T00:00:00.000Z".into(),
            viewport: nvm::types::ManualUiViewport {
                width: 1280,
                height: 820,
            },
            window: Some(nvm::types::ManualUiWindowSnapshot {
                scale_factor: Some(2.0),
                inner_position_physical: Some(nvm::types::ManualUiPoint { x: 1380, y: 452 }),
                outer_position_physical: Some(nvm::types::ManualUiPoint { x: 1380, y: 388 }),
                inner_size_physical: Some(nvm::types::ManualUiSize {
                    width: 2360,
                    height: 1456,
                }),
                outer_size_physical: Some(nvm::types::ManualUiSize {
                    width: 2360,
                    height: 1520,
                }),
                client_origin_logical: Some(nvm::types::ManualUiPoint { x: 690, y: 226 }),
                client_origin_physical: Some(nvm::types::ManualUiPoint { x: 1380, y: 452 }),
            }),
            app: nvm::types::ManualUiSnapshotAppState {
                screen: "home".into(),
                title: "Home".into(),
                locale: "zh-CN".into(),
                theme: "dark".into(),
                backend_kind: "missing".into(),
                current_node_version: None,
                default_version: None,
                version_source: "unknown".into(),
                selected_project_dir: None,
                selected_project_version: None,
                activity_task_count: 0,
                running_task_count: 0,
                write_locked: false,
                manual_bridge_last_command_id: None,
                manual_bridge_last_command_status: None,
                manual_bridge_last_error: None,
                flags: nvm::types::ManualUiSnapshotFlags {
                    backend_install_pending: false,
                    version_action_pending: false,
                    remote_loading: false,
                    remote_install_pending: false,
                    project_install_pending: false,
                    project_write_pending: false,
                },
            },
            dialogs: vec![],
            elements: vec![],
        };

        write_manual_ui_snapshot_to_path(&target_path, &snapshot).expect("write manual ui snapshot");

        let written = fs::read_to_string(&target_path).expect("read snapshot");
        assert!(written.contains("\"schemaVersion\": 1"));
        assert!(written.contains("\"screen\": \"home\""));
        assert!(written.contains("\"window\""));
        assert!(written.contains("\"clientOriginLogical\""));

        let _ = fs::remove_file(&target_path);
        let _ = fs::remove_dir(&temp_dir);
    }

    #[test]
    fn takes_manual_ui_command_and_writes_result_json() {
        let temp_dir = std::env::temp_dir().join(format!(
            "nodepilot-manual-ui-command-{}",
            std::process::id()
        ));
        let command_path = temp_dir.join("command.json");
        let result_path = temp_dir.join("result.json");
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let command = nvm::types::ManualUiCommand {
            id: "cmd-1".into(),
            kind: "navigate".into(),
            screen: Some("versions".into()),
            manual_id: None,
            project_dir: None,
        };
        let command_json =
            serde_json::to_string_pretty(&command).expect("serialize manual ui command");
        fs::write(&command_path, format!("{command_json}\n")).expect("write command");

        let taken = take_manual_ui_command_from_path(&command_path)
            .expect("take command")
            .expect("command present");
        assert_eq!(taken, command);
        assert!(!command_path.exists());

        let result = nvm::types::ManualUiCommandResult {
            id: "cmd-1".into(),
            kind: "navigate".into(),
            status: "success".into(),
            message: None,
            completed_at: "2026-06-03T00:00:00.000Z".into(),
            screen: "versions".into(),
            dialog_titles: vec!["Install remote release".into()],
        };
        write_manual_ui_command_result_to_path(&result_path, &result)
            .expect("write manual ui command result");

        let written = fs::read_to_string(&result_path).expect("read result");
        assert!(written.contains("\"id\": \"cmd-1\""));
        assert!(written.contains("\"kind\": \"navigate\""));
        assert!(written.contains("\"screen\": \"versions\""));
        assert!(written.contains("\"dialogTitles\""));

        let _ = fs::remove_file(&result_path);
        let _ = fs::remove_dir(&temp_dir);
    }
}
