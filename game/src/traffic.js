// NEON BAY v4 — traffic.
//
// Jalanan Neon Bay diisi mobil warga yang berputar di persimpangan: sedan
// biasa, taksi kuning bertanda atap, truk pengangkut barang, dan mobil
// polisi. Setiap mobil memilih persimpangan tujuan, melaju di jalurnya,
// lalu berbelok atau lurus saat sampai. Ramainya jalan mengikuti jam:
// pagi dan sore padat, tengah malam lengang.
//
// Modul ini juga merakit semua badan mobil di satu tempat (buildCarMesh),
// jadi mobil polisi hanyalah rakitan yang sama dengan lampu strobo dan
// cat berbeda. Tidak ada impor three di sini: THREE datang sebagai global
// dari script tag klasik, dan kota datang sebagai objek hasil buildCity.

const LANE = 3.2;
const DESPAWN_DIST = 300;
const CAR_RADIUS = 2.3;
const TURN_RATE = 2.6;
const CARDINALS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

const SPECS = {
  sedan: { len: 4.2, wid: 1.85, bodyH: 0.6, cabinH: 0.55, wheelR: 0.34, cruiseMin: 9, cruiseMax: 13, accel: 6.5 },
  taxi: { len: 4.2, wid: 1.85, bodyH: 0.6, cabinH: 0.55, wheelR: 0.34, cruiseMin: 10, cruiseMax: 14, accel: 7 },
  hauler: { len: 7.4, wid: 2.45, bodyH: 1.35, cabinH: 0.95, wheelR: 0.45, cruiseMin: 6.5, cruiseMax: 9, accel: 4 },
  police: { len: 4.4, wid: 1.9, bodyH: 0.62, cabinH: 0.55, wheelR: 0.34, cruiseMin: 13, cruiseMax: 17, accel: 9 },
};

const SEDAN_PAINTS = [0x8a93a6, 0x5a6b8a, 0x9a3d3d, 0x3d6b4a, 0x777777, 0x2e3d55, 0x7a5a8a];
const HAULER_PAINTS = [0x4a5a6a, 0x6a5a3a, 0x3a5a4a, 0x8a8a7a];
const TAXI_PAINT = 0xffc61a;
const POLICE_PAINT = 0xe8e8e8;

/** Generator acak kecil (mulberry32) untuk lalu lintas, bisa di-seed ulang. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rakit satu mobil. `kind` adalah sedan, taxi, hauler, atau police;
 * `paint` warna bodi (hex). Mengembalikan THREE.Group dengan bodi, kabin
 * kaca, empat roda, lampu depan dan belakang; taksi membawa tanda atap,
 * hauler membawa strip samping, polisi membawa light bar merah-biru.
 * Semua mesh di dalam group melempar bayangan (castShadow).
 */
export function buildCarMesh(kind, paint) {
  const spec = SPECS[kind] || SPECS.sedan;
  const group = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.15, metalness: 0.8 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2d2d });

  const bodyY = spec.wheelR + spec.bodyH / 2 + 0.08;
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, spec.bodyH, spec.len), paintMat);
  body.position.y = bodyY;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.wid * 0.84, spec.cabinH, spec.len * 0.46),
    glassMat,
  );
  cabin.position.set(0, bodyY + spec.bodyH / 2 + spec.cabinH / 2 - 0.04, -spec.len * 0.05);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, 0.28, 12);
  const wheelZ = spec.len * 0.32;
  const wheelX = spec.wid / 2;
  const wheelSpots = [
    [-wheelX, wheelZ], [wheelX, wheelZ], [-wheelX, -wheelZ], [wheelX, -wheelZ],
  ];
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, spec.wheelR, wz);
    group.add(wheel);
  }

  const lampY = bodyY + 0.05;
  const lampX = spec.wid / 2 - 0.35;
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    head.position.set(side * lampX, lampY, spec.len / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tail.position.set(side * lampX, lampY, -spec.len / 2 - 0.01);
    group.add(tail);
  }

  if (kind === 'taxi') {
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.42), signMat);
    sign.position.set(0, bodyY + spec.bodyH / 2 + spec.cabinH + 0.06, 0);
    group.add(sign);
  }

  if (kind === 'hauler') {
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, spec.len * 0.66), stripeMat);
      stripe.position.set(side * (spec.wid / 2 + 0.01), bodyY + 0.1, 0);
      group.add(stripe);
    }
  }

  if (kind === 'police') {
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(spec.wid * 0.7, 0.14, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.6 }),
    );
    barBase.position.set(0, bodyY + spec.bodyH / 2 + spec.cabinH + 0.02, 0);
    group.add(barBase);
    const redLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2d2d }),
    );
    redLamp.position.set(-spec.wid * 0.18, bodyY + spec.bodyH / 2 + spec.cabinH + 0.14, 0);
    group.add(redLamp);
    const blueLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2d6bff }),
    );
    blueLamp.position.set(spec.wid * 0.18, bodyY + spec.bodyH / 2 + spec.cabinH + 0.14, 0);
    group.add(blueLamp);
    group.userData.flash = [redLamp, blueLamp];
  }

  group.traverse((child) => { if (child.isMesh) child.castShadow = true; });
  return group;
}

/**
 * Berapa mobil yang diinginkan di jalan pada `hour` (0-24). Jam berangkat
 * dan pulang kerja paling ramai, dini hari paling sepi.
 */
export function densityFor(hour) {
  const h = ((hour % 24) + 24) % 24;
  if ((h >= 7 && h < 10) || (h >= 17 && h < 19)) return 22;
  if (h >= 23 || h < 5) return 5;
  if (h >= 11 && h < 14) return 14;
  return 17;
}

/**
 * Jalankan lalu lintas. `hourFn` mengembalikan jam permainan (0-24) agar
 * kepadatan mengikuti jam sibuk; `focusFn` mengembalikan {x, z} posisi
 * pemain agar mobil jauh bisa didaur ulang ke dekat aksi. `rng` diterima
 * untuk kompatibilitas pemanggil; pengacakan internal memakai seed
 * sendiri yang diatur lewat seed().
 */
export function createTraffic(scene, city, rng, hourFn, focusFn) {
  const cars = [];
  const limit = city.limit ?? 150;
  let rand = mulberry32(0x9e3779b9);
  let spawnTimer = 0;
  let blinkTimer = 0;

  function randRange(min, max) {
    return min + (max - min) * rand();
  }

  function randPick(list) {
    return list[Math.floor(rand() * list.length)];
  }

  /** Geser titik ke jalur kanan dari arah `heading` (maju = sin/cos). */
  function laneShift(x, z, heading) {
    return { x: x + Math.cos(heading) * LANE, z: z - Math.sin(heading) * LANE };
  }

  function pickKind() {
    const roll = rand();
    if (roll < 0.5) return 'sedan';
    if (roll < 0.8) return 'taxi';
    return 'hauler';
  }

  function pickPaint(kind) {
    if (kind === 'taxi') return TAXI_PAINT;
    if (kind === 'hauler') return randPick(HAULER_PAINTS);
    if (kind === 'police') return POLICE_PAINT;
    return randPick(SEDAN_PAINTS);
  }

  /** Persimpangan acak di dekat titik acuan, tapi tidak terlalu dekat. */
  function nearbyJunction(fromX, fromZ, maxDist) {
    const pool = (city.intersections || []).filter((point) => {
      const dx = point.x - fromX;
      const dz = point.z - fromZ;
      const d2 = dx * dx + dz * dz;
      return d2 < maxDist * maxDist && d2 > 30 * 30;
    });
    if (pool.length > 0) return randPick(pool);
    if (city.randomRoadPoint) return city.randomRoadPoint(0, fromX, fromZ);
    return { x: 0, z: 0 };
  }

  /** Pilih persimpangan tujuan berikutnya, diutamakan yang searah jalan. */
  function pickGoal(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const ahead = [];
    const anywhere = [];
    for (const point of city.intersections || []) {
      const dx = point.x - car.x;
      const dz = point.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 40 || dist > 220) continue;
      anywhere.push(point);
      if (dx * fx + dz * fz > -dist * 0.2) ahead.push(point);
    }
    const pool = ahead.length > 0 ? ahead : anywhere;
    if (pool.length === 0) return { x: car.x, z: car.z };
    const chosen = randPick(pool);
    return {
      x: Math.max(-limit, Math.min(limit, chosen.x)),
      z: Math.max(-limit, Math.min(limit, chosen.z)),
    };
  }

  function spawnOne(kindOverride, atX, atZ) {
    const kind = kindOverride || pickKind();
    const spec = SPECS[kind];
    const heading = randPick(CARDINALS);
    let start;
    if (atX !== undefined && atZ !== undefined) {
      start = { x: atX, z: atZ };
    } else {
      const focus = focusFn ? focusFn() : { x: 0, z: 0 };
      const junction = nearbyJunction(focus.x, focus.z, 220);
      start = laneShift(junction.x, junction.z, heading);
    }
    const mesh = buildCarMesh(kind, pickPaint(kind));
    mesh.position.set(start.x, 0, start.z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh,
      kind,
      x: start.x,
      z: start.z,
      heading,
      speed: randRange(3, 7),
      cruise: randRange(spec.cruiseMin, spec.cruiseMax),
      accel: spec.accel,
      flash: mesh.userData.flash || null,
      goal: null,
    };
    car.goal = pickGoal(car);
    cars.push(car);
    return car;
  }

  /** Benar bila ada mobil lain tepat di depan mobil ini. */
  function blockedAhead(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 9 && side < 2.5) return true;
    }
    return false;
  }

  function steerCar(car, dt) {
    const target = laneShift(car.goal.x, car.goal.z, car.heading);
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4.5) {
      car.goal = pickGoal(car);
      return;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
    car.heading += step;
  }

  function update(dt, player) {
    const focus = focusFn ? focusFn() : { x: (player && player.x) || 0, z: (player && player.z) || 0 };
    const wanted = densityFor(hourFn ? hourFn() : 12);
    spawnTimer -= dt;
    if (cars.length < wanted && spawnTimer <= 0) {
      spawnOne();
      spawnTimer = 0.4;
    }
    blinkTimer += dt;
    const blinkOn = Math.floor(blinkTimer * 4) % 2 === 0;
    for (let index = cars.length - 1; index >= 0; index -= 1) {
      const car = cars[index];
      const far = Math.hypot(car.x - focus.x, car.z - focus.z);
      if (far > DESPAWN_DIST && cars.length > wanted) {
        scene.remove(car.mesh);
        cars.splice(index, 1);
        continue;
      }
      steerCar(car, dt);
      const targetSpeed = blockedAhead(car) ? 0 : car.cruise;
      if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + car.accel * dt);
      else car.speed = Math.max(targetSpeed, car.speed - car.accel * 1.6 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      if (car.flash) {
        car.flash[0].visible = blinkOn;
        car.flash[1].visible = !blinkOn;
      }
    }
  }

  /**
   * Tabrakan lingkaran (x, z, r) dengan mobil. Mengembalikan mobil yang
   * tertabrak beserta normal dorong-keluar { car, nx, nz }, atau null.
   */
  function collide(x, z, radius) {
    for (const car of cars) {
      const dx = x - car.x;
      const dz = z - car.z;
      const reach = radius + CAR_RADIUS;
      if (dx * dx + dz * dz < reach * reach) {
        const dist = Math.max(Math.hypot(dx, dz), 0.001);
        return { car, nx: dx / dist, nz: dz / dist };
      }
    }
    return null;
  }

  /** Dorong mobil ke arah (nx, nz) sejauh f, dan perlambat lajunya. */
  function shove(car, nx, nz, f) {
    car.x += nx * f;
    car.z += nz * f;
    car.speed = Math.max(0, car.speed - 2);
    car.mesh.position.set(car.x, 0, car.z);
  }

  /** Munculkan mobil polisi di posisi (x, z); mengembalikan mobilnya. */
  function spawnPolice(x, z) {
    const car = spawnOne('police', x, z);
    car.cruise = randRange(SPECS.police.cruiseMin, SPECS.police.cruiseMax);
    return car;
  }

  /** Hapus mobil dari scene dan dari daftar aktif. */
  function despawn(car) {
    const index = cars.indexOf(car);
    if (index === -1) return;
    scene.remove(car.mesh);
    cars.splice(index, 1);
  }

  /** Atur seed internal; dipanggil sekali di awal permainan. */
  function seed(n) {
    rand = mulberry32((n >>> 0) || 1);
  }

  return { cars, seed, update, collide, shove, spawnPolice, despawn };
}
