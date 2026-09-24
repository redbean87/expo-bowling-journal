import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HEALTH_SCHEMA_VERSION,
  HEALTH_SERVICE_NAME,
  buildLivenessResponse,
  buildReadinessResponse,
  readinessHttpStatus,
  runDependencyChecks,
} from '../../convex/lib/health';

const FIXED_NOW = Date.UTC(2026, 0, 2, 3, 4, 5);

test('liveness response is deterministic and machine-readable', () => {
  const response = buildLivenessResponse(FIXED_NOW);

  assert.deepEqual(response, {
    status: 'ok',
    service: HEALTH_SERVICE_NAME,
    alive: true,
    timestamp: '2026-01-02T03:04:05.000Z',
    schemaVersion: HEALTH_SCHEMA_VERSION,
  });
});

test('readiness response is ok when every dependency is healthy', () => {
  const checks = [
    { name: 'database', status: 'ok' as const, latencyMs: 4, message: null },
  ];
  const response = buildReadinessResponse(FIXED_NOW, checks);

  assert.equal(response.status, 'ok');
  assert.equal(response.ready, true);
  assert.equal(response.service, HEALTH_SERVICE_NAME);
  assert.equal(response.timestamp, '2026-01-02T03:04:05.000Z');
  assert.equal(response.schemaVersion, HEALTH_SCHEMA_VERSION);
  assert.deepEqual(response.checks, checks);
  assert.equal(readinessHttpStatus(response), 200);
});

test('readiness response is unavailable when a dependency is down', () => {
  const checks = [
    {
      name: 'database',
      status: 'unavailable' as const,
      latencyMs: 12,
      message: 'Database query failed',
    },
  ];
  const response = buildReadinessResponse(FIXED_NOW, checks);

  assert.equal(response.status, 'unavailable');
  assert.equal(response.ready, false);
  assert.equal(readinessHttpStatus(response), 503);
});

test('readiness remains unavailable when any dependency fails', () => {
  const checks = [
    { name: 'database', status: 'ok' as const, latencyMs: 1, message: null },
    {
      name: 'worker',
      status: 'unavailable' as const,
      latencyMs: 8,
      message: 'Worker unreachable',
    },
  ];
  const response = buildReadinessResponse(FIXED_NOW, checks);

  assert.equal(response.status, 'unavailable');
  assert.equal(response.ready, false);
  assert.equal(readinessHttpStatus(response), 503);
  assert.deepEqual(
    response.checks.map((check) => check.name),
    ['database', 'worker']
  );
});

test('readiness with no checks is trivially ready', () => {
  const response = buildReadinessResponse(FIXED_NOW, []);

  assert.equal(response.status, 'ok');
  assert.equal(response.ready, true);
  assert.deepEqual(response.checks, []);
  assert.equal(readinessHttpStatus(response), 200);
});

test('runDependencyChecks records healthy probes in order', async () => {
  const calls: string[] = [];
  const checks = await runDependencyChecks([
    {
      name: 'database',
      probe: async () => {
        calls.push('database');
      },
    },
    {
      name: 'cache',
      probe: async () => {
        calls.push('cache');
      },
    },
  ]);

  assert.deepEqual(calls, ['database', 'cache']);
  assert.deepEqual(
    checks.map((check) => ({ name: check.name, status: check.status })),
    [
      { name: 'database', status: 'ok' },
      { name: 'cache', status: 'ok' },
    ]
  );

  for (const check of checks) {
    assert.equal(check.message, null);
    assert.equal(typeof check.latencyMs, 'number');
    assert.equal((check.latencyMs ?? -1) >= 0, true);
  }
});

test('runDependencyChecks captures probe failures without aborting', async () => {
  const checks = await runDependencyChecks([
    {
      name: 'database',
      probe: async () => {
        throw new Error('Database query failed');
      },
    },
    {
      name: 'cache',
      probe: async () => undefined,
    },
  ]);

  assert.equal(checks[0].name, 'database');
  assert.equal(checks[0].status, 'unavailable');
  assert.equal(checks[0].message, 'Database query failed');
  assert.equal(checks[1].name, 'cache');
  assert.equal(checks[1].status, 'ok');
});

test('runDependencyChecks falls back to a generic message for non-Error throws', async () => {
  const checks = await runDependencyChecks([
    {
      name: 'database',
      probe: async () => {
        throw 'boom';
      },
    },
  ]);

  assert.equal(checks[0].status, 'unavailable');
  assert.equal(checks[0].message, 'Dependency check failed');
});

test('convex http router wires liveness and readiness routes to health logic', async () => {
  const httpSource = await readFile(
    resolve(process.cwd(), 'convex', 'http.ts'),
    'utf8'
  );

  assert.equal(httpSource.includes("HEALTH_LIVE_PATH = '/health'"), true);
  assert.equal(
    httpSource.includes("HEALTH_READY_PATH = '/health/ready'"),
    true
  );
  assert.equal(httpSource.includes("method: 'GET'"), true);
  assert.equal(httpSource.includes('buildLivenessResponse'), true);
  assert.equal(httpSource.includes('buildReadinessResponse'), true);
  assert.equal(httpSource.includes('runDependencyChecks'), true);
  assert.equal(httpSource.includes('health:pingDatabase'), true);
  assert.equal(httpSource.includes('ctx.runQuery(pingDatabaseQueryRef'), true);
});
