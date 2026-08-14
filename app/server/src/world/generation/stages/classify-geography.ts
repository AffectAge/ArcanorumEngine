import type { WorldLandmass, WorldWaterBody } from '@arcanorum/shared';
import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { compareComponentsBySize, findComponents, floodWaterFromBoundary } from '../geometry/topology.js';
import type { MutableHex, TerrainRoleIndex } from '../types.js';
import { requiredCell, requiredNumber } from '../utils.js';

export function assignLandmasses(
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

export function assignWaterBodies(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  terrainIds: TerrainRoleIndex,
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

export function assignCoastalWater(
  cells: readonly MutableHex[],
  grid: HexGrid,
  coastalWaterWidth: number,
  terrainIds: TerrainRoleIndex,
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
