import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TIMEOUT_MS = 15000;
const POLL_MS = 120;

export function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const commandPathArg = args.shift();
  const resultPathArg = args.shift();

  if (!commandPathArg || !resultPathArg) {
    throw new Error(
      'Usage: node ./scripts/send-manual-ui-command.mjs <command.json> <result.json> --kind <navigate|click|read-project> [--screen <screen>] [--manual-id <id>] [--project-dir <dir>] [--timeout-ms <ms>]',
    );
  }

  const options = {
    commandPath: path.resolve(projectRoot, commandPathArg),
    resultPath: path.resolve(projectRoot, resultPathArg),
    kind: null,
    screen: null,
    manualId: null,
    projectDir: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--kind') {
      options.kind = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--screen') {
      options.screen = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--manual-id') {
      options.manualId = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--project-dir') {
      options.projectDir = path.resolve(projectRoot, requireValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      options.timeoutMs = Number.parseInt(requireValue(args, index, arg), 10);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function buildManualUiCommand(options) {
  const id = `manual-ui-cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  switch (options.kind) {
    case 'navigate':
      if (!options.screen) {
        throw new Error('--screen is required for kind=navigate');
      }
      return {
        id,
        kind: 'navigate',
        screen: options.screen,
      };
    case 'click':
      if (!options.manualId) {
        throw new Error('--manual-id is required for kind=click');
      }
      return {
        id,
        kind: 'click',
        manualId: options.manualId,
      };
    case 'read-project':
      if (!options.projectDir) {
        throw new Error('--project-dir is required for kind=read-project');
      }
      return {
        id,
        kind: 'read-project',
        projectDir: options.projectDir,
      };
    default:
      throw new Error(`Unsupported command kind: ${options.kind}`);
  }
}

export async function sendManualUiCommand({
  commandPath,
  resultPath,
  command,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  await mkdir(path.dirname(commandPath), { recursive: true });
  await mkdir(path.dirname(resultPath), { recursive: true });
  await rm(commandPath, { force: true });
  await rm(resultPath, { force: true });
  await writeFile(commandPath, `${JSON.stringify(command, null, 2)}\n`, 'utf8');
  return await waitForManualUiCommandResult(resultPath, command.id, timeoutMs);
}

export async function waitForManualUiCommandResult(resultPath, commandId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const content = await readFile(resultPath, 'utf8');
      const result = JSON.parse(content);
      if (result.id === commandId) {
        return result;
      }
    } catch {
      // keep polling until timeout
    }
    await delay(POLL_MS);
  }

  throw new Error(`Timed out waiting for manual UI command result: ${commandId}`);
}

async function main(argv = process.argv) {
  const options = parseArgs(argv);
  const command = buildManualUiCommand(options);
  const result = await sendManualUiCommand({
    commandPath: options.commandPath,
    resultPath: options.resultPath,
    command,
    timeoutMs: options.timeoutMs,
  });
  console.log(JSON.stringify({ command, result }, null, 2));
}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value after ${flag}.`);
  }
  return value;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
