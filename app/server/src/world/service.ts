import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  WorldGenerationDiagnosticsSchema,
  WorldBaseResponseSchema,
  WorldChunkResponseSchema,
  WorldGeometryChunkSchema,
  type WorldBaseResponse,
  type WorldChunkResponse,
  type WorldGeometryChunk,
  type WorldHex,
} from '@arcanorum/shared';
import { WorldGenerationSchema, type ServerConfig } from '../config.js';
import type { SqliteDatabase } from '../database.js';
import { generateWorld, type GeneratedWorld } from './generation/index.js';
import type { LoadedTerrainCatalog } from './terrain-catalog.js';
import type { LoadedVisualCatalog } from './visual-catalog.js';

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
    version: z.literal(3),
    worldName: z.string().min(1),
    seed: z.string().min(1),
    terrainCatalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    generation: WorldGenerationSchema,
  })
  .strict();

type WorldGenerationSnapshot = z.infer<typeof WorldGenerationSnapshotSchema>;

export const WORLD_CHUNK_WIDTH = 32;
export const WORLD_CHUNK_HEIGHT = 32;

export type PreparedWorld =
  | {
      readonly databasePath: string;
      readonly isNew: true;
      readonly snapshot: WorldGenerationSnapshot;
      readonly generatedWorld: GeneratedWorld;
    }
  | {
      readonly databasePath: string;
      readonly isNew: false;
      readonly snapshot: WorldGenerationSnapshot;
    };

export function prepareWorld(config: ServerConfig, terrainCatalog: LoadedTerrainCatalog): PreparedWorld {
  if (config.worldPath === ':memory:') {
    const snapshot = createSnapshot(config, terrainCatalog, config.worldSeed);
    return {
      databasePath: ':memory:',
      isNew: true,
      snapshot,
      generatedWorld: generateWorld(snapshot.seed, snapshot.generation, terrainCatalog.catalog),
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

    const seed = config.worldSeed === 'auto' ? randomBytes(16).toString('hex') : config.worldSeed;
    const snapshot = createSnapshot(config, terrainCatalog, seed);
    const generatedWorld = generateWorld(seed, snapshot.generation, terrainCatalog.catalog);
    mkdirSync(config.worldPath, { recursive: true });
    writeJson(manifestPath, {
      format: 'arcanorum-world',
      generationFile: 'generation.json',
      databaseFile: 'world.sqlite',
    });
    writeJson(generationPath, snapshot);

    return { databasePath, isNew: true, snapshot, generatedWorld };
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

  const snapshot = readGenerationSnapshot(generationPath);
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
    private readonly visualCatalog: LoadedVisualCatalog,
  ) {}

  initialize(): void {
    const worldRowCount = this.database.prepare('SELECT COUNT(*) AS count FROM world_hexes').get() as {
      count: number;
    };

    if (this.preparedWorld.isNew) {
      if (worldRowCount.count !== 0) {
        throw new Error('A new world cannot be initialized into a database that already contains map hexes.');
      }
      this.persistGeneratedWorld(this.preparedWorld.generatedWorld);
    } else if (worldRowCount.count === 0) {
      throw new Error(
        'Existing world database contains no map hexes. Startup stopped to prevent regeneration.',
      );
    } else {
      const seed = this.database
        .prepare("SELECT metadata_value FROM world_metadata WHERE metadata_key = 'seed'")
        .get() as { metadata_value: string } | undefined;
      if (seed?.metadata_value !== this.preparedWorld.snapshot.seed) {
        throw new Error('World database seed does not match generation.json.');
      }
    }

    this.validatePersistedGeometry();
  }

  getBase(): WorldBaseResponse {
    return WorldBaseResponseSchema.parse({
      worldName: this.preparedWorld.snapshot.worldName,
      seed: this.preparedWorld.snapshot.seed,
      geometryRevision: this.geometryRevision(),
      chunkWidth: WORLD_CHUNK_WIDTH,
      chunkHeight: WORLD_CHUNK_HEIGHT,
      geometry: {
        width: this.preparedWorld.snapshot.generation.width,
        height: this.preparedWorld.snapshot.generation.height,
        staggerAxis: 'x',
        staggerIndex: 'odd',
        hexSideLength: 48,
        terrain: this.terrainCatalog.catalog,
        visuals: this.visualCatalog.catalog,
      },
      landmasses: this.database
        .prepare('SELECT id, kind, hex_count AS hexCount FROM world_landmasses ORDER BY id ASC')
        .all(),
      waterBodies: this.database
        .prepare('SELECT id, kind, hex_count AS hexCount FROM world_water_bodies ORDER BY id ASC')
        .all(),
      diagnostics: readWorldDiagnostics(this.database),
    });
  }

  getChunk(chunkQ: number, chunkR: number): WorldChunkResponse {
    if (!Number.isInteger(chunkQ) || !Number.isInteger(chunkR) || chunkQ < 0 || chunkR < 0) {
      throw new Error('World chunk coordinates must be non-negative integers.');
    }

    const originQ = chunkQ * WORLD_CHUNK_WIDTH;
    const originR = chunkR * WORLD_CHUNK_HEIGHT;
    const worldWidth = this.preparedWorld.snapshot.generation.width;
    const worldHeight = this.preparedWorld.snapshot.generation.height;
    if (originQ >= worldWidth || originR >= worldHeight) {
      throw new Error(`World chunk ${chunkQ}:${chunkR} is outside the world bounds.`);
    }

    const width = Math.min(WORLD_CHUNK_WIDTH, worldWidth - originQ);
    const height = Math.min(WORLD_CHUNK_HEIGHT, worldHeight - originR);
    const endQ = originQ + width - 1;
    const endR = originR + height - 1;
    const chunk: WorldGeometryChunk = WorldGeometryChunkSchema.parse({
      chunkQ,
      chunkR,
      originQ,
      originR,
      width,
      height,
      hexes: this.database
        .prepare(
          `SELECT q, r, terrain_id AS terrainId, elevation,
                  temperature, rainfall,
                  flow_accumulation AS flowAccumulation,
                  landmass_id AS landmassId, water_body_id AS waterBodyId
           FROM world_hexes
           WHERE q BETWEEN ? AND ? AND r BETWEEN ? AND ?
           ORDER BY r ASC, q ASC`,
        )
        .all(originQ, endQ, originR, endR)
        .map(toWorldHex),
      visualNeighbors: this.database
        .prepare(
          `SELECT q, r, terrain_id AS terrainId, elevation,
                  temperature, rainfall,
                  flow_accumulation AS flowAccumulation,
                  landmass_id AS landmassId, water_body_id AS waterBodyId
           FROM world_hexes
           WHERE q BETWEEN ? AND ? AND r BETWEEN ? AND ?
             AND NOT (q BETWEEN ? AND ? AND r BETWEEN ? AND ?)
           ORDER BY r ASC, q ASC`,
        )
        .all(originQ - 1, endQ + 1, originR - 1, endR + 1, originQ, endQ, originR, endR)
        .map(toWorldHex),
      rivers: this.database
        .prepare(
          `SELECT from_q AS fromQ, from_r AS fromR, to_q AS toQ, to_r AS toR, flow
           FROM world_river_edges
           WHERE (from_q BETWEEN ? AND ? AND from_r BETWEEN ? AND ?)
              OR (to_q BETWEEN ? AND ? AND to_r BETWEEN ? AND ?)
           ORDER BY from_r ASC, from_q ASC, to_r ASC, to_q ASC`,
        )
        .all(originQ, endQ, originR, endR, originQ, endQ, originR, endR),
    });

    return WorldChunkResponseSchema.parse({
      worldName: this.preparedWorld.snapshot.worldName,
      geometryRevision: this.geometryRevision(),
      chunk,
    });
  }

  private geometryRevision(): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          generationVersion: this.preparedWorld.snapshot.version,
          seed: this.preparedWorld.snapshot.seed,
          generation: this.preparedWorld.snapshot.generation,
          terrainCatalogFingerprint: this.preparedWorld.snapshot.terrainCatalogFingerprint,
          visualCatalogFingerprint: this.visualCatalog.fingerprint,
        }),
      )
      .digest('hex');
  }

  private validatePersistedGeometry(): void {
    const terrainById = new Map(
      this.terrainCatalog.catalog.terrainTypes.map((terrain) => [terrain.id, terrain]),
    );
    const landmasses = this.database
      .prepare('SELECT id, kind, hex_count AS hexCount FROM world_landmasses ORDER BY id ASC')
      .all() as readonly {
      readonly id: string;
      readonly kind: 'continent' | 'island';
      readonly hexCount: number;
    }[];
    const waterBodies = this.database
      .prepare('SELECT id, kind, hex_count AS hexCount FROM world_water_bodies ORDER BY id ASC')
      .all() as readonly {
      readonly id: string;
      readonly kind: 'ocean' | 'sea' | 'lake';
      readonly hexCount: number;
    }[];
    const landmassById = new Map(landmasses.map((landmass) => [landmass.id, landmass]));
    const waterBodyById = new Map(waterBodies.map((waterBody) => [waterBody.id, waterBody]));
    const landmassCounts = new Map<string, number>();
    const waterBodyCounts = new Map<string, number>();
    const coordinates = new Set<string>();
    const hexRows = this.database
      .prepare(
        'SELECT q, r, terrain_id AS terrainId, landmass_id AS landmassId, water_body_id AS waterBodyId FROM world_hexes ORDER BY r ASC, q ASC',
      )
      .all() as readonly {
      readonly q: number;
      readonly r: number;
      readonly terrainId: string;
      readonly landmassId: string | null;
      readonly waterBodyId: string | null;
    }[];
    const expectedHexCount =
      this.preparedWorld.snapshot.generation.width * this.preparedWorld.snapshot.generation.height;
    if (hexRows.length !== expectedHexCount) {
      throw new Error(`World geometry has ${hexRows.length} hexes; expected ${expectedHexCount}.`);
    }

    for (const hex of hexRows) {
      if (
        hex.q < 0 ||
        hex.r < 0 ||
        hex.q >= this.preparedWorld.snapshot.generation.width ||
        hex.r >= this.preparedWorld.snapshot.generation.height
      ) {
        throw new Error(`World geometry contains an out-of-bounds hex: ${hex.q}:${hex.r}.`);
      }
      const coordinate = `${hex.q}:${hex.r}`;
      if (coordinates.has(coordinate)) {
        throw new Error(`World geometry contains duplicate hex coordinates: ${coordinate}.`);
      }
      coordinates.add(coordinate);
      const terrain = terrainById.get(hex.terrainId);
      if (terrain === undefined) {
        throw new Error(`World geometry references missing terrain: ${hex.terrainId} at ${coordinate}.`);
      }
      if (terrain.category === 'land') {
        if (hex.landmassId === null || hex.waterBodyId !== null) {
          throw new Error(`Land hex has invalid ownership references: ${coordinate}.`);
        }
        if (!landmassById.has(hex.landmassId)) {
          throw new Error(`Land hex references missing landmass: ${hex.landmassId} at ${coordinate}.`);
        }
        landmassCounts.set(hex.landmassId, (landmassCounts.get(hex.landmassId) ?? 0) + 1);
      } else {
        if (hex.waterBodyId === null || hex.landmassId !== null) {
          throw new Error(`Water hex has invalid ownership references: ${coordinate}.`);
        }
        if (!waterBodyById.has(hex.waterBodyId)) {
          throw new Error(`Water hex references missing water body: ${hex.waterBodyId} at ${coordinate}.`);
        }
        waterBodyCounts.set(hex.waterBodyId, (waterBodyCounts.get(hex.waterBodyId) ?? 0) + 1);
      }
    }

    validateReferenceCounts('landmass', landmasses, landmassCounts);
    validateReferenceCounts('water body', waterBodies, waterBodyCounts);
    this.validateRiverReferences(coordinates);
  }

  private validateRiverReferences(coordinates: ReadonlySet<string>): void {
    const rivers = this.database
      .prepare(
        'SELECT from_q AS fromQ, from_r AS fromR, to_q AS toQ, to_r AS toR FROM world_river_edges ORDER BY from_r ASC, from_q ASC, to_r ASC, to_q ASC',
      )
      .all() as readonly {
      readonly fromQ: number;
      readonly fromR: number;
      readonly toQ: number;
      readonly toR: number;
    }[];
    for (const river of rivers) {
      const from = `${river.fromQ}:${river.fromR}`;
      const to = `${river.toQ}:${river.toR}`;
      if (!coordinates.has(from) || !coordinates.has(to)) {
        throw new Error(`River edge references a missing hex: ${from} -> ${to}.`);
      }
      if (!areAdjacentHexes(river.fromQ, river.fromR, river.toQ, river.toR)) {
        throw new Error(`River edge is not adjacent: ${from} -> ${to}.`);
      }
    }
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
    version: 3,
    worldName: config.worldName,
    seed,
    terrainCatalogFingerprint: terrainCatalog.fingerprint,
    generation: config.worldGeneration,
  };
}

function readGenerationSnapshot(filePath: string): WorldGenerationSnapshot {
  const source = readJson(filePath, z.unknown());
  if (
    typeof source === 'object' &&
    source !== null &&
    'format' in source &&
    source.format === 'arcanorum-world-generation' &&
    (!('version' in source) || source.version !== 3)
  ) {
    throw new Error(
      `World generation snapshot at ${filePath} predates emergent generator v3. The existing world was not modified; create a new world directory to use generator v3.`,
    );
  }
  return WorldGenerationSnapshotSchema.parse(source);
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

function validateReferenceCounts(
  label: string,
  records: readonly { readonly id: string; readonly hexCount: number }[],
  actualCounts: ReadonlyMap<string, number>,
): void {
  for (const record of records) {
    const actual = actualCounts.get(record.id) ?? 0;
    if (actual !== record.hexCount) {
      throw new Error(
        `World ${label} ${record.id} declares ${record.hexCount} hexes but references ${actual}.`,
      );
    }
  }
}

function areAdjacentHexes(fromQ: number, fromR: number, toQ: number, toR: number): boolean {
  const offsets: ReadonlyArray<readonly [number, number]> =
    fromQ % 2 === 0
      ? [
          [0, -1],
          [1, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
          [-1, -1],
        ]
      : [
          [0, -1],
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
        ];
  return offsets.some(([q, r]) => fromQ + q === toQ && fromR + r === toR);
}
