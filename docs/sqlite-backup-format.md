# SQLite Backup Format

The app works with two different backup files. Which one a reader sees is
decided by the `format` tag inside the file, not by the file name alone.

## 1. The local journal backup (the local-first format)

The local-first export is a versioned, self-describing JSON document written
with the **`.json`** extension. It is produced by the app from local SQLite
only — no Convex, no authentication, no network, no worker upload.

The contract and its serializer live in
`src/services/local-journal/journal-backup-format.ts`
(`JOURNAL_BACKUP_FORMAT`, `JOURNAL_BACKUP_VERSION`,
`JOURNAL_BACKUP_FILE_EXTENSION`, `buildJournalBackupDocument`).

Envelope (version 1):

```json
{
  "format": "bowling-journal",
  "version": 1,
  "exportedAt": "2026-10-28T13:58:00.000Z",
  "data": {
    "balls": [],
    "houses": [],
    "patterns": [],
    "leagues": [],
    "sessions": [],
    "games": [],
    "frames": []
  }
}
```

- `format` is this app's own tag (`bowling-journal`), deliberately **not**
  `pinpal`: it identifies our canonical document, so a reader can pick the
  right parser before parsing anything.
- `version` is the payload layout version.
- `exportedAt` is the ISO-8601 export moment.
- `data` always carries all seven canonical tables, even when empty.

The payload mirrors the **canonical model** (`src/services/local-journal/types.ts`),
not the SQLite column layout and not the PinPal database schema:

- UUID text keys are preserved; PinPal/Convex IDs are never stored.
- Relationships are preserved as those UUIDs (`sessions.leagueId` may be
  `null` for an open session; `games.sessionId` and `frames.gameId` always
  resolve to a row that is present in the same document).
- Frames carry the authoritative roll masks (`roll1Mask`, `roll2Mask`,
  `roll3Mask`), including the tenth frame's bonus rolls.
- `League.houseName` (persisted in the league `metadata` column) round-trips.
- `laneContext` and `ballSwitches` keep their structured values.
- Dates use the established **local UTC-midnight convention**: the document
  carries the domain ISO date (`YYYY-MM-DD`), which maps to the exact INTEGER
  the database stores (`Date.parse("<iso>T00:00:00Z")`). The legacy
  `timezoneOffsetMinutes` re-encoding is not used, so a date cannot shift by
  one day in a non-UTC timezone.

Intentionally excluded from the payload:

- Derived values that are never persisted: `LeagueSummary.mostRecentSessionDate`
  and per-game scores (recomputed on demand from the frame masks).
- The storage-only `metadata` columns on balls, houses, patterns, sessions,
  games, and frames (the canonical schema declares them, the domain has no
  field for them).
- Journal-adjacent state that lives outside SQLite: the home-league pointer,
  SecureStore preferences, and the offline queue / draft / client-sync stores.
  A backup is a journal backup, not an application-settings backup.
- Cloud state: Convex documents and IDs, authentication, worker pipeline.

Snapshot guarantee (stated, not assumed): each table is read with one query,
so each table is internally consistent, but the document is not claimed to be
a frozen cross-table snapshot — `expo-sqlite`'s `withTransactionAsync` is
documented as non-exclusive, so it is not used to imply one. A reader must
validate relationships; the serializer already refuses a payload with a
missing id, a duplicate id, or a dangling reference.

## 2. The legacy `.db` file (worker-produced, unchanged)

The current cloud path still exports a neutral SQLite backup file with the
`.db` extension, produced by the worker from a Convex snapshot
(`src/hooks/journal/use-export-sqlite-backup.ts`, `worker/src/sqlite_exporter.js`).
That file is not the local-first format above and shares no table names with
the local canonical schema.

Core compatibility tables:

- `house`
- `pattern`
- `ball`
- `league`
- `week`
- `game`
- `frame`

App extension tables (always present in this app's export, optional for import
compatibility):

- `bj_meta`
- `bj_session_ext`
- `bj_game_ext`

If the extension tables are missing, import still succeeds using core tables
only.

## 3. The legacy PinPal `.pinpal` format (import-only)

The `.pinpal` extension stays reserved for the actual PinPal application's
import-only format. This app never writes a `.pinpal` file. Existing PinPal
backups remain the compatibility bar for import and are read through their own
parser path, separate from the version-1 JSON contract above.
