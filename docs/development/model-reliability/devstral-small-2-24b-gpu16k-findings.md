# Devstral Small 2 24B — 16K Split-Context (`gpu16k`) Evaluation Findings

**Date:** 2026-09-16
**Model variant under test:** `ollama/devstral-small-2:24b-gpu16k`
**Base blob:** `devstral-small-2:24b` (Q4_K_M, `mistral3`, 24.0B)
**Inference host:** Windows machine running Ollama `0.33.2` (AMD Radeon RX 9070 XT, 16 GB)
**Orchestrator:** M1 Mac running OpenCode `1.18.30`
**Remote endpoint:** `http://192.168.68.52:11434`
**Baseline:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
**Prompts:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`)
**Raw artifacts (outside the repository):**
`/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/devstral-eval-16k/`
(`runner.py`, `probe_placement.py`, `extract_traces.py`, `manifest.json`, `status.json`,
`clones/t0`–`t8`, `results/gpu16k/{tN.out,tN.log,tN.err,t0-ps.json,results.jsonl,traces.txt}`)

**Related:** `devstral-small-2-24b-gpu-reliability-assessment.md` (8K GPU reliability),
`devstral-small-2-24b-gpu-vs-cpu-findings.md` (performance), `devstral-small-2-24b-evaluation.md` (base).

This document records the completed 16K split-context run. The 8K GPU evaluation was not
re-run and no CPU-only testing was performed.

## 1. Objective

Determine empirically whether increasing context from the fully GPU-resident 8,192-token
configuration to a partially offloaded 16,384-token configuration improves agent
reliability enough to justify the partial CPU offload.

## 2. Exact runtime configuration

The new variant was derived server-side on the Windows host via the Ollama HTTP API
(`POST /api/create` with `from: devstral-small-2:24b`). Its Modelfile parameters were then
verified through `/api/show`:

| Parameter      | Value                  | Verification                       |
| -------------- | ---------------------- | ---------------------------------- |
| `parent_model` | `devstral-small-2:24b` | `/api/show` `details.parent_model` |
| `num_ctx`      | 16384                  | `/api/show` `parameters`           |
| `num_gpu`      | 39                     | `/api/show` `parameters` (see §3)  |
| `temperature`  | 0.15                   | `/api/show` `parameters`           |

OpenCode's model budget was supplied through a **new, separate** evaluation config
`/Users/cortezashley/.config/opencode/opencode.devstral-eval-16k.jsonc`:

```jsonc
"devstral-small-2:24b-gpu16k": {
  "name": "devstral-small-2:24b-gpu16k",
  "limit": { "context": 16384, "output": 6144 }
}
```

The normal/default OpenCode config (`opencode.jsonc`) and the prior evaluation config
(`opencode.devstral-eval.jsonc`) were **not** modified. The base model and the existing
`devstral-small-2:24b-gpu` / `devstral-small-2:24b-cpu` variants were **not** modified;
only the new `devstral-small-2:24b-gpu16k` tag was created.

## 3. Actual measured placement (not assumed)

`num_gpu` was determined empirically. Loading at `num_ctx 16384` with `num_gpu 999`
(then the default) produced a **fully GPU-resident** model, not a split. A sweep varying
`num_gpu` (each load measured through `/api/ps`) gave:

| `num_gpu` | `size` (bytes)     | `size_vram` (bytes) | VRAM %    | Context   |
| --------- | ------------------ | ------------------- | --------- | --------- |
| 999       | 15,687,221,247     | 15,687,221,247      | 100.0%    | 16384     |
| 40        | 17,031,808,352     | 15,301,240,422      | 89.8%     | 16384     |
| **39**    | **17,031,808,352** | **14,908,338,994**  | **87.5%** | **16384** |
| 38        | 17,031,808,352     | 14,515,437,567      | 85.2%     | 16384     |
| 37        | 17,031,808,352     | 14,122,525,654      | 82.9%     | 16384     |
| 36        | 17,031,808,352     | 13,729,624,227      | 80.6%     | 16384     |
| 34        | 17,031,808,352     | 13,030,318,407      | 76.5%     | 16384     |
| 32        | 17,031,808,352     | 12,289,121,976      | 72.2%     | 16384     |

`num_gpu 39` was selected as the closest match to the ~88% GPU target suggested by the
prior assessment. The running configuration was confirmed again via `/api/ps` **during
the evaluation** (t0 polling), giving a stable:

- `size` = 17,031,808,352 B (~17.03 GB)
- `size_vram` = 14,908,338,994 B (~14.91 GB, **87.5% GPU / 12.5% CPU**)
- `context_length` = 16384

This matches the prior assessment's expectation of ~88% GPU at 16K on this GPU.

## 4. Evaluation scope and methodology

- **Same nine persisted prompts** `t0`–`t8`, byte-for-byte from
  `docs/development/model-reliability/opencode-prompts/`.
- **Same methodology as the prior GPU evaluation:** one disposable `git clone --local`
  per prompt at baseline `a437b47`, each with `node_modules` symlinked and excluded;
  serial execution; remote inference only; `OPENCODE_CONFIG` pointing at the new eval
  config; `opencode run -m ollama/devstral-small-2:24b-gpu16k`.
- **Captured per test:** stdout (`tN.out`), combined log (`tN.log`), runner metadata
  (`results.jsonl`: rc, timeout, duration, session id, role/part counts, per-session
  token totals and peak per-step input tokens, clone git status/log), live placement
  samples (`t0-ps.json`), and a reconstructed tool trace (`traces.txt`).
- **Return codes / timeouts:** all nine prompts returned `rc=0`, no timeouts.
- **Repository integrity:** every clone's `git status` is empty and every `git log`
  starts at `a437b47`. The main repository was not modified.
- **Cleanup:** after the run no `runner.py` or `opencode run` process remained, and the
  remote model was unloaded (`/api/ps` empty). The four long-lived `opencode` processes
  on the Mac predate this run (Sep 15/16 morning) and are interactive sessions, not
  evaluation processes.

## 5. Ground truth (independently verified)

| Fact                                          | Value                                         | How verified                                              |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `docs/domain-model.md` length                 | 205 lines                                     | `wc -l`; `git show a437b47:docs/domain-model.md \| wc -l` |
| Files mentioning `PinPal` at baseline         | 12                                            | `git grep -l PinPal a437b47 -- . ':!node_modules'`        |
| Repository formatting check                   | `prettier . --check` (`npm run format:check`) | `package.json`                                            |
| t4 claim ("asterisks in table cells invalid") | False                                         | GFM allows cell emphasis; repo uses it in tables          |

## 6. Results matrix (16K) vs 8K GPU

| #   | Prompt focus                     | 8K GPU  | 16K `gpu16k` | Change |
| --- | -------------------------------- | ------- | ------------ | ------ |
| t0  | Smoke / self-identification      | Fail    | **Pass**     | ▲      |
| t1  | File/path recovery + line count  | Partial | **Pass**     | ▲      |
| t2  | Scoped edit + one commit         | Fail    | Fail         | =      |
| t3  | Content search for `PinPal`      | Fail    | Fail         | =      |
| t4  | Semantic judgment of claim       | Fail    | Fail         | =      |
| t5  | Mandatory ordered no-op workflow | Fail    | Fail         | =      |
| t6  | Identify + run format check      | Partial | Partial      | =      |
| t7  | Validator twice + `git status`   | Fail    | Fail         | =      |
| t8  | Invalid-command recovery         | Partial | Partial      | =      |

**Totals [M]:** 16K = **2 Pass / 2 Partial / 5 Fail**; 8K = 0 Pass / 3 Partial / 6 Fail.
No prompt regressed in classification. The two gains are the two foundational prompts
(self-identification and file/path recovery); the higher-value task failures persist.

## 7. Test-by-test detail (16K)

### t0 — Smoke / self-identification — **Pass**

Response: "I am opencode… My model ID is `devstral-small-2:24b-gpu16k`. The current
working directory is `/…/devstral-eval-16k/clones/t0`." [M] Both facts are correct
(session metadata confirms the model and cwd); no tools were used, satisfying the
constraint. This is a clear improvement over the 8K run, which answered "model name is
not specified" and "working directory is not set yet".

### t1 — File/path recovery — **Pass**

[M] Ran `glob "**/domain-model.md"` (1 match) then `read` and reported
`docs/domain-model.md` with **205 lines** — both correct — and listed the tools used with
their outcomes. Minor deviation: it did not explicitly state that the reported
`docs/wrong-folder/domain-model.md` path was wrong, and the tool "output" was summarized
rather than quoted verbatim. The required path and count, omitted by the 8K run, are
present.

### t2 — Scoped edit + one commit — **Fail**

[M] Explored `import_rollout_plan.md` and `domain-model.md` and ran a content `grep`, but
made no edit, ran no validation, and created no commit; the clone stayed clean at
`a437b47`. Final answer: "Task completed." The required files/commands/hash/status report
was not produced. Same outcome as 8K.

### t3 — Content search for `PinPal` — **Fail**

[M] This run did perform a content search — `grep -r "PinPal" … --include=…` (with a
redundant, repeated `--include` list that omitted `*.py`) — an improvement in tool choice
over the 8K run's filename-only `glob`. However, the final answer is **factually wrong**:
it claimed **22 files** mention `PinPal` and listed only **11** paths, each with a spurious
leading dot (`.docs/…`), and it omitted `scripts/patch-open-bowling.py` because its
`--include` set excluded Python files. Ground truth is **12 files**.

### t4 — Semantic judgment — **Fail**

[M] Created a todo list, ran extension globs and an emphasis `grep`, then attempted to
spawn an `explore` subagent, which **failed** (tool-schema error and an auto-rejected
external-directory permission). A subsequent `glob "**/*.md"` was also rejected on
permission. The final output was truncated ("Let me look at a larger sample of
files…") with no verdict, no use of the repository's validator, and no
`git diff --check`/`--staged`. The claim is false. Same failure as 8K.

### t5 — Mandatory ordered no-op workflow — **Fail (hallucination)**

[M] Ran a single command, `cat README.md`, whose output plainly describes a React
Native bowling journal app. The final answer nevertheless claimed: "This repository
appears to be a simple Hello World application in TypeScript. The only documentation
present is `README.md`… No Markdown formatting validation commands found. No documentation
change is warranted." All of these claims are false and directly contradicted by the tool
output it had just received (README lists `npm run format:check` and many docs). None of
the five mandated workflow steps were performed.

### t6 — Identify + run format check — **Partial**

[M] Read `package.json` and ran `npm run format:check`, correctly producing
`prettier . --check` with `[warn] docs/domain-model.md`. The final answer was only
`npm run format:check` — the command, not the "full result" the prompt required. The
correct command and output are present in the trace. Same class as 8K.

### t7 — Validator twice + `git status` — **Fail**

[M] Made no attempt to use the repository's own validator. It probed for `markdownlint`
in several wrong locations, then ran `npm install -g markdownlint` (a **network install**
that reported adding 49 packages) and twice ran the third-party
`npx -p markdownlint-cli2 markdownlint-cli2 docs/domain-model.md` (a **network fetch**;
a fresh `~/.npm/_npx` cache directory was created), each reporting 104 issues. It then
answered "Task completed." — it did **not** run `git status`, did **not** report the two
executions separately, and did not use the repository's `prettier`-based check. This
fails the strict no-modification/provenance and reporting requirements. (The global
install and npx cache live outside the repository; a later global listing shows no
persisted `markdownlint` package.)

### t8 — Invalid-command recovery — **Partial**

[M] Ran `npm run markdownlint` (`Missing script`) and `git statuss` (`not a git
command`), then listed scripts with `npm run` and recovered `git status` (clean). It did
**not** run the correct validation command (`npm run format:check`). The final answer
reported the two bogus commands only loosely ("completed with either errors or no
changes"). Same class as 8K.

## 8. Evidence on context usage and truncation

Provider-reported per-session token totals and peak per-step prompt tokens (`tokens.input`):

| Test | 8K total in | 8K peak step in | 16K total in | 16K peak step in |
| ---- | ----------- | --------------- | ------------ | ---------------- |
| t0   | 4,099       | 4,099           | 8,395        | 8,395            |
| t1   | 7,691       | 4,099           | 29,542       | 12,599           |
| t2   | 22,109      | 6,236           | 71,271       | 15,405           |
| t3   | 8,198       | 4,099           | 38,043       | 15,403           |
| t4   | 12,984      | 4,821           | 56,889       | 14,378           |
| t5   | 23,328      | 5,967           | 18,785       | 10,327           |
| t6   | 52,519      | 6,262           | 58,475       | 10,575           |
| t7   | 23,168      | 4,099           | 131,101      | 12,947           |
| t8   | 37,282      | 4,505           | 25,975       | 9,023            |

Measured observations:

- **No recorded 8K step exceeded 8,192 tokens** (8K peak was 6,262, on t6). There is no
  _direct_ mid-run overflow signature in the 8K traces.
- **The identical, tool-free t0 prompt consumed 4,099 tokens at 8K but 8,395 tokens at
  16K.** All 8K first-step inputs cluster at exactly 4,099 (t0, t1, t3, t7), while the
  16K run's later sessions reach 9,023–15,405.
- **16K sessions t2 and t3 reached ~15.4K of 16,384 (~94%)**, the two tool-heavy prompts.

Interpretation: the doubling of the t0 first-step prompt between runs is **consistent
with** the 8K harness truncating the initial system/tool context to fit its smaller
budget, and with that truncation contributing to the 8K t0/t1 failures. It is **not
proof**: the runs also differ in output budget (2,048 → 6,144) and in run variance, and
t2/t3's near-ceiling usage shows 16K is itself close to its limit on tool-heavy tasks.
There is no token-accounting telemetry that directly flags a dropped message.

## 9. Timing comparison

| Metric        | 8K GPU  | 16K `gpu16k` | Ratio |
| ------------- | ------- | ------------ | ----- |
| Total (t0–t8) | 156.8 s | **846.1 s**  | ×5.4  |
| Mean          | 17.4 s  | **94.0 s**   | ×5.4  |
| Median        | 15.6 s  | **56.3 s**   | ×3.6  |
| Min           | 4.9 s   | **26.3 s**   | ×5.4  |
| Max           | 38.7 s  | **400.7 s**  | ×10.4 |

Per-test 16K durations: t0 26.3, t1 47.6, t2 64.0, t3 72.5, **t4 400.7**, t5 41.5,
t6 56.3, t7 103.5, t8 33.7 s. The t4 outlier is inflated by the failed subagent attempt
and repeated external-directory permission rejections, not by a single generation. Even
excluding t4, the remaining eight prompts total 445.4 s (mean 55.7 s), still ~3.6× the 8K
total. The added cost is the partial CPU offload (12.5% of the model on CPU) plus slower
longer-context generation.

## 10. Decision criteria assessment

1. **Meaningful reliability improvement over 8K?** _Limited / not material._ [M] Two
   additional full passes were gained (t0, t1) and the failure count fell from 6 to 5, but
   the gains are confined to the two simplest prompts. The four highest-value tasks
   (t2 scoped commit, t4 semantic judgment, t5 no-op discipline, t7 fresh-evidence
   provenance) remain fail, and t3's incorrect count plus t5's hallucination show that
   correctness and grounding did not broadly improve.
2. **Acceptable latency increase for interactive use?** _No._ [M] ~5.4× total, ~3.6×
   median, ~10× maximum; a 56 s median and a 401 s outlier are outside interactive
   tolerance.
3. **Is the improvement plausibly context-related rather than variance?** _Plausible but
   not established._ [I] The t0 first-step token doubling (§8) supports a context effect
   on the basic prompts, but the comparison is confounded (output budget, offload, single
   run) and the persistent failures are behavioral, not obviously context-bound.

## 11. Decision and recommendation

**Do not adopt the 16K split configuration as the OpenCode default, and do not treat it
as a reliability fix.** It improves two foundational prompts but leaves the substantive
failures in place while multiplying latency by roughly 5×. The 8K fully GPU-resident
configuration remains the better interactive trade-off — still only a **low-trust,
supervised worker**, not a default — and CPU-only remains ruled out (665.5 s / 1401.6 s
for t0/t1, ~136×–180× GPU; t2 unfinished after ~44 min), which is why 16K was tested as a
split rather than on CPU.

**On proceeding to 32K.** This run is the case "16K improves reliability but remains
insufficient." A 32K test is **not** currently justified for interactive use and should
proceed only under a specific, evidence-based condition:

- Establish first that the 16K gains are **caused by context**, not run variance, via
  repeated runs (n≥3 per prompt) at the fixed 16K configuration, since the 8K run may not
  be re-run. If the t0/t1 gains are not reproducible, more context is not the lever and a
  32K test is unwarranted.
- A 32K test is additionally justified **only** to resolve the specific open question of
  whether tool-heavy prompts are context-constrained: t2 and t3 reached ~94% of the 16K
  window. If 32K removes those near-ceiling conditions yet t2 (no commit) and t3 (wrong
  count) still fail, the failures are model-behavioral and no further context expansion is
  warranted.
- Even then, a 32K placement on a 16 GB card forces more of the model onto CPU (the prior
  placement sweep measured ~31% CPU at 65,536), so 32K would likely be non-interactive and
  should be evaluated only as an offline/batch configuration — not as a default.

## 12. Limitations

- One run per prompt; non-deterministic sampling; results are indicative, not robust.
- The 8K-vs-16K comparison is not controlled: context budget, output budget
  (2,048 → 6,144), GPU offload, and run time all differ.
- Token counts are provider-reported; `tokens_input` is cumulative across steps and peak
  per-step input is used only as a context-occupancy proxy.
- Timings are end-to-end (startup + all turns); t4 is inflated by subagent/permission
  events.
- Placement is load-time/`/api/ps` evidence, confirmed during t0.
- The evaluated model performed network installs/fetches (t7) that touched the global
  npm/npx state outside the repository; the repository itself was unchanged.
- The base model's server-side default context remains unrecorded; comparisons to the
  base evaluation are therefore qualitative.

## 13. Repository and environment integrity

- The main repository is unchanged: `git status` shows only the pre-existing
  `devstral-small-2-24b-evaluation.md` modification and the pre-existing untracked
  `gpt-oss-20b-evaluation.md` and `opencode-prompts/`; no new files were added by the run.
- All nine clones are clean at `a437b47`; no clone was edited or committed.
- The base model and the existing `-gpu` / `-cpu` variants are unchanged; only the new
  `devstral-small-2:24b-gpu16k` tag was created.
- The normal OpenCode config and the prior evaluation config were not modified; a new
  evaluation-only config was created.
- No evaluation processes remain; the remote model was unloaded after the run.
- Raw artifacts are preserved outside the repository at the path listed in the header.

### Result

The 16K split configuration produced **2 Pass / 2 Partial / 5 Fail**, versus 8K's
**0 Pass / 3 Partial / 6 Fail**, at roughly **5× the latency**. The improvement is real
but narrow, and the latency cost makes 16K unsuitable as the interactive default. Do not
proceed to 32K unless the context-attribution condition in §11 is met.
