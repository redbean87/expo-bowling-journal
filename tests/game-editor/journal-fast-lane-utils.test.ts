import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findSessionIdForDate,
  formatIsoDateForToday,
  resolveGameEntryGameId,
} from '../../src/screens/journal-fast-lane-utils';

import type { GameId, SessionId } from '../../src/services/journal';

test('formatIsoDateForToday returns YYYY-MM-DD', () => {
  const isoDate = formatIsoDateForToday(new Date('2026-02-18T21:45:00.000Z'));

  assert.equal(isoDate, '2026-02-18');
});

test('findSessionIdForDate returns matching session id when present', () => {
  const sessionId = findSessionIdForDate(
    [
      {
        _id: 'session-1' as SessionId,
        date: '2026-02-11',
      },
      {
        _id: 'session-2' as SessionId,
        date: '2026-02-18',
      },
    ],
    '2026-02-18'
  );

  assert.equal(sessionId, 'session-2');
});

test('findSessionIdForDate returns null when no session matches date', () => {
  const sessionId = findSessionIdForDate(
    [
      {
        _id: 'session-1' as SessionId,
        date: '2026-02-11',
      },
    ],
    '2026-02-18'
  );

  assert.equal(sessionId, null);
});

test('resolveGameEntryGameId prefers most recent game and falls back to new', () => {
  assert.equal(
    resolveGameEntryGameId([
      {
        _id: 'game-most-recent' as GameId,
      },
      {
        _id: 'game-older' as GameId,
      },
    ]),
    'game-most-recent'
  );

  assert.equal(resolveGameEntryGameId([]), 'new');
});
