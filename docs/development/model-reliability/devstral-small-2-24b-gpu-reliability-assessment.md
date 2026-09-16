# Devstral Small 2 24B — GPU (`num_ctx 8192`) Reliability Assessment

**Date:** 2026-09-16
**Model variant under review:** `ollama/devstral-small-2:24b-gpu`
**Inference host:** Windows machine running Ollama `0.33.2` (AMD Radeon RX 9070 XT, 16 GB)
**Orchestrator:** M1 Mac running OpenCode `1.18.30`
**Remote endpoint:** `http://192.168.68.52:11434`
**Baseline:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`)
**Raw artifacts:** `/var/folders/.../T/opencode/devstral-eval-v2/results/gpu/`
(`tN.out`, `tN.log`, `traces.txt`, `results.jsonl`, `t0-ps.json`) and the per-test
clones under `clones-gpu/`
**Related:** `devstral-small-2-24b-gpu-vs-cpu-findings.md` (performance comparison),
`devstral-small-2-24b-evaluation.md` (base model, larger declared context)

This assessment reviews an **already-completed** GPU run. No evaluation was re-run,
no CPU testing was performed, and no application or configuration files were changed.

## 1. Question

Does the fully GPU-resident `devstral-small-2:24b-gpu` configuration at `num_ctx 8192`
provide sufficiently reliable results for interactive OpenCode development, or is a
larger/split-context configuration necessary?

## 2. Sources and method

- Inspected the raw per-test stdout (`tN.out`), combined stdout/stderr (`tN.log`),
  `traces.txt`, and runner metadata (`results.jsonl`, `t0-ps.json`).
- Compared each response against the prompt's explicit requirements and against
  independently verified ground truth.
- Read the runner (`runner.py`) and the OpenCode evaluation config that produced the run.
- Classified each test with the same vocabulary as the prior evaluations:
  **Pass / Partial pass / Fail / Unable to determine**. The existing methodology defines
  no numerical score, so none is produced here.

Labels: **[M]** measured observation, **[I]** interpretation.

## 3. Ground truth (independently verified)

| Fact                                          | Value                                            | How verified                                                 |
| --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `docs/domain-model.md` length                 | 205 lines                                        | `wc -l` and `git show a437b47:docs/domain-model.md \| wc -l` |
| Files mentioning `PinPal` at baseline         | 12                                               | `git grep -l PinPal a437b47 -- . ':!node_modules'`           |
| Repository formatting check                   | `prettier . --check` (exposed as `format:check`) | `package.json` scripts                                       |
| t4 claim ("asterisks in table cells invalid") | False                                            | GFM permits cell emphasis; the repo uses it in tables        |

The repository itself uses `**bold**` and `*italic*` inside table cells
(e.g. `docs/domain-model.md` lines 18–24, 32, and 158), so the t4 claim is false.
At current HEAD the `PinPal` count is 15 because later model-reliability documents
themselves mention `PinPal`; the evaluation baseline is **12**.

## 4. Results matrix

| #   | Prompt focus                     | Result           | Deliverable / ground-truth outcome                      |
| --- | -------------------------------- | ---------------- | ------------------------------------------------------- |
| t0  | Smoke / self-identification      | **Fail**         | Named no model; reported cwd "not set"                  |
| t1  | File/path recovery + line count  | **Partial pass** | Found real path; omitted 205-line count; misquoted hint |
| t2  | Scoped edit + one commit         | **Fail**         | No edit, no validation, no commit; schema error         |
| t3  | Content search for `PinPal`      | **Fail**         | No content search, no count, no paths                   |
| t4  | Semantic judgment of claim       | **Fail**         | Globs only; no conclusion; non-answer                   |
| t5  | Mandatory ordered no-op workflow | **Fail**         | Never ran format validation; no report                  |
| t6  | Identify + run format check      | **Partial pass** | Correct command/output in trace; no final report        |
| t7  | Validator twice + `git status`   | **Fail**         | Validator never found or run; no `git status`           |
| t8  | Invalid-command recovery         | **Partial pass** | Both bogus failures reported; wrong recovery validator  |

**Totals [M]:** 0 Pass, 3 Partial pass, 6 Fail, 0 Unable to determine.

## 5. Test-by-test detail

### t0 — Smoke / self-identification — **Fail**

Requirement: state the exact model name and current working directory, using no tools.

Response: "I'm a code assistance agent. My exact model name is not specified, and the
current working directory is not set yet."

[M] Session metadata records the model as `devstral-small-2:24b-gpu`, and the clone
working directory was set by the harness; both stated facts are wrong.
[M] It did obey the no-tools constraint (only user/assistant text parts).
[I] Weak and terse. The base-model run passed this test, so it is a regression for the
variant; the evidence does not show it is a context effect.

### t1 — File/path recovery — **Partial pass**

Requirement: the path `docs/wrong-folder/domain-model.md` was reportedly wrong; locate
the real file and report the repo-relative path, the file's line count, and every
command/tool with its output; no git, no edits.

[M] Ran `glob "**/domain-model.md"` (1 match) and found `docs/domain-model.md`
(correct). [M] The final answer omitted the required 205-line count and the command
output. [M] It also misquoted the reported wrong path as `docs/about-the-domain.md`
(the prompt said `docs/wrong-folder/domain-model.md`) — a fabricated detail.
No file was modified (clone clean).

### t2 — Scoped edit + one commit — **Fail**

Requirement: a small scoped documentation improvement, validation of the changed file,
diff review, exactly one commit, then report files/commands/hash/status.

[M] Ran three globs (`**/*local*fixture*` 0 matches, `**/import*` 34, `**/docs/*.md` 10) and one `read` call with `{"file": …}` that failed schema validation
(`filePath` required). [M] No `edit`, no validation, no commit; the clone's
`git status` is empty and `git log` still starts at `a437b47`. No report was produced.

### t3 — Content search for `PinPal` — **Fail**

Requirement: find every file whose **contents** mention `PinPal`, report the exact
command(s), the total count, and the repo-relative paths; modify nothing.

[M] Ran only `glob "**/*"` (a filename listing, truncated at 100 matches) — not a
content search. [M] No `grep`/`rg` was used; the final text was an unrelated generic
opener ("I'll analyze the codebase to understand the bowling game application
structure…"). No count and no paths were produced; ground truth is 12 files at
baseline. The base-model run returned the correct 12 paths (though it too omitted them
from its final report), so this is a model/instruction weakness, not proven
context-related.

### t4 — Semantic judgment — **Fail**

Requirement: decide whether the asterisk-in-table-cells claim is true, decide whether a
documentation change is warranted, use the repository's Markdown validation, review
`git diff --check` and `git diff --staged`, and make no unnecessary edit.

[M] Ran only extension globs (`*.md`, `*.markdown`, `*.ts`, `*.tsx`, `*.js`, `*.jsx`);
read nothing; ran no validation and no git commands. [M] Final text was
"Let me know how I can help!" — a non-answer that drops the task. The claim is false.
[M] The base model also reached the wrong conclusion on this test, so the failure is
intrinsic rather than context-specific.

### t5 — Mandatory ordered no-op workflow — **Fail**

Requirement: (1) run the repository's Markdown/format validation; (2) classify any
failure as pre-existing or self-caused; (3) review the working tree and diff;
(4) report final `git status`; (5) commit only if justified; no installs and no network
fetches.

[M] Ran `git status` (clean, detached at `a437b47`) and `glob "**/*.md"`; after one
schema-failed `read` (`{"file":"AGENTS.md"}`) it re-called correctly with `filePath`
and read `AGENTS.md`. [M] It never ran `npm run format:check` / `prettier . --check`.
[I] Because step 1 was skipped, steps 2 and 5 could not be performed; the final
"Task completed." overstates completion.

### t6 — Identify + run format check — **Partial pass**

Requirement: identify the command used to validate formatting/whitespace for a
documentation-only change, run it, and report the exact command and full result.

[M] After unrelated investigation (`grep … format`, `cat .github/workflows/*.yml`,
`cat package.json | grep scripts`) plus one schema-failed `grep` and two schema-failed
`task` calls, it ran `npm run format:check || echo "format check failed"`, producing
`prettier . --check` and `[warn] docs/domain-model.md` — the correct command and
result. [M] The final text was only "Task completed."; the required report was not
delivered. Nothing was modified.

### t7 — Validator twice + `git status` — **Fail**

Requirement: run the Markdown validator twice, report each execution separately using
only that execution's output, then report `git status`; strict no-modification.

[M] Probed `which mdl`, `which remark`, `which markdownlint` (all absent), then made
three schema-invalid `read` calls (`file_path` ×2, `path` ×1) and never discovered the
repository's actual validator. [M] It ran no validation and no `git status`.
Nothing was modified (clone clean).

### t8 — Invalid-command recovery — **Partial pass**

Requirement: report exactly what happens for `npm run markdownlint` and `git statuss`,
then discover and run the correct validation command and the correct git-status
command; modify nothing.

[M] `npm run markdownlint` → `Missing script: "markdownlint"`; `git statuss` →
`git: 'statuss' is not a git command`. Both were reported accurately. [M] It recovered
`git status` (clean) and listed scripts via `npm run`, but then ran `npm run typecheck`
and `npm run lint` — not the required formatting validation (`npm run format:check`).
[M] Four `todowrite` calls were schema-invalid. The validation-recovery step is
objectively unmet.

## 6. Cross-cutting observations [M]

- **Repository safety.** Every clone's `git_status` is empty and every `git_log` still
  starts at `a437b47`. No file was modified or committed in any test; the main working
  tree was untouched.
- **Malformed tool calls.** At least 12 schema-invalid tool calls across t2 (1),
  t5 (1), t6 (3), t7 (3), and t8 (4): wrong argument keys (`file`/`file_path`/`path`
  instead of `filePath`) and missing required keys (`pattern`, `description`, `prompt`,
  `content`). Several were corrected on retry.
- **Search-tool misuse.** Where content search was required (t3) or implied (t4), the
  model used filename `glob` instead of content search.
- **Terse/incomplete endings.** t0, t2, t4, t5, t6, t7, and t8 ended with a one-line or
  truncated final message ("Task completed.", "Let me know how I can help!") and omitted
  the requested report.
- **Correct behaviors.** t1 found the real file first try; t6 ran the correct validator;
  t8 reported both invalid commands exactly and recovered `git status`.
- **Placement.** `/api/ps` during t0 showed `size == size_vram == 14,965,800,959 B` and
  `context_length 8192`, i.e. fully VRAM-resident.

## 7. Is the 8192-token context the cause?

[I] The evidence is suggestive but **insufficient to attribute the observed failures
to `num_ctx 8192`**, for three reasons.

1. **Confounded comparison.** The base-model run — which passed t0/t1 and was stronger
   overall — executed against a different declared OpenCode budget: the main config
   declares `devstral-small-2:24b` at context 65536 / output 6144, while the GPU
   evaluation config declared `devstral-small-2:24b-gpu` at context 8192 / output 2048.
   The derived GPU variant additionally embeds `num_ctx 8192` server-side, and the base
   model's server-side default context is unrecorded. Context size, output limit, and
   model variant therefore all change together and cannot be separated from this run.
2. **Failures reproduce at larger context.** The base run also failed t4 (wrong
   conclusion) and also omitted the requested count/paths on t3, so those are intrinsic
   model/instruction-following weaknesses rather than context effects.
3. **Failure signatures are mixed.** Terse endings and malformed tool schemas are
   consistent with context pressure (OpenCode's system prompt plus tool schemas leave
   little headroom in an 8192-token window), but the same model produced comparable
   errors on tasks where context pressure is not an obvious factor. This is a
   correlation, not proof.

What is measured: the 8192-token budget is small relative to OpenCode's
prompt/tool-schema overhead and to the tool outputs observed (e.g. `glob "**/*"` → 100
truncated matches; `glob "**/import*"` → 34 matches). What is **not** measured: any
token-usage or truncation instrumentation, or a same-variant run at a larger context.

## 8. Reliability vs measured performance

[M] GPU timings: total 156.8 s; mean 17.4 s; median 15.6 s; min 4.9 s; max 38.7 s
(all of `t0`–`t8`, return code 0, no timeouts). This is comfortably interactive.

[I] Performance is not the constraint; reliability is. A median of 15.6 s per prompt is
of little value when six of nine prompts fail to produce the required deliverable and a
human must re-verify or redo the work. Fast, unreliable turns increase total cost once
supervision and rework are counted.

## 9. CPU-only status

[I/M] CPU-only inference is already ruled out for interactive use. In the same
evaluation, the `devstral-small-2:24b-cpu` variant (`num_ctx 81920`, `num_gpu 0`) took
665.5 s for t0 and 1401.6 s for t1 (~136×–180× the GPU wall-clock time), and t2 was
still running after ~44 minutes. This assessment does not revisit CPU testing.

## 10. Limitations

- Single run per prompt; non-deterministic sampling; results are indicative, not
  statistically robust.
- Harness/version confounds: context budget, output budget, and model variant differ
  between the base and GPU runs, so base-vs-GPU reliability is not a controlled
  comparison.
- Timings are end-to-end and include OpenCode startup and all model/tool turns; they are
  not per-token throughput measurements.
- Placement evidence is load-time `/api/ps`; requested parameters were confirmed
  separately via `/api/show`.
- No token-accounting or truncation telemetry exists; the context attribution in §7 is
  inferential.
- The worker model and interface are not isolated; tool-schema errors could reflect
  model weakness, interface design, or context truncation.
- The GPU variant's server-side `num_ctx` is fixed at 8192, so a larger-context test
  requires deriving a new variant (out of scope for this assessment).

## 11. Conclusion and recommendation

**The fully GPU-resident 8K configuration is not acceptable as the default OpenCode
model configuration.** [M] The run produced 0 Pass, 3 Partial pass, and 6 Fail across
`t0`–`t8`. It did not search file contents when required (t3), did not evaluate the
semantic claim (t4), did not perform the mandated validation workflow (t5), did not
complete the scoped commit (t2), could not discover or run the repository validator
(t7), failed validation recovery (t8), and repeatedly omitted required reporting.
[M] It caused no repository damage, which makes it a safe harness artifact but not a
reliable worker. This is consistent with the base-model verdict: usable only as a
low-trust, supervised worker. At 8K context specifically, it is not suitable as a
default.

**A larger/split-context test is justified, but only under a specific condition.**
Because context size, output budget, and variant are confounded (§7), the failures
cannot yet be blamed on 8192 tokens. A controlled follow-up is justified **only if the
goal is to decide whether to keep GPU-resident 8K or to accept a partial CPU/GPU
split**: derive a `-gpu` variant at a larger `num_ctx` (e.g. 16384 or 32768, which the
placement harness measured at 88% GPU and 69% GPU respectively, i.e. partial CPU
offload), restore the OpenCode output limit to the base run's 6144, and re-run the same
prompts. If the t0/t1/t2/t3/t5/t6/t7 outcomes recover, the 8K window is the limiting
factor and a split/larger context is worth its performance cost; if they do not
recover, the failures are intrinsic model behavior and a larger context is not
justified — the variant should remain, at most, a supervised helper. Until such a test
is run, the 8K GPU configuration should not be promoted to the default.
