import type { AuthProfile, NormalizedRegistrationInput } from '@arcanorum/shared';
import type { SqliteDatabase } from './database.js';
import type { NewSession } from './session-service.js';

type AccountRow = {
  readonly player_id: number;
  readonly login_display: string;
  readonly country_name_display: string;
  readonly password_hash: string;
};

type SessionProfileRow = {
  readonly player_id: number;
  readonly login_display: string;
  readonly country_name_display: string;
};

export type AccountForAuthentication = {
  readonly playerId: number;
  readonly profile: AuthProfile;
  readonly passwordHash: string;
};

export type ActiveSession = {
  readonly playerId: number;
  readonly profile: AuthProfile;
};

export class AuthRepository {
  constructor(private readonly database: SqliteDatabase) {}

  loginExists(loginNormalized: string): boolean {
    return (
      this.database.prepare('SELECT 1 FROM players WHERE login_normalized = ?').get(loginNormalized) !==
      undefined
    );
  }

  countryExists(countryNameNormalized: string): boolean {
    return (
      this.database
        .prepare('SELECT 1 FROM countries WHERE country_name_normalized = ?')
        .get(countryNameNormalized) !== undefined
    );
  }

  createAccount(input: NormalizedRegistrationInput, passwordHash: string, session: NewSession): AuthProfile {
    const create = this.database.transaction(() => {
      const playerResult = this.database
        .prepare(
          `INSERT INTO players (login_display, login_normalized, created_at)
           VALUES (?, ?, ?)`,
        )
        .run(input.loginDisplay, input.loginNormalized, session.createdAt);
      const playerId = Number(playerResult.lastInsertRowid);

      this.database
        .prepare(
          `INSERT INTO countries (player_id, country_name_display, country_name_normalized, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(playerId, input.countryNameDisplay, input.countryNameNormalized, session.createdAt);
      this.database
        .prepare(
          `INSERT INTO credentials (player_id, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(playerId, passwordHash, session.createdAt, session.createdAt);
      this.insertSession(playerId, session);

      return {
        login: input.loginDisplay,
        countryName: input.countryNameDisplay,
      } satisfies AuthProfile;
    });

    return create();
  }

  findAccount(loginNormalized: string): AccountForAuthentication | undefined {
    const row = this.database
      .prepare(
        `SELECT p.id AS player_id, p.login_display, c.country_name_display, cr.password_hash
         FROM players p
         INNER JOIN countries c ON c.player_id = p.id
         INNER JOIN credentials cr ON cr.player_id = p.id
         WHERE p.login_normalized = ?`,
      )
      .get(loginNormalized) as AccountRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      playerId: row.player_id,
      profile: {
        login: row.login_display,
        countryName: row.country_name_display,
      },
      passwordHash: row.password_hash,
    };
  }

  createSession(playerId: number, session: NewSession): void {
    this.insertSession(playerId, session);
  }

  findActiveSession(tokenDigest: string, now: number): ActiveSession | undefined {
    const row = this.database
      .prepare(
        `SELECT p.id AS player_id, p.login_display, c.country_name_display
         FROM sessions s
         INNER JOIN players p ON p.id = s.player_id
         INNER JOIN countries c ON c.player_id = p.id
         WHERE s.token_digest = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > ?`,
      )
      .get(tokenDigest, now) as SessionProfileRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      playerId: row.player_id,
      profile: {
        login: row.login_display,
        countryName: row.country_name_display,
      },
    };
  }

  revokeSession(tokenDigest: string, now: number): void {
    this.database
      .prepare('UPDATE sessions SET revoked_at = ? WHERE token_digest = ? AND revoked_at IS NULL')
      .run(now, tokenDigest);
  }

  revokeAllSessions(playerId: number, now: number): void {
    this.database
      .prepare('UPDATE sessions SET revoked_at = ? WHERE player_id = ? AND revoked_at IS NULL')
      .run(now, playerId);
  }

  private insertSession(playerId: number, session: NewSession): void {
    this.database
      .prepare(
        `INSERT INTO sessions (player_id, token_digest, persistent, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(playerId, session.tokenDigest, session.persistent ? 1 : 0, session.createdAt, session.expiresAt);
  }
}
