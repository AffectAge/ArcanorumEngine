import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
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
    seaLevel: z.number().int().min(100).max(800),
    islandCount: z.number().int().min(0).max(200),
    islandMaximumRadius: z.number().int().min(1).max(16),
    seaCount: z.number().int().min(0).max(16),
    seaRadius: z.number().int().min(2).max(24),
    lakeCount: z.number().int().min(0).max(100),
    lakeRadius: z.number().int().min(1).max(12),
    coastalWaterWidth: z.number().int().min(1).max(3),
    riverCount: z.number().int().min(0).max(200),
    riverMinimumSourceElevation: z.number().int().min(1).max(999),
    riverMinimumSourceDistance: z.number().int().min(2).max(160),
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
  let source: unknown;

  try {
    source = JSON.parse(readFileSync(configurationPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read server configuration at ${configurationPath}: ${reason}`);
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
    worldPath:
      configuration.world.path === ':memory:'
        ? ':memory:'
        : resolve(PROJECT_ROOT, configuration.world.path),
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
