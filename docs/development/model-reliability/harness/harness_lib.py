#!/usr/bin/env python3
"""Shared library for the OpenCode model-reliability evaluation harness.

This module implements the corrected harness methodology described in
`harness/README.md`:

* a sanitized, deterministic clean baseline built from a ``git archive`` export
  (never ``git clone --local``), with the model-reliability documentation and
  prompt set excluded from the evaluated content;
* fresh, isolated per-test clones with copied (never symlinked) dependencies;
* mandatory baseline-HEAD / clean-tree validation before a test may run;
* prompt-integrity verification against ``prompt_manifest.json``;
* complete Git-state capture (untracked nested files, ignored files, staged and
  unstaged diffs, final HEAD, commits created during the run);
* exact working-directory session matching (no recency fallback);
* permission evidence capture from the OpenCode session DB and log.

The library is infrastructure only: it does not touch the application source,
the tracked baseline, or the prompt text.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

HARNESS_DIR = Path(__file__).resolve().parent
# docs/development/model-reliability/harness -> repo root
REPO_ROOT = HARNESS_DIR.parents[3]
MODEL_RELIABILITY_DIR = REPO_ROOT / "docs" / "development" / "model-reliability"
PROMPTS_DIR = MODEL_RELIABILITY_DIR / "opencode-prompts"

PROMPT_MANIFEST_PATH = HARNESS_DIR / "prompt_manifest.json"
GROUND_TRUTH_PATH = HARNESS_DIR / "ground_truth.json"
PERMISSION_POLICY_PATH = HARNESS_DIR / "opencode-eval-permissions.json"

# Last commit before any model-reliability evaluation document existed. Its tree
# contains no `docs/development/model-reliability/` content and no prompt files.
DEFAULT_BASELINE_REF = "a07d38e8f3d48c6880759cb69d0c1f42433c7b03"
# Deterministic SHA produced by provisioning DEFAULT_BASELINE_REF with a fixed
# commit identity/date and the eval directory removed. Verified by provisioning.
EXPECTED_BASELINE_SHA = "ef91057c47744b25dc5e14af16ed9b7ad609c0f4"
BASELINE_COMMIT_DATE = "2026-09-15T00:00:00 +0000"
BASELINE_COMMIT_AUTHOR_NAME = "Model Reliability Harness"
BASELINE_COMMIT_AUTHOR_EMAIL = "harness@localhost"
BASELINE_COMMIT_MESSAGE = "baseline: sanitized pre-evaluation source (a07d38e)"

# Directory excluded from the evaluated repository content in addition to the
# sanitized baseline. Defense in depth: also strips eval prose/prompts/harness.
EVAL_EXCLUDE_PATH = "docs/development/model-reliability"

DEFAULT_TESTS = list(range(9))

OPENCODE_DB = Path(os.environ.get("OPENCODE_DB", "~/.local/share/opencode/opencode.db")).expanduser()
OPENCODE_LOG = Path(os.environ.get("OPENCODE_LOG", "~/.local/share/opencode/log/opencode.log")).expanduser()

# Single, uniform permission policy for every evaluation config. External
# directories and web tools are denied outright; temporary files are redirected
# into a controlled repository-local directory (see runner.py).
CANONICAL_PERMISSIONS = {
    "external_directory": "deny",
    "webfetch": "deny",
    "websearch": "deny",
}

# Written to each clone's .git/info/exclude. This never modifies the tracked
# baseline; it only prevents harness/dependency files from producing false
# dirty-tree results.
GIT_EXCLUDE_LINES = [
    "# model-reliability harness exclusions (git-info only; not part of the tracked baseline)",
    "node_modules",
    ".eval-tmp/",
    ".opencode/",
    "*.pinpal",
]

DEFAULT_EVAL_CONFIG_GLOB = "opencode.*eval*.jsonc"


class HarnessError(RuntimeError):
    """Raised when a harness invariant is violated and the run must abort."""


# ---------------------------------------------------------------------------
# Generic process helpers
# ---------------------------------------------------------------------------

def run(cmd, cwd=None, env=None, timeout=120, check=False, input_text=None):
    """Run a command, returning CompletedProcess. Never raises on non-zero
    unless ``check`` is set (subprocess semantics)."""
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=check,
        input=input_text,
    )


def _require_ok(proc, what):
    if proc.returncode != 0:
        raise HarnessError(
            f"{what} failed (rc={proc.returncode}): "
            f"{(proc.stderr or proc.stdout or '').strip()[:500]}"
        )
    return proc


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path: Path):
    return json.loads(Path(path).read_text())


def write_json(path: Path, data) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n")


# ---------------------------------------------------------------------------
# Prompt / manifest integrity
# ---------------------------------------------------------------------------

def load_prompt_manifest(path: Path = PROMPT_MANIFEST_PATH) -> dict:
    manifest = read_json(path)
    if "tests" not in manifest or not isinstance(manifest["tests"], list):
        raise HarnessError(f"prompt manifest {path} has no 'tests' list")
    return manifest


def verify_prompt_set(prompts_dir: Path = PROMPTS_DIR,
                      manifest_path: Path = PROMPT_MANIFEST_PATH) -> dict:
    """Verify the on-disk prompt set exactly matches the manifest.

    Checks: every expected test id is present, no unexpected ``tN.txt`` exists,
    and every file's byte length and SHA-256 match the manifest. Returns a
    report with ``ok`` and a list of issues; callers must abort when not ok.
    """
    manifest = load_prompt_manifest(manifest_path)
    expected = {str(t["id"]): t for t in manifest["tests"]}
    prompts_dir = Path(prompts_dir).resolve()

    found = {}
    for child in sorted(prompts_dir.glob("t*.txt")):
        m = re.fullmatch(r"t(\d+)\.txt", child.name)
        if m:
            found[m.group(1)] = child

    report = {
        "prompts_dir": str(prompts_dir),
        "manifest": str(Path(manifest_path).resolve()),
        "expected_ids": sorted(int(i) for i in expected),
        "found_ids": sorted(int(i) for i in found),
        "issues": [],
        "prompts": {},
        "ok": True,
    }

    missing = sorted(set(expected) - set(found))
    extra = sorted(set(found) - set(expected))
    if missing:
        report["issues"].append(f"missing prompt files for tests: {missing}")
    if extra:
        report["issues"].append(f"unexpected prompt files for tests: {extra}")

    for tid in sorted(expected, key=int):
        spec = expected[tid]
        path = found.get(tid)
        entry = {
            "id": int(tid),
            "file": spec.get("file", f"t{tid}.txt"),
            "expected_sha256": spec["sha256"],
            "expected_bytes": spec.get("bytes"),
        }
        if path is None:
            entry.update({"present": False, "sha256": None, "bytes": None, "match": False})
            report["prompts"][tid] = entry
            continue
        data = path.read_bytes()
        sha = sha256_bytes(data)
        match = sha == spec["sha256"] and len(data) == spec.get("bytes", len(data))
        entry.update({"present": True, "sha256": sha, "bytes": len(data), "match": match,
                      "path": str(path)})
        if not match:
            report["issues"].append(
                f"t{tid} hash mismatch: on-disk sha256={sha} bytes={len(data)} "
                f"expected sha256={spec['sha256']} bytes={spec.get('bytes')}"
            )
        report["prompts"][tid] = entry

    report["ok"] = not report["issues"]
    return report


# ---------------------------------------------------------------------------
# Clean baseline provisioning
# ---------------------------------------------------------------------------

def _git_env(commit_date: str = BASELINE_COMMIT_DATE) -> dict:
    env = os.environ.copy()
    env.update({
        "GIT_AUTHOR_NAME": BASELINE_COMMIT_AUTHOR_NAME,
        "GIT_AUTHOR_EMAIL": BASELINE_COMMIT_AUTHOR_EMAIL,
        "GIT_COMMITTER_NAME": BASELINE_COMMIT_AUTHOR_NAME,
        "GIT_COMMITTER_EMAIL": BASELINE_COMMIT_AUTHOR_EMAIL,
        "GIT_AUTHOR_DATE": commit_date,
        "GIT_COMMITTER_DATE": commit_date,
    })
    return env


def copy_tree(src: Path, dst: Path) -> None:
    """Copy a directory tree into ``dst`` using a real copy.

    On macOS an APFS clone (``cp -cR``) is attempted first: it is fast and
    copy-on-write, but it is a genuine, independent file tree -- never a
    symlink to the source. Falls back to ``cp -aR`` and then ``shutil.copytree``.
    """
    src, dst = Path(src), Path(dst)
    if dst.exists():
        shutil.rmtree(dst)
    if sys.platform == "darwin":
        last = None
        for flags in (["-cR"], ["-aR"], ["-R"]):
            proc = run(["cp", *flags, str(src), str(dst)])
            if proc.returncode == 0:
                return
            last = proc
        raise HarnessError(
            f"failed to copy {src} -> {dst}: {(last.stderr or last.stdout or '').strip()[:300]}")
        
    shutil.copytree(src, dst, symlinks=True)


def ensure_git_exclude(clone: Path) -> None:
    """Add harness exclusions to .git/info/exclude (never the tracked tree)."""
    clone = Path(clone)
    exclude = clone / ".git" / "info" / "exclude"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    existing = exclude.read_text() if exclude.exists() else ""
    lines = existing.splitlines()
    changed = False
    for line in GIT_EXCLUDE_LINES:
        if line not in lines:
            lines.append(line)
            changed = True
    if changed or not exclude.exists():
        exclude.write_text("\n".join(lines).rstrip("\n") + "\n")


def provision_baseline(workspace: Path,
                       repo: Path = REPO_ROOT,
                       baseline_ref: str = DEFAULT_BASELINE_REF,
                       commit_date: str = BASELINE_COMMIT_DATE,
                       expected_sha: str | None = EXPECTED_BASELINE_SHA,
                       copy_deps: bool = True,
                       deps_src: Path | None = None,
                       force: bool = False,
                       exclude_path: str = EVAL_EXCLUDE_PATH,
                       scan_symlinks: bool = True) -> dict:
    """Build the sanitized clean baseline repo under ``workspace/baseline``.

    Steps: export the baseline ref with ``git archive`` into a fresh directory,
    delete the eval directory, ``git init`` a fresh single-commit repo, then copy
    dependencies (real copy, no symlink) into the gitignored ``node_modules``.
    """
    workspace = Path(workspace).resolve()
    repo = Path(repo).resolve()
    baseline = workspace / "baseline"
    meta_path = workspace / "baseline.meta.json"

    if baseline.exists() and not force:
        if not meta_path.exists():
            raise HarnessError(
                f"{baseline} exists but {meta_path} is missing; re-run with --force"
            )
        meta = read_json(meta_path)
        if expected_sha and meta.get("head") != expected_sha:
            raise HarnessError(
                f"existing baseline HEAD {meta.get('head')} != expected {expected_sha}; "
                "re-run with --force")
        ok, report = validate_clone(baseline, meta.get("head", expected_sha), repo,
                                    require_clean=True, scan_symlinks=scan_symlinks)
        if not ok:
            raise HarnessError(f"existing baseline {baseline} is invalid: {report['issues']}")
        return meta

    if baseline.exists():
        shutil.rmtree(baseline)
    baseline.mkdir(parents=True)
    workspace.mkdir(parents=True, exist_ok=True)

    # 1. Export the baseline ref. A fresh directory + fresh repo means no main
    #    repository refs, reflogs, or unreachable objects can be copied.
    with tempfile.NamedTemporaryFile(suffix=".tar", delete=False) as tf:
        tar_path = Path(tf.name)
    try:
        proc = run(["git", "-C", str(repo), "archive", "--format=tar",
                    f"--output={tar_path}", baseline_ref])
        _require_ok(proc, f"git archive {baseline_ref}")
        proc = run(["tar", "-xf", str(tar_path), "-C", str(baseline)])
        _require_ok(proc, "tar extract baseline")
    finally:
        tar_path.unlink(missing_ok=True)

    # 2. Exclude model-reliability documentation/prompts/harness from the
    #    evaluated content (defense in depth; the ref already lacks them).
    excluded = baseline / exclude_path
    excluded_present = excluded.exists()
    if excluded_present:
        shutil.rmtree(excluded)

    # 3. Fresh repo with a single deterministic commit.
    for cmd in (
        ["git", "init", "-q", "-b", "main"],
        ["git", "config", "user.name", BASELINE_COMMIT_AUTHOR_NAME],
        ["git", "config", "user.email", BASELINE_COMMIT_AUTHOR_EMAIL],
        ["git", "config", "core.autocrlf", "false"],
        ["git", "add", "-A"],
        ["git", "commit", "-q", "-m", BASELINE_COMMIT_MESSAGE],
    ):
        proc = run(cmd, cwd=baseline, env=_git_env(commit_date) if cmd[1] == "commit" else None)
        _require_ok(proc, " ".join(cmd))

    head = run(["git", "-C", str(baseline), "rev-parse", "HEAD"]).stdout.strip()
    tree = run(["git", "-C", str(baseline), "rev-parse", "HEAD^{tree}"]).stdout.strip()
    if expected_sha and head != expected_sha:
        raise HarnessError(
            f"baseline HEAD {head} != expected {expected_sha}; the source ref or "
            f"environment changed the baseline tree"
        )
    if not head:
        raise HarnessError("baseline HEAD could not be resolved")

    ensure_git_exclude(baseline)
    (baseline / ".eval-tmp").mkdir(exist_ok=True)

    # 4. Copy dependencies as a real tree (never a symlink to the live repo).
    deps = Path(deps_src) if deps_src else (repo / "node_modules")
    deps_copied = False
    if copy_deps and deps.exists():
        copy_tree(deps, baseline / "node_modules")
        deps_copied = True

    tracked = run(["git", "-C", str(baseline), "ls-files"]).stdout.splitlines()
    meta = {
        "head": head,
        "tree": tree,
        "branch": "main",
        "source_ref": baseline_ref,
        "source_repo": str(repo),
        "exclude_path": exclude_path,
        "excluded_present_in_ref": excluded_present,
        "tracked_files": len(tracked),
        "deps_copied": deps_copied,
        "deps_source": str(deps),
        "commit_date": commit_date,
        "created_at": now_iso(),
        "provisioned_by": "harness/prepare_baseline.py",
    }
    write_json(meta_path, meta)

    # 5. Final validation of the freshly built baseline.
    ok, report = validate_clone(baseline, head, repo, require_clean=True,
                                scan_symlinks=scan_symlinks)
    if not ok:
        raise HarnessError(f"provisioned baseline failed validation: {report['issues']}")
    write_json(workspace / "baseline.validation.json", report)
    return meta


# ---------------------------------------------------------------------------
# Clone creation and validation
# ---------------------------------------------------------------------------

def make_clone(baseline: Path, clone: Path) -> Path:
    """Create an isolated per-test clone as a real copy of the baseline."""
    baseline, clone = Path(baseline), Path(clone)
    clone.parent.mkdir(parents=True, exist_ok=True)
    if clone.exists():
        shutil.rmtree(clone)
    copy_tree(baseline, clone)
    ensure_git_exclude(clone)
    (clone / ".eval-tmp").mkdir(exist_ok=True)
    return clone


def scan_symlink_escapes(root: Path, live_repo: Path, max_entries: int = 400000) -> list:
    """Return symlinks under ``root`` whose resolved target escapes ``root``.

    This catches dependency symlinks (e.g. a node_modules symlink to the live
    repository) and any path-traversal escape that would expose the main repo.
    """
    root = Path(root).resolve()
    live_repo = Path(live_repo).resolve()
    escapes = []
    seen = 0
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        for name in list(dirnames) + list(filenames):
            path = Path(dirpath) / name
            seen += 1
            if seen > max_entries:
                return escapes
            if not path.is_symlink():
                continue
            try:
                target = Path(os.path.realpath(path))
            except OSError:
                continue
            rel = None
            inside = False
            try:
                rel = target.relative_to(root)
                inside = True
            except ValueError:
                inside = False
            if not inside:
                entry = {"link": str(path), "target": str(target)}
                try:
                    target.relative_to(live_repo)
                    entry["escapes_into_live_repo"] = True
                except ValueError:
                    entry["escapes_into_live_repo"] = False
                escapes.append(entry)
    return escapes


def validate_clone(clone: Path, expected_sha: str | None, live_repo: Path = REPO_ROOT,
                   require_clean: bool = True, scan_symlinks: bool = True) -> tuple[bool, dict]:
    """Validate a clone before a test runs.

    Enforces: HEAD == expected baseline SHA, exactly one ref (``refs/heads/main``),
    a clean working tree (no tracked modifications / untracked non-ignored files),
    ``node_modules`` is not a symlink, and no symlink escapes the clone.
    """
    clone = Path(clone).resolve()
    report = {
        "clone": str(clone),
        "expected_head": expected_sha,
        "issues": [],
        "symlink_escapes": [],
        "deps_is_symlink": None,
        "tracked_modifications": None,
        "untracked_files": None,
        "ok": True,
    }

    if not clone.is_dir():
        report["issues"].append("clone directory does not exist")
        report["ok"] = False
        return False, report

    def g(*args):
        return run(["git", "-C", str(clone), *args], timeout=60)

    head = g("rev-parse", "HEAD").stdout.strip()
    report["head"] = head
    if expected_sha and head != expected_sha:
        report["issues"].append(f"HEAD {head} != expected {expected_sha}")

    refs = [r for r in g("for-each-ref", "--format=%(refname)").stdout.splitlines() if r]
    report["refs"] = refs
    if refs != ["refs/heads/main"]:
        report["issues"].append(f"unexpected refs: {refs} (expected only refs/heads/main)")

    status = g("status", "--porcelain", "-uall").stdout
    tracked_mods = g("diff", "--name-only").stdout.splitlines()
    report["tracked_modifications"] = tracked_mods
    report["untracked_files"] = [x for x in g(
        "ls-files", "--others", "--exclude-standard").stdout.splitlines() if x]
    if require_clean and (status.strip() or tracked_mods or report["untracked_files"]):
        report["issues"].append(
            "clone is not clean before the run: "
            f"status={status.strip()[:300]!r} tracked={tracked_mods} "
            f"untracked={report['untracked_files'][:10]}"
        )

    nm = clone / "node_modules"
    report["deps_is_symlink"] = nm.is_symlink()
    if nm.is_symlink():
        report["issues"].append("node_modules is a symlink (must be a real copied tree)")

    if scan_symlinks:
        escapes = scan_symlink_escapes(clone, live_repo)
        report["symlink_escapes"] = escapes
        if escapes:
            report["issues"].append(
                f"{len(escapes)} symlink(s) escape the clone, e.g. {escapes[0]}"
            )

    report["ok"] = not report["issues"]
    return report["ok"], report


def provision_clones(workspace: Path, tests=DEFAULT_TESTS, baseline: Path | None = None,
                     expected_sha: str = EXPECTED_BASELINE_SHA, live_repo: Path = REPO_ROOT,
                     scan_symlinks: bool = True) -> dict:
    """Create and validate one isolated clone per test."""
    workspace = Path(workspace).resolve()
    baseline = Path(baseline) if baseline else workspace / "baseline"
    clones_dir = workspace / "clones"
    clones_dir.mkdir(parents=True, exist_ok=True)
    results = {}
    for n in tests:
        clone = clones_dir / f"t{n}"
        make_clone(baseline, clone)
        ok, report = validate_clone(clone, expected_sha, live_repo, scan_symlinks=scan_symlinks)
        results[str(n)] = report
        if not ok:
            raise HarnessError(f"clone t{n} failed validation: {report['issues']}")
    write_json(workspace / "clones.validation.json", results)
    return results


# ---------------------------------------------------------------------------
# Git-state capture
# ---------------------------------------------------------------------------

def git_state(clone: Path, baseline_sha: str | None = None) -> dict:
    """Capture complete Git state for a clone: HEAD, refs, staged/unstaged/full
    diffs, all untracked (nested) files, ignored files, and commits since the
    baseline."""
    clone = Path(clone)
    empty = {"head": None, "error": None}

    def g(*args, timeout=60):
        return run(["git", "-C", str(clone), *args], timeout=timeout)

    def out(*args):
        return g(*args).stdout

    state = {
        "head": out("rev-parse", "HEAD").strip(),
        "head_short": out("rev-parse", "--short", "HEAD").strip(),
        "branch": out("rev-parse", "--abbrev-ref", "HEAD").strip(),
        "refs": [r for r in out("for-each-ref", "--format=%(refname)").splitlines() if r],
        "status_porcelain": out("status", "--porcelain", "-uall"),
        "status_ignored": out("status", "--porcelain", "--ignored", "-uall"),
        "untracked_files": [x for x in out("ls-files", "--others", "--exclude-standard").splitlines() if x],
        "ignored_files": [x for x in out("ls-files", "--others", "--ignored", "--exclude-standard").splitlines() if x],
        "diff_unstaged": out("diff"),
        "diff_staged": out("diff", "--cached"),
        "diff_head": out("diff", "HEAD"),
    }
    state["clean"] = state["status_porcelain"].strip() == ""

    if baseline_sha:
        state["diff_vs_baseline"] = out("diff", baseline_sha)
        state["changed_files_vs_baseline"] = [
            x for x in out("diff", "--name-only", baseline_sha, "HEAD").splitlines() if x
        ]
        commits = []
        raw = out("log", "--reverse", "--pretty=format:%H%x1f%s%x1e", f"{baseline_sha}..HEAD")
        for chunk in raw.split("\x1e"):
            chunk = chunk.strip()
            if not chunk:
                continue
            sha, _, subject = chunk.partition("\x1f")
            commits.append({"sha": sha.strip(), "subject": subject.strip()})
        state["commits_since_baseline"] = commits
        state["commit_count"] = len(commits)
    return state


# ---------------------------------------------------------------------------
# Session and permission capture
# ---------------------------------------------------------------------------

def _db_query(sql: str, params=(), db: Path = OPENCODE_DB):
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=30)
    try:
        cur = con.execute(sql, params)
        return cur.fetchall()
    finally:
        con.close()


def session_report(start_ms: int, clone: Path, end_ms: int | None = None,
                   db: Path = OPENCODE_DB) -> dict:
    """Identify the evaluation session by exact resolved working directory.

    Matching requires ``session.directory == realpath(clone)``; there is no
    recency-only fallback. Multiple matches are reported as ``ambiguous``.
    """
    realdir = os.path.realpath(str(clone))
    report = {
        "session_id": None,
        "directory_realpath": realdir,
        "match": "none",
        "matches": [],
        "db": str(db),
        "notes": [],
    }
    if not Path(db).exists():
        report["notes"].append(f"session database not found: {db}")
        return report

    hi = end_ms if end_ms is not None else start_ms + 24 * 3600 * 1000
    try:
        rows = _db_query(
            "select id, directory, time_created from session "
            "where directory = ? and time_created >= ? and time_created <= ? "
            "order by time_created asc",
            (realdir, start_ms - 5000, hi),
            db,
        )
    except Exception as exc:  # pragma: no cover - defensive
        report["notes"].append(f"session query failed: {exc}")
        return report

    report["matches"] = [{"id": r[0], "directory": r[1], "time_created": r[2]} for r in rows]
    if not rows:
        report["notes"].append(
            "no session matched the exact realpath working directory in the run window"
        )
        return report
    if len(rows) > 1:
        report["match"] = "ambiguous"
        report["notes"].append(
            f"{len(rows)} sessions matched the exact directory in the run window; "
            "selected the earliest"
        )
    else:
        report["match"] = "exact"
    sid = rows[0][0]
    report["session_id"] = sid

    try:
        roles = _db_query(
            "select coalesce(json_extract(data,'$.role'),'?')||':'||count(*) from message "
            "where session_id=? group by 1", (sid,), db)
        parts = _db_query(
            "select coalesce(json_extract(data,'$.type'),'?')||':'||count(*) from part "
            "where session_id=? group by 1", (sid,), db)
        meta = _db_query(
            "select json_extract(data,'$.providerID'), json_extract(data,'$.modelID') "
            "from message where session_id=? and json_extract(data,'$.role')='assistant' "
            "order by time_created asc limit 1", (sid,), db)
        toks = _db_query(
            "select tokens_input, tokens_output, tokens_reasoning from session where id=?",
            (sid,), db)
        max_step = _db_query(
            "select max(cast(json_extract(data,'$.tokens.input') as integer)) from part "
            "where session_id=? and json_extract(data,'$.type')='step-finish'", (sid,), db)
        report["roles"] = [r[0] for r in roles]
        report["parts"] = [r[0] for r in parts]
        if meta:
            report["session_provider"] = meta[0][0]
            report["session_model"] = meta[0][1]
        if toks:
            report["tokens_in_out_reason"] = list(toks[0])
        if max_step and max_step[0]:
            report["max_step_input_tokens"] = max_step[0][0]
    except Exception as exc:  # pragma: no cover - defensive
        report["notes"].append(f"session metadata query failed: {exc}")
    return report


def session_permission_rejections(session_id: str, db: Path = OPENCODE_DB) -> list:
    """Tool calls rejected by the permission layer, from the session DB.

    OpenCode does not persist permission *requests* as session parts; only the
    resulting tool error is stored. This extracts those errors.
    """
    events = []
    if not session_id or not Path(db).exists():
        return events
    try:
        rows = _db_query(
            "select data from part where session_id=? and json_extract(data,'$.type')='tool'",
            (session_id,), db)
    except Exception:
        return events
    for (data,) in rows:
        try:
            p = json.loads(data)
        except Exception:
            continue
        st = p.get("state") or {}
        err = st.get("error")
        if st.get("status") == "error" and err:
            text = str(err)
            rejected = "rejected permission" in text.lower()
            events.append({
                "tool": p.get("tool"),
                "callID": p.get("callID"),
                "input": st.get("input"),
                "error": text,
                "permission_rejection": rejected,
            })
    return events


_TS_RE = re.compile(r"timestamp=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)")
_ASK_RE = re.compile(r"message=asking id=(\S+) permission=(\S+) patterns=(.*)$")
_EVAL_PERM_RE = re.compile(r"message=evaluated permission=(\S+)")
_EVAL_PATTERN_RE = re.compile(r"pattern=(.*?)(?= action\.|$)")
_EVAL_ACTION_RE = re.compile(r"action\.action=(\S+)")
_EVAL_RULE_PATTERN_RE = re.compile(r"action\.pattern=(\S*)")


def _parse_log_ts(line: str):
    m = _TS_RE.search(line)
    if not m:
        return None
    try:
        return dt.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S.%fZ").replace(
            tzinfo=dt.timezone.utc)
    except ValueError:
        return None


def read_permission_log(start_iso: str, end_iso: str, log_path: Path = OPENCODE_LOG) -> dict:
    """Slice OpenCode's permission-relevant log lines for the run window.

    The log is process-global and permission lines carry no session id, so this
    is best-effort raw evidence, not a per-session authoritative record.
    """
    result = {
        "log_path": str(log_path),
        "window": {"start": start_iso, "end": end_iso},
        "available": False,
        "events": [],
        "raw_lines": [],
        "limitations": [
            "OpenCode does not persist permission requests/replies as session parts; "
            "the session DB exposes only the resulting tool error.",
            "opencode.log is process-global and permission lines contain no session id, "
            "so events cannot be attributed to a specific test session.",
        ],
    }
    if not Path(log_path).exists():
        result["limitations"].append(f"log file not found: {log_path}")
        return result

    def parse_iso(s):
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))

    lo, hi = parse_iso(start_iso), parse_iso(end_iso)
    try:
        with open(log_path, "r", errors="replace") as fh:
            for line in fh:
                if "message=asking" not in line and "message=evaluated" not in line:
                    continue
                ts = _parse_log_ts(line)
                if ts is None or ts < lo or ts > hi:
                    continue
                result["raw_lines"].append(line.rstrip("\n"))
                ev = {"timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S.%fZ")}
                m = _ASK_RE.search(line)
                if m:
                    ev.update({"kind": "asking", "request_id": m.group(1),
                               "permission": m.group(2), "patterns": m.group(3).strip()})
                else:
                    mp = _EVAL_PERM_RE.search(line)
                    if mp:
                        mpatt = _EVAL_PATTERN_RE.search(line)
                        mact = _EVAL_ACTION_RE.search(line)
                        mrule = _EVAL_RULE_PATTERN_RE.search(line)
                        ev.update({
                            "kind": "evaluated",
                            "permission": mp.group(1),
                            "pattern": mpatt.group(1).strip() if mpatt else None,
                            "action": mact.group(1) if mact else None,
                            "rule_pattern": mrule.group(1) if mrule else None,
                        })
                result["events"].append(ev)
    except OSError as exc:
        result["limitations"].append(f"log read failed: {exc}")
        return result
    result["available"] = True
    return result
