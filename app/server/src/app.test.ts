import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createApp } from './app.js';
import type { ServerConfig } from './config.js';

const TEST_CONFIG: ServerConfig = {
  nodeEnv: 'test',
  port: 3000,
  bindHost: '127.0.0.1',
  allowedOrigins: ['http://localhost:5173'],
  accountsPath: ':memory:',
  worldPath: ':memory:',
  worldAutoCreate: true,
  worldName: 'Test world',
  worldSeed: 'test-seed',
  worldGeneration: {
    width: 72,
    height: 54,
    topology: {
      mapStyle: 'continents',
      landCoverage: 0.36,
      candidateCount: 3,
      continentalGrain: 3,
      riftStrength: 0.68,
      islandFrequency: 0.4,
      edgeClearance: 2,
      outerOceanWidth: 2,
      coastRoughness: 0.45,
      coastalWaterWidth: 1,
      seaMinimumHexes: 8,
      seaEnclosureThreshold: 2,
    },
    tectonics: {
      plateCount: 8,
      activity: 0.65,
      boundaryFalloff: 6,
      collisionUplift: 260,
      subductionUplift: 190,
      trenchDepth: 120,
      riftDepth: 80,
      hotspotCount: 2,
    },
    relief: {
      seaLevel: 520,
      continentalBaseElevation: 75,
      oceanFloorDepth: 280,
      shelfWidth: 3,
      regionalNoiseScale: 32,
      regionalNoiseAmplitude: 65,
      detailNoiseScale: 8,
      detailNoiseAmplitude: 20,
    },
    climate: {
      equatorialTemperature: 880,
      polarTemperature: 220,
      elevationCooling: 0.55,
      windBandStrength: 650,
      moistureTransportPasses: 14,
      orographicStrength: 700,
      evaporationStrength: 420,
      rainfallNoise: 45,
    },
    hydrology: {
      minimumLakeHexes: 2,
      maximumLakeCoverage: 0.02,
      lakeWaterBalanceThreshold: 70,
      channelInitiationRunoff: 2200,
      erosionPasses: 2,
      streamPowerStrength: 18,
      maximumIncisionPerPass: 10,
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

  it('serves world geometry as authenticated chunks and keeps mutable state separate', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/world/base' });
    expect(unauthenticated.statusCode).toBe(401);

    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const worldResponse = await app.inject({
      method: 'GET',
      url: '/api/world/base',
      headers: { cookie: cookieHeader(registrationResponse.headers['set-cookie']) },
    });

    expect(worldResponse.statusCode).toBe(200);
    expect(worldResponse.json()).toMatchObject({
      worldName: 'Test world',
      seed: 'test-seed',
      geometry: {
        width: 72,
        height: 54,
        visuals: {
          features: expect.arrayContaining([
            expect.objectContaining({ id: 'feature.mountain' }),
            expect.objectContaining({ id: 'feature.forest' }),
          ]),
        },
      },
    });
    expect(worldResponse.json().geometry.hexes).toBeUndefined();

    const chunkResponse = await app.inject({
      method: 'GET',
      url: '/api/world/chunks/0/0',
      headers: { cookie: cookieHeader(registrationResponse.headers['set-cookie']) },
    });
    expect(chunkResponse.statusCode).toBe(200);
    expect(chunkResponse.json().chunk.hexes).toHaveLength(32 * 32);
    expect(chunkResponse.json().chunk.visualNeighbors.length).toBeGreaterThan(0);

    const snapshotResponse = await app.inject({
      method: 'GET',
      url: '/api/game/snapshot',
      headers: { cookie: cookieHeader(registrationResponse.headers['set-cookie']) },
    });
    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json()).toMatchObject({ turn: 1, eventSequence: 0 });
  });

  it('advances only joined world players through a validated command and persists its event delta', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const unjoinedRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: {
        ...registration,
        login: 'Player_Not_Joined',
        countryName: 'Независимая Республика',
      },
    });
    expect(unjoinedRegistration.statusCode).toBe(201);
    const cookie = cookieHeader(registrationResponse.headers['set-cookie']);
    await joinWorld(app, cookie);
    const commandResponse = await app.inject({
      method: 'POST',
      url: '/api/game/commands',
      headers: { ...originHeaders, cookie },
      payload: { type: 'END_TURN', turn: 1, clientSequence: 0 },
    });

    expect(commandResponse.statusCode).toBe(200);
    expect(commandResponse.json()).toEqual({
      accepted: true,
      turn: 2,
      eventSequence: 1,
      awaitingPlayers: 0,
    });

    const snapshotResponse = await app.inject({
      method: 'GET',
      url: '/api/game/snapshot',
      headers: { cookie },
    });
    expect(snapshotResponse.json()).toMatchObject({ turn: 2, eventSequence: 1 });
  });

  it('resolves a WEGO turn only after every registered player submitted an end-turn command', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const firstRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    const secondRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: {
        ...registration,
        login: 'Player_Two',
        countryName: 'Вторая Республика',
      },
    });
    const firstCookie = cookieHeader(firstRegistration.headers['set-cookie']);
    const secondCookie = cookieHeader(secondRegistration.headers['set-cookie']);
    await joinWorld(app, firstCookie);
    await joinWorld(app, secondCookie);

    const firstCommand = await app.inject({
      method: 'POST',
      url: '/api/game/commands',
      headers: { ...originHeaders, cookie: firstCookie },
      payload: { type: 'END_TURN', turn: 1, clientSequence: 0 },
    });
    expect(firstCommand.statusCode).toBe(200);
    expect(firstCommand.json()).toEqual({
      accepted: true,
      turn: 1,
      eventSequence: 0,
      awaitingPlayers: 1,
    });

    const secondCommand = await app.inject({
      method: 'POST',
      url: '/api/game/commands',
      headers: { ...originHeaders, cookie: secondCookie },
      payload: { type: 'END_TURN', turn: 1, clientSequence: 0 },
    });
    expect(secondCommand.statusCode).toBe(200);
    expect(secondCommand.json()).toEqual({
      accepted: true,
      turn: 2,
      eventSequence: 1,
      awaitingPlayers: 0,
    });
  });

  it('sends an authenticated WebSocket client an authoritative game snapshot', async () => {
    app = await createApp({ config: TEST_CONFIG });
    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: originHeaders,
      payload: registration,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Test server did not expose a TCP address.');
    }

    const message = await readSocketMessage(
      new WebSocket(`ws://127.0.0.1:${(address as AddressInfo).port}/api/game/events`, {
        origin: TEST_CONFIG.allowedOrigins[0],
        headers: { cookie: cookieHeader(registrationResponse.headers['set-cookie']) },
      }),
    );

    expect(message).toMatchObject({
      type: 'game.snapshot',
      snapshot: { worldName: 'Test world', turn: 1, eventSequence: 0 },
    });
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

  it('keeps accounts and country names after the world directory is deleted', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'arcanorum-account-storage-'));
    const persistentConfig: ServerConfig = {
      ...TEST_CONFIG,
      accountsPath: join(storageRoot, 'server-data', 'accounts.sqlite'),
      worldPath: join(storageRoot, 'world'),
    };

    try {
      app = await createApp({ config: persistentConfig });
      const registrationResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: originHeaders,
        payload: registration,
      });
      expect(registrationResponse.statusCode).toBe(201);
      await app.close();
      app = undefined;

      rmSync(persistentConfig.worldPath, { force: true, recursive: true });

      app = await createApp({ config: persistentConfig });
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: originHeaders,
        payload: { login: registration.login, password: registration.password, rememberMe: false },
      });
      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.json()).toEqual({
        player: { login: registration.login, countryName: registration.countryName },
      });

      const cookie = cookieHeader(loginResponse.headers['set-cookie']);
      const joinResponse = await app.inject({
        method: 'POST',
        url: '/api/game/join',
        headers: { ...originHeaders, cookie },
      });
      expect(joinResponse.statusCode).toBe(200);
      expect(joinResponse.json()).toMatchObject({
        player: { login: registration.login, countryName: registration.countryName },
      });
    } finally {
      await app?.close();
      app = undefined;
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});

async function joinWorld(app: FastifyInstance, cookie: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/game/join',
    headers: { ...originHeaders, cookie },
  });
  expect(response.statusCode).toBe(200);
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (value === undefined) {
    throw new Error('Expected a session cookie.');
  }
  return value.split(';')[0] ?? value;
}

function readSocketMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Timed out waiting for a game socket message.'));
    }, 3_000);
    socket.once('message', (data) => {
      clearTimeout(timeout);
      socket.close();
      try {
        resolve(JSON.parse(String(data)));
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
