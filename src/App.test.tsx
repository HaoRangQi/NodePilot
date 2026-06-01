import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MOCK_BACKEND_SNAPSHOT } from "./shared/api/backend";
import type { EnvironmentSummary } from "./shared/types/backend";

const getBackendSnapshotMock = vi.hoisted(() => vi.fn());
const writeTextMock = vi.hoisted(() => vi.fn());

vi.mock("./shared/api/backend", async () => {
  const actual = await vi.importActual<typeof import("./shared/api/backend")>("./shared/api/backend");

  return {
    ...actual,
    getBackendSnapshot: getBackendSnapshotMock,
  };
});

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("nodepilot.locale", "en-US");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
    writeTextMock.mockReset();
    writeTextMock.mockResolvedValue(undefined);
    getBackendSnapshotMock.mockReset();
    getBackendSnapshotMock.mockResolvedValue(MOCK_BACKEND_SNAPSHOT);
  });

  it("renders the NodePilot management shell", () => {
    render(<App />);

    expect(screen.getByLabelText("NodePilot")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    expect(screen.getAllByText("nvm-sh").length).toBeGreaterThan(0);
  });

  it("uses the persisted locale and theme", () => {
    localStorage.setItem("nodepilot.locale", "en-US");
    localStorage.setItem("nodepilot.theme", "dark");

    const { container } = render(<App />);

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveAttribute("data-theme", "dark");
  });

  it("renders the backend snapshot on Home", async () => {
    const snapshot: EnvironmentSummary = {
      ...MOCK_BACKEND_SNAPSHOT,
      currentNodeVersion: "v18.20.4",
      npmVersion: "10.7.0",
      pnpmVersion: null,
      backendKind: "nvm-windows",
      arch: "x64",
      versionSource: "nvm-windows",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "nvm-windows",
        items: [
          {
            key: "admin_required",
            status: "pending",
            summary: "Windows activation may require administrator permissions",
            detail: null,
          },
        ],
      },
    };
    getBackendSnapshotMock.mockResolvedValueOnce(snapshot);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v18.20.4" })).toBeInTheDocument();
    });
    expect(screen.getAllByText("nvm-windows").length).toBeGreaterThan(0);
    expect(screen.getByText("10.7.0")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "Platform: macos / x64"),
    ).toBeInTheDocument();
    expect(screen.getByText("Windows activation may require administrator permissions")).toBeInTheDocument();
    expect(screen.getByText("Check administrator rights")).toBeInTheDocument();
  });

  it("renders missing backend and PATH conflict recommendations", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      backendKind: "missing",
      versionSource: "system",
      defaultVersion: null,
      defaultExists: false,
      defaultMatchesCurrent: false,
      health: {
        backend: "missing",
        items: [
          {
            key: "nvm_script",
            status: "failed",
            summary: "~/.nvm/nvm.sh is missing",
            detail: null,
          },
          {
            key: "node_path_source",
            status: "failed",
            summary: "Node PATH does not appear to come from the detected backend",
            detail: "/usr/local/bin/node",
          },
        ],
      },
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Install nvm")).toBeInTheDocument();
    });
    expect(screen.getByText("Copy PATH fix")).toBeInTheDocument();
    expect(screen.getByText("Current Node is not managed by nvm. Check PATH ordering.")).toBeInTheDocument();
  });

  it("renders installed versions from the backend snapshot", async () => {
    getBackendSnapshotMock.mockResolvedValueOnce({
      ...MOCK_BACKEND_SNAPSHOT,
      defaultVersion: "v21.7.3",
      installedVersions: [
        {
          version: "v21.7.3",
          npmVersion: null,
          path: null,
          arch: "arm64",
          isCurrent: true,
          isDefault: false,
          isLts: false,
          isSystem: false,
          line: null,
        },
        {
          version: "system",
          npmVersion: "9.8.1",
          path: "/usr/local/bin/node",
          arch: "x64",
          isCurrent: false,
          isDefault: false,
          isLts: false,
          isSystem: true,
          line: null,
        },
      ],
    } satisfies EnvironmentSummary);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Node v22.11.0" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    expect(screen.getByRole("heading", { name: "v21.7.3" })).toBeInTheDocument();
    expect(screen.getAllByText("Not detected").length).toBeGreaterThan(0);
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "v18.20.4" })).not.toBeInTheDocument();
  });

  it("renders Activity task states, split logs, and redacted sensitive content", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Activity" }));

    await waitFor(() => {
      expect(screen.getByText("Detect environment")).toBeInTheDocument();
    });
    expect(screen.getByText("Remote refresh")).toBeInTheDocument();
    expect(screen.getByText("Install version")).toBeInTheDocument();
    expect(screen.getByText("Read .nvmrc")).toBeInTheDocument();
    expect(screen.getByText("Set default")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(1);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Warn")).toBeInTheDocument();
    expect(screen.getAllByText("stdout").length).toBeGreaterThan(0);
    expect(screen.getAllByText("stderr").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "PRE" && (element.textContent?.includes("token=[REDACTED]") ?? false),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          (element.textContent?.includes("authorization: [REDACTED]") ?? false),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
    expect(screen.getByText("Exit code 3")).toBeInTheDocument();
    expect(screen.getByText(/Recommended fix:/)).toBeInTheDocument();
    expect(screen.getByText(/A write task is running/)).toBeInTheDocument();

    const installTask = screen.getByText("Install version").closest("article");
    expect(installTask).not.toBeNull();
    fireEvent.click(within(installTask as HTMLElement).getByRole("button", { name: "Copy logs" }));
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedLog = writeTextMock.mock.calls[0][0] as string;
    expect(copiedLog).toContain("token=[REDACTED]");
    expect(copiedLog).toContain("authorization: [REDACTED]");
    expect(copiedLog).not.toContain("abc123");

    fireEvent.click(screen.getAllByRole("button", { name: "Collapse logs" })[0]);

    expect(screen.getByRole("button", { name: "Expand logs" })).toBeInTheDocument();
  });
});
