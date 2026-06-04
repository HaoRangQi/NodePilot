import { useEffect, useMemo, useRef, type RefObject } from "react";

import { writeManualUiSnapshot } from "./api/backend";
import {
  collectManualUiSnapshot,
  getManualUiSnapshotConfig,
  snapshotFingerprint,
  type ManualUiSnapshotAppState,
} from "./manual-ui";
import { readManualUiWindowSnapshot } from "./manual-ui-window";

const SNAPSHOT_POLL_MS = 700;

export function useManualUiSnapshot(
  rootRef: RefObject<HTMLElement | null>,
  appState: ManualUiSnapshotAppState,
) {
  const config = useMemo(() => getManualUiSnapshotConfig(), []);
  const appStateRef = useRef(appState);
  const lastFingerprintRef = useRef<string | null>(null);
  const captureRef = useRef<(() => Promise<void>) | null>(null);

  appStateRef.current = appState;
  captureRef.current = async () => {
    const root = rootRef.current;
    if (!root) return;

    const windowSnapshot = await readManualUiWindowSnapshot();
    const snapshot = collectManualUiSnapshot(root, appStateRef.current, windowSnapshot);
    const fingerprint = snapshotFingerprint(snapshot);
    if (fingerprint === lastFingerprintRef.current) return;

    await writeManualUiSnapshot(snapshot);
    lastFingerprintRef.current = fingerprint;
  };

  useEffect(() => {
    if (!config.enabled) return;

    let cancelled = false;

    const capture = async () => {
      if (cancelled || !captureRef.current) return;

      try {
        await captureRef.current();
      } catch {
        // 手工验收模式下忽略写盘失败，保留下一轮重试机会。
      }
    };

    const frameId = window.requestAnimationFrame(() => {
      void capture();
    });
    const intervalId = window.setInterval(() => {
      void capture();
    }, SNAPSHOT_POLL_MS);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
    };
  }, [config.enabled, rootRef]);

  useEffect(() => {
    if (!config.enabled) return;

    const frameId = window.requestAnimationFrame(() => {
      if (!captureRef.current) return;

      void captureRef.current()
        .catch(() => {
          // 手工验收模式下忽略写盘失败，保留下一轮重试机会。
        });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    appState.activityTaskCount,
    appState.backendKind,
    appState.currentNodeVersion,
    appState.defaultVersion,
    appState.locale,
    appState.runningTaskCount,
    appState.screen,
    appState.selectedProjectDir,
    appState.selectedProjectVersion,
    appState.theme,
    appState.title,
    appState.versionSource,
    appState.writeLocked,
    appState.flags.backendInstallPending,
    appState.flags.projectInstallPending,
    appState.flags.projectWritePending,
    appState.flags.remoteInstallPending,
    appState.flags.remoteLoading,
    appState.flags.versionActionPending,
    config.enabled,
    rootRef,
  ]);
}
