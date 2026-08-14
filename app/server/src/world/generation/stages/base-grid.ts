import type { TerrainCatalog } from '@arcanorum/shared';
import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
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
  configuration: CompiledWorldGenerationConfig,
  landTerrainId: string,
): MutableHex[] {
  return Array.from({ length: grid.size }, (_, index) => {
    const coordinate = grid.coordinateAt(index);
    return {
      ...coordinate,
      elevation: clampInteger(
        configuration.source.relief.seaLevel - configuration.source.relief.oceanFloorDepth,
      ),
      isLand: false,
      terrainId: landTerrainId,
      temperature: 0,
      rainfall: 0,
      runoff: 0,
      flowAccumulation: 0,
      plateId: 0,
      crustKind: 'oceanic',
      tectonicUplift: 0,
      tectonicSubsidence: 0,
      landmassKindHint: undefined,
      landmassOrdinal: undefined,
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
