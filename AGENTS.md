# Arcanorum Engineering Constitution

Arcanorum is a deterministic, turn-based 4X/grand-strategy game by Protyv_Kultury.
These instructions define architectural boundaries for agents working in this repository.

## Rule strictness

- `MUST` / `MUST NOT`: mandatory constraints. Agents may not relax them because another design seems more convenient.
- `SHOULD` / `SHOULD NOT`: default guidance. Deviations require a concrete local reason and must preserve the invariants.
- `MAY`: permitted when it fits the responsibility of the subsystem.

If local code conflicts with this file, inspect the existing architecture first. Existing patterns may be extended, but may not weaken determinism, validation, module boundaries, or save/replay ownership.

## Architectural invariants

These constraints are mandatory:

- The server is authoritative for gameplay state and turn resolution.
- Simulation must be deterministic and replayable from initial state, commands, and explicit RNG state.
- Identical initial state + identical commands + identical RNG state must produce identical results.
- Client state must never be authoritative for simulation.
- Simulation must not depend on React, Phaser, Zustand, browser APIs, rendering, animation, camera, or UI code.
- Rendering and UI must consume simulation state/events; they must not mutate authoritative state directly.
- Game content must be data-driven and validated before entering simulation.
- Persistent entities must use stable IDs; serialized references must use IDs rather than object pointers.
- Turn resolution follows the documented WEGO pipeline and stable ordering rules.
- Required data, assets, schemas, commands, IDs, and localization keys fail explicitly when missing or invalid.
- Wall-clock time, ambient randomness, unordered iteration, and platform-dependent behavior must not affect authoritative gameplay.
- No agent may replace an approved technology, introduce a new subsystem, or change a public contract without explicit user approval.

## Agent instruction order

Before changing files, read in this order:

1. This root `AGENTS.md`.
2. Relevant workflow files in `/skills`.
3. The nearest local `AGENTS.md` files in every folder being changed.
4. Relevant documents in `/docs`.

Required references when relevant:

- `skills/phaser-hex-map-capabilities.md` for hex-map rendering and authoring.
- `skills/phaser-standards.md` for Phaser scenes, assets, tilemaps, cameras, input, lifecycle, performance, and renderer boundaries.
- `skills/code_standards.md` for TypeScript and code shape.
- `skills/verification.md` for risk-based checks.
- `docs/deterministic-simulation-contract.md` for simulation, commands, RNG, replay, and events.
- `docs/content-loading-and-modding.md` for content loading, layering, validation, and compilation.

## Approved technology stack

The following are approved defaults, not universal requirements:

| Responsibility | Approved default |
|---|---|
| Client UI | React |
| World renderer | Phaser 4 |
| Client UI state | Zustand |
| Server/runtime | Node.js + TypeScript |
| Persistence | SQLite |
| Map authoring | Tiled |
| Runtime validation | Zod |
| Network transport | WebSocket (`ws`) |
| Build/dev | Vite |
| Tests | Vitest + Playwright |
| Procedural generation | seeded `simplex-noise` |
| Quality | ESLint + Prettier |

Use the approved technology when it fits the responsibility of the subsystem. Do not force a stack technology into an unrelated subsystem.

### Responsibility boundaries

React is for menus, HUDs, dialogs, tooltips, production, diplomacy, and technology screens. It is not for simulation, pathfinding, combat resolution, or authoritative state.

Phaser is for map rendering, sprites, animations, camera, visual effects, and world-input interaction. It is not for authoritative world state, economy, combat calculation, turn resolution, or save format.

Zustand is for selections, map modes, opened panels, hover state, camera-related UI state, and cached server state. It is not for authoritative population, treasury, unit HP, production progress, or simulation state.

SQLite is a persistence implementation. Simulation must depend on domain serialization/contracts, not directly on SQLite.

## Allowed alternatives

Approved technologies are defaults, not universal requirements. An alternative may be proposed only when:

1. the approved technology cannot satisfy the requirement;
2. the alternative has a measurable architectural, correctness, or performance benefit;
3. architectural invariants and module boundaries remain intact; and
4. unnecessary duplication is avoided.

Replacing an approved technology requires explicit user approval before implementation. The proposal must state the problem, alternatives considered, measurable benefit, migration cost, and consequences. Significant decisions belong in an ADR when an ADR location exists.

## Data formats and content pipeline

JSON is the canonical authoring format for structured gameplay content: rules, goods, buildings, production methods, technologies, laws, governments, cultures, religions, resources, units, modifiers, scripted triggers/effects, events, decisions, scenarios, localization data, and mod metadata.

JSON is not required to be the runtime, persistence, network, map, localization, or cache representation. Domain-specific formats are allowed when they have a clear responsibility and pass through an explicit loader, validation, and normalization boundary. Examples include Tiled JSON/TMX, compiled spatial data, SQLite persistence, compressed or binary runtime data, and dedicated asset formats.

The intended pipeline is:

```text
authoring sources → loaders → Zod validation → deterministic layering
→ reference resolution → canonical typed model → runtime compilation
→ simulation / renderer / network / persistence
```

Generated runtime data must not become the canonical authoring source when a human-editable source exists. Do not introduce a new canonical authoring format without explicit approval.

## Save and replay ownership

Simulation must not depend on the physical save-file container or database format. Persistence owns serialization and deserialization of the authoritative state, while replay owns command/event recording.

At the current development stage, agents are not required to design save migrations or long-term compatibility policy. They must still preserve deterministic state serialization, reject malformed or incomplete saves explicitly, and avoid silently dropping unknown required data. Any future save container or compression must remain behind the persistence boundary.

## Deterministic turn simulation

Authoritative gameplay must use explicit deterministic RNG state. Every player command must be serializable and server-validatable. Simultaneous commands are validated against the initial turn state, then resolved by documented priority and stable IDs.

Authoritative math must avoid floating point unless the relevant contract specifies fixed rounding. Rendering, animation, camera, UI layout, and non-authoritative previews may use floating point.

Preferred pipeline:

1. Collect local and network commands.
2. Validate against the initial turn state.
3. Sort by deterministic priority and stable IDs.
4. Resolve movement and tactical conflicts.
5. Resolve combat.
6. Resolve production, goods, employment, upkeep, and markets.
7. Resolve politics, diplomacy, events, and end-of-turn effects.
8. Emit typed events for UI, logs, replay, and multiplayer sync.
9. Advance the turn and explicit RNG state.

See `docs/deterministic-simulation-contract.md` for the detailed contract.

## Entity and ID policy

- Persistent entities MUST have stable IDs.
- Runtime IDs SHOULD be strongly typed.
- Rule/content definitions use stable string IDs.
- ID generation must be deterministic and stored in authoritative state.
- IDs must not be reused within a save/game session unless a documented safe-reuse policy exists.
- Runtime compilation may resolve string rule IDs to dense numeric indexes, but the source IDs remain the external/modding identity.

## Validation and fallback policy

Required data is never hidden by fallback behavior. Missing or invalid required content, assets, rules, schemas, IDs, localization keys, commands, save fields, network messages, or systems must produce an explicit diagnostic and stop the affected load/startup path.

Fallbacks are allowed only when the field is documented as optional, the deterministic default is defined in its schema/loader, the diagnostic is visible, and the fallback does not conceal broken content or incomplete implementation.

Do not silently substitute placeholder textures, colors, icons, units, buildings, rule definitions, localization strings, gameplay values, scripts, effects, triggers, systems, IDs, compatibility shims, or catch-all exception handling.

## Definition of done

A change is complete only when:

- architectural invariants remain intact;
- deterministic behavior is preserved;
- external data is validated before use;
- required data/assets fail explicitly when invalid;
- new mechanics and non-obvious decisions are documented;
- relevant checks from `skills/verification.md` were run or explicitly reported unavailable;
- no unrelated files were modified.
