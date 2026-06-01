import { describe, expect, it } from "vitest";
import {
  canStartTask,
  durationLabel,
  redactLog,
  taskStatusKey,
  type ActivityTask,
} from "./model";

const baseTask: ActivityTask = {
  id: "task-1",
  type: "detect",
  title: "Detect backend",
  status: "success",
  access: "read",
  startedAt: "2026-06-01T10:00:00.000Z",
  endedAt: "2026-06-01T10:00:02.400Z",
  command: "detect backend",
  stdout: "backend=nvm-sh",
  stderr: "",
  exitCode: 0,
  summary: "Backend detected",
  recommendation: null,
};

describe("activity model", () => {
  it("maps task status to UI status keys", () => {
    expect(taskStatusKey("pending")).toBe("warn");
    expect(taskStatusKey("running")).toBe("running");
    expect(taskStatusKey("success")).toBe("success");
    expect(taskStatusKey("failed")).toBe("failed");
    expect(taskStatusKey("cancelled")).toBe("missing");
  });

  it("formats task duration", () => {
    expect(durationLabel(baseTask)).toBe("2.4s");
    expect(durationLabel({ ...baseTask, endedAt: null })).toBe("Running");
  });

  it("allows read tasks in parallel but blocks concurrent writes", () => {
    const runningWrite: ActivityTask = {
      ...baseTask,
      id: "task-2",
      type: "install",
      access: "write",
      status: "running",
      endedAt: null,
    };

    expect(canStartTask([runningWrite], "read")).toBe(true);
    expect(canStartTask([runningWrite], "write")).toBe(false);
    expect(canStartTask([{ ...runningWrite, status: "success" }], "write")).toBe(true);
  });

  it("redacts sensitive stdout and stderr content", () => {
    expect(redactLog("token=abc\nAuthorization: Bearer abc\nsecret: value")).toContain(
      "token=[REDACTED]",
    );
    expect(redactLog("token=abc\nAuthorization: Bearer abc\nsecret: value")).toContain(
      "authorization: [REDACTED]",
    );
    expect(redactLog("token=abc\nAuthorization: Bearer abc\nsecret: value")).toContain(
      "secret:[REDACTED]",
    );
  });
});
