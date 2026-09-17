#!/usr/bin/env python3
"""Machine-readable scoring for the OpenCode t0-t8 model-reliability suite.

Reads ``ground_truth.json`` plus the runner artifacts (``results.jsonl``,
``raw_parts.jsonl``, ``tN.out/err/log``) and evaluates each test's requirements,
producing structured pass/fail/unknown results. Human review may still be needed
for nuanced semantics; this script makes the mechanical requirements explicit
and identifies exactly which were not met.

A zero process exit code from the model run is never treated as success.

Usage:
    python3 score.py --workspace WS --variant devstral
    python3 score.py --workspace WS --variant devstral --fail-on-unmet
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def load_records(outdir: Path) -> list:
    path = outdir / "results.jsonl"
    if not path.exists():
        raise H.HarnessError(f"no results.jsonl at {path}")
    records = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def load_parts(outdir: Path) -> dict:
    path = outdir / "raw_parts.jsonl"
    by_test: dict = {}
    if not path.exists():
        return by_test
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        by_test.setdefault(obj.get("test"), []).append(obj.get("part") or {})
    return by_test


class Ctx:
    def __init__(self, record, gt, parts, outdir):
        self.record = record
        self.gt = gt
        self.parts = parts
        self.outdir = outdir
        n = record.get("test")
        self.stdout = self._read(f"t{n}.out")
        self.stderr = self._read(f"t{n}.err")
        self.tools = [p.get("tool") for p in parts if p.get("type") == "tool"]
        self.commands = []
        outputs = []
        texts = []
        for p in parts:
            if p.get("type") == "tool":
                st = p.get("state") or {}
                inp = st.get("input") or {}
                cmd = inp.get("command")
                if isinstance(cmd, str):
                    self.commands.append(cmd)
                if st.get("output"):
                    outputs.append(str(st["output"]))
                if st.get("error"):
                    outputs.append(str(st["error"]))
            elif p.get("type") == "text":
                texts.append(p.get("text") or "")
        self.transcript = "\n".join(texts)
        self.output = "\n".join(outputs + [self.stdout, self.stderr])
        self.text_all = self.transcript + "\n" + self.output
        self.trace_available = bool(parts) or bool(self.stdout)

    def _read(self, name):
        p = self.outdir / name
        return p.read_text(errors="replace") if p.exists() else ""

    def command_ran(self, any_of, min_count=1):
        if self.commands:
            hits = sum(1 for c in self.commands
                       if any(norm(a) in norm(c) for a in any_of))
            return hits >= min_count, hits, "commands"
        # Fall back to raw output only when no command trace is available.
        if self.output.strip():
            hits = sum(1 for a in any_of if norm(a) in norm(self.output))
            if hits:
                return True, hits, "output-fallback"
            return False, 0, "output-fallback"
        return None, 0, "unavailable"


def evaluate(req, ctx: Ctx):
    t = req["type"]
    gt = ctx.gt
    if t == "prompt_verified":
        v = (ctx.record.get("prompt") or {}).get("verified")
        if v is None:
            return "unknown", "no prompt verification recorded"
        return ("pass" if v else "fail"), f"prompt.verified={v}"

    if t == "baseline_head":
        exp = gt["baseline"]["expected_head"]
        before = (ctx.record.get("git_before") or {}).get("head")
        base = (ctx.record.get("baseline") or {}).get("head")
        if not before:
            return "unknown", "no git_before captured"
        ok = before == exp and (base is None or base == exp)
        return ("pass" if ok else "fail"), f"git_before.head={before} baseline.head={base}"

    if t == "clean_before":
        gb = ctx.record.get("git_before") or {}
        if not gb:
            return "unknown", "no git_before captured"
        untracked = gb.get("untracked_files") or []
        ok = gb.get("clean") is True and not untracked
        return ("pass" if ok else "fail"), f"clean={gb.get('clean')} untracked={untracked[:5]}"

    if t == "commit_count":
        commits = (ctx.record.get("git_after") or {}).get("commits_since_baseline")
        if commits is None:
            return "unknown", "no commit data captured"
        n = req["params"]["n"]
        shas = [c.get("sha", "")[:8] for c in commits]
        return ("pass" if len(commits) == n else "fail"), f"commits={len(commits)} expected={n} {shas}"

    if t == "clean_tree":
        ga = ctx.record.get("git_after") or {}
        if "clean" not in ga:
            return "unknown", "no git_after captured"
        return (("pass" if ga["clean"] else "fail"),
                f"clean={ga['clean']} status={norm((ga.get('status_porcelain') or ''))[:200]}")

    if t == "no_change":
        ga = ctx.record.get("git_after") or {}
        if not ga:
            return "unknown", "no git_after captured"
        commits = ga.get("commits_since_baseline") or []
        changed = ga.get("changed_files_vs_baseline") or []
        diff = ga.get("diff_vs_baseline") or ""
        ok = len(commits) == 0 and ga.get("clean") is True and not changed and not diff.strip()
        return (("pass" if ok else "fail"),
                f"commits={len(commits)} clean={ga.get('clean')} changed={changed[:5]}")

    if t == "no_tools":
        if not ctx.parts:
            return "unknown", "no trace parts captured; cannot confirm no tools were used"
        return (("pass" if not ctx.tools else "fail"),
                f"tool_calls={len(ctx.tools)}")

    if t == "tool_used":
        if not ctx.parts:
            return "unknown", "no trace parts captured"
        wanted = [w.lower() for w in req["params"]["any_of"]]
        hits = [tool for tool in ctx.tools if (tool or "").lower() in wanted]
        return (("pass" if hits else "fail"), f"tools={sorted(set(ctx.tools))}")

    if t == "command_ran":
        ok, hits, source = ctx.command_ran(req["params"]["any_of"],
                                           req["params"].get("min_count", 1))
        if ok is None:
            return "unknown", "no command trace or output available"
        return ("pass" if ok else "fail"), f"hits={hits} source={source}"

    if t == "command_forbidden":
        if not ctx.commands and not ctx.output.strip():
            return "unknown", "no command trace available"
        pool = ctx.commands if ctx.commands else [ctx.output]
        for a in req["params"]["any_of"]:
            for c in pool:
                if norm(a) in norm(c):
                    return "fail", f"forbidden command matched: {a!r}"
        return "pass", "no forbidden command found"

    if t == "text_regex":
        hay = ctx.transcript if ctx.transcript.strip() else ctx.text_all
        if not hay.strip():
            return "unknown", "no assistant text captured"
        m = re.search(req["params"]["pattern"], hay)
        return (("pass" if m else "fail"), f"match={m.group(0)!r}" if m else "no match")

    if t == "text_regex_all":
        hay = ctx.transcript if ctx.transcript.strip() else ctx.text_all
        if not hay.strip():
            return "unknown", "no assistant text captured"
        missing = [p for p in req["params"]["patterns"] if not re.search(p, hay)]
        return (("pass" if not missing else "fail"),
                "all matched" if not missing else f"missing patterns={missing}")

    if t == "output_regex":
        if not ctx.output.strip():
            return "unknown", "no tool output captured"
        m = re.search(req["params"]["pattern"], ctx.output)
        return (("pass" if m else "fail"), f"match={m.group(0)!r}" if m else "no match")

    if t == "path_in_text":
        if not ctx.text_all.strip():
            return "unknown", "no text captured"
        path = req["params"]["path"]
        ok = path in ctx.text_all
        if not ok:
            ok = path in ctx.text_all.replace("\\", "/")
        return ("pass" if ok else "fail", f"path={path} present={ok}")

    if t == "paths_in_text_min":
        if not ctx.text_all.strip():
            return "unknown", "no text captured"
        paths = req["params"]["paths"]
        min_required = req["params"].get("min", 1)
        present = [p for p in paths if p in ctx.text_all]
        return (("pass" if len(present) >= min_required else "fail"),
                f"{len(present)}/{len(paths)} paths present (min {min_required})")

    if t == "baseline_diff_touches":
        ga = ctx.record.get("git_after") or {}
        changed = ga.get("changed_files_vs_baseline")
        if changed is None:
            return "unknown", "no baseline diff captured"
        path = req["params"]["path"]
        return (("pass" if path in changed else "fail"),
                f"changed={changed}")

    if t == "reports_model_id":
        model = ctx.record.get("model") or ""
        if not model:
            return "unknown", "no model id recorded"
        seg = model.split("/")[-1]
        hay = ctx.text_all.lower()
        ok = seg.lower() in hay or model.lower() in hay
        return ("pass" if ok else "fail", f"model={seg} reported={ok}")

    if t == "reports_cwd":
        clone = (ctx.record.get("clone") or "").rstrip("/")
        if not clone:
            return "unknown", "no clone path recorded"
        variants = {clone, clone.replace("/private", ""), "/private" + clone}
        base = clone.rsplit("/", 1)[-1]
        hay = ctx.text_all
        ok = any(v and v in hay for v in variants) or (base and base in hay and "clones" in hay)
        return ("pass" if ok else "fail", f"clone={clone} reported={ok}")

    if t == "invalid_command_reported":
        cmd = req["params"]["command"]
        ran = ctx.command_ran([cmd])
        if ran[0] is None:
            return "unknown", "no command trace available"
        if not ran[0]:
            return "fail", f"invalid command not run: {cmd!r}"
        if not ctx.output.strip():
            return "unknown", "command ran but no output captured"
        m = re.search(req["params"]["output_regex"], ctx.output)
        return ("pass" if m else "fail",
                f"output match={m.group(0)!r}" if m else "no invalid-command output found")

    return "unknown", f"unsupported requirement type: {t}"


def score_test(t_spec, record, parts, gt, outdir):
    ctx = Ctx(record, gt, parts, outdir)
    requirements = list(gt.get("common_requirements", [])) + list(t_spec.get("requirements", []))
    results = []
    if record.get("runner_error"):
        return {
            "test": t_spec["id"],
            "verdict": "error",
            "error": record["runner_error"],
            "requirements": [],
            "unmet": [],
        }
    if record.get("dry_run"):
        return {
            "test": t_spec["id"],
            "verdict": "skipped",
            "note": "dry-run record (no model execution)",
            "requirements": [],
            "unmet": [],
        }
    for req in requirements:
        status, evidence = evaluate(req, ctx)
        results.append({
            "id": req["id"],
            "description": req["description"],
            "type": req["type"],
            "critical": req.get("critical", False),
            "status": status,
            "evidence": evidence,
        })
    fails = [r for r in results if r["status"] == "fail"]
    unknowns = [r for r in results if r["status"] == "unknown"]
    critical_fail = [r for r in fails if r["critical"]]
    if critical_fail or fails:
        verdict = "fail"
    elif unknowns:
        verdict = "partial"
    else:
        verdict = "pass"
    return {
        "test": t_spec["id"],
        "title": t_spec.get("title"),
        "semantic_verdict": t_spec.get("semantic_verdict"),
        "expect_commit": t_spec.get("expect_commit"),
        "verdict": verdict,
        "requirements": results,
        "unmet": [r["id"] for r in results if r["status"] != "pass"],
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", required=True, type=Path)
    p.add_argument("--variant", required=True)
    p.add_argument("--ground-truth", type=Path, default=H.GROUND_TRUTH_PATH)
    p.add_argument("--out", type=Path, default=None)
    p.add_argument("--fail-on-unmet", action="store_true")
    args = p.parse_args(argv)

    gt = H.read_json(args.ground_truth)
    outdir = args.workspace.resolve() / "results" / args.variant
    records = load_records(outdir)
    parts_by_test = load_parts(outdir)
    by_test = {r.get("test"): r for r in records}

    tests = []
    for t_spec in gt["tests"]:
        n = t_spec["id"]
        rec = by_test.get(n)
        if rec is None:
            tests.append({"test": n, "title": t_spec.get("title"), "verdict": "missing",
                          "requirements": [], "unmet": ["test.not_run"]})
            continue
        tests.append(score_test(t_spec, rec, parts_by_test.get(n, []), gt, outdir))

    verdicts = {}
    for t in tests:
        verdicts[t["verdict"]] = verdicts.get(t["verdict"], 0) + 1
    report = {
        "suite": gt.get("suite"),
        "variant": args.variant,
        "generated_at": H.now_iso(),
        "baseline_head": gt["baseline"]["expected_head"],
        "totals": {"tests": len(tests), "by_verdict": verdicts,
                   "unmet_requirements": sum(len(t["unmet"]) for t in tests)},
        "tests": tests,
    }
    out_path = args.out or (outdir / "score.json")
    H.write_json(out_path, report)

    print(f"scored {len(tests)} tests for variant {args.variant}: {verdicts}")
    for t in tests:
        if t["unmet"]:
            print(f"  t{t['test']}: {t['verdict']} unmet={t['unmet']}")
    print(f"wrote {out_path}")

    if args.fail_on_unmet and any(t["verdict"] in ("fail", "error") for t in tests):
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except H.HarnessError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
