import type { MapPosition } from '../types.js';

export function mapPosition(coordinate: { readonly q: number; readonly r: number }): MapPosition {
  return { x: coordinate.q, y: coordinate.r + (coordinate.q & 1) * 0.5 };
}

export function offsetPosition(position: MapPosition, angle: number, distance: number): MapPosition {
  return {
    x: position.x + Math.cos(angle) * distance,
    y: position.y + Math.sin(angle) * distance,
  };
}

export function translatePosition(position: MapPosition, translation: MapPosition): MapPosition {
  return {
    x: position.x + translation.x,
    y: position.y + translation.y,
  };
}

export function interpolatePosition(start: MapPosition, end: MapPosition, amount: number): MapPosition {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

export function distanceToSegment(point: MapPosition, start: MapPosition, end: MapPosition): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared),
  );
  return Math.hypot(point.x - (start.x + projection * deltaX), point.y - (start.y + projection * deltaY));
}
