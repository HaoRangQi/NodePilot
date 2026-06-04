import { useEffect, useMemo, useRef } from "react";

import {
  takeManualUiCommand,
  writeManualUiCommandResult,
} from "./api/backend";
import { getManualUiSnapshotConfig } from "./manual-ui";
import type { ManualUiCommand } from "./types/backend";

const COMMAND_POLL_MS = 300;
const UI_SETTLE_TIMEOUT_MS = 120;

export type ManualUiCommandState = {
  screen: string;
  dialogTitles: string[];
};

export type ManualUiCommandBridgeState = {
  lastCommandId: string | null;
  lastCommandStatus: string | null;
  lastError: string | null;
};

export function useManualUiCommandBridge({
  execute,
  readState,
  onStateChange,
}: {
  execute: (command: ManualUiCommand) => Promise<void> | void;
  readState: () => ManualUiCommandState;
  onStateChange?: (state: ManualUiCommandBridgeState) => void;
}) {
  const config = useMemo(() => getManualUiSnapshotConfig(), []);
  const executeRef = useRef(execute);
  const readStateRef = useRef(readState);
  const inFlightRef = useRef(false);

  executeRef.current = execute;
  readStateRef.current = readState;

  useEffect(() => {
    if (!config.enabled) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled || inFlightRef.current) return;

      try {
        const command = await takeManualUiCommand();
        if (!command) return;

        inFlightRef.current = true;
        let status: "success" | "failed" = "success";
        let message: string | null = null;
        onStateChange?.({
          lastCommandId: command.id,
          lastCommandStatus: "received",
          lastError: null,
        });

        try {
          await executeRef.current(command);
          await settleUi();
        } catch (error) {
          status = "failed";
          message = error instanceof Error ? error.message : String(error);
        }

        const state = readStateRef.current();
        await writeManualUiCommandResult({
          id: command.id,
          kind: command.kind,
          status,
          message,
          completedAt: new Date().toISOString(),
          screen: state.screen,
          dialogTitles: state.dialogTitles,
        });
        onStateChange?.({
          lastCommandId: command.id,
          lastCommandStatus: status,
          lastError: message,
        });
      } catch (error) {
        onStateChange?.({
          lastCommandId: null,
          lastCommandStatus: "poll-error",
          lastError: error instanceof Error ? error.message : String(error),
        });
      } finally {
        inFlightRef.current = false;
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, COMMAND_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [config.enabled]);
}

async function settleUi() {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timeoutId = window.setTimeout(() => {
      finish();
    }, UI_SETTLE_TIMEOUT_MS);

    window.requestAnimationFrame(() => {
      window.clearTimeout(timeoutId);
      finish();
    });
  });
}
