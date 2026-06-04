import path from 'node:path';

export const VERIFICATIONS = [
  {
    id: 'tauri-dev-smoke',
    title: '`tauri dev` smoke',
    command: ['node', './scripts/verify-tauri-dev-smoke.mjs'],
    coverage: [
      '`pnpm tauri dev` 启动',
      '`http://localhost:1420/` 可用',
      '桌面进程拉起',
      '开发进程自动清理',
    ],
    skippedCoverage: [],
    skippedNotCovered: [
      '真实界面交互',
      '桌面窗口视觉布局',
      '多视图人工验收',
    ],
  },
  {
    id: 'nvm-sh-e2e',
    title: '`nvm-sh` e2e',
    command: [
      'cargo',
      'run',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '--bin',
      'verify_nvm_sh_e2e',
    ],
    coverage: [
      '`install nvm`',
      '`detect`',
      '`list remote`',
      '`install Node`',
      '`list installed`',
      '`activate Node`',
      '`set default`',
      '`write .nvmrc`',
      '`read .nvmrc`',
      '`apply .nvmrc`',
      '`uninstall Node`',
    ],
    skippedCoverage: [],
    skippedNotCovered: [
      '真实桌面 UI 交互',
      '桌面窗口视觉布局',
      '多视图人工验收',
    ],
  },
  {
    id: 'nvm-windows-probe',
    title: '`nvm-windows` probe',
    command: [
      'cargo',
      'run',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '--bin',
      'verify_nvm_windows_probe',
    ],
    coverage: [
      '`detect`',
      '`list installed`',
      '`list available`',
      '`admin hint`',
      '`arch option`',
    ],
    skippedCoverage: ['probe binary 编译 / 运行路径', '非 Windows 宿主的 skip contract'],
    skippedNotCovered: [
      'Windows 实机 `detect`',
      '`list installed`',
      '`list available`',
      '`install`',
      '`use`',
      '`uninstall`',
    ],
  },
];

export function formatDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function platformLabel(platform) {
  switch (platform) {
    case 'darwin':
    case 'macos':
      return 'macOS';
    case 'win32':
    case 'windows':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return platform;
  }
}

export function extractJsonPayload(output) {
  const lines = output.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith('{')) {
      continue;
    }
    const candidate = lines.slice(index).join('\n').trim();
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  throw new Error('No JSON payload found in command output.');
}

export function classifyStatus(definition, payload, exitCode) {
  if (
    definition.id === 'nvm-windows-probe' &&
    payload?.platform &&
    `${payload.platform}`.toLowerCase() !== 'windows'
  ) {
    return 'skipped';
  }
  if (exitCode === 0) {
    return 'success';
  }
  return 'failed';
}

export function buildArtifact(definition, payload, exitCode, executedAt, hostPlatform) {
  const status = classifyStatus(definition, payload, exitCode);
  return {
    verification: definition.id,
    title: definition.title,
    executedAt,
    hostPlatform,
    command: definition.command,
    exitCode,
    status,
    coverage: status === 'skipped' ? definition.skippedCoverage : definition.coverage,
    notCovered:
      status === 'skipped'
        ? definition.skippedNotCovered
        : definition.skippedNotCovered ?? [],
    report: payload,
  };
}

export function artifactFileName(dateStamp, definition) {
  return `${dateStamp}-${definition.id}.json`;
}

export function buildReadme(dateStamp, artifacts) {
  const lines = [
    '# Verification Artifacts',
    '',
    '本目录由 `pnpm verify:artifacts` 生成，用于记录最近一次本地自动化验证快照。',
    '',
    '这些产物不替代 [执行文档](../EXECUTION.md) 中的桌面 UI / 人工验收项。',
    '',
    '如果目录里看到历史 `tauri-dev-bridge` 产物，那只是辅助脚本留下的单次记录，不属于默认自动化验收链。',
    '',
    `## ${dateStamp}`,
    '',
  ];

  for (const artifact of artifacts) {
    lines.push(`- [${artifact.title}](./${artifact.fileName})`);
    lines.push(`  - 宿主平台：${platformLabel(artifact.hostPlatform)}`);
    lines.push(`  - 结果：${artifact.status}`);
    if (artifact.coverage.length > 0) {
      lines.push(`  - 覆盖：${artifact.coverage.join('、')}`);
    }
    if (artifact.notCovered.length > 0) {
      lines.push(`  - 未覆盖：${artifact.notCovered.join('、')}`);
    }
  }

  lines.push('', '## Windows probe 约束', '');
  lines.push('- 默认模式只做只读 probe。');
  lines.push('- 只有显式设置 `NODEPILOT_WINDOWS_E2E_WRITE=1` 时，才会尝试真实写操作。');
  lines.push('- 建议在独立 Windows 验证环境中运行，并保留独立产物文件。');
  lines.push('');

  return `${lines.join('\n')}`;
}

export function artifactOutputPath(projectRoot, fileName) {
  return path.join(projectRoot, 'docs', 'verification', fileName);
}
