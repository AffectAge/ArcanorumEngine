import type { MutableHex } from './types.js';

export function minimum(values: readonly number[]): number {
  const value = values.reduce((result, candidate) => Math.min(result, candidate), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(value)) {
    throw new Error('Expected at least one numeric value.');
  }
  return value;
}

export function maximum(values: readonly number[]): number {
  const value = values.reduce((result, candidate) => Math.max(result, candidate), Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(value)) {
    throw new Error('Expected at least one numeric value.');
  }
  return value;
}

export function smoothstep(start: number, end: number, value: number): number {
  if (start > end) {
    return 1 - smoothstep(end, start, value);
  }
  if (value <= start) {
    return 0;
  }
  if (value >= end) {
    return 1;
  }
  const progress = (value - start) / (end - start);
  return progress * progress * (3 - 2 * progress);
}

export function clampInteger(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

export function requiredCell(cells: readonly MutableHex[], index: number): MutableHex {
  const cell = cells[index];
  if (cell === undefined) {
    throw new Error(`World hex index is out of bounds: ${index}.`);
  }
  return cell;
}

export function requiredNumber(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Numeric layer index is out of bounds: ${index}.`);
  }
  return value;
}

export function requiredBoolean(values: readonly boolean[], index: number): boolean {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Boolean layer index is out of bounds: ${index}.`);
  }
  return value;
}
