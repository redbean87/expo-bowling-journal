# Qwen3.8-Flash-Next 64K — OpenCode Frozen-Harness Reliability Evaluation

**Date:** 2026-09-19
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` ("DeepSeek V4.1 Flash"), the OpenCode Go cloud
session that coordinated the audit, the runtime-configuration setup, the smoke tests, the frozen
harness run, trace extraction, scoring, and adjudication.
**Model under test (downstream):** `qwen3.8-flash-next` (llama.cpp), server model path
`E:\QwenFlashNext\models\Qwen3.8-Flash-Next-UD-IQ3_XXS\UD-IQ3_XXS\Qwen3.8-Flash-Next-UD-IQ3_XXS-00001-of-00003.gguf`
**Provider / endpoint:** provider `qwen38-flash-next-64k` (`@ai-sdk/openai-compatible`), llama.cpp LAN
endpoint `http://192.168.68.52:8085/v1` (OpenAI-compatible server; build `b1-60081bb`).
**Exact OpenCode model ID passed to the harness:**
`qwen38-flash-next-64k/qwen3.8-flash-next`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`, all hashes verified)
**Evaluation overlay:** `<workspace>/opencode.qwen38-flash-next-64k-eval.jsonc` (sha256 `14f102f0f68c1539bcfe6070d0aa15c3e2ae6a1ab80d1f70befad50a056c9340`, 759 bytes)
**Base runtime config (`~/.config/opencode/opencode.jsonc`):** **unchanged** this task (sha256 `ccb8f175eb740edb97188e93b01ece571a933c39d0e45ecc3ab605d0276dc5eb`, identical to the value recorded in the 27B 64K report)
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-flash-next-64k`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-flash-next-64k`
(one fresh workspace + isolated clone + session per test)

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; the results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced.

---

## 1. Scope and orchestration model

Evaluate the downstream Qwen3.8-Flash-Next GGUF (llama.cpp, `UD-IQ3_XXS`) against the frozen
OpenCode `t0`–`t8` model-reliability suite, using DeepSeek V4.1 Flash as the orchestrator. This is
meta-orchestration: the orchestrator runs the process outside the evaluated clones; the frozen
harness invokes the downstream model **directly** per test. No in-run orchestrator→downstream
subagent delegation was used, and no OpenCode `agent` configuration was added.

What the orchestrator did: verified the server and effective configuration; provisioned a fresh
sanitized baseline and one isolated clone per test; ran the frozen `runner.py`, `extract_traces.py`,
and `score.py`; adjudicated the automated results against raw traces, diffs, and permission
evidence; and recorded this report.

No harness, scorer, prompt, baseline, application source, or project-configuration file was modified.

**Report provenance.** This Markdown report is an orchestrator-authored document, exactly as the
prior frozen-harness reports were. The harness has **no Markdown-report stage** — `runner.py`,
`extract_traces.py`, and `score.py` emit only JSON/JSONL artifacts — so the report is written after
scoring from those artifacts. In the first pass of this evaluation the run and scoring completed but
the report-writing step was omitted (the orchestrator reported in-session instead); this document was
then generated from the already-complete artifacts with no model re-inference.

## 2. Audit and configuration changes

### 2.1 Server audit (port 8085)

The Flash-Next experimental llama.cpp server was intentionally started on port **8085**. Read-only
probes:

```
GET http://192.168.68.52:8085/health  → HTTP 200 {"status":"ok"}
GET http://192.168.68.52:8085/v1/models
    id = qwen3.8-flash-next
    meta.n_ctx = 65536, n_ctx_train = 262144, n_params = 176943899520,
    size = 81950799360, ftype = "IQ3_XXS - 3.0625 bpw", owned_by = "llamacpp"
GET http://192.168.68.52:8085/props
    default_generation_settings.n_ctx = 65536, total_slots = 1,
    model_path = E:\QwenFlashNext\...\Qwen3.8-Flash-Next-UD-IQ3_XXS-00001-of-00003.gguf,
    build_info = "b1-60081bb", reasoning_format = "none"
```

The `n_ctx=65536` value is reported by the running server for the loaded model (both `/v1/models` and
`/props`), not merely documented in a launch script. The model is a thinking model: its chat template
emits `<think>`, and reasoning is surfaced through `reasoning_content` (the harness reads final
assistant text; reasoning is preserved raw in `raw_parts.jsonl`).

### 2.2 Configuration approach (no base-config edit)

Unlike the 27B 64K run — which had to edit the base config because the `qwen-local` provider was
declared there — the Flash-Next provider was declared **entirely inside a new isolated evaluation
overlay**:

| Setting | Value |
| ------- | ----- |
| Provider id | `qwen38-flash-next-64k` |
| `options.baseURL` | `http://192.168.68.52:8085/v1` |
| `options.timeout` (request) | `1200000` ms |
| `options.headerTimeout` | `1200000` ms |
| model key | `qwen3.8-flash-next` |
| `limit.context` / `limit.output` | `65536` / `4096` |
| `compaction.auto` | `false` |
| `mcp.robinhood-trading.enabled` | `false` |
| `permission` | `external_directory=deny`, `webfetch=deny`, `websearch=deny` |

The overlay lives in the new workspace rather than `~/.config/opencode`. This was a deliberate,
operator-approved choice: the evaluating session's own `external_directory=deny` policy blocks file
tools outside the workspace, and the overlay is a self-contained provider declaration that does not
require touching the base config. No base-config backup or edit was performed, and the 27B
configuration (`qwen-local` → `:8081`, context `65536`) remains intact and untouched (sha256
`ccb8f175…`, identical to the prior report).

**Network/timeout note.** The provider's request timeout is the same 1,200,000 ms as its header
timeout. OpenCode also has a separate `chunkTimeout` (not set here; default 300,000 ms). Neither the
harness nor the scorer was changed to accommodate the model.

## 3. Effective OpenCode configuration (verified)

`opencode debug config` with `OPENCODE_CONFIG=<workspace>/opencode.qwen38-flash-next-64k-eval.jsonc`:

| Item | Value |
| ---- | ----- |
| Providers resolved | `ollama`, `qwen-local`, `qwen38-flash-next-64k` |
| Base URL | `http://192.168.68.52:8085/v1` |
| Downstream model key | `qwen3.8-flash-next` |
| Context / output limit | `65536` / `4096` |
| `timeout` / `headerTimeout` | `1200000` / `1200000` |
| `compaction.auto` | `false` |
| `mcp.robinhood-trading.enabled` | `false` |
| `permission.external_directory` | `deny` |
| `permission.webfetch` / `websearch` | `deny` / `deny` |

The base config declares a default model (`ollama/gpt-oss:20b`), but the harness always passes
`--model`, so the evaluated model is the exact Flash-Next model above; no fallback occurred (every
session recorded `qwen38-flash-next-64k` and the exact model — §6.1).

The runner's pre-model-call `config.verification.json` recorded `ok: true`: eval-config SHA
`14f102f0…`, 759 bytes, permission block exactly equal to the canonical policy, and
`mcp.robinhood-trading` present with `enabled=false` (no violations).

## 4. Smoke tests and 64K proof

1. **Direct server smoke (short prompt, exact model):** `/v1/chat/completions` with a 63-token prompt
   and `max_tokens=64` returned `finish_reason:"stop"`, content exactly
   `FLASH NEXT SMOKE PASSED`, `completion_tokens=40`, elapsed ~10.7 s.
2. **Client smoke through OpenCode:** `opencode run -m 'qwen38-flash-next-64k/qwen3.8-flash-next' …`
   loaded the overlay, resolved `provider=qwen38-flash-next-64k model=qwen3.8-flash-next`, and began
   streaming, but did **not** complete within 1200 s. The bottleneck is prompt prefill: the OpenCode
   system prompt is ~8.6 K tokens and the running server processes prompts at ~7.6 tok/s (≈1100 s
   before generation begins), which collides with the 1,200,000 ms request timeout.
3. **Server-side 64K evidence:** `/v1/models` and `/props` both report `n_ctx = 65536` for the loaded
   model, and `/slots` reported `n_ctx = 65536`, `max_tokens = 4096` for evaluated requests.
4. **Harness evidence:** no test produced a context-overflow error. `t4` accumulated 15,686 input
   tokens across 11 steps (max single-step input 8,604) without any context-size failure.
5. **Robinhood MCP:** disabled in the effective config and **zero** occurrences of `robinhood` in the
   extracted traces; no MCP tool surface appears in any session.
6. **Permission policy:** canonical deny block verified by `config.verification.json`. The only
   runtime denial was in `t4` (one `external_directory` rejection; see §9).

## 5. Harness, baseline, and prompt integrity

| Item | Value |
| ---- | ----- |
| Suite | `opencode-t0-t8` (frozen `ground_truth.json`) |
| Harness commit | `48d9b54f249cd461f5456202f225bbddd156fdf9` |
| Harness/scorer/prompt drift | none (`git status --porcelain` on those dirs empty) |
| Baseline HEAD | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` |
| Baseline source ref | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03` |
| Baseline tree | `feca1f64fa1f9479f42b0745968ccf41f647d870` |
| Tracked files | 338 |
| Prompt verification | all `t0`–`t8` SHA-256 and byte lengths match (`ok: true`, no issues) |
| Tracked repo changes | none (only the pre-existing untracked evaluation docs + this report) |

**Harness-version note (important for comparison).** This run used harness commit `48d9b54`, which is
one commit **after** the 27B 64K run's `a31d1a3`. The intervening commit
(`fix: normalize markdown emphasis in reliability scorer`) changes only the scorer's Markdown
emphasis handling and adds no harness-behavior change; the prompts and baseline are byte-identical.
The 27B 64K report itself recommended this exact fix. Automated t4 results are therefore scored under
the corrected detector here (see §7 and §10).

## 6. Per-test results (`t0`–`t8`)

### 6.1 Execution summary

Every session matched its clone directory exactly (`match=exact`), used
`provider=qwen38-flash-next-64k` and `session_model=qwen3.8-flash-next`, and every clone started
clean at baseline HEAD and ended clean. No harness per-test (2400 s) timeout occurred.

| # | Session id | Duration (s) | rc | Tokens in/out | Max step input | Commits | Rejections | Automated |
| - | ---------- | ------------ | -- | ------------- | -------------- | ------- | ---------- | --------- |
| t0 | `ses_f47be4641ffePu0ZnlWrY8G3YC` | 1099.9 | 0 | 8562 / 197 | 8562 | 0 | 0 | Pass |
| t1 | `ses_f47ad613bffevXklIwrHj9Fixq` | 1173.1 | 0 | 8692 / 369 | 8602 | 0 | 0 | Pass |
| t2 | `ses_f479b5cb1ffeferLWzDWshsY4l` | 1204.2 | 1 | 0 / 0 | — | 0 | 0 | Fail |
| t3 | `ses_f4788e07bffe1w8WbgMdL3D0KO` | 1247.6 | 0 | 8879 / 667 | 8561 | 0 | 0 | Pass |
| t4 | `ses_f4775bae2ffe6QeT8SAm6q3knA` | 2313.4 | 0 | 15686 / 5370 | 8604 | 0 | 1 | Pass |
| t5 | `ses_f47524f75ffelG9MW1tM3WpQ7N` | 1204.8 | 1 | 0 / 0 | — | 0 | 0 | Fail |
| t6 | `ses_f473fd460ffem4XJo9R5joy6De` | 1363.7 | 0 | 10081 / 421 | 8558 | 0 | 0 | Pass |
| t7 | `ses_f472ae9d7ffeik7HvsikD1emqU` | 1428.5 | 0 | 10117 / 1460 | 8578 | 0 | 0 | Pass |
| t8 | `ses_f4714faa5ffe0381BKali7BLf5` | 1204.2 | 1 | 0 / 0 | — | 0 | 0 | Fail |

Token figures are totals summed over completed model steps (from session `step-finish` parts).
Aborted runs (t2, t5, t8) completed no step, so no usage was recorded.

### 6.2 Per-test notes

- **t0 — Smoke / self-identification — Pass.** No tools; reported the exact model id
  (`qwen38-flash-next-64k/qwen3.8-flash-next`) and the correct clone cwd.
- **t1 — File/path recovery + line count — Pass.** Corrected the wrong path to `docs/domain-model.md`,
  reported **205** lines, no Git, no modification.
- **t2 — Scoped edit + one commit — Fail.** Emitted an initial reasoning block and then the request
  hit the **provider request timeout** (1,200,000 ms) before any tool call completed; no edit, no
  validator run, no diff review, no commit. Tree clean.
- **t3 — Content search for PinPal — Pass.** `rg` search; correct exact-case total (**11**) and a
  complete path list; no modification.
- **t4 — Semantic judgment of the asterisks-in-table-cells claim — Pass.** Delivered the verdict
  *"Claim: False."* with evidence (GFM table cells parse inline emphasis; repo uses the pattern),
  ran Prettier (`npm run format:check`) as the repository's Markdown validator, and made no
  modification. One `external_directory` denial occurred (the model attempted a path under
  `.eval-tmp/opencode/*`), correctly enforced and unrelated to the task outcome. This is the task
  that the 27B run's scorer false-negatived; under the corrected scorer it passes.
- **t5 — Mandatory ordered no-op workflow — Fail.** Ran `ls`, then a `read` tool call was aborted,
  then the request hit the **provider request timeout** before running the validator or reviewing the
  working tree. No commit; tree clean.
- **t6 — Identify + run format check — Pass.** Identified and ran `npm run format:check`, reported
  the Prettier warning and exit code; no modification.
- **t7 — Validator twice + `git status` — Pass.** Ran `npx prettier --check docs/domain-model.md`
  **twice** with separate outputs, reported `git status` (`working tree clean`), no modification.
- **t8 — Invalid-command recovery — Fail.** Produced no assistant text or tool calls; the first
  request hit the **provider request timeout** during prefill, so neither invalid command was
  reported and no recovery occurred.

## 7. Scores

**Raw automated scorer output:**

```
scored 9 tests for variant qwen38-flash-next-64k: {'pass': 6, 'fail': 3}
  t2: fail unmet=['t2.modified_domain_model', 't2.validator_run', 't2.diff_reviewed', 't2.exactly_one_commit']
  t5: fail unmet=['t5.validator_run', 't5.working_tree_reviewed']
  t8: fail unmet=['t8.invalid_markdownlint', 't8.invalid_git_statuss', 't8.recovery_validation', 't8.recovery_git_status']
wrote …/results/qwen38-flash-next-64k/score.json
```

- **Automated:** 6 Pass (t0, t1, t3, t4, t6, t7) / 3 Fail (t2, t5, t8); 10 unmet requirements.
- **Adjudicated:** **6 Pass** (t0, t1, t3, t4, t6, t7) / **3 Fail** (t2, t5, t8) — no reversal applies
  (§8).

All 27 common requirements (`prompt_verified`, `baseline_head`, `clean_before`) passed for every test.

## 8. Adjudication

| # | Automated | Adjudicated | Rationale |
| - | --------- | ----------- | --------- |
| t0 | Pass | Pass | Exact model id + cwd, no tools. |
| t1 | Pass | Pass | Correct path/line count; no Git/modification. |
| t2 | Fail | Fail | Provider request timeout before any tool call; no deliverable. Genuinely unmet. |
| t3 | Pass | Pass | Correct 11 files/paths. |
| t4 | Pass | Pass | Verdict delivered ("Claim: False."); validator run; no change. |
| t5 | Fail | Fail | Provider request timeout; validator/working-tree review never ran. Genuinely unmet. |
| t6 | Pass | Pass | Validator identified/run/reported. |
| t7 | Pass | Pass | Validator twice (separate outputs) + `git status`; no modification. |
| t8 | Fail | Fail | Provider request timeout during prefill; no commands reported or recovered. Genuinely unmet. |

Unlike the 27B 64K run (where t4 was a scorer false negative), **no automated verdict required
reversal here**: the three failures have zero assistant output and zero completed tool calls, so there
is no evidence to adjudicate in the model's favor.

## 9. Failure classifications

| # | Automated | Adjudicated | Primary classification | Secondary |
| - | --------- | ----------- | ---------------------- | --------- |
| t2 | Fail | Fail | **Provider request timeout** (1,200,000 ms) before any tool call | Incomplete task / no deliverable |
| t5 | Fail | Fail | **Provider request timeout** after one `ls` and an aborted `read` | Incomplete task / no deliverable |
| t8 | Fail | Fail | **Provider request timeout** during prompt prefill (zero output) | Incomplete task / no deliverable |

No failure is attributable to invocation, transport, context-window exhaustion, or permission policy.
The only permission denial (`t4`) was correctly enforced and did not affect the result. Every harness
per-test timeout (2400 s) was avoided; the limiting factor was the **provider-level 1,200,000 ms
request timeout**, which the ~7.6 tok/s prompt prefill over an ~8.6 K-token system prompt approaches
or exceeds.

## 10. Comparison with the prior Qwen3.8-27B 64K evaluation

| Run | Context | Automated | Adjudicated |
| --- | ------- | --------- | ----------- |
| Qwen3.8 27B (64K, prior) | 65,536 | 6 Pass / 3 Fail: **t0,t1,t3,t6,t7,t8** / t2,t4,t5 | **7 Pass / 2 Fail**: t0,t1,t3,t4,t6,t7,t8 / t2,t5 |
| Qwen3.8-Flash-Next (64K, this run) | 65,536 | 6 Pass / 3 Fail: **t0,t1,t3,t4,t6,t7** / t2,t5,t8 | **6 Pass / 3 Fail**: t0,t1,t3,t4,t6,t7 / t2,t5,t8 |

Per-test changes:

- **t4: automated Fail → Pass.** The prior 27B 64K run delivered the correct verdict but the then-current
  scorer's regex missed the Markdown-emphasised `claim is **false**`; that scorer was corrected
  (commit `48d9b54`) before this run, so the same correct behaviour now scores Pass. The change is a
  **scorer correction**, not (by itself) a model difference.
- **t8: Pass → Fail.** The 27B model completed t8 within budget; Flash-Next produced no output before
  the provider request timeout.
- **t2 and t5: Fail → Fail.** The 27B failures were a 900 s wall-clock timeout (t2) and a genuine
  no-op scope violation (t5). Flash-Next's failures are provider request-timeout aborts with no
  deliverable, a different failure mode.
- Automated aggregate is **unchanged at 6/9**; the adjudicated count is **6/9 vs the prior 7/9**.

**Comparability statement.** Both runs use the same frozen harness procedure, baseline HEAD, prompt
set, isolation model, and scorer lineage; t4 is directly comparable once the scorer correction is
accounted for. The 27B run used harness commit `a31d1a3`, this run `48d9b54` (scorer-only change).
The dominant difference in outcome is operational: Flash-Next is ~177 B parameters on a single server
slot with ~7.6 tok/s prompt throughput, so its first request regularly approaches the configured
1,200,000 ms request timeout, whereas the 27B model completed within it.

## 11. Remaining limitations and recommended next steps

1. **Request timeout is the binding constraint.** With ~7.6 tok/s prefill on an ~8.6 K-token system
   prompt (~1100 s), the 1,200,000 ms provider request timeout leaves little margin; three tests
   aborted. If this model is to be re-evaluated, raise `options.timeout`/`options.headerTimeout`
   (and consider `chunkTimeout`) or reduce prefill cost (prompt caching / smaller harness system
   prompt) — as a deliberate, documented change. **No rerun was performed here.**
2. **Harness per-test timeout is not the limit.** The 2400 s per-test budget was never reached;
   failures occurred at the provider layer. This should be distinguished when comparing timeout
   statistics across models.
3. **Scorer-version drift across runs.** The 27B 64K run should be interpreted against scorer
   `a31d1a3`; the corrected `48d9b54` scorer is used from this run onward. Automated t4 comparisons
   must account for this.
4. **2048/4096 output limit.** The output limit is unchanged at 4096; no output-loss event occurred,
   but the thinking channel consumes budget on reasoning-heavy tasks.
5. **Single-run evidence.** One run per prompt; re-run for variance before drawing conclusions about
   the failing tests.

## 12. Artifacts

- Per-test workspaces: `/Users/cortezashley/.local/share/opencode-evals/qwen38-flash-next-64k/`
  (`baseline/`, `clones/t0..t8`, `baseline.meta.json`, `baseline.validation.json`,
  `clones.validation.json`, `prompt.verification.json`, `config.verification.json`, `manifest.json`,
  `model-server.verification.json`, `status.json`).
- Results: `…/results/qwen38-flash-next-64k/` (`results.jsonl`, `raw_parts.jsonl`, `traces.txt`,
  `trace.summary.json`, `permissions.json`, `score.json`, `tN.out/err/log`,
  `permissions/tN.*`).
- Evaluation overlay: `…/qwen38-flash-next-64k/opencode.qwen38-flash-next-64k-eval.jsonc`
  (sha256 `14f102f0…`).

**Repository integrity.** The only new repository artifact is this report. No application source,
dependency, package file, prompt, harness, scorer, or baseline was changed; no Git state was altered
and nothing was committed. The prior 27B 64K workspace and its report were not modified.
