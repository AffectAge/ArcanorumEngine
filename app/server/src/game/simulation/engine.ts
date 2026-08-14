import type { AuthProfile, GameEvent, GameSnapshot } from '@arcanorum/shared';
import type { SimulationState } from './state.js';

/**
 * Pure simulation boundary. Rules will enter here through deterministic
 * commands; it deliberately knows neither Fastify nor SQLite.
 */
export function createGameSnapshot(
  state: SimulationState,
  player: AuthProfile,
  world: { readonly worldName: string; readonly geometryRevision: string },
): GameSnapshot {
  return {
    worldName: world.worldName,
    geometryRevision: world.geometryRevision,
    turn: state.turn,
    eventSequence: state.eventSequence,
    player,
  };
}

/** Resolves the currently empty WEGO turn without consulting persistence or wall-clock time. */
export function resolveTurn(state: SimulationState): {
  readonly nextState: SimulationState;
  readonly events: readonly [GameEvent];
} {
  const turn = state.turn + 1;
  return {
    nextState: { turn, eventSequence: state.eventSequence + 1 },
    events: [{ type: 'TURN_ADVANCED', turn }],
  };
}
