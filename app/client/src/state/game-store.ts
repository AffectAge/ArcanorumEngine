import { create } from 'zustand';
import type { GameEventEnvelope, GameSnapshot } from '@arcanorum/shared';

type GameClientState = {
  readonly snapshot: GameSnapshot | undefined;
  readonly needsResync: boolean;
  setSnapshot: (snapshot: GameSnapshot) => void;
  applyEvents: (envelope: GameEventEnvelope) => boolean;
  clear: () => void;
};

/** Client cache only. The server remains authoritative for every game value. */
export const useGameStore = create<GameClientState>((set, get) => ({
  snapshot: undefined,
  needsResync: false,
  setSnapshot: (snapshot) => set({ snapshot, needsResync: false }),
  applyEvents: (envelope) => {
    const snapshot = get().snapshot;
    if (
      snapshot === undefined ||
      snapshot.worldName !== envelope.worldName ||
      snapshot.turn > envelope.turn ||
      envelope.firstSequence !== snapshot.eventSequence + 1
    ) {
      set({ needsResync: true });
      return false;
    }

    const eventSequence = envelope.firstSequence + envelope.events.length - 1;
    const lastEvent = envelope.events.at(-1);
    set({
      snapshot: {
        ...snapshot,
        eventSequence,
        turn: lastEvent?.type === 'TURN_ADVANCED' ? lastEvent.turn : snapshot.turn,
      },
      needsResync: false,
    });
    return true;
  },
  clear: () => set({ snapshot: undefined, needsResync: false }),
}));
