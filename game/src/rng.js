// Seeded random helpers (mulberry32) so a ?seed= URL always builds the same Neon Bay.
// Gameplay randomness (mission targets, traffic respawns, pedestrian turns) draws
// from a second stream seeded off the same seed, so a given seed also replays the
// same mission flow instead of depending on Math.random().
export function makeRng(seed) {
  // Guard against NaN / Infinity / non-numeric seeds (e.g. "?seed=abc"): fall
  // back to the default seed instead of producing a stream of NaN.
  let a = Number.isFinite(seed) ? seed >>> 0 : 7;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) { return min + rng() * (max - min); }
export function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
export function chance(rng, p) { return rng() < p; }

// Integer in [min, max] inclusive, drawn from the seeded stream.
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Fisher-Yates shuffle that returns a new array, leaving the input untouched.
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
