# Module Map

One self-contained entry per context-heavy subsystem: purpose, invariants, a representative change with its exact verification command, and a generated block listing the subsystem's files (line/byte counts and exported names), in-repo dependencies, importers, and colocated tests. Read one entry to locate everything you need for a change; do not re-survey the repo. All commands are run from the repo root.

- **Regeneration rule.** The blocks between the `<!-- MODULE-MAP:GENERATED -->` markers are stamped with the git HEAD and date they were generated from. **Regenerate the block whenever HEAD moves**: `node scripts/module-map.mjs`. The generator writes only between the markers; purpose, invariants, and verification commands are hand-written and are never overwritten by it.
- **Staleness check.** `node scripts/module-map.mjs --check` exits 0 when the committed blocks match the working tree and non-zero otherwise.
- The representative changes and verification commands below come from the measured model-enablement plan (2026-10-12); the file-level numbers inside the generated blocks are re-measured by the generator on every run.

## Routing table

| Task arrives as                                                        | Subsystem                             | Entry                                        | Verification                                                      |
| ---------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| League/session create/update/delete queueing, offline flush, draft IDs | A — Journal creation queue and syncer | [A](#a-journal-creation-queue-and-syncer)    | `npm test -- tests/journal`                                       |
| Session/league hooks: offline enqueue vs Convex mutation, listing      | B — Session and mutation hooks        | [B](#b-session-and-mutation-hooks)           | `npm test -- tests/hooks/journal-hooks-offline.test.ts`           |
| Game-editor autosave, autosave guard (no-value frames), hydration      | C — Game-editor autosave sync         | [C](#c-game-editor-autosave-sync)            | `npm test -- tests/game-editor`                                   |
| Game-save queue, flush loop / 5s cadence, sync status chip             | D — Game-save queue syncer            | [D](#d-game-save-queue-syncer)               | `npm test -- tests/providers` and `npm test -- tests/game-editor` |
| Offline/online detection (netinfo)                                     | E — Connectivity/offline layer        | [E](#e-connectivityoffline-layer)            | `npm test -- tests/connectivity.test.ts`                          |
| Backup import: pick/validate/upload, import lifecycle, worker parse    | F — Import pipeline                   | [F](#f-import-pipeline-client-convex-worker) | `npm test -- tests/hooks/import-backup-offline.test.ts`           |

Verification is the coarsest test-runner entry that covers the subsystem's colocated tests; the runner takes a single file or directory argument (`scripts/run-node-tests.mjs`). Worker changes verify separately with `npm --prefix worker run check`.

## A — Journal creation queue and syncer

Purpose: offline-first queues for league/session and reference (house/pattern/ball) create/update/delete entries: built and stored locally, flushed to Convex when online; client-side draft IDs map to server IDs through the client sync map. _(Inferred from the measured structure.)_

- Retry classification is shared with D: `journal-create-queue.ts` and `reference-create-queue.ts` both import `isRetryableSaveError` from `game-save-queue.ts`.
- Flushing is driven only through the locked entry points (`flushJournalCreateQueueWithLock`, `flushReferenceCreateQueueWithLock`) that the syncer provider (D) calls; the syncer test (`tests/providers/game-save-queue-syncer.test.ts`) drives all three flush entry points (D, A, reference) through gating, 5s-cadence, and connectivity-restore scenarios.

Representative change: change retry/backoff or flush semantics of a queued session create.
Verification: `npm test -- tests/journal` (colocated tests), and `npm test -- tests/providers` (the syncer test wires A's flush).

<!-- MODULE-MAP:GENERATED:A:BEGIN -->
<!-- generated: head=18b17ba3d8bfa13319f7a60e5f1d0fb72d0a7e7d date=2026-10-13 -->

**Files**

- `src/screens/journal/journal-create-queue.ts` — 564 lines / 14,619 bytes — exports: `QueuedLeagueCreateEntry`, `QueuedLeagueUpdateEntry`, `QueuedLeagueDeleteEntry`, `QueuedSessionCreateEntry`, `QueuedSessionUpdateEntry`, `QueuedSessionDeleteEntry`, `QueuedJournalCreateEntry`, `buildLeagueCreateQueueId`, `buildLeagueUpdateQueueId`, `buildLeagueDeleteQueueId`, `buildSessionCreateQueueId`, `buildSessionUpdateQueueId`, `buildSessionDeleteQueueId`, `createQueuedLeagueCreateEntry`, `createQueuedLeagueUpdateEntry`, `createQueuedLeagueDeleteEntry`, `createQueuedSessionCreateEntry`, `createQueuedSessionUpdateEntry`, `createQueuedSessionDeleteEntry`, `upsertQueuedJournalCreateEntry`, `removeQueuedJournalCreateEntry`, `markQueuedJournalCreateEntryRetry`, `getDueQueuedJournalCreateEntries`, `isRetryableCreateError`
- `src/screens/journal/journal-create-queue-sync.ts` — 474 lines / 14,823 bytes — exports: `flushJournalCreateQueue`, `flushJournalCreateQueueWithLock`
- `src/screens/journal/journal-create-queue-storage.ts` — 84 lines / 2,388 bytes — exports: `loadJournalCreateQueue`, `persistJournalCreateQueue`
- `src/screens/journal/journal-offline-create.ts` — 23 lines / 617 bytes — exports: `isNavigatorOffline`, `withTimeout`
- `src/screens/journal/queue-sync-events.ts` — 17 lines / 351 bytes — exports: `subscribeQueueSyncState`, `notifyQueueSyncStateChanged`
- `src/screens/journal/queue-sync-presence.ts` — 76 lines / 2,047 bytes — exports: `QueueSyncPresence`, `loadQueueSyncPresence`, `shouldRunQueueSyncInterval`, `didRestoreConnectivity`
- `src/screens/journal/journal-client-sync-map-storage.ts` — 122 lines / 3,315 bytes — exports: `JournalClientSyncMap`, `loadJournalClientSyncMap`, `persistJournalClientSyncMap`, `upsertLeagueClientSyncMapping`, `upsertSessionClientSyncMapping`, `upsertHouseClientSyncMapping`, `upsertPatternClientSyncMapping`, `upsertBallClientSyncMapping`
- `src/screens/journal/reference-create-queue.ts` — 126 lines / 2,927 bytes — exports: `QueuedReferenceCreateEntry`, `buildReferenceCreateQueueId`, `createQueuedReferenceCreateEntry`, `upsertQueuedReferenceCreateEntry`, `removeQueuedReferenceCreateEntry`, `markQueuedReferenceCreateEntryRetry`, `getDueQueuedReferenceCreateEntries`, `isRetryableReferenceCreateError`
- `src/screens/journal/reference-create-queue-sync.ts` — 159 lines / 4,541 bytes — exports: `flushReferenceCreateQueue`, `flushReferenceCreateQueueWithLock`
- `src/screens/journal/reference-create-queue-storage.ts` — 84 lines / 2,429 bytes — exports: `loadReferenceCreateQueue`, `persistReferenceCreateQueue`
- `src/screens/journal/reference-draft-id.ts` — 91 lines / 2,020 bytes — exports: `ReferenceType`, `buildDraftReferenceId`, `parseDraftReferenceId`, `resolveReferenceIdFromSyncMap`

**Depends on** (in-repo imports; external packages omitted)

- `journal-create-queue.ts` → `src/services/journal/index.ts` (`CreateLeagueInput`, `CreateSessionInput`, `LeagueId`, `RemoveLeagueInput`, `RemoveSessionInput`, `SessionId`, `UpdateLeagueInput`, `UpdateSessionInput`); `src/utils/retryable-save-error.ts` (`isRetryableSaveError`)
- `journal-create-queue-sync.ts` → `src/screens/journal/journal-client-sync-map-storage.ts` (`loadJournalClientSyncMap`, `upsertLeagueClientSyncMapping`, `upsertSessionClientSyncMapping`); `src/screens/journal/journal-create-queue-storage.ts` (`loadJournalCreateQueue`, `persistJournalCreateQueue`); `src/screens/journal/journal-create-queue.ts` (`QueuedJournalCreateEntry`, `getDueQueuedJournalCreateEntries`, `isRetryableCreateError`, `markQueuedJournalCreateEntryRetry`, `removeQueuedJournalCreateEntry`); `src/screens/journal/reference-draft-id.ts` (`resolveReferenceIdFromSyncMap`); `src/services/journal/index.ts` (`CreateLeagueInput`, `CreateSessionInput`, `LeagueId`, `RemoveLeagueInput`, `RemoveSessionInput`, `SessionId`, `UpdateLeagueInput`, `UpdateSessionInput`)
- `journal-create-queue-storage.ts` → `src/screens/journal/journal-create-queue.ts` (`QueuedJournalCreateEntry`); `src/screens/journal/queue-sync-events.ts` (`notifyQueueSyncStateChanged`)
- `journal-offline-create.ts` → `src/services/connectivity.ts` (`isConnectivityOffline`)
- `queue-sync-events.ts` — none
- `queue-sync-presence.ts` → `src/screens/game-editor/game-save-queue-storage.ts`; `src/screens/journal/journal-create-queue-storage.ts`; `src/screens/journal/reference-create-queue-storage.ts`
- `journal-client-sync-map-storage.ts` — none
- `reference-create-queue.ts` → `src/screens/journal/reference-draft-id.ts` (`ReferenceType`); `src/utils/retryable-save-error.ts` (`isRetryableSaveError`)
- `reference-create-queue-sync.ts` → `src/screens/journal/journal-client-sync-map-storage.ts` (`upsertBallClientSyncMapping`, `upsertHouseClientSyncMapping`, `upsertPatternClientSyncMapping`); `src/screens/journal/reference-create-queue-storage.ts` (`loadReferenceCreateQueue`, `persistReferenceCreateQueue`); `src/screens/journal/reference-create-queue.ts` (`QueuedReferenceCreateEntry`, `getDueQueuedReferenceCreateEntries`, `isRetryableReferenceCreateError`, `markQueuedReferenceCreateEntryRetry`, `removeQueuedReferenceCreateEntry`)
- `reference-create-queue-storage.ts` → `src/screens/journal/queue-sync-events.ts` (`notifyQueueSyncStateChanged`); `src/screens/journal/reference-create-queue.ts` (`QueuedReferenceCreateEntry`); `src/screens/journal/reference-draft-id.ts` (`ReferenceType`)
- `reference-draft-id.ts` → `src/screens/journal/journal-client-sync-map-storage.ts` (`JournalClientSyncMap`)

**Imported by** (searched: `app/`, `convex/`, `src/`, `tests/`, `worker/src`)

- `journal-create-queue.ts` ← `src/hooks/journal/use-league-queue.ts`, `src/hooks/journal/use-leagues.ts`, `src/hooks/journal/use-session-mutations.ts`, `src/hooks/journal/use-session-queue.ts`, `src/hooks/journal/use-sessions.ts`, `src/hooks/journal/use-start-tonight.ts`, `src/screens/journal-games-screen.tsx`, `src/screens/journal-leagues-screen.tsx`, `src/screens/journal/journal-create-queue-storage.ts`, `src/screens/journal/journal-create-queue-sync.ts`, `tests/journal/journal-create-queue.test.ts`
- `journal-create-queue-sync.ts` ← `src/hooks/journal/use-queue-sync-status.ts`, `src/providers/game-save-queue-syncer.tsx`
- `journal-create-queue-storage.ts` ← `src/hooks/journal/use-league-queue.ts`, `src/hooks/journal/use-leagues.ts`, `src/hooks/journal/use-queue-sync-status.ts`, `src/hooks/journal/use-session-mutations.ts`, `src/hooks/journal/use-session-queue.ts`, `src/hooks/journal/use-sessions.ts`, `src/hooks/journal/use-start-tonight.ts`, `src/screens/journal-games-screen.tsx`, `src/screens/journal-leagues-screen.tsx`, `src/screens/journal/journal-create-queue-sync.ts`, `src/screens/journal/queue-sync-presence.ts`
- `journal-offline-create.ts` ← `src/hooks/journal/use-reference-data.ts`, `src/hooks/journal/use-session-mutations.ts`, `src/screens/journal-leagues-screen.tsx`, `tests/connectivity.test.ts`
- `queue-sync-events.ts` ← `src/hooks/journal/use-queue-sync-status.ts`, `src/providers/game-save-queue-syncer.tsx`, `src/screens/game-editor/game-save-queue-storage.ts`, `src/screens/journal/journal-create-queue-storage.ts`, `src/screens/journal/reference-create-queue-storage.ts`, `tests/providers/game-save-queue-syncer.test.ts`
- `queue-sync-presence.ts` ← `src/providers/game-save-queue-syncer.tsx`, `tests/journal/queue-sync-presence.test.ts`
- `journal-client-sync-map-storage.ts` ← `src/hooks/journal/reference-id-resolution.ts`, `src/hooks/journal/use-league-queue.ts`, `src/hooks/journal/use-reference-data.ts`, `src/hooks/journal/use-session-mutations.ts`, `src/hooks/journal/use-session-queue.ts`, `src/hooks/journal/use-session-route-sync.ts`, `src/screens/game-editor/game-save-queue-sync-storage.ts`, `src/screens/journal-games-screen.tsx`, `src/screens/journal/journal-create-queue-sync.ts`, `src/screens/journal/reference-create-queue-sync.ts`, `src/screens/journal/reference-draft-id.ts`
- `reference-create-queue.ts` ← `src/hooks/journal/use-reference-data.ts`, `src/screens/journal/reference-create-queue-storage.ts`, `src/screens/journal/reference-create-queue-sync.ts`, `tests/journal/reference-create-queue.test.ts`
- `reference-create-queue-sync.ts` ← `src/hooks/journal/use-queue-sync-status.ts`, `src/providers/game-save-queue-syncer.tsx`
- `reference-create-queue-storage.ts` ← `src/hooks/journal/use-queue-sync-status.ts`, `src/hooks/journal/use-reference-data.ts`, `src/screens/journal/queue-sync-presence.ts`, `src/screens/journal/reference-create-queue-sync.ts`
- `reference-draft-id.ts` ← `src/hooks/journal/reference-id-resolution.ts`, `src/hooks/journal/use-reference-data.ts`, `src/screens/game-editor/game-save-queue-sync-core.ts`, `src/screens/journal/journal-create-queue-sync.ts`, `src/screens/journal/reference-create-queue-storage.ts`, `src/screens/journal/reference-create-queue.ts`, `tests/journal/reference-draft-id.test.ts`

**Colocated tests**

- `tests/journal/journal-create-queue.test.ts` — 88 lines / 2,382 bytes
- `tests/journal/queue-sync-presence.test.ts` — 96 lines / 2,396 bytes
- `tests/journal/reference-create-queue.test.ts` — 79 lines / 2,291 bytes
- `tests/journal/reference-draft-id.test.ts` — 68 lines / 1,894 bytes

**Totals** — files: 1,820 lines / 50,077 bytes; colocated tests: 331 lines / 8,963 bytes

<!-- MODULE-MAP:GENERATED:A:END -->

## B — Session and mutation hooks

Purpose: React hooks exposing league/session/game CRUD. Each mutation branches: offline → enqueue through A (returns a draft ID, no Convex call); online → Convex mutation. _(Inferred from the measured structure; the branching is what the offline test asserts.)_

- The offline suite asserts 9 offline/online/transition cases; it loads the real `use-games` / `use-leagues` / `use-sessions` modules with only their external dependencies remapped (`node:module` `registerHooks` — see the stub file header).
- `use-session-mutations.ts` is currently exported only through the barrel `src/hooks/journal/index.ts`; it has no direct test of its own.
- Screens consume these hooks through the barrel, not direct file imports.

Representative change: change an in-flight session mutation's offline behavior.
Verification: `npm test -- tests/hooks/journal-hooks-offline.test.ts`.

<!-- MODULE-MAP:GENERATED:B:BEGIN -->
<!-- generated: head=18b17ba3d8bfa13319f7a60e5f1d0fb72d0a7e7d date=2026-10-13 -->

**Files**

- `src/hooks/journal/use-session-mutations.ts` — 593 lines / 16,921 bytes — exports: `useSessionMutations`
- `src/hooks/journal/use-sessions.ts` — 191 lines / 5,766 bytes — exports: `useSessions`
- `src/hooks/journal/use-session-queue.ts` — 226 lines / 6,494 bytes — exports: `DisplaySession`, `useSessionQueue`
- `src/hooks/journal/use-session-route-sync.ts` — 77 lines / 1,848 bytes — exports: `useSessionRouteSync`
- `src/hooks/journal/index.ts` — 20 lines / 981 bytes — exports: `useGameEditor`, `useGames`, `useExportSqliteBackup`, `useHomeLeague`, `useImportBackup`, `useLeagues`, `useLeagueAnalytics`, `useSpareConversionAnalytics`, `SpareConversionData`, `useLeagueGames`, `useLeagueQueue`, `DisplayLeague`, `useQueueSyncStatus`, `useReferenceData`, `useSessions`, `useSessionMutations`, `useSessionQueue`, `DisplaySession`, `useStartTonight`, `useSessionRouteSync`

**Depends on** (in-repo imports; external packages omitted)

- `use-session-mutations.ts` → `src/screens/journal-fast-lane-utils.ts` (`formatIsoDateForToday`); `src/screens/journal/components/session-actions-modal.tsx` (`SessionActionTarget`); `src/screens/journal/journal-action-sheet.ts` (`openJournalNativeActionSheet`); `src/screens/journal/journal-client-sync-map-storage.ts` (`loadJournalClientSyncMap`); `src/screens/journal/journal-create-queue-storage.ts` (`loadJournalCreateQueue`, `persistJournalCreateQueue`); `src/screens/journal/journal-create-queue.ts` (`QueuedSessionCreateEntry`, `createQueuedSessionCreateEntry`, `createQueuedSessionDeleteEntry`, `createQueuedSessionUpdateEntry`, `isRetryableCreateError`, `upsertQueuedJournalCreateEntry`); `src/screens/journal/journal-offline-create.ts` (`isNavigatorOffline`, `withTimeout`); `src/screens/journal/journal-route-params.ts` (`buildJournalGamesRouteParams`); `src/services/journal/index.ts` (`LeagueId`, `SessionId`); `src/utils/client-sync-id.ts` (`createClientSyncId`)
- `use-sessions.ts` → `src/hooks/journal/reference-id-resolution.ts` (`resolveReferenceIdForMutation`); `src/screens/journal/journal-create-queue-storage.ts` (`loadJournalCreateQueue`, `persistJournalCreateQueue`); `src/screens/journal/journal-create-queue.ts` (`createQueuedSessionCreateEntry`, `createQueuedSessionDeleteEntry`, `upsertQueuedJournalCreateEntry`); `src/services/connectivity.ts` (`isConnectivityOffline`); `src/services/journal/index.ts` (`CreateSessionInput`, `LeagueId`, `RemoveSessionInput`, `Session`, `SessionId`, `UpdateSessionInput`, `convexJournalService`); `src/services/journal/local-reads.ts` (`listLocalSessionsByLeague`); `src/utils/client-sync-id.ts` (`createClientSyncId`)
- `use-session-queue.ts` → `src/screens/journal/journal-client-sync-map-storage.ts` (`JournalClientSyncMap`, `loadJournalClientSyncMap`); `src/screens/journal/journal-create-queue-storage.ts` (`loadJournalCreateQueue`); `src/screens/journal/journal-create-queue.ts` (`QueuedSessionCreateEntry`); `src/services/journal/index.ts` (`LeagueId`)
- `use-session-route-sync.ts` → `src/screens/journal/journal-client-sync-map-storage.ts` (`JournalClientSyncMap`); `src/services/journal/index.ts` (`LeagueId`)
- `index.ts` → `src/hooks/journal/use-export-sqlite-backup.ts` (`useExportSqliteBackup`); `src/hooks/journal/use-game-editor.ts` (`useGameEditor`); `src/hooks/journal/use-games.ts` (`useGames`); `src/hooks/journal/use-home-league.ts` (`useHomeLeague`); `src/hooks/journal/use-import-backup.ts` (`useImportBackup`); `src/hooks/journal/use-league-analytics.ts` (`SpareConversionData`, `useLeagueAnalytics`, `useSpareConversionAnalytics`); `src/hooks/journal/use-league-games.ts` (`useLeagueGames`); `src/hooks/journal/use-league-queue.ts` (`DisplayLeague`, `useLeagueQueue`); `src/hooks/journal/use-leagues.ts` (`useLeagues`); `src/hooks/journal/use-queue-sync-status.ts` (`useQueueSyncStatus`); `src/hooks/journal/use-reference-data.ts` (`useReferenceData`); `src/hooks/journal/use-session-mutations.ts` (`useSessionMutations`); `src/hooks/journal/use-session-queue.ts` (`DisplaySession`, `useSessionQueue`); `src/hooks/journal/use-session-route-sync.ts` (`useSessionRouteSync`); `src/hooks/journal/use-sessions.ts` (`useSessions`); `src/hooks/journal/use-start-tonight.ts` (`useStartTonight`)

**Imported by** (searched: `app/`, `convex/`, `src/`, `tests/`, `worker/src`)

- `use-session-mutations.ts` ← `src/hooks/journal/index.ts`
- `use-sessions.ts` ← `src/hooks/journal/index.ts`, `tests/hooks/journal-hooks-offline.test.ts`
- `use-session-queue.ts` ← `src/hooks/journal/index.ts`, `src/hooks/journal/use-start-tonight.ts`, `src/screens/journal/components/session-list.tsx`
- `use-session-route-sync.ts` ← `src/hooks/journal/index.ts`
- `index.ts` ← `src/screens/analytics-screen.tsx`, `src/screens/game-editor-screen.tsx`, `src/screens/home-screen.tsx`, `src/screens/home/home-tonight-card.tsx`, `src/screens/journal-games-screen.tsx`, `src/screens/journal-leagues-screen.tsx`, `src/screens/journal-sessions-screen.tsx`, `src/screens/profile-screen.tsx`, `src/screens/profile/profile-data-import-section.tsx`

**Colocated tests**

- `tests/hooks/journal-hooks-offline.test.ts` — 1,226 lines / 38,365 bytes
- `tests/hooks/stubs/journal-hooks-stubs.ts` — 358 lines / 12,258 bytes

**Totals** — files: 1,107 lines / 32,010 bytes; colocated tests: 1,584 lines / 50,623 bytes

<!-- MODULE-MAP:GENERATED:B:END -->

## C — Game-editor autosave sync

Purpose: autosaves in-flight game-editor state into D's game-save queue, guarded so frames without values are not autosaved; also hydrates a game into an editable draft on the screen side. _(Inferred from the measured structure.)_

- Autosave guard: frames without values are not autosaved (`hasAnyFrameValue` / `buildAutosaveGuardResult` in `game-editor-autosave-utils.ts`).

Representative change: change the autosave guard (no-value frames).
Verification: `npm test -- tests/game-editor` (covers the autosave, frame, and game-save queue tests).

<!-- MODULE-MAP:GENERATED:C:BEGIN -->
<!-- generated: head=18b17ba3d8bfa13319f7a60e5f1d0fb72d0a7e7d date=2026-10-13 -->

**Files**

- `src/screens/game-editor/use-game-editor-autosave-sync.ts` — 629 lines / 16,435 bytes — exports: `useGameEditorAutosaveSync`
- `src/screens/game-editor/game-editor-autosave-utils.ts` — 109 lines / 2,212 bytes — exports: `AutosaveGuardResult`, `hasAnyFrameValue`, `buildAutosaveGuardResult`
- `src/screens/game-editor/game-editor-frame-utils.ts` — 38 lines / 841 bytes — exports: `EMPTY_FRAME_DRAFT`, `EMPTY_FRAMES`, `FULL_PIN_MASK`, `getFirstParam`, `getRollValue`, `getStandingMaskForField`, `normalizeDateValue`, `packManualPins`, `sanitizeFrameDraftsForEntry`, `toFrameDrafts`, `FrameDraft`, `RollField`, `findSuggestedFrameIndex`, `getNextCursorAfterEntry`, `getPreferredRollField`, `getProvisionalTotalScore`, `getSettledRunningTotals`, `getFrameSplitFlags`, `isSplitLeaveMask`, `isOpenFrame`, `FrameSplitFlags`, `getFrameSymbolParts`, `getFrameSymbolSummary`, `buildFramesPayload`, `findFirstFrameError`, `getFrameInlineError`, `getFrameStatus`, `getVisibleRollFields`, `FrameStatus`
- `src/screens/game-editor/game-editor-screen-utils.ts` — 137 lines / 2,568 bytes — exports: `createDraftNonce`, `togglePinInMask`, `setPinState`, `maskHasPin`, `buildSyncSignature`, `buildPersistedSignature`, `hasAnyFrameDraftValue`, `isOfflineLikely`, `getDefaultMaskForField`, `clearDownstreamRolls`
- `src/hooks/journal/use-game-editor.ts` — 315 lines / 8,674 bytes — exports: `useGameEditor`
- `src/screens/game-editor/use-game-editor-hydration.ts` — 473 lines / 13,515 bytes — exports: `useGameEditorHydration`

**Depends on** (in-repo imports; external packages omitted)

- `use-game-editor-autosave-sync.ts` → `src/screens/game-editor/game-editor-autosave-utils.ts` (`buildAutosaveGuardResult`); `src/screens/game-editor/game-editor-frame-utils.ts` (`FrameDraft`, `sanitizeFrameDraftsForEntry`); `src/screens/game-editor/game-editor-screen-utils.ts` (`buildPersistedSignature`, `isOfflineLikely`); `src/screens/game-editor/game-save-queue-storage.ts` (`loadGameSaveQueue`, `persistGameSaveQueue`); `src/screens/game-editor/game-save-queue-sync.ts` (`flushQueuedGameSavesWithLock`, `isQueuedGameSaveFlushInFlight`); `src/screens/game-editor/game-save-queue.ts` (`buildGameSaveQueueId`, `createQueuedGameSaveEntry`, `getActionableSaveErrorMessage`, `getQueuedGameSaveEntry`, `isRetryableSaveError`, `upsertQueuedGameSaveEntry`); `src/services/journal/index.ts` (`CreateGameInput`, `GameId`, `ReplaceFramesInput`, `SessionId`, `UpdateGameInput`)
- `game-editor-autosave-utils.ts` → `src/screens/game-editor/game-editor-frame-utils.ts` (`FrameDraft`, `buildFramesPayload`, `findFirstFrameError`); `src/services/journal/index.ts` (`EditableFrameInput`)
- `game-editor-frame-utils.ts` → `src/screens/game-editor/frame-cursor.ts` (`findSuggestedFrameIndex`, `getNextCursorAfterEntry`, `getPreferredRollField`); `src/screens/game-editor/frame-mask-utils.ts` (`EMPTY_FRAMES`, `EMPTY_FRAME_DRAFT`, `FULL_PIN_MASK`, `FrameDraft`, `RollField`, `getFirstParam`, `getRollValue`, `getStandingMaskForField`, `normalizeDateValue`, `packManualPins`, `sanitizeFrameDraftsForEntry`, `toFrameDrafts`); `src/screens/game-editor/frame-scoring.ts` (`getProvisionalTotalScore`, `getSettledRunningTotals`); `src/screens/game-editor/frame-splits.ts` (`FrameSplitFlags`, `getFrameSplitFlags`, `isOpenFrame`, `isSplitLeaveMask`); `src/screens/game-editor/frame-symbols.ts` (`getFrameSymbolParts`, `getFrameSymbolSummary`); `src/screens/game-editor/frame-validation.ts` (`FrameStatus`, `buildFramesPayload`, `findFirstFrameError`, `getFrameInlineError`, `getFrameStatus`, `getVisibleRollFields`)
- `game-editor-screen-utils.ts` → `src/screens/game-editor/game-editor-frame-utils.ts` (`FrameDraft`, `RollField`, `buildFramesPayload`); `src/services/journal/index.ts` (`GameId`); `src/utils/draft-nonce.ts` (`createDraftNonce`)
- `use-game-editor.ts` → `convex/_generated/dataModel.d.ts` (`Id`); `src/hooks/journal/reference-id-resolution.ts` (`resolveReferenceIdForMutation`); `src/screens/game-editor/frame-mask-utils.ts` (`getRollValue`, `packManualPins`); `src/services/journal/index.ts` (`CreateGameInput`, `Frame`, `Game`, `GameId`, `LeagueId`, `ReplaceFramesInput`, `UpdateGameInput`, `convexJournalService`); `src/services/journal/local-reads.ts` (`LOCAL_JOURNAL_OPEN_LEAGUE_ID`, `LOCAL_JOURNAL_USER_ID`); `src/services/local-journal/index.ts` (`GameScore`, `LocalFrame`, `LocalGame`, `LocalSession`, `getLocalJournalService`)
- `use-game-editor-hydration.ts` → `src/screens/game-editor/game-editor-frame-utils.ts` (`EMPTY_FRAMES`, `FrameDraft`, `RollField`, `findSuggestedFrameIndex`, `getPreferredRollField`, `normalizeDateValue`, `sanitizeFrameDraftsForEntry`, `toFrameDrafts`); `src/screens/game-editor/game-editor-screen-utils.ts` (`buildPersistedSignature`, `buildSyncSignature`, `hasAnyFrameDraftValue`, `isOfflineLikely`); `src/screens/game-editor/game-local-draft-storage.ts` (`loadLocalGameDraft`, `removeLocalGameDraft`, `upsertLocalGameDraft`); `src/screens/game-editor/game-local-draft-utils.ts` (`shouldRestoreLocalDraft`); `src/screens/game-editor/game-save-queue-storage.ts` (`loadGameSaveQueue`); `src/screens/game-editor/game-save-queue.ts` (`QueuedGameSaveEntry`); `src/services/journal/index.ts` (`Frame`, `Game`, `GameId`)

**Imported by** (searched: `app/`, `convex/`, `src/`, `tests/`, `worker/src`)

- `use-game-editor-autosave-sync.ts` ← `src/screens/game-editor-screen.tsx`
- `game-editor-autosave-utils.ts` ← `src/screens/game-editor/use-game-editor-autosave-sync.ts`, `tests/game-editor/game-editor-autosave-utils.test.ts`
- `game-editor-frame-utils.ts` ← `src/screens/game-editor-screen.tsx`, `src/screens/game-editor/frame-progress-strip.tsx`, `src/screens/game-editor/game-editor-autosave-utils.ts`, `src/screens/game-editor/game-editor-screen-utils.ts`, `src/screens/game-editor/game-local-draft-storage.ts`, `src/screens/game-editor/use-game-editor-autosave-sync.ts`, `src/screens/game-editor/use-game-editor-hydration.ts`, `src/screens/journal/journal-games-display.ts`, `tests/game-editor/game-editor-autosave-utils.test.ts`, `tests/game-editor/game-editor-frame-utils.test.ts`, `tests/import/frame-preview-parity.test.ts`
- `game-editor-screen-utils.ts` ← `src/screens/game-editor-screen.tsx`, `src/screens/game-editor/use-game-editor-autosave-sync.ts`, `src/screens/game-editor/use-game-editor-hydration.ts`
- `use-game-editor.ts` ← `src/hooks/journal/index.ts`, `tests/hooks/journal-hooks-offline.test.ts`
- `use-game-editor-hydration.ts` ← `src/screens/game-editor-screen.tsx`

**Colocated tests**

- `tests/game-editor/game-editor-autosave-utils.test.ts` — 202 lines / 4,547 bytes
- `tests/game-editor/game-editor-frame-utils.test.ts` — 589 lines / 14,389 bytes

**Totals** — files: 1,701 lines / 44,245 bytes; colocated tests: 791 lines / 18,936 bytes

<!-- MODULE-MAP:GENERATED:C:END -->

## D — Game-save queue syncer

Purpose: queue + flush driver for game-save entries (offline edits to existing games). The syncer provider runs the flush loop (5s cadence), the presence interval, and the connectivity-restore replay, and is the join point that also drives A's and the reference-create queue's flushes. _(Inferred from the measured structure.)_

- Saves stay queued unless failure is demonstrably permanent (retry classification; see `isRetryableSaveError` and `markQueuedGameSaveEntryRetry`).
- The provider is the single join point for the flush driver across D, A, and the reference queue (it imports all three `*WithLock` flush entry points).

Representative change: change game-save flush retry classification.
Verification: `npm test -- tests/providers` (syncer) and `npm test -- tests/game-editor` (queue/sync/status/retry-contract tests).

<!-- MODULE-MAP:GENERATED:D:BEGIN -->
<!-- generated: head=18b17ba3d8bfa13319f7a60e5f1d0fb72d0a7e7d date=2026-10-13 -->

**Files**

- `src/providers/game-save-queue-syncer.tsx` — 185 lines / 5,778 bytes — exports: `GameSaveQueueSyncer`
- `src/screens/game-editor/game-save-queue.ts` — 225 lines / 5,550 bytes — exports: `isRetryableSaveError`, `QueuedGameSaveEntry`, `buildGameSaveQueueId`, `createQueuedGameSaveEntry`, `upsertQueuedGameSaveEntry`, `replaceQueuedGameSaveEntry`, `removeQueuedGameSaveEntry`, `getDueQueuedGameSaveEntries`, `getQueuedGameSaveEntry`, `migrateQueuedEntryToGameId`, `markQueuedGameSaveEntryRetry`, `getActionableSaveErrorMessage`
- `src/screens/game-editor/game-save-queue-sync.ts` — 55 lines / 1,354 bytes — exports: `flushQueuedGameSaves`, `isQueuedGameSaveFlushInFlight`, `flushQueuedGameSavesWithLock`
- `src/screens/game-editor/game-save-queue-sync-core.ts` — 339 lines / 9,447 bytes — exports: `FlushQueuedGameSavesOptions`, `FlushQueuedGameSavesResult`, `flushQueuedGameSavesCore`
- `src/screens/game-editor/game-save-queue-sync-storage.ts` — 52 lines / 1,507 bytes — exports: `loadDefaultQueue`, `persistDefaultQueue`, `loadJournalSyncMapDefault`, `getErrorMessage`, `getEntryByQueueId`, `removeQueuedEntryIfSignatureMatches`, `applyQueueMutation`
- `src/screens/game-editor/game-save-queue-storage.ts` — 96 lines / 3,171 bytes — exports: `loadGameSaveQueue`, `persistGameSaveQueue`
- `src/screens/game-editor/game-save-queue-status.ts` — 92 lines / 2,107 bytes — exports: `QueueSyncState`, `QueueSyncStatus`, `deriveQueueSyncStatus`

**Depends on** (in-repo imports; external packages omitted)

- `game-save-queue-syncer.tsx` → `src/screens/game-editor/game-local-draft-storage.ts` (`removeLocalGameDraft`); `src/screens/game-editor/game-save-queue-sync.ts` (`flushQueuedGameSavesWithLock`); `src/screens/journal/journal-create-queue-sync.ts` (`flushJournalCreateQueueWithLock`); `src/screens/journal/queue-sync-events.ts` (`subscribeQueueSyncState`); `src/screens/journal/queue-sync-presence.ts` (`didRestoreConnectivity`, `loadQueueSyncPresence`, `shouldRunQueueSyncInterval`); `src/screens/journal/reference-create-queue-sync.ts` (`flushReferenceCreateQueueWithLock`); `src/services/connectivity.ts` (`isConnectivityOffline`, `subscribeConnectivity`); `src/services/journal/index.ts` (`convexJournalService`)
- `game-save-queue.ts` → `src/services/journal/index.ts` (`EditableFrameInput`); `src/utils/retryable-save-error.ts` (`getSaveErrorMessage`, `isRetryableSaveError`)
- `game-save-queue-sync.ts` → `src/screens/game-editor/game-save-queue-sync-core.ts` (`FlushQueuedGameSavesOptions`, `FlushQueuedGameSavesResult`, `flushQueuedGameSavesCore`); `src/screens/game-editor/game-save-queue-sync-storage.ts` (`loadDefaultQueue`, `persistDefaultQueue`)
- `game-save-queue-sync-core.ts` → `src/screens/game-editor/game-save-queue-sync-storage.ts` (`applyQueueMutation`, `getEntryByQueueId`, `getErrorMessage`, `loadJournalSyncMapDefault`, `removeQueuedEntryIfSignatureMatches`); `src/screens/game-editor/game-save-queue.ts` (`QueuedGameSaveEntry`, `isRetryableSaveError`, `markQueuedGameSaveEntryRetry`, `migrateQueuedEntryToGameId`, `replaceQueuedGameSaveEntry`); `src/screens/journal/reference-draft-id.ts` (`parseDraftReferenceId`, `resolveReferenceIdFromSyncMap`); `src/services/journal/index.ts` (`CreateGameInput`, `GameId`, `ReplaceFramesInput`, `SessionId`, `UpdateGameInput`)
- `game-save-queue-sync-storage.ts` → `src/screens/game-editor/game-save-queue-storage.ts`; `src/screens/game-editor/game-save-queue.ts` (`QueuedGameSaveEntry`); `src/screens/journal/journal-client-sync-map-storage.ts`
- `game-save-queue-storage.ts` → `src/screens/game-editor/game-save-queue.ts` (`QueuedGameSaveEntry`); `src/screens/journal/queue-sync-events.ts` (`notifyQueueSyncStateChanged`)
- `game-save-queue-status.ts` → `src/screens/game-editor/game-save-queue.ts` (`getActionableSaveErrorMessage`)

**Imported by** (searched: `app/`, `convex/`, `src/`, `tests/`, `worker/src`)

- `game-save-queue-syncer.tsx` ← `app/(app)/_layout.tsx`, `tests/providers/game-save-queue-syncer.test.ts`
- `game-save-queue.ts` ← `src/screens/game-editor-screen.tsx`, `src/screens/game-editor/game-save-queue-status.ts`, `src/screens/game-editor/game-save-queue-storage.ts`, `src/screens/game-editor/game-save-queue-sync-core.ts`, `src/screens/game-editor/game-save-queue-sync-storage.ts`, `src/screens/game-editor/use-game-editor-autosave-sync.ts`, `src/screens/game-editor/use-game-editor-hydration.ts`, `src/screens/journal-games-screen.tsx`, `src/screens/journal/journal-games-display.ts`, `tests/game-editor/game-save-queue-status.test.ts`, `tests/game-editor/game-save-queue-sync.test.ts`, `tests/game-editor/game-save-queue.test.ts`
- `game-save-queue-sync.ts` ← `src/hooks/journal/use-queue-sync-status.ts`, `src/providers/game-save-queue-syncer.tsx`, `src/screens/game-editor/use-game-editor-autosave-sync.ts`, `tests/game-editor/game-save-queue-sync.test.ts`
- `game-save-queue-sync-core.ts` ← `src/screens/game-editor/game-save-queue-sync.ts`
- `game-save-queue-sync-storage.ts` ← `src/screens/game-editor/game-save-queue-sync-core.ts`, `src/screens/game-editor/game-save-queue-sync.ts`
- `game-save-queue-storage.ts` ← `src/hooks/journal/use-queue-sync-status.ts`, `src/screens/game-editor-screen.tsx`, `src/screens/game-editor/game-save-queue-sync-storage.ts`, `src/screens/game-editor/use-game-editor-autosave-sync.ts`, `src/screens/game-editor/use-game-editor-hydration.ts`, `src/screens/journal-games-screen.tsx`, `src/screens/journal/queue-sync-presence.ts`
- `game-save-queue-status.ts` ← `src/components/sync-status-chip.tsx`, `src/hooks/journal/use-queue-sync-status.ts`, `src/screens/journal/components/league-sync-status-modal.tsx`, `tests/game-editor/game-save-queue-status.test.ts`

**Colocated tests**

- `tests/providers/game-save-queue-syncer.test.ts` — 431 lines / 14,235 bytes
- `tests/providers/stubs/syncer-stubs.ts` — 244 lines / 8,001 bytes
- `tests/game-editor/game-save-queue-sync.test.ts` — 452 lines / 13,023 bytes
- `tests/game-editor/game-save-queue.test.ts` — 375 lines / 9,166 bytes
- `tests/game-editor/game-save-queue-status.test.ts` — 87 lines / 2,166 bytes
- `tests/game-editor/game-save-queue-retry-contract.test.ts` — 76 lines / 2,556 bytes
- `tests/navigation/stubs/game-save-queue-syncer.mjs` — 10 lines / 359 bytes

**Totals** — files: 1,044 lines / 28,914 bytes; colocated tests: 1,675 lines / 49,506 bytes

<!-- MODULE-MAP:GENERATED:D:END -->

## E — Connectivity/offline layer

Purpose: the single source of online/offline state; wraps the netinfo signal and exposes the test-control handles the offline suites use. _(Inferred from the measured structure.)_

- Offline state is read through `isConnectivityOffline`; suites drive it through the exported `__connectivityTestControls` handle rather than mocking netinfo directly.

Representative change: change where the offline decision comes from.
Verification: `npm test -- tests/connectivity.test.ts`.

<!-- MODULE-MAP:GENERATED:E:BEGIN -->
<!-- generated: head=18b17ba3d8bfa13319f7a60e5f1d0fb72d0a7e7d date=2026-10-13 -->

**Files**

- `src/services/connectivity.ts` — 242 lines / 7,241 bytes — exports: `ConnectivityListener`, `isConnectivityOffline`, `subscribeConnectivity`, `__connectivityTestControls`

**Depends on** (in-repo imports; external packages omitted)

- `connectivity.ts` — none

**Imported by** (searched: `app/`, `convex/`, `src/`, `tests/`, `worker/src`)

- `connectivity.ts` ← `src/hooks/journal/use-games.ts`, `src/hooks/journal/use-import-backup.ts`, `src/hooks/journal/use-leagues.ts`, `src/hooks/journal/use-sessions.ts`, `src/providers/game-save-queue-syncer.tsx`, `src/screens/journal/journal-offline-create.ts`, `tests/connectivity.test.ts`, `tests/hooks/import-backup-offline.test.ts`, `tests/hooks/journal-hooks-offline.test.ts`, `tests/providers/game-save-queue-syncer.test.ts`

**Colocated tests**

- `tests/connectivity.test.ts` — 363 lines / 10,994 bytes

**Totals** — files: 242 lines / 7,241 bytes; colocated tests: 363 lines / 10,994 bytes

<!-- MODULE-MAP:GENERATED:E:END -->

## F — Import pipeline (client + convex + worker)

Purpose: imports a sqlite backup: the client validates and uploads the file and starts the import; Convex runs the import lifecycle; the separate worker package parses/exports sqlite. _(Inferred from the measured structure.)_

- The import status lifecycle `queued → parsing → importing → completed|failed` must be preserved, along with the `snapshotJson` transport (see `AGENTS.md` guardrails).
- Backup import start is blocked while offline: `use-import-backup.ts` consults `connectivity` before starting.
- `convex/imports.ts` functions are referenced by name at runtime through generated API refs (`src/convex/functions.ts` builds refs such as `imports:startImport`; `src/services/journal/convex-journal-service.ts` maps them), so `imports.ts` has an empty static importer list.
- `convex/_generated/` is codegen output (`npm run convex:codegen`); it is excluded from this map's importer search.

Representative change: change backup import start's offline gate.
Verification: `npm test -- tests/hooks/import-backup-offline.test.ts` (client), `npm test -- tests/import` (server-side import tests), and `npm --prefix worker run check` (worker package).

<!-- MODULE-MAP:GENERATED:F:BEGIN -->
<!-- generated: head=18b17ba3d8bfa13319f7a60e5f1d0fb72d0a7e7d date=2026-10-13 -->

**Files**

- `src/hooks/journal/use-import-backup.ts` — 198 lines / 5,053 bytes — exports: `useImportBackup`
- `src/hooks/journal/import-backup/import-upload-client.ts` — 187 lines / 4,772 bytes — exports: `SelectedBackupFile`, `uploadBackupFileAndStartImport`
- `src/hooks/journal/import-backup/file-validation.ts` — 142 lines / 3,913 bytes — exports: `DetectedImportFormat`, `detectBackupFormat`, `isSupportedBackupBlob`
- `src/hooks/journal/import-backup/file-picker-web.ts` — 100 lines / 2,571 bytes — exports: `pickBackupFileOnWeb`
- `convex/imports.ts` — 243 lines / 6,822 bytes — exports: `startImport`, `dispatchImportQueue`, `getImportStatus`, `getBatchByIdForCallback`, `updateBatchStatusForCallback`, `getNonceByValueForCallback`, `insertNonceForCallback`, `applyPostImportRefinement`, `deleteUserDocsChunkForImport`, `createImportBatchForSnapshot`, `persistRawImportChunkForBatch`, `importSqliteSnapshotAfterCleanupForUser`, `importSqliteSnapshot`, `submitParsedSnapshotForCallback`, `submitParsedSnapshotJsonForCallback`, `persistCanonicalFrameChunkForCallback`, `completeSnapshotImportForCallback`
- `worker/src/index.js` — 792 lines / 20,407 bytes — exports: `default`
- `worker/src/sqlite_parser.js` — 868 lines / 25,303 bytes — exports: `SqliteParseError`, `mapParsedBackupToSnapshot`, `parseBackupDatabaseToSnapshot`, `parseBackupDatabase`
- `worker/src/sqlite_exporter.js` — 247 lines / 7,192 bytes — exports: `buildSqliteBackupBytes`
- `worker/src/callback_payload.js` — 22 lines / 784 bytes — exports: `buildImportingSnapshotJsonCallbackPayload`
- `worker/src/health.js` — 80 lines / 2,079 bytes — exports: `HEALTH_SCHEMA_VERSION`, `HEALTH_SERVICE_NAME`, `buildLivenessPayload`, `evaluateWorkerDependencies`, `buildReadinessPayload`, `readinessHttpStatus`

**Depends on** (in-repo imports; external packages omitted)

- `use-import-backup.ts` → `convex/_generated/dataModel.d.ts` (`Id`); `src/hooks/journal/import-backup/file-picker-web.ts` (`pickBackupFileOnWeb`); `src/hooks/journal/import-backup/import-upload-client.ts` (`SelectedBackupFile`, `uploadBackupFileAndStartImport`); `src/services/connectivity.ts` (`isConnectivityOffline`); `src/services/journal/index.ts` (`convexJournalService`)
- `import-upload-client.ts` → `convex/_generated/dataModel.d.ts` (`Id`); `src/hooks/journal/import-backup/file-validation.ts` (`isSupportedBackupBlob`)
- `file-validation.ts` — none
- `file-picker-web.ts` — none
- `imports.ts` → `convex/_generated/server.js` (`action`, `internalAction`, `internalMutation`, `internalQuery`, `mutation`, `query`); `convex/lib/auth.ts` (`requireUserId`); `convex/lib/import_callback_helpers.ts` (`completeSnapshotImportForBatch`, `getRequiredImportBatch`, `persistCanonicalFramesForBatch`); `convex/lib/import_callback_state.ts` (`getCallbackNonceByValue`, `getImportBatchById`, `getImportStatusForUser`, `insertCallbackNonce`, `updateImportBatchStatus`); `convex/lib/import_core_refinement.ts` (`applyRefinement`); `convex/lib/import_dates.ts` (`normalizeTimezoneOffsetMinutes`); `convex/lib/import_function_refs.ts` (`dispatchImportQueueActionRef`, `getBatchByIdForDispatchQueryRef`, `updateBatchStatusForDispatchMutationRef`); `convex/lib/import_queue_dispatch.ts` (`dispatchImportQueueToWorker`); `convex/lib/import_refinement.ts` (`normalizeNullableInteger`); `convex/lib/import_replace_all_cleanup.ts` (`deleteUserDocsChunkForImportTable`); `convex/lib/import_snapshot_action.ts` (`runImportSqliteSnapshotAction`); `convex/lib/import_snapshot_runner.ts` (`importSqliteSnapshotAfterCleanupCore`, `submitParsedSnapshotForCallbackCore`, `submitParsedSnapshotJsonForCallbackCore`); `convex/lib/import_snapshot_storage.ts` (`createSnapshotImportBatch`, `persistRawImportRowsForBatch`); `convex/lib/import_start.ts` (`startImportBatch`); `convex/lib/import_types.ts` (`DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE`, `RawImportRow`); `convex/lib/import_validators.ts` (`batchIdArgs`, `completeSnapshotImportArgs`, `createImportBatchForSnapshotArgs`, `deleteUserDocsChunkForImportArgs`, `dispatchImportQueueArgs`, `importSqliteSnapshotAfterCleanupArgs`, `insertNonceArgs`, `nonceLookupArgs`, `persistCanonicalFrameChunkArgs`, `persistRawImportChunkArgs`, `postImportRefinementArgs`, `sqliteSnapshotArgs`, `startImportArgs`, `submitParsedSnapshotArgs`, `submitParsedSnapshotJsonArgs`, `updateBatchStatusArgs`)
- `index.js` → `worker/src/callback_payload.js` (`buildImportingSnapshotJsonCallbackPayload`); `worker/src/health.js` (`buildLivenessPayload`, `buildReadinessPayload`, `evaluateWorkerDependencies`, `readinessHttpStatus`); `worker/src/sqlite_exporter.js` (`buildSqliteBackupBytes`); `worker/src/sqlite_parser.js` (`SqliteParseError`, `parseBackupDatabaseToSnapshot`)
- `sqlite_parser.js` — none
- `sqlite_exporter.js` — none
- `callback_payload.js` — none
- `health.js` — none

**Imported by** (searched: `app/`, `convex/`, `src/`, `tests/`, `worker/src`)

- `use-import-backup.ts` ← `src/hooks/journal/index.ts`, `tests/hooks/import-backup-offline.test.ts`
- `import-upload-client.ts` ← `src/hooks/journal/use-import-backup.ts`
- `file-validation.ts` ← `src/hooks/journal/import-backup/import-upload-client.ts`
- `file-picker-web.ts` ← `src/hooks/journal/use-import-backup.ts`
- `imports.ts` — none
- `index.js` — none
- `sqlite_parser.js` ← `tests/import/pinpal_lite_compound_parse_test.test.ts`, `tests/import/sqlite-roundtrip-invariants.test.ts`, `tests/import/worker_snapshot_transport.test.ts`, `worker/src/index.js`
- `sqlite_exporter.js` ← `tests/import/sqlite-roundtrip-invariants.test.ts`, `worker/src/index.js`
- `callback_payload.js` ← `tests/import/pinpal_lite_compound_parse_test.test.ts`, `tests/import/worker_snapshot_transport.test.ts`, `worker/src/index.js`
- `health.js` ← `tests/health/worker_health.test.ts`, `worker/src/index.js`

**Colocated tests**

- `tests/hooks/import-backup-offline.test.ts` — 265 lines / 8,449 bytes
- `tests/hooks/stubs/import-backup-stubs.ts` — 192 lines / 6,635 bytes
- `tests/import/` — 18 test files, 1,788 lines / 50,973 bytes (directory totals)

**Totals** — files: 2,879 lines / 78,896 bytes; colocated tests: 2,245 lines / 66,057 bytes

<!-- MODULE-MAP:GENERATED:F:END -->
