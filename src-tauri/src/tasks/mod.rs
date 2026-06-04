use std::{
    collections::HashMap,
    io::Read,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex, OnceLock,
    },
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};

use crate::nvm::{runner::SafeCommand, safety::redact_sensitive};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Running,
    Success,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskAccess {
    Read,
    Write,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallTaskSnapshot {
    pub task_id: String,
    pub status: TaskStatus,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
    pub cancel_requested: bool,
}

pub fn run_task<T>(access: TaskAccess, task: impl FnOnce() -> T) -> T {
    match access {
        TaskAccess::Read => task(),
        TaskAccess::Write => {
            let _guard = acquire_write_slot();
            task()
        }
    }
}

pub fn start_install_task(command: SafeCommand) -> Result<InstallTaskSnapshot, String> {
    let Some(write_guard) = try_acquire_write_slot() else {
        return Err("another write task is already running".into());
    };

    let snapshot = InstallTaskSnapshot {
        task_id: next_install_task_id(),
        status: TaskStatus::Running,
        stdout: String::new(),
        stderr: String::new(),
        exit_code: None,
        message: None,
        cancel_requested: false,
    };
    let task = Arc::new(InstallTaskState {
        snapshot: Mutex::new(snapshot.clone()),
        cancel_requested: AtomicBool::new(false),
    });

    install_tasks()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(snapshot.task_id.clone(), task.clone());

    thread::spawn(move || run_install_task(command, task, write_guard));

    Ok(snapshot)
}

pub fn read_install_task(task_id: &str) -> Option<InstallTaskSnapshot> {
    install_tasks()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(task_id)
        .map(|task| task.snapshot())
}

pub fn cancel_install_task(task_id: &str) -> Option<InstallTaskSnapshot> {
    let task = install_tasks()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(task_id)
        .cloned()?;

    task.cancel_requested.store(true, Ordering::SeqCst);
    {
        let mut snapshot = task
            .snapshot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        snapshot.cancel_requested = true;
        if snapshot.message.is_none() && snapshot.status == TaskStatus::Running {
            snapshot.message = Some("Cancellation requested.".into());
        }
    }

    Some(task.snapshot())
}

fn run_install_task(command: SafeCommand, task: Arc<InstallTaskState>, _write_guard: WriteGuard) {
    let spawn_result = command.spawn();
    let mut child = match spawn_result {
        Ok(child) => child,
        Err(error) => {
            let mut snapshot = task
                .snapshot
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            snapshot.status = TaskStatus::Failed;
            snapshot.message = Some(format!("failed to start command: {}", command.program()));
            snapshot.stderr = redact_sensitive(&error.to_string());
            return;
        }
    };

    let stdout_reader = child.stdout.take().map(|stdout| {
        let task = task.clone();
        thread::spawn(move || stream_output(stdout, task, OutputTarget::Stdout))
    });
    let stderr_reader = child.stderr.take().map(|stderr| {
        let task = task.clone();
        thread::spawn(move || stream_output(stderr, task, OutputTarget::Stderr))
    });

    let (status, exit_code, message) = loop {
        if task.cancel_requested.load(Ordering::SeqCst) {
            let _ = child.kill();
        }

        match child.try_wait() {
            Ok(Some(exit_status)) => {
                let cancelled = task.cancel_requested.load(Ordering::SeqCst);
                let status = if cancelled {
                    TaskStatus::Cancelled
                } else if exit_status.success() {
                    TaskStatus::Success
                } else {
                    TaskStatus::Failed
                };
                let message = match status {
                    TaskStatus::Success => None,
                    TaskStatus::Cancelled => Some("Install task cancelled.".into()),
                    TaskStatus::Failed => Some(format!("command failed: {}", command.program())),
                    TaskStatus::Pending | TaskStatus::Running => None,
                };
                break (status, exit_status.code(), message);
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(error) => break (
                TaskStatus::Failed,
                None,
                Some(redact_sensitive(&error.to_string())),
            ),
        }
    };

    if let Some(handle) = stdout_reader {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_reader {
        let _ = handle.join();
    }

    let mut snapshot = task
        .snapshot
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    snapshot.status = status;
    snapshot.exit_code = exit_code;
    snapshot.message = message.or_else(|| snapshot.message.clone());
}

fn stream_output(mut reader: impl Read, task: Arc<InstallTaskState>, target: OutputTarget) {
    let mut buffer = [0u8; 4096];

    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                let chunk = redact_sensitive(&String::from_utf8_lossy(&buffer[..count]));
                let mut snapshot = task
                    .snapshot
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                match target {
                    OutputTarget::Stdout => snapshot.stdout.push_str(&chunk),
                    OutputTarget::Stderr => snapshot.stderr.push_str(&chunk),
                }
            }
            Err(error) => {
                let mut snapshot = task
                    .snapshot
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let target_output = match target {
                    OutputTarget::Stdout => &mut snapshot.stdout,
                    OutputTarget::Stderr => &mut snapshot.stderr,
                };
                if !target_output.is_empty() && !target_output.ends_with('\n') {
                    target_output.push('\n');
                }
                target_output.push_str(&redact_sensitive(&error.to_string()));
                break;
            }
        }
    }
}

fn install_tasks() -> &'static Mutex<HashMap<String, Arc<InstallTaskState>>> {
    static INSTALL_TASKS: OnceLock<Mutex<HashMap<String, Arc<InstallTaskState>>>> = OnceLock::new();
    INSTALL_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_install_task_id() -> String {
    static INSTALL_TASK_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let sequence = INSTALL_TASK_SEQUENCE.fetch_add(1, Ordering::SeqCst) + 1;
    format!("install-task-{sequence}")
}

fn acquire_write_slot() -> WriteGuard {
    let coordinator = write_coordinator();
    let mut active = coordinator
        .active
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    while *active {
        active = coordinator
            .ready
            .wait(active)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
    }
    *active = true;
    drop(active);
    WriteGuard { coordinator }
}

fn try_acquire_write_slot() -> Option<WriteGuard> {
    let coordinator = write_coordinator();
    let mut active = coordinator
        .active
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if *active {
        return None;
    }
    *active = true;
    drop(active);
    Some(WriteGuard { coordinator })
}

fn write_coordinator() -> &'static WriteCoordinator {
    static WRITE_COORDINATOR: OnceLock<WriteCoordinator> = OnceLock::new();
    WRITE_COORDINATOR.get_or_init(|| WriteCoordinator {
        active: Mutex::new(false),
        ready: Condvar::new(),
    })
}

struct WriteCoordinator {
    active: Mutex<bool>,
    ready: Condvar,
}

struct WriteGuard {
    coordinator: &'static WriteCoordinator,
}

impl Drop for WriteGuard {
    fn drop(&mut self) {
        let mut active = self
            .coordinator
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *active = false;
        self.coordinator.ready.notify_one();
    }
}

struct InstallTaskState {
    snapshot: Mutex<InstallTaskSnapshot>,
    cancel_requested: AtomicBool,
}

impl InstallTaskState {
    fn snapshot(&self) -> InstallTaskSnapshot {
        self.snapshot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

enum OutputTarget {
    Stdout,
    Stderr,
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            mpsc::{self, RecvTimeoutError},
            Mutex, OnceLock,
        },
        thread,
        time::{Duration, Instant},
    };

    use super::{run_task, try_acquire_write_slot, TaskAccess};

    #[test]
    fn serializes_write_tasks() {
        let _test_guard = test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (first_acquired_tx, first_acquired_rx) = mpsc::channel();
        let (release_first_tx, release_first_rx) = mpsc::channel();
        let (second_attempt_tx, second_attempt_rx) = mpsc::channel();
        let (second_done_tx, second_done_rx) = mpsc::channel();

        let first = thread::spawn(move || {
            run_task(TaskAccess::Write, || {
                first_acquired_tx.send(()).unwrap();
                release_first_rx.recv().unwrap();
            });
        });

        first_acquired_rx.recv().unwrap();

        let second = thread::spawn(move || {
            second_attempt_tx.send(()).unwrap();
            let started_at = Instant::now();
            run_task(TaskAccess::Write, || {
                second_done_tx.send(started_at.elapsed()).unwrap();
            });
        });

        second_attempt_rx.recv().unwrap();
        assert_eq!(
            second_done_rx.recv_timeout(Duration::from_millis(50)),
            Err(RecvTimeoutError::Timeout)
        );

        release_first_tx.send(()).unwrap();
        let waited = second_done_rx
            .recv_timeout(Duration::from_millis(250))
            .unwrap();
        assert!(waited >= Duration::from_millis(50));

        first.join().unwrap();
        second.join().unwrap();
    }

    #[test]
    fn allows_read_tasks_to_run_while_write_task_is_active() {
        let _test_guard = test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (first_acquired_tx, first_acquired_rx) = mpsc::channel();
        let (release_first_tx, release_first_rx) = mpsc::channel();
        let (read_done_tx, read_done_rx) = mpsc::channel();

        let first = thread::spawn(move || {
            run_task(TaskAccess::Write, || {
                first_acquired_tx.send(()).unwrap();
                release_first_rx.recv().unwrap();
            });
        });

        first_acquired_rx.recv().unwrap();

        let read = thread::spawn(move || {
            let started_at = Instant::now();
            run_task(TaskAccess::Read, || {
                read_done_tx.send(started_at.elapsed()).unwrap();
            });
        });

        let elapsed = read_done_rx.recv_timeout(Duration::from_millis(50)).unwrap();
        assert!(elapsed < Duration::from_millis(50));

        release_first_tx.send(()).unwrap();

        first.join().unwrap();
        read.join().unwrap();
    }

    #[test]
    fn rejects_nonblocking_write_claim_while_active() {
        let _test_guard = test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let guard = try_acquire_write_slot().expect("expected first write slot");
        assert!(try_acquire_write_slot().is_none());
        drop(guard);
        assert!(try_acquire_write_slot().is_some());
    }

    fn test_lock() -> &'static Mutex<()> {
        static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        TEST_LOCK.get_or_init(|| Mutex::new(()))
    }
}
