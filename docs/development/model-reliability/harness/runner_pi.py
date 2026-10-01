#!/usr/bin/env python3
"""Pi coding-agent adapter runner for the frozen OpenCode t0-t8 suite.

Pi: `@earendil-works/pi-coding-agent` (github.com/earendil-works/pi).
Reuses frozen artifacts verbatim (prompts, prompt_manifest.json,
ground_truth.json, score.py, provisioning/validation in harness_lib.py).

Invocation: ``pi --mode json --print --model <provider/id>`` with an isolated
``PI_CODING_AGENT_DIR`` (models.json) and ``--session-dir`` per workspace.
Extensions/skills/prompt-templates discovery disabled; project trust approved
via ``--approve`` so suite file writes (t2 commit path) are not blocked.

Pi structural facts recorded (not worked around):
* No permission gates / sandbox: tools run with the OS-user permissions.
  ``permission_evidence`` therefore reports zero denials by design.
* No webfetch/websearch built-ins: nothing to disable (matches deny intent).
* Default tools: read, bash, edit, write (grep/find/ls exist but are not
  default-enabled). Tool names recorded verbatim; score.py detectors are
  tool-name agnostic except native ``grep`` (falls back to shell search).
* Sessions: JSONL files grouped by cwd under ``--session-dir``.

Usage:
    ZEN_GO_KEY=<redacted> PI_CODING_AGENT_DIR=<dir> python3 runner_pi.py \
        --workspace WS --variant pi-deepseek --model zen-go/deepseek-v4.1-flash \
        --session-dir WS/pi-sessions --tests 0 6 8
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

DEFAULT_BINARY = "pi"


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", required=True, type=Path)
    p.add_argument("--variant", default="pi-unnamed")
    p.add_argument("--model", default="zen-go/deepseek-v4.1-flash")
    p.add_argument("--binary", default=DEFAULT_BINARY)
    p.add_argument("--session-dir", default=None)
    p.add_argument("--thinking", default=None,
                   help="Pi thinking level (default: engine default; recorded)")
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


def build_env(clone: Path) -> dict:
    env = os.environ.copy()
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


def _text_of_content(content) -> str:
    out = []
    for b in content or []:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text" and isinstance(b.get("text"), str):
            out.append(b["text"])
    return "\n".join(out)


def events_to_parts(events: list) -> tuple[list, str | None, dict | None, dict]:
    """Convert Pi --mode json events to v1-shaped parts.

    Returns (parts, session_id, session_event, usage_totals).
    """
    parts: list = []
    sid = None
    session_ev = None
    usage = {"input": 0, "output": 0, "reasoning": 0, "cacheRead": 0,
             "cacheWrite": 0, "total": 0}
    pending_tools: dict = {}
    for ev in events:
        if not isinstance(ev, dict):
            continue
        t = ev.get("type")
        if t == "session":
            sid = ev.get("id")
            session_ev = ev
        elif t == "message_end" and isinstance(ev.get("message"), dict):
            msg = ev["message"]
            if msg.get("role") != "assistant":
                continue
            for b in msg.get("content") or []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text":
                    parts.append({"type": "text", "text": b.get("text", "")})
                elif b.get("type") == "thinking":
                    parts.append({"type": "reasoning",
                                  "text": b.get("thinking", "")})
            u = msg.get("usage") or {}
            for k in usage:
                if isinstance(u.get(k), (int, float)):
                    usage[k] += u[k]
        elif t == "tool_execution_start":
            pending_tools[ev.get("toolCallId")] = {
                "tool": ev.get("toolName"),
                "callID": ev.get("toolCallId"),
                "input": ev.get("args"),
            }
        elif t == "tool_execution_end":
            cid = ev.get("toolCallId")
            start = pending_tools.pop(cid, {"tool": ev.get("toolName"),
                                            "callID": cid, "input": None})
            res = ev.get("result") or {}
            out_text = _text_of_content(res.get("content"))
            is_err = bool(ev.get("isError"))
            parts.append({
                "type": "tool",
                "tool": ev.get("toolName") or start.get("tool"),
                "callID": cid,
                "state": {
                    "status": "error" if is_err else "completed",
                    "input": start.get("input"),
                    "output": out_text or None,
                    "error": out_text if is_err else None,
                },
            })
    return parts, sid, session_ev, usage


def pi_version(binary: str, env: dict) -> str:
    try:
        proc = subprocess.run([binary, "--version"], capture_output=True,
                              text=True, timeout=60, env=env)
        return (proc.stdout or proc.stderr).strip()
    except Exception as exc:
        return f"unavailable: {exc}"


def run_one(args, workspace: Path, baseline_meta: dict, prompt_report: dict,
            n: int) -> dict:
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

    session_dir = Path(args.session_dir).resolve() if args.session_dir else workspace / "pi-sessions"
    session_dir.mkdir(parents=True, exist_ok=True)

    rec = {
        "variant": variant,
        "test": n,
        "model": args.model,
        "engine": "pi",
        "binary": args.binary,
        "timeout_s": args.timeout,
        "clone": str(clone),
        "config": None,
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
        "permission_policy": {"engine": "pi",
                              "note": "Pi has no permission gates or sandbox; "
                                      "no external-directory/webfetch deny mechanism exists. "
                                      "No webfetch/websearch built-ins to disable. "
                                      "Project trust approved via --approve."},
        "environment": {"TMPDIR": str(clone / ".eval-tmp"),
                        "PI_CODING_AGENT_DIR": os.environ.get("PI_CODING_AGENT_DIR"),
                        "session_dir": str(session_dir),
                        "thinking": args.thinking or "engine-default",
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
        cmd = [args.binary, "--mode", "json", "--print",
               "--model", args.model,
               "--no-extensions", "--no-skills", "--no-prompt-templates",
               "--approve", "--session-dir", str(session_dir)]
        if args.thinking:
            cmd += ["--thinking", args.thinking]
        cmd.append(prompt)
        env = build_env(clone)
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

    parts, sid, session_ev, usage = events_to_parts(events)
    rec["session"] = {"session_id": sid,
                      "match": "exact" if sid else "missing",
                      "source": "Pi --mode json session event + --session-dir files",
                      "cwd": (session_ev or {}).get("cwd"),
                      "tokens_in_out_reason": [usage["input"], usage["output"],
                                               usage["reasoning"]],
                      "notes": [] if sid else ["no session event in Pi stream"]}
    rec["trace_status"] = "available" if sid else ("not-applicable" if args.dry_run else "missing")

    prose = "\n".join(p.get("text", "") for p in parts if p.get("type") == "text")
    (outdir / f"t{n}.out").write_text(prose)
    (outdir / f"t{n}.err").write_text(err)
    (outdir / f"t{n}.log").write_text(prose + "\n===STDERR===\n" + err)
    (outdir / f"t{n}.pi_events.jsonl").write_text(
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

    denials = [p for p in parts if p.get("type") == "tool"
               and (p.get("state") or {}).get("status") == "error"
               and H.is_permission_denial((p.get("state") or {}).get("error"))]
    rec["permission_evidence"] = {
        "pi_tool_errors": [
            {"tool": p.get("tool"), "callID": p.get("callID"),
             "input": (p.get("state") or {}).get("input"),
             "error": str((p.get("state") or {}).get("error"))} for p in parts
            if p.get("type") == "tool" and (p.get("state") or {}).get("status") == "error"],
        "permission_rejections": len(denials),
        "limitations": ["Pi performs no permission gating; denials are structurally "
                        "impossible in this configuration."],
    }

    with open(outdir / "results.jsonl", "a") as fh:
        fh.write(json.dumps(rec) + "\n")

    print(f"[{rec['ended']}] {variant} t{n} rc={rec['rc']} timed_out={rec['timed_out']} "
          f"dur={rec['duration_s']}s session={sid} "
          f"commits={len(rec['git_after'].get('commits_since_baseline', []))} "
          f"clean={rec['git_after']['clean']} toolerr={len(rec['permission_evidence']['pi_tool_errors'])}",
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

    env = build_env(workspace)
    version = pi_version(args.binary, env)

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
        "engine": "pi",
        "variant": args.variant,
        "model": args.model,
        "engine_version": version,
        "binary": args.binary,
        "pi_agent_dir": os.environ.get("PI_CODING_AGENT_DIR"),
        "thinking": args.thinking or "engine-default",
        "tests": args.tests,
        "timeout_s": args.timeout,
        "dry_run": bool(args.dry_run),
        "started": H.now_iso(),
        "baseline": baseline_meta,
        "temporary_directory_policy": "TMPDIR=<clone>/.eval-tmp (git-excluded)",
        "network_policy": "npm_config_offline=true; no web-tool gates exist in Pi",
        "session_source": "Pi --mode json events + --session-dir JSONL",
    })

    failures = 0
    for n in args.tests:
        try:
            run_one(args, workspace, baseline_meta, prompt_report, n)
        except H.HarnessError as exc:
            print(f"FATAL: {exc}", file=sys.stderr)
            failures += 1
            break
    print("ALL DONE" if not failures else f"STOPPED after {failures} failure(s)", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
