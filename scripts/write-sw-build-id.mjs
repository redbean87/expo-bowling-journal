import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'nogit';
  }
}

function getUtcTimestamp() {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function buildServiceWorker(buildId) {
  return `const BUILD_ID = '${buildId}';

globalThis.addEventListener('install', () => {
  void BUILD_ID;
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim());
});

globalThis.addEventListener('message', (event) => {
  if (event.data?.type !== 'SKIP_WAITING') {
    return;
  }

  void globalThis.skipWaiting();
});
`;
}

function main() {
  const buildId = `${getGitSha()}-${getUtcTimestamp()}`;
  const swPath = resolve(process.cwd(), 'public', 'sw.js');
  const swContent = buildServiceWorker(buildId);

  writeFileSync(swPath, swContent, 'utf8');
  console.log(`Updated service worker build id: ${buildId}`);
}

main();
