#!/usr/bin/env python3
"""DSH (DeepSeek Harness) adapter runner for the frozen OpenCode t0-t8 suite.

This is a *new* harness surface added for a DSH-orchestration evaluation. It
does not modify any frozen artifact: the prompts, ``prompt_manifest.json``,
``ground_truth.json``, ``score.py``, and the provisioning/validation logic in
``harness_lib.py`` are reused verbatim. The original ``runner.py`` remains the
OpenCode-side runner and is untouched.

What it does, per test, mirroring ``runner.py``'s evidence contract:

* validates the isolated clone against the sanitized baseline HEAD;
* verifies the frozen prompt hash;
* runs ``dsh --profile headless`` on the frozen prompt inside the clone, with
  the DSH agent default model already configured to the local llama.cpp Qwen
  endpoint (no DSH configuration is written);
* captures the same Git state (before/after), stdout/stderr, and metrics;
* snapshots the llama.cpp ``/metrics`` counters immediately before and after
  each test so per-test throughput/MTP can be measured from counter deltas;
* locates the DSH session that ran in the clone (by realpath cwd + task text +
  run window) and records its path so ``extract_traces_dsh.py`` can convert it.

The emitted ``results.jsonl`` uses the same field names ``score.py`` reads, so
the frozen scorer runs unchanged.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402

DEFAULT_DSH_BIN = (
    "/Users/cortezashley/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh"
)
DEFAULT_DSH_HOME = str(Path.home() / ".dsh")
DEFAULT_METRICS_URL = "http://192.168.68.52:8087/metrics"
DEFAULT_MODEL_LABEL = "local-llama-cpp/qwen3.8-27b-gsq-rco"
DEFAULT_PERMISSION_MODE = "workspace-write"
DEFAULT_PATCH_NAME = "dsh-bash-timeout.patch.yml"

# Counter names whose per-test delta is reported (llama.cpp /metrics).
METRIC_COUNTERS = [
    "llamacpp:prompt_tokens_total",
    "llamacpp:prompt_tokens_cached_total",
    "llamacpp:prompt_seconds_total",
    "llamacpp:tokens_predicted_total",
    "llamacpp:tokens_predicted_seconds_total",
    "llamacpp:n_decode_total",
    "llamacpp:n_tokens_max",
    "llamacpp:spec_decode_num_drafts_total",
    "llamacpp:spec_decode_num_draft_tokens_total",
    "llamacpp:spec_decode_num_accepted_tokens_total",
    'llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="0"}',
    'llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="1"}',
    'llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position="2"}',
]
METRIC_GAUGES = [
    "llamacpp:prompt_tokens_seconds",
    "llamacpp:predicted_tokens_seconds",
]


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--workspace", required=True, type=Path)
    p.add_argument("--variant", default="dsh-unnamed")
    p.add_argument("--tests", nargs="*", type=int, default=H.DEFAULT_TESTS)
    p.add_argument("--timeout", type=int, default=2400,
                   help="per-test wall-clock timeout (seconds)")
    p.add_argument("--binary", default=DEFAULT_DSH_BIN, help="dsh bin path")
    p.add_argument("--node", default="node", help="node executable")
    p.add_argument("--dsh-home", default=DEFAULT_DSH_HOME)
    p.add_argument("--permission-mode", default=DEFAULT_PERMISSION_MODE)
    p.add_argument("--patch", type=Path, default=None,
                   help="invocation-only --patch overlay (default "
                        "<workspace>/dsh-bash-timeout.patch.yml)")
    p.add_argument("--metrics-url", default=DEFAULT_METRICS_URL)
    p.add_argument("--model-label", default=DEFAULT_MODEL_LABEL)
    p.add_argument("--api-key", default="sk-local",
                   help="dummy LOCAL_LLAMA_CPP_API_KEY (server ignores it)")
    p.add_argument("--baseline-ref", default=H.DEFAULT_BASELINE_REF)
    p.add_argument("--expected-sha", default=H.EXPECTED_BASELINE_SHA)
    p.add_argument("--deps-src", type=Path, default=None)
    p.add_argument("--no-deps", action="store_true")
    p.add_argument("--force", action="store_true")
    p.add_argument("--skip-provision", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--no-symlink-scan", action="store_true")
    return p.parse_args(argv)


def dsh_version(args) -> str:
    try:
        proc = subprocess.run([args.node, args.binary, "--version"],
                              capture_output=True, text=True, timeout=60)
        return (proc.stdout or proc.stderr).strip()
    except Exception as exc:  # pragma: no cover - defensive
        return f"unavailable: {exc}"


def ensure_patch(path: Path) -> Path:
    path = path.resolve()
    if not path.exists():
        raise H.HarnessError(f"DSH patch overlay not found: {path}")
    return path


def fetch_metrics(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            text = resp.read().decode("utf-8", "replace")
    except Exception as exc:
        return {"__error__": str(exc)}
    out = {}
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        key, _, val = line.rpartition(" ")
        try:
            out[key] = float(val)
        except ValueError:
            continue
    return out


def metrics_snapshot(url: str) -> dict:
    raw = fetch_metrics(url)
    snap = {k: raw.get(k) for k in METRIC_COUNTERS + METRIC_GAUGES}
    snap["__error__"] = raw.get("__error__")
    return snap


def build_env(args, clone: Path) -> dict:
    env = os.environ.copy()
    env["DSH_HOME"] = str(Path(args.dsh_home).expanduser())
    env["DSH_PERMISSION_MODE"] = args.permission_mode
    env["LOCAL_LLAMA_CPP_API_KEY"] = args.api_key
    env["PWD"] = str(clone)
    env["NO_COLOR"] = "1"
    tmp = clone / ".eval-tmp"
    tmp.mkdir(exist_ok=True)
    env["TMPDIR"] = str(tmp)
    env["npm_config_offline"] = "true"
    env["npm_config_audit"] = "false"
    env["npm_config_fund"] = "false"
    env["npm_config_update_notifier"] = "false"
    env["npm_config_progress"] = "false"
    return env


def _zstd_decompress(path: Path) -> str:
    proc = subprocess.run(["zstd", "-d", "-c", str(path)],
                          capture_output=True, timeout=120)
    if proc.returncode != 0:
        raise H.HarnessError(f"zstd failed for {path}: "
                             f"{proc.stderr.decode('utf-8', 'replace')[:200]}")
    return proc.stdout.decode("utf-8", "replace")


def _session_events(path: Path) -> list:
    events = []
    for line in _zstd_decompress(path).splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def _session_cwd(events: list):
    for ev in events:
        if ev.get("type") == "session":
            return ev.get("cwd")
    return None


def _has_task(events: list, task: str) -> bool:
    for ev in events:
        if ev.get("type") == "agent/inbox/spliced":
            for item in (ev.get("data", {}).get("inserted") or []):
                for block in (item.get("content") or []):
                    if block.get("type") == "text" and block.get("text") == task:
                        return True
    return False


def find_session(clone: Path, start_ms: int, end_ms: int, task: str) -> dict:
    root = Path(os.environ.get("DSH_HOME", str(Path.home() / ".dsh"))).expanduser() / "sessions"
    if not root.exists():
        return {"session_id": None, "match": "missing",
                "notes": f"no DSH sessions root at {root}"}
    clone_real = os.path.realpath(str(clone))
    candidates = []
    for sdir in sorted(root.glob("*/session-*")):
        sfile = sdir / "session.v3.jsonl.zstd"
        if not sfile.exists():
            continue
        try:
            mt = sfile.stat().st_mtime * 1000
        except OSError:
            continue
        # Cheap time filter before decompressing.
        if mt < start_ms - 120000 or mt > end_ms + 300000:
            continue
        try:
            events = _session_events(sfile)
        except Exception:
            continue
        cwd = _session_cwd(events)
        if not cwd or os.path.realpath(cwd) != clone_real:
            continue
        created_ms = None
        for ev in events:
            if ev.get("type") == "session" and isinstance(ev.get("createdAt"), (int, float)):
                created_ms = int(ev["createdAt"])
                break
        if created_ms is not None and not (start_ms - 60000 <= created_ms <= end_ms + 300000):
            continue
        candidates.append({
            "session_id": sfile.parent.name,
            "session_path": str(sfile),
            "cwd": cwd,
            "created_ms": created_ms,
            "task_match": _has_task(events, task),
        })
    if not candidates:
        return {"session_id": None, "match": "missing",
                "notes": "no DSH session matched the clone realpath in the run window"}
    exact = [c for c in candidates if c["task_match"]]
    pool = exact or candidates
    pool.sort(key=lambda c: c.get("created_ms") or 0)
    chosen = pool[-1]
    chosen["match"] = "exact" if (len(pool) == 1 and exact) else (
        "ambiguous" if len(pool) > 1 else "exact")
    chosen["candidate_count"] = len(pool)
    return chosen


def run_one(args, workspace: Path, baseline_meta: dict, prompt_report: dict,
            config_report: dict, n: int) -> dict:
    variant = args.variant
    outdir = workspace / "results" / variant
    perms_dir = outdir / "permissions"
    outdir.mkdir(parents=True, exist_ok=True)
    perms_dir.mkdir(parents=True, exist_ok=True)
    clone = (workspace / "clones" / f"t{n}").resolve()

    ok, report = H.validate_clone(clone, baseline_meta["head"],
                                  live_repo=H.REPO_ROOT, require_clean=True,
                                  scan_symlinks=not args.no_symlink_scan)
    if not ok:
        raise H.HarnessError(
            f"refusing to run t{n}: clone failed pre-run validation: {report['issues']}")

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
        "model": args.model_label,
        "timeout_s": args.timeout,
        "clone": str(clone),
        "config": None,
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
        "permission_policy": {
            "engine": "dsh",
            "permission_mode": args.permission_mode,
            "patch_overlay": str(args.patch) if args.patch else None,
        },
        "config_verification": H.config_verification_summary(config_report),
        "environment": {
            "TMPDIR": str(clone / ".eval-tmp"),
            "DSH_PERMISSION_MODE": args.permission_mode,
            "DSH_HOME": str(Path(args.dsh_home).expanduser()),
            "npm_config_offline": "true",
        },
        "clone_validation": report,
        "git_before": H.git_state(clone, baseline_sha),
        "metrics_before": metrics_snapshot(args.metrics_url),
    }

    if args.dry_run:
        rec.update({"rc": None, "timed_out": False, "duration_s": 0.0,
                    "stdout_bytes": 0, "stderr_bytes": 0})
        out = err = ""
    else:
        cmd = [args.node, args.binary, "--profile", "headless"]
        if args.patch:
            cmd += ["--patch", str(args.patch)]
        cmd.append(prompt)
        env = build_env(args, clone)
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

    rec["metrics_after"] = metrics_snapshot(args.metrics_url)
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

    session = find_session(clone, start_ms, end_ms, prompt)
    rec["session"] = session
    sid = session.get("session_id")
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

    commits = len(rec["git_after"].get("commits_since_baseline", []))
    print(f"[{ended_iso}] {variant} t{n} rc={rec['rc']} timed_out={rec['timed_out']} "
          f"dur={rec['duration_s']}s session={sid} match={session.get('match')} "
          f"commits={commits} clean={rec['git_after']['clean']}", flush=True)
    return rec


def main(argv=None) -> int:
    args = parse_args(argv)
    workspace = args.workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    if args.patch is None:
        args.patch = workspace / DEFAULT_PATCH_NAME
    args.patch = ensure_patch(args.patch)

    prompt_report = H.verify_prompt_set()
    H.write_json(workspace / "prompt.verification.json", prompt_report)
    if not prompt_report["ok"]:
        print("FATAL: prompt manifest verification failed; refusing to run:", file=sys.stderr)
        for issue in prompt_report["issues"]:
            print(f"  - {issue}", file=sys.stderr)
        return 2

    # DSH is not OpenCode: no opencode.*eval*.jsonc is used. We still record an
    # explicit, verified invocation policy so the run documents itself.
    version = dsh_version(args)
    config_report = {
        "engine": "dsh",
        "ok": True,
        "dsh_version": version,
        "dsh_bin": args.binary,
        "profile": "headless",
        "patch_overlay": str(args.patch),
        "patch_sha256": H.sha256_file(args.patch),
        "permission_mode": args.permission_mode,
        "model_label": args.model_label,
        "metrics_url": args.metrics_url,
        "note": ("DSH uses ~/.dsh/settings.yaml (unmodified) for its provider/model; "
                 "no per-run DSH config is written. The --patch overlay is "
                 "invocation-only and raises the bash-sandbox per-command timeout."),
    }
    H.write_json(workspace / "config.verification.json", config_report)

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
        reports = {}
        for n in args.tests:
            clone = (workspace / "clones" / f"t{n}").resolve()
            ok, report = H.validate_clone(clone, baseline_meta["head"],
                                          live_repo=H.REPO_ROOT, require_clean=True,
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
                           expected_sha=baseline_meta["head"], live_repo=H.REPO_ROOT,
                           scan_symlinks=not args.no_symlink_scan)

    H.write_json(workspace / "manifest.json", {
        "engine": "dsh",
        "variant": args.variant,
        "model": args.model_label,
        "dsh_version": version,
        "dsh_bin": args.binary,
        "dsh_home": str(Path(args.dsh_home).expanduser()),
        "profile": "headless",
        "permission_mode": args.permission_mode,
        "patch_overlay": str(args.patch),
        "patch_sha256": H.sha256_file(args.patch),
        "metrics_url": args.metrics_url,
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
        "config_verification": config_report,
        "temporary_directory_policy": "TMPDIR=<clone>/.eval-tmp (git-excluded)",
        "network_policy": "npm_config_offline=true; no OpenCode config used",
    })

    failures = 0
    for n in args.tests:
        try:
            run_one(args, workspace, baseline_meta, prompt_report, config_report, n)
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
