import type { CompiledWorldGenerationConfig } from '../config-compiler.js';
import type { HexGrid } from '../geometry/hex-grid.js';
import type { MutableHex } from '../types.js';
import { buildDepressionHierarchy } from './depression-hierarchy.js';
import { fillBalancedLakes } from './lake-balance.js';
import { runPriorityFlood } from './priority-flood.js';

export { erodeAndRoute } from './stream-power.js';

export function formNaturalLakes(
  cells: readonly MutableHex[],
  grid: HexGrid,
  configuration: CompiledWorldGenerationConfig,
): number {
  const flood = runPriorityFlood(cells, grid);
  const depressions = buildDepressionHierarchy(cells, grid, flood);
  return fillBalancedLakes(cells, grid, configuration, depressions);
}
