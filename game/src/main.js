// NEON BAY v3 — boot, loop, driving, police and HUD.
//
// The orchestrator: it builds the renderer, the city, the sky, the traffic
// and the missions, then runs the fixed-step loop. The player drives a
// magenta car (or walks), steals traffic cars, earns cash from missions and
// outruns the police under a five-star wanted system. The camera hangs far
// behind and high above the car, the way the genre's chase camera does.
//
// ?seed=N fixes the city. ?shot=start|play|end stages one screenshot scene
// instead of the loop and sets window.__shotReady when it is painted.

import { createRng, seedFromParam } from './rng.js';
import { createSky } from './sky.js';
import { buildCity, PITCH } from './world.js';
import { createTraffic, buildCarMesh } from './traffic.js';
import { createMissions, STORY_MISSIONS } from './missions.js';
import { createAudio } from './audio.js';

const THREE = window.THREE;
const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'neonbay-save-v3';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = seedFromParam(params.get('seed'), 1);

const canvas = document.getElementById('view');
const statusEl = document.getElementById('status');
const hud = {
  speed: document.getElementById('speed'),
  cash: document.getElementById('cash'),
  stars: document.getElementById('stars'),
  clock: document.getElementById('clock'),
  weather: document.getElementById('weather'),
  mission: document.getElementById('mission'),
  timer: document.getElementById('mission-timer'),
  toast: document.getElementById('toast'),
  hint: document.getElementById('hint'),
  minimap: document.getElementById('minimap'),
  title: document.getElementById('title'),
  pause: document.getElementById('pause'),
  busted: document.getElementById('busted'),
  complete: document.getElementById('complete'),
  bustedStats: document.getElementById('busted-stats'),
  completeText: document.getElementById('complete-text'),
  help: document.getElementById('help'),
};

const rng = createRng(seed);
const audio = createAudio();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1c50);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 40, 90);

const sky = createSky(scene, rng.fork(11));
const city = buildCity(scene, rng.fork(23), renderer.capabilities.getMaxAnisotropy());
const traffic = createTraffic(scene, city, rng.fork(37), () => sky.hour, () => ({ x: player.x, z: player.z }));
const missions = createMissions(scene, city, rng.fork(53));
traffic.seed(14);

// ---- save ---------------------------------------------------------------
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { cash: 0, completed: [] };
    const parsed = JSON.parse(raw);
    return { cash: Number(parsed.cash) || 0, completed: Array.isArray(parsed.completed) ? parsed.completed : [] };
  } catch {
    return { cash: 0, completed: [] };
  }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash, completed: completedIds }));
  } catch { /* private mode: the save lasts this visit only */ }
}
const saved = readSave();
let cash = saved.cash;
const completedIds = saved.completed.slice();

// ---- player ---------------------------------------------------------------
const player = {
  mode: 'foot',
  x: city.spawn.x,
  z: city.spawn.z,
  heading: city.spawn.heading,
  speed: 0,
  steer: 0,
  walkBob: 0,
};

const myCar = {
  mesh: buildCarMesh('sedan', 0xff2d78),
  x: city.spawn.x + 4,
  z: city.spawn.z,
  heading: city.spawn.heading,
  speed: 0,
};
myCar.mesh.position.set(myCar.x, 0, myCar.z);
myCar.mesh.rotation.y = myCar.heading;
scene.add(myCar.mesh);
// Spoiler and underglow, so the player's car reads at a glance.
const spoiler = new THREE.Mesh(
  new THREE.BoxGeometry(1.7, 0.08, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.6 }),
);
spoiler.position.set(0, 1.15, -2.1);
spoiler.castShadow = true;
myCar.mesh.add(spoiler);
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2d78, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const underglow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.6), glowMat);
underglow.rotation.x = -Math.PI / 2;
underglow.position.y = 0.06;
myCar.mesh.add(underglow);

const walker = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.8 });
const walkerBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.85, 4, 10), bodyMat);
walkerBody.position.y = 1.05;
walkerBody.castShadow = true;
walker.add(walkerBody);
const walkerHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0xd8a075, roughness: 0.7 }));
walkerHead.position.y = 1.95;
walkerHead.castShadow = true;
walker.add(walkerHead);
walker.position.set(player.x, 0, player.z);
scene.add(walker);

// Parked cars scattered around the city: free to take, no wanted level.
const parked = [];
for (let index = 0; index < 6; index += 1) {
  const spot = city.randomRoadPoint(30, player.x, player.z);
  const kind = rng.pick(['sedan', 'sedan', 'taxi']);
  const paint = kind === 'taxi' ? 0xffc61a : rng.pick([0x8a93a6, 0x5a6b8a, 0x3d6b4a, 0x777777]);
  const mesh = buildCarMesh(kind, paint);
  const heading = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  mesh.position.set(spot.x, 0, spot.z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  parked.push({ mesh, x: spot.x, z: spot.z, heading, kind });
}
parked.push({ mesh: myCar.mesh, x: myCar.x, z: myCar.z, heading: myCar.heading, kind: 'sedan', mine: true });

// Fake blob shadow under the player car (backs up the real shadows at night).
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
const blob = new THREE.Mesh(new THREE.PlaneGeometry(3, 5.2), blobMat);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.03;
scene.add(blob);

// ---- input ----------------------------------------------------------------
// Continuous keys (driving, walking) live in `keys` and are read every step.
// Discrete actions (enter a car, start a mission, pause) fire at once from
// the keydown event: polling them in the loop would drop quick taps on a
// slow frame, so they never wait for the next step.
const keys = new Set();

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  keys.add(event.code);
  pressAction(event.code);
  if (event.code === 'KeyM') {
    const nowMuted = audio.setMuted(!audio.isMuted());
    notify(nowMuted ? 'Suara dimatikan (M)' : 'Suara dinyalakan (M)');
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  audio.unlock();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- notifications ----------------------------------------------------------
let toastTimer = null;
function notify(message) {
  hud.toast.textContent = message;
  hud.toast.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => hud.toast.classList.remove('show'), 3400);
  statusEl.textContent = message;
}

// ---- wanted & police --------------------------------------------------------
let wanted = 0;
let calmTimer = 0;
let crimeCooldown = 0;
let bustedTimer = 0;
let shake = 0;
let wallCooldown = 0;
let bumpCooldown = 0;
const police = [];

function addWanted(amount, reason) {
  if (crimeCooldown > 0 && amount > 0) return;
  const before = wanted;
  wanted = Math.max(0, Math.min(5, wanted + amount));
  if (amount > 0) {
    crimeCooldown = 1.6;
    calmTimer = 0;
    if (wanted > before) notify(`Wanted naik ke ${wanted} bintang — ${reason}`);
  }
}

function setWanted(value) {
  wanted = Math.max(0, Math.min(5, value));
  calmTimer = 0;
}

function buildPoliceCar() {
  const mesh = buildCarMesh('sedan', 0x14161f);
  const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
  barRed.position.set(-0.4, 1.42, -0.1);
  const barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2d6bff }));
  barBlue.position.set(0.4, 1.42, -0.1);
  mesh.add(barRed);
  mesh.add(barBlue);
  scene.add(mesh);
  return { mesh, barRed, barBlue, x: 0, z: 0, heading: 0, speed: 0, flash: 0 };
}

function spawnPolice() {
  const car = buildPoliceCar();
  const angle = rng.range(0, Math.PI * 2);
  car.x = player.x + Math.sin(angle) * 55;
  car.z = player.z + Math.cos(angle) * 55;
  const fixed = city.resolveCircle(car.x, car.z, 3);
  car.x = fixed.x;
  car.z = fixed.z;
  car.heading = Math.atan2(player.x - car.x, player.z - car.z);
  police.push(car);
}

function updatePolice(dt) {
  const wantCount = Math.min(wanted, 4);
  while (police.length < wantCount) spawnPolice();
  while (police.length > wantCount) {
    const car = police.pop();
    scene.remove(car.mesh);
  }
  let nearest = Infinity;
  for (const car of police) {
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const dist = Math.hypot(dx, dz);
    nearest = Math.min(nearest, dist);
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
    const topSpeed = 15 + wanted * 1.6;
    car.speed = Math.min(topSpeed, car.speed + 9 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const fixed = city.resolveCircle(car.x, car.z, 2.2);
    car.x = fixed.x;
    car.z = fixed.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    car.flash += dt * 9;
    const redOn = Math.floor(car.flash) % 2 === 0;
    car.barRed.material.color.setHex(redOn ? 0xff2d2d : 0x550000);
    car.barBlue.material.color.setHex(redOn ? 0x000055 : 0x2d6bff);
    if (dist < 3.4) {
      const push = 3.4 - dist;
      player.x += (player.x - car.x) / Math.max(dist, 0.01) * push * 0.5;
      player.z += (player.z - car.z) / Math.max(dist, 0.01) * push * 0.5;
      if (player.mode === 'car') player.speed *= 0.82;
      if (Math.abs(player.speed) > 3) audio.crash(0.4);
      shake = Math.max(shake, 0.5);
    }
  }
  const playerSlow = Math.abs(player.speed) < 2.5;
  if (wanted > 0 && nearest < 4 && playerSlow) {
    bustedTimer += dt;
    if (bustedTimer > 2.5) bustPlayer();
  } else {
    bustedTimer = Math.max(0, bustedTimer - dt * 2);
  }
  audio.siren(wanted > 0 && nearest < 70);
}

function bustPlayer() {
  if (screen !== 'play') return;
  const fine = Math.min(50, Math.floor(cash * 0.1));
  cash = Math.max(0, cash - fine);
  writeSave();
  missions.abort();
  audio.silenceLoops();
  audio.fail();
  screen = 'busted';
  hud.bustedStats.textContent = `Denda $${fine} · Uang tersisa $${cash} · Misi selesai ${missions.completedCount()}/3`;
  hud.busted.classList.add('show');
  hud.hint.textContent = 'Tekan R atau Enter untuk kembali ke jalan.';
  notify('Tertangkap polisi!');
}

// ---- driving & walking ------------------------------------------------------
function driveCar(dt, grip) {
  const throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  const brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
  const steerInput = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const handbrake = keys.has('Space') ? 1 : 0;

  const maxSpeed = 38 * (0.72 + 0.28 * grip);
  const accel = 15 * (0.7 + 0.3 * grip);
  if (throttle) player.speed += accel * dt;
  if (brake) {
    if (player.speed > 0.5) player.speed -= 27 * dt;
    else player.speed -= 8 * dt;
  }
  if (handbrake) player.speed *= Math.max(0, 1 - 3.2 * dt);
  if (!throttle && !brake) player.speed *= Math.max(0, 1 - 0.35 * dt);
  player.speed = Math.max(-11, Math.min(maxSpeed, player.speed));

  const steerTarget = steerInput * 0.62 * (1 - Math.min(Math.abs(player.speed) / maxSpeed, 1) * 0.55);
  player.steer += (steerTarget - player.steer) * Math.min(dt * 7, 1);
  const yaw = player.steer * Math.max(-1, Math.min(1, player.speed / 7)) * 1.85 * (handbrake ? 1.35 : 1);
  player.heading += yaw * dt;

  const nextX = player.x + Math.sin(player.heading) * player.speed * dt;
  const nextZ = player.z + Math.cos(player.heading) * player.speed * dt;
  const fixed = city.resolveCircle(nextX, nextZ, 2.1);
  wallCooldown = Math.max(0, wallCooldown - dt);
  bumpCooldown = Math.max(0, bumpCooldown - dt);
  // A scrape only stings once per half second: without the cooldown the
  // car would lose all speed while sliding along one wall.
  if (fixed.hit && Math.abs(player.speed) > 4 && wallCooldown <= 0) {
    audio.crash(Math.min(Math.abs(player.speed) / 30, 1));
    shake = Math.max(shake, 0.6);
    player.speed *= 0.5;
    wallCooldown = 0.6;
  }
  player.x = Math.max(-168, Math.min(168, fixed.x));
  player.z = Math.max(-168, Math.min(168, fixed.z));

  const hit = traffic.collide(player.x, player.z, 2.1);
  if (hit) {
    player.x += hit.nx * hit.overlap;
    player.z += hit.nz * hit.overlap;
    // Shove the other car AWAY from the player (the normal points from
    // the car to the player, so it is negated here).
    traffic.shove(hit.car, -hit.nx, -hit.nz, 1.6);
    if (bumpCooldown <= 0) {
      if (Math.abs(player.speed) > 3) {
        audio.crash(Math.min(Math.abs(player.speed) / 25, 1));
        addWanted(1, 'menabrak mobil lain');
        shake = Math.max(shake, 0.7);
      }
      player.speed *= -0.25;
      bumpCooldown = 0.8;
    }
  }

  if (Math.abs(player.steer) > 0.45 && Math.abs(player.speed) > 16 && grip < 0.88) audio.skid(0.7);
  myCar.x = player.x;
  myCar.z = player.z;
  myCar.heading = player.heading;
  myCar.speed = player.speed;
  myCar.mesh.position.set(player.x, 0, player.z);
  myCar.mesh.rotation.y = player.heading;
  blob.position.set(player.x, 0.03, player.z);
  blob.rotation.z = -player.heading;
  audio.engine(Math.abs(player.speed) / 38, throttle);
}

function walk(dt) {
  const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  player.heading += turn * 2.4 * dt;
  const walkSpeed = 5.6;
  const nextX = player.x + Math.sin(player.heading) * forward * walkSpeed * dt;
  const nextZ = player.z + Math.cos(player.heading) * forward * walkSpeed * dt;
  const fixed = city.resolveCircle(nextX, nextZ, 0.6);
  player.x = fixed.x;
  player.z = fixed.z;
  if (forward !== 0) player.walkBob += dt * 9;
  walker.position.set(player.x, Math.abs(Math.sin(player.walkBob)) * 0.07, player.z);
  walker.rotation.y = player.heading;
  audio.engine(0, 0);
}

// ---- enter / exit / steal ---------------------------------------------------
function nearestParked() {
  let best = null;
  let bestDist = 4.6;
  for (const car of parked) {
    const dist = Math.hypot(car.x - player.x, car.z - player.z);
    if (dist < bestDist) { best = car; bestDist = dist; }
  }
  return best;
}

function nearestTrafficCar() {
  let best = null;
  let bestDist = 4.6;
  for (const car of traffic.cars) {
    const dist = Math.hypot(car.x - player.x, car.z - player.z);
    if (dist < bestDist) { best = car; bestDist = dist; }
  }
  return best;
}

function enterCar(entry) {
  player.mode = 'car';
  player.x = entry.x;
  player.z = entry.z;
  player.heading = entry.heading;
  player.speed = 0;
  walker.visible = false;
  if (entry.mine) {
    myCar.x = entry.x;
    myCar.z = entry.z;
    myCar.heading = entry.heading;
  } else {
    // Take over this car: the old ride stays parked where it was, and this
    // car becomes the player's ride.
    parked.push({ mesh: myCar.mesh, x: myCar.x, z: myCar.z, heading: myCar.heading, kind: 'sedan' });
    const mesh = entry.mesh;
    myCar.mesh = mesh;
    myCar.x = entry.x;
    myCar.z = entry.z;
    myCar.heading = entry.heading;
    myCar.speed = 0;
    const index = parked.indexOf(entry);
    if (index !== -1) parked.splice(index, 1);
  }
  myCar.mesh.position.set(player.x, 0, player.z);
  myCar.mesh.rotation.y = player.heading;
  audio.click();
  notify('Kamu mengemudi. W/A/S/D untuk jalan, Spasi rem tangan, H klakson.');
}

function tryInteract() {
  if (player.mode === 'car') {
    player.mode = 'foot';
    player.speed = 0;
    player.x += Math.cos(player.heading) * 2.4;
    player.z -= Math.sin(player.heading) * 2.4;
    const fixed = city.resolveCircle(player.x, player.z, 0.6);
    player.x = fixed.x;
    player.z = fixed.z;
    walker.visible = true;
    walker.position.set(player.x, 0, player.z);
    walker.rotation.y = player.heading;
    parked.push({ mesh: myCar.mesh, x: myCar.x, z: myCar.z, heading: myCar.heading, kind: 'sedan', mine: true });
    audio.engine(0, 0);
    notify('Kamu turun dari mobil. Tekan E di dekat mobil untuk naik lagi.');
    return;
  }
  const parkedCar = nearestParked();
  if (parkedCar) {
    enterCar(parkedCar);
    return;
  }
  const moving = nearestTrafficCar();
  if (moving) {
    const index = traffic.cars.indexOf(moving);
    if (index !== -1) traffic.cars.splice(index, 1);
    scene.remove(moving.mesh);
    parked.push({ mesh: moving.mesh, x: moving.x, z: moving.z, heading: moving.heading, kind: moving.kind });
    const entry = parked[parked.length - 1];
    enterCar(entry);
    addWanted(1, 'mencuri mobil');
    return;
  }
  notify('Tidak ada mobil di dekatmu.');
}

// ---- camera -----------------------------------------------------------------
let cameraDistance = 15;
let cameraHeight = 8.5;
let fovNow = 62;
const cameraTarget = new THREE.Vector3();

function updateCamera(dt) {
  const driving = player.mode === 'car';
  const wantDist = driving ? 15 : 7;
  const wantHeight = driving ? 8.5 : 3.4;
  cameraDistance += (wantDist - cameraDistance) * Math.min(dt * 3, 1);
  cameraHeight += (wantHeight - cameraHeight) * Math.min(dt * 3, 1);
  const backX = -Math.sin(player.heading);
  const backZ = -Math.cos(player.heading);
  const desired = new THREE.Vector3(
    player.x + backX * cameraDistance,
    cameraHeight,
    player.z + backZ * cameraDistance,
  );
  camera.position.lerp(desired, 1 - Math.exp(-dt * 4.5));
  cameraTarget.set(
    player.x + Math.sin(player.heading) * 7,
    driving ? 1.6 : 1.4,
    player.z + Math.cos(player.heading) * 7,
  );
  camera.lookAt(cameraTarget);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.7;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    shake = Math.max(0, shake - dt * 1.8);
  }
  const wantFov = 62 + Math.min(Math.abs(player.speed) / 38, 1) * 13;
  if (Math.abs(wantFov - fovNow) > 0.4) {
    fovNow += (wantFov - fovNow) * Math.min(dt * 2.5, 1);
    camera.fov = fovNow;
    camera.updateProjectionMatrix();
  }
}

// ---- HUD & minimap ------------------------------------------------------------
const minimapCtx = hud.minimap.getContext('2d');
let lastStars = -1;
let lastCash = -1;

function updateHud() {
  const kmh = Math.round(Math.abs(player.speed) * 3.6);
  hud.speed.textContent = player.mode === 'car' ? `${kmh} km/j` : 'Jalan kaki';
  if (cash !== lastCash) {
    hud.cash.textContent = `$${cash}`;
    lastCash = cash;
  }
  if (wanted !== lastStars) {
    hud.stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    hud.stars.classList.toggle('hot', wanted >= 3);
    lastStars = wanted;
  }
  hud.clock.textContent = sky.hourLabel();
  hud.weather.textContent = `${sky.weatherName()}${sky.wetness > 0.4 ? ' · jalan licin' : ''}`;
  const missionInfo = missions.hudText({ px: player.x, pz: player.z });
  hud.mission.textContent = missionInfo.line;
  hud.timer.textContent = missionInfo.timer === null ? '' : `${Math.ceil(missionInfo.timer)} dtk`;
  drawMinimap();
}

function drawMinimap() {
  const ctx = minimapCtx;
  const size = 190;
  const scale = size / 340;
  const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
  ctx.fillStyle = '#0a0e18';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0a2e4a';
  ctx.fillRect(0, size - 14, size, 14);
  ctx.strokeStyle = '#3a4152';
  ctx.lineWidth = 5;
  for (const line of city.roadLines) {
    const [x1, y1] = toMap(line, -170);
    const [x2, y2] = toMap(line, 170);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const [x3, y3] = toMap(-170, line);
    const [x4, y4] = toMap(170, line);
    ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
  }
  ctx.fillStyle = '#d8d2a8';
  for (const car of traffic.cars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  for (const car of police) {
    const [x, y] = toMap(car.x, car.z);
    ctx.fillStyle = Math.floor(performance.now() / 300) % 2 === 0 ? '#ff2d2d' : '#2d6bff';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d2a8';
  }
  const marker = missions.marker();
  if (marker) {
    const [x, y] = toMap(marker.x, marker.z);
    const pulse = 3 + Math.sin(performance.now() / 240) * 1.5;
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.fill();
  }
  const [px, py] = toMap(player.x, player.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-player.heading + Math.PI);
  ctx.fillStyle = '#ff2d78';
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- screens & flow -----------------------------------------------------------
let screen = 'title';
let orbitAngle = 0.6;
let completeTimer = null;
// During screenshot staging the simulation runs hundreds of fixed steps;
// rendering every one would waste minutes (and block the page under
// software GL), so steps run silent and only the final frame is painted.
let silentSteps = false;

function renderFrame() {
  if (!silentSteps) renderer.render(scene, camera);
}

function missionCtx() {
  return {
    px: player.x,
    pz: player.z,
    wanted,
    addCash: (amount) => { cash += amount; writeSave(); },
    setWanted,
    notify,
    sfx: audio,
  };
}

function showComplete(result) {
  hud.completeText.textContent = `${result.mission.name} selesai! Hadiah $${result.payout} · Total $${cash}`;
  hud.complete.classList.add('show');
  if (completeTimer) window.clearTimeout(completeTimer);
  completeTimer = window.setTimeout(() => hud.complete.classList.remove('show'), 4200);
}

function startGame(missionIndex) {
  audio.unlock();
  audio.click();
  hud.title.classList.remove('show');
  hud.pause.classList.remove('show');
  hud.busted.classList.remove('show');
  hud.complete.classList.remove('show');
  screen = 'play';
  if (missionIndex === 'courier') {
    missions.startCourier(player.x, player.z);
    notify('Job Kurir Neon dimulai — antar paket ke titik kuning!');
  } else if (typeof missionIndex === 'number') {
    const started = missions.startStory(missionIndex, player.x, player.z);
    if (started) {
      if (started.mission.id === 'kejar') setWanted(3);
      notify(`Misi dimulai: ${started.mission.name} — ${started.mission.brief}`);
    } else {
      notify('Misi itu sudah selesai. Pilih misi lain atau job kurir.');
    }
  }
  hud.hint.textContent = 'WASD mengemudi · E naik/turun mobil · H klakson · M suara · P jeda';
}

function respawn() {
  wanted = 0;
  calmTimer = 0;
  bustedTimer = 0;
  while (police.length > 0) {
    const car = police.pop();
    scene.remove(car.mesh);
  }
  player.mode = 'foot';
  player.x = city.spawn.x;
  player.z = city.spawn.z;
  player.heading = city.spawn.heading;
  player.speed = 0;
  walker.visible = true;
  walker.position.set(player.x, 0, player.z);
  hud.busted.classList.remove('show');
  screen = 'play';
  notify('Kamu kembali ke jalan. Hati-hati lain kali.');
}

/**
 * One discrete key press, handled the moment it lands. (Function
 * declaration, so the keydown listener above can call it.)
 */
function pressAction(code) {
  if (code === 'Enter' || code === 'Space') {
    if (screen === 'title') startGame(null);
    else if (screen === 'busted') respawn();
    else if (screen === 'pause') { screen = 'play'; hud.pause.classList.remove('show'); }
    return;
  }
  if (code === 'KeyE' && screen === 'play') { tryInteract(); return; }
  if (code === 'KeyH' && screen === 'play' && player.mode === 'car') { audio.horn(); return; }
  if (code === 'KeyP' || code === 'Escape') {
    if (screen === 'play') {
      screen = 'pause';
      hud.pause.classList.add('show');
      audio.silenceLoops();
    } else if (screen === 'pause') {
      screen = 'play';
      hud.pause.classList.remove('show');
    }
    return;
  }
  if (code === 'KeyR' && screen === 'busted') { respawn(); return; }
  if (screen === 'play') {
    if (code === 'Digit1') startGame(0);
    else if (code === 'Digit2') startGame(1);
    else if (code === 'Digit3') startGame(2);
    else if (code === 'Digit4') startGame('courier');
  }
}

function step(dt) {
  crimeCooldown = Math.max(0, crimeCooldown - dt);
  if (screen === 'title') {
    orbitAngle += dt * 0.045;
    camera.position.set(Math.sin(orbitAngle) * 130, 48, Math.cos(orbitAngle) * 130);
    camera.lookAt(0, 10, 0);
    traffic.update(dt, sky.grip);
    city.update(dt);
    sky.update(dt, { x: 0, z: 0 });
    updateHud();
    renderFrame();
    return;
  }
  if (screen !== 'play') {
    renderFrame();
    return;
  }
  if (player.mode === 'car') driveCar(dt, sky.grip);
  else walk(dt);
  traffic.update(dt, sky.grip);
  updatePolice(dt);
  const result = missions.update(dt, missionCtx());
  if (result && result.success) showComplete(result);
  if (wanted > 0) {
    calmTimer += dt;
    const nearestPolice = police.length === 0 ? Infinity : Math.min(...police.map((car) => Math.hypot(car.x - player.x, car.z - player.z)));
    if (calmTimer > 30 && nearestPolice > 60) {
      setWanted(wanted - 1);
      notify(`Polisi kehilangan jejakmu. Wanted turun ke ${wanted} bintang.`);
    }
  }
  city.update(dt);
  sky.update(dt, { x: player.x, z: player.z });
  updateCamera(dt);
  updateHud();
  renderFrame();
}

// ---- screenshot staging -------------------------------------------------------
function autopilotSteer(target) {
  const wantHeading = Math.atan2(target.x - player.x, target.z - player.z);
  let diff = wantHeading - player.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  keys.delete('KeyA');
  keys.delete('KeyD');
  if (diff > 0.12) keys.add('KeyA');
  else if (diff < -0.12) keys.add('KeyD');
}

/** Next junction one block away from `from`, staying inside the city grid. */
function nextPilotTarget(from) {
  const options = [
    { x: from.x + PITCH, z: from.z }, { x: from.x - PITCH, z: from.z },
    { x: from.x, z: from.z + PITCH }, { x: from.x, z: from.z - PITCH },
  ].filter((point) => Math.abs(point.x) <= city.limit && Math.abs(point.z) <= city.limit);
  return rng.pick(options);
}

function runShot(name) {
  const focus = { x: player.x, z: player.z };
  // Simulate silently (no per-step renders under software GL), then paint once.
  silentSteps = true;
  try {
    if (name === 'play' || name === 'end') {
    hud.title.classList.remove('show');
    screen = 'play';
    const entry = parked.find((car) => car.mine) ?? parked[0];
    if (entry) enterCar(entry);
    if (name === 'play') {
      // Autopilot follows the roads junction to junction, like the traffic,
      // mostly straight so the shot stays on an avenue in the city.
      let waypoint = { x: 30, z: 90 };
      let prev = { x: 30, z: 150 };
      for (let index = 0; index < 9 * 60; index += 1) {
        keys.add('KeyW');
        if (Math.hypot(waypoint.x - player.x, waypoint.z - player.z) < 14) {
          const dirX = Math.sign(waypoint.x - prev.x);
          const dirZ = Math.sign(waypoint.z - prev.z);
          const straight = { x: waypoint.x + dirX * PITCH, z: waypoint.z + dirZ * PITCH };
          const keepStraight = rng.next() < 0.6
            && Math.abs(straight.x) <= city.limit && Math.abs(straight.z) <= city.limit;
          prev = waypoint;
          waypoint = keepStraight ? straight : nextPilotTarget(waypoint);
        }
        autopilotSteer(waypoint);
        step(STEP);
      }
      keys.delete('KeyW');
      keys.delete('KeyA');
      keys.delete('KeyD');
    } else {
      // End scene: really finish story mission 1, then show the banner.
      const started = missions.startStory(0, player.x, player.z);
      if (started) {
        player.x = started.target.x;
        player.z = started.target.z;
        missions.update(0.1, missionCtx());
        const second = missions.marker();
        if (second) {
          player.x = second.x;
          player.z = second.z;
          const result = missions.update(0.1, missionCtx());
          if (result && result.success) showComplete(result);
        }
      }
      for (let index = 0; index < 90; index += 1) step(STEP);
    }
  } else {
    screen = 'title';
    hud.title.classList.add('show');
    for (let index = 0; index < 5 * 60; index += 1) step(STEP);
  }
  } finally {
    silentSteps = false;
  }
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// ---- main loop & boot ---------------------------------------------------------
function runGame() {
  hud.title.classList.add('show');
  statusEl.textContent = 'NEON BAY. Tekan Enter atau klik Mulai untuk bermain.';
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
  }
  requestAnimationFrame(frame);
}

function bindButton(id, fn) {
  const element = document.getElementById(id);
  if (element) element.addEventListener('click', () => { audio.unlock(); fn(); });
}
bindButton('btn-start', () => startGame(null));
bindButton('btn-m1', () => startGame(0));
bindButton('btn-m2', () => startGame(1));
bindButton('btn-m3', () => startGame(2));
bindButton('btn-courier', () => startGame('courier'));
bindButton('btn-help', () => hud.help.classList.add('show'));
bindButton('btn-close-help', () => hud.help.classList.remove('show'));
bindButton('btn-resume', () => { screen = 'play'; hud.pause.classList.remove('show'); });
bindButton('btn-restart', () => { hud.pause.classList.remove('show'); respawn(); });
bindButton('btn-again', () => respawn());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'pause';
    hud.pause.classList.add('show');
    audio.silenceLoops();
  }
});

window.__game = { player, sky, city, traffic, missions, get wanted() { return wanted; }, get cash() { return cash; }, get screen() { return screen; } };

if (shot) runShot(shot);
else runGame();
