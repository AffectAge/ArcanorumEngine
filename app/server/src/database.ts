import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

const SCHEMA_VERSION = 1;

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_metadata (
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

CREATE TABLE IF NOT EXISTS world_metadata (
  metadata_key TEXT PRIMARY KEY,
  metadata_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_hexes (
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  terrain_id TEXT NOT NULL,
  elevation INTEGER NOT NULL CHECK (elevation BETWEEN 0 AND 1000),
  landmass_id TEXT,
  water_body_id TEXT,
  PRIMARY KEY (q, r)
);

CREATE TABLE IF NOT EXISTS world_landmasses (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('continent', 'island')),
  hex_count INTEGER NOT NULL CHECK (hex_count > 0)
);

CREATE TABLE IF NOT EXISTS world_water_bodies (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ocean', 'sea', 'lake')),
  hex_count INTEGER NOT NULL CHECK (hex_count > 0)
);

CREATE TABLE IF NOT EXISTS world_river_edges (
  from_q INTEGER NOT NULL,
  from_r INTEGER NOT NULL,
  to_q INTEGER NOT NULL,
  to_r INTEGER NOT NULL,
  flow INTEGER NOT NULL CHECK (flow > 0),
  PRIMARY KEY (from_q, from_r, to_q, to_r)
);
`;

export function openDatabase(databasePath: string): SqliteDatabase {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  initializeSchema(database);

  return database;
}

function initializeSchema(database: SqliteDatabase): void {
  database.exec(CREATE_SCHEMA_SQL);
  const versions = database.prepare('SELECT version FROM schema_metadata').all() as Array<{
    version: number;
  }>;

  if (versions.length === 0) {
    database.prepare('INSERT INTO schema_metadata (version) VALUES (?)').run(SCHEMA_VERSION);
    return;
  }

  if (versions.length !== 1 || versions[0]?.version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported SQLite schema version. Expected ${SCHEMA_VERSION}.`);
  }
}
