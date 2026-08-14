import type { WorldLandmass, WorldRiverEdge, WorldWaterBody } from '@arcanorum/shared';
import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { floodWaterFromBoundary } from '../geometry/topology.js';
import type { MutableHex } from '../types.js';
import { requiredCell, requiredNumber } from '../utils.js';

export type GeographyDiagnostics = {
  readonly boundaryLandHexCount: 0;
  readonly outerOceanHexCount: number;
  readonly connectedSeaCount: number;
};

export function validateGeography(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  edgeDistance: readonly number[],
  waterBodies: readonly WorldWaterBody[],
  landmasses: readonly WorldLandmass[],
  rivers: readonly WorldRiverEdge[],
  topologyLandHexCount: number,
): GeographyDiagnostics {
  const boundaryLandHexCount = cells.filter((cell, index) => grid.isBoundary(index) && cell.isLand).length;
  if (boundaryLandHexCount !== 0) {
    throw new Error(`World generation produced ${boundaryLandHexCount} boundary land hexes.`);
  }
  const boundaryConnectedWater = floodWaterFromBoundary(cells, grid);
  for (let index = 0; index < grid.size; index += 1) {
    if (requiredNumber(edgeDistance, index) === 0 && !boundaryConnectedWater.has(index)) {
      throw new Error('The outer ocean does not connect every boundary hex.');
    }
  }

  const connectedSeaCount = waterBodies.filter((waterBody) => {
    if (waterBody.kind !== 'sea') {
      return false;
    }
    const seaIndexes = cells.flatMap((cell, index) => (cell.waterBodyId === waterBody.id ? [index] : []));
    return seaIndexes.some(
      (index) =>
        boundaryConnectedWater.has(index) &&
        grid
          .neighborsOf(index)
          .some((neighbor) => requiredCell(cells, neighbor).waterBodyId === 'water.ocean.1'),
    );
  }).length;
  const seaCount = waterBodies.filter((waterBody) => waterBody.kind === 'sea').length;
  if (connectedSeaCount !== seaCount) {
    throw new Error('Every marginal sea must remain physically connected to the outer ocean.');
  }

  const dryLandCount = cells.filter((cell) => cell.isLand).length;
  if (dryLandCount > topologyLandHexCount) {
    throw new Error('Natural lake formation cannot increase the selected topology land area.');
  }
  const lakeHexCount = cells.filter((cell) => cell.plannedWaterKind === 'lake').length;
  if (lakeHexCount > configuration.maximumLakeHexes) {
    throw new Error('Natural lake area exceeds the compiled maximumLakeCoverage limit.');
  }
  validateLandmassConnectivity(cells, grid, landmasses);
  validateRiverOutlets(cells, grid, rivers);
  return {
    boundaryLandHexCount: 0,
    outerOceanHexCount: cells.filter((cell) => cell.waterBodyId === 'water.ocean.1').length,
    connectedSeaCount,
  };
}

function validateLandmassConnectivity(
  cells: readonly MutableHex[],
  grid: HexGrid,
  landmasses: readonly WorldLandmass[],
): void {
  for (const landmass of landmasses) {
    const indexes = cells.flatMap((cell, index) => (cell.landmassId === landmass.id ? [index] : []));
    const first = indexes[0];
    if (first === undefined || indexes.length !== landmass.hexCount) {
      throw new Error(`Landmass ${landmass.id} has inconsistent reference counts.`);
    }
    const visited = new Set<number>([first]);
    const queue = [first];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = requiredNumber(queue, cursor);
      for (const neighbor of grid.neighborsOf(current)) {
        if (requiredCell(cells, neighbor).landmassId === landmass.id && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (visited.size !== indexes.length) {
      throw new Error(`Landmass ${landmass.id} is not one connected dry-land component.`);
    }
  }
}

function validateRiverOutlets(
  cells: readonly MutableHex[],
  grid: HexGrid,
  rivers: readonly WorldRiverEdge[],
): void {
  const riverBySource = new Map(rivers.map((river) => [grid.indexOf(river.fromQ, river.fromR), river]));
  for (const river of rivers) {
    const visited = new Set<number>();
    let current = grid.indexOf(river.fromQ, river.fromR);
    while (true) {
      if (visited.has(current)) {
        throw new Error(`River drainage contains a cycle at hex index ${current}.`);
      }
      visited.add(current);
      const edge = riverBySource.get(current);
      if (edge === undefined) {
        throw new Error(`River drainage ends on dry land at hex index ${current}.`);
      }
      const target = grid.indexOf(edge.toQ, edge.toR);
      if (!grid.neighborsOf(current).includes(target)) {
        throw new Error(`River edge ${current} -> ${target} does not join neighboring hexes.`);
      }
      if (!requiredCell(cells, target).isLand) {
        break;
      }
      current = target;
    }
  }
}
