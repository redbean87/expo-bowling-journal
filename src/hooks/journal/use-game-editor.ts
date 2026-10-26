import { useConvexAuth } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import type { Id } from '../../../convex/_generated/dataModel';
import type {
  Frame as LocalFrame,
  Game as LocalGame,
  GameScore,
  Session as LocalSession,
} from '@/services/local-journal';

import {
  getRollValue,
  packManualPins,
} from '@/screens/game-editor/frame-mask-utils';
import {
  type CreateGameInput,
  type Frame,
  type Game,
  type GameId,
  type LeagueId,
  type ReplaceFramesInput,
  type UpdateGameInput,
} from '@/services/journal';
import {
  LOCAL_JOURNAL_OPEN_LEAGUE_ID,
  LOCAL_JOURNAL_USER_ID,
} from '@/services/journal/local-reads';
import {
  createGame as localCreateGame,
  replaceFramesForGame as localReplaceFramesForGame,
  updateGame as localUpdateGame,
} from '@/services/journal/local-writes';
import { getLocalJournalService } from '@/services/local-journal';

function toLocalCreationTime(date: string): number {
  const value = Date.parse(`${date}T00:00:00Z`);

  return Number.isFinite(value) ? value : 0;
}

function toLaneContext(
  laneContext?: LocalGame['laneContext']
): Game['laneContext'] {
  if (laneContext === undefined || laneContext === null) {
    return null;
  }

  return {
    leftLane: laneContext.leftLane ?? 0,
    rightLane: laneContext.rightLane ?? 0,
    lanePair: laneContext.lanePair ?? '',
    startingLane: laneContext.startingLane ?? 0,
  };
}

function toBallSwitches(
  ballSwitches?: LocalGame['ballSwitches']
): Game['ballSwitches'] {
  if (ballSwitches === undefined || ballSwitches === null) {
    return null;
  }

  return ballSwitches.map((switchEntry) => {
    const entry: NonNullable<Game['ballSwitches']>[number] = {
      frameNumber: switchEntry.frameNumber,
    };

    if (
      switchEntry.rollNumber !== undefined &&
      switchEntry.rollNumber !== null
    ) {
      entry.rollNumber = switchEntry.rollNumber;
    }

    if (switchEntry.ballId !== undefined && switchEntry.ballId !== null) {
      entry.ballId = switchEntry.ballId as Id<'balls'>;
    }

    if (switchEntry.ballName !== undefined && switchEntry.ballName !== null) {
      entry.ballName = switchEntry.ballName;
    }

    if (switchEntry.note !== undefined && switchEntry.note !== null) {
      entry.note = switchEntry.note;
    }

    return entry;
  });
}

function toFrameDocument(frame: LocalFrame, creationTime: number): Frame {
  return {
    _id: frame.id as Id<'frames'>,
    _creationTime: creationTime,
    userId: LOCAL_JOURNAL_USER_ID,
    gameId: frame.gameId as Id<'games'>,
    frameNumber: frame.frameNumber,
    roll1: getRollValue(frame.roll1Mask ?? null) ?? 0,
    roll2: getRollValue(frame.roll2Mask ?? null) ?? null,
    roll3: getRollValue(frame.roll3Mask ?? null) ?? null,
    ballId:
      frame.ballId === null || frame.ballId === undefined
        ? null
        : (frame.ballId as Id<'balls'>),
    pins: packManualPins({
      roll1Mask: frame.roll1Mask ?? null,
      roll2Mask: frame.roll2Mask ?? null,
      roll3Mask: frame.roll3Mask ?? null,
    }),
    scores: null,
    score: null,
    flags: frame.flags ?? null,
    pocket: frame.pocket ?? null,
    footBoard: frame.footBoard ?? null,
    targetBoard: frame.targetBoard ?? null,
  };
}

function toGameDocument(
  game: LocalGame,
  score: GameScore | null,
  session: LocalSession | null
): Game {
  return {
    _id: game.id as GameId,
    _creationTime: toLocalCreationTime(game.date),
    userId: LOCAL_JOURNAL_USER_ID,
    sessionId: game.sessionId as Id<'sessions'>,
    leagueId:
      session === null
        ? LOCAL_JOURNAL_OPEN_LEAGUE_ID
        : (session.leagueId as LeagueId),
    date: game.date,
    totalScore: score === null ? 0 : score.totalScore,
    strikes: score === null ? 0 : score.strikes,
    spares: score === null ? 0 : score.spares,
    opens: score === null ? 0 : score.opens,
    clientSyncId: null,
    ballId:
      game.ballId === null || game.ballId === undefined
        ? null
        : (game.ballId as Id<'balls'>),
    patternId:
      game.patternId === null || game.patternId === undefined
        ? null
        : (game.patternId as Id<'patterns'>),
    handicap: game.handicap ?? null,
    notes: game.notes ?? null,
    laneContext: toLaneContext(game.laneContext),
    ballSwitches: toBallSwitches(game.ballSwitches),
    framePreview: null,
  };
}

export function useGameEditor(gameId: GameId | null) {
  const { isAuthenticated } = useConvexAuth();
  const [localGame, setLocalGame] = useState<Game | null>(null);
  const [localFrames, setLocalFrames] = useState<Frame[] | undefined>(
    undefined
  );
  const [isLocalGameLoading, setIsLocalGameLoading] = useState(false);
  const [isLocalFramesLoading, setIsLocalFramesLoading] = useState(false);

  useEffect(() => {
    if (gameId === null) {
      setLocalGame(null);
      setLocalFrames(undefined);
      setIsLocalGameLoading(false);
      setIsLocalFramesLoading(false);

      return;
    }

    let isMounted = true;

    setIsLocalGameLoading(true);
    setIsLocalFramesLoading(true);

    void (async () => {
      try {
        const service = getLocalJournalService();
        const game = await service.getGame(gameId);
        const creationTime = toLocalCreationTime(
          game === null ? '' : game.date
        );
        const session =
          game === null ? null : await service.getSession(game.sessionId);
        const score = game === null ? null : await service.getGameScore(gameId);

        if (isMounted) {
          setLocalGame(
            game === null ? null : toGameDocument(game, score, session)
          );
        }

        const frames =
          game === null
            ? []
            : (await service.getGameFrames(gameId)).filter(
                (frame) =>
                  (frame.roll1Mask ?? null) !== null ||
                  (frame.roll2Mask ?? null) !== null ||
                  (frame.roll3Mask ?? null) !== null
              );

        if (isMounted) {
          setLocalFrames(
            frames.map((frame) => toFrameDocument(frame, creationTime))
          );
        }
      } catch {
        if (isMounted) {
          setLocalGame(null);
          setLocalFrames([]);
        }
      } finally {
        if (isMounted) {
          setIsLocalGameLoading(false);
          setIsLocalFramesLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [gameId]);

  // Local-first C-2 editor writes (game create/update + frame replacement).
  // The editor's three write bindings no longer go to the server: they call
  // the app-boundary write adapter (`src/services/journal/local-writes.ts`),
  // the write-side counterpart of the `local-reads.ts` adapter this hook
  // already uses for its read, so the hook crosses the app boundary in one
  // place on each side. There is no `useMutation` binding, no connectivity
  // branch, and no game-save-queue enqueue: local mode is the only mode
  // (docs/local-first-architecture.md §1 and §3, UI → local service →
  // SQLite), so an editor save persists whether or not the device has a
  // network, and the legacy JSON game-save queue stays a cloud-only
  // implementation artifact (§2.7) that nothing here reads or writes.
  //
  // The Convex reference-id mapping step is gone: the ids the editor already
  // holds (`selectedPatternId`/`selectedBallId`) are local UUIDs, so they go
  // to the service unchanged and no client-sync-map lookup is attempted.
  // `clientSyncId` (the editor's draft nonce) stays transport-only — the
  // adapter drops it and never stores it — and `createGame` returns the
  // persisted local UUID, so the autosave's `setDraftGameId` and route
  // replacement navigate on a real local id instead of a `draft-…` phantom.
  //
  // Frame replacement keeps the service's all-or-nothing transaction:
  // `replaceFramesForGame` delegates to `replaceGameFrames`. Validation,
  // foreign-key integrity, and error propagation belong to the service and
  // are passed through unchanged, so the autosave's existing error handling
  // still sees the service's error; only the `isSaving` bookkeeping is this
  // hook's own.
  const [isSaving, setIsSaving] = useState(false);

  const createGame = useCallback(async (input: CreateGameInput) => {
    setIsSaving(true);

    try {
      return await localCreateGame(input);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateGame = useCallback(async (input: UpdateGameInput) => {
    setIsSaving(true);

    try {
      return await localUpdateGame(input);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const replaceFramesForGame = useCallback(
    async (input: ReplaceFramesInput) => {
      setIsSaving(true);

      try {
        return await localReplaceFramesForGame(input);
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  return {
    game: localGame,
    frames: localFrames,
    isAuthenticated,
    isLoading: gameId !== null && (isLocalGameLoading || isLocalFramesLoading),
    createGame,
    updateGame,
    replaceFramesForGame,
    isSaving,
  };
}
