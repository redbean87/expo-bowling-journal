# Contributing

Thanks for contributing to the Bowling Journal app.

## Development setup

1. Install dependencies:

   `npm install`

2. Start Expo:

   `npm start`

3. Optional platform targets:
   - `npm run android`
   - `npm run ios`
   - `npm run web`

## Common commands

- `npm run typecheck`
- `npm run lint:fix`
- `npm run format:check`
- `npm test`
- `npm run test:import`
- `npm --prefix worker run check`
- `npm run build:web`
- `npm run deploy:web`
- `npm run deploy:web:prod`

## Web deploy workflow (EAS Hosting)

- Preview deploy:
  1. `eas env:pull --environment preview`
  2. `npm run build:web`
  3. `npm run deploy:web`
- Production deploy:
  1. `eas env:pull --environment production`
  2. `npm run build:web`
  3. `npm run deploy:web:prod`

`npm run build:web` automatically rewrites `public/sw.js` with a unique build id so in-app PWA update prompts can detect each new deploy.

Environment policy:

- `preview` includes `EXPO_PUBLIC_CONVEX_URL` only
- `production` includes `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_IMPORT_WORKER_URL`

## Engineering conventions

- Use functional React components and hooks
- Keep screen routes focused on orchestration
- Extract larger UI blocks into smaller components
- Prefer `type` over `interface`
- Avoid `any` unless unavoidable
- Use kebab-case for file names

## Default session workflow

Unless a task explicitly says otherwise:

1. Read `AGENTS.md`, `CONTRIBUTING.md`, and `ROADMAP.md`
2. Continue with the top unchecked item in `## Todo` from `ROADMAP.md`
3. Follow import pipeline guardrails when import code is touched

For frontend iteration, keep current baseline screenshots in `docs/ux-reference/current-app/` and target visual references in `docs/ux-reference/next-app/`.

For roadmap execution updates, report in this order:

1. Brief plan
2. Implementation progress
3. Exact validation commands with pass/fail results
4. Proposed commit message(s)

## Import pipeline rules

- Use callback payload `snapshotJson` for large import payloads
- Do not send both `snapshot` and `snapshotJson`
- Snapshot payload is only valid for callback stage `importing`
- Preserve status transitions: `queued -> parsing -> importing -> completed|failed`
- Persist `importRawFrames` in callback import flow using chunked writes to avoid write-cap regressions
- Canonical `frames` persistence in callback import path must use chunked writes to avoid Convex write-cap regressions
- No additional time-based retention policy is applied right now; replace-all import remains the lifecycle boundary for user-owned normalized and raw import data
- Add/update regression tests when changing import callback behavior

## Before opening a PR

1. Run `npm run format:check`
2. Run `npm run lint:fix`
3. Run `npm run typecheck`
4. Run `npm test` or `npm run test:import`
5. Run `npm --prefix worker run check` if worker files changed
6. Update `ROADMAP.md` when a roadmap item is completed

## Offline contract docs

- Source of truth: `docs/offline-support-contract.md`
- When offline behavior changes, update both `docs/offline-support-contract.md` and `ROADMAP.md` in the same workstream

## Commit style

- Keep commits small and scoped to one logical change
- Use descriptive commit messages with intent
- Include tests with behavior changes
