import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderManualExecutionChecklist,
  updateManualVerificationReport,
} from './manual-verification-report.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseNoteArgument(value) {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex === -1) {
    throw new Error(`Invalid note argument: ${value}. Expected <item>=<text>.`);
  }

  const key = value.slice(0, separatorIndex).trim();
  const note = value.slice(separatorIndex + 1).trim();
  if (!key) {
    throw new Error(`Invalid note argument: ${value}. Item key is missing.`);
  }

  return {
    key,
    note,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const reportPathArg = args.shift();
  if (!reportPathArg) {
    throw new Error(
      'Usage: node ./scripts/mark-manual-verification-item.mjs <report.json> <item> [item...] [--note item=text] [--unchecked]',
    );
  }

  const itemKeys = [];
  const noteUpdates = {};
  let checked = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--unchecked') {
      checked = false;
      continue;
    }
    if (arg === '--checked') {
      checked = true;
      continue;
    }
    if (arg === '--note') {
      const raw = args[index + 1];
      if (!raw) {
        throw new Error('Missing value after --note.');
      }
      const { key, note } = parseNoteArgument(raw);
      noteUpdates[key] = note;
      index += 1;
      continue;
    }
    itemKeys.push(arg);
  }

  if (itemKeys.length === 0 && Object.keys(noteUpdates).length === 0) {
    throw new Error('At least one manual verification item or note update is required.');
  }

  return {
    reportPath: path.resolve(projectRoot, reportPathArg),
    itemKeys,
    noteUpdates,
    checked,
  };
}

function checklistPathFor(reportPath, report) {
  const configured = report?.metadata?.checklistPath;
  if (configured) {
    return configured;
  }
  return path.join(path.dirname(reportPath), 'MANUAL-CHECKLIST.md');
}

export async function markManualVerificationItems({
  reportPath,
  itemKeys = [],
  noteUpdates = {},
  checked = true,
} = {}) {
  if (!reportPath) {
    throw new Error('reportPath is required');
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const updates = Object.fromEntries(itemKeys.map((key) => [key, checked]));
  const nextReport = updateManualVerificationReport(report, updates, noteUpdates);
  const checklistPath = checklistPathFor(reportPath, nextReport);
  const nextChecklist = renderManualExecutionChecklist(nextReport.platform, nextReport);

  await writeFile(reportPath, `${JSON.stringify(nextReport, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, nextChecklist, 'utf8');

  return {
    reportPath,
    checklistPath,
    platform: nextReport.platform,
    checked,
    updatedItems: itemKeys,
    notedItems: Object.keys(noteUpdates),
  };
}

export async function main(argv = process.argv) {
  const options = parseArgs(argv);
  const result = await markManualVerificationItems(options);
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
