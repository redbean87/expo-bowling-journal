# Offline Support Contract (v3)

This document defines what is currently guaranteed to work offline versus what is best effort or not yet supported.

## Scope

- Single-user, single-device workflow
- Prior sign-in is required
- League-night capture reliability is prioritized over broad offline CRUD parity
- Web PWA update lifecycle supports in-app refresh prompts without forcing app close/reopen

## Support Levels

- `Guaranteed`: Works offline, survives app restart, replays automatically on reconnect, and matches latest local edit after sync.
- `Best effort`: May work when data is already loaded/cached, but is not guaranteed.
- `Not guaranteed`: Requires network or has not been implemented for offline replay yet.

## Screen Matrix (v3)

- `Home`: Best effort for data visibility and shortcuts, not a source of offline guarantees.
- `Leagues`: Guaranteed offline for create/edit/delete plus house quick-add create with durable queued replay and latest-local-edit-wins conflict policy.
- `Sessions`: Guaranteed offline for create/edit/delete plus house/pattern/ball quick-add create with durable queued replay and latest-local-edit-wins conflict policy.
- `Games`: Game list visibility is best effort; creating/editing game content is guaranteed through queue-first flow.
- `Game Editor`: Guaranteed offline for score entry/editing and pattern/ball quick-add create, including restart durability and reconnect replay.
- `Profile`: Preferences are local; backup/import and auth operations are not guaranteed offline.

## Conflict Policy (v3)

- Queue replay is ordered and optimized for single-user, single-device usage.
- Conflict rule: latest local edit wins.
- Duplicate-create protection is expected on game draft flows.
- Queue collapse policy: delete supersedes queued updates; queued create + queued delete resolves to no-op.
- Reference quick-add queue policy: draft reference creates dedupe by draft id and keep the latest local name edit.

## Acceptance Criteria (v3)

- No entered game frames are lost offline, including after app restart.
- Reconnect drains queued game writes under normal network recovery.
- No duplicate game creation from retry/replay in normal single-device flows.
- Final synced game state reflects latest local edits.
- Offline league/session edits and deletes replay correctly after reconnect and app restart.
- Offline reference quick-add creates (house/pattern/ball) replay correctly after reconnect and resolve queued league/session/game payload references.

## Web PWA Notes

- Installability is supported via manifest/icons.
- A lifecycle-only service worker is used for update detection and activation.
- Update behavior: when a new deploy is detected in an open session, the app can prompt for `Update now`, activate the waiting worker, and reload in place.
- Runtime asset/data caching is not enabled yet, so first-load offline behavior is unchanged.

## Planned Expansion (v4)

- Shift queue sync from fixed polling to adaptive/event-driven triggers.
- Re-validate and publish an updated contract once queue trigger behavior is updated.
