function getRequiredConvexUrl(): string {
  const value = process.env.EXPO_PUBLIC_CONVEX_URL;

  if (!value) {
    throw new Error(
      'Missing required environment variable: EXPO_PUBLIC_CONVEX_URL'
    );
  }

  return value;
}

function getOptionalImportWorkerUrl() {
  const value = process.env.EXPO_PUBLIC_IMPORT_WORKER_URL;

  if (!value) {
    return null;
  }

  return value;
}

export const env = {
  convexUrl: getRequiredConvexUrl(),
  importWorkerUrl: getOptionalImportWorkerUrl(),
};
