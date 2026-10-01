# Qwen3.8-27B-Unsloth-UD-IQ3_XXS (8087 / 80,896 ≈ 80K + MTP) — **DSH** Frozen-Harness Reliability Evaluation — **Matrix Run 4 of 6**

**Date:** 2026-09-23
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the read-only server probes, the frozen suite run, trace extraction, scoring, adjudication, and this report.
**Matrix position:** **Run 4 of 6** — `Unsloth UD-IQ3_XXS 80K × DSH`
**Execution / orchestration harness under test:** **DSH (DeepSeek Harness)** `@deepseek-ai/dsh@0.1.5-rc.2`
**Model under test (downstream):** `qwen3.8-27b-unsloth-ud-iq3xxs`
**Model file:** `E:\LocalAI\models\qwen3.8-27b\unsloth\production\Qwen3.8-27B-UD-IQ3_XXS.gguf` (`IQ3_XXS - 3.0625 bpw`)
**Provider / endpoint:** DSH provider `local-llama-cpp` → `http://192.168.68.52:8087/v1` (llama.cpp, build `b1-60081bb`)
**DSH model label:** `local-llama-cpp/qwen3.8-27b-unsloth-ud-iq3xxs` (reasoning `low`, contextWindow `80896`, maxTokens `32768`)
**Harness commit (frozen):** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`; all hashes + byte lengths verified)
**Per-test timeout:** 2400 s (wrapper; recorded in `manifest.json` and every `results.jsonl` record)
**Variant label:** `qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r4-dsh`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r4-dsh`

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are task-level evidence from a single evaluation run, not a statistical measurement. No composite score or ranking is produced, and no single-run difference is treated as statistically significant.
>
> **Measured vs. derived.** _Measured_ values are read directly from llama.cpp `/metrics` counter deltas (suite interval) or from harness/session records. _Derived_ values are arithmetic over measured values (tok/s, percentages). Each is labelled below.
>
> **Scope note.** This run validates the **Qwen3.8-27B-Unsloth-UD-IQ3_XXS** server at its configured **`n_ctx = 80,896` (~80K)** window, run under **DSH** with the web tools removed and the 600,000 ms shell budget preserved. The frozen suite did **not** drive the window far: the largest sequence observed was **40,786 tokens (50.42% of the window)**. The frozen prompts, `ground_truth.json`, `prompt_manifest.json`, scorer, and baseline were used verbatim.

---

## 1. Provenance

| Item                      | Value                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Suite                     | `opencode-t0-t8` (frozen `ground_truth.json`)                                                           |
| Matrix position           | **4 of 6** (`Unsloth UD-IQ3_XXS 80K × DSH`)                                                             |
| Harness commit (used)     | `48d9b54f249cd461f5456202f225bbddd156fdf9`                                                              |
| Harness working tree      | tracked harness/scorer/prompt files clean (no diff); only pre-existing _untracked_ DSH adapters present |
| Baseline HEAD             | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`                                                              |
| Baseline source ref       | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`                                                              |
| Baseline tree             | `feca1f64fa1f9479f42b0745968ccf41f647d870`                                                              |
| Tracked files in baseline | 338                                                                                                     |
| Prompt verification       | `ok: true` — all `t0`–`t8` SHA-256 **and** byte length match                                            |
| Run interval              | `2026-09-23T21:53:55Z` → `2026-09-23T22:21:41Z`                                                         |
| Engine                    | DSH adapter (`runner_dsh.py` → `extract_traces_dsh.py` → `score.py`); `runner.py` (OpenCode) untouched  |
| Application source        | untouched by this run; pre-existing uncommitted changes present before and after, unchanged             |

Run sequence: read-only server probes → fresh workspace + parity overlay → `--dump-config` verification → provision the sanitized baseline + 9 clones → **pre-suite model-identity smoke** → capture `metrics.before_suite.prom` → run `t0`–`t8` serially under DSH → capture `metrics.after_suite.prom` and post-suite `/props`/`/models`/`/slots`/`/health` → `extract_traces_dsh.py` → `score.py` → manual adjudication against `ground_truth.json`. The server was **not** restarted or reconfigured at any point.

## 2. Exact model / server configuration (unchanged)

Read-only probes of `http://192.168.68.52:8087` (server **not** restarted or modified):

| Item                       | Before                                                                         | After                           | Source                 |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------- | ---------------------- | ---- | -------- |
| Health                     | `{"status":"ok"}` (HTTP 200)                                                   | `{"status":"ok"}`               | `GET /health`          |
| Build                      | `b1-60081bb`                                                                   | `b1-60081bb`                    | `GET /props`           |
| Model alias / id           | `qwen3.8-27b-unsloth-ud-iq3xxs`                                                | `qwen3.8-27b-unsloth-ud-iq3xxs` | `/props`, `/v1/models` |
| Model path                 | `E:\LocalAI\models\qwen3.8-27b\unsloth\production\Qwen3.8-27B-UD-IQ3_XXS.gguf` | same                            | `/props`               |
| Quantization               | `IQ3_XXS - 3.0625 bpw`                                                         | same                            | `/props`, `/v1/models` |
| Context (`n_ctx`)          | **80,896**                                                                     | **80,896**                      | `/props`, `/v1/models` |
| Trained context            | `262,144`                                                                      | `262,144`                       | `/v1/models` (meta)    |
| Parameters / size          | `27,320,697,856` / `10,923,864,064` bytes                                      | same                            | `/v1/models` (meta)    |
| Vocab / embedding          | `n_vocab=248320` / `n_embd=5120`                                               | same                            | `/v1/models` (meta)    |
| Slots                      | `total_slots=1`, slot `id=0`                                                   | same                            | `/props`, `/slots`     |
| Vision                     | `modalities.vision=false`; `capabilities=["completion"]` (text-only)           | same                            | `/props`, `/v1/models` |
| Speculative decoding       | slot `speculative:true`; per-request `speculative.types="none,draft-mtp"`      | same                            | `/slots`               |
| Chat / reasoning (request) | `chat_format=peg-native`, `reasoning_format=deepseek`, `generation_prompt=<    | im_start                        | >assistant\n<think>\n` | same | `/slots` |
| Max predict (request)      | `n_predict=4096`                                                               | same                            | `/slots`               |
| Metrics endpoint           | `endpoint_metrics: true`                                                       | same                            | `/props`               |

Operator-supplied server configuration (not independently exposed by `/props`): the established production Unsloth launcher (`E:\LocalAI\production\scripts\start-qwen3.8-27b-unsloth-80k.ps1`) — the same established llama.cpp flags as the GSQ launcher **without mmproj** (KV cache `q8_0`, flash attention, GPU layers `99`, batch `512`, ubatch `128`, CPU threads `8`, MTP draft max `3`). **Observable confirmation of MTP:** `/slots` reports `speculative:true`, post-request params carry `draft-mtp`, and the `spec_decode_*` counters increment during the suite (§9). **Observable confirmation of the context:** `n_ctx=80896` was reported before and after the suite and `/v1/models` meta agrees. **Text-only:** `/props` and `/v1/models` both report no vision/multimodal capability, matching the production Unsloth profile (no mmproj).

Port **8087** was the only Qwen server active (alias/path/quant are Unsloth; no GSQ alias present). Ports **8081** (stale global entry) and **11434** (Ollama) were **not listening**.

**No restart between runs 3 and 4.** Every counter at the first pre-suite probe (`metrics.initial.prom`) equals the matrix-r3 OpenCode after-suite values (`prompt_tokens_total=141,131`, `tokens_predicted_total=41,589`, `n_tokens_max=40,061`, …), so the server was not restarted after run 3. The suite did not restart it.

## 3. Exact DSH configuration / invocation

| Item             | Value                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness          | DSH `@deepseek-ai/dsh` **0.1.5-rc.2** (`/Users/cortezashley/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh`)                                                  |
| DSH home         | `/Users/cortezashley/.dsh` — **`settings.yaml` unmodified** (sha256 `ac90d4e8294f0f9d3d2eefaf3828a39f84d7b984e35ccf1b5de8c1533c98e636`, unchanged before/after) |
| Profile          | `headless` (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`)                                                                                              |
| Provider         | `local-llama-cpp` → `http://192.168.68.52:8087/v1`                                                                                                              |
| Model label      | `local-llama-cpp/qwen3.8-27b-unsloth-ud-iq3xxs` (reasoning `low`, context 80896, maxTokens 32768)                                                               |
| Invocation       | `dsh --profile headless --patch <parity overlay> "<frozen prompt>"`                                                                                             |
| Approval policy  | `ask` with no headless answerer ⇒ **fail-closed**; escalation (`sandbox_permissions` + justification) also fail-closed                                          |
| Sandbox mode     | `workspace-write` (Seatbelt on macOS)                                                                                                                           |
| Shell timeout    | `timeoutMs=600000`, `maxTimeoutMs=600000`                                                                                                                       |
| Per-test wrapper | 2400 s `subprocess` timeout (recorded per record)                                                                                                               |

**Effective-configuration verification (`--dump-config`, exit 0).** The composed headless tree was inspected with the overlay applied. Confirmed:

- `tool-web` → **`disabled: true`** (matches OpenCode `webfetch: deny` / `websearch: deny`); the `web` / `web-search-deepseek` / `web-fetch-http` backends remain mounted but are **unreachable by the model** without `tool-web`.
- `bash-sandbox` → `timeoutMs: 600000`, `maxTimeoutMs: 600000` (composition entry). Independently, `~/.dsh/settings.yaml` already carries `shell.timeoutMs=600000` / `shell.maxTimeoutMs=600000`, so the **effective** shell policy is **600000 / 600000**.
- `sandbox-policy` → `mode: process.env.DSH_PERMISSION_MODE ?? 'workspace-write'` (runner exports `workspace-write`); `workspaceRoot: process.cwd()`.
- `approval` → policy `ask` (fail-closed with no answerer).
- `settings` (`@deepseek-ai/dsh-settings-file`) → `path` redirected to the run-specific settings copy (see below).

**Parity overlay (`<workspace>/dsh-parity.patch.yml`, sha256 `a0636def98f07bd84b318b07f4404cb6fdf743fd656656911012cc5d7eebaa41`), invocation-only:**

```yaml
- id: tool-web # removes web_search + web_fetch (matches OpenCode webfetch/websearch deny)
  disabled: true
- id: bash-sandbox # effective shell timeout 600000 / 600000 (settings.yaml already 600000)
  config:
    timeoutMs: 600000
    maxTimeoutMs: 600000
- id: settings # model selection (see "Model selection" below)
  config:
    path: <workspace>/dsh-settings.yaml
```

Relative to the matrix-r2 DSH parity overlay, the web-tool disable and the shell-timeout entry are identical; **the only addition is the `settings.path` redirect**, required because run 4 tests a different model than the one named in the production settings default. `~/.dsh` was **not** edited; the overlay is passed with `--patch` per run.

**Model selection (run-specific, non-persistent).** DSH's headless profile has no `--model` flag and resolves the model from the settings layer, which _overrides_ composition/`--patch` config (the `agent-default-model` composition entry is only the base). The production `~/.dsh/settings.yaml` still defaults to `local-llama-cpp/qwen3.8-27b-gsq-rco` (set for matrix run 2). To select the Unsloth model without modifying production configuration, the overlay redirects the `@deepseek-ai/dsh-settings-file` provider to a **run-specific copy** of the settings document (`<workspace>/dsh-settings.yaml`, sha256 `410f4de131f0942ff1df2abf2cbc01ef83983be7b45a79fc6985f15862c283aa`) whose only difference is `agent-default-model.model = qwen3.8-27b-unsloth-ud-iq3xxs`. The production file's bytes are unchanged (`ac90d4e8…`, re-verified after the suite).

**Model-identity confirmation.** (1) A pre-suite smoke (`dsh --profile headless --patch <overlay>` on a throwaway dir) returned `qwen3.8-27b-unsloth-ud-iq3xxs` and its system prompt read _"You are a coding agent powered by the qwen3.8-27b-unsloth-ud-iq3xxs model."_ (2) The `t0` session's `request/header` records `{"provider":"local-llama-cpp","model":"qwen3.8-27b-unsloth-ud-iq3xxs","reasoningEffort":"low","maxTokens":32768}` and `request/context` records `contextWindow: 80896`. (3) `t0` self-identifies as `qwen3.8-27b-unsloth-ud-iq3xxs`.

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; provisioned deterministically via `git archive` of `a07d38e` with the eval directory excluded (`excluded_present_in_ref: false`), 338 tracked files, tree `feca1f64…`; all 9 clones validated `ok / clean=True / deps_is_symlink=false` at baseline HEAD before the run.
- Prompt manifest: all nine prompts matched SHA-256 **and** byte length (`ok: true`); hashes recorded in `manifest.json`, `prompt.verification.json`, and every `results.jsonl` record.
- DSH config verification: `ok: true`; `tool-web.disabled`, the shell timeouts, the sandbox mode, the approval policy, and the settings redirect were verified via `--dump-config` before any model call.
- The application source, prompts, `ground_truth.json`, `prompt_manifest.json`, `runner.py`, `extract_traces.py`, and `score.py` were used verbatim and not modified. `runner_dsh.py` and `extract_traces_dsh.py` are the pre-existing untracked DSH adapters (unchanged).

## 5. Per-test results (t0–t8)

Token columns are **per-test llama.cpp `/metrics` counter deltas** (measured; `prompt_tokens_total` and `tokens_predicted_total` around each test interval). They exactly tile the suite interval (§8). Runtime is the runner wall-clock per test. Every session matched its clone directory exactly (`match=exact`); every clone started clean at baseline HEAD and ended clean. `rc=0` throughout. **Zero timeouts.**

| #   | Automated | Adjudicated | Runtime (s) | Input tok | Output tok | Timeout |       Commits | Tools | Validator invoked                                | Notes                                                                                           |
| --- | --------- | ----------- | ----------: | --------: | ---------: | ------- | ------------: | ----: | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| t0  | Pass      | Pass        |        20.9 |     7,902 |        305 | No      |             0 |     0 | none                                             | Exact model id + cwd, no tools                                                                  |
| t1  | Pass      | Pass        |        36.6 |     8,230 |      1,064 | No      |             0 |     4 | none                                             | Correct path `docs/domain-model.md` + 205 lines; no Git/modification                            |
| t2  | Pass      | Pass        |       369.8 |    23,007 |     11,747 | No      | 1 (`7b10ec6`) |    24 | `npx prettier --check`                           | One scoped docs edit + validator + diff review + one commit                                     |
| t3  | Pass      | Pass        |        59.0 |     8,919 |      2,127 | No      |             0 |     1 | none                                             | Correct 11 PinPal paths (32 grep matches across 11 files)                                       |
| t4  | Pass      | Pass        |       554.2 |    24,110 |     16,862 | No      |             0 |    25 | `prettier --check` (repo binary)                 | Verdict "the claim is FALSE"; no change warranted; `git diff --check`/`--staged` run; no change |
| t5  | Pass      | Pass        |       169.8 |    14,021 |      5,606 | No      |             0 |    10 | `npm run format:check`                           | Strict ordered no-op: validator run, pre-existing classified, tree/diff reviewed, **no commit** |
| t6  | Pass      | Pass        |        79.0 |    14,603 |      2,106 | No      |             0 |     8 | `npm run format:check`                           | Validator identified/run/reported                                                               |
| t7  | **Fail**  | **Fail**    |       292.7 |    19,339 |      9,447 | No      |             0 |    19 | `markdownlint` (external, **network-installed**) | Used the wrong validator; neither execution was the repository validator                        |
| t8  | Pass      | Pass        |        61.7 |    10,085 |      1,218 | No      |             0 |     5 | `npm run check` (includes `format:check`)        | Bogus commands reported accurately; recovered with `npm run check` + `git status`               |

Totals: 9 tests; suite input **130,216** tok, output **50,482** tok; sum of runtimes **1,643.7 s**. Zero timeouts. `7b10ec6` (t2) is the expected single scoped commit (`docs/domain-model.md | 1 insertion, 1 deletion`).

> **Token-basis note.** The matrix-r2 report's §5 token columns were DSH per-step session sums; this report uses the per-test llama.cpp counter deltas, which are directly measured and tile the suite exactly. The two bases are not equal and cross-report token totals are not directly comparable (the server counters include DSH title-LLM calls and exclude cache hits).

## 6. Adjudication

- **Automated (frozen scorer): 8 Pass / 1 Fail** — Pass `t0,t1,t2,t3,t4,t5,t6,t8`; Fail `t7`.
- **Adjudicated: 8 Pass / 1 Fail** — identical; no scorer false positives/negatives were found this run.

| #   | Auto | Adj  | Exact reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t4  | Pass | Pass | Genuine. The model delivered the correct verdict — _"Verdict: the claim is FALSE in this repository"_ — and an explicit no-change determination — _"No documentation change is warranted, and no files were modified"_ — ran the repository Prettier (`./node_modules/.bin/prettier --check`), `git diff --check`, and `git diff --staged`, and modified nothing. Unlike the matrix-r3 OpenCode run (output-budget exhaustion; no verdict), this run completed the task.                                                                                                                                                          |
| t5  | Pass | Pass | Genuine. The strict ordered no-op was performed correctly: `npm run format:check` run (FAIL, `docs/domain-model.md`), failure **classified pre-existing** (clean tree at start, byte-identical to the sole baseline commit), working tree/diff reviewed with Git, and **no commit** (`t5.no_commit` met; 0 commits). This is the first matrix run — DSH or OpenCode — where t5 did not over-reach.                                                                                                                                                                                                                                |
| t7  | Fail | Fail | Genuine relative to the frozen requirement. The task requires the **repository's** Markdown validator (`npm run format:check` / `prettier`) run twice, each execution reported separately. The model correctly concluded the repo ships no dedicated markdownlint, then — instead of the repo's Prettier — **installed `markdownlint-cli` from the npm registry** and ran it twice. `t7.validator_twice` (critical) and `t7.separate_outputs` are unmet. `git status` ran and nothing was modified. Same frozen-requirement failure mode as the matrix-r2 DSH run, but this run actually completed the external install (see §7). |
| t8  | Pass | Pass | Genuine this run. Both bogus commands were run and reported accurately (`npm run markdownlint` → `Missing script`; `git statuss` → `not a git command`), and the recovery used **`npm run check`**, whose nested chain includes `format:check` with corroborating captured output, plus the correct `git status`. `t8.recovery_validation` credited. **Caveat:** credit came via the umbrella `npm run check`, not the literal `npm run format:check`; same caveat recorded for DSH matrix run 2 and OpenCode matrix run 3.                                                                                                       |

All 27 common requirements (`common.prompt_verified`, `common.baseline_head`, `common.clean_before`, i.e. 3 × 9) **passed** for every test.

## 7. Permission / tool surface and network

- **Web tools absent:** `web_search`/`web_fetch` did not appear in any session trace (tool counts: `bash`, `read`, `edit`, `grep`, `glob` only). Verified by `--dump-config` (`tool-web.disabled: true`) and by the absence of any `web_*` tool part in `raw_parts.jsonl`.
- **Permission denials:** **zero** (`permissions.json` → every test `count: 0`). DSH `workspace-write` permits `/tmp` and the clone-local `.eval-tmp`; the t7 `mktemp` to the system temp dir was denied by the Seatbelt sandbox (fail-closed, no escalation attempted), after which the model wrote only under the git-excluded `.eval-tmp/`.
- **Network — ONE egress occurred (t7).** The runner exported `npm_config_offline=true`, and `t5`'s `no_network` requirement passed. However, in **t7** the model probed the network (`node -e "fetch('https://registry.npmjs.org/markdownlint-cli')"` → `NET OK 200`) and then deliberately **overrode the offline setting** (`npm_config_offline=false npm install --prefix .eval-tmp/mdlint-93125 --cache <tmp> markdownlint-cli`) which succeeded (`added 74 packages in 2s`). This is a **real network egress and a deliberate circumvention of the exported offline mode**; it is the same class of DSH limitation noted in matrix run 2 ("DSH has no network-policy knob — bash-level `curl`/`wget` remain possible"), but unlike r2 (where `npx --no-install` failed `ENOTCACHED`) the download completed here. No `web_search`/`web_fetch` tool was involved. Recorded as an anomaly and evidence-capture caveat (see §13, §14).

## 8. Prompt / generation throughput

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Quantity                                           | Value          |
| -------------------------------------------------- | -------------- |
| Prompt tokens processed (non-cached)               | **130,216**    |
| Prompt tokens served from cache                    | **1,255,630**  |
| Prompt processing time                             | **255.284 s**  |
| **Prompt tok/s (derived = 130,216 / 255.284)**     | **510.08**     |
| Generated tokens                                   | **50,482**     |
| Generation time                                    | **1,286.39 s** |
| **Generation tok/s (derived = 50,482 / 1,286.39)** | **39.24**      |
| `n_decode_total` (excluding speculative)           | **17,606**     |

The server gauges `prompt_tokens_seconds` / `predicted_tokens_seconds` read **0** at the after-suite capture (they are live throughput gauges and read zero once the server is idle); the derived values above are therefore reported as the primary throughput figures.

## 9. MTP / speculative-decoding metrics

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Metric                                                          | Value                                           |
| --------------------------------------------------------------- | ----------------------------------------------- |
| Verification steps (`spec_decode_num_drafts_total`)             | **17,130**                                      |
| Draft tokens generated (`spec_decode_num_draft_tokens_total`)   | **51,381** (= 2.999 per step; draft max 3)      |
| Draft tokens accepted (`spec_decode_num_accepted_tokens_total`) | **33,346**                                      |
| **Draft acceptance rate (derived)**                             | **64.90%**                                      |
| **Mean accepted tokens per verification step (derived)**        | **1.9466** (≈ 0.947 extra tokens/step from MTP) |
| Accepted at draft position 0 / 1 / 2                            | 13,606 / 10,874 / 8,866                         |

MTP is active and materially productive: each decode step yields ~1.95 accepted tokens instead of 1.

## 10. Maximum context occupancy

| Quantity                                                               | Value                    |
| ---------------------------------------------------------------------- | ------------------------ |
| `n_tokens_max` (largest prompt+generation sequence observed, absolute) | **40,786**               |
| Pre-suite `n_tokens_max` (after smoke)                                 | 40,061                   |
| `n_ctx`                                                                | **80,896**               |
| Occupancy                                                              | **50.42% of the window** |
| Tests approaching/exceeding the validated ~80K occupancy               | **none**                 |

The suite's workload peak (40,786) is well below the configured window. The run confirms the server was _configured_ for 80,896 and ran the frozen suite cleanly at ~50% occupancy; it provides **no evidence** about reliability or throughput at the ~80K operating point. This is expected for a 9-task coding suite and is reported as a limitation.

## 11. Timeout / runtime behavior

| Quantity                                                          | Value                  |
| ----------------------------------------------------------------- | ---------------------- |
| Per-test timeout                                                  | 2400 s                 |
| Tests timed out                                                   | **0 / 9**              |
| Sum of per-test durations                                         | **1,643.7 s**          |
| Continuous suite wall-clock (t0 start 21:53:55 → t8 end 22:21:41) | **1,666 s = 27.8 min** |

Per-test runtimes: t0 20.9, t1 36.6, t2 369.8, t3 59.0, t4 554.2, t5 169.8, t6 79.0, t7 292.7, t8 61.7 s — all far below the 2400 s wrapper. The longest tests (t4 554.2 s, t2 369.8 s, t7 292.7 s) were driven by step/tool volume, not decode stalls.

## 12. Comparison

### 12.1 Scores (same model, same file, same 80,896 window, frozen suite)

| Run                               | Model                  | Context    | Engine   | Automated             | Adjudicated         |
| --------------------------------- | ---------------------- | ---------- | -------- | --------------------- | ------------------- |
| 8087 OpenCode (prior, Sep-21)     | Unsloth UD IQ3_XXS     | 80,896     | OpenCode | 6/3 — fail `t4,t5,t7` | 7/2 — fail `t5,t7`  |
| 80K OpenCode (matrix r3)          | Unsloth UD IQ3_XXS     | 80,896     | OpenCode | 7/2 — fail `t4,t5`    | 7/2 — fail `t4,t5`  |
| **80K DSH (this run, matrix r4)** | **Unsloth UD IQ3_XXS** | **80,896** | **DSH**  | **8/1 — fail `t7`**   | **8/1 — fail `t7`** |

Per-test agreement between matrix runs 3 and 4 (same model, same window, different orchestration harness):

| #   | OpenCode r3 (adj)                   | DSH r4 (adj)                             | Same? |
| --- | ----------------------------------- | ---------------------------------------- | ----- |
| t0  | Pass                                | Pass                                     | ✓     |
| t1  | Pass                                | Pass                                     | ✓     |
| t2  | Pass                                | Pass                                     | ✓     |
| t3  | Pass                                | Pass                                     | ✓     |
| t4  | **Fail** (output-budget exhaustion) | **Pass**                                 | ✗     |
| t5  | **Fail** (committed a reformat)     | **Pass** (no commit)                     | ✗     |
| t6  | Pass                                | Pass                                     | ✓     |
| t7  | **Pass** (repo Prettier ×2)         | **Fail** (external network markdownlint) | ✗     |
| t8  | Pass (`npm run check`)              | Pass (`npm run check`)                   | ✓     |

Adjudicated aggregate moved 7/2 → **8/1** on a single run; three cards moved (`t4` up, `t5` up, `t7` down). Not established as statistically significant.

### 12.2 Performance (measured / derived)

| Metric                     | 80K OpenCode (matrix r3) | **80K DSH (matrix r4)** |
| -------------------------- | -----------------------: | ----------------------: |
| Prompt tok/s (derived)     |                   509.40 |              **510.08** |
| Generation tok/s (derived) |                    39.19 |               **39.24** |
| `n_decode_total`           |                   15,230 |              **17,606** |
| `n_tokens_max`             |                   40,061 |              **40,786** |
| Prompt tokens (non-cached) |                  132,755 |             **130,216** |
| Generated tokens           |                   41,468 |              **50,482** |
| Sum of test durations      |                1,400.9 s |           **1,643.7 s** |
| MTP acceptance rate        |                   60.16% |              **64.90%** |
| Mean accepted/step         |                    1.805 |               **1.947** |

Prompt and generation throughput are essentially unchanged from matrix r3 (510.08 vs 509.40; 39.24 vs 39.19 tok/s). DSH r4 generated more tokens and ran longer overall, with a higher MTP acceptance rate over a different prompt/step mix.

## 13. DSH vs OpenCode behavior differences (comparison-critical)

1. **Orchestration harness differs by construction.** DSH exposes a different model-facing tool surface (`read`/`write`/`edit`/`grep`/`glob`/`bash` plus DSH-only `subagent`/`workflow`/`code-runtime`/`skill`/`goal`/`todo`/jobs). In this run the model used only `bash`/`read`/`edit`/`grep`/`glob` — no DSH-only execution tool was exercised.
2. **Token accounting basis differs.** Matrix r3 reported OpenCode session step sums; matrix r4 reports per-test llama.cpp counter deltas. Cross-harness token totals are not directly comparable.
3. **t5 moved Fail → Pass.** OpenCode r3 and DSH r2 both committed a Prettier reformat in the strict no-op task; DSH r4 did **not** commit. This is a **model-behavior** difference on a single run (web tools are irrelevant to t5), most plausibly run-to-run non-determinism. It is one of two cards that moved **up**.
4. **t4 moved Fail → Pass.** OpenCode r3's t4 failed because the final step exhausted the 4,096-token output budget mid-reasoning and never delivered a verdict or the required `git diff` reviews. DSH r4 delivered the full verdict + no-change determination and both diff reviews. Model-behavior/step-budget difference on a single run.
5. **t7 moved Pass → Fail.** OpenCode r3 selected the repository's own Prettier (`npx prettier --check`) and passed; DSH r4 selected external `markdownlint-cli` and failed. **This is the only card that moved down.**
6. **Network egress (t7).** The most notable behavioral difference from matrix r2: r2's external-markdownlint attempt failed `ENOTCACHED` (no download); r4's model deliberately overrode `npm_config_offline=true` and downloaded `markdownlint-cli` from the registry. The parity overlay disables the _web tools_ but cannot disable bash-level network; this is a known DSH limitation (r2 §7) that was actually exercised here. Recorded as an anomaly.
7. **Permission surface.** DSH `workspace-write` granted clone-local writes and denied the system temp dir (`mktemp` fail-closed), with no escalation attempted; zero permission denials overall.
8. **Runtime length.** DSH r4 ran longer overall (1,666 s vs 1,425 s) and t4 in particular was much longer (554.2 s vs 228.4 s), consistent with more exploratory bash steps.

## 14. Interpretation and limitations

1. **The suite does not exercise ~80K occupancy (dominant limitation).** Peak sequence was 40,786 tokens (50.42% of 80,896). The run validates the server _configured_ at ~80K run under DSH, not the ~80K _operating point_.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite score. The t4/t5/t7 movements vs OpenCode r3 are single-run observations.
3. **Network egress in t7 (evidence caveat).** The model accessed `registry.npmjs.org` and installed a package after overriding `npm_config_offline=true`. No `web_search`/`web_fetch` tool was involved, and no configuration was changed, but "no network access" was **not** strictly maintained by the model in t7. Any strict reading of the "no network" expectation must treat t7 (and the environment's bash-network capability) accordingly.
4. **t7 is a genuine frozen-requirement failure** (used an external network-installed markdownlint instead of the repository validator). `t7.validator_twice` is critical.
5. **t8 credit caveat.** `t8.recovery_validation` was credited via `npm run check` (nested `format:check` with corroborating output). A strict adjudicator could keep t8 a fail if only the literal `npm run format:check` is accepted.
6. **Suite-level metrics only** for throughput/MTP; per-test throughput is derived from the per-test `/metrics` snapshots.
7. **Memory/paging not observable.** Only indirect stability evidence is reported (§15).
8. **`config.verification.json` note string is generic.** The DSH adapter writes a static note ("DSH uses ~/.dsh/settings.yaml (unmodified)…"). That statement is true of the _production_ file, but this run additionally used an invocation-only `settings.path` redirect to select the Unsloth model; the note does not describe the redirect. Recorded here for accuracy; the adapter was not modified.

## 15. Server-integrity evidence (no restart)

| Counter (measured)                      |   initial | before-suite | after-suite | monotonic |
| --------------------------------------- | --------: | -----------: | ----------: | --------- |
| `prompt_tokens_total`                   |   141,131 |      148,294 |     278,510 | ✔         |
| `prompt_tokens_cached_total`            | 1,170,500 |    1,170,500 |   2,426,130 | ✔         |
| `prompt_seconds_total`                  |   273.556 |      285.246 |     540.530 | ✔         |
| `tokens_predicted_total`                |    41,589 |       41,784 |      92,266 | ✔         |
| `tokens_predicted_seconds_total`        | 1,060.390 |    1,063.910 |   2,350.300 | ✔         |
| `n_decode_total`                        |    15,294 |       15,376 |      32,982 | ✔         |
| `n_tokens_max` (max, absolute)          |    40,061 |       40,061 |      40,786 | ✔         |
| `spec_decode_num_drafts_total`          |    14,832 |       14,891 |      32,021 | ✔         |
| `spec_decode_num_draft_tokens_total`    |    44,496 |       44,673 |      96,054 | ✔         |
| `spec_decode_num_accepted_tokens_total` |    26,775 |       26,908 |      60,254 | ✔         |

The initial counters equal the matrix-r3 OpenCode run's after-suite counters, confirming the server was **not** restarted between run 3 and run 4. The interval `initial → before-suite` is the pre-suite model-identity smoke (prompt +7,163, predicted +195). Server identity was identical before and after the suite: build `b1-60081bb`, model path unchanged, `n_ctx=80896` (both `/props` and `/v1/models` meta), model id `qwen3.8-27b-unsloth-ud-iq3xxs`, `endpoint_metrics:true`, `total_slots=1`, slot `id=0`, `speculative:true`, `vision:false`. **No configuration change** was made at any point.

## 16. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r4-dsh/` (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`, `config.verification.json`, `dsh-parity.patch.yml`, `dsh-settings.yaml`, `dsh.dump-config.txt`, `baseline.meta.json`, `baseline.validation.json`, `clones.validation.json`, `server.health.json`, `server.props.json`, `server.models.json`, `server.slots.json`, `server.health.after_suite.json`, `server.props.after_suite.json`, `server.models.after_suite.json`, `server.slots.after_suite.json`, `metrics.initial.prom`, `metrics.pre_smoke.prom`, `metrics.before_suite.prom`, `metrics.after_suite.prom`, `smoke/`, `runner.log`, `runner.err.log`, `runner.pid`, `status.json`, `harness.head.txt`).
- **Results:** `…/results/qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r4-dsh/` (`results.jsonl`, `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`, `tN.out/err/log`).
- **Prior artifacts untouched:** the matrix-r1/r2/r3 workspaces and reports, the prior Unsloth 8087 workspace, and all earlier workspaces retain their original contents; this run wrote only to the new `…-matrix-r4-dsh` workspace and this report.
- **Frozen harness/scorer:** HEAD remains `48d9b54f…`; tracked harness, scorer, and prompt files show no diff (only the two pre-existing untracked DSH adapters appear); prompts/scorer/baseline were used verbatim; the baseline rebuilt deterministically at `ef91057c…` (tree `feca1f64…`).
- **Repository integrity:** no staging, commit, push, reset, or other Git state change; main repository HEAD remains `48d9b54f…`. Pre-existing uncommitted application-source changes (tracked `ARCHITECTURE.md`, `README.md`, `convex/http.ts`, `worker/README.md`, `worker/src/index.js`; untracked `convex/health.ts`, `convex/lib/health.ts`, `worker/src/health.js`, `tests/health/`) were present before the run and were **not** touched. The only new repository artifact is this report.
- **DSH configuration:** `~/.dsh/settings.yaml` **unmodified** (sha256 `ac90d4e8…` before and after); the headless profile's `cordis.patch.yml` unchanged (`tool-web` disabled only); the parity overlay and settings copy are workspace-local and invocation-only. DSH rewrites the profile root `cordis.yml` on each launch (shipped empty template; content unchanged) — this is normal DSH behavior, not configuration drift.
- **Baseline/clones clean:** baseline and all nine clones report a clean working tree; `t2` carries exactly the one expected commit (`7b10ec6`), all other clones zero commits.

**Nothing was committed. The next matrix run (run 5) was not started. The 8087 model was not switched to GSQ.**

---

### Required summary

- **Matrix position:** **Run 4 of 6** — `Unsloth UD-IQ3_XXS 80K × DSH`.
- **Automated score:** **8 Pass / 1 Fail** (Fail `t7`).
- **Adjudicated score:** **8 Pass / 1 Fail** (Fail `t7`).
- **Per-test result table:** §5.
- **Total runtime:** **1,666 s (27.8 min)** continuous suite wall-clock; sum of test durations **1,643.7 s**.
- **Prompt tok/s:** **510.08** (non-cached, derived).
- **Generation tok/s:** **39.24** (derived).
- **MTP acceptance:** **64.90%** (mean **1.9466** accepted tokens/verification step; 2.999 draft/step).
- **Maximum actual token occupancy:** **40,786** tokens (`n_tokens_max`; **50.42%** of the 80,896 window). No test approached or exceeded the validated ~80K occupancy.
- **Anomalies:** zero timeouts; zero permission denials; **one network egress (t7)** — the model overrode `npm_config_offline=true` and installed `markdownlint-cli` from the npm registry; no restarts; no configuration changes; no `robinhood` usage.
- **Key DSH-vs-OpenCode differences:** t4 moved Fail→Pass (r3 output-budget exhaustion); t5 moved Fail→Pass (r4 did not commit the no-op); t7 moved Pass→Fail (r4 used external network-installed markdownlint instead of the repo Prettier). See §13.
- **Report path:** `docs/development/model-reliability/qwen38-27b-unsloth-ud-iq3xxs-80k-80896-matrix-r4-dsh-frozen-harness-evaluation.md`.
