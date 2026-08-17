# Arcanorum strategic hex-map visual presets

These are original visual presets and copy-ready candidates. The current runtime terrain atlas is generated as a flat-color palette by `tools/generate-terrain-atlas.mjs`.

## Files

- `terrain-materials-preset-v1.png` — five material candidates, left to right: ocean, shallow/coastal water, sea, lake, land.
- `terrain-atlas-preset-v5.webp` — copy-ready RGBA/WebP terrain atlas, exactly `480×84`, arranged as five `96×84` frames in runtime order: ocean, coastal_water, sea, lake, land.
- `terrain-atlas-preset-v5-preview.png` — enlarged QA preview of the v5 terrain atlas; do not copy this preview into the game.
- `feature-overlays-preset-v1.png` — forest, mountain, river overlay, and forest-with-road-mask concept.
- `river-overlay-presets-v2.png` — six river connection concepts: straight, diagonal, bend, three-way fork, four-way junction, and widening.
- `terrain-features-presets-v2.png` — forest, mountains, rolling hills, dry scrubland, marsh, and snow-touched highland; intentionally contains no roads.
- `river-atlas-preset-v3.webp` — copy-ready RGBA river overlay atlas, exactly `768×672`, arranged as `8×8` frames of `96×84`; transparent outside the river channels.
- `river-atlas-preset-v3-preview.png` — QA preview of the same atlas composited over a neutral land color; do not copy this preview into the game.
- `terrain-atlas-preset-v6.webp` — legacy five-frame terrain candidate, exactly `480×84`.
- `terrain-atlas-preset-v6-preview.png` — QA preview of the v6 terrain atlas; do not copy this preview into the game.

## Review notes

- The water materials separate primarily by value and hue, while land stays warmer and brighter enough to read at strategic zoom.
- The forest-with-road tile uses a visible ochre corridor and a deliberate tree setback on both sides. Treat this as a compositing rule: apply the road mask before placing tree clusters, or use a dedicated forest-with-road variant.
- The river tile is shown over a dark neutral field to communicate an overlay layer; its blue is intentionally muted rather than neon.
- `river-atlas-preset-v3.webp` contains only the river channels. It has no grass, terrain fill, roads, bridges, labels, or other features; it is intended to sit above the terrain atlas as an RGBA overlay.
- The generated runtime terrain atlas is exactly `384×672`: four columns by eight rows of solid-color `96×84` frames, with transparent pixels outside every hex. It contains no patterns or painted details; roads, rivers, forests, and mountains remain separate layers.
- The terrain sheet keeps each base terrain material self-contained and excludes roads/paths so infrastructure can remain a separate overlay system.
- The v5 terrain atlas is runtime-sized and excludes roads, rivers, forests, mountains, and other overlays. Its hex corners are transparent.

## Manual evaluation / copying

1. Open the PNGs at 100% and at a reduced strategic-map scale.
2. Check that ocean/coastal water/sea/lake remain distinct from one another and from land without relying on outlines.
3. Test cropped hexes against adjacent tiles for visible seams; discard any crop whose texture breaks at the frame edge.
4. For overlays, test forest and road together. The road should clear a stable corridor before tree placement; do not paint the road over existing canopies.
5. For the copy-ready river candidate, verify dimensions and alpha, then manually copy it over the runtime river atlas only after backing up the current file.
6. Place neighboring river frames together and verify that branch endpoints meet cleanly without sudden width changes or bright seams.
7. For terrain, test contrast between the base terrain materials and keep roads/paths as a later composited layer.
8. For v5 specifically, confirm the deeper/calmer ocean, warmer lighter sea, subdued coastal water, clean blue-green lake, and four broad land accents at strategic zoom.
