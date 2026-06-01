import fs from 'fs';
import path from 'path';

export default async function globalSetup() {
  // Pre-create test-results artifact directories to prevent ENOENT errors when
  // Playwright retries tests in worker slots that haven't been initialized yet.
  // Playwright uses .playwright-artifacts-N/ for video/trace storage per worker slot.
  const outputDir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(outputDir, { recursive: true });
  for (let i = 0; i < 20; i++) {
    fs.mkdirSync(path.join(outputDir, `.playwright-artifacts-${i}`, 'traces'), { recursive: true });
  }
}
