import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from '@/screens/journal/journal-client-sync-map-storage';
import {
  resolveReferenceIdFromSyncMap,
  type ReferenceType,
} from '@/screens/journal/reference-draft-id';

function buildPendingReferenceError(referenceType: ReferenceType) {
  return new Error(
    `Reference temporarily unavailable: waiting for ${referenceType} sync.`
  );
}

export async function resolveReferenceIdForMutation(
  referenceType: ReferenceType,
  referenceId: string | null | undefined
) {
  if (!referenceId) {
    return referenceId;
  }

  const syncMap = await loadJournalClientSyncMap();
  const resolution = resolveReferenceIdFromSyncMap(referenceId, syncMap);

  if (resolution.pendingDraftReference) {
    throw buildPendingReferenceError(referenceType);
  }

  return resolution.resolvedId;
}

export function resolveReferenceIdFromMap(
  syncMap: JournalClientSyncMap,
  referenceType: ReferenceType,
  referenceId: string | null | undefined
) {
  const resolution = resolveReferenceIdFromSyncMap(referenceId, syncMap);

  if (resolution.pendingDraftReference) {
    return {
      resolvedId: null,
      error: buildPendingReferenceError(referenceType),
    } as const;
  }

  return {
    resolvedId: resolution.resolvedId,
    error: null,
  } as const;
}
