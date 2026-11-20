// Neon Bay v4 — the city, written from scratch.
//
// A fictional harbour city built on a five-by-five grid of blocks. Five
// avenues run north-south, five streets run east-west, and the towers in
// between grow taller toward the middle of town. To the south the streets
// end at the water, where the neon reflects off the bay.
//
// Nothing here is loaded from the network: every window pattern and every
// shop sign is painted at runtime on a canvas, and the whole layout is
// decided by the seeded rng passed in, so one seed always rebuilds the
// same streets, the same skyline, the same signs.
//
// The module also keeps the collision map. Towers are axis-aligned boxes,
// and anything round — a car, a walker, the player — asks resolveCircle()
// to be nudged out of them.

export const PITCH = 60;
export const BLOCK = 46;
export const ROAD = 14;
export const GRID = 5;
export const HALF = 150;

// Fictional shop words for the glowing signs. No real brands, no real
// places — invented storefronts for an invented town.
const SIGN_WORDS = [
  'KOPI SENJA', 'BENGKEL 88', 'NASI GORENG', 'LAUNDRY', 'BARBER',
  'WARTEG', 'DISKO', 'KARAOKE', 'ARCADE', 'HOTEL', 'MOTEL', 'TAXI',
  'RAMEN', 'BILLIARD', 'APOTEK', 'GYM 24', 'TOKO BUKU', 'SATE',
];
const SIGN_HUES = [
  '#ff2d78', '#00e5ff', '#ffe14d', '#7cff5e',
  '#ff8a3d', '#c77dff', '#ff5e5e', '#5effd6',
];
const TOWER_TINTS = [
  0x2a3040, 0x35324a, 0x2e3a44, 0x40342e, 0x2c2f38, 0x3a2f42, 0x27313d,
];

/**
 * Paint a facade texture: dark glass, a grid of windows, some of them lit
 * warm or cool. Returns a canvas texture ready to use as an emissive map.
 */
function paintWindows(rng, litChance, maxAniso = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const g = canvas.getContext('2d');

  // Night glass, slightly lighter toward the top where the sky hits it.
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#0a0e18');
  sky.addColorStop(1, '#04060a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 512);

  const warm = ['#ffd28a', '#ffe9b8', '#ffb36b', '#ff9d5c'];
  const cool = ['#9fd8ff', '#c9f2ff', '#7cc7ff', '#b8fff1'];
  const cols = 12;
  const rows = 28;
  const cellW = 256 / cols;
  const cellH = 512 / rows;
  for (let row = 0; row < rows; row += 1) {
    // A couple of whole floors stay dark, like an empty office level.
    if (rng.chance(0.06)) continue;
    for (let col = 0; col < cols; col += 1) {
      if (!rng.chance(litChance)) continue;
      g.fillStyle = rng.chance(0.6) ? rng.pick(warm) : rng.pick(cool);
      g.fillRect(
        col * cellW + 3, row * cellH + 4,
        cellW - 6, cellH - 8,
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * Paint one glowing shop sign: a single word in big letters with a neon
 * halo, plus a thin underline bar. Transparent background so the sign
 * floats on the facade.
 */
function paintSign(word, hue, maxAniso = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.font = '900 148px Arial, Helvetica, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // Wide soft halo, then a tighter bright one, then a white-hot core.
  g.shadowColor = hue;
  g.shadowBlur = 90;
  g.fillStyle = hue;
  g.fillText(word, 512, 118);
  g.shadowBlur = 28;
  g.fillText(word, 512, 118);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText(word, 512, 118);

  // Underline bar in the same neon colour.
  g.fillStyle = hue;
  g.shadowColor = hue;
  g.shadowBlur = 18;
  g.fillRect(112, 208, 800, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/** A box that both casts and receives shadows — the default building brick. */
function solidBox(w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Build the city into `scene`. Returns the city object: spawn point, road
 * helpers, circle collision, and a per-frame update that flickers the
 * signs and cycles the traffic lights.
 */
export function buildCity(scene, rng, maxAniso = 1) {
  const buildings = [];
  const signs = [];
  const intersections = [];
  const signals = [];
  const roadLines = [];

  // --- Ground and water -------------------------------------------------
  const dirt = new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), dirt);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  // The bay opens south of town; its surface picks up the neon glow.
  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x0a2e4a, roughness: 0.22, metalness: 0.6,
    emissive: 0x061e33, emissiveIntensity: 0.6,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 230), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.04, 275);
  scene.add(sea);

  // --- Asphalt, pavements, lane dashes ----------------------------------
  const tarMat = new THREE.MeshStandardMaterial({
    color: 0x2b303c, roughness: 0.9,
    emissive: 0x0a0d14, emissiveIntensity: 0.7,
  });
  const paveMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 1 });

  // Avenues and streets sit half a pitch off the block centres, so the
  // roads form a ring around every block instead of cutting through one.
  for (let i = -3; i <= 2; i += 1) {
    const line = i * PITCH + PITCH / 2;
    roadLines.push(line);

    const avenue = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, HALF * 2 + ROAD), tarMat);
    avenue.rotation.x = -Math.PI / 2;
    avenue.position.set(line, 0.02, 0);
    scene.add(avenue);

    const street = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + ROAD, ROAD), tarMat);
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, 0.02, line);
    scene.add(street);
  }

  // One pavement slab under each block; towers stand on concrete.
  for (let bx = -2; bx <= 2; bx += 1) {
    for (let bz = -2; bz <= 2; bz += 1) {
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), paveMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx * PITCH, 0.015, bz * PITCH);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }

  // Dashed centre lines down every road, in a single instanced mesh.
  // Dashes skip the stretch near each crossing, where the zebra goes.
  const dashGeo = new THREE.PlaneGeometry(0.5, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a8 });
  const dashMats = [];
  const placer = new THREE.Object3D();
  for (const line of roadLines) {
    for (let along = -HALF + 6; along <= HALF - 6; along += 8) {
      const wrapped = ((along % PITCH) + PITCH) % PITCH;
      const nearJunction = wrapped < 10 || wrapped > PITCH - 10;
      if (nearJunction) continue;
      placer.position.set(line, 0.04, along);
      placer.rotation.set(-Math.PI / 2, 0, 0);
      placer.updateMatrix();
      dashMats.push(placer.matrix.clone());
      placer.position.set(along, 0.04, line);
      placer.rotation.set(-Math.PI / 2, 0, 0);
      placer.updateMatrix();
      dashMats.push(placer.matrix.clone());
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, Math.max(dashMats.length, 1));
  dashMats.forEach((m, idx) => dashes.setMatrixAt(idx, m));
  dashes.count = dashMats.length;
  scene.add(dashes);

  // Zebra stripes across the roads at the central crossings.
  const stripeGeo = new THREE.PlaneGeometry(0.9, 5.5);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xcfc9a8 });
  const stripeMats = [];
  for (let ix = -1; ix <= 1; ix += 1) {
    for (let iz = -1; iz <= 1; iz += 1) {
      const jx = ix * PITCH + PITCH / 2;
      const jz = iz * PITCH + PITCH / 2;
      for (let s = -3; s <= 3; s += 1) {
        placer.position.set(jx + s * 1.6, 0.035, jz - 8.6);
        placer.rotation.set(-Math.PI / 2, 0, 0);
        placer.updateMatrix();
        stripeMats.push(placer.matrix.clone());
        placer.position.set(jx + 8.6, 0.035, jz + s * 1.6);
        placer.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        placer.updateMatrix();
        stripeMats.push(placer.matrix.clone());
      }
    }
  }
  const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, Math.max(stripeMats.length, 1));
  stripeMats.forEach((m, idx) => stripes.setMatrixAt(idx, m));
  stripes.count = stripeMats.length;
  scene.add(stripes);

  // --- Towers ------------------------------------------------------------
  // Three shared window textures, cycled across the towers so the city
  // does not look stamped from one sheet.
  const windowMaps = [
    paintWindows(rng, 0.42, maxAniso),
    paintWindows(rng, 0.3, maxAniso),
    paintWindows(rng, 0.55, maxAniso),
  ];
  const towerMats = TOWER_TINTS.map((tint, idx) => new THREE.MeshStandardMaterial({
    color: tint, roughness: 0.85, metalness: 0.15,
    emissiveMap: windowMaps[idx % windowMaps.length],
    emissive: 0xffffff, emissiveIntensity: 1.15,
  }));
  const capMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 1 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6, metalness: 0.7 });

  // Four lots per block, one in each corner; a shuffled subset is built.
  const CORNERS = [[-11, -11], [11, -11], [-11, 11], [11, 11]];
  for (let bx = -2; bx <= 2; bx += 1) {
    for (let bz = -2; bz <= 2; bz += 1) {
      const cx = bx * PITCH;
      const cz = bz * PITCH;
      // Downtown is the middle of the map: towers there reach for the sky.
      const central = 1 - (Math.abs(bx) + Math.abs(bz)) / 4;
      const lotCount = rng.int(1, 4);
      const chosen = rng.shuffle([0, 1, 2, 3]).slice(0, lotCount);
      for (const lot of chosen) {
        const [offX, offZ] = CORNERS[lot];
        const tx = cx + offX;
        const tz = cz + offZ;
        const w = rng.range(14, 20);
        const d = rng.range(14, 20);
        const h = rng.range(12, 22) + central * rng.range(10, 40);
        const tower = solidBox(w, h, d, rng.pick(towerMats));
        tower.position.set(tx, h / 2, tz);
        scene.add(tower);

        const cap = solidBox(w + 0.6, 0.8, d + 0.6, capMat);
        cap.position.set(tx, h + 0.4, tz);
        scene.add(cap);

        if (rng.chance(0.4)) {
          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.2, rng.range(4, 9), 6), mastMat,
          );
          mast.position.set(tx + rng.range(-4, 4), h + 3, tz + rng.range(-4, 4));
          scene.add(mast);
        }

        // Rooftop clutter: air-con boxes on the taller towers, so the
        // skyline reads as lived-in from above instead of flat slabs.
        if (h > 30 && rng.chance(0.55)) {
          for (let unit = 0; unit < 2; unit += 1) {
            const ac = solidBox(rng.range(1.6, 2.4), 1, rng.range(1.2, 1.8), capMat);
            ac.position.set(
              tx + rng.range(-w / 4, w / 4), h + 1.3,
              tz + rng.range(-d / 4, d / 4),
            );
            scene.add(ac);
          }
        }

        buildings.push({
          minX: tx - w / 2, maxX: tx + w / 2,
          minZ: tz - d / 2, maxZ: tz + d / 2,
          height: h,
        });

        // A glowing shop sign on the road-facing side of some towers.
        if (rng.chance(0.42)) {
          const word = rng.pick(SIGN_WORDS);
          const hue = rng.pick(SIGN_HUES);
          const signMat = new THREE.MeshBasicMaterial({
            map: paintSign(word, hue, maxAniso),
            transparent: true, side: THREE.DoubleSide, toneMapped: false,
          });
          const board = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.2), signMat);
          const side = rng.pick(['north', 'south', 'east', 'west']);
          const signY = rng.range(4.5, Math.min(h - 2, 12));
          if (side === 'north') {
            board.position.set(tx, signY, tz - d / 2 - 0.3);
            board.rotation.y = Math.PI;
          } else if (side === 'south') {
            board.position.set(tx, signY, tz + d / 2 + 0.3);
          } else if (side === 'east') {
            board.position.set(tx + w / 2 + 0.3, signY, tz);
            board.rotation.y = Math.PI / 2;
          } else {
            board.position.set(tx - w / 2 - 0.3, signY, tz);
            board.rotation.y = -Math.PI / 2;
          }
          scene.add(board);
          signs.push({
            material: signMat,
            phase: rng.range(0, Math.PI * 2),
            speed: rng.range(1.5, 4),
          });
        }
      }
    }
  }

  // --- Lamps, trees, bushes ----------------------------------------------
  // One lamp on two opposite corners of every crossing, instanced.
  const lampSpots = [];
  for (let ix = -3; ix <= 2; ix += 1) {
    for (let iz = -3; iz <= 2; iz += 1) {
      const jx = ix * PITCH + PITCH / 2;
      const jz = iz * PITCH + PITCH / 2;
      intersections.push({ x: jx, z: jz });
      lampSpots.push({ x: jx + 9, z: jz + 9 });
      lampSpots.push({ x: jx - 9, z: jz - 9 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c313c, roughness: 0.7, metalness: 0.5 });
  const bulbGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  lampSpots.forEach((spot, idx) => {
    placer.position.set(spot.x, 3.5, spot.z);
    placer.rotation.set(0, 0, 0);
    placer.updateMatrix();
    poles.setMatrixAt(idx, placer.matrix);
    placer.position.set(spot.x, 7.1, spot.z);
    placer.updateMatrix();
    bulbs.setMatrixAt(idx, placer.matrix);
  });
  scene.add(poles);
  scene.add(bulbs);

  // Coastal trees on block corners, plus low bushes along the pavements.
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
  const crownGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0x1e6b34, roughness: 1, emissive: 0x0a2a12, emissiveIntensity: 0.5,
  });
  const bushGeo = new THREE.SphereGeometry(1.1, 8, 6);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x1a5c2e, roughness: 1 });
  for (let n = 0; n < 34; n += 1) {
    const bx = rng.int(-2, 2);
    const bz = rng.int(-2, 2);
    const x = bx * PITCH + rng.pick([-20, 20]);
    const z = bz * PITCH + rng.pick([-20, 20]);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.75, z);
    scene.add(trunk);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 6.4, z);
    crown.scale.y = 0.75;
    scene.add(crown);
  }
  for (let n = 0; n < 48; n += 1) {
    const bx = rng.int(-2, 2);
    const bz = rng.int(-2, 2);
    const x = bx * PITCH + rng.range(-21, 21);
    const z = bz * PITCH + rng.pick([-21, 21]);
    const bush = new THREE.Mesh(bushGeo, bushMat);
    bush.position.set(x, 0.5, z);
    bush.scale.y = 0.6;
    scene.add(bush);
  }

  // A low promenade railing where the southern road meets the bay, with
  // a few benches facing the water.
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.6, metalness: 0.6 });
  const railBar = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + ROAD, 0.12, 0.12), railMat);
  railBar.position.set(0, 1.05, HALF + ROAD / 2 + 2);
  scene.add(railBar);
  const railPostGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6);
  const railPosts = new THREE.InstancedMesh(railPostGeo, railMat, 53);
  for (let i = 0; i < 53; i += 1) {
    placer.position.set(-HALF - ROAD / 2 + i * 6, 0.55, HALF + ROAD / 2 + 2);
    placer.rotation.set(0, 0, 0);
    placer.updateMatrix();
    railPosts.setMatrixAt(i, placer.matrix);
  }
  scene.add(railPosts);
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 });
  for (let i = 0; i < 7; i += 1) {
    const bench = solidBox(3, 0.25, 1, benchMat);
    bench.position.set(-120 + i * 40, 0.6, HALF + ROAD / 2 - 1);
    scene.add(bench);
  }

  // --- Traffic lights on the nine central crossings -----------------------
  const signalPoleMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.7, metalness: 0.4 });
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  for (const lx of [-PITCH / 2, PITCH / 2, PITCH * 1.5]) {
    for (const lz of [-PITCH / 2, PITCH / 2, PITCH * 1.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 6), signalPoleMat);
      post.position.set(lx + 8.4, 3.2, lz + 8.4);
      scene.add(post);
      const lamps = ['red', 'amber', 'green'].map((name, order) => {
        const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x331111 }));
        lamp.position.set(lx + 8.4, 6.6 - order * 0.75, lz + 8.4);
        scene.add(lamp);
        return { mesh: lamp, name };
      });
      signals.push({ x: lx, z: lz, lamps });
    }
  }

  // --- Queries -------------------------------------------------------------
  /** True when a point is on asphalt, inside a road strip. */
  function onRoad(x, z) {
    for (const line of roadLines) {
      if (Math.abs(x - line) < ROAD / 2 + 1) return true;
      if (Math.abs(z - line) < ROAD / 2 + 1) return true;
    }
    return false;
  }

  /** Distance to the nearest road centre line, for steering helpers. */
  function roadDistance(x, z) {
    let best = Infinity;
    for (const line of roadLines) {
      best = Math.min(best, Math.abs(x - line), Math.abs(z - line));
    }
    return best;
  }

  /**
   * Push a circle at (x, z) with radius r out of every tower it overlaps.
   * Returns the corrected spot and whether any tower was hit.
   */
  function resolveCircle(x, z, r) {
    let hit = false;
    for (const b of buildings) {
      const nearX = Math.max(b.minX, Math.min(x, b.maxX));
      const nearZ = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - nearX;
      const dz = z - nearZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= r * r) continue;
      hit = true;
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        x = nearX + (dx / dist) * r;
        z = nearZ + (dz / dist) * r;
      } else {
        // Dead centre inside the box: leave through the closest face.
        const toLeft = x - b.minX;
        const toRight = b.maxX - x;
        const toTop = z - b.minZ;
        const toBottom = b.maxZ - z;
        const least = Math.min(toLeft, toRight, toTop, toBottom);
        if (least === toLeft) x = b.minX - r;
        else if (least === toRight) x = b.maxX + r;
        else if (least === toTop) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    return { x, z, hit };
  }

  /** A random crossing, at least `minDist` away from a point when given. */
  function randomJunction(minDist, fromX, fromZ) {
    for (let tries = 0; tries < 24; tries += 1) {
      const spot = rng.pick(intersections);
      const dx = spot.x - (fromX ?? 0);
      const dz = spot.z - (fromZ ?? 0);
      if (Math.hypot(dx, dz) >= (minDist ?? 0)) return { x: spot.x, z: spot.z };
    }
    const spot = rng.pick(intersections);
    return { x: spot.x, z: spot.z };
  }

  /** A random point on a road, for mission targets and parked cars. */
  function randomRoadPoint(minDist, fromX, fromZ) {
    const spot = randomJunction(minDist, fromX, fromZ);
    const axis = rng.pick(['x', 'z']);
    const shift = rng.range(-PITCH / 2 + 8, PITCH / 2 - 8);
    if (axis === 'x') {
      return { x: spot.x + shift, z: spot.z + rng.pick([-3.4, 3.4]) };
    }
    return { x: spot.x + rng.pick([-3.4, 3.4]), z: spot.z + shift };
  }

  // --- Per-frame life -------------------------------------------------------
  let clock = 0;
  const CYCLE = 16;
  const LAMP_COLORS = { red: 0xff2d2d, amber: 0xffb02d, green: 0x2dff6b, off: 0x331111 };

  /** Flicker the neon signs and cycle the traffic lights. */
  function update(dt) {
    clock += dt;
    for (const sign of signs) {
      sign.material.opacity = 0.75 + 0.25 * Math.sin(clock * sign.speed + sign.phase);
    }
    const phase = (clock % CYCLE) / CYCLE;
    const amberNow = (phase > 0.42 && phase < 0.5) || phase > 0.92;
    const northSouthGo = phase < 0.5;
    for (const signal of signals) {
      for (const lamp of signal.lamps) {
        let lit = false;
        if (lamp.name === 'green') lit = northSouthGo && !amberNow;
        if (lamp.name === 'amber') lit = amberNow;
        if (lamp.name === 'red') lit = !northSouthGo && !amberNow;
        lamp.mesh.material.color.setHex(lit ? LAMP_COLORS[lamp.name] : LAMP_COLORS.off);
      }
    }
  }

  return {
    buildings,
    intersections,
    roadLines,
    onRoad,
    roadDistance,
    resolveCircle,
    randomJunction,
    randomRoadPoint,
    update,
    spawn: { x: 30, z: 150, heading: Math.PI },
    bounds: HALF + ROAD,
    limit: 3 * PITCH - PITCH / 2,
  };
}
