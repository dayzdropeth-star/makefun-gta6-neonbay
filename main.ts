// NEON BAY v3 — entry for make.fun gta6-01 (Node 22, standard library only).
//
// What this program does: it takes the game in this directory's game/
// folder — plain static files a desktop browser loads offline (three.js
// vendored under game/vendor/, no network request anywhere) — plus the
// screenshots/ renders, copies both into the output directory, and writes
// /output/dossier.json with the vendored make.fun library. The dossier is
// the summary the judge reads; the scorer rebuilds it with the same library
// and compares the two byte for byte, so this file must not invent its own.
//
// The game itself: an original open-world driving game in the fictional
// neon city of Neon Bay — day/night cycle and weather that change the
// road grip, three kinds of traffic with rush hour, a five-star wanted
// system with police chases, three story missions (including Taksi Kilat)
// plus a repeatable courier job, on-foot play and car theft, a HUD with a
// minimap, and synthesized WebAudio sound.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p /tmp/neonbay-out && MAKEFUN_OUTPUT_DIR=/tmp/neonbay-out node main.ts
// NEVER point MAKEFUN_OUTPUT_DIR at this repository directory itself: the
// copy would read game/ while writing over it.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The caps the scorer applies to this entry. Only text_max_bytes shapes
// the dossier's bytes; the rest refuse an entry the scorer would refuse, so
// this program fails loudly instead of handing in something broken.
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
 * Refuse an output directory that would corrupt the sources: the repo
 * itself, anything inside game/, or the screenshots folder.
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

/** List the screenshot files, validating count and size up front. */
function collectShots(): string[] {
  if (!existsSync(join(sourceGame, 'index.html'))) {
    throw new Error('game/index.html is missing — nothing to hand in');
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

/** Copy the game and the screenshots, then write the dossier. */
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
    `NEON BAY v3 handed in to ${target}: ${gameEntries} game entries, ` +
    `${shotNames.length} screenshots (${shotNames.join(', ')}), dossier.json written.`,
  );
}

main();
