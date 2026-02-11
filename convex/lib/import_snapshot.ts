import { ConvexError } from 'convex/values';

type BaseSnapshotPayload = {
  sourceFileName?: string | null;
  sourceHash?: string | null;
  houses: unknown[];
  patterns: unknown[];
  balls: unknown[];
  leagues: unknown[];
  weeks: unknown[];
  games: unknown[];
  frames: unknown[];
};

export function parseSnapshotJsonPayload<
  TSnapshot extends BaseSnapshotPayload = BaseSnapshotPayload,
>(snapshotJson: string): TSnapshot {
  let parsed: unknown;

  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new ConvexError('Snapshot payload is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ConvexError('Snapshot payload must be an object');
  }

  const candidate = parsed as Record<string, unknown>;
  const arrayFields = [
    'houses',
    'patterns',
    'balls',
    'leagues',
    'weeks',
    'games',
    'frames',
  ] as const;

  for (const field of arrayFields) {
    if (!Array.isArray(candidate[field])) {
      throw new ConvexError(
        `Snapshot payload field '${field}' must be an array`
      );
    }
  }

  return {
    sourceFileName:
      typeof candidate.sourceFileName === 'string' ||
      candidate.sourceFileName === null ||
      candidate.sourceFileName === undefined
        ? (candidate.sourceFileName as string | null | undefined)
        : null,
    sourceHash:
      typeof candidate.sourceHash === 'string' ||
      candidate.sourceHash === null ||
      candidate.sourceHash === undefined
        ? (candidate.sourceHash as string | null | undefined)
        : null,
    houses: candidate.houses as unknown[],
    patterns: candidate.patterns as unknown[],
    balls: candidate.balls as unknown[],
    leagues: candidate.leagues as unknown[],
    weeks: candidate.weeks as unknown[],
    games: candidate.games as unknown[],
    frames: candidate.frames as unknown[],
  } as TSnapshot;
}
