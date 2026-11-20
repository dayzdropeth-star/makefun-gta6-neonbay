// NEON BAY v4 — missions.
//
// Empat pekerjaan di kota fiksi Neon Bay: tiga misi cerita yang terbuka
// berurutan, lalu satu pekerjaan kurir yang bisa diulang tanpa batas.
// Semuanya digerakkan mesin keadaan kecil yang sama: penanda bercahaya di
// dunia menunjukkan titik mulai; pemain mendekatinya untuk mengambil misi,
// lalu mengikuti tahap jemput dan antar dengan batas waktu yang longgar.
// Misi yang selesai membayar lewat ctx.onEarn.
//
//   1. Paket Pelabuhan Subuh — bungkusan kilat dari dermaga ke kafe kota.
//   2. Taksi Tengah Malam — antar penumpang yang terburu-buru pulang.
//   3. Lolos dari Bayang-Bayang — bertahan dari kejaran sambil mengemudi.
//   4. Kurir Neon — pekerjaan antar paket yang selalu ada setelah cerita.

export const STORY_MISSIONS = [
  {
    id: 'paket-pelabuhan',
    title: 'Paket Pelabuhan Subuh',
    briefing: 'Sebuah bungkusan kilat menunggu di dermaga sebelum fajar. Ambil dan antarkan ke kafe di ujung kota sebelum waktunya habis.',
    reward: 120,
  },
  {
    id: 'taksi-tengah-malam',
    title: 'Taksi Tengah Malam',
    briefing: 'Seorang penumpang gelisah menunggu tumpangan di sudut jalan. Jemput dia, lalu antar pulang secepat mungkin — makin cepat makin besar bayarannya.',
    reward: 150,
  },
  {
    id: 'kejar-bayangan',
    title: 'Lolos dari Bayang-Bayang',
    briefing: 'Sirene meraung di belakangmu. Tetaplah mengemudi dan jangan sampai tertangkap selama satu menit penuh.',
    reward: 200,
  },
  {
    id: 'kurir-neon',
    title: 'Kurir Neon',
    briefing: 'Selalu ada paket yang harus sampai. Ambil di titik kuning, antar ke titik hijau, dan bayaran langsung masuk.',
    reward: 0,
  },
];

const START_RADIUS = 9;
const ARRIVE_RADIUS = 7;
const PICKUP_TIME = 150;
const DELIVER_TIME = 150;
const EVADE_TIME = 60;
const COURIER_PAY_MIN = 55;
const COURIER_PAY_MAX = 90;

/** Bangun penanda bercahaya: tiang cahaya, cincin tanah, dan permata melayang. */
function buildMarker(scene, colorHex) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 24, 16, 1, true), beamMat);
  beam.position.y = 12;
  group.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.9, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.18;
  group.add(ring);
  const jewelMat = new THREE.MeshBasicMaterial({ color: colorHex });
  const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(1), jewelMat);
  jewel.position.y = 8;
  group.add(jewel);
  group.visible = false;
  scene.add(group);
  return { group, beamMat, ringMat, jewelMat, jewel };
}

/**
 * Bangun sistem misi untuk sebuah kota. `rng` memilih titik tujuan dan
 * bayaran kurir; `scene` menampung penanda. Pengontrol ini dipanggil tiap
 * frame oleh main loop dengan ctx { x, z, inCar, speed, onEarn }.
 */
export function createMissions(scene, city, rng) {
  const marker = buildMarker(scene, 0x00e5ff);
  const finished = new Set();
  let storyIndex = 0;
  let current = null;
  let startSpot = null;
  let clock = 0;
  let lastX = 0;
  let lastZ = 0;

  function showMarker(x, z, colorHex) {
    marker.group.position.set(x, 0, z);
    marker.group.visible = true;
    marker.beamMat.color.setHex(colorHex);
    marker.ringMat.color.setHex(colorHex);
    marker.jewelMat.color.setHex(colorHex);
  }

  function hideMarker() {
    marker.group.visible = false;
  }

  function nextMissionDef() {
    if (storyIndex < 3) return STORY_MISSIONS[storyIndex];
    return STORY_MISSIONS[3];
  }

  /** Letakkan penanda mulai untuk misi berikutnya di dekat pemain. */
  function placeStartSpot(fromX, fromZ) {
    const spot = city.randomRoadPoint(45, fromX, fromZ);
    startSpot = { x: spot.x, z: spot.z };
    showMarker(spot.x, spot.z, 0x00e5ff);
  }

  function beginMission(def, fromX, fromZ) {
    const isChase = def.id === 'kejar-bayangan';
    const pay = def.id === 'kurir-neon'
      ? rng.int(COURIER_PAY_MIN, COURIER_PAY_MAX)
      : def.reward;
    const target = city.randomRoadPoint(45, fromX, fromZ);
    current = {
      mission: def,
      phase: isChase ? 'evade' : 'pickup',
      timer: isChase ? EVADE_TIME : PICKUP_TIME,
      target,
      payout: pay,
    };
    if (isChase) showMarker(fromX, fromZ, 0xff2d2d);
    else showMarker(target.x, target.z, 0xffe14d);
    return current;
  }

  /** Akhiri misi aktif; sukses membayar lewat ctx.onEarn. */
  function endMission(ctx, success) {
    const done = current;
    current = null;
    hideMarker();
    if (!success) {
      placeStartSpot(ctx.x, ctx.z);
      return { ended: true, success: false, missionId: done.mission.id, payout: 0 };
    }
    let pay = done.payout;
    if (done.mission.id === 'taksi-tengah-malam') pay += Math.round(done.timer) * 2;
    if (done.mission.id !== 'kurir-neon') {
      finished.add(done.mission.id);
      storyIndex += 1;
    }
    if (ctx.onEarn) ctx.onEarn(pay);
    placeStartSpot(ctx.x, ctx.z);
    return { ended: true, success: true, missionId: done.mission.id, payout: pay };
  }

  /**
   * Majukan misi. `ctx` = { x, z, inCar, speed, onEarn(amount) }.
   * Mengembalikan null di sebagian besar frame; saat misi dimulai
   * mengembalikan { started: true, missionId }, dan saat misi berakhir
   * mengembalikan { ended: true, success, missionId, payout }.
   */
  function update(dt, ctx) {
    clock += dt;
    marker.jewel.rotation.y += dt * 2.2;
    marker.jewel.position.y = 8 + Math.sin(clock * 2) * 0.7;
    if (marker.group.visible) {
      marker.ringMat.opacity = 0.6 + 0.3 * Math.sin(clock * 4);
    }
    if (!startSpot && !current) {
      placeStartSpot(ctx.x, ctx.z);
      return null;
    }
    if (!current) {
      const near = Math.hypot(ctx.x - startSpot.x, ctx.z - startSpot.z);
      if (near < START_RADIUS) {
        const started = beginMission(nextMissionDef(), ctx.x, ctx.z);
        return { started: true, missionId: started.mission.id };
      }
      return null;
    }

    if (current.phase === 'evade') {
      // Kejaran hanya berjalan selama pemain mengemudi; penanda menempel.
      if (ctx.inCar) current.timer -= dt;
      showMarker(ctx.x, ctx.z, 0xff2d2d);
      if (current.timer <= 0) return endMission(ctx, true);
      return null;
    }

    current.timer -= dt;
    if (current.timer <= 0) return endMission(ctx, false);

    const dist = Math.hypot(ctx.x - current.target.x, ctx.z - current.target.z);
    if (dist < ARRIVE_RADIUS) {
      if (current.phase === 'pickup') {
        current.phase = 'deliver';
        current.timer = DELIVER_TIME;
        current.target = city.randomRoadPoint(60, ctx.x, ctx.z);
        showMarker(current.target.x, current.target.z, 0x2dff6b);
      } else {
        return endMission(ctx, true);
      }
    }
    return null;
  }

  /** Batalkan misi aktif; penanda mulai misi itu muncul kembali. */
  function abort() {
    if (!current) return;
    current = null;
    hideMarker();
    startSpot = null;
  }

  /** Jumlah misi cerita yang selesai (0-3; kurir tidak dihitung). */
  function completedCount() {
    return finished.size;
  }

  /** Kalimat tujuan saat ini untuk HUD. */
  function objectiveText() {
    if (current) {
      const left = Math.max(0, Math.ceil(current.timer));
      if (current.phase === 'evade') {
        return `${current.mission.title} — tetap mengemudi, bertahan ${left} dtk lagi!`;
      }
      const away = Math.round(Math.hypot(current.target.x - lastX, current.target.z - lastZ));
      if (current.phase === 'pickup') {
        const what = current.mission.id === 'taksi-tengah-malam' ? 'Jemput penumpang' : 'Jemput paket';
        return `${current.mission.title} — ${what} (${away} m, ${left} dtk)`;
      }
      return `${current.mission.title} — Antar ke tujuan (${away} m, ${left} dtk)`;
    }
    if (finished.size >= 3) return 'Semua misi cerita selesai — dekati penanda biru untuk job Kurir Neon.';
    return 'Dekati penanda biru untuk memulai misi berikutnya.';
  }

  // Posisi pemain terakhir, dipakai objectiveText untuk jarak ke target.

  // Bungkus update agar posisi terakhir selalu tercatat untuk HUD.
  const rawUpdate = update;
  function trackedUpdate(dt, ctx) {
    lastX = ctx.x;
    lastZ = ctx.z;
    return rawUpdate(dt, ctx);
  }

  return {
    update: trackedUpdate,
    abort,
    completedCount,
    get active() { return current ? current.mission : null; },
    get objective() { return objectiveText(); },
  };
}
