# GPT-OSS 20B (Ollama `gpt-oss:20b-122880`, 122,880 context) — **DSH** Frozen-Harness Reliability Evaluation — **Matrix Run 6 of 6**

**Date:** 2026-09-24
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the read-only server probes, the frozen suite run, trace extraction, scoring, adjudication, and this report.
**Matrix position:** **Run 6 of 6** — `GPT-OSS 20B × DSH`
**Execution / orchestration harness under test:** **DSH (DeepSeek Harness)** `@deepseek-ai/dsh@0.1.5-rc.2`
**Model under test (downstream):** `gpt-oss:20b-122880` (Ollama model derived from source `gpt-oss:20b` with `PARAMETER num_ctx 122880`)
**Provider / endpoint:** DSH provider `local-ollama` → `http://192.168.68.52:11434/v1` (Ollama `0.33.2`, OpenAI-compatible `/v1`)
**DSH model label:** `local-ollama/gpt-oss:20b-122880` (contextWindow `122880`, maxTokens `8192`)
**Harness commit (frozen):** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`, 338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`; all hashes + byte lengths verified)
**Per-test timeout:** 2400 s (wrapper; recorded in `manifest.json` and every `results.jsonl` record)
**Variant label:** `gpt-oss-20b-122880-matrix-r6-dsh`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/gpt-oss-20b-122880-matrix-r6-dsh`

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are task-level evidence from a single evaluation run, not a statistical measurement. No composite score or ranking is produced, and no single-run difference is treated as statistically significant.
>
> **Measured vs. derived.** _Measured_ values are read directly from harness/session records or the Ollama API. _Derived_ values are arithmetic over measured values (tok/s, percentages). Each is labelled below.
>
> **Ollama metric limitation.** Ollama `0.33.2` exposes **no `/metrics` endpoint** (`GET /metrics` → HTTP 404) and its OpenAI-compatible `/v1` path returns no prompt-eval/generation durations. The llama.cpp-style suite-wide `prompt_tokens_seconds` / `predicted_tokens_seconds` gauges and `spec_decode_*` counters are therefore **not available** for this run (the DSH adapter's per-test counter snapshots record only `HTTP Error 404: Not Found`). Throughput below is derived from DSH session records and wall-clock only, and is labelled as a proxy. This is the same limitation documented for matrix run 5 (GPT-OSS × OpenCode).
>
> **Scope note.** This run validates the **`gpt-oss:20b-122880`** model at its configured **`n_ctx = 122,880`** window, run under **DSH** with the web tools removed and the 600,000 ms shell budget preserved. The frozen suite did **not** drive the window far: the largest sequence observed was **26,720 tokens (21.75% of the window)**. The frozen prompts, `ground_truth.json`, `prompt_manifest.json`, scorer, and baseline were used verbatim.

---

## 1. Provenance

| Item                      | Value                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Suite                     | `opencode-t0-t8` (frozen `ground_truth.json`)                                                           |
| Matrix position           | **6 of 6** (`GPT-OSS 20B × DSH`)                                                                        |
| Harness commit (used)     | `48d9b54f249cd461f5456202f225bbddd156fdf9`                                                              |
| Harness working tree      | tracked harness/scorer/prompt files clean (no diff); only pre-existing _untracked_ DSH adapters present |
| Baseline HEAD             | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`                                                              |
| Baseline source ref       | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`                                                              |
| Baseline tree             | `feca1f64fa1f9479f42b0745968ccf41f647d870`                                                              |
| Tracked files in baseline | 338                                                                                                     |
| Prompt verification       | `ok: true` — all `t0`–`t8` SHA-256 **and** byte length match                                            |
| Run interval              | provisioning `2026-09-24T01:41:12Z`; suite `2026-09-24T01:41:20Z` → `2026-09-24T01:49:13Z`              |
| Engine                    | DSH adapter (`runner_dsh.py` → `extract_traces_dsh.py` → `score.py`); `runner.py` (OpenCode) untouched  |
| Timeout                   | 2400 s/test (runner default; recorded in `manifest.json` and every `results.jsonl` record)              |
| Application source        | untouched by this run; pre-existing uncommitted changes present before and after, unchanged             |

Run sequence: read-only server probes → fresh workspace + parity overlay → `--dump-config` verification → **pre-suite DSH→Ollama model-identity smoke** → capture pre-suite `/api/ps`/`/api/show`/`/api/tags`/`/api/version` → provision the sanitized baseline + 9 clones → run `t0`–`t8` serially under DSH → capture post-suite `/api/ps`/`/api/show`/`/api/tags`/`/api/version` → `extract_traces_dsh.py` → `score.py` → manual adjudication against `ground_truth.json`. The Ollama server was **not** restarted or reconfigured at any point.

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

The source model `gpt-oss:20b` remains unchanged (`parameters: temperature 1` only; no `num_ctx`), and the global Ollama default (`OLLAMA_CONTEXT_LENGTH=65536`) was **not** altered. The 122,880 window is supplied **only** by the derived model tag `gpt-oss:20b-122880`. **Observable confirmation of the context:** `/api/ps` reported `context_length=122880` before and after the suite, and the DSH smoke request against the tag loaded the instance at 122,880. The suite did not restart the server.

## 3. Exact DSH configuration / invocation

| Item             | Value                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness          | DSH `@deepseek-ai/dsh` **0.1.5-rc.2** (`/Users/cortezashley/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh`)                                                  |
| DSH home         | `/Users/cortezashley/.dsh` — **`settings.yaml` unmodified** (sha256 `ac90d4e8294f0f9d3d2eefaf3828a39f84d7b984e35ccf1b5de8c1533c98e636`, unchanged before/after) |
| Profile          | `headless` (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`)                                                                                              |
| Provider         | `local-ollama` → `http://192.168.68.52:11434/v1`                                                                                                                |
| Model label      | `local-ollama/gpt-oss:20b-122880` (context 122880, maxTokens 8192)                                                                                              |
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

**Parity overlay (`<workspace>/dsh-parity.patch.yml`, sha256 `6647c0a0a7ddbcf7d387cb84a7bdf3997702695cde755b9a06ee2c8aa6c161ac`), invocation-only:**

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

Relative to the matrix-r2/r4 DSH parity overlays, the web-tool disable and the shell-timeout entry are identical; **the `settings.path` redirect selects the model under test**. `~/.dsh` was **not** edited; the overlay is passed with `--patch` per run.

**Model selection (run-specific, non-persistent).** DSH's headless profile has no `--model` flag and resolves the model from the settings layer, which _overrides_ composition/`--patch` config (the `agent-default-model` composition entry is only the base). The production `~/.dsh/settings.yaml` still defaults to `local-llama-cpp/qwen3.8-27b-gsq-rco` and declares `local-ollama` only for the source tag `gpt-oss:20b`. To select the derived tag without modifying production configuration, the overlay redirects the `@deepseek-ai/dsh-settings-file` provider to a **run-specific copy** of the settings document (`<workspace>/dsh-settings.yaml`, sha256 `c523b5d440db268e7b89b2ea40c2927f2165a07db136ef4c7bda7e89c942dc54`). The production file's bytes are unchanged (`ac90d4e8…`, re-verified after the suite).

Two run-local deltas to the `local-ollama` route were required to reach Ollama under DSH (recorded for accuracy; the production file was not touched):

1. Added the derived model id `gpt-oss:20b-122880` (contextWindow `122880`, maxTokens `8192`) to the route's `models` list, and set `agent-default-model: {provider: local-ollama, model: gpt-oss:20b-122880}`. `reasoningEffort` was omitted (the production `local-ollama` route declares no reasoning capability; omitting it matches the run-5 OpenCode configuration, which set no reasoning effort).
2. Added `apiKeyEnv: LOCAL_OLLAMA_API_KEY` to the `local-ollama` route. A hand-declared `openai-completions` route is keyless by default and DSH refuses it (`PI_AI_ERROR: No API key for provider: local-ollama`); the reference is resolved from an environment variable exported for the run and Ollama ignores the value. No secret is stored in the config.

**Model-identity confirmation.** (1) A pre-suite smoke (`dsh --profile headless --patch <overlay>` on a throwaway dir) returned exactly `gpt-oss:20b-122880`. (2) The `t0` session's `request/header` records `{"provider":"local-ollama","model":"gpt-oss:20b-122880","maxTokens":8192}` and `request/context` records `contextWindow: 122880`. (3) `t0` self-identifies as `gpt-oss:20b-122880`.

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; provisioned deterministically via `git archive` of `a07d38e` with the eval directory excluded (`excluded_present_in_ref: false`), 338 tracked files, tree `feca1f64…`; all 9 clones validated `ok / deps_is_symlink=false` at baseline HEAD before the run.
- Prompt manifest: all nine prompts matched SHA-256 **and** byte length (`ok: true`); hashes recorded in `manifest.json`, `prompt.verification.json`, and every `results.jsonl` record.
- DSH config verification: `ok: true`; `tool-web.disabled`, the shell timeouts, the sandbox mode, the approval policy, and the settings redirect were verified via `--dump-config` before any model call.
- The application source, prompts, `ground_truth.json`, `prompt_manifest.json`, `runner.py`, `extract_traces.py`, and `score.py` were used verbatim and not modified. `runner_dsh.py` and `extract_traces_dsh.py` are the pre-existing untracked DSH adapters (unchanged).

## 5. Per-test results (t0–t8)

Token columns are sums of per-step session `usage` values from DSH `assistant/message` records (measured; each step's `inputTokens` is the full context re-sent, so input is cumulative). Runtime is the runner wall-clock per test. Every session matched its clone directory exactly (`match=exact`); every clone started clean at baseline HEAD and ended clean. `rc=0` throughout. **Zero timeouts.**

| #   | Automated | Adjudicated | Runtime (s) | In tok (cum.) | Out tok | Steps | Tools |       Commits | Timeout | Notes                                                                                 |
| --- | --------- | ----------- | ----------: | ------------: | ------: | ----: | ----: | ------------: | ------- | ------------------------------------------------------------------------------------- |
| t0  | Pass      | Pass        |         6.6 |         6,067 |     190 |     1 |     0 |             0 | No      | Exact model id + cwd, no tools                                                        |
| t1  | Pass      | Pass        |        13.5 |        34,874 |     464 |     5 |     4 |             0 | No      | Correct path + 205 lines; no Git/modification                                         |
| t2  | **Fail**  | **Fail**    |        81.9 |       248,402 |   2,043 |    22 |    21 | 1 (`ad04c01`) | No      | Scoped docs edit + one commit, but no repo validator and no `git diff` review         |
| t3  | Pass      | Pass        |        22.8 |        13,221 |   1,164 |     2 |     1 |             0 | No      | Correct 11 PinPal files (32 matches)                                                  |
| t4  | **Fail**  | **Fail**    |        70.3 |       282,954 |   2,031 |    22 |    21 |             0 | No      | Correct verdict/no-change, but no `git diff --check` / `--staged` (and no validator)  |
| t5  | Pass      | Pass        |       112.9 |       372,904 |   2,278 |    18 |    17 |             0 | No      | Strict ordered no-op: validator run, pre-existing classified, no commit               |
| t6  | Pass      | Pass        |        19.2 |        43,985 |     544 |     6 |     5 |             0 | No      | Validator identified/run/reported                                                     |
| t7  | **Fail**  | **Fail**    |        85.1 |       310,626 |   1,663 |    17 |    16 |             0 | No      | Never ran the repo validator or `git status`; tried external `markdownlint` (offline) |
| t8  | Pass      | Pass        |        47.5 |        44,432 |   1,468 |     6 |     5 |             0 | No      | Bogus commands reported accurately; recovered with `npm run check` + `git status`     |

Totals: 9 tests; session input **1,357,465** tok (cumulative), output **11,845** tok; steps **99**; tool parts **90**; sum of runtimes **459.8 s**. `ad04c01` (t2) is the expected single scoped commit (`docs/domain-model.md | 1 insertion, 1 deletion`); all other clones ended with zero commits and clean. "Tools" counts every tool part, including `invalid` parts where the model attempted an unavailable tool.

## 6. Adjudication

- **Automated (frozen scorer): 6 Pass / 3 Fail** — Pass `t0,t1,t3,t5,t6,t8`; Fail `t2,t4,t7`.
- **Adjudicated: 6 Pass / 3 Fail** — identical; **no scorer false positives and no scorer false negatives** were found this run.

| #   | Auto | Adj      | Exact reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| t2  | Fail | **Fail** | Genuine. The model made a scoped `docs/domain-model.md` edit, ran `npm run typecheck`, `npm run lint`, and `npm run test:import`, created exactly one commit (`ad04c01`), and left the tree clean. But it **never ran the repository Markdown validator** (`npm run format:check` / `prettier`) — `t2.validator_run` unmet — and **never reviewed the diff with Git** (only `git status`; no `git diff`) — `t2.diff_reviewed` unmet. Both are critical.                                                                                                            |
| t4  | Fail | **Fail** | Genuine. The model delivered the **correct verdict** ("the claim is **false** for this repository … No modification to documentation or any other file is required") and made no change, but the prompt explicitly required reviewing `git diff --check` and `git diff --staged` before any commit; it reasoned about that requirement but **executed neither** (`t4.diff_check`, `t4.diff_staged` unmet, both critical). It also did not run the repository validator (`t4.validator_run`, non-critical).                                                         |
| t7  | Fail | **Fail** | Genuine. The task requires the **repository's** Markdown validator run twice, each execution reported separately, plus `git status`. The model searched for a validator, tried `markdownlint` (not found), `npx markdownlint` (failed `ENOTCACHED`; offline), and local binaries (not found), then **abandoned** — it never ran the repository validator (`npm run format:check` / `prettier`) and never ran `git status`. `t7.validator_twice` (critical) and `t7.git_status` (critical) unmet; `t7.separate_outputs` (non-critical) unmet. Nothing was modified. |

All 27 common requirements (`common.prompt_verified`, `common.baseline_head`, `common.clean_before`, i.e. 3 × 9) **passed** for every test.

**Passing-card verification (no false positives).** `t5.preexisting_classified` matched `already present`, which is the model's **own** classification ("the failure is **pre‑existing**; it was already present before any of your actions"), not the user prompt text — unlike the run-5 false positive. `t5.working_tree_reviewed` was credited via `git status` (an accepted alternative in the frozen requirement). `t8.recovery_validation` was credited via the umbrella `npm run check`, whose nested chain (`typecheck && lint && format:check`) was captured in output; **caveat:** the literal `npm run format:check` was not invoked directly (same caveat recorded for DSH matrix run 2 and OpenCode matrix runs 3 and 5). All other passing cards were confirmed against their traces.

**New behaviors not seen in the prior GPT-OSS OpenCode run.** The model repeatedly issued **malformed tool arguments** (`glob` with an empty `path` — 9 occurrences; `read` with `offset: 0`; `glob` with an empty `pattern`; `glob` of the non-existent `./fixtures`), and attempted the **unavailable `search` tool** 5 times (recorded as `invalid`/error tool parts in t2, t4, t5, t7). These are model-caused, not policy denials.

## 7. Permission / tool surface and network

- **Permission denials:** **zero** (`permissions.json` → every test `count: 0`). DSH `workspace-write` permitted all clone-local operations; no sandbox marker appeared in any tool result and no escalation was attempted.
- **Web tools absent:** `web_search`/`web_fetch` did not appear in any session trace (tool counts: `bash`, `read`, `edit`, `glob`, `grep` only). Verified by `--dump-config` (`tool-web.disabled: true`) and by the absence of any `web_*` tool part.
- **Network:** **zero egress.** The runner exported `npm_config_offline=true`; `t5`'s `no_network` requirement passed. The only network-capable attempts were `npx markdownlint` in **t5** and **t7**, both of which failed locally with `ENOTCACHED` ("cache mode is 'only-if-cached' but no cached response is available") — no package was fetched and no registry connection succeeded. No `npm install`/`curl`/`wget`/`npm view`/`npm pack` was run.
- **Model-caused tool failures (not denials):** 5 attempts to call the unavailable `search` tool; repeated `glob` with an empty `path`; `read` with `offset: 0`; `glob` with an empty `pattern`; `glob` of `./fixtures` (absent).

## 8. Prompt / generation throughput (Ollama-limited)

Ollama `0.33.2` has **no `/metrics`** endpoint (the DSH adapter's per-test counter snapshots record `HTTP Error 404: Not Found`) and its `/v1` path returns no timing fields, so llama.cpp-style suite gauges (`prompt_tokens_seconds`, `predicted_tokens_seconds`) and `spec_decode_*` counters **cannot be produced**. The following are measured from DSH session records / wall-clock, with derived proxies:

| Quantity                                                      | Value     | Kind            |
| ------------------------------------------------------------- | --------- | --------------- |
| Cumulative per-step input tokens                              | 1,357,465 | measured        |
| Generated (output) tokens                                     | 11,845    | measured        |
| Sum of per-test runtimes                                      | 459.8 s   | measured        |
| Continuous suite wall-clock                                   | 473 s     | measured        |
| Sum of generation streaming time (assistant chunk first→last) | 317.4 s   | measured        |
| **Output tok/s proxy** (11,845 / 317.4)                       | **37.3**  | derived (proxy) |
| Output tok/s over full runtime (11,845 / 459.8)               | 25.8      | derived (proxy) |

The output tok/s figure is a **proxy**: generation time is taken from the assistant stream chunk timestamps (first→last chunk), which excludes prompt processing and any inter-step gaps, while the runtime figure includes all overhead. Ollama's native `/api/chat` returns `prompt_eval_duration`/`eval_duration`, but DSH's provider uses the OpenAI-compatible `/v1` endpoint, so a true decode rate is **not derivable** from this run.

## 9. Maximum context occupancy

| Quantity                                                     | Value                    |
| ------------------------------------------------------------ | ------------------------ |
| Largest sequence observed (max per-step `usage.totalTokens`) | **26,720**               |
| `n_ctx`                                                      | **122,880**              |
| Occupancy                                                    | **21.75% of the window** |
| Tests approaching/exceeding the validated 122,880 occupancy  | **none**                 |

The run confirms the derived model was _configured_ for and _served_ at 122,880, and that the frozen suite ran cleanly at ~22% occupancy; it provides **no evidence** about reliability or throughput at the ~122K operating point. This is expected for a 9-task coding suite and is reported as a limitation.

## 10. Timeout / runtime behavior

| Quantity                                                            | Value               |
| ------------------------------------------------------------------- | ------------------- |
| Per-test timeout                                                    | 2400 s              |
| Tests timed out                                                     | **0 / 9**           |
| Sum of per-test durations                                           | **459.8 s**         |
| Continuous suite wall-clock (t0 start 01:41:20Z → t8 end 01:49:13Z) | **473 s = 7.9 min** |

Per-test runtimes: t0 6.6, t1 13.5, t2 81.9, t3 22.8, t4 70.3, t5 112.9, t6 19.2, t7 85.1, t8 47.5 s — all far below the 2400 s wrapper. The longest tests (t5 112.9 s, t7 85.1 s, t2 81.9 s) were driven by step/tool volume, not decode stalls.

## 11. Comparison

### 11.1 Same model/context, different orchestration harness (matrix runs 5 vs 6)

| Run                          | Model / context                    | Engine   | Automated           | Adjudicated                               |
| ---------------------------- | ---------------------------------- | -------- | ------------------- | ----------------------------------------- |
| Matrix r5 OpenCode           | `gpt-oss:20b-122880` @ 122,880     | OpenCode | 2 Pass / 7 Fail     | 2 Pass / 7 Fail (`t0,t6`)                 |
| **Matrix r6 DSH (this run)** | **`gpt-oss:20b-122880` @ 122,880** | **DSH**  | **6 Pass / 3 Fail** | **6 Pass / 3 Fail (`t0,t1,t3,t5,t6,t8`)** |

Per-test agreement between runs 5 and 6 (same model, same window, different harness):

| #   | OpenCode r5 (adj)                             | DSH r6 (adj)                              | Same? |
| --- | --------------------------------------------- | ----------------------------------------- | ----- |
| t0  | Pass                                          | Pass                                      | ✓     |
| t1  | **Fail** (no line count; malformed tool call) | **Pass** (205 lines)                      | ✗     |
| t2  | Fail                                          | Fail                                      | ✓     |
| t3  | **Fail** (reported 12 vs 11)                  | **Pass** (reported 11)                    | ✗     |
| t4  | Fail                                          | Fail                                      | ✓     |
| t5  | **Fail** (wrong/missing validator)            | **Pass** (ran `format:check`, no commit)  | ✗     |
| t6  | Pass                                          | Pass                                      | ✓     |
| t7  | Fail                                          | Fail                                      | ✓     |
| t8  | **Fail** (recovery commands not executed)     | **Pass** (`npm run check` + `git status`) | ✗     |

Adjudicated aggregate moved **2/7 → 6/3** on a single run; four cards moved up (`t1`, `t3`, `t5`, `t8`) and none moved down. Not established as statistically significant; harness, scorer hardening, and token basis differ. The three stable failures (`t2`, `t4`, `t7`) share a common model tendency: **stating or reasoning about a required validation/diff step without executing it**.

### 11.2 DSH matrix runs (methodology parity, different model)

| Run                          | Model                                | Context     | Automated                 | Adjudicated               |
| ---------------------------- | ------------------------------------ | ----------- | ------------------------- | ------------------------- |
| Matrix r2 DSH                | Qwen3.8-27B GSQ-RCO IQ3_S            | 97,280      | 7/2 (fail `t5,t7`)        | 7/2 (fail `t5,t7`)        |
| Matrix r4 DSH                | Qwen3.8-27B Unsloth UD-IQ3_XXS       | 80,896      | 8/1 (fail `t7`)           | 8/1 (fail `t7`)           |
| **Matrix r6 DSH (this run)** | **GPT-OSS 20B `gpt-oss:20b-122880`** | **122,880** | **6/3 (fail `t2,t4,t7`)** | **6/3 (fail `t2,t4,t7`)** |

Methodology is identical (`runner_dsh.py` → `extract_traces_dsh.py` → `score.py`, 2400 s/test, sanitized baseline, canonical deny permissions, web tools disabled, shell timeout 600000). Under this suite and harness, GPT-OSS 20B is weaker than the Qwen3.8-27B DSH configurations, with failures concentrated on ordered multi-step validation/diff discipline. No cross-model ranking is asserted beyond the observed single-run totals.

## 12. DSH vs OpenCode behavior differences (comparison-critical)

1. **Orchestration harness differs by construction.** DSH exposes a different model-facing tool surface (`read`/`write`/`edit`/`grep`/`glob`/`bash` plus DSH-only `subagent`/`workflow`/`code-runtime`/`skill`/`goal`/`todo`/jobs). In this run the model used only `bash`/`read`/`edit`/`grep`/`glob` — no DSH-only execution tool was exercised.
2. **Token accounting basis differs.** Matrix r5 reported OpenCode session step sums; matrix r6 reports DSH session `usage` sums. Cross-harness token totals are not directly comparable.
3. **Four cards moved Fail → Pass.** `t1` (line count delivered), `t3` (correct count 11), `t5` (validator run, no commit), and `t8` (recovery commands executed). These are **model-behavior** differences on a single run; run-to-run non-determinism cannot be excluded.
4. **The same three cards failed in both harnesses** (`t2`, `t4`, `t7`), all involving required validation/diff steps that the model described but did not execute — a consistent model-level weakness across harnesses for this model.
5. **Malformed tool arguments and unavailable-tool attempts.** DSH recorded repeated empty-`path` `glob` calls, an `offset: 0` `read`, and 5 `search` attempts; these surfaced as tool errors, not policy denials.
6. **No permission denials and no network egress** in this run (contrast DSH matrix run 4, whose t7 model overrode `npm_config_offline` and downloaded a package). Here `npx markdownlint` was refused by the offline cache in both t5 and t7.
7. **Runtime.** DSH r6 ran 473 s wall-clock (vs OpenCode r5 346 s) over a different step/tool mix.

## 13. Interpretation and limitations

1. **The suite does not exercise the 122K operating point (dominant limitation).** Peak sequence was 26,720 tokens (21.75% of 122,880). The run validates the model _configured/served_ at 122,880 under DSH, not behavior at high occupancy.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite score. The four movements vs OpenCode r5 are single-run observations.
3. **Ollama metric limitation.** No `/metrics`; no prompt-eval/generation durations on `/v1`. tok/s figures are proxies, not llama.cpp-equivalent gauges; speculative-decoding metrics do not apply. The DSH adapter's llama.cpp counter snapshots are all `__error__` for this run.
4. **Reliability is moderate on this suite.** 6/9 adjudicated. Failures cluster on ordered multi-step discipline: the model describes a required validator/diff step but does not execute it (t2, t4, t7). This is the same failure signature seen in the OpenCode r5 run and is harness-independent for this model.
5. **No scorer false positives/negatives.** The run-5 `t5.preexisting_classified` false positive does **not** recur: the match is the model's own classification.
6. **t8 credit caveat.** `t8.recovery_validation` was credited via `npm run check` (nested `format:check` with corroborating captured output). A strict adjudicator could keep t8 a fail if only the literal `npm run format:check` is accepted.
7. **Run-local settings deltas.** A dedicated settings copy was required (model id + `apiKeyEnv`); the production `~/.dsh/settings.yaml` and global OpenCode configuration were left byte-identical.
8. **`config.verification.json` note string is generic.** The DSH adapter writes a static note ("DSH uses ~/.dsh/settings.yaml (unmodified)…"). That is true of the _production_ file, but this run additionally used an invocation-only `settings.path` redirect to select the derived model and an `apiKeyEnv` reference; the note does not describe either. Recorded here for accuracy; the adapter was not modified.
9. **Suite-level metrics only.** Per-test token counts are derived from DSH session records; per-test throughput is not available from the server.

## 14. Server-integrity evidence (no restart, no reconfiguration)

| Observation                | Before suite              | After suite          |
| -------------------------- | ------------------------- | -------------------- |
| Model alias                | `gpt-oss:20b-122880`      | `gpt-oss:20b-122880` |
| Parent model               | `gpt-oss:20b`             | `gpt-oss:20b`        |
| Modelfile `num_ctx`        | 122,880                   | 122,880              |
| `/api/ps` `context_length` | 122,880                   | 122,880              |
| `/api/ps` `size_vram`      | 13,038,329,527            | 13,038,329,527       |
| Digest                     | `36a642bd2d78d93f…`       | same                 |
| Ollama version             | `0.33.2`                  | `0.33.2`             |
| Metrics endpoint           | absent (`/metrics` → 404) | absent               |

The source model `gpt-oss:20b` was unchanged (`parameters: temperature 1` only), and the global Ollama default remained 65536. The derived tag and its 122,880 window were identical before and after. **No configuration change** was made at any point. Port **8087** (llama.cpp/Qwen) was not listening and was not used or switched.

## 15. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/gpt-oss-20b-122880-matrix-r6-dsh/` (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`, `config.verification.json`, `dsh-parity.patch.yml`, `dsh-settings.yaml`, `dsh.dump-config.txt`, `dsh.dump-config.nopatch.txt`, `baseline.meta.json`, `baseline.validation.json`, `clones.validation.json`, `server.version/ps/show/tags.*`, `server.metrics.*.code`, `smoke/`, `runner.log`, `runner.err.log`, `runner.pid`, `status.json`).
- **Results:** `…/results/gpt-oss-20b-122880-matrix-r6-dsh/` (`results.jsonl`, `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`, `tN.out/err/log`).
- **Prior artifacts untouched:** all earlier workspaces and reports retain their original contents; this run wrote only to the new `…-matrix-r6-dsh` workspace and this report.
- **Frozen harness/scorer:** HEAD remains `48d9b54f249cd461f5456202f225bbddd156fdf9`; tracked harness, scorer, and prompt files show no diff (only the two pre-existing untracked DSH adapters appear); prompts/scorer/baseline were used verbatim; the baseline rebuilt deterministically at `ef91057c…` (tree `feca1f64…`).
- **Repository integrity:** no staging, commit, push, reset, or other Git state change; main repository HEAD remains `48d9b54f…`. Pre-existing uncommitted application-source changes (tracked `ARCHITECTURE.md`, `README.md`, `convex/http.ts`, `worker/README.md`, `worker/src/index.js`; untracked `convex/health.ts`, `convex/lib/health.ts`, `worker/src/health.js`, `tests/health/`) were present before the run and were **not** touched. The only new repository artifact is this report.
- **Production configuration:** `~/.dsh/settings.yaml` **unmodified** (sha256 `ac90d4e8…` before and after); `~/.config/opencode/opencode.gpt-oss-20b-eval.jsonc` sha256 unchanged (`42fc28b4…`); the headless profile's `cordis.patch.yml` unchanged (`tool-web` disabled only); the parity overlay and settings copy are workspace-local and invocation-only.
- **Baseline/clones clean:** baseline and all nine clones report a clean working tree; `t2` carries exactly the one expected commit (`ad04c01`), all other clones zero commits.

**Nothing was committed. This is the final matrix run (6 of 6). No additional experiment or rerun was started. The GPT-OSS/Ollama configuration was not altered after the run.**

---

### Required summary

- **Matrix position:** **Run 6 of 6** — `GPT-OSS 20B × DSH`.
- **Model:** `local-ollama/gpt-oss:20b-122880` (derived from source `gpt-oss:20b`, `PARAMETER num_ctx 122880`); effective serving context **122,880** (`/api/ps` before and after).
- **Automated score:** **6 Pass / 3 Fail** (Fail `t2,t4,t7`).
- **Adjudicated score:** **6 Pass / 3 Fail** (Fail `t2,t4,t7`) — no scorer false positives or false negatives.
- **Per-test result table:** §5.
- **Total runtime:** **473 s (7.9 min)** continuous suite wall-clock; sum of test durations **459.8 s**; zero timeouts.
- **Prompt/generation throughput:** **not llama.cpp-equivalent** (Ollama `/metrics` absent, `/v1` exposes no durations). Measured: 1,357,465 cumulative input tokens, 11,845 output tokens. Derived output proxy **37.3 tok/s** (generation-only).
- **Maximum actual token occupancy:** **26,720** tokens (`usage.totalTokens`; **21.75%** of the 122,880 window). No test approached or exceeded the validated ~122K occupancy.
- **Permission denials:** **zero**. **Network egress: zero** (`npx markdownlint` refused offline in t5/t7). **Timeouts: zero.** **Commits:** exactly one (`ad04c01`, t2), as required.
- **Anomalies / model-caused deviations:** 5 attempts to call the unavailable `search` tool; repeated `glob` with empty `path`; `read` with `offset: 0`; `glob` of an absent directory. No restarts; no configuration changes; no `robinhood` usage.
- **Material difference from the OpenCode r5 run (same model/context):** adjudicated **2/7 → 6/3**; `t1`, `t3`, `t5`, `t8` moved Fail → Pass; `t2`, `t4`, `t7` stayed Fail. Not a controlled comparison (harness and token basis differ).
- **Report path:** `docs/development/model-reliability/gpt-oss-20b-122880-matrix-r6-dsh-frozen-harness-evaluation.md`.
