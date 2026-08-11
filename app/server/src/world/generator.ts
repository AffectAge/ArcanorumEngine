import { createNoise2D } from 'simplex-noise';
import type {
  TerrainCatalog,
  WorldHex,
  WorldLandmass,
  WorldRiverEdge,
  WorldWaterBody,
} from '@arcanorum/shared';
import type { WorldGenerationConfig } from '../config.js';

type TerrainRole = 'ocean' | 'coastal_water' | 'sea' | 'lake' | 'land';
type WaterKind = 'ocean' | 'sea' | 'lake';

type HexCoordinate = {
  readonly q: number;
  readonly r: number;
};

type MutableHex = HexCoordinate & {
  elevation: number;
  isLand: boolean;
  terrainId: string;
  landmassId: string | undefined;
  waterBodyId: string | undefined;
};

type HexComponent = {
  readonly cells: readonly MutableHex[];
  readonly firstIndex: number;
  readonly touchesBoundary: boolean;
};

export type GeneratedWorld = {
  readonly hexes: readonly WorldHex[];
  readonly rivers: readonly WorldRiverEdge[];
  readonly landmasses: readonly WorldLandmass[];
  readonly waterBodies: readonly WorldWaterBody[];
};

export function generateWorld(
  seed: string,
  configuration: WorldGenerationConfig,
  terrainCatalog: TerrainCatalog,
): GeneratedWorld {
  const terrainIds = createTerrainRoleIndex(terrainCatalog);
  const random = new SeededRandom(seed);
  const noise = createNoise2D(() => random.nextFloat());
  const cells = createBaseCells(configuration, noise, terrainIds.land);
  const continentRadius = calculateContinentRadius(configuration);
  const continentSeparation = Math.max(
    configuration.continentMinimumSeparation,
    Math.ceil(continentRadius * 2 + 3),
  );
  const continentCenters = selectCenters(
    cells,
    configuration.continentCount,
    continentSeparation,
    Math.max(2, continentRadius / 2),
    random,
  );

  for (const center of continentCenters) {
    raiseLandmass(cells, center, continentRadius, configuration.seaLevel, noise);
  }

  addIslands(cells, configuration, random, noise);
  carveInternalWater(cells, configuration.seaCount, configuration.seaRadius, configuration, random);
  carveInternalWater(cells, configuration.lakeCount, configuration.lakeRadius, configuration, random);

  const landComponents = findComponents(cells, (cell) => cell.isLand);
  const landmasses = assignLandmasses(landComponents, configuration, cells);
  const waterBodies = assignWaterBodies(cells, configuration, terrainIds);
  assignCoastalWater(cells, configuration.coastalWaterWidth, terrainIds);
  const rivers = generateRivers(cells, configuration, random);

  return {
    hexes: cells.map((cell) => ({
      q: cell.q,
      r: cell.r,
      terrainId: cell.terrainId,
      elevation: cell.elevation,
      ...(cell.landmassId === undefined ? {} : { landmassId: cell.landmassId }),
      ...(cell.waterBodyId === undefined ? {} : { waterBodyId: cell.waterBodyId }),
    })),
    rivers,
    landmasses,
    waterBodies,
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
  configuration: WorldGenerationConfig,
  noise: (x: number, y: number) => number,
  landTerrainId: string,
): MutableHex[] {
  const cells: MutableHex[] = [];

  for (let r = 0; r < configuration.height; r += 1) {
    for (let q = 0; q < configuration.width; q += 1) {
      const broadNoise = noise(q / 38, r / 38) * 52;
      const detailNoise = noise(q / 11 + 71, r / 11 - 29) * 20;
      cells.push({
        q,
        r,
        elevation: clampInteger(configuration.seaLevel - 150 + broadNoise + detailNoise),
        isLand: false,
        terrainId: landTerrainId,
        landmassId: undefined,
        waterBodyId: undefined,
      });
    }
  }

  return cells;
}

function calculateContinentRadius(configuration: WorldGenerationConfig): number {
  const requestedArea = configuration.width * configuration.height * configuration.continentCoverage;
  return Math.max(4, Math.sqrt(requestedArea / (configuration.continentCount * Math.PI)) * 1.18);
}

function selectCenters(
  cells: readonly MutableHex[],
  count: number,
  minimumSeparation: number,
  edgeInset: number,
  random: SeededRandom,
): readonly HexCoordinate[] {
  const maxQ = Math.max(...cells.map((cell) => cell.q));
  const maxR = Math.max(...cells.map((cell) => cell.r));
  const candidates = shuffle(
    cells.filter(
      (cell) =>
        cell.q >= edgeInset &&
        cell.q <= maxQ - edgeInset &&
        cell.r >= edgeInset &&
        cell.r <= maxR - edgeInset,
    ),
    random,
  );
  for (const firstCenter of candidates) {
    const centers: HexCoordinate[] = [{ q: firstCenter.q, r: firstCenter.r }];

    while (centers.length < count) {
      let bestCandidate: MutableHex | undefined;
      let bestMinimumDistance = -1;

      for (const candidate of candidates) {
        const minimumDistance = Math.min(...centers.map((center) => hexDistance(center, candidate)));
        if (minimumDistance >= minimumSeparation && minimumDistance > bestMinimumDistance) {
          bestCandidate = candidate;
          bestMinimumDistance = minimumDistance;
        }
      }

      if (bestCandidate === undefined) {
        break;
      }

      centers.push({ q: bestCandidate.q, r: bestCandidate.r });
    }

    if (centers.length === count) {
      return centers;
    }
  }

  throw new Error(
    `World generation cannot place ${count} continents with separation ${minimumSeparation} on this map.`,
  );
}

function raiseLandmass(
  cells: readonly MutableHex[],
  center: HexCoordinate,
  radius: number,
  seaLevel: number,
  noise: (x: number, y: number) => number,
): void {
  for (const cell of cells) {
    const distance = hexDistance(center, cell);
    if (distance > radius) {
      continue;
    }

    const falloff = 1 - distance / radius;
    const variation = noise(cell.q / 7 + 213, cell.r / 7 - 89) * 65;
    // Keep generated land connected before explicit sea and lake carving. Without this
    // margin, negative noise near a landmass edge creates accidental water pockets.
    const elevation = seaLevel + 80 + falloff * 356 + variation;

    if (elevation > cell.elevation) {
      cell.elevation = clampInteger(elevation);
      cell.isLand = cell.elevation > seaLevel;
    }
  }
}

function addIslands(
  cells: readonly MutableHex[],
  configuration: WorldGenerationConfig,
  random: SeededRandom,
  noise: (x: number, y: number) => number,
): void {
  for (let islandIndex = 0; islandIndex < configuration.islandCount; islandIndex += 1) {
    const radius = 1 + random.nextInt(configuration.islandMaximumRadius);
    const center = findWaterCircleCenter(cells, radius + 1, random);
    raiseLandmass(cells, center, radius, configuration.seaLevel, noise);
  }
}

function carveInternalWater(
  cells: readonly MutableHex[],
  count: number,
  radius: number,
  configuration: WorldGenerationConfig,
  random: SeededRandom,
): void {
  for (let index = 0; index < count; index += 1) {
    const center = findLandCircleCenter(cells, radius + 2, random);

    for (const cell of cells) {
      if (hexDistance(center, cell) <= radius) {
        cell.isLand = false;
        cell.elevation = Math.min(cell.elevation, configuration.seaLevel - 120);
        cell.landmassId = undefined;
      }
    }
  }
}

function findWaterCircleCenter(
  cells: readonly MutableHex[],
  radius: number,
  random: SeededRandom,
): HexCoordinate {
  for (const candidate of shuffle(cells, random)) {
    if (cells.every((cell) => hexDistance(candidate, cell) > radius || !cell.isLand)) {
      return candidate;
    }
  }

  throw new Error(`World generation cannot place an island with radius ${radius - 1}.`);
}

function findLandCircleCenter(
  cells: readonly MutableHex[],
  radius: number,
  random: SeededRandom,
): HexCoordinate {
  for (const candidate of shuffle(cells, random)) {
    if (
      isInterior(candidate, cells, radius) &&
      cells.every((cell) => hexDistance(candidate, cell) > radius || cell.isLand)
    ) {
      return candidate;
    }
  }

  throw new Error(`World generation cannot place inland water with radius ${radius - 2}.`);
}

function assignLandmasses(
  components: readonly HexComponent[],
  configuration: WorldGenerationConfig,
  cells: readonly MutableHex[],
): readonly WorldLandmass[] {
  const ordered = [...components].sort(compareComponentsBySize);
  const minimumContinentHexes = Math.floor(
    (configuration.width * configuration.height * configuration.continentCoverage) /
      configuration.continentCount /
      3,
  );
  const continents = ordered.slice(0, configuration.continentCount);

  if (
    continents.length !== configuration.continentCount ||
    continents.some((component) => component.cells.length < minimumContinentHexes)
  ) {
    throw new Error(`World generation produced fewer than ${configuration.continentCount} valid continents.`);
  }

  const continentComponents = new Set(continents);
  let continentIndex = 1;
  let islandIndex = 1;
  const records: WorldLandmass[] = [];

  for (const component of ordered) {
    const kind = continentComponents.has(component) ? 'continent' : 'island';
    const id =
      kind === 'continent' ? `landmass.continent.${continentIndex++}` : `landmass.island.${islandIndex++}`;

    for (const cell of component.cells) {
      cell.landmassId = id;
    }

    records.push({ id, kind, hexCount: component.cells.length });
  }

  if (records.length === 0 || cells.every((cell) => !cell.isLand)) {
    throw new Error('World generation produced no land.');
  }

  return records;
}

function assignWaterBodies(
  cells: readonly MutableHex[],
  configuration: WorldGenerationConfig,
  terrainIds: Readonly<Record<TerrainRole, string>>,
): readonly WorldWaterBody[] {
  const components = [...findComponents(cells, (cell) => !cell.isLand)].sort(compareComponentsByFirstCell);
  const minimumSeaHexes = Math.floor(Math.PI * configuration.seaRadius * configuration.seaRadius * 0.7);
  const records: WorldWaterBody[] = [];
  let oceanIndex = 1;
  let seaIndex = 1;
  let lakeIndex = 1;

  for (const component of components) {
    const kind: WaterKind = component.touchesBoundary
      ? 'ocean'
      : component.cells.length >= minimumSeaHexes
        ? 'sea'
        : 'lake';
    const id =
      kind === 'ocean'
        ? `water.ocean.${oceanIndex++}`
        : kind === 'sea'
          ? `water.sea.${seaIndex++}`
          : `water.lake.${lakeIndex++}`;

    for (const cell of component.cells) {
      cell.waterBodyId = id;
      cell.terrainId = terrainIds[kind];
    }

    records.push({ id, kind, hexCount: component.cells.length });
  }

  if (records.filter((record) => record.kind === 'sea').length !== configuration.seaCount) {
    throw new Error(
      `World generation did not produce ${configuration.seaCount} internal seas: ${records
        .map((record) => `${record.kind}:${record.hexCount}`)
        .join(', ')}.`,
    );
  }

  if (records.filter((record) => record.kind === 'lake').length !== configuration.lakeCount) {
    const actualLakeCount = records.filter((record) => record.kind === 'lake').length;
    throw new Error(
      `World generation did not produce ${configuration.lakeCount} lakes; produced ${actualLakeCount}.`,
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
  coastalWaterWidth: number,
  terrainIds: Readonly<Record<TerrainRole, string>>,
): void {
  const coastalCells = new Set<number>();

  for (let step = 0; step < coastalWaterWidth; step += 1) {
    const sourceCells =
      step === 0
        ? cells.filter((cell) => !cell.isLand && neighbors(cell, cells).some((neighbor) => neighbor.isLand))
        : cells.filter((cell) => coastalCells.has(cellIndex(cell, cells)));

    for (const source of sourceCells) {
      coastalCells.add(cellIndex(source, cells));
      for (const neighbor of neighbors(source, cells)) {
        if (!neighbor.isLand && isOceanOrSea(neighbor)) {
          coastalCells.add(cellIndex(neighbor, cells));
        }
      }
    }
  }

  for (const cell of cells) {
    if (coastalCells.has(cellIndex(cell, cells)) && isOceanOrSea(cell)) {
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

function generateRivers(
  cells: readonly MutableHex[],
  configuration: WorldGenerationConfig,
  random: SeededRandom,
): readonly WorldRiverEdge[] {
  if (configuration.riverCount === 0) {
    return [];
  }

  const waterDistances = calculateWaterDistances(cells);
  const candidates = shuffle(
    cells.filter(
      (cell) =>
        cell.isLand &&
        cell.elevation >= configuration.riverMinimumSourceElevation &&
        distanceAt(waterDistances, cellIndex(cell, cells)) >= configuration.riverMinimumSourceDistance,
    ),
    random,
  );
  const edges = new Map<string, WorldRiverEdge>();
  let created = 0;

  for (const source of candidates) {
    if (created === configuration.riverCount) {
      break;
    }

    const path = traceRiver(source, cells, waterDistances);
    if (path.length === 0) {
      continue;
    }

    for (const [from, to] of path) {
      const key = `${from.q}:${from.r}:${to.q}:${to.r}`;
      const existing = edges.get(key);
      edges.set(
        key,
        existing === undefined
          ? { fromQ: from.q, fromR: from.r, toQ: to.q, toR: to.r, flow: 1 }
          : { ...existing, flow: existing.flow + 1 },
      );
    }
    created += 1;
  }

  if (created !== configuration.riverCount) {
    throw new Error(`World generation could only create ${created} of ${configuration.riverCount} rivers.`);
  }

  return [...edges.values()].sort(
    (left, right) =>
      left.fromR - right.fromR || left.fromQ - right.fromQ || left.toR - right.toR || left.toQ - right.toQ,
  );
}

function traceRiver(
  source: MutableHex,
  cells: readonly MutableHex[],
  waterDistances: readonly number[],
): ReadonlyArray<readonly [MutableHex, MutableHex]> {
  const path: Array<readonly [MutableHex, MutableHex]> = [];
  const visited = new Set<number>();
  let current = source;

  while (current.isLand) {
    const currentIndex = cellIndex(current, cells);
    if (visited.has(currentIndex)) {
      return [];
    }
    visited.add(currentIndex);

    const currentDistance = distanceAt(waterDistances, currentIndex);
    const next = [...neighbors(current, cells)]
      .filter((candidate) => distanceAt(waterDistances, cellIndex(candidate, cells)) < currentDistance)
      .sort(
        (left, right) =>
          distanceAt(waterDistances, cellIndex(left, cells)) -
            distanceAt(waterDistances, cellIndex(right, cells)) ||
          left.elevation - right.elevation ||
          cellIndex(left, cells) - cellIndex(right, cells),
      )[0];

    if (next === undefined) {
      return [];
    }

    path.push([current, next]);
    current = next;
  }

  return path;
}

function calculateWaterDistances(cells: readonly MutableHex[]): number[] {
  const distances = cells.map(() => Number.POSITIVE_INFINITY);
  const queue = cells.filter((cell) => !cell.isLand);
  let cursor = 0;

  for (const cell of queue) {
    distances[cellIndex(cell, cells)] = 0;
  }

  while (cursor < queue.length) {
    const current = queue[cursor++];
    if (current === undefined) {
      throw new Error('Water distance queue unexpectedly ended.');
    }
    const nextDistance = distanceAt(distances, cellIndex(current, cells)) + 1;

    for (const neighbor of neighbors(current, cells)) {
      const neighborIndex = cellIndex(neighbor, cells);
      if (nextDistance < distanceAt(distances, neighborIndex)) {
        distances[neighborIndex] = nextDistance;
        queue.push(neighbor);
      }
    }
  }

  return distances;
}

function findComponents(
  cells: readonly MutableHex[],
  include: (cell: MutableHex) => boolean,
): readonly HexComponent[] {
  const visited = new Set<number>();
  const components: HexComponent[] = [];

  for (const start of cells) {
    const startIndex = cellIndex(start, cells);
    if (!include(start) || visited.has(startIndex)) {
      continue;
    }

    const queue = [start];
    const componentCells: MutableHex[] = [];
    visited.add(startIndex);
    let cursor = 0;
    let touchesBoundary = false;

    while (cursor < queue.length) {
      const current = queue[cursor++];
      if (current === undefined) {
        throw new Error('Component queue unexpectedly ended.');
      }
      componentCells.push(current);
      touchesBoundary ||= isBoundary(current, cells);

      for (const neighbor of neighbors(current, cells)) {
        const neighborIndex = cellIndex(neighbor, cells);
        if (include(neighbor) && !visited.has(neighborIndex)) {
          visited.add(neighborIndex);
          queue.push(neighbor);
        }
      }
    }

    components.push({ cells: componentCells, firstIndex: startIndex, touchesBoundary });
  }

  return components;
}

function neighbors(cell: HexCoordinate, cells: readonly MutableHex[]): readonly MutableHex[] {
  const width = mapWidth(cells);
  const height = mapHeight(cells);
  const offsets: ReadonlyArray<readonly [number, number]> =
    cell.q % 2 === 0
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
    const q = cell.q + deltaQ;
    const r = cell.r + deltaR;
    if (q < 0 || r < 0 || q >= width || r >= height) {
      return [];
    }
    const candidate = cells[r * width + q];
    return candidate === undefined ? [] : [candidate];
  });
}

function mapWidth(cells: readonly MutableHex[]): number {
  const lastCell = cells.at(-1);
  if (lastCell === undefined) {
    throw new Error('World contains no hexes.');
  }
  return lastCell.q + 1;
}

function mapHeight(cells: readonly MutableHex[]): number {
  const lastCell = cells.at(-1);
  if (lastCell === undefined) {
    throw new Error('World contains no hexes.');
  }
  return lastCell.r + 1;
}

function cellIndex(cell: HexCoordinate, cells: readonly MutableHex[]): number {
  return cell.r * mapWidth(cells) + cell.q;
}

function isBoundary(cell: HexCoordinate, cells: readonly MutableHex[]): boolean {
  return cell.q === 0 || cell.r === 0 || cell.q === mapWidth(cells) - 1 || cell.r === mapHeight(cells) - 1;
}

function isInterior(cell: HexCoordinate, cells: readonly MutableHex[], inset: number): boolean {
  return (
    cell.q >= inset &&
    cell.r >= inset &&
    cell.q <= mapWidth(cells) - inset - 1 &&
    cell.r <= mapHeight(cells) - inset - 1
  );
}

function hexDistance(left: HexCoordinate, right: HexCoordinate): number {
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

function compareComponentsBySize(left: HexComponent, right: HexComponent): number {
  return right.cells.length - left.cells.length || left.firstIndex - right.firstIndex;
}

function compareComponentsByFirstCell(left: HexComponent, right: HexComponent): number {
  return left.firstIndex - right.firstIndex;
}

function clampInteger(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

function distanceAt(distances: readonly number[], index: number): number {
  const distance = distances[index];
  if (distance === undefined) {
    throw new Error(`Missing water distance for hex index ${index}.`);
  }
  return distance;
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
