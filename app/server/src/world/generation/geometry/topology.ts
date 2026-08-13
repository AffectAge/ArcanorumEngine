import type { MutableHex, WaterKind, HexComponent } from '../types.js';
import { clampInteger, requiredBoolean, requiredCell } from '../utils.js';
import type { HexGrid } from './hex-grid.js';

export function makeLand(cell: MutableHex, elevation: number): void {
  cell.isLand = true;
  cell.elevation = clampInteger(elevation);
  cell.plannedWaterKind = undefined;
  cell.plannedWaterId = undefined;
  cell.waterBodyId = undefined;
}

export function makeWater(
  cell: MutableHex,
  seaLevel: number,
  kind: Exclude<WaterKind, 'ocean'> | undefined = undefined,
  id: string | undefined = undefined,
): void {
  cell.isLand = false;
  cell.elevation = clampInteger(seaLevel - (kind === 'lake' ? 70 : 150));
  cell.plannedWaterKind = kind;
  cell.plannedWaterId = id;
  cell.landmassId = undefined;
  cell.waterBodyId = undefined;
}

export function findComponents(
  cells: readonly MutableHex[],
  grid: HexGrid,
  include: (cell: MutableHex) => boolean,
): readonly HexComponent[] {
  const visited = Array.from({ length: grid.size }, () => false);
  const components: HexComponent[] = [];

  for (let start = 0; start < grid.size; start += 1) {
    if (requiredBoolean(visited, start) || !include(requiredCell(cells, start))) {
      continue;
    }
    const indexes: number[] = [];
    const queue = [start];
    visited[start] = true;
    let cursor = 0;
    let touchesBoundary = false;

    while (cursor < queue.length) {
      const current = queue[cursor++];
      if (current === undefined) {
        throw new Error('Component queue unexpectedly ended.');
      }
      indexes.push(current);
      touchesBoundary ||= grid.isBoundary(current);

      for (const neighbor of grid.neighborsOf(current)) {
        if (include(requiredCell(cells, neighbor)) && !requiredBoolean(visited, neighbor)) {
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }
    components.push({ indexes, firstIndex: start, touchesBoundary });
  }

  return components;
}

export function compareComponentsBySize(left: HexComponent, right: HexComponent): number {
  return right.indexes.length - left.indexes.length || left.firstIndex - right.firstIndex;
}

export function floodWaterFromBoundary(cells: readonly MutableHex[], grid: HexGrid): ReadonlySet<number> {
  const visited = new Set<number>();
  const queue = Array.from({ length: grid.size }, (_, index) => index).filter(
    (index) => grid.isBoundary(index) && !requiredCell(cells, index).isLand,
  );
  for (const index of queue) {
    visited.add(index);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === undefined) {
      throw new Error('Outer-ocean flood queue unexpectedly ended.');
    }
    for (const neighbor of grid.neighborsOf(current)) {
      if (!requiredCell(cells, neighbor).isLand && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}
