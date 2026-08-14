import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { PlateModel } from '../types.js';
import { requiredBoolean, requiredNumber } from '../utils.js';

export type LandCandidateNoise = {
  readonly macro: (x: number, y: number) => number;
  readonly regional: (x: number, y: number) => number;
  readonly detail: (x: number, y: number) => number;
  readonly rifts: (x: number, y: number) => number;
};

export type CandidateLandComponent = {
  readonly indexes: readonly number[];
  readonly firstIndex: number;
};

export type LandCandidate = {
  readonly attemptIndex: number;
  readonly mask: readonly boolean[];
  readonly components: readonly CandidateLandComponent[];
  readonly score: number;
  readonly landHexCount: number;
  readonly discardedMicroIslandCount: number;
  readonly largestLandmassSharePermille: number;
  readonly coastlineEdges: number;
};

type StyleWeights = {
  readonly macro: number;
  readonly regional: number;
  readonly detail: number;
  readonly rift: number;
  readonly plate: number;
  readonly island: number;
  readonly center: number;
};

/** Creates one total, always-valid land candidate from a global ranked field. */
export function createLandCandidate(
  attemptIndex: number,
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  edgeDistance: readonly number[],
  plateModel: PlateModel,
  noise: LandCandidateNoise,
): LandCandidate {
  const margin = configuration.source.topology.outerOceanWidth + configuration.source.topology.edgeClearance;
  const eligible = Array.from({ length: grid.size }, (_, index) => index).filter(
    (index) => requiredNumber(edgeDistance, index) > margin,
  );
  const field = createLandSuitabilityField(grid, configuration, edgeDistance, plateModel, noise, margin);
  const ranked = eligible.sort(
    (left, right) => requiredNumber(field, right) - requiredNumber(field, left) || left - right,
  );
  const mask = Array.from({ length: grid.size }, () => false);
  for (let rank = 0; rank < configuration.targetLandHexes; rank += 1) {
    const index = ranked[rank];
    if (index === undefined) {
      throw new Error('Compiled land target exceeds the ranked generation interior.');
    }
    mask[index] = true;
  }

  fillEnclosedWater(mask, grid);
  const discardedMicroIslandCount = removeMicroLandmasses(mask, grid, configuration.minimumLandmassHexes);
  const components = findBooleanComponents(mask, true, grid).sort(compareComponents);
  if (components.length === 0) {
    throw new Error('A positive compiled land target produced no land component.');
  }
  const landHexCount = components.reduce((sum, component) => sum + component.indexes.length, 0);
  const largestLandmassSharePermille = Math.round(
    (requiredComponent(components, 0).indexes.length * 1000) / landHexCount,
  );
  const coastlineEdges = countCoastlineEdges(mask, grid);

  return {
    attemptIndex,
    mask,
    components,
    score: scoreCandidate(
      mask,
      components,
      landHexCount,
      largestLandmassSharePermille,
      coastlineEdges,
      grid,
      configuration,
    ),
    landHexCount,
    discardedMicroIslandCount,
    largestLandmassSharePermille,
    coastlineEdges,
  };
}

function createLandSuitabilityField(
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  edgeDistance: readonly number[],
  plateModel: PlateModel,
  noise: LandCandidateNoise,
  margin: number,
): readonly number[] {
  const topology = configuration.source.topology;
  const weights = styleWeights(topology.mapStyle);
  const smallerDimension = Math.min(grid.width, grid.height);
  const macroScale = Math.max(12, smallerDimension / (1.25 + topology.continentalGrain * 0.72));
  const regionalScale = Math.max(6, macroScale / 2.6);
  const detailScale = Math.max(3, regionalScale / 2.8);
  const plateBias = [
    0,
    ...plateModel.plates.map((plate) => {
      const coordinate = grid.coordinateAt(plate.seedIndex);
      return Math.round(noise.macro(coordinate.q / 97 + 41, coordinate.r / 97 - 59) * 1000);
    }),
  ];
  const centerQ = (grid.width - 1) / 2;
  const centerR = (grid.height - 1) / 2;
  const maximumCenterDistance = Math.max(1, Math.hypot(centerQ, centerR));

  return Array.from({ length: grid.size }, (_, index) => {
    if (requiredNumber(edgeDistance, index) <= margin) {
      return Number.MIN_SAFE_INTEGER;
    }
    const coordinate = grid.coordinateAt(index);
    const macro = Math.round(noise.macro(coordinate.q / macroScale, coordinate.r / macroScale) * 1000);
    const regional = Math.round(
      noise.regional(coordinate.q / regionalScale, coordinate.r / regionalScale) * 1000,
    );
    const detail = Math.round(noise.detail(coordinate.q / detailScale, coordinate.r / detailScale) * 1000);
    const riftNoise = Math.abs(
      noise.rifts(coordinate.q / (macroScale * 0.72), coordinate.r / (macroScale * 0.72)),
    );
    const riftBand = Math.round(Math.max(0, 1 - riftNoise * 3.8) * 1000);
    const edgeDepth = requiredNumber(edgeDistance, index) - margin;
    const edgePenalty = Math.max(0, 7 - edgeDepth) ** 2 * 90;
    const centerDistance = Math.hypot(coordinate.q - centerQ, coordinate.r - centerR);
    const centerBias = Math.round((1 - centerDistance / maximumCenterDistance) * 1000);
    const plate = requiredNumber(plateBias, requiredNumber(plateModel.ownerByIndex, index));
    const islandPotential = requiredNumber(plateModel.islandPotential, index);
    const roughness = configuration.coastRoughnessPermille;

    return (
      Math.round((macro * weights.macro) / 1000) +
      Math.round((regional * weights.regional * roughness) / 1_000_000) +
      Math.round((detail * weights.detail * roughness) / 1_000_000) -
      Math.round((riftBand * weights.rift * configuration.riftStrengthPermille) / 1_000_000) +
      Math.round((plate * weights.plate) / 1000) +
      Math.round((islandPotential * weights.island * configuration.islandFrequencyPermille) / 1_000_000) +
      Math.round((centerBias * weights.center) / 1000) +
      requiredTectonicBias(index, grid, plateModel) -
      edgePenalty
    );
  });
}

function requiredTectonicBias(index: number, grid: HexGrid, plateModel: PlateModel): number {
  const boundaryDistance = requiredNumber(plateModel.boundaryDistance, index);
  const boundary = Number.isFinite(boundaryDistance) ? Math.max(0, 8 - boundaryDistance) * 18 : 0;
  const neighborCount = grid.neighborsOf(index).length;
  return boundary + neighborCount;
}

function styleWeights(style: CompiledWorldGenerationConfig['source']['topology']['mapStyle']): StyleWeights {
  switch (style) {
    case 'continents':
      return { macro: 1700, regional: 1000, detail: 260, rift: 1350, plate: 520, island: 420, center: 0 };
    case 'fractal':
      return { macro: 1250, regional: 1450, detail: 480, rift: 1200, plate: 260, island: 480, center: 0 };
    case 'pangaea':
      return { macro: 1200, regional: 760, detail: 220, rift: 420, plate: 280, island: 180, center: 1250 };
    case 'archipelago':
      return { macro: 720, regional: 1650, detail: 620, rift: 1750, plate: 160, island: 1250, center: 0 };
  }
}

function fillEnclosedWater(mask: boolean[], grid: HexGrid): void {
  const outerWater = new Set<number>();
  const queue = Array.from({ length: grid.size }, (_, index) => index).filter(
    (index) => grid.isBoundary(index) && !requiredBoolean(mask, index),
  );
  for (const index of queue) {
    outerWater.add(index);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = requiredNumber(queue, cursor);
    for (const neighbor of grid.neighborsOf(current)) {
      if (!requiredBoolean(mask, neighbor) && !outerWater.has(neighbor)) {
        outerWater.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  for (let index = 0; index < grid.size; index += 1) {
    if (!requiredBoolean(mask, index) && !outerWater.has(index)) {
      mask[index] = true;
    }
  }
}

function removeMicroLandmasses(mask: boolean[], grid: HexGrid, minimumHexes: number): number {
  let discarded = 0;
  const components = findBooleanComponents(mask, true, grid).sort(compareComponents);
  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = requiredComponent(components, componentIndex);
    if (componentIndex === 0 || component.indexes.length >= minimumHexes) {
      continue;
    }
    discarded += 1;
    for (const index of component.indexes) {
      mask[index] = false;
    }
  }
  return discarded;
}

function findBooleanComponents(
  values: readonly boolean[],
  includedValue: boolean,
  grid: HexGrid,
): CandidateLandComponent[] {
  const visited = Array.from({ length: grid.size }, () => false);
  const components: CandidateLandComponent[] = [];
  for (let start = 0; start < grid.size; start += 1) {
    if (requiredBoolean(visited, start) || requiredBoolean(values, start) !== includedValue) {
      continue;
    }
    const indexes: number[] = [];
    const queue = [start];
    visited[start] = true;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = requiredNumber(queue, cursor);
      indexes.push(current);
      for (const neighbor of grid.neighborsOf(current)) {
        if (!requiredBoolean(visited, neighbor) && requiredBoolean(values, neighbor) === includedValue) {
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }
    components.push({ indexes, firstIndex: start });
  }
  return components;
}

function scoreCandidate(
  mask: readonly boolean[],
  components: readonly CandidateLandComponent[],
  landHexCount: number,
  largestShare: number,
  coastlineEdges: number,
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
): number {
  const style = configuration.source.topology.mapStyle;
  const coveragePenalty = Math.round(
    (Math.abs(landHexCount - configuration.targetLandHexes) * 18_000) / configuration.totalHexes,
  );
  const rectangularPenalty = components
    .filter((component) => component.indexes.length >= landHexCount * 0.04)
    .reduce((sum, component) => sum + componentRectanglePenalty(component, grid), 0);
  const coastPerHundredLand = Math.round((coastlineEdges * 100) / landHexCount);
  const coastTarget = style === 'archipelago' ? 72 : style === 'fractal' ? 54 : 38;
  const coastPenalty = Math.abs(coastPerHundredLand - coastTarget) * 12;
  const majorCount = components.filter(
    (component) => component.indexes.length >= requiredComponent(components, 0).indexes.length * 0.2,
  ).length;
  const stylePenalty = scoreStylePenalty(style, largestShare, majorCount, components.length);
  return 1_000_000 - coveragePenalty - rectangularPenalty - coastPenalty - stylePenalty;
}

function scoreStylePenalty(
  style: CompiledWorldGenerationConfig['source']['topology']['mapStyle'],
  largestShare: number,
  majorCount: number,
  componentCount: number,
): number {
  switch (style) {
    case 'continents':
      return outsideRangePenalty(largestShare, 260, 620, 16) + outsideRangePenalty(majorCount, 2, 7, 550);
    case 'fractal':
      return outsideRangePenalty(largestShare, 220, 820, 8) + outsideRangePenalty(componentCount, 2, 40, 120);
    case 'pangaea':
      return Math.abs(largestShare - 860) * 18 + Math.max(0, majorCount - 2) * 650;
    case 'archipelago':
      return Math.max(0, largestShare - 360) * 22 + outsideRangePenalty(componentCount, 5, 120, 180);
  }
}

function outsideRangePenalty(value: number, minimum: number, maximum: number, multiplier: number): number {
  if (value < minimum) {
    return (minimum - value) * multiplier;
  }
  if (value > maximum) {
    return (value - maximum) * multiplier;
  }
  return 0;
}

function componentRectanglePenalty(component: CandidateLandComponent, grid: HexGrid): number {
  let minimumQ = Number.POSITIVE_INFINITY;
  let maximumQ = Number.NEGATIVE_INFINITY;
  let minimumR = Number.POSITIVE_INFINITY;
  let maximumR = Number.NEGATIVE_INFINITY;
  for (const index of component.indexes) {
    const coordinate = grid.coordinateAt(index);
    minimumQ = Math.min(minimumQ, coordinate.q);
    maximumQ = Math.max(maximumQ, coordinate.q);
    minimumR = Math.min(minimumR, coordinate.r);
    maximumR = Math.max(maximumR, coordinate.r);
  }
  const boundingArea = (maximumQ - minimumQ + 1) * (maximumR - minimumR + 1);
  const fillPermille = Math.round((component.indexes.length * 1000) / boundingArea);
  return Math.max(0, fillPermille - 760) * 16;
}

function countCoastlineEdges(mask: readonly boolean[], grid: HexGrid): number {
  let edges = 0;
  for (let index = 0; index < grid.size; index += 1) {
    if (!requiredBoolean(mask, index)) {
      continue;
    }
    edges += grid.neighborsOf(index).filter((neighbor) => !requiredBoolean(mask, neighbor)).length;
  }
  return edges;
}

function compareComponents(left: CandidateLandComponent, right: CandidateLandComponent): number {
  return right.indexes.length - left.indexes.length || left.firstIndex - right.firstIndex;
}

function requiredComponent(
  components: readonly CandidateLandComponent[],
  index: number,
): CandidateLandComponent {
  const component = components[index];
  if (component === undefined) {
    throw new Error(`Land candidate component is missing: ${index}.`);
  }
  return component;
}
