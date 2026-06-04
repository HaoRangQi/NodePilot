import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const snapshotPathArg = args.shift();
  if (!snapshotPathArg) {
    throw new Error(
      'Usage: node ./scripts/click-manual-ui-element-macos.mjs <snapshot.json> (--id value | --label value) [--context value] [--dialog value] [--space logical|physical] [--dry-run]',
    );
  }

  const options = {
    snapshotPath: path.resolve(projectRoot, snapshotPathArg),
    id: null,
    label: null,
    context: null,
    dialog: null,
    coordinateSpace: 'logical',
    activateApp: null,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--id') {
      options.id = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--label') {
      options.label = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--context') {
      options.context = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--dialog') {
      options.dialog = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--space') {
      const value = requireValue(args, index, arg);
      if (!['logical', 'physical'].includes(value)) {
        throw new Error(`Unsupported coordinate space: ${value}`);
      }
      options.coordinateSpace = value;
      index += 1;
      continue;
    }
    if (arg === '--activate-app') {
      options.activateApp = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.id && !options.label) {
    throw new Error('Either --id or --label is required.');
  }

  return options;
}

export function resolveTargetElement(snapshot, options) {
  const matches = snapshot.elements.filter((element) => {
    if (options.id && element.id !== options.id) return false;
    if (options.label && element.label !== options.label) return false;
    if (options.context && element.context !== options.context) return false;
    if (options.dialog && element.dialog !== options.dialog) return false;
    return true;
  });

  if (matches.length === 0) {
    throw new Error('No snapshot element matched the provided selector.');
  }
  if (matches.length > 1) {
    throw new Error(
      `Selector matched multiple elements: ${matches.map((element) => element.id).join(', ')}`,
    );
  }

  return matches[0];
}

export function resolveTargetPoint(element, coordinateSpace = 'logical') {
  const point =
    coordinateSpace === 'physical'
      ? element.screenCenterPhysical
      : element.screenCenterLogical ?? element.screenCenterPhysical;

  if (!point) {
    throw new Error(
      `Snapshot element ${element.id} does not contain ${coordinateSpace} screen coordinates.`,
    );
  }

  return point;
}

export async function clickPointMacos(point) {
  return await clickPointMacosWithActivation(point, null);
}

export async function clickPointMacosWithActivation(point, appName) {
  const activationProgram = appName
    ? `
let appName = "${escapeSwiftString(appName)}"
let appNameLower = appName.lowercased()
if let target = NSRunningApplication.runningApplications(withBundleIdentifier: appName).first {
  target.activate(options: [.activateIgnoringOtherApps])
} else if let target = NSWorkspace.shared.runningApplications.first(where: {
  let localized = $0.localizedName?.lowercased() ?? ""
  let bundle = $0.bundleIdentifier?.lowercased() ?? ""
  let executable = $0.executableURL?.deletingPathExtension().lastPathComponent.lowercased() ?? ""
  return localized == appNameLower || bundle == appNameLower || executable == appNameLower
}) {
  target.activate(options: [.activateIgnoringOtherApps])
}
usleep(350000)
`
    : '';
  const swiftProgram = `
import Foundation
import CoreGraphics
import AppKit

let point = CGPoint(x: ${point.x}, y: ${point.y})
${activationProgram}
let source = CGEventSource(stateID: .hidSystemState)
let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)
let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)

move?.post(tap: .cghidEventTap)
usleep(120000)
down?.post(tap: .cghidEventTap)
usleep(60000)
up?.post(tap: .cghidEventTap)
`;

  await runSwift(swiftProgram);
}

async function runSwift(program) {
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/swift', ['-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `swift exited with code ${code}`));
    });
    child.stdin.end(program);
  });
}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value after ${flag}.`);
  }
  return value;
}

function escapeSwiftString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export async function clickManualUiElement(options) {
  const snapshot = JSON.parse(await readFile(options.snapshotPath, 'utf8'));
  const element = resolveTargetElement(snapshot, options);
  const point = resolveTargetPoint(element, options.coordinateSpace);

  if (!options.dryRun) {
    await clickPointMacosWithActivation(point, options.activateApp);
  }

  return {
    snapshotPath: options.snapshotPath,
    elementId: element.id,
    label: element.label,
    coordinateSpace: options.coordinateSpace,
    activateApp: options.activateApp,
    point,
    dryRun: options.dryRun,
  };
}

export async function main(argv = process.argv) {
  const options = parseArgs(argv);
  const result = await clickManualUiElement(options);
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
