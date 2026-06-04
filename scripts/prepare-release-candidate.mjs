import { spawn } from 'node:child_process';
import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareManualNvmShVerification } from './prepare-manual-nvm-sh-verification.mjs';
import { prepareManualNvmWindowsVerification } from './prepare-manual-nvm-windows-verification.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const [program, ...args] = command;
    const child = spawn(program, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve(exitCode ?? 1);
    });
  });
}

export async function findOptionalPath(filePath) {
  try {
    await stat(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function findFirstBundleEntry(directoryPath, matcher) {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const match = entries.find((entry) => matcher(entry));
    return match ? path.join(directoryPath, match.name) : null;
  } catch {
    return null;
  }
}

export async function detectReleaseArtifacts(projectRootPath) {
  const releaseRoot = path.join(projectRootPath, 'src-tauri', 'target', 'release');
  const bundleRoot = path.join(releaseRoot, 'bundle');

  return {
    releaseBinaryPath: await findOptionalPath(
      path.join(releaseRoot, process.platform === 'win32' ? 'nodepilot.exe' : 'nodepilot'),
    ),
    macosAppPath: await findFirstBundleEntry(
      path.join(bundleRoot, 'macos'),
      (entry) => entry.isDirectory() && entry.name.endsWith('.app'),
    ),
    macosDmgPath: await findFirstBundleEntry(
      path.join(bundleRoot, 'dmg'),
      (entry) => entry.isFile() && entry.name.endsWith('.dmg'),
    ),
  };
}

function displayPath(filePath) {
  return filePath ?? '未找到';
}

export function createReleaseCandidateSummary({
  projectRootPath,
  runVerification,
  artifacts,
  macosLinux,
  windows,
  rootDir,
}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    projectRootPath,
    runVerification,
    rootDir,
    verificationReadmePath: path.join(projectRootPath, 'docs', 'verification', 'README.md'),
    manualReadmePath: path.join(projectRootPath, 'docs', 'manual', 'README.md'),
    executionDocPath: path.join(projectRootPath, 'docs', 'EXECUTION.md'),
    releaseArtifacts: artifacts,
    manualBundles: {
      macosLinux,
      windows,
    },
    remainingManualVerification: [
      '10.2 Manual macOS/Linux Verification',
      '10.3 Manual Windows Verification',
    ],
  };
}

export function renderReleaseCandidateGuide(summary) {
  const { releaseArtifacts, manualBundles } = summary;

  return `# NodePilot Release Candidate Bundle

本目录收口“当前这版已经自动化验证通过，但桌面 UI 人工验收仍待执行”的交付入口。

## 当前状态

- 已${summary.runVerification ? '' : '跳过'}执行自动化回归入口：\`pnpm verify:all\`
- 自动化验证索引：\`${summary.verificationReadmePath}\`
- 手工验收总说明：\`${summary.manualReadmePath}\`
- 执行计划：\`${summary.executionDocPath}\`
- 仍不能自动勾选的项：
  - \`10.2 Manual macOS/Linux Verification\`
  - \`10.3 Manual Windows Verification\`

## 当前可用产物

- release binary：\`${displayPath(releaseArtifacts.releaseBinaryPath)}\`
- macOS app bundle：\`${displayPath(releaseArtifacts.macosAppPath)}\`
- macOS dmg：\`${displayPath(releaseArtifacts.macosDmgPath)}\`

## macOS / Linux 手工验收包

- guidePath：\`${manualBundles.macosLinux.guidePath}\`
- launchScriptPath：\`${manualBundles.macosLinux.launchScriptPath}\`
- automationScriptPath：\`${manualBundles.macosLinux.automationScriptPath}\`
- automationLogPath：\`${manualBundles.macosLinux.automationLogPath}\`
- resultPath：\`${manualBundles.macosLinux.resultPath}\`
- checklistPath：\`${manualBundles.macosLinux.checklistPath}\`

建议顺序：

1. 先跑 \`${manualBundles.macosLinux.automationScriptPath}\`
2. 再运行 \`${manualBundles.macosLinux.launchScriptPath}\`
3. 在真实桌面窗口逐项完成 \`10.2\`
4. 完成后运行：

\`\`\`bash
pnpm verify:manual:sync ${manualBundles.macosLinux.resultPath}
\`\`\`

## Windows 手工验收包

- guidePath：\`${manualBundles.windows.guidePath}\`
- powerShellPath：\`${manualBundles.windows.powerShellPath}\`
- automationScriptPath：\`${manualBundles.windows.automationScriptPath}\`
- automationLogPath：\`${manualBundles.windows.automationLogPath}\`
- resultPath：\`${manualBundles.windows.resultPath}\`
- checklistPath：\`${manualBundles.windows.checklistPath}\`

建议顺序：

1. 把本目录带到真实 Windows 验证环境
2. 先跑 \`${manualBundles.windows.automationScriptPath}\`
3. 按 \`${manualBundles.windows.guidePath}\` 完成 \`10.3\`
4. 完成后回到仓库运行：

\`\`\`bash
pnpm verify:manual:sync ${manualBundles.windows.resultPath}
\`\`\`
`;
}

export async function prepareReleaseCandidateBundle({
  projectRootPath = projectRoot,
  tempRootDir = os.tmpdir(),
  runVerification = process.env.NODEPILOT_RELEASE_SKIP_VERIFY !== '1',
} = {}) {
  const rootDir = await mkdtemp(path.join(tempRootDir, 'nodepilot-release-candidate-'));

  if (runVerification) {
    const exitCode = await runCommand(['pnpm', 'verify:all'], projectRootPath);
    if (exitCode !== 0) {
      throw new Error(`pnpm verify:all failed with exit code ${exitCode}`);
    }
  }

  const [artifacts, macosLinux, windows] = await Promise.all([
    detectReleaseArtifacts(projectRootPath),
    prepareManualNvmShVerification({
      projectRootPath,
      tempRootDir: rootDir,
    }),
    prepareManualNvmWindowsVerification({
      tempRootDir: rootDir,
    }),
  ]);

  const summary = createReleaseCandidateSummary({
    projectRootPath,
    runVerification,
    artifacts,
    macosLinux,
    windows,
    rootDir,
  });

  const summaryPath = path.join(rootDir, 'RELEASE-CANDIDATE.json');
  const guidePath = path.join(rootDir, 'RELEASE-CANDIDATE.md');

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(guidePath, renderReleaseCandidateGuide(summary), 'utf8');

  return {
    rootDir,
    summaryPath,
    guidePath,
    runVerification,
    verificationReadmePath: summary.verificationReadmePath,
    manualReadmePath: summary.manualReadmePath,
    executionDocPath: summary.executionDocPath,
    releaseArtifacts: summary.releaseArtifacts,
    macosLinux,
    windows,
  };
}

export async function main() {
  const report = await prepareReleaseCandidateBundle();
  console.log(JSON.stringify(report, null, 2));
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
