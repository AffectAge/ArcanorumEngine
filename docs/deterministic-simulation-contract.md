# Deterministic Simulation Contract

This document defines the minimum contract for authoritative Revival simulation.

## Inputs and outputs

For a fixed initial authoritative state, ordered command set, content model, and RNG state, the simulation must produce the same final state and the same ordered event stream on every supported runtime.

The renderer, UI, browser APIs, wall-clock time, locale, random global APIs, network arrival order, and database iteration order are not simulation inputs.

## Commands

Commands must be serializable, schema-validated, attributable to a player, associated with a turn, and validated against the turn's initial state before resolution. Invalid commands are rejected with structured diagnostics; they are not silently converted into no-ops.

Commands are ordered by an explicit phase priority followed by stable player/entity/sequence identifiers. Network arrival order must not determine gameplay order.

## RNG

Randomness must come from an explicit seeded RNG owned by authoritative state. Do not use `Math.random()`, timestamps, UUID generators, or ambient process state. If multiple domains need randomness, prefer named deterministic streams so adding an unrelated roll does not shift every later result.

## Numeric rules and iteration

Authoritative calculations use integers or fixed-point values. Every division, percentage, and rounding rule must be explicit. Collections whose iteration affects state or emitted events must be arrays with documented order or be sorted by stable ID before iteration.

## Phases and events

Turn phases follow the pipeline in `AGENTS.md`. Systems must emit typed, serializable events for meaningful state changes. Events are ordered deterministically and must not contain renderer objects, functions, or process-local pointers.

## Replay and diagnostics

A reproducibility record should include the initial-state identity, content identity, turn, ordered commands, and RNG state. Debug/test tooling may additionally record phase checksums and domain checksums. These are diagnostic contracts, not UI state.

## Boundaries

Simulation may depend on shared domain types, schemas, deterministic utilities, and compiled content. It must not import React, Phaser, Zustand, browser APIs, or persistence drivers.
