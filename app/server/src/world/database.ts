import { openDatabase, type SqliteDatabase } from '../database.js';

const WORLD_SCHEMA_VERSION = 1;

const CREATE_WORLD_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS world_schema_metadata (
  version INTEGER NOT NULL
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
  temperature INTEGER NOT NULL CHECK (temperature BETWEEN 0 AND 1000),
  rainfall INTEGER NOT NULL CHECK (rainfall BETWEEN 0 AND 1000),
  flow_accumulation INTEGER NOT NULL CHECK (flow_accumulation >= 0),
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

CREATE TABLE IF NOT EXISTS game_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  turn INTEGER NOT NULL CHECK (turn > 0),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 0)
);

CREATE TABLE IF NOT EXISTS game_events (
  sequence INTEGER PRIMARY KEY,
  turn INTEGER NOT NULL CHECK (turn > 0),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_countries (
  id TEXT PRIMARY KEY,
  owner_player_id INTEGER NOT NULL UNIQUE,
  country_name_snapshot TEXT NOT NULL,
  created_turn INTEGER NOT NULL CHECK (created_turn > 0)
);

CREATE TABLE IF NOT EXISTS world_players (
  player_id INTEGER PRIMARY KEY,
  country_id TEXT NOT NULL UNIQUE REFERENCES world_countries(id) ON DELETE CASCADE,
  joined_turn INTEGER NOT NULL CHECK (joined_turn > 0)
);

CREATE TABLE IF NOT EXISTS game_turn_readiness (
  turn INTEGER NOT NULL CHECK (turn > 0),
  player_id INTEGER NOT NULL REFERENCES world_players(player_id) ON DELETE CASCADE,
  client_sequence INTEGER NOT NULL CHECK (client_sequence >= 0),
  PRIMARY KEY (turn, player_id)
);

CREATE TABLE IF NOT EXISTS game_commands (
  turn INTEGER NOT NULL CHECK (turn > 0),
  player_id INTEGER NOT NULL REFERENCES world_players(player_id) ON DELETE CASCADE,
  client_sequence INTEGER NOT NULL CHECK (client_sequence >= 0),
  command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (turn, player_id, client_sequence)
);
`;

export function openWorldDatabase(databasePath: string): SqliteDatabase {
  const database = openDatabase(databasePath);
  try {
    initializeWorldDatabase(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function initializeWorldDatabase(database: SqliteDatabase): void {
  rejectLegacyCombinedDatabase(database);
  database.exec(CREATE_WORLD_SCHEMA_SQL);
  const versions = database.prepare('SELECT version FROM world_schema_metadata').all() as readonly {
    readonly version: number;
  }[];

  if (versions.length === 0) {
    database.prepare('INSERT INTO world_schema_metadata (version) VALUES (?)').run(WORLD_SCHEMA_VERSION);
    return;
  }

  if (versions.length !== 1 || versions[0]?.version !== WORLD_SCHEMA_VERSION) {
    throw new Error(`Unsupported world database schema. Expected ${WORLD_SCHEMA_VERSION}.`);
  }
}

function rejectLegacyCombinedDatabase(database: SqliteDatabase): void {
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
    )
    .all() as readonly { readonly name: string }[];
  if (tables.some((table) => table.name === 'schema_metadata')) {
    throw new Error(
      'World database uses the retired combined account/world format. Delete world/ to create a new world; account data is intentionally not migrated.',
    );
  }
  const hasWorldSchema = tables.some((table) => table.name === 'world_schema_metadata');
  if (!hasWorldSchema && tables.length > 0) {
    throw new Error('World database is missing its required schema metadata. Startup stopped.');
  }
}
