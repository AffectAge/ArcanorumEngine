import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TerrainCatalogSchema, type TerrainCatalog } from '@arcanorum/shared';
import { PROJECT_ROOT } from '../config.js';

const TERRAIN_CATALOG_PATH = resolve(PROJECT_ROOT, 'content/world/terrain-types.json');
const CLIENT_PUBLIC_PATH = resolve(PROJECT_ROOT, 'app/client/public');

export type LoadedTerrainCatalog = {
  readonly catalog: TerrainCatalog;
  readonly fingerprint: string;
};

export function loadTerrainCatalog(): LoadedTerrainCatalog {
  let rawCatalog: string;

  try {
    rawCatalog = readFileSync(TERRAIN_CATALOG_PATH, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read terrain catalog at ${TERRAIN_CATALOG_PATH}: ${reason}`);
  }

  let source: unknown;
  try {
    source = JSON.parse(rawCatalog);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Terrain catalog is not valid JSON: ${reason}`);
  }

  const catalog = TerrainCatalogSchema.parse(source);
  const assetPath = resolve(CLIENT_PUBLIC_PATH, `.${catalog.atlas.url}`);
  if (!assetPath.startsWith(`${CLIENT_PUBLIC_PATH}\\`) && !assetPath.startsWith(`${CLIENT_PUBLIC_PATH}/`)) {
    throw new Error(`Terrain atlas escapes the public asset directory: ${catalog.atlas.url}`);
  }
  if (!existsSync(assetPath)) {
    throw new Error(`Required terrain atlas is missing: ${assetPath}`);
  }

  return {
    catalog,
    fingerprint: createHash('sha256').update(rawCatalog).digest('hex'),
  };
}
