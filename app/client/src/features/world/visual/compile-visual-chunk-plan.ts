import type {
  WorldBaseResponse,
  WorldGeometryChunk,
  WorldVisualFeature,
} from '@arcanorum/shared';
import { hashWorldVisualValue } from './deterministic-visual-hash.js';
import {
  createHexWorldVisualFactResolver,
  matchesWorldVisualConditions,
} from './world-visual-facts.js';

export type VisualChunkSprite = {
  readonly featureId: string;
  readonly assetId: string;
  readonly q: number;
  readonly r: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly originX: number;
  readonly originY: number;
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
  const terrainById = new Map(world.geometry.terrain.terrainTypes.map((terrain) => [terrain.id, terrain]));
  const hexByCoordinate = new Map(
    [...chunk.hexes, ...chunk.visualNeighbors].map((hex) => [`${hex.q}:${hex.r}`, hex]),
  );
  const layerById = new Map(catalog.layers.map((layer) => [layer.id, layer]));
  const assetById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const features = [...catalog.features].sort(compareFeatures);
  const groups = new Map<string, MutableVisualChunkLayerPlan>();

  for (const hex of chunk.hexes) {
    const terrain = terrainById.get(hex.terrainId);
    if (terrain === undefined) {
      throw new Error(`Visual feature compilation is missing terrain metadata for ${hex.terrainId}.`);
    }
    const facts = createHexWorldVisualFactResolver(catalog, hex, terrain, hexByCoordinate);

    for (const feature of features) {
      if (!matchesWorldVisualConditions(feature.when, facts)) {
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
          originX: feature.renderer.originX,
          originY: feature.renderer.originY,
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
    (((hashWorldVisualValue(world.seed, q, r, feature.id, candidate, 'x') % 1001) - 500) * width) /
      2500,
  );
  const offsetY = Math.floor(
    (((hashWorldVisualValue(world.seed, q, r, feature.id, candidate, 'y') % 1001) - 500) * height) /
      3800,
  );
  const scaleVariation =
    (hashWorldVisualValue(world.seed, q, r, feature.id, candidate, 'scale') % 161) - 80;

  return {
    featureId: feature.id,
    assetId,
    q,
    r,
    offsetX,
    offsetY,
    originX: feature.renderer.originX,
    originY: feature.renderer.originY,
    scalePermille: Math.max(1, feature.renderer.scalePermille + scaleVariation),
    alphaPermille: feature.renderer.alphaPermille,
    tint: feature.renderer.tint,
  };
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
