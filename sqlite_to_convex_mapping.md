# SQLite → Convex Mapping Document

This document defines how data from the **SQLite backup** is translated into the **locked Convex schema**.

- Source: user-uploaded SQLite database
- Target: Convex documents
- Import mode: **replace-all per user**
- SQLite IDs are temporary and never persisted

---

## General Import Rules

- All created Convex documents receive `userId = ctx.auth.userId`
- SQLite primary keys are used **only** to build an in-memory ID map
- Import order matters and must follow dependency order
- Missing optional fields are set to `null`
- Raw source rows are persisted in `importRaw*` tables for houses/patterns/balls/leagues/weeks/games
- Notes and lane context remain scope-specific (`week` -> session, `game` -> game)

---

## Import Order

1. houses
2. leagues
3. sessions (weeks)
4. balls
5. games
6. frame-derived refinement inputs (not persisted as `importRawFrames` in v1)
7. post-import refinement (sessions + games)

---

## Ignored Tables

| SQLite Table     | Reason                  |
| ---------------- | ----------------------- |
| android_metadata | Android system metadata |

---

## houses

### SQLite Source

`house`

### Fields

| SQLite Column | Convex Field | Notes                    |
| ------------- | ------------ | ------------------------ |
| id            | (ignored)    | Used only for ID mapping |
| name          | name         | Required                 |
| location      | location     | Optional if present      |

### Behavior

- Houses are treated as **global**
- Deduplicate by normalized `name`
- Create house if not already present

---

## leagues

### SQLite Source

`league`

### Fields

| SQLite Column | Convex Field | Notes               |
| ------------- | ------------ | ------------------- |
| id            | (ignored)    | Used for ID mapping |
| name          | name         | Required            |
| house_id      | houseId      | Optional reference  |
| start_date    | startDate    | Optional            |
| end_date      | endDate      | Optional            |

### Derived Fields

- `houseName` copied from resolved house
- `createdAt` set at import time

---

## sessions

### SQLite Source

`week`

### Fields

| SQLite Column | Convex Field | Notes                            |
| ------------- | ------------ | -------------------------------- |
| id            | (ignored)    | Used for ID mapping              |
| league_id     | leagueId     | Required                         |
| week_number   | weekNumber   | Optional                         |
| date          | date         | Required (fallback to game date) |
| houseFk       | houseId      | Optional                         |
| ballFk        | ballId       | Optional                         |
| patternFk     | patternId    | Optional                         |
| notes         | notes        | Optional, week-scoped            |
| lane          | laneContext  | Optional, week-scoped            |

### Notes

- One session per SQLite week
- Always belongs to a league

---

## balls

### SQLite Source

`ball`

### Fields

| SQLite Column | Convex Field | Notes            |
| ------------- | ------------ | ---------------- |
| id            | (ignored)    | Used for mapping |
| name          | name         | Required         |
| brand         | brand        | Optional         |
| coverstock    | coverstock   | Optional         |

### Behavior

- Deduplicate **per user** by normalized `name`
- Reuse existing ball if name matches

---

## games

### SQLite Source

`game`

### Fields

| SQLite Column | Convex Field | Notes                  |
| ------------- | ------------ | ---------------------- |
| id            | (ignored)    | Used for mapping       |
| week_id       | sessionId    | Required               |
| league_id     | leagueId     | Duplicated for queries |
| date          | date         | Required               |
| ball_id       | ballId       | Optional reference     |
| pattern_id    | patternId    | Optional reference     |
| houseFk       | houseId      | Optional reference     |
| notes         | notes        | Optional, game-scoped  |
| lane          | laneContext  | Optional, game-scoped  |

### Computed Fields

Computed during import from frames:

- `totalScore`
- `strikes`
- `spares`
- `opens`

### Notes

- Games are imported **before frames**, but stats are computed after frames load
- `singlePinSpareScore` is retained in `importRawGames.raw` until a canonical handicap mapping is confirmed

---

## frames

### SQLite Source

`frame`

### Fields

| SQLite Column | Convex Field | Notes                            |
| ------------- | ------------ | -------------------------------- |
| \_id          | (ignored)    | Used for mapping                 |
| gameFk        | gameId       | Required for normalized linkage  |
| frameNum      | frameNumber  | Optional, retained if valid 1–10 |
| ballFk        | ballId       | Optional                         |
| pins          | pins         | Optional, source fidelity        |
| scores        | scores       | Optional, source fidelity        |
| score         | score        | Optional, source fidelity        |
| flags         | flags        | Optional, source fidelity        |
| pocket        | pocket       | Optional, source fidelity        |
| footBoard     | footBoard    | Optional, source fidelity        |
| targetBoard   | targetBoard  | Optional, source fidelity        |

### Validation

- Frame rows are validated and consumed during import/refinement
- v1 does not persist `importRawFrames` rows (write-cap safety)
- Normalized `frames` rows are currently optional until `pins/scores` -> roll decoding is finalized

---

## patterns (optional)

### SQLite Source

`pattern`

### Fields

| SQLite Column | Convex Field | Notes            |
| ------------- | ------------ | ---------------- |
| id            | (ignored)    | Used for mapping |
| name          | name         | Required         |
| length        | length       | Optional         |

### Notes

- Safe to skip entirely if empty

---

## ID Mapping Strategy

During import, maintain in-memory maps:

```
oldHouseId   → newHouseId
oldLeagueId  → newLeagueId
oldSessionId → newSessionId
oldGameId    → newGameId
oldBallId    → newBallId
oldPatternId → newPatternId
```

Maps are discarded after import completes.

---

## Failure Handling

Abort import if:

- Required tables are missing
- No games or frames are found
- Referential integrity cannot be resolved

Show user-friendly error message.

---

## Post-Import Summary

After successful import, present:

- Leagues imported
- Sessions imported
- Games imported
- Frames imported
- Refinement warnings (if any)

---

## Post-Import Refinement Mapping

Refinement runs immediately after base import using normalized IDs.

### handicap

- Target: `games.handicap`
- Source: currently unresolved in this SQLite variant
- Behavior: set to `null`, emit warning count (non-fatal)

### lane context

- `week.lane` -> `sessions.laneContext`
- `game.lane` -> `games.laneContext`
- No cross-scope fallback between session and game lane data

### ball switches

- Derived from `frame.ballFk` transitions in frame order per game
- Baseline is `game.ballFk`
- Each switch entry stores `frameNumber`, optional `ballId`, optional `ballName`
- Invalid frame numbers are skipped with warnings

### notes

- `week.notes` -> `sessions.notes`
- `game.notes` -> `games.notes`
- No fallback or merge across scopes

---

## Status

✅ Mapping aligned with import v1 runtime behavior (snapshotJson callback + post-import refinement)

Known v1 scope:

- Frame count is tracked and used for refinement, but raw frame persistence is deferred
