import { describe, expect, it } from 'vitest';
import type { WorldGeometry } from '@arcanorum/shared';
import { findHexCoordinateAtWorldPosition } from './hex-picker.js';

const WORLD = {
  width: 3,
  height: 3,
  hexSideLength: 48,
  terrain: {
    atlas: {
      frameWidth: 96,
      frameHeight: 84,
    },
  },
} as unknown as WorldGeometry;

describe('findHexCoordinateAtWorldPosition', () => {
  it('returns the rendered odd-column hex under a world-space point', () => {
    expect(findHexCoordinateAtWorldPosition(WORLD, 48, 42)).toEqual({ q: 0, r: 0 });
    expect(findHexCoordinateAtWorldPosition(WORLD, 120, 168)).toEqual({ q: 1, r: 1 });
    expect(findHexCoordinateAtWorldPosition(WORLD, 192, 210)).toEqual({ q: 2, r: 2 });
  });

  it('does not select a transparent corner outside of the rendered hexes', () => {
    expect(findHexCoordinateAtWorldPosition(WORLD, 0, 0)).toBeUndefined();
  });
});
