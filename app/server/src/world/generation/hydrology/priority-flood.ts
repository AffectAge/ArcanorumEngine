import type { HexGrid } from '../geometry/hex-grid.js';
import { MinPriorityQueue } from '../geometry/min-priority-queue.js';
import type { MutableHex } from '../types.js';
import { requiredBoolean, requiredCell, requiredNumber } from '../utils.js';

export type PriorityFloodResult = {
  readonly filledElevation: readonly number[];
  readonly flowTarget: readonly number[];
  readonly drainageOrder: readonly number[];
  readonly fillDepth: readonly number[];
};

/** Fills depressions to their spill elevation and gives every dry cell a stable downstream target. */
export function runPriorityFlood(
  cells: readonly MutableHex[],
  grid: HexGrid,
): PriorityFloodResult {
  const filledElevation = Array.from({ length: grid.size }, () => Number.POSITIVE_INFINITY);
  const flowTarget = Array.from({ length: grid.size }, () => -1);
  const drainageOrder = Array.from({ length: grid.size }, () => -1);
  const visited = Array.from({ length: grid.size }, () => false);
  const queue = new MinPriorityQueue();

  for (let index = 0; index < grid.size; index += 1) {
    const cell = requiredCell(cells, index);
    if (!cell.isLand) {
      visited[index] = true;
      filledElevation[index] = cell.elevation;
      queue.push({ index, elevation: cell.elevation });
    }
  }
  if (queue.isEmpty()) {
    throw new Error('Priority-Flood requires at least one water sink.');
  }

  let order = 0;
  while (!queue.isEmpty()) {
    const current = queue.pop();
    if (current === undefined) {
      throw new Error('Priority-Flood queue unexpectedly ended.');
    }
    drainageOrder[current.index] = order++;
    for (const neighbor of grid.neighborsOf(current.index)) {
      if (requiredBoolean(visited, neighbor)) {
        continue;
      }
      const cell = requiredCell(cells, neighbor);
      visited[neighbor] = true;
      const resolvedElevation = Math.max(cell.elevation, current.elevation);
      filledElevation[neighbor] = resolvedElevation;
      flowTarget[neighbor] = current.index;
      queue.push({ index: neighbor, elevation: resolvedElevation });
    }
  }

  const fillDepth = cells.map((cell, index) =>
    cell.isLand ? Math.max(0, requiredNumber(filledElevation, index) - cell.elevation) : 0,
  );
  return { filledElevation, flowTarget, drainageOrder, fillDepth };
}
