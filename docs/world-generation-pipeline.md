# World generation pipeline

`app/server/src/world/generation/pipeline.ts` is the only orchestration entry point. It must not contain the implementation of a generation stage.

For a fixed seed, configuration, and terrain catalog, stages run in this exact order:

1. Create the odd-column hex grid and empty cells.
2. Create and place deformed, multi-axis continent plans; apply macro land and coast noise.
3. Add explicitly planned islands and clean micro-islands or unintended enclosed water.
4. Carve planned seas, lakes, and winding sea channels; force the configured outer-ocean border.
5. Add mountain ridges, then re-apply the outer ocean constraint.
6. Classify connected landmasses, water bodies, and the outer-ocean coastal-water band.
7. Calculate temperature and rainfall.
8. Priority-flood hydrology produces deterministic drainage, accumulation, and river edges.
9. Validate boundary water, ocean connectivity, and connected planned seas.

Each stage writes only the mutable generation context it owns. The pipeline records a checksum after every visible stage. A stage may be replaced or tested independently only if it preserves the input/output contract and deterministic ordering.

The generator creates static geography only: coordinates, terrain, elevation, climate, rivers, landmasses, and water bodies. Ownership, roads, settlements, armies, and every other turn-changing value belong to mutable game state and must not be added to `world_hexes`.
