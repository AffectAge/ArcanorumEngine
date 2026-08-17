import { describe, expect, it } from 'vitest';
import { loadVisualCatalog } from './visual-catalog.js';

describe('visual catalog loader', () => {
  it('loads every explicitly declared visual feature and verifies its required assets', () => {
    const loaded = loadVisualCatalog();

    expect(loaded.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded.catalog.layers.map((layer) => layer.id)).toEqual([
      'layer.relief',
      'layer.wetland',
      'layer.vegetation',
    ]);
    expect(loaded.catalog.features.map((feature) => feature.id)).toEqual([
      'feature.mountain',
      'feature.snow_mountain',
      'feature.swamp',
      'feature.forest',
      'feature.forest_boreal',
      'feature.forest_tropical',
    ]);
    expect(loaded.catalog.assets.map((asset) => asset.id)).toContain('asset.forest_boreal');
    expect(loaded.catalog.assets.map((asset) => asset.id)).toContain('asset.forest_tropical');
    expect(loaded.catalog.surfaces).toHaveLength(22);
    expect(loaded.catalog.surfaces.map((surface) => surface.id)).toEqual(
      expect.arrayContaining([
        'surface.land.hot_desert',
        'surface.land.tropical_wet',
        'surface.water.ocean_cold',
        'surface.water.coastal_water_tropical',
      ]),
    );
  });
});
