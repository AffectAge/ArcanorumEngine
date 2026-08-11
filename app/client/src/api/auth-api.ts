import {
  AuthErrorResponseSchema,
  AuthSuccessResponseSchema,
  type AuthErrorCode,
  type AuthProfile,
  type LoginInput,
  type RegistrationInput,
} from '@arcanorum/shared';

export class AuthApiError extends Error {
  constructor(
    readonly code: AuthErrorCode | 'INTERNAL_ERROR',
    readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(code);
    this.name = 'AuthApiError';
  }
}

export async function register(input: RegistrationInput): Promise<AuthProfile> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function login(input: LoginInput): Promise<AuthProfile> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCurrentPlayer(): Promise<AuthProfile> {
  return request('/api/auth/me');
}

export async function logout(): Promise<void> {
  await requestWithoutBody('/api/auth/logout', { method: 'POST' });
}

export async function logoutAll(): Promise<void> {
  await requestWithoutBody('/api/auth/logout-all', { method: 'POST' });
}

async function request(path: string, init: RequestInit = {}): Promise<AuthProfile> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const parsed = AuthSuccessResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AuthApiError('INTERNAL_ERROR');
  }

  return parsed.data.player;
}

async function requestWithoutBody(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }
}

async function parseApiError(response: Response): Promise<AuthApiError> {
  const parsed = AuthErrorResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return new AuthApiError('INTERNAL_ERROR');
  }

  return new AuthApiError(parsed.data.error.code, parsed.data.error.fields);
}
