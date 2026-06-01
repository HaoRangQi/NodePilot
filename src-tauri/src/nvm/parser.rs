use super::types::VersionInfo;

pub fn parse_nvm_current(stdout: &str) -> Result<String, String> {
    let current = stdout.trim();
    if current.is_empty() || current.eq_ignore_ascii_case("none") {
        return Err("nvm current did not return an active version".into());
    }
    if looks_like_error(current) {
        return Err(current.into());
    }
    Ok(current.into())
}

pub fn parse_nvm_default_alias(stdout: &str) -> Result<Option<String>, String> {
    if looks_like_error(stdout) {
        return Err(stdout.trim().into());
    }

    for line in stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        if let Some((alias, target)) = line.split_once("->") {
            if alias.trim() == "default" {
                return Ok(Some(
                    first_version_token(target).unwrap_or_else(|| target.trim().into()),
                ));
            }
        }
    }

    Ok(None)
}

pub fn parse_nvm_ls(stdout: &str) -> Result<Vec<VersionInfo>, String> {
    if looks_like_error(stdout) {
        return Err(stdout.trim().into());
    }

    let mut versions = Vec::new();
    for line in stdout.lines() {
        let trimmed = normalize_marker(line);
        if trimmed.is_empty() || trimmed.contains("->") || trimmed.starts_with("default") {
            continue;
        }

        if trimmed.starts_with("system") {
            let mut info = VersionInfo::new("system");
            info.is_system = true;
            versions.push(info);
            continue;
        }

        let Some(version) = first_version_token(trimmed) else {
            continue;
        };
        let mut info = VersionInfo::new(version);
        info.is_current = line.contains("->");
        info.is_lts = trimmed.to_ascii_lowercase().contains("lts");
        versions.push(info);
    }

    Ok(versions)
}

pub fn parse_nvm_ls_remote(stdout: &str) -> Result<Vec<VersionInfo>, String> {
    if looks_like_error(stdout) {
        return Err(stdout.trim().into());
    }

    Ok(stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let version = first_version_token(trimmed)?;
            let mut info = VersionInfo::new(version);
            info.is_lts = trimmed.to_ascii_lowercase().contains("lts");
            info.line = parse_lts_line(trimmed);
            Some(info)
        })
        .collect())
}

pub fn parse_nvm_windows_list(stdout: &str) -> Result<Vec<VersionInfo>, String> {
    if looks_like_error(stdout) {
        return Err(stdout.trim().into());
    }

    Ok(stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let normalized = trimmed.trim_start_matches('*').trim();
            let version = first_version_token(normalized)?;
            let mut info = VersionInfo::new(version);
            info.is_current = trimmed.starts_with('*');
            info.arch = parse_arch(normalized);
            Some(info)
        })
        .collect())
}

pub fn parse_nvm_windows_available(stdout: &str) -> Result<Vec<VersionInfo>, String> {
    if looks_like_error(stdout) {
        return Err(stdout.trim().into());
    }

    let mut versions = Vec::new();
    for line in stdout.lines() {
        for token in line.split_whitespace() {
            let token = token.trim_matches('|');
            if is_version_token(token) {
                versions.push(VersionInfo::new(token));
            }
        }
    }
    Ok(versions)
}

fn normalize_marker(line: &str) -> &str {
    line.trim()
        .trim_start_matches("->")
        .trim_start_matches('*')
        .trim()
}

fn first_version_token(input: &str) -> Option<String> {
    input
        .split_whitespace()
        .find(|token| is_version_token(token.trim_matches(['(', ')', ','])))
        .map(|token| token.trim_matches(['(', ')', ',']).to_string())
}

fn is_version_token(token: &str) -> bool {
    let value = token.strip_prefix('v').unwrap_or(token);
    let parts: Vec<_> = value.split('.').collect();
    parts.len() >= 2
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|char| char.is_ascii_digit()))
}

fn parse_lts_line(line: &str) -> Option<String> {
    let marker = line.find("Latest LTS:")?;
    let value = line[marker + "Latest LTS:".len()..].trim();
    let line_name = value.split(')').next()?.trim_start_matches('(').trim();
    (!line_name.is_empty()).then(|| line_name.into())
}

fn parse_arch(line: &str) -> Option<String> {
    let start = line.find('(')?;
    let end = line[start + 1..].find(')')?;
    Some(line[start + 1..start + 1 + end].to_string())
}

fn looks_like_error(output: &str) -> bool {
    let lower = output.to_ascii_lowercase();
    lower.contains("not found")
        || lower.contains("not recognized")
        || lower.contains("error")
        || lower.contains("not installed")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nvm_ls_output() {
        let versions = parse_nvm_ls(
            r#"
                v18.20.4
        ->      v20.18.1
                v22.11.0   (Latest LTS: Jod)
                system
default -> v20.18.1
"#,
        )
        .unwrap();

        assert_eq!(versions.len(), 4);
        assert!(versions
            .iter()
            .any(|version| version.version == "v20.18.1" && version.is_current));
        assert!(versions
            .iter()
            .any(|version| version.version == "system" && version.is_system));
    }

    #[test]
    fn parses_nvm_ls_remote_output() {
        let versions = parse_nvm_ls_remote(
            r#"
        v20.18.1   (Latest LTS: Iron)
        v22.11.0   (Latest LTS: Jod)
        v24.4.1
"#,
        )
        .unwrap();

        assert_eq!(versions.len(), 3);
        assert_eq!(versions[0].line.as_deref(), Some("Iron"));
        assert!(versions[1].is_lts);
    }

    #[test]
    fn parses_nvm_current() {
        assert_eq!(parse_nvm_current("v22.11.0\n").unwrap(), "v22.11.0");
        assert!(parse_nvm_current("none").is_err());
    }

    #[test]
    fn parses_nvm_default_alias() {
        let default = parse_nvm_default_alias("default -> v20.18.1\nnode -> stable").unwrap();
        assert_eq!(default.as_deref(), Some("v20.18.1"));
    }

    #[test]
    fn parses_nvm_windows_list_output() {
        let versions = parse_nvm_windows_list(
            r#"
  * 22.11.0 (Currently using 64-bit executable)
    20.18.1
    18.20.4
"#,
        )
        .unwrap();

        assert_eq!(versions.len(), 3);
        assert!(versions[0].is_current);
        assert_eq!(
            versions[0].arch.as_deref(),
            Some("Currently using 64-bit executable")
        );
    }

    #[test]
    fn parses_nvm_windows_available_output() {
        let versions = parse_nvm_windows_available(
            r#"
|   CURRENT    |     LTS      |  OLD STABLE |
|    24.4.1    |   22.11.0    |   0.12.18   |
|    23.11.1   |   20.18.1    |   0.10.48   |
"#,
        )
        .unwrap();

        assert!(versions.iter().any(|version| version.version == "24.4.1"));
        assert!(versions.iter().any(|version| version.version == "22.11.0"));
    }

    #[test]
    fn rejects_failed_output() {
        assert!(parse_nvm_ls("nvm: command not found").is_err());
        assert!(parse_nvm_windows_list("'nvm' is not recognized").is_err());
    }
}
