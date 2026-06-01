const SHELL_META_CHARS: [&str; 8] = [";", "&&", "||", "|", "`", "$(", ">", "<"];

pub fn validate_version(input: &str) -> Result<(), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("version cannot be empty".into());
    }

    reject_shell_meta(trimmed)?;

    let valid = trimmed == "node"
        || trimmed == "stable"
        || trimmed == "unstable"
        || trimmed == "system"
        || trimmed == "lts/*"
        || trimmed.starts_with("lts/")
        || is_semver_like(trimmed);

    if valid {
        Ok(())
    } else {
        Err(format!("unsupported version selector: {trimmed}"))
    }
}

pub fn validate_path(input: &str) -> Result<(), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("path cannot be empty".into());
    }
    reject_shell_meta(trimmed)
}

pub fn validate_url(input: &str) -> Result<(), String> {
    let trimmed = input.trim();
    reject_shell_meta(trimmed)?;
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        Ok(())
    } else {
        Err("url must start with http:// or https://".into())
    }
}

pub fn reject_shell_meta(input: &str) -> Result<(), String> {
    if let Some(found) = SHELL_META_CHARS
        .iter()
        .find(|pattern| input.contains(*pattern))
    {
        return Err(format!("shell metacharacter is not allowed: {found}"));
    }
    Ok(())
}

pub fn redact_sensitive(input: &str) -> String {
    input
        .lines()
        .map(redact_line)
        .collect::<Vec<_>>()
        .join("\n")
}

fn redact_line(line: &str) -> String {
    let lower = line.to_ascii_lowercase();
    if lower.contains("authorization:") || lower.contains("auth header") {
        return "authorization: [REDACTED]".into();
    }

    ["token", "secret"]
        .iter()
        .fold(line.to_string(), |acc, key| redact_key_value(&acc, key))
}

fn redact_key_value(line: &str, key: &str) -> String {
    let lower = line.to_ascii_lowercase();
    let Some(start) = lower.find(key) else {
        return line.to_string();
    };
    let after_key = &line[start + key.len()..];
    let Some(separator_offset) = after_key.find(['=', ':']) else {
        return line.to_string();
    };
    let value_start = start + key.len() + separator_offset + 1;
    format!("{}[REDACTED]", &line[..value_start])
}

fn is_semver_like(input: &str) -> bool {
    let value = input.strip_prefix('v').unwrap_or(input);
    let parts: Vec<_> = value.split('.').collect();
    (1..=3).contains(&parts.len())
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|char| char.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_safe_version_selectors() {
        for version in [
            "v22.11.0", "20.18.1", "18", "lts/*", "lts/iron", "node", "system",
        ] {
            assert!(validate_version(version).is_ok(), "{version}");
        }
    }

    #[test]
    fn rejects_shell_injection_chars() {
        for input in [
            "v20; rm -rf ~",
            "20 && echo no",
            "18|cat",
            "`whoami`",
            "$(whoami)",
        ] {
            assert!(validate_version(input).is_err(), "{input}");
        }
    }

    #[test]
    fn redacts_sensitive_log_lines() {
        let redacted = redact_sensitive("token=abc123\nAuthorization: Bearer abc\nsecret: value");
        assert!(redacted.contains("token=[REDACTED]"));
        assert!(redacted.contains("authorization: [REDACTED]"));
        assert!(redacted.contains("secret:[REDACTED]"));
    }
}
