import {
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import { buildAutosaveGuardResult } from './game-editor-autosave-utils';
import {
  sanitizeFrameDraftsForEntry,
  type FrameDraft,
} from './game-editor-frame-utils';
import { buildPersistedSignature } from './game-editor-screen-utils';
import { getActionableSaveErrorMessage } from './game-save-queue';

import type {
  CreateGameInput,
  GameId,
  ReplaceFramesInput,
  SessionId,
  UpdateGameInput,
} from '@/services/journal';

type AutosaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'queued'
  | 'syncingQueued'
  | 'error';

type UseGameEditorAutosaveSyncInput = {
  didHydrate: boolean;
  isAuthenticated: boolean;
  hasSignedInBefore: boolean;
  isCreateMode: boolean;
  isDraftSessionContext: boolean;
  date: string;
  frameDrafts: FrameDraft[];
  setFrameDrafts: Dispatch<SetStateAction<FrameDraft[]>>;
  selectedPatternId: string | null;
  selectedBallId: string | null;
  draftGameId: GameId | null;
  setDraftGameId: Dispatch<SetStateAction<GameId | null>>;
  gameId: GameId | null;
  rawSessionId: string | null;
  sessionId: SessionId | null;
  gameSessionId: string | null;
  sessionClientSyncId: string | null;
  activeDraftNonce: string | null;
  createGame: (input: CreateGameInput) => Promise<GameId>;
  updateGame: (input: UpdateGameInput) => Promise<unknown>;
  replaceFramesForGame: (input: ReplaceFramesInput) => Promise<unknown>;
  replaceNewRouteWithGameId: (nextGameId: GameId) => void;
  clearLocalDraft: () => Promise<void>;
  setAutosaveState: Dispatch<SetStateAction<AutosaveState>>;
  setAutosaveError: Dispatch<SetStateAction<string | null>>;
  isAutosaveInFlightRef: MutableRefObject<boolean>;
  isQueuedFlushInFlightRef: MutableRefObject<boolean>;
  hasQueuedAutosaveRef: MutableRefObject<boolean>;
  saveSequenceRef: MutableRefObject<number>;
  lastSavedSignatureRef: MutableRefObject<string | null>;
};

export function useGameEditorAutosaveSync({
  didHydrate,
  isAuthenticated,
  hasSignedInBefore,
  isCreateMode,
  isDraftSessionContext: _isDraftSessionContext,
  date,
  frameDrafts,
  setFrameDrafts,
  selectedPatternId,
  selectedBallId,
  draftGameId,
  setDraftGameId,
  gameId: _gameId,
  rawSessionId: _rawSessionId,
  sessionId,
  gameSessionId: _gameSessionId,
  sessionClientSyncId: _sessionClientSyncId,
  activeDraftNonce: _activeDraftNonce,
  createGame,
  updateGame,
  replaceFramesForGame,
  replaceNewRouteWithGameId,
  clearLocalDraft,
  setAutosaveState,
  setAutosaveError,
  isAutosaveInFlightRef,
  isQueuedFlushInFlightRef,
  hasQueuedAutosaveRef,
  saveSequenceRef,
  lastSavedSignatureRef,
}: UseGameEditorAutosaveSyncInput) {
  const [autosaveRetryTick, setAutosaveRetryTick] = useState(0);

  // Local-first C-2 (C-2 T5): the autosave no longer has a queue side.
  //
  // The three legacy queue affordances that used to live here — the
  // `promoteDraftToQueue` enqueue (the "local save" branch that wrote a
  // JSON entry to journal:game-save-queue:v1 instead of persisting), the
  // `flushQueuedSaves` drain, and the AppState/unmount hooks that drove
  // them — are gone. Approved C-2 decisions: local mode skips the legacy
  // offline queue and writes straight to SQLite, and the syncer/`retryNow`
  // flush machinery stays off in local mode. The queue is an
  // implementation artifact (§2.7), not canonical data, so nothing here
  // reads or writes that storage any more; entries already persisted in it
  // are left untouched and are not drained.
  //
  // The editor's in-progress edit still survives a restart through the
  // local draft storage (`journal:game-local-draft:v1`, written by
  // `use-game-editor-hydration.ts`), which this file does not touch, and
  // every completed save below goes through the injected editor callbacks
  // — the local adapters `use-game-editor.ts` now binds — so a save is a
  // SQLite write the moment it is taken.

  useEffect(() => {
    if (!didHydrate) {
      return;
    }

    const persist = async () => {
      if (isAutosaveInFlightRef.current || isQueuedFlushInFlightRef.current) {
        hasQueuedAutosaveRef.current = true;
        return;
      }

      const activeGameId = draftGameId;
      const { drafts: sanitizedDrafts, changed } =
        sanitizeFrameDraftsForEntry(frameDrafts);

      // Local-first C-2 (T7): this autosave is a local journal write, so the
      // guard runs in local mode and a never-signed-in bowler is not blocked
      // from saving. `localMode` is true here because T5 bound the three
      // editor callbacks below to the SQLite-backed write adapters and removed
      // the queue/enqueue and connectivity branches in front of them — there is
      // no cloud editor path left for this hook to take. A caller that did
      // have one would pass `localMode: false` and keep the "sign in once
      // online" precondition; authentication itself is untouched either way.
      const autosavePlan = buildAutosaveGuardResult({
        localMode: true,
        isAuthenticated,
        hasSignedInBefore,
        date,
        frameDrafts: sanitizedDrafts,
        isCreateMode,
        currentGameId: activeGameId,
      });

      if (autosavePlan.status === 'blocked') {
        if (changed) {
          setFrameDrafts(sanitizedDrafts);
        }

        setAutosaveState('error');
        setAutosaveError(autosavePlan.message);
        return;
      }

      if (autosavePlan.status === 'idle') {
        if (changed) {
          setFrameDrafts(sanitizedDrafts);
        }

        setAutosaveState('idle');
        return;
      }

      const { trimmedDate, payloadFrames } = autosavePlan;
      const saveSignature =
        buildPersistedSignature(
          activeGameId,
          trimmedDate,
          sanitizedDrafts,
          selectedPatternId,
          selectedBallId
        ) ??
        JSON.stringify({
          gameId: activeGameId ?? 'new',
          date: trimmedDate,
          frames: payloadFrames,
          patternId: selectedPatternId,
          ballId: selectedBallId,
        });

      if (saveSignature === lastSavedSignatureRef.current) {
        if (changed) {
          setFrameDrafts(sanitizedDrafts);
        }

        setAutosaveState('saved');
        return;
      }

      isAutosaveInFlightRef.current = true;

      // Batch setAutosaveState and setFrameDrafts together so the server-sync
      // effect always sees autosaveState === 'saving' when frameDrafts changes
      // due to sanitization — preventing it from overwriting local state.
      setAutosaveState('saving');

      if (changed) {
        setFrameDrafts(sanitizedDrafts);
      }
      setAutosaveError(null);
      const saveSequence = saveSequenceRef.current + 1;
      saveSequenceRef.current = saveSequence;

      // The save below is a local write: `createGame`, `updateGame`, and
      // `replaceFramesForGame` are the editor hook's callbacks, which now
      // resolve to the app-boundary write adapter, so every branch — create,
      // update, and frame replacement — goes straight to SQLite. There is no
      // connectivity or sign-in branch in front of it: a local write needs
      // neither, and the legacy "queue it instead" fallback would have
      // written an entry that can never drain in local mode. A failed local
      // save keeps the existing error transition (the signature is not
      // recorded, so the next edit retries the save) and the editor's local
      // draft keeps the edit meanwhile.
      try {
        let nextGameId = activeGameId;

        if (isCreateMode) {
          if (!sessionId) {
            throw new Error('Session is required when creating a game.');
          }

          if (!nextGameId) {
            nextGameId = await createGame({
              sessionId,
              date: trimmedDate,
              clientSyncId: _activeDraftNonce,
              patternId: selectedPatternId as never,
              ballId: selectedBallId as never,
            });
            setDraftGameId(nextGameId);
            replaceNewRouteWithGameId(nextGameId);
          } else {
            await updateGame({
              gameId: nextGameId,
              date: trimmedDate,
              patternId: selectedPatternId as never,
              ballId: selectedBallId as never,
            });
          }
        } else {
          if (!nextGameId) {
            throw new Error('Game not found.');
          }

          await updateGame({
            gameId: nextGameId,
            date: trimmedDate,
            patternId: selectedPatternId as never,
            ballId: selectedBallId as never,
          });
        }

        if (!nextGameId) {
          throw new Error('Game not found.');
        }

        await replaceFramesForGame({
          gameId: nextGameId,
          frames: payloadFrames,
        });

        lastSavedSignatureRef.current = saveSignature;

        if (saveSequenceRef.current === saveSequence) {
          setAutosaveState('saved');
          setAutosaveError(null);
          void clearLocalDraft();
        }
      } catch (caught) {
        const actionableMessage = getActionableSaveErrorMessage(caught);

        if (saveSequenceRef.current === saveSequence) {
          setAutosaveState('error');
          setAutosaveError(
            actionableMessage ?? 'Unable to save game. Keep editing to retry.'
          );
        }
      } finally {
        isAutosaveInFlightRef.current = false;

        if (hasQueuedAutosaveRef.current) {
          hasQueuedAutosaveRef.current = false;
          setAutosaveRetryTick((currentTick) => currentTick + 1);
        }
      }
    };

    const timer = setTimeout(() => {
      void persist();
    }, 400);

    return () => clearTimeout(timer);
  }, [
    _activeDraftNonce,
    clearLocalDraft,
    createGame,
    date,
    didHydrate,
    draftGameId,
    frameDrafts,
    hasQueuedAutosaveRef,
    hasSignedInBefore,
    isAuthenticated,
    isAutosaveInFlightRef,
    isCreateMode,
    isQueuedFlushInFlightRef,
    lastSavedSignatureRef,
    replaceFramesForGame,
    replaceNewRouteWithGameId,
    saveSequenceRef,
    selectedBallId,
    selectedPatternId,
    sessionId,
    setAutosaveError,
    setAutosaveState,
    autosaveRetryTick,
    setDraftGameId,
    setFrameDrafts,
    updateGame,
  ]);
}
