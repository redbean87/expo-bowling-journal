# Offline Support Contract (v1)

This document defines what is currently guaranteed to work offline versus what is best effort or not yet supported.

## Scope

- Single-user, single-device workflow
- Prior sign-in is required
- League-night capture reliability is prioritized over broad offline CRUD parity

## Support Levels

- `Guaranteed`: Works offline, survives app restart, replays automatically on reconnect, and matches latest local edit after sync.
- `Best effort`: May work when data is already loaded/cached, but is not guaranteed.
- `Not guaranteed`: Requires network or has not been implemented for offline replay yet.

## Screen Matrix (v1)

- `Home`: Best effort for data visibility and shortcuts, not a source of offline guarantees.
- `Leagues`: Best effort read-only for loaded data; league CRUD is not guaranteed offline.
- `Sessions`: Best effort read-only for loaded data; session CRUD is not guaranteed offline.
- `Games`: Game list visibility is best effort; creating/editing game content is guaranteed through queue-first flow.
- `Game Editor`: Guaranteed offline for score entry/editing, including restart durability and reconnect replay.
- `Profile`: Preferences are local; backup/import and auth operations are not guaranteed offline.

## Conflict Policy (v1)

- Queue replay is ordered and optimized for single-user, single-device usage.
- Conflict rule: latest local edit wins.
- Duplicate-create protection is expected on game draft flows.

## Acceptance Criteria (v1)

- No entered game frames are lost offline, including after app restart.
- Reconnect drains queued game writes under normal network recovery.
- No duplicate game creation from retry/replay in normal single-device flows.
- Final synced game state reflects latest local edits.

## Planned Expansion (v2)

- Extend guaranteed offline coverage to league/session CRUD.
- Extend guaranteed offline coverage to reference entity quick-add/create flows.
- Re-validate and publish an updated contract once those guarantees are in place.
