import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { CANONICAL_SCHEMA_SQL } from '../../src/db/schema';

const CANONICAL_TABLES = [
  'balls',
  'frames',
  'games',
  'houses',
  'leagues',
  'patterns',
  'sessions',
];

const REQUIRED_INDEXES = [
  'ix_frames_ballId',
  'ix_frames_gameId',
  'ix_games_ballId',
  'ix_games_houseId',
  'ix_games_patternId',
  'ix_games_sessionId',
  'ix_leagues_houseId',
  'ix_sessions_ballId',
  'ix_sessions_houseId',
  'ix_sessions_leagueId',
  'ix_sessions_patternId',
];

// Applies the ACTUAL A3 DDL to a fresh in-memory database. Every assertion in
// this file is coupled to this real schema: none of the tables/columns/foreign
// keys/indexes are re-created here, so the tests cannot pass if the DDL in
// src/db/schema.ts changes.
function openSchemaDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(CANONICAL_SCHEMA_SQL);
  return db;
}

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name as string);
}

function indexNames(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name as string);
}

interface TableColumn {
  name: string;
  notnull: number;
  pk: number;
}

function tableColumns(db: DatabaseSync, table: string): TableColumn[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => ({
      name: row.name as string,
      notnull: row.notnull as number,
      pk: row.pk as number,
    }));
}

interface ForeignKeyRow {
  from: string;
  to: string;
  table: string;
}

function foreignKeys(db: DatabaseSync, table: string): ForeignKeyRow[] {
  return db
    .prepare(`PRAGMA foreign_key_list(${table})`)
    .all()
    .map((row) => ({
      from: row.from as string,
      to: row.to as string,
      table: row.table as string,
    }));
}

function foreignKeyPairs(db: DatabaseSync, table: string): string[] {
  return foreignKeys(db, table).map((fk) => `${fk.from}->${fk.table}`);
}

test('exactly the seven canonical tables exist', () => {
  const db = openSchemaDb();
  try {
    assert.deepEqual(tableNames(db), [...CANONICAL_TABLES].sort());
  } finally {
    db.close();
  }
});

test('every table has a single-column primary key on `id`', () => {
  const db = openSchemaDb();
  try {
    for (const table of CANONICAL_TABLES) {
      const pkColumns = tableColumns(db, table).filter(
        (column) => column.pk > 0
      );
      assert.equal(
        pkColumns.length,
        1,
        `${table}: expected exactly one primary-key column`
      );
      assert.equal(
        pkColumns[0].name,
        'id',
        `${table}: expected the primary key to be on "id"`
      );
    }
  } finally {
    db.close();
  }
});

test('required NOT NULL columns are enforced and nullable columns accept NULL', () => {
  const db = openSchemaDb();
  try {
    // NOT NULL enforcement — inserting NULL into a required column must throw.
    assert.throws(() =>
      db.exec("INSERT INTO leagues (id, name) VALUES ('l1', NULL)")
    );
    assert.throws(() =>
      db.exec("INSERT INTO sessions (id, date) VALUES ('s1', NULL)")
    );
    assert.throws(() =>
      db.exec("INSERT INTO games (id, sessionId, date) VALUES ('g1', NULL, 1)")
    );
    assert.throws(() =>
      db.exec(
        "INSERT INTO frames (id, gameId, frameNumber) VALUES ('f1', NULL, 1)"
      )
    );

    // Nullable foreign-key columns accept NULL (a record may reference none).
    db.exec("INSERT INTO sessions (id, date, leagueId) VALUES ('s1', 1, NULL)");
    db.exec(
      "INSERT INTO sessions (id, date, leagueId, houseId, ballId, patternId) VALUES ('s2', 2, NULL, NULL, NULL, NULL)"
    );
  } finally {
    db.close();
  }
});

test('primary keys reject duplicate rows', () => {
  const db = openSchemaDb();
  try {
    db.exec("INSERT INTO leagues (id, name) VALUES ('l1', 'League One')");
    assert.throws(() =>
      db.exec("INSERT INTO leagues (id, name) VALUES ('l1', 'League One')")
    );
  } finally {
    db.close();
  }
});

test('canonical foreign keys are declared on the expected columns', () => {
  const db = openSchemaDb();
  try {
    assert.deepEqual(foreignKeyPairs(db, 'leagues').sort(), [
      'houseId->houses',
    ]);
    assert.deepEqual(
      foreignKeyPairs(db, 'sessions').sort(),
      [
        'leagueId->leagues',
        'houseId->houses',
        'ballId->balls',
        'patternId->patterns',
      ].sort()
    );
    assert.deepEqual(
      foreignKeyPairs(db, 'games').sort(),
      [
        'sessionId->sessions',
        'houseId->houses',
        'ballId->balls',
        'patternId->patterns',
      ].sort()
    );
    assert.deepEqual(
      foreignKeyPairs(db, 'frames').sort(),
      ['gameId->games', 'ballId->balls'].sort()
    );
    // Leaf reference entities declare no foreign keys.
    assert.deepEqual(foreignKeyPairs(db, 'balls'), []);
    assert.deepEqual(foreignKeyPairs(db, 'houses'), []);
    assert.deepEqual(foreignKeyPairs(db, 'patterns'), []);
  } finally {
    db.close();
  }
});

test('canonical foreign keys are enforced', () => {
  const db = openSchemaDb();
  try {
    // Invalid foreign keys must be rejected...
    assert.throws(() =>
      db.exec(
        "INSERT INTO sessions (id, date, leagueId) VALUES ('s1', 1, 'no-such-league')"
      )
    );
    assert.throws(() =>
      db.exec(
        "INSERT INTO games (id, sessionId, date) VALUES ('g1', 'no-such-session', 1)"
      )
    );
    assert.throws(() =>
      db.exec(
        "INSERT INTO frames (id, gameId, frameNumber) VALUES ('f1', 'no-such-game', 1)"
      )
    );

    // ...while a fully valid foreign-key chain succeeds.
    db.exec("INSERT INTO leagues (id, name) VALUES ('l1', 'League One')");
    db.exec("INSERT INTO sessions (id, date, leagueId) VALUES ('s1', 1, 'l1')");
    db.exec("INSERT INTO games (id, sessionId, date) VALUES ('g1', 's1', 1)");
    db.exec(
      "INSERT INTO frames (id, gameId, frameNumber) VALUES ('f1', 'g1', 1)"
    );
  } finally {
    db.close();
  }
});

test('required indexes exist', () => {
  const db = openSchemaDb();
  try {
    assert.deepEqual(indexNames(db).sort(), [...REQUIRED_INDEXES].sort());
  } finally {
    db.close();
  }
});

test('frames persist roll1Mask/roll2Mask/roll3Mask and never packed pins or numeric roll columns', () => {
  const db = openSchemaDb();
  try {
    const frameColumns = tableColumns(db, 'frames').map(
      (column) => column.name
    );
    for (const required of ['roll1Mask', 'roll2Mask', 'roll3Mask']) {
      assert.ok(
        frameColumns.includes(required),
        `frames must declare ${required}`
      );
    }
    for (const banned of ['pins', 'roll1', 'roll2', 'roll3']) {
      assert.ok(
        !frameColumns.includes(banned),
        `frames must not declare ${banned}`
      );
    }
  } finally {
    db.close();
  }
});

test('applying the canonical DDL is idempotent', () => {
  const db = openSchemaDb();
  try {
    const tablesBefore = tableNames(db);
    const indexesBefore = indexNames(db);
    // Re-applying the DDL (CREATE ... IF NOT EXISTS) must neither throw nor
    // change the catalog.
    db.exec(CANONICAL_SCHEMA_SQL);
    assert.deepEqual(tableNames(db), tablesBefore);
    assert.deepEqual(indexNames(db), indexesBefore);
  } finally {
    db.close();
  }
});
