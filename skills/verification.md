# Verification Guide

Run the smallest relevant checks first, then broader checks when the change warrants them. If a command or configuration is unavailable, report that explicitly.

| Change | Minimum checks |
|---|---|
| Authoritative simulation | unit tests, deterministic rerun/replay test, typecheck, lint |
| Commands/network schemas | schema tests, invalid-input tests, typecheck, relevant integration tests |
| Content/mod loaders | validation fixtures, layering/reference tests, typecheck, lint |
| Map generation/import | seeded repeatability test, representative map fixture, importer validation |
| Persistence | serialize/deserialize round-trip, malformed-input rejection, typecheck |
| React/Zustand UI | typecheck, lint, focused component tests |
| Phaser/map rendering | typecheck, focused browser smoke test, screenshot/manual visual check when practical |
| End-to-end gameplay | Playwright flow covering the changed behavior |

For deterministic changes, compare final state and ordered events from at least two runs with identical inputs. Never treat a passing renderer smoke test as proof that authoritative simulation is correct.
