# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp (8087 / 97,280 ≈ 96K + MTP) — **DSH** Frozen-Harness Reliability Evaluation — **Matrix Run 2 of 6**

**Date:** 2026-09-23
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` — coordinated the read-only server probes, the frozen suite run, trace extraction, scoring, adjudication, and this report.
**Matrix position:** **Run 2 of 6** — `GSQ-RCO 96K × DSH`
**Execution / orchestration harness under test:** **DSH (DeepSeek Harness)** `@deepseek-ai/dsh@0.1.5-rc.2`
**Model under test (downstream):** `qwen3.8-27b-gsq-rco`
**Model file:** `E:\LocalAI\models\qwen3.8-27b\gsq-rco\production\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` (`IQ3_S - 3.4375 bpw`)
**Provider / endpoint:** DSH provider `local-llama-cpp` → `http://192.168.68.52:8087/v1` (llama.cpp, build `b1-60081bb`)
**DSH model label:** `local-llama-cpp/qwen3.8-27b-gsq-rco` (reasoning `low`, contextWindow `97280`, maxTokens `32768`)
**Harness commit (frozen):** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`; all hashes + byte lengths verified)
**Per-test timeout:** 2400 s (wrapper; recorded in `manifest.json` and every `results.jsonl` record)
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r2-dsh`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r2-dsh`

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are task-level evidence from a single evaluation run, not a statistical measurement. No composite score or ranking is produced, and no single-run difference is treated as statistically significant.
>
> **Measured vs. derived.** _Measured_ values are read directly from llama.cpp `/metrics` counter deltas (suite interval) or from harness/session records. _Derived_ values are arithmetic over measured values (tok/s, percentages). Each is labelled below.
>
> **Scope note.** This run validates the **Qwen3.8-27B-GSQ-RCO-IQ3_XXS-MTP** server at its configured **`n_ctx = 97,280` (~96K)** window, run under **DSH** with the web tools removed and the shell timeout preserved. The frozen suite did **not** drive the window far: the largest sequence observed was **40,385 tokens (41.51% of the window)**. The frozen prompts, `ground_truth.json`, `prompt_manifest.json`, scorer, and baseline were used verbatim.

---

## 1. Provenance

| Item                      | Value                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Suite                     | `opencode-t0-t8` (frozen `ground_truth.json`)                                                           |
| Matrix position           | **2 of 6** (`GSQ-RCO 96K × DSH`)                                                                        |
| Harness commit (used)     | `48d9b54f249cd461f5456202f225bbddd156fdf9`                                                              |
| Harness working tree      | tracked harness/scorer/prompt files clean (no diff); only pre-existing _untracked_ DSH adapters present |
| Baseline HEAD             | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`                                                              |
| Baseline source ref       | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`                                                              |
| Tracked files in baseline | 338                                                                                                     |
| Prompt verification       | `ok: true` — all `t0`–`t8` SHA-256 **and** byte length match                                            |
| Run interval              | `2026-09-23T14:14:54Z` → `2026-09-23T14:38:37Z`                                                         |
| Engine                    | DSH adapter (`runner_dsh.py` → `extract_traces_dsh.py` → `score.py`); `runner.py` (OpenCode) untouched  |
| Application source        | untouched by this run; pre-existing uncommitted changes present before and after, unchanged             |

Run sequence: read-only server probes → fresh workspace + parity overlay → `--dump-config` verification → provision the sanitized baseline + 9 clones → capture `metrics.before_suite.prom` → run `t0`–`t8` serially under DSH → capture `metrics.after_suite.prom` and post-suite `/props`/`/models`/`/slots`/`/health` → `extract_traces_dsh.py` → `score.py` → manual adjudication against `ground_truth.json`. The server was **not** restarted or reconfigured at any point.

## 2. Exact model / server configuration (unchanged)

Read-only probes of `http://192.168.68.52:8087` (server **not** restarted or modified):

| Item                  | Before                                                                    | After                 | Source                 |
| --------------------- | ------------------------------------------------------------------------- | --------------------- | ---------------------- |
| Health                | `{"status":"ok"}`                                                         | `{"status":"ok"}`     | `GET /health`          |
| Build                 | `b1-60081bb`                                                              | `b1-60081bb`          | `GET /props`           |
| Model alias / id      | `qwen3.8-27b-gsq-rco`                                                     | `qwen3.8-27b-gsq-rco` | `/props`, `/v1/models` |
| Model path            | `…\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`                                  | same                  | `/props`               |
| Quantization          | `IQ3_S - 3.4375 bpw`                                                      | same                  | `/props`               |
| Context (`n_ctx`)     | **97,280**                                                                | **97,280**            | `/props`, `/v1/models` |
| Trained context       | `262,144`                                                                 | `262,144`             | `/v1/models` (meta)    |
| Slots                 | `total_slots=1`, slot `id=0`                                              | same                  | `/props`, `/slots`     |
| Vision                | `modalities.vision=true`; `capabilities=["completion","multimodal"]`      | same                  | `/props`, `/v1/models` |
| Speculative decoding  | slot `speculative:true`; per-request `speculative.types="none,draft-mtp"` | same                  | `/slots`               |
| Max predict (request) | `n_predict=4096`                                                          | same                  | `/slots`               |
| Metrics endpoint      | `endpoint_metrics: true`                                                  | same                  | `/props`               |

Server identity was **identical before and after** the suite and every counter was strictly monotonic (no reset), demonstrating the server was **not** restarted during the run (§15). No configuration change was made at any point.

## 3. Exact DSH configuration / invocation

| Item             | Value                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Harness          | DSH `@deepseek-ai/dsh` **0.1.5-rc.2** (`/Users/cortezashley/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh`)         |
| DSH home         | `/Users/cortezashley/.dsh` — **`settings.yaml` unmodified**                                                            |
| Profile          | `headless` (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`)                                                     |
| Provider         | `local-llama-cpp` → `http://192.168.68.52:8087/v1`                                                                     |
| Model label      | `local-llama-cpp/qwen3.8-27b-gsq-rco` (reasoning `low`, context 97280, maxTokens 32768)                                |
| Invocation       | `dsh --profile headless --patch <parity overlay> "<frozen prompt>"`                                                    |
| Approval policy  | `ask` with no headless answerer ⇒ **fail-closed**; escalation (`sandbox_permissions` + justification) also fail-closed |
| Sandbox mode     | `workspace-write` (Seatbelt on macOS)                                                                                  |
| Shell timeout    | `timeoutMs=600000`, `maxTimeoutMs=600000`                                                                              |
| Per-test wrapper | 2400 s `subprocess` timeout (recorded per record)                                                                      |

**Effective-configuration verification (`--dump-config`, exit 0).** The composed headless tree was inspected with the overlay applied. Confirmed:

- `tool-web` → **`disabled: true`** (matches OpenCode `webfetch: deny` / `websearch: deny`); the `web` / `web-search-deepseek` / `web-fetch-http` backends remain mounted but are **unreachable by the model** without `tool-web`.
- `bash-sandbox` → `timeoutMs: 600000`, `maxTimeoutMs: 600000` (composition entry). Independently, the bash executor registers the shared `shell` settings namespace (`SHELL_SETTINGS_NAMESPACE = "shell"`), and `~/.dsh/settings.yaml` already carries `shell.timeoutMs=600000` / `shell.maxTimeoutMs=600000`; `dsh-bash-sandbox` inherits `dsh-bash-local`'s section install, so the **effective** shell policy is **600000 / 600000**.
- `sandbox-policy` → `mode: process.env.DSH_PERMISSION_MODE ?? 'workspace-write'` (runner exports `workspace-write`); `workspaceRoot: process.cwd()`.
- `approval` → policy `ask` (fail-closed with no answerer).

**Parity overlay (`<workspace>/dsh-parity.patch.yml`, sha256 `81668bc0e27be8ff9e5fc1d740c8e56451647706282fb60b114c14a0c6b84f32`), invocation-only:**

```yaml
- id: tool-web # removes web_search + web_fetch (matches OpenCode webfetch/websearch deny)
  disabled: true
- id: bash-sandbox # effective shell timeout 600000 / 600000 (settings.yaml already 600000)
  config:
    timeoutMs: 600000
    maxTimeoutMs: 600000
```

`~/.dsh` was **not** edited. The overlay is passed with `--patch` per run. Relative to the prior DSH permission-parity overlay (`…-8087-dsh-parity`), the only change is the shell-timeout entry (8087 used `timeoutMs=1200000`); the web-tool disable is identical. **This is the permission-parity DSH configuration: web tools remain disabled and the 600,000 ms shell timeout is preserved.**

## 4. Harness integrity

- HEAD = `48d9b54f249cd461f5456202f225bbddd156fdf9` (frozen harness/scorer), matching the required value.
- Baseline HEAD = `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`; provisioned deterministically via `git archive` of `a07d38e` with the eval directory excluded (`excluded_present_in_ref: false`), 338 tracked files; all 9 clones validated `ok / clean=True` at baseline HEAD before the run.
- Prompt manifest: all nine prompts matched SHA-256 **and** byte length (`ok: true`).
- DSH config verification: `ok: true`; `tool-web.disabled`, the shell timeouts, the sandbox mode, and the approval policy were verified via `--dump-config` before any model call.
- The application source, prompts, `ground_truth.json`, `prompt_manifest.json`, `runner.py`, `extract_traces.py`, and `score.py` were used verbatim and not modified. `runner_dsh.py` and `extract_traces_dsh.py` are the pre-existing untracked DSH adapters (unchanged).

## 5. Per-test results (t0–t8)

Token columns are sums of per-step session values (measured). Runtime is the runner wall-clock per test. Every session matched its clone directory exactly (`match=exact`); every clone started clean at baseline HEAD and ended clean. `rc=0` throughout. **Zero timeouts.**

| #   | Automated | Adjudicated | Runtime (s) | Input tok | Output tok | Timeout |           Commits | Tools | Validator invoked                                   | Notes                                                                                                    |
| --- | --------- | ----------- | ----------: | --------: | ---------: | ------- | ----------------: | ----: | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| t0  | Pass      | Pass        |        23.1 |     8,677 |        233 | No      |                 0 |     0 | none                                                | Exact model id + cwd, no tools                                                                           |
| t1  | Pass      | Pass        |        45.0 |     9,138 |        860 | No      |                 0 |     5 | none                                                | Correct path + 205 lines; no Git/modification                                                            |
| t2  | Pass      | Pass        |       473.9 |    21,288 |     12,600 | No      |     1 (`308714f`) |    31 | `npx prettier`                                      | One scoped docs edit + validator + diff review + one commit                                              |
| t3  | Pass      | Pass        |        77.2 |    10,718 |      1,201 | No      |                 0 |     4 | none                                                | Correct 11 PinPal paths (32 grep matches across 11 files)                                                |
| t4  | Pass      | **Pass**    |       295.6 |    22,625 |      7,096 | No      |                 0 |    22 | `npm run format:check`                              | Verdict "claim is **false**" + "no documentation change is warranted"; no change                         |
| t5  | **Fail**  | **Fail**    |       163.3 |    15,560 |      3,448 | No      | **1 (`a798056`)** |    11 | `npm run format:check`                              | Ran validator, classified pre-existing — but **committed** in a strict no-op task (`t5.no_commit` unmet) |
| t6  | Pass      | Pass        |        59.1 |    13,335 |      1,259 | No      |                 0 |     4 | `npm run format:check`                              | Validator identified/run/reported                                                                        |
| t7  | **Fail**  | **Fail**    |       192.9 |    15,146 |      2,491 | No      |                 0 |    26 | `npx --no-install markdownlint` (external, offline) | Used the wrong validator; neither execution produced output (ENOTCACHED)                                 |
| t8  | Pass      | Pass        |        69.0 |    11,266 |        852 | No      |                 0 |     5 | `npm run check` (includes `format:check`)           | Bogus commands reported accurately; recovered with `npm run check`                                       |

Totals: 9 tests; session input **137,753** tok, output **30,040** tok; sum of runtimes **1,399.1 s**. Zero timeouts. Token counts are session-measured (DSU/DSH step values) and differ slightly from llama.cpp counter deltas because the counters include the direct smoke-free suite interval only (see §8). `308714f` (t2) is the expected single scoped commit (`docs/domain-model.md | 15 +++++++++------`).

## 6. Adjudication

- **Automated (frozen scorer): 7 Pass / 2 Fail** — Pass `t0,t1,t2,t3,t4,t6,t8`; Fail `t5,t7`.
- **Adjudicated: 7 Pass / 2 Fail** — identical; no scorer false positives/negatives were found this run.

| #   | Auto | Adj  | Exact reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t4  | Pass | Pass | Genuine. The model delivered the correct verdict — _"## Verdict: The claim is **false**"_ — and an explicit no-change determination — _"no documentation change is warranted"_ — ran `npm run format:check` / `npx prettier`, `git diff --check`, and `git diff --staged`, and modified nothing. Unlike the matrix-r1 OpenCode run (where `warranted?** No.` missed the frozen regex), this run's phrasing matched the detector, so the automated verdict is correct with no adjudication change.                                                                                                                                                                            |
| t5  | Fail | Fail | Genuine relative to the frozen requirement. The task is a strict ordered no-op. The model **did** run `npm run format:check`, **did** classify the `docs/domain-model.md` failure as **pre-existing**, and **did** review the tree/diff with Git — but it then ran `npx prettier --write docs/domain-model.md` and **committed** (`a798056 docs: apply prettier formatting to domain-model.md`). `t5.no_commit` (critical) is unmet; the tree is clean after the commit only because the change was committed. Same failure mode recorded in the prior 8087 and 96K runs.                                                                                                    |
| t7  | Fail | Fail | Genuine. The task requires the repository's Markdown validator (`npm run format:check` / `prettier`) run twice, each execution reported separately. The model searched the repo/toolchain, concluded no project-specific Markdown validator exists, and ran an **external** `npx --no-install markdownlint docs/domain-model.md` twice. Both executions failed with `npm error code ENOTCACHED` (cache-only mode, no network), producing **no validator output**; `t7.validator_twice` (critical) and `t7.separate_outputs` are unmet. `git status` ran and nothing was modified. Same frozen-requirement failure mode recorded in the prior 8087/96K DSH and OpenCode runs. |

All 27 common requirements (`common.prompt_verified`, `common.baseline_head`, `common.clean_before`, i.e. 3 × 9) **passed** for every test.

## 7. Permission / tool surface and network

- **Web tools absent:** `web_search`/`web_fetch` did not appear in any session trace (tool counts: `bash`, `read`, `edit`, `grep`, `glob` only). Verified by `--dump-config` (`tool-web.disabled: true`) and by the absence of any `web_*` tool part in `raw_parts.jsonl`.
- **Permission denials:** **zero** (`permissions.json` → every test `count: 0`). Unlike the matrix-r1 OpenCode run (one contained `external_directory` denial writing to `/tmp/para.md`), no denial occurred; DSH `workspace-write` permits `/tmp`.
- **Network:** **zero** `curl`/`wget`/`pip`/`npx -y`/`npm install`. The only registry contact was t7's `npx --no-install markdownlint`, which is cache-only mode and failed `ENOTCACHED` **without** performing a download (`npm_config_offline=true` also exported). No network egress occurred in any test.

## 8. Prompt / generation throughput

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Quantity                                                      | Value                             |
| ------------------------------------------------------------- | --------------------------------- |
| Prompt tokens processed (non-cached)                          | **122,415**                       |
| Prompt tokens served from cache                               | **1,584,004**                     |
| Prompt processing time                                        | **244.1 s**                       |
| **Prompt tok/s (derived = 122,415 / 244.1)**                  | **501.5**                         |
| llama.cpp gauge `prompt_tokens_seconds` (measured, suite end) | **~501** (server running average) |
| Generated tokens                                              | **39,748**                        |
| Generation time                                               | **1,062.4 s**                     |
| **Generation tok/s (derived = 39,748 / 1,062.4)**             | **37.41**                         |
| `n_decode_total` (excluding speculative)                      | **14,540**                        |

## 9. MTP / speculative-decoding metrics

Directly from llama.cpp `/metrics`, suite-only counter deltas (measured):

| Metric                                                          | Value                                           |
| --------------------------------------------------------------- | ----------------------------------------------- |
| Verification steps (`spec_decode_num_drafts_total`)             | **14,053**                                      |
| Draft tokens generated (`spec_decode_num_draft_tokens_total`)   | **42,151** (= 2.999 per step; draft max 3)      |
| Draft tokens accepted (`spec_decode_num_accepted_tokens_total`) | **25,698**                                      |
| **Draft acceptance rate (derived)**                             | **60.97%**                                      |
| **Mean accepted tokens per verification step (derived)**        | **1.8286** (≈ 0.829 extra tokens/step from MTP) |
| Accepted at draft position 0 / 1 / 2                            | 10,756 / 8,361 / 6,581                          |

MTP is active and materially productive: each decode step yields ~1.83 accepted tokens instead of 1.

## 10. Maximum context occupancy

| Quantity                                                               | Value                    |
| ---------------------------------------------------------------------- | ------------------------ |
| `n_tokens_max` (largest prompt+generation sequence observed, absolute) | **40,385**               |
| Pre-suite `n_tokens_max` (before suite)                                | 29,788                   |
| `n_ctx`                                                                | **97,280**               |
| Occupancy                                                              | **41.51% of the window** |
| Tests approaching/exceeding the validated ~96K occupancy               | **none**                 |

## 11. Timeout / runtime behavior

| Quantity                                                          | Value                  |
| ----------------------------------------------------------------- | ---------------------- |
| Per-test timeout                                                  | 2400 s                 |
| Tests timed out                                                   | **0 / 9**              |
| Sum of per-test durations                                         | **1,399.1 s**          |
| Continuous suite wall-clock (t0 start 14:14:55 → t8 end 14:38:37) | **1,422 s = 23.7 min** |

Per-test runtimes: t0 23.1, t1 45.0, t2 473.9, t3 77.2, t4 295.6, t5 163.3, t6 59.1, t7 192.9, t8 69.0 s — all far below the 2400 s wrapper.

## 12. Comparison

### 12.1 Scores (same model, same build, same 97,280 window, frozen suite)

| Run                               | Context    | Engine       | Automated                 | Adjudicated            |
| --------------------------------- | ---------- | ------------ | ------------------------- | ---------------------- |
| 96K OpenCode (prior, Sep-21)      | 97,280     | OpenCode     | 5/4 — fail `t4,t5,t7,t8`  | 6/3 — fail `t5,t7,t8`  |
| **96K OpenCode (matrix r1)**      | **97,280** | **OpenCode** | **6/3 — fail `t4,t7,t8`** | **7/2 — fail `t7,t8`** |
| **96K DSH (this run, matrix r2)** | **97,280** | **DSH**      | **7/2 — fail `t5,t7`**    | **7/2 — fail `t5,t7`** |

Per-test agreement between the two matrix runs (same model, same window, different orchestration harness):

| #   | OpenCode r1 (adj)                               | DSH r2 (adj)                                         | Same?     |
| --- | ----------------------------------------------- | ---------------------------------------------------- | --------- |
| t0  | Pass                                            | Pass                                                 | ✓         |
| t1  | Pass                                            | Pass                                                 | ✓         |
| t2  | Pass                                            | Pass                                                 | ✓         |
| t3  | Pass                                            | Pass                                                 | ✓         |
| t4  | Pass (scorer false negative → adjudicated Pass) | Pass (automated Pass)                                | ✓ outcome |
| t5  | Pass (no commit)                                | **Fail (committed `a798056`)**                       | ✗         |
| t6  | Pass                                            | Pass                                                 | ✓         |
| t7  | Fail (external markdownlint)                    | Fail (external offline markdownlint)                 | ✓         |
| t8  | Fail (`npm run lint`)                           | **Pass (`npm run check` → includes `format:check`)** | ✗         |

### 12.2 Performance (measured / derived)

| Metric                     | 96K OpenCode (matrix r1) | **96K DSH (matrix r2)** |
| -------------------------- | -----------------------: | ----------------------: |
| Prompt tok/s (derived)     |                   553.51 |               **501.5** |
| Generation tok/s (derived) |                    41.97 |               **37.41** |
| `n_decode_total`           |                   11,433 |              **14,540** |
| `n_tokens_max`             |                   29,788 |              **40,385** |
| Prompt tokens (non-cached) |                  129,039 |             **122,415** |
| Generated tokens           |                   31,710 |              **39,748** |
| Sum of test durations      |                1,064.5 s |           **1,399.1 s** |
| MTP acceptance rate        |                   62.74% |              **60.97%** |
| Mean accepted/step         |                    1.882 |               **1.829** |

## 13. DSH vs OpenCode behavior differences (comparison-critical)

1. **Orchestration harness differs by construction.** DSH exposes a different model-facing tool surface (`read`/`write`/`edit`/`grep`/`glob`/`bash` plus DSH-only `subagent`/`workflow`/`code-runtime`/`skill`/`goal`/`todo`/jobs). In this run the model only used `bash`/`read`/`edit`/`grep`/`glob` — no DSH-only execution tool was exercised.
2. **Token accounting basis differs.** OpenCode matrix-r1 reported session sums of step tokens; DSH step values were summed the same way, but DSH's per-step accounting yields a higher suite total (137,753 in / 30,040 out) and the llama.cpp counter deltas differ because the two harnesses drive different prompt/step mixes. Cross-harness token totals are not directly comparable.
3. **t5 outcome differs (commit).** OpenCode r1 performed the strict no-op correctly (0 commits); DSH r2 reformatted and committed. This is a **model-behavior** difference on a single run, not attributable to the parity overlay (web tools are irrelevant to t5), and is most plausibly run-to-run non-determinism. It is the only adjudicated card that moved **down**.
4. **t8 outcome differs (recovery command).** DSH r2 recovered with `npm run check`, whose nested chain includes `format:check` and whose captured output corroborates the step, so the frozen detector credited `t8.recovery_validation`; OpenCode r1 used `npm run lint` and failed. **This is at least partly an evidence-capture difference** (DSH surfaced the umbrella script's nested `prettier . --check` output inline), and a strict reading could question credit for an umbrella command; recorded as Pass with that caveat.
5. **t4 automated disagreement with r1 is a scorer-phrasing artifact, not a harness difference.** DSH r2's verdict wording matched the frozen regex; OpenCode r1's did not. Both runs genuinely satisfied the requirement; adjudicated Pass in both.
6. **Permission surface.** DSH `workspace-write` grants `/tmp` writes and unconfined reads (no denial in this run); OpenCode enforced `external_directory: deny` (one denial in r1). DSH has **no network-policy knob** — bash-level `curl`/`wget` remain possible in both harnesses, but neither attempted them here.
7. **Runtime length.** DSH r2 ran longer overall (1,422 s vs 1,090 s) and t2 in particular was much longer (473.9 s vs 315.6 s), consistent with more exploratory bash steps; generation throughput was also lower in this run's interval.

## 14. Interpretation and limitations

1. **The suite does not exercise ~96K occupancy (dominant limitation).** Peak sequence was 40,385 tokens (41.51% of 97,280). The run validates the server _configured_ at ~96K run under DSH, not the ~96K _operating point_.
2. **Single run per prompt.** Non-deterministic decoding; no statistical significance; no composite score. The t5/t8 differences vs OpenCode r1 are single-run observations.
3. **Suite-level metrics only.** Per-test throughput is not available (the runner snapshots `/metrics` around the whole suite).
4. **Memory/paging not observable.** Only indirect stability evidence is reported (§15).
5. **DSH session traces are complete** (`missing=[]`, all sessions `match=exact`), but DSH one-shot sessions do not persist an OpenCode-style shared permission audit log; denial evidence is limited to what appears in tool results (there were none).
6. **t5 and t7 are genuine frozen-requirement failures** (t5 committed in a strict no-op; t7 used an external offline markdownlint instead of the repo validator).
7. **t8 credit caveat.** `t8.recovery_validation` was credited via `npm run check` (nested `format:check` with corroborating output). A strict adjudicator could keep t8 a fail if only the literal `npm run format:check` is accepted.

## 15. Server-integrity evidence (no restart)

| Counter (measured)                      | pre-smoke | before-suite | after-suite | monotonic |
| --------------------------------------- | --------: | -----------: | ----------: | --------- |
| `prompt_tokens_total`                   |   137,501 |      137,501 |     259,916 | ✔         |
| `prompt_tokens_cached_total`            |   973,206 |      973,206 |   2,557,210 | ✔         |
| `prompt_seconds_total`                  |     246.8 |        246.8 |       490.9 | ✔         |
| `tokens_predicted_total`                |    32,192 |       32,192 |      71,940 | ✔         |
| `tokens_predicted_seconds_total`        |   764.818 |      764.818 |    1,827.21 | ✔         |
| `n_decode_total`                        |    11,633 |       11,633 |      26,173 | ✔         |
| `n_tokens_max` (max, absolute)          |    29,788 |       29,788 |      40,385 | ✔         |
| `spec_decode_num_drafts_total`          |    11,182 |       11,182 |      25,235 | ✔         |
| `spec_decode_num_draft_tokens_total`    |    33,545 |       33,545 |      75,696 | ✔         |
| `spec_decode_num_accepted_tokens_total` |    21,030 |       21,030 |      46,728 | ✔         |

The pre-suite counters equal the matrix-r1 OpenCode run's after-suite counters, confirming the server was **not** restarted between run 1 and run 2. Server identity was identical before and after the suite: build `b1-60081bb`, model path unchanged, `n_ctx=97280` (both `/props` and `/v1/models` meta), model id `qwen3.8-27b-gsq-rco`, `endpoint_metrics:true`, `total_slots=1`, slot `id=0`, `speculative:true`. **No configuration change** was made at any point.

## 16. Artifact / integrity verification

- **New workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r2-dsh/` (`baseline/`, `clones/t0..t8`, `manifest.json`, `prompt.verification.json`, `config.verification.json`, `dsh-parity.patch.yml`, `baseline.meta.json`, `server.health.json`, `server.props.json`, `server.models.json`, `server.slots.json`, `server.health.after_suite.json`, `server.props.after_suite.json`, `server.models.after_suite.json`, `server.slots.after_suite.json`, `metrics.pre_smoke.prom`, `metrics.before_suite.prom`, `metrics.after_suite.prom`, `runner.log`, `runner.err.log`, `runner.pid`, `status.json`, `harness.head.txt`).
- **Results:** `…/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r2-dsh/` (`results.jsonl`, `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`, `tN.out/err/log`).
- **Prior artifacts untouched:** the matrix-r1 OpenCode workspace and report, the 8087 DSH/parity workspaces and reports, and the Sep-21 96K workspace retain their original contents; this run wrote only to the new `-matrix-r2-dsh` workspace and this report.
- **Frozen harness/scorer:** HEAD remains `48d9b54f249cd461f5456202f225bbddd156fdf9`; tracked harness, scorer, and prompt files show no diff; prompts/scorer/baseline were used verbatim; the baseline rebuilt deterministically at `ef91057c…`.
- **Repository integrity:** no staging, commit, push, reset, or other Git state change; main repository HEAD remains `48d9b54f…`. Pre-existing uncommitted application-source changes (tracked `ARCHITECTURE.md`, `README.md`, `convex/http.ts`, `worker/README.md`, `worker/src/index.js`; untracked `convex/health.ts`, `convex/lib/health.ts`, `worker/src/health.js`, `tests/health/`) were present before the run and were **not** touched. The only new repository artifact is this report.
- **DSH configuration:** `~/.dsh/settings.yaml` unmodified; no persistent DSH state changed; the parity overlay is invocation-only.

**Nothing was committed. The next matrix run was not started. The 8087 model was not switched.**

---

### Required summary

- **Matrix position:** **Run 2 of 6** — `GSQ-RCO 96K × DSH`.
- **Automated score:** **7 Pass / 2 Fail** (Fail `t5,t7`).
- **Adjudicated score:** **7 Pass / 2 Fail** (Fail `t5,t7`).
- **Per-test result table:** §5.
- **Total runtime:** **1,422 s (23.7 min)** continuous suite wall-clock; sum of test durations **1,399.1 s**.
- **Prompt tok/s:** **501.5** (non-cached, derived).
- **Generation tok/s:** **37.41** (derived).
- **MTP acceptance:** **60.97%** (mean **1.829** accepted tokens/verification step; 2.999 draft/step).
- **Maximum actual token occupancy:** **40,385** tokens (`n_tokens_max`; **41.51%** of the 97,280 window). No test approached or exceeded the validated ~96K occupancy.
- **Anomalies:** zero timeouts; zero permission denials; zero network attempts; no restarts; no configuration changes; no `robinhood` usage.
- **Key DSH-vs-OpenCode differences:** t5 moved Pass→Fail (DSH committed; model behavior); t8 moved Fail→Pass (DSH recovered via `npm run check`, partly an evidence-capture difference); t4 automated Pass vs r1's scorer-phrasing false negative (not a harness difference). See §13.
- **Report path:** `docs/development/model-reliability/qwen38-27b-gsq-rco-iq3-xxs-mtp-96k-97280-matrix-r2-dsh-frozen-harness-evaluation.md`.
