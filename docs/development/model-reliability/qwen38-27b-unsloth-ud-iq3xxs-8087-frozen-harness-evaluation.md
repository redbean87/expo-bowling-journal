# Qwen3.8-27B-Unsloth-UD-IQ3_XXS (8087 / 80.9K + MTP) — OpenCode Frozen-Harness Reliability Evaluation

**Date:** 2026-09-21
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the server probes, the frozen
suite run, trace extraction, scoring, adjudication, and this report.
**Model under test (downstream):** `qwen3.8-27b-unsloth-ud-iq3xxs`
**Model file:** `E:\LocalAI\Qwen3.8-27B-Unsloth\Qwen3.8-27B-UD-IQ3_XXS.gguf` (Unsloth Dynamic, `IQ3_XXS - 3.0625 bpw`)
**Provider / endpoint:** provider `qwen-local` (`@ai-sdk/openai-compatible`), llama.cpp LAN endpoint
`http://192.168.68.52:8087/v1` (OpenAI-compatible; build `b1-60081bb`).
**Exact OpenCode model ID passed to the harness:** `qwen-local/qwen3.8-27b-unsloth-ud-iq3xxs`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`, all hashes verified)
**Evaluation config:** `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval-unsloth-8087.jsonc`
(sha256 `115f86b111fb4b03b7e1deb97373c699cff6f21afc03d38e0b7a23a4cb2cc53f`, 716 bytes, new file)
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-27b-unsloth-ud-iq3xxs-8087-80896`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-unsloth-ud-iq3xxs-8087-80896`
(one fresh workspace + isolated clone + session per test)

> **Scope deviation from the original request (must be read first).** The task specified a newly
> configured **`Qwen3.8-27B-GSQ-RCO-IQ3_XXS-MTP` server at ~96K context**. That server was **not
> running**. A full 1–65535 port sweep of `192.168.68.52` and of every live LAN host found exactly one
> llama.cpp instance: port **8087**, serving **`qwen3.8-27b-unsloth-ud-iq3xxs`** (Unsloth UD-IQ3_XXS,
> `IQ3_XXS - 3.0625 bpw`, `n_ctx=80896`). The expected GSQ-RCO GGUF (`IQ3_S - 3.4375 bpw`) and any ~96K
> `n_ctx` were absent. Per the task's stop condition, the run was halted and reported before proceeding;
> the operator then explicitly authorized **running the frozen suite against the running Unsloth server
> instead**. This report therefore documents an **Unsloth UD-IQ3_XXS @ 80,896** evaluation, not the
> requested GSQ-RCO @ ~96K evaluation. No ~96K context was exercised (see §9). The second Unsloth
> evaluation was explicitly authorized by that answer.
>
> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced.
>
> **Measured vs. derived.** *Measured* values are read directly from llama.cpp `/metrics` counter
> deltas (suite interval) or from harness/session records. *Derived* values are arithmetic over
> measured values (tok/s, percentages). Each is labelled below.

---

## 1. Provenance

| Item | Value |
| ---- | ----- |
| Suite | `opencode-t0-t8` (frozen `ground_truth.json`) |
| Harness commit (used) | `48d9b54f249cd461f5456202f225bbddd156fdf9` |
| Harness working tree | clean (only the two pre-existing *untracked* DSH adapters under `harness/`) |
| Baseline HEAD | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` |
| Baseline source ref | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03` |
| Tracked files in baseline | 338 |
| Prompt verification | all `t0`–`t8` SHA-256/byte length match (`ok: true`) |
| Config verification | `ok: true` (canonical permission block; `robinhood-trading.enabled=false`) |
| Engine | direct OpenCode (`runner.py` → `extract_traces.py` → `score.py`), the same procedure as the prior 8087 OpenCode evaluation |
| Timeout | 2400 s/test (runner default; recorded in `manifest.json` and every `results.jsonl` record) |

The run sequence was: read-only server probes → direct warm-up/characterization smoke → provision the
sanitized baseline + 9 clones → capture `metrics.before_suite.prom` → run `t0`–`t8` serially → capture
`metrics.after_suite.prom` and post-suite `/props`/`/slots`/`/health` → `extract_traces.py` →
`score.py` → manual adjudication against `ground_truth.json`.

## 2. Exact model / server configuration

Read-only probes of `http://192.168.68.52:8087` (server **not** restarted or modified):

| Item | Value | Source |
| ---- | ----- | ------ |
| Health | `{"status":"ok"}` (HTTP 200) | `GET /health` |
| Build | `b1-60081bb` | `GET /props` |
| Model alias | `qwen3.8-27b-unsloth-ud-iq3xxs` | `GET /v1/models`, `/props` |
| Model path | `E:\LocalAI\Qwen3.8-27B-Unsloth\Qwen3.8-27B-UD-IQ3_XXS.gguf` | `/v1/models`, `/props` |
| Quantization | `IQ3_XXS - 3.0625 bpw` | `/v1/models` |
| Context (`n_ctx`) | `80896` | `/props`, `/v1/models` |
| Trained context | `262144` | `/v1/models` (meta) |
| Parameters / size | `27,320,697,856` / `10,923,864,064` bytes | `/v1/models` (meta) |
| Vocab / embedding | `n_vocab=248320` / `n_embd=5120` | `/v1/models` (meta) |
| Slots | `total_slots=1` | `/props`, `/slots` |
| Speculative decoding | `speculative: true`; per-request `speculative.types = "none,draft-mtp"` | `/slots` |
| Chat / reasoning (request) | `chat_format=peg-native`, `reasoning_format=deepseek` | `/slots` |
| Metrics endpoint | `endpoint_metrics: true` | `/props` |

Operator-supplied server configuration (not independently exposed by `/props`) is not restated here
because the server was not the one the task described; only independently observable facts are
asserted. **Observable confirmation of MTP:** `/slots` reports `speculative:true`, the per-request
params show `draft-mtp`, and the `spec_decode_*` counters increment during the run (see §8).

> **Server identity note.** This is the **Unsloth** UD-IQ3_XXS model, a *different GGUF* (and different
> quantization, `IQ3_XXS` vs the prior runs' `IQ3_S`) from the GSQ-RCO model used by the 64K/8087/DSH
> runs. Build `b1-60081bb` and the endpoint are unchanged. Comparisons in §12 are therefore
> **cross-model** at the same `n_ctx`, not a like-for-like model comparison.

## 3. Context validation

The requested "~96K actual context occupancy" configuration could not be validated because no server
at `n_ctx ≈ 96K` was reachable. What was validated on the running Unsloth server:

| Item | Value |
| ---- | ----- |
| Configured context (`n_ctx`) | **80,896** |
| Largest sequence actually observed (suite) | **42,976** prompt+generation tokens (`n_tokens_max`) |
| Occupancy as a fraction of `n_ctx` | **53.1%** |
| Largest prompt processed (slot `n_prompt_tokens` at suite end) | 10,396 |
| Tests approaching/exceeding 96K | **none** — no test reached even the 80,896 window |

**No test approached or exceeded the previously validated 96K occupancy, and the 80,896 window was
not approached either.** The 96K claim is therefore neither confirmed nor refuted for the Unsloth
model: it was simply not exercised.

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; `prepare_baseline.py` asserts this and it
  was confirmed at provisioning: `baseline HEAD: ef91057c…`, `excluded path absent: True`, all 9 clones
  `ok / clean=True` before the run.
- Prompt manifest: all nine prompts matched SHA-256 and byte length (`ok: true`); hashes recorded in
  `manifest.json` and every `results.jsonl` record.
- Case (`config.verification.json`): `ok: true`; canonical permission block
  (`external_directory/webfetch/websearch = deny`) and `robinhood-trading.enabled = false` verified
  before any model call.
- The application source was not modified by this run; the frozen prompts, `ground_truth.json`,
  `prompt_manifest.json`, `runner.py`, `extract_traces.py`, and `score.py` were used verbatim.

## 5. Per-test results (t0–t8)

Token columns are sums of per-step session values from `step-finish` records (measured). Runtime is the
runner wall-clock per test. All sessions matched their clone directory exactly (`match=exact`), and all
clones started clean at baseline HEAD and ended clean.

| # | Automated | Adjudicated | Runtime (s) | Input tok | Output tok | Timeout | Commits | Notes |
| - | --------- | ----------- | ----------: | --------: | ---------: | ------- | ------: | ----- |
| t0 | Pass | Pass | 24.1 | 8,655 | 137 | No | 0 | Exact model id + cwd, no tools |
| t1 | Pass | Pass | 44.4 | 9,183 | 588 | No | 0 | Correct path + 205 lines; no Git/modification |
| t2 | Pass | Pass | 197.7 | 24,743 | 6,598 | No | 1 (`c327f4a4`) | One scoped docs edit + validator + diff review + one commit |
| t3 | Pass | Pass | 56.4 | 10,527 | 1,479 | No | 0 | Correct 11 PinPal paths |
| t4 | Fail | **Pass** | 200.2 | 16,088 | 7,051 | No | 0 | Verdict delivered; scorer phrasing miss on `no_change_warranted` |
| t5 | Fail | Fail | 172.0 | 13,400 | 5,182 | No | 1 (`6cefe6ca`) | Committed a Prettier reformat in a strict no-op workflow |
| t6 | Pass | Pass | 58.6 | 10,598 | 821 | No | 0 | Validator (`npm run format:check`) identified/run/reported |
| t7 | Fail | Fail | 428.9 | 29,343 | 13,631 | No | 0 | Ran cached `markdownlint-cli`, not the repo validator; no modification |
| t8 | Pass | Pass | 84.1 | 9,413 | 981 | No | 0 | Both invalid commands reported; correct recovery |

Totals: 9 tests; session input **131,950** tok, output **36,468** tok; sum of runtimes **1,266.4 s**.
Zero timeouts. Commit `c327f4a4` (t2) is the expected single scoped commit; `6cefe6ca` (t5) is the
over-reach that fails the no-op requirement.

## 6. Adjudication

- **Automated:** 6 Pass / 3 Fail — Pass `t0,t1,t2,t3,t6,t8`; Fail `t4,t5,t7`.
- **Adjudicated:** **7 Pass / 2 Fail** — Pass `t0,t1,t2,t3,t4,t6,t8`; Fail `t5,t7`.

| # | Auto | Adj | Exact reason |
| - | ---- | --- | ------------ |
| t4 | Fail | **Pass** | Only `t4.no_change_warranted` unmet. The model delivered both the correct verdict and an explicit no-change determination — *"## Verdict: the claim is **false** in this repository"* and *"**Documentation change warranted: no.**"* The frozen detector for `no_change_warranted` matches other phrasings but not "Documentation change warranted: no." (noun-first + terminal colon). All other t4 requirements passed: the repository validator (`npm run format:check` / prettier 3.8.1) ran, `git diff --check` and `git diff --staged` ran, `no_change`/clean tree passed, and **no file was modified**. Scorer false negative. |
| t5 | Fail | Fail | Genuine. The model ran `npm run format:check`, correctly classified the `docs/domain-model.md` failure as pre-existing, then reformatted the file (`prettier --write`, 99/99 lines) and committed `6cefe6c`. The task is a strict no-op workflow ("commit only if a justified change exists"); the ground truth requires no commit. Same over-reach as the prior 64K, 8087 OpenCode, and DSH runs. |
| t7 | Fail | Fail | Genuine (same failure mode as the prior 8087 runs). After an exhaustive and correct search concluding the repository has no dedicated Markdown validator, the model used a **cached external `npx markdownlint-cli`** (resolved from `~/.npm/_npx/10f54a…`, no network) as "the validator", ran it twice, reported each execution separately, and ran `git status`. It never ran the repository's prescribed validator (`npm run format:check` / prettier), so `t7.validator_twice` and `t7.separate_outputs` are unmet. No file was modified. A strict alternative reading (the repo has no markdown-specific validator, so the model's thorough search is defensible) does not change the frozen requirement; recorded as Fail. |

All 27 common requirements (`prompt_verified`, `baseline_head`, `clean_before`) passed for every test.

## 7. Prompt / generation throughput

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Quantity | Value |
| -------- | ----- |
| Prompt tokens processed (non-cached) | **133,770** |
| Prompt tokens served from cache | **1,438,708** |
| Prompt processing time | **238.52 s** |
| **Prompt tok/s (derived = 133,770 / 238.52)** | **560.82** |
| llama.cpp gauge `prompt_tokens_seconds` (measured, suite end) | **560.82** |
| Generated tokens | **39,990** |
| Generation time | **805.25 s** |
| **Generation tok/s (derived = 39,990 / 805.25)** | **49.66** |
| llama.cpp gauge `predicted_tokens_seconds` (measured, suite end) | **49.54** |
| `n_decode_total` (excluding speculative) | **14,648** |

The gauge and derived values agree to within rounding; the gauges are the server's own measurements.
Direct warm-up characterization (separate smoke, not part of the suite): warm decode **49.1 tok/s**,
warm prompt **150.4 tok/s** — consistent with the suite aggregate.

## 8. MTP / speculative-decoding metrics

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Metric | Value |
| ------ | ----- |
| Verification steps (`spec_decode_num_drafts_total`) | **14,168** |
| Draft tokens generated (`spec_decode_num_draft_tokens_total`) | **42,503** (= 3.00 per step; draft max 3) |
| Draft tokens accepted (`spec_decode_num_accepted_tokens_total`) | **25,831** |
| **Draft acceptance rate (derived)** | **60.77%** |
| **Mean accepted tokens per verification step (derived)** | **1.823** (≈ 0.82 extra tokens/step from MTP) |
| Accepted at draft position 0 | 10,838 (76.5% of steps) |
| Accepted at draft position 1 | 8,373 (59.1% of steps) |
| Accepted at draft position 2 | 6,620 (46.7% of steps) |

MTP is active and materially productive: each decode step yields ~1.82 accepted tokens instead of 1.

## 9. Maximum context occupancy

| Quantity | Value |
| -------- | ----- |
| `n_tokens_max` (largest prompt+generation sequence observed, suite) | **42,976** |
| `n_tokens_max` absolute at suite end | 42,976 |
| Pre-suite `n_tokens_max` (smoke) | 483 |
| `n_ctx` | 80,896 |
| Occupancy | **53.1% of the window** |
| Tests approaching/exceeding 96K | **none** |
| Tests approaching the 80,896 window | **none** (largest test input 29,343; largest sequence 42,976) |

The suite never came near the configured window, so it provides **no evidence** about the requested
~96K operating point. This is expected for this 9-task suite, whose workloads are bounded well below
the window.

## 10. Memory / working-set observations

llama.cpp `/metrics` does not expose OS working-set, paging, or trim events, and the server is a
remote Windows host. The following are therefore **observable proxies**, not direct memory
measurements; the task's preflight claims (no trimming, no sustained paging, ~75% commit) are **not
independently verifiable from this client** and are reported as unconfirmed for the Unsloth server:

- **No throughput collapse:** aggregate generation 49.66 tok/s and prompt 560.82 tok/s; no long stall
  (max single test 428.9 s, driven by output volume, not decode rate).
- **No timeouts:** all 9 tests `timed_out=false`; `rc=0` throughout.
- **No counter resets / no restart:** all `/metrics` counters increased monotonically across the suite
  (`prompt_tokens_total` 105→133,875; `tokens_predicted_total` 464→40,454; `n_decode_total`
  189→14,837); a restart would have reset these to zero.
- **No context-shift/trim signal in the response layer:** outputs did not show truncation of the
  *prompt*; the only truncation observed was t7's final *answer* being clipped by the configured
  `output=4096` per-step limit, not by context pressure.

## 11. Timeout / runtime behavior

| Quantity | Value |
| -------- | ----- |
| Per-test timeout | 2400 s |
| Tests timed out | 0 / 9 |
| Sum of per-test durations | 1,266.4 s |
| Continuous suite wall-clock (t0 start → t8 end) | **1,302.0 s = 21.7 min** |
| Manifest start → t8 end | 1,304.0 s |
| Provisioning (baseline + 9 clones) | separate step, completed before the suite |

## 12. Comparison against prior 64K and 8087 results

All prior rows below are the **GSQ-RCO** model; the new row is the **Unsloth UD-IQ3_XXS** model. The
comparison is therefore cross-model (same endpoint/build, same `n_ctx`). DSH rows are secondary context.

### 12.1 Scores

| Run | Model | Context | Automated | Adjudicated |
| --- | ----- | ------- | --------- | ----------- |
| 64K OpenCode (prior, port 8081) | GSQ-RCO IQ3_S | 65,536 | 6/3 — fail `t2,t4,t5` | 7/2 — fail `t2,t5` |
| 8087 OpenCode (prior, port 8087) | GSQ-RCO IQ3_S | 80,896 | 6/3 — fail `t4,t5,t7` | 7/2 — fail `t5,t7` |
| **8087 OpenCode (this run)** | **Unsloth UD IQ3_XXS** | **80,896** | **6/3 — fail `t4,t5,t7`** | **7/2 — fail `t5,t7`** |
| 8087 DSH (prior) | GSQ-RCO IQ3_S | 80,896 | 4/5 | 5/4 |
| 8087 DSH parity (prior) | GSQ-RCO IQ3_S | 80,896 | 6/3 — fail `t4,t7,t8` | 8/1 — fail `t7` |

### 12.2 Performance

| Metric | 8087 OpenCode GSQ-RCO | **This run (Unsloth)** | DSH parity GSQ-RCO |
| ------ | --------------------: | ---------------------: | -----------------: |
| Prompt tok/s (derived) | 439.4 | **560.8** | 520.25 |
| Generation tok/s (derived) | 44.33 | **49.66** | 47.39 |
| `n_decode_total` | 12,620 | **14,648** | 14,022 |
| `n_tokens_max` | 53,635 | **42,976** | 53,635 |
| Prompt tokens (non-cached) | 174,461 | **133,770** | 151,406 |
| Generated tokens | 35,204 | **39,990** | 38,291 |
| Sum of test durations | 1,280.1 s | **1,266.4 s** | 1,173.5 s |
| MTP acceptance rate | 63.92% | **60.77%** | 61.14% |
| Mean accepted/step | 1.92 | **1.823** | 1.833 |

### 12.3 Interpretation of the comparison

- **Same outcome profile as the 8087 OpenCode GSQ-RCO run:** automated 6/3, adjudicated 7/2, failing
  exactly `t5` (no-op over-reach) and `t7` (non-repository validator). t4 is an adjudicated Pass in both
  (scorer phrasing false negative, different phrasing). No statistically meaningful difference is
  claimed from single runs.
- **Slightly faster on this run:** +27.6% prompt tok/s and +12.0% generation tok/s versus the 8087
  GSQ-RCO run. Because the model, quantization, and prompt mix differ, and the suite is small, this is
  reported as an observation, not a controlled speed comparison.
- **Lower maximum occupancy:** `n_tokens_max` 42,976 vs 53,635 (the GSQ-RCO run's t7 produced a longer
  combined sequence). Both are far below `n_ctx`.
- **MTP acceptance slightly lower:** 60.77% vs 63.92% (GSQ-RCO/OpenCode) and 61.14% (DSH parity) —
  a mild reduction, consistent with the different draft model head in the Unsloth GGUF.

**Primary question restated for the actual artifact:** *Does the running 80.9K Unsloth configuration
preserve the model's task reliability, and what does it cost?* On this single run it reproduces the
prior GSQ-RCO 8087 reliability profile exactly (7/9 adjudicated, same two failure modes) while decoding
somewhat faster and at similar MTP acceptance. It does **not** answer the requested question about a
~96K GSQ-RCO configuration, because that configuration was never available to test.

## 13. Interpretation and limitations

1. **Scope deviation (dominant limitation).** The requested GSQ-RCO @ ~96K server was absent; this is
   an Unsloth UD-IQ3_XXS @ 80,896 run authorized as a substitute. No conclusion about the ~96K
   configuration, the GSQ-RCO model, or 96K context occupancy can be drawn here.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite
   score.
3. **Cross-model comparison.** Prior 64K/8087/DSH numbers are GSQ-RCO `IQ3_S`; this run is Unsloth
   `IQ3_XXS`. Throughput and MTP differences may reflect model/quant, not context or server change.
4. **Suite-level metrics only.** The direct OpenCode runner snapshots `/metrics` around the whole suite
   (as in the prior 8087 OpenCode run); per-test throughput was not available, so context-dependent
   throughput degradation as a function of sequence length could not be measured directly. The suite
   aggregate was stable and no test timed out.
5. **Memory/paging not observable.** Working-set trimming, sustained paging, and system commit are
   server-side OS facts not exposed by llama.cpp `/metrics`; only indirect stability evidence is
   reported (§10).
6. **Scorer false negative on t4.** The frozen scorer's `no_change_warranted` detector misses the
   phrasing used; adjudicated Pass on the actual repository state and delivered verdict. The scorer was
   not modified.
7. **t4 permission interaction.** t4's first `rm` of a `.eval-tmp` path was denied by the
   `external_directory` policy; the model recovered with a relative-path `rm`, made no repository
   change, and completed correctly. Observable policy behavior, not an infrastructure failure.
8. **t7 output clipping.** t7's final answer was clipped at the configured 4096-token output limit
   (it reproduced ~107 lines of lint output twice). This is an output-budget artifact, not a context or
   timeout failure.

## 14. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-unsloth-ud-iq3xxs-8087-80896/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`,
  `config.verification.json`, `baseline.meta.json`, `server.props.json`,
  `server.props.before_suite.json`, `server.props.after_suite.json`, `server.slots*.json`,
  `server.health*.json`, `metrics.preflight.prom`, `metrics.before_suite.prom`,
  `metrics.after_suite.prom`, `direct_smoke.json`, `runner.log`, `status.json`).
- **Results:** `…/results/qwen38-27b-unsloth-ud-iq3xxs-8087-80896/` (`results.jsonl`,
  `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`,
  `tN.out/err/log`, `permissions/tN.*`).
- **Evaluation config (new, retained):**
  `~/.config/opencode/opencode.qwen-local-eval-unsloth-8087.jsonc` (sha256 `115f86b1…`). The prior
  `opencode.qwen-local-eval-8087.jsonc` (sha256 `5aaa4bce…`) and all other eval configs were **not**
  modified.
- **Prior artifacts untouched:** the 64K, 8087 OpenCode, 8087 DSH, and 8087 DSH parity workspaces
  retain their original mtimes (e.g. 8087 OpenCode `manifest.json` 2026-09-19 21:44; DSH 2026-09-19
  23:34; parity `config.verification.json` 2026-09-19 23:42) — none were written during this run.
- **Frozen harness:** tracked harness/scorer files are unmodified (HEAD `48d9b54f`); only the two
  pre-existing untracked DSH adapters appear under `harness/`. Prompts/scorer/baseline were used
  verbatim; the baseline was rebuilt deterministically at `ef91057c…`.
- **Repository integrity:** no staging, commit, push, reset, or other Git state change was made; main
  repository HEAD remains `48d9b54f249cd461f5456202f225bbddd156fdf9`, and the only new repository
  artifact is this report. Pre-existing uncommitted application-source changes (tracked
  `ARCHITECTURE.md`, `README.md`, `convex/http.ts`, `worker/README.md`, `worker/src/index.js`; untracked
  `convex/health.ts`, `convex/lib/health.ts`, `worker/src/health.js`, `tests/health/`) were present
  before this run and were **not** touched. They are outside the evaluated baseline, which is exported
  from `a07d38e` via `git archive`.

**Nothing was committed.**

---

### Required summary

- **Automated score:** **6 Pass / 3 Fail** (Fail `t4,t5,t7`).
- **Adjudicated score:** **7 Pass / 2 Fail** (Fail `t5,t7`).
- **Per-test result table:** §5.
- **Total runtime:** **1,302.0 s (21.7 min)** wall-clock (sum of test durations 1,266.4 s).
- **Prompt tok/s:** **560.82** (non-cached; server gauge 560.82).
- **Generation tok/s:** **49.66** (server gauge 49.54).
- **MTP acceptance:** **60.77%** (mean 1.823 accepted tokens/verification step).
- **Maximum actual token occupancy:** **42,976** tokens (`n_tokens_max`; 53.1% of the 80,896 window).
- **Paging/trimming:** **not observed** in any client-observable signal (no timeouts, stable
  throughput, monotone counters, no restart); server-side OS paging/trim is **not independently
  measurable** from this client and was not claimed.
- **Comparison to 8087:** same adjudicated profile as the prior 8087 OpenCode GSQ-RCO run (7/2, failing
  `t5,t7`); this run is somewhat faster (prompt 560.8 vs 439.4 tok/s; generation 49.66 vs 44.33 tok/s)
  and reached a lower maximum occupancy (42,976 vs 53,635), on a **different model/quant**.
- **Report path:**
  `docs/development/model-reliability/qwen38-27b-unsloth-ud-iq3xxs-8087-frozen-harness-evaluation.md`.
