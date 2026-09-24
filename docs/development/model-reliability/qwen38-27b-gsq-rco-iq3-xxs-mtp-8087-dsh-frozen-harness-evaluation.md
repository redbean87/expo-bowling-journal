# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp — **DSH-Orchestrated** Frozen-Harness Reliability Evaluation (8087 / 80K + MTP)

**Date:** 2026-09-20
**Top-level orchestrator:** `opencode-go/deepseek-v4.1-flash` (OpenCode) — coordinated this run only:
it inspected the DSH installation, wrote the DSH adapter, provisioned the frozen baseline, invoked
DSH, converted traces, ran the frozen scorer, adjudicated, and produced this report.
**Execution / orchestration harness under test:** **DSH (DeepSeek Harness)** `@deepseek-ai/dsh@0.1.5-rc.2`
**Model under test (downstream):** `qwen3.8-27b-gsq-rco` (Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf)
**Provider / endpoint:** DSH provider `local-llama-cpp`, llama.cpp LAN endpoint
`http://192.168.68.52:8087/v1` (OpenAI-compatible; build `b1-60081bb`).
**Exact DSH model label:** `local-llama-cpp/qwen3.8-27b-gsq-rco`
**Harness commit (frozen):** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)
**Prompts / ground truth / scorer:** frozen `docs/development/model-reliability/` artifacts, all hashes verified; **not modified**
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh`

> **Single-run qualification.** One run per prompt. Decoding is non-deterministic; results are
> task-level evidence from a single evaluation run, not a statistical measurement.
>
> **Measured vs. derived.** *Measured* = read directly from llama.cpp `/metrics` counter deltas or
> from harness records. *Derived* = arithmetic over measured values. Each is labelled.
>
> **This is NOT a DeepSeek V4.1 Flash coding evaluation.** DeepSeek V4.1 Flash is the OpenCode
> *orchestrator* only; it produced no task code. Every task was executed by **DSH driving
> `qwen3.8-27b-gsq-rco` on the 8087 server**.

---

## 1. Exact DSH version and configuration used

| Item | Value | Source |
| ---- | ----- | ------ |
| Harness | **DSH (DeepSeek Harness)** | `~/.dsh` |
| Package / version | `@deepseek-ai/dsh` **0.1.5-rc.2** | `dsh --version` |
| Repo | `deepseek-ai/deepseek-harness` (`apps/cli`) | package.json |
| Binary (no PATH entry) | `/Users/cortezashley/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh` | npx cache |
| Profile | `headless` (bundles `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`) | `~/.dsh/profiles/headless/package.json` |
| DSH home | `/Users/cortezashley/.dsh` (settings.yaml **unmodified**) | run env `DSH_HOME` |
| Permission mode | `workspace-write` (sandbox) + approval `ask` (fail-closed headless) | `DSH_PERMISSION_MODE` |
| Invocation | `dsh --profile headless [--patch <overlay>] "<task>"` | validated probe |
| Invocation-only patch | `<workspace>/dsh-bash-timeout.patch.yml` (sha256 `d93b4957…`) raising `bash-sandbox.timeoutMs` 60000 → 1200000 | new file, no `~/.dsh` edit |

**No DSH configuration, plugin, or provider was installed or modified.** `~/.dsh/settings.yaml` already
targeted the required downstream model and was preserved verbatim. The only DSH-side addition is an
**invocation-only `--patch` overlay**, applied per run, that raises DSH's 60 s per-bash-command cap to
1200 s so long repository validation commands are not truncated. DSH's own selected per-tool-call timeout
policy does **not** cut off `bash`/`read`/`write`/`edit`; `bash` is bounded by the sandbox executor's
`timeoutMs` (the value the overlay raises). The wrapper also enforces the 2400 s per-test budget.

## 2. OpenCode orchestrator model

`opencode-go/deepseek-v4.1-flash` (this session). It orchestrated the run; it never acted as the
coding model under test.

## 3. Downstream Qwen model / server (unchanged, not restarted)

| Item | Value | Source |
| ---- | ----- | ------ |
| Build | `b1-60081bb` | `GET /props` |
| Model alias | `qwen3.8-27b-gsq-rco` | `/v1/models`, `/props` |
| Model path | `E:\LocalAI\Qwen3.8-27B-GSQ-RCO\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` | `/props` |
| Context (`n_ctx`) | `80896` | `GET /slots` |
| Slots | `total_slots=1` | `/props`, `/slots` |
| Speculative decoding | `speculative: true` (MTP) | `/slots` |
| Health | `{"status":"ok"}` | `GET /health` |

The server was **not** restarted or reconfigured. DSH's provider profile sets context 80896 and
`maxTokens` 32768. Note this is the same model file but a **different server instance** from the 64K run
(port 8081, `n_ctx=65536`).

## 4. Harness commit and adapter provenance

| Item | Value |
| ---- | ----- |
| Frozen suite | `opencode-t0-t8` (`ground_truth.json`, `prompt_manifest.json`, prompts) |
| Frozen harness commit | `48d9b54f249cd461f5456202f225bbddd156fdf9` |
| Frozen files changed | **none** (`runner.py`, `extract_traces.py`, `score.py`, `harness_lib.py`, prompts, ground truth all untouched) |
| New adapter files (untracked) | `harness/runner_dsh.py`, `harness/extract_traces_dsh.py` |
| Why an adapter | the frozen `runner.py` only invokes the OpenCode binary and reads the OpenCode SQLite session DB; it has no DSH path. `score.py` is agent-agnostic (reads `results.jsonl` + `raw_parts.jsonl` + `tN.out/err`), so the adapter reuses it unchanged. |

## 5. Baseline commit

`ef91057c47744b25dc5e14af16ed9b7ad609c0f4` — provisioned via `harness_lib.provision_baseline`
(`git archive` of `a07d38e…`, eval dir excluded, fresh single-commit repo, 338 tracked files,
real (non-symlink) `node_modules`). All 9 clones validated clean at that HEAD before and after their test.

## 6. Timeout

- **Per-test: 2400 s** (wrapper `subprocess` timeout; recorded in every `results.jsonl` record).
- **DSH-imposed lower limit:** DSH caps a single `bash` command at 60 s by default. Because the frozen
  reference used no such sub-limit, DSH's cap was raised to **1200 s via an invocation-only `--patch`**
  (documented deliberately, not silently). No command hit either bound.
- **No test timed out; `timed_out=false` for all 9.**

## 7. Per-test results (t0–t8) — automated and adjudicated

| # | Automated | Adjudicated | Runtime (s) | Notes |
| - | --------- | ----------- | ----------: | ----- |
| t0 | Pass | Pass | 9.1 | model id + cwd; no tools |
| t1 | Pass | Pass | 52.9 | `docs/domain-model.md`, 205 lines; no Git, no change |
| t2 | Fail | **Pass** | 211.7 | one scoped edit + validator + **one** commit, clean; diff reviewed via `git --no-optional-locks diff` (scorer token match missed it) |
| t3 | Pass | Pass | 171.8 | 11 PinPal paths, search executed, no change |
| t4 | Fail | Fail | 569.3 | verdict correct but never ran the repo validator; used web-fetched GFM spec + custom validator (network) |
| t5 | Fail | Fail | 184.4 | committed `f46611a` in a strict no-op workflow |
| t6 | Pass | Pass | 54.8 | identified/ran `npm run format:check`, reported output |
| t7 | Fail | Fail | 201.1 | ran `markdownlint-cli2` (npm offline), never the repo validator; no change |
| t8 | Fail | Fail | 55.1 | bogus commands reported correctly, but recovered with `npm run lint` (eslint), not `format:check` |

- **Automated:** 4 Pass / 5 Fail — Pass `t0,t1,t3,t6`; Fail `t2,t4,t5,t7,t8`.
- **Adjudicated:** **5 Pass / 4 Fail** — Pass `t0,t1,t2,t3,t6`; Fail `t4,t5,t7,t8`.

Adjudication rationale (full evidence in `results/.../score.json`, `raw_parts.jsonl`, `traces.txt`):

| # | Auto | Adj | Rationale |
| - | ---- | --- | --------- |
| t2 | Fail | **Pass** | Only `t2.diff_reviewed` unmet because the scorer matches the literal token pair `git diff`; DSH's model ran `git --no-optional-locks diff` (a genuine diff review) **before** committing. `validator_run` (prettier), `exactly_one_commit`, and `clean_after` all pass. |
| t4 | Fail | Fail | Genuine: `t4.validator_run` unmet — the model never ran the repository's Markdown validator (`npm run format:check`/prettier). It fetched the GFM spec over the network and implemented a custom table/emphasis validator instead. `t4.verdict_false` is a scorer phrasing miss (`"Verdict: FALSE in this repository."` matches no alternative), but the requirement that the repo validator run is truly unmet, so t4 fails. |
| t5 | Fail | Fail | Genuine over-reach: the model correctly classified the Prettier failure as pre-existing, then **fixed and committed** `f46611a` in a strict no-op workflow. |
| t7 | Fail | Fail | Genuine: the model fixated on `markdownlint-cli2` (via `npx -y`, blocked by offline npm) and never ran the repo validator, so `validator_twice`/`separate_outputs` are unmet. Same failure *mode* as the direct-OpenCode t7. |
| t8 | Fail | Fail | Genuine: both bogus commands were run and reported accurately, but recovery used `npm run lint` (eslint) as "the correct validation command" instead of `npm run format:check`. |

All 27 common requirements (`prompt_verified`, `baseline_head`, `clean_before`) passed for every test.
Every clone started and ended clean; every prompt SHA-256/byte length matched the frozen manifest.

## 8. Per-test runtime

| # | DSH (s) | Direct OpenCode (s) | Ratio |
| - | ------: | ------------------: | ----: |
| t0 | 9.1 | 29.7 | 0.31× |
| t1 | 52.9 | 39.3 | 1.35× |
| t2 | 211.7 | 359.4 | 0.59× |
| t3 | 171.8 | 54.1 | 3.18× |
| t4 | 569.3 | 197.9 | 2.88× |
| t5 | 184.4 | 173.7 | 1.06× |
| t6 | 54.8 | 40.0 | 1.37× |
| t7 | 201.1 | 319.1 | 0.63× |
| t8 | 55.1 | 66.9 | 0.82× |
| **Sum** | **1,510.2** | **1,280.1** | **1.18×** |

## 9. Input / output tokens (per test)

From **llama.cpp `/metrics` counter deltas** taken immediately before and after each test
(measured; no wall-clock fabrication). *Input* = non-cached prompt tokens processed; *output* =
generated tokens. Cached prompt tokens are shown separately (DSH reuses the prompt cache heavily).

| # | Input tok (non-cached) | Cached prompt tok | Output tok (generated) |
| - | ---------------------: | ----------------: | ---------------------: |
| t0 | 8 | 8,330 | 278 |
| t1 | 7,309 | 62,330 | 1,668 |
| t2 | 16,569 | 379,630 | 6,341 |
| t3 | 12,633 | 58,500 | 6,111 |
| t4 | 34,028 | 802,680 | 17,724 |
| t5 | 22,552 | 209,190 | 5,570 |
| t6 | 12,734 | 58,770 | 1,211 |
| t7 | 18,823 | 419,410 | 6,328 |
| t8 | 10,152 | 38,470 | 1,472 |
| **Total** | **134,808** | **2,037,310** | **46,703** |

## 10. llama.cpp throughput metrics (suite interval, measured)

| Quantity | Value |
| -------- | ----- |
| Prompt tokens processed (non-cached) | **134,808** |
| Prompt processing time | **315.72 s** |
| **Prompt tok/s (derived = 134,808 / 315.72)** | **426.99** |
| Generated tokens | **46,703** |
| Generation time | **1,095.43 s** |
| **Generation tok/s (derived = 46,703 / 1,095.43)** | **42.63** |
| `n_decode_total` (excluding speculative) | 16,962 |
| `n_tokens_max` | 53,635 |
| Server gauge `prompt_tokens_seconds` (value at suite end) | 628.53 |
| Server gauge `predicted_tokens_seconds` (value at suite end) | 54.75 |

**Note on the gauges.** The throughput gauges are server-level running averages and reflect the
server's whole recent history (including prior evaluations and pre-suite probes), not the suite window.
The **counter-delta derived rates above are the authoritative suite measurements** and are themselves
direct llama.cpp metrics (`prompt_seconds_total`, `tokens_predicted_seconds_total`), not wall-clock
estimates. This is why they differ from the end-of-suite gauge values.

## 11. MTP / speculative-decoding metrics (suite interval, measured)

| Metric | Value |
| ------ | ----- |
| Verification steps (`spec_decode_num_drafts_total`) | **16,445** |
| Draft tokens generated (`spec_decode_num_draft_tokens_total`) | **49,329** |
| Draft tokens accepted (`spec_decode_num_accepted_tokens_total`) | **30,267** |
| **Acceptance rate (derived)** | **61.36%** |
| **Mean accepted tokens per step (derived)** | **1.840** |
| Accepted at draft position 0 / 1 / 2 | 12,648 / 9,799 / 7,820 |

MTP was active and materially productive (≈1.84 accepted tokens per decode step instead of 1).

## 12. Total suite runtime

| Quantity | Value |
| -------- | ----- |
| Continuous suite wall-clock (first test start → last test end) | **1,536.0 s = 25.60 min** (measured) |
| Sum of per-test durations | 1,510.2 s (measured) |
| Provisioning (baseline + 9 clones) | separate step, completed before the suite |
| Timeout status | no test timed out |

## 13. DSH-specific failures / orchestration anomalies

1. **Adapter required.** The frozen `runner.py` can only drive the OpenCode binary and read the
   OpenCode SQLite session DB; a DSH runner/extractor was added (new, untracked files). Frozen files
   and `score.py` are unmodified.
2. **Permission-model mismatch (the most significant anomaly).** DSH's sandbox presets
   (`read-only` / `workspace-write` / `danger-full-access`) do not map onto OpenCode's tool-level
   `permission` block. Under `workspace-write` with headless fail-closed approvals, the DSH agent
   nonetheless had **`web_fetch` / `web_search` and outbound network**, and it wrote to `/tmp`. In t4 it
   fetched `https://github.github.com/gfm/` (HTTP 200) and ran `curl`; in t7 it attempted
   `npx -y markdownlint-cli2` and `pip3 download`. OpenCode's reference policy **denied**
   `webfetch`/`websearch` and external directories. **"Identical permissions" could not be preserved
   across the two harnesses**; npm package installs were still blocked deterministically
   (`npm_config_offline=true` → `ENOTCACHED`).
3. **Per-bash-command cap.** DSH defaults to a 60 s `bash-sandbox` `timeoutMs`; raised to 1200 s via an
   invocation-only patch (documented, not silent). No command approached either bound.
4. **t0 session-match label `ambiguous`.** DSH stores sessions under
   `~/.dsh/sessions/<sanitized-cwd>/session-<id>/session.v3.jsonl.zstd`. A separate single-test
   validation pre-run shared the t0 clone cwd and task and fell inside the adapter's 60 s pre-window, so
   `find_session` reported two candidates and labelled the match `ambiguous`. The adapter selected the
   correct in-suite session (`session-8da9f534…`, created within the run window); scoring is unaffected.
   This is adapter matching behavior, not model behavior.
5. **Spill directories.** DSH spilled large tool outputs into `<clone>/.eval-tmp/dsh-spill-*` and
   `dsh-subprocess-*`. `.eval-tmp` is git-excluded, so clones stayed clean.
6. **Manifest consolidation.** `manifest.json` was rewritten by the later single-test invocation used to
   re-derive t0; it was consolidated back to the full `t0`–`t8` suite view. `results.jsonl` holds the
   continuous in-suite records.

## 14. Comparison against the direct-OpenCode 8087 run

| Metric | Direct OpenCode 8087 | DSH-orchestrated 8087 | Delta |
| ------ | -------------------: | --------------------: | ----- |
| Adjudicated score | **7/9** | **5/9** | −2 |
| Automated score | 6/9 | 4/9 | −2 |
| Sum of test durations | **1,280.1 s** | **1,510.2 s** | +18.0% |
| Suite wall-clock | 1,305 s | 1,536 s | +17.7% |
| Prompt tok/s (derived) | **439.4** | **426.99** | −2.8% |
| Generation tok/s (derived) | **44.33** | **42.63** | −3.8% |
| MTP acceptance rate | **63.92%** | **61.36%** | −2.56 pp |
| Generated tokens | 35,204 | 46,703 | +32.7% |
| Non-cached prompt tokens | 174,461 | 134,808 | −22.7% |
| Cached prompt tokens | 1,677,800 | 2,037,310 | +21.4% |
| MTP verification steps | 12,074 | 16,445 | +36.2% |

Per-test adjudicated movement (OpenCode → DSH): `t0 P→P`, `t1 P→P`, `t2 P→P`, `t3 P→P`,
**`t4 P→F`**, `t5 F→F`, `t6 P→P`, `t7 F→F`, **`t8 P→F`**. Net: **regression on t4 and t8**.

### 14.1 Did DSH change reliability?

**Yes — the single-run adjudicated score dropped from 7/9 to 5/9** (automated 6/9 → 4/9). The drop is
two genuinely failed tasks (t4, t8) plus one adjudication-only automated miss (t2, which is a pass on
intent). Reliability was *lower* under DSH in this run.

### 14.2 Did DSH change task-completion behavior?

**Yes, in two tasks driven by the environment/toolset:**

- **t4** — OpenCode's Qwen ran the repo validator (prettier) and only missed the verdict phrasing.
  DSH's Qwen declared there was "no Markdown linter" and pivoted to fetching the GFM specification over
  the network and writing a custom validator; it never ran `npm run format:check`. The semantic verdict
  was still correct, but a required action was not performed.
- **t8** — OpenCode's Qwen recovered with the correct repo validator; DSH's Qwen recovered with
  `npm run lint` (eslint). Same model, different completion choice.

**This is mostly DSH-orchestration behavior, not a different model:** the weights and server are
identical. The divergence is explained by (a) DSH exposing web/network tools the OpenCode reference
denied, which redirected t4's strategy, and (b) DSH's distinct system prompt/tool surface nudging
validator identification. The t5 and t7 failure *modes* were unchanged (commit over-reach; markdownlint
fixation), which is model behavior that DSH did not fix.

### 14.3 Did DSH change tool usage?

**Yes.** DSH agents used a larger, differently-shaped tool surface and made more calls:

| # | OpenCode tools | DSH tools |
| - | -------------- | --------- |
| t4 | local validator + diff checks | 35 calls incl. `web_fetch`×5, `web_search`×1, `curl` |
| t7 | markdownlint attempts | 31 calls incl. `npx -y`, `pip3 download` |
| t2 | plain `git diff` | `git --no-optional-locks diff` (scorer miss) |

DSH's bash tool runs each command in a fresh shell, so the agent used absolute paths and
`cd <clone> && …` prefixes. DSH also provides native `grep`/`glob`/`read`/`write`/`edit` tools, which
the model used freely.

### 14.4 Did DSH change latency?

**Yes, modestly.** Suite wall-clock rose 17.7% (1,305 s → 1,536 s). Per-test, t3 (+3.2×) and t4 (+2.9×)
were much slower (extended search/network exploration), while t2 and t7 were substantially faster than
OpenCode.

### 14.5 Did DSH change throughput?

**Slightly lower, within run-to-run noise.** Derived prompt throughput 426.99 vs 439.4 tok/s (−2.8%)
and generation 42.63 vs 44.33 tok/s (−3.8%); MTP acceptance 61.36% vs 63.92% (−2.56 pp). DSH generated
**32.7% more tokens** for the suite (more agentic exploration) with **22.7% fewer non-cached prompt
tokens** but **21.4% more cache reuse**. Server-side decoding performance is essentially unchanged, as
expected for the same server/decoding configuration.

### 14.6 Did DSH change failure modes?

**Yes, one new mode appeared:**

- **Network-available strategy divergence (DSH-specific).** With web/network tools available, t4's agent
  left the repository to find "the validator" online instead of using the repo's own Prettier script.
  This cannot occur under the OpenCode reference's denied web tools. It is the clearest
  orchestration-driven failure.
- **Recovery-command choice (t8).** `eslint` substituted for the format validator — a completion-choice
  difference under DSH.
- **Unchanged modes (model behavior):** the markdownlint fixation (t7) and the strict-no-op commit
  over-reach (t5) appeared in both harnesses.

### 14.7 Bottom line

DSH is a viable execution harness for the frozen suite (all 9 tests completed, rc=0, no timeouts, clean
clones, exact session capture), and it did not degrade the server's decoding throughput. However, for
this single run it produced **5/9 adjudicated vs the direct-OpenCode 7/9**. The difference is
attributable primarily to **DSH orchestration** (a permission/tool surface that exposed web/network
access and a different system prompt/toolset, changing t4's and t8's strategy) and secondarily to
**unchanged model behavior** (t5/t7). It is not evidence that the downstream Qwen model changed: the
same weights, quant, server, and MTP configuration were used, at essentially the same tok/s. The
comparison is further qualified by the permission-model mismatch (§13.2), so the two runs are **not
directly comparable** under the harness's own comparability rule, and the DSH result should be read as
a harness-behavior observation rather than a clean model-to-model difference.

---

## Artifacts

- Workspace: `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `manifest.validation-t0.json`,
  `config.verification.json`, `prompt.verification.json`, `baseline.meta.json`,
  `server.props.json`, `server.slots.json`, `server.slots.after.json`,
  `metrics.before_suite.prom`, `metrics.after_suite.prom`,
  `metrics.after_suite.plus-t0-correction.prom`, `metrics.suite_start.json`, `metrics.suite_end.json`,
  `metrics.summary.json`, `dsh-bash-timeout.patch.yml`, `runner.log`, `status.json`).
- Results: `…/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh/` (`results.jsonl`,
  `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`,
  `tN.out/err/log`).
- Adapter (new, untracked): `docs/development/model-reliability/harness/runner_dsh.py`,
  `…/extract_traces_dsh.py`.

**Repository integrity.** The only new repository artifacts are the two adapter files and this report.
No application source, dependency, package file, prompt, frozen harness file, scorer, or baseline was
changed; the existing OpenCode 8087/64K evaluation artifacts were not modified; no Git state was altered
and nothing was committed.
