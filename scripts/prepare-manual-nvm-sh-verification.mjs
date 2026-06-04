import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAutomationPlan,
  createManualVerificationTemplate,
  renderManualExecutionChecklist,
} from './manual-verification-report.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_TARGET_VERSION = 'v24.16.0';
export const MANUAL_DEV_HOST = '0.0.0.0';

export function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function detectPreferredAccessHost() {
  const networkInterfaces = os.networkInterfaces();
  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }

  return '127.0.0.1';
}

export function buildLaunchScript({
  projectRootPath,
  homeDir,
  nvmDir,
  cargoHome,
  rustupHome,
  projectDir,
  snapshotPath,
  commandPath,
  commandResultPath,
}) {
  return `#!/usr/bin/env bash
set -euo pipefail

export HOME=${shellQuote(homeDir)}
export NVM_DIR=${shellQuote(nvmDir)}
export CARGO_HOME=${shellQuote(cargoHome)}
export RUSTUP_HOME=${shellQuote(rustupHome)}
export TAURI_DEV_HOST=${MANUAL_DEV_HOST}
export VITE_NODEPILOT_MANUAL_UI_SNAPSHOT=1
export VITE_NODEPILOT_MANUAL_PROJECT_DIR=${shellQuote(projectDir)}
export NODEPILOT_MANUAL_UI_SNAPSHOT_PATH=${shellQuote(snapshotPath)}
export NODEPILOT_MANUAL_UI_COMMAND_PATH=${shellQuote(commandPath)}
export NODEPILOT_MANUAL_UI_COMMAND_RESULT_PATH=${shellQuote(commandResultPath)}

cd ${shellQuote(projectRootPath)}
exec pnpm tauri dev
`;
}

export function buildAutomationBaselineScript({
  projectRootPath,
  logPath,
}) {
  return `#!/usr/bin/env bash
set -euo pipefail

cd ${shellQuote(projectRootPath)}
mkdir -p ${shellQuote(path.dirname(logPath))}
: > ${shellQuote(logPath)}

run_step() {
  local label="$1"
  shift
  printf '\\n==> %s\\n' "$label" | tee -a ${shellQuote(logPath)}
  "$@" 2>&1 | tee -a ${shellQuote(logPath)}
}

run_step "pnpm verify:tauri-dev:smoke" pnpm verify:tauri-dev:smoke
run_step "pnpm verify:nvm-sh:e2e" pnpm verify:nvm-sh:e2e

printf '\\nAutomation baseline completed. Log: %s\\n' ${shellQuote(logPath)} | tee -a ${shellQuote(logPath)}
`;
}

export function buildManualGuide({
  rootDir,
  homeDir,
  nvmDir,
  projectDir,
  launchScriptPath,
  automationScriptPath,
  automationLogPath,
  browserAccessUrl,
  snapshotPath,
  commandPath,
  commandResultPath,
  targetVersionValue,
}) {
  return `# NodePilot macOS/Linux 手工验收准备

本目录用于执行 \`docs/EXECUTION.md\` 中的 **10.2 Manual macOS/Linux Verification**。

## 隔离环境

- 临时根目录：\`${rootDir}\`
- 临时 HOME：\`${homeDir}\`
- 临时 NVM_DIR：\`${nvmDir}\`
- 测试项目目录：\`${projectDir}\`
- 预置 \`.nvmrc\`：\`${targetVersionValue}\`

## 启动方式

建议先跑自动化前置脚本，确认 backend / dev 链路已经是绿的：

\`\`\`bash
${automationScriptPath}
\`\`\`

自动化输出日志：

\`\`\`
${automationLogPath}
\`\`\`

执行下面的 launcher，会在隔离环境里启动 NodePilot，不污染当前用户的 \`~/.nvm\`。launcher 只隔离 \`HOME/NVM_DIR\`，并保留当前 Rust toolchain 环境，避免 \`pnpm tauri dev\` 因找不到 \`cargo/rustup\` 而失败；同时会把 dev server 绑定到 \`0.0.0.0\`，让 Tauri 继续走 \`localhost\`，而浏览器辅助观察可以改走局域网地址：

\`\`\`bash
${launchScriptPath}
\`\`\`

浏览器辅助观察 URL：

\`\`\`
${browserAccessUrl}
\`\`\`

前端结构化 UI snapshot 输出：

\`\`\`
${snapshotPath}
\`\`\`

该文件会持续写入当前 screen、dialog 和关键交互元素坐标，可作为真实桌面点击和结果核对的辅助输入。

应用内受控命令入口：

\`\`\`
${commandPath}
\`\`\`

应用内命令结果输出：

\`\`\`
${commandResultPath}
\`\`\`

如需在真实桌面窗口仍由应用内 bridge 执行受控动作，可使用：

\`\`\`bash
node ./scripts/send-manual-ui-command.mjs ${commandPath} ${commandResultPath} --kind navigate --screen versions
node ./scripts/send-manual-ui-command.mjs ${commandPath} ${commandResultPath} --kind click --manual-id nav:settings
node ./scripts/send-manual-ui-command.mjs ${commandPath} ${commandResultPath} --kind read-project --project-dir ${projectDir}
\`\`\`

## 建议验收顺序

1. **detect / install nvm**
   - 首次启动时应看到缺少 nvm 的安装引导。
   - 在 UI 中执行安装后，应重新检测到 backend。
2. **list installed / list remote**
   - 验证本地版本列表与远程版本列表都可刷新。
3. **install Node**
   - 建议安装 \`${targetVersionValue}\`。
4. **activate / set default**
   - 使用刚安装的版本，并设置 default。
5. **read / apply .nvmrc**
   - 选择测试项目目录：\`${projectDir}\`
   - 验证 \`.nvmrc\` 被读取，并可应用到当前任务环境。
6. **uninstall Node**
   - 卸载 \`${targetVersionValue}\`，确认状态刷新。

## 自动化已覆盖，人工重点只看 UI

在开始人工验收前，建议先确认下面这些自动化链已经是绿的：

- \`pnpm verify:tauri-dev:smoke\`
- \`pnpm verify:nvm-sh:e2e\`

\`nvm-sh\` e2e 已经覆盖 backend 语义，包括：

- \`install nvm\`
- \`detect\`
- \`list remote\`
- \`install Node\`
- \`list installed\`
- \`activate Node\`
- \`set default\`
- \`write / read / apply .nvmrc\`
- \`uninstall Node\`

如需额外验证真实桌面窗口里的受控 screen 切换链路，可选运行：

\`\`\`bash
pnpm verify:tauri-dev:bridge
\`\`\`

它会尝试验证 \`navigate / click nav / read-project\` 这条辅助链路，但当前不属于默认自动化证据，也不替代人工验收。

因此本轮人工验收不需要重复证明这些 shell 语义本身是否成立，重点只看默认自动化未覆盖的 UI / 交互事实：

1. 写操作后的状态刷新是否正确，例如 install / use / default / uninstall。
2. 按钮、状态 chip、dialog、日志区域是否按预期出现。
3. 触发操作后 Activity、错误提示是否正确映射到 UI。
4. 文案是否把 macOS/Linux 的作用范围说明清楚，例如 \`nvm use\` 只影响当前任务环境。

## 自动化边界

- 当前 Tauri 官方 WebDriver 桌面支持只覆盖 Windows 和 Linux，macOS 不提供 WKWebView driver。
- 因此本目录生成的材料仍以真实桌面窗口的人工验收为准，不能用官方 WebDriver 代替 \`10.2\`。
- 参考：<https://v2.tauri.app/develop/tests/webdriver/>

## 清理

- 关闭 NodePilot 窗口后，launcher 进程会退出。
- 若要重置整个隔离环境，直接删除目录：\`${rootDir}\`
`;
}

export async function prepareManualNvmShVerification({
  projectRootPath = projectRoot,
  targetVersion = process.env.NODEPILOT_MANUAL_TARGET_VERSION ?? DEFAULT_TARGET_VERSION,
  tempRootDir = os.tmpdir(),
} = {}) {
  const rootDir = await mkdtemp(path.join(tempRootDir, 'nodepilot-manual-nvm-sh-'));
  const homeDir = path.join(rootDir, 'home');
  const nvmDir = path.join(homeDir, '.nvm');
  const currentHomeDir = process.env.HOME ?? os.homedir();
  const cargoHome = process.env.CARGO_HOME ?? path.join(currentHomeDir, '.cargo');
  const rustupHome = process.env.RUSTUP_HOME ?? path.join(currentHomeDir, '.rustup');
  const accessHost = detectPreferredAccessHost();
  const browserAccessUrl = `http://${accessHost}:1420/`;
  const projectDir = path.join(rootDir, 'project');
  const launchScriptPath = path.join(rootDir, 'launch-nodepilot.sh');
  const guidePath = path.join(rootDir, 'MANUAL-CHECK.md');
  const envPath = path.join(rootDir, 'nodepilot-env.sh');
  const resultPath = path.join(rootDir, 'MANUAL-RESULT.json');
  const checklistPath = path.join(rootDir, 'MANUAL-CHECKLIST.md');
  const snapshotPath = path.join(rootDir, 'MANUAL-UI-SNAPSHOT.json');
  const commandPath = path.join(rootDir, 'MANUAL-UI-COMMAND.json');
  const commandResultPath = path.join(rootDir, 'MANUAL-UI-COMMAND-RESULT.json');
  const automationScriptPath = path.join(rootDir, 'run-automation-baseline.sh');
  const automationLogPath = path.join(rootDir, 'AUTOMATION-BASELINE.log');

  await mkdir(homeDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(path.join(projectDir, '.nvmrc'), `${targetVersion}\n`, 'utf8');
  await writeFile(
    envPath,
    `export HOME=${shellQuote(homeDir)}\nexport NVM_DIR=${shellQuote(nvmDir)}\nexport CARGO_HOME=${shellQuote(cargoHome)}\nexport RUSTUP_HOME=${shellQuote(rustupHome)}\nexport TAURI_DEV_HOST=${MANUAL_DEV_HOST}\nexport VITE_NODEPILOT_MANUAL_UI_SNAPSHOT=1\nexport VITE_NODEPILOT_MANUAL_PROJECT_DIR=${shellQuote(projectDir)}\nexport NODEPILOT_MANUAL_UI_SNAPSHOT_PATH=${shellQuote(snapshotPath)}\nexport NODEPILOT_MANUAL_UI_COMMAND_PATH=${shellQuote(commandPath)}\nexport NODEPILOT_MANUAL_UI_COMMAND_RESULT_PATH=${shellQuote(commandResultPath)}\n`,
    'utf8',
  );
  await writeFile(
    launchScriptPath,
    buildLaunchScript({
      projectRootPath,
      homeDir,
      nvmDir,
      cargoHome,
      rustupHome,
      projectDir,
      snapshotPath,
      commandPath,
      commandResultPath,
    }),
    'utf8',
  );
  await chmod(launchScriptPath, 0o755);
  await writeFile(
    automationScriptPath,
    buildAutomationBaselineScript({ projectRootPath, logPath: automationLogPath }),
    'utf8',
  );
  await chmod(automationScriptPath, 0o755);

  await writeFile(
    guidePath,
    buildManualGuide({
      rootDir,
      homeDir,
      nvmDir,
      projectDir,
      launchScriptPath,
      automationScriptPath,
      automationLogPath,
      browserAccessUrl,
      snapshotPath,
      commandPath,
      commandResultPath,
      targetVersionValue: targetVersion,
    }),
    'utf8',
  );

  const resultTemplate = createManualVerificationTemplate('macos-linux', {
    rootDir,
    homeDir,
    nvmDir,
    projectDir,
    targetVersion,
    launchScriptPath,
    automationScriptPath,
    automationLogPath,
    guidePath,
    browserAccessUrl,
    snapshotPath,
    commandPath,
    commandResultPath,
    resultPath,
    checklistPath,
  }, createAutomationPlan({
    commands: [
      'pnpm verify:tauri-dev:smoke',
      'pnpm verify:nvm-sh:e2e',
    ],
    backendScope: [
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
    manualFocus: [
      '页面是否进入正确 screen',
      '按钮、状态 chip、dialog、日志区域是否按预期出现',
      '触发操作后 Activity、状态刷新、错误提示是否正确映射到 UI',
      'macOS/Linux 作用范围文案是否说明清楚，例如 `nvm use` 只影响当前任务环境',
    ],
  }));
  await writeFile(resultPath, `${JSON.stringify(resultTemplate, null, 2)}\n`, 'utf8');
  await writeFile(
    checklistPath,
    renderManualExecutionChecklist('macos-linux', resultTemplate),
    'utf8',
  );

  return {
    rootDir,
    homeDir,
    nvmDir,
    projectDir,
    targetVersion,
    launchScriptPath,
    automationScriptPath,
    automationLogPath,
    guidePath,
    browserAccessUrl,
    snapshotPath,
    commandPath,
    commandResultPath,
    envPath,
    resultPath,
    checklistPath,
  };
}

export async function main() {
  const report = await prepareManualNvmShVerification();
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
