/** Stable presentation-only hash; it never advances authoritative RNG state. */
export function hashWorldVisualValue(
  worldSeed: string,
  q: number,
  r: number,
  identity: string,
  ordinal: number,
  channel: string,
): number {
  const value = `${worldSeed}|${q}|${r}|${identity}|${ordinal}|${channel}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
