import { describe, expect, it } from 'vitest';
import type { WorldGenerationConfig } from '../config.js';
import { generateWorld } from './generator.js';
import { loadTerrainCatalog } from './terrain-catalog.js';

const GENERATION_CONFIG: WorldGenerationConfig = {
  width: 384,
  height: 256,
  continentCount: 2,
  continentCoverage: 0.36,
  continentMinimumSeparation: 12,
  outerOcean: { hardWidth: 3 },
  continentalPlacement: { edgeClearance: 4 },
  continentalAxes: {
    minimumCount: 3,
    maximumCount: 4,
    primaryLengthMinimumFactor: 0.55,
    primaryLengthMaximumFactor: 0.85,
    branchLengthMinimumFactor: 0.45,
    branchLengthMaximumFactor: 0.7,
    widthMinimumFactor: 0.55,
    widthMaximumFactor: 0.65,
    landThreshold: 0.01,
    separationWidth: 7,
    domainWarpScale: 64,
    domainWarpAmount: 9,
  },
  coastNoise: {
    macroScale: 96,
    macroAmplitude: 0.22,
    bayScale: 28,
    bayAmplitude: 0.16,
    detailScale: 8,
    detailAmplitude: 0.045,
  },
  topology: { smoothingPasses: 1, minimumIslandHexes: 6 },
  seaLevel: 520,
  islandCount: 5,
  islandMaximumRadius: 3,
  seaCount: 1,
  seaRadius: 2,
  seaChannelMinimumWidth: 1,
  seaChannelMaximumWidth: 1,
  seaChannelMeander: 0.2,
  lakeCount: 1,
  lakeRadius: 1,
  coastalWaterWidth: 1,
  mountainRangeCount: 2,
  mountainRangeMinimumLength: 7,
  mountainRangeMaximumLength: 14,
  mountainRangeWidth: 3,
  mountainRangeHeight: 230,
  riverFlowThreshold: 0.012,
  climate: {
    equatorialTemperature: 880,
    polarTemperature: 220,
    elevationCooling: 0.55,
    prevailingWind: 'west_to_east',
    rainfallNoise: 45,
  },
};

describe('world generation', () => {
  it('reproduces the same map, water classification, and river edges from one seed', () => {
    const catalog = loadTerrainCatalog().catalog;
    const first = generateWorld('deterministic-world-seed', GENERATION_CONFIG, catalog);
    const second = generateWorld('deterministic-world-seed', GENERATION_CONFIG, catalog);

    expect(second).toEqual(first);
    expect(first.hexes).toHaveLength(GENERATION_CONFIG.width * GENERATION_CONFIG.height);
    expect(first.landmasses.filter((landmass) => landmass.kind === 'continent')).toHaveLength(2);
    expect(first.waterBodies.filter((waterBody) => waterBody.kind === 'sea')).toHaveLength(1);
    expect(first.waterBodies.filter((waterBody) => waterBody.kind === 'lake')).toHaveLength(1);
    expect(first.rivers.length).toBeGreaterThan(0);
    expect(first.hexes.every((hex) => hex.temperature >= 0 && hex.temperature <= 1000)).toBe(true);
    expect(first.hexes.every((hex) => hex.rainfall >= 0 && hex.rainfall <= 1000)).toBe(true);
    const boundaryHexes = first.hexes.filter(
      (hex) =>
        hex.q === 0 ||
        hex.r === 0 ||
        hex.q === GENERATION_CONFIG.width - 1 ||
        hex.r === GENERATION_CONFIG.height - 1,
    );
    expect(boundaryHexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ waterBodyId: 'water.ocean.1' })]),
    );
    expect(boundaryHexes.every((hex) => hex.waterBodyId === 'water.ocean.1')).toBe(true);
    expect(first.diagnostics.boundaryLandHexCount).toBe(0);
    expect(first.diagnostics.connectedSeaCount).toBe(1);
    expect(first.diagnostics.stages.map((stage) => stage.id)).toEqual([
      'stage.base_grid',
      'stage.macro_land',
      'stage.topology',
      'stage.water_geometry',
      'stage.mountains',
      'stage.water_bodies',
      'stage.climate',
      'stage.hydrology',
    ]);
    expectRiversReachWater(first);
    expect(new Set(first.hexes.map((hex) => hex.terrainId))).toEqual(
      new Set(['terrain.ocean', 'terrain.coastal_water', 'terrain.sea', 'terrain.lake', 'terrain.land']),
    );
  }, 30_000);
});

function expectRiversReachWater(world: ReturnType<typeof generateWorld>): void {
  const hexByCoordinate = new Map(world.hexes.map((hex) => [`${hex.q}:${hex.r}`, hex]));
  const riverBySource = new Map(world.rivers.map((river) => [`${river.fromQ}:${river.fromR}`, river]));

  for (const river of world.rivers) {
    const visited = new Set<string>();
    let current = `${river.fromQ}:${river.fromR}`;

    while (true) {
      expect(visited.has(current)).toBe(false);
      visited.add(current);
      const edge = riverBySource.get(current);
      if (edge === undefined) {
        throw new Error(`River edge is missing downstream continuation from ${current}.`);
      }
      const target = `${edge.toQ}:${edge.toR}`;
      const targetHex = hexByCoordinate.get(target);
      expect(targetHex).toBeDefined();
      if (targetHex?.waterBodyId !== undefined) {
        break;
      }
      current = target;
    }
  }
}
