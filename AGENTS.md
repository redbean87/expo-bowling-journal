# Bowling Journal App - Agent Guidelines

## Project Overview

A mobile bowling journal app built with Expo/React Native for tracking games and import workflows.

## Tech Stack

- **Framework**: Expo SDK 54 / React Native 0.81
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **Backend**: Convex (cloud database + auth + real-time sync)
- **Import Worker**: Cloudflare Worker + R2 + Queue
- **Node**: 20.x

## Project Structure

```text
app/
  _layout.tsx
  (tabs)/
  auth/
src/
  components/
  config/
  hooks/
  providers/
  screens/
  services/
  theme/
  types/
  utils/
convex/
  *.ts
  lib/
worker/
  src/
  wrangler.toml
docs/
  *.md
scripts/
  *.mjs
```

## Code Style

### Components

- Use functional components with hooks
- Use default exports for screen route components
- Use named exports for reusable components
- Keep components focused and single-purpose
- Extract pure functions to utility files when logic grows

### Component Organization

**Screen files** should stay focused on orchestration:

- Keep screen files under ~150 lines when practical
- Prefer composing smaller child components
- Avoid deeply nested conditional JSX in screen files

**When to extract components**:

- JSX blocks over ~30 lines should be candidates for extraction
- Repeated patterns across screens -> `src/components/`
- Screen-only sections -> `src/screens/<screen-name>/`

## Codebase Size Guardrails

Detailed reference: `docs/code-health-guardrails.md`

Use these thresholds to prevent large-file regressions:

- **Ideal**: Keep most implementation files at or below ~200 lines.
- **Review threshold**: At ~250 lines, prefer extraction before adding more logic.
- **Hard-stop threshold**: At 400+ lines, do not continue adding logic without splitting first.

When touching larger files:

- If a touched file is already above ~250 lines and the change adds meaningful new logic, include extraction in the same workstream when practical.
- If immediate extraction is unsafe for scope/timing, add a concrete follow-up item to `ROADMAP.md` in the same workstream.
- Keep screen route files orchestration-focused; business logic belongs in hooks/services/utilities.
- When extracting, keep behavior unchanged and add/update focused regression tests.

### TypeScript

- Use strict typing; avoid `any` unless unavoidable
- Prefer `type` over `interface`
- Keep shared app types in `src/types/`
- Keep Convex mutation/query args explicitly typed and validated

### Abstraction

- Keep backend details behind domain services/hooks
- Avoid leaking Convex or worker implementation details into UI components
- Keep import pipeline helpers in focused modules (`convex/lib`, `worker/src`)

### Naming Conventions

- **Files**: kebab-case (`profile-screen.tsx`, `import-warning-summary.ts`)
- **Components/Types**: PascalCase (`ProfileScreen`, `ImportStatus`)
- **Functions/Variables/Hooks**: camelCase (`useImportBackup`, `loadGames`)

## Import Pipeline Guardrails

- Use `snapshotJson` transport for importing-stage callback payloads
- Treat `snapshot` and `snapshotJson` as mutually exclusive
- Allow snapshot payload only on `stage: importing`
- Preserve status transition rules (`queued -> parsing -> importing -> completed|failed`)
- Persist `importRawFrames` in callback import flow using chunked writes to avoid write-cap regressions
- No additional time-based retention policy is applied right now; replace-all import remains the lifecycle boundary for user-owned normalized and raw import data
- Add or update regression tests when changing callback/import behavior

## Don'ts

- Don't use class components
- Don't add unnecessary dependencies without discussion
- Don't store secrets in source files
- Don't use `any` as a shortcut
- Don't add comments that restate obvious code

## Default Session Workflow

Unless the user explicitly asks for a different workflow, start each coding session by:

1. Reading `AGENTS.md`, `CONTRIBUTING.md`, and `ROADMAP.md`
2. Continuing with the top unchecked item in `## Todo` from `ROADMAP.md`
3. Following existing import pipeline guardrails when import code is touched

When reporting progress for roadmap execution, use this response structure:

1. Brief plan
2. Implementation progress
3. Exact validation commands with pass/fail results
4. Proposed commit message(s)
5. Manual test step(s) for the user to run

## Feature Completion Checklist

Before marking a feature complete:

1. Run `npm run format:check`
2. Run `npm run lint:fix`
3. Run `npm run typecheck`
4. Run `npm test` or targeted suite like `npm run test:import`
5. Run `npm --prefix worker run check` when worker code changes
6. Validate app behavior on device/simulator for UI changes
7. Update `ROADMAP.md`
8. Keep commits small and descriptive

## Offline Contract Documentation

- Source of truth: `docs/offline-support-contract.md`
- When offline behavior changes, update both `docs/offline-support-contract.md` and `ROADMAP.md` in the same workstream
