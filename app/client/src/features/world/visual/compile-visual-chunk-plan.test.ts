import { describe, expect, it } from 'vitest';
import { WorldBaseResponseSchema, WorldGeometryChunkSchema } from '@arcanorum/shared';
import { compileVisualChunkPlan } from './compile-visual-chunk-plan.js';

const world = WorldBaseResponseSchema.parse({
  worldName: 'Visual test world',
  seed: 'visual-test-seed',
  geometryRevision: 'a'.repeat(64),
  chunkWidth: 32,
  chunkHeight: 32,
  geometry: {
    width: 2,
    height: 2,
    staggerAxis: 'x',
    staggerIndex: 'odd',
    hexSideLength: 48,
    terrain: {
      atlas: {
        key: 'world.terrain.atlas',
        url: '/assets/world/terrain/terrain-atlas.webp',
        frameWidth: 96,
        frameHeight: 84,
        columns: 5,
      },
      terrainTypes: [
        { id: 'terrain.ocean', frame: 0, category: 'water', role: 'ocean' },
        { id: 'terrain.coastal_water', frame: 1, category: 'water', role: 'coastal_water' },
        { id: 'terrain.sea', frame: 2, category: 'water', role: 'sea' },
        { id: 'terrain.lake', frame: 3, category: 'water', role: 'lake' },
        { id: 'terrain.land', frame: 4, category: 'land', role: 'land' },
      ],
      overlays: [
        {
          id: 'overlay.river',
          role: 'river',
          key: 'world.river.atlas',
          url: '/assets/world/terrain/river-atlas.webp',
          frameWidth: 96,
          frameHeight: 84,
          columns: 8,
          rows: 8,
        },
      ],
    },
    visuals: {
      layers: [
        { id: 'layer.relief', depth: 10 },
        { id: 'layer.wetland', depth: 20 },
        { id: 'layer.vegetation', depth: 30 },
      ],
      assets: [
        { id: 'asset.mountain', key: 'world.visual.mountain', url: '/assets/world/visual/mountain.png' },
        { id: 'asset.forest', key: 'world.visual.forest', url: '/assets/world/visual/forest.png' },
        { id: 'asset.swamp', key: 'world.visual.swamp', url: '/assets/world/visual/swamp.png' },
      ],
      signals: [
        {
          id: 'environment.mountain_strength',
          expression: {
            type: 'remap',
            value: { type: 'fact', fact: 'neighbor.ruggedness' },
            inputMin: 600,
            inputMax: 1000,
          },
        },
        {
          id: 'environment.coldness',
          expression: {
            type: 'subtract',
            left: { type: 'constant', value: 1000 },
            right: { type: 'fact', fact: 'hex.temperature' },
          },
        },
        {
          id: 'environment.snow_coverage',
          expression: {
            type: 'add',
            values: [
              {
                type: 'multiply',
                values: [
                  { type: 'fact', fact: 'environment.coldness' },
                  { type: 'constant', value: 700 },
                ],
              },
              {
                type: 'multiply',
                values: [
                  { type: 'fact', fact: 'environment.mountain_strength' },
                  { type: 'constant', value: 500 },
                ],
              },
            ],
          },
        },
        {
          id: 'environment.temperature_suitability',
          expression: {
            type: 'subtract',
            left: { type: 'constant', value: 1000 },
            right: {
              type: 'remap',
              value: { type: 'fact', fact: 'hex.temperature' },
              inputMin: 700,
              inputMax: 1000,
            },
          },
        },
        {
          id: 'environment.vegetation_potential',
          expression: {
            type: 'multiply',
            values: [
              { type: 'fact', fact: 'hex.rainfall' },
              { type: 'fact', fact: 'environment.temperature_suitability' },
            ],
          },
        },
        {
          id: 'environment.swamp_potential',
          expression: {
            type: 'multiply',
            values: [
              { type: 'fact', fact: 'hex.rainfall' },
              {
                type: 'subtract',
                left: { type: 'constant', value: 1000 },
                right: { type: 'fact', fact: 'hex.elevation' },
              },
            ],
          },
        },
      ],
      features: [
        {
          id: 'feature.mountain',
          layerId: 'layer.relief',
          priority: 10,
          when: {
            all: [
              { fact: 'hex.terrain_role', operator: 'eq', value: 'land' },
              { fact: 'environment.mountain_strength', operator: 'gte', value: 1 },
              { fact: 'hex.elevation', operator: 'gte', value: 750 },
            ],
          },
          renderer: {
            type: 'sprite',
            assetId: 'asset.mountain',
            scalePermille: 850,
            originY: 0.85,
          },
        },
        {
          id: 'feature.snow_mountain',
          layerId: 'layer.relief',
          priority: 20,
          when: {
            all: [
              { fact: 'environment.mountain_strength', operator: 'gte', value: 1 },
              { fact: 'environment.snow_coverage', operator: 'gte', value: 650 },
              { fact: 'hex.elevation', operator: 'gte', value: 750 },
            ],
          },
          renderer: {
            type: 'sprite',
            assetId: 'asset.mountain',
            scalePermille: 870,
            alphaPermille: 350,
            tint: 15136245,
          },
        },
        {
          id: 'feature.swamp',
          layerId: 'layer.wetland',
          priority: 10,
          when: {
            all: [
              { fact: 'hex.terrain_role', operator: 'eq', value: 'land' },
              { fact: 'environment.swamp_potential', operator: 'gte', value: 760 },
            ],
          },
          renderer: { type: 'sprite', assetId: 'asset.swamp', scalePermille: 760 },
        },
        {
          id: 'feature.forest',
          layerId: 'layer.vegetation',
          priority: 10,
          when: {
            all: [
              { fact: 'hex.terrain_role', operator: 'eq', value: 'land' },
              { fact: 'hex.elevation', operator: 'lte', value: 640 },
              { fact: 'environment.vegetation_potential', operator: 'gte', value: 520 },
              { fact: 'environment.swamp_potential', operator: 'lte', value: 759 },
            ],
          },
          intensity: { type: 'fact', fact: 'environment.vegetation_potential' },
          renderer: {
            type: 'scatter',
            assetId: 'asset.forest',
            candidateCount: 5,
            scalePermille: 430,
            densitySteps: [
              { min: 520, count: 2 },
              { min: 700, count: 3 },
              { min: 850, count: 5 },
            ],
          },
        },
      ],
    },
  },
  landmasses: [],
  waterBodies: [],
  diagnostics: {
    stages: [{ id: 'stage.base_grid', checksum: 'b'.repeat(64) }],
    landHexCount: 3,
    riverEdgeCount: 0,
    maximumElevation: 900,
    maximumFlowAccumulation: 0,
    boundaryLandHexCount: 0,
    outerOceanHexCount: 1,
    connectedSeaCount: 0,
    discardedMicroIslandCount: 0,
  },
});

const chunk = WorldGeometryChunkSchema.parse({
  chunkQ: 0,
  chunkR: 0,
  originQ: 0,
  originR: 0,
  width: 2,
  height: 2,
  hexes: [
    {
      q: 0,
      r: 0,
      terrainId: 'terrain.land',
      elevation: 900,
      temperature: 200,
      rainfall: 200,
      flowAccumulation: 0,
    },
    {
      q: 1,
      r: 0,
      terrainId: 'terrain.land',
      elevation: 300,
      temperature: 600,
      rainfall: 900,
      flowAccumulation: 0,
    },
    {
      q: 0,
      r: 1,
      terrainId: 'terrain.land',
      elevation: 100,
      temperature: 600,
      rainfall: 1000,
      flowAccumulation: 0,
    },
    {
      q: 1,
      r: 1,
      terrainId: 'terrain.ocean',
      elevation: 0,
      temperature: 500,
      rainfall: 1000,
      flowAccumulation: 0,
    },
  ],
  visualNeighbors: [],
  rivers: [],
});

describe('compileVisualChunkPlan', () => {
  it('emits layered mountains, wetland, and stable vegetation without changing world data', () => {
    const first = compileVisualChunkPlan(world, chunk);
    const second = compileVisualChunkPlan(world, chunk);

    expect(second).toEqual(first);
    expect(first.layers.map((layer) => [layer.layerId, layer.depth, layer.sprites.length])).toEqual([
      ['layer.relief', 10, 2],
      ['layer.wetland', 20, 1],
      ['layer.vegetation', 30, 5],
    ]);
    expect(first.layers[0]?.sprites.map((sprite) => sprite.featureId)).toEqual([
      'feature.mountain',
      'feature.snow_mountain',
    ]);
    expect(first.layers[0]?.sprites[0]).toMatchObject({ originX: 0.5, originY: 0.85 });
    expect(first.layers[1]?.sprites[0]).toMatchObject({ featureId: 'feature.swamp', q: 0, r: 1 });
    expect(first.layers[1]?.sprites[0]).toMatchObject({ originX: 0.5, originY: 0.5 });
    expect(first.layers[2]?.sprites.every((sprite) => sprite.featureId === 'feature.forest')).toBe(true);
    expect(chunk.hexes).toHaveLength(4);
  });

  it('changes decorative scatter only when the explicit world seed changes', () => {
    const changedSeed = WorldBaseResponseSchema.parse({ ...world, seed: 'another-visual-test-seed' });
    const originalForest = compileVisualChunkPlan(world, chunk).layers[2]?.sprites;
    const changedForest = compileVisualChunkPlan(changedSeed, chunk).layers[2]?.sprites;

    expect(changedForest).not.toEqual(originalForest);
  });

  it('uses the non-rendered visual neighbor halo for a border hex', () => {
    const borderChunk = WorldGeometryChunkSchema.parse({
      chunkQ: 0,
      chunkR: 0,
      originQ: 0,
      originR: 0,
      width: 1,
      height: 1,
      hexes: [chunk.hexes[0]],
      visualNeighbors: [
        {
          q: 1,
          r: 0,
          terrainId: 'terrain.land',
          elevation: 300,
          temperature: 600,
          rainfall: 900,
          flowAccumulation: 0,
        },
      ],
      rivers: [],
    });

    const relief = compileVisualChunkPlan(world, borderChunk).layers[0];

    expect(relief?.sprites.map((sprite) => sprite.featureId)).toEqual([
      'feature.mountain',
      'feature.snow_mountain',
    ]);
  });
});
