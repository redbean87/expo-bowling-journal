export function createClientSyncId(prefix: string) {
  const trimmedPrefix = prefix.trim().length > 0 ? prefix.trim() : 'entity';

  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${trimmedPrefix}-${crypto.randomUUID()}`;
  }

  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${trimmedPrefix}-${timestamp}-${random}`;
}
