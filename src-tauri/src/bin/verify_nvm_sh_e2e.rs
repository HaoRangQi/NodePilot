use std::{
    fs,
    path::Path,
    path::PathBuf,
    process,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

use nodepilot_lib::{
    nvm::{
        self,
        types::{ActivateOptions, BackendKind, InstallOptions, ProjectVersionInfo, VersionInfo},
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
    temp_root: String,
    project_dir: String,
    target_version: String,
    steps: Vec<StepReport>,
}

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

fn run() -> Result<VerificationReport, VerificationReport> {
    let temp_root = temp_dir("nodepilot-nvm-sh-e2e");
    let home_dir = temp_root.join("home");
    let project_dir = temp_root.join("project");
    let nvm_dir = home_dir.join(".nvm");
    fs::create_dir_all(&home_dir).expect("create temp home");
    fs::create_dir_all(&project_dir).expect("create temp project");

    std::env::set_var("HOME", &home_dir);
    std::env::set_var("NVM_DIR", &nvm_dir);

    let mut steps = Vec::new();

    let install_backend_command = match nvm::backend_install_command() {
        Ok(command) => command,
        Err(message) => {
            steps.push(step("install nvm", false, message));
            return Err(report(&temp_root, &project_dir, "unknown", steps));
        }
    };
    let install_backend = install_backend_command.run();
    let install_backend_ok = install_backend.status == TaskStatus::Success && wait_for_nvm_install(&nvm_dir);
    if !install_backend_ok {
        steps.push(step(
            "install nvm",
            false,
            format!(
                "{}, nvm_script_exists={}",
                command_result_detail(&install_backend),
                nvm_dir.join("nvm.sh").is_file()
            ),
        ));
        return Err(report(&temp_root, &project_dir, "unknown", steps));
    }
    steps.push(step(
        "install nvm",
        true,
        format!("Installed nvm-sh into {}", nvm_dir.display()),
    ));

    let detection = wait_for_detection(&nvm_dir);
    let detect_ok = detection.kind == BackendKind::NvmSh && nvm_dir.join("nvm.sh").is_file();
    steps.push(step(
        "detect",
        detect_ok,
        format!(
            "kind={}, version={}, nvm_dir={}",
            backend_kind_label(detection.kind),
            detection.version.as_deref().unwrap_or("unknown"),
            detection.nvm_dir.as_deref().unwrap_or("missing")
        ),
    ));
    if !detect_ok {
        return Err(report(&temp_root, &project_dir, "unknown", steps));
    }

    let remote = nvm::list_remote();
    let remote_versions = match &remote.data {
        Some(versions) if remote.status == TaskStatus::Success && !versions.is_empty() => versions,
        _ => {
            steps.push(step("list remote", false, command_result_detail(&remote)));
            return Err(report(&temp_root, &project_dir, "unknown", steps));
        }
    };
    let target_version = pick_target_version(remote_versions).unwrap_or_else(|| "v20.18.1".into());
    steps.push(step(
        "list remote",
        true,
        format!(
            "Loaded {} remote versions, target {}",
            remote_versions.len(),
            target_version
        ),
    ));

    let install_result = nvm::install(InstallOptions {
        version: target_version.clone(),
        arch: None,
        reinstall_packages_from: None,
        latest_npm: false,
        source_install: false,
    });
    if install_result.status != TaskStatus::Success {
        steps.push(step(
            "install Node",
            false,
            command_result_detail(&install_result),
        ));
        return Err(report(&temp_root, &project_dir, &target_version, steps));
    }
    steps.push(step(
        "install Node",
        true,
        format!("Installed {}", target_version),
    ));

    let installed = nvm::list_installed();
    let installed_versions = match &installed.data {
        Some(versions)
            if installed.status == TaskStatus::Success
                && versions.iter().any(|item| versions_match(&item.version, &target_version)) =>
        {
            versions
        }
        _ => {
            steps.push(step("list installed", false, command_result_detail(&installed)));
            return Err(report(&temp_root, &project_dir, &target_version, steps));
        }
    };
    steps.push(step(
        "list installed",
        true,
        format!("Installed versions: {}", installed_versions.len()),
    ));

    let activate_result = nvm::activate(ActivateOptions {
        version: target_version.clone(),
        arch: None,
    });
    if activate_result.status != TaskStatus::Success {
        steps.push(step(
            "activate Node",
            false,
            command_result_detail(&activate_result),
        ));
        return Err(report(&temp_root, &project_dir, &target_version, steps));
    }
    steps.push(step(
        "activate Node",
        true,
        format!("nvm use {} succeeded in the task shell", target_version),
    ));

    let default_result = nvm::set_default(&target_version);
    if default_result.status != TaskStatus::Success {
        steps.push(step(
            "set default",
            false,
            command_result_detail(&default_result),
        ));
        return Err(report(&temp_root, &project_dir, &target_version, steps));
    }
    steps.push(step(
        "set default",
        true,
        format!("default alias -> {}", target_version),
    ));

    let write_result = nvm::write_project_version(
        &project_dir.display().to_string(),
        &target_version,
    );
    let written_info = match &write_result.data {
        Some(info) if write_result.status == TaskStatus::Success => info,
        _ => {
            steps.push(step(
                "write .nvmrc",
                false,
                command_result_detail(&write_result),
            ));
            return Err(report(&temp_root, &project_dir, &target_version, steps));
        }
    };
    steps.push(step(
        "write .nvmrc",
        true,
        nvmrc_detail(written_info),
    ));

    let read_result = nvm::read_project_version(&project_dir.display().to_string());
    let read_info = match &read_result.data {
        Some(info)
            if read_result.status == TaskStatus::Success
                && info.version.as_deref().is_some_and(|value| versions_match(value, &target_version)) =>
        {
            info
        }
        _ => {
            steps.push(step(
                "read .nvmrc",
                false,
                command_result_detail(&read_result),
            ));
            return Err(report(&temp_root, &project_dir, &target_version, steps));
        }
    };
    steps.push(step(
        "read .nvmrc",
        true,
        nvmrc_detail(read_info),
    ));

    let apply_result = nvm::activate(ActivateOptions {
        version: read_info.version.clone().unwrap_or_else(|| target_version.clone()),
        arch: None,
    });
    if apply_result.status != TaskStatus::Success {
        steps.push(step(
            "apply .nvmrc",
            false,
            command_result_detail(&apply_result),
        ));
        return Err(report(&temp_root, &project_dir, &target_version, steps));
    }
    steps.push(step(
        "apply .nvmrc",
        true,
        format!(
            "Applied {} from {}",
            read_info.version.as_deref().unwrap_or(&target_version),
            read_info.nvmrc_path.as_deref().unwrap_or(".nvmrc")
        ),
    ));

    let reset_default = nvm::set_default("system");
    steps.push(step(
        "reset default",
        reset_default.status == TaskStatus::Success,
        if reset_default.status == TaskStatus::Success {
            "Reset default alias to system before uninstall".into()
        } else {
            command_result_detail(&reset_default)
        },
    ));

    let uninstall_result = nvm::uninstall(&target_version);
    if uninstall_result.status != TaskStatus::Success {
        steps.push(step(
            "uninstall Node",
            false,
            command_result_detail(&uninstall_result),
        ));
        return Err(report(&temp_root, &project_dir, &target_version, steps));
    }
    steps.push(step(
        "uninstall Node",
        true,
        format!("Uninstalled {}", target_version),
    ));

    let installed_after = nvm::list_installed();
    let uninstall_verified = installed_after.status == TaskStatus::Success
        && installed_after
            .data
            .as_ref()
            .is_some_and(|versions| versions.iter().all(|item| !versions_match(&item.version, &target_version)));
    steps.push(step(
        "verify uninstall",
        uninstall_verified,
        if uninstall_verified {
            format!("{} is absent from installed versions", target_version)
        } else {
            command_result_detail(&installed_after)
        },
    ));

    let report = report(&temp_root, &project_dir, &target_version, steps);
    if report.steps.iter().all(|item| item.ok) {
        Ok(report)
    } else {
        Err(report)
    }
}

fn wait_for_detection(nvm_dir: &PathBuf) -> nodepilot_lib::nvm::types::BackendDetection {
    const ATTEMPTS: usize = 10;
    const DELAY_MS: u64 = 250;

    let mut detection = nvm::detect_backend();
    for _ in 0..ATTEMPTS {
        if detection.kind == BackendKind::NvmSh && nvm_dir.join("nvm.sh").is_file() {
            return detection;
        }
        thread::sleep(std::time::Duration::from_millis(DELAY_MS));
        detection = nvm::detect_backend();
    }
    detection
}

fn wait_for_nvm_install(nvm_dir: &Path) -> bool {
    const ATTEMPTS: usize = 10;
    const DELAY_MS: u64 = 250;

    for _ in 0..ATTEMPTS {
        if nvm_dir.join("nvm.sh").is_file() {
            return true;
        }
        thread::sleep(std::time::Duration::from_millis(DELAY_MS));
    }

    false
}

fn report(
    temp_root: &PathBuf,
    project_dir: &PathBuf,
    target_version: &str,
    steps: Vec<StepReport>,
) -> VerificationReport {
    VerificationReport {
        temp_root: temp_root.display().to_string(),
        project_dir: project_dir.display().to_string(),
        target_version: target_version.to_string(),
        steps,
    }
}

fn step(name: &str, ok: bool, detail: impl Into<String>) -> StepReport {
    StepReport {
        step: name.into(),
        ok,
        detail: detail.into(),
    }
}

fn command_result_detail<T>(result: &nodepilot_lib::nvm::types::CommandResult<T>) -> String {
    let message = result.message.as_deref().unwrap_or("no message");
    let stdout = trimmed_or_placeholder(&result.stdout);
    let stderr = trimmed_or_placeholder(&result.stderr);
    format!(
        "status={:?}, exit_code={:?}, message={message}, stdout={stdout}, stderr={stderr}",
        result.status, result.exit_code
    )
}

fn nvmrc_detail(info: &ProjectVersionInfo) -> String {
    format!(
        "version={}, path={}",
        info.version.as_deref().unwrap_or("missing"),
        info.nvmrc_path.as_deref().unwrap_or("missing")
    )
}

fn trimmed_or_placeholder(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "(empty)".into()
    } else {
        trimmed.replace('\n', "\\n")
    }
}

fn pick_target_version(versions: &[VersionInfo]) -> Option<String> {
    versions
        .iter()
        .filter(|item| item.is_lts)
        .max_by_key(|item| version_key(&item.version))
        .or_else(|| versions.iter().max_by_key(|item| version_key(&item.version)))
        .map(|item| item.version.clone())
}

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

fn versions_match(left: &str, right: &str) -> bool {
    left.trim().trim_start_matches('v') == right.trim().trim_start_matches('v')
}

fn backend_kind_label(kind: BackendKind) -> &'static str {
    match kind {
        BackendKind::NvmSh => "nvm-sh",
        BackendKind::NvmWindows => "nvm-windows",
        BackendKind::Missing => "missing",
        BackendKind::Unsupported => "unsupported",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waits_for_missing_nvm_install_to_fail() {
        let path = std::env::temp_dir().join(format!(
            "nodepilot-missing-nvm-install-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos()
        ));

        assert!(!wait_for_nvm_install(&path));
    }

    #[test]
    fn accepts_installed_nvm_script_immediately() {
        let path = std::env::temp_dir().join(format!(
            "nodepilot-present-nvm-install-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        fs::write(path.join("nvm.sh"), "#!/usr/bin/env bash\n").expect("write nvm.sh");

        assert!(wait_for_nvm_install(&path));

        fs::remove_dir_all(path).expect("remove temp dir");
    }
}

fn temp_dir(prefix: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("{prefix}-{nonce}"))
}
