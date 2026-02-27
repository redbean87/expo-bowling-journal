import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildImportedGameFramePreview,
  computeImportedGameStats,
} from '../../convex/lib/import_game_stats';
import { packPinsFromRolls } from '../../convex/lib/sqlite_export_frame_encoding';
import { buildSqliteBackupBytes } from '../../worker/src/sqlite_exporter.js';
import { parseBackupDatabaseToSnapshot } from '../../worker/src/sqlite_parser.js';

function toArrayBuffer(bytes: Buffer | Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function loadSqlWasmModule() {
  const wasmPath = resolve(
    process.cwd(),
    'worker',
    'node_modules',
    'sql.js',
    'dist',
    'sql-wasm.wasm'
  );
  const wasmBytes = await readFile(wasmPath);
  return new WebAssembly.Module(toArrayBuffer(wasmBytes));
}

function buildFrameRow(args: {
  sqliteId: number;
  gameFk: number;
  weekFk: number;
  leagueFk: number;
  frameNum: number;
  roll1: number;
  roll2: number;
  flags: number;
  pins?: number;
}) {
  return {
    sqliteId: args.sqliteId,
    gameFk: args.gameFk,
    weekFk: args.weekFk,
    leagueFk: args.leagueFk,
    ballFk: null,
    frameNum: args.frameNum,
    pins: args.pins ?? packPinsFromRolls(args.roll1, args.roll2),
    scores: null,
    score: null,
    flags: args.flags,
    pocket: null,
    footBoard: null,
    targetBoard: null,
  };
}

test('sqlite export/parse roundtrip keeps game order, score-critical frame rows, and split markers', async () => {
  const wasmModule = await loadSqlWasmModule();
  const snapshot = {
    sourceFileName: 'synthetic.db',
    sourceHash: null,
    houses: [
      {
        sqliteId: 1,
        name: 'House A',
        sortOrder: null,
        flags: null,
        location: null,
      },
    ],
    patterns: [
      {
        sqliteId: 1,
        name: 'Pattern A',
        sortOrder: null,
        flags: null,
        length: 42,
      },
    ],
    balls: [
      {
        sqliteId: 1,
        name: 'Ball A',
        sortOrder: null,
        flags: null,
        brand: null,
        coverstock: null,
      },
    ],
    leagues: [
      {
        sqliteId: 1,
        ballFk: 1,
        patternFk: 1,
        houseFk: 1,
        name: 'League A',
        games: 3,
        notes: null,
        sortOrder: null,
        flags: null,
      },
    ],
    weeks: [
      {
        sqliteId: 100,
        leagueFk: 1,
        ballFk: 1,
        patternFk: 1,
        houseFk: 1,
        date: '2026-02-25',
        notes: null,
        lane: null,
      },
      {
        sqliteId: 101,
        leagueFk: 1,
        ballFk: 1,
        patternFk: 1,
        houseFk: 1,
        date: '2025-06-04',
        notes: null,
        lane: null,
      },
    ],
    games: [
      {
        sqliteId: 10,
        weekFk: 100,
        leagueFk: 1,
        ballFk: 1,
        patternFk: 1,
        houseFk: 1,
        score: 190,
        frame: null,
        flags: null,
        singlePinSpareScore: null,
        notes: null,
        lane: null,
        date: '2026-02-25',
      },
      {
        sqliteId: 11,
        weekFk: 100,
        leagueFk: 1,
        ballFk: 1,
        patternFk: 1,
        houseFk: 1,
        score: 145,
        frame: null,
        flags: null,
        singlePinSpareScore: null,
        notes: null,
        lane: null,
        date: '2026-02-25',
      },
      {
        sqliteId: 12,
        weekFk: 101,
        leagueFk: 1,
        ballFk: 1,
        patternFk: 1,
        houseFk: 1,
        score: 0,
        frame: null,
        flags: null,
        singlePinSpareScore: null,
        notes: null,
        lane: null,
        date: '2025-06-04',
      },
    ],
    frames: [
      ...Array.from({ length: 10 }, (_, index) =>
        buildFrameRow({
          sqliteId: index + 1,
          gameFk: 10,
          weekFk: 100,
          leagueFk: 1,
          frameNum: index,
          roll1: 9,
          roll2: 1,
          flags: 195,
        })
      ),
      buildFrameRow({
        sqliteId: 11,
        gameFk: 10,
        weekFk: 100,
        leagueFk: 1,
        frameNum: 10,
        roll1: 9,
        roll2: 0,
        flags: 195,
      }),
      buildFrameRow({
        sqliteId: 12,
        gameFk: 11,
        weekFk: 100,
        leagueFk: 1,
        frameNum: 0,
        roll1: 8,
        roll2: 2,
        flags: 195,
        pins: 576,
      }),
      ...Array.from({ length: 9 }, (_, index) =>
        buildFrameRow({
          sqliteId: 13 + index,
          gameFk: 11,
          weekFk: 100,
          leagueFk: 1,
          frameNum: index + 1,
          roll1: 8,
          roll2: 1,
          flags: 195,
        })
      ),
    ],
    bjMeta: [
      { key: 'schemaVersion', value: '1' },
      { key: 'format', value: 'test' },
    ],
    bjSessionExt: [
      { weekFk: 100, laneContextJson: null, notesJson: null },
      { weekFk: 101, laneContextJson: null, notesJson: null },
    ],
    bjGameExt: [
      {
        gameFk: 10,
        laneContextJson: null,
        ballSwitchesJson: null,
        handicap: null,
        notesJson: null,
      },
      {
        gameFk: 11,
        laneContextJson: null,
        ballSwitchesJson: null,
        handicap: null,
        notesJson: null,
      },
      {
        gameFk: 12,
        laneContextJson: null,
        ballSwitchesJson: null,
        handicap: null,
        notesJson: null,
      },
    ],
  };

  const sqliteBytes = await buildSqliteBackupBytes(snapshot, { wasmModule });
  const parsed = await parseBackupDatabaseToSnapshot(
    toArrayBuffer(sqliteBytes),
    {
      sourceFileName: 'synthetic.db',
      sourceHash: null,
      wasmModule,
    }
  );

  assert.deepEqual(
    parsed.snapshot.games.map((game) => game.sqliteId),
    [10, 11, 12]
  );

  const game10Rows = parsed.snapshot.frames.filter(
    (frame) => frame.gameFk === 10
  );
  const game10Stats = computeImportedGameStats(game10Rows, 0);
  assert.equal(game10Stats.totalScore, 190);

  const game11Rows = parsed.snapshot.frames.filter(
    (frame) => frame.gameFk === 11
  );
  const game11Preview = buildImportedGameFramePreview(game11Rows);
  assert.equal(
    game11Preview.some((item) => item.hasSplit),
    true
  );
});
