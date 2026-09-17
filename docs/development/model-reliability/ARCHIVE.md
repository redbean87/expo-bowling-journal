# Durable Evaluation Archive

Completed evaluations originally wrote their artifacts under the OS temporary
directory (`/var/folders/.../T/opencode/...`), which is purgeable. This document
records the durable, repository-controlled archival bundle for the corrected
DeepSeek V4.1 Flash evaluation so the baseline no longer depends solely on
volatile storage.

## Archive location

| Item | Value |
| ---- | ----- |
| Archive ID | `deepseek-v41-flash-2026-09-17` |
| Bundle location | `docs/development/model-reliability/archive/deepseek-v41-flash-2026-09-17/` (git-ignored; not committed) |
| Manifest | `docs/development/model-reliability/harness/archive-manifest.deepseek-v41-flash.json` |
| Build spec | `docs/development/model-reliability/harness/archive-spec.deepseek-v41-flash.json` |
| Mechanism | `docs/development/model-reliability/harness/archive_bundle.py` |
| Files / bytes | 227 files / 213,447,714 bytes |

The bundle is a byte-for-byte copy of the retention-relevant artifacts. It is
**not committed to Git** because raw traces and `results.jsonl` files are large;
the committed spec, manifest, and verifier are the repository-controlled
mechanism. `docs/development/model-reliability/archive/.gitignore` keeps the
bundle out of the working tree.

## Archive contents

```
deepseek-v41-flash-2026-09-17/
  t0-smoke/                     corrected t0 smoke run (sanitized baseline ef91057)
  t1/ … t8/                     corrected per-test runs, one isolated clone each
  rescore/                      hardened/recomputed score (score.recomputed.json)
  initial-pre-correction-run/   historical aggregate run (baseline a437b47), provenance only
  runner-logs/                  per-test runner.log for t1–t8
  config/                       copy of the exact evaluation config used
```

Each per-test bundle directory contains the runner `manifest.json`,
`baseline.meta.json` (baseline identity), `baseline.validation.json`,
`clones.validation.json`, `prompt.verification.json` (prompt hashes),
`status.json`, and under `results/<variant>/`:

- `results.jsonl` — run metadata, Git state, session metadata, permission evidence;
- `raw_parts.jsonl` — original raw session traces (full fidelity);
- `traces.txt` / `trace.summary.json` — extracted, human-readable traces;
- `permissions.json` and `permissions/tN.permission.{log,json}` — permission evidence;
- `tN.out` / `tN.err` / `tN.log` — process output;
- `score.json` — the original pre-hardening score for that run.

The `rescore/` bundle additionally carries the recomputed `score.recomputed.json`
and `permissions.recomputed.json` (the independent, combined t0–t8 result). The
`initial-pre-correction-run/` bundle carries the historical aggregate run for
provenance; it used the contaminated baseline `a437b47` and is **not** comparable
to the corrected runs.

## Provenance recorded in the manifest

`archive-manifest.deepseek-v41-flash.json` records, per file, the bundle-relative
`dest`, the original volatile `src`, `bytes`, and `sha256`. It also records the
`archive_location`, the `original_volatile_roots`, and a `provenance` block with
the model, binary, baseline head/source ref, per-test and initial timeouts, the
harness revision at archive time, and the config path.

**Baseline identity:** sanitized baseline HEAD
`ef91057c47744b25dc5e14af16ed9b7ad609c0f4`, exported from source ref
`a07d38e8f3d48c6880759cb69d0c1f42433c7b03`.

**Harness revision.** The corrected run artifacts predate the current harness
commit and do not embed a harness revision, so revisions are recorded from
commit/run timing evidence (stated explicitly in the manifest, not inferred
silently): t0 smoke `b841597`, t1–t8 `b69fb1f`, hardened re-score `62fb894`.
The exact harness code for each revision remains recoverable from Git history.

## Relationship to the volatile workspaces

The sources are the OS-temp workspaces that produced the run:

```
/var/folders/lq/gtznj14x70d1bgnvckqy6c6m0000gn/T/opencode/deepseek-v41-flash-{smoke,t1..t8,rescore,eval}/
```

The bundle is a copy; the originals were not modified (the build reads source
bytes and records their hashes). If the volatile workspace is later purged, the
bundle still establishes t0 smoke through t8, the raw and extracted traces, the
pre-hardening scores, the hardened re-score, permission evidence, prompt
verification, baseline identity, session/run metadata, and the config used.

## Verifying the archive

```bash
python3 docs/development/model-reliability/harness/archive_bundle.py verify \
  --manifest docs/development/model-reliability/harness/archive-manifest.deepseek-v41-flash.json
```

This re-hashes every bundle file, checks sizes, and fails on any missing or
unexpected file, without mutating anything. Because the manifest records the
per-file SHA-256 values, the bundle can be verified wherever it is copied; a
different archive location can be checked with `--dest DIR`.

If a source artifact could not be recovered, it is reported here explicitly
rather than fabricated. At archive time all 227 selected artifacts from the
volatile workspaces were present and copied; none were missing.
