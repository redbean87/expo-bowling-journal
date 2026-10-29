# Backup File Formats

There is one journal — the local SQLite journal — and there are **two** backup
file formats, because PinPal writes a different file on each device. Which
format a file is in is decided by its **bytes**, never by its name or
extension: PinPal does not care about the extension, and
`src/hooks/journal/import-backup/file-validation.ts` sniffs headers in a fixed
order.

```text
local SQLite journal  ──readJournalBackupData──▶  canonical snapshot
        │                                              │
        │                                        buildPinPalLegacyRows
        │                                              │
        │                                      legacy PinPal rows
        │                                              │
   device decides ──▶ android-pinpal-dialect.ts  ·  ios-pinpal-dialect.ts
        │                                              │
        ▼                                              ▼
   one .db file  ◀─────────────────────────────────────┘
```

## 1. The Android PinPal dialect (raw SQLite)

Written by `src/hooks/journal/export-backup/android-pinpal-dialect.ts`
(`buildAndroidPinpalBackupImage`). This is the file PinPal imports on an
Android device.

Container:

- a **raw SQLite image at byte offset 0** — the 16-byte magic
  `SQLite format 3\0` is the first thing in the file;
- page size 4096 (the SQLite default, left unset here);
- `PRAGMA user_version = 8`;
- one `android_metadata` table holding a single row, `locale = 'en_US'`.

Schema — seven core tables keyed `_id INTEGER PRIMARY KEY`:

| Table     | Columns (in DDL order)                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| `house`   | `_id, name, sortOrder, flags`                                                                                 |
| `pattern` | `_id, name, sortOrder, flags`                                                                                 |
| `ball`    | `_id, name, sortOrder, flags`                                                                                 |
| `league`  | `_id, ballFk, patternFk, houseFk, name, games, notes, sortOrder, flags`                                       |
| `week`    | `_id, leagueFk, ballFk, patternFk, houseFk, date, notes, lane`                                                |
| `game`    | `_id, weekFk, leagueFk, ballFk, patternFk, houseFk, score, frame, flags, singlePinSpareScore, notes, lane`    |
| `frame`   | `_id, gameFk, weekFk, leagueFk, ballFk, frameNum, pins, scores, score, flags, pocket, footBoard, targetBoard` |

The DDL is written literally, not derived: PinPal's Android reader is strict
about table names, column names, column order and key types. Rows are
inserted in dependency order — house, pattern, ball, league, week, game,
frame — so every `…Fk` names a row that was already written.

The image is built in expo-sqlite's `:memory:` database, so the journal's own
`bowling-journal.db` is never opened or serialized.

## 2. The iOS PinPal dialect (plist-wrapped compound)

Written by `src/hooks/journal/export-backup/ios-pinpal-dialect.ts`
(`buildIosPinpalBackupImage`). This is the file PinPal imports on an iOS
device. It is the `pinpal-lite-compound` shape the import detector already
sniffs.

Container:

- a **4096-byte app-state wrapper**: the PinPal Lite plist as ASCII bytes,
  then NUL padding up to byte 4096;
- the **SQLite image at byte offset 4096** — the same constant the detector
  uses (`file-validation.ts` `PINPAL_LITE_SQLITE_OFFSET = 4096`), so a file
  this writer emits is a file that detector reads back as
  `pinpal-lite-compound`;
- page size **1024** (`PRAGMA page_size = 1024`);
- `PRAGMA user_version = 0`;
- **no** `android_metadata`.

Schema — the same seven core tables keyed `pk INTEGER PRIMARY KEY`, with the
Android-only columns simply not declared:

| Table     | Columns (in DDL order)                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| `house`   | `pk, name, flags`                                                                                   |
| `pattern` | `pk, name, flags`                                                                                   |
| `ball`    | `pk, name, flags`                                                                                   |
| `league`  | `pk, ballFk, patternFk, houseFk, name, games, notes, flags`                                         |
| `week`    | `pk, leagueFk, ballFk, patternFk, houseFk, date, notes`                                             |
| `game`    | `pk, weekFk, leagueFk, ballFk, patternFk, houseFk, score, frame, flags, singlePinSpareScore, notes` |
| `frame`   | `pk, gameFk, weekFk, leagueFk, ballFk, frameNum, pins, scores, score, flags`                        |

The iOS table set is the Android set minus `sortOrder` (house, pattern, ball,
league), `lane` (week, game) and `pocket, footBoard, targetBoard` (frame), so
one row set fills both dialects.

**Known limit:** the fixture header carries SQLite's internal schema-format
marker `3` at byte offset 44. Nothing in the SQL interface selects 3 — the
only knob, `SQLITE_DBCONFIG_LEGACY_FILE_FORMAT`, forces `1`, which this writer
must not emit either — so the writer emits the value the runtime writes, `4`,
which is the value the captain's Android backup carries. Page size and
`user_version` are physical header fields and _are_ set here.

## 3. The two dialects are not interchangeable

Android reads the raw image and rejects the compound one; iOS reads the
compound one and rejects the raw one. A raw image carrying `pk` keys, or a
compound image carrying `_id` keys, is a file neither device writes, and
`src/services/local-journal/pinpal-backup-import.ts` rejects such hybrids
before opening anything for reading.

## 4. The canonical local journal (not a backup format)

The authoritative store is `src/db/schema.ts`: `balls`, `houses`, `patterns`,
`leagues`, `sessions`, `games`, `frames`, with **UUID TEXT keys**, per-frame
roll masks (`roll1Mask`, `roll2Mask`, `roll3Mask`), and UTC-midnight ISO dates.
It shares **zero table names** with either PinPal dialect. A backup is always
a translation of this journal, never a copy of it.

## 5. The canonical snapshot document (internal, and still importable)

`src/services/local-journal/journal-backup-format.ts` still defines the
version-1 JSON document (`JOURNAL_BACKUP_FORMAT = 'bowling-journal'`,
`JOURNAL_BACKUP_VERSION = 1`, `JOURNAL_BACKUP_FILE_EXTENSION = '.json'`,
`buildJournalBackupDocument`). It is **no longer the shipped export
artifact** — PinPal cannot read it. It survives for two live purposes:

- `readJournalBackupData` is the **canonical snapshot** the export pipeline
  reads (one query per table over the local journal — no Convex, no network,
  no worker);
- `validateJournalBackupData` is the payload validator the local importer
  reuses, and the detector still recognizes `.json` envelopes so backups the
  app exported earlier stay importable.

Its payload mirrors the canonical model (`src/services/local-journal/types.ts`):
UUID keys preserved, roll masks authoritative, dates in the local
**UTC-midnight** convention (`YYYY-MM-DD` ↔ `Date.parse("<iso>T00:00:00Z")`).
The legacy `timezoneOffsetMinutes` re-encoding is not used there.

## 6. The worker-produced `.db` (cloud path, untouched)

`worker/src/sqlite_exporter.js` still builds a neutral legacy-layout SQLite
image from a Convex snapshot for the cloud path. It is out of scope for the
local-first work and is not modified by any of the modules above; the local
writers match its row rules by reading them, not by importing it.

# The module map (local PinPal backup)

| Responsibility                                   | Module                                                      | Key names                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot: local SQLite → canonical tables        | `src/services/local-journal/journal-backup-format.ts`       | `readJournalBackupData`, `validateJournalBackupData`                                                                                                                                                                                                                       |
| Shared row converter (pure, no DB, no clock)     | `src/services/local-journal/pinpal-backup-rows.ts`          | `buildPinPalLegacyRows`, `PinPalLegacyRows`, `PINPAL_ABSENT_FOREIGN_KEY`, `PINPAL_OPEN_BOWLING_LEAGUE_KEY`, `PINPAL_STRIKE_FRAME_FLAG`, `PINPAL_NON_STRIKE_FRAME_FLAG`, `PINPAL_PLACEHOLDER_FRAME_FLAGS`, `PINPAL_PLACEHOLDER_PINS_ANDROID`, `PINPAL_PLACEHOLDER_PINS_IOS` |
| Android container (raw SQLite)                   | `src/hooks/journal/export-backup/android-pinpal-dialect.ts` | `buildAndroidPinpalBackupImage`                                                                                                                                                                                                                                            |
| iOS container (plist + SQLite @4096)             | `src/hooks/journal/export-backup/ios-pinpal-dialect.ts`     | `buildIosPinpalBackupImage`, `IOS_COMPOUND_SQLITE_OFFSET`, `IOS_PAGE_SIZE`, `IOS_USER_VERSION`                                                                                                                                                                             |
| Dialect choice + one `.db` artifact              | `src/hooks/journal/use-export-sqlite-backup.ts`             | `useExportSqliteBackup`, `deviceExportDialect`, `askWebExportDialect`, `PINPAL_BACKUP_FILE_EXTENSION`, `PINPAL_BACKUP_MIME_TYPE`                                                                                                                                           |
| File naming                                      | `src/hooks/journal/export-backup/export-filename.ts`        | `sanitizeBackupFileName`, `KNOWN_BACKUP_EXTENSIONS`                                                                                                                                                                                                                        |
| Byte delivery to the platform                    | `src/hooks/journal/export-backup/native-export-file.ts`     | `saveAndShareNativeBackupFile` (cache-directory write + share sheet; web uses a blob download)                                                                                                                                                                             |
| Format sniffing                                  | `src/hooks/journal/import-backup/file-validation.ts`        | `validateBackupBlob`, `detectBackupFormat`, `DetectedImportFormat`, `PINPAL_LITE_SQLITE_OFFSET`                                                                                                                                                                            |
| Local import of both dialects                    | `src/services/local-journal/pinpal-backup-import.ts`        | `readPinPalBackupImage`, `convertPinPalBackupRowsToJournalBackupData`, `restoreJournalBackupData`, `importPinPalBackupIntoJournal`                                                                                                                                         |
| Server/worker import UI (not yet the local path) | `src/hooks/journal/use-import-backup.ts`                    | `useImportBackup`                                                                                                                                                                                                                                                          |

# Platform selection

- **Android** (`Platform.OS === 'android'`) always writes the Android dialect.
- **iOS** (`Platform.OS === 'ios'`) always writes the iOS dialect.
- **Web/PWA** has no device dialect to read off, so the user is asked
  explicitly — `globalThis.confirm('Export the Android PinPal dialect? OK =
Android, Cancel = iOS.')`, the same idiom the web delete dialogs already use.
- A caller that already knows the dialect may pass it
  (`exportSqliteBackup('ios' as PinpalExportDialect)`), but on a device the
  device always wins: `deviceExportDialect() ?? requestedDialect ?? askWebExportDialect()`.
- The hook reports the dialect the delivered file actually carries as
  `lastExportDialect`, so the screen can name it.

Exactly one file is produced per export, named
`bowling-journal-YYYY-MM-DD.db`, MIME `application/octet-stream`. The
extension is `.db` because that is the extension of what the file actually is.

# Approved conversion decisions (captain, 2026-10-28)

All measured against the captain's real backups —
`fixtures/pinpal/cortez-android.pinpal` (raw SQLite) and
`fixtures/pinpal/tj-ios.pinpal` (plist-wrapped) — which are read in place,
never modified, never copied into a tracked path, never committed.

- **Integer IDs.** PinPal's `_id`/`pk` keys have no local equivalent, so each
  table mints fresh 1-based integers in snapshot (creation) order. The journal
  service lists every table in a stable order, so two exports of an unchanged
  journal mint identical keys and every `…Fk` resolves through the same map.
- **Foreign keys.** An absent reference is `0`
  (`PINPAL_ABSENT_FOREIGN_KEY`), never null; an open session's legacy league
  key is `-1` (`PINPAL_OPEN_BOWLING_LEAGUE_KEY`).
- **One PinPal `week` per local session** — the journal has no `week` entity.
- **Dates.** `week.date` is epoch **milliseconds of local midnight**: the
  journal's ISO date parsed as UTC midnight plus a caller-supplied
  `timezoneOffsetMinutes` (the rule approved at `ROADMAP.md:128` and
  implemented at `worker/src/sqlite_exporter.js:191-193`). The offset is an
  argument, never `new Date().getTimezoneOffset()`, so the conversion stays
  deterministic and testable; the iOS writer divides by 1000 for the epoch
  **seconds** its fixture stores.
- **No value ⇒ NULL.** `sortOrder`, `lane` and `singlePinSpareScore` are NULL:
  the journal has no equivalent (`laneContext` is structured JSON, not the
  legacy integer lane).
- **Derived values.** `game.score` is the derived game total
  (`scoreGameFrames`), `game.frame` is `computeGameFrame` over the game's
  started frames, `game.flags` is `frame < 10 ? 2 : 1`, `frame.score` is 0 in
  every fixture row, `frame.pins` is
  `standingAfterRoll1 | (standingAfterRoll2 << 10)`, and `frame.scores` is
  `(min(10, roll1 + roll2) << 4) | roll1`.
- **Twelve `frame` rows per game**, `frameNum` 0-based, one row per slot; a
  game that stopped after two frames pads slots 2–11 rather than trailing
  them. Unused slots carry `flags` 0 while keeping the game's own foreign
  keys, and padded `pins` stays null in the converter because the fill differs
  per dialect (`0xFFFFF` Android, `0x3FFFFFF` iOS).
- **Tenth-frame bonus-row flags** follow the fixtures, not a per-row rule: a
  bonus row is `PINPAL_STRIKE_FRAME_FLAG` (193) except for the row that packs
  the two bonus balls after a tenth-frame strike whose second ball left pins
  standing, which is `PINPAL_NON_STRIKE_FRAME_FLAG` (195). The per-row rule
  `roll1 === 10 ? 193 : 195` matches only part of the fixture rows, so it is
  not what PinPal writes; the tenth frame's own row does follow it.

# Compatibility limits and the manual check

- Automated tests prove the bytes parse as SQLite and match the fixtures'
  layout, schema, and header fields. **They do not prove PinPal accepts the
  file.** PinPal's readers are closed-source and strict.
- The only real verification is the captain importing each generated file
  into PinPal on the matching device: the Android dialect on an Android
  device, the iOS dialect on an iOS device. Cross-platform import is not
  attempted — neither device reads the other's file.
- The iOS schema-format byte (4, not the fixture's 3) is a known,
  runtime-forced difference; if the iOS device import fails, that field is
  the first suspect.
- Local PinPal import currently lives in the service layer
  (`pinpal-backup-import.ts`, covered by
  `tests/local-journal/pinpal-backup-import.test.ts` and
  `tests/local-journal/pinpal-backup-round-trip.test.ts`). The app's import
  hook (`src/hooks/journal/use-import-backup.ts`) still runs the server/worker
  pipeline; wiring the local path into the UI is a separate task.
- Restoration is additive: it creates entities and replaces the frames only of
  the games it just created. It never deletes, clears, merges into, or edits
  an entity the journal already holds, and it never persists the file's
  integer keys — every imported entity gets a fresh local `Uuid`.
