import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseServerConfig, ServerConfigurationSchema } from './config.js';

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
      width: 384,
      height: 256,
      continentCount: 2,
      continentCoverage: 0.36,
      continentMinimumSeparation: 12,
      outerOcean: { hardWidth: 3 },
      continentalPlacement: { edgeClearance: 4 },
      continentalAxes: {
        minimumCount: 3,
        maximumCount: 4,
        primaryLengthMinimumFactor: 0.55,
        primaryLengthMaximumFactor: 0.85,
        branchLengthMinimumFactor: 0.45,
        branchLengthMaximumFactor: 0.7,
        widthMinimumFactor: 0.55,
        widthMaximumFactor: 0.65,
        landThreshold: 0.01,
        separationWidth: 7,
        domainWarpScale: 64,
        domainWarpAmount: 9,
      },
      coastNoise: {
        macroScale: 96,
        macroAmplitude: 0.22,
        bayScale: 28,
        bayAmplitude: 0.16,
        detailScale: 8,
        detailAmplitude: 0.045,
      },
      topology: { smoothingPasses: 1, minimumIslandHexes: 6 },
      seaLevel: 520,
      islandCount: 5,
      islandMaximumRadius: 3,
      seaCount: 1,
      seaRadius: 2,
      seaChannelMinimumWidth: 1,
      seaChannelMaximumWidth: 1,
      seaChannelMeander: 0.2,
      lakeCount: 1,
      lakeRadius: 1,
      coastalWaterWidth: 1,
      mountainRangeCount: 2,
      mountainRangeMinimumLength: 7,
      mountainRangeMaximumLength: 14,
      mountainRangeWidth: 3,
      mountainRangeHeight: 230,
      riverFlowThreshold: 0.012,
      climate: {
        equatorialTemperature: 880,
        polarTemperature: 220,
        elevationCooling: 0.55,
        prevailingWind: 'west_to_east',
        rainfallNoise: 45,
      },
    },
  },
});

describe('server configuration', () => {
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
