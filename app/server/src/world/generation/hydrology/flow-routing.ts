import type { WorldRiverEdge } from '@arcanorum/shared';
import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { HydrologyResult, MutableHex } from '../types.js';
import { maximum, requiredCell, requiredNumber } from '../utils.js';
import type { PriorityFloodResult } from './priority-flood.js';

export function routeFlow(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
  flood: PriorityFloodResult,
): HydrologyResult {
  const accumulation = cells.map((cell) => (cell.isLand ? Math.max(1, cell.runoff) : 0));
  const landIndexes = Array.from({ length: grid.size }, (_, index) => index)
    .filter((index) => requiredCell(cells, index).isLand)
    .sort(
      (left, right) =>
        requiredNumber(flood.filledElevation, right) - requiredNumber(flood.filledElevation, left) ||
        requiredNumber(flood.drainageOrder, right) - requiredNumber(flood.drainageOrder, left) ||
        right - left,
    );

  for (const source of landIndexes) {
    const target = requiredNumber(flood.flowTarget, source);
    if (target < 0) {
      throw new Error(`Land hex ${source} has no Priority-Flood drainage target.`);
    }
    const sourceFlow = requiredNumber(accumulation, source);
    requiredCell(cells, source).flowAccumulation = sourceFlow;
    if (requiredCell(cells, target).isLand) {
      accumulation[target] = requiredNumber(accumulation, target) + sourceFlow;
    }
  }

  const rivers: WorldRiverEdge[] = landIndexes
    .filter(
      (source) =>
        requiredNumber(accumulation, source) >=
        configuration.source.hydrology.channelInitiationRunoff,
    )
    .map((source) => {
      const target = requiredNumber(flood.flowTarget, source);
      const from = grid.coordinateAt(source);
      const to = grid.coordinateAt(target);
      return {
        fromQ: from.q,
        fromR: from.r,
        toQ: to.q,
        toR: to.r,
        flow: requiredNumber(accumulation, source),
      };
    })
    .sort(
      (left, right) =>
        left.fromR - right.fromR ||
        left.fromQ - right.fromQ ||
        left.toR - right.toR ||
        left.toQ - right.toQ,
    );

  return {
    rivers,
    maximumFlowAccumulation: maximum(accumulation),
    filledElevation: flood.filledElevation,
    flowTarget: flood.flowTarget,
  };
}
