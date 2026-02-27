# SQLite Backup Format

This app exports a neutral SQLite backup file with `.db` extension.

## Core compatibility tables

The backup includes the standard journaling tables used by the existing SQLite import path:

- `house`
- `pattern`
- `ball`
- `league`
- `week`
- `game`
- `frame`

## App extension tables

To preserve richer app data in a single-file backup, the export also includes these always-present tables:

- `bj_meta`
- `bj_session_ext`
- `bj_game_ext`

These extension tables are optional for import compatibility. If they are missing, import still succeeds using core tables only.

## Coverage notes

- The backup captures journal data and metadata needed for replay/import.
- Runtime-local state (offline queue internals, local draft caches, sync maps, UI preferences) is intentionally excluded.
