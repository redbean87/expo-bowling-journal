# Model-Reliability Harness

Infrastructure for running the OpenCode `t0`–`t8` model-reliability suite against a
reproducible, isolated, auditable benchmark baseline.

This directory is **harness-only**. It contains no application code, does not change
the benchmark prompts, and is excluded from the evaluated repository content.

The harness was built to correct the methodological problems found in the completed
harness audit (repository contamination, leaked clone refs/objects, a `node_modules`
symlink escape, command-shape-dependent permissions, incomplete Git capture, weak
session matching, unverified prompt hashes, and prose-only scoring). The audit's
findings are the basis for every control described here.

---

## 1. Clean baseline production

`prepare_baseline.py` (backed by `harness_lib.provision_baseline`) builds the
evaluated repository from scratch:

1. **`git archive` export, never `git clone --local`.** The baseline is exported
   from the last pre-evaluation ref, `a07d38e8f3d48c6880759cb69d0c1f42433c7b03`
   (`docs: remove stray asterisks from League notes in domain model spec`). Because
   a fresh directory is extracted and a fresh repository is initialized, the main
   repository's refs, reflogs, and unreachable objects are **never copied**.
2. **Eval content excluded.** `docs/development/model-reliability/` (reports,
   prompts, manifests, and this harness) is removed from the evaluated tree. The
   source ref already predates all of it; the exclusion is defense in depth.
3. **Fresh repo, single commit.** `git init -b main` + one commit with a fixed
   identity and date yields a deterministic baseline HEAD:

   ```
   ef91057c47744b25dc5e14af16ed9b7ad609c0f4
   ```

   with exactly one ref (`refs/heads/main`), a one-entry reflog, and no unreachable
   objects. Provisioning **fails** if the resulting HEAD differs from this value.

4. **Dependencies copied, never symlinked.** `node_modules` is copied as a real
   tree (APFS clone when available, otherwise a full copy). No symlink points at
   the live repository.
5. **Verified before use.** The freshly built baseline and every clone are validated
   (HEAD, refs, clean tree, no escaping symlinks) before any test may run.

The historical evaluation reports remain in the main repository and its history,
untouched.

### Sanitized-baseline facts (independently verified)

| Fact                                       | Value                                         |
| ------------------------------------------ | --------------------------------------------- |
| Baseline HEAD                              | `ef91057c47744b25dc5e14af16ed9b7ad609c0f4`    |
| Tracked files                              | 338                                           |
| `docs/domain-model.md` length              | 205 lines                                     |
| Files whose contents mention `PinPal` (t3) | **11**                                        |
| Committed `.pinpal` fixtures               | 0 (ignored, never exported)                   |
| Repository Markdown/format validator       | `npm run format:check` (`prettier . --check`) |
| Pre-existing validator warning             | `docs/domain-model.md`                        |

> **Ground-truth change vs. historical runs.** Historical OpenCode runs used
> baseline `a437b47`, whose tree included the prior `continue-gpt-oss-reliability-evaluation.md`
> report. Removing the eval directory drops the t3 `PinPal`-matching file count from
> **12 → 11**. t1 (205 lines), the validator, and the pre-existing Prettier warning
> are unchanged.

---

## 2. Test-clone isolation

Each test runs in its own directory under `<workspace>/clones/tN`, created as a real
copy of the validated baseline (its own `.git` with the single baseline commit).
`runner.py` will not execute a test unless the clone passes `validate_clone`:

- HEAD equals the expected baseline SHA;
- exactly one ref, `refs/heads/main`;
- working tree clean (no tracked modifications, no untracked non-ignored files);
- `node_modules` is a real directory, not a symlink;
- no symlink anywhere in the clone resolves outside the clone, and none resolves
  into the live repository.

A failed validation **aborts the run** rather than proceeding.

---

## 3. Intentionally excluded files and directories

Excluded from the **evaluated baseline content** (by the source ref and by
provisioning):

- `docs/development/model-reliability/` — all evaluation reports, `opencode-prompts/`,
  `MANIFEST.md`, `ground_truth.json`, `prompt_manifest.json`, and this harness.

Excluded from the **working tree only**, via each clone's `.git/info/exclude`
(never the tracked baseline, so the application source is unmodified):

- `node_modules` — copied dependencies;
- `.eval-tmp/` — controlled temporary directory (see §4);
- `.opencode/` — any OpenCode-local state;
- `*.pinpal` — gitignored local fixtures.

Ignored files are still **captured as evidence** (see §6); the exclusion only
prevents a false dirty-tree result.

---

## 4. Permission and network policy

Every `~/.config/opencode/opencode.*eval*.jsonc` receives one identical, explicit
policy (applied by `sync_permissions.py`, documented in
`opencode-eval-permissions.json`):

```jsonc
"permission": {
  "external_directory": "deny",
  "webfetch": "deny",
  "websearch": "deny"
}
```

Rationale: the benchmark policy is a **declared constant**, not an artifact of which
command shapes the shell tool happens to scan. Denying external directories prevents
any evaluation run from reading the live repository directly, through dependency
symlinks, or via path traversal.

**Runtime verification (mandatory invariant).** `runner.py` parses the **actual**
config file supplied through `--config` and verifies, before any model call, that:

- the file parses (JSONC) and carries a `permission` block **exactly** equal to
  `CANONICAL_PERMISSIONS` (missing, changed, or extra permission rules are rejected);
- every server in `REQUIRED_DISABLED_MCPS` (currently `robinhood-trading`) has
  `mcp.<name>.enabled == false`.

If either requirement is violated the run **aborts before the model is invoked**
(exit 2) and the failure is recorded in `<workspace>/config.verification.json`. The
verified state — config path, SHA-256, parsed permission block, MCP states, and any
violations — is written into `manifest.json` and into each `results.jsonl` record, so
the run records the verified configuration itself rather than merely a config path.
The config is never rewritten and the canonical policy is never changed. A real
(non-`--dry-run`) run requires `--config`; a dry run may omit it.

**MCP / network-capable tools.** The `permission` block does not cover MCP servers:
`robinhood-trading` is defined in the base config as a **remote** MCP server, a
separate network-capable tool surface. The canonical permission rules therefore do
not constrain it, and the previous harness recorded only the config path without
checking whether the server was actually disabled. Evaluation configs disable each
required MCP explicitly (`mcp.<name>.enabled = false`) and the runner verifies that
disablement at runtime (above). This is a narrow, evidence-backed check: it verifies
the MCP already required by the evaluation configs and does not add unrelated
restrictions.

**Controlled temporary directory.** `runner.py` sets `TMPDIR=<clone>/.eval-tmp` for
the evaluated process, so OpenCode and its tools write temporary files into a
repository-local, git-excluded directory. This keeps temp writes inside the clone,
prevents false dirty-tree results, and removes the historical `/tmp` ambiguity without
changing any prompt.

**Observed `/tmp` command-shape behavior.** Direct `/tmp` access remains
command-shape-dependent because OpenCode's `external_directory` check is only invoked
for certain parsed command shapes. In the corrected DeepSeek V4.1 Flash run:

- **denied**: `cp docs/domain-model.md /tmp/dm.before.md && … > /tmp/dm.pretty.md`
  (t2), and a read of `/private/tmp/` (`ls -la /private/tmp/ …`) (t7);
- **allowed**: a heredoc (`cat > /tmp/tbltest.md <<'EOF' …`) (t4) and output
  redirection plus a `/tmp` path argument
  (`… > /tmp/domainmodel.formatted.md; diff … /tmp/domainmodel.formatted.md`) (t5).

This is recorded as observable behavior, not as policy: the check is driven by which
command shapes the shell tool scans, and even within one model evaluation the outcome
varied by command shape. The remediation did not change enforcement. A bounded,
test-backed policy change would be warranted only if it can be shown deterministic
across command shapes (see §13).

**Network.** `webfetch`/`websearch` are denied, and the runner exports
`npm_config_offline=true` (plus audit/fund/update-notifier off) so package fetches
fail deterministically instead of varying run to run. `t5`'s no-network instruction
is therefore consistent with the environment, while remaining a model-behavior test.

**Comparability note.** This policy is stricter than the historical ad-hoc behavior.
Runs made under it are internally comparable to each other; they are not directly
comparable to historical runs in which `/tmp` was sometimes allowed and network
installs were sometimes performed.

---

## 5. Prompt and manifest integrity

`prompt_manifest.json` holds the frozen per-file byte length and SHA-256 for
`t0`–`t8` (mirrored from `opencode-prompts/MANIFEST.md`). Before **every** run,
`runner.py` verifies:

- the expected prompt set and test identifiers are exactly present (no missing or
  extra `tN.txt`);
- every file's SHA-256 and byte length match the manifest.

Any mismatch **aborts** the run and is recorded in
`<workspace>/prompt.verification.json`. Verified hashes are also written into each
`results.jsonl` record and into `manifest.json`. **The prompt text is never modified**;
changing it would create a new benchmark version and invalidate direct comparisons.

---

## 6. Git-state capture

`harness_lib.git_state` records, before and after each test:

- final HEAD (full and short) and current branch;
- all refs;
- `git status --porcelain -uall` (tracked + all untracked nested files);
- `git status --porcelain --ignored -uall`;
- `git ls-files --others --exclude-standard` (untracked, nested);
- `git ls-files --others --ignored --exclude-standard` (ignored files);
- `git diff` (unstaged), `git diff --cached` (staged), `git diff HEAD`;
- `git diff <baseline>` and `git diff --name-only <baseline> HEAD`;
- every commit created during the run (`<baseline>..HEAD`, SHA + subject).

A zero process exit code is **never** treated as success; classification is done by
`score.py` against ground truth.

---

## 7. Session, trace, and permission capture

`extract_traces.py` writes per-test evidence under `results/<variant>/`:

- `raw_parts.jsonl` — every session part, full fidelity, for later auditing;
- `traces.txt` — human-readable trace;
- `trace.summary.json` — per-test completeness, explicitly flagging missing data;
- `permissions.json` — permission evidence.

Session identification (`harness_lib.session_report`) matches the session whose
`directory` equals the **resolved realpath** of the clone, within the test's run
window. There is **no recency-only fallback**; if no exact match exists the trace is
reported missing, and multiple matches are marked `ambiguous`.

Permission evidence is captured from two sources and their gaps are recorded:

- **Session DB** — permission _rejections_ appear as tool-call errors. Classification
  is marker-based (`harness_lib.is_permission_denial`), not dependent on the historical
  literal `"rejected permission"`: it also recognises OpenCode's current rule-denial
  wording, `"The user has specified a rule which prevents you from using this specific
  tool call."` and generic `permission denied` forms.
- **`opencode.log`** — the runner slices `message=evaluated` / `message=asking` lines
  for the run window into `permissions/tN.permission.log` and
  `permissions/tN.permission.json`. Authoritative `action=deny` events are counted as
  `<variant>/permissions.json` → `raw_log_denials` / `raw_log_denial_count`; the
  per-session combined count is `permission_rejection_count`.

Because the raw log is process-global and unattributed, the log denials are reported
separately from the per-session DB denials rather than silently merged.

### Remaining limitations (not claimed to be captured)

- OpenCode does **not** persist permission _requests/replies_ as session parts; only
  the resulting tool error is stored. Permission requests therefore cannot be
  attributed to a session from the DB.
- `opencode.log` is process-global and its permission lines contain **no session id**,
  so those events cannot be attributed to a specific test. They are best-effort raw
  evidence.
- The session DB is the shared operator database unless the environment is changed
  externally; exact-directory matching mitigates this but does not eliminate
  concurrent-DB sharing.
- Reasoning traces are preserved raw in `raw_parts.jsonl`; `traces.txt` clips them for
  readability.

---

## 8. Ground truth and scoring

- `ground_truth.json` — machine-readable expectations for the sanitized baseline and
  the `t0`–`t8` suite: expected paths, line counts, the `PinPal` file count, the
  validator command, semantic verdicts, required validation actions, commit/no-commit
  behavior, clean-tree requirements, and invalid-command recovery requirements.
- `score.py` — evaluates each test's requirements against the runner artifacts and
  emits structured `pass` / `partial` / `fail` / `unknown` / `missing` results
  (`results/<variant>/score.json`) with an explicit `unmet` list.

Requirement detectors are evidence-based, not prose-based:

- **Token-aware command matching** (`command_has`) matches whole shell tokens, so
  `git status` matches a real `git status` (including inside `a && git status`) but
  **not** `git statuss`. This also guards `command_forbidden`.
- **Content search** (`content_search`) credits a native `grep` tool call or an `rg` /
  `grep` / `git grep` command actually executed through Bash; a search merely mentioned
  in the final prose is not credited.
- **Execution claims** (`execution_report`, and `command_ran` itself) require a
  captured command trace; `execution_report` additionally requires captured output
  corroborating the run. The process report text (`tN.out`/`tN.err`) and incidental
  tool output are never used as execution evidence, so fabricated "Execution 1 /
  Execution 2" narration does not pass.
- **Nested npm scripts** (`command_ran`) resolve `npm run <script>` bodies transitively
  from the clone's `package.json` (e.g. `npm run check` →
  `npm run typecheck && npm run lint && npm run format:check` → `prettier . --check`),
  but only credit the nested command when the script actually ran and its captured
  output corroborates the step. A script merely being defined in `package.json` never
  earns credit.

`unknown` means the evidence needed for a mechanical check was unavailable (for
example, a missing trace); it is never silently counted as success. Human review
remains appropriate for nuanced semantic judgments, but classifications no longer
exist only as prose in a report.

---

## 9. Artifact locations and retention

Default workspace: an OS temp directory (override with `--workspace`). Recommended
location for retention:

```
<workspace>/
  baseline/                      # sanitized single-commit repo + copied node_modules
  baseline.meta.json             # HEAD, tree, tracked count, provenance
  baseline.validation.json       # baseline validation report
  clones/t0..t8/                 # isolated per-test repos
  clones.validation.json         # per-clone validation reports
  prompt.verification.json       # prompt-set + hash verification
  config.verification.json       # parsed --config: permission block + MCP disablement
  manifest.json                  # run config, hashes, permission/network/MCP policy
  status.json                    # incremental progress
  results/<variant>/
    results.jsonl                # one record per test (git state, session, permissions)
    tN.out / tN.err / tN.log
    raw_parts.jsonl              # full-fidelity session parts
    traces.txt
    trace.summary.json
    permissions.json
    permissions/tN.permission.log / tN.permission.json
    score.json                   # structured scoring
```

The historical harness stored artifacts under a purgeable OS temp directory, so
evidence referenced by old reports can vanish. Pin `--workspace` to a durable path
for any run whose artifacts must be retained. When a workspace cannot be made
durable, archive it with `archive_bundle.py` (see §11 and
`docs/development/model-reliability/ARCHIVE.md`): it copies the retention-relevant
artifacts into a durable bundle and records a per-file SHA-256 manifest.

---

## 10. Running

```bash
HARNESS=docs/development/model-reliability/harness
WS=/path/to/durable/eval-workspace

# 1. Provision and validate the clean baseline + clones.
python3 $HARNESS/prepare_baseline.py --workspace "$WS" --tests 0 1 2 3 4 5 6 7 8

# 2. Run the suite (provisions if needed; validates before every test).
python3 $HARNESS/runner.py --workspace "$WS" \
  --variant devstral-16k --model ollama/devstral-small-2:24b-gpu16k \
  --config ~/.config/opencode/opencode.devstral-eval-16k.jsonc

# 3. Reconstruct traces and permission evidence.
python3 $HARNESS/extract_traces.py --workspace "$WS" --variant devstral-16k

# 4. Score against ground truth.
python3 $HARNESS/score.py --workspace "$WS" --variant devstral-16k
```

`runner.py --dry-run` provisions, verifies prompts, and validates clones **without
invoking the model** — use it for harness checks and fixtures.

---

## 11. Verification

`selftest.py` runs the whole harness against fixtures with no model calls and asserts
the corrected methodology:

```bash
python3 docs/development/model-reliability/harness/selftest.py
```

It checks that the baseline excludes eval content, that there are no extra
refs/reflogs/unreachable objects, that `node_modules` is not a symlink and no symlink
escapes into the live repository, that wrong-HEAD and dirty clones are rejected, that
prompt-hash mismatches abort, that untracked/ignored/nested files are captured, that
the permission policy is uniform across configs, and that ground truth loads and the
scoring script produces structured results.

It also exercises the runtime config verification (valid canonical config accepted;
changed permission rule, missing/invalid permission block, and `robinhood-trading`
enabled all rejected; disabled accepted; verified state recorded in the run manifest;
the runner aborting before any model call on a bad config) and the archival
mechanism (a fixture bundle builds and verifies, and a tampered file is detected).

Verify a retained archive bundle independently:

```bash
python3 docs/development/model-reliability/harness/archive_bundle.py verify \
  --manifest docs/development/model-reliability/harness/archive-manifest.deepseek-v41-flash.json
```

---

## 12. Why historical runs are not cleanly comparable

The following applies to **all prior OpenCode runs** (Devstral, Qwen3-Coder, Gemma 4,
GLM, MiMo, DeepSeek). It does not rewrite their results; it marks their limitations.

1. **Leaked refs and objects.** Clones were made with `git clone --local`, which copied
   the main repository's refs and objects. A model could read future prompts and prior
   reports via `git show origin/main:<path>` / `git log --all`. This is a
   reward-hacking vector that applied to every prior run.
2. **Contaminated baseline.** The baseline commit itself (`a437b47`) added a prior
   evaluation report documenting the same suite; the model read it in t2/t8 and saw it
   in t3.
3. **`node_modules` symlink escape.** Clones symlinked dependencies to the live repo;
   `node_modules/../…` resolved into the main repository and bypassed the lexical
   external-directory guard.
4. **Command-shape-dependent permissions.** `/tmp` writes were allowed or rejected
   based on which command shapes the shell tool scanned (e.g. a trailing `cat`). The
   DeepSeek report's "harness permission inconsistency" was a misdiagnosis of this
   deterministic behavior.
5. **Incomplete capture and scoring.** Git capture omitted ignored files and nested
   untracked files and had no diffs; session matching had a recency fallback; prompt
   hashes were unverified; pass/partial/fail existed only as prose.
6. **Uncontrolled network and context.** Network/`npx` behavior was ungated and
   context/provider budgets differed across runs.

Consequently, historical pass/partial/fail totals — especially t2, t3, and t8 — must
not be treated as produced under the corrected harness, and direct comparisons with
runs made under this harness are not valid.

---

## 13. Remaining limitations

- OpenCode's `external_directory` check is only invoked for certain command shapes;
  the declared `deny` policy is explicit and uniform, but a command that is never
  scanned is not checked. This is documented rather than relied upon. Concretely, in
  the corrected DeepSeek V4.1 Flash run some `/tmp` forms were denied (`cp … /tmp/…`,
  `ls /private/tmp/…`) while heredoc/redirection/argument forms were allowed (see §4).
- Permission requests/replies are not persisted by OpenCode; permission capture is
  best-effort and partly unattributable (see §7).
- Session matching against the shared operator database is exact by directory but is
  not isolated from a concurrent operator process.
- `score.py` uses mechanical evidence matching; some semantic requirements can return
  `unknown` and may need human review.
- The expected baseline HEAD is deterministic for the current toolchain/platform;
  cross-platform line-ending or tar-mode differences would trip the HEAD assertion
  by design.
