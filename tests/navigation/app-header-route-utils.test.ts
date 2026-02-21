import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveUpTarget } from '../../src/components/navigation/app-header-route-utils';

test('resolveUpTarget returns parent games route for game editor screen', () => {
  const upTarget = resolveUpTarget({
    routeName: '[leagueId]/sessions/[sessionId]/games/[gameId]',
    params: {
      leagueId: 'league-1',
      sessionId: 'session-1',
      gameId: 'game-1',
    },
  });

  assert.equal(upTarget, '/journal/league-1/sessions/session-1/games');
});

test('resolveUpTarget returns sessions route for games list screen', () => {
  const upTarget = resolveUpTarget({
    routeName: '[leagueId]/sessions/[sessionId]/games/index',
    params: {
      leagueId: 'league-1',
      sessionId: 'session-1',
    },
  });

  assert.equal(upTarget, '/journal/league-1/sessions');
});

test('resolveUpTarget returns journal route for sessions list screen', () => {
  const upTarget = resolveUpTarget({
    routeName: '[leagueId]/sessions/index',
    params: {
      leagueId: 'league-1',
    },
  });

  assert.equal(upTarget, '/journal');
});

test('resolveUpTarget returns null for non-nested routes', () => {
  const upTarget = resolveUpTarget({
    routeName: 'home',
    params: null,
  });

  assert.equal(upTarget, null);
});

test('resolveUpTarget safely falls back when params are missing', () => {
  const upTarget = resolveUpTarget({
    routeName: '[leagueId]/sessions/[sessionId]/games/[gameId]',
    params: {},
  });

  assert.equal(upTarget, '/journal');
});
