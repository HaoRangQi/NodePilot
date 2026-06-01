import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MOCK_BACKEND_SNAPSHOT } from "./shared/api/backend";
import type { EnvironmentSummary } from "./shared/types/backend";

const getBackendSnapshotMock = vi.hoisted(() => vi.fn());

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
});
