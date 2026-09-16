# Qwen3-Coder 30B-A3B — OpenCode Reliability Evaluation Findings

**Date:** 2026-09-16
**Model under test:** `ollama/qwen3-coder:30b-eval16k`
**Base blob:** `qwen3-coder:30b` (`qwen3moe`, Q4_K_M, 30.5B, MoE 128 experts / 8 active)
**Inference host:** Windows machine running Ollama `0.33.2` (AMD Radeon RX 9070 XT, 16 GB)
**Orchestrator:** M1 Mac running OpenCode `1.18.30`
**Remote endpoint:** `http://192.168.68.52:11434`
**Baseline:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`)
**Raw artifacts (outside the repository):**
`/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/qwen3-coder-eval/`
(`runner.py`, `probe_placement.py`, `extract_traces.py`, `manifest.json`, `status.json`,
`show-*.json`, `tags-before/after-*.json`, `clones/t0`–`t8`,
`results/qwen3-coder-eval16k/{tN.out,tN.log,tN.err,t0-ps.json,results.jsonl,traces.txt}`)

**Related:** `devstral-small-2-24b-gpu16k-findings.md` (16K split),
`devstral-small-2-24b-gpu-reliability-assessment.md` (8K GPU),
`devstral-small-2-24b-evaluation.md` (base), `gpt-oss-20b-evaluation.md`.

## 1. Objective

Determine whether `qwen3-coder:30b` is a more reliable OpenCode repository agent than
Devstral Small 2 24B, using the same nine persisted prompts and the same disposable-clone
methodology. CPU/GPU split was accepted in advance; full GPU residency was not required.

## 2. Deployment and exact runtime configuration

### 2.1 Acquisition and model identity

The model did not exist on the host and had no prior reliability evaluation in this
repository. It was pulled from the Ollama library (`qwen3-coder:30b`). Exact metadata
verified through `/api/show`:

| Field                       | Value                            |
| --------------------------- | -------------------------------- |
| `details.family`            | `qwen3moe`                       |
| `details.parameter_size`    | 30.5B                            |
| `general.parameter_count`   | 30,532,122,624                   |
| `details.quantization_level`| Q4_K_M                           |
| `block_count`               | 48                               |
| `expert_count` / `expert_used_count` | 128 / 8 (A3B)           |
| Native `context_length`     | 262,144                          |
| `capabilities`              | `completion`, `tools`            |
| Registry model layer size   | 18,556,688,736 B (~18.56 GB)     |

### 2.2 Evaluation-only variant

The base tag was **not** modified. A separate variant was created server-side via
`POST /api/create` (`from: qwen3-coder:30b`, `num_ctx 16384`), verified through `/api/show`:

| Parameter      | Value              | Verification                       |
| -------------- | ------------------ | ---------------------------------- |
| `parent_model` | `qwen3-coder:30b`  | `/api/show` `details.parent_model` |
| `num_ctx`      | 16384              | `/api/show` `parameters`           |

OpenCode's model budget was supplied through a **new, separate** evaluation config
`/Users/cortezashley/.config/opencode/opencode.qwen3-coder-eval-16k.jsonc`:

```jsonc
"qwen3-coder:30b-eval16k": {
  "name": "qwen3-coder:30b-eval16k",
  "limit": { "context": 16384, "output": 6144 }
}
```

The normal/default OpenCode config (`opencode.jsonc`) and the prior Devstral evaluation
configs were **not** modified.

### 2.3 Protected models unchanged

Digest comparison before and after the run confirmed the base `qwen3-coder:30b` and every
protected tag were untouched:

| Model                        | Result    |
| ---------------------------- | --------- |
| `devstral-small-2:24b`       | UNCHANGED |
| `devstral-small-2:24b-gpu`   | UNCHANGED |
| `devstral-small-2:24b-cpu`   | UNCHANGED |
| `devstral-small-2:24b-gpu16k`| UNCHANGED |
| `gpt-oss:20b`                | UNCHANGED |
| `qwen3-coder:30b`            | UNCHANGED |

Only the new `qwen3-coder:30b-eval16k` tag was added.

## 3. Actual measured placement (not assumed)

A `num_gpu` sweep at `num_ctx 16384` was measured through `/api/ps`:

| `num_gpu` | `size` (bytes)    | `size_vram` (bytes) | VRAM % |
| --------- | ----------------- | ------------------- | ------ |
| 999       | 19,336,286,698    | 19,336,286,698      | 100.0% |
| 44        | 19,701,807,127    | 17,387,833,261      | 88.3%  |
| **default** | **19,695,714,900** | **15,788,429,802** | **80.2%** |
| 36        | 19,701,807,127    | 14,277,337,415      | 72.5%  |
| 28        | 19,701,807,127    | 11,166,831,083      | 56.7%  |
| 20        | 19,701,807,127    | 8,108,501,892       | 41.2%  |

No `num_gpu` override was embedded in the variant. With model defaults at 16K, Ollama ran a
stable **80.2% GPU / 19.8% CPU split**:

- `size` = 19,695,714,900 B (~19.70 GB)
- `size_vram` = 15,788,429,802 B (~15.79 GB)
- `context_length` = 16384

Placement was re-confirmed via `/api/ps` during the run (t0 polling) and remained stable.
This is a **smaller** CPU share than the Devstral 16K split (87.5% GPU / 12.5% CPU).

## 4. Evaluation scope and methodology

- **Same nine persisted prompts** `t0`–`t8`, byte-for-byte from
  `docs/development/model-reliability/opencode-prompts/`.
- **Same methodology as the prior Devstral runs:** one disposable `git clone --local` per
  prompt at baseline `a437b47`, each with `node_modules` symlinked and excluded; serial
  execution; remote inference only; `OPENCODE_CONFIG` pointing at the new eval config;
  `opencode run -m ollama/qwen3-coder:30b-eval16k`.
- **Captured per test:** stdout (`tN.out`), combined log (`tN.log`), stderr (`tN.err`),
  runner metadata (`results.jsonl`: rc, timeout, duration, session id, role/part counts,
  per-session token totals, peak per-step input tokens, clone git status/log), live
  placement samples (`t0-ps.json`), and a reconstructed tool trace (`traces.txt`).
- **Return codes / timeouts:** all nine prompts returned `rc=0`; **no timeouts**.
- **Repository integrity:** every clone's `git status` is clean of tracked edits except
  t5 (§7.6); every `git log` starts at `a437b47`. The main repository was not modified.
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

| #   | Prompt focus                     | Devstral 8K GPU | Devstral 16K | Qwen3-Coder 16K | Change vs 16K |
| --- | -------------------------------- | --------------- | ------------ | --------------- | ------------- |
| t0  | Smoke / self-identification      | Fail            | Pass         | **Pass**        | =             |
| t1  | File/path recovery + line count  | Partial         | Pass         | **Fail**        | ▼             |
| t2  | Scoped edit + one commit         | Fail            | Fail         | **Fail**        | =             |
| t3  | Content search for `PinPal`      | Fail            | Fail         | **Fail**        | =             |
| t4  | Semantic judgment of claim       | Fail            | Fail         | **Fail**        | =             |
| t5  | Mandatory ordered no-op workflow | Fail            | Fail         | **Partial**     | ▲             |
| t6  | Identify + run format check      | Partial         | Partial      | **Partial**     | =             |
| t7  | Validator twice + `git status`   | Fail            | Fail         | **Fail**        | =             |
| t8  | Invalid-command recovery         | Partial         | Partial      | **Partial**     | =             |

**Totals:** Qwen3-Coder 16K = **1 Pass / 3 Partial / 5 Fail**;
Devstral 16K = 2 Pass / 2 Partial / 5 Fail;
Devstral 8K = 0 Pass / 3 Partial / 6 Fail.

Qwen3-Coder gains one partial (t5) relative to both Devstral configurations but **loses
the t1 pass** that 16K Devstral had achieved, and does not improve any substantive task.
Its pass count is lower than Devstral 16K and its partial count is the same.

## 7. Test-by-test detail

### t0 — Smoke / self-identification — **Pass**

Response: "I am qwen3-coder:30b-eval16k running in the directory /…/clones/t0." [M] Both
facts correct (session metadata confirms model and cwd); **no tools used**, satisfying the
constraint. Equivalent to Devstral 16K's pass.

### t1 — File/path recovery — **Fail**

[M] The model printed **malformed tool-call XML as plain text** instead of invoking the
`glob` tool:

```
<function=glob>
<parameter=pattern>docs/wrong-folder/domain-model.md</parameter>
</function>
</tool_call>
```

No tool actually executed (session parts are text/step only; no `tool` part). The output
ends mid-tool-call with no final answer: it neither confirmed the reported path was wrong,
nor located `docs/domain-model.md`, nor reported the 205-line count, nor listed commands.
The required deliverable is entirely absent. This is a **regression** from Devstral 16K,
which passed this test.

### t2 — Scoped edit + one commit — **Fail**

[M] The model spawned an `explore` subagent (which returned PinPal import findings), ran a
content `grep`, and read `docs/domain-model.md` and the GPT-OSS reliability document. It
then **answered a different question**: it produced a summary of the *GPT-OSS evaluation
results* and asked "Would you like me to explore any particular aspect of this evaluation
in more detail?" It made no edit, ran no validation, created no commit, and did not report
files changed, commands, hash, or git status. Clone stayed clean at `a437b47`. Same class
as both Devstral runs.

### t3 — Content search for `PinPal` — **Fail**

[M] Selected the correct tool — `grep {pattern:"PinPal", path:"."}` — and received the
correct 35-match result spanning the 12 ground-truth files. Its final answer is nevertheless
**factually wrong**: it claimed the command was `grep -r "PinPal" .` (a command it never
ran), reported **15 matching files** (ground truth 12), and listed only **11** paths,
omitting at least one file. The tool result and the reported answer disagree. (The 8K and
16K Devstral runs also failed this test.)

### t4 — Semantic judgment — **Fail**

[M] Attempted an **unauthorized external network fetch**:
`webfetch https://github.com/opencodeai/opencode/blob/main/README.md`, which failed with a
404. It then ran `glob "**/*.md"` (22 matches), read `README.md`, attempted to read
`CONTRIBUTING.md` via a **mistyped path** (`/private/var/ffolders/…`, which was
auto-rejected as an external directory), and ran a `find | grep` for "table". It produced
**no final verdict** — stdout is empty and the session ends after the search step. It never
used the repository's `prettier`-based validator and never ran
`git diff --check`/`git diff --staged`. The claim is false. Same class as both Devstral runs.

### t5 — Mandatory ordered no-op workflow — **Partial (scope violation)**

[M] Followed more of the mandated workflow than either Devstral run: read `package.json`,
ran **the correct validator** `npm run format:check` (output: `[warn] docs/domain-model.md`),
then `git status`, `git diff`, and re-checked formatting. Step (1) and step (3) were
performed. However, it then **violated the task**: rather than classifying the failure and
committing "only if a justified change exists," it ran `npm run format`
(`prettier . --write`), which **modified `docs/domain-model.md`** (99 insertions / 99
deletions), and then claimed "the commit is now clean with no errors" and "the formatting
has been applied … The commit is clean and ready for review" — **no commit was created**
(clone HEAD remains `a437b47`, working tree dirty). It also never classified the failure as
pre-existing vs self-caused, never ran `git diff --check`/`--staged`, and produced no final
Git status. Classified **Partial** because the required validator was correctly identified
and run; the no-op discipline and evidence reporting failed.

### t6 — Identify + run format check — **Partial**

[M] Read `package.json`, ran `npm run format:check` **twice**, and correctly produced
`prettier . --check` with the `docs/domain-model.md` warning. It named the exact command.
However, the final answer only described the result in prose and did **not reproduce the
full output** the prompt required, and the command was run twice rather than once. Same
class as both Devstral runs.

### t7 — Validator twice + `git status` — **Fail**

[M] Never used the repository's own validator. After failing to find a `markdownlint`-style
tool, it ran a series of ad-hoc shell "validations" (`wc -l`, `grep -n '^|.*|'`, table-line
counts) and **ran `git status` twice instead of running the validator twice**. Its ad-hoc
checks did not invoke `npm run format:check`, so it never surfaced the known Prettier
warning, yet it concluded the file "is properly formatted … no syntax errors." It did not
report two validator executions separately. This session reached **99.6% of the 16K window
(peak 16,314 tokens)**, the closest to truncation of any test. Same class as both Devstral
runs.

### t8 — Invalid-command recovery — **Partial**

[M] Ran both bogus commands and reported them faithfully: `npm run markdownlint`
(`Missing script`) and `git statuss` (`'statuss' is not a git command`). It recovered the
correct Git-status command (`git status`) and read `package.json`. It did **not** identify
or run the correct validation command (`npm run format:check`) in the recovery phase; its
bash history ends at `git status`. Same class as both Devstral runs.

## 8. Evidence on context usage and truncation

Provider-reported per-session token totals and peak per-step prompt tokens (`tokens.input`):

| Test | Total in | Peak step in | Peak % of 16,384 |
| ---- | -------- | ------------ | ---------------- |
| t0   | 8,475    | 8,475        | 51.7%            |
| t1   | 8,515    | 8,515        | 52.0%            |
| t2   | 55,890   | 15,436       | 94.2%            |
| t3   | 18,664   | 10,190       | 62.2%            |
| t4   | 18,322   | 9,805        | 59.8%            |
| t5   | 138,848  | 14,784       | 90.2%            |
| t6   | 58,499   | 13,052       | 79.7%            |
| t7   | 168,266  | 16,314       | **99.6%**        |
| t8   | 27,728   | 10,497       | 64.1%            |

Measured observations:

- No recorded step exceeded 16,384 tokens; **there is no direct mid-run overflow
  signature**. However, **t7 reached 16,314 (99.6%)** and t2 reached 15,436 (94.2%), the
  two multi-step prompts; t7's near-ceiling usage is a plausible contributor to its failure
  to run the validator twice.
- The t0 first-step prompt consumed **8,475 tokens**, close to Devstral 16K's 8,395 and
  roughly double the 8K run's 4,099 — consistent with full (untruncated) system/tool
  context at 16K.
- Total prompt processing across the suite was large (t7 168K, t5 139K), reflecting many
  turns rather than a single large window.

Interpretation: the harness supplied full context at 16K (t0 ≈ 8.5K), so **t1's malformed
tool-call is not a truncation artifact** — it occurred in a 8,515-token first step at 52%
occupancy. t7's failure is the only one plausibly context-adjacent, but it had room and the
ad-hoc-validation behavior is equally consistent with a model-harness tool-formatting
weakness.

## 9. Failure analysis and taxonomy

| Failure                          | Tests     | Apparent locus                                                            |
| -------------------------------- | --------- | ------------------------------------------------------------------------- |
| Malformed / unparsed tool call   | t1        | **Model/tool-harness formatting** — emitted function XML as text; no tool executed |
| Wrong task / no deliverable      | t2        | **Model-behavioral** — answered the wrong question, stopped early          |
| Fabricated command + wrong count | t3        | **Model-behavioral (hallucination)** — reported a command it never ran and 15 vs 12 |
| No verdict / unauthorized fetch  | t4        | **Model-behavioral + network-policy** — external `webfetch`, no conclusion |
| Scope violation + false claim    | t5        | **Model-behavioral** — ran a write that modified a file, claimed a commit that did not exist |
| Incomplete output reproduction   | t6        | **Reporting discipline**                                                   |
| Validator substitution           | t7        | **Model-behavioral**, possibly context-adjacent (99.6% window)             |
| Correct recovery, missed validator | t8      | **Model-behavioral** — recovered git but not the validation command        |

No failure is attributable to transport, timeouts, or OOM; all nine returned `rc=0`.

## 10. Timing comparison

| Metric        | Devstral 8K GPU | Devstral 16K | Qwen3-Coder 16K | Qwen3 ÷ 16K | Qwen3 ÷ 8K |
| ------------- | --------------- | ------------ | --------------- | ----------- | ---------- |
| Total (t0–t8) | 156.8 s         | 846.1 s      | **861.8 s**     | ×1.02       | ×5.50      |
| Mean          | 17.4 s          | 94.0 s       | **95.8 s**      | ×1.02       | ×5.50      |
| Median        | 15.6 s          | 56.3 s       | **44.3 s**      | ×0.79       | ×2.84      |
| Min           | 4.9 s           | 26.3 s       | **22.5 s**      | ×0.86       | ×4.59      |
| Max           | 38.7 s          | 400.7 s      | **292.4 s**     | ×0.73       | ×7.56      |

Per-test durations: t0 42.6, t1 22.5, t2 292.4, t3 36.5, t4 37.4, t5 118.7, t6 58.6,
t7 208.8, t8 44.3 s.

Qwen3-Coder's total is essentially identical to Devstral 16K (861.8 s vs 846.1 s, +1.8%)
despite a smaller CPU share (19.8% vs 12.5%), because its median is lower but its
multi-step prompts (t2 292 s, t7 209 s, t5 119 s) are long. Its t2 is less extreme than
Devstral 16K's 400.7 s t4 outlier. Against the 8K GPU baseline it is ~5.5× slower overall.

Note: the same evaluation also recorded the previously evaluated **gpt-oss:20b** as having
been assessed through Continue; its pass/fail statistics are not numerically comparable to
this OpenCode suite and are not restated here.

## 11. Decision criteria assessment

1. **More reliable than Devstral Small 2 24B?** _No._ [M] Totals are **1 Pass / 3 Partial
   / 5 Fail** versus Devstral 16K's **2 Pass / 2 Partial / 5 Fail** and Devstral 8K's
   **0 Pass / 3 Partial / 6 Fail**. Qwen3-Coder beats 8K on total passes but does not beat
   the 16K split; it regresses t1 (which 16K Devstral passed) and gains only one partial
   (t5). The four highest-value tasks (t2 scoped commit, t4 semantic judgment, t5 no-op
   discipline, t7 fresh-evidence provenance) all still fail.
2. **Better tool-use discipline?** _Mixed / no._ [M] It selected the correct `grep` for t3
   and the correct `format:check` for t5, but produced an unparsed tool call (t1), ran an
   unauthorized external fetch (t4), substituted ad-hoc shell checks for the repository
   validator (t7), and modified a file it was told to leave alone (t5).
3. **Correctness / grounding?** _Poor._ [M] t3 reported the wrong file count (15 vs 12),
   cited a command it never ran, and t5 claimed a commit that does not exist. These are
   fabricated-evidence failures of the same kind previously documented for gpt-oss.
4. **Task completion?** _Low._ [M] Only t0 completed a clean deliverable. t2 produced no
   edit/commit; t4 produced no verdict; t5 produced an uncommitted (and unwanted) edit.
5. **Latency / resource use acceptable?** _Interactive-adjacent, not better._ [M] ~95.8 s
   mean at an 80/20 split; comparable to Devstral 16K, ~5.5× the fully-GPU 8K baseline. No
   CPU-only pathology was observed (no test approached the Devstral CPU timings).

## 12. Limitations

- One run per prompt; non-deterministic sampling; results are indicative, not robust.
- The comparison across models is not controlled: context budget, output budget, GPU
  offload, and run time differ; Devstral was not re-run.
- Passthrough of peak per-step input is a context-occupancy proxy, not a truncation flag.
- Timings are end-to-end (startup + all turns).
- Placement is load-time/`/api/ps` evidence, confirmed during t0.
- The t5 clone retained an uncommitted modification (expected side effect of the model's
  `format --write`); the clone is disposable and outside the repository.
- **t4's `webfetch` touched the network from the OpenCode process.** It failed (404) and
  did not modify the repository, but it demonstrates the model attempted unauthorized
  network activity.

## 13. Repository and environment integrity

- The main repository is unchanged: `git status` shows only the pre-existing
  `devstral-small-2-24b-evaluation.md` modification and the pre-existing untracked
  `gpt-oss-20b-evaluation.md` and `opencode-prompts/`; no application, package, or config
  file changed.
- All nine clones are at `a437b47`; eight are clean of tracked edits and t5 contains only
  the model's own uncommitted `docs/domain-model.md` modification.
- The base model and every protected tag are unchanged; only `qwen3-coder:30b-eval16k` was
  created.
- The normal OpenCode config and the prior Devstral evaluation configs were not modified;
  a new evaluation-only config was created.
- No evaluation processes remain; the remote model was unloaded after the run.
- Raw artifacts are preserved outside the repository at the path listed in the header.

## 14. Recommendation

**Do not adopt `qwen3-coder:30b` as an OpenCode repository agent, and do not prioritize it
over Devstral Small 2 24B for further reliability testing.**

- It is **not** more reliable than Devstral 16K: 1 Pass / 3 Partial / 5 Fail versus
  2 Pass / 2 Partial / 5 Fail, with a regression on t1 and no improvement on the
  substantive tasks.
- Its tool-use and grounding failures are **intrinsic to the model**, not context-bound:
  the unparsed tool call (t1), the fabricated command/count (t3), the unauthorized fetch
  (t4), and the false commit claim (t5) all occurred at ≤90% context occupancy except t7.
  Only t7's validator-substitution is plausibly context-adjacent.
- Latency is comparable to Devstral 16K (~861.8 s total, 80/20 split) and ~5.5× the 8K GPU
  baseline, so there is no performance case for it either.

If it is retained at all, it should be limited to **bounded, low-trust subtasks** under the
same supervision and independent-verification guardrails already required for gpt-oss,
with explicit checks for: unparsed tool calls, invented commands/counts, scope violations
on no-op tasks, and any network access.

**Suitable for continued OpenCode evaluation or use:** not as a default or autonomous
worker; optional low-trust experimentation only, with supervision.
