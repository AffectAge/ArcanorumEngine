import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseServerConfig, ServerConfigurationSchema, WorldGenerationSchema } from './config.js';

const VALID_ENVIRONMENT = {
  NODE_ENV: 'development',
  SESSION_HMAC_SECRET: 'session-secret-with-at-least-thirty-two-characters',
  RATE_LIMIT_HMAC_SECRET: 'rate-limit-secret-with-at-least-thirty-two-characters',
  COOKIE_SECURE: 'false',
};

const VALID_SERVER_CONFIGURATION = ServerConfigurationSchema.parse({
  server: {
    port: 3000,
    bindHost: '127.0.0.1',
    allowedOrigins: ['http://localhost:5173'],
  },
  accounts: {
    path: './server-data/accounts.sqlite',
  },
  world: {
    path: './world',
    autoCreate: true,
    name: 'Arcanorum',
    seed: 'test-seed',
    generation: {
      width: 72,
      height: 54,
      topology: {
        mapStyle: 'continents',
        landCoverage: 0.36,
        candidateCount: 3,
        continentalGrain: 3,
        riftStrength: 0.68,
        islandFrequency: 0.4,
        edgeClearance: 2,
        outerOceanWidth: 2,
        coastRoughness: 0.45,
        coastalWaterWidth: 1,
        seaMinimumHexes: 8,
        seaEnclosureThreshold: 2,
      },
      tectonics: {
        plateCount: 8,
        activity: 0.65,
        boundaryFalloff: 6,
        collisionUplift: 260,
        subductionUplift: 190,
        trenchDepth: 120,
        riftDepth: 80,
        hotspotCount: 2,
      },
      relief: {
        seaLevel: 520,
        continentalBaseElevation: 75,
        oceanFloorDepth: 280,
        shelfWidth: 3,
        regionalNoiseScale: 32,
        regionalNoiseAmplitude: 65,
        detailNoiseScale: 8,
        detailNoiseAmplitude: 20,
      },
      climate: {
        equatorialTemperature: 880,
        polarTemperature: 220,
        elevationCooling: 0.55,
        windBandStrength: 650,
        moistureTransportPasses: 14,
        orographicStrength: 700,
        evaporationStrength: 420,
        rainfallNoise: 45,
      },
      hydrology: {
        minimumLakeHexes: 2,
        maximumLakeCoverage: 0.02,
        lakeWaterBalanceThreshold: 70,
        channelInitiationRunoff: 2200,
        erosionPasses: 2,
        streamPowerStrength: 18,
        maximumIncisionPerPass: 10,
      },
    },
  },
});

describe('server configuration', () => {
  it('rejects land coverage that cannot fit inside the protected ocean margin', () => {
    const generation = VALID_SERVER_CONFIGURATION.world.generation;
    const result = WorldGenerationSchema.safeParse({
      ...generation,
      topology: {
        ...generation.topology,
        landCoverage: 0.72,
        edgeClearance: 16,
        outerOceanWidth: 8,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('topology.landCoverage');
    }
  });

  it('resolves account and world paths independently of the workspace process directory', () => {
    const config = parseServerConfig(VALID_ENVIRONMENT, VALID_SERVER_CONFIGURATION);

    expect(isAbsolute(config.accountsPath)).toBe(true);
    expect(config.accountsPath).toMatch(/[\\/]server-data[\\/]accounts\.sqlite$/);
    expect(isAbsolute(config.worldPath)).toBe(true);
    expect(config.worldPath).toMatch(/[\\/]world$/);
    expect(config.staticClientDir).toBeUndefined();
  });

  it('requires HTTPS and secure cookies for production', () => {
    expect(() =>
      parseServerConfig(
        {
          ...VALID_ENVIRONMENT,
          NODE_ENV: 'production',
          COOKIE_SECURE: 'false',
        },
        VALID_SERVER_CONFIGURATION,
      ),
    ).toThrow();
  });

  it('enables the repository production client directory only in production', () => {
    const configuration = ServerConfigurationSchema.parse({
      ...VALID_SERVER_CONFIGURATION,
      server: {
        ...VALID_SERVER_CONFIGURATION.server,
        allowedOrigins: ['https://arcanorum.example'],
      },
    });
    const config = parseServerConfig(
      {
        ...VALID_ENVIRONMENT,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
      },
      configuration,
    );

    expect(config.staticClientDir).toMatch(/[\\/]app[\\/]client[\\/]dist$/);
  });
});
