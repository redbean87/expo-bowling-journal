# Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp — **DSH Permission-Parity** Frozen-Harness Evaluation (8087 / 80K + MTP)

**Date:** 2026-09-20
**Top-level orchestrator:** `opencode-go/deepseek-v4.1-flash` (OpenCode) — coordinated this follow-up only
(it inspected the DSH surface, wrote the invocation-only parity overlay, provisioned the baseline,
invoked DSH, converted traces, ran the frozen scorer, adjudicated, and wrote this report).
**Execution / orchestration harness under test:** **DSH (DeepSeek Harness)** `@deepseek-ai/dsh@0.1.5-rc.2`
**Model under test (downstream):** `qwen3.8-27b-gsq-rco` (Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf)
**Provider / endpoint:** DSH provider `local-llama-cpp` → `http://192.168.68.52:8087/v1` (build `b1-60081bb`)
**Harness commit (frozen):** `48d9b54f249cd461f5456202f225bbddd156fdf9`
**Baseline HEAD:** `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (source ref `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`, 338 tracked files)
**Per-test timeout:** 2400 s
**Variant label:** `qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh-parity`
**Workspace:** `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh-parity`

**Purpose.** This is an **environment-control experiment**, not a model-optimization task. It repeats the
frozen `t0`–`t8` suite under DSH after removing the one capability difference that DSH can express and
OpenCode denied — the model-facing web tools — and asks whether the previously observed behavioral
failures were caused by the environment/tool surface or by the model. **The downstream model, server,
context, MTP settings, DSH profile, prompts, scorer, and baseline are unchanged.**

> **Single-run qualification.** One run per prompt; decoding is non-deterministic. Differences are
> task-level evidence from a single run, not a statistical measurement.

---

## 1. Provenance

| Item | Value |
| ---- | ----- |
| This run | 2026-09-20T04:43:38Z → 05:03:10Z |
| Previous DSH run | `…-8087-dsh` (report `qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh-frozen-harness-evaluation.md`) |
| Reference OpenCode run | `…-8087-80896` (report `qwen38-27b-gsq-rco-iq3-xxs-mtp-frozen-harness-evaluation-8087.md`) |
| Frozen harness/scorer commit | `48d9b54f249cd461f5456202f225bbddd156fdf9` |
| Baseline HEAD / tracked files | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` / 338 |
| Prompt verification | `ok: true`, every `t0`–`t8` SHA-256 + byte length matches the frozen manifest |
| Downstream server | `b1-60081bb`, `n_ctx=80896`, `total_slots=1`, `speculative:true`; **not restarted** (counter continuity confirmed in §5) |

## 2. Exact DSH configuration / invocation

| Item | Value |
| ---- | ----- |
| Harness | DSH `@deepseek-ai/dsh` **0.1.5-rc.2** (`/Users/cortezashley/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh`) |
| DSH home | `/Users/cortezashley/.dsh` — **`settings.yaml` unmodified** |
| Profile | `headless` (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`) |
| Model label | `local-llama-cpp/qwen3.8-27b-gsq-rco` (reasoning `low`, context 80896, maxTokens 32768) |
| Invocation | `dsh --profile headless --patch <parity overlay> "<frozen prompt>"` |
| Approval policy | `ask` with no headless answerer ⇒ **fail-closed**; escalation (`sandbox_permissions` + justification) also fail-closed |
| Sandbox mode | `workspace-write` (Seatbelt on macOS) |
| Per-test wrapper | 2400 s `subprocess` timeout (recorded per record) |

**Parity overlay (`<workspace>/dsh-parity.patch.yml`, sha256 `a17c0191…`), invocation-only:**

```yaml
- id: tool-web          # removes web_search + web_fetch (matches OpenCode webfetch/websearch deny)
  disabled: true
- id: bash-sandbox      # identical to the previous DSH run's bash-timeout entry
  config:
    timeoutMs: 1200000
```

`~/.dsh` was **not** edited. The overlay is passed with `--patch` per run. The `web*` backend services
remain mounted but are unreachable by the model without `tool-web`. Verified by
`dsh --profile headless --patch … --dump-config` (exit 0): `tool-web` shows `disabled: true`,
`bash-sandbox.timeoutMs=1200000`.

## 3. Exact permission / tool surface

Verified against the composed headless profile and the DSH package contracts (not assumed):

- **File effects only.** `dsh-bash-sandbox` states its modes "govern file effects only — network stays
  unrestricted"; `dsh-sandbox-local`'s Seatbelt profile governs `(deny file-write*)` only. There is **no
  network-policy knob anywhere** in the DSH configuration catalog.
- **`workspace-write`** permits writes under the session workspace **plus `/tmp` and the per-user temp
  dir**; `dsh-fs-sandbox` keeps **reads unconfined**.
- **Web tools removed** by the overlay. No MCP server is mounted in the headless profile.
- Bash escalation exists (`sandbox_permissions`/`justification`) but fails closed under `ask` with no
  answerer.
- Other model tools remain: `read`, `write`, `edit`, `grep`, `glob`, `subagent*`, `workflow`,
  `code-runtime`, `skill`, `goal`, `todo`, jobs — an inherent DSH tool surface that OpenCode does not
  share (recorded as a residual difference, not a permission change).

## 4. Parity checklist

| Capability | OpenCode reference | DSH after changes | Match? |
| --- | --- | --- | --- |
| workspace write | clone-only (controlled `.eval-tmp`; external dirs denied) | clone + `/tmp` + user temp (Seatbelt) | **Partial** — `/tmp` also writable |
| web search | denied | `tool-web` disabled → tool absent | **Yes** |
| web fetch | denied | `tool-web` disabled → tool absent | **Yes** |
| outbound network | no OS isolation; web tools denied + npm offline | no OS isolation; web tools removed + npm offline (`npm_config_offline=true`) | **Partial** — bash `curl`/`wget`/`pip` remain in both; DSH has no deny control |
| external directories | denied (`external_directory: deny`, with command-shape gaps) | reads unconfined; out-of-workspace writes denied | **Partial** — reads more permissive |
| `/tmp` access | command-shape-dependent (some allowed, some denied) | writable/readable | **Partial** |
| repository-local commands | allowed | allowed | **Yes** |
| approval behavior | fail-closed | `ask` + no answerer → fail-closed; escalation fails closed | **Yes** |
| shell timeout | 2400 s wrapper; no 60 s command cap | 2400 s wrapper + 1200 s invocation patch | **Yes** |

**Remaining confounds (recorded, not worked around):** bash-level outbound network is not restricable by
DSH; `/tmp` is writable; external-directory **reads** are unconfined; DSH's extra non-web execution
tools (`subagent`/`workflow`/`code-runtime`) differ inherently from OpenCode's surface. Per instruction,
no proxy/network hack was introduced.

## 5. Harness integrity (verified)

| Check | Result |
| --- | --- |
| Baseline HEAD | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4` (338 tracked files) — **unchanged** |
| Frozen prompts | all hashes/byte lengths match `prompt_manifest.json` (`ok: true`) |
| Frozen harness/scorer | `git diff` over `harness/` and `opencode-prompts/` — **empty (unchanged)** |
| Server restart | **none** — `/props` build unchanged (`b1-60081bb`); cumulative counters strictly monotonic across runs |
| Clones after run | all 9 clean, single ref `refs/heads/main`; only t2 has one commit (expected); all others 0 |
| New artifacts attributable | DSH adapter files (`runner_dsh.py`, `extract_traces_dsh.py`) + this report; both prior reports/workspaces untouched |

## 6. Per-test results and evidence

| # | Runtime (s) | Commits | Clean | Tools | Network attempted | Repo validator used | External validator/package | Automated | Adjudicated |
| - | ----------: | ------: | :---: | ----- | :---------------: | :-----------------: | :------------------------: | --------- | ----------- |
| t0 | 23.7 | 0 | ✓ | none | no | n/a | no | Pass | Pass |
| t1 | 36.7 | 0 | ✓ | bash, glob, read | no | n/a | no | Pass | Pass |
| t2 | 189.4 | 1 (`aed13e33`) | ✓ | bash×19, read×4, edit×3 | no | yes (`npx prettier --check`, `git diff`) | no | Pass | Pass |
| t3 | 87.3 | 0 | ✓ | grep×5, bash×2 | no | n/a | no | Pass | Pass |
| t4 | 222.9 | 0 | ✓ | bash×14, glob, read×2, grep×2 | **no** | **yes (`npm run format:check`)** | no | Fail | **Pass** |
| t5 | 131.9 | **0** | ✓ | bash×7, job_list, read, grep | no | yes (`npm run format:check`) | no | Pass | Pass |
| t6 | 36.8 | 0 | ✓ | bash×2, read | no | yes (`npm run format:check`) | no | Pass | Pass |
| t7 | 322.4 | 0 | ✓ | bash×21, grep×5, read×2, glob | no | **no** | **yes — cached `markdownlint-cli` (npm cache, no download)** | Fail | Fail |
| t8 | 122.4 | 0 | ✓ | bash×5, read, glob×2, grep, job_output | no | **yes, inside `npm run check`** (see §7) | no | Fail | **Pass** |

**Network attempts across the entire suite: zero.** No `web_fetch`/`web_search` (tools absent) and no
`curl`/`wget`/`pip`/`npx -y`. All 9 tests returned rc=0, no timeouts, exact session matches, clones
clean before and after.

## 7. Adjudication

| # | Auto | Adj | Exact reason |
| - | ---- | --- | ------------ |
| t4 | Fail | **Pass** | Only `t4.verdict_false` unmet. The model delivered the correct verdict — "**Verdict: False — in this repository…**" and "The claim is factually wrong" — which the frozen regex (`claim is (false\|…)\|false\.\|…\|is false`) does not match (em-dash spacing, "factually wrong"). All other t4 requirements pass: the **repository validator ran** (`npm run format:check`), `git diff --check` and `git diff --staged` ran, `no_change_warranted` matched, and the tree is unmodified. Scorer false negative; repository state satisfies the frozen requirement. |
| t7 | Fail | Fail | Genuine. The model searched for a Markdown validator and ran a **cached external `markdownlint-cli`** (from `~/.npm/_npx/10f54a…`, no network) twice via `node …/markdownlint.js docs/domain-model.md`. It never ran the repository's prescribed validator (`npm run format:check` / `prettier`), so `t7.validator_twice` and `t7.separate_outputs` are unmet. `git status` ran and no file was modified. |
| t8 | Fail | **Pass** | Only `t8.recovery_validation` unmet. The model ran the recovery as `npm run check` **in the background**; the foreground result was `started background job bash-1`, and the actual chain was captured by `job_output` (wait=true): `> npm run format:check` → `> prettier . --check` → `[warn] docs/domain-model.md` (exit 1). The repository's prescribed formatting validator therefore **executed and its output was reported**; the tree is unmodified and `git status` ran. The scorer cannot credit a background umbrella invocation (`command_ran` sees neither the nested `npm run format:check` in the foreground output nor a `command` on `job_output`). Strict alternative reading: the model named `npm run check`, not `npm run format:check`, so a strict adjudicator could keep this a fail; it is recorded as Pass on intent with this caveat. |

- **Automated:** **6 Pass / 3 Fail** — Pass `t0,t1,t2,t3,t5,t6`; Fail `t4,t7,t8`.
- **Adjudicated:** **8 Pass / 1 Fail** — Pass `t0,t1,t2,t3,t4,t5,t6,t8`; Fail `t7`.

## 8. Direct llama.cpp throughput (suite interval, measured)

| Quantity | Value |
| -------- | ----- |
| Prompt tokens processed (non-cached) | **151,406** |
| Cached prompt tokens | **1,430,500** |
| Prompt processing time | **291.03 s** |
| **Prompt tok/s (derived = 151,406 / 291.03)** | **520.25** |
| Generated tokens | **38,291** |
| Generation time | **808.03 s** |
| **Generation tok/s (derived = 38,291 / 808.03)** | **47.39** |
| `n_decode_total` (excluding speculative) | 14,022 |
| `n_tokens_max` | 53,635 |
| Server gauges at suite end (`prompt_tokens_seconds`, `predicted_tokens_seconds`) | 610.85, 48.87 |

All values are counter deltas from `/metrics` (direct llama.cpp metrics; `prompt_seconds_total`,
`tokens_predicted_seconds_total`), not wall-clock estimates. The end-of-suite gauges are server-level
running averages over its whole recent history and are shown for completeness; the derived rates above
are the authoritative suite measurements.

## 9. MTP / speculative-decoding metrics (suite interval, measured)

| Metric | Value |
| ------ | ----- |
| Verification steps (`spec_decode_num_drafts_total`) | **13,513** |
| Draft tokens generated | **40,525** |
| Draft tokens accepted | **24,776** |
| **Acceptance rate (derived)** | **61.14%** |
| **Mean accepted tokens per verification step (derived)** | **1.833** |
| Accepted at draft position 0 / 1 / 2 | 10,429 / 8,024 / 6,323 |

## 10. Total runtime

| Quantity | Value |
| -------- | ----- |
| Continuous suite wall-clock (first start → last end) | **1,195.0 s = 19.92 min** |
| Sum of per-test durations | **1,173.5 s** |
| Timeout status | no test timed out |

## 11. Comparison

### 11.1 Three-way score and performance

| Metric | OpenCode 8087 | DSH prior | **DSH parity** |
| ------ | ------------: | --------: | -------------: |
| Adjudicated | 7/9 | 5/9 | **8/9** |
| Automated | 6/9 | 4/9 | **6/9** |
| Sum of test durations | 1,280.1 s | 1,510.2 s | **1,173.5 s** |
| Suite wall-clock | 1,305 s | 1,536 s | **1,195 s** |
| Prompt tok/s (derived) | 439.4 | 426.99 | **520.25** |
| Generation tok/s (derived) | 44.33 | 42.63 | **47.39** |
| MTP acceptance rate | 63.92% | 61.36% | **61.14%** |
| Generated tokens | 35,204 | 46,703 | **38,291** |
| Non-cached prompt tokens | 174,461 | 134,808 | **151,406** |
| Cached prompt tokens | 1,677,800 | 2,037,310 | **1,430,500** |
| MTP verification steps | 12,074 | 16,445 | **13,513** |

### 11.2 Per-test runtime

| # | OpenCode (s) | DSH prior (s) | DSH parity (s) |
| - | -----------: | ------------: | -------------: |
| t0 | 29.7 | 9.1 | 23.7 |
| t1 | 39.3 | 52.9 | 36.7 |
| t2 | 359.4 | 211.7 | 189.4 |
| t3 | 54.1 | 171.8 | 87.3 |
| t4 | 197.9 | 569.3 | **222.9** |
| t5 | 173.7 | 184.4 | 131.9 |
| t6 | 40.0 | 54.8 | 36.8 |
| t7 | 319.1 | 201.1 | 322.4 |
| t8 | 66.9 | 55.1 | 122.4 |
| **Sum** | **1,280.1** | **1,510.2** | **1,173.5** |

### 11.3 The specific behavioral failures (the key comparison)

| Behavior | OpenCode 8087 | DSH prior | DSH parity | Changed by the control? |
| -------- | :-----------: | :-------: | :--------: | :---------------------- |
| t4 network / custom-validator pivot | no (used repo Prettier) | **yes** (`web_fetch` HTTP 200 + `curl`; custom GFM validator) | **no** (repo `npm run format:check`; **zero** network) | **Disappeared** |
| t7 external `markdownlint` substitution | yes (Fail) | yes (Fail) | **yes** (Fail; now a *cached* `markdownlint-cli`, no network) | **Persisted** |
| t8 lint-vs-format-check substitution | no (used `format:check`) | yes (`npm run lint`, no Prettier) | **partial** (`npm run check`, which *includes* `format:check`) | Improved, not attributable |
| t5 unnecessary commit | yes (Fail) | yes (Fail) | **no** (`commits=0`) | Changed, not attributable |

## 12. Remaining environmental confounds

1. **Bash-level outbound network is not restricable by DSH.** DSH's sandbox governs file effects only;
   the model could still `curl`/`wget`/`pip`. In this run it did not (zero attempts), but the capability
   remains. This is the one reference restriction DSH cannot reproduce; recorded, not worked around.
2. **`/tmp` is writable** under `workspace-write` (explicitly granted), and **external-directory reads
   are unconfined** (`dsh-fs-sandbox`). OpenCode denied both (with command-shape gaps).
3. **DSH's extra execution tools** (`subagent`/`workflow`/`code-runtime`/`skill`/`goal`) remain; they are
   part of the harness identity, not a permission difference, and were not exercised here.
4. The comparison is a single run per prompt; token-level decoding is non-deterministic.

## 13. Interpretation (limited to what this experiment establishes)

**The experiment establishes:**

- **The t4 network/custom-validator pivot is environment/tool-surface dependent.** With the web tools
  removed, t4 performed **zero network access**, ran the **repository validator** (`npm run format:check`),
  ran the required `git diff --check`/`--staged` checks, made no change, and delivered the correct verdict
  ("the claim is false"). In the prior DSH run the same model, under the same server, fetched the GFM spec
  over `web_fetch`/`curl` and built a bespoke validator. This is the clearest evidence that the t4
  failure was driven by the available tool surface, not by a change in the model. Its runtime also fell
  from 569.3 s to 222.9 s, consistent with the removed detour.
- **No test attempted any network access** once the web tools were gone, so the environment control was
  effective at the tool level.

**The experiment does NOT establish:**

- That the environment change caused the **t5** (commit) or **t8** (command choice) differences. The
  parity change removed only the web tools, which are irrelevant to those tasks; those differences are
  most plausibly **run-to-run non-determinism** of the same model. t8's automated failure is additionally
  a scorer/evidence-capture limitation (background umbrella invocation), not a repository violation.
- That removing the web tools fixes the markdown-validator identification problem. **t7 persisted**: the
  model again substituted an **external** `markdownlint` for the repository's prescribed
  `npm run format:check`/prettier — this time resolved from the local npm cache, with no network. That
  substitution is **model behavior**, not a network artifact, and survives the environment control.

**Net.** Under a DSH environment made as close to the OpenCode reference as DSH supports, the run scores
**8/9 adjudicated (6/9 automated)** vs the prior DSH **5/9** and the OpenCode reference **7/9**. The
score movement is dominated by the t4 pivot disappearing (attributable to the tool surface) plus
t5/t8 variance (not attributable). Throughput (≈520 prompt / ≈47 generation tok/s, 61.1% MTP acceptance)
is in line with the same server's other runs. The residual gap — validator identification (t7) — is a
model behavior the environment control did not change.

---

## Artifacts

- Workspace: `/Users/cortezashley/.local/share/opencode-evals/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh-parity/`
  (`baseline/`, `clones/t0..t8`, `manifest.json`, `config.verification.json`, `prompt.verification.json`,
  `baseline.meta.json`, `server.props.json`, `server.slots.json`, `server.slots.after.json`,
  `metrics.before_suite.prom`, `metrics.after_suite.prom`, `metrics.summary.json`,
  `dsh-parity.patch.yml`, `runner.log`, `status.json`).
- Results: `…/results/qwen38-27b-gsq-rco-iq3-xxs-mtp-8087-dsh-parity/` (`results.jsonl`,
  `raw_parts.jsonl`, `traces.txt`, `trace.summary.json`, `permissions.json`, `score.json`,
  `tN.out/err/log`).
- Adapter (new, untracked, from the prior experiment): `docs/development/model-reliability/harness/runner_dsh.py`,
  `…/extract_traces_dsh.py`.

**Integrity statement.** Application source and the baseline repository were not modified. The frozen
prompts, `prompt_manifest.json`, `ground_truth.json`, `score.py`, `harness_lib.py`, and `runner.py` were
not modified. `~/.dsh/settings.yaml` and all DSH configuration were left unchanged; the only DSH-side
change is an invocation-only `--patch` overlay that disables `tool-web` and raises the bash-command
timeout. No llama.cpp restart or reconfiguration occurred. The two prior evaluation reports were not
overwritten. No Git state was altered and nothing was committed.
