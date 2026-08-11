import { AuthErrorResponseSchema, WorldMapResponseSchema, type WorldMapResponse } from '@arcanorum/shared';
import { AuthApiError } from './auth-api.js';

export async function getWorldMap(): Promise<WorldMapResponse> {
  const response = await fetch('/api/world/map', { credentials: 'include' });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const parsed = WorldMapResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('WORLD_MAP_RESPONSE_INVALID');
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
