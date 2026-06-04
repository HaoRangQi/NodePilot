// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createReleaseCandidateSummary,
  prepareReleaseCandidateBundle,
  renderReleaseCandidateGuide,
} from './prepare-release-candidate.mjs';

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

describe('release candidate preparation helpers', () => {
  it('renders a concise release candidate guide with remaining manual gates', () => {
    const summary = createReleaseCandidateSummary({
      projectRootPath: '/workspace/nodepilot',
      runVerification: true,
      artifacts: {
        releaseBinaryPath: '/workspace/nodepilot/src-tauri/target/release/nodepilot',
        macosAppPath: '/workspace/nodepilot/src-tauri/target/release/bundle/macos/NodePilot.app',
        macosDmgPath: '/workspace/nodepilot/src-tauri/target/release/bundle/dmg/NodePilot.dmg',
      },
      macosLinux: {
        guidePath: '/tmp/macos/MANUAL-CHECK.md',
        launchScriptPath: '/tmp/macos/launch-nodepilot.sh',
        automationScriptPath: '/tmp/macos/run-automation-baseline.sh',
        automationLogPath: '/tmp/macos/AUTOMATION-BASELINE.log',
        resultPath: '/tmp/macos/MANUAL-RESULT.json',
        checklistPath: '/tmp/macos/MANUAL-CHECKLIST.md',
      },
      windows: {
        guidePath: '/tmp/windows/MANUAL-WINDOWS-CHECK.md',
        powerShellPath: '/tmp/windows/manual-windows-check.ps1',
        automationScriptPath: '/tmp/windows/run-automation-baseline.ps1',
        automationLogPath: '/tmp/windows/AUTOMATION-BASELINE.log',
        resultPath: '/tmp/windows/MANUAL-RESULT.json',
        checklistPath: '/tmp/windows/MANUAL-CHECKLIST.md',
      },
      rootDir: '/tmp/release-candidate',
    });

    const guide = renderReleaseCandidateGuide(summary);

    expect(guide).toContain('# NodePilot Release Candidate Bundle');
    expect(guide).toContain('`10.2 Manual macOS/Linux Verification`');
    expect(guide).toContain('`10.3 Manual Windows Verification`');
    expect(guide).toContain('/tmp/macos/run-automation-baseline.sh');
    expect(guide).toContain('/tmp/windows/manual-windows-check.ps1');
    expect(guide).toContain('pnpm verify:manual:sync /tmp/macos/MANUAL-RESULT.json');
  });

  it('prepares a release candidate bundle without rerunning verification when skipped', async () => {
    const parentDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-release-candidate-test-'));
    cleanupDirs.push(parentDir);

    const report = await prepareReleaseCandidateBundle({
      projectRootPath: '/workspace/nodepilot',
      tempRootDir: parentDir,
      runVerification: false,
    });
    cleanupDirs.push(report.rootDir);

    expect(report.runVerification).toBe(false);

    const summary = JSON.parse(await readFile(report.summaryPath, 'utf8'));
    expect(summary.projectRootPath).toBe('/workspace/nodepilot');
    expect(summary.runVerification).toBe(false);
    expect(summary.remainingManualVerification).toEqual([
      '10.2 Manual macOS/Linux Verification',
      '10.3 Manual Windows Verification',
    ]);
    expect(summary.manualBundles.macosLinux.guidePath).toContain('MANUAL-CHECK.md');
    expect(summary.manualBundles.windows.guidePath).toContain('MANUAL-WINDOWS-CHECK.md');

    const guide = await readFile(report.guidePath, 'utf8');
    expect(guide).toContain('已跳过执行自动化回归入口：`pnpm verify:all`');
    expect(guide).toContain(summary.manualBundles.macosLinux.resultPath);
    expect(guide).toContain(summary.manualBundles.windows.resultPath);
  });
});
