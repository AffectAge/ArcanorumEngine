# Content Loading and Modding Contract

## Source and runtime representations

JSON is the canonical authoring format for structured gameplay content and mod metadata. Tiled JSON/TMX and other domain-specific sources are valid when owned by an explicit importer. Runtime structures may use arrays, indexes, typed stores, or compact numeric references.

The canonical source must remain human-editable. Compiled runtime data is derived output and must not be edited as source content.

## Loading pipeline

Load content in this order:

1. discover base content and enabled mods;
2. validate manifests and declared dependencies;
3. load source files;
4. apply deterministic base-first layering;
5. validate merged content;
6. resolve stable rule/entity references;
7. apply documented optional defaults;
8. compile the canonical model into runtime structures;
9. expose the compiled result to simulation and client systems.

Required failures stop the affected load path. Do not create dummy rules, generated IDs, empty scripts, or silent substitutions to continue startup.

## Mod order and identity

The base game loads first. Enabled mods load in an explicit stable order. Rule IDs are stable external identities and must not be silently renamed or reused for a different meaning. Overrides must be intentional and diagnosable.

## Validation

Use runtime schemas for external data. Diagnostics should include the source file, rule ID, field, expected type/range, received value, and the dependency/reference that failed when practical. Mod content is validated by the same rules as base content.

## Normalization and compilation

Normalization resolves references, validates cross-file relationships, applies only documented optional defaults, and produces a canonical typed model. Compilation may replace string references with dense indexes or SoA/domain stores for performance. The mapping must be deterministic and reproducible.

## Tiled and large maps

Tiled remains an authoring/import format for authored maps. Its JSON representation may use native arrays, Base64 data, compression, or chunks where supported. Do not force large maps into a hand-expanded object-per-tile representation. Import and validate map metadata before it becomes simulation data.
