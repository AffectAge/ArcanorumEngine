import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { MinPriorityQueue } from '../geometry/min-priority-queue.js';
import type { HydrologyResult, MutableHex } from '../types.js';
import { maximum, requiredBoolean, requiredCell, requiredNumber } from '../utils.js';

/** Priority-flood drainage guarantees that every land hex has an explicit water outlet. */
export function calculateHydrology(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
): HydrologyResult {
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
    throw new Error('World generation cannot calculate hydrology without water sinks.');
  }

  let order = 0;
  while (!queue.isEmpty()) {
    const current = queue.pop();
    if (current === undefined) {
      throw new Error('Hydrology queue unexpectedly ended.');
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

  const localRunoff = cells.map((cell) => (cell.isLand ? Math.max(1, cell.rainfall) : 0));
  const flowAccumulation = [...localRunoff];
  const landIndexes = Array.from({ length: grid.size }, (_, index) => index)
    .filter((index) => requiredCell(cells, index).isLand)
    .sort(
      (left, right) =>
        requiredNumber(filledElevation, right) - requiredNumber(filledElevation, left) ||
        requiredNumber(drainageOrder, right) - requiredNumber(drainageOrder, left) ||
        right - left,
    );

  for (const source of landIndexes) {
    const target = requiredNumber(flowTarget, source);
    if (target < 0) {
      throw new Error(`Land hex ${source} has no deterministic drainage target.`);
    }
    const sourceFlow = requiredNumber(flowAccumulation, source);
    requiredCell(cells, source).flowAccumulation = sourceFlow;
    if (requiredCell(cells, target).isLand) {
      flowAccumulation[target] = requiredNumber(flowAccumulation, target) + sourceFlow;
    }
  }

  const totalRunoff = landIndexes.reduce((total, index) => total + requiredNumber(localRunoff, index), 0);
  const riverThreshold = Math.max(1, Math.ceil(totalRunoff * configuration.riverFlowThreshold));
  const rivers = landIndexes
    .filter((source) => requiredNumber(flowAccumulation, source) >= riverThreshold)
    .map((source) => {
      const target = requiredNumber(flowTarget, source);
      const from = grid.coordinateAt(source);
      const to = grid.coordinateAt(target);
      return {
        fromQ: from.q,
        fromR: from.r,
        toQ: to.q,
        toR: to.r,
        flow: requiredNumber(flowAccumulation, source),
      };
    })
    .sort(
      (left, right) =>
        left.fromR - right.fromR || left.fromQ - right.fromQ || left.toR - right.toR || left.toQ - right.toQ,
    );

  return {
    rivers,
    maximumFlowAccumulation: maximum(flowAccumulation),
  };
}
