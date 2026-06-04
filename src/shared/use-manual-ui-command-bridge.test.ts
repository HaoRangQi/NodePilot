import { createElement } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useManualUiCommandBridge } from "./use-manual-ui-command-bridge";
import type { ManualUiCommand } from "./types/backend";

const takeManualUiCommandMock = vi.hoisted(() => vi.fn());
const writeManualUiCommandResultMock = vi.hoisted(() => vi.fn());
const getManualUiSnapshotConfigMock = vi.hoisted(() => vi.fn());

vi.mock("./api/backend", () => ({
  takeManualUiCommand: takeManualUiCommandMock,
  writeManualUiCommandResult: writeManualUiCommandResultMock,
}));

vi.mock("./manual-ui", () => ({
  getManualUiSnapshotConfig: getManualUiSnapshotConfigMock,
}));

function TestHarness({
  execute,
  readState,
}: {
  execute: (command: ManualUiCommand) => Promise<void> | void;
  readState: () => {
    screen: string;
    dialogTitles: string[];
  };
}) {
  useManualUiCommandBridge({ execute, readState });
  return createElement("div", null, "bridge");
}

describe("useManualUiCommandBridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getManualUiSnapshotConfigMock.mockReset();
    getManualUiSnapshotConfigMock.mockReturnValue({
      enabled: true,
      presetProjectDir: null,
    });
    takeManualUiCommandMock.mockReset();
    writeManualUiCommandResultMock.mockReset();
    writeManualUiCommandResultMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("falls back to a timeout when requestAnimationFrame does not fire", async () => {
    takeManualUiCommandMock
      .mockResolvedValueOnce({
        id: "cmd-1",
        kind: "navigate",
        screen: "versions",
      })
      .mockResolvedValue(null);

    const execute = vi.fn().mockResolvedValue(undefined);
    const readState = vi.fn(() => ({
      screen: "versions",
      dialogTitles: [],
    }));

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);

    render(createElement(TestHarness, { execute, readState }));

    await vi.advanceTimersByTimeAsync(500);

    expect(execute).toHaveBeenCalledWith({
      id: "cmd-1",
      kind: "navigate",
      screen: "versions",
    });
    expect(writeManualUiCommandResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cmd-1",
        kind: "navigate",
        status: "success",
        message: null,
        screen: "versions",
        dialogTitles: [],
      }),
    );
  });
});
