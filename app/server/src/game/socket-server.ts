import type { FastifyInstance } from 'fastify';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { GameSocketMessageSchema } from '@arcanorum/shared';
import type { AuthService } from '../auth-service.js';
import type { ServerConfig } from '../config.js';
import { getSessionCookieName } from '../session-service.js';
import type { GameService } from './game-service.js';

export function attachGameSocket(
  app: FastifyInstance,
  config: ServerConfig,
  authService: AuthService,
  gameService: GameService,
  now: () => number,
): void {
  const socketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  app.server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (requestUrl.pathname !== '/api/game/events') {
      return;
    }

    if (request.headers.origin === undefined || !config.allowedOrigins.includes(request.headers.origin)) {
      rejectUpgrade(socket, 403);
      return;
    }

    try {
      const profile = authService.getActiveSession(
        readCookie(request.headers.cookie, getSessionCookieName(config)),
        now(),
      ).profile;
      socketServer.handleUpgrade(request, socket, head, (connection) => {
        socketServer.emit('connection', connection, request);
        const snapshot = gameService.getSnapshot(profile);
        const message = GameSocketMessageSchema.parse({
          type: 'game.snapshot',
          snapshot,
        });
        connection.send(JSON.stringify(message));
        for (const events of gameService.eventsAfter(snapshot.eventSequence)) {
          connection.send(JSON.stringify(events));
        }
        const unsubscribe = gameService.subscribe((events) => connection.send(JSON.stringify(events)));
        connection.once('close', unsubscribe);
        connection.on('message', () => connection.close(1003, 'Commands use the HTTP command endpoint.'));
      });
    } catch {
      rejectUpgrade(socket, 401);
    }
  });

  app.addHook('onClose', () => socketServer.close());
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  for (const entry of header.split(';')) {
    const [rawName, ...rawValue] = entry.trim().split('=');
    if (rawName === name) {
      return rawValue.join('=');
    }
  }
  return undefined;
}

function rejectUpgrade(socket: Duplex, status: 401 | 403): void {
  socket.write(`HTTP/1.1 ${status} Unauthorized\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
