import { describe, expect, it } from 'vitest';
import type { WorldMapResponse } from '@arcanorum/shared';
import { findHexAtWorldPosition } from './hex-picker.js';

const WORLD = {
  map: {
    width: 3,
    height: 3,
    hexSideLength: 48,
    terrain: {
      atlas: {
        frameWidth: 96,
        frameHeight: 84,
      },
    },
    hexes: Array.from({ length: 9 }, (_, index) => ({
      q: index % 3,
      r: Math.floor(index / 3),
      terrainId: 'terrain.land',
      elevation: 0,
      temperature: 0,
      rainfall: 0,
      flowAccumulation: 0,
    })),
  },
} as unknown as WorldMapResponse;

describe('findHexAtWorldPosition', () => {
  it('returns the rendered odd-column hex under a world-space point', () => {
    expect(findHexAtWorldPosition(WORLD, 48, 42)).toMatchObject({ q: 0, r: 0 });
    expect(findHexAtWorldPosition(WORLD, 120, 168)).toMatchObject({ q: 1, r: 1 });
    expect(findHexAtWorldPosition(WORLD, 192, 210)).toMatchObject({ q: 2, r: 2 });
  });

  it('does not select a transparent corner outside of the rendered hexes', () => {
    expect(findHexAtWorldPosition(WORLD, 0, 0)).toBeUndefined();
  });
});
