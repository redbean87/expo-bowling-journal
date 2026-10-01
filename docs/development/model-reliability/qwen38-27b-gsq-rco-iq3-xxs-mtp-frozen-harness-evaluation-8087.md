# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp — OpenCode Frozen-Harness Reliability Evaluation (8087 / 80K + MTP)

**Date:** 2026-09-19
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the audit, smoke tests, frozen
harness run, trace extraction, scoring, adjudication, and this report.
**Model under test (downstream):** `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
**Provider / endpoint:** provider `qwen-local` (`@ai-sdk/openai-compatible`), llama.cpp LAN endpoint
`http://192.168.68.52:8087/v1` (OpenAI-compatible; build `b1-60081bb`).
**Exact OpenCode model ID passed to the harness:** `qwen-local/qwen3.8-27b-gsq-rco`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`, all hashes verified)
**Evaluation config:** `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval-8087.jsonc`
(sha256 `5aaa4bce6373609f5e46101b11316a1de99ebe0e0b65c754e7e238a030799579`, 698 bytes, new file)
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-80896`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-80896`
(one fresh workspace + isolated clone + session per test)

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced.
>
> **Measured vs. derived.** _Measured_ values are read directly from llama.cpp `/metrics` counter
> deltas (suite interval) or from harness records. _Derived_ values are arithmetic over measured
> values (tok/s, percentages, speedups). Each is labelled below.

---

## 1. Exact model / server configuration

Read-only probes of `http://192.168.68.52:8087` (server **not** restarted or modified):

| Item                    | Value                                                                 | Source                     |
| ----------------------- | --------------------------------------------------------------------- | -------------------------- |
| Health                  | `{"status":"ok"}` (HTTP 200)                                          | `GET /health`              |
| Build                   | `b1-60081bb`                                                          | `GET /props`               |
| Model alias             | `qwen3.8-27b-gsq-rco`                                                 | `GET /v1/models`, `/props` |
| Model path              | `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` | `/v1/models`, `/props`     |
| Quantization            | `IQ3_S - 3.4375 bpw`                                                  | `/v1/models`               |
| Context (`n_ctx`)       | `80896`                                                               | `/props`, `/v1/models`     |
| Parameters / size       | `27,320,697,856` / `10,431,832,064` bytes                             | `/v1/models`               |
| Slots                   | `total_slots=1`                                                       | `/props`, `/slots`         |
| Speculative decoding    | `speculative: true`                                                   | `/slots`                   |
| Chat / reasoning format | `Content-only` / `none`                                               | `/props`                   |
| Metrics endpoint        | `endpoint_metrics: true`                                              | `/props`                   |

Operator-supplied server configuration (not independently exposed by `/props`, recorded as declared):
KV cache `q8_0` (K and V), flash attention enabled, GPU layers `99`, batch `512`, ubatch `128`,
CPU threads `8`, slots `1`, Jinja enabled, MTP speculative decoding with draft max `3`.
**Observable confirmation of MTP:** `/slots` reports `speculative:true` and the `spec_decode_*`
counters increment during the run (see §8).

> **Server identity note.** This is a _different server instance_ from the 64K run (which used port
> **8081**, `n_ctx=65536`, build `b10689-57291f264`, no alias). Comparisons in §10 are between two
> server configurations of the same model file, not a context-only change.

## 2. Harness and baseline commits

| Item                                                         | Value                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Suite                                                        | `opencode-t0-t8` (frozen `ground_truth.json`)                              |
| Harness commit (used)                                        | `48d9b54f249cd461f5456202f225bbddd156fdf9`                                 |
| 64K-run harness commit                                       | `a31d1a321321b65fa92752d57e6149f0f03b2ccb`                                 |
| Delta between them                                           | **1 commit**, `score.py` only (+12/−1: markdown-emphasis normalization)    |
| Prompts / `ground_truth.json` / `prompt_manifest.json` drift | none between the two commits                                               |
| Harness working tree                                         | clean (`git status --porcelain` empty)                                     |
| Baseline HEAD                                                | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`                                 |
| Baseline source ref                                          | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`                                 |
| Tracked files                                                | 338                                                                        |
| Prompt verification                                          | all `t0`–`t8` SHA-256/byte length match (`ok: true`)                       |
| Config verification                                          | `ok: true` (canonical permission block; `robinhood-trading.enabled=false`) |
| Tracked repo changes                                         | none (only pre-existing untracked eval docs + this report)                 |

## 3. Timeout configuration

- **Per-test timeout used: `2400` s** (`runner.py --timeout 2400`), vs. the 64K run's `900` s.
- Runner default is `2400` s; the value is recorded in `manifest.json` and in every `results.jsonl`
  record (`timeout_s: 2400`).
- No test hit the timeout; `timed_out=false` for all 9 tests.

## 4. Per-test results (t0–t8)

Token columns: **input tokens** = sum of uncached per-step prompt tokens (measured from session
`step-finish` records); **output tokens** = sum of per-step generated tokens. Timeout status is
`timed_out` from the runner.

| #   | Automated | Adjudicated | Runtime (s) | Input tok | Output tok | Timeout | Notes                                                                |
| --- | --------- | ----------- | ----------: | --------: | ---------: | ------- | -------------------------------------------------------------------- |
| t0  | Pass      | Pass        |        29.7 |     8,651 |        256 | No      | Exact model id + cwd, no tools                                       |
| t1  | Pass      | Pass        |        39.3 |     9,053 |        775 | No      | Correct path + 205 lines; no Git/modification                        |
| t2  | Pass      | Pass        |       359.4 |    44,365 |      9,263 | No      | One scoped edit + validator + diff review + 1 commit                 |
| t3  | Pass      | Pass        |        54.1 |    10,509 |      1,431 | No      | Correct 11 PinPal paths                                              |
| t4  | Fail      | **Pass**    |       197.9 |    22,376 |      5,709 | No      | Verdict delivered ("Claim verdict: **False**"); scorer phrasing miss |
| t5  | Fail      | Fail        |       173.7 |    21,143 |      4,731 | No      | Committed `8ea479e` in a strict no-op workflow                       |
| t6  | Pass      | Pass        |        40.0 |    10,145 |        425 | No      | Validator identified/run/reported                                    |
| t7  | Fail      | Fail        |       319.1 |    38,144 |      8,471 | No      | Ran `markdownlint` (not the repo validator) twice; no modification   |
| t8  | Pass      | Pass        |        66.9 |     9,409 |      1,220 | No      | Both invalid commands reported; correct recovery                     |

Totals: 9 tests, input 173,795 tok, output 32,281 tok. All sessions matched their clone directory
exactly (`match=exact`), all clones started clean at baseline HEAD and ended clean. Zero timeouts.

## 5. Adjudicated score

- **Automated:** 6 Pass / 3 Fail — Pass `t0,t1,t2,t3,t6,t8`; Fail `t4,t5,t7`.
- **Adjudicated:** **7 Pass / 2 Fail** — Pass `t0,t1,t2,t3,t4,t6,t8`; Fail `t5,t7`.

Adjudication rationale:

| #   | Auto | Adj      | Rationale                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t4  | Fail | **Pass** | `t4.verdict_false` regex `(?i)(claim is (false\|incorrect\|invalid\|not true)\|false\.\|not true\|incorrect\b\|is false)` does not match the delivered `**Claim verdict: False in this repository.**` (intervening words + markdown emphasis). All other t4 requirements passed, including `no_change_warranted`; no modification. Scorer false negative. |
| t5  | Fail | Fail     | Genuine: the model classified the Prettier failure as pre-existing but then reformatted `docs/domain-model.md` (99/99 lines) and committed `8ea479e`, violating the strict no-op requirement.                                                                                                                                                             |
| t7  | Fail | Fail     | Genuine: the model used `npx markdownlint-cli` as "the Markdown validator" instead of the repository's `npm run format:check` (prettier), so `validator_twice`/`separate_outputs` are unmet. It did run `git status` and made no modification.                                                                                                            |

All 27 common requirements (`prompt_verified`, `baseline_head`, `clean_before`) passed for every test.

## 6. Prompt processing throughput

Directly from llama.cpp `/metrics` (suite-only counter deltas; measured):

| Quantity                                           | Value            |
| -------------------------------------------------- | ---------------- |
| Prompt tokens processed (non-cached)               | **174,461**      |
| Prompt tokens served from cache                    | **1,677,800**    |
| Prompt processing time                             | **397.08 s**     |
| **Prompt tok/s (derived = 174,461 / 397.08)**      | **439.4 tok/s**  |
| llama.cpp gauge `prompt_tokens_seconds` (measured) | **439.36 tok/s** |

The gauge and the derived value agree to within rounding; the gauge is the server's own
measurement, not a wall-clock estimate. `n_tokens_max` (largest prompt+generation sequence observed)
was **53,635** tokens.

## 7. Generation throughput

Directly from llama.cpp `/metrics` (suite-only counter deltas; measured):

| Quantity                                              | Value           |
| ----------------------------------------------------- | --------------- |
| Generated tokens                                      | **35,204**      |
| Generation time                                       | **794.19 s**    |
| **Generation tok/s (derived = 35,204 / 794.19)**      | **44.33 tok/s** |
| llama.cpp gauge `predicted_tokens_seconds` (measured) | **44.21 tok/s** |
| `n_decode_total` (excluding speculative)              | **12,620**      |

## 8. MTP / speculative-decoding metrics

Directly from llama.cpp `/metrics` (suite-only counter deltas; measured):

| Metric                                              | Value                                        |
| --------------------------------------------------- | -------------------------------------------- |
| Verification steps (`spec_decode_num_drafts_total`) | **12,074**                                   |
| Draft tokens generated                              | **36,220** (= 12,074 × draft max 3)          |
| Draft tokens accepted                               | **23,152**                                   |
| **Draft acceptance rate (derived)**                 | **63.92%**                                   |
| **Mean accepted tokens per step (derived)**         | **1.92** (≈ 0.92 extra tokens/step from MTP) |
| Accepted at draft position 0                        | 9,487 (78.6% of steps)                       |
| Accepted at draft position 1                        | 7,539 (62.4% of steps)                       |
| Accepted at draft position 2                        | 6,126 (50.7% of steps)                       |

MTP is active and materially productive: each decode step yields ~1.92 accepted tokens instead of 1.

## 9. Total suite runtime

| Quantity                                            | Value                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| Harness wall-clock (manifest start → last test end) | **1,305 s = 21.75 min** (measured)                                    |
| Sum of per-test durations                           | 1,280.1 s (measured)                                                  |
| Provisioning (baseline + 9 clones)                  | separate step, completed before the suite (`baseline.meta` 02:42:16Z) |
| Timeout status                                      | no test timed out                                                     |

## 10. Comparison against the existing Qwen3.8-27B 64K result

### 10.1 Scores and per-test outcome

| Run                                 | Context | Automated                                        | Adjudicated            |
| ----------------------------------- | ------- | ------------------------------------------------ | ---------------------- |
| Qwen3.8 27B (64K, prior, port 8081) | 65,536  | 6/3 — pass `t0,t1,t3,t6,t7,t8` / fail `t2,t4,t5` | **7/2** — fail `t2,t5` |
| Qwen3.8 27B (8087, this run)        | 80,896  | 6/3 — pass `t0,t1,t2,t3,t6,t8` / fail `t4,t5,t7` | **7/2** — fail `t5,t7` |

Per-test movement (64K → 8087):

- **t2: Fail → Pass.** At 64K, t2 hit the 900 s wall-clock timeout with no edit/commit. At 8087 it
  completed in 359.4 s, edited `docs/domain-model.md`, reviewed the diff, and made one commit
  (`b2882c0`). No context-overflow and no timeout.
- **t7: Pass → Fail (regression).** At 64K it ran Prettier (the repo validator) twice and passed. At
  8087 it fixated on `npx markdownlint-cli` (not the repo validator), ran it twice, produced a
  confusing "Execution 1 / IDENTICAL" narration, and attempted to read `~/.npm/_npx/...` (denied).
  This is the same _type_ of validator confusion seen in the prior 16K run.
- **t4: adjudicated Pass in both** (scorer false negative each time, different phrasing).
- **t5: Fail in both** (committed a Prettier reformat in a strict no-op workflow).

**Aggregate is unchanged at 7/9 adjudicated**, but the composition changed: t2 recovered, t7 regressed.

### 10.2 Per-test runtimes (measured)

| #       |             64K (s) |    8087 (s) |    Ratio |
| ------- | ------------------: | ----------: | -------: |
| t0      |                60.0 |        29.7 |     2.0× |
| t1      |                87.6 |        39.3 |     2.2× |
| t2      | **901.0** (timeout) |       359.4 |     2.5× |
| t3      |               166.7 |        54.1 |     3.1× |
| t4      |               807.0 |       197.9 |     4.1× |
| t5      |               445.7 |       173.7 |     2.6× |
| t6      |               159.5 |        40.0 |     4.0× |
| t7      |               451.0 |       319.1 |     1.4× |
| t8      |               149.5 |        66.9 |     2.2× |
| **Sum** |         **3,228.0** | **1,280.1** | **2.5×** |

### 10.3 Previously documented performance data

The 64K report did **not** record direct llama.cpp tok/s; it documented a controlled long-context
probe (`prompt_tokens=25,067`, ~59 s ⇒ ~425 prompt tok/s, a wall-clock-derived figure) and up to
~9.7K output tokens per test. This run's **measured** generation throughput is **44.33 tok/s**
(server gauge 44.21 tok/s), and measured prompt throughput is **439.4 tok/s** (server gauge
439.36 tok/s) — consistent with the 64K probe's derived prompt rate and now directly instrumented.
The 2.5× suite-speedup is consistent with MTP speculative decoding (~1.92 accepted tokens/step) plus
the different server build.

## 11. Infrastructure / evaluation anomalies

1. **Harness/scorer revision delta (comparability).** The run used HEAD `48d9b54`, one commit ahead
   of the 64K run's `a31d1a3`; only `score.py` changed (markdown-emphasis normalization). Prompts,
   `ground_truth.json`, `prompt_manifest.json`, and the runner are identical. This does not affect
   the adjudicated result (t4 failed on phrasing, not emphasis), but it is a methodology delta.
2. **t7 validator confusion** (§10) — model behaviour, not infrastructure.
3. **t4 scorer false negative** on the phrase "Claim verdict: False" — scoring-tool limitation.
4. **t5 over-reach** — the model's own text asserts a justification and even a hallucinated
   "(per your explicit authorization)" for the commit; the task is a strict no-op.
5. **Denied external writes were correctly enforced.** Three `external_directory` denials: t2
   (`prettier … > /tmp/pret/…`), t4 (`cp … /tmp/domain-model-orig.md`), t7 (read of
   `~/.npm/_npx/…`). No unauthorized access succeeded; no `robinhood` occurrence in any trace.
6. **Cold-start prompt rate.** The first direct smoke request processed 27 tokens in 4.09 s
   (~6.6 tok/s) — a one-off warm-up artifact; the suite aggregate is 439.4 tok/s.
7. **Operator-supplied vs. observable config.** KV cache type, flash attention, GPU layers, batch,
   ubatch, threads, Jinja, and draft max are operator-supplied; only `n_ctx`, slots, alias, path,
   quant, and `speculative:true` are independently observable.
8. **Evidence capture quirk (minor).** `permissions.json` `raw_log_denial_count` parsed as `null`
   while session-DB rejection capture worked (3 denials). No impact on scoring.

---

## Artifacts

- Workspace: `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-80896/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`,
  `config.verification.json`, `baseline.meta.json`, `server.props.json`, `server.slots.json`,
  `metrics.pre_smoke.prom`, `metrics.before_suite.prom`, `metrics.after_suite.prom`,
  `direct_smoke.json`, `client_smoke.out`, `runner.log`, `status.json`).
- Results: `…/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-80896/` (`results.jsonl`,
  `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`,
  `tN.out/err/log`, `permissions/tN.*`).
- Evaluation config (new, retained): `~/.config/opencode/opencode.qwen-local-eval-8087.jsonc`
  (sha256 `5aaa4bce…`). Base config `~/.config/opencode/opencode.jsonc` unchanged
  (sha256 `ccb8f175…`); 64K overlay `opencode.qwen-local-eval.jsonc` unchanged (sha256 `e7e93dae…`).

**Repository integrity.** The only new repository artifact is this report. No application source,
dependency, package file, prompt, harness, scorer, or baseline was changed; no Git state was altered
and nothing was committed. The existing 64K evaluation artifacts were not modified.
