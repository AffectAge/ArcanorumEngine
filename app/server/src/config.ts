import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

export const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_SERVER_CONFIGURATION_PATH = resolve(PROJECT_ROOT, 'server_configuration.json');

export const WorldGenerationSchema = z
  .object({
    width: z.number().int().min(24).max(512),
    height: z.number().int().min(24).max(512),
    topology: z
      .object({
        mapStyle: z.enum(['continents', 'fractal', 'pangaea', 'archipelago']),
        landCoverage: z.number().min(0.08).max(0.72),
        candidateCount: z.number().int().min(1).max(16),
        continentalGrain: z.number().int().min(1).max(8),
        riftStrength: z.number().min(0).max(1),
        islandFrequency: z.number().min(0).max(1),
        edgeClearance: z.number().int().min(0).max(48),
        outerOceanWidth: z.number().int().min(1).max(32),
        coastRoughness: z.number().min(0).max(1),
        coastalWaterWidth: z.number().int().min(1).max(3),
        seaMinimumHexes: z.number().int().min(6).max(20_000),
        seaEnclosureThreshold: z.number().int().min(1).max(6),
      })
      .strict(),
    tectonics: z
      .object({
        plateCount: z.number().int().min(4).max(64),
        activity: z.number().min(0).max(1),
        boundaryFalloff: z.number().int().min(1).max(24),
        collisionUplift: z.number().int().min(0).max(500),
        subductionUplift: z.number().int().min(0).max(500),
        trenchDepth: z.number().int().min(0).max(400),
        riftDepth: z.number().int().min(0).max(300),
        hotspotCount: z.number().int().min(0).max(32),
      })
      .strict(),
    relief: z
      .object({
        seaLevel: z.number().int().min(200).max(750),
        continentalBaseElevation: z.number().int().min(10).max(300),
        oceanFloorDepth: z.number().int().min(80).max(600),
        shelfWidth: z.number().int().min(1).max(16),
        regionalNoiseScale: z.number().int().min(8).max(256),
        regionalNoiseAmplitude: z.number().int().min(0).max(250),
        detailNoiseScale: z.number().int().min(2).max(64),
        detailNoiseAmplitude: z.number().int().min(0).max(100),
      })
      .strict(),
    climate: z
      .object({
        equatorialTemperature: z.number().int().min(0).max(1000),
        polarTemperature: z.number().int().min(0).max(1000),
        elevationCooling: z.number().min(0).max(2),
        windBandStrength: z.number().int().min(0).max(1000),
        moistureTransportPasses: z.number().int().min(1).max(64),
        orographicStrength: z.number().int().min(0).max(1000),
        evaporationStrength: z.number().int().min(0).max(1000),
        rainfallNoise: z.number().int().min(0).max(200),
      })
      .strict(),
    hydrology: z
      .object({
        minimumLakeHexes: z.number().int().min(1).max(500),
        maximumLakeCoverage: z.number().min(0).max(0.08),
        lakeWaterBalanceThreshold: z.number().int().min(0).max(1000),
        channelInitiationRunoff: z.number().int().min(100).max(100_000_000),
        erosionPasses: z.number().int().min(0).max(8),
        streamPowerStrength: z.number().int().min(0).max(100),
        maximumIncisionPerPass: z.number().int().min(0).max(50),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const interiorWidth = value.width - 2 * value.topology.outerOceanWidth;
    const interiorHeight = value.height - 2 * value.topology.outerOceanWidth;
    if (interiorWidth <= 0 || interiorHeight <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'topology.outerOceanWidth leaves no usable map interior.',
        path: ['topology', 'outerOceanWidth'],
      });
    }

    if (
      value.topology.outerOceanWidth + value.topology.edgeClearance >=
      Math.min(value.width, value.height) / 2
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ocean and edge clearance leave no usable land-generation interior.',
        path: ['topology'],
      });
    }

    const targetLandHexes = Math.round(value.width * value.height * value.topology.landCoverage);
    const protectedMargin = value.topology.outerOceanWidth + value.topology.edgeClearance;
    const usableWidth = Math.max(0, value.width - protectedMargin * 2);
    const usableHeight = Math.max(0, value.height - protectedMargin * 2);
    if (targetLandHexes > usableWidth * usableHeight) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'landCoverage exceeds the land-generation interior after ocean margins.',
        path: ['topology', 'landCoverage'],
      });
    }

    if (value.climate.polarTemperature > value.climate.equatorialTemperature) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'polarTemperature cannot exceed equatorialTemperature.',
        path: ['climate', 'polarTemperature'],
      });
    }
  });

export const ServerConfigurationSchema = z
  .object({
    server: z
      .object({
        port: z.number().int().min(1).max(65535),
        bindHost: z.string().min(1),
        allowedOrigins: z.array(z.string().url()).min(1),
      })
      .strict(),
    accounts: z
      .object({
        path: z.string().min(1),
      })
      .strict(),
    world: z
      .object({
        path: z.string().min(1),
        autoCreate: z.boolean(),
        name: z.string().trim().min(1).max(80),
        seed: z.union([z.literal('auto'), z.string().trim().min(1).max(128)]),
        generation: WorldGenerationSchema,
      })
      .strict(),
  })
  .strict();

export type ServerConfiguration = z.infer<typeof ServerConfigurationSchema>;
export type WorldGenerationConfig = z.infer<typeof WorldGenerationSchema>;

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SESSION_HMAC_SECRET: z.string().min(32),
    RATE_LIMIT_HMAC_SECRET: z.string().min(32),
    COOKIE_SECURE: z.enum(['true', 'false']),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && value.COOKIE_SECURE !== 'true') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'COOKIE_SECURE must be true in production.',
        path: ['COOKIE_SECURE'],
      });
    }
  });

export type ServerConfig = {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly bindHost: string;
  readonly allowedOrigins: readonly string[];
  readonly accountsPath: string;
  readonly worldPath: string;
  readonly worldAutoCreate: boolean;
  readonly worldName: string;
  readonly worldSeed: string;
  readonly worldGeneration: WorldGenerationConfig;
  readonly sessionHmacSecret: string;
  readonly rateLimitHmacSecret: string;
  readonly cookieSecure: boolean;
  readonly staticClientDir?: string;
};

export function readServerConfiguration(
  configurationPath: string = DEFAULT_SERVER_CONFIGURATION_PATH,
): ServerConfiguration {
  const resolvedConfigurationPath = isAbsolute(configurationPath)
    ? configurationPath
    : resolve(PROJECT_ROOT, configurationPath);
  let source: unknown;

  try {
    source = JSON.parse(readFileSync(resolvedConfigurationPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read server configuration at ${resolvedConfigurationPath}: ${reason}`);
  }

  return ServerConfigurationSchema.parse(source);
}

export function parseServerConfig(
  environment: NodeJS.ProcessEnv,
  configuration: ServerConfiguration,
): ServerConfig {
  const parsedEnvironment = EnvironmentSchema.parse(environment);

  if (
    parsedEnvironment.NODE_ENV === 'production' &&
    configuration.server.allowedOrigins.some((origin) => !origin.startsWith('https://'))
  ) {
    throw new Error('Every allowed origin must use HTTPS in production.');
  }

  const commonConfig: Omit<ServerConfig, 'staticClientDir'> = {
    nodeEnv: parsedEnvironment.NODE_ENV,
    port: configuration.server.port,
    bindHost: configuration.server.bindHost,
    allowedOrigins: configuration.server.allowedOrigins,
    accountsPath:
      configuration.accounts.path === ':memory:'
        ? ':memory:'
        : resolve(PROJECT_ROOT, configuration.accounts.path),
    worldPath:
      configuration.world.path === ':memory:' ? ':memory:' : resolve(PROJECT_ROOT, configuration.world.path),
    worldAutoCreate: configuration.world.autoCreate,
    worldName: configuration.world.name,
    worldSeed: configuration.world.seed,
    worldGeneration: configuration.world.generation,
    sessionHmacSecret: parsedEnvironment.SESSION_HMAC_SECRET,
    rateLimitHmacSecret: parsedEnvironment.RATE_LIMIT_HMAC_SECRET,
    cookieSecure: parsedEnvironment.COOKIE_SECURE === 'true',
  };

  return parsedEnvironment.NODE_ENV === 'production'
    ? { ...commonConfig, staticClientDir: resolve(PROJECT_ROOT, 'app/client/dist') }
    : commonConfig;
}
