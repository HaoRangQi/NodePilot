use serde::Serialize;

#[cfg(windows)]
use std::process;

#[cfg(windows)]
use nodepilot_lib::{
    nvm::{
        self,
        types::{ActivateOptions, BackendKind, InstallOptions, VersionInfo},
    },
    tasks::TaskStatus,
};

#[derive(Debug, Serialize)]
struct StepReport {
    step: String,
    ok: bool,
    detail: String,
}

#[derive(Debug, Serialize)]
struct VerificationReport {
    platform: String,
    write_enabled: bool,
    target_version: Option<String>,
    steps: Vec<StepReport>,
}

#[cfg(not(windows))]
fn main() {
    let report = VerificationReport {
        platform: std::env::consts::OS.into(),
        write_enabled: false,
        target_version: None,
        steps: vec![step(
            "platform",
            false,
            "verify_nvm_windows_probe only performs real checks on Windows; current platform is non-Windows.",
        )],
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("serialize skipped verification report")
    );
}

#[cfg(windows)]
fn main() {
    match run() {
        Ok(report) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report).expect("serialize verification report")
            );
        }
        Err(report) => {
            eprintln!(
                "{}",
                serde_json::to_string_pretty(&report).expect("serialize failure report")
            );
            process::exit(1);
        }
    }
}

#[cfg(windows)]
fn run() -> Result<VerificationReport, VerificationReport> {
    let write_enabled = std::env::var("NODEPILOT_WINDOWS_E2E_WRITE")
        .ok()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let mut steps = Vec::new();

    let detection = nvm::detect_backend();
    let detect_ok = detection.kind == BackendKind::NvmWindows;
    steps.push(step(
        "detect nvm-windows",
        detect_ok,
        format!(
            "kind={}, version={}, root={}, symlink={}",
            backend_kind_label(detection.kind),
            detection.version.as_deref().unwrap_or("unknown"),
            detection.root.as_deref().unwrap_or("missing"),
            detection.symlink_path.as_deref().unwrap_or("missing")
        ),
    ));
    if !detect_ok {
        return Err(report(write_enabled, None, steps));
    }

    let health = nvm::health_check();
    let admin_item = health
        .items
        .iter()
        .find(|item| item.key == "admin_required");
    steps.push(step(
        "admin hint",
        admin_item.is_some(),
        admin_item
            .map(|item| item.summary.clone())
            .unwrap_or_else(|| "admin_required health item missing".into()),
    ));
    let arch = detection.arch.as_deref().unwrap_or("unknown").to_string();
    steps.push(step(
        "detected arch",
        detection.arch.is_some(),
        format!("nvm-windows arch={arch}"),
    ));
    if let Some(path_conflict) = health
        .items
        .iter()
        .find(|item| item.key == "windows_node_install_conflict")
    {
        steps.push(step(
            "path conflict hint",
            true,
            format!("{:?}: {}", path_conflict.status, path_conflict.summary),
        ));
    }

    let installed = nvm::list_installed();
    let installed_versions = match &installed.data {
        Some(versions) if installed.status == TaskStatus::Success => versions,
        _ => {
            steps.push(step(
                "list installed",
                false,
                command_result_detail(&installed),
            ));
            return Err(report(write_enabled, None, steps));
        }
    };
    steps.push(step(
        "list installed",
        true,
        format!("installed versions={}", installed_versions.len()),
    ));

    let remote = nvm::list_remote();
    let remote_versions = match &remote.data {
        Some(versions) if remote.status == TaskStatus::Success && !versions.is_empty() => versions,
        _ => {
            steps.push(step("list available", false, command_result_detail(&remote)));
            return Err(report(write_enabled, None, steps));
        }
    };
    let target_version = std::env::var("NODEPILOT_WINDOWS_E2E_TARGET_VERSION")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| pick_target_version(remote_versions))
        .unwrap_or_else(|| "20.18.1".into());
    steps.push(step(
        "list available",
        true,
        format!(
            "available versions={}, target={}",
            remote_versions.len(),
            target_version
        ),
    ));

    for arch in ["32", "64", "all"] {
        let command = nvm::install_command(InstallOptions {
            version: target_version.clone(),
            arch: Some(arch.into()),
            reinstall_packages_from: None,
            latest_npm: false,
            source_install: false,
        });
        match command {
            Ok(command) => steps.push(step(
                format!("arch option {arch}"),
                true,
                format!("install command generated for {arch} via {}", command.program()),
            )),
            Err(message) => steps.push(step(
                format!("arch option {arch}"),
                false,
                message,
            )),
        }
    }

    if !write_enabled {
        steps.push(step(
            "write verification",
            true,
            "Skipped install/use/uninstall because NODEPILOT_WINDOWS_E2E_WRITE is not enabled.".to_string(),
        ));
        return Ok(report(write_enabled, Some(target_version), steps));
    }

    let install_options = InstallOptions {
        version: target_version.clone(),
        arch: Some("64".into()),
        reinstall_packages_from: None,
        latest_npm: false,
        source_install: false,
    };

    let install = nvm::install(install_options.clone());
    if install.status != TaskStatus::Success {
        steps.push(step("install Node", false, command_result_detail(&install)));
        return Err(report(write_enabled, Some(target_version), steps));
    }
    steps.push(step(
        "install Node",
        true,
        format!("Installed {}", target_version),
    ));

    let activate = nvm::activate(ActivateOptions {
        version: target_version.clone(),
        arch: install_options.arch.clone(),
    });
    if activate.status != TaskStatus::Success {
        steps.push(step("use Node", false, command_result_detail(&activate)));
        return Err(report(write_enabled, Some(target_version), steps));
    }
    steps.push(step("use Node", true, format!("Activated {}", target_version)));

    let uninstall = nvm::uninstall(&target_version);
    if uninstall.status != TaskStatus::Success {
        steps.push(step("uninstall Node", false, command_result_detail(&uninstall)));
        return Err(report(write_enabled, Some(target_version), steps));
    }
    steps.push(step(
        "uninstall Node",
        true,
        format!("Uninstalled {}", target_version),
    ));

    Ok(report(write_enabled, Some(target_version), steps))
}

#[cfg(windows)]
fn report(
    write_enabled: bool,
    target_version: Option<String>,
    steps: Vec<StepReport>,
) -> VerificationReport {
    VerificationReport {
        platform: std::env::consts::OS.into(),
        write_enabled,
        target_version,
        steps,
    }
}

fn step(name: impl Into<String>, ok: bool, detail: impl Into<String>) -> StepReport {
    StepReport {
        step: name.into(),
        ok,
        detail: detail.into(),
    }
}

#[cfg(windows)]
fn command_result_detail<T>(result: &nodepilot_lib::nvm::types::CommandResult<T>) -> String {
    let message = result.message.as_deref().unwrap_or("no message");
    let stdout = trimmed_or_placeholder(&result.stdout);
    let stderr = trimmed_or_placeholder(&result.stderr);
    format!(
        "status={:?}, exit_code={:?}, message={message}, stdout={stdout}, stderr={stderr}",
        result.status, result.exit_code
    )
}

#[cfg(windows)]
fn trimmed_or_placeholder(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "(empty)".into()
    } else {
        trimmed.replace('\n', "\\n")
    }
}

#[cfg(windows)]
fn pick_target_version(versions: &[VersionInfo]) -> Option<String> {
    versions
        .iter()
        .filter(|item| !item.version.trim().is_empty())
        .max_by_key(|item| version_key(&item.version))
        .map(|item| item.version.clone())
}

#[cfg(windows)]
fn version_key(version: &str) -> (u64, u64, u64) {
    let normalized = version.trim().trim_start_matches('v');
    let mut parts = normalized
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

#[cfg(windows)]
fn backend_kind_label(kind: BackendKind) -> &'static str {
    match kind {
        BackendKind::NvmSh => "nvm-sh",
        BackendKind::NvmWindows => "nvm-windows",
        BackendKind::Missing => "missing",
        BackendKind::Unsupported => "unsupported",
    }
}
