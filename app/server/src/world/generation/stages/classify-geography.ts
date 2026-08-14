import type { WorldLandmass, WorldWaterBody } from '@arcanorum/shared';
import type { HexGrid } from '../geometry/hex-grid.js';
import { floodWaterFromBoundary } from '../geometry/topology.js';
import type { MutableHex, TerrainRoleIndex } from '../types.js';
import { requiredCell, requiredNumber } from '../utils.js';

export function assignLandmasses(cells: readonly MutableHex[]): readonly WorldLandmass[] {
  const records: WorldLandmass[] = [];
  const ordinalsByKind = new Map<'continent' | 'island', Set<number>>([
    ['continent', new Set<number>()],
    ['island', new Set<number>()],
  ]);
  for (const cell of cells) {
    if (cell.isLand && cell.landmassKindHint !== undefined && cell.landmassOrdinal !== undefined) {
      ordinalsByKind.get(cell.landmassKindHint)?.add(cell.landmassOrdinal);
    }
  }
  for (const kind of ['continent', 'island'] as const) {
    const ordinals = [...(ordinalsByKind.get(kind) ?? [])].sort((left, right) => left - right);
    for (const ordinal of ordinals) {
      const indexes = cells.flatMap((cell, index) =>
        cell.isLand && cell.landmassKindHint === kind && cell.landmassOrdinal === ordinal ? [index] : [],
      );
      if (indexes.length === 0) {
        throw new Error(`${kind} ${ordinal} has no dry hexes after lake formation.`);
      }
      const id = `landmass.${kind}.${ordinal}`;
      for (const index of indexes) {
        requiredCell(cells, index).landmassId = id;
      }
      records.push({ id, kind, hexCount: indexes.length });
    }
  }
  const unclassified = cells.filter((cell) => cell.isLand && cell.landmassId === undefined);
  if (unclassified.length > 0) {
    throw new Error(`${unclassified.length} land hexes lack a stable topology identity.`);
  }
  return records;
}

export function assignWaterBodies(
  cells: readonly MutableHex[],
  grid: HexGrid,
  terrainIds: TerrainRoleIndex,
  edgeDistance: readonly number[],
): readonly WorldWaterBody[] {
  const boundaryConnectedWater = floodWaterFromBoundary(cells, grid);
  const waterIndexesById = new Map<string, number[]>();

  for (let index = 0; index < cells.length; index += 1) {
    const cell = requiredCell(cells, index);
    if (cell.isLand) {
      cell.terrainId = terrainIds.land;
      continue;
    }
    const kind = cell.plannedWaterKind ?? 'ocean';
    const id = cell.plannedWaterId ?? 'water.ocean.1';
    if (kind === 'lake' && boundaryConnectedWater.has(index)) {
      throw new Error(`Natural lake ${id} at ${cell.q}:${cell.r} connects to the outer ocean.`);
    }
    if ((kind === 'ocean' || kind === 'sea') && !boundaryConnectedWater.has(index)) {
      throw new Error(`Unclassified inland water at ${cell.q}:${cell.r} is not a lake.`);
    }
    cell.waterBodyId = id;
    cell.terrainId = terrainIds[kind];
    const indexes = waterIndexesById.get(id) ?? [];
    indexes.push(index);
    waterIndexesById.set(id, indexes);
  }

  const records: WorldWaterBody[] = [];
  const ocean = waterIndexesById.get('water.ocean.1');
  if (ocean === undefined || ocean.length === 0) {
    throw new Error('World generation did not retain an outer ocean.');
  }
  records.push({ id: 'water.ocean.1', kind: 'ocean', hexCount: ocean.length });
  for (const kind of ['sea', 'lake'] as const) {
    const ids = [...waterIndexesById.keys()]
      .filter((id) => id.startsWith(`water.${kind}.`))
      .sort(compareStableIds);
    for (const id of ids) {
      const indexes = waterIndexesById.get(id);
      if (indexes === undefined || indexes.length === 0) {
        throw new Error(`Water body ${id} has no classified hexes.`);
      }
      records.push({ id, kind, hexCount: indexes.length });
    }
  }
  for (let index = 0; index < grid.size; index += 1) {
    if (
      requiredNumber(edgeDistance, index) === 0 &&
      requiredCell(cells, index).waterBodyId !== 'water.ocean.1'
    ) {
      throw new Error('Every map-boundary hex must belong to the outer ocean.');
    }
  }
  return records;
}

export function assignCoastalWater(
  cells: readonly MutableHex[],
  grid: HexGrid,
  coastalWaterWidth: number,
  terrainIds: TerrainRoleIndex,
): void {
  let frontier = Array.from({ length: grid.size }, (_, index) => index).filter(
    (index) =>
      isSaltWater(requiredCell(cells, index)) &&
      grid.neighborsOf(index).some((neighbor) => requiredCell(cells, neighbor).isLand),
  );
  const coastalIndexes = new Set(frontier);
  for (let step = 1; step < coastalWaterWidth; step += 1) {
    const next: number[] = [];
    for (const source of frontier) {
      for (const neighbor of grid.neighborsOf(source)) {
        if (isSaltWater(requiredCell(cells, neighbor)) && !coastalIndexes.has(neighbor)) {
          coastalIndexes.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  for (const index of coastalIndexes) {
    requiredCell(cells, index).terrainId = terrainIds.coastal_water;
  }
}

function isSaltWater(cell: MutableHex): boolean {
  return cell.waterBodyId === 'water.ocean.1' || cell.waterBodyId?.startsWith('water.sea.') === true;
}

function compareStableIds(left: string, right: string): number {
  const leftOrdinal = Number(left.slice(left.lastIndexOf('.') + 1));
  const rightOrdinal = Number(right.slice(right.lastIndexOf('.') + 1));
  return leftOrdinal - rightOrdinal || (left < right ? -1 : left > right ? 1 : 0);
}
