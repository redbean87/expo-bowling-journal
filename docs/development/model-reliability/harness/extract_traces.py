#!/usr/bin/env python3
"""Reconstruct per-test traces and permission evidence from the OpenCode session DB.

Writes, under ``<workspace>/results/<variant>/``:

* ``raw_parts.jsonl`` -- one line per session part, full fidelity, for auditing
  classifications later even if the session DB is unavailable;
* ``traces.txt`` -- human-readable per-test trace;
* ``permissions.json`` -- tool permission rejections plus the raw permission log
  slice captured by runner.py;
* ``trace.summary.json`` -- per-test completeness metadata, explicitly flagging
  missing or incomplete trace data.

OpenCode does not persist permission *requests* as session parts and
``opencode.log`` permission lines carry no session id. Those limitations are
recorded rather than papered over.

Usage:
    python3 extract_traces.py --workspace WS --variant devstral
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402


def clip(value, n=900):
    text = value if isinstance(value, str) else json.dumps(value)
    text = text.replace("\n", "\\n")
    return text[:n] + ("..." if len(text) > n else "")


def load_parts(session_id: str, db: Path = H.OPENCODE_DB):
    if not session_id:
        return []
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=30)
    try:
        rows = con.execute(
            "select data from part where session_id=? order by time_created, id",
            (session_id,)).fetchall()
    finally:
        con.close()
    parts = []
    for (data,) in rows:
        try:
            parts.append(json.loads(data))
        except json.JSONDecodeError:
            continue
    return parts


def extract(workspace: Path, variant: str) -> dict:
    outdir = workspace / "results" / variant
    results_path = outdir / "results.jsonl"
    if not results_path.exists():
        raise H.HarnessError(f"no results.jsonl at {results_path}")
    records = [json.loads(line) for line in results_path.read_text().splitlines() if line.strip()]

    raw_path = outdir / "raw_parts.jsonl"
    traces_path = outdir / "traces.txt"
    summary = {"variant": variant, "generated_at": H.now_iso(), "tests": {}}
    all_permissions = {"variant": variant, "generated_at": H.now_iso(), "tests": {}}

    with open(raw_path, "w") as raw_fh, open(traces_path, "w") as out:
        for rec in sorted(records, key=lambda r: r.get("test", -1)):
            n = rec.get("test")
            sid = (rec.get("session") or {}).get("session_id")
            match = (rec.get("session") or {}).get("match")
            dur = rec.get("duration_s")
            out.write(f"{'=' * 100}\nTEST {n} session={sid} match={match} dur={dur}s "
                      f"rc={rec.get('rc')} timed_out={rec.get('timed_out')}\n")
            entry = {
                "session_id": sid,
                "session_match": match,
                "trace_status": rec.get("trace_status"),
                "part_counts": {},
                "tool_counts": {},
                "permission_rejections": 0,
                "missing": False,
                "notes": [],
            }

            parts = load_parts(sid) if sid else []
            if not sid:
                entry["missing"] = True
                entry["notes"].append(
                    "no session matched the exact realpath working directory; trace unavailable")
                out.write("  <no session -- trace unavailable (match=%s)>\n\n" % match)
            else:
                for p in parts:
                    raw_fh.write(json.dumps({"test": n, "session_id": sid, "part": p}) + "\n")

            for p in parts:
                t = p.get("type")
                entry["part_counts"][t] = entry["part_counts"].get(t, 0) + 1
                if t == "text":
                    out.write(f"  [text] {p.get('text', '')}\n")
                elif t == "reasoning":
                    out.write(f"  [REASONING] {clip(p.get('text', ''), 700)}\n")
                elif t == "tool":
                    tool = p.get("tool")
                    st = p.get("state") or {}
                    entry["tool_counts"][tool] = entry["tool_counts"].get(tool, 0) + 1
                    out.write(f"  [TOOL {tool}] status={st.get('status')} "
                              f"in={clip(st.get('input'), 500)}\n")
                    if st.get("output"):
                        out.write(f"      out={clip(st.get('output'), 800)}\n")
                    if st.get("error"):
                        err = str(st.get("error"))
                        is_reject = "rejected permission" in err.lower()
                        if is_reject:
                            entry["permission_rejections"] += 1
                        out.write(f"      error={'PERMISSION-REJECT ' if is_reject else ''}"
                                  f"{clip(err, 400)}\n")
                elif t == "patch":
                    out.write(f"  [PATCH] {clip(p, 700)}\n")
                elif t in ("step-start", "step-finish"):
                    out.write(f"  [{t}] tokens={json.dumps(p.get('tokens', {}))}\n")
            if sid:
                out.write("\n")

            # Permission evidence: DB tool rejections + raw log slice.
            rejections = [r for r in H.session_permission_rejections(sid) if r.get("permission_rejection")] if sid else []
            perm_record = {
                "session_id": sid,
                "session_match": match,
                "tool_rejections": H.session_permission_rejections(sid) if sid else [],
                "permission_rejection_count": len(rejections),
                "raw_log_available": False,
                "raw_log_events": [],
                "limitations": [
                    "OpenCode does not persist permission requests/replies as session parts.",
                    "opencode.log is process-global and its permission lines carry no session id.",
                ],
            }
            log_json = outdir / "permissions" / f"t{n}.permission.json"
            if log_json.exists():
                log_data = json.loads(log_json.read_text())
                perm_record["raw_log_available"] = log_data.get("available", False)
                perm_record["raw_log_events"] = log_data.get("events", [])
                perm_record["limitations"] = sorted(
                    set(perm_record["limitations"] + log_data.get("limitations", [])))
            entry["permission_rejection_count"] = perm_record["permission_rejection_count"]
            all_permissions["tests"][str(n)] = perm_record
            summary["tests"][str(n)] = entry

    H.write_json(outdir / "trace.summary.json", summary)
    H.write_json(outdir / "permissions.json", all_permissions)
    print(f"wrote {raw_path}, {traces_path}, {outdir / 'trace.summary.json'}, "
          f"{outdir / 'permissions.json'}")
    return summary


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", required=True, type=Path)
    p.add_argument("--variant", required=True)
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        extract(args.workspace.resolve(), args.variant)
    except H.HarnessError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
