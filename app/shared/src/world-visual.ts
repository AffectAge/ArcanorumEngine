import { z } from 'zod';

const StableIdSchema = z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/);
const VisualScoreSchema = z.number().int().min(0).max(1000);

const SourceFactIdSchema = z.enum([
  'hex.elevation',
  'hex.temperature',
  'hex.rainfall',
  'hex.flow_accumulation',
  'hex.terrain_role',
  'hex.terrain_kind',
  'neighbor.ruggedness',
]);

export const WorldVisualFactIdSchema = z.union([SourceFactIdSchema, StableIdSchema]);
export type WorldVisualFactId = z.infer<typeof WorldVisualFactIdSchema>;

export type WorldVisualExpression =
  | { readonly type: 'constant'; readonly value: number }
  | { readonly type: 'fact'; readonly fact: WorldVisualFactId }
  | { readonly type: 'add'; readonly values: readonly WorldVisualExpression[] }
  | { readonly type: 'multiply'; readonly values: readonly WorldVisualExpression[] }
  | {
      readonly type: 'subtract';
      readonly left: WorldVisualExpression;
      readonly right: WorldVisualExpression;
    }
  | {
      readonly type: 'remap';
      readonly value: WorldVisualExpression;
      readonly inputMin: number;
      readonly inputMax: number;
    }
  | {
      readonly type: 'clamp';
      readonly value: WorldVisualExpression;
      readonly min: number;
      readonly max: number;
    };

export const WorldVisualExpressionSchema: z.ZodType<WorldVisualExpression> = z.lazy(
  () =>
    z.union([
      z
        .object({
          type: z.literal('constant'),
          value: VisualScoreSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('fact'),
          fact: WorldVisualFactIdSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('add'),
          values: z.array(WorldVisualExpressionSchema).min(2),
        })
        .strict(),
      z
        .object({
          type: z.literal('multiply'),
          values: z.array(WorldVisualExpressionSchema).min(2),
        })
        .strict(),
      z
        .object({
          type: z.literal('subtract'),
          left: WorldVisualExpressionSchema,
          right: WorldVisualExpressionSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('remap'),
          value: WorldVisualExpressionSchema,
          inputMin: VisualScoreSchema,
          inputMax: VisualScoreSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal('clamp'),
          value: WorldVisualExpressionSchema,
          min: VisualScoreSchema,
          max: VisualScoreSchema,
        })
        .strict(),
    ]) as z.ZodType<WorldVisualExpression>,
);

export const WorldVisualConditionSchema = z
  .object({
    fact: WorldVisualFactIdSchema,
    operator: z.enum(['eq', 'gte', 'lte']),
    value: z.union([
      VisualScoreSchema,
      z.enum(['land', 'water', 'ocean', 'coastal_water', 'sea', 'lake']),
    ]),
  })
  .strict();

export type WorldVisualCondition = z.infer<typeof WorldVisualConditionSchema>;

export const WorldVisualConditionGroupSchema = z
  .object({
    all: z.array(WorldVisualConditionSchema).min(1),
  })
  .strict();

export type WorldVisualConditionGroup = z.infer<typeof WorldVisualConditionGroupSchema>;

export const WorldVisualLayerSchema = z
  .object({
    id: StableIdSchema,
    depth: z.number().int().min(0).max(1000),
  })
  .strict();

export type WorldVisualLayer = z.infer<typeof WorldVisualLayerSchema>;

export const WorldVisualAssetSchema = z
  .object({
    id: StableIdSchema,
    key: StableIdSchema,
    url: z.string().regex(/^\/assets\/.+\.(?:png|webp)$/),
  })
  .strict();

export type WorldVisualAsset = z.infer<typeof WorldVisualAssetSchema>;

export const WorldVisualSignalSchema = z
  .object({
    id: StableIdSchema.refine((id) => id.startsWith('environment.'), {
      message: 'Visual signal IDs must use the environment.* namespace.',
    }),
    expression: WorldVisualExpressionSchema,
  })
  .strict();

export type WorldVisualSignal = z.infer<typeof WorldVisualSignalSchema>;

const WorldVisualSpriteRendererSchema = z
  .object({
    type: z.literal('sprite'),
    assetId: StableIdSchema,
    scalePermille: z.number().int().positive().max(4000),
    offsetX: z.number().int().min(-2000).max(2000).default(0),
    offsetY: z.number().int().min(-2000).max(2000).default(0),
    originX: z.number().min(0).max(1).default(0.5),
    originY: z.number().min(0).max(1).default(0.5),
    alphaPermille: VisualScoreSchema.default(1000),
    tint: z.number().int().min(0).max(0xffffff).optional(),
  })
  .strict();

const WorldVisualScatterRendererSchema = z
  .object({
    type: z.literal('scatter'),
    assetId: StableIdSchema,
    candidateCount: z.number().int().positive().max(16),
    scalePermille: z.number().int().positive().max(4000),
    densitySteps: z
      .array(
        z
          .object({
            min: VisualScoreSchema,
            count: z.number().int().nonnegative().max(16),
          })
          .strict(),
      )
      .min(1),
    originX: z.number().min(0).max(1).default(0.5),
    originY: z.number().min(0).max(1).default(0.5),
    alphaPermille: VisualScoreSchema.default(1000),
    tint: z.number().int().min(0).max(0xffffff).optional(),
  })
  .strict();

export const WorldVisualRendererSchema = z.discriminatedUnion('type', [
  WorldVisualSpriteRendererSchema,
  WorldVisualScatterRendererSchema,
]);

export type WorldVisualRenderer = z.infer<typeof WorldVisualRendererSchema>;

export const WorldVisualFeatureSchema = z
  .object({
    id: StableIdSchema,
    layerId: StableIdSchema,
    priority: z.number().int().min(0).max(1000),
    when: WorldVisualConditionGroupSchema,
    intensity: WorldVisualExpressionSchema.optional(),
    renderer: WorldVisualRendererSchema,
  })
  .strict();

export type WorldVisualFeature = z.infer<typeof WorldVisualFeatureSchema>;

export const WorldVisualSurfaceVariantSchema = z
  .object({
    id: StableIdSchema,
    frame: z.number().int().nonnegative(),
    weight: z.number().int().positive().max(1000),
  })
  .strict();

export type WorldVisualSurfaceVariant = z.infer<typeof WorldVisualSurfaceVariantSchema>;

export const WorldVisualSurfaceSchema = z
  .object({
    id: StableIdSchema,
    priority: z.number().int().min(0).max(1000),
    when: WorldVisualConditionGroupSchema,
    variants: z.array(WorldVisualSurfaceVariantSchema).min(1),
  })
  .strict();

export type WorldVisualSurface = z.infer<typeof WorldVisualSurfaceSchema>;

export const WorldVisualCatalogManifestSchema = z
  .object({
    layers: z.array(z.string().regex(/^[a-z0-9][a-z0-9_/-]*\.json$/)).min(1),
    assets: z.array(z.string().regex(/^[a-z0-9][a-z0-9_/-]*\.json$/)).min(1),
    signals: z.array(z.string().regex(/^[a-z0-9][a-z0-9_/-]*\.json$/)).min(1),
    features: z.array(z.string().regex(/^[a-z0-9][a-z0-9_/-]*\.json$/)).min(1),
    surfaces: z.array(z.string().regex(/^[a-z0-9][a-z0-9_/-]*\.json$/)).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = [
      ...manifest.layers,
      ...manifest.assets,
      ...manifest.signals,
      ...manifest.features,
      ...manifest.surfaces,
    ];
    const duplicate = paths.find((path, index) => paths.indexOf(path) !== index);
    if (duplicate !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Visual catalog path is declared more than once: ${duplicate}`,
      });
    }
  });

export type WorldVisualCatalogManifest = z.infer<typeof WorldVisualCatalogManifestSchema>;

export const WorldVisualCatalogSchema = z
  .object({
    layers: z.array(WorldVisualLayerSchema).min(1),
    assets: z.array(WorldVisualAssetSchema).min(1),
    signals: z.array(WorldVisualSignalSchema).min(1),
    features: z.array(WorldVisualFeatureSchema).min(1),
    surfaces: z.array(WorldVisualSurfaceSchema).min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    validateUniqueIds(catalog.layers, 'layers', context);
    validateUniqueIds(catalog.assets, 'assets', context);
    validateUniqueIds(catalog.signals, 'signals', context);
    validateUniqueIds(catalog.features, 'features', context);
    validateUniqueIds(catalog.surfaces, 'surfaces', context);

    const layerIds = new Set(catalog.layers.map((layer) => layer.id));
    const assetIds = new Set(catalog.assets.map((asset) => asset.id));
    const signalIds = new Set(catalog.signals.map((signal) => signal.id));
    const knownFacts = new Set<string>([
      'hex.elevation',
      'hex.temperature',
      'hex.rainfall',
      'hex.flow_accumulation',
      'hex.terrain_role',
      'hex.terrain_kind',
      'neighbor.ruggedness',
      ...signalIds,
    ]);

    validateSignalDependencyCycles(catalog.signals, context);

    for (const [index, signal] of catalog.signals.entries()) {
      validateExpressionFacts(signal.expression, knownFacts, context, ['signals', index, 'expression']);
    }

    for (const [index, feature] of catalog.features.entries()) {
      if (!layerIds.has(feature.layerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['features', index, 'layerId'],
          message: `Visual feature references missing layer: ${feature.layerId}`,
        });
      }
      if (!assetIds.has(feature.renderer.assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['features', index, 'renderer', 'assetId'],
          message: `Visual feature references missing asset: ${feature.renderer.assetId}`,
        });
      }
      validateConditions(feature.when, knownFacts, context, ['features', index, 'when']);
      if (feature.intensity !== undefined) {
        validateExpressionFacts(feature.intensity, knownFacts, context, ['features', index, 'intensity']);
      }
      if (feature.renderer.type === 'scatter') {
        validateScatterDensitySteps(feature.renderer, context, ['features', index, 'renderer']);
      }
    }

    const variantIds = new Set<string>();
    for (const [index, surface] of catalog.surfaces.entries()) {
      validateConditions(surface.when, knownFacts, context, ['surfaces', index, 'when']);
      for (const [variantIndex, variant] of surface.variants.entries()) {
        if (variantIds.has(variant.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['surfaces', index, 'variants', variantIndex, 'id'],
            message: `Duplicate visual surface variant ID: ${variant.id}`,
          });
        }
        variantIds.add(variant.id);
      }
    }
  });

export type WorldVisualCatalog = z.infer<typeof WorldVisualCatalogSchema>;

function validateUniqueIds(
  records: readonly { readonly id: string }[],
  field: 'layers' | 'assets' | 'signals' | 'features' | 'surfaces',
  context: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (ids.has(record.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, index, 'id'],
        message: `Duplicate visual ${field.slice(0, -1)} ID: ${record.id}`,
      });
    }
    ids.add(record.id);
  }
}

function validateConditions(
  group: WorldVisualConditionGroup,
  knownFacts: ReadonlySet<string>,
  context: z.RefinementCtx,
  path: readonly (string | number)[],
): void {
  for (const [conditionIndex, condition] of group.all.entries()) {
    const conditionPath = [...path, 'all', conditionIndex] as const;
    if (!knownFacts.has(condition.fact)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...conditionPath, 'fact'],
        message: `Visual rule references missing fact: ${condition.fact}`,
      });
      continue;
    }

    const terrainRole = condition.fact === 'hex.terrain_role';
    const terrainKind = condition.fact === 'hex.terrain_kind';
    if ((terrainRole || terrainKind) && condition.operator !== 'eq') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...conditionPath, 'operator'],
        message: `${condition.fact} supports only the eq operator.`,
      });
    }
    if (
      terrainRole &&
      condition.value !== 'land' &&
      condition.value !== 'water'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...conditionPath, 'value'],
        message: 'hex.terrain_role comparisons require a land or water value.',
      });
    }
    if (
      terrainKind &&
      !['land', 'ocean', 'coastal_water', 'sea', 'lake'].includes(String(condition.value))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...conditionPath, 'value'],
        message: 'hex.terrain_kind comparisons require a terrain kind value.',
      });
    }
    if (!terrainRole && !terrainKind && typeof condition.value !== 'number') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...conditionPath, 'value'],
        message: 'Numeric visual facts require an integer score value.',
      });
    }
  }
}

function validateExpressionFacts(
  expression: WorldVisualExpression,
  knownFacts: ReadonlySet<string>,
  context: z.RefinementCtx,
  path: readonly (string | number)[],
): void {
  switch (expression.type) {
    case 'constant':
      return;
    case 'fact':
      if (
        !knownFacts.has(expression.fact) ||
        expression.fact === 'hex.terrain_role' ||
        expression.fact === 'hex.terrain_kind'
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'fact'],
          message: `Visual expression references an unknown numeric fact: ${expression.fact}`,
        });
      }
      return;
    case 'add':
    case 'multiply':
      for (const [index, value] of expression.values.entries()) {
        validateExpressionFacts(value, knownFacts, context, [...path, 'values', index]);
      }
      return;
    case 'subtract':
      validateExpressionFacts(expression.left, knownFacts, context, [...path, 'left']);
      validateExpressionFacts(expression.right, knownFacts, context, [...path, 'right']);
      return;
    case 'remap':
      if (expression.inputMin >= expression.inputMax) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'inputMin'],
          message: 'A remap expression requires inputMin to be less than inputMax.',
        });
      }
      validateExpressionFacts(expression.value, knownFacts, context, [...path, 'value']);
      return;
    case 'clamp':
      if (expression.min > expression.max) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'min'],
          message: 'A clamp expression requires min to be less than or equal to max.',
        });
      }
      validateExpressionFacts(expression.value, knownFacts, context, [...path, 'value']);
      return;
  }
}

function validateScatterDensitySteps(
  renderer: Extract<WorldVisualRenderer, { readonly type: 'scatter' }>,
  context: z.RefinementCtx,
  path: readonly (string | number)[],
): void {
  let previous = -1;
  for (const [index, step] of renderer.densitySteps.entries()) {
    if (step.min <= previous) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'densitySteps', index, 'min'],
        message: 'Scatter density steps must be ordered by strictly increasing min values.',
      });
    }
    if (step.count > renderer.candidateCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'densitySteps', index, 'count'],
        message: 'Scatter density step count cannot exceed candidateCount.',
      });
    }
    previous = step.min;
  }
}

function validateSignalDependencyCycles(
  signals: readonly WorldVisualSignal[],
  context: z.RefinementCtx,
): void {
  const signalIndexById = new Map(signals.map((signal, index) => [signal.id, index]));
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const completed = new Set<string>();
  const resolving = new Set<string>();

  function visit(id: string): void {
    if (completed.has(id)) {
      return;
    }
    const signal = signalById.get(id);
    if (signal === undefined) {
      return;
    }
    resolving.add(id);
    for (const dependency of collectExpressionFacts(signal.expression)) {
      if (!signalById.has(dependency)) {
        continue;
      }
      if (resolving.has(dependency)) {
        const index = signalIndexById.get(id);
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: index === undefined ? ['signals'] : ['signals', index, 'expression'],
          message: `Visual signal dependency cycle: ${id} -> ${dependency}`,
        });
        continue;
      }
      visit(dependency);
    }
    resolving.delete(id);
    completed.add(id);
  }

  for (const signal of signals) {
    visit(signal.id);
  }
}

function collectExpressionFacts(expression: WorldVisualExpression): readonly string[] {
  switch (expression.type) {
    case 'constant':
      return [];
    case 'fact':
      return [expression.fact];
    case 'add':
    case 'multiply':
      return expression.values.flatMap(collectExpressionFacts);
    case 'subtract':
      return [...collectExpressionFacts(expression.left), ...collectExpressionFacts(expression.right)];
    case 'remap':
    case 'clamp':
      return collectExpressionFacts(expression.value);
  }
}
