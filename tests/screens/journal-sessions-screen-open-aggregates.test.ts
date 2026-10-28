// C-3 T3 (bowl-c3-t3): the sessions screen's league-aggregate gating for the
// open (no-league) route — slice C-3.4, captain decision D3 ("show nothing
// for open-session aggregates").
//
// C-3 removed the synthetic Open Bowling league, so an open session carries
// a `null` SQLite `leagueId` foreign key
// (`src/services/local-journal/sqlite-local-journal-service.ts`) and reaches
// the journal UI on the documented open-session sentinel
// `LOCAL_JOURNAL_OPEN_LEAGUE_ID` (`src/services/journal/local-reads.ts:75`)
// as the `[leagueId]` Expo Router path segment. That sentinel is a route
// token, not a league, but before C-3.4 the sessions screen
// (`src/screens/journal-sessions-screen.tsx`) fed whatever `leagueId` it
// parsed straight to the two league-scoped aggregate hooks (`useLeagueGames`
// and `useLeagueAnalytics`), and
// `src/screens/journal/components/session-list.tsx` rendered its season card
// whenever `leagueId` was truthy. Those hooks are league-by-construction —
// the local service filters `WHERE leagueId = ?` with no null branch — so the
// open route drew a "Season stats" card and per-session game counts, series
// totals, averages and high games that were silently empty.
//
// This suite drives the REAL session-list component at the render seam, the
// same way the local-first profile suite renders the real profile screen:
// the component is rendered under a plain Node React runtime with the native
// UI surface remapped to the shared test doubles, and the rendered output is
// asserted. It proves the two halves of the gate:
//
// - the open route renders its session list with NO season statistics card
//   and NO per-session league statistics — even when a season summary and
//   per-session aggregates are handed to it, so the component gate alone
//   suppresses them;
// - a real league route keeps its existing season card and per-session
//   aggregates;
// - the shared `isOpenLeagueRoute` predicate — the sessions screen calls it
//   to pass no league at all to `useLeagueGames`/`useLeagueAnalytics`, and
//   the session list calls it to suppress the rendering — is true only for
//   the sentinel, and false for a real league UUID and for no league.
//
// Shared fixtures are reused unchanged: the local-first profile suite's
// `react-native` and `@/theme/use-app-theme` doubles, its `@expo/
// vector-icons/MaterialIcons` double, and `tests/db/expo-sqlite-stub.mjs`
// (the sessions screen's aggregate hooks reach the app-boundary read
// `src/services/journal/local-reads.ts`, which pulls in the SQLite-backed
// local journal service). `@/theme/tokens`, `@/components/ui`, the session
// row card, the season stats card and local-reads are deliberately NOT
// remapped: the real component, the real cards and the real sentinel must be
// what the assertions run against.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import React from 'react';

import { registerStubRemaps } from '../harness/remap';

import type { SessionNightSummary } from '../../src/screens/journal-games-night-summary';
import type { LeagueId } from '../../src/services/journal';
import type { GameId, SessionId } from '../../src/services/journal/types/core';

// The tsx runner compiles the app modules to the classic React.createElement
// runtime, which resolves `React` from scope; exposing the same instance on
// the global scope keeps that working.
Object.assign(globalThis, { React });

const require = createRequire(__filename);

const {
  renderToString,
}: {
  renderToString: (node: unknown) => string;
} = require('react-dom/server');

const stubDir = path.join(__dirname, '..', 'navigation', 'stubs');
const localFirstStub = (name: string) =>
  pathToFileURL(path.join(stubDir, 'local-first', name)).href;
const profileStub = (name: string) =>
  pathToFileURL(path.join(stubDir, 'local-first-profile', name)).href;

const stubRewrites: Record<string, string> = {
  'react-native': profileStub('react-native.mjs'),
  '@/theme/use-app-theme': profileStub('app-theme.mjs'),
  '@expo/vector-icons/MaterialIcons': localFirstStub('vector-icons.mjs'),
  'expo-sqlite': pathToFileURL(
    path.join(__dirname, '..', 'db', 'expo-sqlite-stub.mjs')
  ).href,
};

const hookHandle = registerStubRemaps(() => stubRewrites);

after(() => {
  hookHandle.deregister();
});

type SessionListModule =
  typeof import('../../src/screens/journal/components/session-list');
type LocalReadsModule = typeof import('../../src/services/journal/local-reads');
type NightSummaryModule =
  typeof import('../../src/screens/journal-games-night-summary');

let modulesPromise: Promise<{
  sessionList: SessionListModule;
  localReads: LocalReadsModule;
  nightSummary: NightSummaryModule;
}> | null = null;

// Dynamic imports so the stub remaps registered above are in effect while
// the real session-list component and the app-boundary read resolve their
// own imports.
function getModules() {
  modulesPromise ??= Promise.all([
    import('../../src/screens/journal/components/session-list'),
    import('../../src/services/journal/local-reads'),
    import('../../src/screens/journal-games-night-summary'),
  ]).then(([sessionList, localReads, nightSummary]) => ({
    sessionList,
    localReads,
    nightSummary,
  }));

  return modulesPromise;
}

// A real league UUID, as a local-mode league row carries it.
const realLeagueId =
  '4f7d2f9e-6b97-4bd6-9b0d-4c0d2b1e9a77' as unknown as LeagueId;

// The open session the leagues screen's `onOpenBowlingPress` now creates
// (`src/screens/journal-leagues-screen.tsx`) and routes on the sentinel.
const openSession = {
  id: '9b162e1f-3c11-4c0a-90cd-6df0a1b2c3d4',
  sessionId: '9b162e1f-3c11-4c0a-90cd-6df0a1b2c3d4',
  clientSyncId: null,
  date: '2026-10-27',
  weekNumber: null,
  houseId: null,
  patternId: null,
  ballId: null,
  isDraft: false,
};

// The aggregates a league-scoped read answers for a real league's session:
// three games, 700 pins, a 250 high game. The open route is handed the very
// same aggregates so the assertions cannot pass by accident of empty input.
const sessionAggregates = [
  {
    sessionId: openSession.sessionId,
    date: openSession.date,
    weekNumber: null,
    gameCount: 3,
    totalPins: 700,
    highGame: 250,
    totalStrikes: 4,
    totalSpares: 2,
    totalOpens: 0,
    cleanGames: 0,
    gameScores: [230, 220, 250],
  },
];

// The season summary the screen builds from those three games.
function seasonSummary(nightSummary: NightSummaryModule) {
  return nightSummary.buildSessionNightSummary(
    [
      {
        _id: '11111111-1111-1111-1111-111111111111' as GameId,
        sessionId: openSession.sessionId as SessionId,
        totalScore: 230,
        strikes: 2,
        spares: 1,
        opens: 0,
      },
      {
        _id: '22222222-2222-2222-2222-222222222222' as GameId,
        sessionId: openSession.sessionId as SessionId,
        totalScore: 220,
        strikes: 1,
        spares: 1,
        opens: 0,
      },
      {
        _id: '33333333-3333-3333-3333-333333333333' as GameId,
        sessionId: openSession.sessionId as SessionId,
        totalScore: 250,
        strikes: 1,
        spares: 0,
        opens: 0,
      },
    ],
    3
  );
}

function renderSessionList(
  sessionList: SessionListModule,
  leagueId: LeagueId | null,
  seasonSummaryValue: SessionNightSummary
) {
  // react-dom/server separates adjacent text with `<!-- -->` markers;
  // collapsing them keeps the assertions readable.
  return renderToString(
    React.createElement(sessionList.SessionList, {
      leagueId,
      leagueClientSyncId: null,
      _leagueType: 'league',
      isSessionsLoading: false,
      isLeagueGamesLoading: false,
      displaySessions: [openSession],
      deletingSessionRowId: null,
      _derivedWeekNumberBySessionId: new Map<string, number>(),
      sessionActionError: null,
      seasonSummary: seasonSummaryValue,
      openSessionActions: () => void {},
      router: { push: () => void {} } as never,
      sessionAggregates,
    })
  ).replace(/<!-- -->/g, '');
}

const seasonCardTitle = 'Season stats';
const seasonSessionCount = 'Sessions: 1';
const perSessionStats = '3 games • 700 series • 233 avg • 250 high';

// --- The shared open-route predicate --------------------------------------

test('the open-route predicate is true only for the documented sentinel', async () => {
  const { sessionList, localReads } = await getModules();
  const sentinel = localReads.LOCAL_JOURNAL_OPEN_LEAGUE_ID;

  assert.ok(
    sessionList.isOpenLeagueRoute(sentinel),
    'the sentinel route must be the open route'
  );
  assert.equal(
    sessionList.isOpenLeagueRoute(realLeagueId),
    false,
    'a real league UUID must stay a league route'
  );
  assert.equal(
    sessionList.isOpenLeagueRoute(null),
    false,
    'no league at all is not the open route'
  );
});

// --- The open route --------------------------------------------------------

test('the open route renders its session list with no aggregates at all', async () => {
  const { sessionList, localReads, nightSummary } = await getModules();
  const sentinel = localReads.LOCAL_JOURNAL_OPEN_LEAGUE_ID;

  const html = renderSessionList(
    sessionList,
    sentinel,
    seasonSummary(nightSummary)
  );

  // The open session is still listed, and its row card still carries the
  // tap targets (navigate, session actions) the screen routes on.
  assert.ok(html.includes('Oct 27, 2026'), 'open session row missing');
  assert.equal(
    html.split('<test-pressable>').length - 1,
    2,
    'the open session row must keep its navigate and actions targets'
  );

  // No season statistics card, even though a season summary was handed in.
  assert.ok(
    !html.includes(seasonCardTitle),
    'the open route must not render a season stats card'
  );
  assert.ok(
    !html.includes(seasonSessionCount),
    'the open route must not render a season session count'
  );
  assert.ok(
    !html.includes('Games: 3'),
    'the open route must not render a season game count'
  );

  // No per-session league statistics: game counts, series totals,
  // averages and high games are all misleading for a session with no
  // league.
  assert.ok(
    !html.includes(perSessionStats),
    'the open route must not render per-session league statistics'
  );
  assert.ok(!html.includes('3 games'), 'per-session game count shown');
  assert.ok(!html.includes('700'), 'per-session series total shown');
  assert.ok(!html.includes('avg'), 'per-session average shown');
  assert.ok(!html.includes('250'), 'per-session high game shown');
});

// --- A real league route ---------------------------------------------------

test('a real league route keeps its season card and per-session aggregates', async () => {
  const { sessionList, nightSummary } = await getModules();

  const html = renderSessionList(
    sessionList,
    realLeagueId,
    seasonSummary(nightSummary)
  );

  assert.ok(html.includes('Oct 27, 2026'), 'league session row missing');
  assert.ok(
    html.includes(seasonCardTitle),
    'the season card must still render for a real league'
  );
  assert.ok(html.includes(seasonSessionCount), 'season session count missing');
  assert.ok(html.includes('Games: 3'), 'season game count missing');
  assert.ok(
    html.includes(perSessionStats),
    'per-session league statistics missing'
  );
});
