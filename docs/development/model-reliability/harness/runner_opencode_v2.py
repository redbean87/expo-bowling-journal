#!/usr/bin/env python3
"""OpenCode v2 adapter runner for the frozen OpenCode t0-t8 suite.

Reuses the frozen artifacts verbatim (prompts, prompt_manifest.json,
ground_truth.json, score.py, provisioning/validation in harness_lib.py).
Differs from runner.py (OpenCode 1.18.30) only where v2 requires it:

* config schema: v2-native ``permissions`` list + ``mcp.servers.<name>.disabled``
  (v1 ``permission`` dict is rejected by NEITHER engine here; v2 merges both,
  but this adapter validates the v2-native form actually honored by v2).
* invocation: ``opencode run --format json`` so the event stream (sessionID,
  text/tool parts) is captured deterministically; v2 service-backed ``run``
  does NOT persist sessions to ``~/.local/share/opencode/opencode.db``
  (verified 2026-09-28), so session metadata comes from
  ``opencode session export <id>`` instead of the shared DB.
* trace parts are written directly to ``raw_parts.jsonl`` in the v1 part shape
  (``{type: text|tool|reasoning, ...}``) so the frozen ``score.py`` runs
  unchanged. Tool names are recorded verbatim (v2 uses ``shell``, not ``bash``);
  score.py command detectors are tool-name agnostic.

Usage:
    python3 runner_opencode_v2.py --workspace WS --variant v2-deepseek \
        --model opencode-go/deepseek-v4.1-flash \
        --config ~/.config/opencode/opencode.deepseek-v41-flash-eval.jsonc \
        --tests 0 6 8
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

DEFAULT_BINARY = "/opt/homebrew/bin/opencode"

REQUIRED_DENY_ACTIONS = ("external_directory", "webfetch", "websearch")


def validate_v2_config(path: Path) -> dict:
    """Validate a v2-native evaluation config (never rewritten)."""
    p = Path(path).expanduser()
    report = {
        "path": str(p),
        "exists": p.exists(),
        "parse_ok": False,
        "sha256": None,
        "bytes": None,
        "engine": "opencode-v2",
        "permission_list": None,
        "permission_violations": [],
        "mcp": {},
        "mcp_violations": [],
        "issues": [],
        "ok": False,
    }
    if not p.exists():
        report["issues"].append(f"config file not found: {p}")
        return report
    raw = p.read_bytes()
    report["sha256"] = H.sha256_bytes(raw)
    report["bytes"] = len(raw)
    try:
        cfg = H.load_jsonc_config(p)
    except Exception as exc:
        report["issues"].append(f"config parse failed: {exc}")
        return report
    if not isinstance(cfg, dict):
        report["issues"].append("config root is not a JSON object")
        return report
    report["parse_ok"] = True

    perms = cfg.get("permissions")
    report["permission_list"] = perms
    if not isinstance(perms, list):
        report["issues"].append("missing or invalid 'permissions' list (v2-native)")
    else:
        deny = {(r.get("action"), r.get("effect")) for r in perms
                if isinstance(r, dict)}
        for action in REQUIRED_DENY_ACTIONS:
            if (action, "deny") not in deny:
                msg = f"permissions: missing deny rule for {action!r}"
                report["permission_violations"].append(msg)
                report["issues"].append(msg)

    mcp = cfg.get("mcp") if isinstance(cfg.get("mcp"), dict) else {}
    servers = mcp.get("servers") if isinstance(mcp.get("servers"), dict) else {}
    for name in H.REQUIRED_DISABLED_MCPS:
        entry = servers.get(name) if isinstance(servers.get(name), dict) else {}
        disabled = entry.get("disabled") if isinstance(entry, dict) else None
        report["mcp"][name] = {"present": name in servers, "disabled": disabled}
        if disabled is not True:
            msg = (f"required MCP '{name}' is not disabled "
                   f"(mcp.servers.{name}.disabled={disabled!r}; expected true)")
            report["mcp_violations"].append(msg)
            report["issues"].append(msg)

    report["ok"] = not report["issues"]
    return report


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", required=True, type=Path)
    p.add_argument("--variant", default="opencode-v2")
    p.add_argument("--model", default="opencode-go/deepseek-v4.1-flash")
    p.add_argument("--config", default=None)
    p.add_argument("--binary", default=DEFAULT_BINARY)
    p.add_argument("--timeout", type=int, default=2400)
    p.add_argument("--tests", nargs="*", type=int, default=H.DEFAULT_TESTS)
    p.add_argument("--baseline-ref", default=H.DEFAULT_BASELINE_REF)
    p.add_argument("--expected-sha", default=H.EXPECTED_BASELINE_SHA)
    p.add_argument("--deps-src", type=Path, default=None)
    p.add_argument("--no-deps", action="store_true")
    p.add_argument("--force", action="store_true")
    p.add_argument("--skip-provision", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--no-symlink-scan", action="store_true")
    return p.parse_args(argv)


def build_env(clone: Path, config: str | None) -> dict:
    env = os.environ.copy()
    if config:
        env["OPENCODE_CONFIG"] = str(config)
    env["PWD"] = str(clone)
    tmp = clone / ".eval-tmp"
    tmp.mkdir(exist_ok=True)
    env["TMPDIR"] = str(tmp)
    env["npm_config_offline"] = "true"
    env["npm_config_audit"] = "false"
    env["npm_config_fund"] = "false"
    env["npm_config_update_notifier"] = "false"
    env["npm_config_progress"] = "false"
    return env


def events_to_parts(events: list) -> tuple[list, str | None]:
    """Convert v2 --format json events to v1-shaped parts + session id."""
    parts = []
    sid = None
    for ev in events:
        if not isinstance(ev, dict):
            continue
        if ev.get("sessionID") and not sid:
            sid = ev["sessionID"]
        p = ev.get("part")
        if not isinstance(p, dict):
            continue
        t = p.get("type")
        if t == "text":
            parts.append({"type": "text", "text": p.get("text", "")})
        elif t == "reasoning":
            parts.append({"type": "reasoning", "text": p.get("text", "")})
        elif t == "tool":
            st = p.get("state") or {}
            parts.append({
                "type": "tool",
                "tool": p.get("tool"),
                "callID": p.get("id"),
                "state": {
                    "status": st.get("status"),
                    "input": st.get("input"),
                    "output": st.get("output"),
                    "error": st.get("error"),
                },
            })
    return parts, sid


def session_export(binary: str, env: dict, session_id: str) -> dict:
    try:
        proc = subprocess.run([binary, "session", "export", session_id],
                              capture_output=True, text=True, timeout=120, env=env)
        if proc.returncode != 0:
            return {"available": False,
                    "error": (proc.stderr or proc.stdout).strip()[:300]}
        return {"available": True, "export": json.loads(proc.stdout)}
    except Exception as exc:
        return {"available": False, "error": str(exc)[:300]}


def run_one(args, workspace: Path, baseline_meta: dict, prompt_report: dict,
            config_report: dict, n: int) -> dict:
    variant = args.variant
    outdir = workspace / "results" / variant
    outdir.mkdir(parents=True, exist_ok=True)
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

    rec = {
        "variant": variant,
        "test": n,
        "model": args.model,
        "engine": "opencode-v2",
        "binary": args.binary,
        "timeout_s": args.timeout,
        "clone": str(clone),
        "config": str(args.config) if args.config else None,
        "dry_run": bool(args.dry_run),
        "started": started_iso,
        "baseline": {"ref": args.baseline_ref, "head": baseline_sha,
                     "tree": baseline_meta.get("tree"),
                     "excluded_path": baseline_meta.get("exclude_path")},
        "prompt": {"file": f"t{n}.txt",
                   "sha256": H.sha256_bytes(prompt_bytes),
                   "bytes": len(prompt_bytes),
                   "verified": prompt_report["prompts"][str(n)]["match"],
                   "expected_sha256": prompt_report["prompts"][str(n)]["expected_sha256"]},
        "permission_policy": {"engine": "opencode-v2",
                              "permissions": config_report.get("permission_list")},
        "config_verification": {k: config_report.get(k) for k in
                                ("path", "sha256", "ok", "permission_violations",
                                 "mcp", "mcp_violations", "issues")},
        "environment": {"TMPDIR": str(clone / ".eval-tmp"),
                        "npm_config_offline": "true"},
        "clone_validation": report,
        "git_before": H.git_state(clone, baseline_sha),
    }

    events: list = []
    out = err = ""
    if args.dry_run:
        rec.update({"rc": None, "timed_out": False, "duration_s": 0.0,
                    "stdout_bytes": 0, "stderr_bytes": 0})
    else:
        cmd = [args.binary, "run", "--format", "json", "-m", args.model, prompt]
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
        for line in out.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    parts, sid = events_to_parts(events)
    rec["session"] = {"session_id": sid,
                      "match": "exact" if sid else "missing",
                      "source": "v2 --format json event stream",
                      "notes": [] if sid else ["no sessionID in v2 event stream"]}
    rec["trace_status"] = "available" if sid else ("not-applicable" if args.dry_run else "missing")

    # Human-readable stdout: v2 --format json emits JSONL, not prose.
    # Reconstruct prose text for tN.out so text_regex detectors and human
    # review see assistant text; raw events stay in v2_events.jsonl.
    prose = "\n".join(p.get("text", "") for p in parts if p.get("type") == "text")
    (outdir / f"t{n}.out").write_text(prose)
    (outdir / f"t{n}.err").write_text(err)
    (outdir / f"t{n}.log").write_text(prose + "\n===STDERR===\n" + err)
    (outdir / f"t{n}.v2_events.jsonl").write_text(
        "\n".join(json.dumps(e) for e in events) + ("\n" if events else ""))
    rec["stdout_tail"] = prose[-600:]
    rec["stderr_tail"] = err[-400:]
    rec["stdout_bytes"] = len(prose)
    rec["stderr_bytes"] = len(err)
    rec["ended"] = H.now_iso()
    rec["git_after"] = H.git_state(clone, baseline_sha)

    with open(outdir / "raw_parts.jsonl", "a") as fh:
        for p in parts:
            fh.write(json.dumps({"test": n, "session_id": sid, "part": p}) + "\n")

    env = build_env(clone, args.config)
    rec["session_export"] = session_export(args.binary, env, sid) if sid else {"available": False}
    if rec["session_export"].get("available"):
        exp = rec["session_export"]["export"]
        info = exp.get("info", {}) if isinstance(exp, dict) else {}
        rec["session"]["session_provider"] = ((info.get("model") or {}).get("providerID")
                                              if isinstance(info.get("model"), dict) else None)
        rec["session"]["session_model"] = ((info.get("model") or {}).get("id")
                                           if isinstance(info.get("model"), dict) else None)
        rec["session"]["tokens_in_out_reason"] = [
            (info.get("tokens") or {}).get("input"),
            (info.get("tokens") or {}).get("output"),
            (info.get("tokens") or {}).get("reasoning")]

    denials = [p for p in parts if p.get("type") == "tool"
               and (p.get("state") or {}).get("status") == "error"
               and H.is_permission_denial((p.get("state") or {}).get("error"))]
    rec["permission_evidence"] = {
        "event_stream_rejections": [
            {"tool": p.get("tool"), "callID": p.get("callID"),
             "input": (p.get("state") or {}).get("input"),
             "error": str((p.get("state") or {}).get("error"))} for p in denials],
        "limitations": [
            "v2 service-backed `run` does not persist sessions to "
            "~/.local/share/opencode/opencode.db; session metadata comes from "
            "`session export` via the service API.",
            "opencode.log permission lines are process-global and unattributed; "
            "not sliced per test by this adapter.",
        ],
    }

    with open(outdir / "results.jsonl", "a") as fh:
        fh.write(json.dumps(rec) + "\n")

    print(f"[{rec['ended']}] {variant} t{n} rc={rec['rc']} timed_out={rec['timed_out']} "
          f"dur={rec['duration_s']}s session={sid} "
          f"commits={len(rec['git_after'].get('commits_since_baseline', []))} "
          f"clean={rec['git_after']['clean']} rejections={len(denials)}",
          flush=True)
    return rec


def main(argv=None) -> int:
    args = parse_args(argv)
    args.repo_root = H.REPO_ROOT
    workspace = args.workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    prompt_report = H.verify_prompt_set()
    H.write_json(workspace / "prompt.verification.json", prompt_report)
    if not prompt_report["ok"]:
        print("FATAL: prompt manifest verification failed", file=sys.stderr)
        return 2

    if args.config:
        config_report = validate_v2_config(args.config)
    elif args.dry_run:
        config_report = {"path": None, "ok": None, "permission_list": None,
                         "permission_violations": [], "mcp": {}, "mcp_violations": [],
                         "issues": []}
    else:
        config_report = {"path": None, "ok": False, "permission_list": None,
                         "permission_violations": [], "mcp": {}, "mcp_violations": [],
                         "issues": ["--config is required"]}
    H.write_json(workspace / "config.verification.json", config_report)
    if config_report.get("ok") is False:
        print("FATAL: v2 config verification failed:", file=sys.stderr)
        for issue in config_report.get("issues", []):
            print(f"  - {issue}", file=sys.stderr)
        return 2

    try:
        ver = subprocess.run([args.binary, "--version"], capture_output=True,
                             text=True, timeout=60)
        engine_version = (ver.stdout or ver.stderr).strip()
    except Exception as exc:
        engine_version = f"unavailable: {exc}"

    if args.skip_provision:
        meta_path = workspace / "baseline.meta.json"
        if not meta_path.exists():
            print(f"FATAL: --skip-provision set but {meta_path} is missing", file=sys.stderr)
            return 2
        baseline_meta = json.loads(meta_path.read_text())
        if args.expected_sha and baseline_meta["head"] != args.expected_sha:
            print("FATAL: baseline HEAD mismatch", file=sys.stderr)
            return 2
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
        "engine": "opencode-v2",
        "variant": args.variant,
        "model": args.model,
        "engine_version": engine_version,
        "binary": args.binary,
        "config": str(args.config) if args.config else None,
        "tests": args.tests,
        "timeout_s": args.timeout,
        "dry_run": bool(args.dry_run),
        "started": H.now_iso(),
        "baseline": baseline_meta,
        "config_verification": config_report,
        "temporary_directory_policy": "TMPDIR=<clone>/.eval-tmp (git-excluded)",
        "network_policy": "webfetch/websearch denied; npm_config_offline=true",
        "mcp_policy": "required disabled: " + ", ".join(H.REQUIRED_DISABLED_MCPS),
        "session_source": "v2 --format json events + `session export` (DB not used)",
    })

    failures = 0
    for n in args.tests:
        try:
            run_one(args, workspace, baseline_meta, prompt_report, config_report, n)
        except H.HarnessError as exc:
            print(f"FATAL: {exc}", file=sys.stderr)
            failures += 1
            break
    print("ALL DONE" if not failures else f"STOPPED after {failures} failure(s)", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
