use std::process::{Child, Command, Stdio};

use crate::tasks::TaskStatus;

use super::{
    safety::redact_sensitive,
    types::{CommandResult, VersionInfo},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SafeCommand {
    program: String,
    args: Vec<String>,
    program_context: Option<String>,
}

impl SafeCommand {
    pub fn new(
        program: impl Into<String>,
        args: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        Self {
            program: program.into(),
            args: args.into_iter().map(Into::into).collect(),
            program_context: None,
        }
    }

    pub fn run(&self) -> CommandResult<String> {
        match self.command().output() {
            Ok(output) => {
                let stdout = redact_sensitive(&String::from_utf8_lossy(&output.stdout));
                let stderr = redact_sensitive(&String::from_utf8_lossy(&output.stderr));
                if output.status.success() {
                    CommandResult {
                        status: TaskStatus::Success,
                        data: Some(stdout.clone()),
                        stdout,
                        stderr,
                        exit_code: output.status.code(),
                        message: None,
                    }
                } else {
                    CommandResult {
                        status: TaskStatus::Failed,
                        data: None,
                        stdout,
                        stderr,
                        exit_code: output.status.code(),
                        message: Some(format!("command failed: {}", self.program())),
                    }
                }
            }
            Err(error) => CommandResult {
                status: TaskStatus::Failed,
                data: None,
                stdout: String::new(),
                stderr: redact_sensitive(&error.to_string()),
                exit_code: None,
                message: Some(format!("failed to start command: {}", self.program())),
            },
        }
    }

    pub fn spawn(&self) -> std::io::Result<Child> {
        self.command()
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }

    pub fn program(&self) -> &str {
        self.program_context.as_deref().unwrap_or(&self.program)
    }

    pub fn with_program_context(mut self, program_context: impl Into<String>) -> Self {
        self.program_context = Some(program_context.into());
        self
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        command
    }
}

pub fn map_output<T>(
    result: CommandResult<String>,
    parser: impl FnOnce(&str) -> Result<T, String>,
) -> CommandResult<T> {
    match (result.status, result.data) {
        (TaskStatus::Success, Some(stdout)) => match parser(&stdout) {
            Ok(data) => CommandResult {
                status: TaskStatus::Success,
                data: Some(data),
                stdout,
                stderr: result.stderr,
                exit_code: result.exit_code,
                message: None,
            },
            Err(error) => CommandResult {
                status: TaskStatus::Failed,
                data: None,
                stdout,
                stderr: result.stderr,
                exit_code: result.exit_code,
                message: Some(error),
            },
        },
        (status, data) => CommandResult {
            status,
            data: None,
            stdout: data.unwrap_or(result.stdout),
            stderr: result.stderr,
            exit_code: result.exit_code,
            message: result.message,
        },
    }
}

pub fn into_unit_result(result: CommandResult<String>) -> CommandResult<()> {
    match result.status {
        TaskStatus::Success => CommandResult {
            status: TaskStatus::Success,
            data: Some(()),
            stdout: result.stdout,
            stderr: result.stderr,
            exit_code: result.exit_code,
            message: result.message,
        },
        status => CommandResult {
            status,
            data: None,
            stdout: result.stdout,
            stderr: result.stderr,
            exit_code: result.exit_code,
            message: result.message,
        },
    }
}

pub fn empty_version_list_on_failure(result: CommandResult<Vec<VersionInfo>>) -> Vec<VersionInfo> {
    result.data.unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_safe_command_without_shell_joining_args() {
        let command = SafeCommand::new("nvm", ["list", "available"]);
        assert_eq!(command.program, "nvm");
        assert_eq!(command.args, vec!["list", "available"]);
    }

    #[test]
    fn maps_successful_output_to_typed_data() {
        let result = CommandResult {
            status: TaskStatus::Success,
            data: Some("v22.11.0".into()),
            stdout: "v22.11.0".into(),
            stderr: String::new(),
            exit_code: Some(0),
            message: None,
        };

        let mapped = map_output(result, |stdout| Ok(stdout.trim().to_string()));
        assert_eq!(mapped.data.as_deref(), Some("v22.11.0"));
    }
}
