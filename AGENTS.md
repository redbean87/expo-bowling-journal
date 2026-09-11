# Bowling Journal App - Agent Guidelines

Agent concurrency policy:

- Do not spawn subagents by default.
- Work as a single agent unless parallelization is clearly necessary and explicitly approved.
- If subagents are used, limit execution to one active subagent at a time.
- Do not run multiple model-generation tasks concurrently against the shared Ollama server.
- Do not delegate repository modifications to multiple agents simultaneously.
- Prefer sequential investigation, implementation, and verification.
- Before spawning a subagent, explain why it is necessary and what resource or file scope it will use.

## Project Overview

A mobile bowling journal app built with Expo/React Native for tracking games, sessions, and analyzing bowling performance.

## Tech Stack

- **Framework**: Expo SDK 54 / React Native 0.81
- **Language**: TypeScript
- **UI**: Custom components (`src/components/ui/`) built on React Native primitives
- **Icons**: `@expo/vector-icons` (MaterialIcons)
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context API + Convex real-time hooks
- **Backend**: Convex (cloud database + auth + real-time sync)
- **Auth**: `@convex-dev/auth`
- **Charting**: `react-native-svg-charts` + `d3-shape` (patched for React 19)
- **Storage**: `@react-native-async-storage/async-storage`
- **Import Worker**: Cloudflare Worker + R2 + Queue
- **Node**: 20.x

## Project Structure

```text
app/
  _layout.tsx              # Root layout (providers)
  index.tsx                # Landing/redirect
  (auth)/
    sign-in.tsx            # Sign-in screen
  (app)/
    _layout.tsx            # Authenticated root
    (tabs)/
      _layout.tsx          # Tab navigator
      home.tsx             # Home tab
      analytics.tsx        # Analytics tab
      profile.tsx          # Profile tab
      journal/             # Journal stack navigator
        index.tsx          # Leagues list
        [leagueId]/sessions/
          [sessionId]/games/
            index.tsx      # Games list
            [gameId].tsx   # Game editor
convex/                    # Convex backend (queries, mutations, schema)
src/
  auth/                    # Authentication utilities & secure storage
  components/              # Reusable components (used across multiple screens)
    layout/
      screen-layout.tsx    # Standard screen wrapper
    navigation/
      app-tab-bar.tsx      # Custom bottom tab bar
    ui/                    # Core UI primitives (Button, Card, Input, FAB)
  config/                  # App configuration & preferences storage
  convex/
    functions.ts           # Typed Convex function references (makeFunctionReference)
  hooks/
    journal/               # Domain-specific hooks (use-leagues, use-sessions, use-games, etc.)
  providers/
    app-provider.tsx       # Root provider tree
    preferences-provider.tsx  # Theme/layout preferences context
    game-save-queue-syncer.tsx  # Offline queue sync
  screens/                 # Screen components (re-exported by app/ routes)
    <screen-name>/         # Screen-specific sub-components (co-located)
  services/
    journal/
      convex-journal-service.ts  # Service map of Convex queries/mutations
  theme/
    tokens.ts              # Design tokens (spacing, typeScale, radius, ThemeColors)
    use-app-theme.ts       # Theme hook with color mode resolution
  types/                   # TypeScript domain types
  utils/                   # Utility functions (analytics-stats.ts, etc.)
tests/                     # Test files
worker/                    # Cloudflare Worker for data imports
```

## Code Style

### Components

- Use functional components with hooks
- Use default exports for screen route components
- Use named exports for reusable components
- Keep components focused and single-purpose
- Extract pure functions to utility files when logic grows (avoid recreating functions on every render)

### Component Organization

**Screen files** should stay focused on orchestration:

- Keep screen files under ~150 lines when practical
- Primarily handle data fetching and state management
- Compose smaller child components together
- Avoid deeply nested conditional JSX in screen files
- Avoid complex JSX structures or inline conditional rendering

**When to extract components**:

- JSX blocks over ~30 lines should be candidates for extraction
- Repeated patterns across screens → `src/components/`
- Screen-only sections → `src/screens/<screen-name>/`
- Complex conditional rendering → use an `EmptyState`-style component pattern

**Avoid Ternaries for Conditional Rendering**: Prefer dedicated components or early returns for empty states:

```tsx
// ❌ Avoid
{
  data.length === 0 ? <EmptyView /> : <ListView data={data} />;
}

// ✅ Prefer — extract to a component or use early return
if (!data.length) return <EmptyView />;
return <ListView data={data} />;
```

### Codebase Size Guardrails

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
- Define domain types in `src/types/`
- Always use `type` instead of `interface`

### State Management

- **Server state**: Use Convex `useQuery` / `useMutation` hooks; guard with `'skip'` when auth not ready
- **Theme/layout preferences**: Read from `PreferencesContext` (`src/providers/preferences-provider.tsx`)
- **Local UI state**: `useState` / `useCallback` / `useReducer` in the component or custom hook
- **Offline writes**: Journal mutations go through the offline queue — do not bypass `convex-journal-service`

### Theme & Styles

- Never use inline styles — always use `StyleSheet.create`
- Compute styles with `useMemo(() => createStyles(colors), [colors])` pattern
- Use design tokens from `src/theme/tokens.ts`:
  - **Spacing**: xs=4, sm=8, md=12, lg=16, xl=20, xxl=28
  - **Type scale**: bodySm=13, body=14, bodyLg=15, titleSm=16, title=20, hero=26
  - **Radius**: sm=8, md=10, lg=12, xl=16

### Abstraction

- Keep backend details behind domain services/hooks
- Avoid leaking Convex or worker implementation details into UI components
- Keep import pipeline helpers in focused modules (`convex/lib`, `worker/src`)
- Components should not reveal underlying frameworks or libraries
- Abstract backend services behind generic hooks (e.g., `useLeagues` not `useConvexLeagues`)
- Keep implementation details in dedicated files; expose clean interfaces to consumers

### Naming Conventions

- **Files**: kebab-case (`profile-screen.tsx`, `import-warning-summary.ts`, `analytics-screen.tsx`, `use-leagues.ts`)
- **Components/Types**: PascalCase (`ProfileScreen`, `ImportStatus`, `AnalyticsScreen`, `GameScore`)
- **Functions/Variables/Hooks**: camelCase (`useImportBackup`, `loadGames`, `useLeagueAnalytics`, `computePersonalRecords`)

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
- Don't use inline styles — use `StyleSheet.create`
- Don't store sensitive data (API keys, credentials) in code
- Don't use `any` type unless absolutely necessary
- Don't over-comment code — prefer self-documenting code with clear naming
- Don't bypass the offline queue for journal mutations

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

1. Run `npm run check` — runs typecheck + lint + format:check in one shot
   - Or individually: `npm run typecheck`, `npm run lint`, `npm run format:check`
2. Run `npm test` — all tests pass
3. Run `npm run format:check`
4. Run `npm run lint:fix`
5. Run `npm run typecheck`
6. Run `npm test` or targeted suite like `npm run test:import`
7. Run `npm --prefix worker run check` when worker code changes
8. Validate app behavior on device/simulator for UI changes
9. Update `ROADMAP.md`
10. Keep commits small and descriptive
11. Test on device/simulator — verify UI works correctly on iOS and Android
12. Verify real-time sync — test with Convex dev server running (`npm run convex:dev`)

## Offline Contract Documentation

- Source of truth: `docs/offline-support-contract.md`
- When offline behavior changes, update both `docs/offline-support-contract.md` and `ROADMAP.md` in the same workstream

## Common Commands

```bash
npm start           # Start Expo dev server (LAN)
npm run android     # Run on Android
npm run ios         # Run on iOS
npm run web         # Run on web
npm run convex:dev  # Start Convex backend dev server
```
