# Bowling Journal - React Native App

A mobile bowling journal app built with Expo/React Native for tracking league play, editing games frame-by-frame, and importing legacy backups with cloud sync.

## Features

- Track leagues, sessions, and games with live Convex-backed data
- Create and edit game frames with per-frame roll entry
- **SQLite backup import pipeline** with signed uploads and callback processing
- Monitor import progress and counts (`queued`/`parsing`/`importing`/`completed`/`failed`)
- Cloud sync across devices with Convex
- User authentication with Convex Auth (email/password)
- Service-layer abstraction for journal domain operations
- Roadmap-driven delivery for offline-first capture and analytics expansion

See [ROADMAP.md](ROADMAP.md) for planned features and upcoming work.

## Tech Stack

- **Framework**: Expo SDK 54 / React Native 0.81
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **Backend**: Convex (database + auth + real-time sync)
- **Import Worker**: Cloudflare Worker + R2 + Queue
- **Node**: 20.x

## Quick Start

### Prerequisites

- Node.js 20.x
- npm
- Expo CLI
- iOS Simulator or Android Emulator (or Expo Go)

### Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Set up environment**:

   ```bash
   cp .env.example .env
   ```

   Add required values (for example `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_IMPORT_WORKER_URL`) to `.env`.

3. **Start Convex and Expo**:

   ```bash
   # Terminal 1: Convex dev server
   npm run convex:dev

   # Terminal 2: Expo app
   npm start
   ```

4. **Open on device**:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go

## Architecture

**Mobile-first journal flow with cloud sync**

- **Service layer** keeps backend details behind domain hooks/services
- **Convex hooks + mutations** drive real-time data updates
- **Convex Auth** gates journal and import workflows by signed-in user
- **Import pipeline** routes SQLite backups through worker parsing and callback import

See [ARCHITECTURE.md](ARCHITECTURE.md) for design details and [worker/README.md](worker/README.md) for worker-specific setup.

## Project Structure

```text
app/
  _layout.tsx
  (tabs)/
    _layout.tsx
    index.tsx
    journal.tsx
    profile.tsx
  game/
    [gameId].tsx

src/
  auth/
  components/
  config/
  convex/
  hooks/
    journal/
  providers/
  screens/
  services/
  theme/

convex/
  schema.ts
  auth.ts
  auth.config.ts
  leagues.ts
  sessions.ts
  games.ts
  frames.ts
  imports.ts
  users.ts
  http.ts
  lib/

worker/
  src/
  wrangler.toml

docs/
  *.md
```

## Key Files

- [CONTRIBUTING.md](CONTRIBUTING.md) - Development workflow and conventions
- [ROADMAP.md](ROADMAP.md) - Current priorities and planned milestones
- [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture and data flow overview
- [AGENTS.md](AGENTS.md) - Agent-specific workflow and guardrails
- [docs/libraries.md](docs/libraries.md) - Library stack and project conventions
- [worker/README.md](worker/README.md) - Import worker endpoints and local setup
- [convex_data_schema_locked.md](convex_data_schema_locked.md) - Locked Convex data model reference
- [sqlite_to_convex_mapping.md](sqlite_to_convex_mapping.md) - SQLite-to-Convex import mapping notes

## Development

### Scripts

```bash
npm start                     # Start Expo dev server
npm run android               # Run Android target
npm run ios                   # Run iOS target
npm run web                   # Run web target
npm run build:web             # Export web bundle to dist/
npm run deploy:web            # Deploy preview web build (EAS Hosting)
npm run deploy:web:prod       # Deploy production web build (EAS Hosting)
npm run typecheck             # TypeScript checks
npm run lint                  # Lint code
npm run lint:fix              # Lint with autofix
npm run format                # Format with Prettier
npm run format:check          # Check formatting
npm test                      # Run full test suite
npm run test:import           # Run import-focused tests
npm --prefix worker run check # Validate worker TypeScript/lint setup
```

## Web Deployment (EAS Hosting)

This project supports web deployments through EAS Hosting with separate preview and production environments.

### One-time setup

```bash
eas login
eas init
```

### Environment variable policy

- **preview**: `EXPO_PUBLIC_CONVEX_URL` only
- **production**: `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_IMPORT_WORKER_URL`

Preview intentionally omits `EXPO_PUBLIC_IMPORT_WORKER_URL` so import uploads are disabled outside production.

### Deploy preview

```bash
eas env:pull --environment preview
npm run build:web
npm run deploy:web
```

### Deploy production

```bash
eas env:pull --environment production
npm run build:web
npm run deploy:web:prod
```

### Making Changes

1. Backend logic: update `convex/*.ts`
2. Worker/import pipeline: update `worker/src/*`
3. Frontend screens and flows: update `app/` and `src/screens/`
4. Domain hooks/services: update `src/hooks/journal/` and `src/services/journal/`

## Authentication

Convex Auth is integrated into app flows:

- Sign-in/sign-up via email/password
- Auth-gated access to live journal and import operations
- Secure token storage with Expo Secure Store

## Troubleshooting

**"Missing EXPO_PUBLIC_CONVEX_URL"**

- Ensure `.env` exists and includes `EXPO_PUBLIC_CONVEX_URL`
- Restart Expo after env changes
- For web deploys, run `eas env:pull --environment <preview|production>` before `npm run build:web`
- If a deploy still serves an old bundle, hard refresh (`Ctrl+Shift+R`) and reload

**"Missing EXPO_PUBLIC_IMPORT_WORKER_URL"**

- Add `EXPO_PUBLIC_IMPORT_WORKER_URL` to `.env`
- Confirm worker is running/reachable

**Import not progressing**

- Confirm `npx convex dev` is running
- Confirm worker is running (`npm run worker:dev`)
- Check [worker/README.md](worker/README.md) for required secrets and queue/callback setup

## Resources

- [Expo Docs](https://docs.expo.dev/)
- [Expo Router Docs](https://docs.expo.dev/router/introduction/)
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Convex Docs](https://docs.convex.dev/)
- [Convex Auth Docs](https://labs.convex.dev/auth)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)

## License

MIT
