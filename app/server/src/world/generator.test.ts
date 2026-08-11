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
  seaLevel: 520,
  islandCount: 5,
  islandMaximumRadius: 3,
  seaCount: 1,
  seaRadius: 4,
  lakeCount: 3,
  lakeRadius: 2,
  coastalWaterWidth: 1,
  riverCount: 4,
  riverMinimumSourceElevation: 640,
  riverMinimumSourceDistance: 5,
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
    expect(new Set(first.hexes.map((hex) => hex.terrainId))).toEqual(
      new Set(['terrain.ocean', 'terrain.coastal_water', 'terrain.sea', 'terrain.lake', 'terrain.land']),
    );
  });
});
