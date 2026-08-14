import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { requiredBoolean, requiredCell, requiredNumber } from '../utils.js';

/** Marks partially enclosed, boundary-connected ocean pockets as marginal seas. */
export function classifyMarginalSeas(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  edgeDistance: readonly number[],
): number {
  const candidate = Array.from({ length: grid.size }, (_, index) => {
    const cell = requiredCell(cells, index);
    if (
      cell.isLand ||
      cell.plannedWaterKind === 'lake' ||
      requiredNumber(edgeDistance, index) <= configuration.source.topology.outerOceanWidth
    ) {
      return false;
    }
    const nearby = grid.indexesWithinRadius(index, 4);
    const landCount = nearby.filter((candidateIndex) => requiredCell(cells, candidateIndex).isLand).length;
    const openWaterDirections = grid
      .neighborsOf(index)
      .filter((neighbor) => !requiredCell(cells, neighbor).isLand)
      .length;
    return (
      landCount >= configuration.source.topology.seaEnclosureThreshold * 3 &&
      openWaterDirections <= 4
    );
  });
  const components = booleanComponents(candidate, grid)
    .filter((component) => component.length >= configuration.source.topology.seaMinimumHexes)
    .sort((left, right) => requiredNumber(left, 0) - requiredNumber(right, 0));

  let ordinal = 1;
  for (const component of components) {
    const id = `water.sea.${ordinal++}`;
    for (const index of component) {
      const cell = requiredCell(cells, index);
      cell.plannedWaterKind = 'sea';
      cell.plannedWaterId = id;
    }
  }
  return components.length;
}

function booleanComponents(values: readonly boolean[], grid: HexGrid): readonly (readonly number[])[] {
  const visited = Array.from({ length: grid.size }, () => false);
  const result: number[][] = [];
  for (let index = 0; index < grid.size; index += 1) {
    if (!requiredBoolean(values, index) || requiredBoolean(visited, index)) {
      continue;
    }
    const component: number[] = [];
    const queue = [index];
    visited[index] = true;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = requiredNumber(queue, cursor);
      component.push(current);
      for (const neighbor of grid.neighborsOf(current)) {
        if (requiredBoolean(values, neighbor) && !requiredBoolean(visited, neighbor)) {
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }
    result.push(component);
  }
  return result;
}
