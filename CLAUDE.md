# Bowling Journal App - Claude Guidelines

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
- **Node**: 20.x

## Project Structure

```
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
- Use default exports for screens
- Use named exports for reusable components
- Keep components focused and single-purpose
- Extract pure functions to utility files (avoid recreating functions on every render)

### Component Organization

**Screen Files**: Keep main screen files clean and focused on orchestration. Screen files should:

- Be under 150 lines when possible
- Primarily handle data fetching and state management
- Compose smaller components together
- Avoid complex JSX structures or inline conditional rendering

**When to Extract Components**:

- Any JSX block over 30 lines should be considered for extraction
- Repeated UI patterns across screens → extract to `src/components/`
- Screen-specific UI sections → extract to `src/screens/<screen-name>/`
- Complex conditional rendering → use an `EmptyState`-style component pattern

**Component Structure Examples**:

```text
src/components/
  ui/card.tsx              # Reusable Card & PressableCard
  ui/button.tsx            # Reusable Button

src/screens/
  analytics-screen.tsx     # Main screen (orchestrates sub-components)
  home/
    home-header.tsx        # Screen-specific header
```

**Avoid Ternaries for Conditional Rendering**: Prefer dedicated components or early returns for empty states:

```tsx
// ❌ Avoid
{data.length === 0 ? <EmptyView /> : <ListView data={data} />}

// ✅ Prefer — extract to a component or use early return
if (!data.length) return <EmptyView />;
return <ListView data={data} />;
```

### TypeScript

- Define domain types in `src/types/`
- Use strict typing — avoid `any` when possible
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

- Components should not reveal underlying frameworks or libraries
- Abstract backend services behind generic hooks (e.g., `useLeagues` not `useConvexLeagues`)
- Keep implementation details in dedicated files; expose clean interfaces to consumers

### Naming Conventions

- **Files**: kebab-case (e.g., `analytics-screen.tsx`, `use-leagues.ts`)
- **Components/Types**: PascalCase (e.g., `AnalyticsScreen`, `GameScore`)
- **Functions/Variables/Hooks**: camelCase (e.g., `useLeagueAnalytics`, `computePersonalRecords`)

## Don'ts

- Don't use class components
- Don't add unnecessary dependencies without discussion
- Don't use inline styles — use `StyleSheet.create`
- Don't store sensitive data (API keys, credentials) in code
- Don't use `any` type unless absolutely necessary
- Don't over-comment code — prefer self-documenting code with clear naming
- Don't bypass the offline queue for journal mutations

## Common Commands

```bash
npm start           # Start Expo dev server (LAN)
npm run android     # Run on Android
npm run ios         # Run on iOS
npm run web         # Run on web
npm run convex:dev  # Start Convex backend dev server
```

## Feature Completion Checklist

Before marking a feature complete:

1. Run `npm run check` — runs typecheck + lint + format:check in one shot
   - Or individually: `npm run typecheck`, `npm run lint`, `npm run format:check`
2. Run `npm test` — all tests pass
3. Test on device/simulator — verify UI works correctly on iOS and Android
4. Verify real-time sync — test with Convex dev server running (`npm run convex:dev`)
5. Commit with a descriptive message
