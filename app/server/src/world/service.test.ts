import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerConfig } from '../config.js';
import { readServerConfiguration } from '../config.js';
import { prepareWorld } from './service.js';
import { loadTerrainCatalog } from './terrain-catalog.js';

describe('world generation snapshots', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a legacy snapshot without modifying the existing world', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcanorum-world-v1-'));
    temporaryDirectories.push(directory);
    const terrainCatalog = loadTerrainCatalog();
    writeWorldFiles(directory, {
      format: 'arcanorum-world-generation',
      worldName: 'Legacy world',
      seed: 'legacy-seed',
      terrainCatalogFingerprint: terrainCatalog.fingerprint,
      generation: readServerConfiguration().world.generation,
    });

    expect(() => prepareWorld(createConfig(directory), terrainCatalog)).toThrow(
      /incompatible with basin-mouth generator v4.*was not modified/u,
    );
  });

  it('rejects a v2 snapshot whose topology settings have a different contract', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcanorum-world-v2-'));
    temporaryDirectories.push(directory);
    const terrainCatalog = loadTerrainCatalog();
    writeWorldFiles(directory, {
      format: 'arcanorum-world-generation',
      version: 2,
      worldName: 'V2 world',
      seed: 'v2-seed',
      terrainCatalogFingerprint: terrainCatalog.fingerprint,
      generation: readServerConfiguration().world.generation,
    });

    expect(() => prepareWorld(createConfig(directory), terrainCatalog)).toThrow(
      /incompatible with basin-mouth generator v4.*was not modified/u,
    );
  });

  it('rejects a v3 snapshot generated with the previous marginal-sea contract', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcanorum-world-v3-'));
    temporaryDirectories.push(directory);
    const terrainCatalog = loadTerrainCatalog();
    writeWorldFiles(directory, {
      format: 'arcanorum-world-generation',
      version: 3,
      worldName: 'Versioned world',
      seed: 'versioned-seed',
      terrainCatalogFingerprint: terrainCatalog.fingerprint,
      generation: readServerConfiguration().world.generation,
    });

    expect(() => prepareWorld(createConfig(directory), terrainCatalog)).toThrow(
      /incompatible with basin-mouth generator v4.*was not modified/u,
    );
  });

  it('accepts a complete v4 snapshot for an existing world', () => {
    const directory = mkdtempSync(join(tmpdir(), 'arcanorum-world-v4-'));
    temporaryDirectories.push(directory);
    const terrainCatalog = loadTerrainCatalog();
    writeWorldFiles(directory, {
      format: 'arcanorum-world-generation',
      version: 4,
      worldName: 'Versioned world',
      seed: 'versioned-seed',
      terrainCatalogFingerprint: terrainCatalog.fingerprint,
      generation: readServerConfiguration().world.generation,
    });

    const prepared = prepareWorld(createConfig(directory), terrainCatalog);
    expect(prepared.isNew).toBe(false);
    expect(prepared.snapshot.version).toBe(4);
  });
});

function writeWorldFiles(directory: string, generation: unknown): void {
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify({
      format: 'arcanorum-world',
      generationFile: 'generation.json',
      databaseFile: 'world.sqlite',
    }),
  );
  writeFileSync(join(directory, 'generation.json'), JSON.stringify(generation));
  writeFileSync(join(directory, 'world.sqlite'), 'existing-world-marker');
}

function createConfig(worldPath: string): ServerConfig {
  return {
    nodeEnv: 'test',
    port: 3000,
    bindHost: '127.0.0.1',
    allowedOrigins: ['http://localhost:5173'],
    accountsPath: ':memory:',
    worldPath,
    worldAutoCreate: false,
    worldName: 'Configured world',
    worldSeed: 'configured-seed',
    worldGeneration: readServerConfiguration().world.generation,
    sessionHmacSecret: 'session-secret-with-at-least-thirty-two-characters',
    rateLimitHmacSecret: 'rate-limit-secret-with-at-least-thirty-two-characters',
    cookieSecure: false,
  };
}
