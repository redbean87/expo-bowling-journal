export type CallbackStage = 'parsing' | 'importing' | 'completed' | 'failed';

export function isStage(value: string): value is CallbackStage {
  return (
    value === 'parsing' ||
    value === 'importing' ||
    value === 'completed' ||
    value === 'failed'
  );
}

export function isAllowedTransition(current: string, next: CallbackStage) {
  if (current === next) {
    return true;
  }

  if (current === 'queued') {
    return next === 'parsing' || next === 'failed';
  }

  if (current === 'parsing') {
    return next === 'importing' || next === 'failed';
  }

  if (current === 'importing') {
    return next === 'completed' || next === 'failed';
  }

  return false;
}

export function validateSnapshotPayloadStage(payload: {
  stage: CallbackStage;
  snapshot?: unknown;
  snapshotJson?: string;
}) {
  const hasSnapshot =
    payload.snapshot !== undefined && payload.snapshot !== null;
  const hasSnapshotJson = typeof payload.snapshotJson === 'string';

  if (hasSnapshot && hasSnapshotJson) {
    return {
      hasSnapshot,
      hasSnapshotJson,
      error: 'snapshot and snapshotJson are mutually exclusive',
    };
  }

  if ((hasSnapshot || hasSnapshotJson) && payload.stage !== 'importing') {
    return {
      hasSnapshot,
      hasSnapshotJson,
      error:
        'snapshot payload (snapshot or snapshotJson) is only valid when stage is importing',
    };
  }

  return {
    hasSnapshot,
    hasSnapshotJson,
    error: null,
  };
}
