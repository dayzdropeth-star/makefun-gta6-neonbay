// NEON BAY — open-world crime game. All code written for this entry.
// Third-person on foot + arcade driving, traffic, pedestrians, wanted/police,
// two story missions plus repeatable courier jobs, melee combat, HUD + minimap,
// WebAudio synth sound, localStorage save, and ?shot= staging for screenshots.
import { buildWorld, makeCarMesh, collideBuildings, dist2, HALF, GRID, PITCH, BLOCK, STREET } from './world.js';
import { makeRng, range, pick } from './rng.js';
import { SoundFX } from './audio.js';

const THREE = window.THREE;
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 7) || 7;
const SHOT = params.get('shot') || '';
const SAVE_KEY = 'neonbay.save.v1';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const hudMoney = $('money'), hudMission = $('missionCount'), hpFill = $('hpfill');
const hudWanted = $('wanted'), objTitle = $('objTitle'), objText = $('objText');
const hudSpeed = $('speed'), hudHint = $('hint'), toastEl = $('toast');
const minimap = $('minimap'), mmCtx = minimap.getContext('2d');
const startScreen = $('startScreen'), pauseScreen = $('pauseScreen'), overScreen = $('overScreen');

let toastTimer = 0;
function toast(msg, seconds) {
  toastEl.textContent = msg;
  toastTimer = seconds || 3;
}

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
const world = buildWorld(scene, SEED);

// ---------- Save ----------
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; }
}
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: game.money, missionsDone: game.missionsDone, totalEarned: game.totalEarned,
    }));
  } catch { /* storage unavailable: game still runs */ }
}

// ---------- Game state ----------
const game = {
  state: 'title', // title | play | pause | over
  money: 120,
  health: 100,
  wanted: 0,
  missionsDone: 0,
  totalEarned: 0,
  time: 0,
  hiddenTime: 0,
  camYaw: Math.PI * 0.75,
  camPitch: 0.32,
  keys: {},
  punchCooldown: 0,
  punchAnim: 0,
  hudTimer: 0,
  mapTimer: 0,
  mission: null, // {id, stage, tx, tz, timer}
  beacon: null,
  police: [],
  playerCar: null,
  exitCooldown: 0,
};

// Gameplay randomness (mission targets, traffic respawns, pedestrian turns,
// police spawn angles) draws from a second stream seeded off the same seed,
// so ?seed= replays the same mission flow instead of Math.random() noise.
const playRng = makeRng((SEED ^ 0x9e3779b9) >>> 0);

const saved = loadSave();
if (saved) {
  $('btnContinue').style.display = '';
  $('btnContinue').addEventListener('click', () => {
    game.money = saved.money || 120;
    game.missionsDone = saved.missionsDone || 0;
    game.totalEarned = saved.totalEarned || 0;
    sfx.ensure(); sfx.click();
    startGame();
  });
}

// ---------- Player ----------
const player = {
  mesh: null, x: 8, z: 30, angle: 0, vy: 0, grounded: true, speed: 0,
};
{
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xff2e88, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.05, 10), jacket);
  body.position.y = 1.0; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 }));
  head.position.y = 1.78; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.6 }));
  cap.position.y = 1.98; g.add(cap);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), jacket);
  arm.position.set(0.48, 1.05, 0.1); arm.name = 'armR'; g.add(arm);
  const armL = arm.clone(); armL.name = 'armL'; armL.position.x = -0.48; g.add(armL);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(player.x, 0, player.z);
  scene.add(g);
  player.mesh = g;
}

// ---------- Driving state ----------
const drive = { speed: 0, steer: 0, mesh: null };

// ---------- Audio ----------
const sfx = new SoundFX();

// ---------- Missions ----------
const MISSION_POINTS = [
  { x: -116, z: 58 }, { x: 116, z: -58 }, { x: 58, z: 174 }, { x: -174, z: -116 },
  { x: 174, z: 116 }, { x: 0, z: -174 }, { x: -58, z: -174 }, { x: 116, z: 174 },
];
function pickPoint(exclude) {
  const opts = MISSION_POINTS.filter((p) => !exclude || dist2(p.x, p.z, exclude.x, exclude.z) > 10000);
  return pick(playRng, opts);
}

function makeBeacon(x, z, color) {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 34, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  g.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.22, 10, 28),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  g.add(ring);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }),
  );
  gem.position.y = 4.2;
  g.add(gem);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}
function clearBeacon() {
  if (game.beacon) { scene.remove(game.beacon); game.beacon = null; }
}

function startMission1() {
  const p = pickPoint({ x: player.x, z: player.z });
  game.mission = { id: 1, stage: 'pickup', tx: p.x, tz: p.z, timer: 0 };
  clearBeacon();
  game.beacon = makeBeacon(p.x, p.z, 0xffd23d);
  objTitle.textContent = 'MISI 1 — PAKET NEON';
  objText.textContent = 'Ambil paket di penanda kuning, lalu antar ke tujuan.';
  toast('Misi 1: ambil paket di penanda kuning', 4);
}
function startMission2() {
  const p = pickPoint({ x: player.x, z: player.z });
  game.mission = { id: 2, stage: 'escape', tx: p.x, tz: p.z, timer: 90 };
  setWanted(3);
  clearBeacon();
  game.beacon = makeBeacon(p.x, p.z, 0x3dd8ff);
  objTitle.textContent = 'MISI 2 — KABUR DARI POLISI';
  objText.textContent = 'Polisi mengejarmu! Capai rumah aman biru sebelum waktu habis.';
  toast('Misi 2: kabur! Capai rumah aman biru', 4);
  sfx.mission();
}
function startCourier() {
  const p = pickPoint({ x: player.x, z: player.z });
  game.mission = { id: 3, stage: 'pickup', tx: p.x, tz: p.z, timer: 0 };
  clearBeacon();
  game.beacon = makeBeacon(p.x, p.z, 0x7dff9a);
  objTitle.textContent = 'PEKERJAAN — ANTAR PAKET';
  objText.textContent = 'Ambil paket hijau, antar ke tujuan. Bayaran $200.';
}
function completeMission(reward, next) {
  game.money += reward;
  game.totalEarned += reward;
  game.missionsDone += 1;
  clearBeacon();
  sfx.mission();
  writeSave();
  if (next === 'm2') { toast(`Paket terkirim! +$${reward}`, 4); startMission2(); }
  else if (next === 'courier') { toast(`Selamat dari polisi! +$${reward}`, 4); startCourier(); }
  else { toast(`Paket terkirim! +$${reward}`, 4); startCourier(); }
}
function failMission2() {
  game.mission = null;
  clearBeacon();
  objTitle.textContent = 'NEON BAY — BEBAS';
  objText.textContent = 'Misi kabur gagal, tapi Raka masih bebas. Cari pekerjaan baru di kota.';
  toast('Misi kabur gagal — polisi masih memburumu', 4);
  setTimeout(() => { if (!game.mission && game.state === 'play') startCourier(); }, 8000);
}

// ---------- Wanted & police ----------
function setWanted(n) {
  game.wanted = Math.max(0, Math.min(5, n));
  game.hiddenTime = 0;
  syncPolice();
}
function syncPolice() {
  const want = game.state === 'play' ? game.wanted : 0;
  while (game.police.length < want) spawnPolice();
  while (game.police.length > want) {
    const p = game.police.pop();
    scene.remove(p.mesh);
  }
}
function spawnPolice() {
  const mesh = makeCarMesh(0x1a1a22, true);
  scene.add(mesh);
  const a = range(playRng, 0, Math.PI * 2);
  const px = player.x + Math.cos(a) * 70;
  const pz = player.z + Math.sin(a) * 70;
  game.police.push({ mesh, x: px, z: pz, angle: 0, speed: 0, ramCooldown: 0 });
}
function updatePolice(dt) {
  const tx = game.playerCar ? drive.mesh.position.x : player.x;
  const tz = game.playerCar ? drive.mesh.position.z : player.z;
  for (const p of game.police) {
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const target = Math.atan2(dx, dz);
    let diff = target - p.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const maxSpeed = 30 + game.wanted * 2.2;
    p.speed = Math.min(maxSpeed, p.speed + 16 * dt);
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.z += Math.cos(p.angle) * p.speed * dt;
    const c = collideBuildings(world, p.x, p.z, 2.2);
    p.x = c.x; p.z = c.z;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.angle;
    const bar = p.mesh.getObjectByName('lightbar');
    if (bar) bar.material.emissive.setHex(Math.floor(game.time * 4) % 2 === 0 ? 0xff2020 : 0x2244ff);
    // Ram the player.
    p.ramCooldown -= dt;
    if (d < 3.4 && p.ramCooldown <= 0) {
      p.ramCooldown = 0.9;
      hurtPlayer(game.playerCar ? 7 : 14);
      sfx.crash();
      if (game.playerCar) drive.speed *= 0.55;
      // Shove the police car back so it cannot chain-ram every frame.
      p.x += ((p.x - tx) / d) * 7;
      p.z += ((p.z - tz) / d) * 7;
      p.speed *= 0.35;
      toast('Polisi menabrakmu!', 1.5);
    }
  }
}
function hurtPlayer(amount) {
  if (game.state !== 'play') return;
  game.health -= amount;
  if (game.health <= 0) {
    game.health = 0;
    gameOver();
  }
}

// ---------- Input ----------
addEventListener('keydown', (e) => {
  game.keys[e.code] = true;
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyF') punch();
  if (e.code === 'KeyM') { const m = sfx.toggleMuted(); $('btnMute').textContent = m ? 'SUARA: OFF' : 'SUARA: ON'; toast(m ? 'Suara dimatikan (M)' : 'Suara dinyalakan (M)', 1.5); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { game.keys[e.code] = false; });
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', (e) => {
  if (game.state !== 'play') return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (game.state !== 'play') return;
  if (document.pointerLockElement === canvas) {
    game.camYaw -= e.movementX * 0.0032;
    game.camPitch = Math.max(-0.15, Math.min(0.9, game.camPitch + e.movementY * 0.0024));
  } else if (dragging) {
    game.camYaw -= (e.clientX - lastX) * 0.005;
    game.camPitch = Math.max(-0.15, Math.min(0.9, game.camPitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  }
});
canvas.addEventListener('click', () => { if (game.state === 'play') punch(); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) dragging = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Cars: enter / exit / steal ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD * maxD;
  const check = (mesh, x, z, kind, ref) => {
    const d = dist2(player.x, player.z, x, z);
    if (d < bestD) { bestD = d; best = { mesh, x, z, kind, ref }; }
  };
  for (const c of world.parkedCars) if (!c.taken) check(c.mesh, c.x, c.z, 'parked', c);
  for (const c of world.trafficCars) if (!c.stolen) check(c.mesh, c.mesh.position.x, c.mesh.position.z, 'traffic', c);
  for (const p of game.police) check(p.mesh, p.x, p.z, 'police', p);
  return best;
}
function tryEnterExitCar() {
  if (game.state !== 'play' || game.exitCooldown > 0) return;
  if (game.playerCar) { exitCar(); return; }
  const near = nearestCar(5);
  if (!near) return;
  if (near.kind === 'police') { toast('Itu mobil polisi — terlalu berisiko!', 2); return; }
  enterCar(near);
  if (near.kind === 'parked') { setWanted(game.wanted + 1); toast('Mobil dicuri! Wanted naik ★', 2.5); }
  else { setWanted(game.wanted + 2); toast('Mobil traffic dibajak! Wanted naik ★★', 2.5); }
  sfx.click();
}
function enterCar(near) {
  game.playerCar = near;
  drive.mesh = near.mesh;
  drive.speed = 0;
  drive.steer = 0;
  if (near.kind === 'parked') near.ref.taken = true;
  if (near.kind === 'traffic') near.ref.stolen = true;
  player.mesh.visible = false;
  hudHint.textContent = 'WASD mengemudi · E keluar mobil';
}
function exitCar() {
  const c = game.playerCar;
  if (!c) return;
  const a = drive.mesh.rotation.y;
  player.x = drive.mesh.position.x + Math.cos(a) * 2.6;
  player.z = drive.mesh.position.z - Math.sin(a) * 2.6;
  const pos = collideBuildings(world, player.x, player.z, 0.7);
  player.x = pos.x; player.z = pos.z;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.visible = true;
  if (c.kind === 'parked') {
    c.ref.x = drive.mesh.position.x; c.ref.z = drive.mesh.position.z;
    c.ref.angle = a; c.ref.taken = false;
  }
  game.playerCar = null;
  drive.mesh = null;
  drive.speed = 0;
  game.exitCooldown = 0.6;
  hudHint.textContent = '';
}

// ---------- Combat ----------
function punch() {
  if (game.state !== 'play' || game.playerCar || game.punchCooldown > 0) return;
  game.punchCooldown = 0.45;
  game.punchAnim = 0.25;
  sfx.punch();
  const fx = Math.sin(player.angle), fz = Math.cos(player.angle);
  for (const ped of world.pedestrians) {
    if (ped.state === 'down') continue;
    const dx = ped.x - player.x, dz = ped.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.1) {
      ped.state = 'down'; ped.down = 4; ped.mesh.rotation.z = Math.PI / 2;
      setWanted(game.wanted + 1);
      toast('Kamu memukul pejalan kaki! Wanted naik ★', 2);
    }
  }
}

// ---------- Traffic & pedestrians ----------
function updateTraffic(dt) {
  for (const c of world.trafficCars) {
    if (c.stolen) continue;
    c.pos += c.dir * c.speed * dt;
    if (c.pos > HALF - 12 || c.pos < -HALF + 12) {
      c.horizontal = playRng() < 0.5;
      c.street = world.streets[Math.floor(playRng() * world.streets.length)];
      c.dir = playRng() < 0.5 ? 1 : -1;
      c.pos = c.dir > 0 ? -HALF + 14 : HALF - 14;
    }
    const lane = c.dir > 0 ? -3.4 : 3.4;
    if (c.horizontal) { c.mesh.position.set(c.pos, 0, c.street + lane); c.mesh.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { c.mesh.position.set(c.street + lane, 0, c.pos); c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI; }
  }
}
function updatePedestrians(dt) {
  for (const ped of world.pedestrians) {
    if (ped.state === 'down') {
      ped.down -= dt;
      if (ped.down <= 0) { ped.state = 'flee'; ped.timer = 3; ped.mesh.rotation.z = 0; }
      continue;
    }
    const px = game.playerCar ? drive.mesh.position.x : player.x;
    const pz = game.playerCar ? drive.mesh.position.z : player.z;
    const dPlayer = Math.hypot(ped.x - px, ped.z - pz);
    if (ped.state === 'walk' && dPlayer < 7 && game.playerCar && Math.abs(drive.speed) > 6) {
      ped.state = 'flee'; ped.timer = 2.5;
      ped.angle = Math.atan2(ped.x - px, ped.z - pz);
    }
    if (ped.state === 'flee') {
      ped.timer -= dt;
      if (ped.timer <= 0) ped.state = 'walk';
    }
    if (ped.state === 'walk') {
      ped.timer -= dt;
      if (ped.timer <= 0) { ped.angle = range(playRng, 0, Math.PI * 2); ped.timer = range(playRng, 2, 7); }
    }
    const sp = ped.state === 'flee' ? 5.5 : ped.speed;
    ped.x += Math.sin(ped.angle) * sp * dt;
    ped.z += Math.cos(ped.angle) * sp * dt;
    const c = collideBuildings(world, ped.x, ped.z, 0.6);
    ped.x = c.x; ped.z = c.z;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.angle;
    // Run over by the player's car.
    if (game.playerCar && dPlayer < 2.2 && Math.abs(drive.speed) > 4 && ped.state !== 'down') {
      ped.state = 'down'; ped.down = 5; ped.mesh.rotation.z = Math.PI / 2;
      setWanted(game.wanted + 1);
      sfx.crash();
      toast('Kamu menabrak pejalan kaki! Wanted naik ★', 2.5);
    }
  }
}
function updatePickups(dt) {
  for (const p of world.pickups) {
    if (p.taken) continue;
    p.spin += dt;
    p.mesh.rotation.z = p.spin;
    p.mesh.position.y = 1.0 + Math.sin(p.spin * 2) * 0.15;
    const d = dist2(player.x, player.z, p.x, p.z);
    const cd = game.playerCar ? dist2(drive.mesh.position.x, drive.mesh.position.z, p.x, p.z) : 1e9;
    if (d < 4 || cd < 6) {
      p.taken = true;
      p.mesh.visible = false;
      game.money += 25;
      game.totalEarned += 25;
      sfx.pickup();
      toast('+$25 uang jalanan', 1.5);
      writeSave();
    }
  }
}

// ---------- Driving physics ----------
function updateDriving(dt) {
  const k = game.keys;
  const forward = (k.KeyW || k.ArrowUp) ? 1 : 0;
  const back = (k.KeyS || k.ArrowDown) ? 1 : 0;
  const left = (k.KeyA || k.ArrowLeft) ? 1 : 0;
  const right = (k.KeyD || k.ArrowRight) ? 1 : 0;
  const targetSteer = (left ? 1 : 0) - (right ? 1 : 0);
  drive.steer += (targetSteer - drive.steer) * Math.min(1, dt * 8);
  if (forward) drive.speed += 15 * dt;
  if (back) drive.speed -= drive.speed > 0.5 ? 26 * dt : 9 * dt;
  drive.speed -= drive.speed * 0.55 * dt; // drag
  drive.speed = Math.max(-11, Math.min(40, drive.speed));
  const a = drive.mesh.rotation.y;
  const turn = drive.steer * 1.9 * dt * Math.min(1, Math.abs(drive.speed) / 9) * (drive.speed >= 0 ? 1 : -1);
  drive.mesh.rotation.y = a + turn;
  const na = drive.mesh.rotation.y;
  let nx = drive.mesh.position.x + Math.sin(na) * drive.speed * dt;
  let nz = drive.mesh.position.z + Math.cos(na) * drive.speed * dt;
  const c = collideBuildings(world, nx, nz, 2.2);
  if (Math.abs(c.x - nx) > 0.01 || Math.abs(c.z - nz) > 0.01) {
    if (Math.abs(drive.speed) > 12) sfx.crash();
    drive.speed *= 0.4;
  }
  nx = c.x; nz = c.z;
  // Bump traffic cars.
  for (const t of world.trafficCars) {
    if (t.stolen) continue;
    const d2 = dist2(nx, nz, t.mesh.position.x, t.mesh.position.z);
    if (d2 < 21) {
      const d = Math.sqrt(d2) || 1;
      const push = (4.6 - d) * 0.5;
      nx += ((nx - t.mesh.position.x) / d) * push;
      nz += ((nz - t.mesh.position.z) / d) * push;
      if (Math.abs(drive.speed) > 10) { sfx.crash(); drive.speed *= 0.6; }
    }
  }
  drive.mesh.position.x = nx;
  drive.mesh.position.z = nz;
  // Camera follows behind the car.
  const wantYaw = na + Math.PI;
  let dy = wantYaw - game.camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  game.camYaw += dy * Math.min(1, dt * 2.2);
  game.camPitch += (0.3 - game.camPitch) * Math.min(1, dt * 2);
}

// ---------- On-foot movement ----------
function updateOnFoot(dt) {
  const k = game.keys;
  const run = k.ShiftLeft || k.ShiftRight;
  const speed = run ? 9.5 : 5.2;
  let ix = 0, iz = 0;
  if (k.KeyW || k.ArrowUp) iz += 1;
  if (k.KeyS || k.ArrowDown) iz -= 1;
  if (k.KeyA || k.ArrowLeft) ix -= 1;
  if (k.KeyD || k.ArrowRight) ix += 1;
  const len = Math.hypot(ix, iz);
  if (len > 0) {
    ix /= len; iz /= len;
    const sin = Math.sin(game.camYaw), cos = Math.cos(game.camYaw);
    // Forward on screen is away from the camera: (-sin, -cos); right is (-fz, fx).
    const fx = -sin, fz = -cos;
    const rx = -fz, rz = fx;
    const wx = fx * iz + rx * ix;
    const wz = fz * iz + rz * ix;
    player.x += wx * speed * dt;
    player.z += wz * speed * dt;
    player.angle = Math.atan2(wx, wz);
    player.speed = speed;
    player.mesh.rotation.y = player.angle;
    player.mesh.position.y = Math.abs(Math.sin(game.time * (run ? 11 : 8))) * 0.06;
  } else {
    player.speed = 0;
    player.mesh.position.y = 0;
  }
  const c = collideBuildings(world, player.x, player.z, 0.7);
  player.x = c.x; player.z = c.z;
  // Jump / gravity.
  if (k.Space && player.grounded) { player.vy = 7.5; player.grounded = false; }
  if (!player.grounded) {
    player.vy -= 22 * dt;
    player.mesh.position.y += player.vy * dt;
    if (player.mesh.position.y <= 0) { player.mesh.position.y = 0; player.vy = 0; player.grounded = true; }
  }
  player.mesh.position.x = player.x;
  player.mesh.position.z = player.z;
  // Punch arm swing.
  const armR = player.mesh.getObjectByName('armR');
  if (armR) armR.rotation.x = game.punchAnim > 0 ? -1.4 : 0;
}

// ---------- Missions update ----------
function updateMission(dt) {
  const m = game.mission;
  if (!m) return;
  const px = game.playerCar ? drive.mesh.position.x : player.x;
  const pz = game.playerCar ? drive.mesh.position.z : player.z;
  const d = Math.hypot(px - m.tx, pz - m.tz);
  if (m.id === 1 && m.stage === 'pickup' && d < 7) {
    m.stage = 'deliver';
    const p = pickPoint({ x: m.tx, z: m.tz });
    m.tx = p.x; m.tz = p.z;
    clearBeacon();
    game.beacon = makeBeacon(p.x, p.z, 0xffd23d);
    objText.textContent = 'Paket didapat! Antar ke penanda kuning berikutnya.';
    toast('Paket didapat — antar ke tujuan', 3);
    sfx.pickup();
  } else if (m.id === 1 && m.stage === 'deliver' && d < 7) {
    game.mission = null;
    completeMission(500, 'm2');
  } else if (m.id === 2 && m.stage === 'escape') {
    m.timer -= dt;
    objText.textContent = `Polisi mengejarmu! Capai rumah aman biru — ${Math.max(0, Math.ceil(m.timer))} dtk.`;
    if (d < 7) { game.mission = null; setWanted(0); completeMission(800, 'courier'); }
    else if (m.timer <= 0) failMission2();
  } else if (m.id === 3 && m.stage === 'pickup' && d < 7) {
    m.stage = 'deliver';
    const p = pickPoint({ x: m.tx, z: m.tz });
    m.tx = p.x; m.tz = p.z;
    clearBeacon();
    game.beacon = makeBeacon(p.x, p.z, 0x7dff9a);
    objText.textContent = 'Paket didapat! Antar ke penanda hijau.';
    sfx.pickup();
  } else if (m.id === 3 && m.stage === 'deliver' && d < 7) {
    game.mission = null;
    completeMission(200, 'courier');
  }
  if (game.beacon) {
    game.beacon.children[2].rotation.y += dt * 2;
    game.beacon.children[2].position.y = 4.2 + Math.sin(game.time * 2.5) * 0.5;
  }
}

// ---------- Wanted decay ----------
function updateWanted(dt) {
  if (game.wanted === 0) return;
  let nearest = 1e9;
  for (const p of game.police) {
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < nearest) nearest = d;
  }
  if (nearest > 55) {
    game.hiddenTime += dt;
    if (game.hiddenTime > 6) { setWanted(game.wanted - 1); toast('Wanted turun — kamu berhasil bersembunyi', 2); }
  } else game.hiddenTime = 0;
}

// ---------- HUD & minimap ----------
function updateHUD(dt) {
  hudMoney.textContent = `$${game.money.toLocaleString('id-ID')}`;
  hudMission.textContent = `${Math.min(game.missionsDone, 2)} / 2`;
  hpFill.style.width = `${Math.max(0, game.health)}%`;
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += i <= game.wanted ? '★' : '<span class="off">★</span>';
  hudWanted.innerHTML = stars;
  const kmh = game.playerCar ? Math.abs(drive.speed) * 3.6 : player.speed * 3.6;
  hudSpeed.innerHTML = `${Math.round(kmh)} <small>km/j</small>`;
  // Toast lifetime runs on real elapsed time, not on the (variable) HUD tick.
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.textContent = ''; }
  if (!game.playerCar && game.state === 'play') {
    const near = nearestCar(5);
    hudHint.textContent = near ? (near.kind === 'police' ? 'Mobil polisi — jangan disentuh' : 'Tekan E untuk masuk mobil') : '';
  }
}
function drawMinimap() {
  const S = 190, scale = S / (HALF * 2 + 20);
  const toMap = (x, z) => [(x + HALF + 10) * scale, (z + HALF + 10) * scale];
  mmCtx.clearRect(0, 0, S, S);
  mmCtx.fillStyle = '#120a24';
  mmCtx.fillRect(0, 0, S, S);
  // Blocks.
  mmCtx.fillStyle = '#2c2350';
  for (let bx = 0; bx < GRID; bx++) for (let bz = 0; bz < GRID; bz++) {
    const x0 = -HALF + STREET + bx * PITCH, z0 = -HALF + STREET + bz * PITCH;
    const [mx, mz] = toMap(x0, z0);
    mmCtx.fillRect(mx, mz, BLOCK * scale, BLOCK * scale);
  }
  // Pickups.
  mmCtx.fillStyle = '#7dff9a';
  for (const p of world.pickups) if (!p.taken) { const [mx, mz] = toMap(p.x, p.z); mmCtx.fillRect(mx - 1, mz - 1, 2, 2); }
  // Mission marker.
  if (game.mission) {
    const [mx, mz] = toMap(game.mission.tx, game.mission.tz);
    mmCtx.fillStyle = '#ffd23d';
    mmCtx.beginPath();
    mmCtx.moveTo(mx, mz - 6); mmCtx.lineTo(mx + 6, mz); mmCtx.lineTo(mx, mz + 6); mmCtx.lineTo(mx - 6, mz);
    mmCtx.closePath(); mmCtx.fill();
  }
  // Traffic + parked cars.
  mmCtx.fillStyle = '#3dd8ff';
  for (const c of world.trafficCars) if (!c.stolen) { const [mx, mz] = toMap(c.mesh.position.x, c.mesh.position.z); mmCtx.fillRect(mx - 1.5, mz - 1.5, 3, 3); }
  // Police.
  mmCtx.fillStyle = '#ff3d5e';
  for (const p of game.police) { const [mx, mz] = toMap(p.x, p.z); mmCtx.beginPath(); mmCtx.arc(mx, mz, 3, 0, 7); mmCtx.fill(); }
  // Player arrow.
  const px = game.playerCar ? drive.mesh.position.x : player.x;
  const pz = game.playerCar ? drive.mesh.position.z : player.z;
  const pa = game.playerCar ? drive.mesh.rotation.y : player.angle;
  const [mx, mz] = toMap(px, pz);
  mmCtx.save();
  mmCtx.translate(mx, mz);
  mmCtx.rotate(pa);
  mmCtx.fillStyle = '#ffffff';
  mmCtx.beginPath();
  mmCtx.moveTo(0, -6); mmCtx.lineTo(4.5, 5); mmCtx.lineTo(-4.5, 5);
  mmCtx.closePath(); mmCtx.fill();
  mmCtx.restore();
}

// ---------- Camera ----------
// Reused scratch vector: updateCamera runs every frame, so it must not
// allocate a fresh THREE.Vector3 on each call.
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (game.state === 'title') {
    // Slow orbit over the living city behind the title screen.
    const t = game.time * 0.045;
    camera.position.set(Math.cos(t) * 150, 78, Math.sin(t) * 150);
    camera.lookAt(0, 4, 0);
    return;
  }
  const tx = game.playerCar ? drive.mesh.position.x : player.x;
  const tz = game.playerCar ? drive.mesh.position.z : player.z;
  const dist = game.playerCar ? 11 : 8.5;
  const height = game.playerCar ? 4.6 : 3.4;
  const cx = tx + Math.sin(game.camYaw) * dist;
  const cz = tz + Math.cos(game.camYaw) * dist;
  const cy = height + game.camPitch * 4;
  camera.position.lerp(camTarget.set(cx, cy, cz), Math.min(1, dt * 8));
  camera.lookAt(tx, game.playerCar ? 1.6 : 1.9, tz);
}

// ---------- Screens / flow ----------
function show(el) { el.style.display = 'flex'; }
function hide(el) { el.style.display = 'none'; }
function startGame() {
  hide(startScreen); hide(pauseScreen); hide(overScreen);
  game.state = 'play';
  if (!game.mission && game.missionsDone === 0) startMission1();
  else if (!game.mission && game.missionsDone === 1) startMission2();
  else if (!game.mission) startCourier();
  sfx.ensure();
}
function togglePause() {
  if (game.state === 'play') { game.state = 'pause'; show(pauseScreen); if (document.pointerLockElement) document.exitPointerLock(); }
  else if (game.state === 'pause') { game.state = 'play'; hide(pauseScreen); }
}
function gameOver() {
  game.state = 'over';
  $('overText').textContent = `Raka tumbang dengan $${game.money} di kantong dan ${game.missionsDone} misi selesai.`;
  show(overScreen);
  if (document.pointerLockElement) document.exitPointerLock();
  writeSave();
}
$('btnStart').addEventListener('click', () => { sfx.ensure(); sfx.click(); startGame(); });
$('btnMute').addEventListener('click', () => {
  sfx.ensure();
  const m = sfx.toggleMuted();
  $('btnMute').textContent = m ? 'SUARA: OFF' : 'SUARA: ON';
});
$('btnResume').addEventListener('click', () => { sfx.click(); togglePause(); });
$('btnRestart').addEventListener('click', () => { sfx.click(); location.reload(); });
$('btnAgain').addEventListener('click', () => { sfx.click(); location.reload(); });

// ---------- Main loop ----------
let last = performance.now();
function step(dt) {
  game.time += dt;
  game.exitCooldown = Math.max(0, game.exitCooldown - dt);
  game.punchCooldown = Math.max(0, game.punchCooldown - dt);
  game.punchAnim = Math.max(0, game.punchAnim - dt);
  updateTraffic(dt);
  updatePedestrians(dt);
  updatePickups(dt);
  if (game.state === 'play') {
    if (game.playerCar) updateDriving(dt);
    else updateOnFoot(dt);
    updatePolice(dt);
    updateMission(dt);
    updateWanted(dt);
    if (game.wanted === 0 && game.health < 100) game.health = Math.min(100, game.health + 2 * dt);
    sfx.setEngine(game.playerCar ? Math.abs(drive.speed) / 40 : 0, !!game.playerCar);
    sfx.setSiren(game.wanted > 0, dt);
  } else {
    sfx.setEngine(0, false);
    sfx.setSiren(false, dt);
  }
  updateCamera(dt);
  // The 2D minimap and DOM HUD are expensive under software rendering,
  // so refresh them on a timer instead of every frame.
  game.hudTimer += dt;
  if (game.hudTimer > 0.1) { updateHUD(game.hudTimer); game.hudTimer = 0; }
  game.mapTimer += dt;
  if (game.mapTimer > 0.2) { drawMinimap(); game.mapTimer = 0; }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  step(dt);
  renderer.render(scene, camera);
}

// ---------- Shot staging (deterministic screenshots) ----------
function stageShot() {
  if (SHOT === 'play' || SHOT === 'end') {
    // Skip the title screen: drop straight into a live chase scene.
    hide(startScreen);
    game.state = 'play';
    game.money = 1250;
    game.missionsDone = 1;
    // Put the player in a parked car on the central avenue, heading straight
    // down it toward a safehouse beacon on the same street.
    const car = world.parkedCars[0];
    car.mesh.position.set(0, 0, 200);
    car.mesh.rotation.y = Math.PI;
    enterCar({ mesh: car.mesh, kind: 'parked', ref: car });
    setWanted(2);
    startMission2();
    game.mission.tx = 0; game.mission.tz = -116;
    clearBeacon();
    game.beacon = makeBeacon(0, -116, 0x3dd8ff);
    // Fast-forward: drive toward the beacon with a simple autopilot.
    for (let i = 0; i < 60 * 7; i++) {
      const dx = game.mission.tx - drive.mesh.position.x;
      const dz = game.mission.tz - drive.mesh.position.z;
      const want = Math.atan2(dx, dz);
      let diff = want - drive.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      game.keys = {};
      if (Math.abs(diff) > 0.35) game.keys[diff > 0 ? 'KeyA' : 'KeyD'] = true;
      game.keys.KeyW = true;
      step(1 / 60);
    }
    game.keys = {};
    game.health = 100; // staging chase damage doesn't carry into the frame
    if (SHOT === 'end') {
      game.health = 0;
      gameOver();
    }
  } else {
    // Title: the camera orbits the living city (handled in updateCamera).
    game.state = 'title';
    camera.position.set(120, 70, 120);
    camera.lookAt(0, 0, 0);
  }
}

// ---------- Boot ----------
if (SHOT) stageShot();
requestAnimationFrame(frame);
window.__neonbay = { game, world, player, renderer, scene };
