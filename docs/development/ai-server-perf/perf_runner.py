#!/usr/bin/env python3
"""Engine-agnostic performance benchmark for OpenAI-compatible chat engines.

Drives any engine that serves POST /v1/chat/completions through ONE code path
(streaming, ``stream_options.include_usage``), so baseline llama.cpp (port
8087) and Strata (port 8080) are measured by the same instrument.

Design rules (from the task spec):

* Engine-agnostic by construction: no llama.cpp-only endpoints are required.
  Per-engine introspection (``/metrics``) is captured opportunistically and
  recorded as ABSENT when an engine cannot supply it -- never guessed.
* Verified occupancy: the prompt is built by calibration probes that read the
  token count the ENGINE reports (``usage.prompt_tokens``), and every measured
  request re-reports its achieved occupancy. The configured ``n_ctx`` is never
  used as exercised context.
* Prompt caching off: every request sends ``cache_prompt: false``; cache hits
  are verified from ``usage.prompt_tokens_details.cached_tokens`` /
  ``timings.cache_n`` when the engine reports them, recorded absent otherwise.
* TTFT is measured client-side from stream start to the first generated token
  (reasoning or content), closing the known N/A gap in the non-streaming
  harness.
* Repeats: per case, 1 cold + N warm requests; all warm statistics report
  n / mean / min / max / sample sd / cv. Cold is n=1 by construction and is
  never used for cross-engine claims.

Stdlib only. No dependencies.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Prompt corpus: deterministic, prefix-stable word stream (same seed, same
# first N words for any N), so calibration probes and measured prompts are the
# same text family an engine counts consistently.
# ---------------------------------------------------------------------------

SEED = 20261014

VOCAB = (
    "lane pin spare strike gutter frame ball roll score team league night "
    "match block bracket final series average turn order player captain "
    "result frame wood maple circle arrow light sound ring drop hit stand "
    "walk start finish ready steady rhythm tempo pace motion speed delay "
    "quiet quick slow heavy light warm cool dry wet open close begin end "
    "first second third fourth fifth seventh ninth tenth eleventh twelfth"
).split()


def build_text(n_words: int, seed: int = SEED) -> str:
    rng = random.Random(seed)
    return " ".join(rng.choice(VOCAB) for _ in range(n_words))


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _post(url: str, body: dict, timeout: float, headers: dict | None = None) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _get(url: str, timeout: float) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")
    except Exception as e:  # noqa: BLE001 - absence must be recorded, not raised
        return -1, f"{type(e).__name__}: {e}"


def _now() -> float:
    return time.perf_counter()


# ---------------------------------------------------------------------------
# Identity + optional introspection (recorded absent when unavailable)
# ---------------------------------------------------------------------------


def get_identity(base_url: str, timeout: float) -> dict:
    ident: dict = {"base_url": base_url}
    code, body = _get(f"{base_url}/health", timeout)
    ident["health"] = {"status": code, "body": _clip(body)}
    ident["health_ok"] = code == 200 and '"ok"' in body
    code, body = _get(f"{base_url}/v1/models", timeout)
    if code == 200:
        try:
            models = json.loads(body).get("data", [])
            ident["model_id"] = models[0].get("id") if models else None
        except Exception:  # noqa: BLE001
            ident["model_id"] = None
    else:
        ident["model_id"] = None
    code, body = _get(f"{base_url}/props", timeout)
    if code == 200:
        try:
            props = json.loads(body)
            ident["props"] = {
                "model_alias": props.get("model_alias"),
                "total_slots": props.get("total_slots"),
                "n_ctx": (props.get("default_generation_settings") or {}).get("n_ctx"),
            }
        except Exception:  # noqa: BLE001
            ident["props"] = None
    else:
        ident["props"] = None  # absent for engines without /props
    return ident


def _clip(text: str, n: int = 400) -> str:
    return text if len(text) <= n else text[:n] + "...<clipped>"


def flatten_numbers(obj, prefix="") -> dict:
    out: dict = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(flatten_numbers(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        out[prefix] = float(obj)
    return out


def parse_prometheus(text: str) -> dict:
    out: dict = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.rsplit(None, 1)
        if len(parts) != 2:
            continue
        try:
            out[parts[0]] = float(parts[1])
        except ValueError:
            continue
    return out


def metrics_snapshot(base_url: str, timeout: float) -> dict:
    """Capture engine /metrics if present. kind=prometheus|json|absent."""
    code, body = _get(f"{base_url}/metrics", timeout)
    if code != 200:
        return {"kind": "absent", "reason": f"HTTP {code}: {_clip(body, 120)}"}
    if body.lstrip().startswith("{") or body.lstrip().startswith("["):
        try:
            return {"kind": "json", "values": flatten_numbers(json.loads(body)), "raw": body}
        except Exception:  # noqa: BLE001
            return {"kind": "unparsed", "raw": body}
    if "llamacpp:" in body or body.lstrip().startswith("#"):
        return {"kind": "prometheus", "values": parse_prometheus(body), "raw": body}
    return {"kind": "unknown", "raw": body}


def metrics_delta(before: dict, after: dict) -> dict:
    if before.get("kind") != after.get("kind") or "values" not in before or "values" not in after:
        return {"kind": "absent", "reason": "metrics not comparable or unavailable on one side"}
    b, a = before["values"], after["values"]
    return {k: a[k] - b[k] for k in a if k in b and a[k] >= b[k]}


def memory_snapshot(ssh_host: str | None) -> dict:
    if not ssh_host:
        return {"kind": "absent", "reason": "not requested"}
    ps = (
        "$o=Get-CimInstance Win32_OperatingSystem; "
        "[math]::Round($o.TotalVisibleMemorySize/1KB,1).ToString()+' '+"
        "[math]::Round($o.FreePhysicalMemory/1KB,1).ToString()+' '+"
        "[math]::Round($o.TotalVirtualMemorySize/1KB,1).ToString()+' '+"
        "[math]::Round($o.FreeVirtualMemory/1KB,1).ToString()"
    )
    try:
        proc = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=10", ssh_host, f"powershell -NoProfile -Command \"{ps}\""],
            capture_output=True, text=True, timeout=60,
        )
        if proc.returncode != 0:
            return {"kind": "absent", "reason": _clip(proc.stderr or proc.stdout, 200)}
        tot, free, vtot, vfree = [float(x) for x in proc.stdout.split()]
        return {"kind": "host", "ram_total_mb": tot, "ram_free_mb": free,
                "commit_total_mb": vtot, "commit_free_mb": vfree}
    except Exception as e:  # noqa: BLE001
        return {"kind": "absent", "reason": f"{type(e).__name__}: {e}"}


# ---------------------------------------------------------------------------
# Token counting as the ENGINE reports it (occupancy verification)
# ---------------------------------------------------------------------------


def probe_occupancy(base_url: str, model: str, text: str, timeout: float,
                    headers: dict | None = None, extra: dict | None = None) -> dict:
    """One non-streaming max_tokens=1 request; returns usage.prompt_tokens."""
    body = {
        "model": model,
        "messages": [{"role": "user", "content": text}],
        "max_tokens": 1,
        "temperature": 0,
        "cache_prompt": False,
        **(extra or {}),
    }
    t0 = _now()
    resp = _post(f"{base_url}/v1/chat/completions", body, timeout, headers)
    elapsed = _now() - t0
    usage = resp.get("usage") or {}
    pt = usage.get("prompt_tokens")
    if pt is None:
        return {"ok": False, "reason": "engine reported no usage.prompt_tokens"}
    return {"ok": True, "prompt_tokens": int(pt), "elapsed_s": round(elapsed, 3),
            "cached_tokens": (usage.get("prompt_tokens_details") or {}).get("cached_tokens")}


def calibrate(base_url: str, model: str, timeout: float, headers: dict | None = None) -> dict:
    """Affine token model prompt_tokens ~= a + b*words from two probes.

    Probes are real requests at max_tokens=1 with caching off, so the counts
    are the engine's own -- the same code path used for every engine.
    """
    probes = []
    for w in (1000, 3000):
        r = probe_occupancy(base_url, model, build_text(w), timeout, headers)
        if not r.get("ok"):
            return {"ok": False, "reason": r.get("reason"), "probes": probes}
        probes.append({"words": w, **r})
    (w1, p1), (w2, p2) = [(p["words"], p["prompt_tokens"]) for p in probes]
    b = (p2 - p1) / (w2 - w1)
    a = p1 - b * w1
    if b <= 0:
        return {"ok": False, "reason": "non-positive tokens/word from probes", "probes": probes}
    return {"ok": True, "a": round(a, 2), "b": round(b, 5), "probes": probes}


def words_for(target_tokens: int, calib: dict) -> int:
    return max(1, int(round((target_tokens - calib["a"]) / calib["b"])))


# ---------------------------------------------------------------------------
# The single measured request path (same for every engine)
# ---------------------------------------------------------------------------


def stream_request(base_url: str, model: str, text: str, max_tokens: int,
                   timeout: float, headers: dict | None = None,
                   extra: dict | None = None) -> dict:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": text}],
        "max_tokens": max_tokens,
        "temperature": 0,
        "stream": True,
        "stream_options": {"include_usage": True},
        "cache_prompt": False,  # prompt caching OFF (verified from usage below)
        **(extra or {}),
    }

    out: dict = {
        "t_first_token": None, "t_last_token": None, "t_first_content": None,
        "usage": None, "server_timings": None, "finish_reason": None,
        "delta_token_count": 0, "error": None, "http_status": None,
        "degraded": None,
    }
    try:
        out.update(_stream_once(base_url, body, headers, timeout))
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode(errors="replace")
        if e.code == 400 and "stream_options" in body_txt:
            # Degrade explicitly: engine rejects stream_options; retry without,
            # recorded -- never silently.
            body.pop("stream_options")
            out["degraded"] = ("no stream_options support "
                               f"({body_txt[:120]}); usage in stream may be absent")
            try:
                out.update(_stream_once(base_url, body, headers, timeout))
            except Exception as e2:  # noqa: BLE001
                out["error"] = f"{type(e2).__name__}: {e2}"
        elif e.code == 400 and "cache_prompt" in body_txt:
            body.pop("cache_prompt")
            out["degraded"] = ("no cache_prompt support "
                               f"({body_txt[:120]}); caching state unverifiable per request")
            try:
                out.update(_stream_once(base_url, body, headers, timeout))
            except Exception as e2:  # noqa: BLE001
                out["error"] = f"{type(e2).__name__}: {e2}"
        else:
            out["error"] = f"HTTP {e.code}: {body_txt[:300]}"
            out["http_status"] = e.code
    except Exception as e:  # noqa: BLE001
        out["error"] = f"{type(e).__name__}: {e}"
    out.setdefault("t_end", _now())
    return out


def _stream_once(base_url: str, body: dict, headers: dict | None,
                 timeout: float) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{base_url}/v1/chat/completions", data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)

    out: dict = {
        "t_first_token": None, "t_last_token": None, "t_first_content": None,
        "usage": None, "server_timings": None, "finish_reason": None,
        "delta_token_count": 0, "http_status": None,
    }
    t0 = _now()
    out["t_start"] = t0
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        out["http_status"] = resp.status
        for raw in resp:
            line = raw.strip()
            if not line.startswith(b"data:"):
                continue
            payload = line[5:].strip()
            if payload == b"[DONE]":
                continue
            try:
                obj = json.loads(payload)
            except Exception:  # noqa: BLE001
                continue
            t = _now()
            if obj.get("usage"):
                out["usage"] = obj["usage"]
            if obj.get("timings"):
                out["server_timings"] = obj["timings"]
            for ch in obj.get("choices") or []:
                if ch.get("finish_reason"):
                    out["finish_reason"] = ch["finish_reason"]
                delta = ch.get("delta") or {}
                text_piece = delta.get("content") or delta.get("reasoning_content")
                if text_piece:
                    out["delta_token_count"] += 1
                    if out["t_first_token"] is None:
                        out["t_first_token"] = t
                    out["t_last_token"] = t
                    if delta.get("content") and out["t_first_content"] is None:
                        out["t_first_content"] = t
    out["t_end"] = _now()
    out["wall_s"] = out["t_end"] - t0
    return out


def request_metrics(req: dict) -> dict:
    """Derive the spec's metrics from one measured request."""
    usage = req.get("usage") or {}
    st = req.get("server_timings") or {}
    m: dict = {"error": req.get("error"), "finish_reason": req.get("finish_reason")}
    m["wall_s"] = round(req["wall_s"], 3)
    if req["t_first_token"] is None:
        m["ttft_s"] = None
    else:
        m["ttft_s"] = round(req["t_first_token"] - req.get("t_start", req["t_end"] - req["wall_s"]), 3)
    m["ttft_content_s"] = (
        round(req["t_first_content"] - req.get("t_start", req["t_end"] - req["wall_s"]), 3)
        if req["t_first_content"] else None
    )
    pt, ct = usage.get("prompt_tokens"), usage.get("completion_tokens")
    m["prompt_tokens"] = int(pt) if pt is not None else None
    m["completion_tokens"] = int(ct) if ct is not None else None
    m["usage_source"] = "engine_stream" if pt is not None else "absent"
    if m["prompt_tokens"] is None:
        # Degrade explicitly: engine sent no usage in-stream. Completion count
        # falls back to delta count (labelled); prompt occupancy must come from
        # a companion engine-reported probe of the same prompt (see run_case).
        if req.get("delta_token_count"):
            m["completion_tokens"] = req["delta_token_count"]
            m["usage_source"] = "delta_count_fallback"
    m["degraded"] = req.get("degraded")
    cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
    m["cached_tokens"] = int(cached) if cached is not None else (
        int(st["cache_n"]) if "cache_n" in st else None
    )
    # client-side prefill: prompt tokens over time-to-first-token
    if m["prompt_tokens"] and m["ttft_s"]:
        m["prefill_tok_s_client"] = round(m["prompt_tokens"] / m["ttft_s"], 2)
    else:
        m["prefill_tok_s_client"] = None
    # client-side decode: (completion tokens - 1) over first->last token span
    if m["completion_tokens"] and req["t_first_token"] and req["t_last_token"]:
        span = req["t_last_token"] - req["t_first_token"]
        m["decode_tok_s_client"] = (
            round((m["completion_tokens"] - 1) / span, 2) if span > 0 else None
        )
    else:
        m["decode_tok_s_client"] = None
    # effective throughput: all tokens (prompt + completion) over wall time
    if m["prompt_tokens"] is not None and m["completion_tokens"] is not None:
        m["effective_tok_s"] = round(
            (m["prompt_tokens"] + m["completion_tokens"]) / m["wall_s"], 3
        )
    else:
        m["effective_tok_s"] = None
    # server-reported counterparts (absent on engines that do not send them)
    m["prefill_tok_s_server"] = (
        round(st["prompt_per_second"], 2) if "prompt_per_second" in st else None
    )
    m["decode_tok_s_server"] = (
        round(st["predicted_per_second"], 2) if "predicted_per_second" in st else None
    )
    m["server_draft_n"] = st.get("draft_n")
    m["server_draft_accepted"] = st.get("draft_n_accepted")
    return m


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

SPREAD_METRICS = (
    "ttft_s", "wall_s", "prefill_tok_s_client", "decode_tok_s_client",
    "effective_tok_s", "prefill_tok_s_server", "decode_tok_s_server",
    "prompt_tokens", "completion_tokens",
)


def stats(values: list) -> dict:
    vals = [v for v in values if v is not None]
    if not vals:
        return {"n": 0}
    n = len(vals)
    mean = statistics.fmean(vals)
    sd = statistics.stdev(vals) if n > 1 else 0.0
    return {
        "n": n, "mean": round(mean, 3), "min": round(min(vals), 3),
        "max": round(max(vals), 3), "sd": round(sd, 3),
        "spread": round(max(vals) - min(vals), 3),
        "cv_pct": round(100 * sd / mean, 2) if mean else None,
    }


def summarize(records: list, kind: str) -> dict:
    return {
        "kind": kind,
        "n_requests": len(records),
        **{m: stats([r["metrics"].get(m) for r in records]) for m in SPREAD_METRICS},
    }


# ---------------------------------------------------------------------------
# Case runner
# ---------------------------------------------------------------------------


def run_case(cfg: dict, case: dict, model: str, out_dir: Path,
             results: list) -> dict:
    name, target, gen = case["name"], case["target_tokens"], case["max_tokens"]
    warm_n = case["warm"]
    calib = cfg["calibration"]
    base_url, timeout = cfg["base_url"], cfg["timeout"]

    print(f"[case {name}] building prompt for ~{target} tokens "
          f"(calib a={calib['a']} b={calib['b']})", flush=True)
    words = words_for(target, calib)
    text = build_text(words)

    before_mem = memory_snapshot(cfg.get("ssh_memory"))
    before_metrics = metrics_snapshot(base_url, min(timeout, 30))

    records: list = []
    passes = 0
    achieved = None
    occ_source = "engine_stream: usage.prompt_tokens"
    while passes < 2:
        passes += 1
        records = []
        total = 1 + warm_n
        for i in range(total):
            kind = "cold" if i == 0 else "warm"
            print(f"[case {name}] {kind} {i + 1}/{total} (words={words})", flush=True)
            req = stream_request(base_url, model, text, gen, timeout, cfg.get("headers"),
                                 cfg.get("extra_body"))
            met = request_metrics(req)
            rec = {"case": name, "kind": kind, "words": words,
                   "target_tokens": target, "metrics": met,
                   "server_timings": req.get("server_timings"),
                   "usage": req.get("usage"), "http_status": req.get("http_status"),
                   "started_at_unix": round(time.time() - req["wall_s"], 3)}
            records.append(rec)
            results.append(rec)
            if met.get("error"):
                print(f"  !! error: {met['error']}", flush=True)
            else:
                print(f"  ttft={met['ttft_s']}s wall={met['wall_s']}s "
                      f"prompt={met['prompt_tokens']} completion={met['completion_tokens']} "
                      f"decode={met['decode_tok_s_client']} tok/s", flush=True)
            # never hammer a failing engine
            if met.get("error") and i == 0:
                break
        pts = [r["metrics"]["prompt_tokens"] for r in records
               if r["metrics"].get("prompt_tokens")]
        occ_source = "engine_stream: usage.prompt_tokens"
        if not pts:
            # Degrade explicitly: engine sends no usage in-stream -> one
            # companion non-streaming max_tokens=1 request with the SAME prompt;
            # the engine itself reports the occupancy. Labelled, never guessed.
            pr = probe_occupancy(base_url, model, text, timeout, cfg.get("headers"),
                                 cfg.get("extra_body"))
            if pr.get("ok"):
                pts = [pr["prompt_tokens"]]
                occ_source = ("companion_probe: engine usage.prompt_tokens on "
                              "same prompt, max_tokens=1 (stream usage absent)")
                for r in records:
                    if r["metrics"].get("prompt_tokens") is None:
                        r["metrics"]["prompt_tokens"] = pr["prompt_tokens"]
                        r["metrics"]["usage_source"] = "companion_probe"
            else:
                occ_source = f"ABSENT: stream usage and companion probe failed: {pr.get('reason')}"
        if pts:
            achieved = {"mean": statistics.fmean(pts), "min": min(pts), "max": max(pts),
                        "n": len(pts)}
            drift = abs(achieved["mean"] - target) / target
            if drift <= 0.01:
                break
            # occupancy outside +-1% of target: adjust word count once and rerun
            print(f"[case {name}] achieved {achieved['mean']} vs target {target} "
                  f"({drift:.2%}) -- adjusting prompt and re-running case", flush=True)
            words = words_for(target, {"a": calib["a"],
                                       "b": calib["b"] * achieved["mean"] / target})
            text = build_text(words)
        else:
            break

    after_metrics = metrics_snapshot(base_url, min(timeout, 30))
    after_mem = memory_snapshot(cfg.get("ssh_memory"))

    warm = [r for r in records if r["kind"] == "warm"]
    cold = [r for r in records if r["kind"] == "cold"]
    summary = {
        "case": name,
        "target_tokens": target,
        "max_tokens": gen,
        "words": words,
        "achieved_occupancy": achieved,
        "occupancy_source": occ_source,
        "occupancy_note": "engine-reported token count of the actual prompt; "
                          "configured n_ctx is never read as exercised context",
        "cache_off_sent": True,
        "cache_hits": [r["metrics"].get("cached_tokens") for r in records],
        "cache_verification": (
            "engine reported cached_tokens/cache_n per request" if
            any(r["metrics"].get("cached_tokens") is not None for r in records)
            else "ABSENT: engine reports no cache counter; cache_prompt=false sent "
                 "but hit-free state unverifiable per request"),
        "degradations": sorted({r["metrics"].get("degraded") for r in records
                                if r["metrics"].get("degraded")}),
        "cold": summarize(cold, "cold") if cold else None,
        "warm": summarize(warm, "warm"),
        "memory_before": before_mem,
        "memory_after": after_mem,
        "metrics_delta": metrics_delta(before_metrics, after_metrics),
        "metrics_before_kind": before_metrics.get("kind"),
        "metrics_after_kind": after_metrics.get("kind"),
        "repeats_policy": f"1 cold + {warm_n} warm; conclusions from warm only",
    }
    print(f"[case {name}] warm n={summary['warm']['n_requests']} "
          f"occupancy={achieved}", flush=True)
    return summary


# ---------------------------------------------------------------------------
# compare subcommand: side-by-side with an explicit real-difference threshold
# ---------------------------------------------------------------------------


def load_summary(path: Path) -> dict:
    return json.loads(path.read_text())


def compare_two(a_path: Path, b_path: Path, out_path: Path) -> str:
    a, b = load_summary(a_path), load_summary(b_path)
    lines = [
        "# Side-by-side comparison",
        "",
        f"- A: `{a.get('engine', {}).get('label')}` @ {a.get('engine', {}).get('base_url')}",
        f"- B: `{b.get('engine', {}).get('label')}` @ {b.get('engine', {}).get('base_url')}",
        "",
        "Real-difference rule (stated up front): for each warm metric a difference",
        "counts as REAL only if |mean_A - mean_B| > 2 * SE_diff, where",
        "SE_diff = sqrt(sd_A^2/n_A + sd_B^2/n_B) (Welch-style standard error of the",
        "difference of means). Differences below that threshold -- and differences",
        "between single samples (cold, n=1) -- are NOT distinguishable from noise.",
        "",
    ]
    cases = sorted({c["case"] for c in a.get("cases", [])} &
                   {c["case"] for c in b.get("cases", [])})
    for case in cases:
        ca = next(c for c in a["cases"] if c["case"] == case)
        cb = next(c for c in b["cases"] if c["case"] == case)
        lines += [f"## Case {case} (target {ca['target_tokens']} tokens)", ""]
        lines += ["| metric | A mean±sd (n) | B mean±sd (n) | Δ | 2·SE_diff | real? |",
                  "|---|---|---|---|---|---|"]
        for m in ("ttft_s", "wall_s", "prefill_tok_s_client", "decode_tok_s_client",
                  "effective_tok_s", "prefill_tok_s_server", "decode_tok_s_server"):
            sa, sb = ca["warm"].get(m, {}), cb["warm"].get(m, {})
            if not sa.get("n") or not sb.get("n"):
                lines.append(f"| {m} | {fmt(sa)} | {fmt(sb)} | – | – | absent one side |")
                continue
            se = math.sqrt(sa["sd"] ** 2 / sa["n"] + sb["sd"] ** 2 / sb["n"])
            thr = 2 * se
            delta = sa["mean"] - sb["mean"]
            real = abs(delta) > thr
            lines.append(
                f"| {m} | {sa['mean']}±{sa['sd']} ({sa['n']}) "
                f"| {sb['mean']}±{sb['sd']} ({sb['n']}) "
                f"| {delta:+.3f} | ±{thr:.3f} | {'YES' if real else 'no'} |"
            )
        lines.append("")
        occ_a = ca.get("achieved_occupancy") or {}
        occ_b = cb.get("achieved_occupancy") or {}
        lines += [
            f"- achieved occupancy A: {occ_a.get('mean')} "
            f"(min {occ_a.get('min')}, max {occ_a.get('max')}, n={occ_a.get('n')}) "
            f"-- source: {ca.get('occupancy_source')}",
            f"- achieved occupancy B: {occ_b.get('mean')} "
            f"(min {occ_b.get('min')}, max {occ_b.get('max')}, n={occ_b.get('n')}) "
            f"-- source: {cb.get('occupancy_source')}",
            f"- cache hits reported A: {ca.get('cache_hits')} | B: {cb.get('cache_hits')}",
            f"- engine /metrics delta A: {'present' if ca.get('metrics_delta', {}).get('kind') != 'absent' else 'ABSENT'} | "
            f"B: {'present' if cb.get('metrics_delta', {}).get('kind') != 'absent' else 'ABSENT'}",
            "",
        ]
    text = "\n".join(lines) + "\n"
    out_path.write_text(text)
    return text


def fmt(s: dict) -> str:
    return f"{s['mean']}±{s['sd']} ({s['n']})" if s.get("n") else "absent"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


CASE_DEFS = {
    # short-prompt latency case (TTFT question) and long-context cases.
    # long80 exceeds Strata's 65536 max_context: baseline-only, NOT comparable.
    "short": {"name": "short", "target_tokens": 600, "max_tokens": 256, "warm": 9},
    "long60": {"name": "long60", "target_tokens": 60000, "max_tokens": 400, "warm": 5},
    "long80": {"name": "long80", "target_tokens": 80000, "max_tokens": 400, "warm": 5},
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="run benchmark cases against one engine")
    run.add_argument("--base-url", required=True)
    run.add_argument("--label", required=True, help="engine label for the record")
    run.add_argument("--model", default=None, help="model id (default: first /v1/models id)")
    run.add_argument("--out", required=True, help="output directory")
    run.add_argument("--cases", default="short,long60",
                     help="comma list from: short,long60,long80")
    run.add_argument("--timeout", type=float, default=1200.0)
    run.add_argument("--api-key", default=None)
    run.add_argument("--extra-body", default=None,
                     help="JSON merged into every measured request body")
    run.add_argument("--ssh-memory", default=None,
                     help="ssh host for host memory snapshots (optional)")

    cmp_ = sub.add_parser("compare", help="two summary.json -> comparison markdown")
    cmp_.add_argument("--a", required=True)
    cmp_.add_argument("--b", required=True)
    cmp_.add_argument("--out", required=True)

    args = ap.parse_args()

    if args.cmd == "compare":
        print(compare_two(Path(args.a), Path(args.b), Path(args.out)))
        return 0

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    headers = {"Authorization": f"Bearer {args.api_key}"} if args.api_key else None
    extra_body = json.loads(args.extra_body) if args.extra_body else None

    ident = get_identity(args.base_url, min(args.timeout, 30))
    model = args.model or ident.get("model_id") or "default"
    print(f"[engine] label={args.label} base={args.base_url} model={model} "
          f"health_ok={ident.get('health_ok')}", flush=True)
    if not ident.get("health_ok"):
        print("engine not healthy -- aborting", file=sys.stderr)
        return 2

    calib = calibrate(args.base_url, model, args.timeout, headers)
    if not calib.get("ok"):
        print(f"calibration failed: {calib}", file=sys.stderr)
        return 3
    print(f"[calib] prompt_tokens ~= {calib['a']} + {calib['b']}*words "
          f"(probes: {[(p['words'], p['prompt_tokens']) for p in calib['probes']]})",
          flush=True)

    cfg = {"base_url": args.base_url, "timeout": args.timeout,
           "headers": headers, "extra_body": extra_body,
           "calibration": calib, "ssh_memory": args.ssh_memory}

    case_names = [c.strip() for c in args.cases.split(",") if c.strip()]
    unknown = [c for c in case_names if c not in CASE_DEFS]
    if unknown:
        print(f"unknown cases: {unknown}", file=sys.stderr)
        return 4

    results: list = []
    summaries: list = []
    for cn in case_names:
        summaries.append(run_case(cfg, CASE_DEFS[cn], model, out_dir, results))

    payload = {
        "engine": {"label": args.label, "base_url": args.base_url, "model": model,
                   "identity": ident, "calibration": calib},
        "started_at_unix": round(time.time(), 3),
        "case_order": case_names,
        "cases": summaries,
        "repeats_policy": "1 cold + N warm per case (N in case def); all spread "
                          "statistics over warm requests; cold n=1 never used for "
                          "cross-engine claims",
        "real_difference_rule": "|mean_A-mean_B| > 2*sqrt(sdA^2/nA+sdB^2/nB)",
        "requests_file": "requests.jsonl",
    }
    (out_dir / "requests.jsonl").write_text(
        "\n".join(json.dumps(r) for r in results) + "\n")
    (out_dir / "summary.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(f"[done] wrote {out_dir / 'summary.json'} "
          f"and {len(results)} request records", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
