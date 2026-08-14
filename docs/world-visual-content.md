# World Visual Content

World visual content is a client-only render projection. It can never decide
gameplay, mutate `WorldHex`, change the authoritative state, or reveal state
that the server did not include in a player-visible response.

## Authored layout

`content/world/visual/visual-catalog.json` explicitly lists every layer, asset,
signal, and feature file. The loader does not infer files from directory order.
Adding a visual component using an existing renderer primitive requires:

1. an asset in `app/client/public/assets/world/visual/`;
2. one asset definition JSON file;
3. one feature JSON file;
4. a manifest entry in `visual-catalog.json`.

The server validates every JSON definition and checks that every required asset
is inside the client public directory before exposing the catalog in the world
base response. Invalid paths, IDs, references, expression facts, rule ranges,
and signal cycles stop startup explicitly.

## Supported primitives

`sprite` places one texture on a qualifying hex. `scatter` generates a bounded
number of decorations according to an integer intensity score and declared
density thresholds. Both are rendered through a `SpriteGPULayer` per chunk,
visual layer, and texture key; their contents are constructed once when a chunk
loads and destroyed when it unloads.

Every visual renderer has a normalized `originX` and `originY` in the range
from `0` through `1`. Both default to `0.5`, so a texture is centered on the
hex. Set either field in an individual feature's `renderer` object when its
art needs another anchor: tall trees and mountains use `originY: 0.85` to put
their base on the hex center, while a ground texture such as a swamp uses
`originY: 0.5`.

`TilemapLayer` remains the primitive for terrain and connected river topology.
Every chunk response also includes a non-rendered one-hex `visualNeighbors`
halo. Neighbor-aware signals such as `neighbor.ruggedness` consume this halo,
so visual classification remains consistent across streamed chunk borders.
Future connected content can use that halo or explicit server-produced edge
masks when a full 6-bit connection mask is the better representation.

## Rules and scores

Features use an `all` group of validated conditions over source facts such as
`hex.elevation` and calculated `environment.*` signals. Expressions are a
bounded data format: `constant`, `fact`, `add`, `multiply`, `subtract`,
`remap`, and `clamp`. Scores are integer values from 0 through 1000. Arithmetic
clips every derived score to that range, and multiplication uses a documented
floor division by 1000.

Add a source fact only when a new server-provided, player-visible contract is
needed. Add a renderer primitive only when `sprite` or `scatter` genuinely
cannot represent the feature. Everything else is content, not a Phaser `if`.

## Stable decoration placement

Scatter is not random at runtime. Every candidate position and scale is hashed
from `world.seed`, hex coordinates, feature ID, candidate index, and axis. The
same world and visual catalog therefore recreate exactly the same forest or
rock placement after a chunk is unloaded and later loaded again. Changing the
world seed intentionally changes only the decorative distribution.

If a derived value later affects movement, combat, economy, visibility, or any
other gameplay rule, that value belongs in authoritative simulation and the
client must only render the result sent by the server.
