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

## Import pipeline rules

- Use callback payload `snapshotJson` for large import payloads
- Do not send both `snapshot` and `snapshotJson`
- Snapshot payload is only valid for callback stage `importing`
- Preserve status transitions: `queued -> parsing -> importing -> completed|failed`
- Do not reintroduce `importRawFrames` persistence in v1 path
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
