import { createHash } from 'node:crypto';
import { createNoise2D } from 'simplex-noise';
import type {
  TerrainCatalog,
  WorldGenerationDiagnostics,
  WorldHex,
  WorldLandmass,
  WorldRiverEdge,
  WorldWaterBody,
} from '@arcanorum/shared';
import type { WorldGenerationConfig } from '../config.js';

type TerrainRole = 'ocean' | 'coastal_water' | 'sea' | 'lake' | 'land';
type WaterKind = 'ocean' | 'sea' | 'lake';

type MutableHex = {
  readonly q: number;
  readonly r: number;
  elevation: number;
  isLand: boolean;
  terrainId: string;
  temperature: number;
  rainfall: number;
  flowAccumulation: number;
  plannedWaterKind: Exclude<WaterKind, 'ocean'> | undefined;
  plannedWaterId: string | undefined;
  landmassId: string | undefined;
  waterBodyId: string | undefined;
};

type HexComponent = {
  readonly indexes: readonly number[];
  readonly firstIndex: number;
  readonly touchesBoundary: boolean;
};

type HydrologyResult = {
  readonly rivers: readonly WorldRiverEdge[];
  readonly maximumFlowAccumulation: number;
};

type ContinentAxis = {
  readonly start: MapPosition;
  readonly end: MapPosition;
  readonly width: number;
};

type ContinentPlan = {
  readonly center: MapPosition;
  readonly axes: readonly ContinentAxis[];
};

type MapPosition = {
  readonly x: number;
  readonly y: number;
};

type TopologyResult = {
  readonly discardedMicroIslandCount: number;
};

export type GeneratedWorld = {
  readonly hexes: readonly WorldHex[];
  readonly rivers: readonly WorldRiverEdge[];
  readonly landmasses: readonly WorldLandmass[];
  readonly waterBodies: readonly WorldWaterBody[];
  readonly diagnostics: WorldGenerationDiagnostics;
};

/**
 * This is the authoritative world-generation pipeline. Every stage only reads
 * explicit inputs and the seeded RNG, so its output can be recreated exactly.
 */
export function generateWorld(
  seed: string,
  configuration: WorldGenerationConfig,
  terrainCatalog: TerrainCatalog,
): GeneratedWorld {
  const terrainIds = createTerrainRoleIndex(terrainCatalog);
  const random = new SeededRandom(seed);
  const noise = createNoise2D(() => random.nextFloat());
  const grid = new HexGrid(configuration.width, configuration.height);
  const cells = createBaseCells(grid, configuration, terrainIds.land);
  const diagnostics: WorldGenerationDiagnostics['stages'] = [];
  const edgeDistance = grid.distancesFromBoundary();

  appendStageDiagnostic(diagnostics, 'stage.base_grid', cells);
  const plans = createContinentPlans(grid, configuration, random);
  applyContinentalLand(cells, grid, configuration, plans, edgeDistance, noise);
  appendStageDiagnostic(diagnostics, 'stage.macro_land', cells);

  const plannedIslands = addPlannedIslands(cells, grid, configuration, edgeDistance, random, noise);
  const initialTopology = cleanLandTopology(cells, grid, configuration, edgeDistance, plannedIslands);
  appendStageDiagnostic(diagnostics, 'stage.topology', cells);

  carvePlannedWater(cells, grid, configuration, edgeDistance, random, noise);
  const finalTopology = cleanLandTopology(cells, grid, configuration, edgeDistance, plannedIslands);
  enforceOuterOcean(cells, configuration, edgeDistance);
  appendStageDiagnostic(diagnostics, 'stage.water_geometry', cells);

  addMountainRanges(cells, grid, configuration, edgeDistance, random, noise);
  enforceOuterOcean(cells, configuration, edgeDistance);
  appendStageDiagnostic(diagnostics, 'stage.mountains', cells);

  const landmasses = assignLandmasses(cells, grid, configuration);
  const waterBodies = assignWaterBodies(cells, grid, configuration, terrainIds, edgeDistance);
  assignCoastalWater(cells, grid, configuration.coastalWaterWidth, terrainIds);
  appendStageDiagnostic(diagnostics, 'stage.water_bodies', cells);

  calculateClimate(cells, grid, configuration, noise);
  appendStageDiagnostic(diagnostics, 'stage.climate', cells);

  const hydrology = calculateHydrology(cells, grid, configuration);
  appendStageDiagnostic(diagnostics, 'stage.hydrology', cells);
  const geography = validateGeography(cells, grid, configuration, edgeDistance, waterBodies);

  return {
    hexes: cells.map(toWorldHex),
    rivers: hydrology.rivers,
    landmasses,
    waterBodies,
    diagnostics: {
      stages: diagnostics,
      landHexCount: cells.filter((cell) => cell.isLand).length,
      riverEdgeCount: hydrology.rivers.length,
      maximumElevation: maximum(cells.map((cell) => cell.elevation)),
      maximumFlowAccumulation: hydrology.maximumFlowAccumulation,
      boundaryLandHexCount: geography.boundaryLandHexCount,
      outerOceanHexCount: geography.outerOceanHexCount,
      connectedSeaCount: geography.connectedSeaCount,
      discardedMicroIslandCount:
        initialTopology.discardedMicroIslandCount + finalTopology.discardedMicroIslandCount,
    },
  };
}

function toWorldHex(cell: MutableHex): WorldHex {
  return {
    q: cell.q,
    r: cell.r,
    terrainId: cell.terrainId,
    elevation: cell.elevation,
    temperature: cell.temperature,
    rainfall: cell.rainfall,
    flowAccumulation: cell.flowAccumulation,
    ...(cell.landmassId === undefined ? {} : { landmassId: cell.landmassId }),
    ...(cell.waterBodyId === undefined ? {} : { waterBodyId: cell.waterBodyId }),
  };
}

function createTerrainRoleIndex(catalog: TerrainCatalog): Readonly<Record<TerrainRole, string>> {
  const result = new Map<TerrainRole, string>();

  for (const terrainType of catalog.terrainTypes) {
    result.set(terrainType.role, terrainType.id);
  }

  return {
    ocean: requiredTerrainRole(result, 'ocean'),
    coastal_water: requiredTerrainRole(result, 'coastal_water'),
    sea: requiredTerrainRole(result, 'sea'),
    lake: requiredTerrainRole(result, 'lake'),
    land: requiredTerrainRole(result, 'land'),
  };
}

function requiredTerrainRole(roles: ReadonlyMap<TerrainRole, string>, role: TerrainRole): string {
  const terrainId = roles.get(role);
  if (terrainId === undefined) {
    throw new Error(`Terrain catalog is missing required role: ${role}`);
  }
  return terrainId;
}

function createBaseCells(
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  landTerrainId: string,
): MutableHex[] {
  return Array.from({ length: grid.size }, (_, index) => {
    const coordinate = grid.coordinateAt(index);
    return {
      ...coordinate,
      elevation: clampInteger(configuration.seaLevel - 180),
      isLand: false,
      terrainId: landTerrainId,
      temperature: 0,
      rainfall: 0,
      flowAccumulation: 0,
      plannedWaterKind: undefined,
      plannedWaterId: undefined,
      landmassId: undefined,
      waterBodyId: undefined,
    };
  });
}

function createContinentPlans(
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
): readonly ContinentPlan[] {
  const radius = calculateContinentRadius(configuration);
  const minimumSeparation = Math.max(configuration.continentMinimumSeparation, Math.ceil(radius * 2.6));
  const centers = selectContinentCenters(
    grid,
    configuration.continentCount,
    minimumSeparation,
    configuration.outerOcean.hardWidth + configuration.outerOcean.coastFalloffWidth + 1,
    random,
  );

  return centers.map((centerIndex) => {
    const center = mapPosition(grid.coordinateAt(centerIndex));
    const axisCount = randomBetweenInteger(
      random,
      configuration.continentalAxes.minimumCount,
      configuration.continentalAxes.maximumCount,
    );
    const primaryAngle = random.nextFloat() * Math.PI * 2;
    const primaryLength =
      radius *
      randomBetween(
        random,
        configuration.continentalAxes.primaryLengthMinimumFactor,
        configuration.continentalAxes.primaryLengthMaximumFactor,
      );
    const primaryWidth =
      radius *
      randomBetween(
        random,
        configuration.continentalAxes.widthMinimumFactor,
        configuration.continentalAxes.widthMaximumFactor,
      );
    const primaryStart = offsetPosition(center, primaryAngle + Math.PI, primaryLength / 2);
    const primaryEnd = offsetPosition(center, primaryAngle, primaryLength / 2);
    const axes: ContinentAxis[] = [{ start: primaryStart, end: primaryEnd, width: primaryWidth }];

    for (let axisIndex = 1; axisIndex < axisCount; axisIndex += 1) {
      const anchor = interpolatePosition(primaryStart, primaryEnd, 0.2 + random.nextFloat() * 0.6);
      const direction =
        primaryAngle + (random.nextFloat() < 0.5 ? -1 : 1) * (0.45 + random.nextFloat() * 0.9);
      const length =
        radius *
        randomBetween(
          random,
          configuration.continentalAxes.branchLengthMinimumFactor,
          configuration.continentalAxes.branchLengthMaximumFactor,
        );
      axes.push({
        start: anchor,
        end: offsetPosition(anchor, direction, length),
        width: primaryWidth * (0.62 + random.nextFloat() * 0.28),
      });
    }

    return { center, axes };
  });
}

function applyContinentalLand(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  plans: readonly ContinentPlan[],
  edgeDistance: readonly number[],
  noise: (x: number, y: number) => number,
): void {
  for (let index = 0; index < cells.length; index += 1) {
    const cell = requiredCell(cells, index);
    const distanceToEdge = requiredNumber(edgeDistance, index);
    if (distanceToEdge <= configuration.outerOcean.hardWidth) {
      makeWater(cell, configuration.seaLevel);
      continue;
    }

    const position = mapPosition(cell);
    const warpedPosition = {
      x:
        position.x +
        noise(
          cell.q / configuration.continentalAxes.domainWarpScale + 151,
          cell.r / configuration.continentalAxes.domainWarpScale - 89,
        ) *
          configuration.continentalAxes.domainWarpAmount,
      y:
        position.y +
        noise(
          cell.q / configuration.continentalAxes.domainWarpScale - 173,
          cell.r / configuration.continentalAxes.domainWarpScale + 113,
        ) *
          configuration.continentalAxes.domainWarpAmount,
    };
    const axisStrength = maximum(
      plans.flatMap((plan) =>
        plan.axes.map((axis) =>
          smoothstep(0, 1, 1 - distanceToSegment(warpedPosition, axis.start, axis.end) / axis.width),
        ),
      ),
    );
    const planCenterDistances = plans
      .map((plan) => Math.hypot(position.x - plan.center.x, position.y - plan.center.y))
      .sort((left, right) => left - right);
    const closestPlanDistance = planCenterDistances[0];
    const nextPlanDistance = planCenterDistances[1];
    if (closestPlanDistance === undefined || nextPlanDistance === undefined) {
      throw new Error('World generation requires at least two continent plans.');
    }
    const separationInfluence = smoothstep(
      0,
      configuration.continentalAxes.separationWidth,
      nextPlanDistance - closestPlanDistance,
    );
    const coastBand = smoothstep(0.02, 0.7, axisStrength) * smoothstep(1, 0.15, axisStrength);
    const macro = noise(
      cell.q / configuration.coastNoise.macroScale + 41,
      cell.r / configuration.coastNoise.macroScale - 67,
    );
    const bays = noise(
      cell.q / configuration.coastNoise.bayScale - 211,
      cell.r / configuration.coastNoise.bayScale + 127,
    );
    const detail = noise(
      cell.q / configuration.coastNoise.detailScale + 307,
      cell.r / configuration.coastNoise.detailScale - 251,
    );
    const edgeInfluence = smoothstep(
      configuration.outerOcean.hardWidth,
      configuration.outerOcean.hardWidth + configuration.outerOcean.coastFalloffWidth,
      distanceToEdge,
    );
    const landPotential =
      (axisStrength +
        macro * configuration.coastNoise.macroAmplitude * (0.35 + axisStrength * 0.65) +
        (bays * configuration.coastNoise.bayAmplitude + detail * configuration.coastNoise.detailAmplitude) *
          coastBand) *
      edgeInfluence *
      separationInfluence;

    if (landPotential <= configuration.continentalAxes.landThreshold) {
      makeWater(cell, configuration.seaLevel);
      continue;
    }

    makeLand(cell, configuration.seaLevel + 26 + landPotential * 320);
  }
}

function addPlannedIslands(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): ReadonlySet<number> {
  const protectedIndexes = new Set<number>();

  for (let islandIndex = 0; islandIndex < configuration.islandCount; islandIndex += 1) {
    const radius = 1 + random.nextInt(configuration.islandMaximumRadius);
    const center = findFeatureCenter(
      cells,
      grid,
      radius,
      radius,
      false,
      edgeDistance,
      configuration.outerOcean.hardWidth + configuration.outerOcean.coastFalloffWidth,
      undefined,
      random,
    );
    for (const index of grid.indexesWithinRadius(center, radius + 1)) {
      const cell = requiredCell(cells, index);
      const irregularRadius = radius * (1 + noise(cell.q / 4 + 59, cell.r / 4 - 151) * 0.16);
      if (grid.distanceBetween(center, index) <= irregularRadius) {
        makeLand(cell, configuration.seaLevel + 64 + noise(cell.q / 5 - 83, cell.r / 5 + 197) * 24);
        protectedIndexes.add(index);
      }
    }
  }

  return protectedIndexes;
}

function cleanLandTopology(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  protectedIndexes: ReadonlySet<number>,
): TopologyResult {
  for (let pass = 0; pass < configuration.topology.smoothingPasses; pass += 1) {
    const erodedIndexes = Array.from({ length: grid.size }, (_, index) => index).filter((index) => {
      const cell = requiredCell(cells, index);
      return (
        cell.isLand &&
        !protectedIndexes.has(index) &&
        requiredNumber(edgeDistance, index) > configuration.outerOcean.hardWidth &&
        grid.neighborsOf(index).filter((neighbor) => requiredCell(cells, neighbor).isLand).length <= 1
      );
    });
    for (const index of erodedIndexes) {
      makeWater(requiredCell(cells, index), configuration.seaLevel);
    }
  }

  const components = [...findComponents(cells, grid, (cell) => cell.isLand)].sort(compareComponentsBySize);
  let discardedMicroIslandCount = 0;
  for (const component of components.slice(configuration.continentCount)) {
    if (
      component.indexes.length >= configuration.topology.minimumIslandHexes ||
      component.indexes.some((index) => protectedIndexes.has(index))
    ) {
      continue;
    }
    for (const index of component.indexes) {
      makeWater(requiredCell(cells, index), configuration.seaLevel);
    }
    discardedMicroIslandCount += 1;
  }

  fillUnplannedInlandWater(cells, grid, configuration.seaLevel);
  enforceOuterOcean(cells, configuration, edgeDistance);
  return { discardedMicroIslandCount };
}

function fillUnplannedInlandWater(cells: readonly MutableHex[], grid: HexGrid, seaLevel: number): void {
  const enclosedWater = findComponents(cells, grid, (cell) => !cell.isLand).filter(
    (component) =>
      !component.touchesBoundary &&
      !component.indexes.some((index) => requiredCell(cells, index).plannedWaterKind !== undefined),
  );
  for (const component of enclosedWater) {
    for (const index of component.indexes) {
      makeLand(requiredCell(cells, index), seaLevel + 24);
    }
  }
}

function carvePlannedWater(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  for (let seaIndex = 1; seaIndex <= configuration.seaCount; seaIndex += 1) {
    const center = findFeatureCenter(
      cells,
      grid,
      configuration.seaRadius,
      Math.max(1, configuration.seaRadius - 2),
      true,
      edgeDistance,
      configuration.outerOcean.hardWidth + 1,
      largestLandComponentIndexes(cells, grid),
      random,
    );
    const id = `water.sea.${seaIndex}`;
    carveIrregularBasin(
      cells,
      grid,
      center,
      configuration.seaRadius,
      configuration.seaLevel,
      'sea',
      id,
      noise,
    );
    carveSeaChannel(cells, grid, center, configuration, edgeDistance, random, noise, id);
  }

  for (let lakeIndex = 1; lakeIndex <= configuration.lakeCount; lakeIndex += 1) {
    const center = findFeatureCenter(
      cells,
      grid,
      configuration.lakeRadius,
      configuration.lakeRadius,
      true,
      edgeDistance,
      configuration.outerOcean.hardWidth + configuration.lakeRadius,
      largestLandComponentIndexes(cells, grid),
      random,
    );
    carveIrregularBasin(
      cells,
      grid,
      center,
      configuration.lakeRadius,
      configuration.seaLevel,
      'lake',
      `water.lake.${lakeIndex}`,
      noise,
    );
  }
}

function findFeatureCenter(
  cells: readonly MutableHex[],
  grid: HexGrid,
  radius: number,
  clearanceRadius: number,
  requiredLand: boolean,
  edgeDistance: readonly number[],
  minimumEdgeDistance: number,
  allowedIndexes: ReadonlySet<number> | undefined,
  random: SeededRandom,
): number {
  const candidates = shuffle(
    Array.from({ length: grid.size }, (_, index) => index).filter(
      (index) =>
        requiredNumber(edgeDistance, index) > minimumEdgeDistance &&
        (allowedIndexes === undefined || allowedIndexes.has(index)) &&
        grid.indexesWithinRadius(index, clearanceRadius).every((candidate) => {
          const cell = requiredCell(cells, candidate);
          return (
            cell.isLand === requiredLand && (allowedIndexes === undefined || allowedIndexes.has(candidate))
          );
        }),
    ),
    random,
  );
  const center = candidates[0];
  if (center === undefined) {
    throw new Error(`World generation cannot place planned ${requiredLand ? 'water' : 'island'} feature.`);
  }
  return center;
}

function largestLandComponentIndexes(cells: readonly MutableHex[], grid: HexGrid): ReadonlySet<number> {
  const largest = [...findComponents(cells, grid, (cell) => cell.isLand)].sort(compareComponentsBySize)[0];
  if (largest === undefined) {
    throw new Error('World generation cannot place water without land.');
  }
  return new Set(largest.indexes);
}

function carveIrregularBasin(
  cells: readonly MutableHex[],
  grid: HexGrid,
  center: number,
  radius: number,
  seaLevel: number,
  kind: Exclude<WaterKind, 'ocean'>,
  id: string,
  noise: (x: number, y: number) => number,
): void {
  const basinIndexes = new Set<number>();
  for (const index of grid.indexesWithinRadius(center, radius + 1)) {
    const cell = requiredCell(cells, index);
    const irregularRadius = radius * (1 + noise(cell.q / 5 + 97, cell.r / 5 - 53) * 0.18);
    const distance = grid.distanceBetween(center, index);
    if (
      distance <= irregularRadius &&
      (distance === 0 || grid.neighborsOf(index).some((neighbor) => basinIndexes.has(neighbor)))
    ) {
      basinIndexes.add(index);
    }
  }
  if (!basinIndexes.has(center)) {
    throw new Error('World generation did not carve its selected water basin.');
  }
  for (const index of basinIndexes) {
    makeWater(requiredCell(cells, index), seaLevel, kind, id);
  }
}

function carveSeaChannel(
  cells: readonly MutableHex[],
  grid: HexGrid,
  basinCenter: number,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
  seaId: string,
): void {
  const exit = selectSeaExit(grid, basinCenter, edgeDistance, configuration.outerOcean.hardWidth, random);
  const start = mapPosition(grid.coordinateAt(basinCenter));
  const end = mapPosition(grid.coordinateAt(exit));
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const normal = { x: -(end.y - start.y) / distance, y: (end.x - start.x) / distance };
  const meander = distance * configuration.seaChannelMeander;
  const controls = [
    start,
    {
      x: start.x + (end.x - start.x) * 0.33 + normal.x * meander * (random.nextFloat() * 2 - 1),
      y: start.y + (end.y - start.y) * 0.33 + normal.y * meander * (random.nextFloat() * 2 - 1),
    },
    {
      x: start.x + (end.x - start.x) * 0.67 + normal.x * meander * (random.nextFloat() * 2 - 1),
      y: start.y + (end.y - start.y) * 0.67 + normal.y * meander * (random.nextFloat() * 2 - 1),
    },
    end,
  ];

  for (let segmentIndex = 0; segmentIndex < controls.length - 1; segmentIndex += 1) {
    const segmentStart = controls[segmentIndex];
    const segmentEnd = controls[segmentIndex + 1];
    if (segmentStart === undefined || segmentEnd === undefined) {
      throw new Error('World generation sea channel control point is missing.');
    }
    const width = randomBetweenInteger(
      random,
      configuration.seaChannelMinimumWidth,
      configuration.seaChannelMaximumWidth,
    );
    for (let index = 0; index < cells.length; index += 1) {
      const cell = requiredCell(cells, index);
      const variation = 1 + noise(cell.q / 6 - 43, cell.r / 6 + 229) * 0.18;
      if (distanceToSegment(mapPosition(cell), segmentStart, segmentEnd) <= width * variation) {
        makeWater(cell, configuration.seaLevel, 'sea', seaId);
      }
    }
  }
}

function selectSeaExit(
  grid: HexGrid,
  basinCenter: number,
  edgeDistance: readonly number[],
  hardOceanWidth: number,
  random: SeededRandom,
): number {
  const candidates = Array.from({ length: grid.size }, (_, index) => index).filter(
    (index) => requiredNumber(edgeDistance, index) === hardOceanWidth,
  );
  const closestDistance = minimum(candidates.map((index) => grid.distanceBetween(basinCenter, index)));
  const nearby = candidates.filter(
    (index) =>
      grid.distanceBetween(basinCenter, index) <=
      closestDistance + Math.max(4, Math.floor(Math.min(grid.width, grid.height) * 0.12)),
  );
  return requiredNumber(shuffle(nearby, random), 0);
}

function enforceOuterOcean(
  cells: readonly MutableHex[],
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
): void {
  for (let index = 0; index < cells.length; index += 1) {
    if (requiredNumber(edgeDistance, index) <= configuration.outerOcean.hardWidth) {
      makeWater(requiredCell(cells, index), configuration.seaLevel);
    }
  }
}

function calculateContinentRadius(configuration: WorldGenerationConfig): number {
  const requestedArea = configuration.width * configuration.height * configuration.continentCoverage;
  return Math.max(4, Math.sqrt(requestedArea / (configuration.continentCount * Math.PI)) * 1.08);
}

function selectContinentCenters(
  grid: HexGrid,
  count: number,
  minimumSeparation: number,
  edgeInset: number,
  random: SeededRandom,
): readonly number[] {
  const candidates = shuffle(
    Array.from({ length: grid.size }, (_, index) => index).filter((index) =>
      grid.isInterior(index, edgeInset),
    ),
    random,
  );

  for (let attempt = 0; attempt < Math.min(64, candidates.length); attempt += 1) {
    const first = candidates[attempt];
    if (first === undefined) {
      break;
    }
    const centers = [first];

    while (centers.length < count) {
      let nextCenter: number | undefined;
      let greatestMinimumDistance = -1;
      for (const candidate of candidates) {
        const nearestCenterDistance = minimum(
          centers.map((center) => grid.distanceBetween(center, candidate)),
        );
        if (nearestCenterDistance >= minimumSeparation && nearestCenterDistance > greatestMinimumDistance) {
          nextCenter = candidate;
          greatestMinimumDistance = nearestCenterDistance;
        }
      }
      if (nextCenter === undefined) {
        break;
      }
      centers.push(nextCenter);
    }

    if (centers.length === count) {
      return centers;
    }
  }

  throw new Error(
    `World generation cannot place ${count} continents with separation ${minimumSeparation} on this map.`,
  );
}

function makeLand(cell: MutableHex, elevation: number): void {
  cell.isLand = true;
  cell.elevation = clampInteger(elevation);
  cell.plannedWaterKind = undefined;
  cell.plannedWaterId = undefined;
  cell.waterBodyId = undefined;
}

function makeWater(
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

function floodWaterFromBoundary(cells: readonly MutableHex[], grid: HexGrid): ReadonlySet<number> {
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

function validateGeography(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  waterBodies: readonly WorldWaterBody[],
): {
  readonly boundaryLandHexCount: 0;
  readonly outerOceanHexCount: number;
  readonly connectedSeaCount: number;
} {
  const boundaryLandHexCount = Array.from({ length: grid.size }, (_, index) => index).filter(
    (index) => grid.isBoundary(index) && requiredCell(cells, index).isLand,
  ).length;
  if (boundaryLandHexCount !== 0) {
    throw new Error(`World generation produced ${boundaryLandHexCount} land hexes on the map boundary.`);
  }

  const outerOcean = floodWaterFromBoundary(cells, grid);
  if (
    Array.from({ length: grid.size }, (_, index) => index).some(
      (index) => requiredNumber(edgeDistance, index) === 0 && !outerOcean.has(index),
    )
  ) {
    throw new Error('The outer ocean must connect every boundary water hex.');
  }

  const connectedSeaCount = waterBodies.filter((waterBody) => {
    if (waterBody.kind !== 'sea') {
      return false;
    }
    return Array.from({ length: grid.size }, (_, index) => index).some(
      (index) => requiredCell(cells, index).waterBodyId === waterBody.id && outerOcean.has(index),
    );
  }).length;
  if (connectedSeaCount !== configuration.seaCount) {
    throw new Error('Every planned sea must connect physically to the outer ocean.');
  }

  return { boundaryLandHexCount: 0, outerOceanHexCount: outerOcean.size, connectedSeaCount };
}

function addMountainRanges(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  for (let rangeIndex = 0; rangeIndex < configuration.mountainRangeCount; rangeIndex += 1) {
    const startIndex = findMountainRangeStart(cells, grid, configuration, edgeDistance, random);
    const start = mapPosition(grid.coordinateAt(startIndex));
    const angle = random.nextFloat() * Math.PI * 2;
    const length =
      configuration.mountainRangeMinimumLength +
      random.nextInt(configuration.mountainRangeMaximumLength - configuration.mountainRangeMinimumLength + 1);
    const end = {
      x: start.x + Math.cos(angle) * length,
      y: start.y + Math.sin(angle) * length,
    };

    for (let index = 0; index < cells.length; index += 1) {
      const cell = requiredCell(cells, index);
      if (!cell.isLand) {
        continue;
      }

      const distance = distanceToSegment(mapPosition(cell), start, end);
      const ridgeStrength = Math.max(0, 1 - distance / configuration.mountainRangeWidth);
      if (ridgeStrength === 0) {
        continue;
      }

      const variation = noise(cell.q / 4 - 109, cell.r / 4 + 257) * 28;
      cell.elevation = clampInteger(
        cell.elevation + ridgeStrength * (configuration.mountainRangeHeight + variation),
      );
    }
  }
}

function findMountainRangeStart(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  random: SeededRandom,
): number {
  const candidates = shuffle(
    Array.from({ length: grid.size }, (_, index) => index).filter(
      (index) =>
        requiredNumber(edgeDistance, index) >
          configuration.outerOcean.hardWidth + configuration.outerOcean.coastFalloffWidth + 3 &&
        requiredCell(cells, index).isLand &&
        grid.indexesWithinRadius(index, 2).every((neighbor) => requiredCell(cells, neighbor).isLand),
    ),
    random,
  );
  const start = candidates[0];
  if (start === undefined) {
    throw new Error('World generation cannot find land for a configured mountain range.');
  }
  return start;
}

function assignLandmasses(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
): readonly WorldLandmass[] {
  const components = [...findComponents(cells, grid, (cell) => cell.isLand)].sort(compareComponentsBySize);
  const minimumContinentHexes = Math.floor(
    (configuration.width * configuration.height * configuration.continentCoverage) /
      configuration.continentCount /
      3,
  );
  const continents = components.slice(0, configuration.continentCount);

  if (
    continents.length !== configuration.continentCount ||
    continents.some((component) => component.indexes.length < minimumContinentHexes)
  ) {
    throw new Error(
      `World generation produced fewer than ${configuration.continentCount} valid continents. Land components: ${components.map((component) => component.indexes.length).join(', ')}.`,
    );
  }

  const continentComponents = new Set(continents);
  let continentIndex = 1;
  let islandIndex = 1;
  const records: WorldLandmass[] = [];

  for (const component of components) {
    const kind = continentComponents.has(component) ? 'continent' : 'island';
    const id =
      kind === 'continent' ? `landmass.continent.${continentIndex++}` : `landmass.island.${islandIndex++}`;

    for (const index of component.indexes) {
      requiredCell(cells, index).landmassId = id;
    }
    records.push({ id, kind, hexCount: component.indexes.length });
  }

  return records;
}

function assignWaterBodies(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  terrainIds: Readonly<Record<TerrainRole, string>>,
  edgeDistance: readonly number[],
): readonly WorldWaterBody[] {
  const outerOceanIndexes = floodWaterFromBoundary(cells, grid);
  const waterIndexesById = new Map<string, number[]>();

  for (let index = 0; index < cells.length; index += 1) {
    const cell = requiredCell(cells, index);
    if (cell.isLand) {
      cell.terrainId = terrainIds.land;
      continue;
    }

    const kind = cell.plannedWaterKind ?? 'ocean';
    const id = cell.plannedWaterId ?? 'water.ocean.1';
    if (kind === 'ocean' && !outerOceanIndexes.has(index)) {
      throw new Error(`Unplanned inland water at ${cell.q}:${cell.r} survived topology cleanup.`);
    }
    cell.waterBodyId = id;
    cell.terrainId = terrainIds[kind];
    const indexes = waterIndexesById.get(id) ?? [];
    indexes.push(index);
    waterIndexesById.set(id, indexes);
  }

  const oceanIndexes = waterIndexesById.get('water.ocean.1');
  if (oceanIndexes === undefined) {
    throw new Error('World generation did not retain an outer ocean.');
  }
  const records: WorldWaterBody[] = [{ id: 'water.ocean.1', kind: 'ocean', hexCount: oceanIndexes.length }];
  for (const kind of ['sea', 'lake'] as const) {
    const ids = [...waterIndexesById.keys()].filter((id) => id.startsWith(`water.${kind}.`)).sort();
    for (const id of ids) {
      const indexes = waterIndexesById.get(id);
      if (indexes === undefined) {
        throw new Error(`Water-body indexes are missing for ${id}.`);
      }
      records.push({ id, kind, hexCount: indexes.length });
    }
  }

  if (
    records.filter((record) => record.kind === 'sea').length !== configuration.seaCount ||
    records.filter((record) => record.kind === 'lake').length !== configuration.lakeCount
  ) {
    throw new Error('World generation did not preserve every planned sea and lake.');
  }

  if (
    Array.from({ length: grid.size }, (_, index) => index).some(
      (index) =>
        requiredNumber(edgeDistance, index) === 0 &&
        requiredCell(cells, index).waterBodyId !== 'water.ocean.1',
    )
  ) {
    throw new Error('Every map-boundary water hex must belong to the outer ocean.');
  }

  return records;
}

function assignCoastalWater(
  cells: readonly MutableHex[],
  grid: HexGrid,
  coastalWaterWidth: number,
  terrainIds: Readonly<Record<TerrainRole, string>>,
): void {
  const coastalIndexes = new Set<number>();

  for (let step = 0; step < coastalWaterWidth; step += 1) {
    const sources =
      step === 0
        ? Array.from({ length: grid.size }, (_, index) => index).filter(
            (index) =>
              !requiredCell(cells, index).isLand &&
              grid.neighborsOf(index).some((neighbor) => requiredCell(cells, neighbor).isLand),
          )
        : [...coastalIndexes];

    for (const source of sources) {
      coastalIndexes.add(source);
      for (const neighbor of grid.neighborsOf(source)) {
        const cell = requiredCell(cells, neighbor);
        if (!cell.isLand && isOuterOcean(cell)) {
          coastalIndexes.add(neighbor);
        }
      }
    }
  }

  for (const index of coastalIndexes) {
    const cell = requiredCell(cells, index);
    if (isOuterOcean(cell)) {
      cell.terrainId = terrainIds.coastal_water;
    }
  }
}

function isOuterOcean(cell: MutableHex): boolean {
  return cell.waterBodyId === 'water.ocean.1';
}

function calculateClimate(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  noise: (x: number, y: number) => number,
): void {
  const humidity = Array.from({ length: grid.size }, () => 0);
  const westToEast = configuration.climate.prevailingWind === 'west_to_east';
  const columns = Array.from({ length: grid.width }, (_, index) =>
    westToEast ? index : grid.width - index - 1,
  );

  for (const q of columns) {
    for (let r = 0; r < grid.height; r += 1) {
      const index = grid.indexOf(q, r);
      const cell = requiredCell(cells, index);
      const upwind = grid
        .neighborsOf(index)
        .filter((neighbor) =>
          westToEast ? grid.coordinateAt(neighbor).q < q : grid.coordinateAt(neighbor).q > q,
        );
      const incomingHumidity =
        upwind.length === 0
          ? 420
          : Math.round(
              upwind.reduce((total, neighbor) => total + requiredNumber(humidity, neighbor), 0) /
                upwind.length,
            );
      const upwindElevation =
        upwind.length === 0
          ? configuration.seaLevel
          : Math.round(
              upwind.reduce((total, neighbor) => total + requiredCell(cells, neighbor).elevation, 0) /
                upwind.length,
            );
      const latitude = grid.height === 1 ? 0 : Math.abs((r / (grid.height - 1)) * 2 - 1);
      const baseTemperature =
        configuration.climate.equatorialTemperature -
        (configuration.climate.equatorialTemperature - configuration.climate.polarTemperature) * latitude;
      const elevationCooling =
        Math.max(0, cell.elevation - configuration.seaLevel) * configuration.climate.elevationCooling;
      cell.temperature = clampInteger(
        baseTemperature - elevationCooling + noise(q / 17 + 41, r / 17 - 61) * 24,
      );

      if (!cell.isLand) {
        cell.rainfall = 1000;
        humidity[index] = 1000;
        continue;
      }

      const hasWaterNeighbor = grid
        .neighborsOf(index)
        .some((neighbor) => !requiredCell(cells, neighbor).isLand);
      const humidAir = Math.max(incomingHumidity, hasWaterNeighbor ? 720 : 0);
      const orographicRain = Math.max(0, cell.elevation - upwindElevation) * 0.72;
      const rainfall =
        70 +
        humidAir * 0.34 +
        orographicRain +
        noise(q / 9 - 131, r / 9 + 83) * configuration.climate.rainfallNoise;
      cell.rainfall = clampInteger(rainfall);
      humidity[index] = clampInteger(humidAir * 0.9 - cell.rainfall * 0.56 + (hasWaterNeighbor ? 150 : 0));
    }
  }
}

function calculateHydrology(
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

function findComponents(
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

function appendStageDiagnostic(
  diagnostics: WorldGenerationDiagnostics['stages'],
  id: string,
  cells: readonly MutableHex[],
): void {
  const hash = createHash('sha256');
  hash.update(id);
  for (const cell of cells) {
    hash.update(
      `${cell.q},${cell.r},${cell.elevation},${cell.isLand ? 1 : 0},${cell.terrainId},${cell.temperature},${cell.rainfall},${cell.flowAccumulation};`,
    );
  }
  diagnostics.push({ id, checksum: hash.digest('hex') });
}

function compareComponentsBySize(left: HexComponent, right: HexComponent): number {
  return right.indexes.length - left.indexes.length || left.firstIndex - right.firstIndex;
}

function mapPosition(coordinate: { readonly q: number; readonly r: number }): MapPosition {
  return { x: coordinate.q, y: coordinate.r + (coordinate.q & 1) * 0.5 };
}

function offsetPosition(position: MapPosition, angle: number, distance: number): MapPosition {
  return {
    x: position.x + Math.cos(angle) * distance,
    y: position.y + Math.sin(angle) * distance,
  };
}

function interpolatePosition(start: MapPosition, end: MapPosition, amount: number): MapPosition {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

function distanceToSegment(point: MapPosition, start: MapPosition, end: MapPosition): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared),
  );
  return Math.hypot(point.x - (start.x + projection * deltaX), point.y - (start.y + projection * deltaY));
}

function minimum(values: readonly number[]): number {
  const value = values.reduce((result, candidate) => Math.min(result, candidate), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(value)) {
    throw new Error('Expected at least one numeric value.');
  }
  return value;
}

function maximum(values: readonly number[]): number {
  const value = values.reduce((result, candidate) => Math.max(result, candidate), Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(value)) {
    throw new Error('Expected at least one numeric value.');
  }
  return value;
}

function smoothstep(start: number, end: number, value: number): number {
  if (start > end) {
    return 1 - smoothstep(end, start, value);
  }
  if (value <= start) {
    return 0;
  }
  if (value >= end) {
    return 1;
  }
  const progress = (value - start) / (end - start);
  return progress * progress * (3 - 2 * progress);
}

function randomBetween(random: SeededRandom, minimumValue: number, maximumValue: number): number {
  return minimumValue + random.nextFloat() * (maximumValue - minimumValue);
}

function randomBetweenInteger(random: SeededRandom, minimumValue: number, maximumValue: number): number {
  return minimumValue + random.nextInt(maximumValue - minimumValue + 1);
}

function clampInteger(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

function requiredCell(cells: readonly MutableHex[], index: number): MutableHex {
  const cell = cells[index];
  if (cell === undefined) {
    throw new Error(`World hex index is out of bounds: ${index}.`);
  }
  return cell;
}

function requiredNumber(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Numeric layer index is out of bounds: ${index}.`);
  }
  return value;
}

function requiredBoolean(values: readonly boolean[], index: number): boolean {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Boolean layer index is out of bounds: ${index}.`);
  }
  return value;
}

function shuffle<T>(values: readonly T[], random: SeededRandom): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = random.nextInt(index + 1);
    const current = result[index];
    result[index] = result[targetIndex] as T;
    result[targetIndex] = current as T;
  }
  return result;
}

class HexGrid {
  readonly size: number;
  private readonly neighbors: readonly (readonly number[])[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.size = width * height;
    this.neighbors = Array.from({ length: this.size }, (_, index) => this.createNeighbors(index));
  }

  indexOf(q: number, r: number): number {
    if (q < 0 || r < 0 || q >= this.width || r >= this.height) {
      throw new Error(`Hex coordinate is outside the world: ${q}:${r}.`);
    }
    return r * this.width + q;
  }

  coordinateAt(index: number): { readonly q: number; readonly r: number } {
    if (index < 0 || index >= this.size) {
      throw new Error(`Hex index is outside the world: ${index}.`);
    }
    return { q: index % this.width, r: Math.floor(index / this.width) };
  }

  neighborsOf(index: number): readonly number[] {
    const neighbors = this.neighbors[index];
    if (neighbors === undefined) {
      throw new Error(`Hex index is outside the world: ${index}.`);
    }
    return neighbors;
  }

  isBoundary(index: number): boolean {
    const { q, r } = this.coordinateAt(index);
    return q === 0 || r === 0 || q === this.width - 1 || r === this.height - 1;
  }

  isInterior(index: number, inset: number): boolean {
    const { q, r } = this.coordinateAt(index);
    return q >= inset && r >= inset && q < this.width - inset && r < this.height - inset;
  }

  distancesFromBoundary(): readonly number[] {
    const distances = Array.from({ length: this.size }, () => -1);
    const queue = Array.from({ length: this.size }, (_, index) => index).filter((index) =>
      this.isBoundary(index),
    );
    for (const index of queue) {
      distances[index] = 0;
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        throw new Error('Boundary-distance queue unexpectedly ended.');
      }
      const currentDistance = requiredNumber(distances, current);
      for (const neighbor of this.neighborsOf(current)) {
        if (requiredNumber(distances, neighbor) === -1) {
          distances[neighbor] = currentDistance + 1;
          queue.push(neighbor);
        }
      }
    }

    if (distances.some((distance) => distance < 0)) {
      throw new Error('Boundary distance did not reach every hex.');
    }
    return distances;
  }

  distanceBetween(leftIndex: number, rightIndex: number): number {
    const left = this.coordinateAt(leftIndex);
    const right = this.coordinateAt(rightIndex);
    const leftCubeX = left.q;
    const leftCubeZ = left.r - (left.q - (left.q & 1)) / 2;
    const leftCubeY = -leftCubeX - leftCubeZ;
    const rightCubeX = right.q;
    const rightCubeZ = right.r - (right.q - (right.q & 1)) / 2;
    const rightCubeY = -rightCubeX - rightCubeZ;
    return Math.max(
      Math.abs(leftCubeX - rightCubeX),
      Math.abs(leftCubeY - rightCubeY),
      Math.abs(leftCubeZ - rightCubeZ),
    );
  }

  indexesWithinRadius(center: number, radius: number): readonly number[] {
    const result: number[] = [];
    const distances = new Map<number, number>([[center, 0]]);
    const queue = [center];
    let cursor = 0;

    while (cursor < queue.length) {
      const current = queue[cursor++];
      if (current === undefined) {
        throw new Error('Hex radius queue unexpectedly ended.');
      }
      const distance = distances.get(current);
      if (distance === undefined) {
        throw new Error(`Hex radius distance is missing for ${current}.`);
      }
      result.push(current);
      if (distance === radius) {
        continue;
      }
      for (const neighbor of this.neighborsOf(current)) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, distance + 1);
          queue.push(neighbor);
        }
      }
    }
    return result;
  }

  private createNeighbors(index: number): readonly number[] {
    const { q, r } = this.coordinateAt(index);
    const offsets: ReadonlyArray<readonly [number, number]> =
      q % 2 === 0
        ? [
            [0, -1],
            [1, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
            [-1, -1],
          ]
        : [
            [0, -1],
            [1, 0],
            [1, 1],
            [0, 1],
            [-1, 1],
            [-1, 0],
          ];
    return offsets.flatMap(([deltaQ, deltaR]) => {
      const neighborQ = q + deltaQ;
      const neighborR = r + deltaR;
      return neighborQ < 0 || neighborR < 0 || neighborQ >= this.width || neighborR >= this.height
        ? []
        : [neighborR * this.width + neighborQ];
    });
  }
}

class MinPriorityQueue {
  private readonly values: Array<{ readonly index: number; readonly elevation: number }> = [];

  isEmpty(): boolean {
    return this.values.length === 0;
  }

  push(value: { readonly index: number; readonly elevation: number }): void {
    this.values.push(value);
    let childIndex = this.values.length - 1;
    while (childIndex > 0) {
      const parentIndex = Math.floor((childIndex - 1) / 2);
      const child = requiredHeapEntry(this.values, childIndex);
      const parent = requiredHeapEntry(this.values, parentIndex);
      if (compareQueueEntries(child, parent) >= 0) {
        break;
      }
      this.values[childIndex] = parent;
      this.values[parentIndex] = child;
      childIndex = parentIndex;
    }
  }

  pop(): { readonly index: number; readonly elevation: number } | undefined {
    const root = this.values[0];
    const final = this.values.pop();
    if (root === undefined || final === undefined) {
      return undefined;
    }
    if (this.values.length === 0) {
      return root;
    }
    this.values[0] = final;
    let parentIndex = 0;
    while (true) {
      const leftIndex = parentIndex * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallest = parentIndex;
      const parent = requiredHeapEntry(this.values, parentIndex);
      const left = this.values[leftIndex];
      const right = this.values[rightIndex];
      if (left !== undefined && compareQueueEntries(left, parent) < 0) {
        smallest = leftIndex;
      }
      const candidate = requiredHeapEntry(this.values, smallest);
      if (right !== undefined && compareQueueEntries(right, candidate) < 0) {
        smallest = rightIndex;
      }
      if (smallest === parentIndex) {
        return root;
      }
      const child = requiredHeapEntry(this.values, smallest);
      this.values[parentIndex] = child;
      this.values[smallest] = parent;
      parentIndex = smallest;
    }
  }
}

function requiredHeapEntry(
  values: readonly { readonly index: number; readonly elevation: number }[],
  index: number,
): { readonly index: number; readonly elevation: number } {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Priority queue index is out of bounds: ${index}.`);
  }
  return value;
}

function compareQueueEntries(
  left: { readonly index: number; readonly elevation: number },
  right: { readonly index: number; readonly elevation: number },
): number {
  return left.elevation - right.elevation || left.index - right.index;
}

class SeededRandom {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed);
  }

  nextFloat(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  nextInt(exclusiveMaximum: number): number {
    return Math.floor(this.nextFloat() * exclusiveMaximum);
  }
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
