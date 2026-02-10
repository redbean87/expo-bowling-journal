# SQLite Import Rollout Plan (Step-by-Step)

Goal: Upload SQLite backup to R2, parse it in Cloudflare Worker, and import/refine into Convex safely.

## Current status (already done)

- Convex has lossless import mutation: `imports:importSqliteSnapshot`
- Convex has post-import refinement pass
- Raw mirror tables are in schema (`importRaw*`)
- Typecheck/lint passed

---

## Step 1 - Create Cloudflare resources

Create:

- R2 bucket: `bowling-imports`
- Queue: `sqlite-import-jobs`
- Dead-letter queue: `sqlite-import-jobs-dlq`
- Worker: `sqlite-import-worker`

Done when:

- All resources exist in Cloudflare dashboard

---

## Step 2 - Configure Worker project (`wrangler.toml` + bindings)

Add:

- Worker name/main/compat date
- R2 binding (`R2_IMPORTS`)
- Queue producer binding (`IMPORT_QUEUE`)
- Queue consumer for `sqlite-import-jobs`
- Env vars:
  - `CONVEX_URL`
  - `CONVEX_IMPORT_CALLBACK_PATH`

Set secrets:

- `IMPORT_CALLBACK_HMAC_SECRET`

Done when:

- `wrangler dev` starts without binding/config errors

---

## Step 3 - Worker upload URL endpoint

Implement:

- `POST /imports/upload-url`
- Input: `userId`, `fileName`, `fileSize`, optional `checksum`
- Output: `r2Key`, `uploadUrl`, `expiresAt`

Done when:

- Client can get URL and upload `.db` to R2 successfully

---

## Step 4 - Convex start/poll APIs

Implement:

- `imports:startImport({ r2Key, fileName, fileSize, checksum?, idempotencyKey })`
- `imports:getImportStatus({ batchId })`

Behavior:

- Start creates batch with status `queued`
- Start calls Worker `POST /imports/queue` with `{ batchId, userId, r2Key }`
- Status returns progress/errors/summaries user-scoped

Done when:

- Batch row appears and polling works

---

## Step 5 - Worker queue consumer (SQLite parser)

Consumer flow:

1. Receive `{ batchId, userId, r2Key }`
2. Mark batch `parsing`
3. Download SQLite from R2
4. Parse `house`, `pattern`, `ball`, `league`, `week`, `game`, `frame`
5. Build snapshot payload
6. Send callback to Convex with HMAC

Done when:

- Worker can parse sample `Backup.db` and send payload

---

## Step 6 - Convex callback with HMAC verification

Implement:

- `imports:submitParsedSnapshot({ batchId, parserVersion, snapshot })`
- Verify:
  - `x-import-ts`
  - `x-import-nonce`
  - `x-import-signature`
- Enforce skew window and nonce replay guard

Behavior:

- Set status `importing`
- Call `imports:importSqliteSnapshot`
- Set status `completed` or `failed`
- Persist summary + warnings

Done when:

- Full flow completes with valid signature; invalid signature is rejected

---

## Step 7 - Expo import UI

Implement:

- File picker for `.db`
- Call Worker upload-url
- Upload file to R2
- Call Convex `startImport`
- Poll `getImportStatus`
- Show summary/warnings/errors

Done when:

- User can complete import from app and see results

---

## Step 8 - QA checklist

- Happy path import works end-to-end
- Malformed DB marks batch `failed` with friendly message
- User cannot query another user's batch
- Duplicate taps with same idempotency key do not create duplicate jobs
- Refinement fields persist:
  - session: notes + laneContext
  - game: notes + laneContext + ballSwitches
  - handicap remains nullable with warning until mapped
