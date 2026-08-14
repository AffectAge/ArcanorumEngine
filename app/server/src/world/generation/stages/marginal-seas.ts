import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { requiredBoolean, requiredCell, requiredNumber } from '../utils.js';

type CoreComponent = {
  readonly indexes: readonly number[];
  readonly firstIndex: number;
  readonly isOuterOcean: boolean;
};

/**
 * Marks ocean basins reached through a narrower mouth than their interior.
 * Temporary clearance masks close narrow passages without changing the coastline.
 */
export function classifyMarginalSeas(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  edgeDistance: readonly number[],
): number {
  const waterClearance = calculateWaterClearance(cells, grid);
  const acceptedSea = Array.from({ length: grid.size }, () => false);
  const maximumClosureRadius = Math.ceil(configuration.source.topology.seaMaximumMouthWidth / 2);

  for (let closureRadius = 1; closureRadius <= maximumClosureRadius; closureRadius += 1) {
    const basinMask = findClosedBasins(
      cells,
      grid,
      configuration,
      edgeDistance,
      waterClearance,
      closureRadius,
    );
    if (basinMask === undefined) {
      continue;
    }

    for (const component of booleanComponents(basinMask, grid)) {
      if (qualifiesAsSea(component, basinMask, cells, grid, configuration)) {
        for (const index of component) {
          acceptedSea[index] = true;
        }
      }
    }
  }

  const components = booleanComponents(acceptedSea, grid)
    .filter(
      (component) =>
        component.length >= configuration.source.topology.seaMinimumHexes &&
        component.some((index) =>
          grid
            .neighborsOf(index)
            .some(
              (neighbor) =>
                isOceanWater(requiredCell(cells, neighbor)) && !requiredBoolean(acceptedSea, neighbor),
            ),
        ),
    )
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

/** Graph distance to dry land is the radius of water that survives a temporary coastal closure. */
function calculateWaterClearance(cells: readonly MutableHex[], grid: HexGrid): readonly number[] {
  const clearance = Array.from({ length: grid.size }, () => -1);
  const queue: number[] = [];
  for (let index = 0; index < grid.size; index += 1) {
    if (requiredCell(cells, index).isLand) {
      clearance[index] = 0;
      queue.push(index);
    }
  }
  if (queue.length === 0) {
    return clearance;
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = requiredNumber(queue, cursor);
    const nextClearance = requiredNumber(clearance, current) + 1;
    for (const neighbor of grid.neighborsOf(current)) {
      if (requiredNumber(clearance, neighbor) === -1) {
        clearance[neighbor] = nextClearance;
        queue.push(neighbor);
      }
    }
  }
  return clearance;
}

/**
 * Erodes water by one closure radius, then reconstructs the original water by nearest surviving
 * core. A core not connected to the protected outer-ocean band owns a basin behind a bottleneck.
 */
function findClosedBasins(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  edgeDistance: readonly number[],
  waterClearance: readonly number[],
  closureRadius: number,
): readonly boolean[] | undefined {
  const coreMask = Array.from(
    { length: grid.size },
    (_, index) =>
      isOceanWater(requiredCell(cells, index)) && requiredNumber(waterClearance, index) > closureRadius,
  );
  const components: CoreComponent[] = booleanComponents(coreMask, grid).map((indexes) => ({
    indexes,
    firstIndex: requiredNumber(indexes, 0),
    isOuterOcean: indexes.some(
      (index) => requiredNumber(edgeDistance, index) <= configuration.source.topology.outerOceanWidth,
    ),
  }));
  if (!components.some((component) => component.isOuterOcean)) {
    return undefined;
  }

  const owner = Array.from({ length: grid.size }, () => -1);
  const distance = Array.from({ length: grid.size }, () => -1);
  let frontier: number[] = [];
  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = requiredComponent(components, componentIndex);
    for (const index of component.indexes) {
      owner[index] = componentIndex;
      distance[index] = 0;
      frontier.push(index);
    }
  }

  let currentDistance = 0;
  while (frontier.length > 0) {
    const nextFrontier: number[] = [];
    for (const current of frontier) {
      const currentOwner = requiredNumber(owner, current);
      for (const neighbor of grid.neighborsOf(current)) {
        if (!isOceanWater(requiredCell(cells, neighbor))) {
          continue;
        }
        const neighborDistance = requiredNumber(distance, neighbor);
        if (neighborDistance === -1) {
          distance[neighbor] = currentDistance + 1;
          owner[neighbor] = currentOwner;
          nextFrontier.push(neighbor);
        } else if (
          neighborDistance === currentDistance + 1 &&
          compareOwnerPriority(currentOwner, requiredNumber(owner, neighbor), components) < 0
        ) {
          owner[neighbor] = currentOwner;
        }
      }
    }
    frontier = nextFrontier;
    currentDistance += 1;
  }

  return owner.map((componentIndex, index) => {
    if (!isOceanWater(requiredCell(cells, index)) || componentIndex < 0) {
      return false;
    }
    return !requiredComponent(components, componentIndex).isOuterOcean;
  });
}

function qualifiesAsSea(
  component: readonly number[],
  basinMask: readonly boolean[],
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
): boolean {
  if (component.length < configuration.source.topology.seaMinimumHexes) {
    return false;
  }

  let landBoundaryEdges = 0;
  let oceanBoundaryEdges = 0;
  const mouthCells = new Set<number>();
  for (const index of component) {
    for (const neighbor of grid.neighborsOf(index)) {
      const neighborCell = requiredCell(cells, neighbor);
      if (neighborCell.isLand) {
        landBoundaryEdges += 1;
      } else if (isOceanWater(neighborCell) && !requiredBoolean(basinMask, neighbor)) {
        oceanBoundaryEdges += 1;
        mouthCells.add(index);
      }
    }
  }
  if (mouthCells.size === 0 || mouthCells.size > configuration.source.topology.seaMaximumMouthWidth) {
    return false;
  }

  const boundaryEdges = landBoundaryEdges + oceanBoundaryEdges;
  const enclosurePermille = boundaryEdges === 0 ? 0 : Math.floor((landBoundaryEdges * 1000) / boundaryEdges);
  if (enclosurePermille < configuration.seaMinimumEnclosurePermille) {
    return false;
  }

  return maximumDepthFromMouth(basinMask, grid, mouthCells) >= configuration.source.topology.seaMinimumDepth;
}

function maximumDepthFromMouth(
  basinMask: readonly boolean[],
  grid: HexGrid,
  mouthCells: ReadonlySet<number>,
): number {
  const distance = new Map<number, number>();
  const queue = [...mouthCells].sort((left, right) => left - right);
  for (const index of queue) {
    distance.set(index, 0);
  }

  let maximumDepth = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = requiredNumber(queue, cursor);
    const currentDistance = distance.get(current);
    if (currentDistance === undefined) {
      throw new Error(`Sea-mouth distance is missing for hex ${current}.`);
    }
    maximumDepth = Math.max(maximumDepth, currentDistance);
    for (const neighbor of grid.neighborsOf(current)) {
      if (requiredBoolean(basinMask, neighbor) && !distance.has(neighbor)) {
        distance.set(neighbor, currentDistance + 1);
        queue.push(neighbor);
      }
    }
  }
  return maximumDepth;
}

function compareOwnerPriority(
  leftOwner: number,
  rightOwner: number,
  components: readonly CoreComponent[],
): number {
  const left = requiredComponent(components, leftOwner);
  const right = requiredComponent(components, rightOwner);
  const leftPriority = left.isOuterOcean ? 0 : left.firstIndex + 1;
  const rightPriority = right.isOuterOcean ? 0 : right.firstIndex + 1;
  return leftPriority - rightPriority || left.firstIndex - right.firstIndex;
}

function isOceanWater(cell: MutableHex): boolean {
  return !cell.isLand && cell.plannedWaterKind !== 'lake';
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

function requiredComponent(values: readonly CoreComponent[], index: number): CoreComponent {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Sea-core component is missing at index ${index}.`);
  }
  return value;
}
