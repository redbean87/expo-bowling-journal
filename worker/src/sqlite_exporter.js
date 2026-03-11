const SQL_JS_DIST_BASE_URL = 'https://sql.js.org/dist';

let sqlJsPromise;

async function getSqlJs(wasmModule) {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const globalScope = globalThis;
      const hasOwnProcess = Object.prototype.hasOwnProperty.call(
        globalScope,
        'process'
      );
      const hasOwnLocation = Object.prototype.hasOwnProperty.call(
        globalScope,
        'location'
      );
      const previousProcess = globalScope.process;
      const previousLocation = globalScope.location;

      try {
        globalScope.process = undefined;
        if (!globalScope.location || !globalScope.location.href) {
          globalScope.location = {
            href: `${SQL_JS_DIST_BASE_URL}/`,
          };
        }
        const module = await import('sql.js/dist/sql-wasm.js');
        const initSqlJs = module.default;

        return initSqlJs({
          instantiateWasm: wasmModule
            ? (imports, successCallback) => {
                WebAssembly.instantiate(wasmModule, imports)
                  .then((instance) => {
                    successCallback(instance, wasmModule);
                  })
                  .catch((caught) => {
                    throw caught;
                  });

                return {};
              }
            : undefined,
          locateFile: (fileName) => `${SQL_JS_DIST_BASE_URL}/${fileName}`,
        });
      } finally {
        if (hasOwnProcess) {
          globalScope.process = previousProcess;
        } else {
          delete globalScope.process;
        }

        if (hasOwnLocation) {
          globalScope.location = previousLocation;
        } else {
          delete globalScope.location;
        }
      }
    })().catch((caught) => {
      sqlJsPromise = undefined;
      throw caught;
    });
  }

  return sqlJsPromise;
}

function runRows(db, sql, rows, mapRow) {
  const statement = db.prepare(sql);

  try {
    for (const row of rows) {
      statement.run(mapRow(row));
    }
  } finally {
    statement.free();
  }
}

function assertSnapshotShape(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid snapshot payload');
  }

  const requiredArrays = [
    'houses',
    'patterns',
    'balls',
    'leagues',
    'weeks',
    'games',
    'frames',
    'bjMeta',
    'bjSessionExt',
    'bjGameExt',
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(snapshot[key])) {
      throw new Error(`Invalid snapshot payload: ${key} is required`);
    }
  }
}

export async function buildSqliteBackupBytes(snapshot, options = {}) {
  assertSnapshotShape(snapshot);

  const SQL = await getSqlJs(options.wasmModule);
  const db = new SQL.Database();

  try {
    db.run('PRAGMA journal_mode = OFF;');
    db.run('PRAGMA synchronous = OFF;');
    db.run('BEGIN TRANSACTION;');

    db.run('CREATE TABLE android_metadata (locale TEXT);');
    db.run("INSERT INTO android_metadata (locale) VALUES ('en_US');");

    db.run(
      'CREATE TABLE house (_id INTEGER PRIMARY KEY, name TEXT, sortOrder INTEGER, flags INTEGER);'
    );
    db.run(
      'CREATE TABLE pattern (_id INTEGER PRIMARY KEY, name TEXT, sortOrder INTEGER, flags INTEGER);'
    );
    db.run(
      'CREATE TABLE ball (_id INTEGER PRIMARY KEY, name TEXT, sortOrder INTEGER, flags INTEGER);'
    );
    db.run(
      'CREATE TABLE league (_id INTEGER PRIMARY KEY, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, name TEXT, games INTEGER, notes TEXT, sortOrder INTEGER, flags INTEGER);'
    );
    db.run(
      'CREATE TABLE week (_id INTEGER PRIMARY KEY, leagueFk INTEGER, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, date REAL, notes TEXT, lane INTEGER);'
    );
    db.run(
      'CREATE TABLE game (_id INTEGER PRIMARY KEY, weekFk INTEGER, leagueFk INTEGER, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, score INTEGER, frame INTEGER, flags INTEGER, singlePinSpareScore INTEGER, notes TEXT, lane INTEGER);'
    );
    db.run(
      'CREATE TABLE frame (_id INTEGER PRIMARY KEY, gameFk INTEGER, weekFk INTEGER, leagueFk INTEGER, ballFk INTEGER, frameNum INTEGER, pins INTEGER, scores INTEGER, score INTEGER, flags INTEGER, pocket INTEGER, footBoard INTEGER, targetBoard INTEGER);'
    );
    runRows(
      db,
      'INSERT INTO house (_id, name, sortOrder, flags) VALUES (?, ?, ?, ?);',
      snapshot.houses,
      (row) => [row.sqliteId, row.name, row.sortOrder, row.flags]
    );
    runRows(
      db,
      'INSERT INTO pattern (_id, name, sortOrder, flags) VALUES (?, ?, ?, ?);',
      snapshot.patterns,
      (row) => [row.sqliteId, row.name, row.sortOrder, row.flags]
    );
    runRows(
      db,
      'INSERT INTO ball (_id, name, sortOrder, flags) VALUES (?, ?, ?, ?);',
      snapshot.balls,
      (row) => [row.sqliteId, row.name, row.sortOrder, row.flags]
    );
    runRows(
      db,
      'INSERT INTO league (_id, ballFk, patternFk, houseFk, name, games, notes, sortOrder, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
      snapshot.leagues,
      (row) => [
        row.sqliteId,
        row.ballFk,
        row.patternFk,
        row.houseFk,
        row.name,
        row.games,
        row.notes,
        row.sortOrder,
        row.flags,
      ]
    );
    runRows(
      db,
      'INSERT INTO week (_id, leagueFk, ballFk, patternFk, houseFk, date, notes, lane) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
      snapshot.weeks,
      (row) => [
        row.sqliteId,
        row.leagueFk,
        row.ballFk,
        row.patternFk,
        row.houseFk,
        typeof row.date === 'string'
          ? Date.parse(row.date + 'T00:00:00.000Z')
          : (row.date ?? null),
        row.notes,
        row.lane,
      ]
    );
    runRows(
      db,
      'INSERT INTO game (_id, weekFk, leagueFk, ballFk, patternFk, houseFk, score, frame, flags, singlePinSpareScore, notes, lane) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      snapshot.games,
      (row) => [
        row.sqliteId,
        row.weekFk,
        row.leagueFk,
        row.ballFk,
        row.patternFk,
        row.houseFk,
        row.score,
        row.frame,
        row.flags,
        row.singlePinSpareScore,
        row.notes,
        row.lane,
      ]
    );
    runRows(
      db,
      'INSERT INTO frame (_id, gameFk, weekFk, leagueFk, ballFk, frameNum, pins, scores, score, flags, pocket, footBoard, targetBoard) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      snapshot.frames,
      (row) => [
        row.sqliteId,
        row.gameFk,
        row.weekFk,
        row.leagueFk,
        row.ballFk,
        row.frameNum,
        row.pins,
        row.scores,
        row.score,
        row.flags,
        row.pocket,
        row.footBoard,
        row.targetBoard,
      ]
    );
    db.run('COMMIT;');

    return db.export();
  } catch (caught) {
    db.run('ROLLBACK;');
    throw caught;
  } finally {
    db.close();
  }
}
