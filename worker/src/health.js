export const HEALTH_SCHEMA_VERSION = 1;
export const HEALTH_SERVICE_NAME = 'sqlite-import-worker';

export function buildLivenessPayload(now) {
  return {
    ok: true,
    status: 'ok',
    service: HEALTH_SERVICE_NAME,
    alive: true,
    timestamp: new Date(now).toISOString(),
    schemaVersion: HEALTH_SCHEMA_VERSION,
  };
}

function buildDependencyCheck(name, isHealthy, message) {
  return {
    name,
    status: isHealthy ? 'ok' : 'unavailable',
    latencyMs: null,
    message: isHealthy ? null : message,
  };
}

function readTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function evaluateWorkerDependencies(env = {}) {
  const callbackSecret = readTrimmedString(env.IMPORT_CALLBACK_HMAC_SECRET);
  const queueSecret = readTrimmedString(
    env.IMPORT_QUEUE_HMAC_SECRET || env.IMPORT_CALLBACK_HMAC_SECRET
  );
  const convexUrl = readTrimmedString(env.CONVEX_URL);

  return [
    buildDependencyCheck(
      'r2',
      typeof env.R2_IMPORTS?.head === 'function',
      'R2_IMPORTS binding is not configured'
    ),
    buildDependencyCheck(
      'queue',
      typeof env.IMPORT_QUEUE?.send === 'function',
      'IMPORT_QUEUE binding is not configured'
    ),
    buildDependencyCheck(
      'callbackSecret',
      callbackSecret.length > 0,
      'IMPORT_CALLBACK_HMAC_SECRET is not configured'
    ),
    buildDependencyCheck(
      'queueSecret',
      queueSecret.length > 0,
      'IMPORT_QUEUE_HMAC_SECRET or IMPORT_CALLBACK_HMAC_SECRET is not configured'
    ),
    buildDependencyCheck(
      'convexUrl',
      convexUrl.length > 0,
      'CONVEX_URL is not configured'
    ),
  ];
}

export function buildReadinessPayload(now, checks) {
  const ready = checks.every((check) => check.status === 'ok');

  return {
    ok: ready,
    status: ready ? 'ok' : 'unavailable',
    service: HEALTH_SERVICE_NAME,
    ready,
    timestamp: new Date(now).toISOString(),
    schemaVersion: HEALTH_SCHEMA_VERSION,
    checks,
  };
}

export function readinessHttpStatus(payload) {
  return payload.ready ? 200 : 503;
}
