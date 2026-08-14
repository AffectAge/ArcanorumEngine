import { createHash } from 'node:crypto';
import type { WorldGenerationDiagnostics } from '@arcanorum/shared';
import type { MutableHex } from './types.js';

export function appendStageDiagnostic(
  diagnostics: WorldGenerationDiagnostics['stages'],
  id: string,
  cells: readonly MutableHex[],
): void {
  const hash = createHash('sha256');
  hash.update(id);
  for (const cell of cells) {
    hash.update(
      `${cell.q},${cell.r},${cell.elevation},${cell.isLand ? 1 : 0},${cell.terrainId},${cell.temperature},${cell.rainfall},${cell.flowAccumulation};`,
    );
  }
  diagnostics.push({ id, checksum: hash.digest('hex') });
}
