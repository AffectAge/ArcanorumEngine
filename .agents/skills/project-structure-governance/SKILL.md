---
name: project-structure-governance
description: Govern Arcanorum file, folder, module, naming, and import organization. Use when creating, moving, renaming, splitting, deleting, or substantially refactoring repository files; when choosing a module for new code; or when auditing project structure. Do not use for a localized edit that clearly belongs in its existing file.
---

# Project Structure Governance

Keep the repository easy to navigate as it grows. Preserve the architectural invariants in the root `AGENTS.md`; this skill decides placement and code ownership, not gameplay design.

## Workflow

1. Read the root and nearest local `AGENTS.md` files, then inspect the target directory and its siblings before creating a file.
2. Reuse the existing module that owns the responsibility. Prefer an existing file when the change has the same focused responsibility.
3. Create a new folder only for a stable domain boundary or a coherent subsystem with multiple files. Do not create speculative folders or generic dumping grounds such as `misc`, `helpers`, or a project-wide `components` directory.
4. If placement is genuinely ambiguous, state the two plausible locations and ask the user before creating a new architectural boundary.
5. Keep the change local. Do not reorganize unrelated files as incidental cleanup.

## Arcanorum placement rules

### Shared contracts

Place cross-runtime DTOs, schemas, stable ID types, protocol messages, and serializable event definitions in `app/shared/src/`.

- `shared` MUST NOT import server, client, Phaser, React, browser, or database code.
- Do not place simulation rules, persistence, UI state, or renderer code here.
- Add or retain an `index.ts` only as an intentional public package boundary, not as a catch-all barrel.

### Server

Place server-only work by domain under `app/server/src/`.

- Keep HTTP and WebSocket adapters at the server boundary; they validate input and delegate.
- Keep authoritative deterministic rules in `game/simulation/`. They MUST NOT depend on Fastify, SQLite, sockets, clocks, ambient randomness, or client code.
- Keep command validation/orchestration in `game/`, separate from simulation rules when it has network or persistence concerns.
- Keep static world generation, terrain definitions, and world persistence in `world/`. Keep generation pipeline stages in `world/generation/stages/`; keep reusable hex geometry in `world/generation/geometry/`.
- Keep authentication, credentials, sessions, and rate limiting outside `game/`.
- Keep persistence adapters separate from the domain logic they store.

### Client

Organize product behavior by feature under `app/client/src/features/<feature>/`.

- Put feature-specific React UI, Phaser bridges, local helpers, and feature tests with that feature.
- Put reusable visual primitives only in `ui/`; do not promote a component to `ui/` until at least two independent features need it.
- Keep shared client transport in `api/`, app-level Zustand UI state in `state/`, and localization loading/resources in `i18n/`.
- Keep Phaser renderer scenes, layers, camera, and world input within `features/world/renderer/`. They consume server data and never own authoritative state.
- Treat `app/client/interface/templates/` as style/reference material. Do not move it into production UI or import/copy a template directly without explicit user approval.

### Content, data, and runtime output

- Keep canonical authored gameplay content in `content/`, and validate it through the documented loader pipeline.
- Keep local runtime world data in `world/`; it is not source code and must not be mixed into content definitions or database migrations.
- Do not put generated output, logs, test results, or temporary diagnostics beside source modules.

## Naming and file shape

- Use lowercase kebab-case for folders and non-component TypeScript filenames: `command-service.ts`, `hex-picker.ts`.
- Use PascalCase filenames for React components and Phaser scene classes: `WorldRenderer.tsx`, `WorldScene.ts`.
- Co-locate focused tests as `<module>.test.ts` or `<Component>.test.tsx`.
- Give each file one primary responsibility. Split it when it combines unrelated concerns, such as transport, persistence, deterministic rules, rendering, and UI state. File length alone is not a reason to split.
- Use an `index.ts` only to expose a deliberate module API. Never use it to conceal circular dependencies or to re-export an entire folder indiscriminately.

## Dependency direction

Maintain this direction unless the root `AGENTS.md` explicitly says otherwise:

```text
shared contracts and deterministic utilities
              ↓
authoritative simulation
              ↓
server orchestration and persistence adapters

client UI and Phaser renderer ──consume──> shared contracts and server responses
```

Do not introduce reverse dependencies, cross-feature imports that bypass a public feature API, or circular imports. Extract a narrow shared contract or utility only when at least two owners genuinely need it.

## Structural refactors

Before moving or splitting files, search for imports, tests, documentation, configuration, and runtime references. Preserve public contracts unless the user explicitly approved their change.

For a broad reorganization, first provide a small placement plan and wait for approval. After an approved structural change, verify affected imports and run the relevant typecheck, lint, and focused tests from `skills/verification.md`.

## Completion report

State which folders/files were created, moved, or split and why each belongs there. Report validation performed. If no structural change was needed, say that the existing placement was retained.
