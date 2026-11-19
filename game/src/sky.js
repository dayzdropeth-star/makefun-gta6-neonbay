// NEON BAY v3 — sky, day/night cycle and weather.
//
// One module owns everything above the rooftops: the clock, the sun and moon,
// the colour of the sky, fog, and the rain. The game starts at dusk, when
// the neon is at its best, and the clock runs a full day in about eight
// real minutes. Weather drifts between clear, haze, rain and storm; rain
// wets the roads, and wet roads grip less — the sky module is what makes
// driving in a storm feel different from driving at noon.
//
// Colours are keyframed by hour of day and lerped, so dawn, noon, dusk and
// night each have their own palette instead of one flat "evening" look.

const SKY_KEYS = [
  { hour: 0, top: 0x070a1c, horizon: 0x0d1230, sun: 0x223366, hemi: 0x1a2340, fog: 0x0a0e22 },
  { hour: 5, top: 0x0a0f28, horizon: 0x2c2350, sun: 0x334477, hemi: 0x232c4a, fog: 0x11142c },
  { hour: 7, top: 0x4a6f9e, horizon: 0xe08a5a, sun: 0xffb36b, hemi: 0x5a6f8f, fog: 0x8a7a72 },
  { hour: 10, top: 0x5f9fd0, horizon: 0x9fc8e8, sun: 0xfff2cf, hemi: 0x8fa8c0, fog: 0x9db8cc },
  { hour: 14, top: 0x4f97cc, horizon: 0x8ec2e6, sun: 0xfff6da, hemi: 0x93a9bd, fog: 0x93b2c6 },
  { hour: 17, top: 0x6f8fc0, horizon: 0xe8a05c, sun: 0xffc06b, hemi: 0x7d8aa0, fog: 0xa08a7a },
  { hour: 18.6, top: 0x2a1c50, horizon: 0xff7a4d, sun: 0xff8a4d, hemi: 0x4a3a66, fog: 0x3a2a44 },
  { hour: 20, top: 0x0a0e26, horizon: 0x1c1440, sun: 0x2a3a66, hemi: 0x1e2646, fog: 0x0c1026 },
  { hour: 24, top: 0x070a1c, horizon: 0x0d1230, sun: 0x223366, hemi: 0x1a2340, fog: 0x0a0e22 },
];

/** Indonesian weather names, in the order the HUD shows them. */
export const WEATHER_NAMES = {
  clear: 'Cerah',
  haze: 'Berkabut',
  rain: 'Hujan',
  storm: 'Badai',
};

const WEATHER_ORDER = ['clear', 'haze', 'rain', 'storm'];
const RAIN_DROPS = 900;
const DAY_LENGTH_SECONDS = 480;

function lerpColor(a, b, t, target) {
  target.setHex(a);
  target.lerp(new THREE.Color(b), t);
  return target;
}

function skyAt(hour, target) {
  let lower = SKY_KEYS[0];
  let upper = SKY_KEYS[SKY_KEYS.length - 1];
  for (let index = 0; index < SKY_KEYS.length - 1; index += 1) {
    if (hour >= SKY_KEYS[index].hour && hour <= SKY_KEYS[index + 1].hour) {
      lower = SKY_KEYS[index];
      upper = SKY_KEYS[index + 1];
      break;
    }
  }
  const span = Math.max(upper.hour - lower.hour, 0.001);
  const t = Math.min(Math.max((hour - lower.hour) / span, 0), 1);
  const mix = (key) => {
    const colour = new THREE.Color(lower[key]);
    colour.lerp(new THREE.Color(upper[key]), t);
    return colour;
  };
  target.top = mix('top');
  target.horizon = mix('horizon');
  target.sun = mix('sun');
  target.hemi = mix('hemi');
  target.fog = mix('fog');
  target.blend = t;
  return target;
}

/**
 * Build the sky for a scene. `rng` drives weather changes; the clock starts
 * at dusk (18.4) so the first thing a player sees is neon against a burning
 * sky. Returns the controller the main loop calls every frame.
 */
export function createSky(scene, rng) {
  const sun = new THREE.DirectionalLight(0xffb36b, 2.2);
  sun.position.set(120, 180, 60);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x8fa8c0, 0x1a1410, 0.9);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.0);
  moon.position.set(-80, 140, -120);
  scene.add(moon);

  // Stars: one Points cloud on a far dome, faded in only at night.
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(420 * 3);
  for (let index = 0; index < 420; index += 1) {
    const theta = rng.range(0, Math.PI * 2);
    const phi = rng.range(0.08, Math.PI / 2.2);
    const radius = 700;
    starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[index * 3 + 1] = radius * Math.cos(phi);
    starPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0 }),
  );
  scene.add(stars);

  // Rain: a box of streaks around the focus point, recycled as they fall.
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(RAIN_DROPS * 3);
  const rainSpeeds = new Float32Array(RAIN_DROPS);
  for (let index = 0; index < RAIN_DROPS; index += 1) {
    rainPositions[index * 3] = rng.range(-35, 35);
    rainPositions[index * 3 + 1] = rng.range(0, 32);
    rainPositions[index * 3 + 2] = rng.range(-35, 35);
    rainSpeeds[index] = rng.range(26, 42);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0x9fb8d8, size: 0.55, transparent: true, opacity: 0 }),
  );
  rain.visible = false;
  scene.add(rain);

  const palette = { top: null, horizon: null, sun: null, hemi: null, fog: null, blend: 0 };
  const sky = {
    hour: 18.4,
    weather: 'clear',
    wetness: 0,
    grip: 1,
    weatherTimer: rng.range(35, 70),
    flashTimer: rng.range(6, 14),
    flash: 0,
  };

  function pickNextWeather() {
    const roll = rng.next();
    if (sky.weather === 'clear') return roll < 0.55 ? 'haze' : roll < 0.85 ? 'rain' : 'storm';
    if (sky.weather === 'haze') return roll < 0.5 ? 'clear' : roll < 0.85 ? 'rain' : 'storm';
    if (sky.weather === 'rain') return roll < 0.45 ? 'clear' : roll < 0.7 ? 'haze' : 'storm';
    return roll < 0.6 ? 'rain' : 'clear';
  }

  function setWeather(name) {
    if (!WEATHER_ORDER.includes(name)) return;
    sky.weather = name;
    sky.weatherTimer = rng.range(40, 95);
  }

  /** Daylight factor 0 (deep night) to 1 (midday), from the sun's height. */
  function daylight(hour) {
    const angle = ((hour - 6) / 12) * Math.PI;
    return Math.max(0, Math.sin(angle));
  }

  function hourLabel() {
    const hours = Math.floor(sky.hour);
    const minutes = Math.floor((sky.hour - hours) * 60);
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}`;
  }

  /**
   * Advance clock and weather. `focus` is the point the rain box follows
   * (usually the player's car), so the storm never leaves the player behind.
   */
  function update(dt, focus) {
    sky.hour = (sky.hour + (dt * 24) / DAY_LENGTH_SECONDS) % 24;

    sky.weatherTimer -= dt;
    if (sky.weatherTimer <= 0) setWeather(pickNextWeather());

    const raining = sky.weather === 'rain' || sky.weather === 'storm';
    const targetWet = raining ? 1 : 0;
    sky.wetness += (targetWet - sky.wetness) * Math.min(dt * 0.25, 1);
    sky.grip = 1 - 0.32 * sky.wetness;

    const light = daylight(sky.hour);
    skyAt(sky.hour, palette);
    scene.background = palette.horizon;
    scene.fog = scene.fog || new THREE.Fog(palette.fog, 90, 420);
    scene.fog.color.copy(palette.fog);

    const hazeNear = sky.weather === 'haze' ? 55 : sky.weather === 'storm' ? 60 : 110;
    const hazeFar = sky.weather === 'haze' ? 220 : sky.weather === 'storm' ? 260 : 430;
    scene.fog.near += (hazeNear - scene.fog.near) * Math.min(dt * 0.5, 1);
    scene.fog.far += (hazeFar - scene.fog.far) * Math.min(dt * 0.5, 1);

    // Sun swings across the sky; at night it drops and the moon takes over.
    const sunAngle = ((sky.hour - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunAngle) * 220, Math.sin(sunAngle) * 200 + 12, 90);
    sun.intensity = 0.4 + light * 2.4;
    sun.color.copy(palette.sun);
    hemi.intensity = 0.55 + light * 0.75;
    hemi.color.copy(palette.hemi);
    moon.intensity = light < 0.12 ? 0.55 : 0;
    stars.material.opacity = light < 0.15 ? 0.9 - light * 3 : 0;

    // Storm lightning: a brief white flash from the hemisphere light.
    sky.flashTimer -= dt;
    if (sky.weather === 'storm' && sky.flashTimer <= 0) {
      sky.flash = 0.22;
      sky.flashTimer = rng.range(5, 16);
    }
    if (sky.flash > 0) {
      sky.flash -= dt;
      hemi.intensity += 1.6;
    }

    // Rain falls in a box around the focus; drops that hit the ground restart at the top.
    rain.visible = raining;
    if (raining) {
      rain.material.opacity = sky.weather === 'storm' ? 0.85 : 0.55;
      const positions = rainGeo.attributes.position.array;
      const drift = sky.weather === 'storm' ? 9 : 3;
      for (let index = 0; index < RAIN_DROPS; index += 1) {
        positions[index * 3 + 1] -= rainSpeeds[index] * dt;
        positions[index * 3] += drift * dt;
        if (positions[index * 3 + 1] < 0) {
          positions[index * 3] = focus.x + rng.range(-35, 35);
          positions[index * 3 + 1] = rng.range(26, 34);
          positions[index * 3 + 2] = focus.z + rng.range(-35, 35);
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.position.set(0, 0, 0);
    }
  }

  return {
    get hour() { return sky.hour; },
    get weather() { return sky.weather; },
    get wetness() { return sky.wetness; },
    get grip() { return sky.grip; },
    update,
    setWeather,
    hourLabel,
    isNight() { return daylight(sky.hour) < 0.12; },
    isRaining() { return sky.weather === 'rain' || sky.weather === 'storm'; },
    weatherName() { return WEATHER_NAMES[sky.weather]; },
  };
}
