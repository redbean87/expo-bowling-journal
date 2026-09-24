import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HEALTH_SCHEMA_VERSION,
  HEALTH_SERVICE_NAME,
  buildLivenessPayload,
  buildReadinessPayload,
  evaluateWorkerDependencies,
  readinessHttpStatus,
} from '../../worker/src/health.js';

const FIXED_NOW = Date.UTC(2026, 0, 2, 3, 4, 5);

function healthyEnv() {
  return {
    R2_IMPORTS: { head: () => Promise.resolve(null) },
    IMPORT_QUEUE: { send: () => Promise.resolve() },
    IMPORT_CALLBACK_HMAC_SECRET: 'callback-secret',
    IMPORT_QUEUE_HMAC_SECRET: 'queue-secret',
    CONVEX_URL: 'https://example.convex.site',
  };
}

function statusByName(checks: Array<{ name: string; status: string }>) {
  return Object.fromEntries(checks.map((check) => [check.name, check.status]));
}

test('worker liveness payload is deterministic and machine-readable', () => {
  const payload = buildLivenessPayload(FIXED_NOW);

  assert.deepEqual(payload, {
    ok: true,
    status: 'ok',
    service: HEALTH_SERVICE_NAME,
    alive: true,
    timestamp: '2026-01-02T03:04:05.000Z',
    schemaVersion: HEALTH_SCHEMA_VERSION,
  });
});

test('worker readiness reports ok and 200 when all dependencies are configured', () => {
  const checks = evaluateWorkerDependencies(healthyEnv());
  const payload = buildReadinessPayload(FIXED_NOW, checks);

  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.ready, true);
  assert.equal(readinessHttpStatus(payload), 200);
  assert.deepEqual(statusByName(payload.checks), {
    r2: 'ok',
    queue: 'ok',
    callbackSecret: 'ok',
    queueSecret: 'ok',
    convexUrl: 'ok',
  });
  assert.equal(
    payload.checks.every(
      (check: { message: string | null }) => check.message === null
    ),
    true
  );
});

test('worker readiness fails when the R2 binding is missing', () => {
  const env = healthyEnv();
  // @ts-expect-error intentionally removing the binding to simulate failure
  delete env.R2_IMPORTS;

  const payload = buildReadinessPayload(
    FIXED_NOW,
    evaluateWorkerDependencies(env)
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.status, 'unavailable');
  assert.equal(payload.ready, false);
  assert.equal(readinessHttpStatus(payload), 503);
  assert.equal(statusByName(payload.checks).r2, 'unavailable');

  const r2Check = payload.checks.find(
    (check: { name: string }) => check.name === 'r2'
  );
  assert.equal(r2Check.message, 'R2_IMPORTS binding is not configured');
});

test('worker readiness fails when the queue binding is missing', () => {
  const env = healthyEnv();
  // @ts-expect-error intentionally removing the binding to simulate failure
  delete env.IMPORT_QUEUE;

  const payload = buildReadinessPayload(
    FIXED_NOW,
    evaluateWorkerDependencies(env)
  );

  assert.equal(payload.ready, false);
  assert.equal(statusByName(payload.checks).queue, 'unavailable');
});

test('worker readiness fails when required secrets are missing', () => {
  const env = healthyEnv();
  // @ts-expect-error intentionally removing the secret to simulate failure
  delete env.IMPORT_CALLBACK_HMAC_SECRET;
  // @ts-expect-error intentionally removing the secret to simulate failure
  delete env.IMPORT_QUEUE_HMAC_SECRET;

  const checks = statusByName(evaluateWorkerDependencies(env));

  assert.equal(checks.callbackSecret, 'unavailable');
  assert.equal(checks.queueSecret, 'unavailable');
});

test('worker queue secret falls back to the callback secret', () => {
  const env = healthyEnv();
  // @ts-expect-error intentionally using the fallback secret
  delete env.IMPORT_QUEUE_HMAC_SECRET;

  const checks = statusByName(evaluateWorkerDependencies(env));

  assert.equal(checks.callbackSecret, 'ok');
  assert.equal(checks.queueSecret, 'ok');
});

test('worker readiness fails when CONVEX_URL is missing', () => {
  const env = healthyEnv();
  // @ts-expect-error intentionally removing the config to simulate failure
  delete env.CONVEX_URL;

  const payload = buildReadinessPayload(
    FIXED_NOW,
    evaluateWorkerDependencies(env)
  );

  assert.equal(statusByName(payload.checks).convexUrl, 'unavailable');
});

test('worker readiness treats whitespace-only config as missing', () => {
  const env = {
    ...healthyEnv(),
    IMPORT_CALLBACK_HMAC_SECRET: '   ',
    IMPORT_QUEUE_HMAC_SECRET: '',
    CONVEX_URL: ' ',
  };

  const checks = statusByName(evaluateWorkerDependencies(env));

  assert.equal(checks.callbackSecret, 'unavailable');
  assert.equal(checks.queueSecret, 'unavailable');
  assert.equal(checks.convexUrl, 'unavailable');
});

test('worker dependency checks keep a stable order', () => {
  const names = evaluateWorkerDependencies(healthyEnv()).map(
    (check: { name: string }) => check.name
  );

  assert.deepEqual(names, [
    'r2',
    'queue',
    'callbackSecret',
    'queueSecret',
    'convexUrl',
  ]);
});

test('worker entrypoint wires health routes before the config guard', async () => {
  const source = await readFile(
    resolve(process.cwd(), 'worker', 'src', 'index.js'),
    'utf8'
  );

  assert.equal(source.includes("from './health.js'"), true);
  assert.equal(source.includes("url.pathname === '/health'"), true);
  assert.equal(source.includes("url.pathname === '/health/ready'"), true);
  assert.equal(source.includes('buildLivenessPayload(Date.now())'), true);
  assert.equal(source.includes('evaluateWorkerDependencies(env)'), true);

  const liveRouteIndex = source.indexOf("url.pathname === '/health'");
  const readyRouteIndex = source.indexOf("url.pathname === '/health/ready'");
  const configGuardIndex = source.indexOf(
    'if (!env.IMPORT_CALLBACK_HMAC_SECRET)'
  );

  assert.equal(liveRouteIndex >= 0, true);
  assert.equal(readyRouteIndex > liveRouteIndex, true);
  assert.equal(liveRouteIndex < configGuardIndex, true);
  assert.equal(readyRouteIndex < configGuardIndex, true);
});
