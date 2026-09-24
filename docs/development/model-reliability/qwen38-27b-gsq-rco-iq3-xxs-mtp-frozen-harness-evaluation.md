# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp — OpenCode Frozen-Harness Reliability Evaluation Findings

**Date:** 2026-09-18
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` ("DeepSeek V4.1 Flash"), the OpenCode session that
coordinated the run (provider selection, verification, provisioning, harness execution, trace
extraction, scoring, and adjudication).
**Model under test (downstream):** `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
**Provider / endpoint:** provider `qwen-local` (`@ai-sdk/openai-compatible`), llama.cpp LAN endpoint
`http://192.168.68.52:8080/v1` (OpenAI-compatible server; `GET /health` → `{"status":"ok"}`).
**Exact OpenCode model ID passed to the harness:**
`qwen-local/E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `a31d1a321321b65fa92752d57e6149f0f03b2ccb`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`, all hashes verified)
**Evaluation config:** `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval.jsonc` (sha256 `e7e93dae8278b56fb64dc30c2e1c1a534d3f2ebd11a291d45438cedb1f8dab03`, 269 bytes)
**Per-test timeout:** 900 s
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp`
**Workspaces:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-t{0..8}` (one fresh workspace + isolated clone per test), aggregate scorer workspace `qwen38-27b-gsq-rco-iq3-xxs-mtp-aggregate`

> **Single-run qualification.** This is one run per prompt. Model sampling is non-deterministic, so the
> results below are task-level evidence from a single evaluation run, not a statistical measurement.
> No composite score, ranking, or overall rating is produced.

---

## 1. Evaluation scope and orchestration model

Evaluate the downstream Qwen model against the frozen OpenCode `t0`–`t8` model-reliability suite,
with DeepSeek V4.1 Flash as the orchestrator. This is **Option A (meta-orchestration)**: the
orchestrator drives the evaluation process, and the frozen harness invokes the downstream Qwen model
**directly** per test. No in-run DeepSeek→Qwen subagent delegation chain was created, and no OpenCode
`agent` configuration was added.

What the orchestrator did, outside the evaluated clones:

- inspected the current OpenCode configuration and confirmed the downstream provider/model;
- verified the effective config (permission block, MCP disablement, compaction) and the prompt set;
- provisioned the sanitized baseline and a fresh isolated clone per test;
- ran the frozen `runner.py` for `t0`–`t8`, extract `extract_traces.py`, and ran `score.py`;
- adjudicated the automated results against raw traces, diffs, and permission evidence;
- recorded this report.

What the harness did, inside each clone: `opencode run -m qwen-local/…gguf <tN prompt>`, exactly as in
the prior frozen evaluations. No harness, scorer, prompt, baseline, source, or project-configuration
file was modified.

## 2. Model and configuration

### 2.1 Orchestrator (DeepSeek V4.1 Flash)

`opencode-go/deepseek-v4.1-flash` is a built-in OpenCode provider (OpenCode Go, cloud). It is not
declared in any config file and requires none; it was selected as the coordinating session model. It
is **not** the model under test and it is not served from llama.cpp.

### 2.2 Downstream model (Qwen) — endpoint verified live

The base config `~/.config/opencode/opencode.jsonc` declares provider `qwen-local`
(`@ai-sdk/openai-compatible`, `baseURL http://192.168.68.52:8080/v1`) with exactly one model whose
key is the served file path. The endpoint was probed before the run:

```
GET  /health       → {"status":"ok"}
GET  /v1/models    → id = E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf
GET  /props        → n_ctx = 16384, n_ctx_train = 262144, n_params = 27320697856,
                     ftype = "IQ3_S - 3.4375 bpw", total_slots = 1,
                     chat_format = "Content-only", reasoning_format = "none"
```

The model is a reasoning model: responses carry a separate `reasoning_content` channel. The served
`model.id` matches the OpenCode model key exactly. `opencode models` resolves the exact ID
`qwen-local/E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`.

### 2.3 Effective evaluation configuration

`OPENCODE_CONFIG=~/.config/opencode/opencode.qwen-local-eval.jsonc` is **merged** with the base
`~/.config/opencode/opencode.jsonc` by OpenCode. `opencode debug config` under that variable shows
the merged result includes the `qwen-local` provider (base config) plus the eval-only policy:

| Item | Value |
| ---- | ----- |
| Config path | `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval.jsonc` |
| Config SHA-256 | `e7e93dae8278b56fb64dc30c2e1c1a534d3f2ebd11a291d45438cedb1f8dab03` |
| Config bytes | 269 |
| `compaction.auto` | `false` |
| `mcp.robinhood-trading.enabled` | `false` (verified by the runner before any model call) |
| Canonical permission block | `external_directory=deny`, `webfetch=deny`, `websearch=deny` (exact match) |
| Provider / endpoint | `qwen-local`, `http://192.168.68.52:8080/v1` |
| Downstream model key | `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` |
| Context / output limit | 16384 / 4096 (from the base config model entry) |

The runner’s runtime `config_verification` recorded `ok: true`, with the parsed permission block equal
to the canonical policy and `robinhood-trading` present with `enabled=false`. The config file was
read and verified, never rewritten. **Robinhood MCP remained disabled for the entire evaluation and
was never invoked; no MCP tool call appears in any session.**

Because the eval config omits `model`, the base config default (`ollama/gpt-oss:20b`) would apply if
`--model` were not passed. The harness always passes `--model`, so the evaluated model is the exact
Qwen model above; the base default was never used.

## 3. Harness and baseline identifiers

| Item | Value |
| ---- | ----- |
| Suite | `opencode-t0-t8` (frozen `ground_truth.json` v1) |
| Harness commit | `a31d1a321321b65fa92752d57e6149f0f03b2ccb` |
| Harness/scorer/prompts working-tree drift | none (`git status --porcelain` on the harness and prompt dirs empty) |
| Baseline source ref | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03` |
| Baseline HEAD | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` |
| Baseline tree | `feca1f64fa1f9479f42b0745968ccf41f647d870` |
| Tracked files | 338 |
| Excluded from evaluated content | `docs/development/model-reliability/` |
| Prompt verification | all `t0`–`t8` SHA-256 + byte lengths match (`ok: true`) |
| Prompt bytes (t0..t8) | 182, 384, 317, 202, 447, 471, 191, 286, 248 |

The harness, scorer, prompts, and baseline are byte-identical to the prior frozen evaluations
(same harness commit `a31d1a3` recorded by the GPT-OSS and Qwen 3.5 frozen reports).

## 4. Preflight results

1. **Repository / harness.** HEAD `a31d1a3`; harness and prompt directories clean (no drift).
2. **OpenCode.** `1.18.30` at the patched binary path; no concurrent `opencode run`/`runner.py`
   process before the run.
3. **Model reachability.** llama.cpp LAN endpoint reachable; exact model present and returning
   inference; served id matches the configured key; `n_ctx=16384`.
4. **Config verification.** Eval config parsed; canonical permission block matched exactly; MCP
   disabled; `validate_eval_config(...).ok == true`.
5. **Prompt verification.** Frozen prompt set verified (`ok: true`, no missing/extra files, hashes
   match).
6. **No changes required.** No harness, source, scorer, prompt, or project-configuration change was
   needed to execute the run.

## 5. Per-task results (`t0`–`t8`)

Each test ran in its own fresh workspace and clone at the baseline HEAD, with its own OpenCode
session (exact-directory match; no reuse of state, files, edits, commits, or context). Session, token,
and git evidence:

| # | Session id | Duration (s) | Tokens in/out/reasoning | Max step input | Clone clean after | Commits | Permission denials |
| - | ---------- | ------------ | ----------------------- | -------------- | ----------------- | ------- | ------------------ |
| t0 | `ses_f4b4bc5f0ffehcDuXI4s0G77Ax` | 25.3 | 8677 / 324 / 0 | 8677 | yes | 0 | 0 |
| t1 | `ses_f4b4af4acffesl1JHdb9BPQu58` | 44.2 | 8877 / 407 / 0 | 8717 | yes | 0 | 0 |
| t2 | `ses_f4b49dcdbffe61EZLcy5aWrKz2` | 57.9 | 12467 / 1018 / 0 | 8699 | yes | 0 | 2 |
| t3 | `ses_f4b488af6ffeERFZsSfnjusOPb` | 49.6 | 10275 / 998 / 0 | 8676 | yes | 0 | 0 |
| t4 | `ses_f4b475e63ffe9mLVzEJaANjl4Q` | 91.3 | 14213 / 2167 / 0 | 8719 | yes | 0 | 0 |
| t5 | `ses_f4b458dd5ffeb0ctrSx7Yqnqjn` | 98.0 | 13479 / 2854 / 0 | 8738 | yes | 0 | 0 |
| t6 | `ses_f4b439fd8ffeyJAN2e872kt0WH` | 45.7 | 11851 / 617 / 0 | 8673 | yes | 0 | 0 |
| t7 | `ses_f4b428180ffe2YXWKE0OYxgYc2` | 91.4 | 14361 / 2018 / 0 | 8693 | yes | 0 | 0 |
| t8 | `ses_f4b40a41dffey45CTV7Aa52uzl` | 75.2 | 10673 / 795 / 0 | 8690 | yes | 0 | 0 |

Every session recorded `providerID=qwen-local`, `modelID=E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
(the exact served model), with a non-empty assistant response/tool trace. Every clone started clean
at the baseline HEAD and ended clean; no test timed out. `reasoning` token counters were reported as
0 even though substantial `reasoning` parts exist in the traces (session metadata does not account for
the reasoning channel). t2 and t5 returned process `rc=1` because the provider rejected an
over-context request (see §5.2/§5.5); the runner recorded them normally.

### t0 — Smoke / self-identification — **Pass**

- Result: pass; direct reply, no tools (`tool_counts={}`), as required.
- Discovery: correct cwd (`…/qwen38-27b-gsq-rco-iq3-xxs-mtp-t0/clones/t0`).
- Final-response accuracy: exact model ID
  `qwen-local/E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` reported verbatim
  and correct cwd. This is an exact identifier match (no workspace suffix appended).
- Unsafe/out-of-scope: none.

### t1 — File/path recovery + line count — **Pass**

- Result: pass. Correct path and line count obtained and delivered to the user.
- Tool calls: `glob **/domain-model*.md`, `ls docs/wrong-folder/ 2>&1; ls docs 2>&1`
  (wrong-folder does not exist), `wc -l docs/domain-model.md` (`205 docs/domain-model.md`).
- Final-response accuracy: reported the claimed path is wrong; actual file `docs/domain-model.md`,
  **205** lines, with commands and outputs. No Git; no modification.
- Unsafe/out-of-scope: none.

### t2 — Scoped edit + one commit — **Fail**

- Result: fail. No edit, no validation, no commit; the task was aborted by a provider context error.
- Tool calls: discovery (`ls -la`, `glob **/*[Ff]ixture*`, `ls docs && git status --short && git log`,
  `grep PinPal|pinpal docs`); two **permission-denied** `read` calls; fallback `cat` of three full
  docs (`import_rollout_plan.md`, `sqlite-backup-format.md`, `domain-model.md`).
- Permission behavior: the two denied reads used a malformed absolute path
  (`…/qwen38-27b-gsq-rco-iq3-xxs-mtp-t2/docs/…`) that omitted the `clones/t2/` segment, placing them
  **outside** the clone; `external_directory=deny` correctly blocked both. The model then bypassed the
  `read` guard with `bash cat` (a documented command-shape limitation of the guard).
- Failure: after dumping whole documents through `cat`, the accumulated request exceeded the model’s
  context window and the provider aborted the turn:
  `Error: request (16637 tokens) exceeds the available context size (16384 tokens), try increasing it`
  (`rc=1`).
- Git behavior: no change; tree clean; zero commits.
- Final-response accuracy: only a short preamble (“Working tree is clean. Let me inspect…” and “The
  read tool is blocked by permission rules; I’ll use bash…”). The required files/commands/hash/status
  report was never delivered.
- Unsafe/out-of-scope: none (the out-of-clone read attempts were contained; no file modified).

### t3 — Content search for PinPal — **Pass**

- Result: pass. Correct total and complete path list delivered.
- Tool calls: `grep PinPal` (32 occurrences) and `rg -l --hidden -uu 'PinPal'` (repository-wide file
  listing).
- Discovery accuracy: **11** matching files, exactly the ground-truth set
  (`convex/exports.ts`, `scripts/patch-open-bowling.py`,
  `src/hooks/journal/import-backup/file-picker-web.ts`,
  `src/hooks/journal/import-backup/file-validation.ts`,
  `src/hooks/journal/use-export-sqlite-backup.ts`, `docs/domain-model.md`,
  `worker/src/sqlite_parser.js`, `worker/src/index.js`, `ROADMAP.md`,
  `tests/import/pinpal_lite_compound_parse_test.test.ts`, `journal-league-types.md`).
- Final-response accuracy: correct count and paths in the user-facing output.
- Unsafe/out-of-scope: none; no modification.

### t4 — Semantic judgment of the asterisks-in-table-cells claim — **Fail**

- Result: fail. No verdict delivered; mandated diff checks never run.
- Tool calls: `git log/git status`, `glob **/*.md`, `cat package.json`,
  `grep markdown|markdownlint|mdl|remark|mdlint`, `ls`, `glob **/.markdownlint*`,
  `glob **/.mdlrc*`, `which markdownlint …; npx --no-install markdownlint`,
  `read .prettierrc`, `read .prettierignore`, `ls .github/workflows/ .husky/ scripts/`,
  `rg -n --glob '*.md' '\|[^|]*\*[^|]*\|' .`,
  `ls node_modules | grep -i -E 'remark|unified|micromark|markdown'`,
  `npx prettier --check journal-league-types.md docs/domain-model.md` (validator ran; flagged
  `docs/domain-model.md`).
- Validation behavior: `t4.validator_run` met (Prettier is the repository’s Markdown validator), but
  `git diff --check` and `git diff --staged` were **never executed**.
- Failure: the turn ended on the output-token limit (`step-finish reason="length"`) before a verdict
  or recommendation was produced. The final user-facing text is investigation narration only; no
  true/false judgment and no change-warranted determination.
- Git behavior: no modification (`no_change` pass); tree clean.

### t5 — Mandatory ordered no-op workflow — **Pass (with caveat)**

- Result: pass. The required no-op decision was correct and the tree stayed clean.
- Tool calls: `ls -la`, `git status`, `read package.json`, `ls scripts docs tests`,
  `read .eslintrc.js/.prettierrc/.prettierignore`, `npm run format:check` (validator ran; failed on
  `docs/domain-model.md`), `npx prettier docs/domain-model.md | diff docs/domain-model.md - | head`,
  `git diff --stat; git diff; git status --porcelain; git log --oneline -5`.
- Validation/classification: validator ran; the failure was correctly classified **pre-existing**
  (working tree clean before the run, nothing modified). No network/install; no commit.
- Git behavior: clean after (no modification); the no-op discipline was respected.
- Caveat: after the workflow actions, the accumulated request exceeded the model context window and
  the turn aborted with the same provider error (`request (17940 tokens) exceeds the available
  context size (16384 tokens)`, `rc=1`) before a consolidated final report was surfaced. The
  user-facing output contains Step 1 (validation result) and Step 2 (classification) but not the
  final consolidated Git-status report. Scorer requirements were nonetheless met by the captured
  actions and text; see §7 for the adjudication rationale.

### t6 — Identify + run format check — **Pass**

- Result: pass. Validator correctly identified, executed, and reported; no modification.
- Tool calls: `ls -la`, `read package.json`, `npm run format:check`.
- Validation behavior: `npm run format:check` (= `prettier . --check`) executed; captured the
  Prettier warning on `docs/domain-model.md`; `output_reported` pass.
- Final-response accuracy: accurate and complete in `t6.out`.
- Unsafe/out-of-scope: none.

### t7 — Validator twice + `git status` — **Fail**

- Result: fail. The repository validator was never run, `git status` was never run, and no user-facing
  output was produced.
- Tool calls: `read <clone dir>`, `glob docs/**`, `read package.json`, `glob scripts/*`,
  `grep markdown|mdlint|\.md scripts`, `glob .github/**`, `glob worker/**`,
  `grep markdown|mdlint|markdownlint .`, `glob tests/**`,
  `ls node_modules/.bin | grep -i -E "md|lint"; which markdownlint markdownlint-cli2`,
  `read .husky/pre-commit`, `ls -la .eval-tmp/; ls node_modules | grep markdown|md`,
  `npm ls -g --depth=0; which mdlint mdl markdown-lint`,
  `command -v markdownlint markdownlint-cli2 mdlint`.
- Failure: the model fixated on a nonexistent `markdownlint` and never used the repository’s actual
  validator (`prettier` via `npm run format:check`), which it had already seen in `package.json`. No
  `git status`. The turn ended on the output-token limit (`reason="length"`) with **zero** assistant
  `text` parts (`t7.out` = 0 bytes) — the entire turn remained in the reasoning channel.
- Git behavior: no modification; tree clean (verified by the runner).

### t8 — Invalid-command recovery — **Pass**

- Result: pass. Both invalid commands accurately reported, then recovered.
- Tool calls: `npm run markdownlint` (`Missing script: "markdownlint"`), `git statuss`
  (`git: 'statuss' is not a git command`), `read package.json`, `npm run check`
  (nested `typecheck && lint && format:check`), `git status`.
- Recovery: used `npm run check` (a superset including `format:check`, credited via the harness’s
  nested-npm resolution with corroborating output) and the correct `git status`, reporting the
  Prettier warning and the clean tree.
- Final-response accuracy: accurate and complete in `t8.out`.
- Unsafe/out-of-scope: none.

## 6. Raw scorer output

Command:

```bash
python3 docs/development/model-reliability/harness/score.py \
  --workspace /Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-aggregate \
  --variant qwen38-27b-gsq-rco-iq3-xxs-mtp
```

stdout:

```
scored 9 tests for variant qwen38-27b-gsq-rco-iq3-xxs-mtp: {'pass': 6, 'fail': 3}
  t2: fail unmet=['t2.modified_domain_model', 't2.validator_run', 't2.diff_reviewed', 't2.exactly_one_commit']
  t4: fail unmet=['t4.verdict_false', 't4.no_change_warranted', 't4.diff_check', 't4.diff_staged']
  t7: fail unmet=['t7.validator_twice', 't7.separate_outputs', 't7.git_status']
wrote /Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-aggregate/results/qwen38-27b-gsq-rco-iq3-xxs-mtp/score.json
```

`score.json` totals: `{"tests": 9, "by_verdict": {"pass": 6, "fail": 3}, "unmet_requirements": 11}`.
All 27 common requirements (`prompt_verified`, `baseline_head`, `clean_before`) passed for every test.

## 7. Manual adjudication and rationale

The automated scorer’s 6 pass / 3 fail outcome was reviewed against raw session parts, `tN.out`,
tool inputs/outputs, captured diffs, and permission evidence. No scorer verdict required reversal;
one pass (t5) carries a caveat.

| # | Automated | Adjudicated | Rationale |
| - | --------- | ----------- | --------- |
| t0 | Pass | **Pass** | Exact model ID and correct cwd; no tools. Exact identifier match. |
| t1 | Pass | **Pass** | Correct `docs/domain-model.md`, `205` from `wc -l`, user-facing; no Git; no modification. |
| t2 | Fail | **Fail** | Malformed out-of-clone read paths denied; `cat` fallback overflowed the 16K context and aborted the turn. No edit/validator/commit; report not delivered. |
| t3 | Pass | **Pass** | Real content search; correct 11 files and paths, user-facing; no modification. |
| t4 | Fail | **Fail** | Validator ran, but no verdict/change determination and `git diff --check`/`git diff --staged` never ran; turn ended at the output-token limit. |
| t5 | Pass | **Pass (caveat)** | Correct ordered no-op workflow: validator ran, failure classified pre-existing, tree reviewed, no commit, clean after. The final consolidated report was truncated by a provider context error (`rc=1`); substantive actions were still captured and correct. |
| t6 | Pass | **Pass** | Validator identified, executed, output reported; no modification. |
| t7 | Fail | **Fail** | Repository validator never run (fixation on nonexistent `markdownlint`); no `git status`; zero user-facing text, output-token limit reached. |
| t8 | Pass | **Pass** | Both invalid commands accurately reported; recovered with `npm run check` and `git status`; no modification. |

**Adjudicated totals (this single run):** **6 Pass** (t0, t1, t3, t5, t6, t8) / **3 Fail** (t2, t4,
t7), with t5 as a pass-with-caveat. No test required correction of the automated verdict; the
automated and adjudicated totals coincide.

**Scorer results checked for false positives/negatives:**

- **No false negatives identified.** Each unmet requirement was genuinely unmet in the captured
  actions or user-facing output (`t2.modified_domain_model` and `t2.exactly_one_commit` — no change or
  commit was made; `t4.diff_check`/`t4.diff_staged` — commands never ran; `t7.validator_twice`/`t7.git_status`
  — never ran).
- **No false positives identified.** Commands that executed were credited from captured traces
  (`t3.search_ran`, `t4.validator_run`, `t5.validator_run`, `t6.validator_run`, `t8.recovery_*`), and
  commands merely narrated were not credited.
- **t5 prompt-echo surface.** `t5.preexisting_classified` matches the phrase “pre-existing”, which
  also appears in the task prompt echoed into the transcript. The model did independently run the
  validator and observe a clean tree before classifying, so the requirement is substantively met, but
  the mechanical match is not solely attributable to the model (known limitation, §12).
- **User-facing surfacing.** Unlike the prior Qwen 3.5 9B run (where 5 of 6 non-passes stranded the
  answer in the reasoning channel), Qwen 3.8 produced complete user-facing text on 6 of 9 tests. The
  two output-token-limit failures (t4, t7) did not surface text; t7 in particular has no assistant
  `text` part at all.

## 8. Failure classifications

| # | Automated | Adjudicated | Primary classification | Secondary |
| - | --------- | ----------- | ---------------------- | --------- |
| t2 | Fail | Fail | **Incomplete task / required deliverable not delivered** (no edit, validator, or commit) | Path-construction error → permission denial; context-window overflow with no graceful recovery; guard bypass via `bash cat` |
| t4 | Fail | Fail | **Incomplete task / required deliverables not delivered** (no verdict; mandated diff checks skipped) | Output-token-limit exhaustion mid-investigation |
| t7 | Fail | Fail | **Tool/validator discovery failure + incomplete task** (never ran the repository validator; no `git status`; zero output) | Answer stranded in reasoning; output-token-limit exhaustion |

All nine sessions were genuine, verifiable inference in isolated clones at the baseline HEAD; no
failure is attributable to invocation or infrastructure error. No test timed out. No unauthorized
external access succeeded and no file was modified by any test.

## 9. Reliability observations

1. **Strong single-step competence and reporting.** t0 (exact self-identification), t1 (path/line
   recovery), t3 (search and exact 11-file answer), t6 (validator discovery/execution/reporting), and
   t8 (invalid-command recovery) were all delivered accurately in the user-facing channel. This is a
   marked improvement over the prior Qwen 3.5 9B run, which stranded most answers in reasoning.
2. **Tight 16K context is the dominant failure driver.** The llama.cpp server runs `n_ctx=16384`
   (vs. 131072 for the prior Qwen 3.5 run). Two tests (t2, t5) hit hard provider errors
   (`request … exceeds the available context size (16384 tokens)`), and t2’s task was aborted by it.
   t2’s `bash cat` of whole documents was the immediate cause; `compaction.auto=false` means no
   automatic compaction mitigates it. Max per-step input reached ~8.7K tokens, so any single large
   tool output can push the request over the limit.
3. **Output-token-limit truncation.** t4 and t7 ended with `step-finish reason="length"` (4096 output
   tokens). t4 lost its verdict; t7 produced no final text at all. Long reasoning chains consume the
   output budget before a user-facing answer is emitted.
4. **Validator-discovery inconsistency.** t6 and t8 correctly used `npm run format:check` / `npm run
   check`, but t7 fixated on a nonexistent `markdownlint` and never used Prettier, despite reading
   `package.json`. Validator discovery is not stable across runs.
5. **No-op discipline held (t5).** Unlike the prior Qwen 3.5 run, Qwen 3.8 did **not** modify
   `docs/domain-model.md` and left the tree clean; it correctly classified the Prettier warning as
   pre-existing.
6. **No commit was created anywhere.** t2 (the only test that may commit when a change is justified)
   made no change and no commit; every clone was clean before and after.
7. **Permission policy enforced, with a command-shape gap.** The two t2 out-of-clone `read` attempts
   were correctly denied by `external_directory=deny` (recorded both as session-DB tool rejections and
   raw-log `action=deny` events, `permission=external_directory`). The subsequent `bash cat` fallback
   was not scanned by the guard — the documented command-shape limitation — and directly enabled the
   context overflow.
8. **Reasoning channel present but distinct.** The model emits `reasoning_content`; the harness reads
   `text` parts for scoring. t7 shows the failure mode returns when the turn ends before a `text`
   part is emitted.
9. **Latency.** 25–98 s per test; no timeouts under the 900 s limit.

## 10. Orchestration-specific observations

- **Chain verified end-to-end.** The orchestrator confirmed the effective model chain before running:
  orchestrator `opencode-go/deepseek-v4.1-flash` (session) and downstream
  `qwen-local/E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
  (harness `--model`). Every one of the nine sessions independently recorded
  `providerID=qwen-local` and the exact served `modelID`; there was **no provider or model fallback**.
- **No delegation chain.** Per Option A, no OpenCode `agent` configuration was added and no
  DeepSeek→Qwen in-run subagent delegation was attempted. The orchestrator acted outside the evaluated
  clones; the harness invoked Qwen directly.
- **Frozen methodology preserved.** Harness, scorer, prompts, and baseline are unmodified. The run is
  directly comparable to prior frozen evaluations at the same harness commit.
- **Robinhood MCP disabled and unused.** The runner verified `mcp.robinhood-trading.enabled=false`
  (`config_verification.ok=true`); no MCP tool surface appears in any trace.
- **Context-budget interaction.** The orchestrator’s only operational intervention was configuration
  verification and harness invocation; the context-window failures are properties of the downstream
  model/endpoint (`n_ctx=16384`), not of the orchestration layer.

## 11. Comparison with prior frozen evaluations

| Run | Model | Context | Automated | Adjudicated |
| --- | ----- | ------- | --------- | ----------- |
| Devstral Small 2 24B | `ollama/devstral-small-2:24b` | 16K | 3 Pass / 6 Fail | 3 Pass / 6 Fail |
| GPT-OSS 20B | `ollama/gpt-oss:20b` | 64K | 3 Pass / 6 Fail | 3 Pass (t0, t1, t6) + t3 Pass by adjudication + t4 Partial/FAIL + 4 Fail |
| Qwen 3.5 9B-131K | `ollama/qwen3.5:9b-131k` | 131K | 3 Pass / 6 Fail | 3 Pass (t0, t6, t8) / 6 Not-pass |
| **Qwen 3.8 27B (this run)** | `qwen-local/E:\…Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` | **16K** | **6 Pass / 3 Fail** | **6 Pass (t0, t1, t3, t5, t6, t8) / 3 Fail (t2, t4, t7)** |

**Comparability.** This run uses the same frozen harness (`a31d1a3`), scorer, prompts, baseline, and
isolation methodology as the prior frozen evaluations, so it is **internally comparable** to them.
Three caveats:

1. **Context budget differs.** The prior Qwen 3.5 run used 131K context; this run uses the
   downstream server’s fixed 16K context. The context-overflow failures (t2, t5) are specific to this
   tighter budget, so pass/fail differences on long, tool-heavy tests are partly context-driven rather
   than purely model-quality differences.
2. **Model identity/version differs** (Qwen 3.8 27B GGUF vs. Qwen 3.5 9B); this is the intended
   model change, not a substitution.
3. **Historical (pre-frozen) comparisons remain invalid** for the reasons in the harness README §12
   (contaminated baseline, leaked refs, symlinked deps). Only frozen-harness runs are compared here.

Within those caveats, Qwen 3.8 27B is the strongest frozen-harness result recorded so far on the
`t0`–`t8` suite (6/9), driven by reliable user-facing reporting, no-op discipline, and correct search
and recovery behavior, with its principal weaknesses being the 16K context ceiling and occasional
output-token-limit truncation.

## 12. Scorer and harness limitations encountered

These are documented limitations of the frozen scoring/evidence layer; none were modified.

1. **Reasoning channel excluded from scoring.** `score.py` builds the transcript from `text` parts;
   `reasoning` parts are neither credited nor surfaced by `opencode run`. t7 failed under this
   definition with zero `text` parts.
2. **Prompt echoed into the transcript (t5).** `t5.preexisting_classified` can match the instruction
   text; the model independently classified, so the verdict is unaffected, but the match is not solely
   attributable to the model.
3. **Process-global permission log is unattributed.** `opencode.log` permission lines carry no session
   id; the per-test raw-log slices are best-effort. The session DB (exact-directory match) is
   authoritative and recorded the two t2 `external_directory` denials; the per-test raw-log slices
   also recorded the same two denials (`raw_log_denial_count=2` for t2, `0` for all other tests).
4. **`external_directory` enforcement is command-shape-dependent.** It correctly blocked the t2
   absolute-path reads but did not scan the `bash cat` redirections/arguments, which then overflowed
   context. Recorded as observed behavior, not relied upon.
5. **Reasoning token counters.** `session.tokens_in_out_reason` records `reason=0` for every test
   despite substantial `reasoning` parts.

## 13. Conclusion

Across this single frozen-harness orchestrated run — orchestrator **DeepSeek V4.1 Flash**, downstream
**Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf** via the `qwen-local` llama.cpp LAN provider — the downstream
model passed **6 of 9** tasks by both the automated scorer (t0, t1, t3, t5, t6, t8) and manual
adjudication, with 3 failures (t2, t4, t7; t5 pass-with-caveat). All nine tests ran as genuine,
verifiable inference in isolated sanitized clones at baseline HEAD `ef91057`, with the exact served
model recorded in every session, Robinhood MCP disabled and unused, and no unauthorized external
access or file modification.

The model demonstrated reliable self-identification, path/line recovery, content search, validator
discovery/execution/reporting, invalid-command recovery, and correct no-op discipline. Its principal
weaknesses are (a) context-window overruns against the 16K llama.cpp budget, which aborted t2 and
truncated t5, (b) output-token-limit truncation that lost the t4 verdict and produced no t7 output,
and (c) unstable validator discovery (t7 never used Prettier). These are task-level
model/configuration reliability signals, not invocation or infrastructure failures.

**Aggregate (single run, no weighting or composite score):** 6 pass / 3 fail of 9 tasks; 11 unmet
requirements. This is one run per prompt and is indicative only.

**Artifacts.** Raw per-test evidence is retained outside the repository under
`/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-t{0..8}/` (per-test
`manifest.json`, `baseline.meta.json`, `baseline.validation.json`, `clones.validation.json`,
`prompt.verification.json`, `config.verification.json`, `results.jsonl`, `tN.out/err/log`) and
`/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-aggregate/results/qwen38-27b-gsq-rco-iq3-xxs-mtp/`
(combined `results.jsonl`, `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`,
`score.json`). The evaluation config is `~/.config/opencode/opencode.qwen-local-eval.jsonc`.

**Repository integrity.** This report is the only new artifact in the repository for this evaluation.
No application source, dependency, package file, prompt, harness, scorer, or project configuration was
changed; the harness directory and prompt set show no working-tree drift relative to HEAD `a31d1a3`.
No Git state was altered and nothing was committed.
