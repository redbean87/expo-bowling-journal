# Library Reference

This file documents the main libraries used in Bowling Journal and the project conventions we follow for each.

## Expo + React Native

- **Library**: `expo`, `react-native`, `react`, `react-dom`, `react-native-web`
- **Version**: Expo SDK 54, RN 0.81, React 19
- **Docs**:
  - https://docs.expo.dev/
  - https://reactnative.dev/docs/getting-started
- **Used for**: app runtime, native/web targets, platform APIs
- **Project conventions**:
  - Keep mobile-first layouts and one-hand-friendly interactions
  - Use functional components with hooks only
  - Keep route screens focused on orchestration; extract larger UI blocks

## Expo Router

- **Library**: `expo-router`
- **Version**: `~6.0.13`
- **Docs**: https://docs.expo.dev/router/introduction/
- **Used for**: file-based routing, tabs/stacks, route groups, deep links
- **Project conventions**:
  - Keep route files in `app/` thin (import/export screen components)
  - Use route groups for app shell structure (`(auth)`, `(app)`, `(tabs)`)
  - Keep hierarchy explicit for journal flow (`league -> session -> game`)

## Convex + Convex Auth

- **Library**: `convex`, `@convex-dev/auth`, `@auth/core`
- **Version**: `convex@^1.31.7`, `@convex-dev/auth@^0.0.90`
- **Docs**:
  - https://docs.convex.dev/
  - https://labs.convex.dev/auth
- **Used for**: backend data model, queries/mutations/actions, auth/session state
- **Project conventions**:
  - Keep backend details behind hooks/services (`src/hooks/journal`, `src/services/journal`)
  - Skip auth-protected queries when unauthenticated
  - Keep import callback guardrails intact (`snapshotJson`, status transitions, chunked writes)

## Expo Secure Store

- **Library**: `expo-secure-store`
- **Version**: `^15.0.8`
- **Docs**: https://docs.expo.dev/versions/latest/sdk/securestore/
- **Used for**: native token storage via `src/auth/token-storage.ts`
- **Project conventions**:
  - Native uses Secure Store; web uses `localStorage`
  - Keep token storage abstraction in one place

## Expo Document Picker

- **Library**: `expo-document-picker`
- **Version**: `^14.0.8`
- **Docs**: https://docs.expo.dev/versions/latest/sdk/document-picker/
- **Used for**: backup file selection in import flow
- **Project conventions**:
  - Import UI stays in Profile flow
  - Validate user auth and worker env before starting uploads

## Quality Tooling

- **Libraries**: `typescript`, `eslint`, `prettier`, `@typescript-eslint/*`
- **Docs**:
  - https://www.typescriptlang.org/docs/
  - https://eslint.org/docs/latest/
  - https://prettier.io/docs/
- **Used for**: type safety, linting, formatting
- **Project conventions**:
  - Run `npm run typecheck`, `npm run lint:fix`, `npm run format:check` before PRs
  - Prefer strict typing and avoid `any` shortcuts

## Quick Notes for Agents

- Prefer repo conventions over generic library defaults when there is a conflict.
- Preserve existing visual language unless the task explicitly asks for a redesign.
- Do not add new dependencies without discussion.
