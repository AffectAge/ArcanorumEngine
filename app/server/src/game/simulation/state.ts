export type SimulationState = {
  readonly turn: number;
  readonly eventSequence: number;
};

export function createInitialSimulationState(): SimulationState {
  return { turn: 1, eventSequence: 0 };
}
