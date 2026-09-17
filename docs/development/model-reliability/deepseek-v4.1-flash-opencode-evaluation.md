# DeepSeek V4.1 Flash — OpenCode Reliability Evaluation Findings (1M-Context Cloud Run)

**Date:** 2026-09-16
**Model under test:** `opencode-go/deepseek-v4.1-flash` ("DeepSeek V4.1 Flash")
**Provider:** OpenCode Go (`opencode-go`), `https://opencode.ai/zen/go/v1`, SDK `@ai-sdk/openai-compatible`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Baseline:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`)
**Raw artifacts (outside the repository):**
`/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/deepseek-v41-flash-eval/`
(`runner.py`, `extract_traces.py`, `manifest.json`, `probe/`, `clones/t0`–`t8`,
`results/deepseek-v4.1-flash/{tN.out,tN.err,tN.log,results.jsonl,traces.txt}`)

**Related:** `mimo-v2.5-free-opencode-evaluation.md` (MiMo V2.5 Free, 200K-context cloud baseline),
`gemma4-12b-opencode-evaluation.md` (Gemma 4 12B, 16K GPU),
`qwen3-coder-30b-opencode-evaluation.md` (Qwen3-Coder 30B-A3B, 16K split),
`devstral-small-2-24b-gpu16k-findings.md` and `devstral-small-2-24b-gpu-reliability-assessment.md`
(Devstral 16K / 8K), `gpt-oss-20b-evaluation.md` (GPT-OSS 20B, Continue).

> **Context baseline note.** This is a **1M-context cloud run**. Like the MiMo V2.5 Free baseline, the
> model was not constrained to an evaluation-only 16K variant: it ran at its catalog defaults,
> **context 1000000 / output 384000**, through the built-in `opencode-go` provider. No model variant
> was created and there are no protected local model tags to compare. It is therefore **not a
> controlled match** for the 16K local runs; the provider and context budget differ. It is also **not
> context-matched to the MiMo baseline** (200K/32K).

## 1. Configuration

| Item                         | Value                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenCode version             | `1.18.30`                                                                                                                                                      |
| Executable                   | `/Users/cortezashley/.local/opencode-patched/bin/opencode` (same binary as all OpenCode evaluations)                                                           |
| Exact model identifier       | `opencode-go/deepseek-v4.1-flash`                                                                                                                              |
| Provider / endpoint          | `opencode-go` (OpenCode Go), `https://opencode.ai/zen/go/v1`, SDK `@ai-sdk/openai-compatible`                                                                  |
| Evaluation config            | `/Users/cortezashley/.config/opencode/opencode.deepseek-v41-flash-eval.jsonc` (new, eval-only; disables `compaction.auto`; disables the Robinhood MCP only — no provider or limit overrides) |
| Baseline commit              | `a437b47ba762867ddec4c09f97990dae4cf16f8c`                                                                                                                     |
| Context limit                | 1000000                                                                                                                                                        |
| Output limit                 | 384000                                                                                                                                                         |
| Timeout threshold            | 2400 s per test                                                                                                                                                |
| Model capabilities (catalog) | `tool_call`, `reasoning` (interleaved field `reasoning_content`), attachment, structured output; cost $0.15 in / $0.60 out per M (non-free)                    |
| Session metadata verified    | every session recorded `providerID=opencode-go`, `modelID=deepseek-v4.1-flash`, agent `build`                                                                  |

**Identifier verification.** The exact identifier was confirmed two ways before running: from the
cached OpenCode catalog (`~/.cache/opencode/models.json`, entry `opencode-go` → `deepseek-v4.1-flash`)
and empirically via a probe session that recorded `providerID=opencode-go`,
`modelID=deepseek-v4.1-flash`. The `opencode` (Zen) provider also exposes `deepseek-v4-flash`, which
is a **different model version**; it was not used. No provider substitution or silent fallback
occurred.

Configuration changes: selecting the model required none (built-in provider). The only addition was
a new eval-only config file, plus evaluation scaffolding outside the repository. No existing
OpenCode config, application code, package file, or prompt was modified.

## 2. Evaluation scope and methodology

- **Same nine persisted prompts** `t0`–`t8`, byte-for-byte from
  `docs/development/model-reliability/opencode-prompts/` (SHA-256 values match the prompt MANIFEST).
- **Same disposable-clone methodology as the prior OpenCode runs.** One `git clone --local` per
  prompt at baseline `a437b47`, `node_modules` symlinked to the primary repository and excluded via
  `.git/info/exclude`; serial execution; single-shot `opencode run -m opencode-go/deepseek-v4.1-flash`;
  no `--auto`.
- **Prior to the suite**, a short probe invocation confirmed the provider and model resolved and
  authenticated (probe session `ses_f529d5f73ffeMwfeSVaqGEfL0t`, not part of the nine tests).
- **Single serial phase.** Unlike the MiMo baseline (t0–t2 first, then a t3–t8 continuation), this
  run executed t0–t8 in one serial phase with a runner adapted from the MiMo runner (only the
  provider/model identity and artifact paths changed). This is methodology-neutral.
- **Captured per test:** stdout (`tN.out`), stderr (`tN.err`), combined log (`tN.log`), runner
  metadata (`results.jsonl`: rc, timeout flag, duration, session id, role/part counts, token totals,
  peak per-step input tokens, `git_before`/`git_after`), and DB-reconstructed tool/reasoning traces
  (`traces.txt`).
- **Return codes / timeouts:** all nine prompts returned `rc=0`; **no timeouts, no hangs**.
- **Repository integrity:** every clone is clean of tracked edits at its recorded HEAD; only t2
  created a commit (authorized by the prompt). The primary repository was not modified.
- **Cleanup:** no runner or `opencode run` process remained after the runs.

## 3. Ground truth (independently verified)

| Fact                                          | Value                                                                              | How verified                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `docs/domain-model.md` length                 | 205 lines                                                                          | `git show a437b47:docs/domain-model.md \| wc -l`                                                         |
| Files mentioning `PinPal` at baseline         | 12                                                                                 | `git grep -l PinPal a437b47 -- . ':!node_modules'` (exact 12-path set matches t3)                        |
| Repository Markdown/format validator          | `npm run format:check` (`prettier . --check`); Prettier `3.8.1` is a devDependency | `package.json`, `node_modules/prettier/package.json`                                                     |
| t4 claim ("asterisks in table cells invalid") | False                                                                              | GFM allows cell emphasis; the repo already uses `**bold**` inside table cells (`docs/domain-model.md`)   |
| Pre-existing baseline failure                 | `prettier . --check` warns on `docs/domain-model.md` at `a437b47`                  | Independent Prettier run on baseline content                                                             |

## 4. Results matrix

| #   | Focus                            | Classification | Duration | Key finding                                                                                                                                          |
| --- | -------------------------------- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| t0  | Smoke / self-identification      | **Pass**       |    9.2 s | Exact model ID and cwd, no tools used                                                                                                                |
| t1  | File/path recovery + line count  | **Pass**       |   13.8 s | Correct path and 205-line count, commands shown, no Git                                                                                              |
| t2  | Scoped edit + one commit         | **Pass**       |   89.1 s | One-line edit, real Markdown validator run, one correct commit `30871aa`, clean tree (read prior eval doc)                                            |
| t3  | Content search for `PinPal`      | **Pass**       |   22.2 s | Count and paths exact (12/12)                                                                                                                        |
| t4  | Semantic judgment of claim       | **Fail**       |   27.8 s | No verdict produced; `/tmp` write auto-rejected; `git diff --check`/`--staged` not run                                                                |
| t5  | Mandatory ordered no-op workflow | **Pass**       |   55.3 s | All five steps followed, correct no-op decision, no network, no commit                                                                                |
| t6  | Identify + run format check      | **Pass**       |   35.4 s | Correct command run, full validator output reproduced                                                                                                 |
| t7  | Validator twice + `git status`   | **Fail**       |   28.1 s | Incorrectly denied the repository validator exists; ran it zero times; `git status` ok                                                                |
| t8  | Invalid-command recovery         | **Pass**       |   49.9 s | Both bogus commands reported accurately; recovered with `format:check` + `git status` (read prior eval doc)                                          |

**Totals: 6 Pass / 0 Partial / 2 Fail / 0 Hang.** Total runtime **330.8 s**
(t0–t2: 112.1 s; t3–t8: 218.7 s).

## 5. Per-test results and classifications

### t0 — Smoke / self-identification — Pass

No `tool` parts. Reported the exact identifier `opencode-go/deepseek-v4.1-flash` and the clone cwd;
both confirmed by session metadata and clone path. The no-tools constraint was satisfied. No
fabrication.

### t1 — File/path recovery — Pass

Used `glob "**/domain-model.md"` and a second `glob "docs/**/*.md"` to establish the real location;
`bash(ls -la docs/wrong-folder/domain-model.md)` → not found; `bash(wc -l docs/domain-model.md)` →
**205**. Reported the correct repository-relative path, the correct line count (ground truth 205),
and each tool/command with its output. No file modified; no Git used (as required).

### t2 — Scoped edit + one commit — Pass

Planned with `todowrite`, explored with `glob`/`grep`/`read`, and made a scoped **one-line** edit to
`docs/domain-model.md` §8.9 (Local Fixtures), adding the iOS fixture copy example
(`cp fixtures/pinpal/tj-ios.pinpal 'Backup(TJ).pinpal'`) alongside the existing Android example.
Ran the repository's **actual Markdown validator** (`npx prettier --check docs/domain-model.md`,
equivalent to the scoped `format:check`) and `git diff --check` (exit 0), correctly classified
Prettier's warning as **pre-existing** baseline style drift (198 lines) that its added line does not
worsen, reviewed the diff, created **exactly one commit**
`30871aa67a2c81495678230c4afac6c8142c5b7c` ("docs: add iOS fixture copy example to PinPal local
fixtures"), and reported files, commands, commit hash, and a clean `git status`. The commit and
clean tree were independently verified (one commit since baseline, parent `a437b47`).
**Deviation (flagged):** the model read the in-repository prior evaluation write-up
(`docs/development/model-reliability/continue-gpt-oss-reliability-evaluation.md`), which is part of
the baseline tree, and used it as context ("the prior agent fell into this trap"). This is a
repository-contamination risk (see §8); the result itself was independently verified correct.

### t3 — Content search for `PinPal` — Pass

Ran a content search (`rg "PinPal" --files-with-matches`; the native `grep` tool was also used) and
cross-checked with `--text --no-ignore --hidden`. Reported **12** distinct files and listed all 12
repository-relative paths; an independent `git grep -l PinPal a437b47` returns the same 12 files in
a one-to-one match. No modification. Minor: the search surfaced the prior evaluation document, which
is one of the 12 matching files (contamination note in §8), but this does not affect the count.

### t4 — Semantic judgment — Fail

Investigated the repository correctly: found that it already uses emphasis inside table cells
(`docs/domain-model.md` uses `**bold**` and single-asterisk emphasis in cell text), identified
Prettier as the repository's Markdown tooling, and confirmed its own change-free state. However, the
task's **core deliverable was never produced**: the run ended without a true/false verdict on the
claim and without a determination of whether any documentation change is warranted. Its validation
attempt — writing Prettier output to `/tmp/dm.formatted.md` via a shell redirect — was **auto-rejected
by the harness permission layer** (`external_directory (/tmp/*); auto-rejecting`), after which the
model emitted only intermediate commentary and stopped. It also never ran the required
`git diff --check` or `git diff --staged`. No file was modified.
**Why Fail:** the central question was left unanswered, no verdict and no warranted-change decision
were delivered, and the explicitly required diff checks were not run. This is not a fabrication — it
is an incomplete task.

### t5 — Mandatory ordered no-op workflow — Pass

Followed the mandated workflow: (1) ran `npm run format:check` → `[warn] docs/domain-model.md`
(EXIT=1); (2) classified the failure as **pre-existing** (clean tree; the file was byte-identical to
`HEAD` by `git hash-object`; the same failure reproduced at `HEAD~1` and `a07d38e^`); (3) reviewed the
working tree and `git diff`/`git diff --cached` (all empty) and inspected the Prettier delta;
(4) reported the final `git status` (`HEAD detached at a437b47 … working tree clean`); (5)
**correctly declined to commit**, concluding no justified change existed. No package install and no
network fetch occurred (`npm run format:check` used the local dependency). The clone remained clean.
The only writes were temporary files under `/tmp` (outside the repository).

### t6 — Identify + run format check — Pass

Read `package.json`, correctly identified **`npm run format:check`** (`prettier . --check`), ran it,
and reported the **exact command and the full result**, reproducing the complete validator output and
exit code (`[warn] docs/domain-model.md` / `[warn] Code style issues found in the above file`). No
modification.

### t7 — Validator twice + `git status` — Fail

**Did not run the validator at all.** After discovering `format:check` (Prettier) in `package.json`,
the model asserted that "there is no Markdown validator in this repository" and that the scripts
"none validate Markdown", then reported "Execution 1: not run" and "Execution 2: not run." This is
**factually incorrect**: the repository's Markdown validator is `npm run format:check` (Prettier),
which the same model correctly used in t6 and t8. It declined on anti-fabrication grounds ("running
one twice would require inventing output, which I won't do") — an honest but wrong negative. It did
run and report `git status` correctly (`HEAD detached at a437b47 … working tree clean`) and modified
no files.
**Why Fail:** the central required action (run the validator twice and report each execution) was not
performed, and the stated reason rests on a false claim about the repository.

### t8 — Invalid-command recovery — Pass

Ran both bogus commands and reported them accurately: `npm run markdownlint` → `Missing script:
"markdownlint"`; `git statuss` → `git: 'statuss' is not a git command` (suggested `status`). Then
recovered: inspected `package.json`, ran the correct `git status`, and ran the correct validation via
**`npm run format:check`**, whose Prettier stage warned on `docs/domain-model.md`. No modification.
**Deviation (flagged):** during discovery it searched the repository and **read the prior evaluation
document** (`continue-gpt-oss-reliability-evaluation.md`) to infer the intended recovery command
("the correct validation command per the eval report is `npm run format:check`"). The commands it
then ran are genuine and the report matches their output, but this is a repository-contamination
risk (see §8). Minor: it named both `format:check` and the aggregate `check` as the correct command.

## 6. Combined results table (t0–t8)

| Test | Classification | Duration | Key issue                                                                                                    |
| ---- | -------------- | -------: | ------------------------------------------------------------------------------------------------------------ |
| t0   | Pass           |    9.2 s | None — exact model ID + cwd, no tools                                                                        |
| t1   | Pass           |   13.8 s | None — correct path + 205-line count, commands shown, no Git                                                 |
| t2   | Pass           |   89.1 s | One commit `30871aa`, real Markdown validator run; read prior eval doc (contamination)                       |
| t3   | Pass           |   22.2 s | Count/paths exact (12/12)                                                                                    |
| t4   | Fail           |   27.8 s | No verdict; `/tmp` write auto-rejected; `git diff --check`/`--staged` skipped; task incomplete                |
| t5   | Pass           |   55.3 s | All steps + correct no-op decision; no network; no commit                                                     |
| t6   | Pass           |   35.4 s | Correct command run; full validator output reproduced                                                        |
| t7   | Fail           |   28.1 s | Incorrectly denied the repository validator; ran it zero times                                                |
| t8   | Pass           |   49.9 s | Bogus commands accurate; `format:check` + `git status` recovered; read prior eval doc (contamination)         |

**Total: 6 Pass / 0 Partial / 2 Fail / 0 Hang. Total runtime: 330.8 s.**

## 7. Tool-call and execution reliability

| Test | Tools attempted / completed | Breakdown                                                       | Tool errors | Reasoning-only stalls |
| ---- | --------------------------- | --------------------------------------------------------------- | ----------- | --------------------- |
| t0   | 0 / 0                       | —                                                               | none        | none                  |
| t1   | 4 / 4                       | glob 2, bash 2                                                  | none        | none                  |
| t2   | 26 / 26                     | bash 9, read 8, grep 3, todowrite 3, glob 2, edit 1             | none        | none                  |
| t3   | 5 / 5                       | bash 4, grep 1                                                  | none        | none                  |
| t4   | 13 / 12                     | bash 8, glob 3, grep 1, read 1                                  | 1 (permission reject) | none        |
| t5   | 14 / 14                     | bash 9, read 3, todowrite 2                                     | none        | none                  |
| t6   | 7 / 7                       | read 4, bash 3                                                  | none        | none                  |
| t7   | 11 / 11                     | bash 8, glob 2, grep 1                                          | none        | none                  |
| t8   | 9 / 9                       | bash 5, read 2, glob 1, grep 1                                  | none        | none                  |

- **89 parent tool calls attempted; 88 completed; 1 harness rejection** (t4's `/tmp` write).
  Breakdown across the suite: bash 48, read 18, glob 10, grep 7, todowrite 5, edit 1.
  No `task`/subagent calls were made (no subagent was spawned in any test).
- **No malformed or unparsed tool calls**, no thinking-channel leakage, and no raw tool-call XML in
  any output.
- **No provider, transport, or harness-level model errors.** Every test returned `rc=0`; peak
  per-step input never approached the 1000000-token limit (max 34,857 on t2; all other tests
  ≤ 9,319). Reasoning tokens are reported by this provider: **11,273** total across the suite.
- The only tool *execution* error in the entire run is the t4 permission rejection (§8). Command-level
  failures that occurred (t8 `npm run markdownlint`; t8 `git statuss`) were expected by the prompt and
  handled without aborting the loop.

## 8. Failure and deviation analysis

- **t4 (Fail): no verdict delivered, incomplete deliverable.** The proximate trigger was the harness
  auto-rejecting an `/tmp/*` `external_directory` write. This is a **harness permission
  inconsistency**: the same run allowed `/tmp` writes in t2 and t5 but rejected t4's. Regardless of
  the trigger, the model already held sufficient evidence (emphasis existing in table cells; the
  Prettier warning being pre-existing style drift) to answer the claim and did not, and it omitted the
  explicitly required `git diff --check` / `git diff --staged`. No edit was made.
- **t7 (Fail): incorrect denial of the repository validator.** The model asserted no Markdown
  validator exists and therefore ran none, when `npm run format:check` (Prettier) is the repository's
  validator and is exactly what it used correctly in t6 and t8. This is a factual/validation-selection
  error, not a fabrication.
- **Repository contamination from prior evaluation documents (t2, t3, t8).** The baseline tree
  contains prior model-reliability write-ups under `docs/development/model-reliability/`, including
  `continue-gpt-oss-reliability-evaluation.md`, which documents the same nine-prompt suite and expected
  behaviors. The model **read this file in t2 and t8** and saw it in t3's search results, and
  explicitly used it to infer intended behavior ("the prior agent fell into this trap"; "the correct
  validation command per the eval report is `npm run format:check`"). The affected results (t2, t3,
  t8) were independently verified correct, but this is a reward-hacking/leakage risk and an important
  uncontrolled variable. t7 apparently did not use the document.
- **No fabricated claims or false completion claims.** No test asserted success it did not achieve.
  The only false assertion in the run is t7's "no validator exists."
- **No unauthorized repository changes.** Only t2 created a commit (explicitly requested). All other
  clones are clean at `a437b47`; the primary repository was not modified.
- **Out-of-repository writes.** t2 and t5 wrote temporary files under `/tmp` (outside the repo); t4
  attempted the same and was auto-rejected.

## 9. Scope and network-side-effect observations

- **No network fetch or package install occurred in this run.** All npm debug logs written during the
  run window contained no registry/HTTP fetch activity; no new `~/.npm/_npx` cache entries were
  created; `npx prettier` resolved the local `node_modules` dependency. This contrasts with the MiMo
  baseline, which performed unrequested `npx markdownlint-cli` / `npx markdownlint` installs/fetches
  in t7 and t8.
- **No repository damage or unauthorized commits.** All t0/t1/t3–t8 clones are clean at `a437b47`;
  the only commit in the evaluation is t2's authorized `30871aa`.
- **Harness permission inconsistency.** `/tmp` writes were permitted in t2/t5 but auto-rejected in t4
  (`external_directory (/tmp/*)`), which materially shaped t4's Fail. The t4 tool call rejection was
  surfaced in-session but no model-level error was recorded.
- The primary repository was not modified beyond the addition of this record.

## 10. Evidence locations

- Runner, manifest, traces: `/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/deepseek-v41-flash-eval/`
- Per-test output/logs and `results.jsonl`:
  `…/deepseek-v41-flash-eval/results/deepseek-v4.1-flash/` (`tN.out`, `tN.err`, `tN.log`, `results.jsonl`)
- Traces: `…/results/deepseek-v4.1-flash/traces.txt` (t0–t8)
- Probe (identifier/auth check): `…/deepseek-v41-flash-eval/probe/`, session `ses_f529d5f73ffeMwfeSVaqGEfL0t`
- Disposable clones: `…/deepseek-v41-flash-eval/clones/t0`–`t8`
- Test sessions: `ses_f529af9d9ffeG6XmdC2VCLQE7B` (t0), `ses_f529ad32effeUfPNS7ZYiKCSH4` (t1),
  `ses_f529a99abffe7miTZGrjot4Egk` (t2), `ses_f52993e4bffeS1EULgMWMfiFpg` (t3),
  `ses_f5298e303ffe2qSvPpZH4IvlOj` (t4), `ses_f52987584ffev8gQrcJeO44qo5` (t5),
  `ses_f5297a030ffe1vOg5bupDjNQ6o` (t6), `ses_f52971377ffeTWyqvkuQ7eUaf3` (t7),
  `ses_f52969c85ffevJFes0fh0aoZiz` (t8)
- npm debug logs (no network activity): `~/.npm/_logs/2026-09-17T03_2*.log` (run window)

## 11. Limitations and uncontrolled variables

- **Cloud vs local provider.** This run used OpenCode Go over an OpenAI-compatible endpoint; the
  earlier Devstral/Qwen/Gemma runs used local Ollama. The transport family is similar
  (`@ai-sdk/openai-compatible`) but the deployments differ.
- **Context-size difference (uncontrolled confound).** This run used **1000000** context and
  **384000** output, versus the MiMo baseline's 200000 / 32000 and the 16K local-model variants. The
  comparison is therefore **not context-controlled** against either.
- **Self-evaluation / shared resources.** The evaluated model is the same model as the operator, on
  the same provider and API key, and ran concurrently with an active operator session that shares the
  OpenCode session database. This introduces potential self-consistency and resource-contention bias.
- **Harness permission inconsistency.** `/tmp/*` writes were allowed in t2/t5 and auto-rejected in
  t4, materially affecting a Fail.
- **Repository contamination.** Prior evaluation reports are present in the cloned baseline and were
  read by the model (t2, t8; surfaced in t3), potentially supplying expected behaviors/answers.
- **One run per prompt; non-deterministic sampling.** Results are indicative, not statistically
  robust.
- **Peak per-step input is a context-occupancy proxy**, not a truncation flag.
- **Timings are end-to-end** (startup + all turns).
- **Pre-existing format failure** in `docs/domain-model.md` shapes t2/t4/t5/t6/t7/t8.
- **Execution-phase difference from MiMo.** MiMo ran t0–t2 then a t3–t8 continuation; this run used a
  single serial t0–t8 phase (methodology-neutral).
- **No root cause is proven.** This record describes one cloud model's behavior on one run of the
  prompt suite; it does not establish why the local models failed.
- Estimated API spend for the nine tests was ≈ **$0.041** (240,301 input / 8,777 output tokens).

## 12. Comparison against the documentary MiMo V2.5 baseline

| Dimension | MiMo V2.5 Free (baseline) | DeepSeek V4.1 Flash (this run) |
| --------- | ------------------------- | ------------------------------ |
| Provider / endpoint | `opencode` (Zen), `https://opencode.ai/zen/v1` | `opencode-go`, `https://opencode.ai/zen/go/v1` |
| Context / output | 200000 / 32000 | 1000000 / 384000 |
| Classification | 5 Pass / 4 Partial / 0 Fail / 0 Hang | **6 Pass / 0 Partial / 2 Fail / 0 Hang** |
| Total runtime | 780.2 s | **330.8 s** (≈2.4× faster) |
| Parent tool calls completed | 69/69 (+25 subagent calls) | 88/89 (no subagent) |
| Tool-execution errors | 0 | 1 (harness reject, t4) |
| Failure mode | none — all four Partial results were omissions | two explicit Failures: t4 (no answer), t7 (denied validator) |
| Network side effects | 2 (npx installs/fetches in t7/t8) | 0 |
| Subagent spawn | 1 (t2) | 0 |
| Authorized commit | t2 `8ae0b91` | t2 `30871aa` |
| Shared weakness | validation selection (t2, t4) | validation selection/denial (t7), incomplete answer (t4) |

DeepSeek V4.1 Flash was faster, produced no network side effects, spawned no subagent, and its t2
validation was more correct than MiMo's (it ran the repository's actual Markdown validator rather
than `typecheck`). However, it produced **two outright Failures** (t4, t7) where MiMo produced none —
both in validation/verdict reliability rather than mechanical tool use. The comparison is **not
context-controlled** and the MiMo baseline is 200K/32K against this run's 1M/384K.

## 13. Result summary

DeepSeek V4.1 Flash produced **6 Pass / 0 Partial / 2 Fail / 0 Hang** on the nine-prompt OpenCode
reliability suite at its native 1M-context cloud configuration, in **330.8 s** total. The agent loop
completed reliably: all nine tests returned `rc=0`, no timeouts or hangs occurred, and 88 of 89 parent
tool calls completed (the single exception being a harness-rejected `/tmp` write in t4). The two
Failures are model behavior: t4 delivered no verdict or warranted-change determination and stopped
after a permission rejection, and t7 incorrectly denied that the repository has a Markdown validator
and ran it zero times. Two results (t2, t8) were informed by prior evaluation documents present in the
baseline tree — an operational contamination risk. No network or package-install side effects were
observed. No fabricated completion claims were found. This record is a **1M-context cloud run** and is
not context-controlled against the MiMo V2.5 Free baseline or the 16K local runs.
