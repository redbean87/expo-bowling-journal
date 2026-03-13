#!/usr/bin/env python3
"""Copy open bowling sessions (leagueFk=-1) from a source PinPal SQLite
database into a target database, remapping IDs to avoid conflicts.

Usage:
  python3 scripts/patch-open-bowling.py <source.db> <target.db>

  source.db — original Backup.pinpal (or any PinPal SQLite)
  target.db — export to patch in place
"""
import sqlite3
import sys

if len(sys.argv) != 3:
    print(__doc__)
    sys.exit(1)

source_path, target_path = sys.argv[1], sys.argv[2]

source = sqlite3.connect(source_path)
source.row_factory = sqlite3.Row

# Read open bowling weeks
weeks = source.execute(
    "SELECT * FROM week WHERE leagueFk = -1 ORDER BY _id"
).fetchall()

if not weeks:
    print("No open bowling sessions found in source — nothing to patch.")
    source.close()
    sys.exit(0)

week_ids = [r["_id"] for r in weeks]
placeholders = ",".join("?" * len(week_ids))

# Read associated games and frames
games = source.execute(
    f"SELECT * FROM game WHERE weekFk IN ({placeholders}) ORDER BY _id",
    week_ids,
).fetchall()

game_ids = [r["_id"] for r in games]
frame_placeholders = ",".join("?" * len(game_ids)) if game_ids else "NULL"

frames = (
    source.execute(
        f"SELECT * FROM frame WHERE gameFk IN ({frame_placeholders}) ORDER BY _id",
        game_ids,
    ).fetchall()
    if game_ids
    else []
)

source.close()

# Compute offsets from target's current max IDs
target = sqlite3.connect(target_path)
week_offset = (target.execute("SELECT COALESCE(max(_id), 0) FROM week").fetchone()[0] or 0) + 1
game_offset = (target.execute("SELECT COALESCE(max(_id), 0) FROM game").fetchone()[0] or 0) + 1
frame_offset = (target.execute("SELECT COALESCE(max(_id), 0) FROM frame").fetchone()[0] or 0) + 1

print(f"Offsets — week: +{week_offset}, game: +{game_offset}, frame: +{frame_offset}")

# Insert weeks
week_cols = weeks[0].keys()
for row in weeks:
    d = dict(row)
    d["_id"] += week_offset
    target.execute(
        f"INSERT INTO week ({','.join(week_cols)}) VALUES ({','.join('?' * len(week_cols))})",
        [d[c] for c in week_cols],
    )

# Insert games (remap weekFk)
if games:
    game_cols = games[0].keys()
    for row in games:
        d = dict(row)
        d["_id"] += game_offset
        d["weekFk"] += week_offset
        target.execute(
            f"INSERT INTO game ({','.join(game_cols)}) VALUES ({','.join('?' * len(game_cols))})",
            [d[c] for c in game_cols],
        )

# Insert frames (remap gameFk and weekFk)
if frames:
    frame_cols = frames[0].keys()
    for row in frames:
        d = dict(row)
        d["_id"] += frame_offset
        d["gameFk"] += game_offset
        d["weekFk"] += week_offset
        target.execute(
            f"INSERT INTO frame ({','.join(frame_cols)}) VALUES ({','.join('?' * len(frame_cols))})",
            [d[c] for c in frame_cols],
        )

target.commit()
target.close()

print(
    f"Inserted {len(weeks)} week(s), {len(games)} game(s), {len(frames)} frame(s)."
)
