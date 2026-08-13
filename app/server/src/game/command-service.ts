import { GameCommandSchema, type GameCommandResult } from '@arcanorum/shared';
import { AuthHttpError } from '../errors.js';
import type { GameService } from './game-service.js';

/** Network adapter boundary: parse untrusted DTOs before simulation/persistence receives them. */
export class GameCommandService {
  constructor(private readonly gameService: GameService) {}

  execute(playerId: number, body: unknown): GameCommandResult {
    const parsed = GameCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthHttpError(400, 'COMMAND_REJECTED');
    }
    return this.gameService.submitCommand(playerId, parsed.data);
  }
}
