import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  desktopStartupTimeoutMs,
  devUrl,
  projectRoot,
  spawnTauriDev,
  startupTimeoutMs,
  terminateChild,
  waitForDesktopProcess,
  waitForDevServer,
} from './tauri-dev-runtime.mjs';

const SNAPSHOT_TIMEOUT_MS = 15000;
const BRIDGE_WARMUP_MS = 600;

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-tauri-bridge-'));
  const snapshotPath = path.join(tempRoot, 'MANUAL-UI-SNAPSHOT.json');
  const commandPath = path.join(tempRoot, 'MANUAL-UI-COMMAND.json');
  const commandResultPath = path.join(tempRoot, 'MANUAL-UI-COMMAND-RESULT.json');
  const projectDir = path.join(tempRoot, 'project');
  const expectedProjectDir = await realpath(projectDir).catch(() => projectDir);
  const report = {
    devUrl,
    snapshotPath,
    commandPath,
    commandResultPath,
    desktopProcessStarted: false,
    steps: [],
    cleanupAttempted: false,
    recentOutput: '',
  };

  await mkdir(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, '.nvmrc'), 'v24.16.0\n', 'utf8');

  const env = {
    ...process.env,
    VITE_NODEPILOT_MANUAL_UI_SNAPSHOT: '1',
    VITE_NODEPILOT_MANUAL_PROJECT_DIR: projectDir,
    NODEPILOT_MANUAL_UI_SNAPSHOT_PATH: snapshotPath,
    NODEPILOT_MANUAL_UI_COMMAND_PATH: commandPath,
    NODEPILOT_MANUAL_UI_COMMAND_RESULT_PATH: commandResultPath,
  };

  const { child, hasStartedDesktopProcess, recentOutput } = spawnTauriDev({ env });

  try {
    const response = await waitForDevServer(devUrl, startupTimeoutMs);
    await waitForDesktopProcess(hasStartedDesktopProcess, child, desktopStartupTimeoutMs, recentOutput);
    report.desktopProcessStarted = true;

    if (!response.body.includes('<div id="root"></div>')) {
      throw new Error('Unexpected dev server response body; missing root mount node.');
    }

    await waitForSnapshot(
      snapshotPath,
      (snapshot) => snapshot?.app?.screen === 'home',
      SNAPSHOT_TIMEOUT_MS,
      'initial home snapshot',
    );
    await delay(BRIDGE_WARMUP_MS);

    const navigateCommand = {
      id: 'bridge-navigate-versions',
      kind: 'navigate',
      screen: 'versions',
    };
    const navigateSnapshot = await dispatchBridgeCommand({
      commandPath,
      resultPath: commandResultPath,
      snapshotPath,
      command: navigateCommand,
      label: 'navigate versions',
      predicate: (snapshot) =>
        snapshot?.app?.manualBridgeLastCommandId === navigateCommand.id &&
        snapshot?.app?.screen === 'versions',
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
    });
    report.steps.push({
      step: 'navigate versions',
      ok: true,
      detail: `screen=${navigateSnapshot.app.screen}`,
    });

    const clickCommand = {
      id: 'bridge-click-settings',
      kind: 'click',
      manualId: 'nav:settings',
    };
    const clickSnapshot = await dispatchBridgeCommand({
      commandPath,
      resultPath: commandResultPath,
      snapshotPath,
      command: clickCommand,
      label: 'click settings nav',
      predicate: (snapshot) =>
        snapshot?.app?.manualBridgeLastCommandId === clickCommand.id &&
        snapshot?.app?.screen === 'settings',
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
    });
    report.steps.push({
      step: 'click settings nav',
      ok: true,
      detail: `screen=${clickSnapshot.app.screen}`,
    });

    const readProjectCommand = {
      id: 'bridge-read-project',
      kind: 'read-project',
      projectDir,
    };
    const projectSnapshot = await dispatchBridgeCommand({
      commandPath,
      resultPath: commandResultPath,
      snapshotPath,
      command: readProjectCommand,
      label: 'read project',
      predicate: (snapshot) =>
        snapshot?.app?.manualBridgeLastCommandId === readProjectCommand.id &&
        snapshot?.app?.screen === 'projects' &&
        normalizePath(snapshot?.app?.selectedProjectDir) === normalizePath(expectedProjectDir) &&
        snapshot?.app?.selectedProjectVersion === 'v24.16.0',
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
    });
    report.steps.push({
      step: 'read project',
      ok: true,
      detail: `screen=${projectSnapshot.app.screen}, project=${projectSnapshot.app.selectedProjectDir}, version=${projectSnapshot.app.selectedProjectVersion}`,
    });
  } finally {
    report.cleanupAttempted = true;
    report.recentOutput = recentOutput().slice(-4000);
    await terminateChild(child);
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify(report, null, 2));
}

async function waitForSnapshot(snapshotPath, predicate, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
      if (predicate(snapshot)) {
        return snapshot;
      }
    } catch {
      // keep polling until timeout
    }
    await delay(150);
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function dispatchBridgeCommand({
  commandPath,
  resultPath,
  snapshotPath,
  command,
  label,
  predicate,
  timeoutMs,
}) {
  await mkdir(path.dirname(commandPath), { recursive: true });
  await mkdir(path.dirname(resultPath), { recursive: true });
  await rm(commandPath, { force: true });
  await rm(resultPath, { force: true });
  await writeFile(commandPath, `${JSON.stringify(command, null, 2)}\n`, 'utf8');

  return await waitForSnapshot(
    snapshotPath,
    predicate,
    timeoutMs,
    `${label} snapshot`,
  );
}

function normalizePath(value) {
  if (typeof value !== 'string') {
    return null;
  }

  return path.normalize(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
