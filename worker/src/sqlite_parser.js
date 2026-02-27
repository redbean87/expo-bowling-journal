const PARSER_VERSION = 'backupdb-parser-v1';

const REQUIRED_TABLES = {
  house: {
    requiredColumns: {
      sqliteId: ['id', '_id'],
      name: ['name'],
    },
  },
  pattern: {
    requiredColumns: {
      sqliteId: ['id', '_id'],
      name: ['name'],
    },
  },
  ball: {
    requiredColumns: {
      sqliteId: ['id', '_id'],
      name: ['name'],
    },
  },
  league: {
    requiredColumns: {
      sqliteId: ['id', '_id'],
      name: ['name'],
    },
  },
  week: {
    requiredColumns: {
      sqliteId: ['id', '_id'],
      leagueForeignKey: ['leagueFk', 'league_fk', 'league_id'],
    },
  },
  game: {
    requiredColumns: {
      sqliteId: ['id', '_id'],
      weekForeignKey: ['weekFk', 'week_fk', 'week_id'],
    },
  },
  frame: {
    requiredColumns: {
      sqliteId: ['id', '_id'],
      gameForeignKey: ['gameFk', 'game_fk', 'game_id'],
    },
  },
};

const OPTIONAL_TABLES = {
  bj_meta: true,
  bj_session_ext: true,
  bj_game_ext: true,
};

let sqlJsPromise;
const SQL_JS_DIST_BASE_URL = 'https://sql.js.org/dist';

export class SqliteParseError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'SqliteParseError';
    this.code = code;
    this.details = details;
  }
}

function assertNonEmptyArrayBuffer(source) {
  if (!(source instanceof ArrayBuffer) || source.byteLength === 0) {
    throw new SqliteParseError(
      'INVALID_INPUT',
      'Backup database payload is empty or not a valid ArrayBuffer'
    );
  }
}

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
      const message =
        caught instanceof Error
          ? caught.message
          : 'Unknown SQL.js initialization error';
      throw new SqliteParseError(
        'PARSER_INIT_FAILED',
        `Failed to initialize SQLite parser: ${message}`
      );
    });
  }

  return sqlJsPromise;
}

function asSafeIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

function queryAllRows(database, sql) {
  const statement = database.prepare(sql);
  const rows = [];

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return rows;
}

function listTables(database) {
  return queryAllRows(
    database,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
}

function getTableColumns(database, tableName) {
  return queryAllRows(
    database,
    `PRAGMA table_info(${asSafeIdentifier(tableName)})`
  );
}

function resolveAvailableTables(database) {
  const tableRows = listTables(database);
  const tablesByLowerName = new Map();

  for (const row of tableRows) {
    if (!row || typeof row.name !== 'string') {
      continue;
    }

    tablesByLowerName.set(row.name.toLowerCase(), row.name);
  }

  return tablesByLowerName;
}

function indexColumns(columnRows) {
  const byLower = new Map();

  for (const row of columnRows) {
    if (!row || typeof row.name !== 'string') {
      continue;
    }

    byLower.set(row.name.toLowerCase(), row.name);
  }

  return byLower;
}

function resolveRequiredColumns(columnIndex, tableName, requiredColumns) {
  const resolved = {};

  for (const [fieldName, alternatives] of Object.entries(requiredColumns)) {
    const resolvedColumn = alternatives
      .map((candidate) => columnIndex.get(candidate.toLowerCase()))
      .find((candidate) => typeof candidate === 'string');

    if (!resolvedColumn) {
      throw new SqliteParseError(
        'INVALID_SCHEMA',
        `Required column is missing in table ${tableName}: expected one of [${alternatives.join(', ')}]`,
        {
          table: tableName,
          field: fieldName,
          expectedColumns: alternatives,
          presentColumns: [...columnIndex.values()],
        }
      );
    }

    resolved[fieldName] = resolvedColumn;
  }

  return resolved;
}

function selectAllRows(database, tableName) {
  return queryAllRows(database, `SELECT * FROM ${asSafeIdentifier(tableName)}`);
}

function assertParsedBackupShape(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new SqliteParseError(
      'INVALID_INPUT',
      'Parsed backup payload is missing or invalid'
    );
  }

  if (!parsed.schema || typeof parsed.schema !== 'object') {
    throw new SqliteParseError(
      'INVALID_INPUT',
      'Parsed backup schema is missing or invalid'
    );
  }

  if (!parsed.rows || typeof parsed.rows !== 'object') {
    throw new SqliteParseError(
      'INVALID_INPUT',
      'Parsed backup rows are missing or invalid'
    );
  }
}

function buildColumnLookup(schemaEntry) {
  const byLower = new Map();

  for (const columnName of schemaEntry.availableColumns) {
    byLower.set(columnName.toLowerCase(), columnName);
  }

  return byLower;
}

function readField(row, columnLookup, candidates) {
  for (const candidate of candidates) {
    const actualColumn = columnLookup.get(candidate.toLowerCase());

    if (!actualColumn) {
      continue;
    }

    return row[actualColumn];
  }

  return undefined;
}

function toNullableInteger(value, context, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new SqliteParseError(
        'INVALID_ROW',
        `${context} is required and must be an integer`
      );
    }

    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new SqliteParseError('INVALID_ROW', `${context} must be an integer`);
  }

  return numeric;
}

function toNullableDateLike(value, context) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new SqliteParseError(
        'INVALID_ROW',
        `${context} must be a valid date`
      );
    }

    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new SqliteParseError(
    'INVALID_ROW',
    `${context} must be a number, string, or null`
  );
}

function toNullableText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function mapRows(rows, mapRow) {
  const mapped = [];

  for (let index = 0; index < rows.length; index += 1) {
    mapped.push(mapRow(rows[index], index));
  }

  return mapped;
}

function getSchemaAndRows(parsed, tableName) {
  const schemaEntry = parsed.schema[tableName];
  const tableRows = parsed.rows[tableName];

  if (!schemaEntry || !Array.isArray(tableRows)) {
    throw new SqliteParseError(
      'INVALID_INPUT',
      `Parsed backup is missing validated table payload for ${tableName}`
    );
  }

  return { schemaEntry, tableRows };
}

function getOptionalSchemaAndRows(parsed, tableName) {
  const schemaEntry = parsed.schema[tableName];
  const tableRows = parsed.rows[tableName];

  if (!schemaEntry || !Array.isArray(tableRows)) {
    return null;
  }

  return { schemaEntry, tableRows };
}

export function mapParsedBackupToSnapshot(parsed, options = {}) {
  assertParsedBackupShape(parsed);

  const sourceFileName =
    options.sourceFileName === undefined
      ? null
      : toNullableText(options.sourceFileName);
  const sourceHash =
    options.sourceHash === undefined
      ? null
      : toNullableText(options.sourceHash);

  const housesPayload = getSchemaAndRows(parsed, 'house');
  const patternsPayload = getSchemaAndRows(parsed, 'pattern');
  const ballsPayload = getSchemaAndRows(parsed, 'ball');
  const leaguesPayload = getSchemaAndRows(parsed, 'league');
  const weeksPayload = getSchemaAndRows(parsed, 'week');
  const gamesPayload = getSchemaAndRows(parsed, 'game');
  const framesPayload = getSchemaAndRows(parsed, 'frame');
  const bjMetaPayload = getOptionalSchemaAndRows(parsed, 'bj_meta');
  const bjSessionExtPayload = getOptionalSchemaAndRows(
    parsed,
    'bj_session_ext'
  );
  const bjGameExtPayload = getOptionalSchemaAndRows(parsed, 'bj_game_ext');

  const houseColumns = buildColumnLookup(housesPayload.schemaEntry);
  const patternColumns = buildColumnLookup(patternsPayload.schemaEntry);
  const ballColumns = buildColumnLookup(ballsPayload.schemaEntry);
  const leagueColumns = buildColumnLookup(leaguesPayload.schemaEntry);
  const weekColumns = buildColumnLookup(weeksPayload.schemaEntry);
  const gameColumns = buildColumnLookup(gamesPayload.schemaEntry);
  const frameColumns = buildColumnLookup(framesPayload.schemaEntry);
  const bjMetaColumns = bjMetaPayload
    ? buildColumnLookup(bjMetaPayload.schemaEntry)
    : null;
  const bjSessionExtColumns = bjSessionExtPayload
    ? buildColumnLookup(bjSessionExtPayload.schemaEntry)
    : null;
  const bjGameExtColumns = bjGameExtPayload
    ? buildColumnLookup(bjGameExtPayload.schemaEntry)
    : null;

  const houses = mapRows(housesPayload.tableRows, (row, rowIndex) => ({
    sqliteId: toNullableInteger(
      row[housesPayload.schemaEntry.requiredColumns.sqliteId],
      `house row ${String(rowIndex + 1)} sqliteId`,
      true
    ),
    name: toNullableText(readField(row, houseColumns, ['name'])),
    sortOrder: toNullableInteger(
      readField(row, houseColumns, ['sortOrder', 'sort_order']),
      `house row ${String(rowIndex + 1)} sortOrder`
    ),
    flags: toNullableInteger(
      readField(row, houseColumns, ['flags']),
      `house row ${String(rowIndex + 1)} flags`
    ),
    location: toNullableText(readField(row, houseColumns, ['location'])),
  }));

  const patterns = mapRows(patternsPayload.tableRows, (row, rowIndex) => ({
    sqliteId: toNullableInteger(
      row[patternsPayload.schemaEntry.requiredColumns.sqliteId],
      `pattern row ${String(rowIndex + 1)} sqliteId`,
      true
    ),
    name: toNullableText(readField(row, patternColumns, ['name'])),
    sortOrder: toNullableInteger(
      readField(row, patternColumns, ['sortOrder', 'sort_order']),
      `pattern row ${String(rowIndex + 1)} sortOrder`
    ),
    flags: toNullableInteger(
      readField(row, patternColumns, ['flags']),
      `pattern row ${String(rowIndex + 1)} flags`
    ),
    length: toNullableInteger(
      readField(row, patternColumns, ['length']),
      `pattern row ${String(rowIndex + 1)} length`
    ),
  }));

  const balls = mapRows(ballsPayload.tableRows, (row, rowIndex) => ({
    sqliteId: toNullableInteger(
      row[ballsPayload.schemaEntry.requiredColumns.sqliteId],
      `ball row ${String(rowIndex + 1)} sqliteId`,
      true
    ),
    name: toNullableText(readField(row, ballColumns, ['name'])),
    sortOrder: toNullableInteger(
      readField(row, ballColumns, ['sortOrder', 'sort_order']),
      `ball row ${String(rowIndex + 1)} sortOrder`
    ),
    flags: toNullableInteger(
      readField(row, ballColumns, ['flags']),
      `ball row ${String(rowIndex + 1)} flags`
    ),
    brand: toNullableText(readField(row, ballColumns, ['brand'])),
    coverstock: toNullableText(readField(row, ballColumns, ['coverstock'])),
  }));

  const leagues = mapRows(leaguesPayload.tableRows, (row, rowIndex) => ({
    sqliteId: toNullableInteger(
      row[leaguesPayload.schemaEntry.requiredColumns.sqliteId],
      `league row ${String(rowIndex + 1)} sqliteId`,
      true
    ),
    ballFk: toNullableInteger(
      readField(row, leagueColumns, ['ballFk', 'ball_fk', 'ball_id']),
      `league row ${String(rowIndex + 1)} ballFk`
    ),
    patternFk: toNullableInteger(
      readField(row, leagueColumns, ['patternFk', 'pattern_fk', 'pattern_id']),
      `league row ${String(rowIndex + 1)} patternFk`
    ),
    houseFk: toNullableInteger(
      readField(row, leagueColumns, ['houseFk', 'house_fk', 'house_id']),
      `league row ${String(rowIndex + 1)} houseFk`
    ),
    name: toNullableText(readField(row, leagueColumns, ['name'])),
    games: toNullableInteger(
      readField(row, leagueColumns, ['games']),
      `league row ${String(rowIndex + 1)} games`
    ),
    notes: toNullableText(readField(row, leagueColumns, ['notes'])),
    sortOrder: toNullableInteger(
      readField(row, leagueColumns, ['sortOrder', 'sort_order']),
      `league row ${String(rowIndex + 1)} sortOrder`
    ),
    flags: toNullableInteger(
      readField(row, leagueColumns, ['flags']),
      `league row ${String(rowIndex + 1)} flags`
    ),
  }));

  const weeks = mapRows(weeksPayload.tableRows, (row, rowIndex) => ({
    sqliteId: toNullableInteger(
      row[weeksPayload.schemaEntry.requiredColumns.sqliteId],
      `week row ${String(rowIndex + 1)} sqliteId`,
      true
    ),
    leagueFk: toNullableInteger(
      readField(row, weekColumns, ['leagueFk', 'league_fk', 'league_id']),
      `week row ${String(rowIndex + 1)} leagueFk`
    ),
    ballFk: toNullableInteger(
      readField(row, weekColumns, ['ballFk', 'ball_fk', 'ball_id']),
      `week row ${String(rowIndex + 1)} ballFk`
    ),
    patternFk: toNullableInteger(
      readField(row, weekColumns, ['patternFk', 'pattern_fk', 'pattern_id']),
      `week row ${String(rowIndex + 1)} patternFk`
    ),
    houseFk: toNullableInteger(
      readField(row, weekColumns, ['houseFk', 'house_fk', 'house_id']),
      `week row ${String(rowIndex + 1)} houseFk`
    ),
    date: toNullableDateLike(
      readField(row, weekColumns, ['date']),
      `week row ${String(rowIndex + 1)} date`
    ),
    notes: toNullableText(readField(row, weekColumns, ['notes'])),
    lane: toNullableInteger(
      readField(row, weekColumns, ['lane']),
      `week row ${String(rowIndex + 1)} lane`
    ),
  }));

  const games = mapRows(gamesPayload.tableRows, (row, rowIndex) => ({
    sqliteId: toNullableInteger(
      row[gamesPayload.schemaEntry.requiredColumns.sqliteId],
      `game row ${String(rowIndex + 1)} sqliteId`,
      true
    ),
    weekFk: toNullableInteger(
      readField(row, gameColumns, ['weekFk', 'week_fk', 'week_id']),
      `game row ${String(rowIndex + 1)} weekFk`
    ),
    leagueFk: toNullableInteger(
      readField(row, gameColumns, ['leagueFk', 'league_fk', 'league_id']),
      `game row ${String(rowIndex + 1)} leagueFk`
    ),
    ballFk: toNullableInteger(
      readField(row, gameColumns, ['ballFk', 'ball_fk', 'ball_id']),
      `game row ${String(rowIndex + 1)} ballFk`
    ),
    patternFk: toNullableInteger(
      readField(row, gameColumns, ['patternFk', 'pattern_fk', 'pattern_id']),
      `game row ${String(rowIndex + 1)} patternFk`
    ),
    houseFk: toNullableInteger(
      readField(row, gameColumns, ['houseFk', 'house_fk', 'house_id']),
      `game row ${String(rowIndex + 1)} houseFk`
    ),
    score: toNullableInteger(
      readField(row, gameColumns, ['score']),
      `game row ${String(rowIndex + 1)} score`
    ),
    frame: toNullableInteger(
      readField(row, gameColumns, ['frame']),
      `game row ${String(rowIndex + 1)} frame`
    ),
    flags: toNullableInteger(
      readField(row, gameColumns, ['flags']),
      `game row ${String(rowIndex + 1)} flags`
    ),
    singlePinSpareScore: toNullableInteger(
      readField(row, gameColumns, [
        'singlePinSpareScore',
        'single_pin_spare_score',
      ]),
      `game row ${String(rowIndex + 1)} singlePinSpareScore`
    ),
    notes: toNullableText(readField(row, gameColumns, ['notes'])),
    lane: toNullableInteger(
      readField(row, gameColumns, ['lane']),
      `game row ${String(rowIndex + 1)} lane`
    ),
    date: toNullableDateLike(
      readField(row, gameColumns, ['date']),
      `game row ${String(rowIndex + 1)} date`
    ),
  }));

  const frames = mapRows(framesPayload.tableRows, (row, rowIndex) => ({
    sqliteId: toNullableInteger(
      row[framesPayload.schemaEntry.requiredColumns.sqliteId],
      `frame row ${String(rowIndex + 1)} sqliteId`,
      true
    ),
    gameFk: toNullableInteger(
      readField(row, frameColumns, ['gameFk', 'game_fk', 'game_id']),
      `frame row ${String(rowIndex + 1)} gameFk`
    ),
    weekFk: toNullableInteger(
      readField(row, frameColumns, ['weekFk', 'week_fk', 'week_id']),
      `frame row ${String(rowIndex + 1)} weekFk`
    ),
    leagueFk: toNullableInteger(
      readField(row, frameColumns, ['leagueFk', 'league_fk', 'league_id']),
      `frame row ${String(rowIndex + 1)} leagueFk`
    ),
    ballFk: toNullableInteger(
      readField(row, frameColumns, ['ballFk', 'ball_fk', 'ball_id']),
      `frame row ${String(rowIndex + 1)} ballFk`
    ),
    frameNum: toNullableInteger(
      readField(row, frameColumns, ['frameNum', 'frame_num']),
      `frame row ${String(rowIndex + 1)} frameNum`
    ),
    pins: toNullableInteger(
      readField(row, frameColumns, ['pins']),
      `frame row ${String(rowIndex + 1)} pins`
    ),
    scores: toNullableInteger(
      readField(row, frameColumns, ['scores']),
      `frame row ${String(rowIndex + 1)} scores`
    ),
    score: toNullableInteger(
      readField(row, frameColumns, ['score']),
      `frame row ${String(rowIndex + 1)} score`
    ),
    flags: toNullableInteger(
      readField(row, frameColumns, ['flags']),
      `frame row ${String(rowIndex + 1)} flags`
    ),
    pocket: toNullableInteger(
      readField(row, frameColumns, ['pocket']),
      `frame row ${String(rowIndex + 1)} pocket`
    ),
    footBoard: toNullableInteger(
      readField(row, frameColumns, ['footBoard', 'foot_board']),
      `frame row ${String(rowIndex + 1)} footBoard`
    ),
    targetBoard: toNullableInteger(
      readField(row, frameColumns, ['targetBoard', 'target_board']),
      `frame row ${String(rowIndex + 1)} targetBoard`
    ),
  }));

  const bjMeta =
    !bjMetaPayload || !bjMetaColumns
      ? []
      : mapRows(bjMetaPayload.tableRows, (row, rowIndex) => {
          const key = toNullableText(readField(row, bjMetaColumns, ['key']));
          const value = toNullableText(
            readField(row, bjMetaColumns, ['value'])
          );

          if (!key || !value) {
            throw new SqliteParseError(
              'INVALID_ROW',
              `bj_meta row ${String(rowIndex + 1)} must include key and value`
            );
          }

          return { key, value };
        });
  const bjSessionExt =
    !bjSessionExtPayload || !bjSessionExtColumns
      ? []
      : mapRows(bjSessionExtPayload.tableRows, (row, rowIndex) => ({
          weekFk: toNullableInteger(
            readField(row, bjSessionExtColumns, [
              'weekFk',
              'week_fk',
              'week_id',
            ]),
            `bj_session_ext row ${String(rowIndex + 1)} weekFk`,
            true
          ),
          laneContextJson: toNullableText(
            readField(row, bjSessionExtColumns, ['laneContextJson'])
          ),
          notesJson: toNullableText(
            readField(row, bjSessionExtColumns, ['notesJson'])
          ),
        }));
  const bjGameExt =
    !bjGameExtPayload || !bjGameExtColumns
      ? []
      : mapRows(bjGameExtPayload.tableRows, (row, rowIndex) => ({
          gameFk: toNullableInteger(
            readField(row, bjGameExtColumns, ['gameFk', 'game_fk', 'game_id']),
            `bj_game_ext row ${String(rowIndex + 1)} gameFk`,
            true
          ),
          laneContextJson: toNullableText(
            readField(row, bjGameExtColumns, ['laneContextJson'])
          ),
          ballSwitchesJson: toNullableText(
            readField(row, bjGameExtColumns, ['ballSwitchesJson'])
          ),
          handicap: toNullableInteger(
            readField(row, bjGameExtColumns, ['handicap']),
            `bj_game_ext row ${String(rowIndex + 1)} handicap`
          ),
          notesJson: toNullableText(
            readField(row, bjGameExtColumns, ['notesJson'])
          ),
        }));

  return {
    sourceFileName,
    sourceHash,
    houses,
    patterns,
    balls,
    leagues,
    weeks,
    games,
    frames,
    bjMeta,
    bjSessionExt,
    bjGameExt,
  };
}

export async function parseBackupDatabaseToSnapshot(
  sourceArrayBuffer,
  options = {}
) {
  const parsed = await parseBackupDatabase(sourceArrayBuffer, {
    wasmModule: options.wasmModule,
  });
  const snapshot = mapParsedBackupToSnapshot(parsed, options);

  return {
    parserVersion: parsed.parserVersion,
    snapshot,
  };
}

export async function parseBackupDatabase(sourceArrayBuffer, options = {}) {
  assertNonEmptyArrayBuffer(sourceArrayBuffer);

  const SQL = await getSqlJs(options.wasmModule);
  const bytes = new Uint8Array(sourceArrayBuffer);
  let database = null;

  try {
    database = new SQL.Database(bytes);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : 'Unknown database open error';
    throw new SqliteParseError(
      'INVALID_SQLITE',
      `Uploaded file is not a readable SQLite backup: ${message}`
    );
  }

  try {
    const availableTables = resolveAvailableTables(database);
    const schema = {};
    const rows = {};
    const missingTables = [];

    for (const [expectedTableName, requirement] of Object.entries(
      REQUIRED_TABLES
    )) {
      const actualTableName = availableTables.get(
        expectedTableName.toLowerCase()
      );

      if (!actualTableName) {
        missingTables.push(expectedTableName);
        continue;
      }

      const columnRows = getTableColumns(database, actualTableName);
      const columnIndex = indexColumns(columnRows);
      const requiredColumns = resolveRequiredColumns(
        columnIndex,
        actualTableName,
        requirement.requiredColumns
      );

      schema[expectedTableName] = {
        tableName: actualTableName,
        requiredColumns,
        availableColumns: [...columnIndex.values()],
      };
      rows[expectedTableName] = selectAllRows(database, actualTableName);
    }

    for (const expectedTableName of Object.keys(OPTIONAL_TABLES)) {
      const actualTableName = availableTables.get(
        expectedTableName.toLowerCase()
      );

      if (!actualTableName) {
        continue;
      }

      const columnRows = getTableColumns(database, actualTableName);
      const columnIndex = indexColumns(columnRows);

      schema[expectedTableName] = {
        tableName: actualTableName,
        requiredColumns: {},
        availableColumns: [...columnIndex.values()],
      };
      rows[expectedTableName] = selectAllRows(database, actualTableName);
    }

    if (missingTables.length > 0) {
      throw new SqliteParseError(
        'INVALID_SCHEMA',
        `Backup database is missing required tables: ${missingTables.join(', ')}`,
        {
          missingTables,
          availableTables: [...availableTables.values()],
        }
      );
    }

    return {
      parserVersion: PARSER_VERSION,
      schema,
      rows,
    };
  } catch (caught) {
    if (caught instanceof SqliteParseError) {
      throw caught;
    }

    const message =
      caught instanceof Error ? caught.message : 'Unknown SQLite parse error';
    throw new SqliteParseError(
      'PARSE_FAILED',
      `Failed to parse backup database: ${message}`
    );
  } finally {
    database?.close();
  }
}
