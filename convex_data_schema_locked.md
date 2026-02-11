# Convex Data Schema (Locked)

This document defines the **final, locked Convex schema** for the bowling journal app.

- Optimized for **Expo + Convex**
- Designed for **multi-user auth**
- Supports **one-time SQLite import (replace-all)**
- No code generation or framework-specific syntax

This file is intended to live in your repo and guide implementation.

---

## Core Principles

- Every user-owned document includes `userId`
- SQLite IDs are **never persisted**
- Denormalization is intentional and limited
- Read paths are prioritized over write purity

---

## Entity Overview

```
users (Convex Auth)
leagues
sessions
games
frames
balls
houses
patterns (optional)
importBatches
importRawHouses
importRawPatterns
importRawBalls
importRawLeagues
importRawWeeks
importRawGames
importRawFrames
```

---

## users

Managed by Convex Auth.

Not extended in this schema.

---

## leagues

Represents a bowling league or long-running competition.

**Fields**

- `id`
- `userId`
- `name`
- `houseId` (optional)
- `houseName` (denormalized)
- `startDate` (optional)
- `endDate` (optional)
- `createdAt`

**Notes**

- `houseName` is duplicated to avoid joins
- Owned entirely by one user

---

## sessions

Represents a single bowling session (league night or casual play).

Previously called `week` in SQLite.

**Fields**

- `id`
- `userId`
- `leagueId`
- `weekNumber` (optional)
- `date`
- `houseId` (optional)
- `ballId` (optional)
- `patternId` (optional)
- `notes` (optional)
- `laneContext` (optional)

**Notes**

- Flexible enough for non-league play
- Always belongs to a league

---

## games

Represents a single game within a session.

**Fields**

- `id`
- `userId`
- `sessionId`
- `leagueId` (denormalized)
- `date`

**Computed / Stored Stats**

- `totalScore`
- `strikes`
- `spares`
- `opens`

**Optional References**

- `ballId`
- `patternId`
- `houseId` (optional)

**Post-Import Refinement Fields (optional)**

- `handicap`
- `laneContext`
- `ballSwitches`
- `notes`

**Notes**

- Stats are computed during import and on write
- Frames are not required for list views

---

## frames

Represents an individual frame within a game.

**Fields**

- `id`
- `userId`
- `gameId`
- `frameNumber` (1–10)
- `roll1`
- `roll2` (optional)
- `roll3` (optional)

**Source Fidelity Fields (optional)**

- `ballId`
- `pins`
- `scores`
- `score`
- `flags`
- `pocket`
- `footBoard`
- `targetBoard`

**Notes**

- Stored separately for analytics and edits
- Always queried by `gameId`

---

## balls

Represents bowling equipment owned by a user.

**Fields**

- `id`
- `userId`
- `name`
- `brand` (optional)
- `coverstock` (optional)

**Notes**

- Deduplicated per user during import
- Referenced by games

---

## houses

Represents bowling centers.

**Fields**

- `id`
- `name`
- `location` (optional)

**Notes**

- Global table (not user-owned)
- Names should be normalized

---

## patterns (optional)

Represents oil patterns.

**Fields**

- `id`
- `name`
- `length` (optional)

**Notes**

- SQLite source table may be empty
- Safe to omit in v1

---

## importBatches

Tracks each user import run.

**Fields**

- `id`
- `userId`
- `sourceType`
- `sourceFileName` (optional)
- `sourceHash` (optional)
- `status`
- `importedAt`
- `completedAt` (optional)
- `counts`

---

## importRaw\*

Lossless source mirrors for SQLite tables.

**Tables**

- `importRawHouses`
- `importRawPatterns`
- `importRawBalls`
- `importRawLeagues`
- `importRawWeeks`
- `importRawGames`
- `importRawFrames`

**Common fields**

- `id`
- `userId`
- `batchId`
- `sqliteId`
- `raw` (full source row)
- `importedAt`

**Notes**

- Raw mirrors are retained for the active imported dataset
- Replace-all import clears prior user-owned normalized and raw import data before each new import
- No additional time-based retention policy is applied right now

---

## Import Behavior (Locked)

- Import is **replace-all** per user
- Intended for first-time setup
- All existing user-owned normalized and raw import data is deleted before import

**Import guarantees**

- All documents receive `userId`
- IDs are remapped internally
- Raw source rows are stored losslessly in `importRaw*`
- Post-import refinement runs immediately after normalized insert

---

## Explicitly Ignored SQLite Tables

- `android_metadata`

---

## Future-Proofing Notes

This schema supports:

- Multi-user auth
- Data sharing (future)
- Coach / team features
- Advanced analytics

Without requiring migrations.

---

## Status

✅ Schema locked (v2, lossless import)

Next steps:

1. SQLite file parsing/upload UI
2. Computed stats derivation from imported frame shape (`pins`/`scores`)
3. Analytics and export features that build on canonical `frames`
