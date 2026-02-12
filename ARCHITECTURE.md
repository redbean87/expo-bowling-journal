# Architecture Overview

## Current Architecture: Expo App + Convex Backend + Import Worker

The Bowling Journal app uses a mobile-first architecture with real-time cloud sync and an asynchronous SQLite import pipeline.

- **Expo/React Native app** handles UI, auth-gated flows, and local interaction
- **Convex** handles application data, auth, server logic, and status transitions
- **Cloudflare Worker** handles backup upload, SQLite parsing, and signed callbacks
- **R2 + Queue** provide durable upload storage and background processing

## System Context

```text
Mobile/Web App (Expo Router)
  -> Convex queries/mutations/actions (journal + auth + import orchestration)
  -> Cloudflare Worker endpoints (upload URL, upload, queue/process)
     -> R2 object storage (backup .db)
     -> Queue consumer parses SQLite and calls Convex callback
```

Key callback/import status flow:

`queued -> parsing -> importing -> completed | failed`

## App Layer

### Navigation and Composition

- **Router**: Expo Router file-based routes in `app/`
- **Root provider**: [src/providers/app-provider.tsx](src/providers/app-provider.tsx)
  - Initializes `ConvexReactClient`
  - Wraps app with `ConvexAuthProvider`
  - Uses secure token storage abstraction
- **Tabs**: Home, Journal, Profile under `app/(tabs)/`
- **Game editor route**: `app/game/[gameId].tsx` for create/edit game flows

### Screen Orchestration Pattern

Screens coordinate hooks and UI state while backend details stay in hooks/services:

- [src/screens/home-screen.tsx](src/screens/home-screen.tsx)
- [src/screens/journal-screen.tsx](src/screens/journal-screen.tsx)
- [src/screens/profile-screen.tsx](src/screens/profile-screen.tsx)
- [src/screens/game-editor-screen.tsx](src/screens/game-editor-screen.tsx)

### Domain Hooks and Service Abstraction

Hooks in `src/hooks/journal/` wrap Convex functions via the journal service map:

- `useLeagues`, `useSessions`, `useGames`, `useGameEditor`, `useImportBackup`
- Service mapping lives in [src/services/journal/convex-journal-service.ts](src/services/journal/convex-journal-service.ts)
- Typed function references live in [src/convex/functions.ts](src/convex/functions.ts)

This keeps screens decoupled from direct Convex module names and supports future backend adaptation behind the service layer.

## Data Layer (Convex)

### Core Journal Tables

Defined in [convex/schema.ts](convex/schema.ts):

- `leagues`
- `sessions`
- `games`
- `frames`
- Reference/support tables: `balls`, `houses`, `patterns`

### Import Tables

- Batch/state tables: `importBatches`, `importCallbackNonces`
- Raw mirror tables: `importRawHouses`, `importRawPatterns`, `importRawBalls`, `importRawLeagues`, `importRawWeeks`, `importRawGames`, `importRawFrames`

### Convex Modules

- [convex/leagues.ts](convex/leagues.ts): league list/create
- [convex/sessions.ts](convex/sessions.ts): session list/create by league
- [convex/games.ts](convex/games.ts): game list/get/create/update
- [convex/frames.ts](convex/frames.ts): frame replacement + score/stat recomputation
- [convex/imports.ts](convex/imports.ts): import lifecycle, cleanup, chunked persistence, refinement
- [convex/http.ts](convex/http.ts): signed import callback endpoint
- [convex/users.ts](convex/users.ts): viewer identity query

## Import Pipeline Architecture

### 1) Client Initiation

Profile flow (`useImportBackup`) does:

1. Request signed upload URL from worker (`POST /imports/upload-url`)
2. Upload SQLite backup to worker (`PUT /imports/upload`)
3. Start Convex import batch via `imports:startImport`

### 2) Dispatch and Queue

- Convex `startImport` validates request/idempotency and creates `importBatches` in `queued`
- Convex internal action signs and dispatches request to worker queue endpoint
- Worker enqueues or inline-processes based on configured queue path (`/imports/queue` or `/imports/process`)

### 3) Parse and Callback

- Worker reads backup from R2
- Worker parses SQLite using `sql.js`
- Worker sends signed callback updates to Convex `POST /api/import-callback`

### 4) Import Execution

Callback path in Convex:

- Verifies HMAC signature, timestamp skew, and nonce replay protection
- Enforces valid stage transition rules
- Accepts parsed payload on `importing` stage (`snapshot` or `snapshotJson`, mutually exclusive)
- Performs replace-all cleanup in bounded chunks
- Persists raw import mirrors in chunked writes
- Persists canonical `frames` in chunked writes
- Runs refinement pass (lane context, notes, ball switches, etc.)
- Finalizes batch counts/warnings and sets status terminal state

## Authentication and Security

- **Provider**: Convex Auth Password provider in [convex/auth.ts](convex/auth.ts)
- **Client integration**: [src/providers/app-provider.tsx](src/providers/app-provider.tsx)
- **Token storage**: [src/auth/token-storage.ts](src/auth/token-storage.ts)
  - Native: Expo Secure Store
  - Web: localStorage
- **UI gate**: [src/components/auth-gate.tsx](src/components/auth-gate.tsx)

Import security controls include:

- Signed worker queue requests (HMAC)
- Signed worker -> Convex callbacks (HMAC)
- Timestamp skew checks
- Nonce replay prevention
- User-scoped `r2Key` validation

## State and Sync Model

- **Server/data state**: Convex queries and mutations with real-time updates
- **UI state**: React component/hook state in screen-level orchestration
- **Auth-aware query behavior**: hooks skip Convex queries when unauthenticated
- **Derived game stats**: recomputed server-side when frames are replaced

This repo currently does not use Zustand stores for app state.

## Development Workflow

Typical local development:

```bash
# Terminal 1
npm run convex:dev

# Terminal 2
npm start
```

Import worker local testing:

```bash
npm run worker:dev
```

Additional setup and commands:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [worker/README.md](worker/README.md)
- [ROADMAP.md](ROADMAP.md)
