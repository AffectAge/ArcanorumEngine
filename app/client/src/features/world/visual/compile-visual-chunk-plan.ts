import type {
  WorldBaseResponse,
  WorldGeometryChunk,
  WorldVisualCatalog,
  WorldVisualExpression,
  WorldVisualFeature,
} from '@arcanorum/shared';

export type VisualChunkSprite = {
  readonly featureId: string;
  readonly assetId: string;
  readonly q: number;
  readonly r: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scalePermille: number;
  readonly alphaPermille: number;
  readonly tint: number | undefined;
};

export type VisualChunkLayerPlan = {
  readonly layerId: string;
  readonly depth: number;
  readonly assetId: string;
  readonly assetKey: string;
  readonly sprites: readonly VisualChunkSprite[];
};

export type VisualChunkPlan = {
  readonly layers: readonly VisualChunkLayerPlan[];
};

type MutableVisualChunkLayerPlan = {
  readonly layerId: string;
  readonly depth: number;
  readonly assetId: string;
  readonly assetKey: string;
  readonly sprites: VisualChunkSprite[];
};

/**
 * Pure client-side compilation of visual-only features for one immutable world
 * chunk. It never changes WorldHex data and uses coordinate-hashed scatter so
 * chunk unload/reload preserves the same decoration layout.
 */
export function compileVisualChunkPlan(world: WorldBaseResponse, chunk: WorldGeometryChunk): VisualChunkPlan {
  const catalog = world.geometry.visuals;
  const terrainCategoryById = new Map(
    world.geometry.terrain.terrainTypes.map((terrain) => [terrain.id, terrain.category]),
  );
  const hexByCoordinate = new Map(
    [...chunk.hexes, ...chunk.visualNeighbors].map((hex) => [`${hex.q}:${hex.r}`, hex]),
  );
  const layerById = new Map(catalog.layers.map((layer) => [layer.id, layer]));
  const assetById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const features = [...catalog.features].sort(compareFeatures);
  const groups = new Map<string, MutableVisualChunkLayerPlan>();

  for (const hex of chunk.hexes) {
    const terrainCategory = terrainCategoryById.get(hex.terrainId);
    if (terrainCategory === undefined) {
      throw new Error(`Visual feature compilation is missing terrain metadata for ${hex.terrainId}.`);
    }
    const facts = createFactResolver(catalog, {
      'hex.elevation': hex.elevation,
      'hex.temperature': hex.temperature,
      'hex.rainfall': hex.rainfall,
      'hex.flow_accumulation': clampScore(hex.flowAccumulation),
      'hex.terrain_role': terrainCategory,
      'neighbor.ruggedness': resolveRuggedness(hex.q, hex.r, hex.elevation, hexByCoordinate),
    });

    for (const feature of features) {
      if (!matchesFeature(feature, facts)) {
        continue;
      }
      const layer = layerById.get(feature.layerId);
      const asset = assetById.get(feature.renderer.assetId);
      if (layer === undefined || asset === undefined) {
        throw new Error(`Visual catalog contains unresolved references for ${feature.id}.`);
      }
      const groupKey = `${layer.id}\u0000${asset.id}`;
      let group = groups.get(groupKey);
      if (group === undefined) {
        group = {
          layerId: layer.id,
          depth: layer.depth,
          assetId: asset.id,
          assetKey: asset.key,
          sprites: [],
        };
        groups.set(groupKey, group);
      }
      const sprites = group.sprites;
      if (feature.renderer.type === 'sprite') {
        sprites.push({
          featureId: feature.id,
          assetId: asset.id,
          q: hex.q,
          r: hex.r,
          offsetX: feature.renderer.offsetX,
          offsetY: feature.renderer.offsetY,
          scalePermille: feature.renderer.scalePermille,
          alphaPermille: feature.renderer.alphaPermille,
          tint: feature.renderer.tint,
        });
        continue;
      }

      const intensity = feature.intensity === undefined ? 1000 : facts.number(feature.intensity);
      const count = resolveScatterCount(feature.renderer.densitySteps, intensity);
      for (let candidate = 0; candidate < count; candidate += 1) {
        sprites.push(createScatterSprite(world, hex.q, hex.r, feature, asset.id, candidate));
      }
    }
  }

  return {
    layers: [...groups.values()]
      .filter((group) => group.sprites.length > 0)
      .map((group) => ({ ...group, sprites: [...group.sprites].sort(compareSprites) }))
      .sort(compareLayerPlans),
  };
}

function resolveRuggedness(
  q: number,
  r: number,
  elevation: number,
  hexByCoordinate: ReadonlyMap<string, { readonly elevation: number }>,
): number {
  const offsets: ReadonlyArray<readonly [number, number]> =
    q % 2 === 0
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
  const maximumDifference = Math.max(
    0,
    ...offsets.map(([offsetQ, offsetR]) => {
      const neighbor = hexByCoordinate.get(`${q + offsetQ}:${r + offsetR}`);
      return neighbor === undefined ? 0 : Math.abs(elevation - neighbor.elevation);
    }),
  );
  return clampScore(maximumDifference * 8);
}

function createFactResolver(
  catalog: WorldVisualCatalog,
  sourceFacts: Readonly<Record<string, number | 'land' | 'water'>>,
): {
  readonly value: (factId: string) => number | 'land' | 'water';
  readonly number: (expression: WorldVisualExpression) => number;
} {
  const signalById = new Map(catalog.signals.map((signal) => [signal.id, signal.expression]));
  const resolved = new Map<string, number | 'land' | 'water'>();
  const resolving = new Set<string>();

  function value(factId: string): number | 'land' | 'water' {
    const source = sourceFacts[factId];
    if (source !== undefined) {
      return source;
    }
    const cached = resolved.get(factId);
    if (cached !== undefined) {
      return cached;
    }
    const expression = signalById.get(factId);
    if (expression === undefined) {
      throw new Error(`Visual rule references an unknown fact: ${factId}`);
    }
    if (resolving.has(factId)) {
      throw new Error(`Visual signal dependency cycle includes ${factId}.`);
    }
    resolving.add(factId);
    const result = number(expression);
    resolving.delete(factId);
    resolved.set(factId, result);
    return result;
  }

  function number(expression: WorldVisualExpression): number {
    switch (expression.type) {
      case 'constant':
        return expression.value;
      case 'fact': {
        const result = value(expression.fact);
        if (typeof result !== 'number') {
          throw new Error(`Visual expression requires numeric fact: ${expression.fact}`);
        }
        return result;
      }
      case 'add':
        return clampScore(expression.values.reduce((sum, value) => sum + number(value), 0));
      case 'multiply':
        return expression.values.reduce((product, value) => multiplyScores(product, number(value)), 1000);
      case 'subtract':
        return clampScore(number(expression.left) - number(expression.right));
      case 'remap': {
        const input = number(expression.value);
        if (input <= expression.inputMin) {
          return 0;
        }
        if (input >= expression.inputMax) {
          return 1000;
        }
        return Math.floor(
          ((input - expression.inputMin) * 1000) / (expression.inputMax - expression.inputMin),
        );
      }
      case 'clamp':
        return Math.max(expression.min, Math.min(expression.max, number(expression.value)));
    }
  }

  return { value, number };
}

function matchesFeature(feature: WorldVisualFeature, facts: ReturnType<typeof createFactResolver>): boolean {
  return feature.when.all.every((condition) => {
    const actual = facts.value(condition.fact);
    switch (condition.operator) {
      case 'eq':
        return actual === condition.value;
      case 'gte':
        return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
      case 'lte':
        return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    }
  });
}

function resolveScatterCount(
  steps: readonly { readonly min: number; readonly count: number }[],
  intensity: number,
): number {
  let count = 0;
  for (const step of steps) {
    if (intensity < step.min) {
      break;
    }
    count = step.count;
  }
  return count;
}

function createScatterSprite(
  world: WorldBaseResponse,
  q: number,
  r: number,
  feature: WorldVisualFeature,
  assetId: string,
  candidate: number,
): VisualChunkSprite {
  if (feature.renderer.type !== 'scatter') {
    throw new Error(`Visual scatter was requested for non-scatter feature ${feature.id}.`);
  }
  const width = world.geometry.terrain.atlas.frameWidth;
  const height = world.geometry.terrain.atlas.frameHeight;
  const offsetX = Math.floor(
    (((hashVisualValue(world.seed, q, r, feature.id, candidate, 'x') % 1001) - 500) * width) / 2500,
  );
  const offsetY = Math.floor(
    (((hashVisualValue(world.seed, q, r, feature.id, candidate, 'y') % 1001) - 500) * height) / 3800,
  );
  const scaleVariation = (hashVisualValue(world.seed, q, r, feature.id, candidate, 'scale') % 161) - 80;

  return {
    featureId: feature.id,
    assetId,
    q,
    r,
    offsetX,
    offsetY,
    scalePermille: Math.max(1, feature.renderer.scalePermille + scaleVariation),
    alphaPermille: feature.renderer.alphaPermille,
    tint: feature.renderer.tint,
  };
}

function hashVisualValue(
  worldSeed: string,
  q: number,
  r: number,
  featureId: string,
  candidate: number,
  axis: 'x' | 'y' | 'scale',
): number {
  const value = `${worldSeed}|${q}|${r}|${featureId}|${candidate}|${axis}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    hash ^= codePoint;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function multiplyScores(left: number, right: number): number {
  return Math.floor((left * right) / 1000);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1000, value));
}

function compareFeatures(left: WorldVisualFeature, right: WorldVisualFeature): number {
  return left.priority - right.priority || compareText(left.id, right.id);
}

function compareSprites(left: VisualChunkSprite, right: VisualChunkSprite): number {
  return left.r - right.r || left.q - right.q || compareText(left.featureId, right.featureId);
}

function compareLayerPlans(left: VisualChunkLayerPlan, right: VisualChunkLayerPlan): number {
  return (
    left.depth - right.depth ||
    compareText(left.layerId, right.layerId) ||
    compareText(left.assetId, right.assetId)
  );
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
