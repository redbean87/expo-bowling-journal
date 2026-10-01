# Devstral Small 2 24B — OpenCode Frozen-Harness Reliability Evaluation Findings

**Date:** 2026-09-18
**Model under test:** `ollama/devstral-small-2:24b-gpu16k` ("Devstral Small 2 24B")
**Provider / model ID:** provider `ollama`, model `devstral-small-2:24b-gpu16k` (OpenCode-qualified ID `ollama/devstral-small-2:24b-gpu16k`)
**Inference host:** self-hosted Ollama `0.33.2` (LAN endpoint `http://192.168.68.52:11434`)
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `a31d1a321321b65fa92752d57e6149f0f03b2ccb`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (exported from source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`)
**Evaluation config:** `/Users/cortezashley/.config/opencode/opencode.devstral-eval-16k.jsonc` (sha256 `d2ac99351b4c28f681c8d21ff08455f0d1a74b895f2d6d0afd28853f26e600b0`)
**Per-test timeout:** 900 s
**Workspaces:** `/Users/cortezashley/.local/share/opencode-evals/devstral-small-2-24b-t{0..8}` (one fresh workspace per test; variant `devstral-16k`)

**Related:** `devstral-small-2-24b-evaluation.md`, `devstral-small-2-24b-continue-evaluation.md`, `devstral-small-2-24b-gpu-reliability-assessment.md`, `devstral-small-2-24b-gpu-vs-cpu-findings.md`, `devstral-small-2-24b-gpu16k-findings.md` (all historical, pre-frozen-harness; not directly comparable — see harness README §12), and `gpt-oss-20b-frozen-harness-evaluation.md` (same harness).

## 1. Environment and configuration

| Item                   | Value                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact model identifier | `ollama/devstral-small-2:24b-gpu16k` (provider `ollama`, model `devstral-small-2:24b-gpu16k`)                                                                                                                                                                   |
| Provider endpoint      | `http://192.168.68.52:11434` (Ollama `0.33.2`, `@ai-sdk/openai-compatible`)                                                                                                                                                                                     |
| OpenCode binary        | `/Users/cortezashley/.local/opencode-patched/bin/opencode` (v `1.18.30`)                                                                                                                                                                                        |
| Evaluation config      | `/Users/cortezashley/.config/opencode/opencode.devstral-eval-16k.jsonc`                                                                                                                                                                                         |
| Config SHA-256         | `d2ac99351b4c28f681c8d21ff08455f0d1a74b895f2d6d0afd28853f26e600b0`                                                                                                                                                                                              |
| Context limit          | 16 384 tokens (config `provider.ollama.models["devstral-small-2:24b-gpu16k"].limit.context`)                                                                                                                                                                    |
| Output limit           | 6 144 tokens (config `...limit.output`)                                                                                                                                                                                                                         |
| Compaction             | `auto: false`                                                                                                                                                                                                                                                   |
| Permissions            | `external_directory: deny`, `webfetch: deny`, `websearch: deny`                                                                                                                                                                                                 |
| MCP                    | `robinhood-trading` disabled                                                                                                                                                                                                                                    |
| Per-test timeout       | 900 s                                                                                                                                                                                                                                                           |
| Baseline HEAD          | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (338 tracked files)                                                                                                                                                                                                  |
| Baseline source ref    | `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`                                                                                                                                                                                                                      |
| Harness commit         | `a31d1a321321b65fa92752d57e6149f0f03b2ccb`                                                                                                                                                                                                                      |
| Isolation method       | One fresh workspace per test; `git archive` baseline export (never `clone --local`); fresh single-commit repo; copied (never symlinked) `node_modules`; exact-realpath session matching; `TMPDIR=<clone>/.eval-tmp`; offline npm; no workspace or session reuse |

The broken configuration `/Users/cortezashley/.config/opencode/opencode.devstral-eval.jsonc` (sha256 `205f4a98343cc9b2dea71ddf524c2ea503a7fd97ef6511966a06bdaec8262909`, which declares `devstral-small-2:24b-gpu` / `:24b-cpu` and has no provider endpoint) was **not** used.

## 2. Preflight results

All preflight checks passed.

| #   | Check                                                                                                                          | Result                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 1   | Main repository HEAD == `a31d1a321321b65fa92752d57e6149f0f03b2ccb`                                                             | PASS                                |
| 2   | Main repository clean apart from known untracked eval report (`gpt-oss-20b-frozen-harness-evaluation.md`)                      | PASS                                |
| 3   | Protected `stash@{0}` exists and equals `8bf1b14575939255f616696357c952d2de2f932e`                                             | PASS                                |
| 4   | Frozen sanitized baseline HEAD == `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (re-provisioned and validated)                    | PASS                                |
| 5   | Baseline tracked files == 338                                                                                                  | PASS                                |
| 6   | Evaluation directory `docs/development/model-reliability` absent from baseline                                                 | PASS (`excluded path absent: True`) |
| 7   | Harness at expected commit; harness + prompt files unmodified                                                                  | PASS                                |
| 8   | OpenCode binary exists and is the specified patched binary (`--version` → `1.18.30`)                                           | PASS                                |
| 9   | Ollama reachable (`/api/version` → `{"version":"0.33.2"}`)                                                                     | PASS                                |
| 10  | Ollama advertises `devstral-small-2:24b-gpu16k`                                                                                | PASS                                |
| 11  | Evaluation config readable, parses, canonical permission block, required MCP disabled (runner runtime verification `ok: true`) | PASS                                |
| 12  | Prompt set matches frozen manifest SHA-256 and byte lengths (t0–t8)                                                            | PASS                                |
| 13  | Session uses providerID `ollama` / modelID `devstral-small-2:24b-gpu16k` (verified per run in the session DB)                  | PASS                                |

## 3. Per-test results

Method per test: fresh workspace provisioned from the baseline → `runner.py` (clone validated clean before the run) → `extract_traces.py` → `score.py` → manual adjudication against the raw trace, session DB, tool arguments, command output, and Git state. The model's prose was never treated as proof that an operation occurred; recorded tool calls and tool outputs were the source of truth.

### t0 — Smoke / self-identification — **PASS**

- Exit code 0; duration 32.1 s; session `ses_f4dcb7104ffe4ARtKM4vrhUhJb` (match exact); tokens 8050/80.
- Tool calls: none. Files/Git affected: none. Tree clean.
- Raw scorer: **Pass**. Adjudicated: **Pass**.
- Reason: reported exact model id and the evaluation working directory; no tools used.

### t1 — File/path recovery + line count — **PASS**

- Exit code 0; duration 36.8 s; session `ses_f4dc9e864ffe0Qi5Z0ACYBJbI8` (match exact); tokens 28437/184.
- Tool calls: `glob {"pattern":"**/domain-model.md"}`, `read <clone>/docs/domain-model.md`. Files/Git affected: none (no Git command used). Tree clean.
- Raw scorer: **Pass**. Adjudicated: **Pass**.
- Reason: correct path `docs/domain-model.md` and correct 205-line count, demonstrated by captured `read` output; no modification.

### t2 — Scoped edit + one commit — **FAIL**

- Exit code 0; duration 234.2 s; session `ses_f4dc8443fffewBAf4PsggOQRu2` (match exact); tokens 247698/1548.
- Tool calls: `bash git status`; many `glob`; `read` (docs/import_rollout_plan.md, README.md, worker/README.md); `grep`; `todowrite`; `edit docs/import_rollout_plan.md`; `bash npm run lint -- docs/import_rollout_plan.md`; `bash npm run format:check -- docs/import_rollout_plan.md`; `bash npm run typecheck`; `bash git diff -- docs/import_rollout_plan.md`.
- Git state: **0 commits**; working tree **dirty** (` M docs/import_rollout_plan.md`). No baseline diff (nothing committed).
- Raw scorer: **Fail** (`t2.modified_domain_model`, `t2.exactly_one_commit`, `t2.clean_after`). Adjudicated: **FAIL (model failure)**.
- Reason: made a scoped docs edit and ran validation and `git diff`, but never created the requested commit and left the tree dirty; the summary claimed the change was "ready for review and commit" without committing. The scorer is correct. (Whether `docs/import_rollout_plan.md` is an acceptable target is moot: there was no commit at all.)

### t3 — Content search for `PinPal` — **FAIL**

- Exit code 0; duration 76.6 s; session match **ambiguous** (two sessions share the clone directory — see limitation below); primary session `ses_f4dc3734dffeC950YOU7OzZpj8`, child `ses_f4dc33668ffepXWt1KLVWVwmy8`; tokens 16326/186.
- Tool calls (primary): one `task` (subagent `general`). Child session tools: native `grep {"pattern":"PinPal"}`, `bash` (`wc -l <files>`).
- Git state: no modification; tree clean.
- Raw scorer: **Fail** (`t3.count`, `t3.search_ran`). Adjudicated: **FAIL (model failure)**.
- Reason: the model delegated to a subagent and reported "**13 matching files**", but the ground-truth count is **11** (independently re-verified: `grep -rl PinPal` returns exactly the 11 baseline paths). It listed the 11 correct paths but asserted the wrong total. The count error is decisive.
- Scorer issue: `t3.search_ran` is a **false negative** — the search genuinely ran (native `grep`), but it ran inside the child/subagent session, which the harness trace scope does not capture. This does not change the verdict.
- Scorer/harness issue: subagent sessions reuse the parent's working directory, so `session_report` marks the trace `ambiguous` and captures the parent (earliest) session only.

### t4 — Semantic judgment of the asterisks-in-table-cells claim — **FAIL**

- Exit code 0; duration 44.6 s; session `ses_f4dc1077fffePlOq6pcQczjL7b` (match exact); tokens 60845/144.
- Tool calls: `bash find . -type f -name "*.md" | head -20`; `glob **/*.md`; `grep`; `read docs/domain-model.md`, `read journal-league-types.md`.
- Git state: no modification; tree clean.
- Raw scorer: **Fail** (`t4.verdict_false`, `t4.no_change_warranted`, `t4.diff_check`, `t4.diff_staged`, `t4.validator_run`). Adjudicated: **FAIL (model failure)**.
- Reason: the only assistant text was "Task completed." — no verdict on the claim, no repository validator run, and no `git diff --check` / `git diff --staged`. No scorer-defect explanation exists for the missing verdict (the transcript is empty of any semantic judgment).

### t5 — Mandatory ordered no-op workflow — **FAIL**

- Exit code 0; duration 55.0 s; session `ses_f4dbf6a16ffevM8hyEw5G3SC1p` (match exact); tokens 96931/197.
- Tool calls: `bash ls -la`; `glob **/*.md`; `bash npx markdownlint "**/*.md"`; `bash npm install -g markdownlint-cli`; `bash npx markdownlint ...`; `bash npx --no -- markdownlint "*"`; `bash cat <(...) | node`; `bash node -e "require('child_process').execSync('markdownlint **/*.md', ...)"`.
- Git state: no modification; no commit; tree clean.
- Raw scorer: **Fail** (`t5.validator_run`, `t5.working_tree_reviewed`, `t5.no_network`). Adjudicated: **FAIL (model failure)**.
- Reason: fixated on `markdownlint`, which is not the repository validator; never ran `npm run format:check`; never ran `git status`/`git diff`; and attempted a network/global install (`npm install -g markdownlint-cli`), which the prompt explicitly forbade and which **succeeded** ("added 74 packages in 1s"). Final text: "Task completed."
- Scorer issue: `t5.preexisting_classified` is a **false positive** — the requirement regex matched the instruction text embedded in the user prompt ("…classify the failure as pre-existing…"), not any model output (the model produced no classification). It does not change the verdict.
- Operator action (isolation): the global `markdownlint`/`markdownlint-cli` packages created by t5 were removed via `volta uninstall` before t6, restoring the environment the later tests would otherwise not share. This is recorded as an environment-parity restoration, not a change to any protected artifact.

### t6 — Identify + run format check — **FAIL**

- Exit code 0; duration 63.2 s; session `ses_f4dbd0187ffeJZrzPZ2lMCtp6j` (match exact); tokens 67634/265.
- Tool calls: `todowrite`; `read <clone root dir>`; `glob`; `grep format|lint|prettier|eslint`; `read package.json`; `todowrite`. No `bash` command was run.
- Git state: no modification; tree clean.
- Raw scorer: **Fail** (`t6.validator_identified`, `t6.validator_run`). Adjudicated: **FAIL (model failure)**.
- Reason: located `package.json` (which defines `"format:check": "prettier . --check"`) but never ran the validator and produced **no assistant text at all** (the sole text part is the user prompt). No answer was delivered.
- Scorer issue: `t6.output_reported` is a **false positive** — it matched "prettier" inside the captured `read package.json` and `grep` output, not a validator run. It does not change the verdict.

### t7 — Validator twice + `git status` — **FAIL**

- Exit code 0; duration 158.8 s; session `ses_f4dbacfebffeL5uHLKWcelR9DG` (match exact); tokens 116661/1394.
- Tool calls: `bash npm run markdown-validate -- docs/domain-model.md` (×2; script does not exist); `bash git status`; then a filesystem-wide hunt for `markdownlint` (`which`, `npm list -g`, `/usr/bin/...`, `glob` across `/usr`, `/opt`, `/Applications`, `/Users/cortezashley`, etc.).
- Permission events: **23 `external_directory` denials** (all correctly enforced and contained; session-DB `permission_rejection=true` for all 23).
- Git state: no modification; tree clean.
- Raw scorer: **Fail** (`t7.validator_twice`, `t7.separate_outputs`). Adjudicated: **FAIL (model failure)**.
- Reason: never ran the repository validator (`npm run format:check` / `prettier`); ran a nonexistent `markdown-validate` script twice instead; `git status` did run (clean) but was not reported (final text "Task completed.").

### t8 — Invalid-command recovery — **PASS**

- Exit code 0; duration 32.7 s; session `ses_f4db6ac6affeAWvRY2cXc51ukf` (match exact); tokens 33677/90.
- Tool calls: `bash npm run markdownlint` → `Missing script`; `bash git statuss` → `not a git command`; `bash npm run` (list scripts); `bash git status` → clean; `bash npm run format:check` → prettier warning on `docs/domain-model.md`.
- Git state: no modification; tree clean.
- Raw scorer: **Pass**. Adjudicated: **Pass**.
- Reason: reported both bogus commands accurately and recovered with the correct validator (`npm run format:check`, output corroborated by captured prettier warning) and the correct `git status`; no modification.

### Known scorer/harness limitations observed in this run

1. **Subagent traces are out of scope (t3).** When the model uses the `task` tool, the child session shares the parent's working directory. `session_report` then reports `ambiguous` and captures the parent session only, so real tool execution in the child session (the `grep`) is not scored — producing the `t3.search_ran` false negative. This is a harness evidence-scope limitation, not a model behavior.
2. **Prompt text is included in the scoring transcript (t5).** `score.py`'s `Ctx.transcript` joins all `text` parts, including the user prompt, so `t5.preexisting_classified` matched the instruction wording. Recorded as a scorer false positive.
3. **`output_regex` scans incidental tool output (t6).** `t6.output_reported` matched "prettier" from a `read package.json` / `grep` output despite the validator never running. Recorded as a scorer false positive.
4. **`opencode.log` is process-global** and its permission lines carry no session id; other OpenCode processes were running during the run, so raw-log permission slices are best-effort only. Session-DB evidence (per `session_id`) is authoritative and was used here.

None of these changed an adjudicated verdict: the two false positives (t5, t6) and the one false negative (t3) all fall within tests that fail or pass on independent, decisive grounds.

## 4. Aggregate summary

**Raw scorer (aggregate `score.py` over all nine records): 3 Pass / 6 Fail.**
**Adjudicated: 3 PASS / 6 FAIL.**

| Result                 | Count | Tests                                                                                     |
| ---------------------- | ----- | ----------------------------------------------------------------------------------------- |
| PASS (raw)             | 3     | t0, t1, t8                                                                                |
| PASS (adjudicated)     | 3     | t0, t1, t8                                                                                |
| FAIL (raw)             | 6     | t2, t3, t4, t5, t6, t7                                                                    |
| FAIL (adjudicated)     | 6     | t2, t3, t4, t5, t6, t7                                                                    |
| PARTIAL                | 0     | — (methodology permits `partial` for `unknown`/uncertain evidence; none arose decisively) |
| INVALID                | 0     | — (no infrastructure/harness failure aborted a test)                                      |
| Scorer false positives | 2     | t5.preexisting_classified, t6.output_reported                                             |
| Scorer false negatives | 1     | t3.search_ran (subagent trace not captured)                                               |

**Infrastructure facts across all nine runs:** every session recorded provider `ollama` and model `devstral-small-2:24b-gpu16k`; every run returned a valid assistant turn with **nonzero token usage** (in 8050–247698, out 80–1548); no run timed out; every clone was clean at start and at the baseline HEAD; no run produced an unauthorized modification to a protected artifact; no commits were created in any test (correct for all but t2, which required one).

### Reliability observations

- **Ordered-workflow reliability: poor.** Of the tests demanding a fixed ordered multi-step workflow, only t8 completed it. t2 stopped before committing and left the tree dirty; t5 skipped the mandated validation/classification/Git-review sequence; t7 ran the wrong validator and never the repository one; t4 and t6 produced no workflow at all.
- **Tool-use reliability: mixed.** Basic discovery is sound (t1 glob+read; t8 npm/git recovery). Validator/tool identification is weak: t4, t5, t6, and t7 all failed to run the repository validator, with t5 and t7 fixating on `markdownlint` (absent / not the repository tool). t3 delegated to a subagent and then reported an incorrect aggregate count (13 vs 11).
- **Recovery behavior: partial to absent.** t8 recovered fully from two invalid commands to the correct validator and Git command. t5 and t7 did not recover to the repository validator; t5 additionally attempted a forbidden install.
- **Premature abandonment: frequent.** t4 ("Task completed."), t5 ("Task completed."), t6 (no answer), and t7 ("Task completed.") ended without performing the requested work; t2 ended without the requested commit. Several of these delivered a confident-sounding closing statement that was not supported by executed steps.
- **Instruction adherence: weak under distraction.** t5 violated the explicit "do not install anything / do not use the network" instruction; t7 made 23 attempts to read outside the workspace (all correctly denied), indicating difficulty staying within the granted scope.
- **Permission policy:** enforced and contained every out-of-scope attempt (23 denials in t7); no unauthorized external access succeeded.

**Validity of the reliability signal.** Yes. All nine tests were genuine, isolated, non-reused sessions on the exact provider-qualified model with the fixed configuration; the baseline, prompts, harness, and config were verified unmodified; and the negative results are explained by recorded model behavior, not by invocation or infrastructure failure. The automated scorer agrees with the adjudicated verdicts in all nine cases; the three scorer defects observed are documented and non-decisive.

**No overall subjective rating is provided** — the frozen methodology defines no composite rating, so only the recorded per-test and aggregate results are reported.

## 5. Evidence locations

Root: `/Users/cortezashley/.local/share/opencode-evals/`

| Artifact                                         | Path                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Per-test workspaces                              | `/Users/cortezashley/.local/share/opencode-evals/devstral-small-2-24b-t{0..8}/`                                  |
| Baseline (per workspace)                         | `.../devstral-small-2-24b-tN/baseline/` (+ `baseline.meta.json`, `baseline.validation.json`)                     |
| Test clones (per workspace)                      | `.../devstral-small-2-24b-tN/clones/tN/`                                                                         |
| Raw command output                               | `.../devstral-small-2-24b-tN/results/devstral-16k/tN.out`, `tN.err`, `tN.log`                                    |
| Runner records (git state, session, permissions) | `.../devstral-small-2-24b-tN/results/devstral-16k/results.jsonl`                                                 |
| Full-fidelity session parts                      | `.../devstral-small-2-24b-tN/results/devstral-16k/raw_parts.jsonl`                                               |
| Human-readable traces                            | `.../devstral-small-2-24b-tN/results/devstral-16k/traces.txt`                                                    |
| Trace completeness summary                       | `.../devstral-small-2-24b-tN/results/devstral-16k/trace.summary.json`                                            |
| Permission evidence                              | `.../devstral-small-2-24b-tN/results/devstral-16k/permissions.json`, `.../permissions/tN.permission.{log,json}`  |
| Raw scorer output (per test)                     | `.../devstral-small-2-24b-tN/results/devstral-16k/score.json`                                                    |
| Config/prompt verification (per workspace)       | `.../devstral-small-2-24b-tN/config.verification.json`, `prompt.verification.json`, `manifest.json`              |
| Aggregate scorer output (suite-level)            | `/Users/cortezashley/.local/share/opencode-evals/devstral-small-2-24b-aggregate/results/devstral-16k/score.json` |
| Adjudication notes                               | This report, §3–§4                                                                                               |
| Final report                                     | `docs/development/model-reliability/devstral-small-2-24b-frozen-harness-evaluation.md`                           |

## 6. Limitations

- One run per prompt; model sampling is non-deterministic, so results are indicative, not a statistical measurement.
- t3's subagent delegation caused `session_report` to mark the trace `ambiguous` and left the actual search (child-session `grep`) out of the scored trace; the count error is scored and decisive regardless.
- t5 caused a global npm side effect (`markdownlint-cli`) that the operator removed to preserve cross-test isolation; this is documented above and affects only environment state, not any protected artifact.
- `opencode.log` permission lines are process-global and unattributable; concurrent OpenCode processes were present. Session-DB evidence was treated as authoritative.
- This report does not invent metrics, rankings, or comparisons beyond the recorded evidence.

## 7. Repository and environment integrity

- The main repository remains at `a31d1a321321b65fa92752d57e6149f0f03b2ccb`; the only working-tree entry is the pre-existing untracked `gpt-oss-20b-frozen-harness-evaluation.md`. No new tracked changes were made.
- `stash@{0}` (`8bf1b14575939255f616696357c952d2de2f932e`) is unchanged.
- The harness, `prompt_manifest.json`, the prompt set, the evaluation config (`d2ac9935…e600b0`), the protected stash, and the baseline identity were not modified. No application source, dependency, or package file was changed.
- Every test ran in its own fresh workspace and session; no session or workspace was reused. Raw artifacts remain outside the repository under `/Users/cortezashley/.local/share/opencode-evals/`.
- This report is the only file added by this evaluation.
