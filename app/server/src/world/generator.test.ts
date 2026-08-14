import { describe, expect, it } from 'vitest';
import type { WorldGenerationConfig } from '../config.js';
import { generateWorld } from './generator.js';
import { loadTerrainCatalog } from './terrain-catalog.js';

const GENERATION_CONFIG: WorldGenerationConfig = {
  width: 96,
  height: 72,
  topology: {
    mapStyle: 'continents',
    landCoverage: 0.36,
    candidateCount: 4,
    continentalGrain: 3,
    riftStrength: 0.68,
    islandFrequency: 0.4,
    edgeClearance: 2,
    outerOceanWidth: 2,
    coastRoughness: 0.45,
    coastalWaterWidth: 1,
    seaMinimumHexes: 10,
    seaMaximumMouthWidth: 8,
    seaMinimumDepth: 3,
    seaMinimumEnclosure: 0.4,
  },
  tectonics: {
    plateCount: 10,
    activity: 0.65,
    boundaryFalloff: 6,
    collisionUplift: 260,
    subductionUplift: 190,
    trenchDepth: 120,
    riftDepth: 80,
    hotspotCount: 2,
  },
  relief: {
    seaLevel: 520,
    continentalBaseElevation: 75,
    oceanFloorDepth: 280,
    shelfWidth: 3,
    regionalNoiseScale: 32,
    regionalNoiseAmplitude: 65,
    detailNoiseScale: 8,
    detailNoiseAmplitude: 20,
  },
  climate: {
    equatorialTemperature: 880,
    polarTemperature: 220,
    elevationCooling: 0.55,
    windBandStrength: 650,
    moistureTransportPasses: 14,
    orographicStrength: 700,
    evaporationStrength: 420,
    rainfallNoise: 45,
  },
  hydrology: {
    minimumLakeHexes: 2,
    maximumLakeCoverage: 0.02,
    lakeWaterBalanceThreshold: 70,
    channelInitiationRunoff: 2200,
    erosionPasses: 2,
    streamPowerStrength: 18,
    maximumIncisionPerPass: 10,
  },
};

describe('world generation', () => {
  it('reproduces the same map, water classification, and river edges from one seed', () => {
    const catalog = loadTerrainCatalog().catalog;
    const first = generateWorld('deterministic-world-seed', GENERATION_CONFIG, catalog);
    const second = generateWorld('deterministic-world-seed', GENERATION_CONFIG, catalog);

    expect(second).toEqual(first);
    expect(first.hexes).toHaveLength(GENERATION_CONFIG.width * GENERATION_CONFIG.height);
    expect(first.landmasses.filter((landmass) => landmass.kind === 'continent').length).toBeGreaterThan(0);
    expect(first.landmasses.length).toBeGreaterThan(0);
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
    expect(first.diagnostics.connectedSeaCount).toBe(
      first.waterBodies.filter((waterBody) => waterBody.kind === 'sea').length,
    );
    expectSaltWaterCoastsUseCoastalTerrain(first);
    expect(first.diagnostics.stages.map((stage) => stage.id)).toEqual([
      'stage.base_grid',
      'stage.tectonic_plates',
      'stage.land_topology',
      'stage.relief',
      'stage.climate_initial',
      'stage.surface_water',
      'stage.hydrology_erosion',
      'stage.geography',
    ]);
    expectRiversReachWater(first);
    const terrainIds = new Set(first.hexes.map((hex) => hex.terrainId));
    expect(terrainIds).toContain('terrain.ocean');
    expect(terrainIds).toContain('terrain.coastal_water');
    expect(terrainIds).toContain('terrain.land');
    expect(terrainIds).toContain('terrain.sea');
    expect(terrainIds).toContain('terrain.lake');
  }, 30_000);

  it('preserves topology, water, and drainage invariants across representative seeds', () => {
    const catalog = loadTerrainCatalog().catalog;
    const targetLand = Math.round(
      GENERATION_CONFIG.width * GENERATION_CONFIG.height * GENERATION_CONFIG.topology.landCoverage,
    );
    const maximumLakeHexes = Math.floor(
      GENERATION_CONFIG.width * GENERATION_CONFIG.height * GENERATION_CONFIG.hydrology.maximumLakeCoverage,
    );

    for (let seedIndex = 0; seedIndex < 8; seedIndex += 1) {
      const world = generateWorld(`topology-property-${seedIndex}`, GENERATION_CONFIG, catalog);
      expect(world.landmasses.filter((landmass) => landmass.kind === 'continent').length).toBeGreaterThan(0);
      expect(world.diagnostics.landHexCount).toBeLessThanOrEqual(
        GENERATION_CONFIG.width * GENERATION_CONFIG.height,
      );
      expect(world.diagnostics.landHexCount).toBeGreaterThanOrEqual(
        Math.floor(targetLand * 0.8) - maximumLakeHexes,
      );
      expect(world.diagnostics.boundaryLandHexCount).toBe(0);
      expect(world.rivers.length).toBeGreaterThan(0);
      expectLandmassesConnected(world);
      expectContinentSilhouettesRemainNonRectangular(world);
      expectRiversReachWater(world);
      expectWaterBodiesConsistent(world);
    }
  }, 30_000);

  it('keeps topology streams unchanged when only climate settings change', () => {
    const catalog = loadTerrainCatalog().catalog;
    const baseline = generateWorld('named-stream-seed', GENERATION_CONFIG, catalog);
    const wetter = generateWorld(
      'named-stream-seed',
      {
        ...GENERATION_CONFIG,
        climate: {
          ...GENERATION_CONFIG.climate,
          evaporationStrength: GENERATION_CONFIG.climate.evaporationStrength + 80,
        },
      },
      catalog,
    );

    expect(wetter.diagnostics.stages.slice(0, 4)).toEqual(baseline.diagnostics.stages.slice(0, 4));
  });

  it('generates every emergent map style without an unbounded retry path', () => {
    const catalog = loadTerrainCatalog().catalog;
    for (const mapStyle of ['continents', 'fractal', 'pangaea', 'archipelago'] as const) {
      const world = generateWorld(
        `map-style-${mapStyle}`,
        {
          ...GENERATION_CONFIG,
          topology: { ...GENERATION_CONFIG.topology, mapStyle, candidateCount: 2 },
        },
        catalog,
      );
      expect(world.landmasses.length).toBeGreaterThan(0);
      expect(world.diagnostics.boundaryLandHexCount).toBe(0);
      expectLandmassesConnected(world);
    }
  });

  it('completes accepted low/high land coverage with a single candidate', () => {
    const catalog = loadTerrainCatalog().catalog;
    for (const landCoverage of [0.08, 0.7]) {
      const world = generateWorld(
        `coverage-boundary-${landCoverage}`,
        {
          ...GENERATION_CONFIG,
          topology: {
            ...GENERATION_CONFIG.topology,
            landCoverage,
            candidateCount: 1,
          },
        },
        catalog,
      );
      expect(world.landmasses.length).toBeGreaterThan(0);
      expect(world.diagnostics.landHexCount).toBeGreaterThan(0);
      expect(world.diagnostics.boundaryLandHexCount).toBe(0);
      expectLandmassesConnected(world);
      expectRiversReachWater(world);
    }
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

function expectLandmassesConnected(world: ReturnType<typeof generateWorld>): void {
  const hexByCoordinate = new Map(world.hexes.map((hex) => [`${hex.q}:${hex.r}`, hex]));
  for (const landmass of world.landmasses) {
    const indexes = world.hexes.filter((hex) => hex.landmassId === landmass.id);
    const first = indexes[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      continue;
    }
    const queue = [first];
    const visited = new Set([`${first.q}:${first.r}`]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        throw new Error('Landmass connectivity queue unexpectedly ended.');
      }
      for (const [deltaQ, deltaR] of neighborOffsets(current.q)) {
        const key = `${current.q + deltaQ}:${current.r + deltaR}`;
        const neighbor = hexByCoordinate.get(key);
        if (neighbor?.landmassId === landmass.id && !visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }
    expect(visited.size).toBe(landmass.hexCount);
  }
}

function expectWaterBodiesConsistent(world: ReturnType<typeof generateWorld>): void {
  const counts = new Map<string, number>();
  for (const hex of world.hexes) {
    if (hex.waterBodyId !== undefined) {
      counts.set(hex.waterBodyId, (counts.get(hex.waterBodyId) ?? 0) + 1);
    }
  }
  for (const waterBody of world.waterBodies) {
    expect(counts.get(waterBody.id)).toBe(waterBody.hexCount);
  }
  expect(world.diagnostics.connectedSeaCount).toBe(
    world.waterBodies.filter((waterBody) => waterBody.kind === 'sea').length,
  );
}

function expectSaltWaterCoastsUseCoastalTerrain(world: ReturnType<typeof generateWorld>): void {
  const hexByCoordinate = new Map(world.hexes.map((hex) => [`${hex.q}:${hex.r}`, hex]));
  const coastalSeaHexes = world.hexes.filter(
    (hex) =>
      hex.waterBodyId?.startsWith('water.sea.') === true &&
      neighborOffsets(hex.q).some(
        ([deltaQ, deltaR]) =>
          hexByCoordinate.get(`${hex.q + deltaQ}:${hex.r + deltaR}`)?.landmassId !== undefined,
      ),
  );

  expect(coastalSeaHexes.length).toBeGreaterThan(0);
  expect(coastalSeaHexes.every((hex) => hex.terrainId === 'terrain.coastal_water')).toBe(true);
}

/** Regression guard for the old domain-filling, nearly rectangular continents. */
function expectContinentSilhouettesRemainNonRectangular(world: ReturnType<typeof generateWorld>): void {
  for (const continent of world.landmasses.filter((landmass) => landmass.kind === 'continent')) {
    const hexes = world.hexes.filter((hex) => hex.landmassId === continent.id);
    const qValues = hexes.map((hex) => hex.q);
    const rValues = hexes.map((hex) => hex.r);
    const boundingWidth = Math.max(...qValues) - Math.min(...qValues) + 1;
    const boundingHeight = Math.max(...rValues) - Math.min(...rValues) + 1;
    const boundingFill = continent.hexCount / (boundingWidth * boundingHeight);
    expect(boundingFill).toBeLessThanOrEqual(0.82);
  }
}

function neighborOffsets(q: number): ReadonlyArray<readonly [number, number]> {
  return q % 2 === 0
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
}
