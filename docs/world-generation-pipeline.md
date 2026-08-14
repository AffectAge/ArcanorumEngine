# World generation pipeline v4

`app/server/src/world/generation/pipeline.ts` is the authoritative orchestration entry point.
Generation is deterministic and does not import persistence, Phaser, React, Zustand, clocks, or
ambient randomness. The public hex, landmass, water-body, and river-edge contracts remain unchanged.

Version 4 retains the emergent, Civilization-style global land field introduced in version 3 and
replaces the local marginal-sea heuristic with a deterministic, multi-scale basin-mouth classifier.
`landCoverage` is a world-scale target; the number, sizes, and shapes of connected landmasses and
seas are outcomes. A fixed number of land candidates is always generated and the best-scoring
candidate is selected. There is no unbounded retry loop and no seed-dependent "cannot find a
suitable island/continent hex" failure.

## Deterministic inputs and completion contract

The complete input is the world seed, validated generation configuration, and validated terrain
catalog. `config-compiler.ts` converts author-facing ratios to integers before allocating the grid.
Each plate, candidate, relief, and climate concern receives a named RNG/noise stream derived from
`worldSeed + streamName`.

For any configuration accepted by the schema and compiler, topology construction has a total path:

1. every candidate ranks the complete eligible interior;
2. the compiled global land target never exceeds that interior;
3. the highest-ranked cells always provide an initial mask;
4. enclosed salt-water holes are converted to land;
5. micro-land cleanup always retains the largest component; and
6. one of the configured candidates is always selected, even if every candidate has a poor aesthetic
   score.

The candidate score influences quality, not validity. Bugs, corrupt content, exhausted memory, or an
interrupted process can still stop startup; those are not geographical search failures.

All persisted output values are integers. Simplex noise and ratios are sampled only inside static
generation and are quantized before entering authoritative output.

## Exact stage order

### 1. Compile and validate configuration

The Zod boundary validates field ranges and cross-field relationships. The compiler derives:

- total map area;
- target global land area;
- protected-ocean interior capacity;
- fixed-point tectonic activity, coast roughness, rift strength, island frequency, and lapse rate;
- fixed-point minimum marginal-sea enclosure;
- maximum natural-lake area; and
- a map-size-derived micro-land cutoff.

A configuration is rejected before world generation if its requested global land area cannot fit
inside `outerOceanWidth + edgeClearance`. No setting is silently changed.

### 2. Create the odd-column hex grid

`stage.base_grid` creates one mutable generation cell per coordinate and precomputes graph distance
from the map boundary. The protected outer band is ineligible for land in every candidate, so all
boundary hexes remain ocean by construction.

### 3. Build tectonic plates

`stage.tectonic_plates` uses farthest-point seeds followed by deterministic, noise-weighted,
multi-source Dijkstra growth. Each plate receives an integer motion vector. Relative plate motion
produces convergent/divergent stress, boundary distance, and island/hotspot potential.

These fields influence the global land candidates and later relief. Plates are not equivalent to
continents: one landmass may cross plates and one plate may contain several islands or both land and
ocean.

This is a bounded phenomenological tectonic model rather than a time-stepped mantle simulation.

### 4. Generate and select emergent land candidates

`stage.land_topology` builds exactly `candidateCount` candidates. Candidate `N` owns four named noise
streams:

- `topology.candidate.N.macro`;
- `topology.candidate.N.regional`;
- `topology.candidate.N.detail`; and
- `topology.candidate.N.rifts`.

For every eligible hex, `land-candidates.ts` combines:

1. continent-scale simplex noise;
2. regional and detail coast variation;
3. stable plate-domain bias;
4. divergent/rift bands;
5. convergent-boundary and hotspot island potential;
6. a soft distance-from-map-edge penalty; and
7. weights selected by `mapStyle`.

The highest-ranked `targetLandHexes` form the initial mask. This is a global quantile, not a quota
assigned to a particular component. Enclosed pre-relief salt water is filled so all remaining ocean
water is boundary-connected. Components below the derived micro-land cutoff are removed, except that
the largest component is always retained.

Each candidate receives an integer quality score based on:

- distance from the global land target after topology cleanup;
- excessive bounding-box fill (the old rectangular-continent regression);
- coastline complexity appropriate to the selected style;
- largest-landmass share; and
- major/total component structure appropriate to the selected style.

The highest score wins; attempt index is the stable tie-breaker. The selection is bounded and cannot
loop indefinitely.

Connected components are then classified relative to the largest component. Components at least 13%
of its size are continents; smaller components are islands. This threshold is internal
classification, not an author-requested size or count. Within each kind, stable IDs are assigned by
the component's first row-major hex, never by unordered iteration.

### 5. Produce continental relief and ocean bathymetry

`stage.relief` combines:

1. continental base elevation and distance inland;
2. regional and detail simplex fields;
3. convergent uplift, coastal subduction uplift, and rift subsidence; and
4. an ocean model with shelf, abyssal floor, ridge, and trench terms.

Land remains above `seaLevel`; ocean remains below it. Relief cannot merge land components or sever
an ocean channel established by topology.

### 6. Calculate provisional climate

`stage.climate_initial` assigns temperature from latitude and elevation. Surface winds alternate
between tropical easterlies, mid-latitude westerlies, and polar easterlies. Moisture evaporates from
water, advects downwind for a fixed number of passes, precipitates during orographic ascent, and
creates rain shadows. Rainfall minus temperature-dependent evaporation becomes local runoff.

This is a deterministic cellular climate approximation, not a season/weather simulation.

### 7. Derive depressions, lakes, and marginal seas

`stage.surface_water` runs Priority-Flood from existing water sinks. Fill depth and spill elevation
produce stable depression nodes and downstream receivers.

A depression becomes a lake only when:

- it reaches `minimumLakeHexes`;
- its runoff reaches `lakeWaterBalanceThreshold`;
- a dry ring separates it from existing water;
- removing it does not disconnect its owning landmass; and
- selected lake area remains within `maximumLakeCoverage`.

Lake count, size, and placement are emergent. Marginal seas remain parts of the boundary-connected
ocean; classification never changes the land/water mask.

For marginal seas, a multi-source graph-distance pass first measures each ocean hex's clearance from
dry land. The classifier then evaluates every temporary coastal-closure radius from one hex through
`ceil(seaMaximumMouthWidth / 2)`:

1. ocean hexes within the current radius of land are temporarily removed from the traversable core;
2. surviving cores touching the protected outer-ocean band remain outer-ocean sources;
3. surviving cores cut off behind the temporary closure become basin sources;
4. the original ocean is reconstructed by nearest-core graph distance, with outer ocean winning
   equal-distance ties and row-major component identity breaking all remaining ties; and
5. a reconstructed basin is accepted only when its area, mouth width, graph depth from the mouth,
   and land-boundary enclosure pass the configured thresholds.

Accepted masks from all bounded scales are combined, connected, and assigned stable `water.sea.N`
IDs by their first row-major hex. A scale with no surviving outer-ocean core is skipped rather than
failing generation. This recognizes the complete open interior of a bay behind a narrow entrance;
individual sea hexes do not need to touch land.

### 8. Recalculate climate with inland water

Climate runs again after lake formation. Lakes become real moisture sources before final runoff and
river accumulation.

### 9. Route flow, erode channels, and emit rivers

`stage.hydrology_erosion` uses Priority-Flood on the six-neighbor hex graph. Every dry hex receives
one deterministic downstream target with a finite route to ocean, sea, or lake. Accumulation sums
integer runoff in stable reverse drainage order.

Cells above `channelInitiationRunoff` form river edges. Bounded stream-power incision runs for the
configured number of passes, never exceeds `maximumIncisionPerPass`, and cannot lower land below sea
level. Drainage is recomputed after each pass.

Single-target D6 routing has more grid bias than continuous-angle methods, but it matches the native
hex graph and serialized river-edge contract.

### 10. Assign geography and validate

`stage.geography` assigns emergent continent/island IDs, the outer ocean, marginal seas, natural
lakes, and coastal-water terrain.

Validation requires:

- zero boundary land;
- every boundary hex in `water.ocean.1`;
- every lake disconnected from boundary water;
- every marginal sea connected to the ocean;
- every landmass record matching one connected component;
- natural lakes never increasing selected topology land area; and
- every emitted river reaching water without a cycle.

Stage checksums include cell layers and, where relevant, plate records, selected candidate metrics,
river edges, landmass records, and water-body records.

## Map styles

| Style         | Candidate preference                                            |
| ------------- | --------------------------------------------------------------- |
| `continents`  | Several large masses, ocean rifts, moderate island chains       |
| `fractal`     | High coastline variation and unpredictable component structure  |
| `pangaea`     | One dominant central mass with limited rifting                  |
| `archipelago` | Fragmented land, strong rifts, regional detail, hotspot islands |

Styles change scoring and field weights; none specifies an exact component count or area.

## Configuration groups

| Group       | Controls                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `topology`  | style, global land coverage, candidate count, grain, rifts, island frequency, margins, coast roughness, basin-mouth sea classification |
| `tectonics` | plate count/activity, boundary falloff, uplift, trenches, rifts, hotspots                                                              |
| `relief`    | sea level, continental height, ocean depth, shelf, regional/detail scales                                                              |
| `climate`   | equator/pole temperatures, lapse rate, winds, moisture transport, orographic rain, evaporation                                         |
| `hydrology` | natural-lake limits, river threshold, erosion passes, incision bounds                                                                  |

Removed v2 settings are `continentCount`, `minimumContinentHexes`,
`continentAreaVariation`, `waterGapWidth`, `majorIslandCount`, `islandLandFraction`, and
`islandBufferWidth`. They represented output quotas rather than geographical processes.

Marginal-sea topology settings are:

| Setting                | Meaning                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `seaMinimumHexes`      | Minimum reconstructed basin area.                                                                                             |
| `seaMaximumMouthWidth` | Widest accepted reconstructed connection to the outer ocean, in hexes. It also bounds the number of temporary closure scales. |
| `seaMinimumDepth`      | Minimum graph distance from the reconstructed mouth to the deepest basin hex.                                                 |
| `seaMinimumEnclosure`  | Minimum ratio of land-facing boundary edges to all land- and ocean-facing basin boundary edges.                               |

The v3 setting `seaEnclosureThreshold` was removed because it classified individual coastal hexes
instead of whole basins and fragmented broad bays.

## Persistence compatibility

New `generation.json` snapshots contain `version: 4`. Unversioned, v2, v3, malformed, or incomplete
snapshots are rejected before existing geometry is opened or regenerated. The server never silently
changes the seed or topology settings of an existing world. Create a new empty world directory to
use v4; older directories remain untouched.

## Scientific and implementation basis

The implementation adapts these sources and production precedents:

- [Civilization VI-derived Continents.lua](https://github.com/d-jackthenarrator/Civ6-BBS/blob/master/1958135962/Data/BBS%20Maps/continents.lua) for fractal/rift candidates, global water thresholds, plate ridges, and largest-landmass evaluation;
- [Civilization VI asset listing](https://steamdb.info/depot/537571/) confirming separate `Continents.lua` and `Fractal.lua` map scripts in the shipped assets;
- [Procedural Tectonic Planets](https://perso.liris.cnrs.fr/eric.galin/Articles/2019-planets.pdf) for tectonic control of large-scale relief;
- [USGS plate motions](https://pubs.usgs.gov/gip/dynamic/understanding.html) and [USGS hotspots](https://www.usgs.gov/faqs/what-a-hotspot-and-how-do-you-know-its-there) for ridges, subduction, trenches, and island chains;
- [NOAA global atmospheric circulation](https://prod-01-alb-www-noaa.woc.noaa.gov/jetstream/global/global-atmospheric-circulations) for surface-wind bands;
- [Priority-Flood](https://doi.org/10.1016/j.cageo.2013.04.024) for depression filling and guaranteed drainage;
- [Fill-Spill-Merge](https://esurf.copernicus.org/articles/9/105/2021/) for depression/spill relationships;
- [Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion](https://doi.org/10.1111/cgf.12820) for uplift, drainage, and stream-power incision; and
- [Tarboton 1997](https://doi.org/10.1029/96WR03137) for flow-routing tradeoffs.

The generator aims for coherent game-scale geography. It does not simulate mantle convection,
sediment transport, deltas, glaciers, groundwater, seasons, or ocean currents.
