#!/usr/bin/env python3
"""Fixture-only verification for the model-reliability harness.

Runs the harness end to end without invoking a model, asserting the corrected
methodology:

* the clean baseline excludes evaluation reports and prompts;
* no extra refs/reflogs/objects are copied into the baseline;
* no ``node_modules`` symlink points at the live repository;
* the expected HEAD and clean tree are enforced (wrong HEAD and dirty clones abort);
* prompt hashes are verified and a mismatch is detected;
* untracked nested files and ignored files are captured by Git-state capture;
* ground truth loads and the scoring script produces structured results.

Usage:
    python3 selftest.py
    python3 selftest.py --no-deps --keep
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402
import score as SC  # noqa: E402

CHECKS = []


def check(name: str, ok: bool, detail: str = ""):
    CHECKS.append({"name": name, "ok": bool(ok), "detail": detail})
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {name}" + (f" -- {detail}" if detail else ""))
    return bool(ok)


def run_git(cwd, *args):
    return H.run(["git", "-C", str(cwd), *args]).stdout


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", type=Path, default=None,
                   help="selftest workspace (default: a fresh temp dir)")
    p.add_argument("--no-deps", action="store_true",
                   help="skip copying node_modules (faster; symlink check then asserts absence)")
    p.add_argument("--keep", action="store_true", help="keep the selftest workspace")
    args = p.parse_args(argv)

    created = args.workspace is None
    workspace = (args.workspace or Path(tempfile.mkdtemp(prefix="mr-harness-selftest-"))).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    print(f"selftest workspace: {workspace}\n")

    try:
        # --- 1. Provision the clean baseline ---------------------------------
        meta = H.provision_baseline(workspace, copy_deps=not args.no_deps)
        check("baseline HEAD is the expected deterministic SHA",
              meta["head"] == H.EXPECTED_BASELINE_SHA,
              f"head={meta['head']}")
        excluded = workspace / "baseline" / H.EVAL_EXCLUDE_PATH
        check("clean baseline excludes docs/development/model-reliability",
              not excluded.exists(), f"absent={not excluded.exists()}")
        check("clean baseline excludes the prompt set",
              not (excluded / "opencode-prompts").exists())
        refs = [r for r in run_git(workspace / "baseline", "for-each-ref",
                                   "--format=%(refname)").splitlines() if r]
        check("baseline has exactly one ref (refs/heads/main)",
              refs == ["refs/heads/main"], f"refs={refs}")
        reflog = [r for r in run_git(workspace / "baseline", "reflog").splitlines() if r]
        check("baseline reflog contains only its own commit",
              len(reflog) == 1, f"reflog_entries={len(reflog)}")
        unreachable = run_git(workspace / "baseline", "fsck", "--unreachable", "--no-progress")
        check("baseline has no unreachable objects",
              unreachable.strip() == "", unreachable.strip()[:120])
        check("baseline tracked-file count matches ground truth",
              meta["tracked_files"] == 338, f"tracked={meta['tracked_files']}")
        dm_lines = len((workspace / "baseline" / "docs" / "domain-model.md")
                       .read_text().splitlines())
        check("baseline domain-model.md is 205 lines", dm_lines == 205, f"lines={dm_lines}")
        pinpal = [x for x in run_git(workspace / "baseline", "grep", "-l", "PinPal",
                                     "--", ".", ":!node_modules").splitlines() if x]
        check("baseline has 11 files mentioning PinPal", len(pinpal) == 11,
              f"count={len(pinpal)}")
        pinpal_fixtures = run_git(workspace / "baseline", "ls-files", "*.pinpal").strip()
        check("baseline has no committed .pinpal fixtures", pinpal_fixtures == "")

        # --- 2. Clone isolation and dependency safety ------------------------
        baseline = workspace / "baseline"
        clone = workspace / "clones" / "t0"
        H.make_clone(baseline, clone)
        ok, report = H.validate_clone(clone, meta["head"], H.REPO_ROOT)
        check("clone validates (HEAD, refs, clean tree)", ok, "; ".join(report["issues"]))
        nm = clone / "node_modules"
        if args.no_deps:
            check("no node_modules symlink exists", not nm.is_symlink())
        else:
            check("node_modules is a real copied directory, not a symlink",
                  nm.is_dir() and not nm.is_symlink())
            escapes = report["symlink_escapes"]
            live = [e for e in escapes if e.get("escapes_into_live_repo")]
            check("no symlink escapes the clone into the live repository",
                  not live, f"escapes={escapes[:3]}")

        # --- 3. Expected HEAD and clean-tree enforcement ---------------------
        H.run(["git", "-C", str(clone), "config", "user.email", "x@y.z"])
        H.run(["git", "-C", str(clone), "config", "user.name", "x"])
        H.run(["git", "-C", str(clone), "commit", "-q", "--allow-empty", "-m", "extra"])
        ok_bad, bad_report = H.validate_clone(clone, meta["head"], H.REPO_ROOT)
        check("wrong HEAD is rejected by clone validation",
              not ok_bad and any("HEAD" in i for i in bad_report["issues"]),
              bad_report["issues"][:1])

        dirty = workspace / "clones" / "t1"
        H.make_clone(baseline, dirty)
        (dirty / "UNTRACKED_DIRTY.txt").write_text("dirty\n")
        ok_dirty, dirty_report = H.validate_clone(dirty, meta["head"], H.REPO_ROOT)
        check("dirty clone (untracked file) is rejected before a run",
              not ok_dirty and any("not clean" in i for i in dirty_report["issues"]),
              dirty_report["issues"][:1])

        # --- 4. Git-state capture: untracked (nested) + ignored --------------
        cap = workspace / "clones" / "t2"
        H.make_clone(baseline, cap)
        (cap / "nested" / "dir").mkdir(parents=True, exist_ok=True)
        (cap / "nested" / "dir" / "untracked.txt").write_text("u\n")
        ignored_marker = cap / "node_modules" / "HARNESS_IGNORED_MARKER"
        ignored_marker.parent.mkdir(parents=True, exist_ok=True)
        ignored_marker.write_text("i\n")
        (cap / ".eval-tmp" / "tempfile").write_text("t\n")
        state = H.git_state(cap, meta["head"])
        check("git-state capture records nested untracked files",
              "nested/dir/untracked.txt" in state["untracked_files"],
              f"untracked={state['untracked_files']}")
        check("git-state capture records ignored files (node_modules)",
              any(f.endswith("HARNESS_IGNORED_MARKER") for f in state["ignored_files"]),
              f"ignored_sample={state['ignored_files'][:3]}")
        check("git-state capture records the git-excluded temp directory",
              any(".eval-tmp" in f for f in state["ignored_files"]) or
              any(".eval-tmp" in f for f in state["ignored_files"]),
              f"ignored_sample={state['ignored_files'][:3]}")
        check("git-state capture records staged/unstaged/full diffs",
              all(k in state for k in ("diff_unstaged", "diff_staged", "diff_head")),
              "diff keys present")
        check("git-state capture records final HEAD and commit list",
              state["head"] == meta["head"] and state["commit_count"] == 0,
              f"head={state['head'][:8]} commits={state['commit_count']}")

        # --- 5. Prompt integrity is checked, and mismatches are detected -----
        prompt_report = H.verify_prompt_set()
        check("prompt set verifies against the frozen manifest",
              prompt_report["ok"] and len(prompt_report["prompts"]) == 9,
              f"ids={prompt_report['found_ids']}")

        tmp_prompts = workspace / "tmp" / "prompts"
        shutil.copytree(H.PROMPTS_DIR, tmp_prompts)
        bad_manifest = json.loads(H.PROMPT_MANIFEST_PATH.read_text())
        bad_manifest["tests"][0]["sha256"] = "0" * 64
        bad_manifest_path = workspace / "tmp" / "bad_manifest.json"
        bad_manifest_path.write_text(json.dumps(bad_manifest))
        bad_report = H.verify_prompt_set(tmp_prompts, bad_manifest_path)
        check("prompt hash mismatch is detected and would abort a run",
              (not bad_report["ok"]) and (not bad_report["prompts"]["0"]["match"]),
              f"issues={len(bad_report['issues'])}")

        # --- 6. Expected-HEAD enforcement in provisioning --------------------
        bad_ws = workspace / "bad-head-ws"
        raised = False
        try:
            H.provision_baseline(bad_ws, copy_deps=False, expected_sha="0" * 40)
        except H.HarnessError as exc:
            raised = "expected" in str(exc)
        check("provisioning aborts when the baseline HEAD is not the expected SHA",
              raised)

        # --- 7. Permission policy is uniform across eval configs -------------
        tmpl = json.loads(H.PERMISSION_POLICY_PATH.read_text())["permission"]
        check("canonical permission constant matches the documented policy",
              tmpl == H.CANONICAL_PERMISSIONS, f"policy={tmpl}")
        cfg_dir = Path("~/.config/opencode").expanduser()
        cfg_files = sorted(cfg_dir.glob(H.DEFAULT_EVAL_CONFIG_GLOB)) if cfg_dir.exists() else []
        if cfg_files:
            import sync_permissions as SP
            drifted = []
            for f in cfg_files:
                try:
                    cfg = SP.load_config(f)
                except Exception as exc:
                    drifted.append(f"{f.name}: parse error {exc}")
                    continue
                if cfg.get("permission") != H.CANONICAL_PERMISSIONS:
                    drifted.append(f.name)
            check("all eval configs carry the canonical permission policy",
                  not drifted, f"drifted={drifted}")
        else:
            check("eval config dir present (skipped if absent)", True,
                  "no eval configs found; policy check skipped")

        # --- 8. Ground truth loads and scoring runs --------------------------
        gt = H.read_json(H.GROUND_TRUTH_PATH)
        check("ground truth loads with all nine test specs",
              len(gt.get("tests", [])) == 9 and gt["baseline"]["expected_head"] == H.EXPECTED_BASELINE_SHA,
              f"tests={len(gt.get('tests', []))}")
        check("ground truth records the sanitized PinPal count (11) and fixture count (0)",
              gt["baseline"]["files_mentioning_pinpal"] == 11 and
              gt["baseline"]["pinpal_fixture_files"] == 0)

        fixture_ws = workspace / "score-fixture"
        outdir = fixture_ws / "results" / "selfcheck"
        outdir.mkdir(parents=True, exist_ok=True)
        clone_path = str(workspace / "clones" / "t0")
        base = {"head": H.EXPECTED_BASELINE_SHA, "tree": "deadbeef", "ref": H.DEFAULT_BASELINE_REF}
        good = {
            "variant": "selfcheck", "test": 0, "model": "opencode-go/deepseek-v4.1-flash",
            "clone": clone_path, "dry_run": False, "rc": 0,
            "baseline": base, "prompt": {"verified": True},
            "git_before": {"head": H.EXPECTED_BASELINE_SHA, "clean": True, "untracked_files": []},
            "git_after": {"head": H.EXPECTED_BASELINE_SHA, "clean": True, "untracked_files": [],
                          "commits_since_baseline": [], "changed_files_vs_baseline": [],
                          "diff_vs_baseline": "", "status_porcelain": ""},
            "session": {"session_id": "ses_selfcheck", "match": "exact"},
        }
        bad = dict(good)
        bad.update({"test": 1, "rc": 0})
        with open(outdir / "results.jsonl", "w") as fh:
            fh.write(json.dumps(good) + "\n" + json.dumps(bad) + "\n")
        with open(outdir / "raw_parts.jsonl", "w") as fh:
            fh.write(json.dumps({"test": 0, "session_id": "ses_selfcheck", "part": {
                "type": "text",
                "text": f"I am opencode-go/deepseek-v4.1-flash. My cwd is {clone_path}."}}) + "\n")
        (outdir / "t0.out").write_text("I am opencode-go/deepseek-v4.1-flash.\n")
        (outdir / "t1.out").write_text("I cannot answer.\n")
        rc = SC.main(["--workspace", str(fixture_ws), "--variant", "selfcheck"])
        scored = json.loads((outdir / "score.json").read_text())
        t0 = next(t for t in scored["tests"] if t["test"] == 0)
        t1 = next(t for t in scored["tests"] if t["test"] == 1)
        check("scoring script runs and writes structured results", rc == 0)
        check("scoring marks a satisfied test as pass", t0["verdict"] == "pass",
              f"t0_verdict={t0['verdict']} unmet={t0['unmet']}")
        check("scoring marks an unmet test as fail", t1["verdict"] == "fail",
              f"t1_verdict={t1['verdict']} unmet={t1['unmet'][:4]}")

        # --- 8b. Requirement-detector fixtures (deterministic, no model) -----
        det_dir = workspace / "detector-fixtures"
        det_dir.mkdir(parents=True, exist_ok=True)

        def _tool(tool, command=None, output=None, error=None, status="completed", cid="c1"):
            st = {"status": status, "input": {"command": command} if command else {}}
            if output is not None:
                st["output"] = output
            if error is not None:
                st["error"] = error
            return {"type": "tool", "tool": tool, "callID": cid, "state": st}

        def _text(text):
            return {"type": "text", "text": text}

        def _ctx(test, parts):
            return SC.Ctx({"test": test, "clone": clone_path}, gt, parts, det_dir)

        def _req(tid, rid):
            for t in gt["tests"]:
                if t["id"] == tid:
                    for r in t["requirements"]:
                        if r["id"] == rid:
                            return r
            raise KeyError(rid)

        st, ev = SC.evaluate(_req(3, "t3.search_ran"), _ctx(3, [
            _tool("bash", command='rg -l --fixed-strings "PinPal" . | sort',
                  output="docs/domain-model.md\n")]))
        check("t3: Bash-invoked rg content search is credited", st == "pass", ev)

        st, ev = SC.evaluate(_req(3, "t3.search_ran"), _ctx(3, [
            _tool("bash", command='grep -rn "PinPal" .', output="ROADMAP.md:1:PinPal\n")]))
        check("t3: Bash-invoked grep content search is credited", st == "pass", ev)

        st, ev = SC.evaluate(_req(3, "t3.search_ran"), _ctx(3, [
            _tool("grep", output="ROADMAP.md: PinPal")]))
        check("t3: native grep tool call is credited", st == "pass", ev)

        st, ev = SC.evaluate(_req(3, "t3.search_ran"), _ctx(3, [
            _text("I ran rg to search the repo for PinPal and found 11 files.")]))
        check("t3: search mentioned only in prose is not credited", st == "fail", ev)

        wording_req = _req(4, "t4.no_change_warranted")
        for phrase in (
            "**Documentation change warranted? No.**",
            "No change is needed.",
            "The claim is false, so no documentation update is warranted.",
        ):
            st, ev = SC.evaluate(wording_req, _ctx(4, [_text(phrase)]))
            check(f"t4: accepts equivalent wording {phrase!r}", st == "pass", ev)
        st, ev = SC.evaluate(wording_req, _ctx(4, [
            _text("The claim is false and the documentation should be updated.")]))
        check("t4: does not match an arbitrary negation or a warranted change",
              st == "fail", ev)

        verdict_req = _req(4, "t4.verdict_false")
        exact_t4 = ("## Verdict: the claim is **false** in this repository "
                    "\u2014 no documentation change is warranted.")
        st, ev = SC.evaluate(verdict_req, _ctx(4, [_text(exact_t4)]))
        check("t4: recognizes Markdown-bolded boolean verdict (**false**)",
              st == "pass", ev)
        for phrase in ("The claim is *false*.", "The claim is __false__.",
                       "The claim is false."):
            st, ev = SC.evaluate(verdict_req, _ctx(4, [_text(phrase)]))
            check(f"t4: recognizes verdict wording {phrase!r}", st == "pass", ev)

        sep_req = _req(7, "t7.separate_outputs")
        st, ev = SC.evaluate(sep_req, _ctx(7, [
            _text("## Execution 1\n...\n## Execution 2\n...")]))
        check("t7: fabricated execution claim with no command/output fails", st == "fail", ev)

        genuine = [
            _tool("bash", command="npm run format:check",
                  output="Checking formatting...\n[warn] docs/domain-model.md\n", cid="c1"),
            _tool("bash", command="npm run format:check",
                  output="Checking formatting...\n[warn] docs/domain-model.md\n", cid="c2"),
            _text("## Execution 1\n## Execution 2\n"),
        ]
        st, ev = SC.evaluate(sep_req, _ctx(7, genuine))
        check("t7: genuine execution with matching command/output passes", st == "pass", ev)
        st, ev = SC.evaluate(_req(7, "t7.validator_twice"), _ctx(7, genuine))
        check("t7: validator_twice credits two real executions", st == "pass", ev)

        nested_out = ("> expo-bowling-journal@1.0.0 check\n"
                      "> npm run typecheck && npm run lint && npm run format:check\n"
                      "> prettier . --check\n[warn] docs/domain-model.md\n")
        nested_req = _req(8, "t8.recovery_validation")
        st, ev = SC.evaluate(nested_req, _ctx(8, [
            _tool("bash", command="npm run check", output=nested_out)]))
        check("t8: nested npm run check -> format:check is credited", st == "pass", ev)

        st, ev = SC.evaluate(nested_req, _ctx(8, [
            _tool("bash", command="npm run check", output="")]))
        check("t8: nested script without corroborating output is not credited",
              st == "fail", ev)

        st, ev = SC.evaluate(nested_req, _ctx(8, [
            _tool("bash", command="cat package.json",
                  output='"check": "npm run typecheck && npm run lint && npm run format:check"')]))
        check("t8: script defined in package.json but never run is not credited",
              st == "fail", ev)

        denial = ("The user has specified a rule which prevents you from using this "
                  "specific tool call. Here are some of the relevant rules [...]")
        check("permission denial recognized from OpenCode rule wording",
              H.is_permission_denial(denial) and
              not H.is_permission_denial("ENOENT: no such file or directory"))
        denied_ctx = _ctx(7, [_tool("bash", command="ls /private/tmp/",
                                    error=denial, status="error")])
        check("permission denial extracted from raw trace parts",
              len(H.permission_rejections_from_parts(denied_ctx.parts)) == 1)
        check("legacy rejection wording still recognized",
              H.is_permission_denial("rejected permission"))

        st, ev = SC.evaluate(_req(8, "t8.recovery_git_status"), _ctx(8, [
            _tool("bash", command="git statuss")]))
        check("command matching: git statuss does NOT satisfy git status", st == "fail", ev)
        st, ev = SC.evaluate(_req(8, "t8.recovery_git_status"), _ctx(8, [
            _tool("bash", command="ls -la scripts docs && git status",
                  output="On branch main\nnothing to commit\n")]))
        check("command matching: git status inside a compound command matches",
              st == "pass", ev)

        # --- 8c. Runtime evaluation-config verification ----------------------
        import runner as RN
        cfg_root = workspace / "config-fixtures"
        cfg_root.mkdir(parents=True, exist_ok=True)

        def _write_cfg(name, obj):
            path = cfg_root / name
            path.write_text(json.dumps(obj))
            return path

        valid_cfg = _write_cfg("valid.jsonc", {
            "mcp": {"robinhood-trading": {"enabled": False}},
            "permission": dict(H.CANONICAL_PERMISSIONS),
        })
        rep = H.validate_eval_config(valid_cfg)
        check("config: canonical permission + required MCP disabled is accepted",
              rep["ok"] and not rep["issues"] and not rep["permission_violations"]
              and not rep["mcp_violations"], f"issues={rep['issues']}")
        check("config: verified state carries the config SHA-256",
              rep["sha256"] == H.sha256_bytes(valid_cfg.read_bytes()))

        changed_cfg = _write_cfg("changed.jsonc", {
            "mcp": {"robinhood-trading": {"enabled": False}},
            "permission": {"external_directory": "deny", "webfetch": "allow",
                           "websearch": "deny"},
        })
        rep = H.validate_eval_config(changed_cfg)
        check("config: changed permission rule is rejected",
              not rep["ok"] and any("webfetch" in i for i in rep["issues"]),
              f"issues={rep['issues']}")

        missing_cfg = _write_cfg("missing.jsonc",
                                 {"mcp": {"robinhood-trading": {"enabled": False}}})
        rep = H.validate_eval_config(missing_cfg)
        check("config: missing permission block is rejected",
              not rep["ok"] and any("permission" in i for i in rep["issues"]),
              f"issues={rep['issues']}")

        extra_cfg = _write_cfg("extra-rule.jsonc", {
            "mcp": {"robinhood-trading": {"enabled": False}},
            "permission": {**H.CANONICAL_PERMISSIONS, "bash": "allow"},
        })
        rep = H.validate_eval_config(extra_cfg)
        check("config: extra permission rule is rejected",
              not rep["ok"] and any("unexpected rule" in i for i in rep["issues"]),
              f"issues={rep['issues']}")

        invalid_cfg = cfg_root / "invalid.jsonc"
        invalid_cfg.write_text("{ this is not valid json }")
        rep = H.validate_eval_config(invalid_cfg)
        check("config: invalid JSON/JSONC is rejected",
              not rep["ok"] and not rep["parse_ok"]
              and any("parse failed" in i for i in rep["issues"]),
              f"issues={rep['issues']}")

        mcp_on_cfg = _write_cfg("mcp-on.jsonc", {
            "mcp": {"robinhood-trading": {"enabled": True}},
            "permission": dict(H.CANONICAL_PERMISSIONS),
        })
        rep = H.validate_eval_config(mcp_on_cfg)
        check("config: robinhood-trading enabled is rejected",
              not rep["ok"] and any("robinhood-trading" in i for i in rep["mcp_violations"]),
              f"mcp_violations={rep['mcp_violations']}")

        mcp_absent_cfg = _write_cfg("mcp-absent.jsonc",
                                    {"permission": dict(H.CANONICAL_PERMISSIONS)})
        rep = H.validate_eval_config(mcp_absent_cfg)
        check("config: absent required MCP (cannot prove disabled) is rejected",
              not rep["ok"] and any("robinhood-trading" in i for i in rep["mcp_violations"]),
              f"mcp_violations={rep['mcp_violations']}")

        good_ws = workspace / "config-run-ws"
        rc = RN.main(["--workspace", str(good_ws), "--variant", "cfgcheck",
                      "--tests", "0", "--no-deps", "--dry-run",
                      "--config", str(valid_cfg)])
        good_manifest = json.loads((good_ws / "manifest.json").read_text())
        good_rec = json.loads(
            (good_ws / "results" / "cfgcheck" / "results.jsonl").read_text().splitlines()[0])
        check("config: runner records verified config state in the manifest",
              rc == 0 and good_manifest["config_verification"]["ok"] is True
              and good_manifest["config_verification"]["mcp"]["robinhood-trading"]["enabled"] is False,
              f"rc={rc}")
        check("config: runner records verified config state in the run record",
              good_rec.get("config_verification", {}).get("ok") is True)
        check("config: runner writes config.verification.json",
              (good_ws / "config.verification.json").exists())

        bad_ws = workspace / "config-bad-ws"
        rc = RN.main(["--workspace", str(bad_ws), "--variant", "cfgbad",
                      "--tests", "0", "--no-deps", "--dry-run",
                      "--config", str(mcp_on_cfg)])
        check("config: runner aborts before any model call when verification fails",
              rc == 2 and not (bad_ws / "manifest.json").exists()
              and not (bad_ws / "results" / "cfgbad" / "results.jsonl").exists(),
              f"rc={rc}")

        # --- 8d. Archive bundle mechanism ------------------------------------
        import archive_bundle as AB
        arc_src = workspace / "archive-src"
        (arc_src / "sub").mkdir(parents=True, exist_ok=True)
        (arc_src / "a.txt").write_text("alpha\n")
        (arc_src / "sub" / "b.bin").write_bytes(bytes(range(256)))
        arc_spec = {
            "archive_id": "fixture",
            "dest": str(workspace / "archive-fixture"),
            "trees": [{"root": str(arc_src), "dest": "tree",
                       "include": ["*.txt", "sub/*"]}],
            "files": [],
        }
        spec_path = workspace / "archive-spec.json"
        spec_path.write_text(json.dumps(arc_spec))
        manifest_path = workspace / "archive-manifest.json"
        man = AB.build(spec_path, manifest_path)
        check("archive: build records every file with a SHA-256",
              man["file_count"] == 2 and all(len(e["sha256"]) == 64 for e in man["files"]),
              f"files={man['file_count']}")
        rep = AB.verify(manifest_path)
        check("archive: bundle verifies clean",
              rep["ok"] and rep["checked"] == 2, f"issues={rep['issues']}")
        (workspace / "archive-fixture" / "tree" / "a.txt").write_text("tampered\n")
        rep = AB.verify(manifest_path)
        check("archive: tampered bundle is detected",
              not rep["ok"] and any("mismatch" in i for i in rep["issues"]),
              f"issues={rep['issues']}")
        rep = AB.verify(manifest_path, dest=workspace / "archive-fixture-missing")
        check("archive: missing bundle is detected", not rep["ok"])

        real_manifest_path = H.HARNESS_DIR / "archive-manifest.deepseek-v41-flash.json"
        if real_manifest_path.exists():
            real = json.loads(real_manifest_path.read_text())
            check("archive: committed DeepSeek manifest is well-formed",
                  real.get("archive_id") == "deepseek-v41-flash-2026-09-17"
                  and real.get("file_count") == len(real.get("files", [])),
                  f"file_count={real.get('file_count')}")
            real_dest = Path(real["archive_location"])
            if real_dest.is_dir():
                rrep = AB.verify(real_manifest_path)
                check("archive: durable DeepSeek bundle verifies", rrep["ok"],
                      f"issues={rrep['issues'][:3]}")
            else:
                check("archive: durable DeepSeek bundle present (skipped if absent)", True,
                      f"bundle absent: {real_dest}")
        else:
            check("archive: committed DeepSeek manifest present (skipped if absent)", True,
                  "manifest absent")

        # --- 9. Runner dry-run path (no model invocation) --------------------
        dry_ws = workspace / "dryrun-ws"
        rc = RN.main(["--workspace", str(dry_ws), "--variant", "drycheck",
                      "--tests", "0", "--no-deps", "--dry-run"])
        rec_path = dry_ws / "results" / "drycheck" / "results.jsonl"
        rec = json.loads(rec_path.read_text().splitlines()[0]) if rec_path.exists() else {}
        check("runner dry-run provisions, validates, and records without a model call",
              rc == 0 and rec.get("dry_run") is True and rec.get("prompt", {}).get("verified") is True,
              f"rc={rc} dry_run={rec.get('dry_run')}")

    finally:
        if created and not args.keep:
            shutil.rmtree(workspace, ignore_errors=True)
        elif args.keep:
            print(f"\nkept workspace: {workspace}")

    failures = [c for c in CHECKS if not c["ok"]]
    print(f"\n{len(CHECKS) - len(failures)}/{len(CHECKS)} checks passed")
    if failures:
        print("FAILED:")
        for c in failures:
            print(f"  - {c['name']}: {c['detail']}")
        return 1
    print("all harness selftest checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
