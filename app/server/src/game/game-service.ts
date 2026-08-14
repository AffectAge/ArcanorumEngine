import {
  GameCommandResultSchema,
  GameEventEnvelopeSchema,
  GameEventSchema,
  type AuthProfile,
  type GameCommand,
  type GameCommandResult,
  type GameEvent,
  type GameEventEnvelope,
  type GameSnapshot,
  type WorldBaseResponse,
} from '@arcanorum/shared';
import type { SqliteDatabase } from '../database.js';
import { AuthHttpError } from '../errors.js';
import { createGameSnapshot, resolveTurn } from './simulation/engine.js';
import { createInitialSimulationState, type SimulationState } from './simulation/state.js';

type GameStateRow = {
  readonly turn: number;
  readonly event_sequence: number;
};

type GameEventRow = {
  readonly sequence: number;
  readonly turn: number;
  readonly payload_json: string;
};

type ReadinessRow = {
  readonly client_sequence: number;
};

type WorldPlayerRow = {
  readonly player_id: number;
};

type EventSubscriber = (envelope: GameEventEnvelope) => void;

/** Persistence adapter for mutable game state. Static geography remains owned by WorldService. */
export class GameService {
  private readonly subscribers = new Set<EventSubscriber>();

  constructor(
    private readonly database: SqliteDatabase,
    private readonly world: Pick<WorldBaseResponse, 'worldName' | 'geometryRevision'>,
  ) {}

  initialize(): void {
    const initial = createInitialSimulationState();
    this.database
      .prepare(
        'INSERT INTO game_state (singleton, turn, event_sequence) VALUES (1, ?, ?) ON CONFLICT(singleton) DO NOTHING',
      )
      .run(initial.turn, initial.eventSequence);
  }

  getSnapshot(player: AuthProfile): GameSnapshot {
    return createGameSnapshot(this.readState(), player, this.world);
  }

  /**
   * Accounts are global. A world membership is created explicitly and records
   * the profile country name as immutable world state for this game.
   */
  joinPlayer(playerId: number, profile: AuthProfile): GameSnapshot {
    return this.database.transaction(() => {
      const state = this.readState();
      const existing = this.database
        .prepare('SELECT player_id FROM world_players WHERE player_id = ?')
        .get(playerId) as WorldPlayerRow | undefined;
      if (existing === undefined) {
        const countryId = createWorldCountryId(playerId);
        this.database
          .prepare(
            `INSERT INTO world_countries (id, owner_player_id, country_name_snapshot, created_turn)
             VALUES (?, ?, ?, ?)`,
          )
          .run(countryId, playerId, profile.countryName, state.turn);
        this.database
          .prepare('INSERT INTO world_players (player_id, country_id, joined_turn) VALUES (?, ?, ?)')
          .run(playerId, countryId, state.turn);
      }
      return createGameSnapshot(state, profile, this.world);
    })();
  }

  subscribe(listener: EventSubscriber): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  submitCommand(playerId: number, command: GameCommand): GameCommandResult {
    if (command.type !== 'END_TURN') {
      throw new AuthHttpError(400, 'COMMAND_REJECTED');
    }

    let emitted: GameEventEnvelope | undefined;
    const result = this.database.transaction(() => {
      const participant = this.database
        .prepare('SELECT player_id FROM world_players WHERE player_id = ?')
        .get(playerId) as WorldPlayerRow | undefined;
      if (participant === undefined) {
        throw new AuthHttpError(409, 'COMMAND_REJECTED');
      }
      const state = this.readState();
      if (command.turn !== state.turn) {
        throw new AuthHttpError(409, 'COMMAND_REJECTED');
      }

      const existingReadiness = this.database
        .prepare('SELECT client_sequence FROM game_turn_readiness WHERE turn = ? AND player_id = ?')
        .get(state.turn, playerId) as ReadinessRow | undefined;
      if (existingReadiness === undefined) {
        this.database
          .prepare(
            'INSERT INTO game_commands (turn, player_id, client_sequence, command_type, payload_json) VALUES (?, ?, ?, ?, ?)',
          )
          .run(state.turn, playerId, command.clientSequence, command.type, JSON.stringify(command));
        this.database
          .prepare('INSERT INTO game_turn_readiness (turn, player_id, client_sequence) VALUES (?, ?, ?)')
          .run(state.turn, playerId, command.clientSequence);
      } else if (existingReadiness.client_sequence !== command.clientSequence) {
        throw new AuthHttpError(409, 'COMMAND_REJECTED');
      }

      const playerCount = this.database.prepare('SELECT COUNT(*) AS count FROM world_players').get() as {
        count: number;
      };
      const readyCount = this.database
        .prepare('SELECT COUNT(*) AS count FROM game_turn_readiness WHERE turn = ?')
        .get(state.turn) as { count: number };
      if (playerCount.count === 0 || readyCount.count > playerCount.count) {
        throw new Error('WEGO readiness has an invalid player count.');
      }

      if (readyCount.count === playerCount.count) {
        const resolution = resolveTurn(state);
        this.database
          .prepare('UPDATE game_state SET turn = ?, event_sequence = ? WHERE singleton = 1')
          .run(resolution.nextState.turn, resolution.nextState.eventSequence);
        for (const event of resolution.events) {
          this.database
            .prepare('INSERT INTO game_events (sequence, turn, event_type, payload_json) VALUES (?, ?, ?, ?)')
            .run(
              resolution.nextState.eventSequence,
              resolution.nextState.turn,
              event.type,
              JSON.stringify(event),
            );
        }
        emitted = this.createEnvelope(
          resolution.nextState.eventSequence,
          resolution.nextState.turn,
          resolution.events,
        );
        return GameCommandResultSchema.parse({
          accepted: true,
          turn: resolution.nextState.turn,
          eventSequence: resolution.nextState.eventSequence,
          awaitingPlayers: 0,
        });
      }

      return GameCommandResultSchema.parse({
        accepted: true,
        turn: state.turn,
        eventSequence: state.eventSequence,
        awaitingPlayers: playerCount.count - readyCount.count,
      });
    })();

    if (emitted !== undefined) {
      for (const subscriber of this.subscribers) {
        subscriber(emitted);
      }
    }
    return result;
  }

  eventsAfter(sequence: number): readonly GameEventEnvelope[] {
    const rows = this.database
      .prepare(
        'SELECT sequence, turn, payload_json FROM game_events WHERE sequence > ? ORDER BY sequence ASC',
      )
      .all(sequence) as readonly GameEventRow[];
    const groups: GameEventEnvelope[] = [];
    for (const row of rows) {
      const parsed = parsePersistedEvent(row.payload_json, row.sequence);
      const previous = groups.at(-1);
      if (
        previous !== undefined &&
        previous.turn === row.turn &&
        previous.firstSequence + previous.events.length === row.sequence
      ) {
        groups[groups.length - 1] = this.createEnvelope(previous.firstSequence, previous.turn, [
          ...previous.events,
          parsed,
        ]);
      } else {
        groups.push(this.createEnvelope(row.sequence, row.turn, [parsed]));
      }
    }
    return groups;
  }

  private readState(): SimulationState {
    const row = this.database
      .prepare('SELECT turn, event_sequence FROM game_state WHERE singleton = 1')
      .get() as GameStateRow | undefined;
    if (row === undefined) {
      throw new Error('Game state is missing required singleton row.');
    }
    return { turn: row.turn, eventSequence: row.event_sequence };
  }

  private createEnvelope(
    firstSequence: number,
    turn: number,
    events: readonly GameEvent[],
  ): GameEventEnvelope {
    return GameEventEnvelopeSchema.parse({
      type: 'game.events',
      worldName: this.world.worldName,
      turn,
      firstSequence,
      events,
    });
  }
}

function createWorldCountryId(playerId: number): string {
  if (!Number.isSafeInteger(playerId) || playerId < 1) {
    throw new Error(`Cannot create a world country for invalid player ID: ${playerId}.`);
  }
  return `country.player.${playerId}`;
}

function parsePersistedEvent(payload: string, sequence: number): GameEvent {
  let source: unknown;
  try {
    source = JSON.parse(payload);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Persisted game event ${sequence} is invalid JSON: ${reason}`);
  }
  return GameEventSchema.parse(source);
}
