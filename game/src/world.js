// NEON BAY v3 — the city.
//
// A procedural neon city on a grid: five avenues cross five streets, blocks
// of towers rise between them, and the bay glitters to the south. Everything
// is generated from the run's seed — the same seed always builds the same
// skyline — and every texture is painted at runtime on a canvas, so the
// game loads no image, font or sound from anywhere.
//
// The module also owns the city's collision: buildings are axis-aligned
// boxes, and anything round (a car, a pedestrian) asks resolveCircle() to
// be pushed out of them.

export const PITCH = 60;
export const BLOCK = 46;
export const ROAD = 14;
export const GRID = 5;
export const HALF = 150;

const NEON_WORDS = ['NEON', 'BAY 24', 'RAMEN', 'TAXI', 'HOTEL', 'ARCADE', 'KOPI', 'DISKO', 'MIE AYAM', 'BAR', 'SINEMA', 'MOTEL', 'SATE', 'KARAOKE'];
const NEON_COLORS = ['#ff2d78', '#00e5ff', '#ffe14d', '#7cff5e', '#ff8a3d', '#c77dff'];
const TOWER_COLORS = [0x2a3040, 0x35324a, 0x2e3a44, 0x40342e, 0x2c2f38, 0x3a2f42];

/** Paint a windows texture: dark glass with a random scatter of lit rooms. */
function windowsTexture(rng, litRatio, maxAniso = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, 256, 512);
  const warm = ['#ffd28a', '#ffe9b8', '#ffb36b'];
  const cool = ['#9fd8ff', '#c9f2ff', '#7cc7ff'];
  for (let row = 0; row < 32; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      if (!rng.chance(litRatio)) continue;
      ctx.fillStyle = rng.chance(0.65) ? rng.pick(warm) : rng.pick(cool);
      ctx.fillRect(8 + col * 15, 12 + row * 15, 10, 9);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;
  return texture;
}

/** Paint a glowing shop sign with one word on it. */
function neonTexture(word, colour, maxAniso = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = 'bold 160px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colour;
  ctx.shadowBlur = 72;
  ctx.fillStyle = colour;
  ctx.fillText(word, 512, 136);
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(word, 512, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;
  return texture;
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Build the whole city into `scene` and return the city's query object:
 * collision, road tests, spawn points and the per-frame update for blinking
 * signs and traffic lights.
 */
export function buildCity(scene, rng, maxAniso = 1) {
  const buildings = [];
  const signs = [];
  const intersections = [];
  const trafficLights = [];

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(680, 680), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  // The bay: open water south of the city, catching the neon.
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a2e4a, roughness: 0.25, metalness: 0.55, emissive: 0x061e33, emissiveIntensity: 0.6 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(680, 220), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.05, 268);
  scene.add(water);

  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x2b303c, roughness: 0.9, emissive: 0x0a0d14, emissiveIntensity: 0.7 });
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 1 });
  const roadLines = [];
  // Roads run halfway between block centres: six avenues and six streets,
  // so no tower ever stands on asphalt.
  for (let index = -3; index <= 2; index += 1) {
    const line = index * PITCH + PITCH / 2;
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, HALF * 2 + ROAD), asphaltMat);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.set(line, 0.02, 0);
    scene.add(roadX);
    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + ROAD, ROAD), asphaltMat);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.set(0, 0.02, line);
    scene.add(roadZ);
    roadLines.push(line);
  }

  // Sidewalk slabs: one per block, so the towers sit on pavement, not grass.
  for (let bx = -2; bx <= 2; bx += 1) {
    for (let bz = -2; bz <= 2; bz += 1) {
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), walkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx * PITCH, 0.015, bz * PITCH);
      scene.add(slab);
    }
  }

  // Lane dashes and crosswalk stripes, all in one instanced mesh.
  const dashGeo = new THREE.PlaneGeometry(0.5, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a8 });
  const dashMatrices = [];
  const dummy = new THREE.Object3D();
  for (const line of roadLines) {
    for (let along = -HALF + 6; along <= HALF - 6; along += 8) {
      const nearCross = Math.abs(((along % PITCH) + PITCH) % PITCH) < 9 || Math.abs(((along % PITCH) + PITCH) % PITCH - PITCH) < 9;
      if (nearCross) continue;
      dummy.position.set(line, 0.04, along);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      dashMatrices.push(dummy.matrix.clone());
      dummy.position.set(along, 0.04, line);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      dashMatrices.push(dummy.matrix.clone());
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, Math.max(dashMatrices.length, 1));
  dashMatrices.forEach((matrix, index) => dashes.setMatrixAt(index, matrix));
  dashes.count = dashMatrices.length;
  scene.add(dashes);

  // Towers: each block holds one to four lots; height grows toward downtown.
  const windowSets = [windowsTexture(rng, 0.42, maxAniso), windowsTexture(rng, 0.3, maxAniso), windowsTexture(rng, 0.55, maxAniso)];
  const towerMats = TOWER_COLORS.map(
    (color, index) => new THREE.MeshStandardMaterial({
      color, roughness: 0.85, metalness: 0.15,
      emissiveMap: windowSets[index % windowSets.length],
      emissive: 0xffffff, emissiveIntensity: 1.15,
    }),
  );
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 1 });
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6, metalness: 0.7 });

  for (let bx = -2; bx <= 2; bx += 1) {
    for (let bz = -2; bz <= 2; bz += 1) {
      const centreX = bx * PITCH;
      const centreZ = bz * PITCH;
      const downtown = 1 - (Math.abs(bx) + Math.abs(bz)) / 4;
      const lots = rng.int(2, 4);
      const taken = rng.shuffle([0, 1, 2, 3]).slice(0, lots);
      for (const lot of taken) {
        const lotX = centreX + (lot % 2 === 0 ? -11 : 11);
        const lotZ = centreZ + (lot < 2 ? -11 : 11);
        const width = rng.range(15, 20);
        const depth = rng.range(15, 20);
        const height = rng.range(12, 20) + downtown * rng.range(8, 38);
        const material = rng.pick(towerMats);
        const tower = box(width, height, depth, material);
        tower.position.set(lotX, height / 2, lotZ);
        scene.add(tower);
        const roof = box(width + 0.6, 0.8, depth + 0.6, roofMat);
        roof.position.set(lotX, height + 0.4, lotZ);
        scene.add(roof);
        if (rng.chance(0.4)) {
          const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, rng.range(4, 9), 6), antennaMat);
          antenna.position.set(lotX + rng.range(-4, 4), height + 3, lotZ + rng.range(-4, 4));
          scene.add(antenna);
        }
        buildings.push({ minX: lotX - width / 2, maxX: lotX + width / 2, minZ: lotZ - depth / 2, maxZ: lotZ + depth / 2, height });

        // A glowing shop sign on the street face of some towers.
        if (rng.chance(0.42)) {
          const word = rng.pick(NEON_WORDS);
          const colour = rng.pick(NEON_COLORS);
          const signMat = new THREE.MeshBasicMaterial({
            map: neonTexture(word, colour, maxAniso), transparent: true, side: THREE.DoubleSide, toneMapped: false,
          });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.2), signMat);
          const face = rng.pick(['north', 'south', 'east', 'west']);
          const signY = rng.range(4.5, Math.min(height - 2, 12));
          if (face === 'north') { sign.position.set(lotX, signY, lotZ - depth / 2 - 0.3); sign.rotation.y = Math.PI; }
          if (face === 'south') { sign.position.set(lotX, signY, lotZ + depth / 2 + 0.3); }
          if (face === 'east') { sign.position.set(lotX + width / 2 + 0.3, signY, lotZ); sign.rotation.y = Math.PI / 2; }
          if (face === 'west') { sign.position.set(lotX - width / 2 - 0.3, signY, lotZ); sign.rotation.y = -Math.PI / 2; }
          scene.add(sign);
          signs.push({ material: signMat, phase: rng.range(0, Math.PI * 2), speed: rng.range(1.5, 4) });
        }
      }
    }
  }

  // Street lamps at every intersection corner, one instanced set.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c313c, roughness: 0.7, metalness: 0.5 });
  const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const lampSpots = [];
  for (let ix = -3; ix <= 2; ix += 1) {
    for (let iz = -3; iz <= 2; iz += 1) {
      const junctionX = ix * PITCH + PITCH / 2;
      const junctionZ = iz * PITCH + PITCH / 2;
      intersections.push({ x: junctionX, z: junctionZ });
      lampSpots.push({ x: junctionX + 9, z: junctionZ + 9 });
      lampSpots.push({ x: junctionX - 9, z: junctionZ - 9 });
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach((spot, index) => {
    dummy.position.set(spot.x, 3.5, spot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
    dummy.position.set(spot.x, 7.1, spot.z);
    dummy.updateMatrix();
    heads.setMatrixAt(index, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);

  // A few palm-ish trees on block corners, for a coastal-city feel.
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
  const leafGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e6b34, roughness: 1, emissive: 0x0a2a12, emissiveIntensity: 0.5 });
  for (let count = 0; count < 34; count += 1) {
    const bx = rng.int(-2, 2);
    const bz = rng.int(-2, 2);
    const x = bx * PITCH + rng.pick([-20, 20]);
    const z = bz * PITCH + rng.pick([-20, 20]);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.75, z);
    scene.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(x, 6.4, z);
    leaves.scale.y = 0.75;
    scene.add(leaves);
  }

  // Traffic lights on the nine central intersections, cycling on a timer.
  const lightPoleMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.7, metalness: 0.4 });
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
  for (const lx of [-PITCH / 2, PITCH / 2, PITCH * 1.5]) {
    for (const lz of [-PITCH / 2, PITCH / 2, PITCH * 1.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 6), lightPoleMat);
      pole.position.set(lx + 8.4, 3.2, lz + 8.4);
      scene.add(pole);
      const bulbs = ['red', 'amber', 'green'].map((name, order) => {
        const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0x331111 }));
        bulb.position.set(lx + 8.4, 6.6 - order * 0.75, lz + 8.4);
        scene.add(bulb);
        return { mesh: bulb, name };
      });
      trafficLights.push({ x: lx, z: lz, bulbs });
    }
  }

  /** True when a point sits on asphalt (within a road strip). */
  function onRoad(x, z) {
    for (const line of roadLines) {
      if (Math.abs(x - line) < ROAD / 2 + 1 || Math.abs(z - line) < ROAD / 2 + 1) return true;
    }
    return false;
  }

  /** Nearest road centre line distance, for steering helpers. */
  function roadDistance(x, z) {
    let best = Infinity;
    for (const line of roadLines) {
      best = Math.min(best, Math.abs(x - line), Math.abs(z - line));
    }
    return best;
  }

  /**
   * Push a circle (x, z, radius r) out of every building it overlaps.
   * Returns the corrected position and whether anything was hit.
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
        // Dead centre inside a box: shove out along the shortest face.
        const pushLeft = x - b.minX;
        const pushRight = b.maxX - x;
        const pushUp = z - b.minZ;
        const pushDown = b.maxZ - z;
        const smallest = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (smallest === pushLeft) x = b.minX - r;
        else if (smallest === pushRight) x = b.maxX + r;
        else if (smallest === pushUp) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    return { x, z, hit };
  }

  /** A random intersection, optionally at least `minDist` from a point. */
  function randomJunction(minDist, fromX, fromZ) {
    for (let tries = 0; tries < 24; tries += 1) {
      const junction = rng.pick(intersections);
      const dx = junction.x - (fromX ?? 0);
      const dz = junction.z - (fromZ ?? 0);
      if (Math.hypot(dx, dz) >= (minDist ?? 0)) return { x: junction.x, z: junction.z };
    }
    const junction = rng.pick(intersections);
    return { x: junction.x, z: junction.z };
  }

  /** A random point on a road, for mission targets and parked cars. */
  function randomRoadPoint(minDist, fromX, fromZ) {
    const junction = randomJunction(minDist, fromX, fromZ);
    const along = rng.pick(['x', 'z']);
    const offset = rng.range(-PITCH / 2 + 8, PITCH / 2 - 8);
    return along === 'x'
      ? { x: junction.x + offset, z: junction.z + rng.pick([-3.4, 3.4]) }
      : { x: junction.x + rng.pick([-3.4, 3.4]), z: junction.z + offset };
  }

  let elapsed = 0;
  const LIGHT_CYCLE = 16;
  const BULB_COLORS = { red: 0xff2d2d, amber: 0xffb02d, green: 0x2dff6b, off: 0x331111 };

  /** Blink the neon and cycle the traffic lights. */
  function update(dt) {
    elapsed += dt;
    for (const sign of signs) {
      const glow = 0.75 + 0.25 * Math.sin(elapsed * sign.speed + sign.phase);
      sign.material.opacity = glow;
    }
    const phase = (elapsed % LIGHT_CYCLE) / LIGHT_CYCLE;
    for (const light of trafficLights) {
      const northSouth = phase < 0.5;
      const amberNow = (phase > 0.42 && phase < 0.5) || (phase > 0.92);
      for (const bulb of light.bulbs) {
        let lit = false;
        if (bulb.name === 'green') lit = northSouth && !amberNow;
        if (bulb.name === 'amber') lit = amberNow;
        if (bulb.name === 'red') lit = !northSouth && !amberNow;
        bulb.mesh.material.color.setHex(lit ? BULB_COLORS[bulb.name] : BULB_COLORS.off);
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
