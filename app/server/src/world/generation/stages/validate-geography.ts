import type { WorldWaterBody } from '@arcanorum/shared';
import type { WorldGenerationConfig } from '../../../config.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import { floodWaterFromBoundary } from '../geometry/topology.js';
import type { MutableHex } from '../types.js';
import { requiredCell, requiredNumber } from '../utils.js';

export type GeographyDiagnostics = {
  readonly boundaryLandHexCount: 0;
  readonly outerOceanHexCount: number;
  readonly connectedSeaCount: number;
};

export function validateGeography(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: WorldGenerationConfig,
  edgeDistance: readonly number[],
  waterBodies: readonly WorldWaterBody[],
): GeographyDiagnostics {
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
