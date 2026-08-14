import type { SeededRandom } from './random.js';
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

export function randomBetween(random: SeededRandom, minimumValue: number, maximumValue: number): number {
  return minimumValue + random.nextFloat() * (maximumValue - minimumValue);
}

export function randomBetweenInteger(
  random: SeededRandom,
  minimumValue: number,
  maximumValue: number,
): number {
  return minimumValue + random.nextInt(maximumValue - minimumValue + 1);
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

export function shuffle<T>(values: readonly T[], random: SeededRandom): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = random.nextInt(index + 1);
    const current = result[index];
    result[index] = result[targetIndex] as T;
    result[targetIndex] = current as T;
  }
  return result;
}
