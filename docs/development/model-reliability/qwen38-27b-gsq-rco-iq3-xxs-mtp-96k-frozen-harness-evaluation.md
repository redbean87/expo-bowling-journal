# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp (8087 / 97,280 ≈ 96K + MTP) — OpenCode Frozen-Harness Reliability Evaluation

**Date:** 2026-09-21
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the read-only server probes, the
frozen suite run, trace extraction, scoring, adjudication, and this report.
**Model under test (downstream):** `qwen3.8-27b-gsq-rco`
**Model file:** `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
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
**Evaluation config (new, retained):** `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval-96k.jsonc`
(sha256 `c52049708219ce8d451fb0a38e343bb022d2e508d57b2f53426671ab816a4ca6`, 710 bytes)
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280`
(one fresh workspace + isolated clone + session per test)

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced, and no single-run difference is treated as statistically significant.
>
> **Measured vs. derived.** *Measured* values are read directly from llama.cpp `/metrics` counter
> deltas (suite interval) or from harness/session records. *Derived* values are arithmetic over
> measured values (tok/s, percentages). Each is labelled below.
>
> **Scope note (read first).** This run tests the **Qwen3.8-27B-GSQ-RCO-IQ3_XXS-MTP** server at its
> newly configured **`n_ctx = 97,280` (~96K)** window — i.e. the configuration the prior Unsloth run
> could not reach. The frozen suite did **not** drive the window far: the largest sequence the suite
> produced was **33,166 tokens (34.1% of the window)**. The run therefore validates the server *at* the
> ~96K configuration, but does **not** independently reproduce the operator's ~96K *occupancy* preflight
> (see §3 and §9). The frozen prompts, `ground_truth.json`, `prompt_manifest.json`, scorer, and baseline
> were used verbatim.

---

## 1. Provenance

| Item | Value |
| ---- | ----- |
| Suite | `opencode-t0-t8` (frozen `ground_truth.json`) |
| Harness commit (used) | `48d9b54f249cd461f5456202f225bbddd156fdf9` |
| Harness working tree | tracked harness/scorer files clean; only the two pre-existing *untracked* DSH adapters present |
| Baseline HEAD | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` |
| Baseline source ref | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03` |
| Tracked files in baseline | 338 |
| Prompt verification | all `t0`–`t8` SHA-256 **and** byte length match (`ok: true`) |
| Config verification | `ok: true` (canonical permission block; `robinhood-trading.enabled=false`) |
| Engine | direct OpenCode (`runner.py` → `extract_traces.py` → `score.py`), same procedure as the prior 8087 OpenCode evaluations |
| Timeout | 2400 s/test (runner default; recorded in `manifest.json` and every `results.jsonl` record) |
| Application source | untouched by this run; pre-existing uncommitted changes present before and after, unchanged (hashes verified, §14) |

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
| Model alias / id | `qwen3.8-27b-gsq-rco` | `GET /v1/models`, `/props` |
| Model path | `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` | `/v1/models`, `/props` |
| Quantization | `IQ3_S - 3.4375 bpw` | `/v1/models` (meta) |
| Context (`n_ctx`) | **97,280** (95 KiB) | `/props`, `/v1/models` |
| Trained context | `262,144` | `/v1/models` (meta) |
| Parameters / size | `27,320,697,856` / `10,431,832,064` bytes | `/v1/models` (meta) |
| Vocab / embedding | `n_vocab=248320` / `n_embd=5120` | `/v1/models` (meta) |
| Slots | `total_slots=1`, slot `id=0` | `/props`, `/slots` |
| Speculative decoding | `speculative: true`; per-request `speculative.types = "none,draft-mtp"` | `/slots` |
| Chat / reasoning (request) | `chat_format=peg-native`, `reasoning_format=deepseek`, `generation_prompt=<|im_start|>assistant\n<think>\n` | `/slots` |
| Max predict (request) | `n_predict=4096` | `/slots` |
| Metrics endpoint | `endpoint_metrics: true` | `/props` |

Operator-supplied server configuration (not independently exposed by `/props`): KV cache `q8_0`,
flash attention, GPU layers `99`, batch `512`, ubatch `128`, CPU threads `8`, MTP draft max `3`.
**Observable confirmation of MTP:** `/slots` reports `speculative:true` + `draft-mtp`, and the
`spec_decode_*` counters increment during the suite (§8). **Observable confirmation of the new
context:** the same `n_ctx=97280` was reported before and after the suite, and `/v1/models` meta agrees.

> **Server identity note.** This is the **same GGUF and quantization** as the prior 64K and 8087
> GSQ-RCO runs, on the same build `b1-60081bb`, but with a **larger configured window (`97,280` vs
> `80,896`)**. All counters were at zero at the first pre-suite probe, indicating the operator had
> (re)started the server to apply the 97280 configuration immediately before hand-off; the suite did
> not restart it.

## 3. Context validation

The requested "~96K actual context occupancy" operating point is the configured window **97,280**.
What the frozen suite actually established:

| Item | Value |
| ---- | ----- |
| Configured window (`n_ctx`) | **97,280** |
| Largest sequence actually observed (suite) | **33,166** prompt+generation tokens (`n_tokens_max`) |
| Occupancy as a fraction of `n_ctx` | **34.1%** |
| Pre-suite `n_tokens_max` (after smoke) | 8,586 |
| Largest single prompt observed (`/slots n_prompt_tokens`, last request) | 11,899 |
| Tests approaching/exceeding ~96K | **none** |

The window grew from 80,896 → 97,280 and the server reported it consistently, so the ~96K
**configuration** was in force. However, the suite's workload peak (33,166) was *lower* than the prior
8087 GSQ-RCO run (53,635); no test came near 96K. The operator's preflight claim (~96K occupancy, ~45
tok/s warm decode, ~1.12% warm-decode CV, CLEAN characterization) is therefore **not independently
reproduced by this run** — it was a separate preflight, and the frozen suite is bounded well below the
window. This is expected for a 9-task coding suite and is reported as a limitation, not a contradiction.

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; provisioned deterministically via
  `git archive` of `a07d38e` with the eval directory excluded (`excluded_present_in_ref: false`), 338
  tracked files, all 9 clones validated `ok / clean=True` at baseline HEAD before the run.
- Prompt manifest: all nine prompts matched SHA-256 **and** byte length independently (`ok: true`);
  hashes recorded in `manifest.json`, `prompt.verification.json`, and every `results.jsonl` record.
- Config verification: `ok: true`; canonical permission block
  (`external_directory/webfetch/websearch = deny`) and `robinhood-trading.enabled = false` verified
  before any model call.
- The application source, prompts, `ground_truth.json`, `prompt_manifest.json`, `runner.py`,
  `extract_traces.py`, and `score.py` were used verbatim and not modified.

## 5. Per-test results (t0–t8)

Token columns are sums of per-step session values from `step-finish` records (measured). Runtime is the
runner wall-clock per test. Every session matched its clone directory exactly (`match=exact`); every
clone started clean at baseline HEAD and ended clean. `rc=0` throughout.

| # | Automated | Adjudicated | Runtime (s) | Input tok | Output tok | Timeout | Commits | Notes |
| - | --------- | ----------- | ----------: | --------: | ---------: | ------- | ------: | ----- |
| t0 | Pass | Pass | 23.8 | 8,647 | 241 | No | 0 | Exact model id + cwd, no tools |
| t1 | Pass | Pass | 42.8 | 9,739 | 767 | No | 0 | Correct path + 205 lines; no Git/modification |
| t2 | Pass | Pass | 227.0 | 25,884 | 7,565 | No | 1 (`1a8e132`) | One scoped docs edit + validator + diff review + one commit |
| t3 | Pass | Pass | 39.3 | 10,334 | 919 | No | 0 | Correct 11 PinPal paths |
| t4 | Fail | **Pass** | 214.3 | 16,609 | 8,045 | No | 0 | Verdict `FALSE` + explicit no-change; scorer phrasing false negative |
| t5 | Fail | Fail | 134.2 | 15,583 | 4,367 | No | 1 (`cc5115b`) | Committed a Prettier reformat in a strict no-op workflow |
| t6 | Pass | Pass | 39.9 | 10,652 | 645 | No | 0 | Validator (`npm run format:check`) identified/run/reported |
| t7 | Fail | Fail | 106.1 | 17,992 | 2,822 | No | 0 | Concluded "no validator exists"; ran **no** validator |
| t8 | Fail | Fail | 77.2 | 10,538 | 1,358 | No | 0 | Bogus commands reported; recovered with `npm run lint`, not `format:check` |

Totals: 9 tests; session input **125,978** tok, output **26,729** tok; sum of runtimes **904.6 s**.
Zero timeouts. `1a8e132` (t2) is the expected single scoped commit; `cc5115b` (t5) is the over-reach
that fails the no-op requirement.

## 6. Adjudication

- **Automated (frozen scorer): 5 Pass / 4 Fail** — Pass `t0,t1,t2,t3,t6`; Fail `t4,t5,t7,t8`.
- **Adjudicated: 6 Pass / 3 Fail** — Pass `t0,t1,t2,t3,t4,t6`; Fail `t5,t7,t8`.

| # | Auto | Adj | Exact reason |
| - | ---- | --- | ------------ |
| t4 | Fail | **Pass** | Only `t4.no_change_warranted` unmet. The model delivered the correct verdict — *"Claim evaluation — **FALSE** in this repository"* — and an explicit no-change determination — *"**Documentation change warranted?** No."* — ran `npm run format:check` / `npx prettier`, ran `git diff --check` and `git diff --staged`, and modified nothing. The frozen detector requires `warranted\b\s*\?\s*no\b`; the delivered text is `warranted?** No.` and the scorer's emphasis stripper does not remove the trailing `**` (preceded by `?`, followed by space), so the regex misses. Verified directly against `score.strip_markdown_emphasis` + `ground_truth.json` (raw and normalized both fail to match). **Scorer false negative**; scorer not modified. |
| t5 | Fail | Fail | Genuine. The model ran `npm run format:check`, correctly classified the `docs/domain-model.md` failure as pre-existing, then ran `npx prettier --write`, reformatted the file (+99/−99), and committed `cc5115b` ("docs: fix Prettier formatting…"). The task is a strict ordered workflow with "commit only if a justified change exists"; ground truth requires no commit. Same over-reach as the prior 64K, 8087 OpenCode, and DSH runs. |
| t7 | Fail | Fail | Genuine. The task requires the repository Markdown validator to be run twice, each execution reported separately. After an exhaustive search the model concluded *"No Markdown validator exists in this repo"* and executed **no** validator at all (neither `npm run format:check` nor `prettier`); its "execution 1 / execution 2" sections explicitly report "nothing executed". `t7.validator_twice` (critical) and `t7.separate_outputs` are therefore unmet. `git status` ran and nothing was modified. |
| t8 | Fail | Fail | Genuine. Both bogus commands were run and reported accurately (`npm run markdownlint` → "Missing script"; `git statuss` → "not a git command"), and `git status` recovered correctly. But the recovery validation used **`npm run lint`** (eslint), not the repository Markdown/format validator (`npm run format:check`, directly or via `npm run check`); `t8.recovery_validation` (critical) is unmet. Same genuine failure mode adjudicated in the prior 8087 DSH run. |

All 27 common requirements (`common.prompt_verified`, `common.baseline_head`, `common.clean_before`,
i.e. 3 × 9) passed for every test.

## 7. Prompt / generation throughput

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Quantity | Value |
| -------- | ----- |
| Prompt tokens processed (non-cached) | **126,644** |
| Prompt tokens served from cache | **1,037,946** |
| Prompt processing time | **218.045 s** |
| **Prompt tok/s (derived = 126,644 / 218.045)** | **580.82** |
| llama.cpp gauge `prompt_tokens_seconds` (measured, suite end) | **580.817** |
| Generated tokens | **30,142** |
| Generation time | **614.897 s** |
| **Generation tok/s (derived = 30,142 / 614.897)** | **49.02** |
| llama.cpp gauge `predicted_tokens_seconds` (measured, suite end) | **48.893** |
| `n_decode_total` (excluding speculative) | **11,286** |

Derived and gauge values agree to within rounding; the gauges are the server's own measurements.
Direct smoke (separate from the suite): cold short request 51.6 tok/s decode, **warm short request
58.98 tok/s** decode / 42.4 tok/s prompt; the suite aggregate (49.02) sits below the short-context warm
rate, consistent with the expected decode cost as sequences grow. No per-test tok/s is available from
the direct OpenCode runner (see §13).

## 8. MTP / speculative-decoding metrics

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Metric | Value |
| ------ | ----- |
| Verification steps (`spec_decode_num_drafts_total`) | **10,862** |
| Draft tokens generated (`spec_decode_num_draft_tokens_total`) | **32,586** (= 3.000 per step; draft max 3) |
| Draft tokens accepted (`spec_decode_num_accepted_tokens_total`) | **19,295** |
| **Draft acceptance rate (derived)** | **59.21%** |
| **Mean accepted tokens per verification step (derived)** | **1.7764** (≈ 0.776 extra tokens/step from MTP) |
| Accepted at draft position 0 | 8,302 (76.4% of steps) |
| Accepted at draft position 1 | 6,255 (57.6% of steps) |
| Accepted at draft position 2 | 4,738 (43.6% of steps) |

MTP is active and materially productive: each decode step yields ~1.78 accepted tokens instead of 1.
Acceptance is the lowest of the GSQ-RCO/Unsloth runs recorded so far (59.21% vs 63.92% at 8087 and
61.14% at DSH parity); it is a single-run observation, not a controlled comparison.

## 9. Maximum context occupancy

| Quantity | Value |
| -------- | ----- |
| `n_tokens_max` (largest prompt+generation sequence observed, suite) | **33,166** |
| `n_tokens_max` absolute at suite end | 33,166 |
| Pre-suite `n_tokens_max` (after smoke) | 8,586 |
| `n_ctx` | **97,280** |
| Occupancy | **34.1% of the window** |
| Tests approaching/exceeding the validated ~96K occupancy | **none** |
| Tests approaching the 97,280 window | **none** (largest single prompt 11,899; largest sequence 33,166) |

The suite never approached the configured window. It therefore provides **no evidence** about
throughput or stability at the ~96K operating point; the run confirms the server was *configured* for
97,280 and ran the frozen suite cleanly at low occupancy. This matches the pattern of the prior 8087
run (max 53,635 of 80,896) and the Unsloth run (max 42,976 of 80,896).

## 10. Memory / working-set observations

llama.cpp `/metrics` does not expose OS working-set, paging, or trim events, and the server is a remote
Windows host. The following are **observable proxies**, not direct memory measurements:

- **No throughput collapse:** aggregate generation 49.02 tok/s and prompt 580.82 tok/s; the longest test
  (t2, 227.0 s) was driven by step/widget volume, not a decode stall.
- **No timeouts:** all 9 tests `timed_out=false`; `rc=0` throughout.
- **No counter resets / no restart:** every `/metrics` counter increased monotonically across the suite
  (see §14); a restart would have reset them to zero.
- **No context-trim signal in the response layer:** no test reached a length where trimming could be
  triggered (max 34.1% of the window); no *prompt* truncation was observed.
- **Paging / working-set trimming / anomalous memory pressure:** **not observed** in any
  client-observable signal, and **not independently measurable** from this client. The operator's
  preflight claims (no working-set trimming, no sustained paging, ~75% system commit) are recorded as
  **unconfirmed** here, as they are server-side OS facts that llama.cpp `/metrics` does not expose.
- **No context-dependent collapse to attribute to pressure:** because occupancy stayed ≤34.1%, slower
  prompt processing at larger context could not be evaluated; the observed aggregate is consistent with
  normal context-dependent cost, not memory/OS pressure.

## 11. Timeout / runtime behavior

| Quantity | Value |
| -------- | ----- |
| Per-test timeout | 2400 s |
| Tests timed out | **0 / 9** |
| Sum of per-test durations | **904.6 s** |
| Continuous suite wall-clock (first test start 03:11:39 → last test end 03:27:08) | **929 s = 15.5 min** |
| Manifest start → last test end | 930 s |
| Provisioning (baseline + 9 clones) | separate step, completed before the suite (`baseline.meta` 2026-09-21T03:09:29Z) |

Per-test runtimes: t0 23.8, t1 42.8, t2 227.0, t3 39.3, t4 214.3, t5 134.2, t6 39.9, t7 106.1,
t8 77.2 s — all far below the 2400 s wrapper.

## 12. Comparison against prior 64K, 8087, and DSH results

Prior rows are the **GSQ-RCO `IQ3_S`** model on the same file; the Unsloth row is a different
quantization. All rows used the frozen `t0`–`t8` suite.

### 12.1 Scores

| Run | Model | Context | Automated | Adjudicated |
| --- | ----- | ------- | --------- | ----------- |
| 64K OpenCode (prior, port 8081) | GSQ-RCO IQ3_S | 65,536 | 6/3 — fail `t2,t4,t5` | 7/2 — fail `t2,t5` |
| 8087 OpenCode (prior, port 8087) | GSQ-RCO IQ3_S | 80,896 | 6/3 — fail `t4,t5,t7` | 7/2 — fail `t5,t7` |
| 8087 DSH (prior, secondary) | GSQ-RCO IQ3_S | 80,896 | 4/5 — fail `t2,t4,t5,t7,t8` | 5/4 — fail `t4,t5,t7,t8` |
| 8087 DSH parity (prior, secondary) | GSQ-RCO IQ3_S | 80,896 | 6/3 — fail `t4,t7,t8` | 8/1 — fail `t7` |
| 8087 OpenCode Unsloth (prior) | Unsloth UD IQ3_XXS | 80,896 | 6/3 — fail `t4,t5,t7` | 7/2 — fail `t5,t7` |
| **96K OpenCode (this run)** | **GSQ-RCO IQ3_S** | **97,280** | **5/4 — fail `t4,t5,t7,t8`** | **6/3 — fail `t5,t7,t8`** |

Per-test movement vs the prior 8087 OpenCode GSQ-RCO run:

- **t8: Pass → Fail.** At 8087 the model recovered with `npm run check` (which transitively includes
  `format:check`), earning `t8.recovery_validation`. Here it recovered with `npm run lint` only, which
  does not include the Markdown/format validator. Genuine, and the *same* mode previously adjudicated
  Fail in the 8087 DSH run.
- **t4: Fail in both** — adjudicated Pass in both (scorer phrasing false negative, different wording).
- **t5: Fail in both** (committed a Prettier reformat in a strict no-op workflow).
- **t7: Fail in both** — at 8087 the model ran a cached external `markdownlint-cli` twice; here it ran
  no validator at all. Same frozen requirement unmet, slightly different route.
- t0–t3, t6 unchanged (Pass).

**Aggregate moves 7/9 → 6/9 adjudicated**, driven entirely by the t8 recovery-command choice on a single
run — not established as statistically significant.

### 12.2 Performance (measured / derived)

| Metric | 8087 OpenCode GSQ-RCO | **This run (96K GSQ-RCO)** | 8087 DSH parity GSQ-RCO |
| ------ | --------------------: | -------------------------: | ----------------------: |
| Prompt tok/s (derived) | 439.4 | **580.8** | 520.25 |
| Generation tok/s (derived) | 44.33 | **49.02** | 47.39 |
| `n_decode_total` | 12,620 | **11,286** | 14,022 |
| `n_tokens_max` | 53,635 | **33,166** | 53,635 |
| Prompt tokens (non-cached) | 174,461 | **126,644** | 151,406 |
| Generated tokens | 35,204 | **30,142** | 38,291 |
| Sum of test durations | 1,280.1 s | **904.6 s** | 1,173.5 s |
| MTP acceptance rate | 63.92% | **59.21%** | 61.14% |
| Mean accepted/step | 1.92 | **1.776** | 1.833 |

### 12.3 Interpretation of the comparison

- **Same model, same build, larger window, same file.** Unlike the Unsloth run, this is a like-for-like
  GSQ-RCO comparison; the only configuration change is `n_ctx` 80,896 → 97,280.
- **Throughput did not degrade with the larger window.** Aggregate prompt throughput was *higher*
  (580.8 vs 439.4 tok/s) and generation throughput somewhat higher (49.02 vs 44.33 tok/s). This is a
  suite-aggregate observation, not a controlled per-length measurement; the mix of prompt lengths and
  the MTP acceptance both differ, so the increase is not attributable to the context change alone.
- **MTP acceptance was the lowest recorded** for this model family (59.21% vs 63.92% / 61.14%),
  producing fewer extra tokens per step (1.776 vs ~1.83–1.92). Single-run observation.
- **Lower maximum occupancy than the prior 8087 run** (33,166 vs 53,635): the model produced shorter
  combined sequences this run (notably t7, which ran no validator and emitted far less output). Both
  remain far below `n_ctx`, so neither run stresses the window.
- **Reliability held within single-run noise** with one genuine regression (t8) and an unchanged set of
  genuine failures (t5, t7). The larger context therefore **preserves the model's task reliability** on
  this suite at low occupancy, at **no observed performance penalty** — but it also provides **no
  evidence** of behaviour at the ~96K occupancy point.

**Primary question restated:** *Does the validated ~96K configuration preserve the model's task
reliability while providing the larger context, and what performance/memory cost does that impose?*
On this single run, **yes within single-run noise** — 6/9 adjudicated vs 7/9 at 80,896, with the
difference being one genuine recovery-command failure, while throughput was equal or better and no
memory/OS pressure was observable. The larger **context window is available and configured**, but the
frozen suite never occupies it (34.1% peak), so no claim is made about reliability or throughput at
~96K occupancy.

## 13. Interpretation and limitations

1. **The suite does not exercise ~96K occupancy (dominant limitation).** Peak sequence was 33,166
   tokens (34.1% of 97,280). The run validates the server *configured* at ~96K, not the ~96K
   *operating point*. The operator's preflight (~96K occupancy, ~45 tok/s warm, ~1.12% CV, CLEAN) is a
   separate measurement and is not independently reproduced here.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite
   score. The t8 change is one run and must not be read as a reliable regression.
3. **Suite-level metrics only.** Per-test throughput was not available (the direct OpenCode runner
   snapshots `/metrics` around the whole suite), so throughput as a function of sequence length could
   not be measured; only the aggregate and the short-context smoke are reported.
4. **Memory/paging not observable.** Working-set trimming, sustained paging, and system commit are
   server-side OS facts not exposed by llama.cpp `/metrics`; only indirect stability evidence is
   reported (§10). "No paging/trimming occurred" means "not observed in any client-observable signal",
   not "measured absent".
5. **Scorer false negative on t4.** The frozen `t4.no_change_warranted` regex misses
   `warranted?** No.` because the emphasis stripper leaves the `**` after `?`. Adjudicated Pass on the
   actual delivered text and repository state; the scorer was not modified.
6. **t7/t8 are genuine frozen-requirement failures**, not scorer artifacts: t7 ran no validator; t8
   recovered with `npm run lint` instead of `format:check`. Both are model-behaviour outcomes.
7. **Raw permission log is process-global.** `permissions.json` raw-log slices include allow-events
   from the orchestrator's own OpenCode process (e.g. the polling commands); no `deny` events occurred
   in the run window, and there were **zero** permission rejections across all nine tests. No
   `robinhood` occurrence in any trace.
8. **Prompt tok/s is an aggregate gauge.** It is dominated by prompt-length mix and cache behaviour and
   is not a controlled benchmark.

## 14. Memory / server-integrity evidence (no restart)

| Counter (suite delta, measured) | pre-smoke | before-suite | after-suite | monotonic |
| ------------------------------- | --------: | -----------: | ----------: | --------- |
| `prompt_tokens_total` | 0 | 9,205 | 135,849 | ✔ |
| `prompt_tokens_cached_total` | 0 | 64 | 1,038,010 | ✔ |
| `prompt_seconds_total` | 0 | 13.372 | 231.417 | ✔ |
| `tokens_predicted_total` | 0 | 356 | 30,498 | ✔ |
| `tokens_predicted_seconds_total` | 0 | 6.777 | 621.674 | ✔ |
| `n_decode_total` | 0 | 162 | 11,448 | ✔ |
| `n_tokens_max` (max, absolute) | 0 | 8,586 | 33,166 | ✔ |
| `spec_decode_num_drafts_total` | 0 | 133 | 10,995 | ✔ |
| `spec_decode_num_draft_tokens_total` | 0 | 395 | 32,981 | ✔ |
| `spec_decode_num_accepted_tokens_total` | 0 | 223 | 19,518 | ✔ |

Server identity was identical before and after: build `b1-60081bb`, model path unchanged,
`n_ctx=97280` (both `/props` and `/v1/models` meta), model id `qwen3.8-27b-gsq-rco`, `endpoint_metrics:true`,
`total_slots=1`, slot `id=0`, `speculative:true`, `requests_processing=0`/`requests_deferred=0` at rest.
Monotone counters with no reset demonstrate the server was **not restarted during the suite**.

## 15. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`,
  `config.verification.json`, `baseline.meta.json`, `baseline.validation.json`, `clones.validation.json`,
  `server.health.json`, `server.props.json`, `server.models.json`, `server.slots.json`,
  `server.health.after_suite.json`, `server.props.after_suite.json`, `server.models.after_suite.json`,
  `server.slots.after_suite.json`, `metrics.pre_smoke.prom`, `metrics.before_suite.prom`,
  `metrics.after_suite.prom`, `direct_smoke.cold.json`, `direct_smoke.json`, `client_smoke.out`,
  `runner.log`, `runner.pid`, `status.json`).
- **Results:** `…/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280/` (`results.jsonl`,
  `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`,
  `tN.out/err/log`, `permissions/tN.permission.log`, `permissions/tN.permission.json`).
- **Evaluation config (new, retained):** `~/.config/opencode/opencode.qwen-local-eval-96k.jsonc`
  (sha256 `c5204970…`, 710 bytes). The prior `opencode.qwen-local-eval-8087.jsonc` (sha256
  `5aaa4bce…`) and `opencode.qwen-local-eval-unsloth-8087.jsonc` (sha256 `115f86b1…`) were **not**
  modified.
- **Prior artifacts untouched:** the 64K, 8087 OpenCode, 8087 DSH, 8087 DSH parity, and Unsloth
  workspaces retain their original mtimes (e.g. 8087 OpenCode `manifest.json` 2026-09-19 21:44; DSH
  2026-09-19 23:34; parity 2026-09-19 23:43; Unsloth `manifest.json` 2026-09-20 21:19) — none were
  written during this run.
- **Frozen harness/scorer:** HEAD remains `48d9b54f249cd461f5456202f225bbddd156fdf9`; tracked harness
  files show no diff; prompts/scorer/baseline were used verbatim; the baseline rebuilt deterministically
  at `ef91057c…`.
- **Repository integrity:** no staging, commit, push, reset, or other Git state change; main repository
  HEAD remains `48d9b54f…`. Pre-existing uncommitted application-source changes (tracked
  `ARCHITECTURE.md`, `README.md`, `convex/http.ts`, `worker/README.md`, `worker/src/index.js`; untracked
  `convex/health.ts`, `convex/lib/health.ts`, `worker/src/health.js`, `tests/health/`) were present
  before the run and were **not** touched — their SHA-256 hashes are identical before and after. They are
  outside the evaluated baseline, which is exported from `a07d38e` via `git archive`. The only new
  repository artifact is this report.

**Nothing was committed. The second Unsloth evaluation was not started.**

---

### Required summary

- **Automated score:** **5 Pass / 4 Fail** (Fail `t4,t5,t7,t8`).
- **Adjudicated score:** **6 Pass / 3 Fail** (Fail `t5,t7,t8`).
- **Per-test result table:** §5.
- **Total runtime:** **929 s (15.5 min)** continuous suite wall-clock; sum of test durations **904.6 s**.
- **Prompt tok/s:** **580.82** (non-cached, derived; server gauge 580.817).
- **Generation tok/s:** **49.02** (derived; server gauge 48.893).
- **MTP acceptance:** **59.21%** (mean **1.776** accepted tokens/verification step; positions 0/1/2 =
  76.4% / 57.6% / 43.6%).
- **Maximum actual token occupancy:** **33,166** tokens (`n_tokens_max`; **34.1%** of the 97,280
  window). No test approached or exceeded the validated ~96K occupancy.
- **Paging/trimming:** **not observed** in any client-observable signal (no timeouts, stable throughput,
  monotone counters, no restart); server-side OS paging/working-set trimming is **not independently
  measurable** from this client and is not claimed.
- **Comparison to 8087 (GSQ-RCO OpenCode):** adjudicated **6/9 vs 7/9** (one genuine regression, t8
  recovery command); throughput equal or better (prompt 580.8 vs 439.4, generation 49.02 vs 44.33
  tok/s); MTP acceptance slightly lower (59.21% vs 63.92%); maximum occupancy lower (33,166 vs 53,635).
  Within single-run noise; not statistically significant.
- **Report path:**
  `docs/development/model-reliability/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-frozen-harness-evaluation.md`.
