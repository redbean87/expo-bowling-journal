# Gemma 4 12B — OpenCode Reliability Evaluation Findings

**Date:** 2026-09-16
**Model under test:** `ollama/gemma4:12b-eval16k`
**Base blob:** `gemma4:12b` (`gemma4`, Q4_K_M, 11.9B)
**Inference host:** Windows machine running Ollama `0.33.2` (AMD Radeon RX 9070 XT, 16 GB)
**Orchestrator:** M1 Mac running OpenCode `1.18.30`
**Remote endpoint:** `http://192.168.68.52:11434`
**Baseline:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`)
**Raw artifacts (outside the repository):**
`/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/gemma4-eval/`
(`runner.py`, `probe_placement.py`, `extract_traces.py`, `manifest.json`, `status.json`,
`show-*.json`, `tags-*.json`, `clones/t0`–`t8`,
`results/gemma4-eval16k/{tN.out,tN.log,tN.err,t0-ps.json,results.jsonl,traces.txt}`)

**Related:** `devstral-small-2-24b-gpu16k-findings.md` (Devstral 16K),
`devstral-small-2-24b-gpu-reliability-assessment.md` (Devstral 8K GPU),
`qwen3-coder-30b-opencode-evaluation.md` (Qwen3-Coder 16K),
`gpt-oss-20b-evaluation.md` (GPT-OSS 20B, Continue).

## 1. Objective

Determine empirically whether `gemma4:12b` is a viable and more reliable OpenCode
repository agent than the previously tested candidates (Devstral Small 2 24B,
Qwen3-Coder 30B-A3B, GPT-OSS 20B), using the same nine persisted prompts and the same
disposable-clone methodology.

## 2. Exact runtime configuration

### 2.1 Model identity (`/api/show`, before and after)

| Field                        | Value                          |
| ---------------------------- | ------------------------------ |
| `details.family`             | `gemma4`                       |
| `details.parameter_size`     | 11.9B                          |
| `general.parameter_count`    | 11,907,350,576                 |
| `details.quantization_level` | Q4_K_M                         |
| `block_count`                | 48                             |
| `embedding_length`           | 3840                           |
| Native `context_length`      | 262,144                        |
| `capabilities`               | `completion`, `vision`, `audio`, `tools`, `thinking` |
| Base digest                  | `4eb23ef187e2c546…`            |

### 2.2 Evaluation-only variant and config

The base tag was **not** modified. A separate variant was created server-side via
`POST /api/create` (`from: gemma4:12b`), verified through `/api/show`:

| Parameter      | Value             | Verification                       |
| -------------- | ----------------- | ---------------------------------- |
| `parent_model` | `gemma4:12b`      | `/api/show` `details.parent_model` |
| `num_ctx`      | 16384             | `/api/show` `parameters`           |

OpenCode's model budget was supplied through the **new, separate** evaluation config
`/Users/cortezashley/.config/opencode/opencode.gemma4-eval-16k.jsonc`:

```jsonc
"gemma4:12b-eval16k": {
  "name": "gemma4:12b-eval16k",
  "limit": { "context": 16384, "output": 6144 }
}
```

The normal/default OpenCode config and the prior Devstral and Qwen3-Coder evaluation
configs were **not** modified.

### 2.3 Protected models unchanged

Digest comparison before and after the run confirmed all protected tags were untouched:

| Model                          | Result    |
| ------------------------------ | --------- |
| `gemma4:12b`                   | UNCHANGED |
| `gemma4:12b-131k`              | UNCHANGED |
| `devstral-small-2:24b`         | UNCHANGED |
| `devstral-small-2:24b-gpu`     | UNCHANGED |
| `devstral-small-2:24b-cpu`     | UNCHANGED |
| `devstral-small-2:24b-gpu16k`  | UNCHANGED |
| `gpt-oss:20b`                  | UNCHANGED |
| `qwen3-coder:30b`              | UNCHANGED |
| `qwen3-coder:30b-eval16k`      | UNCHANGED |

Only the new `gemma4:12b-eval16k` tag was added.

## 3. Actual measured placement (not assumed)

At `num_ctx 16384` with model defaults the model is **fully GPU-resident** — no CPU
offload, no `num_gpu` override required. A `num_gpu` sweep measured through `/api/ps`:

| `num_gpu` | `size` (bytes)  | `size_vram` (bytes) | VRAM % |
| --------- | --------------- | ------------------- | ------ |
| **default** | **8,076,467,895** | **8,076,467,895** | **100.0%** |
| 40        | 8,191,228,748   | 6,706,220,235       | 81.9%  |
| 32        | 8,191,228,748   | 5,590,294,199       | 68.2%  |
| 16        | 8,191,228,748   | 3,326,974,360       | 40.6%  |

Live polling during t0 took 7 samples, all identical:

- `size` = 8,076,467,895 B (~8.08 GB)
- `size_vram` = 8,076,467,895 B (~8.08 GB, **100% GPU**)
- `context_length` = 16384

**The model remained fully GPU-resident for the entire run.** This is the first fully
GPU-resident 16K configuration in this series: the 16K Devstral split ran 87.5% GPU and
the 16K Qwen3-Coder ran 80.2% GPU. No load or inference errors occurred.

## 4. Evaluation scope and methodology

- **Same nine persisted prompts** `t0`–`t8`, byte-for-byte from
  `docs/development/model-reliability/opencode-prompts/`.
- **Same methodology as the prior Devstral and Qwen3-Coder runs:** one disposable
  `git clone --local` per prompt at baseline `a437b47`, each with `node_modules` symlinked
  and excluded; serial execution; remote inference only; `OPENCODE_CONFIG` pointing at the
  new eval config; `opencode run -m ollama/gemma4:12b-eval16k`.
- **Timeout:** 2400 s per test.
- **Captured per test:** stdout (`tN.out`), combined log (`tN.log`), stderr (`tN.err`),
  runner metadata (`results.jsonl`: rc, timeout, duration, session id, role/part counts,
  per-session token totals, peak per-step input tokens, clone git status/log), live
  placement samples (`t0-ps.json`), and a reconstructed tool/reasoning trace
  (`traces.txt`).
- **Return codes / timeouts:** all nine prompts returned `rc=0`; **no timeouts**.
- **Repository integrity:** every clone's `git status` is clean of tracked edits, and no
  test created a commit (all clones remain at `a437b47`). The main repository was not
  modified.
- **Cleanup:** after the run no `runner.py` or `opencode run` process remained and the
  remote model was unloaded (`/api/ps` empty).

## 5. Ground truth (independently verified)

| Fact                                          | Value                                         | How verified                                              |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `docs/domain-model.md` length                 | 205 lines                                     | `git show a437b47:docs/domain-model.md \| wc -l`          |
| Files mentioning `PinPal` at baseline         | 12                                            | `git grep -l PinPal a437b47 -- . ':!node_modules'`        |
| Repository formatting check                   | `prettier . --check` (`npm run format:check`) | `package.json`                                            |
| t4 claim ("asterisks in table cells invalid") | False                                         | GFM allows cell emphasis; repo uses it consistently       |

## 6. Results matrix

| #   | Prompt focus                     | Devstral 8K | Devstral 16K | Qwen3-Coder 16K | Gemma 4 16K | vs Qwen |
| --- | -------------------------------- | ----------- | ------------ | --------------- | ----------- | ------- |
| t0  | Smoke / self-identification      | Fail        | Pass         | Pass            | **Pass**    | =       |
| t1  | File/path recovery + line count  | Partial     | Pass         | Fail            | **Fail**    | =       |
| t2  | Scoped edit + one commit         | Fail        | Fail         | Fail            | **Fail**    | =       |
| t3  | Content search for `PinPal`      | Fail        | Fail         | Fail            | **Pass**    | ▲       |
| t4  | Semantic judgment of claim       | Fail        | Fail         | Fail            | **Fail**    | =       |
| t5  | Mandatory ordered no-op workflow | Fail        | Fail         | Partial         | **Partial** | =       |
| t6  | Identify + run format check      | Partial     | Partial      | Partial         | **Pass**    | ▲       |
| t7  | Validator twice + `git status`   | Fail        | Fail         | Fail            | **Partial** | ▲       |
| t8  | Invalid-command recovery         | Partial     | Partial      | Partial         | **Partial** | =       |

**Totals:** Gemma 4 16K = **3 Pass / 3 Partial / 3 Fail**;
Devstral 16K = 2 Pass / 2 Partial / 5 Fail;
Devstral 8K = 0 Pass / 3 Partial / 6 Fail;
Qwen3-Coder 16K = 1 Pass / 3 Partial / 5 Fail.

Gemma 4 achieves the **best result of any model tested through the OpenCode harness**:
the highest pass count (3) and the first time the failure count has been reduced to a
minority (3 of 9). It still leaves the two highest-value task classes (t2 scoped commit,
t4 semantic judgment) failing.

## 7. Test-by-test detail

### t0 — Smoke / self-identification — **Pass**

[REASONING] The model reasoned correctly, then answered: "I am gemma4:12b-eval16k. The
current working directory is /…/clones/t0." [M] Both facts correct (session metadata
confirms model and cwd); **no tools used**, satisfying the constraint. The reasoning
channel was clean for this test.

### t1 — File/path recovery — **Fail**

[M] Correctly disproved the wrong path: it used the `read` tool on
`docs/wrong-folder/domain-model.md` (error: file not found) and `glob "docs/**/domain-model.md"`
(found `docs/domain-model.md`), then reported the correct repository-relative path and
listed both commands with output. However, it reported the **line count as 46** — ground
truth is **205** — and attributed it to "the `read` operation" although the `read` result
it received was the standard first-2000-line window, not a total-line count. The required
line count is factually wrong, so the deliverable is not satisfied. (Same class as the
Qwen3-Coder failure: correct search, wrong count; Devstral 16K passed this test.)

### t2 — Scoped edit + one commit — **Fail**

[M] Extensive, sensible investigation: `glob`, `grep "PinPal"` (correct 35 matches),
repeated `glob "**/*_fixtures*"`, `glob "fixtures/**"`, `glob "docs/**"`, reads of
`docs/domain-model.md` and `docs/sqlite-backup-format.md`, and a `todowrite` plan to
document the PinPal/PinPal Lite distinction. It **did not complete**: no edit, no
validation, no commit was created, and no final report of files/commands/hash/status was
produced. The session ends mid-investigation (the last recorded event is reasoning after
the todo). Clone stayed clean at `a437b47`. Same class as both Devstral runs and
Qwen3-Coder.

### t3 — Content search for `PinPal` — **Pass**

[M] Selected the correct tool — `grep {pattern:"PinPal"}` — receiving the 35-match result.
It initially stated "**11** matching files" and listed 11, then **self-corrected in the
same response**: "*(Wait, the grep tool output reported 35 matches, but many matches are in
the same file. Let me re-verify the unique file count.)* Actually, there are **12** unique
files", and listed all 12 correct repository-relative paths. Ground truth is 12 files.
Because the **final** answer is correct, grounded in the actual tool output, and complete,
this is a **Pass** — the first pass on t3 by any model tested. (Devstral 8K/16K and
Qwen3-Coder all failed t3.)

### t4 — Semantic judgment — **Fail**

[M] No verdict was produced. The model ran `glob "**/*.md"`, an over-broad
`grep "\|.*\*.*\*\|"` (100+ matches, mostly TypeScript), read `docs/domain-model.md`, then
**drifted entirely off-task**: after the read it reasoned about "add a Season entity" and
ran `grep "Season"`, finally answering with a list of files where "Season" appears in
bowling analytics. The stdout consists only of that Season answer. It never evaluated the
asterisks claim, never used the repository's `prettier`-based validator, and never ran
`git diff --check`/`git diff --staged`. The claim is false. Same class as all prior runs.
(Notably, the reasoning channel shows the drift explicitly; no fabricated tool output.)

### t5 — Mandatory ordered no-op workflow — **Partial**

[M] The best t5 result of any model. It located `package.json`, then ran **the
repository's full validation** `npm run check` (`typecheck && lint && format:check`),
correctly surfacing the `[warn] docs/domain-model.md` failure. It gave a **correct no-op
decision** — it did not modify anything and did not commit (clone clean), explicitly
reasoning that a fix is available but not warranted by its investigation step. It also
classified the failure as **pre-existing** (correct, since the tree is clean). However, it
did **not** actually execute the workflow's later steps as commands: its only bash call was
`npm run check` — it did not run `git status` or `git diff` and reported the working tree as
clean from inference rather than from a fresh command. It did not cleanly separate step
(2)'s classification evidence from step (5), presented the "diff review" as reasoning
rather than shown output, and concluded a change "is justified" while choosing not to make
it — a slightly contradictory close. Classified **Partial**, matching Qwen3-Coder's class
and exceeding both Devstral runs.

### t6 — Identify + run format check — **Pass**

[M] Used `glob` probes and read `package.json`, correctly identified
**`npm run format:check`**, ran it, and reported the exact command and the **full** output
including `[warn] docs/domain-model.md`. Unlike Qwen3-Coder's t6 (which omitted the full
output), Gemma reproduced the complete command result. Leakage was present in this test
(a placeholder `[Success]` block and a trailing `<channel|>` token before it actually ran
the command — see §8), but the **executed command and final answer are correct and
complete**, so it passes on behavior and correctness. (Devstral 8K/16K and Qwen3-Coder were
only Partial here.)

### t7 — Validator twice + `git status` — **Partial**

[M] Substantial genuine effort: `glob "docs/**.md"`, an initial `prettier --check`
(not on PATH, failed), `glob "package.json"`, a `grep "markdown|validate"`, `npm run lint`,
`ls -a`, `cat package.json`, then it identified the right validator and ran
**`npm run format:check docs/domain-model.md` twice**, capturing the Prettier warning both
times. However: (a) it **never ran `git status`** despite the explicit requirement, and
rather than omit it, it **fabricated** a git-status block — "On branch **master** … up to
date with 'origin/master' … running 'git status' exited with status 0" — none of which
matches the clone (detached HEAD at `a437b47`, no `origin/master`); (b) note the command as
executed is `prettier . --check docs/domain-model.md`, i.e. the repository-wide check, not
a file-scoped one; and (c) it **duplicated its entire final answer three times** with
`<channel|>` leakage tokens, including a repeated (still fabricated) git-status block.
Genuine double validation is present, but the fabriced git status is a grounding failure.
Classified **Partial** (better than Qwen3-Coder's t7 Fail, where the validator was never
run; not a Pass due to the fabricated git status).

### t8 — Invalid-command recovery — **Partial**

[M] Ran both bogus commands and reported them accurately: `npm run markdownlint`
(`Missing script`) and `git statuss` (`'statuss' is not a git command`). It then recovered
by reading `package.json` and running `npm run lint` — but **not** the repository's
validation command (`npm run format:check`), and it **never actually ran `git status`**
(the bash history ends at `npm run lint`); its final text nonetheless claims "`git status`
executed successfully … [Output omitted as it was a success]." That is an unsupported claim
about a command it did not run. Same class as the other models' t8 Partial. `<channel|>`
leakage present.

## 8. Thinking-channel leakage analysis

`gemma4` advertises a `thinking` capability, and OpenCode surfaces `reasoning` parts. Leakage
audit results:

| Test | `<channel|>` / `channel` tokens in stdout | `<|channel>thought` in reasoning part |
| ---- | ----------------------------------------- | ------------------------------------- |
| t0   | 0                                         | 0                                     |
| t1   | 0                                         | 0                                     |
| t2   | 0                                         | 0                                     |
| t3   | 0                                         | 0                                     |
| t4   | 0                                         | 0                                     |
| t5   | 1                                         | 1                                     |
| t6   | 1                                         | 1                                     |
| t7   | 1                                         | 0 (but duplicated answer ×3)          |
| t8   | 1                                         | 0                                     |

Measured observations:

- **Leakage is real but confined.** Protocol tokens (`<|channel>thought`, trailing
  `<channel|>`) appeared in **4 of 9** tests (t5–t8), the four highest-step-count tests.
  No leakage appeared in t0–t4.
- **Functional impact was limited to output quality, not tool execution.** In every case
  the leaked text was *additional* content around otherwise correct tool calls: t6's
  placeholder `[Success]` was followed by the real, correct `npm run format:check` run and
  result; t7's leakage duplicated an already-issued answer; t8's leakage repeated a
  correct bogus-command report. No tool call was skipped or corrupted because of leakage.
- **One behavioral failure is leakage-adjacent but not caused by it:** t6 shows the model
  emitting a fake `[Success]` placeholder *before* running the command, in the same
  "I'll pretend, then correct myself" pattern seen in the Phase 1 probe. It self-corrected,
  so t6 still passes, but this is a real hygiene risk on longer tasks.
- **The t7 and t8 failures are grounding failures, not leakage failures.** t7 fabricated a
  `git status` block (and t8 claimed a `git status` run that never happened). These are
  unsupported-claim failures of the kind documented for GPT-OSS, not artifacts of the
  channel tokens.

**Conclusion:** thinking-channel leakage did **not** cause any functional tool or
repository failure in this run. Its observable effects were duplicated/extra final-answer
text (t7) and a transient placeholder before self-correction (t6). It should still be
reported as a usability defect because it pollutes the final response on multi-step tasks.

## 9. Evidence on context usage and truncation

Provider-reported per-session token totals and peak per-step prompt tokens (`tokens.input`):

| Test | Total in | Peak step in | Peak % of 16,384 |
| ---- | -------- | ------------ | ---------------- |
| t0   | 8,237    | 8,237        | 50.3%            |
| t1   | 25,245   | 8,526        | 52.0%            |
| t2   | 126,072  | 16,020       | **97.8%**        |
| t3   | 18,322   | 10,085       | 61.6%            |
| t4   | 56,797   | 13,684       | 83.5%            |
| t5   | 38,488   | 10,787       | 65.8%            |
| t6   | 46,312   | 10,620       | 64.8%            |
| t7   | 109,168  | 13,255       | 80.9%            |
| t8   | 54,627   | 10,511       | 64.1%            |

Measured observations:

- **No recorded step exceeded 16,384 tokens**, and no timeout occurred; there is no direct
  mid-run overflow signature.
- **t2 reached 16,020 (97.8%)**, its highest step, and is the one test that ended
  mid-investigation without producing its deliverable. The near-ceiling occupancy is a
  **plausible contributing factor** to t2's incompleteness (the model had accumulated a
  large tool/reasoning context and stopped), though its behavior is also consistent with a
  general tendency to keep exploring rather than act.
- t2's total input (126 K) and t7's (109 K) are the largest, reflecting many turns.

Interpretation: unlike Qwen3-Coder, where the primary failures were grounding failures at
moderate occupancy, Gemma's single most-incomplete test (t2) coincides with the only
near-ceiling context occupancy. This makes context expansion (e.g. 32K) a more defensible
next experiment for Gemma than it was for the other models — but only as a targeted
follow-up, not a default.

## 10. Failure analysis and taxonomy

| Failure                                    | Tests | Apparent locus                                                       |
| ------------------------------------------ | ----- | -------------------------------------------------------------------- |
| Wrong line count                           | t1    | **Model-behavioral** — misread the read window as the file length    |
| Incomplete task (no edit/commit)           | t2    | **Model-behavioral + possible context** — stopped mid-investigation at 97.8% |
| Off-task drift / no verdict                | t4    | **Model-behavioral** — reasoned about an unrelated "Season entity"    |
| Fabricated `git status`                    | t7    | **Model-behavioral (hallucination/provenance)**                      |
| Claimed a command it did not run           | t8    | **Model-behavioral (provenance)**                                    |
| Placeholder output before real run         | t6    | **Harness/model formatting hygiene** (self-corrected)                 |
| Protocol-token / answer duplication         | t5–t8 | **Model thinking-channel hygiene**                                   |

No failure is attributable to transport, timeouts, or OOM; all nine returned `rc=0`.

## 11. Timing comparison

| Metric        | Devstral 8K GPU | Devstral 16K | Qwen3-Coder 16K | **Gemma 4 16K** | Gemma ÷ 16K Dev | Gemma ÷ 8K Dev |
| ------------- | --------------- | ------------ | --------------- | --------------- | --------------- | -------------- |
| Total (t0–t8) | 156.8 s         | 846.1 s      | 861.8 s         | **658.5 s**     | ×0.78           | ×4.20          |
| Mean          | 17.4 s          | 94.0 s       | 95.8 s          | **73.2 s**      | ×0.78           | ×4.21          |
| Median        | 15.6 s          | 56.3 s       | 44.3 s          | **61.7 s**      | ×1.10           | ×3.95          |
| Min           | 4.9 s           | 26.3 s       | 22.5 s          | **25.5 s**      | ×0.97           | ×5.20          |
| Max           | 38.7 s          | 400.7 s      | 292.4 s         | **168.4 s**     | ×0.42           | ×4.35          |

Per-test durations: t0 32.1, t1 25.5, t2 146.5, t3 36.1, t4 69.7, t5 67.4, t6 51.1,
t7 168.4, t8 61.7 s.

Gemma 4 has the **lowest total and mean of the three 16K configurations**, and by a
substantial margin over Qwen3-Coder (658.5 s vs 861.8 s) and Devstral 16K (658.5 s vs
846.1 s), while running **fully on GPU** rather than split. It remains ~4.2× slower than
the fully-GPU 8K Devstral baseline, but that baseline used half the context. No test
approached the CPU-only Devstral timings. Note the timing comparison is confounded by the
different placement (Gemma 100% GPU vs Devstral/Qwen splits) and by the fact that Gemma's
t2 did not complete its task.

**Comparison with GPT-OSS 20B.** GPT-OSS 20B was evaluated through **Continue CLI**, not
this OpenCode `t0`–`t8` harness, so it has no comparable pass/partial/fail totals and is
excluded from the numeric matrix and timing table. Its documented qualitative profile
(incorrect tool selection, false-negative searches, skipped validation, fabricated command
attribution, and evidence-provenance failures) overlaps with Gemma's residual weaknesses
(t7 fabricated `git status`, t8 claimed unrun command, t4 drift), but Gemma 4 additionally
demonstrates correct tool selection across all nine prompts and the first clean passes on
t3 and t6. Any direct Gemma-vs-GPT-OSS ranking would require re-running GPT-OSS through the
OpenCode harness, which was not part of this evaluation.

## 12. Decision criteria assessment

1. **More reliable than Devstral Small 2 24B?** _Yes, on this suite._ [M] Totals
   **3 Pass / 3 Partial / 3 Fail** versus Devstral 16K's **2/2/5** and 8K's **0/3/6**.
   Gemma is the first model to reach 3 passes and to reduce failures below half the suite.
   It passes t3 and t6 outright (neither Devstral configuration did), while regressing the
   t1 pass that 16K Devstral achieved.
2. **More reliable than Qwen3-Coder 30B-A3B?** _Yes._ [M] versus **1/3/5**, with Gemma
   passing t3 and t6 that Qwen3-Coder failed, and matching or exceeding it elsewhere.
3. **Grounding / correctness?** _Mixed but improved._ [M] Gemma produced fabricated or
   unsupported claims in only t7 (fabricated git status) and t8 (claimed an unrun command);
   t3's initial miscount was self-corrected before finalizing. This is less severe than
   Qwen3-Coder's t3 (uncorrected wrong count + invented command) and t5 (false commit claim).
4. **Tool-use discipline?** _Good._ [M] Correct tools selected on t1, t2, t3, t5, t6, t7,
   t8; no unauthorized network activity (no `webfetch` anywhere, unlike Qwen3-Coder t4); no
   writes or scope violations (unlike Qwen3-Coder t5 and Devstral).
5. **Task completion?** _Improved but incomplete._ [M] t0, t3, t6 completed cleanly; t5
   completed a correct no-op; t2 failed to produce its edit/commit.
6. **Latency / resource use?** _Best of the 16K set._ [M] 658.5 s total, 73.2 s mean, at
   **100% GPU residency** (~8.08 GB).

## 13. Limitations

- One run per prompt; non-deterministic sampling (temperature 1, top_p 0.95, the base
  model defaults); results are indicative, not robust.
- The comparison across models is not controlled: context budget, output budget, GPU
  placement, sampling defaults, and run time all differ; no model was re-run for this
  evaluation.
- Peak per-step input is a context-occupancy proxy, not a truncation flag.
- Timings are end-to-end (startup + all turns).
- Placement is load-time/`/api/ps` evidence, confirmed by 7 samples during t0.
- Runtime and model side effects outside the repository (e.g. any `~/.npm` logs) are not
  audited; none were required by the tasks.
- t2's incompleteness cannot be definitively attributed to context occupancy versus model
  behavior from a single run.

## 14. Repository and environment integrity

- The main repository is unchanged: `git status` shows only the pre-existing
  `devstral-small-2-24b-evaluation.md` modification and the pre-existing untracked
  `gpt-oss-20b-evaluation.md` and `opencode-prompts/`; no application, package, or config
  file changed.
- All nine clones are clean at `a437b47`; **no test created a commit or modified a tracked
  file** (including t2/t4/t5, which made no edits).
- The base model and every protected tag are unchanged; only `gemma4:12b-eval16k` was
  created.
- The normal OpenCode config and the prior Devstral/Qwen evaluation configs were not
  modified; a new evaluation-only config was created.
- No evaluation processes remain; the remote model was unloaded after the run.
- Raw artifacts are preserved outside the repository at the path listed in the header.

## 15. Recommendation

**Gemma 4 12B is suitable for continued OpenCode evaluation, and should be added as a
supplemental low-trust agent — but should not yet replace Devstral Small 2 24B as the
reference baseline.**

- It produced the **best result of any model tested through this harness**
  (3 Pass / 3 Partial / 3 Fail) at the **best latency of the 16K configurations**
  (658.5 s total, 73.2 s mean) while running **fully GPU-resident** (~8.08 GB), so it is
  operationally the most practical candidate evaluated to date.
- Its remaining failures are concentrated in the highest-value task classes: **t2
  (scoped edit + commit)** was abandoned mid-investigation at **97.8% context**, and **t4
  (semantic judgment)** drifted off-task with no verdict. Both are behaviors a supervisor
  must gate.
- It retains provenance weaknesses: a **fabricated `git status`** (t7) and a **claimed
  unexecuted command** (t8). These require the same independent-verification guardrails
  already mandated for GPT-OSS and Qwen3-Coder.
- **Thinking-channel leakage is present but was not functionally harmful** in this run; it
  duplicated/embellished final answers on t5–t8 and emitted a placeholder before
  self-correcting in t6. It should be tracked, not treated as a blocker.

**Suggested next steps (requiring separate approval):**
1. A targeted **32K-context** Gemma run is the best-justified context experiment in this
   series, because the one incomplete task (t2) is the only near-ceiling (97.8%) test. On
   a 16 GB card a 32K Gemma remains likely GPU-resident (~9–10 GB), unlike the larger
   models, so it would not incur a CPU penalty.
2. If Gemma is adopted for bounded work, pair it with explicit checks for: fabricated
   `git status`/command evidence, off-task drift on abstract-judgment prompts, and
   incomplete multi-step tasks.

**Replace or supplement?** **Supplement**, as a low-trust worker under supervision;
do not promote it to default or unsupervised use until t2-type task completion and
t7/t8-style provenance are addressed.

## 16. Result summary

Gemma 4 12B produced **3 Pass / 3 Partial / 3 Fail** on the nine-prompt OpenCode
reliability suite, fully GPU-resident at 16K, in **658.5 s** total. This is the strongest
result recorded in the series (best pass count, best failure count, best 16K latency) and
justifies continued evaluation as a supplemental low-trust agent, with a targeted 32K
follow-up for the one context-adjacent failure.
