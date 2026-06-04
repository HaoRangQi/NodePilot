// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createAutomationPlan,
  createManualVerificationTemplate,
  listManualVerificationItemKeys,
  renderManualExecutionChecklist,
  syncExecutionDocument,
  updateManualVerificationReport,
} from './manual-verification-report.mjs';
import { markManualVerificationItems } from './mark-manual-verification-item.mjs';
import { syncManualVerificationReport } from './sync-manual-verification-report.mjs';

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

describe('manual verification report helpers', () => {
  it('creates a macOS/Linux manual verification template', () => {
    const template = createManualVerificationTemplate('macos-linux', {
      projectDir: '/tmp/project',
    });

    expect(template.platform).toBe('macos-linux');
    expect(template.items.detect).toBe(false);
    expect(template.items.apply_nvmrc).toBe(false);
    expect(template.metadata.projectDir).toBe('/tmp/project');
  });

  it('lists valid manual verification item keys per platform', () => {
    expect(listManualVerificationItemKeys('macos-linux')).toContain('detect');
    expect(listManualVerificationItemKeys('windows')).toContain('detect_nvm_windows');
  });

  it('renders a checklist markdown from the template', () => {
    const template = createManualVerificationTemplate('windows', {
      guidePath: 'C:\\temp\\guide.md',
    }, createAutomationPlan({
      commands: ['pnpm verify:nvm-windows:probe'],
      backendScope: ['probe binary 编译 / 运行路径'],
      manualFocus: ['admin 权限提示是否在正确时机出现'],
    }));
    template.items.arch_selection = true;
    template.notes.arch_selection = 'validated all options';

    const markdown = renderManualExecutionChecklist('windows', template);
    expect(markdown).toContain('# Windows Manual Verification Checklist');
    expect(markdown).toContain('## Automation Baseline');
    expect(markdown).toContain('`pnpm verify:nvm-windows:probe`');
    expect(markdown).toContain('admin 权限提示是否在正确时机出现');
    expect(markdown).toContain('- [x] arch 选择。');
    expect(markdown).toContain('备注：validated all options');
  });

  it('updates report items and notes with validation', () => {
    const template = createManualVerificationTemplate('macos-linux');
    const next = updateManualVerificationReport(
      template,
      { detect: true, install_nvm: true },
      { install_nvm: 'installed via UI' },
    );

    expect(next.items.detect).toBe(true);
    expect(next.items.install_nvm).toBe(true);
    expect(next.notes.install_nvm).toBe('installed via UI');
    expect(next.updatedAt).toBeTypeOf('string');
  });

  it('syncs checked manual items into the execution document without clearing others by default', () => {
    const template = createManualVerificationTemplate('macos-linux');
    template.items.detect = true;
    template.items.install_nvm = true;

    const executionDoc = [
      "### 10.2 Manual macOS/Linux Verification",
      "",
      "- [ ] detect。",
      "- [ ] install nvm。",
      "- [ ] list installed。",
      "",
      "### 10.3 Manual Windows Verification",
      "",
      "- [ ] detect `nvm-windows`。",
    ].join("\n");

    const result = syncExecutionDocument(executionDoc, template);
    expect(result.changed).toBe(2);
    expect(result.content).toContain('- [x] detect。');
    expect(result.content).toContain('- [x] install nvm。');
    expect(result.content).toContain('- [ ] list installed。');
  });

  it('can uncheck items when allowUncheck is enabled', () => {
    const template = createManualVerificationTemplate('windows');
    template.items.detect_nvm_windows = false;

    const executionDoc = [
      "### 10.2 Manual macOS/Linux Verification",
      "",
      "- [ ] detect。",
      "",
      "### 10.3 Manual Windows Verification",
      "",
      "- [x] detect `nvm-windows`。",
      "- [x] list installed。",
      "- [ ] list available。",
      "- [ ] install Node。",
      "- [ ] use Node。",
      "- [ ] uninstall Node。",
      "- [ ] admin 权限提示。",
      "- [ ] arch 选择。",
    ].join("\n");

    const result = syncExecutionDocument(executionDoc, template, { allowUncheck: true });
    expect(result.content).toContain('- [ ] detect `nvm-windows`。');
  });

  it('writes the synchronized execution document to disk', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-manual-sync-test-'));
    cleanupDirs.push(tempDir);

    const reportPath = path.join(tempDir, 'MANUAL-RESULT.json');
    const executionDocPath = path.join(tempDir, 'EXECUTION.md');
    const report = createManualVerificationTemplate('windows');
    report.items.detect_nvm_windows = true;
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(
      executionDocPath,
      [
        "### 10.2 Manual macOS/Linux Verification",
        "",
        "- [ ] detect。",
        "",
        "### 10.3 Manual Windows Verification",
        "",
        "- [ ] detect `nvm-windows`。",
        "- [ ] list installed。",
      ].join("\n"),
      'utf8',
    );

    const result = await syncManualVerificationReport({
      reportPath,
      targetExecutionDocPath: executionDocPath,
    });

    expect(result.changed).toBe(1);
    const updated = await readFile(executionDocPath, 'utf8');
    expect(updated).toContain('- [x] detect `nvm-windows`。');
  });

  it('marks manual verification items and refreshes the checklist file', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-manual-mark-test-'));
    cleanupDirs.push(tempDir);

    const reportPath = path.join(tempDir, 'MANUAL-RESULT.json');
    const checklistPath = path.join(tempDir, 'MANUAL-CHECKLIST.md');
    const report = createManualVerificationTemplate('macos-linux', {
      checklistPath,
    });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(checklistPath, renderManualExecutionChecklist('macos-linux', report), 'utf8');

    const result = await markManualVerificationItems({
      reportPath,
      itemKeys: ['detect', 'install_nvm'],
      noteUpdates: {
        install_nvm: 'installer completed',
      },
    });

    expect(result.updatedItems).toEqual(['detect', 'install_nvm']);
    const nextReport = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(nextReport.items.detect).toBe(true);
    expect(nextReport.items.install_nvm).toBe(true);
    expect(nextReport.notes.install_nvm).toBe('installer completed');

    const nextChecklist = await readFile(checklistPath, 'utf8');
    expect(nextChecklist).toContain('- [x] detect。');
    expect(nextChecklist).toContain('备注：installer completed');
  });

  it('supports prepare to mark to sync on a temporary execution document', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-manual-chain-test-'));
    cleanupDirs.push(tempDir);

    const reportPath = path.join(tempDir, 'MANUAL-RESULT.json');
    const checklistPath = path.join(tempDir, 'MANUAL-CHECKLIST.md');
    const executionDocPath = path.join(tempDir, 'EXECUTION.md');

    const report = createManualVerificationTemplate('macos-linux', {
      resultPath: reportPath,
      checklistPath,
    });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(checklistPath, renderManualExecutionChecklist('macos-linux', report), 'utf8');
    await writeFile(
      executionDocPath,
      [
        '### 10.2 Manual macOS/Linux Verification',
        '',
        '- [ ] detect。',
        '- [ ] install nvm。',
        '- [ ] list installed。',
        '- [ ] list remote。',
        '- [ ] install Node。',
        '- [ ] activate Node。',
        '- [ ] set default。',
        '- [ ] uninstall Node。',
        '- [ ] read `.nvmrc`。',
        '- [ ] apply `.nvmrc`。',
        '',
        '### 10.3 Manual Windows Verification',
        '',
        '- [ ] detect `nvm-windows`。',
      ].join('\n'),
      'utf8',
    );

    await markManualVerificationItems({
      reportPath,
      itemKeys: ['detect', 'install_nvm', 'list_installed'],
      noteUpdates: {
        detect: 'validated in isolated shell',
      },
    });

    const syncResult = await syncManualVerificationReport({
      reportPath,
      targetExecutionDocPath: executionDocPath,
    });

    expect(syncResult.changed).toBe(3);
    const syncedExecutionDoc = await readFile(executionDocPath, 'utf8');
    expect(syncedExecutionDoc).toContain('- [x] detect。');
    expect(syncedExecutionDoc).toContain('- [x] install nvm。');
    expect(syncedExecutionDoc).toContain('- [x] list installed。');

    const syncedChecklist = await readFile(checklistPath, 'utf8');
    expect(syncedChecklist).toContain('- [x] detect。');
    expect(syncedChecklist).toContain('备注：validated in isolated shell');
  });
});
