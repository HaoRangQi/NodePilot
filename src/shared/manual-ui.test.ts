import { describe, expect, it } from "vitest";

import {
  collectManualUiSnapshot,
  getManualUiSnapshotConfig,
  snapshotFingerprint,
  type ManualUiSnapshotAppState,
} from "./manual-ui";
import type { ManualUiWindowSnapshot } from "./types/backend";

function mockRect(
  element: HTMLElement,
  { x, y, width, height }: { x: number; y: number; width: number; height: number },
) {
  element.getBoundingClientRect = () =>
    ({
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON: () => undefined,
    }) as DOMRect;
}

const BASE_APP_STATE: ManualUiSnapshotAppState = {
  screen: "remote",
  title: "Remote",
  locale: "zh-CN",
  theme: "dark",
  backendKind: "nvm-sh",
  currentNodeVersion: "v22.11.0",
  defaultVersion: "v20.18.1",
  versionSource: "nvm-sh",
  selectedProjectDir: "/tmp/project",
  selectedProjectVersion: "v24.16.0",
  activityTaskCount: 2,
  runningTaskCount: 1,
  writeLocked: false,
  manualBridgeLastCommandId: null,
  manualBridgeLastCommandStatus: null,
  manualBridgeLastError: null,
  flags: {
    backendInstallPending: false,
    versionActionPending: false,
    remoteLoading: false,
    remoteInstallPending: true,
    projectInstallPending: false,
    projectWritePending: false,
  },
};

const WINDOW_SNAPSHOT: ManualUiWindowSnapshot = {
  scaleFactor: 2,
  innerPositionPhysical: { x: 1380, y: 452 },
  outerPositionPhysical: { x: 1380, y: 388 },
  innerSizePhysical: { width: 2360, height: 1456 },
  outerSizePhysical: { width: 2360, height: 1520 },
  clientOriginLogical: { x: 690, y: 226 },
  clientOriginPhysical: { x: 1380, y: 452 },
};

describe("manual ui snapshot helpers", () => {
  it("parses the manual snapshot env flag", () => {
    expect(
      getManualUiSnapshotConfig({
        VITE_NODEPILOT_MANUAL_UI_SNAPSHOT: "1",
        VITE_NODEPILOT_MANUAL_PROJECT_DIR: "/tmp/manual-project",
      }),
    ).toEqual({
      enabled: true,
      presetProjectDir: "/tmp/manual-project",
    });
    expect(getManualUiSnapshotConfig({ VITE_NODEPILOT_MANUAL_UI_SNAPSHOT: "true" }).enabled).toBe(true);
    expect(getManualUiSnapshotConfig({ VITE_NODEPILOT_MANUAL_UI_SNAPSHOT: "0" }).enabled).toBe(false);
    expect(getManualUiSnapshotConfig({ VITE_NODEPILOT_MANUAL_PROJECT_DIR: "   " }).presetProjectDir).toBeNull();
  });

  it("captures dialogs and interactive elements with context", () => {
    document.body.innerHTML = `
      <main>
        <section>
          <h2>Remote</h2>
          <article>
            <h3>v24.16.0</h3>
            <button type="button">Install</button>
          </article>
        </section>
        <div role="dialog" aria-labelledby="remote-install-title">
          <h2 id="remote-install-title">Install remote release · v24.16.0</h2>
          <button type="button" aria-label="Confirm install">Confirm</button>
        </div>
      </main>
    `;

    const root = document.querySelector("main");
    const installButton = document.querySelector("article button");
    const dialog = document.querySelector("[role='dialog']");
    const confirmButton = document.querySelector("[aria-label='Confirm install']");

    if (!(root instanceof HTMLElement)) throw new Error("missing root");
    if (!(installButton instanceof HTMLElement)) throw new Error("missing install button");
    if (!(dialog instanceof HTMLElement)) throw new Error("missing dialog");
    if (!(confirmButton instanceof HTMLElement)) throw new Error("missing confirm button");

    mockRect(root, { x: 0, y: 0, width: 1280, height: 820 });
    mockRect(installButton, { x: 120, y: 180, width: 96, height: 36 });
    mockRect(dialog, { x: 400, y: 220, width: 480, height: 320 });
    mockRect(confirmButton, { x: 720, y: 490, width: 120, height: 40 });

    const snapshot = collectManualUiSnapshot(root, BASE_APP_STATE, WINDOW_SNAPSHOT);

    expect(snapshot.dialogs).toEqual([
      expect.objectContaining({
        title: "Install remote release · v24.16.0",
        rect: { x: 400, y: 220, width: 480, height: 320 },
        screenRectLogical: { x: 1090, y: 446, width: 480, height: 320 },
        screenRectPhysical: { x: 2180, y: 892, width: 960, height: 640 },
      }),
    ]);
    expect(snapshot.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "button",
          label: "Install",
          context: "v24.16.0",
          dialog: null,
          rect: { x: 120, y: 180, width: 96, height: 36 },
          screenCenterLogical: { x: 858, y: 424 },
          screenCenterPhysical: { x: 1716, y: 848 },
        }),
        expect.objectContaining({
          role: "button",
          label: "Confirm install",
          dialog: "Install remote release · v24.16.0",
          context: "Install remote release · v24.16.0",
          rect: { x: 720, y: 490, width: 120, height: 40 },
          screenCenterLogical: { x: 1470, y: 736 },
          screenCenterPhysical: { x: 2940, y: 1472 },
        }),
      ]),
    );
  });

  it("builds a stable fingerprint without capture time noise", () => {
    const baseSnapshot = {
      schemaVersion: 1 as const,
      capturedAt: "2026-06-03T00:00:00.000Z",
      viewport: { width: 1280, height: 820 },
      window: WINDOW_SNAPSHOT,
      app: BASE_APP_STATE,
      dialogs: [],
      elements: [
        {
          id: "button:install:v24-16-0",
          role: "button",
          label: "Install",
          text: "Install",
          context: "v24.16.0",
          dialog: null,
          disabled: false,
          rect: { x: 120, y: 180, width: 96, height: 36 },
          screenRectLogical: { x: 810, y: 406, width: 96, height: 36 },
          screenRectPhysical: { x: 1620, y: 812, width: 192, height: 72 },
          screenCenterLogical: { x: 858, y: 424 },
          screenCenterPhysical: { x: 1716, y: 848 },
        },
      ],
    };

    expect(
      snapshotFingerprint({
        ...baseSnapshot,
        capturedAt: "2026-06-03T00:00:01.000Z",
      }),
    ).toBe(
      snapshotFingerprint({
        ...baseSnapshot,
        capturedAt: "2026-06-03T00:01:00.000Z",
      }),
    );
  });
});
