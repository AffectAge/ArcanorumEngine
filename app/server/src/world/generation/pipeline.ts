import { createNoise2D } from 'simplex-noise';
import type { TerrainCatalog, WorldGenerationDiagnostics } from '@arcanorum/shared';
import type { WorldGenerationConfig } from '../../config.js';
import { appendStageDiagnostic } from './diagnostics.js';
import { toWorldHex } from './finalize.js';
import { HexGrid } from './geometry/hex-grid.js';
import { SeededRandom } from './random.js';
import { createBaseCells, createTerrainRoleIndex } from './stages/base-grid.js';
import { assignCoastalWater, assignLandmasses, assignWaterBodies } from './stages/classify-geography.js';
import { applyContinentalLand, createContinentPlans } from './stages/continents.js';
import { enforceOuterOcean } from './stages/feature-placement.js';
import { calculateClimate } from './stages/climate.js';
import { calculateHydrology } from './stages/hydrology.js';
import { addPlannedIslands, cleanLandTopology } from './stages/islands-topology.js';
import { addMountainRanges } from './stages/mountains.js';
import { validateGeography } from './stages/validate-geography.js';
import { carvePlannedWater } from './stages/water-features.js';
import type { GeneratedWorld } from './types.js';
import { maximum } from './utils.js';

export type { GeneratedWorld } from './types.js';

/**
 * Authoritative deterministic world-generation pipeline. Every stage receives
 * only explicit data, grid geometry, noise, and the seeded RNG.
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
