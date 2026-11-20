// NEON BAY v4 — angka acak deterministik.
//
// Satu seed menghasilkan kota, lalu lintas, dan misi yang sama setiap kali,
// jadi `?seed=neon` selalu membangun dunia yang identik. Tidak ada
// dependensi: generatornya ditulis tangan di bawah ini. Turunan lewat
// fork(n) selalu berangkat dari seed awal yang sama, jadi urutan pemakaian
// rng induk tidak mengubah hasil fork.

/**
 * Ubah teks pendek menjadi seed 32-bit (FNV-1a). Kata seperti "neon"
 * bisa dipakai sebagai seed layaknya angka.
 */
export function hashSeed(text) {
  const word = String(text ?? '');
  let hash = 0x811c9dc5;
  for (const char of word) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Ambil seed dari nilai query string. Angka dibaca apa adanya, kata
 * di-hash, dan nilai kosong jatuh ke fallback.
 */
export function seedFromParam(raw, fallback) {
  const base = fallback >>> 0;
  if (raw === null || raw === undefined || raw === '') return base;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isInteger(parsed)) return parsed >>> 0;
  return hashSeed(raw);
}

/**
 * Generator acak dari seed 32-bit. Inti mulberry32: kecil, cepat, dan
 * cukup baik untuk gameplay. Semua helper yang dipakai game ada di sini.
 */
export function createRng(seed) {
  const origin = seed >>> 0;
  let state = origin === 0 ? 0x9e3779b9 : origin;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + next() * (max - min);
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

  /** Salinan acak dari list; list asli tidak pernah diubah. */
  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /** Generator turunan yang deterministik dari seed awal + n. */
  function fork(n) {
    return createRng((origin + (n >>> 0)) >>> 0);
  }

  return { next, range, int, pick, chance, shuffle, fork };
}
