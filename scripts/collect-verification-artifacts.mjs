import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VERIFICATIONS,
  artifactFileName,
  artifactOutputPath,
  buildArtifact,
  buildReadme,
  extractJsonPayload,
  formatDateStamp,
} from './verification-artifacts.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'docs', 'verification');

async function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const [program, ...args] = command;
    const child = spawn(program, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  const dateStamp = process.env.NODEPILOT_VERIFICATION_DATE ?? formatDateStamp();
  const executedAt = new Date().toISOString();
  const hostPlatform = process.platform;

  await mkdir(outputDir, { recursive: true });

  const artifacts = [];
  let hasFailure = false;

  for (const definition of VERIFICATIONS) {
    console.log(`\n==> Running ${definition.id}`);
    const result = await runCommand(definition.command, projectRoot);
    const payload = extractJsonPayload(result.stdout || result.stderr);
    const artifact = buildArtifact(
      definition,
      payload,
      result.exitCode,
      executedAt,
      hostPlatform,
    );
    artifact.fileName = artifactFileName(dateStamp, definition);
    artifacts.push(artifact);

    const outputPath = artifactOutputPath(projectRoot, artifact.fileName);
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(`Saved ${path.relative(projectRoot, outputPath)}`);

    if (artifact.status === 'failed') {
      hasFailure = true;
    }
  }

  const readme = buildReadme(dateStamp, artifacts);
  await writeFile(path.join(outputDir, 'README.md'), readme, 'utf8');
  console.log(`Saved ${path.relative(projectRoot, path.join(outputDir, 'README.md'))}`);

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
