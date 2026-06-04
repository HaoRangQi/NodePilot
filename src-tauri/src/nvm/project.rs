use std::path::{Path, PathBuf};

use crate::tasks::TaskStatus;

use super::{
    safety,
    types::{CommandResult, ProjectVersionInfo, VersionInfo},
};

pub fn read_project_version(
    project_dir: &str,
    installed_versions: &[VersionInfo],
) -> CommandResult<ProjectVersionInfo> {
    let canonical_project = match resolve_project_dir(project_dir) {
        Ok(path) => path,
        Err(error) => return error,
    };
    let Some(nvmrc_path) = find_nvmrc(&canonical_project) else {
        return CommandResult::success(ProjectVersionInfo {
            project_dir: canonical_project.display().to_string(),
            nvmrc_path: None,
            raw_content: None,
            version: None,
            is_valid: false,
            is_installed: false,
            inherited: false,
            message: Some(".nvmrc was not found in this directory or its parents".into()),
        });
    };

    match std::fs::read_to_string(&nvmrc_path) {
        Ok(raw) => {
            let version = raw.lines().next().unwrap_or_default().trim().to_string();
            let is_valid = safety::validate_version(&version).is_ok();
            let is_installed = is_valid && selector_matches_installed_version(&version, installed_versions);

            CommandResult::success(ProjectVersionInfo {
                project_dir: canonical_project.display().to_string(),
                nvmrc_path: Some(nvmrc_path.display().to_string()),
                raw_content: Some(raw),
                version: (!version.is_empty()).then_some(version),
                is_valid,
                is_installed,
                inherited: nvmrc_path
                    .parent()
                    .is_some_and(|parent| parent != canonical_project.as_path()),
                message: project_version_message(is_valid, is_installed),
            })
        }
        Err(error) => CommandResult {
            status: TaskStatus::Failed,
            data: None,
            stdout: String::new(),
            stderr: error.to_string(),
            exit_code: None,
            message: Some("failed to read .nvmrc".into()),
        },
    }
}

pub fn write_project_version(
    project_dir: &str,
    version: &str,
    installed_versions: &[VersionInfo],
) -> CommandResult<ProjectVersionInfo> {
    let canonical_project = match resolve_project_dir(project_dir) {
        Ok(path) => path,
        Err(error) => return error,
    };

    if let Err(message) = safety::validate_version(version) {
        return CommandResult::failed(message, version);
    }

    let target_path = target_nvmrc_path(&canonical_project);
    let content = format!("{}\n", version.trim());

    if let Err(error) = std::fs::write(&target_path, content) {
        return CommandResult {
            status: TaskStatus::Failed,
            data: None,
            stdout: String::new(),
            stderr: error.to_string(),
            exit_code: None,
            message: Some("failed to write .nvmrc".into()),
        };
    }

    read_project_version(&canonical_project.display().to_string(), installed_versions)
}

fn resolve_project_dir(project_dir: &str) -> Result<PathBuf, CommandResult<ProjectVersionInfo>> {
    if let Err(message) = safety::validate_path(project_dir) {
        return Err(CommandResult::failed(message, ""));
    }

    let project_path = PathBuf::from(project_dir);
    if !project_path.exists() {
        return Err(CommandResult::failed(
            "project directory does not exist",
            project_dir,
        ));
    }
    if !project_path.is_dir() {
        return Err(CommandResult::failed(
            "project path is not a directory",
            project_dir,
        ));
    }

    Ok(project_path.canonicalize().unwrap_or(project_path))
}

fn target_nvmrc_path(project_dir: &Path) -> PathBuf {
    match find_nvmrc(project_dir) {
        Some(path) if path.parent().is_some_and(|parent| parent == project_dir) => path,
        _ => project_dir.join(".nvmrc"),
    }
}

fn find_nvmrc(project_dir: &Path) -> Option<PathBuf> {
    for candidate_dir in project_dir.ancestors() {
        let candidate = candidate_dir.join(".nvmrc");
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn versions_match(left: &str, right: &str) -> bool {
    normalize_version(left) == normalize_version(right)
}

fn selector_matches_installed_version(selector: &str, installed_versions: &[VersionInfo]) -> bool {
    let normalized = normalize_version(selector);

    if normalized == "lts/*" {
        return installed_versions.iter().any(|installed| installed.is_lts);
    }

    if let Some(line) = normalized.strip_prefix("lts/") {
        return installed_versions.iter().any(|installed| {
            installed.is_lts
                && installed
                    .line
                    .as_deref()
                    .is_some_and(|installed_line| installed_line.eq_ignore_ascii_case(line))
        });
    }

    installed_versions
        .iter()
        .any(|installed| versions_match(&installed.version, selector))
}

fn normalize_version(version: &str) -> &str {
    version.trim().trim_start_matches('v')
}

fn project_version_message(is_valid: bool, is_installed: bool) -> Option<String> {
    if !is_valid {
        return None;
    }

    if !is_installed {
        return Some(".nvmrc points to a Node version that is not installed locally".into());
    }

    None
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::*;

    fn temp_project(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nodepilot-{name}-{nonce}"));
        fs::create_dir_all(&path).expect("create temp project");
        path
    }

    #[test]
    fn reads_nvmrc_in_project_directory() {
        let project = temp_project("local-nvmrc");
        fs::write(project.join(".nvmrc"), "v22.11.0\n").expect("write .nvmrc");
        let installed = vec![VersionInfo::new("v22.11.0")];

        let result = read_project_version(&project.display().to_string(), &installed);
        let data = result.data.expect("project version info");

        assert_eq!(result.status, TaskStatus::Success);
        assert_eq!(data.version.as_deref(), Some("v22.11.0"));
        assert!(data.is_valid);
        assert!(data.is_installed);
        assert!(!data.inherited);

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn finds_parent_nvmrc() {
        let project = temp_project("parent-nvmrc");
        let child = project.join("packages/app");
        fs::create_dir_all(&child).expect("create child");
        fs::write(project.join(".nvmrc"), "20.18.1").expect("write parent .nvmrc");
        let installed = vec![VersionInfo::new("v20.18.1")];

        let result = read_project_version(&child.display().to_string(), &installed);
        let data = result.data.expect("project version info");

        assert_eq!(data.version.as_deref(), Some("20.18.1"));
        assert!(data.is_valid);
        assert!(data.is_installed);
        assert!(data.inherited);
        let reported_nvmrc = PathBuf::from(data.nvmrc_path.expect("nvmrc path"))
            .canonicalize()
            .expect("canonicalized reported nvmrc path");
        let expected_nvmrc = project
            .join(".nvmrc")
            .canonicalize()
            .expect("canonicalized expected nvmrc path");
        assert_eq!(reported_nvmrc, expected_nvmrc);

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn reports_missing_nvmrc_without_failure() {
        let project = temp_project("missing-nvmrc");

        let result = read_project_version(&project.display().to_string(), &[]);
        let data = result.data.expect("project version info");

        assert_eq!(result.status, TaskStatus::Success);
        assert!(data.nvmrc_path.is_none());
        assert!(!data.is_valid);
        assert!(data.message.unwrap().contains("not found"));

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn marks_invalid_nvmrc_content() {
        let project = temp_project("invalid-nvmrc");
        fs::write(project.join(".nvmrc"), "v20; rm -rf ~").expect("write .nvmrc");

        let result = read_project_version(&project.display().to_string(), &[]);
        let data = result.data.expect("project version info");

        assert_eq!(data.version.as_deref(), Some("v20; rm -rf ~"));
        assert!(!data.is_valid);
        assert!(!data.is_installed);
        assert!(data.message.is_none());

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn writes_new_local_nvmrc() {
        let project = temp_project("write-local-nvmrc");
        let installed = vec![VersionInfo::new("v20.18.1")];

        let result = write_project_version(&project.display().to_string(), "v20.18.1", &installed);
        let data = result.data.expect("project version info");

        assert_eq!(result.status, TaskStatus::Success);
        assert_eq!(data.version.as_deref(), Some("v20.18.1"));
        assert!(project.join(".nvmrc").is_file());
        assert_eq!(
            fs::read_to_string(project.join(".nvmrc")).expect("read .nvmrc"),
            "v20.18.1\n"
        );

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn writes_local_override_when_parent_nvmrc_is_inherited() {
        let project = temp_project("write-inherited-nvmrc");
        let child = project.join("packages/app");
        fs::create_dir_all(&child).expect("create child");
        fs::write(project.join(".nvmrc"), "v18.20.4\n").expect("write parent .nvmrc");
        let installed = vec![VersionInfo::new("v22.11.0")];

        let result = write_project_version(&child.display().to_string(), "v22.11.0", &installed);
        let data = result.data.expect("project version info");

        assert_eq!(result.status, TaskStatus::Success);
        assert_eq!(data.version.as_deref(), Some("v22.11.0"));
        assert!(!data.inherited);
        assert_eq!(
            fs::read_to_string(child.join(".nvmrc")).expect("read child .nvmrc"),
            "v22.11.0\n"
        );
        assert_eq!(
            fs::read_to_string(project.join(".nvmrc")).expect("read parent .nvmrc"),
            "v18.20.4\n"
        );

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn marks_lts_wildcard_as_installed_when_any_lts_exists() {
        let project = temp_project("lts-wildcard-installed");
        fs::write(project.join(".nvmrc"), "lts/*\n").expect("write .nvmrc");
        let mut installed = VersionInfo::new("v22.11.0");
        installed.is_lts = true;
        installed.line = Some("Jod".into());

        let result = read_project_version(&project.display().to_string(), &[installed]);
        let data = result.data.expect("project version info");

        assert!(data.is_valid);
        assert!(data.is_installed);

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn marks_named_lts_line_as_installed_when_matching_line_exists() {
        let project = temp_project("lts-line-installed");
        fs::write(project.join(".nvmrc"), "lts/jod\n").expect("write .nvmrc");
        let mut installed = VersionInfo::new("v22.11.0");
        installed.is_lts = true;
        installed.line = Some("Jod".into());

        let result = read_project_version(&project.display().to_string(), &[installed]);
        let data = result.data.expect("project version info");

        assert!(data.is_valid);
        assert!(data.is_installed);

        fs::remove_dir_all(project).expect("remove temp project");
    }

    #[test]
    fn reports_message_when_nvmrc_version_is_not_installed() {
        let project = temp_project("nvmrc-not-installed");
        fs::write(project.join(".nvmrc"), "v22.11.0\n").expect("write .nvmrc");

        let result = read_project_version(&project.display().to_string(), &[]);
        let data = result.data.expect("project version info");

        assert!(data.is_valid);
        assert!(!data.is_installed);
        assert_eq!(
            data.message.as_deref(),
            Some(".nvmrc points to a Node version that is not installed locally")
        );

        fs::remove_dir_all(project).expect("remove temp project");
    }
}
