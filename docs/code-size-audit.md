# Code Size Audit

Snapshot date: 2026-02-26

This snapshot lists tracked implementation files that exceed the current guardrails in `docs/code-health-guardrails.md`.

Thresholds:

- Ideal: <= 200 lines
- Review threshold: > 250 lines
- Hard-stop threshold: > 400 lines

## Hard-Stop Files (> 400)

- `src/screens/journal-sessions-screen.tsx` (963)
- `src/screens/journal-games-screen.tsx` (845)
- `worker/src/sqlite_parser.js` (738)
- `src/screens/game-editor-screen.tsx` (725)
- `src/screens/journal-leagues-screen.tsx` (704)
- `convex/lib/import_core_runner.ts` (670)
- `convex/frames.ts` (662)
- `worker/src/index.js` (655)
- `src/screens/game-editor/use-game-editor-autosave-sync.ts` (620)
- `convex/lib/import_callback_processing.ts` (505)
- `src/screens/game-editor/use-game-editor-hydration.ts` (469)
- `src/convex/functions.ts` (450)

## Review Threshold Files (251-400)

- `src/screens/profile-screen.tsx` (379)
- `convex/lib/import_canonical_frames.ts` (350)
- `src/screens/journal/journal-games-display.ts` (347)
- `src/screens/game-editor/frame-progress-strip.tsx` (343)
- `convex/games.ts` (342)
- `convex/lib/game_frame_preview.ts` (342)
- `src/screens/game-editor/frame-mask-utils.ts` (342)
- `convex/referenceUsage.ts` (339)
- `convex/schema.ts` (328)
- `convex/lib/import_validators.ts` (295)
- `convex/lib/import_game_stats.ts` (291)
- `src/screens/home-screen.tsx` (277)
- `src/screens/game-editor/game-save-queue.ts` (258)
- `convex/sessions.ts` (253)
- `src/screens/game-editor/game-save-queue-sync-core.ts` (253)

## Near-Threshold Files (201-250)

- `src/screens/journal/components/game-row-card.tsx` (250)
- `src/screens/journal-games-reconciliation.ts` (248)
- `src/screens/journal/components/session-row-card.tsx` (247)
- `convex/imports.ts` (244)
- `src/screens/journal/components/create-session-modal.tsx` (234)
- `src/screens/game-editor/frame-scoring.ts` (232)
- `src/screens/game-editor/frame-validation.ts` (227)
- `src/screens/game-editor/use-pin-deck-gesture.ts` (221)
- `convex/lib/import_core_refinement.ts` (212)
- `src/screens/journal/components/league-row-card.tsx` (208)
- `src/components/navigation/app-tab-bar.tsx` (206)
- `convex/leagues.ts` (204)

## Notes

- This is a planning artifact for incremental refactors and should be refreshed after large extraction workstreams.
- Test files are intentionally excluded from this list.
