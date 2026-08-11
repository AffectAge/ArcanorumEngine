import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { ServerConfig } from './config.js';

export const PERSISTENT_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_SESSION_SECONDS = 12 * 60 * 60;

export type NewSession = {
  readonly rawToken: string;
  readonly tokenDigest: string;
  readonly persistent: boolean;
  readonly createdAt: number;
  readonly expiresAt: number;
};

export function createSession(config: ServerConfig, persistent: boolean, now: number): NewSession {
  const rawToken = randomBytes(32).toString('base64url');
  const lifetime = persistent ? PERSISTENT_SESSION_SECONDS : SESSION_SESSION_SECONDS;

  return {
    rawToken,
    tokenDigest: digestSessionToken(config, rawToken),
    persistent,
    createdAt: now,
    expiresAt: now + lifetime,
  };
}

export function digestSessionToken(config: ServerConfig, rawToken: string): string {
  return createHmac('sha256', config.sessionHmacSecret).update(rawToken).digest('hex');
}

export function getSessionCookieName(config: ServerConfig): string {
  return config.cookieSecure ? '__Host-arcanorum_session' : 'arcanorum_session';
}

export function setSessionCookie(reply: FastifyReply, config: ServerConfig, session: NewSession): void {
  const options = {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict' as const,
  };

  if (session.persistent) {
    reply.setCookie(getSessionCookieName(config), session.rawToken, {
      ...options,
      maxAge: PERSISTENT_SESSION_SECONDS,
    });
    return;
  }

  reply.setCookie(getSessionCookieName(config), session.rawToken, options);
}

export function clearSessionCookie(reply: FastifyReply, config: ServerConfig): void {
  reply.clearCookie(getSessionCookieName(config), {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
  });
}
