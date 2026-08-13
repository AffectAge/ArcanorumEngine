import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { distanceToSegment, mapPosition } from '../geometry/math.js';
import type { SeededRandom } from '../random.js';
import type { MutableHex } from '../types.js';
import { clampInteger, requiredCell, requiredNumber, shuffle } from '../utils.js';

export function addMountainRanges(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  for (let rangeIndex = 0; rangeIndex < configuration.mountainRangeCount; rangeIndex += 1) {
    const startIndex = findMountainRangeStart(cells, grid, configuration, edgeDistance, random);
    const start = mapPosition(grid.coordinateAt(startIndex));
    const angle = random.nextFloat() * Math.PI * 2;
    const length =
      configuration.mountainRangeMinimumLength +
      random.nextInt(configuration.mountainRangeMaximumLength - configuration.mountainRangeMinimumLength + 1);
    const end = {
      x: start.x + Math.cos(angle) * length,
      y: start.y + Math.sin(angle) * length,
    };

    for (let index = 0; index < cells.length; index += 1) {
      const cell = requiredCell(cells, index);
      if (!cell.isLand) {
        continue;
      }

      const distance = distanceToSegment(mapPosition(cell), start, end);
      const ridgeStrength = Math.max(0, 1 - distance / configuration.mountainRangeWidth);
      if (ridgeStrength === 0) {
        continue;
      }

      const variation = noise(cell.q / 4 - 109, cell.r / 4 + 257) * 28;
      cell.elevation = clampInteger(
        cell.elevation + ridgeStrength * (configuration.mountainRangeHeight + variation),
      );
    }
  }
}

function findMountainRangeStart(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
): number {
  const candidates = shuffle(
    Array.from({ length: grid.size }, (_, index) => index).filter(
      (index) =>
        requiredNumber(edgeDistance, index) >
          configuration.outerOcean.hardWidth + configuration.continentalPlacement.edgeClearance + 3 &&
        requiredCell(cells, index).isLand &&
        grid.indexesWithinRadius(index, 2).every((neighbor) => requiredCell(cells, neighbor).isLand),
    ),
    random,
  );
  const start = candidates[0];
  if (start === undefined) {
    throw new Error('World generation cannot find land for a configured mountain range.');
  }
  return start;
}
