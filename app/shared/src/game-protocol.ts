import { z } from 'zod';

const PlayerProfileSchema = z
  .object({
    login: z.string().min(1),
    countryName: z.string().min(1),
  })
  .strict();

export const GameSnapshotSchema = z
  .object({
    worldName: z.string().min(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    turn: z.number().int().positive(),
    eventSequence: z.number().int().nonnegative(),
    player: PlayerProfileSchema,
  })
  .strict();

export type GameSnapshot = z.infer<typeof GameSnapshotSchema>;

export const GameEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('TURN_ADVANCED'),
      turn: z.number().int().positive(),
    })
    .strict(),
]);

export type GameEvent = z.infer<typeof GameEventSchema>;

export const GameCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('END_TURN'),
      turn: z.number().int().positive(),
      clientSequence: z.number().int().nonnegative(),
    })
    .strict(),
]);

export type GameCommand = z.infer<typeof GameCommandSchema>;

export const GameCommandResultSchema = z
  .object({
    accepted: z.literal(true),
    turn: z.number().int().positive(),
    eventSequence: z.number().int().nonnegative(),
    awaitingPlayers: z.number().int().nonnegative(),
  })
  .strict();

export type GameCommandResult = z.infer<typeof GameCommandResultSchema>;

export const GameEventEnvelopeSchema = z
  .object({
    type: z.literal('game.events'),
    worldName: z.string().min(1),
    turn: z.number().int().positive(),
    firstSequence: z.number().int().positive(),
    events: z.array(GameEventSchema).min(1),
  })
  .strict();

export type GameEventEnvelope = z.infer<typeof GameEventEnvelopeSchema>;

export const GameSocketMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('game.snapshot'),
      snapshot: GameSnapshotSchema,
    })
    .strict(),
  GameEventEnvelopeSchema,
]);

export type GameSocketMessage = z.infer<typeof GameSocketMessageSchema>;
