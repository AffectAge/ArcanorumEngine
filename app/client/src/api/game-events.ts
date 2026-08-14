import { GameSocketMessageSchema, type GameEventEnvelope, type GameSnapshot } from '@arcanorum/shared';

type GameEventStreamHandlers = {
  readonly onSnapshot: (snapshot: GameSnapshot) => void;
  readonly onEvents: (events: GameEventEnvelope) => void;
  readonly onError: (error: Error) => void;
};

export function connectGameEventStream(handlers: GameEventStreamHandlers): () => void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint = `${protocol}//${window.location.host}/api/game/events`;
  let disposed = false;
  let socket: WebSocket | undefined;
  let reconnectTimer: number | undefined;

  const connect = (): void => {
    if (disposed) {
      return;
    }

    const connection = new WebSocket(endpoint);
    socket = connection;
    connection.addEventListener('message', (event) => {
      let source: unknown;
      try {
        source = JSON.parse(String(event.data));
      } catch {
        handlers.onError(new Error('GAME_SOCKET_MESSAGE_INVALID'));
        connection.close(1003, 'Invalid message');
        return;
      }
      const parsed = GameSocketMessageSchema.safeParse(source);
      if (!parsed.success) {
        handlers.onError(new Error('GAME_SOCKET_MESSAGE_INVALID'));
        connection.close(1003, 'Invalid message');
        return;
      }
      if (parsed.data.type === 'game.snapshot') {
        handlers.onSnapshot(parsed.data.snapshot);
        return;
      }
      handlers.onEvents(parsed.data);
    });
    connection.addEventListener('error', () => handlers.onError(new Error('GAME_SOCKET_CONNECTION_FAILED')));
    connection.addEventListener('close', () => {
      if (!disposed) {
        reconnectTimer = window.setTimeout(connect, 1_000);
      }
    });
  };

  connect();
  return () => {
    disposed = true;
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
    }
    socket?.close(1000, 'Game shell disposed');
  };
}
