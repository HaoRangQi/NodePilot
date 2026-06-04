// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  VERIFICATIONS,
  artifactFileName,
  buildArtifact,
  buildReadme,
  extractJsonPayload,
  formatDateStamp,
  platformLabel,
} from './verification-artifacts.mjs';

describe('verification-artifacts helpers', () => {
  it('formats a stable date stamp', () => {
    const date = new Date(2026, 5, 3, 10, 0, 0);
    expect(formatDateStamp(date)).toBe('2026-06-03');
  });

  it('maps host platform labels', () => {
    expect(platformLabel('darwin')).toBe('macOS');
    expect(platformLabel('windows')).toBe('Windows');
    expect(platformLabel('linux')).toBe('Linux');
  });

  it('extracts the trailing JSON payload from cargo output', () => {
    const output = [
      'Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.60s',
      'Running `src-tauri/target/debug/verify_nvm_windows_probe`',
      '{',
      '  "platform": "macos",',
      '  "write_enabled": false,',
      '  "target_version": null,',
      '  "steps": []',
      '}',
    ].join('\n');

    expect(extractJsonPayload(output)).toEqual({
      platform: 'macos',
      write_enabled: false,
      target_version: null,
      steps: [],
    });
  });

  it('classifies non-Windows probe as skipped and renders readme links', () => {
    const definition = VERIFICATIONS.find((item) => item.id === 'nvm-windows-probe');
    const artifact = buildArtifact(
      definition,
      {
        platform: 'macos',
        write_enabled: false,
        target_version: null,
        steps: [{ step: 'platform', ok: false, detail: 'skip' }],
      },
      0,
      '2026-06-03T00:00:00.000Z',
      'darwin',
    );
    artifact.fileName = artifactFileName('2026-06-03', definition);

    expect(artifact.status).toBe('skipped');

    const readme = buildReadme('2026-06-03', [artifact]);
    expect(readme).toContain('[`nvm-windows` probe](./2026-06-03-nvm-windows-probe.json)');
    expect(readme).toContain('结果：skipped');
    expect(readme).toContain('未覆盖：Windows 实机 `detect`');
    expect(readme).toContain('不属于默认自动化验收链');
  });

  it('keeps tauri dev smoke not-covered notes in success artifacts', () => {
    const definition = VERIFICATIONS.find((item) => item.id === 'tauri-dev-smoke');
    const artifact = buildArtifact(
      definition,
      {
        devUrl: 'http://localhost:1420/',
        desktopProcessStarted: true,
        responseStatus: 200,
        responseHasRootMount: true,
        cleanupAttempted: true,
        recentOutput: 'Running `target/debug/nodepilot`',
      },
      0,
      '2026-06-03T00:00:00.000Z',
      'darwin',
    );
    artifact.fileName = artifactFileName('2026-06-03', definition);

    expect(artifact.status).toBe('success');
    expect(artifact.notCovered).toContain('真实界面交互');

    const readme = buildReadme('2026-06-03', [artifact]);
    expect(readme).toContain('[`tauri dev` smoke](./2026-06-03-tauri-dev-smoke.json)');
    expect(readme).toContain('结果：success');
    expect(readme).toContain('未覆盖：真实界面交互');
  });

  it('tracks nvm-sh e2e write/read/apply coverage without claiming desktop UI validation', () => {
    const definition = VERIFICATIONS.find((item) => item.id === 'nvm-sh-e2e');
    const artifact = buildArtifact(
      definition,
      {
        temp_root: '/tmp/nodepilot-nvm-sh-e2e',
        project_dir: '/tmp/nodepilot-nvm-sh-e2e/project',
        target_version: 'v24.16.0',
        steps: [
          { step: 'write .nvmrc', ok: true, detail: 'wrote file' },
          { step: 'read .nvmrc', ok: true, detail: 'read file' },
          { step: 'apply .nvmrc', ok: true, detail: 'applied file' },
        ],
      },
      0,
      '2026-06-03T00:00:00.000Z',
      'darwin',
    );
    artifact.fileName = artifactFileName('2026-06-03', definition);

    expect(artifact.status).toBe('success');
    expect(artifact.coverage).toContain('`write .nvmrc`');
    expect(artifact.notCovered).toContain('真实桌面 UI 交互');

    const readme = buildReadme('2026-06-03', [artifact]);
    expect(readme).toContain('[`nvm-sh` e2e](./2026-06-03-nvm-sh-e2e.json)');
    expect(readme).toContain('`write .nvmrc`');
    expect(readme).toContain('未覆盖：真实桌面 UI 交互');
  });
});
