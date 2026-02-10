# SQLite Import Worker

Cloudflare Worker that issues signed upload URLs, accepts SQLite backup uploads, and queues import jobs.

## Endpoints

- `GET /health`
- `POST /imports/upload-url`
- `PUT /imports/upload`
- `POST /imports/queue`

`POST /imports/process` is also supported as a compatibility alias for older callers.

## Local development

1. Install deps:

   `npm install`

2. Set local secrets/vars:
   - `wrangler secret put IMPORT_CALLBACK_HMAC_SECRET`
   - Set `CORS_ALLOWED_ORIGINS` in `wrangler.toml` for local origins

3. Start worker:

   `npm run dev`

## Required bindings and vars

- `R2_IMPORTS` (R2 bucket binding)
- `IMPORT_QUEUE` (queue producer binding)
- `IMPORT_CALLBACK_HMAC_SECRET` (secret)
- `CONVEX_URL` (var, callback target base URL)
- `CONVEX_IMPORT_CALLBACK_PATH` (var, callback path)
- `CORS_ALLOWED_ORIGINS` (var, comma-separated list)

## Deploy

Manual deploy:

`npm run deploy`

GitHub auto deploy is configured in `.github/workflows/worker-deploy.yml` and runs on `main` changes under `worker/**`.
test
