import { createHash } from 'node:crypto';
import { createNoise2D } from 'simplex-noise';
import type {
  BiomeType,
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
  biomeId: string | undefined;
  temperature: number;
  rainfall: number;
  flowAccumulation: number;
  plannedWater: boolean;
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

  appendStageDiagnostic(diagnostics, 'stage.base_grid', cells);
  generateLandforms(cells, grid, configuration, random, noise);
  appendStageDiagnostic(diagnostics, 'stage.landforms', cells);

  const landmasses = assignLandmasses(cells, grid, configuration);
  const waterBodies = assignWaterBodies(cells, grid, configuration, terrainIds);
  assignCoastalWater(cells, grid, configuration.coastalWaterWidth, terrainIds);
  appendStageDiagnostic(diagnostics, 'stage.water_bodies', cells);

  calculateClimate(cells, grid, configuration, noise);
  assignBiomes(cells, terrainCatalog.biomeTypes);
  appendStageDiagnostic(diagnostics, 'stage.climate_and_biomes', cells);

  const hydrology = calculateHydrology(cells, grid, configuration);
  appendStageDiagnostic(diagnostics, 'stage.hydrology', cells);

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
    ...(cell.biomeId === undefined ? {} : { biomeId: cell.biomeId }),
    ...(cell.landmassId === undefined ? {} : { landmassId: cell.landmassId }),
    ...(cell.waterBodyId === undefined ? {} : { waterBodyId: cell.waterBodyId }),
  };
}

function generateLandforms(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  const continentRadius = calculateContinentRadius(configuration);
  const continentSeparation = Math.max(
    configuration.continentMinimumSeparation,
    Math.ceil(continentRadius * 2.28 + 4),
  );
  const centers = selectContinentCenters(
    grid,
    configuration.continentCount,
    continentSeparation,
    Math.ceil(continentRadius / 2),
    random,
  );

  for (const centerIndex of centers) {
    raiseContinent(cells, grid, centerIndex, continentRadius, configuration, random, noise);
  }

  addIslands(cells, grid, configuration, random, noise);
  fillAccidentalInlandWater(cells, grid, configuration.seaLevel);
  const plannedWaterIndexes = new Set<number>();
  carveInternalWater(
    cells,
    grid,
    configuration.seaCount,
    configuration.seaRadius,
    configuration,
    random,
    noise,
    plannedWaterIndexes,
  );
  carveInternalWater(
    cells,
    grid,
    configuration.lakeCount,
    configuration.lakeRadius,
    configuration,
    random,
    noise,
    plannedWaterIndexes,
  );
  fillUnplannedInlandWater(cells, grid, configuration.seaLevel, plannedWaterIndexes);
  addMountainRanges(cells, grid, configuration, random, noise);
}

function fillAccidentalInlandWater(cells: readonly MutableHex[], grid: HexGrid, seaLevel: number): void {
  const enclosedWater = findComponents(cells, grid, (cell) => !cell.isLand).filter(
    (component) => !component.touchesBoundary,
  );

  for (const component of enclosedWater) {
    for (const index of component.indexes) {
      const cell = requiredCell(cells, index);
      cell.isLand = true;
      cell.elevation = Math.max(cell.elevation, seaLevel + 24);
    }
  }
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
      biomeId: undefined,
      temperature: 0,
      rainfall: 0,
      flowAccumulation: 0,
      plannedWater: false,
      landmassId: undefined,
      waterBodyId: undefined,
    };
  });
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

function raiseContinent(
  cells: readonly MutableHex[],
  grid: HexGrid,
  centerIndex: number,
  radius: number,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  const center = grid.coordinateAt(centerIndex);
  const angle = random.nextFloat() * Math.PI * 2;
  const aspectRatio = 0.88 + random.nextFloat() * 0.24;
  const majorRadius = radius * aspectRatio;
  const minorRadius = radius / aspectRatio;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  for (let index = 0; index < cells.length; index += 1) {
    const cell = requiredCell(cells, index);
    const offsetX = cell.q - center.q;
    const offsetY = cell.r + (cell.q & 1) * 0.5 - (center.r + (center.q & 1) * 0.5);
    const rotatedX = offsetX * cosine + offsetY * sine;
    const rotatedY = -offsetX * sine + offsetY * cosine;
    const normalizedDistance = Math.hypot(rotatedX / majorRadius, rotatedY / minorRadius);
    const coastVariation = noise(
      cell.q / configuration.continentCoastNoiseScale + 173,
      cell.r / configuration.continentCoastNoiseScale - 241,
    );
    const coastBoundary = 1 + Math.min(0, coastVariation) * configuration.continentCoastRoughness;

    if (normalizedDistance > coastBoundary) {
      continue;
    }

    const coastDistance = Math.max(0, 1 - normalizedDistance / coastBoundary);
    const continentalVariation = noise(cell.q / 8 + 311, cell.r / 8 - 127) * 46;
    const elevation =
      configuration.seaLevel + 42 + coastDistance * 310 + continentalVariation * (0.4 + coastDistance * 0.6);

    if (elevation > cell.elevation) {
      cell.elevation = clampInteger(elevation);
      cell.isLand = cell.elevation > configuration.seaLevel;
    }
  }
}

function addIslands(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  for (let islandIndex = 0; islandIndex < configuration.islandCount; islandIndex += 1) {
    const radius = 1 + random.nextInt(configuration.islandMaximumRadius);
    const center = findCircularAreaCenter(cells, grid, radius + 1, false, random);
    raiseContinent(cells, grid, center, radius, configuration, random, noise);
  }
}

function carveInternalWater(
  cells: readonly MutableHex[],
  grid: HexGrid,
  count: number,
  radius: number,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
  noise: (x: number, y: number) => number,
  plannedWaterIndexes: Set<number>,
): void {
  for (let basinIndex = 0; basinIndex < count; basinIndex += 1) {
    const center = findCircularAreaCenter(cells, grid, radius + 1, true, random);
    const basinIndexes = new Set<number>();

    for (const index of grid.indexesWithinRadius(center, radius + 1)) {
      const cell = requiredCell(cells, index);
      const irregularRadius = radius * (1 + noise(cell.q / 5 + 97, cell.r / 5 - 53) * 0.18);
      const distance = grid.distanceBetween(center, index);
      const isConnectedToBasin =
        distance === 0 || grid.neighborsOf(index).some((neighbor) => basinIndexes.has(neighbor));
      if (distance <= irregularRadius && isConnectedToBasin) {
        basinIndexes.add(index);
      }
    }

    if (!basinIndexes.has(center)) {
      throw new Error('World generation did not carve its selected inland water basin.');
    }

    for (const index of basinIndexes) {
      const cell = requiredCell(cells, index);
      cell.isLand = false;
      cell.elevation = clampInteger(configuration.seaLevel - 110);
      cell.biomeId = undefined;
      cell.landmassId = undefined;
      cell.plannedWater = true;
      plannedWaterIndexes.add(index);
    }
  }
}

function fillUnplannedInlandWater(
  cells: readonly MutableHex[],
  grid: HexGrid,
  seaLevel: number,
  plannedWaterIndexes: ReadonlySet<number>,
): void {
  const unplannedWater = findComponents(cells, grid, (cell) => !cell.isLand).filter(
    (component) =>
      !component.touchesBoundary &&
      !component.indexes.some((index) => plannedWaterIndexes.has(index)),
  );

  for (const component of unplannedWater) {
    for (const index of component.indexes) {
      const cell = requiredCell(cells, index);
      cell.isLand = true;
      cell.elevation = Math.max(cell.elevation, seaLevel + 24);
    }
  }
}

function findCircularAreaCenter(
  cells: readonly MutableHex[],
  grid: HexGrid,
  radius: number,
  requiredLand: boolean,
  random: SeededRandom,
): number {
  const candidates = shuffle(
    Array.from({ length: grid.size }, (_, index) => index).filter((index) => grid.isInterior(index, radius)),
    random,
  );

  for (const candidate of candidates) {
    const area = grid.indexesWithinRadius(candidate, radius);
    if (area.every((index) => requiredCell(cells, index).isLand === requiredLand)) {
      return candidate;
    }
  }

  const description = requiredLand ? 'inland water' : 'island';
  throw new Error(`World generation cannot place ${description} with radius ${radius - 1}.`);
}

function addMountainRanges(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  for (let rangeIndex = 0; rangeIndex < configuration.mountainRangeCount; rangeIndex += 1) {
    const startIndex = findMountainRangeStart(cells, grid, random);
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

function findMountainRangeStart(cells: readonly MutableHex[], grid: HexGrid, random: SeededRandom): number {
  const candidates = shuffle(
    Array.from({ length: grid.size }, (_, index) => index).filter(
      (index) =>
        grid.isInterior(index, 3) &&
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
    throw new Error(`World generation produced fewer than ${configuration.continentCount} valid continents.`);
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
): readonly WorldWaterBody[] {
  const components = [...findComponents(cells, grid, (cell) => !cell.isLand)].sort(
    compareComponentsByFirstCell,
  );
  const minimumSeaHexes = Math.floor(Math.PI * configuration.seaRadius * configuration.seaRadius * 0.7);
  const records: WorldWaterBody[] = [];
  let oceanIndex = 1;
  let seaIndex = 1;
  let lakeIndex = 1;

  for (const component of components) {
    const kind: WaterKind = component.touchesBoundary
      ? 'ocean'
      : component.indexes.length >= minimumSeaHexes
        ? 'sea'
        : 'lake';
    const id =
      kind === 'ocean'
        ? `water.ocean.${oceanIndex++}`
        : kind === 'sea'
          ? `water.sea.${seaIndex++}`
          : `water.lake.${lakeIndex++}`;

    for (const index of component.indexes) {
      const cell = requiredCell(cells, index);
      cell.waterBodyId = id;
      cell.terrainId = terrainIds[kind];
    }
    records.push({ id, kind, hexCount: component.indexes.length });
  }

  const seaCount = records.filter((record) => record.kind === 'sea').length;
  const lakeCount = records.filter((record) => record.kind === 'lake').length;
  if (seaCount !== configuration.seaCount || lakeCount !== configuration.lakeCount) {
    const componentSummary = components
      .map(
        (component) =>
          `${component.indexes.length}:${component.touchesBoundary ? 'boundary' : 'inland'}:${component.indexes.some((index) => requiredCell(cells, index).plannedWater) ? 'planned' : 'unplanned'}`,
      )
      .join(', ');
    throw new Error(
      `World generation expected ${configuration.seaCount} seas and ${configuration.lakeCount} lakes; produced ${seaCount} seas and ${lakeCount} lakes. Components: ${componentSummary}.`,
    );
  }

  for (const cell of cells) {
    if (cell.isLand) {
      cell.terrainId = terrainIds.land;
    }
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
        if (!cell.isLand && isOceanOrSea(cell)) {
          coastalIndexes.add(neighbor);
        }
      }
    }
  }

  for (const index of coastalIndexes) {
    const cell = requiredCell(cells, index);
    if (isOceanOrSea(cell)) {
      cell.terrainId = terrainIds.coastal_water;
    }
  }
}

function isOceanOrSea(cell: MutableHex): boolean {
  return (
    cell.waterBodyId?.startsWith('water.ocean.') === true ||
    cell.waterBodyId?.startsWith('water.sea.') === true
  );
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

function assignBiomes(cells: readonly MutableHex[], biomeTypes: readonly BiomeType[]): void {
  for (const cell of cells) {
    if (!cell.isLand) {
      cell.biomeId = undefined;
      continue;
    }

    const matches = biomeTypes.filter(
      (biome) =>
        isWithinRange(cell.temperature, biome.temperature.min, biome.temperature.max) &&
        isWithinRange(cell.rainfall, biome.rainfall.min, biome.rainfall.max),
    );
    if (matches.length !== 1) {
      throw new Error(
        `World climate at ${cell.q}:${cell.r} matched ${matches.length} biome rules (temperature ${cell.temperature}, rainfall ${cell.rainfall}).`,
      );
    }
    const biome = matches[0];
    if (biome === undefined) {
      throw new Error(`World climate at ${cell.q}:${cell.r} did not resolve a biome.`);
    }
    cell.biomeId = biome.id;
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
      `${cell.q},${cell.r},${cell.elevation},${cell.isLand ? 1 : 0},${cell.terrainId},${cell.biomeId ?? '-'},${cell.temperature},${cell.rainfall},${cell.flowAccumulation};`,
    );
  }
  diagnostics.push({ id, checksum: hash.digest('hex') });
}

function compareComponentsBySize(left: HexComponent, right: HexComponent): number {
  return right.indexes.length - left.indexes.length || left.firstIndex - right.firstIndex;
}

function compareComponentsByFirstCell(left: HexComponent, right: HexComponent): number {
  return left.firstIndex - right.firstIndex;
}

function mapPosition(coordinate: { readonly q: number; readonly r: number }): {
  readonly x: number;
  readonly y: number;
} {
  return { x: coordinate.q, y: coordinate.r + (coordinate.q & 1) * 0.5 };
}

function distanceToSegment(
  point: { readonly x: number; readonly y: number },
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): number {
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

function isWithinRange(value: number, minimumValue: number, maximumValue: number): boolean {
  return value >= minimumValue && value <= maximumValue;
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
