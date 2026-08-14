import {
  AuthErrorResponseSchema,
  GameSnapshotSchema,
  WorldBaseResponseSchema,
  WorldChunkResponseSchema,
  type GameSnapshot,
  type WorldBaseResponse,
  type WorldChunkResponse,
} from '@arcanorum/shared';
import { AuthApiError } from './auth-api.js';

export async function getWorldBase(): Promise<WorldBaseResponse> {
  const response = await fetch('/api/world/base', { credentials: 'include' });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const parsed = WorldBaseResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('WORLD_BASE_RESPONSE_INVALID');
  }

  return parsed.data;
}

export async function getWorldChunk(chunkQ: number, chunkR: number): Promise<WorldChunkResponse> {
  const response = await fetch(`/api/world/chunks/${chunkQ}/${chunkR}`, { credentials: 'include' });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const parsed = WorldChunkResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('WORLD_CHUNK_RESPONSE_INVALID');
  }
  return parsed.data;
}

export async function getGameSnapshot(): Promise<GameSnapshot> {
  return requestGameSnapshot('/api/game/snapshot', { method: 'GET' });
}

export async function joinGame(): Promise<GameSnapshot> {
  return requestGameSnapshot('/api/game/join', { method: 'POST' });
}

async function requestGameSnapshot(path: string, init: RequestInit): Promise<GameSnapshot> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const parsed = GameSnapshotSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('GAME_SNAPSHOT_RESPONSE_INVALID');
  }
  return parsed.data;
}

async function toApiError(response: Response): Promise<Error> {
  const parsed = AuthErrorResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (parsed.success) {
    return new AuthApiError(parsed.data.error.code, parsed.data.error.fields);
  }

  return new Error(`WORLD_MAP_REQUEST_FAILED_${response.status}`);
}
