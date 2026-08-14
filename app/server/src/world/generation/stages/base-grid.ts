import type { TerrainCatalog } from '@arcanorum/shared';
import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex, TerrainRole, TerrainRoleIndex } from '../types.js';
import { clampInteger } from '../utils.js';

export function createTerrainRoleIndex(catalog: TerrainCatalog): TerrainRoleIndex {
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

export function createBaseCells(
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

function requiredTerrainRole(roles: ReadonlyMap<TerrainRole, string>, role: TerrainRole): string {
  const terrainId = roles.get(role);
  if (terrainId === undefined) {
    throw new Error(`Terrain catalog is missing required role: ${role}`);
  }
  return terrainId;
}
