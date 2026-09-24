# Qwen3.8-27B-Unsloth-UD-IQ3_XXS (8087 / 80,896 ≈ 80K + MTP) — OpenCode Frozen-Harness Reliability Evaluation — **Matrix Run 3 of 6**

**Date:** 2026-09-23
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the read-only server probes, the
frozen suite run, trace extraction, scoring, adjudication, and this report.
**Matrix position:** **Run 3 of 6** — `Unsloth UD-IQ3_XXS 80K × OpenCode`
**Model under test (downstream):** `qwen3.8-27b-unsloth-ud-iq3xxs`
**Model file:** `E:\LocalAI\models\qwen3.8-27b\unsloth\production\Qwen3.8-27B-UD-IQ3_XXS.gguf`
(`IQ3_XXS - 3.0625 bpw`)
**Provider / endpoint:** provider `qwen-local` (`@ai-sdk/openai-compatible`), llama.cpp LAN endpoint
`http://192.168.68.52:8087/v1` (OpenAI-compatible; build `b1-60081bb`).
**Exact OpenCode model ID passed to the harness:** `qwen-local/qwen3.8-27b-unsloth-ud-iq3xxs`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`
(source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`, 338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen
`prompt_manifest.json`, all hashes/bytes verified)
**Evaluation config:** `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval-unsloth-8087.jsonc`
(sha256 `df49bf69057277abc3510680435673ea18d6718062dd4259f02894a36e6ba55c`, 771 bytes)
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r3-opencode`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-unsloth-ud-iq3xxs-80k-matrix-r3-opencode`
(one fresh workspace + isolated clone + session per test)

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced, and no single-run difference is treated as statistically significant.
>
> **Measured vs. derived.** *Measured* values are read directly from llama.cpp `/metrics` counter
> deltas (suite interval) or from harness/session records. *Derived* values are arithmetic over
> measured values (tok/s, percentages). Each is labelled below.
>
> **Scope note.** This run validates the **Qwen3.8-27B-Unsloth-UD-IQ3_XXS** server at its configured
> **`n_ctx = 80,896` (~80K)** window. The frozen suite did **not** drive the window far: the largest
> sequence observed was **40,061 tokens (49.52% of the window)**. The frozen prompts,
> `ground_truth.json`, `prompt_manifest.json`, scorer, and baseline were used verbatim.

---

## 1. Provenance

| Item | Value |
| ---- | ----- |
| Suite | `opencode-t0-t8` (frozen `ground_truth.json`) |
| Matrix position | **3 of 6** (`Unsloth UD-IQ3_XXS 80K × OpenCode`) |
| Harness commit (used) | `48d9b54f249cd461f5456202f225bbddd156fdf9` |
| Harness working tree | tracked harness/scorer/prompt files clean (no diff); only pre-existing *untracked* DSH adapters present |
| Baseline HEAD | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` |
| Baseline source ref | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03` |
| Baseline tree | `feca1f64fa1f9479f42b0745968ccf41f647d870` |
| Tracked files in baseline | 338 |
| Prompt verification | all `t0`–`t8` SHA-256 **and** byte length match (`ok: true`) |
| Config verification | `ok: true` (canonical permission block; `robinhood-trading.enabled=false`) |
| Run interval | `2026-09-23T20:17:21Z` → `2026-09-23T20:41:06Z` |
| Engine | direct OpenCode (`runner.py` → `extract_traces.py` → `score.py`), same procedure as matrix run 1 |
| Timeout | 2400 s/test (runner default; recorded in `manifest.json` and every `results.jsonl` record) |
| Application source | untouched by this run; pre-existing uncommitted changes present before and after, unchanged |

Run sequence: read-only server probes → direct client smoke (overlay routing check) → provision the
sanitized baseline + 9 clones → capture `metrics.before_suite.prom` → run `t0`–`t8` serially → capture
`metrics.after_suite.prom` and post-suite `/props`/`/models`/`/slots`/`/health` → `extract_traces.py` →
`score.py` → manual adjudication against `ground_truth.json`. The server was **not** restarted or
reconfigured at any point.

## 2. Exact model / server configuration

Read-only probes of `http://192.168.68.52:8087` (server **not** restarted or modified):

| Item | Before | After | Source |
| ---- | ------ | ----- | ------ |
| Health | `{"status":"ok"}` (HTTP 200) | `{"status":"ok"}` | `GET /health` |
| Build | `b1-60081bb` | `b1-60081bb` | `GET /props` |
| Model alias / id | `qwen3.8-27b-unsloth-ud-iq3xxs` | `qwen3.8-27b-unsloth-ud-iq3xxs` | `/props`, `/v1/models` |
| Model path | `E:\LocalAI\models\qwen3.8-27b\unsloth\production\Qwen3.8-27B-UD-IQ3_XXS.gguf` | same | `/props` |
| Quantization | `IQ3_XXS - 3.0625 bpw` | same | `/props`, `/v1/models` |
| Context (`n_ctx`) | **80,896** | **80,896** | `/props`, `/v1/models` |
| Trained context | `262,144` | `262,144` | `/v1/models` (meta) |
| Parameters / size | `27,320,697,856` / `10,923,864,064` bytes | same | `/v1/models` (meta) |
| Vocab / embedding | `n_vocab=248320` / `n_embd=5120` | same | `/v1/models` (meta) |
| Slots | `total_slots=1`, slot `id=0` | same | `/props`, `/slots` |
| Vision | `modalities.vision=false`; `capabilities=["completion"]` (text-only) | same | `/props`, `/v1/models` |
| Speculative decoding | slot `speculative:true`; per-request `speculative.types="none,draft-mtp"` | same | `/slots` (post-request) |
| Chat / reasoning (request) | `chat_format=peg-native`, `reasoning_format=deepseek`, `generation_prompt=<|im_start|>assistant\n<think>\n` | same | `/slots` |
| Max predict (request) | `n_predict=4096` | same | `/slots` |
| Metrics endpoint | `endpoint_metrics: true` | same | `/props` |

Operator-supplied server configuration (not independently exposed by `/props`): the established
llama.cpp flags as the GSQ launcher without mmproj (KV cache `q8_0`, flash attention, GPU layers `99`,
batch `512`, ubatch `128`, CPU threads `8`, MTP draft max `3`). **Observable confirmation of MTP:**
`/slots` reports `speculative:true`, post-request params carry `draft-mtp`, and the `spec_decode_*`
counters increment during the suite (§8). **Observable confirmation of the context:** `n_ctx=80896`
was reported before and after the suite and `/v1/models` meta agrees. **Text-only:** `/props` and
`/v1/models` both report no vision/multimodal capability, matching the production Unsloth profile
(no mmproj).

**Server was freshly (re)started before hand-off.** Every `/metrics` counter was **zero** at the first
pre-suite probe (`metrics.initial.prom`), and the only pre-suite traffic was this run's client smoke
(§3), confirming the operator had (re)started the server to apply the 80,896 configuration immediately
before hand-off. The suite did not restart it.

## 3. OpenCode configuration / invocation and overlay verification

| Item | Value |
| ---- | ----- |
| Harness binary | `/Users/cortezashley/.local/opencode-patched/bin/opencode` (`1.18.30`) |
| Config passed via `OPENCODE_CONFIG` | `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval-unsloth-8087.jsonc` (sha256 `df49bf69…`, 771 bytes) |
| Model passed via `-m` | `qwen-local/qwen3.8-27b-unsloth-ud-iq3xxs` |
| Provider baseURL (overlay) | `http://192.168.68.52:8087/v1` |
| Permission block | `external_directory/webfetch/websearch = deny` |
| MCP | `robinhood-trading.enabled = false` |
| Per-test wrapper | 2400 s `subprocess` timeout (recorded per record) |

**Overlay-vs-stale-global verification.** The base/global config
(`~/.config/opencode/opencode.jsonc`) still carries a **stale** `qwen-local` provider pointing at
`http://192.168.68.52:8081/v1` with a Windows-path model id
(`E:\LocalAI\Qwen3.8-27B-GSQ-RCO\…gguf`). Port **8081 is not listening** (probe returned no HTTP
response). The evaluation overlay defines `qwen-local` at **8087** with the Unsloth model id, and the
runner both sets `OPENCODE_CONFIG` to that overlay and forces the model with
`-m qwen-local/qwen3.8-27b-unsloth-ud-iq3xxs`. Three independent confirmations that the overlay — not
the stale global entry — was in effect:

1. A pre-suite **client smoke** (`opencode run` with the overlay and explicit model) returned
   `SMOKE_OK`; its banner read `build · qwen3.8-27b-unsloth-ud-iq3xxs`. Since 8081 is down, a
   successful completion proves routing to 8087.
2. **t0** self-identification reports `qwen3.8-27b-unsloth-ud-iq3xxs` (exact ID
   `qwen-local/qwen3.8-27b-unsloth-ud-iq3xxs`).
3. `config.verification.json` records the overlay's parsed canonical permission block and the
   `robinhood-trading` disablement before any model call.

The overlay file was **not modified** by this run (mtime `2026-09-23 07:05`, before the run). It is the
established matrix Unsloth configuration; the sha256/byte length are recorded above. (The prior
Sep-21 Unsloth report recorded an earlier revision, `115f86b1…`, 716 bytes; that file was superseded
by the current established matrix form, which is what this run used verbatim.)

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; provisioned deterministically via
  `git archive` of `a07d38e` with the eval directory excluded (`excluded_present_in_ref: false`), 338
  tracked files, tree `feca1f64…`; all 9 clones validated `ok / clean=True` at baseline HEAD before the run.
- Prompt manifest: all nine prompts matched SHA-256 **and** byte length (`ok: true`); hashes recorded in
  `manifest.json`, `prompt.verification.json`, and every `results.jsonl` record.
- Config verification: `ok: true`; canonical permission block
  (`external_directory/webfetch/websearch = deny`) and `robinhood-trading.enabled = false` verified
  before any model call.
- The application source, prompts, `ground_truth.json`, `prompt_manifest.json`, `runner.py`,
  `extract_traces.py`, and `score.py` were used verbatim and not modified. `runner_dsh.py` and
  `extract_traces_dsh.py` are pre-existing untracked DSH adapters and were not used or changed.

## 5. Per-test results (t0–t8)

Token columns are sums of per-step session values from `step-finish` records (measured). Runtime is the
runner wall-clock per test. Every session matched its clone directory exactly (`match=exact`); every
clone started clean at baseline HEAD and ended clean. `rc=0` throughout. **Zero timeouts.**

| # | Automated | Adjudicated | Runtime (s) | Input tok | Output tok | Timeout | Commits | Tools | Validator invoked | Notes |
| - | --------- | ----------- | ----------: | --------: | ---------: | ------- | ------: | ----: | ----------------- | ----- |
| t0 | Pass | Pass | 23.1 | 8,651 | 227 | No | 0 | 0 | none | Exact model id + cwd, no tools |
| t1 | Pass | Pass | 47.5 | 9,046 | 932 | No | 0 | 4 | none | Correct path `docs/domain-model.md` + 205 lines; no Git/modification |
| t2 | Pass | Pass | 480.0 | 25,493 | 14,561 | No | 1 (`c45f274`) | 30 | `npx prettier` / `format:check` | One scoped docs edit + validator + diff review + one commit |
| t3 | Pass | Pass | 46.9 | 10,422 | 884 | No | 0 | 3 | none | Correct 11 PinPal paths |
| t4 | **Fail** | **Fail** | 228.4 | 18,157 | 6,723 | No | 0 | 12 | `npm run format:check` | Output budget exhausted mid-analysis; **no verdict delivered**, `git diff --check`/`--staged` not run; nothing modified |
| t5 | **Fail** | **Fail** | 248.2 | 15,604 | 8,058 | No | **1 (`7dfc4e3`)** | 14 | `npm run format:check` | Strict ordered no-op: validator run, pre-existing classified, tree/diff reviewed — but **committed** the Prettier reformat (`t5.no_commit` unmet) |
| t6 | Pass | Pass | 61.4 | 11,962 | 718 | No | 0 | 5 | `npm run format:check` | Validator identified/run/reported |
| t7 | Pass | Pass | 182.7 | 21,520 | 4,144 | No | 0 | 22 | `npx prettier --check` (×2) | Repo Prettier run twice, each execution reported separately; `git status` run; no modification |
| t8 | Pass | Pass | 82.7 | 10,657 | 1,031 | No | 0 | 5 | `npm run check` (includes `format:check`) | Bogus commands reported accurately; recovered with the umbrella check + `git status` |

Totals: 9 tests; session input **131,512** tok, output **37,278** tok; sum of runtimes **1,400.9 s**.
Zero timeouts. `c45f274` (t2) is the expected single scoped commit
(`docs/domain-model.md | 10 +++++-----`); `7dfc4e3` (t5) is the over-reach that fails the no-op requirement.

## 6. Adjudication

- **Automated (frozen scorer): 7 Pass / 2 Fail** — Pass `t0,t1,t2,t3,t6,t7,t8`; Fail `t4,t5`.
- **Adjudicated: 7 Pass / 2 Fail** — identical; no scorer false positives/negatives were found this run.

| # | Auto | Adj | Exact reason |
| - | ---- | --- | ------------ |
| t4 | Fail | **Fail** | Genuine. The model ran `npm run format:check` (Prettier), found `docs/domain-model.md` flagged, produced a `npx prettier … > /tmp/…; diff` comparison, and began analysing the diff — but its **final step exhausted the configured 4,096-token output budget mid-reasoning and the session ended without a final answer**. Consequently `t4.verdict_false` and `t4.no_change_warranted` have no delivered text, and the required `git diff --check` / `git diff --staged` reviews never ran (`t4.diff_check`, `t4.diff_staged` unmet). `t4.validator_run` and `t4.no_modification` passed (nothing was modified). This is **not** the prior runs' scorer-phrasing false negative; it is an incomplete-task failure driven by output-budget exhaustion. |
| t5 | Fail | **Fail** | Genuine relative to the frozen requirement. The task is a strict ordered no-op. The model **did** run `npm run format:check`, **did** classify the `docs/domain-model.md` failure as **pre-existing**, and **did** review the tree/diff with Git — but it then ran `npx --no-install prettier --write docs/domain-model.md` and **committed** (`7dfc4e3 docs: apply Prettier formatting to domain-model.md`). `t5.no_commit` (critical) is unmet; the tree is clean after the commit only because the change was committed. Same failure mode recorded in the prior 8087 Unsloth OpenCode run and the GSQ 64K/8087/96K runs. |
| t7 | Pass | Pass | Genuine this run. After an exhaustive, correct search concluding the repo has no dedicated `markdownlint`, the model selected the repository's own **Prettier** (`npx prettier --check docs/domain-model.md`, a local devDependency, check-only) as the Markdown validator, ran it **twice**, reported each execution separately with its output and exit code, and ran `git status`; nothing was modified. `t7.validator_twice` and `t7.separate_outputs` are satisfied. **Caveat:** the invocation was the scoped `npx prettier --check` rather than the literal `npm run format:check`; the frozen detector credited the repo validator, and the outcome is recorded as Pass. |
| t8 | Pass | Pass | Genuine this run. Both bogus commands were run and reported accurately (`npm run markdownlint` → `Missing script`; `git statuss` → `not a git command`), and the recovery used **`npm run check`**, whose nested chain includes `format:check` with corroborating captured output, plus the correct `git status`. `t8.recovery_validation` credited. **Caveat:** credit came via the umbrella `npm run check`, not the literal `npm run format:check`; same caveat recorded for DSH matrix run 2. |

All 27 common requirements (`common.prompt_verified`, `common.baseline_head`, `common.clean_before`,
i.e. 3 × 9) **passed** for every test.

## 7. Permission / tool surface and network

- **Permission denials:** **zero** across the suite. `permissions.json` records
  `permission_rejection_count: 0` and `raw_log_denial_count: 0` for every test; `tool_rejections: []`.
  Unlike matrix run 1 (one `external_directory` denial writing `/tmp/para.md`), no denial occurred:
  this run's `/tmp` redirections (t4 `npx prettier … > /tmp/domain-model.pretty.md`; t5
  `… > /tmp/domain-model.formatted.md`) were scanned as allowed command shapes and proceeded.
- **Tool surface:** only `bash`, `read`, `write`/`edit`, `grep`, `glob` were used. No `web_*` tool part
  appears in any trace; `webfetch`/`websearch` are denied by the verified overlay.
- **Network:** **zero** `curl`/`wget`/`pip`/`npx -y`/`npm install`. All validator invocations were
  local (`npm run …`, `npx --no-install`, `npx prettier` from the copied `node_modules`);
  `npm_config_offline=true` was exported. No network egress occurred in any test.

## 8. Prompt / generation throughput

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Quantity | Value |
| -------- | ----- |
| Prompt tokens processed (non-cached) | **132,755** |
| Prompt tokens served from cache | **1,170,500** |
| Prompt processing time | **260.61 s** |
| **Prompt tok/s (derived = 132,755 / 260.61)** | **509.40** |
| llama.cpp gauge `prompt_tokens_seconds` (measured, suite end) | **509.398** |
| Generated tokens | **41,468** |
| Generation time | **1,058.10 s** |
| **Generation tok/s (derived = 41,468 / 1,058.10)** | **39.19** |
| llama.cpp gauge `predicted_tokens_seconds` (measured, suite end) | **39.1164** |
| `n_decode_total` (excluding speculative) | **15,230** |

Derived and gauge values agree to within rounding; the gauges are the server's own measurements.

## 9. MTP / speculative-decoding metrics

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Metric | Value |
| ------ | ----- |
| Verification steps (`spec_decode_num_drafts_total`) | **14,791** |
| Draft tokens generated (`spec_decode_num_draft_tokens_total`) | **44,373** (= 3.000 per step; draft max 3) |
| Draft tokens accepted (`spec_decode_num_accepted_tokens_total`) | **26,697** |
| **Draft acceptance rate (derived)** | **60.16%** |
| **Mean accepted tokens per verification step (derived)** | **1.805** (≈ 0.805 extra tokens/step from MTP) |
| Accepted at draft position 0 / 1 / 2 | 11,315 / 8,665 / 6,717 |

MTP is active and materially productive: each decode step yields ~1.80 accepted tokens instead of 1.

## 10. Maximum context occupancy

| Quantity | Value |
| -------- | ----- |
| `n_tokens_max` (largest prompt+generation sequence observed, absolute) | **40,061** |
| Pre-suite `n_tokens_max` (after smoke) | 7,800 |
| `n_ctx` | **80,896** |
| Occupancy | **49.52% of the window** |
| Tests approaching/exceeding the validated ~80K occupancy | **none** |

The suite's workload peak (40,061) is well below the configured window. The run confirms the server was
*configured* for 80,896 and ran the frozen suite cleanly at ~50% occupancy; it provides **no evidence**
about reliability or throughput at the ~80K operating point. This is expected for a 9-task coding suite
and is reported as a limitation.

## 11. Memory / working-set observations

llama.cpp `/metrics` does not expose OS working-set, paging, or trim events, and the server is a remote
Windows host. The following are **observable proxies**, not direct memory measurements:

- **No throughput collapse:** aggregate generation 39.19 tok/s and prompt 509.40 tok/s; the longest test
  (t2, 480.0 s) was driven by step/tool volume, not a decode stall.
- **No timeouts:** all 9 tests `timed_out=false`; `rc=0` throughout.
- **No counter resets / no restart:** every `/metrics` counter increased monotonically across the suite
  (see §14); a restart would have reset them to zero.
- **No context-trim signal:** no test reached a length where trimming could be triggered (max 49.52% of
  the window); no *prompt* truncation was observed.
- **Paging / working-set trimming / anomalous memory pressure:** **not observed** in any
  client-observable signal, and **not independently measurable** from this client.

## 12. Timeout / runtime behavior

| Quantity | Value |
| -------- | ----- |
| Per-test timeout | 2400 s |
| Tests timed out | **0 / 9** |
| Sum of per-test durations | **1,400.9 s** |
| Continuous suite wall-clock (t0 start 20:17:21 → t8 end 20:41:06) | **1,425 s = 23.8 min** |

Per-test runtimes: t0 23.1, t1 47.5, t2 480.0, t3 46.9, t4 228.4, t5 248.2, t6 61.4, t7 182.7,
t8 82.7 s — all far below the 2400 s wrapper.

## 13. Comparison against prior OpenCode runs

### 13.1 Scores

| Run | Model | Context | Automated | Adjudicated |
| --- | ----- | ------- | --------- | ----------- |
| 8087 OpenCode (prior, Sep-21) | Unsloth UD IQ3_XXS | 80,896 | 6/3 — fail `t4,t5,t7` | 7/2 — fail `t5,t7` |
| 96K OpenCode (matrix r1) | GSQ-RCO IQ3_S | 97,280 | 6/3 — fail `t4,t7,t8` | 7/2 — fail `t7,t8` |
| **80K OpenCode (this run, matrix r3)** | **Unsloth UD IQ3_XXS** | **80,896** | **7/2 — fail `t4,t5`** | **7/2 — fail `t4,t5`** |

Per-test movement vs the prior Unsloth 8087 OpenCode run (same model, same file, same `n_ctx`):

- **t4: Fail → Fail, but for a different reason.** The prior run's t4 was a **scorer-phrasing false
  negative** (correct verdict delivered; only `no_change_warranted` missed) and was adjudicated **Pass**.
  This run's t4 is a **genuine incomplete-task failure**: the final step exhausted the 4,096-token
  output budget mid-reasoning, so no verdict and neither required `git diff` review were delivered.
- **t7: Fail → Pass.** The prior run used an external cached `markdownlint-cli`; this run used the
  repository's own Prettier (`npx prettier --check`) twice with separate outputs.
- **t5: Fail in both** (committed a Prettier reformat in a strict no-op task).
- **t0–t3, t6, t8 unchanged (Pass).** t8 recovered via `npm run check` (includes `format:check`).

Adjudicated aggregate is unchanged at **7/9**, but the composition moved (`t4` down, `t7` up) on a single
run — not established as statistically significant.

### 13.2 Performance (measured / derived)

| Metric | 8087 OpenCode Unsloth (prior) | 96K OpenCode GSQ (matrix r1) | **This run (80K, matrix r3)** |
| ------ | ----------------------------: | ---------------------------: | ----------------------------: |
| Prompt tok/s (derived) | 560.82 | 553.51 | **509.40** |
| Generation tok/s (derived) | 49.66 | 41.97 | **39.19** |
| `n_decode_total` | 14,648 | 11,433 | **15,230** |
| `n_tokens_max` | 42,976 | 29,788 | **40,061** |
| Prompt tokens (non-cached) | 133,770 | 129,039 | **132,755** |
| Generated tokens | 39,990 | 31,710 | **41,468** |
| Sum of test durations | 1,266.4 s | 1,064.5 s | **1,400.9 s** |
| MTP acceptance rate | 60.77% | 62.74% | **60.16%** |
| Mean accepted/step | 1.823 | 1.882 | **1.805** |

### 13.3 Interpretation of the comparison

- **Same model, same build, same window** as the prior Unsloth 8087 OpenCode run; only the run instance
  differs. Throughput was lower than that run (generation 39.19 vs 49.66 tok/s; prompt 509.40 vs 560.82
  tok/s) over a different mix of prompt lengths, tool counts, and MTP acceptance; no configuration
  change occurred.
- **MTP acceptance essentially unchanged** (60.16% vs 60.77%; 1.805 vs 1.823 accepted tokens/step).
- **Reliability composition changed**: t4 moved from an adjudicated scorer false-negative Pass to a
  genuine incomplete-task Fail (output-budget exhaustion), while t7 moved Fail→Pass by using the repo
  Prettier instead of external markdownlint. Net adjudicated total unchanged (7/2).

## 14. Interpretation and limitations

1. **The suite does not exercise ~80K occupancy (dominant limitation).** Peak sequence was 40,061 tokens
   (49.52% of 80,896). The run validates the server *configured* at ~80K, not the ~80K *operating point*.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite
   score. The t4/t7 movements are single-run observations.
3. **t4 is a genuine incomplete-task failure this run** (output-budget exhaustion), distinct from the
   scorer-phrasing false negative seen in the prior Unsloth and matrix-r1 runs. The model's final step
   hit the 4,096-token output cap and the turn ended without a verdict.
4. **t7/t8 credit caveats.** t7 was credited for the repo's scoped `npx prettier --check` (not the
   literal `npm run format:check`); t8 was credited via the umbrella `npm run check` (nested
   `format:check` with corroborating output). A strict adjudicator could treat either more narrowly.
5. **Suite-level metrics only.** Per-test throughput is not available (the direct OpenCode runner
   snapshots `/metrics` around the whole suite).
6. **Memory/paging not observable.** Only indirect stability evidence is reported (§11).
7. **Zero permission denials.** `external_directory: deny` is in force; the `/tmp` redirections used
   this run were permitted by command shape (documented behavior, not a policy change).
8. **Raw permission log is process-global.** `permissions.json` raw-log slices include allow-events
   from the orchestrator's own OpenCode process; log denials are reported separately from per-session
   DB denials (there were none).

## 15. Server-integrity evidence (no restart)

| Counter (measured) | pre-smoke (initial) | before-suite | after-suite | monotonic |
| ------------------ | ------------------: | -----------: | ----------: | --------- |
| `prompt_tokens_total` | 0 | 8,376 | 141,131 | ✔ |
| `prompt_tokens_cached_total` | 0 | 0 | 1,170,500 | ✔ |
| `prompt_seconds_total` | 0 | 12.945 | 273.556 | ✔ |
| `tokens_predicted_total` | 0 | 121 | 41,589 | ✔ |
| `tokens_predicted_seconds_total` | 0 | 2.292 | 1,060.390 | ✔ |
| `n_decode_total` | 0 | 64 | 15,294 | ✔ |
| `n_tokens_max` (max, absolute) | 0 | 7,800 | 40,061 | ✔ |
| `spec_decode_num_drafts_total` | 0 | 41 | 14,832 | ✔ |
| `spec_decode_num_draft_tokens_total` | 0 | 123 | 44,496 | ✔ |
| `spec_decode_num_accepted_tokens_total` | 0 | 78 | 26,775 | ✔ |

Server identity was identical before and after the suite: build `b1-60081bb`, model path unchanged,
`n_ctx=80896` (both `/props` and `/v1/models` meta), model id `qwen3.8-27b-unsloth-ud-iq3xxs`,
`endpoint_metrics:true`, `total_slots=1`, slot `id=0`, `speculative:true`, `vision:false`. Monotone
counters with no reset demonstrate the server was **not** restarted during the suite. **No
configuration change** was made at any point. Port **8087** was the only Qwen server active: the GSQ
profile was not present (alias/path are Unsloth), and port **8081** (the stale global entry) was not
listening; port **11434** (Ollama) was not listening either.

## 16. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-unsloth-ud-iq3xxs-80k-matrix-r3-opencode/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`,
  `config.verification.json`, `baseline.meta.json`, `baseline.validation.json`, `clones.validation.json`,
  `server.health.json`, `server.props.json`, `server.models.json`, `server.slots.json`,
  `server.health.after_suite.json`, `server.props.after_suite.json`, `server.models.after_suite.json`,
  `server.slots.after_suite.json`, `metrics.initial.prom`, `metrics.before_suite.prom`,
  `metrics.after_suite.prom`, `smoke/client_smoke.out`, `status.json`).
- **Results:** `…/results/qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r3-opencode/` (`results.jsonl`,
  `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`,
  `tN.out/err/log`, `permissions/tN.permission.log`, `permissions/tN.permission.json`).
- **Prior artifacts untouched:** the prior Unsloth 8087 workspace, the matrix-r1/r2 workspaces, and all
  earlier workspaces retain their original contents; this run wrote only to the new
  `…-80k-matrix-r3-opencode` workspace and this report.
- **Frozen harness/scorer:** HEAD remains `48d9b54f249cd461f5456202f225bbddd156fdf9`; tracked harness,
  scorer, and prompt files show no diff (only the two pre-existing untracked DSH adapters appear);
  prompts/scorer/baseline were used verbatim; the baseline rebuilt deterministically at `ef91057c…`
  (tree `feca1f64…`).
- **Repository integrity:** no staging, commit, push, reset, or other Git state change; main repository
  HEAD remains `48d9b54f…`. Pre-existing uncommitted application-source changes (tracked
  `ARCHITECTURE.md`, `README.md`, `convex/http.ts`, `worker/README.md`, `worker/src/index.js`; untracked
  `convex/health.ts`, `convex/lib/health.ts`, `worker/src/health.js`, `tests/health/`) were present
  before the run and were **not** touched. The only new repository artifact is this report.

**Nothing was committed. The next matrix run (run 4) was not started. The 8087 model was not switched.**

---

### Required summary

- **Matrix position:** **Run 3 of 6** — `Unsloth UD-IQ3_XXS 80K × OpenCode`.
- **Automated score:** **7 Pass / 2 Fail** (Fail `t4,t5`).
- **Adjudicated score:** **7 Pass / 2 Fail** (Fail `t4,t5`).
- **Per-test result table:** §5.
- **Total runtime:** **1,425 s (23.8 min)** continuous suite wall-clock; sum of test durations
  **1,400.9 s**.
- **Prompt tok/s:** **509.40** (non-cached, derived; server gauge 509.398).
- **Generation tok/s:** **39.19** (derived; server gauge 39.1164).
- **MTP acceptance:** **60.16%** (mean **1.805** accepted tokens/verification step; 3.000 draft/step).
- **Maximum actual token occupancy:** **40,061** tokens (`n_tokens_max`; **49.52%** of the 80,896
  window). No test approached or exceeded the validated ~80K occupancy.
- **Anomalies:** zero timeouts; **zero permission denials**; zero network attempts; no restarts; no
  configuration changes; no `robinhood` usage.
- **Material OpenCode-vs-prior-run differences:** t4 Fail→Fail but the cause changed from a
  scorer-phrasing false negative (adjudicated Pass in the prior Unsloth/GSQ-r1 runs) to a **genuine
  incomplete-task failure** (4,096-token output-budget exhaustion; no verdict, no `git diff --check` /
  `--staged`); t7 Fail→Pass (used the repo's Prettier instead of external markdownlint); t5 Fail in both;
  adjudicated total unchanged at 7/2. See §13.
- **Report path:**
  `docs/development/model-reliability/qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r3-opencode-frozen-harness-evaluation.md`.
