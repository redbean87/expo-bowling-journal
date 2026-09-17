#!/usr/bin/env python3
"""Hardened serial runner for the OpenCode t0-t8 model-reliability suite.

Compared with the historical runner this one:

* creates (or validates) the sanitized clean baseline and per-test clones
  instead of assuming manually prepared clones exist;
* aborts if a clone's HEAD is not the expected baseline or if it is dirty;
* verifies prompt SHA-256 against prompt_manifest.json before running and
  records the hashes in the run artifacts;
* captures complete Git state (untracked nested files, ignored files, staged and
  unstaged diffs, final HEAD, and commits created during the run);
* matches the session by exact realpath working directory (no recency fallback);
* captures permission-rejection evidence and the raw permission log slice;
* redirects temporary files into a controlled repository-local directory and
  exports an explicit, uniform permission/network policy.

It never treats a zero process exit code as proof of task success -- that is
score.py's job, against machine-readable ground truth.

Usage:
    python3 runner.py --workspace WS --variant devstral --model ollama/devstral-small-2:24b \
        --config ~/.config/opencode/opencode.devstral-eval-16k.jsonc --tests 0 1 2
    python3 runner.py --workspace WS --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402

DEFAULT_BINARY = "/Users/cortezashley/.local/opencode-patched/bin/opencode"


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", required=True, type=Path)
    p.add_argument("--variant", default="unnamed",
                   help="artifact/label name for this model variant")
    p.add_argument("--model", default=None, help="model id passed to `opencode run -m`")
    p.add_argument("--config", default=None, help="OPENCODE_CONFIG to use")
    p.add_argument("--binary", default=DEFAULT_BINARY)
    p.add_argument("--timeout", type=int, default=2400, help="per-test timeout in seconds")
    p.add_argument("--tests", nargs="*", type=int, default=H.DEFAULT_TESTS)
    p.add_argument("--baseline-ref", default=H.DEFAULT_BASELINE_REF)
    p.add_argument("--expected-sha", default=H.EXPECTED_BASELINE_SHA)
    p.add_argument("--deps-src", type=Path, default=None)
    p.add_argument("--no-deps", action="store_true")
    p.add_argument("--force", action="store_true", help="rebuild baseline and clones")
    p.add_argument("--skip-provision", action="store_true",
                   help="reuse existing clones but still validate them")
    p.add_argument("--dry-run", action="store_true",
                   help="provision, verify prompts, and validate clones without invoking the model")
    p.add_argument("--no-symlink-scan", action="store_true")
    return p.parse_args(argv)


def build_env(clone: Path, config: str | None) -> dict:
    env = os.environ.copy()
    if config:
        env["OPENCODE_CONFIG"] = str(config)
    env["PWD"] = str(clone)
    # Controlled temporary-directory policy: OpenCode and its tools write
    # temporary files into a repository-local, git-excluded directory instead of
    # an ambiguous external /tmp, so temp writes cannot create false dirty-tree
    # results or vary between command shapes.
    tmp = clone / ".eval-tmp"
    tmp.mkdir(exist_ok=True)
    env["TMPDIR"] = str(tmp)
    # Uniform offline package policy: network package installs fail
    # deterministically rather than varying run to run.
    env["npm_config_offline"] = "true"
    env["npm_config_audit"] = "false"
    env["npm_config_fund"] = "false"
    env["npm_config_update_notifier"] = "false"
    env["npm_config_progress"] = "false"
    return env


def run_one(args, workspace: Path, baseline_meta: dict, prompt_report: dict, n: int) -> dict:
    variant = args.variant
    outdir = workspace / "results" / variant
    perms_dir = outdir / "permissions"
    outdir.mkdir(parents=True, exist_ok=True)
    perms_dir.mkdir(parents=True, exist_ok=True)
    clone = (workspace / "clones" / f"t{n}").resolve()

    ok, report = H.validate_clone(clone, baseline_meta["head"],
                                  live_repo=args.repo_root,
                                  require_clean=True,
                                  scan_symlinks=not args.no_symlink_scan)
    if not ok:
        raise H.HarnessError(f"refusing to run t{n}: clone failed pre-run validation: {report['issues']}")

    prompt_path = H.PROMPTS_DIR / f"t{n}.txt"
    prompt_bytes = prompt_path.read_bytes()
    prompt = prompt_bytes.decode("utf-8")

    baseline_sha = baseline_meta["head"]
    started_iso = H.now_iso()
    start = time.time()
    start_ms = int(start * 1000)

    rec = {
        "variant": variant,
        "test": n,
        "model": args.model,
        "timeout_s": args.timeout,
        "clone": str(clone),
        "config": str(args.config) if args.config else None,
        "binary": args.binary,
        "dry_run": bool(args.dry_run),
        "started": started_iso,
        "baseline": {
            "ref": args.baseline_ref,
            "head": baseline_sha,
            "tree": baseline_meta.get("tree"),
            "excluded_path": baseline_meta.get("exclude_path"),
        },
        "prompt": {
            "file": f"t{n}.txt",
            "sha256": H.sha256_bytes(prompt_bytes),
            "bytes": len(prompt_bytes),
            "verified": prompt_report["prompts"][str(n)]["match"],
            "expected_sha256": prompt_report["prompts"][str(n)]["expected_sha256"],
        },
        "permission_policy": dict(H.CANONICAL_PERMISSIONS),
        "environment": {
            "TMPDIR": str(clone / ".eval-tmp"),
            "npm_config_offline": "true",
        },
        "clone_validation": report,
        "git_before": H.git_state(clone, baseline_sha),
    }

    if args.dry_run:
        rec.update({"rc": None, "timed_out": False, "duration_s": 0.0,
                    "stdout_bytes": 0, "stderr_bytes": 0})
        out = err = ""
    else:
        cmd = [args.binary, "run"]
        if args.model:
            cmd += ["-m", args.model]
        cmd.append(prompt)
        env = build_env(clone, args.config)
        try:
            proc = subprocess.run(cmd, cwd=str(clone), env=env, capture_output=True,
                                  text=True, timeout=args.timeout)
            rec["rc"] = proc.returncode
            rec["timed_out"] = False
            out, err = proc.stdout, proc.stderr
        except subprocess.TimeoutExpired as exc:
            rec["rc"] = None
            rec["timed_out"] = True
            out = exc.stdout or ""
            err = exc.stderr or ""
            if isinstance(out, bytes):
                out = out.decode("utf-8", "replace")
            if isinstance(err, bytes):
                err = err.decode("utf-8", "replace")
        rec["duration_s"] = round(time.time() - start, 1)

    ended_iso = H.now_iso()
    end_ms = int(time.time() * 1000)

    (outdir / f"t{n}.out").write_text(out)
    (outdir / f"t{n}.err").write_text(err)
    (outdir / f"t{n}.log").write_text(out + "\n===STDERR===\n" + err)
    rec["stdout_tail"] = out[-600:]
    rec["stderr_tail"] = err[-400:]
    rec["stdout_bytes"] = len(out)
    rec["stderr_bytes"] = len(err)
    rec["ended"] = ended_iso

    rec["git_after"] = H.git_state(clone, baseline_sha)

    session = H.session_report(start_ms, clone, end_ms)
    rec["session"] = session
    sid = session.get("session_id")
    rec["permission_evidence"] = {
        "session_db_rejections": H.session_permission_rejections(sid) if sid else [],
        "session_db_limitations": [
            "Permission requests/replies are not persisted as session parts; only the "
            "resulting tool-call error is stored.",
        ],
        "raw_log": {},
    }
    log_slice = H.read_permission_log(started_iso, ended_iso)
    rec["permission_evidence"]["raw_log"] = {
        "available": log_slice["available"],
        "event_count": len(log_slice["events"]),
        "events": log_slice["events"],
        "limitations": log_slice["limitations"],
    }
    (perms_dir / f"t{n}.permission.log").write_text(
        "\n".join(log_slice["raw_lines"]) + ("\n" if log_slice["raw_lines"] else ""))
    H.write_json(perms_dir / f"t{n}.permission.json", log_slice)

    if not sid and not args.dry_run:
        rec["trace_status"] = "missing"
    elif session.get("match") == "ambiguous":
        rec["trace_status"] = "partial"
    else:
        rec["trace_status"] = "available" if sid else "not-applicable"

    with open(outdir / "results.jsonl", "a") as fh:
        fh.write(json.dumps(rec) + "\n")
    H.write_json(workspace / "status.json",
                 {"variant": variant, "last": f"t{n}", "ts": ended_iso,
                  "ok": not rec["timed_out"]})

    print(f"[{ended_iso}] {variant} t{n} rc={rec['rc']} timed_out={rec['timed_out']} "
          f"dur={rec['duration_s']}s session={sid} match={session.get('match')} "
          f"commits={len(rec['git_after'].get('commits_since_baseline', []))} "
          f"clean={rec['git_after']['clean']} rejections="
          f"{sum(1 for r in rec['permission_evidence']['session_db_rejections'] if r['permission_rejection'])}",
          flush=True)
    return rec


def main(argv=None) -> int:
    args = parse_args(argv)
    args.repo_root = H.REPO_ROOT
    workspace = args.workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    # 1. Prompt integrity is mandatory and aborts on any mismatch.
    prompt_report = H.verify_prompt_set()
    H.write_json(workspace / "prompt.verification.json", prompt_report)
    if not prompt_report["ok"]:
        print("FATAL: prompt manifest verification failed; refusing to run:", file=sys.stderr)
        for issue in prompt_report["issues"]:
            print(f"  - {issue}", file=sys.stderr)
        return 2

    # 2. Provision (or validate) the clean baseline and isolated clones.
    if args.skip_provision:
        meta_path = workspace / "baseline.meta.json"
        if not meta_path.exists():
            print(f"FATAL: --skip-provision set but {meta_path} is missing", file=sys.stderr)
            return 2
        baseline_meta = json.loads(meta_path.read_text())
        if args.expected_sha and baseline_meta["head"] != args.expected_sha:
            print(f"FATAL: baseline HEAD {baseline_meta['head']} != expected "
                  f"{args.expected_sha}", file=sys.stderr)
            return 2
        # Validate existing clones in place; do not recreate them.
        reports = {}
        for n in args.tests:
            clone = (workspace / "clones" / f"t{n}").resolve()
            ok, report = H.validate_clone(clone, baseline_meta["head"],
                                          live_repo=args.repo_root, require_clean=True,
                                          scan_symlinks=not args.no_symlink_scan)
            reports[str(n)] = report
            if not ok:
                print(f"FATAL: existing clone t{n} failed validation: {report['issues']}",
                      file=sys.stderr)
                return 2
        H.write_json(workspace / "clones.validation.json", reports)
    else:
        baseline_meta = H.provision_baseline(
            workspace=workspace, baseline_ref=args.baseline_ref,
            expected_sha=args.expected_sha or None,
            copy_deps=not args.no_deps, deps_src=args.deps_src, force=args.force,
            scan_symlinks=not args.no_symlink_scan)
        H.provision_clones(workspace=workspace, tests=args.tests,
                           expected_sha=baseline_meta["head"], live_repo=args.repo_root,
                           scan_symlinks=not args.no_symlink_scan)

    H.write_json(workspace / "manifest.json", {
        "variant": args.variant,
        "model": args.model,
        "binary": args.binary,
        "config": str(args.config) if args.config else None,
        "tests": args.tests,
        "timeout_s": args.timeout,
        "dry_run": bool(args.dry_run),
        "started": H.now_iso(),
        "baseline": baseline_meta,
        "prompt_verification": {
            "ok": prompt_report["ok"],
            "manifest": prompt_report["manifest"],
            "prompts": {k: {"file": v["file"], "sha256": v["sha256"],
                            "expected_sha256": v["expected_sha256"], "match": v["match"]}
                        for k, v in prompt_report["prompts"].items()},
        },
        "permission_policy": dict(H.CANONICAL_PERMISSIONS),
        "temporary_directory_policy": "TMPDIR=<clone>/.eval-tmp (git-excluded)",
        "network_policy": "webfetch/websearch denied; npm_config_offline=true",
    })

    failures = 0
    for n in args.tests:
        try:
            run_one(args, workspace, baseline_meta, prompt_report, n)
        except H.HarnessError as exc:
            print(f"FATAL: {exc}", file=sys.stderr)
            failures += 1
            break
        except Exception as exc:  # pragma: no cover - defensive
            with open(workspace / "results" / args.variant / "results.jsonl", "a") as fh:
                fh.write(json.dumps({"variant": args.variant, "test": n,
                                     "runner_error": str(exc)}) + "\n")
            print(f"RUNNER_ERROR t{n}: {exc}", file=sys.stderr)
            failures += 1

    print("ALL DONE" if not failures else f"STOPPED after {failures} failure(s)", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
