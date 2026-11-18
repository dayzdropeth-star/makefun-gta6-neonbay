// NEON BAY v2 — entry for make.fun gta6-01 (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html, three.js vendored under game/vendor/,
// no network request). This program hands it in: it copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The game itself is an original open-world crime game: a procedural neon-dusk
// city you explore on foot and by car, with traffic, pedestrians, car theft,
// a 5-star wanted system with police chases, story missions (including the new
// Taksi Kilat taxi mission), melee combat, a HUD with a minimap, a start/save
// flow and synthesized WebAudio sound.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// NEVER point MAKEFUN_OUTPUT_DIR at this repository directory itself: copying
// game/ onto its own source would corrupt the entry.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The caps the scorer's gate.json applies to this entry (see the vendored
// library's docs): only text_max_bytes shapes the dossier's bytes; the rest
// refuse an entry the scorer would refuse, so this program fails the same way
// instead of handing in something broken.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 262144;
const IMAGE_NAME = /\.(jpe?g|png)$/i;

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

// Guard: the output directory must not be the repo itself (or inside game/),
// where the copy would overwrite the sources it reads from.
function guardOutputDir(): void {
  const outPath = resolve(out);
  const repoPath = resolve(here);
  if (outPath === repoPath) {
    throw new Error('MAKEFUN_OUTPUT_DIR must not be the repository directory itself');
  }
  if (outPath.startsWith(join(repoPath, 'game') + '/')) {
    throw new Error('MAKEFUN_OUTPUT_DIR must not be inside game/');
  }
}

// Validate the inputs before copying anything: game/ must exist, and the
// screenshots must already be real renders of the game (JPEG/PNG, each at
// most 256 KiB, at most 4 files) — the scorer refuses an entry otherwise,
// so fail here with a clear message instead of handing in a broken entry.
function validateInputs(): string[] {
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html is missing — nothing to hand in');
  }
  const names = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((n) => IMAGE_NAME.test(n)).sort()
    : [];
  if (names.length === 0) {
    throw new Error('screenshots/ is empty — take the staged screenshots first (see shots.json)');
  }
  if (names.length > MAX_SCREENSHOTS) {
    throw new Error(`too many screenshots: ${names.length} (max ${MAX_SCREENSHOTS})`);
  }
  for (const name of names) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > MAX_SCREENSHOT_BYTES) {
      throw new Error(`screenshot ${name} is ${size} bytes (max ${MAX_SCREENSHOT_BYTES})`);
    }
  }
  return names;
}

function handIn(shotNames: string[]): void {
  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));
  // Post-write check: the hand-in is incomplete without the dossier.
  if (!existsSync(join(out, 'dossier.json'))) {
    throw new Error('dossier.json was not written — hand-in aborted');
  }
}

function countGameEntries(): number {
  return readdirSync(join(out, 'game'), { recursive: true }).length;
}

guardOutputDir();
const shotNames = validateInputs();
handIn(shotNames);
console.log(`NEON BAY handed in to ${out}: ${countGameEntries()} game entries, ${shotNames.length} screenshots (${shotNames.join(', ')}), dossier.json written.`);
