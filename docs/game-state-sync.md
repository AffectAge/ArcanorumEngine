# World geometry and game-state synchronization

Static geography and mutable game state have separate ownership and transport paths.

## Static world geometry

`WorldService` owns generated geometry. `GET /api/world/base` returns the small world description, terrain catalog, stable geometry revision, diagnostics, landmasses, and water bodies. `GET /api/world/chunks/:q/:r` returns only one 32 x 32 geometry chunk (smaller at the map edge) and river edges touching it.

The renderer requests chunks around the Phaser camera and evicts chunks that leave the visible area. It never treats a renderer object or Zustand state as an authoritative world value.

## Mutable game state

`GameService` is a persistence adapter around the pure simulation engine. It stores the current turn and ordered event log; the simulation package knows neither Fastify nor SQLite.

The protocol has three distinct messages:

- `GET /api/game/snapshot` returns a small authenticated snapshot: player profile, world identity, geometry revision, turn, and last event sequence.
- `POST /api/game/commands` validates a serializable player command. The currently implemented command is `END_TURN`.
- `GET /api/game/events` upgrades to WebSocket and emits a snapshot followed by ordered event envelopes.

Event envelopes have a monotonically increasing `firstSequence`. The client applies an envelope only when it starts at `snapshot.eventSequence + 1`; otherwise it marks its cache out of sync and requests a fresh server snapshot. A WebSocket reconnect also receives a new snapshot before later events. Deltas therefore reduce repeated state transfer but never replace an authoritative resynchronization path.

## WEGO boundary

An `END_TURN` command records readiness for the current turn. The server resolves only after every currently registered player has submitted a valid command. Resolution creates the next state and the typed `TURN_ADVANCED` event in one SQLite transaction, then broadcasts that event after commit.

Later command kinds must remain schema-validated, associated with a turn and player, sorted deterministically by documented priority and stable IDs, and resolved only by the simulation engine.
