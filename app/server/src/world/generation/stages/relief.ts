import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { clampInteger, requiredCell, requiredNumber } from '../utils.js';

/** Converts topology and plate stress into continental relief and ocean bathymetry. */
export function applyRelief(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  regionalNoise: (x: number, y: number) => number,
  detailNoise: (x: number, y: number) => number,
): void {
  const distanceToLand = distancesFrom(cells, grid, (cell) => cell.isLand);
  const distanceToWater = distancesFrom(cells, grid, (cell) => !cell.isLand);
  const relief = configuration.source.relief;
  const tectonics = configuration.source.tectonics;

  for (let index = 0; index < grid.size; index += 1) {
    const cell = requiredCell(cells, index);
    const coordinate = grid.coordinateAt(index);
    const regional = Math.round(
      regionalNoise(
        coordinate.q / relief.regionalNoiseScale,
        coordinate.r / relief.regionalNoiseScale,
      ) * relief.regionalNoiseAmplitude,
    );
    const detail = Math.round(
      detailNoise(coordinate.q / relief.detailNoiseScale, coordinate.r / relief.detailNoiseScale) *
        relief.detailNoiseAmplitude,
    );

    if (cell.isLand) {
      const interiorDistance = Math.min(12, requiredNumber(distanceToWater, index));
      const continentalInterior = Math.round((interiorDistance * relief.continentalBaseElevation) / 24);
      const nearOceanicCrust = grid.neighborsOf(index).some((neighbor) => {
        const candidate = requiredCell(cells, neighbor);
        return !candidate.isLand && candidate.plateId !== cell.plateId;
      });
      const subductionUplift = nearOceanicCrust
        ? Math.round(
            (cell.tectonicUplift * tectonics.subductionUplift) /
              Math.max(1, tectonics.collisionUplift),
          )
        : 0;
      cell.elevation = clampInteger(
        relief.seaLevel +
          relief.continentalBaseElevation +
          continentalInterior +
          regional +
          detail +
          cell.tectonicUplift +
          subductionUplift -
          cell.tectonicSubsidence,
      );
      cell.elevation = Math.max(relief.seaLevel + 1, cell.elevation);
      cell.crustKind = 'continental';
      continue;
    }

    const coastDistance = requiredNumber(distanceToLand, index);
    const shelfProgress = Math.min(relief.shelfWidth + 1, coastDistance) / (relief.shelfWidth + 1);
    const baseDepth = Math.round(35 + (relief.oceanFloorDepth - 35) * shelfProgress);
    const trench = Math.round(
      (cell.tectonicUplift * tectonics.trenchDepth) / Math.max(1, tectonics.collisionUplift),
    );
    const ridge = cell.tectonicSubsidence;
    cell.elevation = clampInteger(
      relief.seaLevel - baseDepth + Math.round(regional / 3) + Math.round(detail / 2) - trench + ridge,
    );
    cell.elevation = Math.min(relief.seaLevel - 1, cell.elevation);
    cell.crustKind = 'oceanic';
  }
}

function distancesFrom(
  cells: readonly MutableHex[],
  grid: HexGrid,
  isSource: (cell: MutableHex) => boolean,
): readonly number[] {
  const distances = Array.from({ length: grid.size }, () => Number.POSITIVE_INFINITY);
  const queue: number[] = [];
  for (let index = 0; index < grid.size; index += 1) {
    if (isSource(requiredCell(cells, index))) {
      distances[index] = 0;
      queue.push(index);
    }
  }
  if (queue.length === 0) {
    throw new Error('Relief distance field requires at least one source hex.');
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = requiredNumber(queue, cursor);
    const nextDistance = requiredNumber(distances, current) + 1;
    for (const neighbor of grid.neighborsOf(current)) {
      if (nextDistance < requiredNumber(distances, neighbor)) {
        distances[neighbor] = nextDistance;
        queue.push(neighbor);
      }
    }
  }
  return distances;
}
