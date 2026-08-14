import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { requiredCell, requiredNumber } from '../utils.js';
import { routeFlow } from './flow-routing.js';
import { runPriorityFlood } from './priority-flood.js';

/** Applies bounded stream-power incision and recomputes drainage after every pass. */
export function erodeAndRoute(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
) {
  const hydrology = configuration.source.hydrology;
  for (let pass = 0; pass < hydrology.erosionPasses; pass += 1) {
    const flood = runPriorityFlood(cells, grid);
    routeFlow(cells, grid, configuration, flood);
    const nextElevation = cells.map((cell) => cell.elevation);
    for (let source = 0; source < grid.size; source += 1) {
      const cell = requiredCell(cells, source);
      const target = requiredNumber(flood.flowTarget, source);
      if (!cell.isLand || target < 0 || !requiredCell(cells, target).isLand) {
        continue;
      }
      const slope = Math.max(0, cell.elevation - requiredCell(cells, target).elevation);
      if (
        slope === 0 ||
        cell.flowAccumulation < hydrology.channelInitiationRunoff
      ) {
        continue;
      }
      const dischargeFactor = Math.max(
        1,
        Math.floor(cell.flowAccumulation / hydrology.channelInitiationRunoff),
      );
      const incision = Math.min(
        hydrology.maximumIncisionPerPass,
        Math.max(1, Math.floor((slope * dischargeFactor * hydrology.streamPowerStrength) / 100)),
      );
      nextElevation[source] = Math.max(
        configuration.source.relief.seaLevel + 1,
        cell.elevation - incision,
      );
    }
    for (let index = 0; index < grid.size; index += 1) {
      requiredCell(cells, index).elevation = requiredNumber(nextElevation, index);
    }
  }
  const finalFlood = runPriorityFlood(cells, grid);
  return routeFlow(cells, grid, configuration, finalFlood);
}
