import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { type AuthErrorResponse } from '@arcanorum/shared';
import { AuthRepository } from './auth-repository.js';
import { AuthService, toAuthSuccessResponse } from './auth-service.js';
import type { ServerConfig } from './config.js';
import { openDatabase, type SqliteDatabase } from './database.js';
import { AuthHttpError } from './errors.js';
import { AuthRateLimiter } from './rate-limiter.js';
import { clearSessionCookie, getSessionCookieName, setSessionCookie } from './session-service.js';
import { GameService } from './game/game-service.js';
import { GameCommandService } from './game/command-service.js';
import { attachGameSocket } from './game/socket-server.js';
import { prepareWorld, WorldService } from './world/service.js';
import { loadTerrainCatalog } from './world/terrain-catalog.js';

export type CreateAppOptions = {
  readonly config: ServerConfig;
  readonly database?: SqliteDatabase;
  readonly now?: () => number;
};

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.config.nodeEnv !== 'test',
    bodyLimit: 16 * 1024,
  });
  const terrainCatalog = loadTerrainCatalog();
  const preparedWorld = prepareWorld(options.config, terrainCatalog);
  const database = options.database ?? openDatabase(preparedWorld.databasePath);
  const worldService = new WorldService(database, preparedWorld, terrainCatalog);
  worldService.initialize();
  const worldBase = worldService.getBase();
  const gameService = new GameService(database, worldBase);
  gameService.initialize();
  const gameCommandService = new GameCommandService(gameService);
  const now = options.now ?? currentEpochSeconds;
  const repository = new AuthRepository(database);
  const rateLimiter = new AuthRateLimiter(database, options.config.rateLimitHmacSecret);
  const authService = await AuthService.create(options.config, repository, rateLimiter);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: options.config.nodeEnv === 'production',
  });

  app.addHook('onClose', () => {
    database.close();
  });

  app.addHook('preHandler', async (request) => {
    if (request.method === 'GET' || !request.url.startsWith('/api/')) {
      return;
    }

    assertExpectedOrigin(request, options.config);
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.post('/api/auth/register', async (request, reply) => {
    const result = await authService.register(request.body, request.ip, now());
    setSessionCookie(reply, options.config, result.session);
    return reply.status(201).send(toAuthSuccessResponse(result.profile));
  });

  app.post('/api/auth/login', async (request, reply) => {
    const result = await authService.login(request.body, request.ip, now());
    setSessionCookie(reply, options.config, result.session);
    return reply.send(toAuthSuccessResponse(result.profile));
  });

  app.get('/api/auth/me', async (request, reply) => {
    const session = authService.getActiveSession(
      request.cookies[getSessionCookieName(options.config)],
      now(),
    );
    return reply.send(toAuthSuccessResponse(session.profile));
  });

  app.get('/api/world/base', async (request, reply) => {
    authService.getActiveSession(request.cookies[getSessionCookieName(options.config)], now());
    return reply.send(worldBase);
  });

  app.get('/api/world/chunks/:chunkQ/:chunkR', async (request, reply) => {
    authService.getActiveSession(request.cookies[getSessionCookieName(options.config)], now());
    const { chunkQ, chunkR } = request.params as { readonly chunkQ: string; readonly chunkR: string };
    const parsedChunkQ = Number(chunkQ);
    const parsedChunkR = Number(chunkR);
    if (!Number.isInteger(parsedChunkQ) || !Number.isInteger(parsedChunkR)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR' } });
    }
    return reply.send(worldService.getChunk(parsedChunkQ, parsedChunkR));
  });

  app.get('/api/game/snapshot', async (request, reply) => {
    const session = authService.getActiveSession(
      request.cookies[getSessionCookieName(options.config)],
      now(),
    );
    return reply.send(gameService.getSnapshot(session.profile));
  });

  app.post('/api/game/commands', async (request, reply) => {
    const session = authService.getActiveSession(
      request.cookies[getSessionCookieName(options.config)],
      now(),
    );
    return reply.send(gameCommandService.execute(session.playerId, request.body));
  });

  app.post('/api/auth/logout', async (request, reply) => {
    authService.logout(request.cookies[getSessionCookieName(options.config)], now());
    clearSessionCookie(reply, options.config);
    return reply.status(204).send();
  });

  app.post('/api/auth/logout-all', async (request, reply) => {
    authService.logoutAll(request.cookies[getSessionCookieName(options.config)], now());
    clearSessionCookie(reply, options.config);
    return reply.status(204).send();
  });

  if (options.config.staticClientDir !== undefined && existsSync(options.config.staticClientDir)) {
    await app.register(fastifyStatic, {
      root: options.config.staticClientDir,
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND' } });
      }
      return reply.type('text/html').sendFile('index.html');
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthHttpError) {
      const response: AuthErrorResponse = {
        error: error.fields === undefined ? { code: error.code } : { code: error.code, fields: error.fields },
      };
      return reply.status(error.statusCode).send(response);
    }

    app.log.error({ err: error }, 'Unhandled server error');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR' } });
  });

  attachGameSocket(app, options.config, authService, gameService, now);

  return app;
}

function assertExpectedOrigin(request: FastifyRequest, config: ServerConfig): void {
  if (request.headers.origin === undefined || !config.allowedOrigins.includes(request.headers.origin)) {
    throw new AuthHttpError(403, 'FORBIDDEN');
  }
}

function currentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
