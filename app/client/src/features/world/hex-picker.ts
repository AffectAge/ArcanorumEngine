import type { WorldHex, WorldMapResponse } from '@arcanorum/shared';

/**
 * Resolves a rendered flat-top, odd-column hex from world-space pixels.
 * This matches the Tiled placement used by the Phaser tile layer.
 */
export function findHexAtWorldPosition(
  world: WorldMapResponse,
  worldX: number,
  worldY: number,
): WorldHex | undefined {
  const { frameHeight, frameWidth } = world.map.terrain.atlas;
  const horizontalStep = (frameWidth + world.map.hexSideLength) / 2;
  const approximateColumn = Math.round((worldX - frameWidth / 2) / horizontalStep);

  for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
    const q = approximateColumn + columnOffset;
    if (q < 0 || q >= world.map.width) {
      continue;
    }

    const centerYForFirstRow = frameHeight / 2 + (q % 2) * (frameHeight / 2);
    const approximateRow = Math.round((worldY - centerYForFirstRow) / frameHeight);

    for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
      const r = approximateRow + rowOffset;
      if (r < 0 || r >= world.map.height) {
        continue;
      }

      const centerX = q * horizontalStep + frameWidth / 2;
      const centerY = r * frameHeight + centerYForFirstRow;
      if (
        !isInsideFlatTopHex(
          worldX - centerX,
          worldY - centerY,
          frameWidth,
          frameHeight,
          world.map.hexSideLength,
        )
      ) {
        continue;
      }

      return world.map.hexes[r * world.map.width + q];
    }
  }

  return undefined;
}

function isInsideFlatTopHex(
  localX: number,
  localY: number,
  frameWidth: number,
  frameHeight: number,
  horizontalSideLength: number,
): boolean {
  const horizontalDistance = Math.abs(localX);
  const verticalDistance = Math.abs(localY);
  const halfWidth = frameWidth / 2;
  const halfHeight = frameHeight / 2;

  if (horizontalDistance > halfWidth || verticalDistance > halfHeight) {
    return false;
  }

  const triangleWidth = (frameWidth - horizontalSideLength) / 2;
  if (triangleWidth <= 0 || horizontalDistance <= horizontalSideLength / 2) {
    return true;
  }

  const allowedVerticalDistance = (halfWidth - horizontalDistance) * (halfHeight / triangleWidth);
  return verticalDistance <= allowedVerticalDistance;
}
