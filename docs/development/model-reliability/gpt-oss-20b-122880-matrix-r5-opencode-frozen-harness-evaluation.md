# GPT-OSS 20B (Ollama `gpt-oss:20b-122880`, 122,880 context) — OpenCode Frozen-Harness Reliability Evaluation — **Matrix Run 5 of 6**

**Date:** 2026-09-24
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the read-only server probes, the
frozen suite run, trace extraction, scoring, adjudication, and this report.
**Matrix position:** **Run 5 of 6** — `GPT-OSS 20B × OpenCode`
**Model under test (downstream):** `gpt-oss:20b-122880` (Ollama model derived from source `gpt-oss:20b`
with `PARAMETER num_ctx 122880`)
**Provider / endpoint:** provider `ollama` (`@ai-sdk/openai-compatible`), Ollama `0.33.2` at
`http://192.168.68.52:11434` (OpenAI-compatible `/v1`)
**Exact OpenCode model ID passed to the harness:** `ollama/gpt-oss:20b-122880`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`
(source ref `a07d38e8f3d48c68807569cb69d0c1f42433c7b03`, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`,
338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen
`prompt_manifest.json`, all hashes/bytes verified)
**Evaluation config (run-local overlay):**
`/Users/cortezashley/.local/share/opencode-evals/gpt-oss-20b-122880-matrix-r5-opencode/opencode.gpt-oss-20b-122880-eval.jsonc`
(sha256 `abb351011ddd7083f12f694c0a0e56867ff2fb337c604c9056e042ed453ea31e`, 730 bytes)
**Per-test timeout:** 2400 s
**Variant label:** `gpt-oss-20b-122880-matrix-r5-opencode`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/gpt-oss-20b-122880-matrix-r5-opencode`
(one fresh workspace + isolated clone + session per test)

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced, and no single-run difference is treated as statistically significant.
>
> **Measured vs. derived.** _Measured_ values are read directly from harness/session records or the
> Ollama API. _Derived_ values are arithmetic over measured values. Each is labelled below.
>
> **Ollama metric limitation.** Ollama `0.33.2` exposes **no `/metrics` endpoint** (`GET /metrics`
> → HTTP 404) and its OpenAI-compatible `/v1` path returns no prompt-eval/generation durations. The
> llama.cpp-style suite-wide `prompt_tokens_seconds` / `predicted_tokens_seconds` gauges and
> `spec_decode_*` counters are therefore **not available** for this run. Metrics below are derived
> from OpenCode session records and wall-clock only, and are labelled as proxies.
>
> **Scope note.** This run validates the **`gpt-oss:20b-122880`** model at its configured
> **`n_ctx = 122,880`** window. The frozen suite did **not** drive the window far: the largest
> sequence observed was **15,657 tokens (12.74% of the window)**. The frozen prompts,
> `ground_truth.json`, `prompt_manifest.json`, scorer, and baseline were used verbatim.

---

## 1. Provenance

| Item                      | Value                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Suite                     | `opencode-t0-t8` (frozen `ground_truth.json`)                                                           |
| Matrix position           | **5 of 6** (`GPT-OSS 20B × OpenCode`)                                                                   |
| Harness commit (used)     | `48d9b54f249cd461f5456202f225bbddd156fdf9`                                                              |
| Harness working tree      | tracked harness/scorer/prompt files clean (no diff); only pre-existing _untracked_ DSH adapters present |
| Baseline HEAD             | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`                                                              |
| Baseline source ref       | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`                                                              |
| Baseline tree             | `feca1f64fa1f9479f42b0745968ccf41f647d870`                                                              |
| Tracked files in baseline | 338                                                                                                     |
| Prompt verification       | all `t0`–`t8` SHA-256 **and** byte length match (`ok: true`)                                            |
| Config verification       | `ok: true` (canonical permission block; `robinhood-trading.enabled=false`)                              |
| Run interval              | provisioning `2026-09-24T01:15:07Z`; suite `2026-09-24T01:17:03Z` → `2026-09-24T01:22:49Z`              |
| Engine                    | direct OpenCode (`runner.py` → `extract_traces.py` → `score.py`), same procedure as matrix runs 1 and 3 |
| Timeout                   | 2400 s/test (runner default; recorded in `manifest.json` and every `results.jsonl` record)              |
| Application source        | untouched by this run; pre-existing uncommitted changes present before and after, unchanged             |

Run sequence: read-only server probes → direct client smoke (overlay routing + context check) →
provision the sanitized baseline + 9 clones → capture pre-suite `/api/ps`/`/api/show`/`/api/tags` →
run `t0`–`t8` serially → capture post-suite `/api/ps`/`/api/show`/`/api/tags` → `extract_traces.py` →
`score.py` → manual adjudication against `ground_truth.json`. The Ollama server was **not** restarted
or reconfigured at any point.

## 2. Exact model / server configuration

Read-only probes of `http://192.168.68.52:11434` (server **not** restarted or modified):

| Item                                      | Before                                                   | After                | Source                                |
| ----------------------------------------- | -------------------------------------------------------- | -------------------- | ------------------------------------- |
| Health / version                          | Ollama `0.33.2`                                          | `0.33.2`             | `GET /api/version`                    |
| Model alias / id                          | `gpt-oss:20b-122880`                                     | `gpt-oss:20b-122880` | `/api/tags`, `/api/show`              |
| Parent model                              | `gpt-oss:20b`                                            | `gpt-oss:20b`        | `/api/show` (`details.parent_model`)  |
| Digest                                    | `36a642bd2d78d93f…`                                      | same                 | `/api/tags`                           |
| Modelfile parameter                       | `PARAMETER num_ctx 122880` (+ inherited `temperature 1`) | same                 | `/api/show` (`parameters`)            |
| **Effective serving context** (`/api/ps`) | **122,880**                                              | **122,880**          | `GET /api/ps` (`context_length`)      |
| Trained context                           | `131,072`                                                | `131,072`            | `/api/show` (`gptoss.context_length`) |
| Family / params / quant                   | `gptoss` / `20.9B` / `MXFP4`                             | same                 | `/api/show` (`details`)               |
| Capabilities                              | `completion`, `tools`, `thinking`                        | same                 | `/api/show`                           |
| VRAM (loaded)                             | `13,038,329,527` bytes                                   | same                 | `/api/ps` (`size_vram`)               |
| Metrics endpoint                          | **absent** (`/metrics` → 404)                            | absent               | `GET /metrics`                        |

The source model `gpt-oss:20b` remains unchanged (`parameters: temperature 1` only; no `num_ctx`), and
the global Ollama default remains 65536. The 122,880 window is supplied **only** by the derived model
tag `gpt-oss:20b-122880`. **Observable confirmation of the context:** `/api/ps` reported
`context_length=122880` before and after the suite, and a direct `/v1` request against the tag loaded
the instance at 122,880. The suite did not restart the server.

## 3. OpenCode configuration / invocation and overlay verification

| Item                                | Value                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Harness binary                      | `/Users/cortezashley/.local/opencode-patched/bin/opencode` (`1.18.30`)                   |
| Config passed via `OPENCODE_CONFIG` | run-local overlay `…/opencode.gpt-oss-20b-122880-eval.jsonc` (sha256 `abb35101…`, 730 B) |
| Model passed via `-m`               | `ollama/gpt-oss:20b-122880`                                                              |
| Provider baseURL (overlay)          | `http://192.168.68.52:11434/v1`                                                          |
| Permission block                    | `external_directory/webfetch/websearch = deny`                                           |
| MCP                                 | `robinhood-trading.enabled = false`                                                      |
| Per-test wrapper                    | 2400 s `subprocess` timeout (recorded per record)                                        |

**Why a run-local overlay.** The established production overlay
`~/.config/opencode/opencode.gpt-oss-20b-eval.jsonc` (sha256 `42fc28b4…`, unchanged) names the
source tag `gpt-oss:20b`; passing `-m ollama/gpt-oss:20b-122880` with it fails (`UnknownError`) because
the model id is not defined. To avoid modifying production OpenCode configuration, a **run-local
overlay** was used that is byte-identical to the production overlay except the model tag
(`gpt-oss:20b` → `gpt-oss:20b-122880`) and the top-level `model`. Three independent confirmations of
correct routing:

1. A pre-suite **client smoke** (`opencode run` with the overlay and explicit model) returned
   `SMOKE_OK`; its banner read `build · gpt-oss:20b-122880`, and `/api/ps` immediately after showed
   `context_length=122880`.
2. **t0** self-identification reports `gpt-oss:20b-122880` (exact ID `ollama/gpt-oss:20b-122880`).
3. `config.verification.json` records the overlay's parsed canonical permission block and the
   `robinhood-trading` disablement before any model call.

The production overlay was **not modified** (sha256 unchanged). No unrelated OpenCode configuration
was changed.

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; provisioned deterministically via
  `git archive` of `a07d38e` with the eval directory excluded (`excluded_present_in_ref: false`), 338
  tracked files, tree `feca1f64…`; all 9 clones validated `ok` at baseline HEAD before the run.
- Prompt manifest: all nine prompts matched SHA-256 **and** byte length (`ok: true`); hashes recorded in
  `manifest.json`, `prompt.verification.json`, and every `results.jsonl` record.
- Config verification: `ok: true`; canonical permission block
  (`external_directory/webfetch/websearch = deny`) and `robinhood-trading.enabled = false` verified
  before any model call.
- The application source, prompts, `ground_truth.json`, `prompt_manifest.json`, `runner.py`,
  `extract_traces.py`, and `score.py` were used verbatim and not modified. `runner_dsh.py` and
  `extract_traces_dsh.py` are pre-existing untracked DSH adapters and were not used or changed.

## 5. Per-test results (t0–t8)

Token columns are sums of per-step session values from `step-finish` records (measured; each step's
`input` is the full context re-sent, so input is cumulative). "Model s" is the sum of assistant-message
`(completed − created)` (measured). Runtime is the runner wall-clock per test. Every session matched its
clone directory exactly (`match=exact`); every clone started clean at baseline HEAD and ended clean.
`rc=0` throughout. **Zero timeouts.**

| #   | Automated | Adjudicated | Runtime (s) | In tok (cum.) | Out tok | Steps | Model s | Tools | Rej | Commits | Timeout |
| --- | --------- | ----------- | ----------: | ------------: | ------: | ----: | ------: | ----: | --: | ------: | ------- |
| t0  | Pass      | Pass        |        13.1 |         7,284 |     152 |     1 |    10.6 |     0 |   0 |       0 | No      |
| t1  | **Fail**  | **Fail**    |        20.0 |        22,358 |     775 |     3 |    17.8 |     2 |   1 |       0 | No      |
| t2  | **Fail**  | **Fail**    |        25.8 |        85,158 |     663 |     9 |    23.6 |     8 |   1 |       0 | No      |
| t3  | **Fail**  | **Fail**    |        46.2 |        42,849 |   1,455 |     5 |    44.0 |     4 |   0 |       0 | No      |
| t4  | **Fail**  | **Fail**    |        36.9 |        90,029 |   1,263 |     9 |    34.9 |     8 |   0 |       0 | No      |
| t5  | **Fail**  | **Fail**    |        49.0 |       222,947 |   1,557 |    21 |    46.9 |    20 |   1 |       0 | No      |
| t6  | Pass      | Pass        |        49.9 |        79,053 |     996 |     8 |    47.7 |     7 |   0 |       0 | No      |
| t7  | **Fail**  | **Fail**    |        58.6 |       250,992 |   1,749 |    24 |    56.6 |    23 |   0 |       0 | No      |
| t8  | **Fail**  | **Fail**    |        25.5 |        50,923 |     691 |     6 |    23.4 |     5 |   0 |       0 | No      |

Totals: 9 tests; session input **851,593** tok (cumulative), output **9,301** tok; sum of runtimes
**325.0 s**; sum of model time **305.5 s**. **No commits were created in any test** (all clones ended
clean). "Tools" counts every tool part, including `invalid` parts where the model attempted an
unavailable tool.

## 6. Adjudication

- **Automated (frozen scorer): 2 Pass / 7 Fail** — Pass `t0,t6`; Fail `t1,t2,t3,t4,t5,t7,t8`.
- **Adjudicated: 2 Pass / 7 Fail** — identical. All seven failures are genuine; **one scorer false
  positive** was found (`t5.preexisting_classified`) and it does not change any verdict.

| #   | Auto | Adj      | Exact reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t1  | Fail | **Fail** | Genuine. The model located `docs/domain-model.md` via `glob` but then tried to `read` an **incorrect absolute path** (`…/gpt-oss-122880-matrix-r5-opencode/clones/t1/…`, missing `20b`), which was denied by `external_directory`; its final output was a malformed tool-call JSON (`{"command":"wc -l docs/domain-model.md",…}`) rather than an answer. **No line count (205) was ever reported** (`t1.line_count`/`t1.line_count_output` unmet).                                                                                                               |
| t2  | Fail | **Fail** | Genuine. The model searched filenames only (8 `glob` calls for `PinPal`, plus one denied `glob` with `path:".."`), concluded "No PinPal files exist. Likely miss‑spelled", and **abandoned** — no edit, no validator, no diff review, no commit. All four critical workflow requirements unmet.                                                                                                                                                                                                                                                                  |
| t3  | Fail | **Fail** | Genuine counting error. The model ran a real search (native `grep`, plus `find . -type f -exec grep -l "PinPal" {} +`) and listed all **11 correct paths**, but reported **"Total files found: 12"**. Re-running the model's own command against the baseline yields exactly **11**, so `t3.count` (expects `11`) is genuinely unmet.                                                                                                                                                                                                                            |
| t4  | Fail | **Fail** | Genuine. The model delivered the **correct verdict** ("The claim is false … No documentation change is required") and made no change, but did **not run the explicitly required `git diff --check` or `git diff --staged`** (`t4.diff_check`, `t4.diff_staged` unmet); it also did not run the repository validator (`t4.validator_run`, non-critical).                                                                                                                                                                                                          |
| t5  | Fail | **Fail** | Genuine. The model never ran the repository validator: it searched extensively for a "markdown lint" tool, dismissed `format:check` as "prettier, not markdown", ran only `git status`, and concluded "No markdown validation failures detected". `t5.validator_run` (critical) unmet. **Scorer false positive:** `t5.preexisting_classified` matched the **user prompt text** ("classify the failure as pre-existing or self-caused"), not the model's own classification — the model never saw a failure. The false positive does not change the Fail verdict. |
| t7  | Fail | **Fail** | Genuine. Instead of the repository Markdown validator (Prettier via `format:check`), the model used an **externally cached `markdownlint-cli`** (`npx markdownlint-cli docs/domain-model.md`, resolved from `~/.npm/_npx`; `npx markdownlint` failed). It ran the validator **once**, then **reported a fabricated second execution** with identical output. `t7.validator_twice` (critical) and `t7.separate_outputs` unmet; `git status` was run and no file was modified.                                                                                     |
| t8  | Fail | **Fail** | Genuine. Both bogus commands were run and reported accurately (`npm run markdownlint` → `Missing script`; `git statuss` → `not a git command`), but the model **described** the recovery commands in text without executing them. `t8.recovery_validation` and `t8.recovery_git_status` (critical) unmet.                                                                                                                                                                                                                                                        |

All 27 common requirements (`common.prompt_verified`, `common.baseline_head`, `common.clean_before`,
i.e. 3 × 9) **passed** for every test.

**New behaviors not seen in the prior GPT-OSS run.** The model repeatedly attempted **unavailable
tools** (`search`, `rglob`; recorded as `invalid` tool parts — 6 occurrences across t4, t5, t6, t7,
t8), and it twice constructed an **incorrect absolute clone path** (`gpt-oss-122880…` instead of
`gpt-oss-20b-122880…`), which the `external_directory` policy correctly denied.

## 7. Permission / tool surface and network

- **Permission denials:** **3** across the suite, all `external_directory`, all caused by the model
  using a path outside its clone:
  - t1 `read` of `…/gpt-oss-122880-matrix-r5-opencode/clones/t1/docs/domain-model.md` (wrong path);
  - t2 `glob` with `path:".."`;
  - t5 `read` of `…/gpt-oss-122880-matrix-r5-opencode/clones/t5/package.json` (wrong path).
    Each was enforced by the verified `external_directory: deny` policy and correctly contained.
- **Tool surface:** `glob`, `read`, `grep`, `bash`, `todowrite` were used; `web_*` never appears.
  No `write`/`edit` was ever invoked. `webfetch`/`websearch` are denied by the verified overlay.
- **Network:** **zero** `npm install`/`curl`/`wget`/`npm view`/`npm pack`; `npm_config_offline=true` was
  exported. The t7 `npx markdownlint-cli` resolved from the pre-existing local `~/.npm/_npx` cache
  (not the repository, no network fetch); `npx markdownlint` failed locally. No network egress occurred.

## 8. Prompt / generation throughput (Ollama-limited)

Ollama `0.33.2` has **no `/metrics`** endpoint and its `/v1` path returns no timing fields, so
llama.cpp-style suite gauges (`prompt_tokens_seconds`, `predicted_tokens_seconds`) and
`spec_decode_*` counters **cannot be produced**. The following are measured from OpenCode session
records / wall-clock, with derived proxies:

| Quantity                                                    | Value        | Kind            |
| ----------------------------------------------------------- | ------------ | --------------- |
| Cumulative per-step input tokens                            | 851,593      | measured        |
| Generated (output) tokens                                   | 9,301        | measured        |
| Sum of assistant-step wall-time                             | 305.5 s      | measured        |
| Sum of per-test runtimes                                    | 325.0 s      | measured        |
| Continuous suite wall-clock                                 | 346 s        | measured        |
| **Output tok/s proxy** (9,301 / 305.5)                      | **30.4**     | derived (proxy) |
| Prompt-processing + generation rate (851,593+9,301 / 305.5) | ~2,818 tok/s | derived (proxy) |

The output tok/s figure is a **lower-bound proxy**: the assistant-step wall-time includes prompt
processing as well as generation, and the two cannot be separated on the `/v1` path. Ollama's native
`/api/chat` returns `prompt_eval_duration`/`eval_duration`, but OpenCode's provider does not use that
endpoint, so a true decode rate is **not derivable** from this run.

## 9. Maximum context occupancy

| Quantity                                                    | Value                    |
| ----------------------------------------------------------- | ------------------------ |
| Largest sequence observed (max per-step `tokens.total`)     | **15,657**               |
| `n_ctx`                                                     | **122,880**              |
| Occupancy                                                   | **12.74% of the window** |
| Tests approaching/exceeding the validated 122,880 occupancy | **none**                 |

The run confirms the derived model was _configured_ for and _served_ at 122,880, and that the frozen
suite ran cleanly at ~13% occupancy; it provides **no evidence** about reliability or throughput at the
~122K operating point. This is expected for a 9-task coding suite and is reported as a limitation.

## 10. Timeout / runtime behavior

| Quantity                                                            | Value               |
| ------------------------------------------------------------------- | ------------------- |
| Per-test timeout                                                    | 2400 s              |
| Tests timed out                                                     | **0 / 9**           |
| Sum of per-test durations                                           | **325.0 s**         |
| Continuous suite wall-clock (t0 start 01:17:03Z → t8 end 01:22:49Z) | **346 s = 5.8 min** |

Per-test runtimes: t0 13.1, t1 20.0, t2 25.8, t3 46.2, t4 36.9, t5 49.0, t6 49.9, t7 58.6, t8 25.5 s —
all far below the 2400 s wrapper.

## 11. Comparison against prior runs

### 11.1 GPT-OSS prior vs. this run

| Run                              | Model / context                        | Harness        | Automated           | Adjudicated                                                  |
| -------------------------------- | -------------------------------------- | -------------- | ------------------- | ------------------------------------------------------------ |
| GPT-OSS prior (2026-09-17)       | `gpt-oss:20b` (context not set; 900 s) | `a31d1a3`      | 3 Pass / 6 Fail     | 4 Pass (`t0,t1,t3,t6`) + t4 Partial/FAIL; Fail `t2,t5,t7,t8` |
| **GPT-OSS matrix r5 (this run)** | **`gpt-oss:20b-122880` @ 122,880**     | **`48d9b54f`** | **2 Pass / 7 Fail** | **2 Pass (`t0,t6`) / 7 Fail**                                |

Movement (not a controlled comparison — harness commit, scorer hardening, and context differ):

- **t1 Pass → Fail:** the prior run reported 205 lines; this run never reported the line count and
  emitted a malformed tool-call instead.
- **t3 Pass (adjudicated) → Fail:** the prior run reported exactly 11; this run reported 12 (though it
  listed all 11 correct paths).
- **t0, t6 stable Pass. t2, t4, t5, t7, t8 stable Fail** (same failure modes: abandonment, skipped
  required diff steps, wrong/missing validator, fabricated re-run, unexecuted recovery).
- New: attempts to call unavailable tools (`search`, `rglob`) and construction of an incorrect clone
  path (missing `20b`).

### 11.2 Against the Qwen/OpenCode matrix runs (methodology parity, different model)

| Run                               | Model                                | Context     | Automated             | Adjudicated        |
| --------------------------------- | ------------------------------------ | ----------- | --------------------- | ------------------ |
| Matrix r1 OpenCode                | Qwen3.8-27B GSQ-RCO IQ3_S            | 97,280      | 6/3 (fail `t4,t7,t8`) | 7/2 (fail `t7,t8`) |
| Matrix r3 OpenCode                | Qwen3.8-27B Unsloth UD-IQ3_XXS       | 80,896      | 7/2 (fail `t4,t5`)    | 7/2 (fail `t4,t5`) |
| **Matrix r5 OpenCode (this run)** | **GPT-OSS 20B `gpt-oss:20b-122880`** | **122,880** | **2/7**               | **2/7**            |

Methodology is identical (`runner.py` → `extract_traces.py` → `score.py`, 2400 s/test, sanitized
baseline, canonical deny permissions, MCP disabled). Under this suite, GPT-OSS 20B is materially
weaker than the Qwen3.8-27B configurations. No cross-model ranking is asserted beyond the observed
single-run totals.

## 12. Interpretation and limitations

1. **The suite does not exercise the 122K operating point (dominant limitation).** Peak sequence was
   15,657 tokens (12.74% of 122,880). The run validates the model _configured/served_ at 122,880, not
   behavior at high occupancy.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite
   score.
3. **Ollama metric limitation.** No `/metrics`; no prompt-eval/generation durations on `/v1`. tok/s
   figures are proxies, not llama.cpp-equivalent gauges; speculative-decoding metrics do not apply.
4. **Reliability is low on this suite.** 2/9 adjudicated. Failures cluster on ordered multi-step
   workflows (t2, t4, t5), correct-validator selection (t5, t7), and recovery/execution discipline
   (t7, t8), plus a counting error (t3) and a path/answer failure (t1).
5. **Scorer false positive.** `t5.preexisting_classified` matches the user prompt text; it does not
   change the verdict because `t5.validator_run` genuinely fails.
6. **No scorer false negatives** were found this run; the hardened scorer correctly credited t4's
   verdict/no-change wording and t3's search execution.
7. **Run-local overlay.** A dedicated overlay was required because the production overlay names the
   source tag; the production overlay and global OpenCode configuration were left unchanged.
8. **Permission denials are model-caused.** All three `external_directory` denials arose from the
   model using incorrect/outside paths; the policy behaved as declared.

## 13. Server-integrity evidence (no restart, no reconfiguration)

| Observation                | Before suite         | After suite          |
| -------------------------- | -------------------- | -------------------- |
| Model alias                | `gpt-oss:20b-122880` | `gpt-oss:20b-122880` |
| Parent model               | `gpt-oss:20b`        | `gpt-oss:20b`        |
| Modelfile `num_ctx`        | 122,880              | 122,880              |
| `/api/ps` `context_length` | 122,880              | 122,880              |
| `/api/ps` `size_vram`      | 13,038,329,527       | 13,038,329,527       |
| Ollama version             | `0.33.2`             | `0.33.2`             |

The source model `gpt-oss:20b` was unchanged (`parameters: temperature 1` only), and the global
Ollama default remained 65536. The derived tag and its 122,880 window were identical before and after.
**No configuration change** was made at any point. Ports **8087/8081** (Qwen) were not used or switched.

## 14. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/gpt-oss-20b-122880-matrix-r5-opencode/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`, `config.verification.json`,
  `baseline.meta.json`, `baseline.validation.json`, `clones.validation.json`, `server.*.before_suite.json`,
  `server.*.after_suite.json`, `smoke/`, `runner.log`, `status.json`, run-local overlay).
- **Results:** `…/results/gpt-oss-20b-122880-matrix-r5-opencode/` (`results.jsonl`, `raw_parts.jsonl`,
  `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`, `tN.out/err/log`,
  `permissions/tN.permission.log`, `permissions/tN.permission.json`).
- **Prior artifacts untouched:** all earlier workspaces retain their original contents; this run wrote
  only to the new workspace and this report.
- **Frozen harness/scorer:** HEAD remains `48d9b54f249cd461f5456202f225bbddd156fdf9`; tracked harness,
  scorer, and prompt files show no diff (only the two pre-existing untracked DSH adapters appear);
  prompts/scorer/baseline were used verbatim; the baseline rebuilt deterministically at `ef91057c…`
  (tree `feca1f64…`).
- **Repository integrity:** no staging, commit, push, reset, or other Git state change; main repository
  HEAD remains `48d9b54f…`. Pre-existing uncommitted application-source changes were present before the
  run and were **not** touched. The only new repository artifact is this report.
- **Production config:** `~/.config/opencode/opencode.gpt-oss-20b-eval.jsonc` sha256 unchanged
  (`42fc28b4ee2e36311f7f5486499dba54821672901efdef9f4ffdee2f2a0b1b56`).

**Nothing was committed. Matrix run 6 (DSH) was not started. The GPT-OSS configuration was not altered
after the run.**

---

### Required summary

- **Matrix position:** **Run 5 of 6** — `GPT-OSS 20B × OpenCode`.
- **Model:** `ollama/gpt-oss:20b-122880` (derived from source `gpt-oss:20b`, `PARAMETER num_ctx 122880`);
  effective serving context **122,880** (`/api/ps` before and after).
- **Automated score:** **2 Pass / 7 Fail** (Pass `t0,t6`).
- **Adjudicated score:** **2 Pass / 7 Fail** (Pass `t0,t6`) — one scorer false positive
  (`t5.preexisting_classified`) that does not change any verdict; no scorer false negatives.
- **Per-test result table:** §5.
- **Total runtime:** **346 s (5.8 min)** continuous suite wall-clock; sum of test durations **325.0 s**;
  zero timeouts.
- **Prompt/generation throughput:** **not llama.cpp-equivalent** (Ollama `/metrics` absent, `/v1`
  exposes no durations). Measured: 851,593 cumulative input tokens, 9,301 output tokens. Derived
  output proxy **30.4 tok/s**.
- **Maximum actual token occupancy:** **15,657** tokens (**12.74%** of the 122,880 window).
- **Permission denials:** **3**, all `external_directory`, all caused by model-constructed incorrect
  paths; correctly enforced. Zero network egress.
- **Anomalies:** zero timeouts; zero commits; no restarts; no configuration changes; repeated attempts
  to call unavailable tools (`search`, `rglob`); incorrect clone path construction (missing `20b`).
- **Material difference from prior GPT-OSS OpenCode run:** adjudicated **4 Pass → 2 Pass**; `t1` and
  `t3` regressed (no line count; reported 12 vs 11), `t0`/`t6` stable Pass, `t2`/`t4`/`t5`/`t7`/`t8`
  stable Fail. (Not a controlled comparison: harness commit, scorer hardening, and context differ.)
- **Report path:**
  `docs/development/model-reliability/gpt-oss-20b-122880-matrix-r5-opencode-frozen-harness-evaluation.md`.
