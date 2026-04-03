# Plan: Journal Flow — Leagues, Tournaments & Open Bowling

## Context

The journal currently treats all entries as "leagues" with a flat list and a binary `isOpenBowling` flag that is only set during PinPal imports. Users have no way to create a tournament or explicitly add open bowling, and there's no visual distinction between the three types anywhere in the app.

This plan introduces a proper `type` field (`'league' | 'tournament' | 'open'`), groups the journal entry screen by type, adds a type picker to the creation form, and adjusts session labels to match context (Week / Round / date).

---

## Phase 1 — Backend (Convex)

### `convex/schema.ts`

Add optional `type` field to `leagues` table alongside `isOpenBowling` (keep both — no breaking change):

```ts
type: v.optional(v.union(v.literal('league'), v.literal('tournament'), v.literal('open'))),
```

### `convex/leagues.ts`

- `create` mutation: accept optional `type?: 'league' | 'tournament' | 'open'`, write `type: args.type ?? 'league'`
- `update` mutation: accept optional `type?: 'league' | 'tournament'`

### `convex/lib/import_core_runner.ts`

When auto-creating the Open Bowling virtual league, also write `type: 'open'` to keep new imports clean.

### `convex/exports.ts`

Update the open bowling filter to catch both old and new rows:

```ts
leagues.filter((l) => l.isOpenBowling || l.type === 'open');
```

---

## Phase 2 — Type System & Service Layer

### `src/utils/league-type-utils.ts` _(new file)_

Single source of truth for resolving and labeling league types:

```ts
export type LeagueType = 'league' | 'tournament' | 'open';
export function resolveLeagueType(league): LeagueType; // handles old isOpenBowling and new type field
export function leagueTypeLabel(type: LeagueType): string; // "League" / "Tournament" / "Open Bowling"
export function sessionLabel(
  weekNumber: number | null,
  type: LeagueType
): string;
// league → "Week X", tournament → "Round X", open → "Session"
```

### `src/services/journal/types/mutations.ts`

- Add `leagueType?: 'league' | 'tournament'` to `CreateLeagueInput` (no `'open'` — Open Bowling gets its own creation path)
- Export `LeagueType` from here

### `src/convex/functions.ts`

Update `leaguesCreateMutation` and `leaguesUpdateMutation` type signatures to include `type?: 'league' | 'tournament'`.

### `src/hooks/journal/use-leagues.ts`

- Thread `leagueType` → `type` into `createLeague` and `updateLeague` mutation calls
- Add `createOpenBowlingLeague()` helper that creates with `type: 'open'` directly (bypasses the `'open'` exclusion in `CreateLeagueInput`)

---

## Phase 3 — `DisplayLeague` Type & Grouping

### `src/screens/journal-leagues-screen.tsx`

**`DisplayLeague` type** — add `leagueType: LeagueType`.

**`displayLeagues` memo** — set `leagueType` using `resolveLeagueType(league)` for server entries, `entry.payload.leagueType ?? 'league'` for drafts.

**Grouping** — derive three groups from `displayLeagues`:

```ts
const openBowlingLeague =
  displayLeagues.find((l) => l.leagueType === 'open') ?? null;
const regularLeagues = displayLeagues.filter((l) => l.leagueType === 'league');
const tournaments = displayLeagues.filter((l) => l.leagueType === 'tournament');
```

**JSX layout** — replace flat `displayLeagues.map(...)` with:

1. `<OpenBowlingCard>` — always rendered at top
2. Leagues section (hidden when empty) with `<LeagueSectionHeader title="Leagues" />`
3. Tournaments section (hidden when empty) with `<LeagueSectionHeader title="Tournaments" />`

**Empty state** — update "No leagues yet" text to "Tap + to add a league or tournament."

**`onCreateLeague`** — pass `leagueType` through to `createLeague()` and `createQueuedLeagueCreateEntry()`.

**League type state** — add `const [leagueType, setLeagueType] = useState<'league' | 'tournament'>('league')` and reset on close.

### Action sheet / context menu

Update "Edit league" label to match the type: "Edit league" / "Edit tournament". Update delete confirmation message similarly.

---

## Phase 4 — New UI Components

### `src/screens/journal/components/open-bowling-card.tsx` _(new)_

- Full-width `PressableCard`
- Shows bowling icon (`MaterialIcons name="sports-score"`) + "Open Bowling" title
- If no league exists: subtitle "Tap to start a session" — on press calls `createOpenBowlingLeague()` then navigates to sessions
- If league exists: shows most recent session date

### `src/screens/journal/components/league-section-header.tsx` _(new)_

Lightweight section label (uppercase, `typeScale.bodySm`, `colors.textSecondary`) to separate Leagues and Tournaments groups.

### `src/screens/journal/components/league-row-card.tsx`

- Accept `leagueType: LeagueType` prop
- Render a small type chip for tournaments only (`MaterialIcons name="emoji-events"` + "Tournament" text in `colors.accent`)
- Regular leagues: no chip (they're the default, no noise needed)

### `src/screens/journal/components/league-form-modal.tsx`

- In `mode === 'create'`: render a two-option segmented picker above the name field ("League" / "Tournament")
- In `mode === 'edit'`: show current type as read-only text (no picker — type-changing post-creation is deferred)
- Pass `leagueType` / `onLeagueTypeChange` as props

---

## Phase 5 — Session Labels

### `src/screens/journal-sessions-screen.tsx`

Compute `leagueType` from the selected league using `resolveLeagueType`. Pass to `SessionList` component.

### Session list component

Replace `formatSessionWeekLabel(weekNumber)` calls with `sessionLabel(weekNumber, leagueType)` from utils.

For open bowling sessions: show just the date as the primary label (suppress the "Week/Round" prefix entirely since it's a freeform log).

---

## Phase 6 — Analytics

### `src/screens/analytics-screen.tsx`

- Default selection: prefer leagues with `resolveLeagueType(l) === 'league'` before falling back to first available
- League picker: show type badge next to each league name (`leagueTypeLabel()`) so user can distinguish all three types

---

## Critical Files

| File                                                       | Change                                              |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `convex/schema.ts`                                         | Add `type` field to leagues table                   |
| `convex/leagues.ts`                                        | Accept/persist `type` in create/update              |
| `convex/lib/import_core_runner.ts`                         | Write `type: 'open'` on import                      |
| `convex/exports.ts`                                        | Update open bowling filter                          |
| `src/utils/league-type-utils.ts`                           | **New** — type resolver + labels                    |
| `src/screens/journal-leagues-screen.tsx`                   | Grouping logic, type state, wired to new components |
| `src/screens/journal/components/league-form-modal.tsx`     | Type picker in create mode                          |
| `src/screens/journal/components/league-row-card.tsx`       | Tournament chip                                     |
| `src/screens/journal/components/open-bowling-card.tsx`     | **New** — always-visible open bowling entry         |
| `src/screens/journal/components/league-section-header.tsx` | **New** — section label                             |
| `src/services/journal/types/mutations.ts`                  | `leagueType` on create/update inputs                |
| `src/convex/functions.ts`                                  | Update mutation type signatures                     |
| `src/hooks/journal/use-leagues.ts`                         | Thread type, add `createOpenBowlingLeague()`        |
| `src/screens/journal-sessions-screen.tsx`                  | Pass `leagueType` down                              |
| `src/screens/analytics-screen.tsx`                         | Smart default + type badges in picker               |

---

## What NOT to Change

- Route structure (`[leagueId]/sessions` path works for all types)
- Sessions / games / frames schema — no changes needed
- `useSessionQueue`, `useGameEditor`, `useSessions`, `useGames` hooks
- Offline queue syncer
- Import runner detection logic (`isOpenBowling` filter remains)

---

## Verification

1. `npm run check` — typecheck + lint + format
2. `npm test`
3. Create a League → appears in "Leagues" section
4. Create a Tournament → appears in "Tournaments" section with trophy chip
5. Tap Open Bowling card with no existing open bowling → creates league, navigates to sessions
6. Sessions screen for a tournament shows "Round X" labels; league shows "Week X"; open bowling shows date only
7. Analytics tab defaults to a regular league, type badges visible in picker
8. Import PinPal data with open bowling sessions → open bowling card appears and is navigable
9. Export still excludes open bowling correctly
