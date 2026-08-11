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
  world: {
    path: './world',
    autoCreate: true,
    name: 'Arcanorum',
    seed: 'test-seed',
    generation: {
      width: 48,
      height: 36,
      continentCount: 2,
      continentCoverage: 0.36,
      continentMinimumSeparation: 12,
      seaLevel: 520,
      islandCount: 5,
      islandMaximumRadius: 3,
      seaCount: 1,
      seaRadius: 4,
      lakeCount: 3,
      lakeRadius: 2,
      coastalWaterWidth: 1,
      riverCount: 4,
      riverMinimumSourceElevation: 640,
      riverMinimumSourceDistance: 5,
    },
  },
});

describe('server configuration', () => {
  it('resolves the world path independently of the workspace process directory', () => {
    const config = parseServerConfig(VALID_ENVIRONMENT, VALID_SERVER_CONFIGURATION);

    expect(isAbsolute(config.worldPath)).toBe(true);
    expect(config.worldPath).toMatch(/[\\/]world$/);
    expect(config.staticClientDir).toBeUndefined();
  });

  it('requires HTTPS and secure cookies for production', () => {
    expect(() =>
      parseServerConfig({
        ...VALID_ENVIRONMENT,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      }, VALID_SERVER_CONFIGURATION),
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
    const config = parseServerConfig({
      ...VALID_ENVIRONMENT,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
    }, configuration);

    expect(config.staticClientDir).toMatch(/[\\/]app[\\/]client[\\/]dist$/);
  });
});
