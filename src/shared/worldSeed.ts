// Deterministic seeded randomness shared by main and renderer processes,
// so blueprint generation produces identical layouts everywhere.

export function seedFor(value: string): number {
  let seed = 2166136261
  for (const character of value) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  return seed >>> 0
}

export function randomFor(seed: number): () => number {
  return () => {
    seed |= 0
    seed = seed + 0x6d2b79f5 | 0
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed)
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n
    return ((n ^ n >>> 14) >>> 0) / 4294967296
  }
}
