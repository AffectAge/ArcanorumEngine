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
    continentCount: z.number().int().min(1).max(12),
    continentCoverage: z.number().min(0.08).max(0.72),
    continentMinimumSeparation: z.number().int().min(4).max(160),
    outerOcean: z
      .object({
        hardWidth: z.number().int().min(1).max(64),
      })
      .strict(),
    continentalPlacement: z
      .object({
        edgeClearance: z.number().int().min(0).max(96),
      })
      .strict(),
    continentalAxes: z
      .object({
        minimumCount: z.number().int().min(2).max(6),
        maximumCount: z.number().int().min(2).max(6),
        primaryLengthMinimumFactor: z.number().min(0.5).max(4),
        primaryLengthMaximumFactor: z.number().min(0.5).max(4),
        branchLengthMinimumFactor: z.number().min(0.25).max(3),
        branchLengthMaximumFactor: z.number().min(0.25).max(3),
        widthMinimumFactor: z.number().min(0.2).max(2),
        widthMaximumFactor: z.number().min(0.2).max(2),
        landThreshold: z.number().min(0.01).max(0.8),
        separationWidth: z.number().min(1).max(32),
        domainWarpScale: z.number().min(4).max(256),
        domainWarpAmount: z.number().min(0).max(48),
      })
      .strict(),
    coastNoise: z
      .object({
        macroScale: z.number().min(8).max(256),
        macroAmplitude: z.number().min(0).max(0.6),
        bayScale: z.number().min(3).max(128),
        bayAmplitude: z.number().min(0).max(0.4),
        detailScale: z.number().min(2).max(64),
        detailAmplitude: z.number().min(0).max(0.15),
      })
      .strict(),
    topology: z
      .object({
        smoothingPasses: z.number().int().min(0).max(2),
        minimumIslandHexes: z.number().int().min(1).max(10_000),
      })
      .strict(),
    seaLevel: z.number().int().min(100).max(800),
    islandCount: z.number().int().min(0).max(200),
    islandMaximumRadius: z.number().int().min(1).max(16),
    seaCount: z.number().int().min(0).max(16),
    seaRadius: z.number().int().min(2).max(24),
    seaChannelMinimumWidth: z.number().int().min(1).max(12),
    seaChannelMaximumWidth: z.number().int().min(1).max(12),
    seaChannelMeander: z.number().min(0).max(0.75),
    lakeCount: z.number().int().min(0).max(100),
    lakeRadius: z.number().int().min(1).max(12),
    coastalWaterWidth: z.number().int().min(1).max(3),
    mountainRangeCount: z.number().int().min(0).max(64),
    mountainRangeMinimumLength: z.number().int().min(3).max(96),
    mountainRangeMaximumLength: z.number().int().min(3).max(160),
    mountainRangeWidth: z.number().min(1).max(24),
    mountainRangeHeight: z.number().int().min(10).max(600),
    riverFlowThreshold: z.number().min(0.0001).max(0.25),
    climate: z
      .object({
        equatorialTemperature: z.number().int().min(0).max(1000),
        polarTemperature: z.number().int().min(0).max(1000),
        elevationCooling: z.number().min(0).max(2),
        prevailingWind: z.enum(['west_to_east', 'east_to_west']),
        rainfallNoise: z.number().int().min(0).max(250),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.continentMinimumSeparation >= Math.min(value.width, value.height)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'continentMinimumSeparation must fit inside the configured map.',
        path: ['continentMinimumSeparation'],
      });
    }

    if (value.continentCoverage / value.continentCount < 0.025) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'continentCoverage is too small for the requested continentCount.',
        path: ['continentCoverage'],
      });
    }

    if (
      value.outerOcean.hardWidth + value.continentalPlacement.edgeClearance >=
      Math.min(value.width, value.height) / 2
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'outerOcean hardWidth and continentalPlacement edgeClearance leave no usable interior.',
        path: ['continentalPlacement'],
      });
    }

    if (value.continentalAxes.minimumCount > value.continentalAxes.maximumCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'continentalAxes minimumCount cannot exceed maximumCount.',
        path: ['continentalAxes', 'minimumCount'],
      });
    }

    for (const [minimum, maximum, name] of [
      [
        value.continentalAxes.primaryLengthMinimumFactor,
        value.continentalAxes.primaryLengthMaximumFactor,
        'primaryLength',
      ],
      [
        value.continentalAxes.branchLengthMinimumFactor,
        value.continentalAxes.branchLengthMaximumFactor,
        'branchLength',
      ],
      [value.continentalAxes.widthMinimumFactor, value.continentalAxes.widthMaximumFactor, 'width'],
    ] as const) {
      if (minimum > maximum) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `continentalAxes ${name} minimum cannot exceed maximum.`,
          path: ['continentalAxes'],
        });
      }
    }

    if (value.seaChannelMinimumWidth > value.seaChannelMaximumWidth) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'seaChannelMinimumWidth cannot exceed seaChannelMaximumWidth.',
        path: ['seaChannelMinimumWidth'],
      });
    }

    if (value.mountainRangeMinimumLength > value.mountainRangeMaximumLength) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mountainRangeMinimumLength cannot exceed mountainRangeMaximumLength.',
        path: ['mountainRangeMinimumLength'],
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
