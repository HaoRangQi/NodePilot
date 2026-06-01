import type { StatusKey } from "../types/ui";

export type ActivityTaskType =
  | "detect"
  | "health_check"
  | "remote_refresh"
  | "install"
  | "uninstall"
  | "activate"
  | "set_default"
  | "project_nvmrc_read"
  | "project_nvmrc_write";

export type ActivityTaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export type ActivityAccess = "read" | "write";

export type ActivityTask = {
  id: string;
  type: ActivityTaskType;
  title: string;
  status: ActivityTaskStatus;
  access: ActivityAccess;
  startedAt: string;
  endedAt: string | null;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  summary: string;
  recommendation: string | null;
};

export function taskStatusKey(status: ActivityTaskStatus): StatusKey {
  switch (status) {
    case "pending":
      return "warn";
    case "running":
      return "running";
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "cancelled":
      return "missing";
  }
}

export function durationLabel(task: Pick<ActivityTask, "startedAt" | "endedAt">): string {
  if (!task.endedAt) return "Running";

  const elapsedMs = new Date(task.endedAt).getTime() - new Date(task.startedAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "0s";

  if (elapsedMs < 1000) return `${elapsedMs}ms`;

  return `${(elapsedMs / 1000).toFixed(1).replace(/\.0$/, "")}s`;
}

export function canStartTask(tasks: ActivityTask[], access: ActivityAccess): boolean {
  if (access === "read") return true;

  return !tasks.some((task) => task.access === "write" && task.status === "running");
}

export function redactLog(input: string): string {
  return input
    .split("\n")
    .map(redactLine)
    .join("\n");
}

function redactLine(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("authorization:") || lower.includes("auth header")) {
    return "authorization: [REDACTED]";
  }

  return ["token", "secret"].reduce((current, key) => redactKeyValue(current, key), line);
}

function redactKeyValue(line: string, key: string): string {
  const lower = line.toLowerCase();
  const start = lower.indexOf(key);
  if (start < 0) return line;

  const afterKey = line.slice(start + key.length);
  const separatorOffset = Math.min(
    ...["=", ":"]
      .map((separator) => afterKey.indexOf(separator))
      .filter((index) => index >= 0),
  );
  if (!Number.isFinite(separatorOffset)) return line;

  const valueStart = start + key.length + separatorOffset + 1;
  return `${line.slice(0, valueStart)}[REDACTED]`;
}
