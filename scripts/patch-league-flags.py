#!/usr/bin/env python3
"""Patch league flags in a phase-6 Bowling Journal export.

Usage:
  python3 scripts/patch-league-flags.py <source.db> <target.pinpal>

  source.db     — original 3-10.db (or any working Bowling Journal SQLite)
  target.pinpal — phase-6 export from the Expo app (modified in place)
"""
import sqlite3
import sys

if len(sys.argv) != 3:
    print(__doc__)
    sys.exit(1)

source_path, target_path = sys.argv[1], sys.argv[2]

# Read flags from source
source = sqlite3.connect(source_path)
rows = source.execute(
    "SELECT name, flags FROM league WHERE flags IS NOT NULL AND flags != 0"
).fetchall()
source.close()

if not rows:
    print("No non-zero flags found in source — nothing to patch.")
    sys.exit(0)

# Patch target in place
target = sqlite3.connect(target_path)
count = 0
for name, flags in rows:
    cur = target.execute("UPDATE league SET flags = ? WHERE name = ?", (flags, name))
    count += cur.rowcount
target.commit()
target.close()

print(f"Patched {count} of {len(rows)} league(s).")
