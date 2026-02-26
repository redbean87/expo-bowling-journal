import {
  isStage,
  validateSnapshotPayloadStage,
} from './import_callback_validation';

export type CallbackPayload = {
  batchId: string;
  stage: 'parsing' | 'importing' | 'completed' | 'failed';
  errorMessage?: string | null;
  parserVersion?: string | null;
  timezoneOffsetMinutes?: number | null;
  snapshot?: unknown;
  snapshotJson?: string;
};

export type CallbackSnapshot = {
  houses: unknown[];
  patterns: unknown[];
  balls: unknown[];
  leagues: unknown[];
  weeks: unknown[];
  games: unknown[];
  frames: Array<{
    sqliteId: number;
    gameFk?: number | null;
    weekFk?: number | null;
    leagueFk?: number | null;
    ballFk?: number | null;
    frameNum?: number | null;
    pins?: number | null;
    scores?: number | null;
    score?: number | null;
    flags?: number | null;
    pocket?: number | null;
    footBoard?: number | null;
    targetBoard?: number | null;
  }>;
};

type CallbackPayloadParseResult =
  | {
      ok: true;
      payload: CallbackPayload;
      snapshotValidation: {
        hasSnapshot: boolean;
        hasSnapshotJson: boolean;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export function parseAndValidateCallbackPayload(
  rawBody: string
): CallbackPayloadParseResult {
  let payload: CallbackPayload;

  try {
    payload = JSON.parse(rawBody) as CallbackPayload;
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Invalid JSON callback payload',
    };
  }

  if (!payload.batchId || typeof payload.batchId !== 'string') {
    return {
      ok: false,
      status: 400,
      error: 'batchId is required',
    };
  }

  if (!payload.stage || !isStage(payload.stage)) {
    return {
      ok: false,
      status: 400,
      error: 'stage must be parsing|importing|completed|failed',
    };
  }

  const snapshotValidation = validateSnapshotPayloadStage(payload);

  if (snapshotValidation.error) {
    return {
      ok: false,
      status: 400,
      error: snapshotValidation.error,
    };
  }

  return {
    ok: true,
    payload,
    snapshotValidation,
  };
}
