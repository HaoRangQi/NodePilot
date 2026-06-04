import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STEPS = [
  { name: 'pnpm test', command: ['pnpm', 'test'] },
  { name: 'pnpm build', command: ['pnpm', 'build'] },
  {
    name: 'cargo test',
    command: ['cargo', 'test', '--manifest-path', 'src-tauri/Cargo.toml'],
  },
  { name: 'pnpm verify:artifacts', command: ['pnpm', 'verify:artifacts'] },
  { name: 'pnpm tauri build', command: ['pnpm', 'tauri', 'build'] },
];

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const [program, ...args] = command;
    const child = spawn(program, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve(exitCode ?? 1);
    });
  });
}

async function main() {
  for (const step of STEPS) {
    console.log(`\n==> ${step.name}`);
    const exitCode = await runCommand(step.command);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
