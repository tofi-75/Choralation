/** CI downloads the already checked build; local runs always build current sources. */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

if (process.env.E2E_PREBUILT === 'true') {
  if (!existsSync('dist/index.html') || !existsSync('dist/assets/pdfjs')) {
    throw new Error('E2E_PREBUILT requires the complete frontend-build artifact.');
  }
} else {
  // npm's build hook copies the matching PDF.js assets once before compilation.
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
