# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp — OpenCode Frozen-Harness Reliability Evaluation (64K Context)

**Date:** 2026-09-18
**Orchestrator:** `opencode-go/deepseek-v4.1-flash` ("DeepSeek V4.1 Flash"), the OpenCode Go cloud
session that coordinated the audit, the runtime-configuration change, the smoke tests, the frozen
harness run, trace extraction, scoring, and adjudication.
**Model under test (downstream):** `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
**Provider / endpoint:** provider `qwen-local` (`@ai-sdk/openai-compatible`), llama.cpp LAN endpoint
`http://192.168.68.52:8081/v1` (OpenAI-compatible server; build `b10689-57291f264`).
**Exact OpenCode model ID passed to the harness:**
`qwen-local/E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `a31d1a321321b65fa92752d57e6149f0f03b2ccb`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files, tree `feca1f64fa1f9479f42b0745968ccf41f647d870`)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`, all hashes verified)
**Evaluation overlay:** `/Users/cortezashley/.config/opencode/opencode.qwen-local-eval.jsonc` (sha256 `e7e93dae8278b56fb64dc30c2e1c1a534d3f2ebd11a291d45438cedb1f8dab03`, 269 bytes, **unchanged**)
**Base runtime config (edited this task):** `/Users/cortezashley/.config/opencode/opencode.jsonc`
(before `dfa4db8fe66d632204894091edc1097948e19260283a3f7373e2aa966896a34a` → after
`ccb8f175eb740edb97188e93b01ece571a933c39d0e45ecc3ab605d0276dc5eb`; backup
`opencode.jsonc.bak-64k-20260918-114948`)
**Per-test timeout:** 900 s
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp-64k`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-64k`
(one fresh workspace + isolated clone + session per test)

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; the results are
> task-level evidence from a single evaluation run, not a statistical measurement. No composite score
> or ranking is produced.

---

## 1. Scope and orchestration model

Evaluate the downstream Qwen3.8 27B GGUF (llama.cpp) against the frozen OpenCode `t0`–`t8`
model-reliability suite, using DeepSeek V4.1 Flash as the orchestrator. This is meta-orchestration:
the orchestrator runs the process outside the evaluated clones; the frozen harness invokes the
downstream Qwen model **directly** per test. No in-run orchestrator→downstream subagent delegation
was used, and no OpenCode `agent` configuration was added.

What the orchestrator did: audited the server and effective configuration; applied the two required
runtime-configuration changes (endpoint + context); ran a client smoke test and a controlled
long-context probe; provisioned a fresh sanitized baseline and one isolated clone per test; ran the
frozen `runner.py`, `extract_traces.py`, and `score.py`; adjudicated the automated results against
raw traces, diffs, and permission evidence; and recorded this report.

No harness, scorer, prompt, baseline, application source, or project-configuration file was modified.

## 2. Audit and configuration changes

### 2.1 Server audit (port 8081)

The production endpoint `http://192.168.68.52:8080/v1` is not listening; the active 64K experimental
llama.cpp server was intentionally started on port **8081**. Read-only probes:

```
GET http://192.168.68.52:8081/health  → HTTP 200 {"status":"ok"}
GET http://192.168.68.52:8081/v1/models
    id = E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf
    meta.n_ctx = 65536, n_ctx_train = 262144, n_params = 27320697856,
    size = 10431832064, ftype = "IQ3_S - 3.4375 bpw", owned_by = "llamacpp"
GET http://192.168.68.52:8081/props
    default_generation_settings.n_ctx = 65536, total_slots = 1,
    model_path = E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf,
    build_info = "b10689-57291f264", chat_format = "Content-only", reasoning_format = "none"
```

The `n_ctx=65536` value is reported by the running server for the loaded model (both `/v1/models` and
`/props`), not merely documented in a launch script. Port 8080 was not started or modified.

### 2.2 Required configuration changes (two, runtime only)

The evaluation client previously pointed at the down port 8080 and declared a 16384 context limit.
Applied to the **base** config `~/.config/opencode/opencode.jsonc` (the file that declares the
`qwen-local` provider; the eval overlay does not declare it and merges over the base):

| Setting                            | Before                         | After                          |
| ---------------------------------- | ------------------------------ | ------------------------------ |
| `qwen-local` `options.baseURL`     | `http://192.168.68.52:8080/v1` | `http://192.168.68.52:8081/v1` |
| `qwen-local` model `limit.context` | `16384`                        | `65536`                        |
| `qwen-local` model `limit.output`  | `4096`                         | `4096` (unchanged)             |

A unified diff against the pre-edit backup confirms **only** these two tokens changed; the file is
byte-length-identical (1786 bytes) and no other provider, permission, MCP, or compaction setting was
touched.

**Bootstrap mechanism (documented for transparency).** The active orchestrator session enforces
`external_directory=deny`, which is defined in the very file that had to be edited (a circular
constraint), and the session's `read`/`edit`/`write` tools plus file-reading `bash` commands are
denied for `~/.config/opencode`. After an initial manual attempt did not take effect, the change was
applied via the narrowly scoped bootstrap the operator requested: a separate OpenCode process
launched with a minimal temporary config (`permission.external_directory="allow"`) that merges over
the base config. That process executed a deterministic script which (a) asserted exactly one
occurrence of each old token, (b) backed up the file, (c) replaced only those tokens, and (d) verified
the effective merged config. The temporary allow config lives in the OS temp directory, is **not**
part of the evaluation configuration, and the permanent `external_directory=deny` policy is intact
(see §5). No harness/prompt/scorer/baseline/source file was modified.

## 3. Effective OpenCode configuration (verified)

`opencode debug config` with `OPENCODE_CONFIG=~/.config/opencode/opencode.qwen-local-eval.jsonc`:

| Item                            | Value                                                                 |
| ------------------------------- | --------------------------------------------------------------------- |
| Provider                        | `qwen-local` (present; providers resolved: `ollama`, `qwen-local`)    |
| Base URL                        | `http://192.168.68.52:8081/v1`                                        |
| Downstream model key            | `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` |
| Context / output limit          | `65536` / `4096`                                                      |
| `compaction.auto`               | `false`                                                               |
| `mcp.robinhood-trading.enabled` | `false`                                                               |
| `permission.external_directory` | `deny`                                                                |
| `permission.webfetch`           | `deny`                                                                |
| `permission.websearch`          | `deny`                                                                |

The base config declares a default model (`ollama/gpt-oss:20b`), but the harness always passes
`--model`, so the evaluated model is the exact Qwen GGUF above; no fallback occurred (every session
recorded `qwen-local` and the exact model — §6.1).

The runner's pre-model-call `config.verification.json` recorded `ok: true`: eval-config SHA
`e7e93dae…`, permission block exactly equal to the canonical policy, and
`mcp.robinhood-trading` present with `enabled=false`.

## 4. Smoke tests and 64K proof

1. **Client smoke (exact provider/model through OpenCode):**
   `opencode run -m 'qwen-local/E:\…IQ3_XXS-mtp.gguf' 'Reply with exactly: QWEN 64K CLIENT SMOKE PASSED'`
   returned exactly `QWEN 64K CLIENT SMOKE PASSED` with no connection, truncation, or context error.
   The run banner identified the model as `E:\LocalAI\…IQ3_XXS-mtp.gguf`.
2. **Direct server smoke:** `/v1/chat/completions` → `finish_reason:"stop"`, content
   `QWEN 64K TEST PASSED`, exact model id, build `b10689-57291f264`.
3. **Controlled long-context probe (exceeds the old 16K boundary):** a single request with
   `prompt_tokens = 25067` (> 16384) completed with `finish_reason:"stop"` and content
   `LONG CONTEXT PROBE OK`, HTTP 200, ~59 s. No overflow/truncation error.
4. **Harness evidence:** no test produced a context-overflow error. `t2` accumulated 24,846 input
   tokens and `t4` 16,969 — both above the old 16K total — without the prior
   `request … exceeds the available context size (16384 tokens)` failure.
5. **Robinhood MCP:** disabled in the effective config and **zero** occurrences of `robinhood` in the
   extracted traces; no MCP tool surface appears in any session.
6. **Permission policy:** canonical deny block verified by `config.verification.json`. The only
   runtime denial was in `t2` (one `external_directory` rejection — the model tried to write to
   `/tmp/pinpal-doc/...`, outside the clone's permitted temp dir).

## 5. Harness, baseline, and prompt integrity

| Item                        | Value                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| Suite                       | `opencode-t0-t8` (frozen `ground_truth.json`)                        |
| Harness commit              | `a31d1a321321b65fa92752d57e6149f0f03b2ccb`                           |
| Harness/scorer/prompt drift | none (`git status --porcelain` on those dirs empty)                  |
| Baseline HEAD               | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`                           |
| Baseline source ref         | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`                           |
| Baseline tree               | `feca1f64fa1f9479f42b0745968ccf41f647d870`                           |
| Tracked files               | 338                                                                  |
| Prompt verification         | all `t0`–`t8` SHA-256 and byte lengths match (`ok: true`, no issues) |
| Tracked repo changes        | none (only the pre-existing untracked evaluation docs + this report) |

## 6. Per-test results (`t0`–`t8`)

### 6.1 Execution summary

Every session matched its clone directory exactly (`match=exact`), used `provider=qwen-local` and
`session_model = E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`, and every
clone started clean at baseline HEAD and ended clean. No test produced a process-level error other
than the noted timeout; no test timed out except `t2`.

| #   | Session id                       | Duration (s) | rc   | Tokens in/out | Max step input | Commits | Rejections | Automated | Adjudicated |
| --- | -------------------------------- | ------------ | ---- | ------------- | -------------- | ------- | ---------- | --------- | ----------- |
| t0  | `ses_f4a8f55b2ffeVetWRDZTn9LNg7` | 60.0         | 0    | 8685 / 224    | 8685           | 0       | 0          | Pass      | Pass        |
| t1  | `ses_f4a8e5e78ffe5obQwQMcoT3OYj` | 87.6         | 0    | 8863 / 614    | 8725           | 0       | 0          | Pass      | Pass        |
| t2  | `ses_f4a8cfa3cffecmNM4PBzioRg6A` | 901.0        | None | 24846 / 9684  | 8707           | 0       | 1          | Fail      | Fail        |
| t3  | `ses_f4a7f2d02ffeg4bte9vchDxpB7` | 166.7        | 0    | 10462 / 1545  | 8684           | 0       | 0          | Pass      | Pass        |
| t4  | `ses_f4a7c966affeD7lxM71i0J3Slk` | 807.0        | 0    | 16969 / 9480  | 8727           | 0       | 0          | Fail      | **Pass**    |
| t5  | `ses_f4a70391bffe3mNxHj97yhcCqB` | 445.7        | 0    | 13772 / 4560  | 8746           | 1       | 0          | Fail      | Fail        |
| t6  | `ses_f4a695cedffexd2lPc1VpraiJ4` | 159.5        | 0    | 11746 / 1280  | 8681           | 0       | 0          | Pass      | Pass        |
| t7  | `ses_f4a66e07cffers5X3NR753laYb` | 451.0        | 0    | 15374 / 4245  | 8701           | 0       | 0          | Pass      | Pass        |
| t8  | `ses_f4a5feb99ffenocccmtdU4SSOy` | 149.5        | 0    | 10683 / 705   | 8698           | 0       | 0          | Pass      | Pass        |

### 6.2 Per-test notes

- **t0 — Smoke / self-identification — Pass.** No tools; reported the exact model id and the correct
  clone cwd.
- **t1 — File/path recovery + line count — Pass.** Correct `docs/domain-model.md`, **205** lines,
  user-facing; no Git, no modification.
- **t2 — Scoped edit + one commit — Fail.** Ran the repository validator (`format:check`/prettier
  hits = 4), then attempted to stage a temp Markdown sample by writing `/tmp/pinpal-doc/…`; the
  sandbox correctly denied that `external_directory` write (1 rejection). It continued exploring and
  hit the **900 s wall-clock timeout** before editing, reviewing the diff, or committing. No
  modification; tree clean. Unlike the 16K run, there was **no context-overflow abort**.
- **t3 — Content search for PinPal — Pass.** `rg` search; correct total (**11**) and complete path
  list; no modification.
- **t4 — Semantic judgment of the asterisks-in-table-cells claim — Adjudicated Pass (automated Fail).**
  Delivered a full verdict, ran `npm run format:check`, `git diff --check`, and `git diff --staged`,
  and concluded: _"## Verdict: the claim is **false** in this repository — no documentation change is
  warranted."_ No modification. The automated scorer marked `t4.verdict_false` unmet because its regex
  `claim is (false|incorrect|…)` does not match the markdown-emphasised `claim is **false**` (see §8).
- **t5 — Mandatory ordered no-op workflow — Fail.** Correctly classified the Prettier failure as
  **pre-existing** and ran the validator, but then **reformatted `docs/domain-model.md` and created a
  commit** (`03b98468da14f83c208be80370f434cdafff10bd`, "fix: prettier-format docs/domain-model.md so
  npm run format:check passes"), violating the task's no-op/`no_commit` requirement. Tree clean after.
- **t6 — Identify + run format check — Pass.** Identified and ran `npm run format:check`, reported the
  Prettier warning; no modification.
- **t7 — Validator twice + `git status` — Pass.** Ran `npx prettier --check docs/domain-model.md`
  **twice** with separate outputs, reported `git status` (`working tree clean`), no modification. This
  is the prior 16K failure now resolved.
- **t8 — Invalid-command recovery — Pass.** Reported both bogus commands (`npm run markdownlint` →
  `Missing script`; `git statuss` → `not a git command`), recovered with `npm run check` and
  `git status`; no modification.

## 7. Scores

**Raw automated scorer output:**

```
scored 9 tests for variant qwen38-27b-gsq-rco-iq3-xxs-mtp-64k: {'pass': 6, 'fail': 3}
  t2: fail unmet=['t2.modified_domain_model', 't2.diff_reviewed', 't2.exactly_one_commit']
  t4: fail unmet=['t4.verdict_false']
  t5: fail unmet=['t5.no_commit']
wrote …/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-64k/score.json
```

- **Automated:** 6 Pass (t0, t1, t3, t6, t7, t8) / 3 Fail (t2, t4, t5); 5 unmet requirements.
- **Adjudicated:** **7 Pass** (t0, t1, t3, t4, t6, t7, t8) / **2 Fail** (t2, t5).

All 27 common requirements (`prompt_verified`, `baseline_head`, `clean_before`) passed for every test.

## 8. Adjudication

| #   | Automated | Adjudicated | Rationale                                                                                                                     |
| --- | --------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| t0  | Pass      | Pass        | Exact model id + cwd, no tools.                                                                                               |
| t1  | Pass      | Pass        | Correct path/line count, user-facing; no Git/modification.                                                                    |
| t2  | Fail      | Fail        | No edit/commit; validator run and diff review missing; wall-clock timeout. Genuinely unmet.                                   |
| t3  | Pass      | Pass        | Correct 11 files/paths.                                                                                                       |
| t4  | Fail      | **Pass**    | Verdict _was_ delivered ("the claim is **false**"); scorer regex miss on markdown emphasis. All other t4 requirements passed. |
| t5  | Fail      | Fail        | A commit was created in a no-op task (`no_commit` genuinely unmet).                                                           |
| t6  | Pass      | Pass        | Validator identified/run/reported.                                                                                            |
| t7  | Pass      | Pass        | Validator twice (separate outputs) + `git status`; no modification.                                                           |
| t8  | Pass      | Pass        | Both invalid commands reported; correct recovery.                                                                             |

**Scorer false negative (t4).** `t4.verdict_false` pattern is
`(?i)(claim is (false|incorrect|invalid|not true)|false\.|not true|incorrect\b|is false)`. The model
emitted `the claim is **false**`, which the pattern cannot match because of the `**` emphasis. The
verdict is semantically present and the adjacent `t4.no_change_warranted` requirement matched from the
same sentence. No other automated verdict required reversal.

## 9. Failure classifications

| #   | Automated | Adjudicated | Primary classification                                                                                      | Secondary                                                                                                                            |
| --- | --------- | ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| t2  | Fail      | Fail        | **Incomplete task / required deliverable not delivered** (no edit, diff review, or commit)                  | Wall-clock (900 s) timeout on a slow single-slot server; sandbox denial of an out-of-scope `/tmp` write. **Not** a context overflow. |
| t5  | Fail      | Fail        | **Scope violation / over-reach** (modified and committed `docs/domain-model.md` in a strict no-op workflow) | Misjudged a pre-existing style failure as an in-scope "justified change".                                                            |
| t4  | Fail      | Pass        | **Scorer false negative** (markdown emphasis)                                                               | None — the underlying task was completed correctly.                                                                                  |

No failure is attributable to invocation, transport, or context-window exhaustion. No unauthorized
external access succeeded; the one `external_directory` denial was correctly enforced.

## 10. Comparison with the prior 16K evaluation

| Run                         | Context | Automated                                         | Adjudicated                                       |
| --------------------------- | ------- | ------------------------------------------------- | ------------------------------------------------- |
| Qwen3.8 27B (16K, prior)    | 16,384  | 6 Pass / 3 Fail: **t0,t1,t3,t5,t6,t8** / t2,t4,t7 | 6 / 3                                             |
| Qwen3.8 27B (64K, this run) | 65,536  | 6 Pass / 3 Fail: **t0,t1,t3,t6,t7,t8** / t2,t4,t5 | **7 Pass / 2 Fail**: t0,t1,t3,t4,t6,t7,t8 / t2,t5 |

Per-test changes:

- **t7: Fail → Pass.** At 16K it fixated on a nonexistent `markdownlint`, never ran the repository
  validator, produced zero user-facing text, and ended at the output-token limit. At 64K it ran
  Prettier twice with separate outputs and `git status`. Plausibly context/turn-budget related, but
  run-to-run variance cannot be excluded.
- **t4: Fail → Pass (adjudicated).** At 16K the turn ended on the output-token limit mid-investigation
  with no verdict. At 64K it completed and delivered the correct verdict. The output limit is
  unchanged (4096), so this is not cleanly attributable to context alone.
- **t2: Fail → Fail, different mode.** The 16K failure was a hard provider context-overflow abort
  (`request (16637 tokens) exceeds the available context size (16384 tokens)`). At 64K that error is
  gone, but the task still fails, now via a 900 s wall-clock timeout plus a denied out-of-scope temp
  write.
- **t5: Pass → Fail (regression).** At 16K it correctly made no commit; at 64K it reformatted and
  committed `docs/domain-model.md`. Not context-attributable — a behavioural over-reach/scope error.

**Causation statement.** The strongest supportable claim is that the 64K context increase
**eliminated the hard 16,384-token context-overflow failure mode** (no overflow errors occurred; a
25,067-token request and >16K cumulative harness inputs succeeded). The `t7` and adjudicated `t4`
improvements are consistent with the larger context/turn budget but are confounded by single-run
variance and the unchanged 4096 output limit, so they are **not** attributed to context with
confidence. The `t5` regression is not context-attributable. The automated aggregate count is
unchanged (6/3); the adjudicated aggregate improves (7/2).

## 11. Remaining limitations and recommended next steps

1. **Wall-clock timeouts replace context overflows.** The 27B IQ3 model on a single server slot
   (`total_slots=1`) generated up to ~9.7K output tokens per test; `t2` exhausted the 900 s budget.
   Raise the per-test timeout and/or increase llama.cpp slots/parallelism, or cap per-turn output.
2. **Output limit is still 4096.** No verdict/output loss occurred this run, but reasoning-heavy tasks
   remain exposed. Consider a larger `limit.output` only as a deliberate, documented change.
3. **Scorer false negative on markdown emphasis.** `t4.verdict_false` should tolerate `*`/`_`
   emphasis (e.g. normalise emphasis before regex, or allow `\*{0,2}` around `false`). This is a
   scoring-tool limitation, not a model failure.
4. **t5 scope discipline.** The model over-reached by committing a pre-existing formatting fix. If the
   intent is strict no-op, add an explicit scope guard / penalise modifications more strongly, and
   consider distinguishing "pre-existing failure" from "warranted change" in the prompt.
5. **Single-run evidence.** Re-run for variance before drawing conclusions about `t4`/`t5`/`t7`.
6. **Bootstrap access.** The session's own `external_directory=deny` prevents in-session edits of the
   config that defines it; the elevated-temporary-config bootstrap was required. Keep this out of the
   permanent evaluation config.

## 12. Artifacts

- Per-test workspaces: `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-64k/`
  (`baseline/`, `clones/t0..t8`, `baseline.meta.json`, `baseline.validation.json`,
  `clones.validation.json`, `prompt.verification.json`, `config.verification.json`, `status.json`).
- Results: `…/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-64k/` (`results.jsonl`, `raw_parts.jsonl`,
  `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`, `tN.out/err/log`,
  `permissions/tN.*`).
- Config backup: `/Users/cortezashley/.config/opencode/opencode.jsonc.bak-64k-20260918-114948`.

**Repository integrity.** The only new repository artifact is this report. No application source,
dependency, package file, prompt, harness, scorer, or baseline was changed; no Git state was altered
and nothing was committed.
