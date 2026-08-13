import { z } from 'zod';
import { WorldVisualCatalogSchema } from './world-visual.js';

const StableIdSchema = z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/);

export const TerrainAtlasSchema = z
  .object({
    key: StableIdSchema,
    url: z.string().regex(/^\/assets\/.+\.webp$/),
    frameWidth: z.number().int().positive(),
    frameHeight: z.number().int().positive(),
    columns: z.number().int().positive(),
  })
  .strict();

export const WorldOverlayAtlasSchema = z
  .object({
    id: StableIdSchema,
    role: z.enum(['river']),
    key: StableIdSchema,
    url: z.string().regex(/^\/assets\/.+\.webp$/),
    frameWidth: z.number().int().positive(),
    frameHeight: z.number().int().positive(),
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
  })
  .strict();

export type WorldOverlayAtlas = z.infer<typeof WorldOverlayAtlasSchema>;

export const TerrainTypeSchema = z
  .object({
    id: StableIdSchema,
    frame: z.number().int().nonnegative(),
    category: z.enum(['land', 'water']),
    role: z.enum(['ocean', 'coastal_water', 'sea', 'lake', 'land']),
  })
  .strict();

export const TerrainCatalogSchema = z
  .object({
    atlas: TerrainAtlasSchema,
    terrainTypes: z.array(TerrainTypeSchema).min(1),
    overlays: z.array(WorldOverlayAtlasSchema),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = new Set<string>();
    const frames = new Set<number>();
    const roles = new Set<string>();
    const overlayRoles = new Set<string>();

    for (const terrainType of catalog.terrainTypes) {
      if (ids.has(terrainType.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate terrain ID: ${terrainType.id}`,
          path: ['terrainTypes'],
        });
      }
      ids.add(terrainType.id);

      if (frames.has(terrainType.frame)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate terrain frame: ${terrainType.frame}`,
          path: ['terrainTypes'],
        });
      }
      frames.add(terrainType.frame);

      if (roles.has(terrainType.role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate terrain role: ${terrainType.role}`,
          path: ['terrainTypes'],
        });
      }
      roles.add(terrainType.role);

      if (terrainType.frame >= catalog.atlas.columns) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Terrain frame ${terrainType.frame} exceeds atlas columns.`,
          path: ['terrainTypes'],
        });
      }
    }

    for (const role of ['ocean', 'coastal_water', 'sea', 'lake', 'land'] as const) {
      if (!roles.has(role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required terrain role: ${role}`,
          path: ['terrainTypes'],
        });
      }
    }

    for (const overlay of catalog.overlays) {
      if (overlayRoles.has(overlay.role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate overlay role: ${overlay.role}`,
          path: ['overlays'],
        });
      }
      overlayRoles.add(overlay.role);

      if (overlay.columns * overlay.rows < 64) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Overlay atlas ${overlay.id} must provide at least 64 frames.`,
          path: ['overlays'],
        });
      }
    }

    if (!overlayRoles.has('river')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Missing required overlay role: river',
        path: ['overlays'],
      });
    }
  });

export type TerrainCatalog = z.infer<typeof TerrainCatalogSchema>;
export type TerrainType = z.infer<typeof TerrainTypeSchema>;

export const WorldHexSchema = z
  .object({
    q: z.number().int().nonnegative(),
    r: z.number().int().nonnegative(),
    terrainId: StableIdSchema,
    elevation: z.number().int().min(0).max(1000),
    temperature: z.number().int().min(0).max(1000),
    rainfall: z.number().int().min(0).max(1000),
    flowAccumulation: z.number().int().nonnegative(),
    landmassId: StableIdSchema.optional(),
    waterBodyId: StableIdSchema.optional(),
  })
  .strict();

export type WorldHex = z.infer<typeof WorldHexSchema>;

export const WorldRiverEdgeSchema = z
  .object({
    fromQ: z.number().int().nonnegative(),
    fromR: z.number().int().nonnegative(),
    toQ: z.number().int().nonnegative(),
    toR: z.number().int().nonnegative(),
    flow: z.number().int().positive(),
  })
  .strict();

export type WorldRiverEdge = z.infer<typeof WorldRiverEdgeSchema>;

export const WorldLandmassSchema = z
  .object({
    id: StableIdSchema,
    kind: z.enum(['continent', 'island']),
    hexCount: z.number().int().positive(),
  })
  .strict();

export type WorldLandmass = z.infer<typeof WorldLandmassSchema>;

export const WorldWaterBodySchema = z
  .object({
    id: StableIdSchema,
    kind: z.enum(['ocean', 'sea', 'lake']),
    hexCount: z.number().int().positive(),
  })
  .strict();

export type WorldWaterBody = z.infer<typeof WorldWaterBodySchema>;

export const WorldGenerationStageDiagnosticSchema = z
  .object({
    id: StableIdSchema,
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const WorldGenerationDiagnosticsSchema = z
  .object({
    stages: z.array(WorldGenerationStageDiagnosticSchema).min(1),
    landHexCount: z.number().int().nonnegative(),
    riverEdgeCount: z.number().int().nonnegative(),
    maximumElevation: z.number().int().min(0).max(1000),
    maximumFlowAccumulation: z.number().int().nonnegative(),
    boundaryLandHexCount: z.literal(0),
    outerOceanHexCount: z.number().int().positive(),
    connectedSeaCount: z.number().int().nonnegative(),
    discardedMicroIslandCount: z.number().int().nonnegative(),
  })
  .strict();

export type WorldGenerationDiagnostics = z.infer<typeof WorldGenerationDiagnosticsSchema>;

export const WorldGeometrySchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    staggerAxis: z.literal('x'),
    staggerIndex: z.literal('odd'),
    hexSideLength: z.number().int().positive(),
    terrain: TerrainCatalogSchema,
    visuals: WorldVisualCatalogSchema,
  })
  .strict();

export type WorldGeometry = z.infer<typeof WorldGeometrySchema>;

export const WorldBaseResponseSchema = z
  .object({
    worldName: z.string().min(1),
    seed: z.string().min(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    chunkWidth: z.number().int().positive(),
    chunkHeight: z.number().int().positive(),
    geometry: WorldGeometrySchema,
    landmasses: z.array(WorldLandmassSchema),
    waterBodies: z.array(WorldWaterBodySchema),
    diagnostics: WorldGenerationDiagnosticsSchema,
  })
  .strict();

export type WorldBaseResponse = z.infer<typeof WorldBaseResponseSchema>;

export const WorldGeometryChunkSchema = z
  .object({
    chunkQ: z.number().int().nonnegative(),
    chunkR: z.number().int().nonnegative(),
    originQ: z.number().int().nonnegative(),
    originR: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    hexes: z.array(WorldHexSchema).min(1),
    /** One-hex non-rendered halo used only by visual rules that inspect neighbors. */
    visualNeighbors: z.array(WorldHexSchema),
    rivers: z.array(WorldRiverEdgeSchema),
  })
  .strict()
  .superRefine((chunk, context) => {
    if (chunk.hexes.length !== chunk.width * chunk.height) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hex count does not match chunk dimensions.',
        path: ['hexes'],
      });
    }
    const coordinates = new Set<string>();
    for (const hex of [...chunk.hexes, ...chunk.visualNeighbors]) {
      const coordinate = `${hex.q}:${hex.r}`;
      if (coordinates.has(coordinate)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate visual context hex: ${coordinate}.`,
          path: ['visualNeighbors'],
        });
      }
      coordinates.add(coordinate);
    }
  });

export type WorldGeometryChunk = z.infer<typeof WorldGeometryChunkSchema>;

export const WorldChunkResponseSchema = z
  .object({
    worldName: z.string().min(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    chunk: WorldGeometryChunkSchema,
  })
  .strict();

export type WorldChunkResponse = z.infer<typeof WorldChunkResponseSchema>;
