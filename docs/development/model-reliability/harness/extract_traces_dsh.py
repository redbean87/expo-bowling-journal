#!/usr/bin/env python3
"""Convert DSH headless sessions into the neutral trace artifacts ``score.py`` reads.

The frozen scorer consumes ``results.jsonl`` plus ``raw_parts.jsonl`` (a flat
list of ``{"test": n, "session_id": ..., "part": {...}}`` records) and never
touches OpenCode-specific storage. This converter maps a persisted DSH session
(``~/.dsh/sessions/<dir>/session-<id>/session.v3.jsonl.zstd``) onto that part
schema:

* ``assistant/message`` reasoning/text content blocks -> ``reasoning``/``text`` parts;
* ``tool/call`` -> a ``tool`` part with ``state.input`` (parsed arguments);
* ``tool/result`` -> attaches ``state.output`` / ``state.error`` to its call.

It writes, under ``<workspace>/results/<variant>/``: ``raw_parts.jsonl``,
``traces.txt``, ``trace.summary.json``, and ``permissions.json``.

Usage:
    python3 extract_traces_dsh.py --workspace WS --variant qwen-8087-dsh
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402


def clip(value, n=900):
    text = value if isinstance(value, str) else json.dumps(value)
    text = text.replace("\n", "\\n")
    return text[:n] + ("..." if len(text) > n else "")


def decompress(path: Path) -> str:
    proc = subprocess.run(["zstd", "-d", "-c", str(path)],
                          capture_output=True, timeout=120)
    if proc.returncode != 0:
        raise H.HarnessError(
            f"zstd failed for {path}: {proc.stderr.decode('utf-8', 'replace')[:200]}")
    return proc.stdout.decode("utf-8", "replace")


def load_events(path: Path) -> list:
    events = []
    for line in decompress(path).splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def _parse_args(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"_raw": raw}
    return {}


def _result_text(message: dict):
    text = ""
    is_error = False
    for block in message.get("content") or []:
        if block.get("type") == "tool-result":
            is_error = bool(block.get("isError"))
            for c in (block.get("content") or []):
                if c.get("type") == "text":
                    text += c.get("text") or ""
    return text, is_error


def parts_from_events(events: list) -> list:
    parts: list = []
    call_index: dict = {}

    declared_calls = set()
    for ev in events:
        if ev.get("type") == "tool/call":
            cid = ev.get("data", {}).get("callId")
            if cid:
                declared_calls.add(cid)

    for ev in events:
        et = ev.get("type")
        data = ev.get("data") or {}
        if et == "assistant/message":
            msg = data.get("message") or {}
            for block in msg.get("content") or []:
                bt = block.get("type")
                if bt == "reasoning":
                    parts.append({"type": "reasoning", "text": block.get("text") or ""})
                elif bt == "text":
                    parts.append({"type": "text", "text": block.get("text") or ""})
                elif bt == "tool-call":
                    cid = block.get("toolCallId") or block.get("id")
                    if cid and cid not in declared_calls:
                        parts.append({
                            "type": "tool",
                            "tool": block.get("name"),
                            "callID": cid,
                            "state": {"status": "completed",
                                      "input": _parse_args(block.get("arguments"))},
                        })
        elif et == "tool/call":
            cid = data.get("callId")
            part = {
                "type": "tool",
                "tool": data.get("name"),
                "callID": cid,
                "state": {"status": "completed", "input": _parse_args(data.get("arguments"))},
            }
            parts.append(part)
            if cid:
                call_index[cid] = len(parts) - 1
        elif et == "tool/result":
            msg = data.get("message") or {}
            cid = None
            src = msg.get("source") or {}
            if src.get("kind") == "tool":
                cid = src.get("callId")
            if cid is None:
                for block in msg.get("content") or []:
                    if block.get("type") == "tool-result":
                        cid = block.get("toolCallId")
            text, is_error = _result_text(msg)
            idx = call_index.get(cid)
            if idx is None:
                parts.append({"type": "tool", "tool": None, "callID": cid,
                              "state": {"status": "error" if is_error else "completed"}})
                idx = len(parts) - 1
                call_index[cid] = idx
            st = parts[idx]["state"]
            if is_error:
                st["status"] = "error"
                st["error"] = text or "tool error"
            else:
                st["output"] = text
    return parts


def extract(workspace: Path, variant: str) -> dict:
    outdir = workspace / "results" / variant
    results_path = outdir / "results.jsonl"
    if not results_path.exists():
        raise H.HarnessError(f"no results.jsonl at {results_path}")
    records = [json.loads(line) for line in results_path.read_text().splitlines()
               if line.strip()]

    raw_path = outdir / "raw_parts.jsonl"
    traces_path = outdir / "traces.txt"
    summary = {"variant": variant, "generated_at": H.now_iso(), "engine": "dsh", "tests": {}}
    permissions = {"variant": variant, "generated_at": H.now_iso(), "engine": "dsh",
                   "tests": {}, "limitations": [
                       "DSH one-shot sessions do not persist OpenCode-style permission "
                       "audit to a shared log; denial evidence is only what appears in "
                       "tool results."]}

    with open(raw_path, "w") as raw_fh, open(traces_path, "w") as out:
        for rec in sorted(records, key=lambda r: r.get("test", -1)):
            n = rec.get("test")
            sess = rec.get("session") or {}
            sid = sess.get("session_id")
            match = sess.get("match")
            spath = sess.get("session_path")
            dur = rec.get("duration_s")
            out.write(f"{'=' * 100}\nTEST {n} session={sid} match={match} dur={dur}s "
                      f"rc={rec.get('rc')} timed_out={rec.get('timed_out')}\n")
            entry = {"session_id": sid, "session_match": match,
                     "trace_status": rec.get("trace_status"),
                     "part_counts": {}, "tool_counts": {}, "missing": False, "notes": []}

            if not sid or not spath or not Path(spath).exists():
                entry["missing"] = True
                entry["notes"].append("no DSH session file matched the clone run window")
                out.write("  <no session -- trace unavailable (match=%s)>\n\n" % match)
                summary["tests"][str(n)] = entry
                permissions["tests"][str(n)] = {"session_id": sid, "denials": []}
                continue

            try:
                events = load_events(Path(spath))
                parts = parts_from_events(events)
            except Exception as exc:
                entry["missing"] = True
                entry["notes"].append(f"session decode failed: {exc}")
                out.write(f"  <session decode failed: {exc}>\n\n")
                summary["tests"][str(n)] = entry
                permissions["tests"][str(n)] = {"session_id": sid, "denials": []}
                continue

            for p in parts:
                raw_fh.write(json.dumps({"test": n, "session_id": sid, "part": p}) + "\n")

            denials = []
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
                        is_reject = H.is_permission_denial(err)
                        if is_reject:
                            denials.append(err)
                        out.write(f"      error={'PERMISSION-REJECT ' if is_reject else ''}"
                                  f"{clip(err, 400)}\n")
            out.write("\n")
            summary["tests"][str(n)] = entry
            permissions["tests"][str(n)] = {"session_id": sid, "denials": denials,
                                            "count": len(denials)}

    H.write_json(outdir / "trace.summary.json", summary)
    H.write_json(outdir / "permissions.json", permissions)
    return summary


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--workspace", required=True, type=Path)
    p.add_argument("--variant", required=True)
    args = p.parse_args(argv)
    summary = extract(args.workspace.resolve(), args.variant)
    missing = [k for k, v in summary["tests"].items() if v.get("missing")]
    print(f"extracted traces for {len(summary['tests'])} tests; missing={missing}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except H.HarnessError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
