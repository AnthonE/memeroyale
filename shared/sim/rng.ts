// Small deterministic PRNG (mulberry32) — the same seed produces the same loot / storm / bot decisions on any runtime.
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) { return Math.floor(this.next() * n); }
  range(a: number, b: number) { return a + this.next() * (b - a); }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
}
export const hash32 = (a: number, b = 0) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x1234567, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); return (h ^ (h >>> 16)) >>> 0; };
