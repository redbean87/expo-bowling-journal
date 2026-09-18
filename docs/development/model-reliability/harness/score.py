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


# Markdown emphasis delimiter runs that wrap a word, e.g. ``**false**`` or
# ``_false_``. Internal underscores (``foo_bar``) and list bullets are left alone.
_MD_EMPHASIS_RE = re.compile(
    r"(?<!\w)(?:\*{1,3}|_{1,3})(?=\w)|(?<=\w)(?:\*{1,3}|_{1,3})(?!\w)")


def strip_markdown_emphasis(text: str) -> str:
    """Drop emphasis markers around words so ``**false**`` still matches ``false``."""
    return _MD_EMPHASIS_RE.sub("", text or "")


# Shell operators that separate independent commands inside one Bash call.
_SHELL_SPLIT_RE = re.compile(r"\s*(?:&&|\|\||;|\|)\s*")


def command_segments(text) -> list:
    """Split a shell command string into its independently-invoked segments."""
    return [seg.strip() for seg in _SHELL_SPLIT_RE.split(text or "") if seg.strip()]


def command_tokens(text) -> list:
    tokens = []
    for segment in command_segments(text):
        tokens.extend(segment.split())
    return tokens


def command_has(pattern, command) -> bool:
    """Token-aware contiguous match of ``pattern`` within ``command``.

    Matching is on whole tokens, so ``git status`` does not match ``git statuss``
    the way a naive substring test would.
    """
    pat = command_tokens(pattern)
    if not pat:
        return False
    toks = command_tokens(command)
    n = len(pat)
    return any(toks[i:i + n] == pat for i in range(len(toks) - n + 1))


def search_command_ran(commands) -> bool:
    """True when a content search (``rg``/``grep``/``git grep``) was invoked.

    Only a command word that actually leads a shell segment counts; a mention of
    a search in prose, a filename, or an argument does not.
    """
    wanted = {"rg", "grep"}
    for cmd in commands or []:
        for segment in command_segments(cmd):
            toks = segment.split()
            i = 0
            while i < len(toks) and "=" in toks[i] and not toks[i].startswith("-"):
                i += 1
            if i >= len(toks):
                continue
            if toks[i] in wanted:
                return True
            if toks[i] == "git" and i + 1 < len(toks) and toks[i + 1] == "grep":
                return True
    return False


def _load_package_scripts(clone) -> dict:
    if not clone:
        return {}
    try:
        data = json.loads((Path(clone) / "package.json").read_text())
    except Exception:
        return {}
    scripts = data.get("scripts") or {}
    return scripts if isinstance(scripts, dict) else {}


def npm_script_chain(scripts: dict, body: str, _depth: int = 0) -> list:
    """Expand ``npm run <name>`` references in a script body, transitively."""
    found = []
    if _depth > 10:
        return found
    for m in re.finditer(r"npm\s+run\s+([A-Za-z0-9:_.-]+)", body or ""):
        name = m.group(1)
        found.append(name)
        found.extend(npm_script_chain(scripts, scripts.get(name, ""), _depth + 1))
    return found


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
        self.tool_calls = []
        outputs = []
        texts = []
        for p in parts:
            if p.get("type") == "tool":
                st = p.get("state") or {}
                inp = st.get("input") or {}
                cmd = inp.get("command")
                call = {
                    "tool": p.get("tool"),
                    "callID": p.get("callID"),
                    "command": cmd if isinstance(cmd, str) else None,
                    "status": st.get("status"),
                    "output": str(st["output"]) if st.get("output") else None,
                    "error": str(st["error"]) if st.get("error") else None,
                }
                self.tool_calls.append(call)
                if isinstance(cmd, str):
                    self.commands.append(cmd)
                if st.get("output"):
                    outputs.append(str(st["output"]))
                if st.get("error"):
                    outputs.append(str(st["error"]))
            elif p.get("type") == "text":
                texts.append(p.get("text") or "")
        self.transcript = "\n".join(texts)
        # Genuine captured tool output/error, separate from the process report
        # text (stdout/stderr), which a model can fabricate.
        self.tool_outputs = outputs
        self.process_output = "\n".join([self.stdout, self.stderr])
        self.output = "\n".join(outputs + [self.stdout, self.stderr])
        self.text_all = self.transcript + "\n" + self.output
        self.trace_available = bool(parts) or bool(self.stdout)
        clone = record.get("clone")
        self.scripts = _load_package_scripts(clone)

    def _read(self, name):
        p = self.outdir / name
        return p.read_text(errors="replace") if p.exists() else ""

    def _nested_npm_match(self, call, any_of) -> bool:
        """True when a captured ``npm run <script>`` executed a wanted command.

        The script body is resolved transitively from the clone's package.json,
        but credit requires BOTH an executed command trace AND captured output
        corroborating the nested step. A script merely being defined is not enough.
        """
        cmd = call.get("command")
        if not cmd or not self.scripts:
            return False
        invoked = re.findall(r"npm\s+run\s+([A-Za-z0-9:_.-]+)", cmd)
        if not invoked:
            return False
        out = call.get("output") or call.get("error") or ""
        if not out:
            return False
        for name in invoked:
            chain = [name] + npm_script_chain(self.scripts, self.scripts.get(name, ""))
            for item in chain:
                body = self.scripts.get(item, "")
                for a in any_of:
                    if command_has(a, f"npm run {item}") and f"npm run {item}" in out:
                        return True
                    if body and command_has(a, body):
                        first = body.split()[0]
                        if first in out:
                            return True
        return False

    def command_ran(self, any_of, min_count=1):
        any_of = list(any_of)
        if self.commands:
            hits = 0
            for call in self.tool_calls:
                cmd = call.get("command")
                if not isinstance(cmd, str):
                    continue
                if any(command_has(a, cmd) for a in any_of):
                    hits += 1
                elif call.get("status") != "error" and self._nested_npm_match(call, any_of):
                    hits += 1
            return hits >= min_count, hits, "commands"
        # Execution credit requires a captured command trace. Report text and
        # incidental tool output (e.g. a cat of package.json) are not evidence
        # that a command ran.
        if self.parts or self.process_output.strip():
            return False, 0, "commands"
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
                if command_has(a, c):
                    return "fail", f"forbidden command matched: {a!r}"
        return "pass", "no forbidden command found"

    if t == "content_search":
        if not ctx.parts:
            return "unknown", "no trace parts captured"
        params = req["params"]
        wanted_tools = {w.lower() for w in params.get("tools", [])}
        tools_ok = any((tool or "").lower() in wanted_tools for tool in ctx.tools)
        cmds_ok = search_command_ran(ctx.commands)
        ok = tools_ok or cmds_ok
        evidence = f"native_tool={tools_ok} bash_content_search={cmds_ok}"
        return ("pass" if ok else "fail"), evidence

    if t == "execution_report":
        hay = ctx.transcript if ctx.transcript.strip() else ctx.text_all
        corr = req["params"].get("corroborate") or {}
        ran, hits, source = ctx.command_ran(corr.get("any_of", []),
                                            corr.get("min_count", 1))
        if ran is None:
            return "unknown", "no command trace or output available"
        if not ran:
            return "fail", (f"claimed execution without corroborating evidence "
                            f"(hits={hits} source={source})")
        if not hay.strip():
            return "unknown", "no assistant text captured"
        missing = [p for p in req["params"]["patterns"] if not re.search(p, hay)]
        return (("pass" if not missing else "fail"),
                "all matched with execution evidence" if not missing
                else f"missing patterns={missing}")

    if t == "text_regex":
        hay = ctx.transcript if ctx.transcript.strip() else ctx.text_all
        if not hay.strip():
            return "unknown", "no assistant text captured"
        m = re.search(req["params"]["pattern"], strip_markdown_emphasis(hay))
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
