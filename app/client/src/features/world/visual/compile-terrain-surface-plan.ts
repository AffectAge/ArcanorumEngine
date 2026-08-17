import type {
  WorldBaseResponse,
  WorldGeometryChunk,
  WorldVisualSurface,
  WorldVisualSurfaceVariant,
} from '@arcanorum/shared';
import { hashWorldVisualValue } from './deterministic-visual-hash.js';
import {
  createHexWorldVisualFactResolver,
  matchesWorldVisualConditions,
} from './world-visual-facts.js';

export type TerrainSurfaceTile = {
  readonly q: number;
  readonly r: number;
  readonly surfaceId: string;
  readonly variantId: string;
  readonly frame: number;
};

export type TerrainSurfacePlan = {
  readonly tiles: readonly TerrainSurfaceTile[];
};

/** Selects exactly one deterministic, visual-only base surface for every rendered hex. */
export function compileTerrainSurfacePlan(
  world: WorldBaseResponse,
  chunk: WorldGeometryChunk,
): TerrainSurfacePlan {
  const catalog = world.geometry.visuals;
  const terrainById = new Map(world.geometry.terrain.terrainTypes.map((terrain) => [terrain.id, terrain]));
  const hexByCoordinate = new Map(
    [...chunk.hexes, ...chunk.visualNeighbors].map((hex) => [`${hex.q}:${hex.r}`, hex]),
  );

  return {
    tiles: chunk.hexes.map((hex) => {
      const terrain = terrainById.get(hex.terrainId);
      if (terrain === undefined) {
        throw new Error(`Surface compilation is missing terrain metadata for ${hex.terrainId}.`);
      }
      const facts = createHexWorldVisualFactResolver(catalog, hex, terrain, hexByCoordinate);
      const matching = catalog.surfaces.filter((surface) =>
        matchesWorldVisualConditions(surface.when, facts),
      );
      if (matching.length === 0) {
        throw new Error(
          `No visual surface matches hex ${hex.q}:${hex.r} with terrain ${hex.terrainId}.`,
        );
      }

      const highestPriority = Math.max(...matching.map((surface) => surface.priority));
      const winners = matching.filter((surface) => surface.priority === highestPriority);
      if (winners.length !== 1) {
        throw new Error(
          `Visual surface rules are ambiguous at hex ${hex.q}:${hex.r}: ${winners
            .map((surface) => surface.id)
            .sort(compareText)
            .join(', ')}.`,
        );
      }

      const surface = requiredSurface(winners[0]);
      const variant = selectVariant(world.seed, hex.q, hex.r, surface);
      return {
        q: hex.q,
        r: hex.r,
        surfaceId: surface.id,
        variantId: variant.id,
        frame: variant.frame,
      };
    }),
  };
}

function selectVariant(
  worldSeed: string,
  q: number,
  r: number,
  surface: WorldVisualSurface,
): WorldVisualSurfaceVariant {
  const variants = [...surface.variants].sort((left, right) => compareText(left.id, right.id));
  const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0);
  let selection = hashWorldVisualValue(worldSeed, q, r, surface.id, 0, 'surface-variant') % totalWeight;
  for (const variant of variants) {
    if (selection < variant.weight) {
      return variant;
    }
    selection -= variant.weight;
  }
  throw new Error(`Surface ${surface.id} has invalid variant weights.`);
}

function requiredSurface(surface: WorldVisualSurface | undefined): WorldVisualSurface {
  if (surface === undefined) {
    throw new Error('Expected exactly one visual surface winner.');
  }
  return surface;
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
