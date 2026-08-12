import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from './app.js';
import type { ServerConfig } from './config.js';

const TEST_CONFIG: ServerConfig = {
  nodeEnv: 'test',
  port: 3000,
  bindHost: '127.0.0.1',
  allowedOrigins: ['http://localhost:5173'],
  worldPath: ':memory:',
  worldAutoCreate: true,
  worldName: 'Test world',
  worldSeed: 'test-seed',
  worldGeneration: {
    width: 384,
    height: 256,
    continentCount: 2,
    continentCoverage: 0.36,
    continentMinimumSeparation: 12,
    outerOcean: { hardWidth: 3 },
    continentalPlacement: { edgeClearance: 4 },
    continentalAxes: {
      minimumCount: 3,
      maximumCount: 4,
      primaryLengthMinimumFactor: 0.55,
      primaryLengthMaximumFactor: 0.85,
      branchLengthMinimumFactor: 0.45,
      branchLengthMaximumFactor: 0.7,
      widthMinimumFactor: 0.55,
      widthMaximumFactor: 0.65,
      landThreshold: 0.01,
      separationWidth: 7,
      domainWarpScale: 64,
      domainWarpAmount: 9,
    },
    coastNoise: {
      macroScale: 96,
      macroAmplitude: 0.22,
      bayScale: 28,
      bayAmplitude: 0.16,
      detailScale: 8,
      detailAmplitude: 0.045,
    },
    topology: { smoothingPasses: 1, minimumIslandHexes: 6 },
    seaLevel: 520,
    islandCount: 5,
    islandMaximumRadius: 3,
    seaCount: 1,
    seaRadius: 2,
    seaChannelMinimumWidth: 1,
    seaChannelMaximumWidth: 1,
    seaChannelMeander: 0.2,
    lakeCount: 1,
    lakeRadius: 1,
    coastalWaterWidth: 1,
    mountainRangeCount: 2,
    mountainRangeMinimumLength: 7,
    mountainRangeMaximumLength: 14,
    mountainRangeWidth: 3,
    mountainRangeHeight: 230,
    riverFlowThreshold: 0.012,
    climate: {
      equatorialTemperature: 880,
      polarTemperature: 220,
      elevationCooling: 0.55,
      prevailingWind: 'west_to_east',
      rainfallNoise: 45,
    },
  },
  sessionHmacSecret: 'test-session-secret-must-have-at-least-thirty-two-characters',
  rateLimitHmacSecret: 'test-rate-limit-secret-must-have-at-least-thirty-two-characters',
  cookieSecure: false,
};

const originHeaders = { origin: TEST_CONFIG.allowedOrigins[0] };
const registration = {
  login: 'Player_One',
  countryName: 'Российская Империя',
  password: 'Very long registration password',
  passwordConfirmation: 'Very long registration password',
};

describe('authentication API', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('registers an account atomically and issues a session cookie', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      player: { login: 'Player_One', countryName: 'Российская Империя' },
    });
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).not.toContain('Max-Age');
  });

  it('serves the persisted generated world only to an authenticated player', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/world/map' });
    expect(unauthenticated.statusCode).toBe(401);

    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const worldResponse = await app.inject({
      method: 'GET',
      url: '/api/world/map',
      headers: { cookie: cookieHeader(registrationResponse.headers['set-cookie']) },
    });

    expect(worldResponse.statusCode).toBe(200);
    expect(worldResponse.json()).toMatchObject({
      worldName: 'Test world',
      seed: 'test-seed',
      map: {
        width: 384,
        height: 256,
        hexes: expect.any(Array),
        rivers: expect.any(Array),
      },
    });
    expect(worldResponse.json().map.hexes).toHaveLength(384 * 256);
    expect(worldResponse.json().map.rivers.length).toBeGreaterThan(0);
  });

  it('rejects duplicate country names using their normalized identity', async () => {
    app = await createApp({ config: TEST_CONFIG });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: { ...registration, login: 'player_two', countryName: 'российская империя' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'COUNTRY_NAME_TAKEN' } });
  });

  it('rejects a duplicate login independently of the country name', async () => {
    app = await createApp({ config: TEST_CONFIG });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: { ...registration, countryName: 'Другой Союз' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'LOGIN_TAKEN' } });
  });

  it('uses generic failures for unknown users and wrong passwords', async () => {
    app = await createApp({ config: TEST_CONFIG });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });

    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: originHeaders,
      payload: { login: 'unknown_user', password: 'Very long registration password', rememberMe: false },
    });
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: originHeaders,
      payload: { login: 'player_one', password: 'Wrong password with enough length', rememberMe: false },
    });

    expect(unknown.json()).toEqual({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(wrongPassword.json()).toEqual({ error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('issues a 30-day cookie only when rememberMe is selected', async () => {
    app = await createApp({ config: TEST_CONFIG });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: originHeaders,
      payload: { login: 'player_one', password: registration.password, rememberMe: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('Max-Age=2592000');
  });

  it('revokes only the current session through logout', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const cookie = cookieHeader(registrationResponse.headers['set-cookie']);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...originHeaders, cookie },
    });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });

    expect(logout.statusCode).toBe(204);
    expect(logout.headers['set-cookie']).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(me.statusCode).toBe(401);
  });

  it('rejects an expired browser-session token after its absolute lifetime', async () => {
    let now = 1_000_000;
    app = await createApp({ config: TEST_CONFIG, now: () => now });
    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const cookie = cookieHeader(registrationResponse.headers['set-cookie']);
    now += 12 * 60 * 60 + 1;

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });

    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('revokes every active session through logout-all', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const firstCookie = cookieHeader(registrationResponse.headers['set-cookie']);
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: originHeaders,
      payload: { login: 'player_one', password: registration.password, rememberMe: true },
    });
    const secondCookie = cookieHeader(secondLogin.headers['set-cookie']);

    const logoutAll = await app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
      headers: { ...originHeaders, cookie: firstCookie },
    });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: secondCookie } });

    expect(logoutAll.statusCode).toBe(204);
    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('limits repeated failures by the normalized login and IP address', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const payload = { login: 'unknown_user', password: registration.password, rememberMe: false };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: originHeaders,
        payload,
      });
      expect(response.statusCode).toBe(401);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: originHeaders,
      payload,
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: { code: 'TOO_MANY_ATTEMPTS' } });
  });
});

function cookieHeader(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (value === undefined) {
    throw new Error('Expected a session cookie.');
  }
  return value.split(';')[0] ?? value;
}
