import { createHmac } from 'node:crypto';
import type { SqliteDatabase } from './database.js';
import { AuthHttpError } from './errors.js';

type RateLimitRule = {
  readonly subjectType: string;
  readonly subjectValue: string;
  readonly maximumAttempts: number;
  readonly windowSeconds: number;
};

type RateLimitRow = {
  readonly window_started_at: number;
  readonly attempts: number;
};

export class AuthRateLimiter {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly secret: string,
  ) {}

  assertAllowed(rules: readonly RateLimitRule[], now: number): void {
    for (const rule of rules) {
      const row = this.findRule(rule);
      if (
        row !== undefined &&
        row.window_started_at + rule.windowSeconds > now &&
        row.attempts >= rule.maximumAttempts
      ) {
        throw new AuthHttpError(429, 'TOO_MANY_ATTEMPTS');
      }
    }
  }

  record(rules: readonly RateLimitRule[], now: number): void {
    for (const rule of rules) {
      const subjectDigest = this.digest(rule.subjectType, rule.subjectValue);
      const row = this.database
        .prepare(
          `SELECT window_started_at, attempts
           FROM auth_rate_limits
           WHERE subject_type = ? AND subject_digest = ?`,
        )
        .get(rule.subjectType, subjectDigest) as RateLimitRow | undefined;

      if (row === undefined || row.window_started_at + rule.windowSeconds <= now) {
        this.database
          .prepare(
            `INSERT INTO auth_rate_limits (subject_type, subject_digest, window_started_at, attempts, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(subject_type, subject_digest) DO UPDATE SET
               window_started_at = excluded.window_started_at,
               attempts = excluded.attempts,
               updated_at = excluded.updated_at`,
          )
          .run(rule.subjectType, subjectDigest, now, 1, now);
      } else {
        this.database
          .prepare(
            `UPDATE auth_rate_limits
             SET attempts = attempts + 1, updated_at = ?
             WHERE subject_type = ? AND subject_digest = ?`,
          )
          .run(now, rule.subjectType, subjectDigest);
      }
    }

    this.database.prepare('DELETE FROM auth_rate_limits WHERE updated_at < ?').run(now - 24 * 60 * 60);
  }

  clear(rule: RateLimitRule): void {
    this.database
      .prepare('DELETE FROM auth_rate_limits WHERE subject_type = ? AND subject_digest = ?')
      .run(rule.subjectType, this.digest(rule.subjectType, rule.subjectValue));
  }

  private findRule(rule: RateLimitRule): RateLimitRow | undefined {
    return this.database
      .prepare(
        `SELECT window_started_at, attempts
         FROM auth_rate_limits
         WHERE subject_type = ? AND subject_digest = ?`,
      )
      .get(rule.subjectType, this.digest(rule.subjectType, rule.subjectValue)) as RateLimitRow | undefined;
  }

  private digest(subjectType: string, subjectValue: string): string {
    return createHmac('sha256', this.secret)
      .update(subjectType)
      .update('\u0000')
      .update(subjectValue)
      .digest('hex');
  }
}

export function loginRateLimitRules(
  loginNormalized: string,
  ipAddress: string,
): readonly [RateLimitRule, RateLimitRule] {
  return [
    {
      subjectType: 'login-ip',
      subjectValue: `${loginNormalized}\u0000${ipAddress}`,
      maximumAttempts: 5,
      windowSeconds: 15 * 60,
    },
    {
      subjectType: 'ip',
      subjectValue: ipAddress,
      maximumAttempts: 20,
      windowSeconds: 15 * 60,
    },
  ];
}

export function registrationRateLimitRules(ipAddress: string): readonly [RateLimitRule] {
  return [
    {
      subjectType: 'registration-ip',
      subjectValue: ipAddress,
      maximumAttempts: 5,
      windowSeconds: 60 * 60,
    },
  ];
}
