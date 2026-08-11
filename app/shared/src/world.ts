import { z } from 'zod';

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

export const ClimateRangeSchema = z
  .object({
    min: z.number().int().min(0).max(1000),
    max: z.number().int().min(0).max(1000),
  })
  .strict()
  .superRefine((range, context) => {
    if (range.min > range.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Climate range minimum cannot exceed its maximum.',
      });
    }
  });

export type ClimateRange = z.infer<typeof ClimateRangeSchema>;

export const BiomeTypeSchema = z
  .object({
    id: StableIdSchema,
    frame: z.number().int().nonnegative(),
    temperature: ClimateRangeSchema,
    rainfall: ClimateRangeSchema,
  })
  .strict();

export type BiomeType = z.infer<typeof BiomeTypeSchema>;

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
    biomeAtlas: TerrainAtlasSchema,
    terrainTypes: z.array(TerrainTypeSchema).min(1),
    biomeTypes: z.array(BiomeTypeSchema).min(1),
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

    const biomeIds = new Set<string>();
    const biomeFrames = new Set<number>();
    for (const biome of catalog.biomeTypes) {
      if (biomeIds.has(biome.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate biome ID: ${biome.id}`,
          path: ['biomeTypes'],
        });
      }
      biomeIds.add(biome.id);

      if (biomeFrames.has(biome.frame)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate biome frame: ${biome.frame}`,
          path: ['biomeTypes'],
        });
      }
      biomeFrames.add(biome.frame);

      if (biome.frame >= catalog.biomeAtlas.columns) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Biome frame ${biome.frame} exceeds atlas columns.`,
          path: ['biomeTypes'],
        });
      }
    }
  });

export type TerrainCatalog = z.infer<typeof TerrainCatalogSchema>;
export type TerrainType = z.infer<typeof TerrainTypeSchema>;

export const WorldHexSchema = z
  .object({
    q: z.number().int().nonnegative(),
    r: z.number().int().nonnegative(),
    terrainId: StableIdSchema,
    biomeId: StableIdSchema.optional(),
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
  })
  .strict();

export type WorldGenerationDiagnostics = z.infer<typeof WorldGenerationDiagnosticsSchema>;

export const WorldMapResponseSchema = z
  .object({
    worldName: z.string().min(1),
    seed: z.string().min(1),
    map: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        staggerAxis: z.literal('x'),
        staggerIndex: z.literal('odd'),
        hexSideLength: z.number().int().positive(),
        terrain: TerrainCatalogSchema,
        hexes: z.array(WorldHexSchema).min(1),
        rivers: z.array(WorldRiverEdgeSchema),
        landmasses: z.array(WorldLandmassSchema),
        waterBodies: z.array(WorldWaterBodySchema),
        diagnostics: WorldGenerationDiagnosticsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.map.hexes.length !== response.map.width * response.map.height) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hex count does not match map dimensions.',
        path: ['map', 'hexes'],
      });
    }
  });

export type WorldMapResponse = z.infer<typeof WorldMapResponseSchema>;
