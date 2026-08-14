import { createNoise2D } from 'simplex-noise';
import type { TerrainCatalog, WorldGenerationDiagnostics } from '@arcanorum/shared';
import type { WorldGenerationConfig } from '../../config.js';
import { compileWorldGenerationConfig } from './config-compiler.js';
import { appendStageDiagnostic } from './diagnostics.js';
import { toWorldHex } from './finalize.js';
import { HexGrid } from './geometry/hex-grid.js';
import { erodeAndRoute, formNaturalLakes } from './hydrology/index.js';
import { createRandomStream } from './random.js';
import { createBaseCells, createTerrainRoleIndex } from './stages/base-grid.js';
import { assignCoastalWater, assignLandmasses, assignWaterBodies } from './stages/classify-geography.js';
import { calculateClimate } from './stages/climate.js';
import type { LandCandidateNoise } from './stages/land-candidates.js';
import { createLandTopology } from './stages/land-topology.js';
import { classifyMarginalSeas } from './stages/marginal-seas.js';
import { applyRelief } from './stages/relief.js';
import { createTectonicPlates } from './stages/tectonic-plates.js';
import { validateGeography } from './stages/validate-geography.js';
import type { GeneratedWorld } from './types.js';
import { maximum } from './utils.js';

export type { GeneratedWorld } from './types.js';

/** Authoritative generation v3: candidate topology, geology, climate, then surface processes. */
export function generateWorld(
  seed: string,
  sourceConfiguration: WorldGenerationConfig,
  terrainCatalog: TerrainCatalog,
): GeneratedWorld {
  const configuration = compileWorldGenerationConfig(sourceConfiguration);
  const terrainIds = createTerrainRoleIndex(terrainCatalog);
  const grid = new HexGrid(sourceConfiguration.width, sourceConfiguration.height);
  const cells = createBaseCells(grid, configuration, terrainIds.land);
  const diagnostics: WorldGenerationDiagnostics['stages'] = [];
  const edgeDistance = grid.distancesFromBoundary();

  appendStageDiagnostic(diagnostics, 'stage.base_grid', cells);

  const plateModel = createTectonicPlates(
    cells,
    grid,
    configuration,
    createRandomStream(seed, 'tectonics.plates'),
    createStageNoise(seed, 'tectonics.domains'),
  );
  appendStageDiagnostic(
    diagnostics,
    'stage.tectonic_plates',
    cells,
    plateModel.plates.map((plate) => `${plate.id},${plate.seedIndex},${plate.motionQ},${plate.motionR}`),
  );

  const topology = createLandTopology(
    cells,
    grid,
    configuration,
    edgeDistance,
    plateModel,
    createCandidateNoises(seed, configuration.source.topology.candidateCount),
  );
  appendStageDiagnostic(diagnostics, 'stage.land_topology', cells, [
    `candidate:${topology.selectedCandidate}/${topology.candidateCount}`,
    `score:${topology.selectedScore}`,
    `land:${topology.landHexCount}`,
    `components:${topology.componentCount}`,
    `largest-share:${topology.largestLandmassSharePermille}`,
    `coast:${topology.coastlineEdges}`,
  ]);

  applyRelief(
    cells,
    grid,
    configuration,
    createStageNoise(seed, 'relief.regional'),
    createStageNoise(seed, 'relief.detail'),
  );
  appendStageDiagnostic(diagnostics, 'stage.relief', cells);

  calculateClimate(cells, grid, configuration, createStageNoise(seed, 'climate.moisture'));
  appendStageDiagnostic(diagnostics, 'stage.climate_initial', cells);

  const lakeCount = formNaturalLakes(cells, grid, configuration);
  classifyMarginalSeas(cells, grid, configuration, edgeDistance);
  appendStageDiagnostic(diagnostics, 'stage.surface_water', cells, [`lakes:${lakeCount}`]);

  calculateClimate(cells, grid, configuration, createStageNoise(seed, 'climate.moisture'));
  const hydrology = erodeAndRoute(cells, grid, configuration);
  appendStageDiagnostic(
    diagnostics,
    'stage.hydrology_erosion',
    cells,
    hydrology.rivers.map((river) => `${river.fromQ},${river.fromR},${river.toQ},${river.toR},${river.flow}`),
  );

  const landmasses = assignLandmasses(cells);
  const waterBodies = assignWaterBodies(cells, grid, terrainIds, edgeDistance);
  assignCoastalWater(cells, grid, configuration.source.topology.coastalWaterWidth, terrainIds);
  appendStageDiagnostic(diagnostics, 'stage.geography', cells, [
    ...landmasses.map((landmass) => `${landmass.id},${landmass.kind},${landmass.hexCount}`),
    ...waterBodies.map((waterBody) => `${waterBody.id},${waterBody.kind},${waterBody.hexCount}`),
  ]);
  const geography = validateGeography(
    cells,
    grid,
    configuration,
    edgeDistance,
    waterBodies,
    landmasses,
    hydrology.rivers,
    topology.landHexCount,
  );

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
      discardedMicroIslandCount: topology.discardedMicroIslandCount,
    },
  };
}

function createCandidateNoises(seed: string, count: number): readonly LandCandidateNoise[] {
  return Array.from({ length: count }, (_, attemptIndex) => {
    const prefix = `topology.candidate.${attemptIndex}`;
    return {
      macro: createStageNoise(seed, `${prefix}.macro`),
      regional: createStageNoise(seed, `${prefix}.regional`),
      detail: createStageNoise(seed, `${prefix}.detail`),
      rifts: createStageNoise(seed, `${prefix}.rifts`),
    };
  });
}

function createStageNoise(seed: string, streamName: string): (x: number, y: number) => number {
  const random = createRandomStream(seed, streamName);
  return createNoise2D(() => random.nextFloat());
}
