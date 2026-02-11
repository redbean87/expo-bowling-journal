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
2. Continue with the top unchecked item in `## Next` from `ROADMAP.md`
3. Follow import pipeline guardrails when import code is touched

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
- Do not reintroduce `importRawFrames` persistence in v1 path
- Canonical `frames` persistence in callback import path must use chunked writes to avoid Convex write-cap regressions
- Add/update regression tests when changing import callback behavior

## Before opening a PR

1. Run `npm run format:check`
2. Run `npm run lint:fix`
3. Run `npm run typecheck`
4. Run `npm test` or `npm run test:import`
5. Run `npm --prefix worker run check` if worker files changed
6. Update `ROADMAP.md` when a roadmap item is completed

## Commit style

- Keep commits small and scoped to one logical change
- Use descriptive commit messages with intent
- Include tests with behavior changes
