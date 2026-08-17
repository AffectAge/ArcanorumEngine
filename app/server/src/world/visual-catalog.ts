import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  WorldVisualAssetSchema,
  WorldVisualCatalogManifestSchema,
  WorldVisualCatalogSchema,
  WorldVisualFeatureSchema,
  WorldVisualLayerSchema,
  WorldVisualSignalSchema,
  WorldVisualSurfaceSchema,
  type WorldVisualCatalog,
} from '@arcanorum/shared';
import { PROJECT_ROOT } from '../config.js';

const VISUAL_CONTENT_DIRECTORY = resolve(PROJECT_ROOT, 'content/world/visual');
const VISUAL_CATALOG_PATH = resolve(VISUAL_CONTENT_DIRECTORY, 'visual-catalog.json');
const CLIENT_PUBLIC_PATH = resolve(PROJECT_ROOT, 'app/client/public');

export type LoadedVisualCatalog = {
  readonly catalog: WorldVisualCatalog;
  readonly fingerprint: string;
};

/**
 * Loads explicitly listed visual content. The content only affects the client
 * render projection; it is never used to determine authoritative gameplay.
 */
export function loadVisualCatalog(): LoadedVisualCatalog {
  const manifestSource = readRequiredFile(VISUAL_CATALOG_PATH, 'visual catalog manifest');
  const manifest = parseJson(manifestSource, VISUAL_CATALOG_PATH, WorldVisualCatalogManifestSchema);
  const fingerprintParts = [manifestSource];

  const layers = manifest.layers.map((path) => {
    const resolved = resolveCatalogPath(path);
    const source = readRequiredFile(resolved, `visual layer ${path}`);
    fingerprintParts.push(source);
    return parseJson(source, resolved, WorldVisualLayerSchema);
  });
  const assets = manifest.assets.map((path) => {
    const resolved = resolveCatalogPath(path);
    const source = readRequiredFile(resolved, `visual asset ${path}`);
    fingerprintParts.push(source);
    return parseJson(source, resolved, WorldVisualAssetSchema);
  });
  const signals = manifest.signals.map((path) => {
    const resolved = resolveCatalogPath(path);
    const source = readRequiredFile(resolved, `visual signal ${path}`);
    fingerprintParts.push(source);
    return parseJson(source, resolved, WorldVisualSignalSchema);
  });
  const features = manifest.features.map((path) => {
    const resolved = resolveCatalogPath(path);
    const source = readRequiredFile(resolved, `visual feature ${path}`);
    fingerprintParts.push(source);
    return parseJson(source, resolved, WorldVisualFeatureSchema);
  });
  const surfaces = manifest.surfaces.map((path) => {
    const resolved = resolveCatalogPath(path);
    const source = readRequiredFile(resolved, `visual surface ${path}`);
    fingerprintParts.push(source);
    return parseJson(source, resolved, WorldVisualSurfaceSchema);
  });
  const catalog = WorldVisualCatalogSchema.parse({
    layers,
    assets,
    signals,
    features,
    surfaces,
  });
  for (const asset of catalog.assets) {
    const assetPath = resolve(CLIENT_PUBLIC_PATH, `.${asset.url}`);
    const assetRelativePath = relative(CLIENT_PUBLIC_PATH, assetPath);
    if (assetRelativePath.startsWith('..') || assetRelativePath === '') {
      throw new Error(`Visual asset escapes the public directory: ${asset.url}`);
    }
    if (!existsSync(assetPath)) {
      throw new Error(`Required world visual asset is missing: ${assetPath}`);
    }
  }

  return {
    catalog,
    fingerprint: createHash('sha256').update(fingerprintParts.join('\n')).digest('hex'),
  };
}

function resolveCatalogPath(path: string): string {
  const resolved = resolve(VISUAL_CONTENT_DIRECTORY, path);
  const pathRelativeToCatalog = relative(VISUAL_CONTENT_DIRECTORY, resolved);
  if (pathRelativeToCatalog.startsWith('..') || pathRelativeToCatalog === '') {
    throw new Error(`Visual catalog path escapes its content directory: ${path}`);
  }
  return resolved;
}

function readRequiredFile(filePath: string, label: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label} at ${filePath}: ${reason}`);
  }
}

function parseJson<T>(source: string, filePath: string, schema: { parse(input: unknown): T }): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Visual content is not valid JSON at ${filePath}: ${reason}`);
  }
  try {
    return schema.parse(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Visual content is invalid at ${filePath}: ${reason}`);
  }
}
