import type { WorldHex } from '@arcanorum/shared';
import type { MutableHex } from './types.js';

export function toWorldHex(cell: MutableHex): WorldHex {
  return {
    q: cell.q,
    r: cell.r,
    terrainId: cell.terrainId,
    elevation: cell.elevation,
    temperature: cell.temperature,
    rainfall: cell.rainfall,
    flowAccumulation: cell.flowAccumulation,
    ...(cell.landmassId === undefined ? {} : { landmassId: cell.landmassId }),
    ...(cell.waterBodyId === undefined ? {} : { waterBodyId: cell.waterBodyId }),
  };
}
