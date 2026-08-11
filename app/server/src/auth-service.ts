import { parseLoginInput, parseRegistrationInput } from '@arcanorum/shared';
import type { AuthProfile, AuthSuccessResponse } from '@arcanorum/shared';
import { z } from 'zod';
import type { ActiveSession, AuthRepository } from './auth-repository.js';
import type { ServerConfig } from './config.js';
import { AuthHttpError } from './errors.js';
import { createDummyPasswordHash, hashPassword, verifyPassword } from './password-service.js';
import { loginRateLimitRules, registrationRateLimitRules } from './rate-limiter.js';
import type { AuthRateLimiter } from './rate-limiter.js';
import { createSession, digestSessionToken, type NewSession } from './session-service.js';

export class AuthService {
  private constructor(
    private readonly config: ServerConfig,
    private readonly repository: AuthRepository,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly dummyPasswordHash: string,
  ) {}

  static async create(
    config: ServerConfig,
    repository: AuthRepository,
    rateLimiter: AuthRateLimiter,
  ): Promise<AuthService> {
    return new AuthService(config, repository, rateLimiter, await createDummyPasswordHash());
  }

  async register(body: unknown, ipAddress: string, now: number): Promise<AuthResult> {
    const input = this.parseRegistration(body);
    const rateRules = registrationRateLimitRules(ipAddress);
    this.rateLimiter.assertAllowed(rateRules, now);
    this.rateLimiter.record(rateRules, now);

    if (this.repository.loginExists(input.loginNormalized)) {
      throw new AuthHttpError(409, 'LOGIN_TAKEN');
    }

    if (this.repository.countryExists(input.countryNameNormalized)) {
      throw new AuthHttpError(409, 'COUNTRY_NAME_TAKEN');
    }

    const passwordHash = await hashPassword(input.password);
    const session = createSession(this.config, false, now);

    try {
      const profile = this.repository.createAccount(input, passwordHash, session);
      return { profile, session };
    } catch (error) {
      if (isUniqueConstraint(error, 'players.login_normalized')) {
        throw new AuthHttpError(409, 'LOGIN_TAKEN');
      }

      if (isUniqueConstraint(error, 'countries.country_name_normalized')) {
        throw new AuthHttpError(409, 'COUNTRY_NAME_TAKEN');
      }

      throw error;
    }
  }

  async login(body: unknown, ipAddress: string, now: number): Promise<AuthResult> {
    const input = this.parseLogin(body);
    const rateRules = loginRateLimitRules(input.loginNormalized, ipAddress);
    this.rateLimiter.assertAllowed(rateRules, now);

    const account = this.repository.findAccount(input.loginNormalized);
    const passwordHash = account?.passwordHash ?? this.dummyPasswordHash;
    const passwordValid = await verifyPassword(passwordHash, input.password);

    if (account === undefined || !passwordValid) {
      this.rateLimiter.record(rateRules, now);
      throw new AuthHttpError(401, 'INVALID_CREDENTIALS');
    }

    this.rateLimiter.clear(rateRules[0]);
    const session = createSession(this.config, input.rememberMe, now);
    this.repository.createSession(account.playerId, session);

    return { profile: account.profile, session };
  }

  getActiveSession(rawToken: string | undefined, now: number): ActiveSession {
    if (rawToken === undefined) {
      throw new AuthHttpError(401, 'UNAUTHENTICATED');
    }

    const session = this.repository.findActiveSession(digestSessionToken(this.config, rawToken), now);
    if (session === undefined) {
      throw new AuthHttpError(401, 'UNAUTHENTICATED');
    }

    return session;
  }

  logout(rawToken: string | undefined, now: number): void {
    if (rawToken !== undefined) {
      this.repository.revokeSession(digestSessionToken(this.config, rawToken), now);
    }
  }

  logoutAll(rawToken: string | undefined, now: number): void {
    const activeSession = this.getActiveSession(rawToken, now);
    this.repository.revokeAllSessions(activeSession.playerId, now);
  }

  private parseRegistration(body: unknown) {
    try {
      return parseRegistrationInput(body);
    } catch (error) {
      throw toValidationError(error);
    }
  }

  private parseLogin(body: unknown) {
    try {
      return parseLoginInput(body);
    } catch (error) {
      throw toValidationError(error);
    }
  }
}

export type AuthResult = {
  readonly profile: AuthProfile;
  readonly session: NewSession;
};

export function toAuthSuccessResponse(profile: AuthProfile): AuthSuccessResponse {
  return { player: profile };
}

function toValidationError(error: unknown): AuthHttpError {
  if (error instanceof z.ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && fields[field] === undefined) {
        fields[field] = issue.message;
      }
    }
    return new AuthHttpError(400, 'VALIDATION_ERROR', fields);
  }

  throw error;
}

function isUniqueConstraint(error: unknown, constraint: string): boolean {
  return error instanceof Error && error.message.includes(constraint);
}
