#!/usr/bin/env python3
"""Provision the sanitized clean baseline and isolated per-test clones.

This is the mandatory preparation step for the model-reliability harness. It:

* builds the evaluated repository from a ``git archive`` export of the
  pre-evaluation ref (never ``git clone --local``);
* excludes ``docs/development/model-reliability/`` (reports, prompts, harness)
  from the evaluated content;
* creates a fresh directory and a fresh single-commit Git repository;
* copies dependencies as a real tree (never symlinks ``node_modules``);
* verifies the resulting HEAD, refs, and clean working tree before any test.

Usage:
    python3 prepare_baseline.py --workspace /path/to/eval-workspace
    python3 prepare_baseline.py --workspace WS --no-deps --tests 0 1
    python3 prepare_baseline.py --workspace WS --force --verify-only
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", required=True, type=Path,
                   help="evaluation workspace (baseline/ and clones/ live here)")
    p.add_argument("--repo", type=Path, default=H.REPO_ROOT,
                   help="source repository to export the baseline from")
    p.add_argument("--baseline-ref", default=H.DEFAULT_BASELINE_REF,
                   help="git ref to export (default: sanitized pre-evaluation ref)")
    p.add_argument("--expected-sha", default=H.EXPECTED_BASELINE_SHA,
                   help="expected baseline HEAD; empty string disables the check")
    p.add_argument("--commit-date", default=H.BASELINE_COMMIT_DATE)
    p.add_argument("--exclude-path", default=H.EVAL_EXCLUDE_PATH)
    p.add_argument("--tests", nargs="*", type=int, default=H.DEFAULT_TESTS)
    p.add_argument("--deps-src", type=Path, default=None,
                   help="dependency directory to copy (default: <repo>/node_modules)")
    p.add_argument("--no-deps", action="store_true",
                   help="do not copy node_modules into the baseline")
    p.add_argument("--force", action="store_true",
                   help="rebuild the baseline and clones even if they exist")
    p.add_argument("--verify-only", action="store_true",
                   help="do not provision; only validate existing baseline/clones")
    p.add_argument("--no-symlink-scan", action="store_true",
                   help="skip the (slower) symlink-escape scan of clones")
    p.add_argument("--json", action="store_true", help="print a JSON summary")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    workspace = args.workspace.resolve()
    summary = {"workspace": str(workspace), "steps": [], "ok": False}

    if not args.verify_only:
        meta = H.provision_baseline(
            workspace=workspace,
            repo=args.repo,
            baseline_ref=args.baseline_ref,
            commit_date=args.commit_date,
            expected_sha=args.expected_sha or None,
            copy_deps=not args.no_deps,
            deps_src=args.deps_src,
            force=args.force,
            exclude_path=args.exclude_path,
        )
        summary["baseline"] = meta
        summary["steps"].append("provisioned baseline")
    else:
        meta_path = workspace / "baseline.meta.json"
        if not meta_path.exists():
            print(f"error: {meta_path} not found; nothing to verify", file=sys.stderr)
            return 2
        summary["baseline"] = json.loads(meta_path.read_text())

    expected_sha = args.expected_sha or summary["baseline"].get("head")

    # Verify the excluded eval directory is truly absent from the baseline.
    excluded = workspace / "baseline" / args.exclude_path
    summary["excluded_absent"] = not excluded.exists()
    if excluded.exists():
        print(f"error: eval path still present in baseline: {excluded}", file=sys.stderr)
        return 2

    clones = H.provision_clones(
        workspace=workspace,
        tests=args.tests,
        expected_sha=expected_sha,
        live_repo=args.repo.resolve(),
        scan_symlinks=not args.no_symlink_scan,
    )
    summary["clones"] = clones
    summary["steps"].append("provisioned and validated clones")
    summary["ok"] = all(c["ok"] for c in clones.values()) and summary["excluded_absent"]

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(f"baseline HEAD: {summary['baseline'].get('head')}")
        print(f"excluded path absent: {summary['excluded_absent']}")
        print(f"clones: {', '.join(sorted(clones, key=int)) or '(none)'}")
        for n, report in sorted(clones.items(), key=lambda kv: int(kv[0])):
            status = "ok" if report["ok"] else "FAILED"
            print(f"  t{n}: {status} refs={report.get('refs')} clean="
                  f"{not report.get('tracked_modifications') and not report.get('untracked_files')}")
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
