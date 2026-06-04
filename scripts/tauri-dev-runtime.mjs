import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const devUrl = process.env.NODEPILOT_TAURI_DEV_URL ?? 'http://localhost:1420/';
export const startupTimeoutMs = Number(process.env.NODEPILOT_TAURI_DEV_TIMEOUT_MS ?? '120000');
export const shutdownTimeoutMs = 15000;
export const desktopStartupTimeoutMs = 30000;

export function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          body,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timed out while requesting ${url}`));
    });
  });
}

export function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}

export function resolveTauriCliScript() {
  const pnpmDir = path.join(projectRoot, 'node_modules', '.pnpm');
  const candidates = fs
    .readdirSync(pnpmDir)
    .filter((name) => name.startsWith('@tauri-apps+cli@'))
    .map((name) =>
      path.join(pnpmDir, name, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    )
    .filter((candidate) => fs.existsSync(candidate));

  const script = candidates[0];
  if (!script) {
    throw new Error('Unable to locate the local Tauri CLI entrypoint.');
  }
  return script;
}

export function createOutputForwarder(onText) {
  let pending = '';

  return (chunk) => {
    pending += chunk.toString();
    const parts = pending.split(/\r?\n/);
    pending = parts.pop() ?? '';

    for (const part of parts) {
      if (/ELIFECYCLE/.test(part)) {
        continue;
      }
      process.stdout.write(`${part}\n`);
      onText(`${part}\n`);
    }
  };
}

export async function waitForDevServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await request(url);
      if (response.statusCode >= 200 && response.statusCode < 500) {
        return response;
      }
    } catch {
      // keep polling until timeout
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export function spawnTauriDev({ env = process.env } = {}) {
  const tauriCliScript = resolveTauriCliScript();
  const child = spawn('node', [tauriCliScript, 'dev'], {
    cwd: projectRoot,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let desktopProcessStarted = false;
  let outputBuffer = '';

  const handleText = (text) => {
    outputBuffer = `${outputBuffer}${stripAnsi(text)}`.slice(-16000);
    if (/Running\s+[`'"]?.*target\/debug\/nodepilot/i.test(outputBuffer)) {
      desktopProcessStarted = true;
    }
  };
  const handleOutput = createOutputForwarder(handleText);

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', (chunk) => {
    handleOutput(chunk);
  });

  return {
    child,
    hasStartedDesktopProcess() {
      return desktopProcessStarted;
    },
    recentOutput() {
      return outputBuffer;
    },
  };
}

export async function waitForDesktopProcess(startedFn, child, timeoutMs, recentOutput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (startedFn()) {
      return;
    }
    if (child.exitCode !== null) {
      throw new Error(
        `Tauri dev exited before the desktop process startup was observed. Exit code: ${child.exitCode}. Recent output:\n${recentOutput()}`,
      );
    }
    await delay(500);
  }

  throw new Error('Tauri desktop process did not reach the running state after the dev server became reachable.');
}

export async function terminateChild(child) {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    child.kill('SIGINT');
  } else {
    try {
      process.kill(-child.pid, 'SIGINT');
    } catch {
      child.kill('SIGINT');
    }
  }

  const startedAt = Date.now();
  while (child.exitCode === null && Date.now() - startedAt < shutdownTimeoutMs) {
    await delay(250);
  }

  if (child.exitCode === null) {
    if (process.platform === 'win32') {
      child.kill('SIGKILL');
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  }
}
