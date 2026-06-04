// @vitest-environment node

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TARGET_VERSION as DEFAULT_NVM_SH_TARGET_VERSION,
  MANUAL_DEV_HOST,
  buildAutomationBaselineScript,
  buildLaunchScript,
  detectPreferredAccessHost,
  prepareManualNvmShVerification,
  shellQuote,
} from './prepare-manual-nvm-sh-verification.mjs';
import {
  DEFAULT_TARGET_VERSION as DEFAULT_WINDOWS_TARGET_VERSION,
  buildAutomationPowerShellScript,
  buildGuide as buildWindowsGuide,
  buildPowerShellScript,
  prepareManualNvmWindowsVerification,
} from './prepare-manual-nvm-windows-verification.mjs';

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

describe('manual verification preparation helpers', () => {
  it('quotes shell values for launcher scripts', () => {
    expect(shellQuote("/tmp/with space/it's-here")).toBe("'/tmp/with space/it'\\''s-here'");
  });

  it('builds a launcher that exports isolated HOME and NVM_DIR', () => {
    const script = buildLaunchScript({
      projectRootPath: '/workspace/nodepilot',
      homeDir: '/tmp/manual home',
      nvmDir: "/tmp/manual home's nvm",
      cargoHome: '/Users/example/.cargo',
      rustupHome: '/Users/example/.rustup',
      projectDir: '/tmp/manual project',
      snapshotPath: '/tmp/nodepilot-manual-ui-snapshot.json',
      commandPath: '/tmp/nodepilot-manual-ui-command.json',
      commandResultPath: '/tmp/nodepilot-manual-ui-command-result.json',
    });

    expect(script).toContain("export HOME='/tmp/manual home'");
    expect(script).toContain("export NVM_DIR='/tmp/manual home'\\''s nvm'");
    expect(script).toContain("export CARGO_HOME='/Users/example/.cargo'");
    expect(script).toContain("export RUSTUP_HOME='/Users/example/.rustup'");
    expect(script).toContain(`export TAURI_DEV_HOST=${MANUAL_DEV_HOST}`);
    expect(script).toContain("export VITE_NODEPILOT_MANUAL_UI_SNAPSHOT=1");
    expect(script).toContain("export VITE_NODEPILOT_MANUAL_PROJECT_DIR='/tmp/manual project'");
    expect(script).toContain("export NODEPILOT_MANUAL_UI_SNAPSHOT_PATH='/tmp/nodepilot-manual-ui-snapshot.json'");
    expect(script).toContain("export NODEPILOT_MANUAL_UI_COMMAND_PATH='/tmp/nodepilot-manual-ui-command.json'");
    expect(script).toContain("export NODEPILOT_MANUAL_UI_COMMAND_RESULT_PATH='/tmp/nodepilot-manual-ui-command-result.json'");
    expect(script).toContain("cd '/workspace/nodepilot'");
    expect(script).toContain('exec pnpm tauri dev');
  });

  it('builds a macOS/Linux automation baseline script', () => {
    const script = buildAutomationBaselineScript({
      projectRootPath: '/workspace/nodepilot',
      logPath: '/tmp/manual/AUTOMATION-BASELINE.log',
    });

    expect(script).toContain("cd '/workspace/nodepilot'");
    expect(script).toContain("mkdir -p '/tmp/manual'");
    expect(script).toContain(": > '/tmp/manual/AUTOMATION-BASELINE.log'");
    expect(script).toContain('run_step "pnpm verify:tauri-dev:smoke" pnpm verify:tauri-dev:smoke');
    expect(script).toContain('run_step "pnpm verify:nvm-sh:e2e" pnpm verify:nvm-sh:e2e');
    expect(script).toContain("Automation baseline completed. Log: %s");
  });

  it('prepares an isolated macOS/Linux manual verification workspace', async () => {
    const parentDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-manual-prep-test-'));
    cleanupDirs.push(parentDir);

    const report = await prepareManualNvmShVerification({
      projectRootPath: '/workspace/nodepilot',
      targetVersion: 'v22.14.0',
      tempRootDir: parentDir,
    });
    cleanupDirs.push(report.rootDir);

    expect(report.targetVersion).toBe('v22.14.0');
    expect(report.rootDir.startsWith(parentDir)).toBe(true);

    const projectVersion = await readFile(path.join(report.projectDir, '.nvmrc'), 'utf8');
    expect(projectVersion).toBe('v22.14.0\n');

    const envScript = await readFile(report.envPath, 'utf8');
    expect(envScript).toContain(`export HOME='${report.homeDir}'`);
    expect(envScript).toContain(`export NVM_DIR='${report.nvmDir}'`);
    expect(envScript).toContain("export CARGO_HOME='");
    expect(envScript).toContain("export RUSTUP_HOME='");
    expect(envScript).toContain(`export TAURI_DEV_HOST=${MANUAL_DEV_HOST}`);
    expect(envScript).toContain('export VITE_NODEPILOT_MANUAL_UI_SNAPSHOT=1');
    expect(envScript).toContain(`export VITE_NODEPILOT_MANUAL_PROJECT_DIR='${report.projectDir}'`);
    expect(envScript).toContain(`export NODEPILOT_MANUAL_UI_SNAPSHOT_PATH='${report.snapshotPath}'`);
    expect(envScript).toContain(`export NODEPILOT_MANUAL_UI_COMMAND_PATH='${report.commandPath}'`);
    expect(envScript).toContain(`export NODEPILOT_MANUAL_UI_COMMAND_RESULT_PATH='${report.commandResultPath}'`);

    const launchScript = await readFile(report.launchScriptPath, 'utf8');
    expect(launchScript).toContain("cd '/workspace/nodepilot'");
    expect(launchScript).toContain("export CARGO_HOME='");
    expect(launchScript).toContain("export RUSTUP_HOME='");
    expect(launchScript).toContain(`export TAURI_DEV_HOST=${MANUAL_DEV_HOST}`);
    expect(launchScript).toContain('export VITE_NODEPILOT_MANUAL_UI_SNAPSHOT=1');
    expect(launchScript).toContain(`export VITE_NODEPILOT_MANUAL_PROJECT_DIR='${report.projectDir}'`);
    expect(launchScript).toContain(`export NODEPILOT_MANUAL_UI_SNAPSHOT_PATH='${report.snapshotPath}'`);
    expect(launchScript).toContain(`export NODEPILOT_MANUAL_UI_COMMAND_PATH='${report.commandPath}'`);
    expect(launchScript).toContain(`export NODEPILOT_MANUAL_UI_COMMAND_RESULT_PATH='${report.commandResultPath}'`);
    expect(launchScript).toContain('exec pnpm tauri dev');

    const launchMode = await stat(report.launchScriptPath);
    expect(launchMode.mode & 0o111).not.toBe(0);

    const automationScript = await readFile(report.automationScriptPath, 'utf8');
    expect(automationScript).toContain("cd '/workspace/nodepilot'");
    expect(automationScript).toContain(`: > '${report.automationLogPath}'`);
    expect(automationScript).toContain('pnpm verify:tauri-dev:smoke');
    expect(automationScript).toContain('pnpm verify:nvm-sh:e2e');

    const automationMode = await stat(report.automationScriptPath);
    expect(automationMode.mode & 0o111).not.toBe(0);

    const guide = await readFile(report.guidePath, 'utf8');
    expect(guide).toContain('10.2 Manual macOS/Linux Verification');
    expect(guide).toContain(report.projectDir);
    expect(guide).toContain('v22.14.0');
    expect(guide).toContain(report.automationScriptPath);
    expect(guide).toContain(report.automationLogPath);
    expect(guide).toContain(report.browserAccessUrl);
    expect(guide).toContain(report.snapshotPath);
    expect(guide).toContain(report.commandPath);
    expect(guide).toContain(report.commandResultPath);
    expect(guide).toContain('自动化已覆盖，人工重点只看 UI');
    expect(guide).toContain('可选运行');
    expect(guide).toContain('pnpm verify:tauri-dev:bridge');
    expect(guide).toContain('pnpm verify:nvm-sh:e2e');

    const result = JSON.parse(await readFile(report.resultPath, 'utf8'));
    expect(result.platform).toBe('macos-linux');
    expect(result.items.detect).toBe(false);
    expect(result.metadata.launchScriptPath).toBe(report.launchScriptPath);
    expect(result.metadata.automationScriptPath).toBe(report.automationScriptPath);
    expect(result.metadata.automationLogPath).toBe(report.automationLogPath);
    expect(result.metadata.browserAccessUrl).toBe(report.browserAccessUrl);
    expect(result.metadata.snapshotPath).toBe(report.snapshotPath);
    expect(result.metadata.commandPath).toBe(report.commandPath);
    expect(result.metadata.commandResultPath).toBe(report.commandResultPath);
    expect(result.automationPlan.commands).toEqual([
      'pnpm verify:tauri-dev:smoke',
      'pnpm verify:nvm-sh:e2e',
    ]);

    const checklist = await readFile(report.checklistPath, 'utf8');
    expect(checklist).toContain('# macOS/Linux Manual Verification Checklist');
    expect(checklist).toContain('## Automation Baseline');
    expect(checklist).toContain('`pnpm verify:tauri-dev:smoke`');
    expect(checklist).toContain('`pnpm verify:nvm-sh:e2e`');
    expect(checklist).toContain(`- automationScriptPath: \`${report.automationScriptPath}\``);
    expect(checklist).toContain(`- automationLogPath: \`${report.automationLogPath}\``);
    expect(checklist).toContain(`- commandPath: \`${report.commandPath}\``);
    expect(checklist).toContain(`- commandResultPath: \`${report.commandResultPath}\``);
    expect(checklist).toContain('- [ ] detect。');
  });

  it('exports stable default target versions for manual prep scripts', () => {
    expect(DEFAULT_NVM_SH_TARGET_VERSION).toBe('v24.16.0');
    expect(DEFAULT_WINDOWS_TARGET_VERSION).toBe('20.18.1');
  });

  it('detects a usable browser access host', () => {
    const host = detectPreferredAccessHost();
    expect(host.length).toBeGreaterThan(0);
  });

  it('builds the Windows manual verification helper contract', () => {
    const reportPath = 'C:\\temp\\MANUAL-WINDOWS-CHECK.md';
    const script = buildPowerShellScript({
      reportPath,
      targetVersionValue: '22.14.0',
    });
    const guide = buildWindowsGuide({
      targetVersionValue: '22.14.0',
      powerShellPath: 'C:\\temp\\manual-windows-check.ps1',
    });

    expect(script).toContain('NodePilot Windows manual verification helper');
    expect(script).toContain('$env:NODEPILOT_WINDOWS_E2E_WRITE=1');
    expect(script).toContain(reportPath);

    expect(guide).toContain('10.3 Manual Windows Verification');
    expect(guide).toContain('install Node');
    expect(guide).toContain('arch 选择');
  });

  it('builds a Windows automation baseline script', () => {
    const script = buildAutomationPowerShellScript({
      logPath: 'C:\\temp\\AUTOMATION-BASELINE.log',
    });

    expect(script).toContain('$LogPath = "C:\\temp\\AUTOMATION-BASELINE.log"');
    expect(script).toContain('Invoke-Step "pnpm verify:nvm-windows:probe" @("pnpm", "verify:nvm-windows:probe")');
    expect(script).toContain('Automation baseline completed. Log: $LogPath');
  });

  it('prepares a Windows manual verification bundle', async () => {
    const parentDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-manual-prep-test-'));
    cleanupDirs.push(parentDir);

    const report = await prepareManualNvmWindowsVerification({
      targetVersion: '22.14.0',
      tempRootDir: parentDir,
    });
    cleanupDirs.push(report.rootDir);

    expect(report.targetVersion).toBe('22.14.0');
    expect(report.rootDir.startsWith(parentDir)).toBe(true);

    const powerShell = await readFile(report.powerShellPath, 'utf8');
    expect(powerShell).toContain('$env:NODEPILOT_WINDOWS_E2E_TARGET_VERSION=22.14.0');
    expect(powerShell).toContain(report.guidePath);

    const automationScript = await readFile(report.automationScriptPath, 'utf8');
    expect(automationScript).toContain(`$LogPath = "${report.automationLogPath}"`);
    expect(automationScript).toContain('pnpm verify:nvm-windows:probe');

    const guide = await readFile(report.guidePath, 'utf8');
    expect(guide).toContain('pnpm verify:nvm-windows:probe');
    expect(guide).toContain('admin 权限提示');
    expect(guide).toContain('22.14.0');
    expect(guide).toContain(report.automationScriptPath);
    expect(guide).toContain(report.automationLogPath);
    expect(guide).toContain('自动化已覆盖，人工重点只看 UI');
    expect(guide).toContain('因此人工验收重点只看：');

    const result = JSON.parse(await readFile(report.resultPath, 'utf8'));
    expect(result.platform).toBe('windows');
    expect(result.items.detect_nvm_windows).toBe(false);
    expect(result.metadata.powerShellPath).toBe(report.powerShellPath);
    expect(result.metadata.automationScriptPath).toBe(report.automationScriptPath);
    expect(result.metadata.automationLogPath).toBe(report.automationLogPath);
    expect(result.automationPlan.commands).toEqual([
      'pnpm verify:nvm-windows:probe',
    ]);

    const checklist = await readFile(report.checklistPath, 'utf8');
    expect(checklist).toContain('# Windows Manual Verification Checklist');
    expect(checklist).toContain('## Automation Baseline');
    expect(checklist).toContain('`pnpm verify:nvm-windows:probe`');
    expect(checklist).toContain(`- automationScriptPath: \`${report.automationScriptPath}\``);
    expect(checklist).toContain(`- automationLogPath: \`${report.automationLogPath}\``);
    expect(checklist).toContain('- [ ] detect `nvm-windows`。');
  });
});
