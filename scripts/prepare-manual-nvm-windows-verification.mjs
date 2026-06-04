import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAutomationPlan,
  createManualVerificationTemplate,
  renderManualExecutionChecklist,
} from './manual-verification-report.mjs';

export const DEFAULT_TARGET_VERSION = '20.18.1';

export function buildAutomationPowerShellScript({ logPath }) {
  return `Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$LogPath = "${logPath.replaceAll('"', '`"')}"
$LogDir = Split-Path -Parent $LogPath
if ($LogDir) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
"" | Set-Content -Path $LogPath

function Invoke-Step {
  param(
    [string]$Label,
    [string[]]$Command
  )

  "==> $Label" | Tee-Object -FilePath $LogPath -Append
  & $Command[0] $Command[1..($Command.Length - 1)] 2>&1 | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

Invoke-Step "pnpm verify:nvm-windows:probe" @("pnpm", "verify:nvm-windows:probe")
"Automation baseline completed. Log: $LogPath" | Tee-Object -FilePath $LogPath -Append
`;
}

export function buildPowerShellScript({ reportPath, targetVersionValue }) {
  return `Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "NodePilot Windows manual verification helper"
Write-Host "Target version: ${targetVersionValue}"
Write-Host ""
Write-Host "1. Ensure NodePilot is built and available on this Windows host."
Write-Host "2. Run the read-only probe first:"
Write-Host "   pnpm verify:nvm-windows:probe"
Write-Host ""
Write-Host "3. If you want the probe to perform install/use/uninstall writes in an isolated test flow, run:"
Write-Host "   $env:NODEPILOT_WINDOWS_E2E_WRITE=1"
Write-Host "   $env:NODEPILOT_WINDOWS_E2E_TARGET_VERSION=${targetVersionValue}"
Write-Host "   pnpm verify:nvm-windows:probe"
Write-Host ""
Write-Host "4. Then run NodePilot manually and execute the UI checklist from:"
Write-Host "   ${reportPath}"
Write-Host ""
Write-Host "5. Clear the opt-in variables after validation:"
Write-Host "   Remove-Item Env:NODEPILOT_WINDOWS_E2E_WRITE -ErrorAction SilentlyContinue"
Write-Host "   Remove-Item Env:NODEPILOT_WINDOWS_E2E_TARGET_VERSION -ErrorAction SilentlyContinue"
`;
}

export function buildGuide({ targetVersionValue, powerShellPath }) {
  return buildGuideWithAutomation({
    targetVersionValue,
    powerShellPath,
    automationScriptPath: null,
    automationLogPath: null,
  });
}

export function buildGuideWithAutomation({
  targetVersionValue,
  powerShellPath,
  automationScriptPath,
  automationLogPath,
}) {
  return `# NodePilot Windows 手工验收准备

本文件用于执行 \`docs/EXECUTION.md\` 中的 **10.3 Manual Windows Verification**。

## 推荐顺序

1. 在 Windows 主机上确认：
   - 已安装 Rust toolchain、Node、pnpm。
   - 当前仓库代码与本机构建产物一致。
2. 先运行自动化前置脚本：
   - \`${automationScriptPath ?? 'run-automation-baseline.ps1'}\`
${automationLogPath ? `   - 自动化输出日志：\`${automationLogPath}\`\n` : ''}3. 如需让 probe 执行真实写操作，显式 opt-in：
   - \`$env:NODEPILOT_WINDOWS_E2E_WRITE=1\`
   - \`$env:NODEPILOT_WINDOWS_E2E_TARGET_VERSION=${targetVersionValue}\`
   - 再运行 \`pnpm verify:nvm-windows:probe\`
4. 启动 NodePilot 桌面应用，按下面 checklist 做 UI / backend 联动验收。

## PowerShell 辅助入口

\`\`\`powershell
${powerShellPath}
\`\`\`

## UI 验收 Checklist

- [ ] detect \`nvm-windows\`
- [ ] list installed
- [ ] list available
- [ ] install Node（建议用 \`${targetVersionValue}\`）
- [ ] use Node
- [ ] uninstall Node
- [ ] admin 权限提示
- [ ] arch 选择（system / 32 / 64 / all）

## 自动化已覆盖，人工重点只看 UI

在开始人工验收前，建议先确认下面这条自动化链已经跑过：

- \`pnpm verify:nvm-windows:probe\`

这条 probe 已覆盖：

- probe binary 编译 / 运行路径
- 非 Windows 宿主上的 skip contract
- 在真实 Windows 主机上，可继续覆盖 \`detect / list / install / use / uninstall\` 的 backend 读写链路

因此人工验收重点只看：

1. NodePilot 页面是否正确反映 \`nvm-windows\` 状态。
2. install / use / uninstall 后 UI 状态是否刷新。
3. admin 权限提示是否在正确时机出现。
4. arch 选择是否按预期暴露并传达给用户。

## 注意事项

- Windows 的 \`nvm use\` 会切换全局 symlink，最好在独立测试机或干净快照环境中执行。
- 只有显式设置 \`NODEPILOT_WINDOWS_E2E_WRITE=1\` 时，probe 才会尝试真实写操作。
- 完成后记得清理环境变量：
  - \`Remove-Item Env:NODEPILOT_WINDOWS_E2E_WRITE -ErrorAction SilentlyContinue\`
  - \`Remove-Item Env:NODEPILOT_WINDOWS_E2E_TARGET_VERSION -ErrorAction SilentlyContinue\`
`;
}

export async function prepareManualNvmWindowsVerification({
  targetVersion = process.env.NODEPILOT_WINDOWS_TARGET_VERSION ?? DEFAULT_TARGET_VERSION,
  tempRootDir = os.tmpdir(),
} = {}) {
  const rootDir = await mkdtemp(path.join(tempRootDir, 'nodepilot-manual-nvm-windows-'));
  const guidePath = path.join(rootDir, 'MANUAL-WINDOWS-CHECK.md');
  const powerShellPath = path.join(rootDir, 'manual-windows-check.ps1');
  const automationScriptPath = path.join(rootDir, 'run-automation-baseline.ps1');
  const automationLogPath = path.join(rootDir, 'AUTOMATION-BASELINE.log');
  const resultPath = path.join(rootDir, 'MANUAL-RESULT.json');
  const checklistPath = path.join(rootDir, 'MANUAL-CHECKLIST.md');

  await writeFile(
    automationScriptPath,
    buildAutomationPowerShellScript({ logPath: automationLogPath }),
    'utf8',
  );
  await writeFile(
    powerShellPath,
    buildPowerShellScript({ reportPath: guidePath, targetVersionValue: targetVersion }),
    'utf8',
  );
  await writeFile(
    guidePath,
    buildGuideWithAutomation({
      targetVersionValue: targetVersion,
      powerShellPath,
      automationScriptPath,
      automationLogPath,
    }),
    'utf8',
  );

  const resultTemplate = createManualVerificationTemplate('windows', {
    rootDir,
    targetVersion,
    guidePath,
    powerShellPath,
    automationScriptPath,
    automationLogPath,
    resultPath,
    checklistPath,
  }, createAutomationPlan({
    commands: [
      'pnpm verify:nvm-windows:probe',
    ],
    backendScope: [
      'probe binary 编译 / 运行路径',
      '非 Windows 宿主上的 skip contract',
      '在真实 Windows 主机上，可继续覆盖 `detect / list / install / use / uninstall` 的 backend 读写链路',
    ],
    manualFocus: [
      'NodePilot 页面是否正确反映 `nvm-windows` 状态',
      'install / use / uninstall 后 UI 状态是否刷新',
      'admin 权限提示是否在正确时机出现',
      'arch 选择是否按预期暴露并传达给用户',
    ],
  }));
  await writeFile(resultPath, `${JSON.stringify(resultTemplate, null, 2)}\n`, 'utf8');
  await writeFile(
    checklistPath,
    renderManualExecutionChecklist('windows', resultTemplate),
    'utf8',
  );

  return {
    rootDir,
    targetVersion,
    guidePath,
    powerShellPath,
    automationScriptPath,
    automationLogPath,
    resultPath,
    checklistPath,
  };
}

export async function main() {
  const report = await prepareManualNvmWindowsVerification();
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
