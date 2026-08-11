import { describe, expect, it } from 'vitest';
import type { WorldGenerationConfig } from '../config.js';
import { generateWorld } from './generator.js';
import { loadTerrainCatalog } from './terrain-catalog.js';

const GENERATION_CONFIG: WorldGenerationConfig = {
  width: 48,
  height: 36,
  continentCount: 2,
  continentCoverage: 0.36,
  continentMinimumSeparation: 12,
  continentCoastRoughness: 0.16,
  continentCoastNoiseScale: 12,
  seaLevel: 520,
  islandCount: 5,
  islandMaximumRadius: 3,
  seaCount: 1,
  seaRadius: 4,
  lakeCount: 3,
  lakeRadius: 2,
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
    expect(first.waterBodies.filter((waterBody) => waterBody.kind === 'lake')).toHaveLength(3);
    expect(first.rivers.length).toBeGreaterThan(0);
    expect(first.hexes.filter((hex) => hex.biomeId !== undefined)).not.toHaveLength(0);
    expect(first.hexes.every((hex) => hex.temperature >= 0 && hex.temperature <= 1000)).toBe(true);
    expect(first.hexes.every((hex) => hex.rainfall >= 0 && hex.rainfall <= 1000)).toBe(true);
    expect(
      first.hexes.filter((hex) => hex.landmassId !== undefined).every((hex) => hex.biomeId !== undefined),
    ).toBe(true);
    expect(
      first.hexes.filter((hex) => hex.waterBodyId !== undefined).every((hex) => hex.biomeId === undefined),
    ).toBe(true);
    expect(first.diagnostics.stages.map((stage) => stage.id)).toEqual([
      'stage.base_grid',
      'stage.landforms',
      'stage.water_bodies',
      'stage.climate_and_biomes',
      'stage.hydrology',
    ]);
    expectRiversReachWater(first);
    expect(new Set(first.hexes.map((hex) => hex.terrainId))).toEqual(
      new Set(['terrain.ocean', 'terrain.coastal_water', 'terrain.sea', 'terrain.lake', 'terrain.land']),
    );
  });
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
