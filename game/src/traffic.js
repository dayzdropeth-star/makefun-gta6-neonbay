// NEON BAY v3 — traffic.
//
// Three kinds of civilian traffic share Neon Bay's roads: sedans, yellow
// cabs with roof signs, and big haulers (trucks and buses). Each car picks
// a random walk through the intersections, keeps to the right-hand lane,
// and brakes for the car ahead. How many are on the road follows the clock:
// rush hour (07:00–09:00 and 17:00–19:00) packs the avenues, midnight
// empties them.
//
// The module also builds the meshes the police reuse: buildCarMesh() is the
// one place a car body is assembled, so a police cruiser is a traffic car
// with a light bar and a different paint job.

import { PITCH, ROAD } from './world.js';

const LANE = 3.4;
const KIND_STATS = {
  sedan: { length: 4.4, width: 1.9, height: 0.62, cabin: 0.55, minSpeed: 9, maxSpeed: 13, accel: 6 },
  taxi: { length: 4.4, width: 1.9, height: 0.62, cabin: 0.55, minSpeed: 10, maxSpeed: 14, accel: 7 },
  hauler: { length: 7.6, width: 2.5, height: 1.5, cabin: 0.9, minSpeed: 7, maxSpeed: 9.5, accel: 4 },
};
const SEDAN_COLORS = [0x8a93a6, 0x5a6b8a, 0x9a3d3d, 0x3d6b4a, 0x777777, 0x2e3d55, 0x7a5a8a];
const HAULER_COLORS = [0x4a5a6a, 0x6a5a3a, 0x3a5a4a, 0x8a8a7a];

/** Assemble a car body. `kind` is sedan, taxi or hauler; `paint` is a hex colour. */
export function buildCarMesh(kind, paint) {
  const stats = KIND_STATS[kind] ?? KIND_STATS.sedan;
  const group = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.15, metalness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(stats.width, stats.height, stats.length), paintMat);
  body.position.y = 0.55;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(stats.width * 0.86, stats.cabin, stats.length * 0.48), glassMat);
  cabin.position.set(0, 0.55 + stats.height / 2 + stats.cabin / 2 - 0.05, -stats.length * 0.06);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelPositions = [
    [-stats.width / 2, stats.length * 0.32], [stats.width / 2, stats.length * 0.32],
    [-stats.width / 2, -stats.length * 0.32], [stats.width / 2, -stats.length * 0.32],
  ];
  for (const [wx, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2d2d });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lampMat);
    head.position.set(side * (stats.width / 2 - 0.35), 0.62, stats.length / 2 + 0.01);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tail.position.set(side * (stats.width / 2 - 0.35), 0.62, -stats.length / 2 - 0.01);
    group.add(tail);
  }

  if (kind === 'taxi') {
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.4), signMat);
    sign.position.set(0, 0.55 + stats.height / 2 + stats.cabin + 0.08, 0);
    group.add(sign);
  }
  if (kind === 'hauler') {
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(stats.width + 0.02, 0.18, stats.length * 0.7), stripeMat);
    stripe.position.set(0, 0.95, 0);
    group.add(stripe);
  }
  return group;
}

/** How many cars rush hour wants on the road, from the hour of day. */
export function densityFor(hour) {
  const morningRush = hour >= 7 && hour < 9;
  const eveningRush = hour >= 17 && hour < 19;
  if (morningRush || eveningRush) return 20;
  if (hour >= 22 || hour < 5) return 6;
  if (hour >= 11 && hour < 15) return 12;
  return 15;
}

function lanePoint(x, z, heading) {
  // Right-hand traffic: offset to the right of the direction of travel.
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  return { x: x + rightX * LANE, z: z + rightZ * LANE };
}

/**
 * Run the traffic. `hourFn` is called for the current in-game hour so the
 * density can follow rush hour; `focusFn` returns the player's position so
 * cars far away can be recycled near the action.
 */
export function createTraffic(scene, city, rng, hourFn, focusFn) {
  const cars = [];
  let spawnCooldown = 0;

  function pickKind() {
    const roll = rng.next();
    if (roll < 0.55) return 'sedan';
    if (roll < 0.8) return 'taxi';
    return 'hauler';
  }

  function pickPaint(kind) {
    if (kind === 'taxi') return 0xffc61a;
    if (kind === 'hauler') return rng.pick(HAULER_COLORS);
    return rng.pick(SEDAN_COLORS);
  }

  function spawnCar() {
    const kind = pickKind();
    const edge = rng.pick(city.intersections);
    const heading = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const start = lanePoint(edge.x, edge.z, heading);
    const mesh = buildCarMesh(kind, pickPaint(kind));
    mesh.position.set(start.x, 0, start.z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh, kind,
      stats: KIND_STATS[kind],
      x: start.x, z: start.z,
      heading,
      speed: rng.range(4, 8),
      cruise: rng.range(KIND_STATS[kind].minSpeed, KIND_STATS[kind].maxSpeed),
      target: null,
      stuck: 0,
    };
    car.target = nextWaypoint(car);
    cars.push(car);
    return car;
  }

  /** Snap a coordinate to the nearest road centre line (roads sit at ±30 offsets). */
  function snapRoad(value) {
    return Math.round((value - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
  }

  /** The next intersection ahead, with a random turn at the current one. */
  function nextWaypoint(car) {
    const ahead = 1;
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    const junctionX = snapRoad(car.x + forwardX * PITCH * ahead);
    const junctionZ = snapRoad(car.z + forwardZ * PITCH * ahead);
    const clampedX = Math.max(-city.limit, Math.min(city.limit, junctionX));
    const clampedZ = Math.max(-city.limit, Math.min(city.limit, junctionZ));
    return lanePoint(clampedX, clampedZ, car.heading);
  }

  function steerCar(car, dt) {
    const dx = car.target.x - car.x;
    const dz = car.target.z - car.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 2.5) {
      // Arrived: choose the next leg — mostly straight, sometimes a turn.
      const roll = rng.next();
      if (roll < 0.6) {
        // Straight on.
      } else if (roll < 0.8) {
        car.heading += Math.PI / 2;
      } else {
        car.heading -= Math.PI / 2;
      }
      // Turn around at the city edge instead of driving into the bay.
      const nextX = car.x + Math.sin(car.heading) * PITCH;
      const nextZ = car.z + Math.cos(car.heading) * PITCH;
      if (Math.abs(nextX) > city.limit + 4 || Math.abs(nextZ) > city.limit + 4) {
        car.heading += Math.PI;
      }
      car.target = nextWaypoint(car);
      return;
    }
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  }

  /** True when another car is close ahead in this car's direction. */
  function blockedAhead(car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 8 && side < 2.6) return true;
    }
    return false;
  }

  function update(dt, grip) {
    const want = densityFor(hourFn());
    const focus = focusFn();
    spawnCooldown -= dt;
    if (cars.length < want && spawnCooldown <= 0) {
      spawnCar();
      spawnCooldown = 0.5;
    }
    for (let index = cars.length - 1; index >= 0; index -= 1) {
      const car = cars[index];
      const far = Math.hypot(car.x - focus.x, car.z - focus.z);
      if (far > 320 && cars.length > want) {
        scene.remove(car.mesh);
        cars.splice(index, 1);
        continue;
      }
      steerCar(car, dt);
      const blocked = blockedAhead(car);
      const targetSpeed = blocked ? 0 : car.cruise * (0.85 + 0.15 * grip);
      if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + car.stats.accel * dt);
      else car.speed = Math.max(targetSpeed, car.speed - car.stats.accel * 1.6 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
  }

  /**
   * Circle-vs-car collision. Returns the car hit and the push-out normal,
   * or null. Cars are treated as circles of radius ~2.4, which is close
   * enough at city speeds and keeps the check cheap.
   */
  function collide(x, z, radius) {
    for (const car of cars) {
      const dx = x - car.x;
      const dz = z - car.z;
      const reach = radius + 2.4;
      if (dx * dx + dz * dz < reach * reach) {
        const dist = Math.max(Math.hypot(dx, dz), 0.001);
        return { car, nx: dx / dist, nz: dz / dist, overlap: reach - dist };
      }
    }
    return null;
  }

  /** Shove a car sideways after a bump, so pile-ups separate. */
  function shove(car, nx, nz, strength) {
    car.x += nx * strength;
    car.z += nz * strength;
    car.speed = Math.max(0, car.speed - 3);
    car.mesh.position.set(car.x, 0, car.z);
  }

  /** Seed the roads before the first frame so the city never looks empty. */
  function seed(count) {
    for (let index = 0; index < count; index += 1) spawnCar();
  }

  return {
    cars,
    update,
    collide,
    shove,
    seed,
    count() { return cars.length; },
  };
}
