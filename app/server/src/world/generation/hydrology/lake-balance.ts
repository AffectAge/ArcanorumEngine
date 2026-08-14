import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { clampInteger, requiredCell } from '../utils.js';
import type { Depression } from './depression-hierarchy.js';

/** Converts only sufficiently wet, enclosed natural depressions into inland lakes. */
export function fillBalancedLakes(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  depressions: readonly Depression[],
): number {
  const eligible = depressions
    .filter(
      (depression) =>
        depression.indexes.length >= configuration.source.hydrology.minimumLakeHexes &&
        depression.averageRunoff >= configuration.source.hydrology.lakeWaterBalanceThreshold &&
        depression.indexes.every((index) =>
          grid.neighborsOf(index).every((neighbor) => requiredCell(cells, neighbor).isLand),
        ) &&
        preservesLandmassConnectivity(cells, grid, depression.indexes),
    )
    .sort(
      (left, right) =>
        right.averageRunoff - left.averageRunoff ||
        right.maximumDepth - left.maximumDepth ||
        left.firstIndex - right.firstIndex,
    );
  const selected: Depression[] = [];
  let selectedHexes = 0;
  for (const depression of eligible) {
    if (selectedHexes + depression.indexes.length > configuration.maximumLakeHexes) {
      continue;
    }
    selected.push(depression);
    selectedHexes += depression.indexes.length;
  }
  selected.sort((left, right) => left.firstIndex - right.firstIndex);

  for (let ordinal = 0; ordinal < selected.length; ordinal += 1) {
    const depression = selected[ordinal];
    if (depression === undefined) {
      throw new Error(`Selected lake depression is missing: ${ordinal}.`);
    }
    const id = `water.lake.${ordinal + 1}`;
    for (const index of depression.indexes) {
      const cell = requiredCell(cells, index);
      cell.isLand = false;
      cell.elevation = clampInteger(depression.spillElevation);
      cell.plannedWaterKind = 'lake';
      cell.plannedWaterId = id;
      cell.landmassId = undefined;
      cell.waterBodyId = undefined;
      cell.flowAccumulation = 0;
    }
  }
  return selected.length;
}

function preservesLandmassConnectivity(
  cells: readonly MutableHex[],
  grid: HexGrid,
  removedIndexes: readonly number[],
): boolean {
  const firstIndex = removedIndexes[0];
  if (firstIndex === undefined) {
    return false;
  }
  const first = requiredCell(cells, firstIndex);
  const kind = first.landmassKindHint;
  const ordinal = first.landmassOrdinal;
  if (kind === undefined || ordinal === undefined) {
    return false;
  }
  const removed = new Set(removedIndexes);
  const remaining = cells.flatMap((cell, index) =>
    cell.isLand &&
    cell.landmassKindHint === kind &&
    cell.landmassOrdinal === ordinal &&
    !removed.has(index)
      ? [index]
      : [],
  );
  const root = remaining[0];
  if (root === undefined) {
    return false;
  }
  const visited = new Set<number>([root]);
  const queue = [root];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === undefined) {
      throw new Error('Lake-connectivity queue unexpectedly ended.');
    }
    for (const neighbor of grid.neighborsOf(current)) {
      const cell = requiredCell(cells, neighbor);
      if (
        !removed.has(neighbor) &&
        cell.isLand &&
        cell.landmassKindHint === kind &&
        cell.landmassOrdinal === ordinal &&
        !visited.has(neighbor)
      ) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited.size === remaining.length;
}
