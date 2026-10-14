# AI-Server Engine Performance Benchmark (engine-agnostic)

A repeatable, engine-agnostic performance benchmark for the AI server's local
engines. It exists because the previous comparison numbers came from two
different instruments that were not comparable to each other, and the only
performance instrument - the llama.cpp-centric suite at `E:\LocalAI\benchmarks`
on the server - cannot run against Strata at all (its prompt builder needs
llama.cpp-only `/tokenize` + `/apply-template`, its metrics parser needs
Prometheus `/metrics`, and its lifecycle scripts require a harness-launched
`llama-server` process; see the suite audit
`data/ai-server-suite-c1/report.md`, findings F1-F3).

**Relationship to the existing suite:** this runner is built _beside_ the
existing suite, not instead of it, and no file of that suite is modified. The
audit's confirmed defects are not worked around by weakening anything:

- **F1** (`Test-PortListening` false-positives on TIME_WAIT): does not apply -
  this runner never asserts port states. Engine swaps go through the documented
  start/stop scripts; readiness is a bounded `/health` poll.
- **F2** (introspection scripts cannot address a production-started server):
  does not apply - this runner only needs the OpenAI-compatible
  `/v1/chat/completions` endpoint plus `/health`, all reachable on any engine
  regardless of who started it. Optional per-engine introspection is
  opportunistic (see below) and degrades to `absent`.
- **F3** (config exercised is not production): fixed by construction - the
  runner measures whatever production actually runs, by pointing at the
  production ports (8087 baseline, 8080 Strata) of the documented profile
  scripts. No test config exists in this runner at all.

## What it measures and how

One code path (`perf_runner.py`) drives every engine over streaming
`POST /v1/chat/completions` (`stream_options.include_usage`, temperature 0,
`cache_prompt: false` on every request). Per measured request it records:

- **TTFT** - client-side time from request send to the _first generated token_
  (reasoning or content). This closes the known N/A-by-design TTFT gap in the
  non-streaming legacy harness. `ttft_content_s` additionally times the first
  _visible_ (non-reasoning) token.
- **Prefill tok/s** - `prompt_tokens / TTFT` client-side; the engine-reported
  `timings.prompt_per_second` is recorded alongside when the engine sends it
  (llama.cpp does; recorded absent otherwise).
- **Decode tok/s** - `(completion_tokens - 1) / (first→last token span)`
  client-side; engine-reported `timings.predicted_per_second` alongside when
  present.
- **Effective throughput** - `(prompt + completion tokens) / wall time`.
- **End-to-end latency** - wall time of the whole streamed request.

### Verified occupancy (never configured context)

The prompt is a deterministic, prefix-stable word stream (fixed seed). The
target token count is translated to words through a two-probe _calibration_
against the engine itself (`max_tokens=1` requests whose
`usage.prompt_tokens` the engine reports). Every measured request then
re-reports its achieved occupancy from its own `usage.prompt_tokens`; a case
re-runs its prompt if achieved occupancy drifts more than 1% from target. The
configured `n_ctx` is never read as exercised context, per the methodology the
existing suite rightly enforces.

### Prompt caching off

Every request sends `cache_prompt: false`. Found by the first side-by-side
draft run: **Strata ignores that flag** - its conversation cache served warm
repeats of an identical prompt (`cached_tokens == prompt_tokens`), so the
identical-prompt protocol would have silently measured cached prefill on one
engine and uncached prefill on the other. The runner therefore defaults to a
**unique prompt per repeat** (per-repeat corpus seed from the same
deterministic word stream): no prefix cache can serve a repeat, so
"caching off" is an engine-independent property of the protocol rather than
of engine cooperation. Cache-hit state is still verified per request from the
engine's own counters (`usage.prompt_tokens_details.cached_tokens`,
`timings.cache_n`) and recorded; if an engine reports no counter, the summary
says so explicitly (`cache_verification: ABSENT: ...`) rather than assuming
zero. `--no-unique-prompts` restores identical-prompt repeats (llama.cpp
honors `cache_prompt: false` and was verified hit-free that way).

### Cold and warm, repeats, and spread

Each case = **1 cold + N warm** requests (short: 9 warm; long: 5 warm).
All spread statistics (n / mean / min / max / sample sd / cv%) are computed
over the warm requests; the cold request is reported but is n=1 by construction
and is never used for cross-engine claims. A single sample is never presented
as a result.

**Explicit real-difference rule:** for two engines' warm means of a metric, a
difference counts as REAL only if `|mean_A - mean_B| > 2 * SE_diff` with
`SE_diff = sqrt(sd_A^2/n_A + sd_B^2/n_B)` (Welch-style standard error of the
difference of means). Smaller differences are not distinguishable from noise
at this repeat count and are reported as such by `perf_runner.py compare`.

### Cases

| Case     | Target occupancy | Generation | Warm repeats | Comparable across engines?                             |
| -------- | ---------------- | ---------- | ------------ | ------------------------------------------------------ |
| `short`  | ~600 tokens      | 256        | 9            | Yes - the short-task latency question (TTFT)           |
| `long60` | ~60,000 tokens   | 400        | 5            | Yes - both engines' context windows cover it           |
| `long80` | ~80,000 tokens   | 400        | 5            | **No** - Strata's max_context is 65,536; baseline-only |

### Optional per-engine introspection

If an engine exposes a `/metrics` endpoint, a before/after snapshot is taken
per case and a numeric delta recorded (llama.cpp Prometheus; Strata JSON).
If it does not, the summary records `metrics_delta.kind = absent`. Same for
host memory snapshots (only taken when `--ssh-memory` is given). Nothing is
guessed or interpolated.

## Reproducing

Baseline (llama.cpp Unsloth 80K profile, production port 8087 - reachable
directly):

```bash
python3 docs/development/ai-server-perf/perf_runner.py run \
  --base-url http://192.168.68.52:8087 \
  --label baseline-llamacpp-unsloth80k \
  --cases short,long60,long80 \
  --out /path/to/runs/baseline-8087 \
  --ssh-memory corte@192.168.68.52
```

Strata (Coder IQ1_M, production port 8080 - loopback-only, so tunnel first):

```bash
ssh -f -N -L 18080:127.0.0.1:8080 corte@192.168.68.52
python3 docs/development/ai-server-perf/perf_runner.py run \
  --base-url http://127.0.0.1:18080 \
  --label strata-coder-iq1m \
  --cases short,long60 \
  --out /path/to/runs/strata-8080 \
  --ssh-memory corte@192.168.68.52
```

Engine swap (one engine at a time on the 31 GB box; both WMI-launched, since a
direct SSH launch dies with the session):

```bash
# stop baseline, start Strata:
ssh corte@192.168.68.52 "powershell -NoProfile -Command \"Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='powershell.exe -ExecutionPolicy Bypass -File E:\\LocalAI\\production\\scripts\\stop-qwen3.8-27b-unsloth-80k.ps1'}\""
ssh corte@192.168.68.52 "powershell -NoProfile -Command \"Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd.exe /c E:\\LocalAI\\strata-run.bat'}\""
# poll http://127.0.0.1:8080/health (via tunnel) until status ok - Strata can take 13-15 min cold.

# stop Strata, restart baseline:
ssh corte@192.168.68.52 "powershell -NoProfile -Command \"\$p=(Get-NetTCPConnection -LocalPort 8080 -State Listen).OwningProcess; taskkill /PID \$p /T /F\""
ssh corte@192.168.68.52 "powershell -NoProfile -Command \"Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='powershell.exe -ExecutionPolicy Bypass -File E:\\LocalAI\\production\\scripts\\start-qwen3.8-27b-unsloth-80k.ps1'}\""
# poll http://192.168.68.52:8087/health until ok, then verify /v1/models + a real completion.
```

Compare two runs (emits the side-by-side table with the real-difference
threshold applied per metric):

```bash
python3 docs/development/ai-server-perf/perf_runner.py compare \
  --a /path/to/runs/baseline-8087/summary.json \
  --b /path/to/runs/strata-8080/summary.json \
  --out /path/to/comparison.md
```

## What these numbers do and do not establish

- A warm spread at a _verified occupancy_ establishes engine throughput /
  latency **at that occupancy on that production config on that box**, with the
  stated variance. It does not transfer to other occupancies (context-scaling
  is nonlinear), other quants, or other hardware.
- Both engines are measured through the identical client path, so client-side
  metrics are directly comparable. Engine-_reported_ metrics
  (`timings.prompt_per_second` etc.) are NOT comparable across engines - the
  two engines compute them differently (e.g. llama.cpp excludes cached tokens;
  definitions of "predicted" differ with speculative decoding) - they are
  reported per engine, never differenced across engines by `compare`.
- The _client-side_ prefill/TTFT numbers assume the first streamed token
  arrives after prefill, which holds on both engines tested (llama.cpp and
  Strata both emit reasoning tokens first). On an engine that streams a
  role-only chunk first, TTFT is still measured from request send, so the
  metric remains time-to-first-generated-token.
- TTFT includes the chat template + prefill of the whole prompt; at 60K
  occupancy it is dominated by prefill, which is exactly the production
  behavior of a one-shot request. The short case answers the short-task
  latency question.
- Cold (n=1) numbers are indicative only; the repeat policy deliberately buys
  warm variance instead, since production traffic on these engines is
  continuous (the server stays loaded between requests).
- Output _quality_ is out of scope here (workload/behaviour scorer is the
  separate ai-eval-scorer-fix-c1 task); these numbers say nothing about
  correctness.
