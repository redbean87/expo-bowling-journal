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

---

## Import Order

1. houses
2. leagues
3. sessions (weeks)
4. balls
5. games
6. frames

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

### Computed Fields

Computed during import from frames:

- `totalScore`
- `strikes`
- `spares`
- `opens`

### Notes

- Games are imported **before frames**, but stats are computed after frames load

---

## frames

### SQLite Source

`frame`

### Fields

| SQLite Column | Convex Field | Notes            |
| ------------- | ------------ | ---------------- |
| id            | (ignored)    | Used for mapping |
| game_id       | gameId       | Required         |
| frame_number  | frameNumber  | 1–10 only        |
| roll1         | roll1        | Required         |
| roll2         | roll2        | Optional         |
| roll3         | roll3        | Optional         |

### Validation

- Discard frames outside range 1–10
- Normalize missing rolls to `null`

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

---

## Status

✅ Mapping locked

Next step:

- Implement Convex import action using this mapping
