import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { requiredBoolean, requiredCell, requiredNumber } from '../utils.js';
import type { PriorityFloodResult } from './priority-flood.js';

export type Depression = {
  readonly indexes: readonly number[];
  readonly firstIndex: number;
  readonly spillElevation: number;
  readonly maximumDepth: number;
  readonly averageRunoff: number;
  readonly outletIndex: number;
  readonly receiverFirstIndex: number | undefined;
};

/** Extracts spill-connected depression nodes; ordering is stable by their first hex. */
export function buildDepressionHierarchy(
  cells: readonly MutableHex[],
  grid: HexGrid,
  flood: PriorityFloodResult,
): readonly Depression[] {
  const included = flood.fillDepth.map(
    (depth, index) => depth > 0 && requiredCell(cells, index).isLand,
  );
  const visited = Array.from({ length: grid.size }, () => false);
  const depressions: Array<Omit<Depression, 'outletIndex' | 'receiverFirstIndex'>> = [];

  for (let start = 0; start < grid.size; start += 1) {
    if (!requiredBoolean(included, start) || requiredBoolean(visited, start)) {
      continue;
    }
    const indexes: number[] = [];
    const queue = [start];
    visited[start] = true;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = requiredNumber(queue, cursor);
      indexes.push(current);
      for (const neighbor of grid.neighborsOf(current)) {
        if (requiredBoolean(included, neighbor) && !requiredBoolean(visited, neighbor)) {
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }
    depressions.push({
      indexes,
      firstIndex: start,
      spillElevation: Math.max(...indexes.map((index) => requiredNumber(flood.filledElevation, index))),
      maximumDepth: Math.max(...indexes.map((index) => requiredNumber(flood.fillDepth, index))),
      averageRunoff: Math.floor(
        indexes.reduce((total, index) => total + requiredCell(cells, index).runoff, 0) / indexes.length,
      ),
    });
  }
  depressions.sort((left, right) => left.firstIndex - right.firstIndex);
  const depressionByIndex = new Map<
    number,
    Omit<Depression, 'outletIndex' | 'receiverFirstIndex'>
  >();
  for (const depression of depressions) {
    for (const index of depression.indexes) {
      depressionByIndex.set(index, depression);
    }
  }
  return depressions.map((depression) => {
    const indexes = new Set(depression.indexes);
    const outlets = depression.indexes.flatMap((index) => {
      const target = requiredNumber(flood.flowTarget, index);
      return target >= 0 && !indexes.has(target) ? [{ source: index, target }] : [];
    });
    outlets.sort(
      (left, right) =>
        requiredNumber(flood.filledElevation, left.target) -
          requiredNumber(flood.filledElevation, right.target) ||
        left.source - right.source,
    );
    const outlet = outlets[0];
    const outletIndex = outlet?.source ?? depression.firstIndex;
    let receiverFirstIndex: number | undefined;
    let downstream = outlet?.target ?? -1;
    const visited = new Set<number>();
    while (downstream >= 0 && !visited.has(downstream)) {
      visited.add(downstream);
      const receiver = depressionByIndex.get(downstream);
      if (receiver !== undefined && receiver.firstIndex !== depression.firstIndex) {
        receiverFirstIndex = receiver.firstIndex;
        break;
      }
      downstream = requiredNumber(flood.flowTarget, downstream);
    }
    return { ...depression, outletIndex, receiverFirstIndex };
  });
}
