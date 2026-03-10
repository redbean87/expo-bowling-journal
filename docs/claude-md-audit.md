# CLAUDE.md Compliance Audit

Tracking progress against the guidelines in `CLAUDE.md`.

---

## ✅ Passing (no action needed)

- `type` vs `interface` — zero `interface` declarations
- File naming (kebab-case) — compliant throughout
- Component/hook/function naming (PascalCase / camelCase) — compliant
- Default exports for screens, named exports for components — compliant
- Hook abstraction — no raw `useQuery`/`useMutation` in screens
- Offline queue — no mutations bypass `convex-journal-service`
- Comment overuse — code is self-documenting
- `any` usage — 1 justified exception (`webHandlers: any` in `analytics-screen.tsx`, ESLint-disabled, needed for web mouse events)

---

## ❌ Violations

### 1. Skip guards — Low risk · Quick win

Guard Convex queries with `'skip'` when auth not ready.

- [x] `src/screens/profile-screen.tsx:41` — `useQuery(viewerQuery)` missing skip guard
- [x] `src/components/auth-gate.tsx:23` — `useQuery(viewerQuery)` missing skip guard

---

### 2. Inline styles in analytics-screen — High

Move 37 `style={{}}` objects into the existing `createStyles` function.

- [x] `src/screens/analytics-screen.tsx` — 37 inline style violations

---

### 3. Conditional rendering ternaries — Medium

Replace multi-line JSX ternaries with early returns or extracted components.

- [x] `src/screens/journal-sessions-screen.tsx` — season stats card extracted to `<SeasonStatsCard />`
- [x] `src/screens/analytics-screen.tsx` — chained ternary replaced with `<AnalyticsContent />` using early returns
- [x] `src/screens/journal-games-screen.tsx` — empty-state ternaries converted to `&&`
- [x] `src/screens/journal-leagues-screen.tsx` — empty-state ternaries converted to `&&`
- [x] `src/screens/analytics-screen.tsx` — card guard ternaries converted to `&&`

---

### 4. Screen file sizes — Critical · Large effort

Guideline: screen files should be under 150 lines. Extract logic into hooks and sub-components.

| File                                               | Lines | Status |
| -------------------------------------------------- | ----- | ------ |
| `src/screens/journal-sessions-screen.tsx`          | 1268  | [ ]    |
| `src/screens/analytics-screen.tsx`                 | 991   | [ ]    |
| `src/screens/game-editor-screen.tsx`               | 985   | [ ]    |
| `src/screens/journal-games-screen.tsx`             | 937   | [ ]    |
| `src/screens/journal-leagues-screen.tsx`           | 814   | [ ]    |
| `src/screens/profile-screen.tsx`                   | 327   | [ ]    |
| `src/screens/game-editor/frame-progress-strip.tsx` | 364   | [ ]    |
| `src/screens/game-editor/series-progress-bar.tsx`  | 298   | [ ]    |
| `src/screens/journal/components/game-row-card.tsx` | 281   | [ ]    |

---

### 5. Design token hardcoding — Medium · Long tail

Use tokens from `src/theme/tokens.ts` instead of raw pixel values (~104 instances across 20+ files).

Common patterns to replace:

- `borderRadius: 10` → `radius.md` (10)
- `borderRadius: 12` → `radius.lg` (12)
- `fontSize: 9/10/11` — below type scale, use nearest token or add token
- `gap: 2/4`, `marginTop: 1/2` — below `spacing.xs` (4), likely intentional micro-spacing

Files with most violations:

- [ ] `src/screens/journal-sessions-screen.tsx`
- [ ] `src/screens/analytics-screen.tsx`
- [ ] `src/screens/game-editor/frame-progress-strip.tsx`
- [ ] `src/screens/journal/components/` (multiple files)
- [ ] `src/components/navigation/app-tab-bar.tsx`
- [ ] `src/components/navigation/app-header.tsx`
- [ ] `src/components/ui/button.tsx`
- [ ] `src/components/ui/floating-action-button.tsx`
- [ ] `src/components/ui/input.tsx`
- [ ] `src/components/form-modal.tsx`
