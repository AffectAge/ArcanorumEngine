import { openDatabase, type SqliteDatabase } from '../database.js';

const ACCOUNT_SCHEMA_VERSION = 1;

const CREATE_ACCOUNT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS account_schema_metadata (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_display TEXT NOT NULL,
  login_normalized TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  country_name_display TEXT NOT NULL,
  country_name_normalized TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  persistent INTEGER NOT NULL CHECK (persistent IN (0, 1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS sessions_active_by_player
ON sessions(player_id, expires_at)
WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  subject_type TEXT NOT NULL,
  subject_digest TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (subject_type, subject_digest)
);
`;

export function openAccountDatabase(databasePath: string): SqliteDatabase {
  const database = openDatabase(databasePath);
  try {
    initializeAccountDatabase(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function initializeAccountDatabase(database: SqliteDatabase): void {
  rejectUnexpectedDatabase(database);
  database.exec(CREATE_ACCOUNT_SCHEMA_SQL);
  const versions = database.prepare('SELECT version FROM account_schema_metadata').all() as readonly {
    readonly version: number;
  }[];

  if (versions.length === 0) {
    database.prepare('INSERT INTO account_schema_metadata (version) VALUES (?)').run(ACCOUNT_SCHEMA_VERSION);
    return;
  }

  if (versions.length !== 1 || versions[0]?.version !== ACCOUNT_SCHEMA_VERSION) {
    throw new Error(`Unsupported account database schema. Expected ${ACCOUNT_SCHEMA_VERSION}.`);
  }
}

function rejectUnexpectedDatabase(database: SqliteDatabase): void {
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
    )
    .all() as readonly { readonly name: string }[];
  const hasAccountSchema = tables.some((table) => table.name === 'account_schema_metadata');
  if (!hasAccountSchema && tables.length > 0) {
    throw new Error('Account database is missing its required schema metadata. Startup stopped.');
  }
}
