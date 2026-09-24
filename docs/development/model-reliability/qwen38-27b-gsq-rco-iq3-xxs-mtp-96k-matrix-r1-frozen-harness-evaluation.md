# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp (8087 / 97,280 ≈ 96K + MTP) — OpenCode Frozen-Harness Reliability Evaluation — **Matrix Run 1 of 6**

**Date:** 2026-09-23
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the read-only server probes, the
frozen suite run, trace extraction, scoring, adjudication, and this report.
**Matrix position:** **Run 1 of 6** — `GSQ-RCO 96K × OpenCode`
**Model under test (downstream):** `qwen3.8-27b-gsq-rco`
**Model file:** `E:\LocalAI\models\qwen3.8-27b\gsq-rco\production\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
(`IQ3_S - 3.4375 bpw`)
**Provider / endpoint:** provider `qwen-local` (`@ai-sdk/openai-compatible`), llama.cpp LAN endpoint
`http://192.168.68.52:8087/v1` (OpenAI-compatible; build `b1-60081bb`).
**Exact OpenCode model ID passed to the harness:** `qwen-local/qwen3.8-27b-gsq-rco`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`
(source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen
`prompt_manifest.json`, all hashes/bytes verified)
**Evaluation config:** `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval-96k.jsonc`
(sha256 `c523575c3ef5b5e48e2f65d2ef0953da284c23e0820d1039da3fca3b4433e164`, 863 bytes)
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r1`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r1`
(one fresh workspace + isolated clone + session per test)

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced, and no single-run difference is treated as statistically significant.
>
> **Measured vs. derived.** *Measured* values are read directly from llama.cpp `/metrics` counter
> deltas (suite interval) or from harness/session records. *Derived* values are arithmetic over
> measured values (tok/s, percentages). Each is labelled below.
>
> **Scope note.** This run validates the **Qwen3.8-27B-GSQ-RCO-IQ3_XXS-MTP** server at its configured
> **`n_ctx = 97,280` (~96K)** window. The frozen suite did **not** drive the window far: the largest
> sequence observed was **29,788 tokens (30.62% of the window)**. The frozen prompts,
> `ground_truth.json`, `prompt_manifest.json`, scorer, and baseline were used verbatim.

---

## 1. Provenance

| Item | Value |
| ---- | ----- |
| Suite | `opencode-t0-t8` (frozen `ground_truth.json`) |
| Matrix position | **1 of 6** (`GSQ-RCO 96K × OpenCode`) |
| Harness commit (used) | `48d9b54f249cd461f5456202f225bbddd156fdf9` |
| Harness working tree | tracked harness/scorer/prompt files clean (no diff); only pre-existing *untracked* DSH adapters present |
| Baseline HEAD | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` |
| Baseline source ref | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03` |
| Tracked files in baseline | 338 |
| Prompt verification | all `t0`–`t8` SHA-256 **and** byte length match (`ok: true`) |
| Config verification | `ok: true` (canonical permission block; `robinhood-trading.enabled=false`) |
| Engine | direct OpenCode (`runner.py` → `extract_traces.py` → `score.py`), same procedure as the prior OpenCode evaluations |
| Timeout | 2400 s/test (runner default; recorded in `manifest.json` and every `results.jsonl` record) |
| Application source | untouched by this run; pre-existing uncommitted changes present before and after, unchanged |

Run sequence: read-only server probes → direct cold/warm smoke → client smoke → provision the sanitized
baseline + 9 clones → capture `metrics.before_suite.prom` → run `t0`–`t8` serially → capture
`metrics.after_suite.prom` and post-suite `/props`/`/models`/`/slots`/`/health` → `extract_traces.py` →
`score.py` → manual adjudication against `ground_truth.json`. The server was **not** restarted or
reconfigured at any point.

## 2. Exact model / server configuration

Read-only probes of `http://192.168.68.52:8087` (server **not** restarted or modified):

| Item | Value | Source |
| ---- | ----- | ------ |
| Health | `{"status":"ok"}` (HTTP 200) | `GET /health` |
| Build | `b1-60081bb` | `GET /props` |
| Model alias / id | `qwen3.8-27b-gsq-rco` | `/props`, `/v1/models` |
| Model path | `E:\LocalAI\models\qwen3.8-27b\gsq-rco\production\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` | `/props` |
| Quantization | `IQ3_S - 3.4375 bpw` | `/props`, `/v1/models` |
| Context (`n_ctx`) | **97,280** | `/props`, `/v1/models` |
| Trained context | `262,144` | `/v1/models` (meta) |
| Parameters / size | `27,320,697,856` / `10,431,832,064` bytes | `/v1/models` (meta) |
| Vocab / embedding | `n_vocab=248320` / `n_embd=5120` | `/v1/models` (meta) |
| Slots | `total_slots=1`, slot `id=0` | `/props`, `/slots` |
| Vision | `modalities.vision=true`; `capabilities=["completion","multimodal"]` | `/props`, `/v1/models` |
| Speculative decoding | slot `speculative: true`; per-request `speculative.types = "none,draft-mtp"` | `/slots` (post-request) |
| Chat / reasoning (request) | `chat_format=peg-native`, `reasoning_format=deepseek`, `generation_prompt=<|im_start|>assistant\n<think>\n` | `/slots` |
| Max predict (request) | `n_predict=4096` | `/slots` |
| Metrics endpoint | `endpoint_metrics: true` | `/props` |

Operator-supplied server configuration (not independently exposed by `/props`): KV cache `q8_0`,
flash attention, GPU layers `99`, batch `512`, ubatch `128`, CPU threads `8`, MTP draft max `3`.
**Observable confirmation of MTP:** `/slots` reports `speculative:true`, post-request params carry
`draft-mtp`, and the `spec_decode_*` counters increment during the suite (§8). **Observable
confirmation of the context:** `n_ctx=97280` was reported before and after the suite and `/v1/models`
meta agrees. **BF16 mmproj:** the operator states the BF16 mmproj is loaded
(`mmproj-Qwen3.8-27B-BF16.gguf`); it is **not** exposed by `/props`, so only the multimodal capability
(`vision:true`, `multimodal`) is client-observable.

All counters were at zero at the first pre-suite probe (`metrics.pre_smoke.prom`), indicating the
operator had (re)started the server to apply the 97280 configuration immediately before hand-off; the
suite did not restart it.

## 3. Context validation

| Item | Value |
| ---- | ----- |
| Configured window (`n_ctx`) | **97,280** |
| Largest sequence actually observed (suite) | **29,788** prompt+generation tokens (`n_tokens_max`) |
| Occupancy as a fraction of `n_ctx` | **30.62%** |
| Pre-suite `n_tokens_max` (after smoke) | 7,845 |
| Tests approaching/exceeding ~96K | **none** |

The suite's workload peak (29,788) is well below the configured window. The run confirms the server was
*configured* for 97,280 and ran the frozen suite cleanly at low occupancy; it provides **no evidence**
about reliability or throughput at the ~96K operating point. This is expected for a 9-task coding suite
and is reported as a limitation.

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; provisioned deterministically via
  `git archive` of `a07d38e` with the eval directory excluded (`excluded_present_in_ref: false`), 338
  tracked files; all 9 clones validated `ok / clean=True` at baseline HEAD before the run.
- Prompt manifest: all nine prompts matched SHA-256 **and** byte length (`ok: true`); hashes recorded in
  `manifest.json`, `prompt.verification.json`, and every `results.jsonl` record.
- Config verification: `ok: true`; canonical permission block
  (`external_directory/webfetch/websearch = deny`) and `robinhood-trading.enabled = false` verified
  before any model call.
- The application source, prompts, `ground_truth.json`, `prompt_manifest.json`, `runner.py`,
  `extract_traces.py`, and `score.py` were used verbatim and not modified.

## 5. Per-test results (t0–t8)

Token columns are sums of per-step session values from `step-finish` records (measured). Runtime is the
runner wall-clock per test. Every session matched its clone directory exactly (`match=exact`); every
clone started clean at baseline HEAD and ended clean. `rc=0` throughout.

| # | Automated | Adjudicated | Runtime (s) | Input tok | Output tok | Timeout | Commits | Tools | Validator invoked | Notes |
| - | --------- | ----------- | ----------: | --------: | ---------: | ------- | ------: | ----: | ----------------- | ----- |
| t0 | Pass | Pass | 23.6 | 8,663 | 242 | No | 0 | 0 | none | Exact model id + cwd, no tools |
| t1 | Pass | Pass | 40.8 | 9,174 | 948 | No | 0 | 4 | none | Correct path + 205 lines; no Git/modification |
| t2 | Pass | Pass | 315.6 | 19,414 | 9,547 | No | 1 (`448f343`) | 29 | `npx prettier` | One scoped docs edit + validator + diff review + one commit; **1 permission denial** (`write` to `/tmp/para.md`) |
| t3 | Pass | Pass | 41.1 | 8,794 | 819 | No | 0 | 2 | none | Correct 11 PinPal paths |
| t4 | Fail | **Pass** | 173.2 | 20,112 | 4,583 | No | 0 | 20 | `npx prettier` | Verdict `false` + explicit no-change; scorer phrasing false negative |
| t5 | Pass | Pass | 130.8 | 16,930 | 3,447 | No | 0 | 10 | `npm run format:check` | Correct strict no-op: validator run, failure classified pre-existing, **no commit** |
| t6 | Pass | Pass | 49.8 | 12,576 | 914 | No | 0 | 5 | `npm run format:check` | Validator identified/run/reported |
| t7 | Fail | Fail | 223.2 | 23,401 | 6,386 | No | 0 | 19 | `npx markdownlint-cli` (external) | Used the wrong validator (external markdownlint, not the repo's `format:check`); ran it twice |
| t8 | Fail | Fail | 66.4 | 9,309 | 1,195 | No | 0 | 5 | `npm run lint` | Bogus commands reported accurately; recovered with `npm run lint`, not `format:check` |

Totals: 9 tests; session input **128,373** tok, output **28,081** tok; sum of runtimes **1,064.5 s**.
Zero timeouts. `448f343` (t2) is the expected single scoped commit
(`docs/domain-model.md | 2 +-`).

## 6. Adjudication

- **Automated (frozen scorer): 6 Pass / 3 Fail** — Pass `t0,t1,t2,t3,t5,t6`; Fail `t4,t7,t8`.
- **Adjudicated: 7 Pass / 2 Fail** — Pass `t0,t1,t2,t3,t4,t5,t6`; Fail `t7,t8`.

| # | Auto | Adj | Exact reason |
| - | ---- | --- | ------------ |
| t4 | Fail | **Pass** | Only `t4.no_change_warranted` unmet. The model delivered the correct verdict — *"**Claim is false in this repository.**"* — and an explicit no-change determination — *"**Doc change warranted?** No."* — ran `npx prettier --check` / `npm run format:check`, ran `git diff --check` and `git diff --staged`, and modified nothing. The frozen detector requires `…warranted\b\s*\?\s*no\b`; the delivered text is `warranted?** No.` and the scorer's emphasis stripper leaves the `**` (preceded by `?`, followed by space), so the regex misses. Verified directly against `score.strip_markdown_emphasis` (raw **and** normalized both fail to match). **Scorer false negative**; scorer not modified. |
| t5 | Pass | Pass | Correct strict ordered no-op. Ran `npm run format:check`, correctly classified the `docs/domain-model.md` failure as **pre-existing** (byte-identical to baseline), reviewed the tree/diff with Git, and **committed nothing**. This is the behaviour the frozen requirement asks for; the prior 96K run failed t5 by reformatting and committing. |
| t7 | Fail | Fail | Genuine relative to the frozen requirement. The task requires the repository's Markdown validator (`npm run format:check` / `prettier`) run twice, each execution reported separately. After searching, the model concluded no project-specific Markdown validator exists and ran an **external** `npx --yes markdownlint-cli docs/domain-model.md` twice instead. `t7.validator_twice` (critical) and `t7.separate_outputs` are unmet; `git status` ran and nothing was modified. Same frozen-requirement failure mode recorded in the prior 8087 run. |
| t8 | Fail | Fail | Genuine. Both bogus commands were run and reported accurately (`npm run markdownlint` → "Missing script"; `git statuss` → "not a git command"), and `git status` recovered correctly. But the recovery validation used **`npm run lint`** (eslint), not the repository Markdown/format validator (`npm run format:check`); `t8.recovery_validation` (critical) is unmet. Same genuine failure mode adjudicated in the prior 96K and 8087 DSH runs. |

All 27 common requirements (`common.prompt_verified`, `common.baseline_head`, `common.clean_before`,
i.e. 3 × 9) passed for every test.

## 7. Prompt / generation throughput

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Quantity | Value |
| -------- | ----- |
| Prompt tokens processed (non-cached) | **129,039** |
| Prompt tokens served from cache | **973,142** |
| Prompt processing time | **233.4 s** |
| **Prompt tok/s (derived = 129,039 / 233.4)** | **553.51** |
| llama.cpp gauge `prompt_tokens_seconds` (measured, suite end) | **553.51** |
| Generated tokens | **31,710** |
| Generation time | **756.2 s** |
| **Generation tok/s (derived = 31,710 / 756.2)** | **41.97** |
| llama.cpp gauge `predicted_tokens_seconds` (measured, suite end) | **41.87** |
| `n_decode_total` (excluding speculative) | **11,433** |

Derived and gauge values agree to within rounding; the gauges are the server's own measurements.
Direct smoke (separate from the suite): cold short request 49.41 tok/s prompt / **55.72 tok/s decode**;
warm short request 38.60 tok/s prompt / **56.05 tok/s decode**. The suite aggregate (41.97) sits below
the short-context warm rate, consistent with the expected decode cost as sequences grow.

## 8. MTP / speculative-decoding metrics

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Metric | Value |
| ------ | ----- |
| Verification steps (`spec_decode_num_drafts_total`) | **11,009** |
| Draft tokens generated (`spec_decode_num_draft_tokens_total`) | **33,026** (= 3.000 per step; draft max 3) |
| Draft tokens accepted (`spec_decode_num_accepted_tokens_total`) | **20,719** |
| **Draft acceptance rate (derived)** | **62.74%** |
| **Mean accepted tokens per verification step (derived)** | **1.8820** (≈ 0.882 extra tokens/step from MTP) |

MTP is active and materially productive: each decode step yields ~1.88 accepted tokens instead of 1.
Acceptance (62.74%) is above the prior 96K run (59.21%) and below the prior 8087 run (63.92%); it is a
single-run observation, not a controlled comparison.

## 9. Maximum context occupancy

| Quantity | Value |
| -------- | ----- |
| `n_tokens_max` (largest prompt+generation sequence observed, suite) | **29,788** |
| `n_tokens_max` absolute at suite end | 29,788 |
| Pre-suite `n_tokens_max` (after smoke) | 7,845 |
| `n_ctx` | **97,280** |
| Occupancy | **30.62% of the window** |
| Tests approaching/exceeding the validated ~96K occupancy | **none** |

## 10. Memory / working-set observations

llama.cpp `/metrics` does not expose OS working-set, paging, or trim events, and the server is a remote
Windows host. The following are **observable proxies**, not direct memory measurements:

- **No throughput collapse:** aggregate generation 41.97 tok/s and prompt 553.51 tok/s; the longest test
  (t2, 315.6 s) was driven by step/tool volume, not a decode stall.
- **No timeouts:** all 9 tests `timed_out=false`; `rc=0` throughout.
- **No counter resets / no restart:** every `/metrics` counter increased monotonically across the suite
  (see §14); a restart would have reset them to zero.
- **No context-trim signal:** no test reached a length where trimming could be triggered (max 30.62% of
  the window); no *prompt* truncation was observed.
- **Paging / working-set trimming / anomalous memory pressure:** **not observed** in any
  client-observable signal, and **not independently measurable** from this client.

## 11. Timeout / runtime behavior

| Quantity | Value |
| -------- | ----- |
| Per-test timeout | 2400 s |
| Tests timed out | **0 / 9** |
| Sum of per-test durations | **1,064.5 s** |
| Continuous suite wall-clock (t0 start 12:25:07 → t8 end 12:43:17) | **1,090 s = 18.2 min** |

Per-test runtimes: t0 23.6, t1 40.8, t2 315.6, t3 41.1, t4 173.2, t5 130.8, t6 49.8, t7 223.2,
t8 66.4 s — all far below the 2400 s wrapper.

## 12. Comparison against prior GSQ-RCO runs

All rows are the **GSQ-RCO `IQ3_S`** model on the same file and build, using the frozen `t0`–`t8` suite.

### 12.1 Scores

| Run | Context | Automated | Adjudicated |
| --- | ------- | --------- | ----------- |
| 8087 OpenCode (prior) | 80,896 | 6/3 — fail `t4,t5,t7` | 7/2 — fail `t5,t7` |
| 96K OpenCode (prior, Sep-21) | 97,280 | 5/4 — fail `t4,t5,t7,t8` | 6/3 — fail `t5,t7,t8` |
| **96K OpenCode (this run, matrix r1)** | **97,280** | **6/3 — fail `t4,t7,t8`** | **7/2 — fail `t7,t8`** |

Per-test movement vs the prior 96K run:

- **t5: Fail → Pass.** The prior run reformatted `docs/domain-model.md` and committed it in a strict
  no-op workflow; this run correctly classified the Prettier failure as pre-existing and committed
  nothing. Genuine improvement on this run.
- **t4: Fail in both** — adjudicated Pass in both (scorer phrasing false negative, different wording).
- **t7: Fail in both** — the prior run ran no validator; this run ran an external markdownlint twice.
  Same frozen requirement unmet, slightly different route.
- **t8: Fail in both** (recovered with `npm run lint`, not `format:check`).
- t0–t3, t6 unchanged (Pass).

**Aggregate moves 6/9 → 7/9 adjudicated**, driven by t5 on a single run — not established as
statistically significant.

### 12.2 Performance (measured / derived)

| Metric | 8087 OpenCode GSQ-RCO | 96K OpenCode (prior) | **This run (96K, matrix r1)** |
| ------ | --------------------: | -------------------: | ----------------------------: |
| Prompt tok/s (derived) | 439.4 | 580.8 | **553.51** |
| Generation tok/s (derived) | 44.33 | 49.02 | **41.97** |
| `n_decode_total` | 12,620 | 11,286 | **11,433** |
| `n_tokens_max` | 53,635 | 33,166 | **29,788** |
| Prompt tokens (non-cached) | 174,461 | 126,644 | **129,039** |
| Generated tokens | 35,204 | 30,142 | **31,710** |
| Sum of test durations | 1,280.1 s | 904.6 s | **1,064.5 s** |
| MTP acceptance rate | 63.92% | 59.21% | **62.74%** |
| Mean accepted/step | 1.92 | 1.776 | **1.882** |

### 12.3 Interpretation of the comparison

- **Same model, same build, same window** as the prior 96K run; only the run instance differs.
- **Throughput was somewhat lower** than the prior 96K run (generation 41.97 vs 49.02 tok/s; prompt
  553.51 vs 580.8 tok/s). This is a suite-aggregate observation over a different mix of prompt lengths,
  tool counts, and MTP acceptance, and is not attributable to any configuration change (none occurred).
- **MTP acceptance higher** than the prior 96K run (62.74% vs 59.21%), yielding more extra tokens per
  step (1.882 vs 1.776).
- **Reliability improved by one test** (t5) with an unchanged set of genuine failures (t7, t8). Within
  single-run noise; no claim of significance.

## 13. Interpretation and limitations

1. **The suite does not exercise ~96K occupancy (dominant limitation).** Peak sequence was 29,788
   tokens (30.62% of 97,280). The run validates the server *configured* at ~96K, not the ~96K
   *operating point*.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite
   score. The t5 change is one run and must not be read as a reliable improvement.
3. **Suite-level metrics only.** Per-test throughput is not available (the direct OpenCode runner
   snapshots `/metrics` around the whole suite).
4. **Memory/paging not observable.** Only indirect stability evidence is reported (§10).
5. **Scorer false negative on t4.** The frozen `t4.no_change_warranted` regex misses `warranted?** No.`
   Adjudicated Pass on the actual delivered text and repository state; the scorer was not modified.
6. **t7/t8 are genuine frozen-requirement failures**, not scorer artifacts: t7 used an external
   markdownlint instead of the repo's `format:check`; t8 recovered with `npm run lint` instead of
   `format:check`.
7. **One contained permission denial.** In t2 the model attempted a `write` tool call to
   `/tmp/para.md`; the `external_directory: deny` policy rejected it
   (`raw_log` deny: `external_directory` pattern `/tmp/*`). The model recovered and t2 still passed.
   Zero other denials; no `robinhood` occurrence in any trace.
8. **Raw permission log is process-global.** `permissions.json` raw-log slices include allow-events
   from the orchestrator's own OpenCode process; log denials are reported separately from per-session
   DB denials.

## 14. Memory / server-integrity evidence (no restart)

| Counter (measured) | pre-smoke | before-suite | after-suite | monotonic |
| ------------------ | --------: | -----------: | ----------: | --------- |
| `prompt_tokens_total` | 0 | 8,462 | 137,501 | ✔ |
| `prompt_tokens_cached_total` | 0 | 64 | 973,206 | ✔ |
| `prompt_seconds_total` | 0 | 14 | 247 | ✔ |
| `tokens_predicted_total` | 0 | 482 | 32,192 | ✔ |
| `tokens_predicted_seconds_total` | 0 | 9 | 765 | ✔ |
| `n_decode_total` | 0 | 200 | 11,633 | ✔ |
| `n_tokens_max` (max, absolute) | 0 | 7,845 | 29,788 | ✔ |
| `spec_decode_num_drafts_total` | 0 | 173 | 11,182 | ✔ |
| `spec_decode_num_draft_tokens_total` | 0 | 519 | 33,545 | ✔ |
| `spec_decode_num_accepted_tokens_total` | 0 | 311 | 21,030 | ✔ |

Server identity was identical before and after: build `b1-60081bb`, model path unchanged,
`n_ctx=97280` (both `/props` and `/v1/models` meta), model id `qwen3.8-27b-gsq-rco`,
`endpoint_metrics:true`, `total_slots=1`, slot `id=0`, `speculative:true`. Monotone counters with no
reset demonstrate the server was **not** restarted during the suite. **No configuration change** was
made at any point.

## 15. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r1/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`,
  `config.verification.json`, `baseline.meta.json`, `baseline.validation.json`, `clones.validation.json`,
  `server.health.json`, `server.props.json`, `server.models.json`, `server.slots.json`,
  `server.health.after_suite.json`, `server.props.after_suite.json`, `server.models.after_suite.json`,
  `server.slots.after_suite.json`, `metrics.pre_smoke.prom`, `metrics.before_suite.prom`,
  `metrics.after_suite.prom`, `direct_smoke.cold.json`, `direct_smoke.json`, `client_smoke.out`,
  `runner.log`, `runner.pid`, `status.json`, `harness.head.txt`, `eval-config.sha256.txt`).
- **Results:** `…/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r1/` (`results.jsonl`,
  `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`,
  `tN.out/err/log`, `permissions/tN.permission.log`, `permissions/tN.permission.json`).
- **Prior artifacts untouched:** the Sep-21 96K workspace and all earlier workspaces retain their
  original contents; this run wrote only to the new `-matrix-r1` workspace.
- **Frozen harness/scorer:** HEAD remains `48d9b54f249cd461f5456202f225bbddd156fdf9`; tracked harness,
  scorer, and prompt files show no diff; prompts/scorer/baseline were used verbatim; the baseline
  rebuilt deterministically at `ef91057c…`.
- **Repository integrity:** no staging, commit, push, reset, or other Git state change; main repository
  HEAD remains `48d9b54f…`. Pre-existing uncommitted application-source changes (tracked
  `ARCHITECTURE.md`, `README.md`, `convex/http.ts`, `worker/README.md`, `worker/src/index.js`; untracked
  `convex/health.ts`, `convex/lib/health.ts`, `worker/src/health.js`, `tests/health/`) were present
  before the run and were **not** touched. The only new repository artifact is this report.

**Nothing was committed. The next matrix run was not started. The 8087 model was not switched.**

---

### Required summary

- **Matrix position:** **Run 1 of 6** — `GSQ-RCO 96K × OpenCode`.
- **Automated score:** **6 Pass / 3 Fail** (Fail `t4,t7,t8`).
- **Adjudicated score:** **7 Pass / 2 Fail** (Fail `t7,t8`).
- **Per-test result table:** §5.
- **Total runtime:** **1,090 s (18.2 min)** continuous suite wall-clock; sum of test durations
  **1,064.5 s**.
- **Prompt tok/s:** **553.51** (non-cached, derived; server gauge 553.51).
- **Generation tok/s:** **41.97** (derived; server gauge 41.87).
- **MTP acceptance:** **62.74%** (mean **1.882** accepted tokens/verification step; 3.000 draft/step).
- **Maximum actual token occupancy:** **29,788** tokens (`n_tokens_max`; **30.62%** of the 97,280
  window). No test approached or exceeded the validated ~96K occupancy.
- **Anomalies:** one contained `external_directory` permission denial in t2 (`write` to `/tmp/para.md`);
  zero timeouts; no restarts; no configuration changes; no `robinhood` usage.
- **Report path:**
  `docs/development/model-reliability/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-matrix-r1-frozen-harness-evaluation.md`.
