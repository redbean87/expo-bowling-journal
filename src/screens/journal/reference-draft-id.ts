import type { JournalClientSyncMap } from './journal-client-sync-map-storage';

export type ReferenceType = 'house' | 'pattern' | 'ball';

const REFERENCE_DRAFT_PREFIX_BY_TYPE: Record<ReferenceType, string> = {
  house: 'draft-house-',
  pattern: 'draft-pattern-',
  ball: 'draft-ball-',
};

const REFERENCE_MAP_KEY_BY_TYPE: Record<
  ReferenceType,
  keyof JournalClientSyncMap
> = {
  house: 'houses',
  pattern: 'patterns',
  ball: 'balls',
};

export function buildDraftReferenceId(
  referenceType: ReferenceType,
  clientSyncId: string
) {
  return `${REFERENCE_DRAFT_PREFIX_BY_TYPE[referenceType]}${clientSyncId}`;
}

export function parseDraftReferenceId(referenceId: string | null | undefined): {
  referenceType: ReferenceType;
  clientSyncId: string;
} | null {
  if (!referenceId) {
    return null;
  }

  for (const referenceType of ['house', 'pattern', 'ball'] as const) {
    const prefix = REFERENCE_DRAFT_PREFIX_BY_TYPE[referenceType];

    if (!referenceId.startsWith(prefix)) {
      continue;
    }

    const clientSyncId = referenceId.slice(prefix.length).trim();

    if (clientSyncId.length === 0) {
      return null;
    }

    return {
      referenceType,
      clientSyncId,
    };
  }

  return null;
}

export function resolveReferenceIdFromSyncMap(
  referenceId: string | null | undefined,
  syncMap: JournalClientSyncMap
) {
  if (!referenceId) {
    return {
      resolvedId: referenceId,
      pendingDraftReference: null,
    } as const;
  }

  const parsedDraftId = parseDraftReferenceId(referenceId);

  if (!parsedDraftId) {
    return {
      resolvedId: referenceId,
      pendingDraftReference: null,
    } as const;
  }

  const mapKey = REFERENCE_MAP_KEY_BY_TYPE[parsedDraftId.referenceType];
  const mappedId = syncMap[mapKey][parsedDraftId.clientSyncId] ?? null;

  if (!mappedId) {
    return {
      resolvedId: null,
      pendingDraftReference: parsedDraftId,
    } as const;
  }

  return {
    resolvedId: mappedId,
    pendingDraftReference: null,
  } as const;
}
