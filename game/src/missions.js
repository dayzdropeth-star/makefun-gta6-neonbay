// NEON BAY v3 — missions.
//
// Three story missions and one repeatable courier job, all driven by the
// same small state machine: a mission has phases (go to the pickup, then go
// to the drop-off), a timer, a beacon in the world, and a reward. The main
// loop feeds it the player's position each frame and the mission answers
// with what the HUD should say.
//
//   1. Paket Kilat — pick a parcel up, deliver it before the clock runs out.
//   2. Lolos dari Kejaran — the heat is on: survive a 3-star chase for 60 s.
//   3. Taksi Kilat — pick a passenger up and get them across town, fast.
//   Kurir Neon — the repeatable job that unlocks once the story is done.

export const STORY_MISSIONS = [
  { id: 'paket', name: 'Paket Kilat', brief: 'Ambil paket di titik kuning, antar sebelum waktu habis.', reward: 120 },
  { id: 'kejar', name: 'Lolos dari Kejaran', brief: 'Polisi memburumu. Bertahan 60 detik tanpa tertangkap.', reward: 200 },
  { id: 'taksi', name: 'Taksi Kilat', brief: 'Jemput penumpang, antar secepatnya. Bonus makin besar makin cepat.', reward: 150 },
];

const COURIER_REWARD_MIN = 60;
const COURIER_REWARD_MAX = 95;
const ARRIVE_RADIUS = 7;

function makeBeacon(scene, colorHex) {
  const group = new THREE.Group();
  const columnMat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 16, 1, true), columnMat);
  column.position.y = 13;
  group.add(column);
  const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.1, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  const gemMat = new THREE.MeshBasicMaterial({ color: colorHex });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), gemMat);
  gem.position.y = 9;
  group.add(gem);
  group.visible = false;
  scene.add(group);
  return { group, columnMat, ringMat, gem, baseColor: colorHex };
}

/**
 * Build the mission system for a city. `rng` picks the mission targets;
 * `scene` holds the beacon. The returned controller is ticked by main.js.
 */
export function createMissions(scene, city, rng) {
  const beacon = makeBeacon(scene, 0xffe14d);
  const completed = new Set();
  let current = null;
  let elapsed = 0;

  function setBeacon(x, z, colorHex) {
    beacon.group.position.set(x, 0, z);
    beacon.group.visible = true;
    beacon.columnMat.color.setHex(colorHex);
    beacon.ringMat.color.setHex(colorHex);
    beacon.gem.material.color.setHex(colorHex);
  }

  function hideBeacon() {
    beacon.group.visible = false;
  }

  function pickTarget(fromX, fromZ, minDist) {
    return city.randomRoadPoint(minDist, fromX, fromZ);
  }

  function begin(mission, fromX, fromZ) {
    const target = pickTarget(fromX, fromZ, 40);
    current = {
      mission,
      phase: mission.id === 'kejar' ? 'evade' : 'pickup',
      timer: mission.id === 'kejar' ? 60 : mission.id === 'taksi' ? 95 : 80,
      target,
      reward: mission.reward,
      done: false,
    };
    if (mission.id === 'kejar') {
      setBeacon(fromX, fromZ, 0xff2d2d);
    } else {
      setBeacon(target.x, target.z, 0xffe14d);
    }
    return current;
  }

  function startStory(index, fromX, fromZ) {
    const mission = STORY_MISSIONS[index];
    if (!mission || completed.has(mission.id)) return null;
    return begin(mission, fromX, fromZ);
  }

  function startCourier(fromX, fromZ) {
    const mission = {
      id: 'kurir', name: 'Kurir Neon',
      brief: 'Antar paket ke titik kuning sebelum waktu habis.',
      reward: rng.int(COURIER_REWARD_MIN, COURIER_REWARD_MAX),
    };
    return begin(mission, fromX, fromZ);
  }

  function distanceTo(ctx) {
    if (!current) return 0;
    return Math.hypot(ctx.px - current.target.x, ctx.pz - current.target.z);
  }

  function finish(ctx, success) {
    if (!current) return null;
    const finished = current;
    hideBeacon();
    current = null;
    if (success) {
      completed.add(finished.mission.id);
      let payout = finished.reward;
      if (finished.mission.id === 'taksi') payout += Math.round(finished.timer) * 2;
      ctx.addCash(payout);
      ctx.notify(`Misi selesai: ${finished.mission.name} — +$${payout}`);
      if (ctx.sfx) ctx.sfx.win();
      return { success: true, mission: finished.mission, payout };
    }
    ctx.notify(`Misi gagal: ${finished.mission.name}`);
    if (ctx.sfx) ctx.sfx.fail();
    return { success: false, mission: finished.mission, payout: 0 };
  }

  /**
   * Advance the active mission. `ctx` carries the player's position and the
   * callbacks the mission needs (cash, wanted, notifications, sounds).
   * Returns a result object only on the frame a mission ends.
   */
  function update(dt, ctx) {
    elapsed += dt;
    beacon.gem.rotation.y += dt * 2.4;
    beacon.gem.position.y = 9 + Math.sin(elapsed * 2.2) * 0.8;
    if (beacon.group.visible) {
      const pulse = 0.7 + 0.3 * Math.sin(elapsed * 4);
      beacon.ringMat.opacity = pulse;
    }
    if (!current) return null;

    current.timer -= dt;
    if (current.timer <= 0) {
      if (ctx.setWanted) ctx.setWanted(Math.max(0, ctx.wanted - 3));
      return finish(ctx, false);
    }

    if (current.phase === 'evade') {
      // Survive: the beacon sits on the player, the timer is the mission.
      setBeacon(ctx.px, ctx.pz, 0xff2d2d);
      return null;
    }

    const dist = distanceTo(ctx);
    if (dist < ARRIVE_RADIUS) {
      if (current.phase === 'pickup') {
        current.phase = 'deliver';
        current.target = pickTarget(ctx.px, ctx.pz, 60);
        setBeacon(current.target.x, current.target.z, 0x2dff6b);
        ctx.notify(current.mission.id === 'taksi' ? 'Penumpang naik! Antar secepatnya!' : 'Paket diambil! Antar ke titik hijau!');
        if (ctx.sfx) ctx.sfx.pickup();
      } else if (current.phase === 'deliver') {
        return finish(ctx, true);
      }
    }
    return null;
  }

  function hudText(ctx) {
    if (!current) {
      if (completed.size >= STORY_MISSIONS.length) return { line: 'Semua misi cerita selesai — ambil job Kurir Neon (tombol 4).', timer: null };
      return { line: 'Pilih misi di menu (1/2/3) atau jelajahi kota.', timer: null };
    }
    const dist = Math.round(distanceTo(ctx));
    if (current.phase === 'evade') {
      return { line: `LOLOS DARI KEJARAN — bertahan ${Math.ceil(current.timer)} dtk!`, timer: current.timer };
    }
    if (current.phase === 'pickup') {
      const what = current.mission.id === 'taksi' ? 'Jemput penumpang' : 'Jemput paket';
      return { line: `${current.mission.name} — ${what} (${dist} m)`, timer: current.timer };
    }
    return { line: `${current.mission.name} — Antar ke tujuan (${dist} m)`, timer: current.timer };
  }

  function abort() {
    if (!current) return;
    hideBeacon();
    current = null;
  }

  return {
    STORY_MISSIONS,
    startStory,
    startCourier,
    update,
    hudText,
    abort,
    active() { return current !== null; },
    currentId() { return current ? current.mission.id : null; },
    marker() { return current ? { x: current.target.x, z: current.target.z } : null; },
    completedCount() { return completed.size; },
    storyDone() { return completed.size >= STORY_MISSIONS.length; },
    isCompleted(id) { return completed.has(id); },
  };
}
