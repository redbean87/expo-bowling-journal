import {
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import {
  EMPTY_FRAMES,
  findSuggestedFrameIndex,
  getPreferredRollField,
  normalizeDateValue,
  sanitizeFrameDraftsForEntry,
  toFrameDrafts,
  type FrameDraft,
  type RollField,
} from './game-editor-frame-utils';
import {
  buildPersistedSignature,
  buildSyncSignature,
  hasAnyFrameDraftValue,
  isOfflineLikely,
} from './game-editor-screen-utils';
import {
  loadLocalGameDraft,
  removeLocalGameDraft,
  upsertLocalGameDraft,
} from './game-local-draft-storage';
import { shouldRestoreLocalDraft } from './game-local-draft-utils';
import { type QueuedGameSaveEntry } from './game-save-queue';
import { loadGameSaveQueue } from './game-save-queue-storage';

import type { Frame, Game, GameId } from '@/services/journal';

type AutosaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'queued'
  | 'syncingQueued'
  | 'error';

type UseGameEditorHydrationInput = {
  game: Game | null;
  frames: Frame[] | undefined;
  gameId: GameId | null;
  isAuthenticated: boolean;
  isCreateMode: boolean;
  localDraftId: string | null;
  date: string;
  frameDrafts: FrameDraft[];
  selectedPatternId: string | null;
  selectedBallId: string | null;
  autosaveState: AutosaveState;
  setDate: Dispatch<SetStateAction<string>>;
  setFrameDrafts: Dispatch<SetStateAction<FrameDraft[]>>;
  setActiveFrameIndex: Dispatch<SetStateAction<number>>;
  setActiveField: Dispatch<SetStateAction<RollField>>;
  setSelectedPatternId: Dispatch<SetStateAction<string | null>>;
  setSelectedBallId: Dispatch<SetStateAction<string | null>>;
  lastAppliedServerSignatureRef: MutableRefObject<string | null>;
  lastSavedSignatureRef: MutableRefObject<string | null>;
};

type UseGameEditorHydrationResult = {
  didHydrate: boolean;
  draftGameId: GameId | null;
  setDraftGameId: Dispatch<SetStateAction<GameId | null>>;
};

function hasPendingQueueEntry(
  queueEntries: QueuedGameSaveEntry[],
  localDraftId: string
) {
  return queueEntries.some((entry) => entry.queueId === localDraftId);
}

export function useGameEditorHydration({
  game,
  frames,
  gameId,
  isAuthenticated,
  isCreateMode,
  localDraftId,
  date,
  frameDrafts,
  selectedPatternId,
  selectedBallId,
  autosaveState,
  setDate,
  setFrameDrafts,
  setActiveFrameIndex,
  setActiveField,
  setSelectedPatternId,
  setSelectedBallId,
  lastAppliedServerSignatureRef,
  lastSavedSignatureRef,
}: UseGameEditorHydrationInput): UseGameEditorHydrationResult {
  const [didHydrate, setDidHydrate] = useState(false);
  const [draftGameId, setDraftGameId] = useState<GameId | null>(gameId);

  useEffect(() => {
    if (didHydrate) {
      return;
    }

    let cancelled = false;

    const hydrateEditor = async () => {
      if (isCreateMode) {
        const defaultDate = new Date().toISOString().slice(0, 10);
        const defaultDrafts = EMPTY_FRAMES;
        const defaultPatternId = null;
        const defaultBallId = null;
        const incomingServerSignature = buildSyncSignature(
          null,
          defaultDate,
          defaultDrafts,
          defaultPatternId,
          defaultBallId
        );
        let nextDate = defaultDate;
        let nextDrafts = defaultDrafts;
        let nextPatternId: string | null = defaultPatternId;
        let nextBallId: string | null = defaultBallId;

        if (localDraftId) {
          const localDraft = await loadLocalGameDraft(localDraftId);

          if (localDraft) {
            if (isAuthenticated && !isOfflineLikely()) {
              const queuedEntries = await loadGameSaveQueue();

              if (!hasPendingQueueEntry(queuedEntries, localDraftId)) {
                await removeLocalGameDraft(localDraftId);
              } else {
                const sanitizedDate = normalizeDateValue(localDraft.date);
                const { drafts: sanitizedDrafts } = sanitizeFrameDraftsForEntry(
                  localDraft.frameDrafts
                );
                const localSignature = buildSyncSignature(
                  null,
                  sanitizedDate,
                  sanitizedDrafts,
                  localDraft.patternId,
                  localDraft.ballId
                );

                if (
                  shouldRestoreLocalDraft({
                    isCreateMode: true,
                    incomingServerSignature,
                    localDraftSignature: localSignature,
                    localDraftBaseServerSignature:
                      localDraft.baseServerSignature,
                  })
                ) {
                  nextDate = sanitizedDate;
                  nextDrafts = sanitizedDrafts;
                  nextPatternId = localDraft.patternId;
                  nextBallId = localDraft.ballId;
                }
              }
            } else {
              const sanitizedDate = normalizeDateValue(localDraft.date);
              const { drafts: sanitizedDrafts } = sanitizeFrameDraftsForEntry(
                localDraft.frameDrafts
              );
              const localSignature = buildSyncSignature(
                null,
                sanitizedDate,
                sanitizedDrafts,
                localDraft.patternId,
                localDraft.ballId
              );

              if (
                shouldRestoreLocalDraft({
                  isCreateMode: true,
                  incomingServerSignature,
                  localDraftSignature: localSignature,
                  localDraftBaseServerSignature: localDraft.baseServerSignature,
                })
              ) {
                nextDate = sanitizedDate;
                nextDrafts = sanitizedDrafts;
                nextPatternId = localDraft.patternId;
                nextBallId = localDraft.ballId;
              }
            }
          }
        }

        if (cancelled) {
          return;
        }

        const suggestedFrameIndex = findSuggestedFrameIndex(nextDrafts);
        const suggestedField = getPreferredRollField(
          suggestedFrameIndex,
          nextDrafts[suggestedFrameIndex] ?? EMPTY_FRAMES[0]
        );

        setDate(nextDate);
        setFrameDrafts(nextDrafts);
        setSelectedPatternId(nextPatternId);
        setSelectedBallId(nextBallId);
        setActiveFrameIndex(suggestedFrameIndex);
        setActiveField(suggestedField);
        setDraftGameId(null);
        lastAppliedServerSignatureRef.current = incomingServerSignature;
        lastSavedSignatureRef.current = buildPersistedSignature(
          null,
          defaultDate,
          defaultDrafts,
          defaultPatternId,
          defaultBallId
        );
        setDidHydrate(true);
        return;
      }

      if (!game || frames === undefined) {
        return;
      }

      const hydratedDrafts = toFrameDrafts(frames);
      const { drafts: incomingDrafts } =
        sanitizeFrameDraftsForEntry(hydratedDrafts);
      const incomingDate = normalizeDateValue(game.date);
      const incomingServerSignature = buildSyncSignature(
        gameId,
        incomingDate,
        incomingDrafts,
        game.patternId ? String(game.patternId) : null,
        game.ballId ? String(game.ballId) : null
      );
      let nextDate = incomingDate;
      let nextDrafts = incomingDrafts;
      let nextPatternId = game.patternId ? String(game.patternId) : null;
      let nextBallId = game.ballId ? String(game.ballId) : null;

      if (localDraftId) {
        const localDraft = await loadLocalGameDraft(localDraftId);

        if (localDraft) {
          const sanitizedDate = normalizeDateValue(localDraft.date);
          const { drafts: sanitizedDrafts } = sanitizeFrameDraftsForEntry(
            localDraft.frameDrafts
          );
          const localSignature = buildSyncSignature(
            gameId,
            sanitizedDate,
            sanitizedDrafts,
            localDraft.patternId,
            localDraft.ballId
          );

          if (
            shouldRestoreLocalDraft({
              isCreateMode: false,
              incomingServerSignature,
              localDraftSignature: localSignature,
              localDraftBaseServerSignature: localDraft.baseServerSignature,
            })
          ) {
            nextDate = sanitizedDate;
            nextDrafts = sanitizedDrafts;
            nextPatternId = localDraft.patternId;
            nextBallId = localDraft.ballId;
          } else if (localSignature === incomingServerSignature) {
            void removeLocalGameDraft(localDraftId);
          }
        }
      }

      if (cancelled) {
        return;
      }

      const suggestedFrameIndex = findSuggestedFrameIndex(nextDrafts);
      const suggestedField = getPreferredRollField(
        suggestedFrameIndex,
        nextDrafts[suggestedFrameIndex] ?? EMPTY_FRAMES[0]
      );

      setDate(nextDate);
      setFrameDrafts(nextDrafts);
      setSelectedPatternId(nextPatternId);
      setSelectedBallId(nextBallId);
      setActiveFrameIndex(suggestedFrameIndex);
      setActiveField(suggestedField);
      setDraftGameId(gameId);
      lastAppliedServerSignatureRef.current = incomingServerSignature;
      lastSavedSignatureRef.current = buildPersistedSignature(
        gameId,
        incomingDate,
        incomingDrafts,
        game.patternId ? String(game.patternId) : null,
        game.ballId ? String(game.ballId) : null
      );
      setDidHydrate(true);
    };

    void hydrateEditor();

    return () => {
      cancelled = true;
    };
  }, [
    didHydrate,
    frames,
    game,
    gameId,
    isAuthenticated,
    isCreateMode,
    lastAppliedServerSignatureRef,
    lastSavedSignatureRef,
    localDraftId,
    setActiveField,
    setActiveFrameIndex,
    setDate,
    setFrameDrafts,
    setSelectedBallId,
    setSelectedPatternId,
  ]);

  useEffect(() => {
    if (!didHydrate || !localDraftId) {
      return;
    }

    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        const normalizedDate = normalizeDateValue(date);
        const { drafts: sanitizedDrafts } =
          sanitizeFrameDraftsForEntry(frameDrafts);
        const currentSignature = buildSyncSignature(
          gameId,
          normalizedDate,
          sanitizedDrafts,
          selectedPatternId,
          selectedBallId
        );
        const baselineSignature = lastAppliedServerSignatureRef.current;

        if (
          currentSignature === baselineSignature ||
          (isCreateMode && !hasAnyFrameDraftValue(sanitizedDrafts))
        ) {
          await removeLocalGameDraft(localDraftId);
          return;
        }

        if (cancelled) {
          return;
        }

        await upsertLocalGameDraft({
          draftId: localDraftId,
          date: normalizedDate,
          frameDrafts: sanitizedDrafts,
          patternId: selectedPatternId,
          ballId: selectedBallId,
          signature: currentSignature,
          baseServerSignature: baselineSignature,
          updatedAt: Date.now(),
        });
      })();
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    date,
    didHydrate,
    frameDrafts,
    gameId,
    isCreateMode,
    lastAppliedServerSignatureRef,
    localDraftId,
    selectedBallId,
    selectedPatternId,
  ]);

  useEffect(() => {
    if (!didHydrate || isCreateMode || !game || frames === undefined) {
      return;
    }

    const hydratedDrafts = toFrameDrafts(frames);
    const { drafts: incomingDrafts } =
      sanitizeFrameDraftsForEntry(hydratedDrafts);
    const incomingDate = normalizeDateValue(game.date);
    const incomingSignature = buildSyncSignature(
      gameId,
      incomingDate,
      incomingDrafts,
      game.patternId ? String(game.patternId) : null,
      game.ballId ? String(game.ballId) : null
    );

    if (incomingSignature === lastAppliedServerSignatureRef.current) {
      return;
    }

    const { drafts: localDrafts } = sanitizeFrameDraftsForEntry(frameDrafts);
    const localSignature = buildSyncSignature(
      gameId,
      date,
      localDrafts,
      selectedPatternId,
      selectedBallId
    );

    if (localSignature === incomingSignature) {
      lastAppliedServerSignatureRef.current = incomingSignature;
      return;
    }

    const isLocalClean =
      localSignature === lastAppliedServerSignatureRef.current &&
      autosaveState !== 'saving';

    if (isLocalClean) {
      setDate(incomingDate);
      setFrameDrafts(incomingDrafts);
      setSelectedPatternId(game.patternId ? String(game.patternId) : null);
      setSelectedBallId(game.ballId ? String(game.ballId) : null);
      lastAppliedServerSignatureRef.current = incomingSignature;
      lastSavedSignatureRef.current = buildPersistedSignature(
        gameId,
        incomingDate,
        incomingDrafts,
        game.patternId ? String(game.patternId) : null,
        game.ballId ? String(game.ballId) : null
      );
    }
  }, [
    autosaveState,
    date,
    didHydrate,
    frameDrafts,
    frames,
    game,
    gameId,
    isCreateMode,
    lastAppliedServerSignatureRef,
    lastSavedSignatureRef,
    selectedBallId,
    selectedPatternId,
    setDate,
    setFrameDrafts,
    setSelectedBallId,
    setSelectedPatternId,
  ]);

  return {
    didHydrate,
    draftGameId,
    setDraftGameId,
  };
}
