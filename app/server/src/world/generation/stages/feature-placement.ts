import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { compareComponentsBySize, findComponents, makeWater } from '../geometry/topology.js';
import type { SeededRandom } from '../random.js';
import type { MutableHex } from '../types.js';
import { requiredCell, requiredNumber, shuffle } from '../utils.js';

export function findFeatureCenter(
  cells: readonly MutableHex[],
  grid: HexGrid,
  radius: number,
  clearanceRadius: number,
  requiredLand: boolean,
  edgeDistance: readonly number[],
  minimumEdgeDistance: number,
  allowedIndexes: ReadonlySet<number> | undefined,
  random: SeededRandom,
): number {
  const candidates = shuffle(
    Array.from({ length: grid.size }, (_, index) => index).filter(
      (index) =>
        requiredNumber(edgeDistance, index) > minimumEdgeDistance &&
        (allowedIndexes === undefined || allowedIndexes.has(index)) &&
        grid.indexesWithinRadius(index, clearanceRadius).every((candidate) => {
          const cell = requiredCell(cells, candidate);
          return (
            cell.isLand === requiredLand && (allowedIndexes === undefined || allowedIndexes.has(candidate))
          );
        }),
    ),
    random,
  );
  const center = candidates[0];
  if (center === undefined) {
    throw new Error(`World generation cannot place planned ${requiredLand ? 'water' : 'island'} feature.`);
  }
  return center;
}

export function largestLandComponentIndexes(
  cells: readonly MutableHex[],
  grid: HexGrid,
): ReadonlySet<number> {
  const largest = [...findComponents(cells, grid, (cell) => cell.isLand)].sort(compareComponentsBySize)[0];
  if (largest === undefined) {
    throw new Error('World generation cannot place water without land.');
  }
  return new Set(largest.indexes);
}

export function enforceOuterOcean(
  cells: readonly MutableHex[],
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
): void {
  for (let index = 0; index < cells.length; index += 1) {
    if (requiredNumber(edgeDistance, index) <= configuration.outerOcean.hardWidth) {
      makeWater(requiredCell(cells, index), configuration.seaLevel);
    }
  }
}
