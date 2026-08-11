# Code Standards

These standards combine TypeScript's official guidance, the project's deterministic-simulation rules, and common ESLint/Prettier/Zod/Vitest practice. Local architecture may refine them but must not weaken the invariants in `AGENTS.md`.

## 1. TypeScript configuration

Use strict type checking for project code. The repository's `tsconfig.json` is the source of truth; when creating one, begin with the strict family and then document deliberate exceptions.

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true
  }
}
```

Do not disable strict checks to make a feature compile. Fix the type boundary or document a narrowly scoped exception.

## 2. Type inference and annotations

Use inference for local values when the initializer makes the type clear. Annotate public APIs, domain boundaries, callbacks whose context is not obvious, and values where the type is part of the contract.

```ts
const maxMovement = 6; // inferred as number

export function canMove(unit: Unit, cost: number): boolean {
  return unit.movementRemaining >= cost;
}
```

Use primitive lowercase types (`string`, `number`, `boolean`), never boxed `String`, `Number`, or `Boolean` types.

Avoid `any`: it disables type checking. Prefer `unknown` at an untrusted boundary, then narrow or validate it.

```ts
function readExternalValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected a string");
  }
  return value;
}
```

An explicit `any` requires a local justification comment and should be isolated at an interoperability boundary. Do not use `as` to silence a type error without proving the invariant at runtime.

## 3. Domain types and stable IDs

Use named types for domain concepts. For IDs that must not be accidentally mixed, prefer branded types or constructors.

```ts
export type CountryId = string & { readonly __brand: "CountryId" };
export type UnitId = string & { readonly __brand: "UnitId" };

export function countryId(value: string): CountryId {
  if (!/^country\.[a-z0-9_]+$/.test(value)) {
    throw new Error(`Invalid country ID: ${value}`);
  }
  return value as CountryId;
}
```

Do not use raw numbers or interchangeable strings for persistent IDs. Runtime numeric indexes may be introduced by deterministic compilation, but external rule IDs remain stable.

## 4. Interfaces, type aliases, and discriminated unions

Use a `type` for unions, intersections, and local data shapes. Use an `interface` when an object contract is intended to be extended by implementations or declaration merging. Choose one consistently within a module.

For commands and events, use discriminated unions so TypeScript can narrow safely.

```ts
type Command =
  | { readonly type: "MOVE_UNIT"; readonly unitId: UnitId; readonly target: Hex }
  | { readonly type: "END_TURN" };

function commandPhase(command: Command): "movement" | "turn-end" {
  switch (command.type) {
    case "MOVE_UNIT":
      return "movement";
    case "END_TURN":
      return "turn-end";
  }
}
```

When all cases must be handled, use an exhaustive helper so adding a command cannot silently change behavior.

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}
```

## 5. Functions and modules

Prefer pure functions for authoritative rules. A pure function should receive all gameplay inputs explicitly and return its result without reading clocks, globals, UI state, databases, or ambient randomness.

```ts
export function resolveDamage(
  attacker: AttackStats,
  defender: DefenseStats,
  roll: number,
): DamageResult {
  const raw = attacker.power + roll - defender.armor;
  return { amount: Math.max(0, raw) };
}
```

Keep functions focused. Split a function when it validates, mutates state, emits events, and performs unrelated calculations at once. Keep side effects at adapters/orchestration boundaries.

Allowed dependency direction:

```text
shared contracts / deterministic utilities
                 ↓
        authoritative simulation
                 ↓
       server orchestration / adapters

client UI and Phaser renderer consume shared state/events;
they do not become dependencies of simulation.
```

Simulation MUST NOT import React, Phaser, Zustand, browser APIs, or SQLite drivers.

## 6. External data and Zod

TypeScript types disappear at runtime. Validate JSON, network messages, mod files, scenario files, and save input at their boundary with Zod or an equivalent runtime schema.

```ts
import { z } from "zod";

const BuildingSchema = z.object({
  id: z.string().regex(/^building\.[a-z0-9_]+$/),
  baseWorkers: z.number().int().nonnegative(),
  production: z.record(z.string(), z.number().int().positive()),
});

export type BuildingDefinition = z.infer<typeof BuildingSchema>;

export function parseBuilding(input: unknown): BuildingDefinition {
  return BuildingSchema.parse(input);
}
```

Use `safeParse` when the caller must aggregate diagnostics; use `parse` when failure should stop the affected load path. Never cast unvalidated input directly to a domain type.

```ts
const result = BuildingSchema.safeParse(input);
if (!result.success) {
  return { ok: false, issues: result.error.issues };
}
return { ok: true, value: result.data };
```

Optional fields must have explicit documented defaults. Required fields must fail loudly; do not substitute empty rules, generated IDs, placeholder assets, or no-op effects.

## 7. Determinism and ordering

Every gameplay-relevant order must be explicit. Do not rely on object property order, database row order, network arrival order, filesystem enumeration, locale-dependent comparison, or incidental `Map` population order.

```ts
const orderedUnits = [...units].sort((a, b) =>
  a.id.localeCompare(b.id, "en", { sensitivity: "case" }),
);
```

For numeric or typed IDs, use an explicit comparator. Do not mutate an input collection merely to sort it. Avoid `localeCompare` if IDs are not string identities; use a documented byte/code-point comparator instead.

Do not use `Math.random()`, `Date.now()`, `new Date()`, UUID generation, or browser state in authoritative code. Pass an explicit RNG/state object instead.

```ts
export function resolveEvent(state: GameState, rng: Rng): Resolution {
  const roll = rng.nextInt(1, 100);
  return applyEvent(state, roll);
}
```

Authoritative arithmetic uses integers or documented fixed-point values. Every division and rounding operation must name its rule.

## 8. Mutation and state ownership

Authoritative state may use controlled mutation for performance, but ownership must be explicit and mutations must occur through the simulation owner. UI stores and renderers may not mutate server state or authoritative client snapshots.

Prefer immutable inputs and explicit result objects at system boundaries:

```ts
type Resolution = {
  readonly nextState: GameState;
  readonly events: readonly SimulationEvent[];
};
```

Do not expose internal mutable arrays or maps from a domain store. Return read-only views or controlled query methods.

## 9. Errors and diagnostics

Use structured errors for expected boundary failures. Include context such as file path, rule ID, field, expected value, and received value when practical.

```ts
export class ContentValidationError extends Error {
  constructor(
    message: string,
    readonly context: {
      readonly filePath: string;
      readonly ruleId?: string;
      readonly field?: string;
    },
  ) {
    super(message);
    this.name = "ContentValidationError";
  }
}
```

Do not catch an error only to log and continue with invalid state. Catch at a boundary when the caller can recover, add context, or terminate the affected operation explicitly.

## 10. Events and serialization

Simulation events and commands must be serializable data: primitives, arrays, plain objects, and stable IDs. Do not put class instances, functions, renderer objects, database handles, or raw pointers into them.

```ts
type UnitMoved = {
  readonly type: "UNIT_MOVED";
  readonly turn: number;
  readonly unitId: UnitId;
  readonly from: Hex;
  readonly to: Hex;
};
```

The simulation must not know whether persistence later writes JSON, a compressed container, or another representation.

## 11. Tests with Vitest

Name tests by behavior, keep fixtures deterministic, and test both valid and invalid boundaries.

```ts
import { describe, expect, it } from "vitest";

describe("resolveDamage", () => {
  it("never produces negative damage", () => {
    const result = resolveDamage(
      { power: 2 },
      { armor: 10 },
      0,
    );

    expect(result.amount).toBe(0);
  });
});
```

For deterministic systems, run the same initial state, command log, and RNG state twice and compare the final state and ordered event stream.

```ts
it("replays identically", () => {
  const first = runTurn(fixtureState(), fixtureCommands(), fixtureRng());
  const second = runTurn(fixtureState(), fixtureCommands(), fixtureRng());

  expect(second).toEqual(first);
});
```

Avoid tests that depend on wall-clock time, random global state, machine locale, filesystem enumeration, or actual network services unless those dependencies are explicitly controlled.

## 12. Naming, formatting, and comments

- `PascalCase` for types, classes, React components, and schemas.
- `camelCase` for variables, functions, and methods.
- `UPPER_SNAKE_CASE` only for true module constants where it improves clarity.
- Use `readonly` for data that must not be mutated through a given reference.
- Prefer descriptive names such as `movementCost` over `mc`.
- Use Prettier for formatting; do not hand-format around it.
- Use ESLint as configured by the repository; do not disable a rule inline without a reason.
- Comments explain invariants, deterministic choices, or non-obvious tradeoffs. They do not restate the code.

## Official references

- [TypeScript Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [TypeScript Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Zod Basics](https://zod.dev/basics)
- [Vitest Guide](https://vitest.dev/guide/)
- [typescript-eslint `no-explicit-any`](https://typescript-eslint.io/rules/no-explicit-any/)
- [Prettier Options](https://prettier.io/docs/options)
