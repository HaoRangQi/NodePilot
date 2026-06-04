import {
  desktopStartupTimeoutMs,
  devUrl,
  spawnTauriDev,
  startupTimeoutMs,
  terminateChild,
  waitForDesktopProcess,
  waitForDevServer,
} from './tauri-dev-runtime.mjs';

async function main() {
  const { child, hasStartedDesktopProcess, recentOutput } = spawnTauriDev();
  const report = {
    devUrl,
    desktopProcessStarted: false,
    responseStatus: null,
    responseHasRootMount: false,
    cleanupAttempted: false,
    recentOutput: '',
  };

  try {
    const response = await waitForDevServer(devUrl, startupTimeoutMs);
    report.responseStatus = response.statusCode;
    await waitForDesktopProcess(hasStartedDesktopProcess, child, desktopStartupTimeoutMs, recentOutput);
    report.desktopProcessStarted = true;
    if (!response.body.includes('<div id="root"></div>')) {
      throw new Error('Unexpected dev server response body; missing root mount node.');
    }
    report.responseHasRootMount = true;
    console.log(`\nTauri dev smoke passed: ${devUrl} responded and the desktop process started.`);
  } finally {
    report.cleanupAttempted = true;
    report.recentOutput = recentOutput().slice(-4000);
    await terminateChild(child);
  }

  nodeReplSafeWrite?.(report);
}

function nodeReplSafeWrite(report) {
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
