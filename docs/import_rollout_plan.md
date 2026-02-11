# SQLite Import Architecture + Runbook (v1/v2)

Goal: Keep the import pipeline stable for large `Backup.db` files while avoiding Convex arg and write-cap regressions.

## import architecture

1. App requests upload URL from worker `POST /imports/upload-url`.
2. App uploads `.db` to R2 via signed `PUT /imports/upload` URL.
3. App starts import in Convex (`imports:startImport`) with `r2Key`.
4. Convex dispatches worker queue request (`/imports/queue` or `/imports/process`) with signed HMAC headers.
5. Worker downloads SQLite from R2, parses snapshot, and sends callback to Convex `POST /api/import-callback`.
6. Callback verifies HMAC/timestamp/nonce, advances status, imports snapshot core entities, then persists canonical `frames` in chunked writes before marking batch `completed`.

## callback transport contract

- Callback payload supports `snapshot` (legacy object transport) and `snapshotJson` (string transport).
- For v1 large imports, worker sends `snapshotJson` by default.
- `snapshot` and `snapshotJson` are mutually exclusive.
- Snapshot payload is only valid for stage `importing`.
- Status transitions are constrained to: `queued -> parsing -> importing -> completed` (or `failed` from queued/parsing/importing).

## data persistence scope

- v1 baseline persists `importRawHouses`, `importRawPatterns`, `importRawBalls`, `importRawLeagues`, `importRawWeeks`, and `importRawGames`.
- `importRawFrames` rows are still **not** persisted.
- v2 callback path now persists canonical `frames` rows using chunked internal mutations to avoid Convex per-execution write-cap regressions.
- Frame payloads remain callback-stage `importing` only and still count through `importBatches.counts.frames`.

## retention policy decision

- No additional time-based retention policy is applied for import data right now.
- Replace-all import behavior remains the lifecycle boundary for user-owned normalized and raw import data.
- Canonical `frames` remain persisted as part of the active imported dataset.
- `importRawFrames` remains intentionally unpersisted.

## warning handling in v1

- Import warnings are emitted for non-fatal quality issues.
- Repeated warning categories are summarized to reduce noise (for example, repeated "missing weekFk" style warnings).

## local runbook

Use local inline processing when iterating quickly:

1. Set mode: `npm run import:mode:local`
2. Start worker: `npm run worker:dev`
3. Start app/Convex as usual.

Local mode sets Convex `IMPORT_WORKER_QUEUE_PATH=/imports/process` so parse+callback run inline in one worker request.

## cloud runbook

Use queue processing when validating production-like behavior:

1. Set mode: `npm run import:mode:cloud`
2. Ensure worker has queue consumer and callback secrets configured.
3. Use normal app import flow.

Cloud mode uses Convex `IMPORT_WORKER_QUEUE_PATH=/imports/queue`.

## regression test commands

- Import regression tests only: `npm run test:import`
- Full test suite: `npm test`
- Typecheck: `npm run typecheck`
- Worker type check: `npm --prefix worker run check`

The import regression suite verifies:

- callback payload/transition rules (`snapshotJson`, mutual exclusion, stage restrictions)
- snapshot JSON parsing failure behavior
- large `Backup.db` frame scale path (`16416` frames) using `snapshotJson` transport
- `importRawFrames` persistence is not reintroduced
- canonical frame persistence plans are chunked and bounded for large imports
