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

let sqlJsPromise;

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

async function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = import('sql.js/dist/sql-wasm.js')
      .then((module) => {
        const initSqlJs = module.default;
        return initSqlJs({
          locateFile: (fileName) => {
            return new URL(
              `../node_modules/sql.js/dist/${fileName}`,
              import.meta.url
            ).href;
          },
        });
      })
      .catch((caught) => {
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

export async function parseBackupDatabase(sourceArrayBuffer) {
  assertNonEmptyArrayBuffer(sourceArrayBuffer);

  const SQL = await getSqlJs();
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
