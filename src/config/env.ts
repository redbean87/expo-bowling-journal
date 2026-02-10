function getRequiredEnv(name: 'EXPO_PUBLIC_CONVEX_URL'): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: 'EXPO_PUBLIC_IMPORT_WORKER_URL') {
  const value = process.env[name];

  if (!value) {
    return null;
  }

  return value;
}

export const env = {
  convexUrl: getRequiredEnv('EXPO_PUBLIC_CONVEX_URL'),
  importWorkerUrl: getOptionalEnv('EXPO_PUBLIC_IMPORT_WORKER_URL'),
};
