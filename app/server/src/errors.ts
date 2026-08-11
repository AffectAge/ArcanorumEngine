import type { AuthErrorCode } from '@arcanorum/shared';

export class AuthHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: AuthErrorCode,
    readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(code);
    this.name = 'AuthHttpError';
  }
}
