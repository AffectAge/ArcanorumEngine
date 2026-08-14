import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { compareComponentsBySize, findComponents, makeLand, makeWater } from '../geometry/topology.js';
import type { SeededRandom } from '../random.js';
import type { MutableHex, TopologyResult } from '../types.js';
import { requiredCell, requiredNumber } from '../utils.js';
import { enforceOuterOcean, findFeatureCenter } from './feature-placement.js';

export function addPlannedIslands(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): ReadonlySet<number> {
  const protectedIndexes = new Set<number>();

  for (let islandIndex = 0; islandIndex < configuration.islandCount; islandIndex += 1) {
    const radius = 1 + random.nextInt(configuration.islandMaximumRadius);
    const center = findFeatureCenter(
      cells,
      grid,
      radius,
      radius,
      false,
      edgeDistance,
      configuration.outerOcean.hardWidth + configuration.continentalPlacement.edgeClearance,
      undefined,
      random,
    );
    for (const index of grid.indexesWithinRadius(center, radius + 1)) {
      const cell = requiredCell(cells, index);
      const irregularRadius = radius * (1 + noise(cell.q / 4 + 59, cell.r / 4 - 151) * 0.16);
      if (grid.distanceBetween(center, index) <= irregularRadius) {
        makeLand(cell, configuration.seaLevel + 64 + noise(cell.q / 5 - 83, cell.r / 5 + 197) * 24);
        protectedIndexes.add(index);
      }
    }
  }

  return protectedIndexes;
}

export function cleanLandTopology(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  protectedIndexes: ReadonlySet<number>,
): TopologyResult {
  for (let pass = 0; pass < configuration.topology.smoothingPasses; pass += 1) {
    const erodedIndexes = Array.from({ length: grid.size }, (_, index) => index).filter((index) => {
      const cell = requiredCell(cells, index);
      return (
        cell.isLand &&
        !protectedIndexes.has(index) &&
        requiredNumber(edgeDistance, index) > configuration.outerOcean.hardWidth &&
        grid.neighborsOf(index).filter((neighbor) => requiredCell(cells, neighbor).isLand).length <= 1
      );
    });
    for (const index of erodedIndexes) {
      makeWater(requiredCell(cells, index), configuration.seaLevel);
    }
  }

  const components = [...findComponents(cells, grid, (cell) => cell.isLand)].sort(compareComponentsBySize);
  let discardedMicroIslandCount = 0;
  for (const component of components.slice(configuration.continentCount)) {
    if (
      component.indexes.length >= configuration.topology.minimumIslandHexes ||
      component.indexes.some((index) => protectedIndexes.has(index))
    ) {
      continue;
    }
    for (const index of component.indexes) {
      makeWater(requiredCell(cells, index), configuration.seaLevel);
    }
    discardedMicroIslandCount += 1;
  }

  fillUnplannedInlandWater(cells, grid, configuration.seaLevel);
  enforceOuterOcean(cells, configuration, edgeDistance);
  return { discardedMicroIslandCount };
}

function fillUnplannedInlandWater(cells: readonly MutableHex[], grid: HexGrid, seaLevel: number): void {
  const enclosedWater = findComponents(cells, grid, (cell) => !cell.isLand).filter(
    (component) =>
      !component.touchesBoundary &&
      !component.indexes.some((index) => requiredCell(cells, index).plannedWaterKind !== undefined),
  );
  for (const component of enclosedWater) {
    for (const index of component.indexes) {
      makeLand(requiredCell(cells, index), seaLevel + 24);
    }
  }
}
