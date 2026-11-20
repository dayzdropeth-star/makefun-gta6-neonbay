// NEON BAY v4 — inti permainan: renderer, pemain, mobil, polisi, HUD.
//
// File ini merangkai semua modul: kota dari world.js, langit dari sky.js,
// lalu lintas dari traffic.js, misi dari missions.js, suara dari audio.js,
// dan angka acak dari rng.js. Pemain bisa jalan kaki atau mengemudi,
// mencuri mobil, mengerjakan misi cerita, dan dikejar polisi di bawah
// sistem wanted lima bintang. Semua berjalan offline dari file statis.
//
// ?seed=N memilih kota yang sama setiap kali. ?shot=start|play|end
// menata satu adegan untuk screenshot lalu menandai window.__shotReady.

import { createRng, seedFromParam } from './rng.js';
import { createAudio } from './audio.js';
import { createSky } from './sky.js';
import { buildCity } from './world.js';
import { buildCarMesh, createTraffic } from './traffic.js';
import { createMissions, STORY_MISSIONS } from './missions.js';

// ---------------------------------------------------------------------------
// Parameter URL + util kecil
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const seed = seedFromParam(params.get('seed'), 20261119);
const shotMode = params.get('shot'); // null | 'start' | 'play' | 'end'
const STAGE = shotMode !== null && shotMode !== '';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

const $ = (id) => document.getElementById(id);
const ui = {
  stage: $('stage'),
  clock: $('hud-clock'),
  weather: $('hud-weather'),
  cash: $('hud-cash-value'),
  stars: document.querySelectorAll('#hud-wanted .star'),
  missionTitle: $('hud-mission-title'),
  objective: $('hud-objective-text'),
  speed: $('hud-speed'),
  gear: $('hud-gear'),
  minimap: $('hud-minimap'),
  toast: $('hud-toast'),
  status: $('hud-status'),
  start: $('hud-start'),
  pause: $('hud-pause'),
  busted: $('hud-busted'),
  complete: $('hud-complete'),
  help: $('hud-help'),
  fine: $('hud-fine'),
  bustedText: $('hud-busted-text'),
  completeText: $('hud-complete-text'),
  completeReward: $('hud-complete-reward'),
  completeNote: $('hud-complete-note'),
};

// ---------------------------------------------------------------------------
// Renderer, scene, kamera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
ui.stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(30, 26, 190);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Dunia: rng, langit, kota, lalu lintas, misi, suara
// ---------------------------------------------------------------------------
const rng = createRng(seed);
const sky = createSky(scene, rng.fork(11));
const city = buildCity(scene, rng.fork(23), renderer.capabilities.getMaxAnisotropy());
const traffic = createTraffic(scene, city, rng.fork(37), () => sky.hour, () => ({ x: player.x, z: player.z }));
traffic.seed(14);
const missions = createMissions(scene, city, rng.fork(51));
const audio = createAudio();

// ---------------------------------------------------------------------------
// Simpanan lokal
// ---------------------------------------------------------------------------
const SAVE_KEY = 'neonbay-v4-save';
let saved = { cash: 0, done: 0 };
try {
  const raw = window.localStorage.getItem(SAVE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (typeof parsed.cash === 'number') saved.cash = Math.max(0, Math.floor(parsed.cash));
    if (typeof parsed.done === 'number') saved.done = Math.max(0, Math.floor(parsed.done));
  }
} catch { /* simpanan rusak: mulai dari nol */ }

function persist() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, done: Math.max(saved.done, missions.completedCount()) }));
  } catch { /* penyimpanan penuh / diblokir: lanjut tanpa menyimpan */ }
}

// ---------------------------------------------------------------------------
// Keadaan permainan
// ---------------------------------------------------------------------------
const state = {
  started: false,
  paused: false,
  overlayOpen: true,
  cash: saved.cash,
  wanted: 0,
  crimeCooldown: 0,
  quietTimer: 0,
  muted: false,
  helpOpen: false,
};

// Pemain jalan kaki.
const player = {
  x: city.spawn.x,
  z: city.spawn.z,
  heading: city.spawn.heading,
  speed: 0,
  mesh: null,
};

// Mobil yang sedang dikendarai pemain (null bila jalan kaki).
let playerCar = null;

// Mobil parkir milik pemain + yang bisa dicuri.
const parked = [];

// Mobil polisi yang sedang mengejar.
const police = [];

// Kamera orbit.
const cam = {
  yaw: city.spawn.heading + Math.PI,
  pitch: 0.32,
  dist: 9,
  height: 4.2,
  lastMouseAt: -10,
};

// ---------------------------------------------------------------------------
// Mesh pemain + mobil
// ---------------------------------------------------------------------------
function buildWalkerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xff2d78, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2030, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.4), jacket);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), skin);
  head.position.y = 1.78;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), dark);
  cap.position.y = 1.98;
  group.add(cap);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.3), dark);
    leg.position.set(side * 0.19, 0.31, 0);
    group.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), jacket);
    arm.position.set(side * 0.48, 1.05, 0);
    group.add(arm);
  }
  group.traverse((child) => { if (child.isMesh) child.castShadow = true; });
  return group;
}

player.mesh = buildWalkerMesh();
player.mesh.position.set(player.x, 0, player.z);
player.mesh.rotation.y = player.heading;
scene.add(player.mesh);

// Mobil utama pemain: sedan magenta di samping titik spawn.
function placePlayerCar() {
  const mesh = buildCarMesh('sedan', 0xff2d78);
  const spot = { x: player.x + 4.5, z: player.z - 2 };
  const fixed = city.resolveCircle(spot.x, spot.z, 3);
  mesh.position.set(fixed.x, 0, fixed.z);
  mesh.rotation.y = player.heading;
  scene.add(mesh);
  return { mesh, kind: 'sedan', x: fixed.x, z: fixed.z, heading: player.heading, speed: 0, owned: true };
}
playerCar = null;
const homeCar = placePlayerCar();

// Enam mobil parkir tersebar di jalan, siap dicuri tanpa wanted? Tidak:
// mobil parkir ini mobil warga — mencurinya tetap menaikkan wanted,
// tapi lebih mudah ditemukan daripada mengejar mobil yang sedang jalan.
for (let i = 0; i < 6; i += 1) {
  const spot = city.randomRoadPoint(25, player.x, player.z);
  const fixed = city.resolveCircle(spot.x, spot.z, 3);
  const kind = i % 3 === 0 ? 'taxi' : 'sedan';
  const paint = kind === 'taxi' ? 0xffc61a : [0x8a93a6, 0x5a6b8a, 0x3d6b4a, 0x7a5a8a][i % 4];
  const mesh = buildCarMesh(kind, paint);
  mesh.position.set(fixed.x, 0, fixed.z);
  mesh.rotation.y = rng.fork(70 + i).range(0, Math.PI * 2);
  scene.add(mesh);
  parked.push({ mesh, kind, x: fixed.x, z: fixed.z, heading: mesh.rotation.y, speed: 0, owned: false });
}

// ---------------------------------------------------------------------------
// Toast + status
// ---------------------------------------------------------------------------
let toastTimer = 0;
function toast(text, ms = 3200) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), ms);
}
function setStatus(text) {
  ui.status.textContent = text;
}

// ---------------------------------------------------------------------------
// Wanted + polisi
// ---------------------------------------------------------------------------
function addWanted(n, reason) {
  if (state.wanted >= 5) return;
  state.wanted = Math.min(5, state.wanted + n);
  state.quietTimer = 0;
  if (reason) toast(reason);
  refreshStars();
  maybeSpawnPolice();
}

function refreshStars() {
  ui.stars.forEach((el, idx) => {
    el.classList.toggle('lit', idx < state.wanted);
  });
}

function maybeSpawnPolice() {
  const want = state.wanted >= 3 ? Math.min(state.wanted - 1, 3) : 0;
  while (police.length < want) {
    const angle = rng.range(0, Math.PI * 2);
    const px = player.x + Math.sin(angle) * 55;
    const pz = player.z + Math.cos(angle) * 55;
    const fixed = city.resolveCircle(px, pz, 3);
    const car = traffic.spawnPolice(fixed.x, fixed.z);
    police.push(car);
  }
  audio.siren(police.length > 0);
}

function clearPolice() {
  for (const car of police) traffic.despawn(car);
  police.length = 0;
  audio.siren(false);
}

function busted() {
  const fine = Math.min(state.cash, 40 + state.wanted * 30);
  state.cash -= fine;
  state.wanted = 0;
  refreshStars();
  clearPolice();
  audio.silenceLoops();
  audio.fail();
  if (playerCar) leaveCar();
  player.x = city.spawn.x;
  player.z = city.spawn.z;
  player.heading = city.spawn.heading;
  player.mesh.position.set(player.x, 0, player.z);
  ui.fine.textContent = fine > 0 ? `Denda: $${fine} dipotong dari uangmu.` : 'Kamu tidak punya uang untuk didenda — kali ini gratis.';
  ui.bustedText.textContent = 'Polisi Neon Bay berhasil menangkapmu di tengah jalan.';
  showOverlay(ui.busted);
  persist();
}

// ---------------------------------------------------------------------------
// Naik / turun mobil
// ---------------------------------------------------------------------------
function nearestCar(maxDist) {
  let best = null;
  let bestDist = maxDist;
  const candidates = [];
  if (homeCar && !playerCar) candidates.push(homeCar);
  for (const car of parked) candidates.push(car);
  for (const car of traffic.cars) {
    if (car.kind === 'police') continue;
    candidates.push(car);
  }
  for (const car of candidates) {
    if (playerCar === car) continue;
    const d = dist2d(player.x, player.z, car.x, car.z);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const wasTraffic = traffic.cars.includes(car);
  if (wasTraffic) {
    traffic.despawn(car);
    addWanted(1, 'Mobil dicuri! Wanted +1 bintang.');
    audio.crash(0.25);
  } else if (!car.owned) {
    addWanted(1, 'Mobil warga dicuri! Wanted +1 bintang.');
  } else {
    toast('Mobilmu sendiri — gas!');
  }
  const idx = parked.indexOf(car);
  if (idx !== -1) parked.splice(idx, 1);
  playerCar = car;
  playerCar.speed = 0;
  player.mesh.visible = false;
  ui.gear.textContent = 'MENGEMUDI';
  setStatus('W A S D untuk mengemudi — Spasi rem tangan, E turun.');
}

function leaveCar() {
  if (!playerCar) return;
  const car = playerCar;
  playerCar = null;
  const side = { x: car.x + Math.cos(car.heading) * 3.2, z: car.z - Math.sin(car.heading) * 3.2 };
  const fixed = city.resolveCircle(side.x, side.z, 1);
  player.x = fixed.x;
  player.z = fixed.z;
  player.heading = car.heading;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
  if (!car.owned && !parked.includes(car)) parked.push(car);
  ui.gear.textContent = 'JALAN KAKI';
  setStatus('Kamu turun dari mobil. Tekan E di dekat mobil untuk naik lagi.');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set();
let pointerLocked = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') { e.preventDefault(); toggleHelp(); return; }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  audio.unlock();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyH' && playerCar) audio.horn();
  if (e.code === 'KeyE' && state.started && !state.paused && !state.overlayOpen) {
    if (playerCar) leaveCar();
    else {
      const car = nearestCar(6);
      if (car) enterCar(car);
      else toast('Tidak ada mobil di dekatmu.');
    }
  }
  if (e.code === 'Enter' && !state.started) startGame();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

renderer.domElement.addEventListener('click', () => {
  audio.unlock();
  if (state.started && !state.paused && !state.overlayOpen && !pointerLocked) {
    renderer.domElement.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  cam.yaw -= (e.movementX || 0) * 0.0026;
  cam.pitch = clamp(cam.pitch + (e.movementY || 0) * 0.0022, 0.08, 1.1);
  cam.lastMouseAt = performance.now() / 1000;
});

// ---------------------------------------------------------------------------
// Tombol + overlay
// ---------------------------------------------------------------------------
function showOverlay(el) {
  for (const other of [ui.start, ui.pause, ui.busted, ui.complete, ui.help]) {
    if (other !== el) other.classList.add('hidden');
  }
  el.classList.remove('hidden');
  state.overlayOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function hideOverlays() {
  for (const el of [ui.start, ui.pause, ui.busted, ui.complete, ui.help]) el.classList.add('hidden');
  state.overlayOpen = false;
  state.helpOpen = false;
}

function startGame() {
  if (state.started) return;
  state.started = true;
  hideOverlays();
  audio.unlock();
  audio.click();
  renderer.domElement.requestPointerLock();
  setStatus('Dekati penanda biru untuk memulai misi pertama.');
  toast('Selamat datang di Neon Bay! Dekati penanda biru.');
  if (saved.done > 0 || saved.cash > 0) {
    window.setTimeout(() => toast(`Progres dimuat: $${saved.cash}, ${saved.done} misi selesai sebelumnya.`), 3600);
  }
}

function togglePause() {
  if (!state.started || state.overlayOpen) {
    if (state.paused) { state.paused = false; hideOverlays(); }
    return;
  }
  state.paused = !state.paused;
  if (state.paused) {
    audio.silenceLoops();
    showOverlay(ui.pause);
  } else {
    hideOverlays();
  }
}

function toggleHelp() {
  if (!state.started) return;
  if (state.helpOpen) { state.helpOpen = false; hideOverlays(); return; }
  state.helpOpen = true;
  state.paused = true;
  audio.silenceLoops();
  showOverlay(ui.help);
}

function toggleMute() {
  state.muted = audio.setMuted(!state.muted);
  $('btn-mute').textContent = state.muted ? '✕' : '♪';
  toast(state.muted ? 'Suara dimatikan.' : 'Suara dihidupkan.');
}

$('btn-start').addEventListener('click', startGame);
$('btn-start-help').addEventListener('click', () => { showOverlay(ui.help); state.helpOpen = true; });
$('btn-resume').addEventListener('click', () => { state.paused = false; hideOverlays(); audio.click(); });
$('btn-restart').addEventListener('click', () => window.location.reload());
$('btn-busted-retry').addEventListener('click', () => { hideOverlays(); state.paused = false; audio.click(); toast('Kamu bebas lagi — jangan sampai ketangkap.'); });
$('btn-complete-next').addEventListener('click', () => { hideOverlays(); state.paused = false; audio.click(); });
$('btn-help-close').addEventListener('click', () => {
  state.helpOpen = false;
  if (state.started) { state.paused = false; hideOverlays(); }
  else showOverlay(ui.start);
});
$('btn-pause').addEventListener('click', togglePause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-help').addEventListener('click', toggleHelp);

// ---------------------------------------------------------------------------
// Fisika pemain jalan kaki
// ---------------------------------------------------------------------------
function stepOnFoot(dt) {
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const walkSpeed = 6.2;
  const sin = Math.sin(cam.yaw);
  const cos = Math.cos(cam.yaw);
  let mx = 0;
  let mz = 0;
  if (fwd !== 0 || strafe !== 0) {
    // Maju mengikuti arah kamera; A/D menggeser ke samping.
    mx = -sin * fwd + cos * strafe;
    mz = -cos * fwd - sin * strafe;
    const len = Math.hypot(mx, mz);
    mx = (mx / len) * walkSpeed;
    mz = (mz / len) * walkSpeed;
    player.heading = Math.atan2(mx, mz);
  }
  const nx = player.x + mx * dt;
  const nz = player.z + mz * dt;
  const fixed = city.resolveCircle(nx, nz, 0.9);
  player.x = clamp(fixed.x, -city.bounds, city.bounds);
  player.z = clamp(fixed.z, -city.bounds, city.bounds);
  player.speed = Math.hypot(mx, mz);
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
}

// ---------------------------------------------------------------------------
// Fisika mobil pemain
// ---------------------------------------------------------------------------
function stepDriving(dt) {
  const car = playerCar;
  const grip = sky.grip;
  const gas = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const brake = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const steerIn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const handbrake = keys.has('Space');

  const topSpeed = 36;
  const reverseTop = 11;
  if (gas) car.speed += 15 * dt * (0.7 + 0.3 * grip);
  if (brake) {
    if (car.speed > 0.5) car.speed -= 26 * dt;
    else car.speed -= 9 * dt;
  }
  if (!gas && !brake) car.speed -= Math.sign(car.speed) * 5 * dt;
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * 30 * dt;
    if (Math.abs(car.speed) > 9) audio.skid(0.6);
  }
  car.speed = clamp(car.speed, -reverseTop, topSpeed);
  if (Math.abs(car.speed) < 0.05 && !gas && !brake) car.speed = 0;

  const steerAuthority = clamp(Math.abs(car.speed) / 9, 0, 1) * (handbrake ? 1.5 : 1);
  const turnRate = 1.9 * steerAuthority * grip * Math.sign(car.speed || 1);
  car.heading += steerIn * turnRate * dt;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = city.resolveCircle(nx, nz, 2.3);
  if (fixed.hit && Math.abs(car.speed) > 4) {
    audio.crash(clamp(Math.abs(car.speed) / 30, 0.2, 1));
    if (state.crimeCooldown <= 0) {
      addWanted(1, 'Kamu menabrak gedung! Wanted +1 bintang.');
      state.crimeCooldown = 2.5;
    }
    car.speed *= 0.35;
  }
  car.x = clamp(fixed.x, -city.bounds, city.bounds);
  car.z = clamp(fixed.z, -city.bounds, city.bounds);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;

  // Tabrakan dengan lalu lintas.
  const hit = traffic.collide(car.x, car.z, 2.3);
  if (hit) {
    traffic.shove(hit.car, hit.nx, hit.nz, 2.2);
    audio.crash(clamp(Math.abs(car.speed) / 28, 0.25, 1));
    if (state.crimeCooldown <= 0) {
      addWanted(1, 'Tabrakan dengan mobil lain! Wanted +1 bintang.');
      state.crimeCooldown = 2.5;
    }
    car.speed *= 0.55;
    // Dorong mobil pemain sedikit keluar dari mobil yang ditabrak.
    car.x -= hit.nx * 0.6;
    car.z -= hit.nz * 0.6;
  }

  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;

  audio.engine(clamp(Math.abs(car.speed) / topSpeed, 0, 1), gas);
}

// ---------------------------------------------------------------------------
// Polisi mengejar
// ---------------------------------------------------------------------------
// Selama staging screenshot (?shot=...) penangkapan dimatikan supaya
// adegan akhir menampilkan kejaran, bukan layar "tertangkap".
let staging = false;

function stepPolice(dt) {
  if (police.length === 0) return;
  for (let i = police.length - 1; i >= 0; i -= 1) {
    const cop = police[i];
    // Arahkan tujuan mobil polisi ke pemain setiap frame — jadilah pengejar.
    cop.goal = { x: player.x, z: player.z };
    cop.cruise = 19;
    const d = dist2d(cop.x, cop.z, player.x, player.z);
    if (d < 3.6 && state.wanted >= 3 && !staging) {
      busted();
      return;
    }
    if (d > 260) {
      traffic.despawn(cop);
      police.splice(i, 1);
    }
  }
  audio.siren(police.length > 0);
}

// ---------------------------------------------------------------------------
// Misi
// ---------------------------------------------------------------------------
function stepMissions(dt) {
  const result = missions.update(dt, {
    x: player.x,
    z: player.z,
    inCar: playerCar !== null,
    speed: playerCar ? Math.abs(playerCar.speed) : player.speed,
    onEarn: (amount) => {
      state.cash += amount;
      persist();
    },
  });
  if (!result) return;
  if (result.started) {
    const def = STORY_MISSIONS.find((m) => m.id === result.missionId);
    toast(`Misi dimulai: ${def ? def.title : result.missionId}`);
    audio.click();
    if (result.missionId === 'kejar-bayangan') {
      state.wanted = Math.max(state.wanted, 3);
      refreshStars();
      maybeSpawnPolice();
    }
  } else if (result.ended) {
    if (result.success) {
      ui.completeText.textContent = result.missionId === 'kurir-neon'
        ? 'Paket kurir sampai tepat waktu. Bayaran langsung masuk.'
        : 'Kerja bagus — misi selesai, bayaran masuk.';
      ui.completeReward.textContent = `+$${result.payout}`;
      const left = 3 - missions.completedCount();
      ui.completeNote.textContent = left > 0
        ? `${left} misi cerita tersisa.`
        : 'Semua misi cerita selesai! Job Kurir Neon selalu tersedia.';
      showOverlay(ui.complete);
      audio.click();
      persist();
    } else {
      toast('Misi gagal — waktu habis. Coba lagi dari penanda biru.');
      audio.fail();
    }
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const mapCtx = ui.minimap.getContext('2d');
function drawMinimap() {
  const size = 180;
  const span = (city.bounds + 12) * 2;
  const scale = size / span;
  const toMapX = (x) => (x + span / 2) * scale;
  const toMapY = (z) => (z + span / 2) * scale;
  mapCtx.fillStyle = '#070a16';
  mapCtx.fillRect(0, 0, size, size);
  // Jalan.
  mapCtx.strokeStyle = '#39415e';
  mapCtx.lineWidth = 4;
  for (const line of city.roadLines) {
    mapCtx.beginPath();
    mapCtx.moveTo(toMapX(line), 0);
    mapCtx.lineTo(toMapX(line), size);
    mapCtx.stroke();
    mapCtx.beginPath();
    mapCtx.moveTo(0, toMapY(line));
    mapCtx.lineTo(size, toMapY(line));
    mapCtx.stroke();
  }
  // Gedung.
  mapCtx.fillStyle = '#1b2136';
  for (const b of city.buildings) {
    mapCtx.fillRect(toMapX(b.minX), toMapY(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
  }
  // Laut di selatan.
  mapCtx.fillStyle = '#0a2e4a';
  mapCtx.fillRect(0, toMapY(city.bounds - 8), size, size - toMapY(city.bounds - 8));
  // Mobil lalu lintas.
  for (const car of traffic.cars) {
    mapCtx.fillStyle = car.kind === 'police' ? '#ff2d2d' : '#00e5ff';
    mapCtx.beginPath();
    mapCtx.arc(toMapX(car.x), toMapY(car.z), car.kind === 'police' ? 3.4 : 2.2, 0, Math.PI * 2);
    mapCtx.fill();
  }
  // Pemain: panah putih.
  const px = toMapX(player.x);
  const py = toMapY(player.z);
  mapCtx.save();
  mapCtx.translate(px, py);
  // Panah digambar menghadap atas; putar supaya ujungnya menunjuk arah
  // gerak pemain di peta (sumbu y kanvas mengarah ke bawah).
  mapCtx.rotate(Math.PI - player.heading);
  mapCtx.fillStyle = '#ffffff';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -6);
  mapCtx.lineTo(4.4, 5);
  mapCtx.lineTo(-4.4, 5);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

function refreshHud() {
  ui.clock.textContent = sky.hourLabel();
  const wet = sky.wetness > 0.45;
  ui.weather.innerHTML = `${sky.weatherName()}${wet ? ' <span class="wet">· JALAN LICIN</span>' : ''}${sky.isNight() ? ' · Malam' : ''}`;
  ui.cash.textContent = String(state.cash);
  const active = missions.active;
  ui.missionTitle.textContent = active ? active.title : 'NEON BAY';
  ui.objective.textContent = missions.objective;
  const kmh = Math.round(Math.abs(playerCar ? playerCar.speed : player.speed) * 3.6);
  ui.speed.innerHTML = `${kmh} <small>km/j</small>`;
  drawMinimap();
}

// ---------------------------------------------------------------------------
// Kamera
// ---------------------------------------------------------------------------
function stepCamera(dt) {
  const now = performance.now() / 1000;
  // Bila mouse diam lebih dari 2,5 detik saat mengemudi, kamera kembali
  // ke belakang mobil secara perlahan.
  if (playerCar && now - cam.lastMouseAt > 2.5) {
    cam.yaw += wrapAngle(player.heading + Math.PI - cam.yaw) * Math.min(dt * 1.6, 1);
  }
  const target = playerCar || player;
  const tx = target.x;
  const tz = target.z;
  const dist = playerCar ? 11.5 : 8;
  const height = playerCar ? 4.6 : 3.6;
  const wantX = tx + Math.sin(cam.yaw) * dist;
  const wantZ = tz + Math.cos(cam.yaw) * dist;
  const wantY = height + Math.sin(cam.pitch) * 4;
  const ease = Math.min(dt * 5, 1);
  camera.position.x += (wantX - camera.position.x) * ease;
  camera.position.y += (wantY - camera.position.y) * ease;
  camera.position.z += (wantZ - camera.position.z) * ease;
  camera.lookAt(tx, playerCar ? 1.4 : 1.6, tz);
}

// ---------------------------------------------------------------------------
// Satu langkah simulasi (dipakai loop normal maupun staging screenshot)
// ---------------------------------------------------------------------------
function stepWorld(dt) {
  state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);
  if (state.wanted > 0) {
    state.quietTimer += dt;
    if (state.quietTimer > 28) {
      state.wanted -= 1;
      state.quietTimer = 0;
      refreshStars();
      if (state.wanted < 3) clearPolice();
      toast('Wanted turun — polisi mulai melupakanmu.');
    }
  }
  if (playerCar) stepDriving(dt);
  else stepOnFoot(dt);
  sky.update(dt, { x: player.x, z: player.z });
  city.update(dt);
  traffic.update(dt, { x: player.x, z: player.z });
  stepPolice(dt);
  stepMissions(dt);
  stepCamera(dt);
  refreshHud();
}

// ---------------------------------------------------------------------------
// Loop normal
// ---------------------------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  if (!state.started || state.paused || state.overlayOpen) {
    // Tetap gambar latar agar cover terlihat hidup di balik panel.
    sky.update(dt, { x: player.x, z: player.z });
    city.update(dt);
    stepCamera(dt);
    renderer.render(scene, camera);
    return;
  }
  stepWorld(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Staging screenshot (?shot=...): simulasi tetap, tanpa loop normal
// ---------------------------------------------------------------------------
function stageShot(kind) {
  hideOverlays();
  state.started = true;
  staging = true;
  const dt = 1 / 60;
  if (kind === 'start') {
    // Senja di titik spawn: kamera lebar di atas jalan, mobil magenta
    // di depan, kota menyala di belakang.
    cam.yaw = city.spawn.heading + Math.PI;
    cam.pitch = 0.22;
    for (let i = 0; i < 240; i += 1) {
      sky.update(dt, { x: player.x, z: player.z });
      city.update(dt);
      traffic.update(dt, { x: player.x, z: player.z });
    }
    stepCamera(1);
    refreshHud();
  } else if (kind === 'play') {
    // Pemain mengemudi lurus menyusuri jalan dengan lalu lintas di
    // sekitarnya. Lurus saja: belokan tajam bisa menabrakkan mobil ke
    // gedung dan merusak adegan.
    enterCar(homeCar);
    keys.add('KeyW');
    for (let i = 0; i < 300; i += 1) {
      stepWorld(dt);
    }
    keys.delete('KeyW');
    refreshHud();
  } else {
    // Adegan akhir: hujan di malam hari, wanted 3, polisi sudah
    // mengepung. Mobil pemain diam di persimpangan sementara dua mobil
    // polisi mendekat dengan lampu strobo — tableau kejaran, bukan
    // balapan, supaya komposisinya tidak kabur keluar kota.
    enterCar(homeCar);
    sky.setWeather('rain');
    state.wanted = 3;
    refreshStars();
    maybeSpawnPolice();
    for (let i = 0; i < 360; i += 1) {
      stepWorld(dt);
    }
    refreshHud();
  }
  staging = false;
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
refreshStars();
ui.cash.textContent = String(state.cash);
setStatus('Klik MULAI JELAJAH untuk masuk ke Neon Bay.');
if (STAGE) {
  const kind = shotMode === 'play' ? 'play' : shotMode === 'end' ? 'end' : 'start';
  try {
    stageShot(kind);
  } catch (err) {
    console.error('staging gagal:', err);
    renderer.render(scene, camera);
    window.__shotReady = true;
  }
} else {
  requestAnimationFrame(frame);
}
