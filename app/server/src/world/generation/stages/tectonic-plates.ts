import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import { MinPriorityQueue } from '../geometry/min-priority-queue.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { SeededRandom } from '../random.js';
import type { MutableHex, Plate, PlateModel } from '../types.js';
import { requiredCell, requiredNumber } from '../utils.js';

const PLATE_MOTIONS: ReadonlyArray<readonly [number, number]> = [
  [2, 0],
  [1, 2],
  [-1, 2],
  [-2, 0],
  [-1, -2],
  [1, -2],
];

/** Builds irregular graph-Voronoi plates and deterministic boundary stress fields. */
export function createTectonicPlates(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): PlateModel {
  const plateSeeds = selectFarthestSeeds(grid, configuration.source.tectonics.plateCount, random);
  const plates = plateSeeds.map((seedIndex, index): Plate => {
    const direction = PLATE_MOTIONS[random.nextInt(PLATE_MOTIONS.length)];
    if (direction === undefined) {
      throw new Error('Tectonic motion direction is missing.');
    }
    return {
      id: index + 1,
      seedIndex,
      motionQ: direction[0],
      motionR: direction[1],
    };
  });
  assignPlateDomains(cells, grid, plates, noise);

  const boundaryDistance = Array.from({ length: grid.size }, () => Number.POSITIVE_INFINITY);
  const boundaryUplift = Array.from({ length: grid.size }, () => 0);
  const boundarySubsidence = Array.from({ length: grid.size }, () => 0);
  const islandPotential = Array.from({ length: grid.size }, () => 0);
  const boundaryQueue: number[] = [];

  for (let index = 0; index < grid.size; index += 1) {
    const cell = requiredCell(cells, index);
    let strongestConvergence = 0;
    let strongestDivergence = 0;
    const coordinate = grid.coordinateAt(index);
    const ownPlate = requiredPlate(plates, cell.plateId);
    for (const neighbor of grid.neighborsOf(index)) {
      const neighborCell = requiredCell(cells, neighbor);
      if (neighborCell.plateId === cell.plateId) {
        continue;
      }
      const neighborCoordinate = grid.coordinateAt(neighbor);
      const otherPlate = requiredPlate(plates, neighborCell.plateId);
      const directionQ = neighborCoordinate.q - coordinate.q;
      const directionR = neighborCoordinate.r - coordinate.r;
      const relativeMotion =
        (otherPlate.motionQ - ownPlate.motionQ) * directionQ +
        (otherPlate.motionR - ownPlate.motionR) * directionR;
      strongestConvergence = Math.max(strongestConvergence, -relativeMotion);
      strongestDivergence = Math.max(strongestDivergence, relativeMotion);
    }
    if (strongestConvergence > 0 || strongestDivergence > 0) {
      boundaryDistance[index] = 0;
      boundaryQueue.push(index);
      boundaryUplift[index] = Math.round(
        (strongestConvergence *
          configuration.source.tectonics.collisionUplift *
          configuration.activityPermille) /
          8_000,
      );
      boundarySubsidence[index] = Math.round(
        (strongestDivergence * configuration.source.tectonics.riftDepth * configuration.activityPermille) /
          8_000,
      );
      islandPotential[index] = strongestConvergence * 100;
    }
  }

  for (let cursor = 0; cursor < boundaryQueue.length; cursor += 1) {
    const current = requiredNumber(boundaryQueue, cursor);
    const distance = requiredNumber(boundaryDistance, current);
    if (distance >= configuration.source.tectonics.boundaryFalloff) {
      continue;
    }
    for (const neighbor of grid.neighborsOf(current)) {
      const candidateDistance = distance + 1;
      if (candidateDistance < requiredNumber(boundaryDistance, neighbor)) {
        boundaryDistance[neighbor] = candidateDistance;
        boundaryUplift[neighbor] = requiredNumber(boundaryUplift, current);
        boundarySubsidence[neighbor] = requiredNumber(boundarySubsidence, current);
        islandPotential[neighbor] = requiredNumber(islandPotential, current);
        boundaryQueue.push(neighbor);
      }
    }
  }

  for (let index = 0; index < grid.size; index += 1) {
    const distance = requiredNumber(boundaryDistance, index);
    const attenuation = Number.isFinite(distance)
      ? Math.max(0, configuration.source.tectonics.boundaryFalloff - distance) /
        configuration.source.tectonics.boundaryFalloff
      : 0;
    const cell = requiredCell(cells, index);
    cell.tectonicUplift = Math.round(requiredNumber(boundaryUplift, index) * attenuation);
    cell.tectonicSubsidence = Math.round(requiredNumber(boundarySubsidence, index) * attenuation);
    islandPotential[index] = Math.round(requiredNumber(islandPotential, index) * attenuation);
  }

  addHotspotPotential(islandPotential, grid, configuration, random);
  return {
    plates,
    ownerByIndex: cells.map((cell) => cell.plateId),
    boundaryDistance,
    islandPotential,
  };
}

function selectFarthestSeeds(grid: HexGrid, count: number, random: SeededRandom): readonly number[] {
  const seeds = [random.nextInt(grid.size)];
  while (seeds.length < count) {
    let selected = -1;
    let selectedDistance = -1;
    for (let index = 0; index < grid.size; index += 1) {
      const distance = Math.min(...seeds.map((seed) => grid.distanceBetween(index, seed)));
      if (distance > selectedDistance || (distance === selectedDistance && index < selected)) {
        selected = index;
        selectedDistance = distance;
      }
    }
    if (selected < 0) {
      throw new Error('Unable to select the requested tectonic plate seeds.');
    }
    seeds.push(selected);
  }
  return seeds;
}

function assignPlateDomains(
  cells: readonly MutableHex[],
  grid: HexGrid,
  plates: readonly Plate[],
  noise: (x: number, y: number) => number,
): void {
  const costs = Array.from({ length: grid.size }, () => Number.POSITIVE_INFINITY);
  const queue = new MinPriorityQueue();
  for (const plate of plates) {
    costs[plate.seedIndex] = 0;
    requiredCell(cells, plate.seedIndex).plateId = plate.id;
    queue.push({ index: plate.seedIndex, elevation: 0 });
  }
  while (!queue.isEmpty()) {
    const current = queue.pop();
    if (current === undefined || current.elevation !== requiredNumber(costs, current.index)) {
      continue;
    }
    const owner = requiredCell(cells, current.index).plateId;
    for (const neighbor of grid.neighborsOf(current.index)) {
      const coordinate = grid.coordinateAt(neighbor);
      const edgeCost = 100 + Math.round((noise(coordinate.q / 19, coordinate.r / 19) + 1) * 18);
      const candidateCost = current.elevation + edgeCost;
      const existingCost = requiredNumber(costs, neighbor);
      const existingOwner = requiredCell(cells, neighbor).plateId;
      if (candidateCost < existingCost || (candidateCost === existingCost && owner < existingOwner)) {
        costs[neighbor] = candidateCost;
        requiredCell(cells, neighbor).plateId = owner;
        queue.push({ index: neighbor, elevation: candidateCost });
      }
    }
  }
}

function addHotspotPotential(
  potential: number[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  random: SeededRandom,
): void {
  for (let hotspot = 0; hotspot < configuration.source.tectonics.hotspotCount; hotspot += 1) {
    const center = random.nextInt(grid.size);
    const radius = 3 + random.nextInt(6);
    for (const index of grid.indexesWithinRadius(center, radius)) {
      const distance = grid.distanceBetween(center, index);
      potential[index] = requiredNumber(potential, index) + (radius - distance + 1) * 120;
    }
  }
}

function requiredPlate(plates: readonly Plate[], plateId: number): Plate {
  const plate = plates[plateId - 1];
  if (plate === undefined || plate.id !== plateId) {
    throw new Error(`Tectonic plate is missing: ${plateId}.`);
  }
  return plate;
}
