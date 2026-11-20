// NEON BAY v4 — penyerahan entri make.fun gta6-01 (Node 22, stdlib saja).
//
// Tugas file ini sederhana: salin game/ (file statis yang dimainkan
// browser secara offline — three.js sudah di-vendor di game/vendor/, tidak
// ada request jaringan) dan screenshots/ ke direktori output, lalu tulis
// dossier.json dengan pustaka make.fun yang sudah di-vendor. Penilai
// membangun ulang dossier dengan pustaka yang sama dan membandingkannya
// byte demi byte, jadi file ini tidak boleh mengarang isinya sendiri.
//
// Mainkan gamenya secara lokal dengan `node serve.ts`, lalu buka
// http://localhost:8080. Untuk staging di luar grader:
//   mkdir -p /tmp/neonbay-out && MAKEFUN_OUTPUT_DIR=/tmp/neonbay-out node main.ts
// JANGAN PERNAH arahkan MAKEFUN_OUTPUT_DIR ke direktori repo ini sendiri:
// penyalinan akan membaca game/ sambil menimpanya.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Batas yang diterapkan penilai untuk entri ini. Hanya text_max_bytes yang
// membentuk byte dossier; sisanya menolak entri yang pasti ditolak penilai,
// supaya program ini gagal dengan keras alih-alih menyerahkan yang rusak.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const SHOT_PATTERN = /\.(jpe?g|png)$/i;
const MAX_SHOTS = DOSSIER_CAPS.screenshots.max;
const MAX_SHOT_BYTES = DOSSIER_CAPS.screenshots.max_bytes;

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const sourceGame = join(repoRoot, 'game');
const sourceShots = join(repoRoot, 'screenshots');

/**
 * Tolak direktori output yang akan merusak sumber: repo itu sendiri,
 * apa pun di dalam game/, atau folder screenshots.
 */
function ensureSafeOutput(): string {
  const target = resolve(outputDir);
  const repo = resolve(repoRoot);
  if (target === repo) {
    throw new Error('MAKEFUN_OUTPUT_DIR must not be the repository directory itself');
  }
  for (const forbidden of [join(repo, 'game'), join(repo, 'screenshots')]) {
    if (target === forbidden || target.startsWith(forbidden + '/')) {
      throw new Error(`MAKEFUN_OUTPUT_DIR must not be inside ${forbidden}`);
    }
  }
  return target;
}

/** Daftar file screenshot, sekaligus memeriksa jumlah dan ukuran. */
function collectShots(): string[] {
  if (!existsSync(join(sourceGame, 'index.html'))) {
    throw new Error('game/index.html is missing — nothing to hand in');
  }
  if (!existsSync(join(sourceGame, 'src', 'main.js'))) {
    throw new Error('game/src/main.js is missing — nothing to hand in');
  }
  if (!existsSync(sourceShots)) {
    throw new Error('screenshots/ is missing — take the staged screenshots first (see shots.json)');
  }
  const names = readdirSync(sourceShots).filter((name) => SHOT_PATTERN.test(name)).sort();
  if (names.length === 0) {
    throw new Error('screenshots/ holds no images — take the staged screenshots first (see shots.json)');
  }
  if (names.length > MAX_SHOTS) {
    throw new Error(`too many screenshots: ${names.length} (max ${MAX_SHOTS})`);
  }
  for (const name of names) {
    const bytes = statSync(join(sourceShots, name)).size;
    if (bytes > MAX_SHOT_BYTES) {
      throw new Error(`screenshot ${name} is ${bytes} bytes (max ${MAX_SHOT_BYTES})`);
    }
  }
  return names;
}

/** Salin game dan screenshot, lalu tulis dossier. */
function publish(target: string, shotNames: string[]): number {
  mkdirSync(target, { recursive: true });
  cpSync(sourceGame, join(target, 'game'), { recursive: true });
  mkdirSync(join(target, 'screenshots'), { recursive: true });
  cpSync(sourceShots, join(target, 'screenshots'), { recursive: true });
  writeFileSync(join(target, 'dossier.json'), buildDossier(target, DOSSIER_CAPS));
  if (!existsSync(join(target, 'dossier.json'))) {
    throw new Error('dossier.json was not written — hand-in aborted');
  }
  return readdirSync(join(target, 'game'), { recursive: true }).length;
}

function main(): void {
  const target = ensureSafeOutput();
  const shotNames = collectShots();
  const gameEntries = publish(target, shotNames);
  console.log(
    `NEON BAY v4 handed in to ${target}: ${gameEntries} game entries, ` +
    `${shotNames.length} screenshots (${shotNames.join(', ')}), dossier.json written.`,
  );
}

main();
