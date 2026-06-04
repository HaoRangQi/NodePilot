import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncExecutionDocument } from './manual-verification-report.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executionDocPath = path.join(projectRoot, 'docs', 'EXECUTION.md');

function parseArgs(argv) {
  const args = argv.slice(2);
  const allowUncheck = args.includes('--allow-uncheck');
  const executionDocFlagIndex = args.indexOf('--execution-doc');
  let targetExecutionDocPath;
  if (executionDocFlagIndex !== -1) {
    const rawPath = args[executionDocFlagIndex + 1];
    if (!rawPath) {
      throw new Error('Missing value after --execution-doc.');
    }
    targetExecutionDocPath = path.resolve(rawPath);
    args.splice(executionDocFlagIndex, 2);
  }

  const reportPath = args.find((value) => !value.startsWith('--'));
  if (!reportPath) {
    throw new Error(
      'Usage: node ./scripts/sync-manual-verification-report.mjs <report.json> [--allow-uncheck] [--execution-doc /path/to/EXECUTION.md]',
    );
  }
  return {
    allowUncheck,
    reportPath: path.resolve(reportPath),
    targetExecutionDocPath,
  };
}

export async function syncManualVerificationReport({
  reportPath,
  allowUncheck = false,
  targetExecutionDocPath = executionDocPath,
} = {}) {
  if (!reportPath) {
    throw new Error('reportPath is required');
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const executionDoc = await readFile(targetExecutionDocPath, 'utf8');
  const result = syncExecutionDocument(executionDoc, report, { allowUncheck });

  await writeFile(targetExecutionDocPath, result.content, 'utf8');
  return {
    reportPath,
    targetExecutionDocPath,
    platform: report.platform,
    changed: result.changed,
  };
}

export async function main(argv = process.argv) {
  const { reportPath, allowUncheck, targetExecutionDocPath } = parseArgs(argv);
  const result = await syncManualVerificationReport({
    reportPath,
    allowUncheck,
    targetExecutionDocPath,
  });
  console.log(JSON.stringify(result, null, 2));
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
