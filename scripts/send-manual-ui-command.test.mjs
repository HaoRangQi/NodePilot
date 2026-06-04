// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildManualUiCommand,
  parseArgs,
  sendManualUiCommand,
} from './send-manual-ui-command.mjs';

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

describe('send manual ui command helpers', () => {
  it('parses a navigate command contract', () => {
    const options = parseArgs([
      'node',
      'send-manual-ui-command.mjs',
      '/tmp/command.json',
      '/tmp/result.json',
      '--kind',
      'navigate',
      '--screen',
      'versions',
      '--timeout-ms',
      '5000',
    ]);

    expect(options.commandPath).toContain('/tmp/command.json');
    expect(options.resultPath).toContain('/tmp/result.json');
    expect(options.kind).toBe('navigate');
    expect(options.screen).toBe('versions');
    expect(options.timeoutMs).toBe(5000);
  });

  it('builds a click command payload', () => {
    const command = buildManualUiCommand({
      kind: 'click',
      manualId: 'nav:settings',
      screen: null,
      projectDir: null,
    });

    expect(command).toMatchObject({
      kind: 'click',
      manualId: 'nav:settings',
    });
    expect(command.id).toContain('manual-ui-cmd-');
  });

  it('writes a command file and waits for the matching result', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nodepilot-manual-command-test-'));
    cleanupDirs.push(tempDir);

    const commandPath = path.join(tempDir, 'command.json');
    const resultPath = path.join(tempDir, 'result.json');
    const command = buildManualUiCommand({
      kind: 'navigate',
      screen: 'remote',
      manualId: null,
      projectDir: null,
    });

    const pending = sendManualUiCommand({
      commandPath,
      resultPath,
      command,
      timeoutMs: 2000,
    });

    await waitForFile(commandPath);
    const writtenCommand = JSON.parse(await readFile(commandPath, 'utf8'));
    expect(writtenCommand).toMatchObject({
      id: command.id,
      kind: 'navigate',
      screen: 'remote',
    });

    const result = {
      id: command.id,
      kind: 'navigate',
      status: 'success',
      message: null,
      completedAt: '2026-06-03T08:00:00.000Z',
      screen: 'remote',
      dialogTitles: [],
    };

    await rm(resultPath, { force: true });
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8'),
    );

    await expect(pending).resolves.toEqual(result);
  });
});

async function waitForFile(filePath, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await readFile(filePath, 'utf8');
      return;
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    }
  }

  throw new Error(`Timed out waiting for file: ${filePath}`);
}
