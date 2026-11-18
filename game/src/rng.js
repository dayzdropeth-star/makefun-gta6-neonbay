// Seeded randomness for NEON BAY (mulberry32).
//
// Every random draw in the game — city layout, traffic variety, mission
// targets, pedestrian turns — comes from one of these streams, so a
// `?seed=` URL always builds the same Neon Bay and replays the same
// mission flow instead of depending on Math.random() noise.
//
// Two streams exist by convention:
//   * build stream — created once in buildWorld(seed), shapes the city.
//   * play stream  — created in main.js from (seed ^ 0x9e3779b9), drives
//     everything that happens while the game runs (respawns, rush hour,
//     aggressive-driver rolls).
// Keep the streams separate: drawing from the build stream during play
// would shift the city layout for later seeds.

// Core PRNG: mulberry32. Small, fast, and deterministic for a 32-bit seed.
export function makeRng(seed) {
  // Guard against NaN / Infinity / non-numeric seeds (e.g. "?seed=abc"):
  // fall back to the default seed instead of producing a stream of NaN.
  let state = Number.isFinite(seed) ? seed >>> 0 : 7;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uniform float in [min, max).
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// Uniform integer in [min, max] inclusive.
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Random element of a non-empty list.
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// True with probability p (0..1).
export function chance(rng, p) {
  return rng() < p;
}

// Weighted choice: entries are [value, weight] pairs; heavier entries win
// more often. Total weight is computed from the entries themselves.
// A zero total weight falls back to the last entry instead of NaN.
export function weighted(rng, entries) {
  let total = 0;
  for (const [, weight] of entries) total += weight;
  if (!(total > 0)) return entries[entries.length - 1][0];
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// Hash an arbitrary string (e.g. a player name) into a stable 32-bit seed
// via FNV-1a, so makeRng(hashSeed(name)) replays the same world for it.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Approximately standard-normal float (Box–Muller), clamped to [-2.5, 2.5].
// Handy for natural-looking variation — speeds, lane drift, spawn offsets —
// that clusters around a mean instead of spreading uniformly.
export function gauss(rng) {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-2.5, Math.min(2.5, z));
}

// Base value plus a symmetric random offset of at most `spread`.
export function jitter(rng, base, spread) {
  return base + (rng() * 2 - 1) * spread;
}

// Fisher–Yates shuffle that returns a new array, leaving the input untouched.
export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
