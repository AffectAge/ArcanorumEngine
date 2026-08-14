import { beforeEach, describe, expect, it } from 'vitest';
import type { GameSnapshot } from '@arcanorum/shared';
import { useGameStore } from './game-store.js';

const snapshot: GameSnapshot = {
  worldName: 'Test world',
  geometryRevision: 'a'.repeat(64),
  turn: 1,
  eventSequence: 0,
  player: { login: 'player', countryName: 'Country' },
};

describe('game client cache', () => {
  beforeEach(() => useGameStore.getState().clear());

  it('advances an ordered server event delta without owning simulation state', () => {
    useGameStore.getState().setSnapshot(snapshot);

    expect(
      useGameStore.getState().applyEvents({
        type: 'game.events',
        worldName: 'Test world',
        turn: 2,
        firstSequence: 1,
        events: [{ type: 'TURN_ADVANCED', turn: 2 }],
      }),
    ).toBe(true);
    expect(useGameStore.getState().snapshot).toMatchObject({ turn: 2, eventSequence: 1 });
    expect(useGameStore.getState().needsResync).toBe(false);
  });

  it('rejects a missing delta and explicitly requests a server snapshot', () => {
    useGameStore.getState().setSnapshot(snapshot);

    expect(
      useGameStore.getState().applyEvents({
        type: 'game.events',
        worldName: 'Test world',
        turn: 3,
        firstSequence: 2,
        events: [{ type: 'TURN_ADVANCED', turn: 3 }],
      }),
    ).toBe(false);
    expect(useGameStore.getState().needsResync).toBe(true);
    expect(useGameStore.getState().snapshot).toEqual(snapshot);
  });
});
