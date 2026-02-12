# Bowling Journal Roadmap

This roadmap keeps work scoped to small, precise commits.

## Now

- No open `Now` items.

## Next

- [ ] Analytics views (trend lines, consistency, spare conversion)
- [ ] Data export and backup tooling

## Later

- [ ] Team/coach sharing model
- [ ] Re-enable stricter React Native lint rules after core flows stabilize

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
- [x] Add worker SQLite parser for `Backup.db` and map to Convex snapshot schema
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

## Risks / Unknowns

- Import edge cases from older SQLite variants may require mapping adjustments
- Final analytics scope may change after core journaling flows are stable
