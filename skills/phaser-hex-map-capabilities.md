---
description: Reference for using Phaser 4 and Tiled capabilities in hex
  strategy maps. Explains what each API does, when to use it,
  limitations, and official documentation.
name: phaser-hex-map-capabilities
---

# Phaser + Tiled Hex Map Capabilities

## Purpose

This is a **usage reference**, not an implementation recipe. When a map
task appears, identify the capability you need and use the corresponding
Phaser or Tiled API.

## Quick reference

  Need                                  Capability
  ------------------------------------- -----------------------------
  Store a hex tile grid                 Phaser `Tilemap`
  Render a tile layer                   `TilemapLayer`
  Map tile IDs to atlas imagery         `Tileset`
  Pick a hex from pointer coordinates   `worldToTileXY`
  Convert tile to world pixels          `tileToWorldXY`
  Color tiles for simple map modes      Tile/TilemapLayer tint
  Clip pixels                           Geometry Mask / Bitmap Mask
  Independent map object                Sprite / Game Object
  Short-lived mass effects              ParticleEmitter
  Visually author a hex map             Tiled
  Paint grid-aligned content            Tiled Tile Layer
  Place arbitrary objects + metadata    Tiled Object Layer
  Export editor data                    Tiled JSON

## 1. Phaser Tilemap

Docs:
https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemap

`Tilemap` stores map data. It is not itself the visible map;
`TilemapLayer` renders layers.

Phaser supports Orthogonal, Isometric, Hexagonal and Staggered
orientations.

Useful methods include:

``` ts
map.worldToTileXY(worldX, worldY);
map.tileToWorldXY(tileX, tileY);
map.getTileAt(tileX, tileY);
map.putTileAt(index, tileX, tileY);
map.removeTileAt(tileX, tileY);
map.getTilesWithinWorldXY(x, y, width, height);
```

Use Tilemap for grid data, tile lookup, runtime tile changes and
coordinate conversion.

For Hexagonal maps use `worldToTileXY`. Phaser documents that separate
`worldToTileX` / `worldToTileY` calls cannot determine a hex because
both coordinates are required.

## 2. TilemapLayer

Docs:
https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemaplayer

`TilemapLayer` is the Game Object that renders one Tilemap layer.

Use separate layers when you need independent visibility, alpha, tint,
depth or updating, for example:

``` text
terrain
roads
rivers
selection
map-mode overlay
```

Phaser documents that TilemapLayer performs camera culling and only
sends visible tiles to the renderer. It has orientation-specific
culling, including Hexagonal culling.

Useful capabilities include `setVisible`, `setAlpha`, `setTint`, tint
modes, depth and custom `cullCallback`.

## 3. Tile

Docs: https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tile

A `Tile` is a lightweight data object inside a layer. It is **not** a
Phaser Game Object.

It stores tile index, grid position, dimensions, collision information
and optional custom properties imported from Tiled.

Use a Tile for grid-cell data. Use a Sprite/Game Object when an item
needs its own transform, animation, input or lifecycle.

## 4. Tileset

Docs:
https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tileset

A `Tileset` maps tile indexes to imagery in a tileset image and stores
tile dimensions, spacing, margins, properties and collision data.

Typical concept:

``` text
1 → grass
2 → desert
3 → snow
4 → road variant
```

Use a Tileset when many cells reuse imagery from a tile sheet/atlas.

## 5. Hex picking and coordinate conversion

Docs:
https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemap

Use:

``` ts
map.worldToTileXY(pointer.worldX, pointer.worldY, true);
```

for hover, selection, placement and commands.

Use:

``` ts
map.tileToWorldXY(tileX, tileY);
```

when positioning world objects relative to a tile.

This often removes the need for one interactive Sprite per hex.

## 6. Tilemap culling

Docs:
https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemaplayer

TilemapLayer includes camera culling. Use it before inventing manual
per-frame tile visibility loops.

Override `cullCallback` only when the built-in behavior is insufficient
and profiling justifies a custom policy.

## 7. Tinting and simple strategy map modes

Docs:
https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemaplayer

TilemapLayer supports tinting. Phaser 4 documents tint modes including
MULTIPLY, FILL, ADD, SCREEN, OVERLAY and HARD_LIGHT.

Useful for:

``` text
political coloring
selection
diplomatic highlighting
debug modes
simple heatmaps
```

Example:

``` ts
layer.setTint(0x3b62a8, tileX, tileY, 1, 1);
```

Tint is a capability, not a guarantee that per-tile tinting is optimal
at every map scale. Benchmark large/high-frequency map modes before
committing to it.

## 8. Masks

Docs: https://docs.phaser.io/phaser/concepts/display/masks

Masks control which pixels of Game Objects are visible.

**Geometry Mask**: use geometric shapes for clipping/reveal.

**Bitmap Mask**: use texture/alpha information for irregular or soft
visibility.

Good uses:

``` text
fog of war
soft snow/climate coverage
pollution
coast/water effects
irregular reveals
```

Masks solve pixel visibility. They do not understand gameplay concepts
such as road/forest collision; object-placement logic belongs outside
the mask API.

## 9. Sprites and Game Objects

Docs: https://docs.phaser.io/phaser/concepts/gameobjects

Use a Game Object when something needs independent position, scale,
rotation, depth, animation, input, visibility or lifecycle.

Examples:

``` text
city icon
army
mountain decoration
tree decoration
resource marker
port
animated marker
```

Do not turn every Tile into a Sprite unless those extra capabilities are
needed.

## 10. Particles

Docs:
https://docs.phaser.io/api-documentation/class/gameobjects-particles-particleemitter

Use Phaser particles for large numbers of recyclable/transient visual
elements:

``` text
smoke
rain
snow
sparks
dust
battle effects
```

Do not assume particles are the right representation for permanent world
entities such as roads, cities or persistent forests.

## 11. Tiled

Docs: https://docs.mapeditor.org/en/latest/manual/introduction/

Tiled is a standalone map editor. It supports Hexagonal maps plus Tile,
Object, Image and Group layers and custom properties.

Use Tiled when a human needs to visually author or inspect map content:

``` text
historical scenarios
hand-painted terrain
roads
capital/resource placement
spawn points
special locations
debug maps
```

Tiled is optional for procedural maps.

## 12. Tiled JSON

Docs: https://docs.mapeditor.org/en/latest/reference/json-map-format/

Tiled exports JSON. Hex maps include hex-specific fields such as
`hexsidelength`, plus layers, dimensions and tileset references.

Typical workflow:

``` text
Tiled → JSON → Phaser parser or custom importer → runtime
```

A project may convert Tiled JSON into its own scenario format rather
than using Tiled structures at runtime.

## 13. Tiled Tile Layers

Docs: https://docs.mapeditor.org/en/latest/manual/layers/

Use Tile Layers for grid-aligned painted content:

``` text
terrain
road tiles
river tiles
terrain detail
markers
```

They are suited to repeated tile imagery. Use Object Layers when
arbitrary positioning or per-object metadata is more important.

## 14. Tiled Object Layers

Docs: https://docs.mapeditor.org/en/latest/manual/objects/

Object Layers contain freely positioned objects and can carry custom
properties.

Good uses:

``` text
cities
capitals
spawn points
special buildings
paths
zones
script triggers
named locations
```

Conceptual metadata:

``` text
type = city
country = FRA
capital = true
population = 450000
```

## 15. Tiled custom properties

Docs: https://docs.mapeditor.org/en/latest/manual/custom-properties/

Use custom properties to annotate authored content with project-specific
metadata, such as:

``` text
countryId
resourceId
terrainTag
spawnType
historicalName
importance
```

Validate imported values before using them as game data.

## 16. Tiled Tilesets

Docs: https://docs.mapeditor.org/en/latest/manual/editing-tilesets/

Use Tiled Tilesets to organize reusable tile imagery, tile properties
and animation.

Phaser's `Tileset` consumes tileset information when parsing Tiled map
data.

## 17. Phaser + Tiled documented workflow

Phaser Editor docs:
https://docs.phaser.io/phaser-editor/v4/scene-editor/game-objects/tilemap-object

The documented editor workflow is:

``` text
create map in Tiled
→ export JSON
→ import map and tileset images
→ create Phaser Tilemap
→ create TilemapLayer objects
```

For procedural maps, Tiled is not required.

## 18. Procedural vs authored maps

**Procedural:**

``` text
settings/seed → generator → tile data → Phaser
```

**Authored:**

``` text
Tiled → JSON → Phaser/importer
```

**Hybrid:**

``` text
generator → generated base → designer overrides/annotations → runtime
```

Choose the workflow according to where the source map comes from.

## 19. TilemapGPULayer caveat

Phaser Tilemap docs:
https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemap

Phaser 4 exposes `TilemapGPULayer`, but current official documentation
warns that it currently works properly with orthographic tilemaps.

For a Hexagonal project, do not assume `TilemapGPULayer` is available
for the required behavior. Re-check current Phaser documentation before
adopting it because Phaser 4 is evolving.

## 20. Capability selection table

  Requirement                         Prefer
  ----------------------------------- --------------------
  Repeated grid-aligned terrain       Tile
  Grid-aligned road/river variant     Tile
  Independent icon/object             Sprite/Game Object
  Animated unit                       Sprite
  Pixel clipping/reveal               Mask
  Rain/smoke/sparks                   Particle system
  Human-painted grid data             Tiled Tile Layer
  Human-authored arbitrary position   Tiled Object
  Reusable tile imagery/properties    Tileset
  Pointer → hex                       `worldToTileXY`
  Hex → world position                `tileToWorldXY`
  Simple per-tile coloring            TilemapLayer tint

## 21. Performance-oriented usage

Use the built-in capability that matches the problem before adding
custom machinery.

-   `TilemapLayer`: repeated grid rendering + camera culling.
-   `Tile`: lightweight grid data.
-   `Sprite/Game Object`: flexible but heavier; use only when its
    behavior is needed.
-   `Mask`: clipping/reveal; avoid using it as a substitute for game
    logic.
-   `ParticleEmitter`: recyclable transient effects.
-   `Tiled`: offline authoring; no runtime rendering cost by itself.

Profile representative maps before replacing a built-in Phaser feature
with a custom renderer.

## 22. Version discipline

This reference targets current Phaser 4 documentation and current Tiled
documentation as of 2026-08.

Before relying on behavior that may change between Phaser versions:

1.  check the exact Phaser version in `package.json`;
2.  open that version's official API documentation;
3.  verify signatures and limitations;
4.  prefer official docs over old tutorials or Stack Overflow answers.

## Official documentation index

### Phaser

-   Tilemap:
    https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemap
-   TilemapLayer:
    https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tilemaplayer
-   Tile:
    https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tile
-   Tileset:
    https://docs.phaser.io/api-documentation/4.0.0/class/tilemaps-tileset
-   Tilemaps namespace:
    https://docs.phaser.io/api-documentation/4.0.0/namespace/tilemaps
-   Masks: https://docs.phaser.io/phaser/concepts/display/masks
-   Game Objects: https://docs.phaser.io/phaser/concepts/gameobjects
-   ParticleEmitter:
    https://docs.phaser.io/api-documentation/class/gameobjects-particles-particleemitter
-   Phaser Editor Tilemap workflow:
    https://docs.phaser.io/phaser-editor/v4/scene-editor/game-objects/tilemap-object

### Tiled

-   Introduction:
    https://docs.mapeditor.org/en/latest/manual/introduction/
-   Layers: https://docs.mapeditor.org/en/latest/manual/layers/
-   Objects: https://docs.mapeditor.org/en/latest/manual/objects/
-   Custom properties:
    https://docs.mapeditor.org/en/latest/manual/custom-properties/
-   Tilesets:
    https://docs.mapeditor.org/en/latest/manual/editing-tilesets/
-   JSON map format:
    https://docs.mapeditor.org/en/latest/reference/json-map-format/
