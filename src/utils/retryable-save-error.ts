/**
 * Shared retry-classification rule for Convex save-mutation errors.
 *
 * `isRetryableSaveError` returns true when a Convex save-mutation error is
 * transient and the queued entry should be retried. This module is the shared
 * owner of that rule; it is imported by the game-save, journal-create, and
 * reference-create queue modules.
 */

export function isRetryableSaveError(caught: unknown): boolean {
  // Only demonstrably permanently-classified failures classify as
  // non-retryable. Anything else - including offline/transient failures
  // whose message matches no known signal - stays queued for retry so
  // user data is never dropped.
  const message = getSaveErrorMessage(caught);

  if (!message) {
    return true;
  }

  const normalized = message.toLowerCase();

  return !(
    normalized.includes('required') ||
    normalized.includes('invalid') ||
    normalized.includes('not found') ||
    normalized.includes('must ') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden')
  );
}

export function getSaveErrorMessage(caught: unknown): string {
  if (caught instanceof Error) {
    return caught.message;
  }

  if (typeof caught === 'string') {
    return caught;
  }

  return '';
}
