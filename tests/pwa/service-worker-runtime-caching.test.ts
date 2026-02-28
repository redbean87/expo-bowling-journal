import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('service worker includes runtime caching and cache versioning hooks', async () => {
  const swPath = resolve(process.cwd(), 'public', 'sw.js');
  const source = await readFile(swPath, 'utf8');

  assert.equal(source.includes('const CACHE_PREFIX ='), true);
  assert.equal(source.includes('const SHELL_CACHE_NAME ='), true);
  assert.equal(source.includes('const RUNTIME_CACHE_NAME ='), true);
  assert.equal(source.includes('const PRE_CACHE_URLS = ['), true);
  assert.equal(source.includes('cleanupOldCaches'), true);
  assert.equal(source.includes('extractAssetUrlsFromHtml'), true);
  assert.equal(source.includes('precacheBuildAssetsFromHtml'), true);
  assert.equal(source.includes("globalThis.addEventListener('fetch'"), true);
  assert.equal(source.includes('networkFirstNavigation'), true);
  assert.equal(source.includes('staleWhileRevalidate'), true);
});

test('service worker bypasses API-like paths and keeps skip-waiting flow', async () => {
  const swPath = resolve(process.cwd(), 'public', 'sw.js');
  const source = await readFile(swPath, 'utf8');

  assert.equal(
    source.includes(
      "const BYPASS_PATH_PREFIXES = ['/api/', '/imports/', '/exports/'];"
    ),
    true
  );
  assert.equal(
    source.includes("if (event.data?.type !== 'SKIP_WAITING')"),
    true
  );
  assert.equal(source.includes('globalThis.skipWaiting();'), true);
});
