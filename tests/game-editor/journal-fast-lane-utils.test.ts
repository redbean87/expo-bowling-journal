import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatIsoDateLabel,
  formatGameSequenceLabel,
  formatSessionWeekLabel,
  findSessionIdForDate,
  formatIsoDateForToday,
  resolveGameEntryGameId,
  toOldestFirstGames,
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

test('toOldestFirstGames returns a reversed copy without mutating input', () => {
  const newestFirst = [
    { _id: 'game-4' as GameId },
    { _id: 'game-3' as GameId },
    { _id: 'game-2' as GameId },
    { _id: 'game-1' as GameId },
  ];

  const oldestFirst = toOldestFirstGames(newestFirst);

  assert.deepEqual(
    oldestFirst.map((game) => game._id),
    ['game-1', 'game-2', 'game-3', 'game-4']
  );
  assert.deepEqual(
    newestFirst.map((game) => game._id),
    ['game-4', 'game-3', 'game-2', 'game-1']
  );
});

test('formatGameSequenceLabel returns Game N labels', () => {
  assert.equal(formatGameSequenceLabel(1), 'Game 1');
  assert.equal(formatGameSequenceLabel(4), 'Game 4');
});

test('formatSessionWeekLabel returns Week N labels', () => {
  assert.equal(formatSessionWeekLabel(1), 'Week 1');
  assert.equal(formatSessionWeekLabel(12), 'Week 12');
});

test('formatIsoDateLabel formats YYYY-MM-DD labels safely', () => {
  assert.equal(formatIsoDateLabel('2026-02-11'), 'Feb 11, 2026');
  assert.equal(formatIsoDateLabel('invalid-date'), 'invalid-date');
});
