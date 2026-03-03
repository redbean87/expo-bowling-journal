import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSessionNightSummary,
  normalizeGamesPerSession,
} from '../../src/screens/journal-games-night-summary';

import type { Game } from '../../src/services/journal';

function createGame(overrides: Partial<Game>): Game {
  return {
    _id: 'game-id' as Game['_id'],
    _creationTime: 0,
    userId: 'user-id' as Game['userId'],
    sessionId: 'session-id' as Game['sessionId'],
    leagueId: 'league-id' as Game['leagueId'],
    date: '2026-02-16',
    totalScore: 0,
    strikes: 0,
    spares: 0,
    opens: 0,
    ballId: null,
    patternId: null,
    handicap: null,
    notes: null,
    laneContext: null,
    ballSwitches: null,
    ...overrides,
  };
}

test('normalizeGamesPerSession only accepts positive integers', () => {
  assert.equal(normalizeGamesPerSession(undefined), null);
  assert.equal(normalizeGamesPerSession(null), null);
  assert.equal(normalizeGamesPerSession(0), null);
  assert.equal(normalizeGamesPerSession(3.5), null);
  assert.equal(normalizeGamesPerSession(4), 4);
});

test('buildSessionNightSummary computes progress and stats for target nights', () => {
  const games = [
    createGame({ totalScore: 176, strikes: 4, spares: 3, opens: 3 }),
    createGame({ totalScore: 148, strikes: 2, spares: 4, opens: 4 }),
    createGame({ totalScore: 191, strikes: 5, spares: 2, opens: 3 }),
    createGame({ totalScore: 213, strikes: 6, spares: 2, opens: 2 }),
  ];

  const summary = buildSessionNightSummary(games, 4);

  assert.equal(summary.gamesPlayed, 4);
  assert.equal(summary.targetGames, 4);
  assert.equal(summary.remainingGames, 0);
  assert.equal(summary.isNightComplete, true);
  assert.equal(summary.totalPins, 728);
  assert.equal(summary.average, 182);
  assert.equal(summary.highGame, 213);
  assert.equal(summary.lowGame, 148);
  assert.equal(summary.strikes, 17);
  assert.equal(summary.spares, 11);
  assert.equal(summary.opens, 12);
});

test('buildSessionNightSummary handles nights without a configured target', () => {
  const summary = buildSessionNightSummary(
    [createGame({ totalScore: 200, strikes: 6, spares: 2, opens: 2 })],
    null
  );

  assert.equal(summary.targetGames, null);
  assert.equal(summary.remainingGames, null);
  assert.equal(summary.isNightComplete, false);
});

test('buildSessionNightSummary highSeries returns null when no games', () => {
  const summary = buildSessionNightSummary([], null);
  assert.equal(summary.highSeries, null);
});

test('buildSessionNightSummary highSeries returns total for a single session', () => {
  const games = [
    createGame({
      sessionId: 'session-1' as Game['sessionId'],
      totalScore: 180,
    }),
    createGame({
      sessionId: 'session-1' as Game['sessionId'],
      totalScore: 200,
    }),
    createGame({
      sessionId: 'session-1' as Game['sessionId'],
      totalScore: 220,
    }),
  ];
  const summary = buildSessionNightSummary(games, 3);
  assert.equal(summary.highSeries, 600);
});

test('buildSessionNightSummary highSeries returns highest session total across multiple sessions', () => {
  const games = [
    // Session 1: 180 + 200 + 160 = 540
    createGame({
      sessionId: 'session-1' as Game['sessionId'],
      totalScore: 180,
    }),
    createGame({
      sessionId: 'session-1' as Game['sessionId'],
      totalScore: 200,
    }),
    createGame({
      sessionId: 'session-1' as Game['sessionId'],
      totalScore: 160,
    }),
    // Session 2: 220 + 210 + 190 = 620
    createGame({
      sessionId: 'session-2' as Game['sessionId'],
      totalScore: 220,
    }),
    createGame({
      sessionId: 'session-2' as Game['sessionId'],
      totalScore: 210,
    }),
    createGame({
      sessionId: 'session-2' as Game['sessionId'],
      totalScore: 190,
    }),
    // Session 3: 150 + 170 + 140 = 460
    createGame({
      sessionId: 'session-3' as Game['sessionId'],
      totalScore: 150,
    }),
    createGame({
      sessionId: 'session-3' as Game['sessionId'],
      totalScore: 170,
    }),
    createGame({
      sessionId: 'session-3' as Game['sessionId'],
      totalScore: 140,
    }),
  ];
  const summary = buildSessionNightSummary(games, 3);
  assert.equal(summary.highSeries, 620);
});
