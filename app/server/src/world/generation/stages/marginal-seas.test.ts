import { describe, expect, it } from 'vitest';
import type { WorldGenerationConfig } from '../../../config.js';
import { compileWorldGenerationConfig } from '../config-compiler.js';
import { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { classifyMarginalSeas } from './marginal-seas.js';

const BASE_CONFIGURATION: WorldGenerationConfig = {
  width: 30,
  height: 24,
  topology: {
    mapStyle: 'continents',
    landCoverage: 0.2,
    candidateCount: 1,
    continentalGrain: 3,
    riftStrength: 0.5,
    islandFrequency: 0.3,
    edgeClearance: 0,
    outerOceanWidth: 1,
    coastRoughness: 0.5,
    coastalWaterWidth: 1,
    seaMinimumHexes: 12,
    seaMaximumMouthWidth: 4,
    seaMinimumDepth: 4,
    seaMinimumEnclosure: 0.5,
  },
  tectonics: {
    plateCount: 4,
    activity: 0.5,
    boundaryFalloff: 4,
    collisionUplift: 100,
    subductionUplift: 100,
    trenchDepth: 100,
    riftDepth: 50,
    hotspotCount: 0,
  },
  relief: {
    seaLevel: 500,
    continentalBaseElevation: 50,
    oceanFloorDepth: 200,
    shelfWidth: 2,
    regionalNoiseScale: 16,
    regionalNoiseAmplitude: 20,
    detailNoiseScale: 4,
    detailNoiseAmplitude: 10,
  },
  climate: {
    equatorialTemperature: 800,
    polarTemperature: 200,
    elevationCooling: 0.5,
    windBandStrength: 500,
    moistureTransportPasses: 4,
    orographicStrength: 500,
    evaporationStrength: 400,
    rainfallNoise: 20,
  },
  hydrology: {
    minimumLakeHexes: 2,
    maximumLakeCoverage: 0.01,
    lakeWaterBalanceThreshold: 50,
    channelInitiationRunoff: 1000,
    erosionPasses: 0,
    streamPowerStrength: 0,
    maximumIncisionPerPass: 0,
  },
};

describe('marginal sea classification', () => {
  it('classifies the complete basin behind a narrow mouth, including its open interior', () => {
    const grid = new HexGrid(BASE_CONFIGURATION.width, BASE_CONFIGURATION.height);
    const cells = createBayFixture(grid, 2);
    const configuration = compileWorldGenerationConfig(BASE_CONFIGURATION);

    const count = classifyMarginalSeas(cells, grid, configuration, grid.distancesFromBoundary());

    const basinCenter = cells[grid.indexOf(19, 10)];
    expect(count).toBe(1);
    expect(basinCenter?.plannedWaterKind).toBe('sea');
    expect(basinCenter?.plannedWaterId).toBe('water.sea.1');
    expect(grid.neighborsOf(grid.indexOf(19, 10)).every((index) => cells[index]?.isLand === false)).toBe(
      true,
    );
    expect(cells[grid.indexOf(3, 10)]?.plannedWaterKind).toBeUndefined();
  });

  it('does not classify the basin when its connection remains wider than the configured mouth', () => {
    const grid = new HexGrid(BASE_CONFIGURATION.width, BASE_CONFIGURATION.height);
    const cells = createBayFixture(grid, 8);
    const configuration = compileWorldGenerationConfig({
      ...BASE_CONFIGURATION,
      topology: {
        ...BASE_CONFIGURATION.topology,
        seaMaximumMouthWidth: 2,
      },
    });

    const count = classifyMarginalSeas(cells, grid, configuration, grid.distancesFromBoundary());

    expect(count).toBe(0);
    expect(cells.every((cell) => cell.plannedWaterKind === undefined)).toBe(true);
  });

  it('assigns the same sea mask and stable IDs on identical runs', () => {
    const grid = new HexGrid(BASE_CONFIGURATION.width, BASE_CONFIGURATION.height);
    const configuration = compileWorldGenerationConfig(BASE_CONFIGURATION);
    const first = createBayFixture(grid, 2);
    const second = createBayFixture(grid, 2);

    classifyMarginalSeas(first, grid, configuration, grid.distancesFromBoundary());
    classifyMarginalSeas(second, grid, configuration, grid.distancesFromBoundary());

    expect(second.map((cell) => cell.plannedWaterId)).toEqual(first.map((cell) => cell.plannedWaterId));
  });
});

function createBayFixture(grid: HexGrid, mouthHeight: number): MutableHex[] {
  const cells = Array.from({ length: grid.size }, (_, index): MutableHex => {
    const { q, r } = grid.coordinateAt(index);
    return {
      q,
      r,
      elevation: 300,
      isLand: false,
      terrainId: 'terrain.ocean',
      temperature: 0,
      rainfall: 0,
      runoff: 0,
      flowAccumulation: 0,
      plateId: 0,
      crustKind: 'oceanic',
      tectonicUplift: 0,
      tectonicSubsidence: 0,
      landmassKindHint: undefined,
      landmassOrdinal: undefined,
      plannedWaterKind: undefined,
      plannedWaterId: undefined,
      landmassId: undefined,
      waterBodyId: undefined,
    };
  });
  const mouthMinimumR = 11 - Math.floor(mouthHeight / 2);
  const mouthMaximumR = mouthMinimumR + mouthHeight - 1;

  for (let r = 3; r <= 20; r += 1) {
    for (let q = 8; q <= 27; q += 1) {
      const insideBasin = q >= 14 && q <= 24 && r >= 5 && r <= 17;
      const insideMouth = q >= 8 && q < 14 && r >= mouthMinimumR && r <= mouthMaximumR;
      if (!insideBasin && !insideMouth) {
        const cell = cells[grid.indexOf(q, r)];
        if (cell === undefined) {
          throw new Error(`Bay fixture cell is missing at ${q}:${r}.`);
        }
        cell.isLand = true;
        cell.elevation = 600;
        cell.terrainId = 'terrain.land';
        cell.crustKind = 'continental';
      }
    }
  }
  return cells;
}
