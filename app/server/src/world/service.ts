import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  WorldGenerationDiagnosticsSchema,
  WorldMapResponseSchema,
  type WorldHex,
  type WorldLandmass,
  type WorldMapResponse,
  type WorldRiverEdge,
  type WorldWaterBody,
} from '@arcanorum/shared';
import { WorldGenerationSchema, type ServerConfig } from '../config.js';
import type { SqliteDatabase } from '../database.js';
import { generateWorld, type GeneratedWorld } from './generator.js';
import type { LoadedTerrainCatalog } from './terrain-catalog.js';

const WorldManifestSchema = z
  .object({
    format: z.literal('arcanorum-world'),
    generationFile: z.literal('generation.json'),
    databaseFile: z.literal('world.sqlite'),
  })
  .strict();

const WorldGenerationSnapshotSchema = z
  .object({
    format: z.literal('arcanorum-world-generation'),
    worldName: z.string().min(1),
    seed: z.string().min(1),
    terrainCatalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    generation: WorldGenerationSchema,
  })
  .strict();

type WorldGenerationSnapshot = z.infer<typeof WorldGenerationSnapshotSchema>;

export type PreparedWorld = {
  readonly databasePath: string;
  readonly isNew: boolean;
  readonly snapshot: WorldGenerationSnapshot;
};

export function prepareWorld(config: ServerConfig, terrainCatalog: LoadedTerrainCatalog): PreparedWorld {
  if (config.worldPath === ':memory:') {
    return {
      databasePath: ':memory:',
      isNew: true,
      snapshot: createSnapshot(config, terrainCatalog, config.worldSeed),
    };
  }

  const manifestPath = join(config.worldPath, 'manifest.json');
  const generationPath = join(config.worldPath, 'generation.json');
  const databasePath = join(config.worldPath, 'world.sqlite');
  const worldExists = existsSync(config.worldPath);

  if (!worldExists) {
    if (!config.worldAutoCreate) {
      throw new Error(`World does not exist and autoCreate is disabled: ${config.worldPath}`);
    }

    mkdirSync(config.worldPath, { recursive: true });
    const seed = config.worldSeed === 'auto' ? randomBytes(16).toString('hex') : config.worldSeed;
    const snapshot = createSnapshot(config, terrainCatalog, seed);
    writeJson(manifestPath, {
      format: 'arcanorum-world',
      generationFile: 'generation.json',
      databaseFile: 'world.sqlite',
    });
    writeJson(generationPath, snapshot);

    return { databasePath, isNew: true, snapshot };
  }

  if (!existsSync(manifestPath) || !existsSync(generationPath) || !existsSync(databasePath)) {
    throw new Error(
      `World directory is incomplete: expected manifest.json, generation.json, and world.sqlite in ${config.worldPath}.`,
    );
  }

  const manifest = readJson(manifestPath, WorldManifestSchema);
  if (manifest.generationFile !== 'generation.json' || manifest.databaseFile !== 'world.sqlite') {
    throw new Error(`World manifest has unsupported file ownership in ${manifestPath}.`);
  }

  const snapshot = readJson(generationPath, WorldGenerationSnapshotSchema);
  if (snapshot.terrainCatalogFingerprint !== terrainCatalog.fingerprint) {
    throw new Error(
      'Terrain content changed after this world was generated. Restore matching content or create a new world.',
    );
  }

  return { databasePath, isNew: false, snapshot };
}

export class WorldService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly preparedWorld: PreparedWorld,
    private readonly terrainCatalog: LoadedTerrainCatalog,
  ) {}

  initialize(): void {
    const worldRowCount = this.database.prepare('SELECT COUNT(*) AS count FROM world_hexes').get() as {
      count: number;
    };

    if (this.preparedWorld.isNew) {
      if (worldRowCount.count !== 0) {
        throw new Error('A new world cannot be initialized into a database that already contains map hexes.');
      }
      this.persistGeneratedWorld(
        generateWorld(
          this.preparedWorld.snapshot.seed,
          this.preparedWorld.snapshot.generation,
          this.terrainCatalog.catalog,
        ),
      );
      return;
    }

    if (worldRowCount.count === 0) {
      throw new Error(
        'Existing world database contains no map hexes. Startup stopped to prevent regeneration.',
      );
    }

    const seed = this.database
      .prepare("SELECT metadata_value FROM world_metadata WHERE metadata_key = 'seed'")
      .get() as { metadata_value: string } | undefined;
    if (seed?.metadata_value !== this.preparedWorld.snapshot.seed) {
      throw new Error('World database seed does not match generation.json.');
    }
  }

  getMap(): WorldMapResponse {
    const map = {
      width: this.preparedWorld.snapshot.generation.width,
      height: this.preparedWorld.snapshot.generation.height,
      staggerAxis: 'x' as const,
      staggerIndex: 'odd' as const,
      hexSideLength: 48,
      terrain: this.terrainCatalog.catalog,
      hexes: this.database
        .prepare(
          `SELECT q, r, terrain_id AS terrainId, elevation,
                  temperature, rainfall,
                  flow_accumulation AS flowAccumulation,
                  landmass_id AS landmassId, water_body_id AS waterBodyId
           FROM world_hexes
           ORDER BY r ASC, q ASC`,
        )
        .all()
        .map(toWorldHex),
      rivers: this.database
        .prepare(
          `SELECT from_q AS fromQ, from_r AS fromR, to_q AS toQ, to_r AS toR, flow
           FROM world_river_edges
           ORDER BY from_r ASC, from_q ASC, to_r ASC, to_q ASC`,
        )
        .all() as WorldRiverEdge[],
      landmasses: this.database
        .prepare('SELECT id, kind, hex_count AS hexCount FROM world_landmasses ORDER BY id ASC')
        .all() as WorldLandmass[],
      waterBodies: this.database
        .prepare('SELECT id, kind, hex_count AS hexCount FROM world_water_bodies ORDER BY id ASC')
        .all() as WorldWaterBody[],
      diagnostics: readWorldDiagnostics(this.database),
    };

    return WorldMapResponseSchema.parse({
      worldName: this.preparedWorld.snapshot.worldName,
      seed: this.preparedWorld.snapshot.seed,
      map,
    });
  }

  private persistGeneratedWorld(world: GeneratedWorld): void {
    const persist = this.database.transaction(() => {
      this.database
        .prepare('INSERT INTO world_metadata (metadata_key, metadata_value) VALUES (?, ?)')
        .run('world_name', this.preparedWorld.snapshot.worldName);
      this.database
        .prepare('INSERT INTO world_metadata (metadata_key, metadata_value) VALUES (?, ?)')
        .run('seed', this.preparedWorld.snapshot.seed);
      this.database
        .prepare('INSERT INTO world_metadata (metadata_key, metadata_value) VALUES (?, ?)')
        .run('terrain_catalog_fingerprint', this.preparedWorld.snapshot.terrainCatalogFingerprint);
      this.database
        .prepare('INSERT INTO world_metadata (metadata_key, metadata_value) VALUES (?, ?)')
        .run('generation_diagnostics', JSON.stringify(world.diagnostics));

      const insertHex = this.database.prepare(
        `INSERT INTO world_hexes (
          q, r, terrain_id, elevation, temperature, rainfall,
          flow_accumulation, landmass_id, water_body_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const hex of world.hexes) {
        insertHex.run(
          hex.q,
          hex.r,
          hex.terrainId,
          hex.elevation,
          hex.temperature,
          hex.rainfall,
          hex.flowAccumulation,
          hex.landmassId ?? null,
          hex.waterBodyId ?? null,
        );
      }

      const insertLandmass = this.database.prepare(
        'INSERT INTO world_landmasses (id, kind, hex_count) VALUES (?, ?, ?)',
      );
      for (const landmass of world.landmasses) {
        insertLandmass.run(landmass.id, landmass.kind, landmass.hexCount);
      }

      const insertWaterBody = this.database.prepare(
        'INSERT INTO world_water_bodies (id, kind, hex_count) VALUES (?, ?, ?)',
      );
      for (const waterBody of world.waterBodies) {
        insertWaterBody.run(waterBody.id, waterBody.kind, waterBody.hexCount);
      }

      const insertRiver = this.database.prepare(
        `INSERT INTO world_river_edges (from_q, from_r, to_q, to_r, flow)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const river of world.rivers) {
        insertRiver.run(river.fromQ, river.fromR, river.toQ, river.toR, river.flow);
      }
    });

    persist();
  }
}

function createSnapshot(
  config: ServerConfig,
  terrainCatalog: LoadedTerrainCatalog,
  seed: string,
): WorldGenerationSnapshot {
  return {
    format: 'arcanorum-world-generation',
    worldName: config.worldName,
    seed,
    terrainCatalogFingerprint: terrainCatalog.fingerprint,
    generation: config.worldGeneration,
  };
}

function readJson<TSchema extends z.ZodType>(filePath: string, schema: TSchema): z.infer<TSchema> {
  let source: unknown;
  try {
    source = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read required world file ${filePath}: ${reason}`);
  }
  return schema.parse(source);
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toWorldHex(row: unknown): WorldHex {
  const source = row as {
    q: number;
    r: number;
    terrainId: string;
    elevation: number;
    temperature: number;
    rainfall: number;
    flowAccumulation: number;
    landmassId: string | null;
    waterBodyId: string | null;
  };

  return {
    q: source.q,
    r: source.r,
    terrainId: source.terrainId,
    elevation: source.elevation,
    temperature: source.temperature,
    rainfall: source.rainfall,
    flowAccumulation: source.flowAccumulation,
    ...(source.landmassId === null ? {} : { landmassId: source.landmassId }),
    ...(source.waterBodyId === null ? {} : { waterBodyId: source.waterBodyId }),
  };
}

function readWorldDiagnostics(database: SqliteDatabase) {
  const row = database
    .prepare("SELECT metadata_value FROM world_metadata WHERE metadata_key = 'generation_diagnostics'")
    .get() as { metadata_value: string } | undefined;
  if (row === undefined) {
    throw new Error('World database is missing required generation diagnostics.');
  }

  let source: unknown;
  try {
    source = JSON.parse(row.metadata_value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`World generation diagnostics are invalid JSON: ${reason}`);
  }
  return WorldGenerationDiagnosticsSchema.parse(source);
}
