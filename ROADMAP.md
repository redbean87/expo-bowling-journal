# Bowling Journal Roadmap

This roadmap keeps work scoped to small, precise commits.

## Todo

Todo is strictly ordered; execute the top unchecked item first.
When an item is complete, move it to `## Completed`.

- [ ] Expand guaranteed offline coverage to league/session/reference CRUD with deterministic replay and latest-local-edit-wins policy
- [ ] Shift queue sync from fixed polling to adaptive/event-driven triggers (connectivity restore + queue-present interval)
- [ ] Data export and backup tooling
- [ ] Analytics views (trend lines, consistency, spare conversion)
- [ ] Split preview/production Convex deployments for web hosting environments
- [ ] Add CI automation for Expo web preview/production deploys
- [ ] Re-enable stricter React Native lint rules after core flows stabilize
- [ ] Header polish v2 for long-name truncation and compact mobile density in journal flow
- [ ] Unify journal create/action affordances (FAB vs overflow menu) with a single platform-consistent interaction pattern
- [ ] Validate native iOS/Android flows (builds + smoke tests for journal/game-editor offline and queue paths)
- [ ] Team/coach sharing model
- [ ] Add lightweight CI/reporting for file-size drift (largest files + threshold alerts)
- [ ] Reduce hard-stop and review-threshold files from `docs/code-size-audit.md` in small extraction batches

## Completed

- [x] Initialize repository
- [x] Add reference docs from trading journal project
- [x] Establish architecture and planning baseline
- [x] Bootstrap Expo app shell and route structure
- [x] Add tooling baseline (lint, typecheck, format, tests)
- [x] Configure Convex + auth provider + env plumbing
- [x] Implement locked Convex schema (leagues, sessions, games, frames, balls, houses, patterns)
- [x] Add core Convex queries/mutations for leagues, sessions, and games
- [x] Add create/edit game flow with frame persistence
- [x] Add service abstraction and domain hooks
- [x] Wire minimal tab screens to live data
- [x] Add profile import UI entry point with backup file upload and status display
- [x] Add worker deployment pipeline from `main` via GitHub Actions
- [x] Add signed queue + callback endpoints with HMAC verification
- [x] Add worker SQLite parser for `Backup.pinpal` and map to Convex snapshot schema
- [x] Add worker callback integration (`parsing` -> `importing`) with explicit failure messaging
- [x] Add Convex callback import path that completes batches on successful snapshot import
- [x] Switch callback transport to `snapshotJson` to handle large frame payloads
- [x] Remove `importRawFrames` persistence to avoid Convex per-execution write limits
- [x] Add post-import schema refinement pass (handicap, lane context, ball switches, notes)
- [x] Add import regression tests for callback/import pipeline (`snapshotJson`, large payload, failure paths)
- [x] Update import architecture docs and local/cloud test runbook
- [x] Triage top import warning categories and reduce avoidable warning noise
- [x] Document default session workflow and roadmap reporting expectations in agent/contributor docs
- [x] Add computed game stats pipeline (score, strikes, spares, opens)
- [x] Keep callback import runtime on `snapshotJson` transport while persisting canonical frames in chunked writes
- [x] Fix Convex module path compatibility for import helper modules
- [x] Optional v2: add canonical frame persistence with chunked writes (without reintroducing Convex write-cap failures)
- [x] Optional v2: decide frame/raw retention policy after canonical frame persistence rollout
- [x] Persist `importRawFrames` in callback import flow using chunked writes while keeping `snapshotJson` + transition guardrails intact
- [x] Refactor navigation into auth/app shells with nested journal route hierarchy
- [x] Split journal flow into leagues, sessions, and games screens
- [x] Add theme primitives/tokens foundation (`Button`, `Card`, `Input`, `ScreenLayout`)
- [x] Normalize screen file layout with root-level prefixed journal screen files
- [x] Add persistent offline autosave queue for game editor (durable storage + retry/backoff + foreground flush)
- [x] Sanitize frame 10 bonus-roll state during edits to prevent stale roll-3 validation noise
- [x] Configure Expo web deployment on EAS Hosting (preview + production) with production-only import access
- [x] Improve one-hand game entry ergonomics (larger footer actions, denser frame strip targeting, reduced pin-deck travel)
- [x] Reduce game-editor autosave feedback noise to queued/sync/error-only status
- [x] Persist game frame previews on write paths and backfill existing games to remove list-query N+1 frame reads
- [x] Enable offline game capture after prior sign-in with queue-first saves and reconnect sync, including duplicate-create prevention
- [x] Add league/session edit and cascade delete flows with game-level delete controls
- [x] Add FAB-first create UX across journal screens (league/session modal create, game quick-start create)
- [x] Add reference selectors with inline quick add and top-10 recent suggestions for leagues and sessions
- [x] Add optional game details section for pattern/ball metadata with hidden-by-default toggle
- [x] Remove game-level house from schema, mutations, imports, and client game contracts (house now league/session scoped)
- [x] Add quiet queue/sync status UX on journal root with details modal and retry-now action
- [x] Improve reference combobox keyboard navigation, empty states, and exact-match "use existing" prioritization
- [x] Design and implement custom app header/footer navigation shell
- [x] Polish navigation shell visual design (header affordance, tab active state contrast, and chrome/content separation)
- [x] Redesign Home screen for flow-first league-night operations
- [x] Redesign Profile screen for action-first backup/import and account clarity
- [x] Add viewer email fallback from auth identity/users table for account display
- [x] Add and run legacy games.houseId cleanup migration; restore strict games schema
- [x] Document offline support contract v1 and align contributor/agent docs
- [x] Polish journal list cards with overflow action menus and consistent icon-based navigation affordances
- [x] Add contextual journal headers (league/week/date/game-name) with hierarchy-aware title/subtitle behavior
- [x] Add installable web app metadata/icons for PWA-ready home-screen installs (no service-worker caching yet)
- [x] Add in-app PWA update prompt flow (waiting worker detection + skip-waiting activation + reload)
- [x] End-to-end offline retry testing and conflict handling for single-user device flow
- [x] Polish offline games-list reconciliation on reconnect to eliminate remaining queued-to-synced visual churn
- [x] Refactor game editor hydration/restore and local draft reconcile flow into `use-game-editor-hydration` to keep screen orchestration-focused
- [x] Fix legacy 10th-frame roll/mask mismatches (list vs editor totals), add standing-aware roll reconstruction, and run frame-pin mismatch backfills
- [x] Refactor game editor autosave/queue sync into `use-game-editor-autosave-sync` to keep screen focused on orchestration + render
- [x] Extract game editor details/footer render sections into dedicated components to keep `game-editor-screen` orchestration-focused
- [x] Start journal screen P0-C split by extracting league create/actions modals into dedicated components
- [x] Continue journal P0-C by extracting league row card rendering into `src/screens/journal/components/league-row-card.tsx`
- [x] Continue journal P0-C by extracting league sync status modal into `src/screens/journal/components/league-sync-status-modal.tsx`
- [x] Continue journal P0-C by extracting shared route/offline helper modules for leagues, sessions, and games screens
- [x] Continue journal P0-C by extracting session actions/create modals into dedicated components
- [x] Continue journal P0-C by extracting session row rendering/edit section into `src/screens/journal/components/session-row-card.tsx`
- [x] Continue journal P0-C by extracting game actions modal into `src/screens/journal/components/game-actions-modal.tsx`
- [x] Continue journal P0-C by extracting game row rendering/preview section into `src/screens/journal/components/game-row-card.tsx`
- [x] Continue journal P0-C by extracting games display/night-summary composition helpers into `src/screens/journal/journal-games-display.ts`
- [x] Continue journal P0-C by centralizing native row action sheets in `src/screens/journal/journal-action-sheet.ts` across leagues/sessions/games

## Decision Log

- Use Expo + TypeScript + Expo Router for app shell and navigation
- Use Convex for backend, auth, and real-time sync
- Keep a service abstraction between hooks and backend implementation
- Keep commits small and map each commit to one roadmap item
- Import v1 does not persist canonical `frames` rows; v2 callback flow persists canonical `frames` with chunked writes
- No additional time-based retention policy for import data right now; replace-all import is the lifecycle boundary for user-owned normalized and raw import tables
- Callback import now persists both canonical `frames` and `importRawFrames` via bounded chunk mutations to avoid write-cap regressions
- Replace-all import cleanup for callback/direct snapshot paths is chunked in bounded mutations to avoid Convex read-cap regressions
- Raw import mirror persistence for callback/direct snapshot paths is chunked across all `importRaw*` tables before normalized import execution
- Prioritize mobile-first data capture and offline resiliency ahead of analytics/reporting polish
- Offline editor autosave queue dedupe key is `sessionId + (gameId || draftNonce)` with latest-local-edit-wins behavior per draft attempt
- Game editor frame hydration now reconciles packed manual pin masks with stored roll counts using standing-aware bonus-roll reconstruction (prevents false frame-10 roll3 validation noise, e.g. `X9/`)
- Added user/internal frame-pin mismatch repair backfills; internal backfill run repaired existing legacy mismatches and post-run dry-check reported zero remaining candidates
- Journal P0-C leagues/sessions/games modal and row extractions are complete; remaining P0-C scope is games-screen orchestration helper cleanup and optional action-sheet consolidation
- Code-health guardrails now enforce file-size thresholds and extraction policy; see `docs/code-health-guardrails.md`

## Risks / Unknowns

- Import edge cases from older SQLite variants may require mapping adjustments
- Final analytics scope may change after core journaling flows are stable
- Offline queue conflict semantics should stay simple for single-user, single-device use (latest local edit wins)
- Houses and patterns remain global tables for now; selector UX should prioritize user-recent usage without changing global storage scope
