// NEON BAY v3 — seeded random numbers.
//
// Every random choice in the game (city layout, traffic spawns, mission
// targets, weather changes) flows through one of these generators, so the
// same ?seed= always builds the same city and the same traffic. The core is
// mulberry32: small, fast, deterministic, and good enough for gameplay.

/**
 * Fold a short string into a 32-bit seed (FNV-1a). Lets a seed word such as
 * "neon" behave like a number seed.
 */
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  const word = String(text ?? '');
  for (let index = 0; index < word.length; index += 1) {
    hash ^= word.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Parse a seed from a query value: a number stays a number, a word is hashed. */
export function seedFromParam(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback >>> 0;
  const asNumber = Number.parseInt(raw, 10);
  if (Number.isInteger(asNumber)) return asNumber >>> 0;
  return hashSeed(raw);
}

/**
 * Build a generator from a 32-bit seed. The returned object is the only
 * random source a system needs: next() for a float in [0, 1), plus the
 * helpers games reach for most.
 */
export function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  let spare = null;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + (max - min) * next();
  }

  function int(min, max) {
    return Math.floor(range(min, max + 1));
  }

  function pick(list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(next() * list.length)];
  }

  function chance(probability) {
    return next() < probability;
  }

  function sign() {
    return next() < 0.5 ? -1 : 1;
  }

  /** Approximately normal in [-3, 3], mean 0 (Box-Muller, one spare kept). */
  function gauss() {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    let radius = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      radius = u * u + v * v;
    } while (radius >= 1 || radius === 0);
    const scale = Math.sqrt((-2 * Math.log(radius)) / radius);
    spare = v * scale;
    return u * scale;
  }

  /** A shuffled copy; the input list is never reordered in place. */
  function shuffle(list) {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(next() * (index + 1));
      const temp = copy[index];
      copy[index] = copy[other];
      copy[other] = temp;
    }
    return copy;
  }

  /** A fresh generator continuing from a child seed, for one subsystem. */
  function fork(salt) {
    return createRng((state ^ Math.imul(salt >>> 0, 0x85ebca6b)) >>> 0);
  }

  return { next, range, int, pick, chance, sign, gauss, shuffle, fork };
}
