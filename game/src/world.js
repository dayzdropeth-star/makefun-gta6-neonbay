// Neon Bay's city: an 8x8 block grid built procedurally from a seeded RNG.
// Everything here is original geometry + canvas textures; no external assets.
import { makeRng, range, pick, chance } from './rng.js';

export const BLOCK = 44;      // building block size
export const STREET = 14;     // street width
export const PITCH = BLOCK + STREET; // 58
export const GRID = 8;        // blocks per side
export const HALF = (GRID * BLOCK + (GRID + 1) * STREET) / 2; // 239

export function streetCenters() {
  const list = [];
  for (let i = 0; i <= GRID; i++) list.push(-HALF + STREET / 2 + i * PITCH);
  return list;
}

function windowTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#14101f';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 10) {
      const lit = rng();
      if (lit < 0.42) g.fillStyle = pick(rng, ['#ffd76a', '#7fe7ff', '#ff9ad5', '#ffe9a8']);
      else if (lit < 0.55) g.fillStyle = '#3a2f55';
      else g.fillStyle = '#0d0a18';
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const scale = size / (HALF * 2);
  const toPx = (v) => (v + HALF) * scale;
  g.fillStyle = '#1c1a24'; // asphalt base
  g.fillRect(0, 0, size, size);
  // Sidewalk slabs (lighter squares around each block)
  g.fillStyle = '#33304a';
  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const x0 = -HALF + STREET + bx * PITCH;
      const z0 = -HALF + STREET + bz * PITCH;
      g.fillRect(toPx(x0 - 2), toPx(z0 - 2), (BLOCK + 4) * scale, (BLOCK + 4) * scale);
    }
  }
  // Road centre dashes
  g.fillStyle = '#8f8a5a';
  const streets = streetCenters();
  for (const s of streets) {
    for (let v = -HALF + 6; v < HALF - 6; v += 16) {
      g.fillRect(toPx(v), toPx(s - 0.5), 8 * scale, 1 * scale);
      g.fillRect(toPx(s - 0.5), toPx(v), 1 * scale, 8 * scale);
    }
  }
  // Crosswalk stripes at intersections
  g.fillStyle = 'rgba(220, 220, 235, 0.5)';
  for (const sx of streets) {
    for (const sz of streets) {
      for (let k = -5; k <= 5; k += 2.5) {
        g.fillRect(toPx(sx + k - 0.7), toPx(sz - STREET / 2 + 1), 1.4 * scale, 4 * scale);
        g.fillRect(toPx(sx + k - 0.7), toPx(sz + STREET / 2 - 5), 1.4 * scale, 4 * scale);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeCarMesh(color, police) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1a26, metalness: 0.7, roughness: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.58, 2.2), glass);
  cabin.position.set(0, 1.12, -0.25);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.36, z);
    group.add(w);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 1.6 });
  const headBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.08), lightMat);
  headBar.position.set(0, 0.62, 2.22);
  group.add(headBar);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 1.2 });
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.08), tailMat);
  tailBar.position.set(0, 0.62, -2.22);
  group.add(tailBar);
  if (police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2244ff, emissiveIntensity: 1.4 }),
    );
    bar.position.set(0, 1.5, -0.25);
    bar.name = 'lightbar';
    group.add(bar);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x888888, emissiveIntensity: 0.25 }),
    );
    stripe.position.y = 0.72;
    group.add(stripe);
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

export function buildWorld(scene, seed) {
  const rng = makeRng(seed);
  const world = {
    buildingBoxes: [], // {minX,maxX,minZ,maxZ}
    parkedCars: [],
    trafficCars: [],
    pedestrians: [],
    pickups: [],
    streetlights: [],
    streets: streetCenters(),
    bounds: HALF,
  };

  // Sky: dusk gradient dome + fog.
  scene.background = new THREE.Color(0x1a0f2e);
  scene.fog = new THREE.Fog(0x1a0f2e, 90, 420);
  const hemi = new THREE.HemisphereLight(0x8a6fd8, 0x1a1426, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a5c, 1.35);
  sun.position.set(-120, 90, 60);
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x7a86ff, 0.35);
  moon.position.set(80, 120, -90);
  scene.add(moon);

  // Ground with painted roads.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Buildings, one or two per block, with neon signs on some.
  // Facade materials are cached by (window map, tint, emissive map): the city
  // reuses a handful of materials instead of minting a new one per building
  // (~91 buildings), which cuts material/program churn at render time.
  const winTexes = [windowTexture(rng), windowTexture(rng), windowTexture(rng)];
  const facadeTints = [0xffffff, 0xd8c8ff, 0xffe0c8, 0xc8e8ff];
  const facadeMats = new Map();
  function facadeMaterial() {
    const mapIdx = Math.floor(rng() * winTexes.length);
    const tint = pick(rng, facadeTints);
    const emisIdx = Math.floor(rng() * winTexes.length);
    const key = mapIdx + '|' + tint + '|' + emisIdx;
    let mat = facadeMats.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: winTexes[mapIdx],
        color: tint,
        roughness: 0.85,
        emissive: 0xffffff,
        emissiveMap: winTexes[emisIdx],
        emissiveIntensity: 0.55,
      });
      facadeMats.set(key, mat);
    }
    return mat;
  }
  // Roof caps share one material per roof colour, also cached.
  const roofMats = new Map();
  function roofMaterial() {
    const color = pick(rng, roofColors);
    let mat = roofMats.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
      roofMats.set(color, mat);
    }
    return mat;
  }
  const neonColors = [0xff2e88, 0x00e5ff, 0xffb020, 0x7dff5e, 0xb46bff];
  const roofColors = [0x241a33, 0x1c2438, 0x2c1a24, 0x18242c];
  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const cx = -HALF + STREET + BLOCK / 2 + bx * PITCH;
      const cz = -HALF + STREET + BLOCK / 2 + bz * PITCH;
      const twin = chance(rng, 0.45);
      const spots = twin
        ? [[cx - BLOCK / 4, cz, BLOCK / 2 - 3, BLOCK - 4], [cx + BLOCK / 4, cz, BLOCK / 2 - 3, BLOCK - 4]]
        : [[cx, cz, BLOCK - 4, BLOCK - 4]];
      for (const [x, z, w, d] of spots) {
        const h = range(rng, 9, 42);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMaterial());
        b.position.set(x, h / 2, z);
        b.receiveShadow = true;
        scene.add(b);
        world.buildingBoxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // Flat roof cap in one of the rooftop colours, so the skyline reads
        // from above (and the roof palette actually gets used).
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMaterial());
        roof.position.set(x, h + 0.25, z);
        scene.add(roof);
        // Neon sign strip on taller buildings.
        if (h > 20 && chance(rng, 0.55)) {
          const col = pick(rng, neonColors);
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(w, 10), 1.1, 0.25),
            new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.2 }),
          );
          sign.position.set(x, h * range(rng, 0.55, 0.85), z + d / 2 + 0.2);
          scene.add(sign);
        }
      }
    }
  }

  // Streetlights along the streets, as two instanced meshes (one draw call each).
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.4, 6);
  const lampGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22222c, roughness: 0.7, metalness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffe9a0, emissiveIntensity: 2.0 });
  const spots = [];
  for (const s of world.streets) {
    for (let v = -HALF + 20; v < HALF - 10; v += 58) {
      if (Math.abs(s) <= HALF && Math.abs(v) <= HALF) spots.push([s + 5.4, v]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 3.2, z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, 6.5, z);
    lamps.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(lamps);
  world.streetlights = [lamps];

  // Parked cars along street edges.
  const carColors = [0xd83a3a, 0x3a7dd8, 0x38b24a, 0xd8b23a, 0x8a4fd8, 0xd8d8d8, 0x2c2c34, 0xff7a3d];
  for (let i = 0; i < 16; i++) {
    const horizontal = chance(rng, 0.5);
    const s = pick(rng, world.streets);
    const v = range(rng, -HALF + 24, HALF - 24);
    const mesh = makeCarMesh(pick(rng, carColors), false);
    if (horizontal) { mesh.position.set(v, 0, s + 4.6); mesh.rotation.y = chance(rng, 0.5) ? 0 : Math.PI; }
    else { mesh.position.set(s + 4.6, 0, v); mesh.rotation.y = chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2; }
    scene.add(mesh);
    world.parkedCars.push({ mesh, x: mesh.position.x, z: mesh.position.z, angle: mesh.rotation.y, taken: false });
  }

  // Traffic cars cruising the streets.
  for (let i = 0; i < 10; i++) {
    const mesh = makeCarMesh(pick(rng, carColors), false);
    scene.add(mesh);
    const car = {
      mesh, horizontal: chance(rng, 0.5), dir: chance(rng, 0.5) ? 1 : -1,
      street: pick(rng, world.streets), pos: range(rng, -HALF + 20, HALF - 20),
      speed: range(rng, 7, 11), stolen: false,
    };
    world.trafficCars.push(car);
  }

  // Pedestrians strolling the sidewalks.
  const pedColors = [0xffd23d, 0x3dd8ff, 0xff6b9d, 0x9dff6b, 0xffffff, 0xff9a3d];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.4, 1.15, 8),
      new THREE.MeshStandardMaterial({ color: pick(rng, pedColors), roughness: 0.8 }),
    );
    body.position.y = 0.95;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 }),
    );
    head.position.y = 1.75;
    g.add(head);
    scene.add(g);
    world.pedestrians.push({
      mesh: g, x: range(rng, -HALF + 10, HALF - 10), z: range(rng, -HALF + 10, HALF - 10),
      angle: range(rng, 0, Math.PI * 2), speed: range(rng, 1.1, 2.0),
      state: 'walk', timer: range(rng, 2, 8), down: 0,
    });
  }

  // Cash pickups glowing on sidewalks.
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.16, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0x7dff9a, emissive: 0x2fd85e, emissiveIntensity: 1.6 }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(range(rng, -HALF + 12, HALF - 12), 1.0, range(rng, -HALF + 12, HALF - 12));
    scene.add(mesh);
    world.pickups.push({ mesh, x: mesh.position.x, z: mesh.position.z, taken: false, spin: rng() * 6 });
  }

  // Mission beacons are created by the game, not the world.
  return world;
}

// Push a circle (x,z,r) out of every building box; returns corrected position.
export function collideBuildings(world, x, z, r) {
  for (const b of world.buildingBoxes) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 0.0001) { x = b.maxX + r; continue; }
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      z = cz + (dz / d) * r;
    }
  }
  const lim = world.bounds - 2;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, Math.min(lim, z));
  return { x, z };
}

export function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }
