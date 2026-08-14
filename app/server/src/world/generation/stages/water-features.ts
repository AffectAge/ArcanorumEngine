import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { distanceToSegment, mapPosition } from '../geometry/math.js';
import { makeWater } from '../geometry/topology.js';
import type { SeededRandom } from '../random.js';
import type { MutableHex, WaterKind } from '../types.js';
import { minimum, randomBetweenInteger, requiredCell, requiredNumber, shuffle } from '../utils.js';
import { findFeatureCenter, largestLandComponentIndexes } from './feature-placement.js';

export function carvePlannedWater(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  for (let seaIndex = 1; seaIndex <= configuration.seaCount; seaIndex += 1) {
    const center = findFeatureCenter(
      cells,
      grid,
      configuration.seaRadius,
      Math.max(1, configuration.seaRadius - 2),
      true,
      edgeDistance,
      configuration.outerOcean.hardWidth + 1,
      largestLandComponentIndexes(cells, grid),
      random,
    );
    const id = `water.sea.${seaIndex}`;
    carveIrregularBasin(
      cells,
      grid,
      center,
      configuration.seaRadius,
      configuration.seaLevel,
      'sea',
      id,
      noise,
    );
    carveSeaChannel(cells, grid, center, configuration, edgeDistance, random, noise, id);
  }

  for (let lakeIndex = 1; lakeIndex <= configuration.lakeCount; lakeIndex += 1) {
    const center = findFeatureCenter(
      cells,
      grid,
      configuration.lakeRadius,
      configuration.lakeRadius,
      true,
      edgeDistance,
      configuration.outerOcean.hardWidth + configuration.lakeRadius,
      largestLandComponentIndexes(cells, grid),
      random,
    );
    carveIrregularBasin(
      cells,
      grid,
      center,
      configuration.lakeRadius,
      configuration.seaLevel,
      'lake',
      `water.lake.${lakeIndex}`,
      noise,
    );
  }
}

function carveIrregularBasin(
  cells: readonly MutableHex[],
  grid: HexGrid,
  center: number,
  radius: number,
  seaLevel: number,
  kind: Exclude<WaterKind, 'ocean'>,
  id: string,
  noise: (x: number, y: number) => number,
): void {
  const basinIndexes = new Set<number>();
  for (const index of grid.indexesWithinRadius(center, radius + 1)) {
    const cell = requiredCell(cells, index);
    const irregularRadius = radius * (1 + noise(cell.q / 5 + 97, cell.r / 5 - 53) * 0.18);
    const distance = grid.distanceBetween(center, index);
    if (
      distance <= irregularRadius &&
      (distance === 0 || grid.neighborsOf(index).some((neighbor) => basinIndexes.has(neighbor)))
    ) {
      basinIndexes.add(index);
    }
  }
  if (!basinIndexes.has(center)) {
    throw new Error('World generation did not carve its selected water basin.');
  }
  for (const index of basinIndexes) {
    makeWater(requiredCell(cells, index), seaLevel, kind, id);
  }
}

function carveSeaChannel(
  cells: readonly MutableHex[],
  grid: HexGrid,
  basinCenter: number,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
  seaId: string,
): void {
  const exit = selectSeaExit(grid, basinCenter, edgeDistance, configuration.outerOcean.hardWidth, random);
  const start = mapPosition(grid.coordinateAt(basinCenter));
  const end = mapPosition(grid.coordinateAt(exit));
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const normal = { x: -(end.y - start.y) / distance, y: (end.x - start.x) / distance };
  const meander = distance * configuration.seaChannelMeander;
  const controls = [
    start,
    {
      x: start.x + (end.x - start.x) * 0.33 + normal.x * meander * (random.nextFloat() * 2 - 1),
      y: start.y + (end.y - start.y) * 0.33 + normal.y * meander * (random.nextFloat() * 2 - 1),
    },
    {
      x: start.x + (end.x - start.x) * 0.67 + normal.x * meander * (random.nextFloat() * 2 - 1),
      y: start.y + (end.y - start.y) * 0.67 + normal.y * meander * (random.nextFloat() * 2 - 1),
    },
    end,
  ];

  for (let segmentIndex = 0; segmentIndex < controls.length - 1; segmentIndex += 1) {
    const segmentStart = controls[segmentIndex];
    const segmentEnd = controls[segmentIndex + 1];
    if (segmentStart === undefined || segmentEnd === undefined) {
      throw new Error('World generation sea channel control point is missing.');
    }
    const width = randomBetweenInteger(
      random,
      configuration.seaChannelMinimumWidth,
      configuration.seaChannelMaximumWidth,
    );
    for (let index = 0; index < cells.length; index += 1) {
      const cell = requiredCell(cells, index);
      const variation = 1 + noise(cell.q / 6 - 43, cell.r / 6 + 229) * 0.18;
      if (distanceToSegment(mapPosition(cell), segmentStart, segmentEnd) <= width * variation) {
        makeWater(cell, configuration.seaLevel, 'sea', seaId);
      }
    }
  }
}

function selectSeaExit(
  grid: HexGrid,
  basinCenter: number,
  edgeDistance: readonly number[],
  hardOceanWidth: number,
  random: SeededRandom,
): number {
  const candidates = Array.from({ length: grid.size }, (_, index) => index).filter(
    (index) => requiredNumber(edgeDistance, index) === hardOceanWidth,
  );
  const closestDistance = minimum(candidates.map((index) => grid.distanceBetween(basinCenter, index)));
  const nearby = candidates.filter(
    (index) =>
      grid.distanceBetween(basinCenter, index) <=
      closestDistance + Math.max(4, Math.floor(Math.min(grid.width, grid.height) * 0.12)),
  );
  return requiredNumber(shuffle(nearby, random), 0);
}
