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

## Import Behavior (Locked)

- Import is **replace-all** per user
- Intended for first-time setup
- All existing user data is deleted before import

**Import guarantees**

- All documents receive `userId`
- IDs are remapped internally
- Stats are computed once

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

✅ Schema locked

Next steps:

1. SQLite → Convex field mapping
2. Import action implementation
3. Expo upload UI
