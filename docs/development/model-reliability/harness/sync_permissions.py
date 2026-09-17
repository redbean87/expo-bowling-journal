#!/usr/bin/env python3
"""Apply the single, uniform evaluation permission policy to OpenCode eval configs.

Every ``opencode.*-eval.jsonc`` file receives the same explicit ``permission``
block (see ``opencode-eval-permissions.json``), so the benchmark policy is a
declared constant rather than an accident of command-shape-dependent scanning.

The config files live outside the repository (``~/.config/opencode``); this
script does not modify the application baseline.

Usage:
    python3 sync_permissions.py --check          # verify, do not write
    python3 sync_permissions.py                  # apply
    python3 sync_permissions.py --dir DIR --dry-run
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402

DEFAULT_CONFIG_DIR = Path("~/.config/opencode").expanduser()


def strip_jsonc(text: str) -> str:
    # Remove // and /* */ comments that are not inside strings.
    return H.strip_jsonc(text)


def load_config(path: Path) -> dict:
    return H.load_jsonc_config(path)


def desired_permission(existing: dict) -> dict:
    merged = dict(existing or {})
    merged.update(H.CANONICAL_PERMISSIONS)
    return merged


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", type=Path, default=DEFAULT_CONFIG_DIR)
    p.add_argument("--glob", default=H.DEFAULT_EVAL_CONFIG_GLOB)
    p.add_argument("--check", action="store_true", help="report drift without writing")
    p.add_argument("--dry-run", action="store_true", help="show planned changes without writing")
    args = p.parse_args(argv)

    files = sorted(args.dir.glob(args.glob))
    if not files:
        print(f"no files matching {args.glob} under {args.dir}", file=sys.stderr)
        return 2

    drift = 0
    for path in files:
        try:
            cfg = load_config(path)
        except Exception as exc:
            print(f"{path}: cannot parse ({exc})", file=sys.stderr)
            drift += 1
            continue
        current = cfg.get("permission") or {}
        desired = desired_permission(current)
        changed = current != desired
        if changed:
            drift += 1
        status = "DRIFT" if changed else "ok"
        print(f"{path}: {status}")
        if changed and not args.check:
            if args.dry_run:
                print(f"  would set permission={json.dumps(desired)}")
            else:
                cfg["permission"] = desired
                path.write_text(json.dumps(cfg, indent=2) + "\n")
                print(f"  applied permission={json.dumps(desired)}")

    if args.check and drift:
        print(f"{drift} file(s) drifted from the canonical policy", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
