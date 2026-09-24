# GPT-OSS 20B vs Devstral Small 2 24B — Frozen-Harness Reliability Comparison

This document compares two **completed** frozen-harness model-reliability evaluations that used the
same general test suite (the frozen OpenCode `t0`–`t8` prompt set) but each evaluated its model in
its **own configured environment**. It is a descriptive comparison of observed behavior. It adds no
new runs, no new metrics, and no ranking.

Source reports (read, not modified):

- `docs/development/model-reliability/gpt-oss-20b-frozen-harness-evaluation.md`
- `docs/development/model-reliability/devstral-small-2-24b-frozen-harness-evaluation.md`

Where the two reports record a detail differently, the difference is preserved and stated below
rather than reconciled.

## 1. Title and evaluation scope

| Item                        | GPT-OSS 20B                                                                                                                                        | Devstral Small 2 24B                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model under test            | `ollama/gpt-oss:20b` ("GPT-OSS 20B")                                                                                                               | `ollama/devstral-small-2:24b-gpu16k` ("Devstral Small 2 24B")                                                                                       |
| Exact OpenCode-qualified ID | `ollama/gpt-oss:20b` (provider `ollama`, model `gpt-oss:20b`)                                                                                      | `ollama/devstral-small-2:24b-gpu16k` (provider `ollama`, model `devstral-small-2:24b-gpu16k`)                                                       |
| Inference host              | Self-hosted Ollama `0.33.2`, LAN endpoint `http://192.168.68.52:11434`                                                                             | Self-hosted Ollama `0.33.2`, LAN endpoint `http://192.168.68.52:11434`                                                                              |
| Harness / OpenCode version  | OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)                                                                    | OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)                                                                     |
| Harness commit              | `a31d1a321321b65fa92752d57e6149f0f03b2ccb`                                                                                                         | `a31d1a321321b65fa92752d57e6149f0f03b2ccb`                                                                                                          |
| Baseline HEAD               | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)                              | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)                               |
| Prompts                     | `docs/development/model-reliability/opencode-prompts/`, frozen `prompt_manifest.json` (`t0`–`t8`)                                                  | Same frozen `t0`–`t8` prompt set and manifest                                                                                                       |
| Evaluation config           | `/Users/cortezashley/.config/opencode/opencode.gpt-oss-20b-eval.jsonc` (sha256 `1f7a6dea8a4965c89cf4bbdaf7ea8042e3c7103e594addc9c3c79d572859efce`) | `/Users/cortezashley/.config/opencode/opencode.devstral-eval-16k.jsonc` (sha256 `d2ac99351b4c28f681c8d21ff08455f0d1a74b895f2d6d0afd28853f26e600b0`) |
| Context limit               | **Not recorded in the GPT-OSS source report**                                                                                                      | 16 384 tokens                                                                                                                                       |
| Output limit                | **Not recorded in the GPT-OSS source report**                                                                                                      | 6 144 tokens                                                                                                                                        |
| Compaction                  | **Not recorded in the GPT-OSS source report**                                                                                                      | `auto: false`                                                                                                                                       |
| Permissions                 | `external_directory: deny`, `webfetch: deny`, `websearch: deny`; `robinhood-trading` MCP disabled                                                  | `external_directory: deny`, `webfetch: deny`, `websearch: deny`; `robinhood-trading` MCP disabled                                                   |
| Per-test timeout            | 900 s                                                                                                                                              | 900 s                                                                                                                                               |
| Number of tests             | 9 (`t0`–`t8`, one run each)                                                                                                                        | 9 (`t0`–`t8`, one run each)                                                                                                                         |
| Evaluation date             | 2026-09-17                                                                                                                                         | 2026-09-18                                                                                                                                          |
| Workspaces                  | `/Users/cortezashley/.local/share/opencode-evals/gpt-oss-20b-t{0..8}` (t0 variant `gpt-oss-20b-t0-qualified`)                                      | `/Users/cortezashley/.local/share/opencode-evals/devstral-small-2-24b-t{0..8}` (variant `devstral-16k`)                                             |

**Isolation methodology (as recorded).**

- GPT-OSS: each test provisioned into a fresh sanitized workspace — an isolated clone at the baseline
  HEAD, with copied (never symlinked) `node_modules` and no escaping symlinks. No workspace was
  reused. Sessions were independently verified against the OpenCode session database
  (`providerID`, `modelID`, assistant response, nonzero token usage, expected prompt received,
  recorded tool calls/arguments, permission events). The model's final narrative was not accepted as
  proof that an operation occurred.
- Devstral: one fresh workspace per test; `git archive` baseline export (never `clone --local`);
  fresh single-commit repo; copied (never symlinked) `node_modules`; exact-realpath session matching;
  `TMPDIR=<clone>/.eval-tmp`; offline npm; no workspace or session reuse. A 13-check preflight was
  recorded as all-pass. Adjudication used the raw trace, session DB, tool arguments, command output,
  and Git state; prose was never treated as proof.

**Important comparability limitations.**

- The two models are different in architecture and runtime configuration; only the harness, prompt
  set, baseline, and general method are shared.
- The GPT-OSS report does **not** record context/output limits or a compaction setting, whereas the
  Devstral report records 16 384 context / 6 144 output / compaction `auto: false`. This difference
  is preserved, not reconciled; the two configurations may differ in context, quantization, or other
  runtime details.
- GPT-OSS required a **provider-qualified** model identifier. Two prior attempts that passed the
  bare model name `gpt-oss:20b` exited `rc=1` with an `UnknownError` and zero tokens; those orphaned
  workspaces (`gpt-oss-20b-t0`, `gpt-oss-20b-t0-r2`) were not reused. The Devstral report records no
  analogous failed-identifier attempts; its preflight confirmed the model was advertised and used.
- The reports were authored on different dates (2026-09-17 vs 2026-09-18) but at the same harness
  commit and baseline HEAD.
- Both reports explicitly state they do not invent metrics, rankings, or comparisons beyond the
  recorded evidence.

## 2. Aggregate results

**GPT-OSS 20B.** Automated scorer totals: 3 Pass / 6 Fail. Adjudicated totals: 3 Pass (t0, t1, t6)

- 1 Pass by adjudication (t3) + 1 Partial/FAIL (t4) + 4 Fail (t2, t5, t7, t8). The model did not pass
  the full suite.

**Devstral Small 2 24B.** Raw scorer totals: 3 Pass / 6 Fail. Adjudicated: 3 PASS / 6 FAIL. The model
did not pass the full suite.

| Metric                   | GPT-OSS 20B                                                                                               | Devstral Small 2 24B                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PASS count (adjudicated) | 4 (t0, t1, t3, t6)                                                                                        | 3 (t0, t1, t8)                                                                                                                                                     |
| FAIL count (adjudicated) | 4 (t2, t5, t7, t8)                                                                                        | 6 (t2, t3, t4, t5, t6, t7)                                                                                                                                         |
| PARTIAL count            | 1 (t4, recorded as "Partial/FAIL")                                                                        | 0                                                                                                                                                                  |
| INVALID count            | 0 (not separately tabulated; §7 states no infrastructure or invocation failure aborted a test)            | 0 (no infrastructure/harness failure aborted a test)                                                                                                               |
| Scorer false positives   | 1 documented (t5.preexisting_classified)                                                                  | 2 documented (t5.preexisting_classified, t6.output_reported)                                                                                                       |
| Scorer false negatives   | 3 documented (t3.search_ran; t4.verdict_false and t4.no_change_warranted wording matches)                 | 1 documented (t3.search_ran, subagent trace not captured)                                                                                                          |
| Signal considered valid  | Yes — §7: negative adjudications are model-reliability signals, not infrastructure or invocation failures | Yes — all nine tests were genuine, isolated, non-reused sessions on the exact qualified model; automated scorer agrees with adjudicated verdicts in all nine cases |

Notes on the table:

- The two reports tabulate totals differently. GPT-OSS reports automated and adjudicated totals
  separately and records t4 as "Partial/FAIL"; Devstral reports like-for-like raw and adjudicated
  totals (agreeing in all nine cases) with PARTIAL and INVALID explicitly zero. The GPT-OSS report
  does not enumerate an explicit INVALID count; the 0 value reflects its statement in §7.
- The GPT-OSS report frames its scorer defects as "understating or misattributing three tests
  (t3, t4, t5)": the t3 false negative, two t4 wording false negatives, and the t5 false positive.
- No composite score, ranking, tier, or overall rating is presented here, matching the source
  reports.

## 3. Test-by-test comparison

| Test                                | GPT-OSS result               | Devstral result | GPT-OSS observed behavior                                                                                                                                                                                                                                                                                | Devstral observed behavior                                                                                                                                                                                                                                                                                                                                   | Comparison / interpretation                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t0 Smoke / self-identification      | Pass                         | Pass            | Reported `gpt-oss:20b` and the evaluation working directory; no tools used.                                                                                                                                                                                                                              | Reported the exact model id and the evaluation working directory; no tools used.                                                                                                                                                                                                                                                                             | Both passed with the same behavior.                                                                                                                                                                                                                                                                  |
| t1 File/path recovery + line count  | Pass                         | Pass            | Recovered `docs/domain-model.md`, reported 205 lines using `glob` and `read`; no Git; no modification. One `read` of an external absolute path was denied by the `external_directory` policy and correctly contained.                                                                                    | Used `glob {"pattern":"**/domain-model.md"}` and `read <clone>/docs/domain-model.md`; correct path and 205-line count from captured `read` output; no modification.                                                                                                                                                                                          | Both passed; both recovered the same path and count by discovery tools rather than Git. GPT-OSS additionally triggered (and was contained by) one permission denial.                                                                                                                                 |
| t2 Scoped edit + one commit         | Fail                         | Fail            | Target file discoverable, but searched only by filename (repeated `glob`), grepped the hyphenated literal `local-fixtures`, then abandoned the task and asked the user for a path. No edit, no validator run, no diff review, no commit.                                                                 | Made a scoped docs edit (`docs/import_rollout_plan.md`), ran lint/format/typecheck and `git diff -- docs/import_rollout_plan.md`, but never created the requested commit; working tree left dirty; summary claimed the change was "ready for review and commit".                                                                                             | Both failed the required commit. Failure modes differ: GPT-OSS abandoned before editing and asked the user; Devstral performed the edit and validation but did not commit and left the tree dirty.                                                                                                   |
| t3 Content search for `PinPal`      | Pass (scorer false negative) | Fail            | Ran `grep -rl "PinPal" .` via Bash and reported exactly 11 files with all 11 correct repository-relative paths. Scorer marked `t3.search_ran` failed because its detector does not recognize `grep` inside command substitution/assignment.                                                              | Delegated to a `task` subagent (`general`); the child session ran a native `grep {"pattern":"PinPal"}`. The model reported "13 matching files" while ground truth is 11; it listed the 11 correct paths but asserted the wrong total. The count error is decisive. Scorer `t3.search_ran` was a false negative (search ran in the uncaptured child session). | Divergent. GPT-OSS produced the correct count (11) and paths; Devstral produced the correct paths but an incorrect aggregate count (13 vs 11). Both reports document the same family of search-detection false negative, for different root causes (command substitution vs subagent trace scope).   |
| t4 Semantic judgment of claim       | Partial/FAIL                 | Fail            | Correctly concluded the claim is false and that no documentation change was warranted, and made no change; however, it did not run the requested `git diff --check` / `git diff --staged` or the repository Markdown validator. Scorer had two wording-related false negatives.                          | The only assistant text was "Task completed." — no verdict on the claim, no repository validator run, and no `git diff --check` / `git diff --staged`.                                                                                                                                                                                                       | Divergent. GPT-OSS reached the correct conclusion but omitted required workflow steps (partial); Devstral delivered no conclusion or workflow at all.                                                                                                                                                |
| t5 Mandatory ordered no-op workflow | Fail                         | Fail            | Only the validator step completed (`npm run format:check` reported the pre-existing `docs/domain-model.md` warning). Did not run `git status` or `git diff`, did not classify the failure as pre-existing vs self-caused, and asserted a Git-status result it never executed. No modification or commit. | Fixated on `markdownlint`, which is not the repository validator; never ran `npm run format:check`; never ran `git status`/`git diff`; attempted a network/global install (`npm install -g markdownlint-cli`) that the prompt forbade and that succeeded. Final text "Task completed."                                                                       | Both failed. Both skipped the mandated Git review/classification and engaged the wrong validator family. Devstral additionally violated the explicit no-install/no-network instruction and never produced a classification; GPT-OSS ran the correct validator but asserted an unexecuted Git result. |
| t6 Identify + run format check      | Pass                         | Fail            | Identified `npm run format:check`, executed it directly and through `npm run check`, and reported the captured prettier warning on `docs/domain-model.md`. No modification.                                                                                                                              | Located `package.json` (which defines `"format:check": "prettier . --check"`) but never ran the validator and produced no assistant text at all.                                                                                                                                                                                                             | Divergent. GPT-OSS identified and executed the validator and reported its output; Devstral identified the definition but neither ran it nor answered.                                                                                                                                                |
| t7 Validator twice + `git status`   | Fail                         | Fail            | Fixated on `markdownlint` (absent), attempted `npx markdownlint` and `markdownlint --version`; the repository validator was never executed. Did run `git status --short`. No modification.                                                                                                               | Ran a nonexistent `npm run markdown-validate` twice; ran `git status` (clean) but did not report it; then conducted a filesystem-wide hunt for `markdownlint`. Incurred 23 `external_directory` denials. Repository validator never executed.                                                                                                                | Both failed with the same core error: fixation on `markdownlint`-family tooling instead of the repository validator. GPT-OSS ran `git status --short`; Devstral ran `git status` but left it unreported and additionally probed outside the workspace 23 times (all denied).                         |
| t8 Invalid-command recovery         | Fail                         | Pass            | Correctly ran and reported the two invalid commands (`npm run markdownlint` → missing script; `git statuss` → not a git command) and recovered the validator via `npm run check` (which runs `npm run format:check`). It did **not** execute the correct `git status`, only describing it in text.       | Reported both bogus commands accurately and recovered with the correct validator (`npm run format:check`, output corroborated by the captured prettier warning) and the correct `git status`; no modification.                                                                                                                                               | Divergent. Both reported the two bogus commands and recovered the validator; Devstral additionally executed and delivered the correct `git status`, whereas GPT-OSS described it without executing it.                                                                                               |

Grouping:

- **Both passed:** t0, t1.
- **Both failed:** t2, t5, t7.
- **Results differed:** t3 (GPT-OSS pass by adjudication vs Devstral fail), t4 (GPT-OSS Partial/FAIL vs
  Devstral fail), t6 (GPT-OSS pass vs Devstral fail), t8 (GPT-OSS fail vs Devstral pass).
- **Failure-mode differences:** on t2 GPT-OSS abandoned before editing while Devstral edited but did
  not commit; on t5 Devstral violated the no-install instruction while GPT-OSS asserted an
  unexecuted Git result; on t7 Devstral incurred 23 out-of-workspace denials while GPT-OSS did not
  record any; on t8 the models differed only on whether the correct `git status` was executed.

No claim that either model is better overall is made or implied by this table.

## 4. Reliability dimensions

Each conclusion cites the test(s) from the source reports that support it. No behavior is inferred
beyond what was recorded.

### Basic discovery and repository navigation

- GPT-OSS: sound. t0 passed with correct self-identification and working directory; t1 passed by
  recovering `docs/domain-model.md` and reporting 205 lines with `glob` and `read`.
- Devstral: sound. t0 passed with the exact model id and working directory; t1 passed with
  `glob`/`read` on `**/domain-model.md` and the correct 205-line count.
- Both reports describe basic discovery as reliable on the tests that exercised it (t0, t1); t3's
  search is a separate content-search case covered below.

### Multi-step workflow completion

- GPT-OSS: not reliable for ordered workflows. t2 failed (workflow not completed), t5 failed
  (ordered review/classification steps skipped), t4 omitted required steps, t8 did not execute the
  correct `git status`. The completed workflow-style pass was t6 (identify + run).
- Devstral: poor for ordered workflows. Of the tests demanding a fixed ordered multi-step workflow,
  only t8 completed it. t2 stopped before committing and left the tree dirty; t5 skipped the
  mandated validation/classification/Git-review sequence; t7 ran the wrong validator; t4 and t6
  produced no workflow at all.
- Both reports independently describe ordered-workflow reliability as weak; the specific failing
  tests overlap on t2 and t5, while t8 is a Devstral pass and a GPT-OSS fail.

### Tool and validator identification

- GPT-OSS: mixed. t6 passed — identified `npm run format:check`, executed it directly and via
  `npm run check`. t7 failed — fixated on absent `markdownlint`. t4 failed to run the repository
  validator.
- Devstral: weak. t4, t5, t6, and t7 all failed to run the repository validator; t5 and t7 fixated
  on `markdownlint` (absent / not the repository tool). t8 recovered the correct validator
  (`npm run format:check`).
- Both reports record fixation on `markdownlint` in t7 (and for Devstral, also t5) rather than the
  repository validator.

### Git operations and commit completion

- GPT-OSS: t2 — no commit created; t5 — no `git status`/`git diff` run; t7 — ran `git status
--short`; t8 — correct `git status` described but not executed. No test required a commit other
  than t2.
- Devstral: no commits were created in any test (correct for all but t2, which required one); t2 left
  the tree dirty; t7 ran `git status` (clean) but did not report it; t8 ran and reported the correct
  `git status`.
- Both failed the t2 commit requirement. Devstral's report states explicitly that no commits were
  created in any test; the GPT-OSS report records no commit in t2 and no modification elsewhere.

### Recovery from invalid commands

- GPT-OSS: partial. t8 recovered the validator via `npm run check` but did not execute the correct
  `git status`, describing it only in text → t8 recorded as Fail.
- Devstral: complete on the recorded test. t8 recovered from both invalid commands to the correct
  validator and the correct `git status` → t8 Pass.
- This is a recorded behavioral difference on t8: both recovered the validator, only Devstral also
  executed the correct Git command.

### Instruction adherence

- GPT-OSS: t2 abandoned the task and asked the user for a path rather than continuing; t5 asserted a
  Git-status result that was never executed; t8 described the correct `git status` without running
  it. No forbidden install or network use was recorded.
- Devstral: t5 violated the explicit "do not install anything / do not use the network" instruction
  (the global install succeeded); t7 made 23 attempts to read outside the workspace, all correctly
  denied, indicating difficulty staying within granted scope; several tests delivered a
  confident-sounding closing statement not supported by executed steps.
- Both reports describe instruction-adherence weaknesses; the Devstral report records an explicit
  no-install violation (t5) and a large volume of out-of-workspace attempts (t7), while the GPT-OSS
  report records unexecuted-status claims (t5, t8) and premature abandonment (t2).

### Premature abandonment

- GPT-OSS: t2 — abandoned and asked the user for a path. Failures elsewhere (t5, t7, t8) were
  incomplete rather than explicitly abandoned; t4 omitted required steps.
- Devstral: frequent. t4 ("Task completed."), t5 ("Task completed."), t6 (no answer), and t7
  ("Task completed.") ended without performing the requested work; t2 ended without the requested
  commit.
- Both reports record premature abandonment; the Devstral report documents it across more tests
  (t2, t4, t5, t6, t7) with explicit "Task completed." closings, while the GPT-OSS report records it
  prominently for t2.

### Verification and reporting accuracy

- GPT-OSS: t1 reported the correct 205-line count; t3 reported 11 correct paths; t4 reached the
  correct conclusion (claim false) but omitted required verification steps; t5 asserted a Git-status
  result never executed; t8 described the correct `git status` without executing it; t6 reported the
  captured prettier warning accurately.
- Devstral: t1 reported the correct 205-line count; t3 listed the 11 correct paths but asserted an
  incorrect total of 13; t7 ran `git status` but did not report it; t6 delivered no answer; t8
  reported both bogus commands and the recovered validator/git status accurately.
- Both reports record verification/reporting gaps. The Devstral t3 count error (13 vs 11) is a
  recorded inaccuracy in its report; the GPT-OSS t5 unsupported Git-status claim is a recorded
  unexecuted-status assertion.

### Out-of-scope or unauthorized tool behavior

- GPT-OSS: t1 — one external absolute-path `read` denied and correctly contained. No other
  out-of-scope or unauthorized behavior is recorded; §7 states all runs had no unauthorized
  modifications and no network/package installs.
- Devstral: t5 — attempted a network/global install (`npm install -g markdownlint-cli`) that the
  prompt forbade and that succeeded; t7 — 23 attempts to read outside the workspace, all denied.
  No run produced an unauthorized modification to a protected artifact.
- Both reports record no unauthorized modification to a protected artifact. Devstral's report records
  a successful global package install that the prompt forbade; GPT-OSS's report records a contained
  external-directory read only.

### Permission enforcement and containment

- GPT-OSS: t1's one `external_directory` denial was enforced by policy and correctly contained; §7
  confirms permission denials where they occurred were enforced and contained.
- Devstral: t7 produced 23 `external_directory` denials, all correctly enforced and contained
  (session-DB `permission_rejection=true` for all 23); the report describes the permission policy as
  having enforced and contained every out-of-scope attempt. Separately, the t5 global npm install
  succeeded; the report records it as an instruction violation and an operator-run environment
  cleanup, not as a policy bypass.
- Both reports conclude out-of-scope access was contained. The Devstral report records a much larger
  number of denial events (23 in t7) than the GPT-OSS report (1, in t1).

## 5. Scorer and harness limitations

This section separates actual model behavior from scorer defects, harness/evidence-scope
limitations, and operator/environment cleanup, as documented by each report.

### Scorer false positives

- GPT-OSS: `t5.preexisting_classified` (§6.3). `score.py` builds its transcript from all `text`
  parts, including the user prompt, so the requirement regex matched the instruction text itself
  rather than the model's own classification.
- Devstral: `t5.preexisting_classified` — same prompt-transcript contamination; the requirement regex
  matched the instruction wording in the user prompt, not any model output (the model produced no
  classification). Also `t6.output_reported` — matched "prettier" inside the captured
  `read package.json` / `grep` output despite the validator never running (incidental tool-output
  matching via `output_regex`).
- Neither report treats these false positives as model behavior, and neither false positive changes a
  verdict (Devstral's report states both false positives fall within tests that fail on independent,
  decisive grounds; GPT-OSS's t5 fails regardless).

### Scorer false negatives

- GPT-OSS: `t3.search_ran` — the detector splits a command on shell operators and checks only the
  leading token of each segment, so a real `grep` executed inside shell command substitution or an
  assignment is not detected. Also two t4 wording false negatives: `t4.verdict_false` and
  `t4.no_change_warranted` do not tolerate inline Markdown bold and do not match semantically
  equivalent phrasing, despite the requirement text stating semantically equivalent wording is
  accepted.
- Devstral: `t3.search_ran` — a false negative because the search genuinely ran (native `grep`), but
  it ran inside the child/subagent session, which the harness trace scope does not capture. The
  report notes this does not change the verdict, because the count error is decisive.
- Both reports document a t3 search-detection false negative; the underlying causes differ (command
  substitution/assignment parsing for GPT-OSS; subagent trace scope for Devstral).

### Subagent trace limitations

- Devstral: when the model uses the `task` tool, the child session reuses the parent's working
  directory, so `session_report` marks the trace `ambiguous` and captures the parent (earliest)
  session only. Real tool execution in the child (the t3 `grep`) is therefore out of the scored
  trace. Recorded as a harness evidence-scope limitation, not model behavior.
- GPT-OSS: the report does not record a subagent-delegation case in its test outcomes; its t3 was
  executed directly in-session. No subagent trace limitation is separately documented for GPT-OSS.

### Prompt-transcript contamination

- Both reports independently document the same defect: `score.py`'s transcript joins all `text`
  parts including the user prompt, causing `t5.preexisting_classified` to match instruction wording.
  Recorded as a scorer false positive in both.

### Incidental tool-output matching

- Devstral: `t6.output_reported` matched "prettier" from `read package.json` / `grep` output even
  though the validator never ran. Recorded as a scorer false positive.
- GPT-OSS: the report does not document an incidental tool-output match; its t6 validator run was
  genuine (executed and its output reported).

### Other documented limitations

- Global permission log: both reports state `opencode.log` is process-global and its permission lines
  carry no session id, so raw-log permission slices can be contaminated by concurrent OpenCode
  sessions. Both treat session-database evidence (per `session_id`) as authoritative. GPT-OSS records
  that t7's raw permission slice was interleaved with an unrelated concurrent session; Devstral
  records that other OpenCode processes were running.
- GPT-OSS scorer-defect scope: the report states the automated matrix alone understates or
  misattributes three tests (t3, t4, t5), requiring manual adjudication.

### Operator/environment cleanup

- Devstral: the global `markdownlint`/`markdownlint-cli` packages created by t5 were removed via
  `volta uninstall` before t6, restoring cross-test environment parity. Recorded as an
  environment-parity restoration, not a change to any protected artifact, and affecting only
  environment state.
- GPT-OSS: the concurrent OpenCode session contaminating t7's raw permission slice "has since been
  stopped"; session-database evidence is unaffected.
- Neither cleanup is treated as a model failure.

### Distinction summary

- **Actual model behavior:** t2 no-commit (both); t3 wrong count (Devstral) and correct count
  (GPT-OSS); t4 omitted steps (GPT-OSS) and no answer (Devstral); t5 wrong validator / skipped review
  (both) plus forbidden install (Devstral) and unexecuted Git-status claim (GPT-OSS); t6 validator
  run (GPT-OSS) and no answer (Devstral); t7 wrong validator (both); t8 missing `git status`
  execution (GPT-OSS) and full recovery (Devstral).
- **Scorer defects:** t3 search detection (both), t4 wording (GPT-OSS), t5 classification false
  positive (both), t6 output false positive (Devstral).
- **Harness/evidence-scope limitations:** subagent trace not captured (Devstral t3); process-global
  permission log (both); prompt included in transcript (both).
- **Operator/environment cleanup:** removal of the global `markdownlint-cli` (Devstral t5); stopping
  the concurrent OpenCode session (GPT-OSS t7).

No scorer defect is treated as a model failure unless the raw evidence independently supports the
failure. In particular, the t3 false negatives do not convert either model's t3 into a failure: the
GPT-OSS t3 is adjudicated Pass on the independently verified correct count and paths, and the
Devstral t3 fails on the independently verified count error (13 vs 11).

## 6. Practical implications

These are cautious, descriptive observations grounded only in the recorded per-test evidence. They do
not assert production suitability and do not identify an overall winner.

- **Interactive, supervised use.** Both reports conclude their models should be used with
  supervision. GPT-OSS's report recommends treating it as a "bounded, low-trust worker" with
  independent verification of executed-vs-claimed commands, mandatory workflow steps, validator
  selection, and Git state. Devstral's report records instruction-adherence and premature-abandonment
  patterns (t5 forbidden install; t4/t5/t7 "Task completed.") that likewise warrant supervision.
- **Straightforward repository discovery.** Both models performed well on basic discovery and
  self-identification (t0, t1 for both), and GPT-OSS additionally recovered `PinPal` correctly with a
  direct search (t3). This is the strongest shared area of observed reliability.
- **Ordered multi-step autonomous workflows.** Both reports describe this area as weak. GPT-OSS
  failed t2 and t5 and did not execute the final Git step in t8; it passed the identify-and-run task
  t6. Devstral failed t2, t4, t5, t6, and t7, and completed an ordered workflow only in t8. Neither
  report supports treating either model as reliable for unsupervised ordered multi-step work.
- **Tasks requiring reliable validation, Git operations, and recovery.** The reports diverge here:
  GPT-OSS passed the validator-discovery task t6 and recovered the validator in t8 but never executed
  the correct `git status` in t8; Devstral failed t4, t5, t6, and t7 on validator execution but
  completed t8 with both the correct validator and the correct `git status`. On the single recorded
  recovery test (t8), Devstral completed the sequence and GPT-OSS did not. On the single recorded
  validator-discovery test (t6), GPT-OSS completed it and Devstral did not. Given one run per prompt
  and the differing configurations, neither result should be generalized into a blanket claim about
  validation, Git, or recovery reliability.
- **Use-pattern caveat.** Because the models were evaluated in separate configurations and with one
  run per prompt, these observations are indicative for the specific evaluated versions and
  configurations, not a basis for production-suitability claims.

## 7. Limitations and conclusion

- Each evaluation used **one run per prompt** (t0–t8; nine tests each).
- Results are **indicative rather than statistical measurements**.
- Model **sampling nondeterminism limits certainty**; both reports state their results are not a
  statistical measurement.
- The **two configurations may differ** in context (Devstral: 16 384), output (Devstral: 6 144),
  compaction (Devstral: `auto: false`; GPT-OSS not recorded), temperature, quantization, hardware
  placement, or other runtime details. The GPT-OSS report does not record context/output/compaction
  settings, so no equality of those settings is assumed.
- **Equal aggregate counts do not imply identical behavior.** The automated and adjudicated totals
  happen to align at "3 Pass / 6 Fail" for the raw scorer on both models, but the pass/fail sets
  differ (GPT-OSS adjudicated passes: t0, t1, t3, t6 with t4 partial; Devstral passes: t0, t1, t8),
  as do the failure modes within the shared failures (t2, t5, t7).
- Scorer defects and harness evidence-scope limitations are documented in §5 and are not counted as
  model failures; both reports state their defects are non-decisive to the adjudicated verdicts.
- The comparison is **descriptive** and does **not establish a universal model ranking**. It adds no
  new tests, metrics, or composite score, and does not declare a winner.

Within these limits, the two completed evaluations show two models with reliable basic discovery and
self-identification, weak ordered multi-step workflow completion, and differing — but individually
recorded — validator, Git, and recovery behavior across t3, t4, t6, and t8.
