// NEON BAY — entry for make.fun gta6-01 (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html, three.js vendored under game/vendor/, no network request), and the
// program hands it in. It copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. The game itself is an original open-world crime game: a procedural
// neon-dusk city you explore on foot and by car, with traffic, pedestrians, car theft,
// a 5-star wanted system with police chases, story missions, melee combat, a HUD with
// a minimap, a start/save flow and synthesized WebAudio sound.
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// NEVER point MAKEFUN_OUTPUT_DIR at this repository directory itself: copying
// game/ onto its own source would corrupt the entry.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Guard: the output directory must not be the repo itself (or inside game/),
// where the copy would overwrite the sources it reads from.
if (resolve(out) === resolve(here)) {
  throw new Error('MAKEFUN_OUTPUT_DIR must not be the repository directory itself');
}
if (resolve(out).startsWith(join(resolve(here), 'game') + '/')) {
  throw new Error('MAKEFUN_OUTPUT_DIR must not be inside game/');
}

// Validate the inputs before copying anything: game/ must exist, and the
// screenshots must already be real renders of the game (JPEG/PNG, each at
// most 256 KiB, at most 4 files) — the scorer refuses an entry otherwise,
// so fail here with a clear message instead of handing in a broken entry.
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing — nothing to hand in');
}
const shotsDir = join(here, 'screenshots');
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort()
  : [];
if (shotNames.length === 0) {
  throw new Error('screenshots/ is empty — take the staged screenshots first (see shots.json)');
}
if (shotNames.length > 4) {
  throw new Error(`too many screenshots: ${shotNames.length} (max 4)`);
}
for (const name of shotNames) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 262144) {
    throw new Error(`screenshot ${name} is ${size} bytes (max 262144)`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

const gameFiles = readdirSync(join(out, 'game'), { recursive: true }).length;
console.log(`NEON BAY handed in to ${out}: ${gameFiles} game entries, ${shotNames.length} screenshots (${shotNames.join(', ')}), dossier.json written.`);
