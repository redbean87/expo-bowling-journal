export const HEALTH_SCHEMA_VERSION = 1;
export const HEALTH_SERVICE_NAME = 'bowling-journal-backend';

export type HealthStatus = 'ok' | 'unavailable';
export type HealthDependencyStatus = 'ok' | 'unavailable';

export type HealthDependencyCheck = {
  name: string;
  status: HealthDependencyStatus;
  latencyMs: number | null;
  message: string | null;
};

export type LivenessResponse = {
  status: 'ok';
  service: string;
  alive: true;
  timestamp: string;
  schemaVersion: number;
};

export type ReadinessResponse = {
  status: HealthStatus;
  service: string;
  ready: boolean;
  timestamp: string;
  schemaVersion: number;
  checks: HealthDependencyCheck[];
};

export type HealthDependencyProbe = {
  name: string;
  probe: () => Promise<void>;
};

export function buildLivenessResponse(now: number): LivenessResponse {
  return {
    status: 'ok',
    service: HEALTH_SERVICE_NAME,
    alive: true,
    timestamp: new Date(now).toISOString(),
    schemaVersion: HEALTH_SCHEMA_VERSION,
  };
}

export async function runDependencyChecks(
  probes: HealthDependencyProbe[]
): Promise<HealthDependencyCheck[]> {
  const checks: HealthDependencyCheck[] = [];

  for (const { name, probe } of probes) {
    const startedAt = Date.now();

    try {
      await probe();
      checks.push({
        name,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        message: null,
      });
    } catch (caught) {
      checks.push({
        name,
        status: 'unavailable',
        latencyMs: Date.now() - startedAt,
        message:
          caught instanceof Error
            ? caught.message || 'Dependency check failed'
            : 'Dependency check failed',
      });
    }
  }

  return checks;
}

export function buildReadinessResponse(
  now: number,
  checks: HealthDependencyCheck[]
): ReadinessResponse {
  const ready = checks.every((check) => check.status === 'ok');

  return {
    status: ready ? 'ok' : 'unavailable',
    service: HEALTH_SERVICE_NAME,
    ready,
    timestamp: new Date(now).toISOString(),
    schemaVersion: HEALTH_SCHEMA_VERSION,
    checks,
  };
}

export function readinessHttpStatus(response: ReadinessResponse): 200 | 503 {
  return response.ready ? 200 : 503;
}
