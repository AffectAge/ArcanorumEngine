import { describe, expect, it } from 'vitest';
import { WorldVisualCatalogSchema } from './world-visual.js';

const catalog = {
  layers: [{ id: 'layer.relief', depth: 10 }],
  assets: [{ id: 'asset.mountain', key: 'world.visual.mountain', url: '/assets/world/visual/mountain.png' }],
  signals: [{ id: 'environment.mountain_strength', expression: { type: 'constant', value: 1000 } }],
  features: [
    {
      id: 'feature.mountain',
      layerId: 'layer.relief',
      priority: 10,
      when: { all: [{ fact: 'environment.mountain_strength', operator: 'gte', value: 1 }] },
      renderer: { type: 'sprite', assetId: 'asset.mountain', scalePermille: 1000 },
    },
  ],
};

describe('WorldVisualCatalogSchema', () => {
  it('centers renderer origins by default and accepts a per-feature override', () => {
    const centered = WorldVisualCatalogSchema.parse(catalog);
    expect(centered.features[0]?.renderer).toMatchObject({ originX: 0.5, originY: 0.5 });

    const anchored = WorldVisualCatalogSchema.parse({
      ...catalog,
      features: [
        {
          ...catalog.features[0]!,
          renderer: { ...catalog.features[0]!.renderer, originY: 0.85 },
        },
      ],
    });
    expect(anchored.features[0]?.renderer).toMatchObject({ originX: 0.5, originY: 0.85 });
  });

  it('rejects a visual feature that references an unknown fact', () => {
    const invalid = {
      ...catalog,
      features: [
        {
          ...catalog.features[0]!,
          when: { all: [{ fact: 'environment.unknown', operator: 'gte', value: 1 }] },
        },
      ],
    };

    expect(WorldVisualCatalogSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects cyclic signal dependencies before rendering begins', () => {
    const invalid = {
      ...catalog,
      signals: [
        { id: 'environment.first', expression: { type: 'fact', fact: 'environment.second' } },
        { id: 'environment.second', expression: { type: 'fact', fact: 'environment.first' } },
      ],
      features: [
        {
          ...catalog.features[0]!,
          when: { all: [{ fact: 'environment.first', operator: 'gte', value: 1 }] },
        },
      ],
    };

    expect(WorldVisualCatalogSchema.safeParse(invalid).success).toBe(false);
  });
});
