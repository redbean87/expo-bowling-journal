function getRequiredEnv(name: 'EXPO_PUBLIC_CONVEX_URL'): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  convexUrl: getRequiredEnv('EXPO_PUBLIC_CONVEX_URL'),
};
