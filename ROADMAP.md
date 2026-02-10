# Bowling Journal Roadmap

This roadmap keeps work scoped to small, precise commits.

## Now

- [ ] Add import UI entry point and post-import summary

## Next

- [ ] Add computed game stats pipeline (score, strikes, spares, opens)
- [ ] Add SQLite file parser to feed `imports:importSqliteSnapshot` directly from `Backup.db`

## Later

- [ ] Analytics views (trend lines, consistency, spare conversion)
- [ ] Data export and backup tooling
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
- [x] Add lossless SQLite snapshot import pipeline with raw mirrors
- [x] Add post-import schema refinement pass (handicap, lane context, ball switches, notes)

## Decision Log

- Use Expo + TypeScript + Expo Router for app shell and navigation
- Use Convex for backend, auth, and real-time sync
- Keep a service abstraction between hooks and backend implementation
- Keep commits small and map each commit to one roadmap item

## Risks / Unknowns

- Import edge cases from older SQLite variants may require mapping adjustments
- Final analytics scope may change after core journaling flows are stable
