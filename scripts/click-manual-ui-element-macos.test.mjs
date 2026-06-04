// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  clickManualUiElement,
  parseArgs,
  resolveTargetElement,
  resolveTargetPoint,
} from './click-manual-ui-element-macos.mjs';

const cleanupDirs = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function createSnapshot() {
  return {
    schemaVersion: 1,
    capturedAt: '2026-06-03T00:00:00.000Z',
    viewport: { width: 1180, height: 728 },
    window: {
      scaleFactor: 2,
      innerPositionPhysical: { x: 1380, y: 452 },
      outerPositionPhysical: { x: 1380, y: 388 },
      innerSizePhysical: { width: 2360, height: 1456 },
      outerSizePhysical: { width: 2360, height: 1520 },
      clientOriginLogical: { x: 690, y: 226 },
      clientOriginPhysical: { x: 1380, y: 452 },
    },
    app: {
      screen: 'home',
      title: '总览',
      locale: 'zh-CN',
      theme: 'dark',
      backendKind: 'missing',
      currentNodeVersion: null,
      defaultVersion: null,
      versionSource: 'unknown',
      selectedProjectDir: null,
      selectedProjectVersion: null,
      activityTaskCount: 0,
      runningTaskCount: 0,
      writeLocked: false,
      flags: {
        backendInstallPending: false,
        versionActionPending: false,
        remoteLoading: false,
        remoteInstallPending: false,
        projectInstallPending: false,
        projectWritePending: false,
      },
    },
    dialogs: [],
    elements: [
      {
        id: 'nav:settings',
        role: 'button',
        label: '打开 设置',
        text: '⚙设置',
        context: null,
        dialog: null,
        disabled: false,
        rect: { x: 14, y: 454, width: 83, height: 64 },
        screenRectLogical: { x: 704, y: 680, width: 83, height: 64 },
        screenRectPhysical: { x: 1408, y: 1360, width: 166, height: 128 },
        screenCenterLogical: { x: 746, y: 712 },
        screenCenterPhysical: { x: 1491, y: 1424 },
      },
    ],
  };
}

describe('manual ui click helper', () => {
  it('parses selector arguments', () => {
    expect(
      parseArgs([
        'node',
        'script',
        './tmp/snapshot.json',
        '--id',
        'nav:settings',
        '--activate-app',
        'nodepilot',
        '--space',
        'physical',
        '--dry-run',
      ]),
    ).toMatchObject({
      id: 'nav:settings',
      activateApp: 'nodepilot',
      coordinateSpace: 'physical',
      dryRun: true,
    });
  });

  it('finds a unique snapshot element', () => {
    expect(
      resolveTargetElement(createSnapshot(), {
        id: 'nav:settings',
        label: null,
        context: null,
        dialog: null,
      }),
    ).toMatchObject({
      id: 'nav:settings',
    });
  });

  it('prefers logical coordinates by default', () => {
    const element = createSnapshot().elements[0];
    expect(resolveTargetPoint(element, 'logical')).toEqual({ x: 746, y: 712 });
    expect(resolveTargetPoint(element, 'physical')).toEqual({ x: 1491, y: 1424 });
  });

  it('loads a snapshot and resolves a dry-run click target', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-manual-click-test-'));
    cleanupDirs.push(tempDir);
    const snapshotPath = path.join(tempDir, 'MANUAL-UI-SNAPSHOT.json');
    await writeFile(snapshotPath, `${JSON.stringify(createSnapshot(), null, 2)}\n`, 'utf8');

    const result = await clickManualUiElement({
      snapshotPath,
      id: 'nav:settings',
      label: null,
      context: null,
      dialog: null,
      coordinateSpace: 'logical',
      activateApp: 'nodepilot',
      dryRun: true,
    });

    expect(result).toEqual({
      snapshotPath,
      elementId: 'nav:settings',
      label: '打开 设置',
      coordinateSpace: 'logical',
      activateApp: 'nodepilot',
      point: { x: 746, y: 712 },
      dryRun: true,
    });

    const content = await readFile(snapshotPath, 'utf8');
    expect(content).toContain('nav:settings');
  });
});
