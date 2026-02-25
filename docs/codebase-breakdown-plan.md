# Codebase Breakdown Plan (Junior-Friendly)

## Why this exists

This document tracks where we should split large files into smaller, focused modules so the project is easier to understand, test, and maintain.

## Principles

- Keep screens focused on orchestration (UI composition + navigation), not deep business logic.
- Keep pure logic in utility modules.
- Keep data sync/queue/import behaviors in dedicated services/hooks.
- Prefer files under ~150-250 lines unless there is a clear reason.
- Use small, descriptive files with predictable names and single responsibility.

---

## Priority Legend

- **P0**: High impact / high complexity / biggest readability win
- **P1**: Medium impact
- **P2**: Nice-to-have cleanup

## Progress Tracking Format

Each target should use this structure so status is obvious at a glance:

- `Status`: `Not started` | `In progress` | `Done`
- `Completed`: concrete files/tasks finished in this target
- `Remaining`: concrete files/tasks still open for this target

---

## P0 Breakdown Targets

### 1) `convex/imports.ts` (~244 lines, reduced from ~2037)

**Status**

- Done

**Completed**

- P0-A is completed in this workstream; `convex/imports.ts` is now primarily wiring/export orchestration.
- Thin export/wiring module pattern established for import pipeline submodules.

**Remaining**

- None for P0-A.

**Current pain**

- One file handles validators, cleanup, batch lifecycle, SQLite mapping, raw mirror persistence, canonical frame flow, and callback helpers.
- Hard for juniors to navigate safely.

**Breakdown opportunities**

- Extract validators + shared import types.
- Extract replace-all cleanup/chunking helpers.
- Split core import stages by entity responsibility (houses/patterns/balls/leagues/sessions/games/frames).
- Isolate batch status transitions and completion behavior.
- Keep a thin public API file that wires smaller modules.

**Proposed files**

- `convex/lib/import-types.ts`
- `convex/lib/import-validators.ts`
- `convex/lib/import-batch-lifecycle.ts`
- `convex/lib/import-replace-all-cleanup.ts`
- `convex/lib/import-raw-mirror.ts`
- `convex/lib/import-core-normalization.ts`
- `convex/lib/import-core-refinement.ts`
- `convex/lib/import-core-runner.ts`
- `convex/imports.ts` (thin exports/wiring)

**Completed in this stream**

- `convex/lib/import-types.ts`
- `convex/lib/import-validators.ts`
- `convex/lib/import-batch-lifecycle.ts`
- `convex/lib/import-replace-all-cleanup.ts`
- `convex/lib/import-core-runner.ts`
- `convex/lib/import-core-refinement.ts`
- `convex/lib/import-raw-mirror.ts`
- `convex/lib/import-queue-dispatch.ts`
- `convex/lib/import-snapshot-action.ts`
- `convex/lib/import-snapshot-runner.ts`
- `convex/lib/import-snapshot-storage.ts`
- `convex/lib/import-callback-helpers.ts`
- `convex/lib/import-callback-state.ts`
- `convex/lib/import-function-refs.ts`
- `convex/lib/import-start.ts`

---

### 2) `src/screens/game-editor-screen.tsx` (~1802 lines)

**Status**

- Done

**Completed**

- `src/screens/game-editor/use-game-editor-route-context.ts`
- `src/screens/game-editor/game-editor-screen-utils.ts`
- `src/screens/game-editor/use-signed-in-history.ts`
- `src/screens/game-editor/use-game-editor-hydration.ts`
- `src/screens/game-editor/use-game-editor-autosave-sync.ts`
- `src/screens/game-editor/game-editor-details-section.tsx`
- `src/screens/game-editor/game-editor-footer-actions.tsx`

**Remaining**

- None for P0-B.

**Current pain**

- Route parsing, hydration, local draft restore, autosave, queue flush, pin interactions, and UI all in one screen.
- High cognitive load and regression risk.

**Breakdown opportunities**

- Move route/session context parsing to a focused hook.
- Move hydration + restore logic to a dedicated hook.
- Move autosave + queue promotion/flush into isolated hooks.
- Extract details section + footer actions into components.
- Keep screen as "compose hooks + render sections."

**Proposed files**

- `src/screens/game-editor/use-game-editor-route-context.ts`
- `src/screens/game-editor/use-game-editor-hydration.ts`
- `src/screens/game-editor/use-game-editor-autosave-sync.ts`
- `src/screens/game-editor/game-editor-details-section.tsx`
- `src/screens/game-editor/game-editor-footer-actions.tsx`
- `src/screens/game-editor-screen.tsx` (orchestration only)

---

### 3) Journal screen family

#### `src/screens/journal-games-screen.tsx` (~1511 lines)

#### `src/screens/journal-sessions-screen.tsx` (~1380 lines)

#### `src/screens/journal-leagues-screen.tsx` (~1184 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Extract shared journal helpers (route parsing, offline create/retry, action sheet wiring).
- Extract row cards + create/edit modal sections into dedicated components.
- Reduce each screen to orchestration-focused composition.

**Current pain**

- Similar concerns repeated in each file: queue polling, offline create fallback, action-sheet wiring, edit/create forms, route param normalization.

**Breakdown opportunities**

- Extract shared "offline/create with timeout + retry" helpers.
- Extract route param parsing and draft-sync-map resolution utilities.
- Extract repeated action modal logic.
- Extract row cards and modal form sections into dedicated components.
- Keep each screen focused on data flow and composition.

**Proposed files**

- `src/screens/journal/journal-route-params.ts`
- `src/screens/journal/journal-offline-create.ts`
- `src/screens/journal/journal-action-sheet.ts`
- `src/screens/journal/components/league-row-card.tsx`
- `src/screens/journal/components/session-row-card.tsx`
- `src/screens/journal/components/game-row-card.tsx`
- `src/screens/journal/components/create-league-modal.tsx`
- `src/screens/journal/components/create-session-modal.tsx`
- `src/screens/journal/components/game-actions-modal.tsx`

---

## P1 Breakdown Targets

### 4) `src/screens/game-editor/game-editor-frame-utils.ts` (~958 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Split frame utility domains (mask math, validation, symbols, scoring, splits, cursor navigation).

**Current pain**

- Contains multiple domains in one file: mask math, validation, split logic, symbols, scoring, cursor navigation.

**Breakdown opportunities**

- Split by domain function.
- Keep a small index barrel for import ergonomics.

**Proposed files**

- `src/screens/game-editor/frame-mask-utils.ts`
- `src/screens/game-editor/frame-validation.ts`
- `src/screens/game-editor/frame-symbols.ts`
- `src/screens/game-editor/frame-splits.ts`
- `src/screens/game-editor/frame-scoring.ts`
- `src/screens/game-editor/frame-cursor.ts`
- `src/screens/game-editor/frame-utils.ts` (optional barrel)

---

### 5) `convex/http.ts` (~574 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Extract callback auth + payload parsing + processing helpers.
- Keep route file minimal.

**Current pain**

- Signature validation, replay protection, payload parsing, cleanup, import execution, raw persistence, canonical frame persistence in one handler.

**Breakdown opportunities**

- Extract request authentication/nonce checks.
- Extract callback payload parsing/validation.
- Extract import processing pipeline into helper module.
- Keep route file small.

**Proposed files**

- `convex/lib/import-callback-auth.ts`
- `convex/lib/import-callback-payload.ts`
- `convex/lib/import-callback-processing.ts`
- `convex/http.ts` (routes only)

---

### 6) `src/hooks/journal/use-import-backup.ts` (~363 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Split file picker, validation, and upload transport from hook state machine.

**Current pain**

- Web picker fallback, file validation, worker upload orchestration, and state all in one hook.

**Breakdown opportunities**

- Separate platform file picking + file validation + upload transport.
- Keep hook as state machine wrapper.

**Proposed files**

- `src/hooks/journal/import-backup/file-picker-web.ts`
- `src/hooks/journal/import-backup/file-validation.ts`
- `src/hooks/journal/import-backup/import-upload-client.ts`
- `src/hooks/journal/use-import-backup.ts` (state + orchestration)

---

### 7) `src/components/reference-combobox.tsx` (~397 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Extract combobox interaction/state hook and dropdown rendering component.

**Current pain**

- UI rendering + keyboard navigation + dropdown state + quick-add behavior all intertwined.

**Breakdown opportunities**

- Extract state/interaction logic into a hook.
- Keep visual component mostly presentational.

**Proposed files**

- `src/components/reference-combobox/use-reference-combobox.ts`
- `src/components/reference-combobox/reference-combobox-dropdown.tsx`
- `src/components/reference-combobox.tsx`

---

## P2 Cleanup / Consistency

### 8) `src/services/journal/types.ts` (~295 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Split service types by domain and add index barrel.

Split by domain:

- `src/services/journal/types/core.ts`
- `src/services/journal/types/imports.ts`
- `src/services/journal/types/mutations.ts`
- `src/services/journal/types/index.ts`

### 9) `src/screens/game-editor/pin-deck.tsx` (~368 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Extract gesture logic and layout helpers into dedicated modules.

Extract gesture logic:

- `src/screens/game-editor/use-pin-deck-gesture.ts`
- `src/screens/game-editor/pin-deck-layout.ts`

### 10) `src/screens/game-editor/game-save-queue-sync.ts` (~314 lines)

**Status**

- Not started

**Completed**

- None yet.

**Remaining**

- Extract queue mutation core and storage/mapping helpers.

Extract queue mutation helpers + draft session mapping:

- `src/screens/game-editor/game-save-queue-sync-core.ts`
- `src/screens/game-editor/game-save-queue-sync-storage.ts`

---

## Cross-Cutting Duplications to Consolidate

- `getFirstParam` appears in multiple places (journal screens, frame utils, nav route utils).
- `isNavigatorOffline` duplicated in journal screens.
- `withTimeout` duplicated in league/session screens.
- `createDraftNonce` duplicated in games/editor screens.
- Similar split-detection/frame-preview logic exists in both client and Convex (`game-editor-frame-utils` and `convex/lib/game_frame_preview.ts`); align behavior with shared tests even if runtime sharing is not practical.

---

## Suggested Rollout (small commits)

1. **P0-A**: Break `convex/imports.ts` into internal modules with no behavior change.
2. **P0-B**: Split `game-editor-screen.tsx` into hooks/components.
3. **P0-C (Next Active)**: Split journal screens and extract shared journal helpers.
4. **P1-A**: Split frame utility mega-file by domain.
5. **P1-B**: Split callback handling in `convex/http.ts`.
6. **P1-C**: Split import backup hook internals.
7. **P2**: Type/module cleanup and smaller UX component refinements.

Each step should preserve behavior and include focused tests/regression checks.

---

## Validation Checklist Per Step

- `npm run format:check`
- `npm run lint:fix`
- `npm run typecheck`
- `npm test` (or targeted suites)
- `npm run test:import` for import/callback changes
- `npm --prefix worker run check` when worker-adjacent contracts change

---

## Definition of Done

- Screen files primarily orchestrate and compose.
- Business logic moved to focused hooks/services/utilities.
- Repeated helper logic centralized.
- No behavior regressions in import pipeline and offline queue paths.
- New folder structure is obvious enough for junior developers to navigate quickly.
