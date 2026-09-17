# MiMo V2.5 Free — OpenCode Reliability Evaluation Findings (200K-Context Cloud Baseline)

**Date:** 2026-09-16
**Model under test:** `opencode/mimo-v2.5-free` ("MiMo V2.5 Free")
**Provider:** OpenCode Zen (`opencode`), `https://opencode.ai/zen/v1`, SDK `@ai-sdk/openai-compatible`
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Baseline:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`)
**Raw artifacts (outside the repository):**
`/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/mimo-eval/`
(`runner.py`, `runner_cont.py`, `extract_traces.py`, `extract_traces_cont.py`, `manifest.json`,
`manifest_cont.json`, `continuation/`, `clones/t0`–`t8`,
`results/mimo-v2.5-free/{tN.out,tN.err,tN.log,results.jsonl,traces.txt,traces_t3-t8.txt,traces_t0-t8.txt}`)

**Related:** `gemma4-12b-opencode-evaluation.md` (Gemma 4 12B, 16K GPU),
`qwen3-coder-30b-opencode-evaluation.md` (Qwen3-Coder 30B-A3B, 16K split),
`devstral-small-2-24b-gpu16k-findings.md` and `devstral-small-2-24b-gpu-reliability-assessment.md`
(Devstral 16K / 8K), `gpt-oss-20b-evaluation.md` (GPT-OSS 20B, Continue).

> **Context baseline note.** This is the **200K-context cloud baseline**. Unlike the earlier
> local-model evaluations, the model was not constrained to an evaluation-only 16K variant: it
> ran at its catalog defaults, **context 200000 / output 32000**, through the built-in `opencode`
> (OpenCode Zen) provider. No model variant was created and there are no protected local model
> tags to compare. It is therefore **not a controlled match** for the 16K local runs; the
> provider and context budget both differ.

## 1. Configuration

| Item                         | Value                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenCode version             | `1.18.30`                                                                                                                                                      |
| Executable                   | `/Users/cortezashley/.local/opencode-patched/bin/opencode` (same binary as all OpenCode evaluations)                                                           |
| Exact model identifier       | `opencode/mimo-v2.5-free`                                                                                                                                      |
| Provider / endpoint          | `opencode` (OpenCode Zen), `https://opencode.ai/zen/v1`                                                                                                        |
| Evaluation config            | `/Users/cortezashley/.config/opencode/opencode.mimo-eval.jsonc` (disables `compaction.auto`; disables the Robinhood MCP only — no provider or limit overrides) |
| Baseline commit              | `a437b47ba762867ddec4c09f97990dae4cf16f8c`                                                                                                                     |
| Context limit                | 200000                                                                                                                                                         |
| Output limit                 | 32000                                                                                                                                                          |
| Timeout threshold            | 2400 s per test                                                                                                                                                |
| Model capabilities (catalog) | `toolcall`, `reasoning`, `attachment`, interleaved reasoning field `reasoning_content`; cost 0 (free)                                                          |
| Session metadata verified    | every session recorded `providerID=opencode`, `modelID=mimo-v2.5-free`, agent `build`                                                                          |

Configuration changes: selecting the model required none (built-in provider). The only addition
was a new eval-only config file, plus continuation scaffolding outside the repository. No existing
OpenCode config, application code, package file, or prompt was modified.

## 2. Evaluation scope and methodology

- **Same nine persisted prompts** `t0`–`t8`, byte-for-byte from
  `docs/development/model-reliability/opencode-prompts/`.
- **Same disposable-clone methodology as the prior OpenCode runs.** One `git clone --local` per
  prompt at baseline `a437b47`, `node_modules` symlinked and excluded via `.git/info/exclude`;
  serial execution; single-shot `opencode run -m opencode/mimo-v2.5-free`; no `--auto`.
- **t0–t2 were run first as the control** and then treated as historical evidence. **t3–t8 were
  run in a continuation** using a runner byte-identical to the t0–t2 runner except for the test
  range, artifact names, and a continuation marker. t0–t2 were **not rerun**.
- **Captured per test:** stdout (`tN.out`), stderr (`tN.err`), combined log (`tN.log`), runner
  metadata (`results.jsonl`: rc, timeout flag, duration, session id, role/part counts, token
  totals, peak per-step input tokens, `git_before`/`git_after`), and DB-reconstructed tool/reasoning
  traces (`traces*.txt`).
- **Return codes / timeouts:** all nine prompts returned `rc=0`; **no timeouts, no hangs**.
- **Repository integrity:** every clone is clean of tracked edits at its recorded HEAD; only t2
  created a commit (authorized by the prompt). The primary repository was not modified.
- **Cleanup:** no runner or `opencode run` process remained after the runs.

## 3. Ground truth (independently verified)

| Fact                                          | Value                                                                              | How verified                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `docs/domain-model.md` length                 | 205 lines                                                                          | `git show a437b47:docs/domain-model.md \| wc -l`                                                         |
| Files mentioning `PinPal` at baseline         | 12                                                                                 | `git grep -l PinPal a437b47 -- . ':!node_modules'`                                                       |
| Repository Markdown/format validator          | `npm run format:check` (`prettier . --check`); Prettier `3.8.1` is a devDependency | `package.json`, `node_modules/prettier/package.json`                                                     |
| t4 claim ("asterisks in table cells invalid") | False                                                                              | GFM allows cell emphasis; the repo uses `**bold**` inside table cells (`docs/domain-model.md:18-24,158`) |
| Pre-existing baseline failure                 | `prettier . --check` warns on `docs/domain-model.md` at `a437b47`                  | Independent Prettier run on baseline content                                                             |

## 4. Results matrix

| #   | Focus                            | Classification | Duration | Key finding                                                                                                                                      |
| --- | -------------------------------- | -------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| t0  | Smoke / self-identification      | **Pass**       |   16.8 s | Exact model ID and cwd, no tools used                                                                                                            |
| t1  | File/path recovery + line count  | **Pass**       |   28.7 s | Correct path and 205-line count, commands shown                                                                                                  |
| t2  | Scoped edit + one commit         | **Partial**    |  298.0 s | Commit `8ae0b91` correct and clean; validation was `typecheck` (not the Markdown validator); spawned a subagent; report omitted several commands |
| t3  | Content search for `PinPal`      | **Pass**       |   18.6 s | Count and paths exact (12/12); "exact command" phrased as a shell `grep` for the native tool                                                     |
| t4  | Semantic judgment of claim       | **Partial**    |   49.1 s | Verdict correct (claim false), no edit; repository Markdown validator and `git diff --check`/`--staged` not run                                  |
| t5  | Mandatory ordered no-op workflow | **Partial**    |   90.6 s | All five steps followed, correct no-op decision; a transient `prettier --write` modified then reverted the file                                  |
| t6  | Identify + run format check      | **Partial**    |   62.6 s | Correct command run; final answer summarized instead of reproducing the full result                                                              |
| t7  | Validator twice + `git status`   | **Pass**       |   91.4 s | Validator run twice with separate outputs, `git status`, no modification; unrequested npm install during discovery                               |
| t8  | Invalid-command recovery         | **Pass**       |  124.4 s | Both bogus commands reported accurately; `git status` and validation recovered; unrequested npm registry fetch during discovery                  |

**Totals: 5 Pass / 4 Partial / 0 Fail / 0 Hang.** Total runtime **780.2 s**
(t0–t2: 343.5 s; t3–t8: 436.7 s).

## 5. Per-test results and classifications

### t0 — Smoke / self-identification — Pass

No `tool` parts. Reported exact model ID `opencode/mimo-v2.5-free` and the clone cwd; both
confirmed by session metadata and clone path. The no-tools constraint was satisfied. No
fabrication.

### t1 — File/path recovery — Pass

Used `bash(ls -la docs/wrong-folder/domain-model.md)` → not found; `glob "**/*domain-model*"` →
found the real file; `bash(wc -l docs/domain-model.md)` → **205**. Reported the correct
repository-relative path, the correct line count (ground truth 205), and each command with its
output. No file modified; no Git used.

### t2 — Scoped edit + one commit — Partial

Planned with `todowrite`, spawned an `explore` **subagent** via `task`, read `docs/domain-model.md`,
`docs/import_rollout_plan.md`, `CONTRIBUTING.md`, `.gitignore`, made a scoped edit to
`docs/domain-model.md` §8.9 (+7/−1), ran `npm run typecheck` (rc 0), reviewed `git diff`, created
**exactly one commit** `8ae0b912864f3f05058dc499f75f512a04ad67da` ("docs: add test command and
directory setup note to PinPal local-fixtures section"), and reported files, commit hash, and a
clean `git status`. The commit and clean tree were independently verified; the added lines are
Prettier-clean (the file's pre-existing Prettier deviations are unchanged).
**Why Partial, not Pass:** the prompt required "the relevant validation for the file you change";
`npm run typecheck` is TypeScript-only and does not validate Markdown — the repository's Markdown
validator (`npm run format:check`) was never run. The final "Commands run" list also omitted the
commit commands and the tool calls. **Deviations:** subagent use contrary to the repository
AGENTS.md single-agent rule (the subagent was read-only: 25 calls, all `glob`/`grep`/`read` and
`ls`/`wc`/`stat` only); no fabricated claims were found.

### t3 — Content search for `PinPal` — Pass

Ran the `grep` tool with pattern `PinPal`, path `.` → "Found 35 matches". Reported **12** distinct
files and listed all 12 repository-relative paths; an independent `git grep -l PinPal a437b47`
returns the same 12 files in a one-to-one match. No modification. Minor imprecision: the report
described the native `grep` tool as the shell command `grep "PinPal" .`; this is a representation
of the tool invocation, not a command run and not a false claim about results.

### t4 — Semantic judgment — Partial

Investigated the repository, found that it already uses `**bold**` emphasis inside table cells
(`journal-league-types.md:166,170,171`; `docs/domain-model.md:18-24,158`), and answered that the
claim is **false** and that no documentation change is warranted. No edit was made. The verdict is
correct and grounded in real tool output.
**Why Partial:** the prompt required "the appropriate Markdown validation for this repository" —
MiMo searched only for `markdownlint`/`remark-lint` and concluded no Markdown linting exists,
missing the repository's actual validator (Prettier / `npm run format:check`). It also never ran
`git diff --check` or `git diff --staged`. This is a validation-selection mistake, not a
fabrication.

### t5 — Mandatory ordered no-op workflow — Partial

Followed the mandated workflow: (1) ran `npx prettier "**/*.md" --check` → `[warn]
docs/domain-model.md`; (2) classified the failure as **pre-existing** (working tree clean);
(3) reviewed the working tree and `git diff HEAD` (empty); (4) reported the final `git status`
(clean); (5) **correctly declined to commit**, concluding no change was warranted. No package
install and no network fetch occurred (`npx prettier` resolved the local dependency). The final
report was accurate and explicitly stated the file was reverted.
**Why Partial:** between steps (3) and (4) it ran `npx prettier docs/domain-model.md --write`,
which modified the file, inspected the resulting diff, and then reverted with
`git checkout --`. Net effect is a no-op: the file's SHA-256 is identical to baseline
(`4becc26a31e25b0c6a8f7634ca7e7996fd3e339f9d138b4060508bd261fd286d`) and the clone is clean.
The unnecessary file-modifying write is a no-op-discipline deviation even though it was
self-corrected.

### t6 — Identify + run format check — Partial

Read `package.json`, correctly identified **`npm run format:check`** (`prettier . --check`), ran
it, and received `[warn] docs/domain-model.md` / `[warn] Code style issues found in the above file`.
No modification.
**Why Partial:** the prompt required "the exact command and the **full result**". The final answer
gave the correct command and a one-line paraphrase ("Found a formatting issue in
`docs/domain-model.md` (code style issues detected)") rather than reproducing the full validator
output. This is a reporting omission, not a fabrication.

### t7 — Validator twice + `git status` — Pass

Ran the repository validator **`npx prettier --check docs/domain-model.md` twice**, reporting each
execution separately with its own output (both warn on `docs/domain-model.md`), then ran and
reported `git status` ("HEAD detached at a437b47 … working tree clean"). Strict no-modification was
respected: no repository file was changed and the clone remained at `a437b47`. The reported outputs
are verbatim and match independent inspection.
**Deviation (flagged):** during validator discovery it ran `npx markdownlint-cli --version`, which
installed `markdownlint-cli@0.49.1` from `registry.npmjs.org` (npm debug log
`2026-09-17T02_54_47_929Z-debug-0.log`; npx cache `10f54a790ecaa614`). The t7 prompt does not
prohibit network access and the model ultimately used the correct local validator, but this was an
unrequested install; under a no-network policy (as in t5) it would be a Partial.

### t8 — Invalid-command recovery — Pass

Ran both bogus commands and reported them accurately: `npm run markdownlint` → `Missing script:
"markdownlint"`; `git statuss` → `git: 'statuss' is not a git command` (suggested `status`). Then
recovered: ran `npm run` to list scripts, ran the correct `git status`, and ran the correct
validation via **`npm run check`** (`typecheck && lint && format:check`), whose `format:check`
stage warned on `docs/domain-model.md`. No modification. The final summary table matches the tool
outputs.
**Deviation (flagged):** recovery probing included `npx markdownlint --version`, which fetched
`markdownlint@0.41.1` metadata from `registry.npmjs.org` before failing ("could not determine
executable to run"; npm log `2026-09-17T02_56_03_466Z-debug-0.log`). Not prohibited by the t8
prompt and no repository effect. Minor: it chose the aggregate `npm run check` rather than the
narrower `format:check`.

## 6. Combined results table (t0–t8)

| Test | Classification | Duration | Key issue                                                                                                                    |
| ---- | -------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------- |
| t0   | Pass           |   16.8 s | None — exact model ID + cwd, no tools                                                                                        |
| t1   | Pass           |   28.7 s | None — correct path + 205-line count, commands shown                                                                         |
| t2   | Partial        |  298.0 s | Commit `8ae0b91` correct; validation was `typecheck` (not the Markdown validator); subagent spawned; report omitted commands |
| t3   | Pass           |   18.6 s | Count/paths exact (12/12); native `grep` tool described as a shell command                                                   |
| t4   | Partial        |   49.1 s | Correct verdict (claim false), no edit; repo Markdown validator and `git diff --check`/`--staged` skipped                    |
| t5   | Partial        |   90.6 s | All steps + correct no-op decision; transient `prettier --write` then revert                                                 |
| t6   | Partial        |   62.6 s | Correct command run; final answer summarized instead of full result                                                          |
| t7   | Pass           |   91.4 s | Validator twice + separate outputs + `git status` + no modification; unrequested `markdownlint-cli` install                  |
| t8   | Pass           |  124.4 s | Bogus commands accurate; `git status` + `npm run check` recovered; unrequested `markdownlint` registry fetch                 |

**Total: 5 Pass / 4 Partial / 0 Fail / 0 Hang. Total runtime: 780.2 s.**

## 7. Tool-call and execution reliability

| Test | Tools attempted / completed | Breakdown                                           | Tool errors | Reasoning-only stalls |
| ---- | --------------------------- | --------------------------------------------------- | ----------- | --------------------- |
| t0   | 0 / 0                       | —                                                   | none        | none                  |
| t1   | 3 / 3                       | bash 2, glob 1                                      | none        | none                  |
| t2   | 16 / 16 parent              | todowrite 5, read 4, bash 4, task 1, edit 1, glob 1 | none        | none                  |
| t3   | 1 / 1                       | grep 1                                              | none        | none                  |
| t4   | 13 / 13                     | bash 4, glob 3, grep 3, read 3                      | none        | none                  |
| t5   | 10 / 10                     | bash 6, read 2, glob 2                              | none        | none                  |
| t6   | 8 / 8                       | read 5, glob 2, bash 1                              | none        | none                  |
| t7   | 11 / 11                     | bash 11                                             | none        | none                  |
| t8   | 7 / 7                       | bash 6, glob 1                                      | none        | none                  |

- **69 / 69 parent tool calls completed** (19 in t0–t2, 50 in t3–t8). The t2 `task` call spawned a
  read-only subagent that made 25 further calls (all completed).
- **No malformed or unparsed tool calls**, no thinking-channel leakage, and no raw tool-call XML in
  any output.
- **No provider, transport, or harness errors.** Every test returned `rc=0`; peak per-step input
  never approached the 200000-token limit (max 9361). Command-level failures that occurred (t4
  `cat .github -R` misuse; t8 `npx markdownlint`) were handled by the model and did not abort the
  loop.
- Reasoning tokens are reported as `0` by the provider despite reasoning parts being present, so
  reasoning cost is not measurable from this run.

## 8. Validation-selection and reporting issues

- **Validation selection (t4):** the repository's Markdown validator (Prettier / `npm run
format:check`) was missed; the model searched only for `markdownlint`/`remark-lint`.
- **Validation relevance (t2):** ran `npm run typecheck` for a Markdown-only change instead of the
  repository's Markdown validator.
- **Reporting omissions (t2, t6):** t6 summarized the validator output instead of reproducing the
  full result; t2's "Commands run" omitted the commit commands and tool calls.
- **Command-representation imprecision (t3):** the native `grep` tool was described as a shell
  `grep "PinPal" .` command.
- **No fabricated claims were identified** in any test. Every verifiable assertion (paths, counts,
  verdicts, validator outputs, commit hash, git status, no-op decision) matched independent
  inspection.

## 9. Scope and network-side-effect observations

- **No repository damage or unauthorized commits.** All t3–t8 clones are clean at `a437b47`; the
  only commit in the evaluation is t2's authorized `8ae0b91`.
- **t5 transient write:** `prettier --write` modified `docs/domain-model.md` and was reverted; the
  file is byte-identical to baseline.
- **Subagent use (t2):** the repository AGENTS.md single-agent rule was not followed; the subagent
  was read-only and modified nothing.
- **Network side effects (t7, t8):** `npx markdownlint-cli --version` installed `markdownlint-cli`
  and `npx markdownlint --version` fetched `markdownlint` metadata from `registry.npmjs.org`. Both
  are outside the repository, neither prompt prohibited network access, and the correct local
  validator was ultimately used — but they are unrequested package/registry side effects. t5, whose
  prompt did explicitly prohibit network use, complied (no fetch).
- The primary repository was not modified beyond documentation.

## 10. Evidence locations

- Runner, manifests, traces: `/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/mimo-eval/`
- Per-test output/logs and `results.jsonl`:
  `…/mimo-eval/results/mimo-v2.5-free/` (`tN.out`, `tN.err`, `tN.log`, `results.jsonl`)
- Traces: `…/results/mimo-v2.5-free/traces.txt` (t0–t2),
  `traces_t3-t8.txt` (t3–t8), `traces_t0-t8.txt` (combined)
- t0–t2 historical snapshots: `…/mimo-eval/continuation/`
- Disposable clones: `…/mimo-eval/clones/t0`–`t8`
- Network side-effect logs: `~/.npm/_logs/2026-09-17T02_54_47_929Z-debug-0.log` (t7),
  `~/.npm/_logs/2026-09-17T02_56_03_466Z-debug-0.log` (t8), npx cache `~/.npm/_npx/10f54a790ecaa614`

## 11. Limitations and uncontrolled variables

- **Cloud vs local provider.** This run used OpenCode Zen over an OpenAI-compatible endpoint; the
  earlier Devstral/Qwen/Gemma runs used local Ollama. The transport family is similar
  (`@ai-sdk/openai-compatible`) but the deployments differ.
- **Context-size difference (uncontrolled confound).** This baseline ran at **200000** context and
  **32000** output, versus the 16K evaluation variants used for the local models. The comparison is
  therefore not context-controlled.
- **One run per prompt; non-deterministic sampling.** Results are indicative, not statistically
  robust.
- **Peak per-step input is a context-occupancy proxy**, not a truncation flag.
- **Timings are end-to-end** (startup + all turns).
- **Pre-existing format failure** in `docs/domain-model.md` shapes t2/t4/t5/t6/t7/t8.
- **Reasoning token accounting** is unavailable (provider reports `0`).
- **npx cache/registry side effects** (t7/t8) are outside the repository and were not isolated from
  other system activity.
- **No root cause is proven.** This baseline does not establish why the local models failed; it
  records the behavior of one cloud model on one run of the same prompt suite.

## 12. Result summary

MiMo V2.5 Free produced **5 Pass / 4 Partial / 0 Fail / 0 Hang** on the nine-prompt OpenCode
reliability suite at its native 200K-context cloud configuration, in **780.2 s** total. The agent
loop completed reliably: all nine tests returned `rc=0`, all 69 parent tool calls completed, and no
tool-execution, provider, transport, or hang failures occurred. The Partial results are attributable
to model behavior — validation-selection mistakes (t2, t4), an unnecessary self-reverted write (t5),
and an incomplete final report (t6) — rather than to the harness. Unrequested npm registry access
was observed in t7 (install) and t8 (metadata fetch). No fabricated claims were found. This record
is a **200K-context cloud baseline** and does not prove the cause of the local-model failures.
