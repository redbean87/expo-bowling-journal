# Devstral Small 2 24B — GPU vs CPU OpenCode Findings

**Date:** 2026-09-16
**Tested models:** `devstral-small-2:24b` (base), `devstral-small-2:24b-gpu`, `devstral-small-2:24b-cpu`
**Inference host:** Windows machine running Ollama `0.33.2` (AMD Radeon RX 9070 XT, 16 GB)
**Orchestrator:** M1 Mac running OpenCode `1.18.30` (the Windows host performed all inference)
**Remote endpoint:** `http://192.168.68.52:11434` (OpenCode used the provider `/v1` path)
**Historical baseline:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
**Prompts under test:** `docs/development/model-reliability/opencode-prompts/` (`t0`–`t8`)
**Isolation:** disposable `git clone --local` clones at the baseline, one per prompt per variant; the main repository was verified unchanged.

This document records a follow-up evaluation comparing the GPU-backed and CPU-only
derived variants of Devstral Small 2 24B through OpenCode. It complements, and does not
replace, `devstral-small-2-24b-evaluation.md` (base model) and
`devstral-small-2-24b-continue-evaluation.md` (Continue CLI).

## 1. Tested variants and configurations

| Variant | Ollama tag | `num_ctx` | `num_gpu` | Placement intent |
| ------- | ---------- | --------- | --------- | ---------------- |
| Base | `devstral-small-2:24b` | (model default) | (model default) | Reference model; not re-run here |
| GPU | `devstral-small-2:24b-gpu` | 8192 | 999 | All layers on GPU |
| CPU | `devstral-small-2:24b-cpu` | 81920 | 0 | CPU-only |

The base model was left unchanged. Both variants were created server-side on the Windows
Ollama host from the base model, with the parameters embedded in each variant's Modelfile
(verified through the remote `/api/show`), not passed per request.

`81920` is the **highest successfully validated practical CPU context tested**, not a
proven hard maximum.

## 2. Runtime placement evidence (measured)

Observed live through the remote Windows `/api/ps` while the models were loaded:

| Variant | Model | `size` | `size_vram` | `context_length` | Observed placement |
| ------- | ----- | ------ | ----------- | ---------------- | ------------------ |
| GPU | `devstral-small-2:24b-gpu` | 14,965,800,959 B (~14.97 GB) | 14,965,800,959 B | 8192 | Fully in VRAM (`size_vram == size`) |
| CPU | `devstral-small-2:24b-cpu` | 22,855,853,013 B (~22.86 GB) | 0 | 81920 | CPU-only (`size_vram == 0`) |

Both match the requested server-side parameters. No CPU/GPU split was observed for the
GPU variant (`size_vram` equals `size`).

## 3. Evaluation scope

**GPU variant (`devstral-small-2:24b-gpu`)** — all nine prompts completed:

* `t0` through `t8` ran to completion with return code `0`.
* No timeouts and no retries.
* Every run used an isolated clone; the working tree of each clone is recorded, and the
  main repository was not modified.

**CPU variant (`devstral-small-2:24b-cpu`)** — partial, intentionally stopped:

* `t0` and `t1` completed with return code `0`.
* `t2` was still running after approximately 44 minutes and had made observable progress
  (multiple model turns and tool calls); it was **not** confirmed to be hung.
* The CPU run was stopped at that point because completing the full nine-prompt suite was
  impractical at these settings.
* `t3` through `t8` were **not** executed on the CPU variant.

## 4. Measured timings

Timings are end-to-end wall-clock durations measured from the M1 orchestrator; they include
OpenCode startup and all model turns/tool calls for each prompt.

### GPU variant (all nine prompts)

| Prompt | Duration |
| ------ | -------- |
| t0 | 4.9 s |
| t1 | 7.8 s |
| t2 | 15.6 s |
| t3 | 8.0 s |
| t4 | 14.2 s |
| t5 | 16.3 s |
| t6 | 38.7 s |
| t7 | 21.2 s |
| t8 | 30.1 s |

* Total (t0–t8): **156.8 s** (~2.6 minutes)
* Mean: 17.4 s
* Median: 15.6 s
* Minimum: 4.9 s
* Maximum: 38.7 s

### CPU variant (completed prompts only)

| Prompt | Duration |
| ------ | -------- |
| t0 | 665.5 s (~11.1 min) |
| t1 | 1401.6 s (~23.4 min) |
| t2 | stopped after ~44 min (no completed result) |

* Total for the completed CPU prompts (t0 + t1): **2067.1 s** (~34.5 minutes)
* Mean for the completed CPU prompts: ~1033.6 s

## 5. Practical performance comparison

For the two prompts completed on both variants, comparing end-to-end duration
(CPU ÷ GPU):

| Prompt | GPU | CPU | Absolute difference | CPU ÷ GPU ratio |
| ------ | --- | --- | ------------------- | --------------- |
| t0 | 4.9 s | 665.5 s | +660.6 s | ~136× |
| t1 | 7.8 s | 1401.6 s | +1393.8 s | ~180× |

No ratio is reported for `t2` or the remaining prompts because the CPU variant did not
complete them.

The CPU variant required roughly two orders of magnitude more wall-clock time per prompt
than the GPU variant for the prompts that both completed, and a single multi-step prompt
(`t2`) had not finished after ~44 minutes.

## 6. Observed behavioral outcomes (measured) and supervisor assessment

The table below separates what was observed in the run traces from the supervisor's
assessment of whether each prompt's deliverable was satisfied.

| Prompt | Observed behavior (measured) | Assessment (interpretation) |
| ------ | ---------------------------- | --------------------------- |
| t0 | Replied that its model name was "not specified" and the working directory "not set yet". | Not satisfied — did not identify the exact model or cwd. **Weak/terse.** |
| t1 | Located `docs/domain-model.md` via `glob`, but misquoted the incorrect path and omitted the required line count. | Not fully satisfied — path found, required evidence omitted. |
| t2 | Explored files (`glob`/`read`); no edit and no commit were created. | Not satisfied — the task required exactly one scoped commit. |
| t3 | Ran a broad `glob` only; no content search for `PinPal`, no count and no path list. | Not satisfied. |
| t4 | Ran file-type globs; gave no true/false conclusion and used no Markdown validator. | Not satisfied. |
| t5 | Ran `git status` and read `AGENTS.md`; never ran the mandated `format:check`. | Not satisfied — the mandated ordered workflow was not followed. |
| t6 | Ran `npm run format:check` and captured the Prettier warning on `docs/domain-model.md`; final reply was terse. | Partially satisfied — correct command and output present in the trace. |
| t7 | Probe attempts (`mdl`, `remark`, `markdownlint`) found nothing installed; the validator was not run twice and `git status` was not reported. | Not satisfied. |
| t8 | Reproduced and reported both invalid commands faithfully, then recovered `git status`; ran `typecheck`/`lint` instead of the correct validation command. | Partially satisfied — invalid-command reporting correct; correct validator not run. |

Separately, on the prompts the CPU variant completed, its final answers were more complete
than the corresponding GPU answers: CPU `t0` named the served model
(`ollama/devstral-small-2:24b-cpu`), and CPU `t1` reported the correct path **and** the
205-line count with a list of tools used. This is a single-run observation and is not
attributed to CPU vs GPU as a cause; see the limitations.

## 7. Interpretation (not measured)

Given the measurements above and the partial CPU coverage:

* GPU-backed inference is suitable for continued interactive evaluation. All nine prompts
  completed in a total of ~2.6 minutes, which is compatible with interactive OpenCode use,
  and the model loaded fully in VRAM at `num_ctx 8192`.
* CPU-only inference is technically functional but impractical for interactive OpenCode use
  at these settings. It requires roughly 136×–180× the GPU wall-clock time on the prompts
  both variants completed, and one multi-step prompt was still running after ~44 minutes.
* The GPU `t0` self-identification failure is a model-behavior weakness observed under this
  harness; it is consistent with the weak self-identification already seen for this model
  in the prior evaluations and is not a performance effect.

These are interpretations of the measured results, not independently certified facts.

## 8. Limitations

* **CPU coverage is partial.** Only `t0` and `t1` completed on the CPU variant; `t3`–`t8`
  were not run and `t2` did not finish. CPU pass/fail statistics cannot be stated for the
  full suite.
* **Single run per prompt.** One run per variant per prompt; results are indicative, not
  statistically robust, and sampling is non-deterministic.
* **Timings are end-to-end.** Durations include OpenCode startup and all model/tool turns;
  they are not isolated per-token throughput measurements.
* **Context configuration.** The GPU variant ran at `num_ctx 8192`, which is small relative
  to OpenCode's own prompt and tool-schema overhead. This may contribute to terse or
  incomplete GPU answers and should be considered when interpreting the GPU outcomes.
* **Placement is load-time evidence.** Placement was read from `/api/ps` at load; requested
  server-side parameters were confirmed separately through `/api/show`.
* **`t2` on CPU is not a failure.** It had made progress and was stopped deliberately; it is
  recorded as incomplete, not hung or failed.

## 9. Conclusion

Within the tested configurations, GPU-backed inference of Devstral Small 2 24B through
OpenCode completed the full `t0`–`t8` suite quickly and is suitable for continued
interactive evaluation. CPU-only inference at `num_ctx 81920` and `num_gpu 0` is
technically functional — both completed prompts returned success and correct placement was
confirmed — but its runtimes make the full interactive suite impractical at these settings.
The CPU findings are limited to the two completed prompts; `81920` is the highest
successfully validated practical context tested, not a proven maximum.
