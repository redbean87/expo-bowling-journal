# GPT-OSS 20B — OpenCode Frozen-Harness Reliability Evaluation Findings

**Date:** 2026-09-17
**Model under test:** `ollama/gpt-oss:20b` ("GPT-OSS 20B")
**Provider / model ID:** provider `ollama`, model `gpt-oss:20b` (OpenCode-qualified ID `ollama/gpt-oss:20b`)
**Inference host:** self-hosted Ollama `0.33.2` (LAN endpoint `http://192.168.68.52:11434`)
**Harness:** OpenCode `1.18.30` (`/Users/cortezashley/.local/opencode-patched/bin/opencode`)
**Harness commit:** `a31d1a321321b65fa92752d57e6149f0f03b2ccb`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (exported from source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`, frozen `prompt_manifest.json`)
**Evaluation config:** `/Users/cortezashley/.config/opencode/opencode.gpt-oss-20b-eval.jsonc` (sha256 `1f7a6dea8a4965c89cf4bbdaf7ea8042e3c7103e594addc9c3c79d572859efce`)
**Per-test timeout:** 900 s
**Workspaces:** `/Users/cortezashley/.local/share/opencode-evals/gpt-oss-20b-t{0..8}` (t0 variant `gpt-oss-20b-t0-qualified`)

**Related:** `gpt-oss-20b-evaluation.md` (OpenCode, 2026-09-15), `continue-gpt-oss-reliability-evaluation.md` (Continue CLI, 2026-09-15).

## 1. Objective and scope

Evaluate `ollama/gpt-oss:20b` against the frozen OpenCode `t0`–`t8` model-reliability suite using
the corrected harness, with a **provider-qualified** model identifier and an isolated, sanitized
baseline per test. This run is separate from the two 2026-09-15 GPT-OSS reports and does not re-run
or supersede them. No application feature work was in scope.

## 2. Configuration

| Item                   | Value                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Exact model identifier | `ollama/gpt-oss:20b` (provider `ollama`, model `gpt-oss:20b`)                                      |
| Provider endpoint      | `http://192.168.68.52:11434` (Ollama `0.33.2`, `@ai-sdk/openai-compatible`)                        |
| Evaluation config      | `/Users/cortezashley/.config/opencode/opencode.gpt-oss-20b-eval.jsonc`                             |
| Config permissions     | `external_directory: deny`, `webfetch: deny`, `websearch: deny`; `robinhood-trading` MCP disabled  |
| Harness commit         | `a31d1a321321b65fa92752d57e6149f0f03b2ccb`                                                         |
| Baseline HEAD          | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`) |
| Tests run              | `t0`–`t8` (one run each)                                                                           |
| Timeout                | 900 s per test                                                                                     |

**Identifier note.** The provider-qualified ID was required. Two prior attempts that passed the
bare model name `gpt-oss:20b` exited `rc=1` with an `UnknownError` and zero tokens; those orphaned
workspaces (`gpt-oss-20b-t0`, `gpt-oss-20b-t0-r2`) were not reused. No harness change was made to
enforce provider qualification; the qualified ID is what produced real inference.

## 3. Method

- Each test was provisioned into a **fresh sanitized workspace** (isolated clone at the baseline
  HEAD, copied — never symlinked — `node_modules`, no escaping symlinks). No workspace was reused.
- The frozen harness ran as-is: `runner.py` → `extract_traces.py` → `score.py`. The harness,
  prompts, baseline, and evaluation config were not modified.
- Sessions were verified independently against the OpenCode session database
  (`~/.local/share/opencode/opencode.db`) for `providerID`, `modelID`, presence of an assistant
  response, nonzero token usage, receipt of the expected prompt, recorded tool calls/arguments, and
  permission events.
- The model's final narrative was **not** accepted as proof that an operation occurred; recorded
  tool calls and tool outputs were treated as the source of truth.

## 4. Results — automated scorer vs adjudicated

The automated scorer and the manual adjudication are kept separate. Where they differ, the reason
is noted; several differences are known scorer limitations (§6), not model behavior.

| #   | Focus                            | Automated scorer | Adjudicated      | Basis for adjudication                                                                            |
| --- | -------------------------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| t0  | Smoke / self-identification      | Pass             | **Pass**         | Correct model + cwd; no tools used.                                                               |
| t1  | File/path recovery + line count  | Pass             | **Pass**         | Correct `docs/domain-model.md`, 205 lines; no Git; no modification.                               |
| t2  | Scoped edit + one commit         | Fail             | **Fail**         | Premature abandonment; edit/validation/diff/commit workflow not completed.                        |
| t3  | Content search for `PinPal`      | Fail             | **Pass**         | Scorer false negative; correct 11 files and paths with real `grep -rl`.                           |
| t4  | Semantic judgment of claim       | Fail             | **Partial/FAIL** | Correct conclusion, but required workflow steps omitted; scorer also had wording false negatives. |
| t5  | Mandatory ordered no-op workflow | Fail             | **Fail**         | Incomplete Git review and an unsupported Git-status claim.                                        |
| t6  | Identify + run format check      | Pass             | **Pass**         | Validator correctly identified, executed, and reported; no modification.                          |
| t7  | Validator twice + `git status`   | Fail             | **Fail**         | Fixated on nonexistent `markdownlint`; repository validator never executed.                       |
| t8  | Invalid-command recovery         | Fail             | **Fail**         | Invalid-command recovery partial; correct `git status` never executed.                            |

**Automated totals:** 3 Pass / 6 Fail. **Adjudicated totals:** 3 Pass (t0, t1, t6) + 1 Pass by
adjudication (t3) + 1 Partial/FAIL (t4) + 4 Fail (t2, t5, t7, t8). The model did **not** pass the
full suite.

## 5. Test-by-test detail

### t0 — Smoke / self-identification — **Pass**

Reported `gpt-oss:20b` and the evaluation working directory; no tools. Real inference confirmed
(nonzero tokens, assistant response).

### t1 — File/path recovery + line count — **Pass**

Recovered `docs/domain-model.md` and reported 205 lines using `glob` and `read`; no Git; no
modification. One `read` of an external absolute path (`/Users/correct...`) was denied by the
`external_directory` policy and correctly contained.

### t2 — Scoped edit + one commit — **Fail**

The target documentation file was discoverable, but the model searched only by filename (repeated
`glob`), grepped the hyphenated literal `local-fixtures`, then abandoned the task and asked the
user for a path. No edit, no validator run, no diff review, no commit.

### t3 — Content search for `PinPal` — **Pass** (scorer false negative)

Ran `grep -rl "PinPal" .` via Bash and reported exactly 11 files with all 11 correct
repository-relative paths. The automated scorer marked `t3.search_ran` failed because its
`search_command_ran` detector only inspects the leading token of shell-operator segments and does
not recognize `grep` inside command substitution/assignment (§6.1). The search genuinely ran.

### t4 — Semantic judgment of the asterisks-in-table-cells claim — **Partial/FAIL**

The model correctly concluded the claim is **false** and that no documentation change was
warranted, consistent with the frozen verdict, and made no change. However, it did not run the
explicitly requested `git diff --check` or `git diff --staged`, and did not run the repository
Markdown validator. The automated scorer additionally produced two wording-related false negatives
(§6.2).

### t5 — Mandatory ordered no-op workflow — **FAIL**

Only the validator step was completed (`npm run format:check` reported the pre-existing
`docs/domain-model.md` formatting warning). The model did not run `git status` or `git diff`, did
not classify the failure as pre-existing vs self-caused, and asserted a Git-status result it never
executed. No modification or commit was made.

### t6 — Identify + run format check — **Pass**

Identified `npm run format:check`, executed it (directly and through `npm run check`), and reported
the captured prettier output warning on `docs/domain-model.md`. No modification.

### t7 — Validator twice + `git status` — **Fail**

Instead of the repository validator, the model fixated on `markdownlint` (absent) and attempted
`npx markdownlint` and `markdownlint --version`; `npm run format:check`/`prettier` was never
executed. It did run `git status --short`. No modification.

### t8 — Invalid-command recovery — **Fail**

Correctly ran and reported the two invalid commands (`npm run markdownlint` → missing script;
`git statuss` → not a git command) and recovered the validator via `npm run check` (which runs
`npm run format:check`, corroborated by captured output). It did **not** execute the correct
`git status`, only describing it in text.

## 6. Known harness/scorer limitations (observed in this evaluation)

These are documented as limitations of the frozen scoring/evidence layer; they were **not** fixed
during the run.

1. **t3 search detection.** `score.py`'s `search_command_ran` splits a command on `&&`/`||`/`;`/`|`
   and checks only the leading token of each segment, so a real `grep` executed inside shell command
   substitution or an assignment (e.g. `files=$(grep -rl "PinPal" .)`) is not detected and the
   `content_search` requirement fails falsely.
2. **t4 wording brittleness.** The `t4.verdict_false` and `t4.no_change_warranted` regexes do not
   tolerate inline Markdown bold (`The claim is **false**.`) and do not match semantically
   equivalent phrasing such as "No documentation edits are required", despite the requirement text
   stating that semantically equivalent wording is accepted.
3. **t5 classification false positive.** `score.py` builds its transcript from all `text` parts,
   which includes the user prompt. The `t5.preexisting_classified` regex therefore matches the
   instruction text itself (`…classify the failure as pre-existing or self-caused…`) rather than
   the model's own classification.
4. **Global permission log.** `opencode.log` is process-global and its permission lines carry no
   session id, so the raw-log permission slice can be contaminated by concurrent OpenCode sessions.
   In t7 the raw slice interleaved an unrelated concurrent session; the session database records
   (per-`session_id`) remain authoritative.

## 7. Infrastructure verification

Every run was independently verified as genuine model inference against the isolated clone:

| #   | Session id                       | providerID | modelID       | Session tokens (in / out) | Duration (s) | Clone clean |
| --- | -------------------------------- | ---------- | ------------- | ------------------------- | ------------ | ----------- |
| t0  | `ses_f4f2d6051ffekwetJvG7L3Fhkr` | `ollama`   | `gpt-oss:20b` | 7254 / 208                | 26.9         | Yes         |
| t1  | `ses_f4f1e38efffefcF9d1dbrKznho` | `ollama`   | `gpt-oss:20b` | 37285 / 1508              | 48.3         | Yes         |
| t2  | `ses_f4f15b9f0ffey4HL3RoAvq4Djb` | `ollama`   | `gpt-oss:20b` | 112676 / 625              | 61.7         | Yes         |
| t3  | `ses_f4f06dc29ffe1ryhD3Rx58Hq61` | `ollama`   | `gpt-oss:20b` | 14706 / 1746              | 72.6         | Yes         |
| t4  | `ses_f4e253673ffe7GmMWgU213P7iB` | `ollama`   | `gpt-oss:20b` | 54330 / 1314              | 48.7         | Yes         |
| t5  | `ses_f4e1c0a22ffeYF0ToxW6KQ6h1J` | `ollama`   | `gpt-oss:20b` | 235441 / 1173             | 83.5         | Yes         |
| t6  | `ses_f4e14c5a8ffet50SxK3DOfydkz` | `ollama`   | `gpt-oss:20b` | 79424 / 1719              | 119.1        | Yes         |
| t7  | `ses_f4df46758ffeCn7RCtTUEKbWl6` | `ollama`   | `gpt-oss:20b` | 323273 / 1590             | 81.8         | Yes         |
| t8  | `ses_f4de84dddffeBqY6bE0T4EZH05` | `ollama`   | `gpt-oss:20b` | 34083 / 791               | 70.9         | Yes         |

All runs: valid assistant responses, nonzero token usage, the expected `tN` prompt received, clean
and isolated clones at the baseline HEAD, no unauthorized modifications, and no network/package
installs. Permission denials where they occurred (t1 external-directory read) were enforced by
policy and correctly contained. **The negative adjudications in §4 are model-reliability signals,
not infrastructure or invocation failures.**

## 8. Limitations

- One run per prompt; model sampling is non-deterministic, so results are indicative, not a
  statistical measurement.
- Scorer defects (§6) require manual adjudication; the automated matrix alone understates or
  misattributes three tests (t3, t4, t5).
- t7's raw permission-log slice is contaminated by a concurrent OpenCode session (it has since been
  stopped); its session-database evidence is unaffected.
- No provider or context substitutions were made; these results apply only to `ollama/gpt-oss:20b`
  as configured here.
- This report does not invent metrics, rankings, or comparisons beyond the recorded evidence.

## 9. Repository and environment integrity

- The main repository remains at `a31d1a321321b65fa92752d57e6149f0f03b2ccb`; `stash@{0}`
  (`8bf1b14575939255f616696357c952d2de2f932e`) is unchanged.
- The harness, `prompt_manifest.json`, prompt set, evaluation config (`1f7a6dea…59efce`), and
  baseline identity were not modified. No application source, dependency, or package file was
  changed. No test or model run was performed for this documentation change.
- This report is the only file added. Raw run artifacts remain outside the repository under
  `/Users/cortezashley/.local/share/opencode-evals/`.

## 10. Recommendation

**GPT-OSS 20B is adequate for basic smoke, discovery, and straightforward validation tasks, but is
unreliable for ordered multi-step workflows and recovery tasks, and it sometimes substitutes a
narrative claim for actual execution evidence.**

- Clean passes: t0 (self-identification), t1 (file/path recovery), t6 (validator discovery and
  execution).
- Adjudicated pass despite a scorer false negative: t3 (content search and reporting).
- Failures cluster on tasks that require a fixed ordered workflow (t2, t5) or recovery and
  correct-command selection (t7, t8), with t4 correct in conclusion but incomplete in required
  steps.
- Observed recurring behaviors: incomplete investigation and premature abandonment (t2), skipped
  mandated steps (t4, t5), incorrect validator/tool identification (t7), and unsupported or
  unexecuted-status claims (t5, t8).

If used, GPT-OSS 20B should be treated as a **bounded, low-trust worker** under supervision, with
independent verification of: executed-vs-claimed commands, mandatory workflow steps, validator
selection, and Git state. When scoring this suite automatically, apply the §6 limitations and use
the adjudicated results, not the raw scorer total.
