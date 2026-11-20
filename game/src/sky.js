// NEON BAY v4 — langit, siklus siang-malam, dan cuaca.
//
// Modul ini memiliki segala yang ada di atas atap: jam, matahari dan bulan,
// warna langit, kabut, dan hujan. Permainan dimulai saat senja (18.4),
// ketika neon paling hidup, dan satu hari penuh berjalan sekitar delapan
// menit waktu nyata. Cuaca bergeser antara cerah, berkabut, hujan, dan
// badai; hujan membasahi jalan dan jalan basah mencengkeram lebih lemah.
//
// Warna langit diambil dari keyframe per jam lalu diinterpolasi, jadi fajar,
// siang, senja, dan malam masing-masing punya palet sendiri. Tone mapping
// dan exposure diatur di main.js, bukan di sini — modul ini hanya mengatur
// cahaya, kabut, dan latar.

// Nama cuaca berbahasa Indonesia untuk HUD.
export const WEATHER_NAMES = {
  clear: 'Cerah',
  haze: 'Berkabut',
  rain: 'Hujan',
  storm: 'Badai',
};

const WEATHER_LIST = ['clear', 'haze', 'rain', 'storm'];
const DROP_COUNT = 900;
const DAY_SECONDS = 480;

// Palet langit per jam: langit atas, cakrawala, warna matahari, cahaya
// hemisfer, dan warna kabut.
const PALETTE_KEYS = [
  { at: 0, top: 0x060818, horizon: 0x0c1028, sun: 0x2a3a6e, hemi: 0x182238, fog: 0x090d20 },
  { at: 5, top: 0x0b1029, horizon: 0x2e2452, sun: 0x3a4d84, hemi: 0x242e4c, fog: 0x12152e },
  { at: 7, top: 0x52779f, horizon: 0xe08a58, sun: 0xffb268, hemi: 0x5c718c, fog: 0x8b7a70 },
  { at: 10, top: 0x62a2d2, horizon: 0xa2c9e8, sun: 0xfff1c8, hemi: 0x92a9c2, fog: 0x9fb9cd },
  { at: 14, top: 0x5298cd, horizon: 0x90c3e6, sun: 0xfff5d2, hemi: 0x95abc0, fog: 0x95b3c7 },
  { at: 17, top: 0x718fc0, horizon: 0xe89f5a, sun: 0xffbd66, hemi: 0x7e8aa2, fog: 0xa1897a },
  { at: 18.6, top: 0x2c1c52, horizon: 0xff7a4a, sun: 0xff8846, hemi: 0x4c3a68, fog: 0x3c2a46 },
  { at: 20, top: 0x0a0e24, horizon: 0x1c1442, sun: 0x2c3c6a, hemi: 0x1e2648, fog: 0x0c1026 },
  { at: 24, top: 0x060818, horizon: 0x0c1028, sun: 0x2a3a6e, hemi: 0x182238, fog: 0x090d20 },
];

// Peluang cuaca berikutnya, tergantung cuaca saat ini.
const NEXT_WEATHER = {
  clear: [['haze', 0.55], ['rain', 0.85], ['storm', 1]],
  haze: [['clear', 0.5], ['rain', 0.85], ['storm', 1]],
  rain: [['clear', 0.45], ['haze', 0.7], ['storm', 1]],
  storm: [['rain', 0.6], ['clear', 1]],
};

// Campur dua warna hex ke objek THREE.Color yang sudah ada.
function blendHex(fromHex, toHex, t, out) {
  out.setHex(fromHex);
  out.lerp(new THREE.Color(toHex), t);
  return out;
}

// Isi `out` dengan palet yang terinterpolasi untuk jam tertentu.
function samplePalette(hour, out) {
  let low = PALETTE_KEYS[0];
  let high = PALETTE_KEYS[PALETTE_KEYS.length - 1];
  for (let i = 0; i < PALETTE_KEYS.length - 1; i += 1) {
    if (hour >= PALETTE_KEYS[i].at && hour <= PALETTE_KEYS[i + 1].at) {
      low = PALETTE_KEYS[i];
      high = PALETTE_KEYS[i + 1];
      break;
    }
  }
  const span = Math.max(high.at - low.at, 0.001);
  const t = Math.min(Math.max((hour - low.at) / span, 0), 1);
  blendHex(low.top, high.top, t, out.top);
  blendHex(low.horizon, high.horizon, t, out.horizon);
  blendHex(low.sun, high.sun, t, out.sun);
  blendHex(low.hemi, high.hemi, t, out.hemi);
  blendHex(low.fog, high.fog, t, out.fog);
  return out;
}

// Faktor siang 0 (tengah malam) sampai 1 (tengah hari), dari tinggi matahari.
function daylightAt(hour) {
  return Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
}

/**
 * Bangun langit untuk sebuah scene. `rng` menggerakkan pergantian cuaca;
 * jam mulai di 18.4 (senja). Mengembalikan controller yang dipanggil
 * main loop setiap frame.
 */
export function createSky(scene, rng) {
  // Matahari: satu-satunya sumber bayangan di game.
  const sun = new THREE.DirectionalLight(0xffb268, 2.2);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x92a9c2, 0x1a1410, 0.9);
  scene.add(hemi);

  // Bulan: menyala hanya saat malam, dari sisi berlawanan.
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0);
  moon.position.set(-80, 140, -120);
  scene.add(moon);

  // Bintang: satu awan Points di kubah jauh, hanya terlihat saat malam.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i += 1) {
    const theta = rng.range(0, Math.PI * 2);
    const phi = rng.range(0.08, Math.PI / 2.2);
    const radius = 700;
    starPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = radius * Math.cos(phi);
    starPos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0 }),
  );
  scene.add(stars);

  // Hujan: titik-titik yang jatuh di kotak sekitar pemain, didaur ulang.
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(DROP_COUNT * 3);
  const rainSpeed = new Float32Array(DROP_COUNT);
  for (let i = 0; i < DROP_COUNT; i += 1) {
    rainPos[i * 3] = rng.range(-35, 35);
    rainPos[i * 3 + 1] = rng.range(0, 32);
    rainPos[i * 3 + 2] = rng.range(-35, 35);
    rainSpeed[i] = rng.range(26, 42);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0x9fb8d8, size: 0.55, transparent: true, opacity: 0 }),
  );
  rain.visible = false;
  scene.add(rain);

  const palette = {
    top: new THREE.Color(0),
    horizon: new THREE.Color(0),
    sun: new THREE.Color(0),
    hemi: new THREE.Color(0),
    fog: new THREE.Color(0),
  };

  const state = {
    hour: 18.4,
    weather: 'clear',
    wetness: 0,
    grip: 1,
    weatherTimer: rng.range(35, 70),
    flashTimer: rng.range(6, 14),
    flash: 0,
  };

  function chooseWeather() {
    const roll = rng.next();
    for (const [name, limit] of NEXT_WEATHER[state.weather]) {
      if (roll < limit) return name;
    }
    return 'clear';
  }

  function setWeather(name) {
    if (!WEATHER_LIST.includes(name)) return;
    state.weather = name;
    state.weatherTimer = rng.range(40, 95);
  }

  function hourLabel() {
    const hh = Math.floor(state.hour);
    const mm = Math.floor((state.hour - hh) * 60);
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}`;
  }

  function isNight() {
    return daylightAt(state.hour) < 0.12;
  }

  function isRaining() {
    return state.weather === 'rain' || state.weather === 'storm';
  }

  function weatherName() {
    return WEATHER_NAMES[state.weather];
  }

  /**
   * Majukan jam dan cuaca. `focus` adalah titik yang diikuti kotak hujan
   * (biasanya mobil pemain), supaya badai tidak pernah tertinggal.
   */
  function update(dt, focus) {
    state.hour = (state.hour + (dt * 24) / DAY_SECONDS) % 24;

    state.weatherTimer -= dt;
    if (state.weatherTimer <= 0) setWeather(chooseWeather());

    // Jalan basah saat hujan, mengering perlahan setelahnya.
    const raining = isRaining();
    const wetTarget = raining ? 1 : 0;
    state.wetness += (wetTarget - state.wetness) * Math.min(dt * 0.25, 1);
    state.grip = 1 - 0.32 * state.wetness;

    const light = daylightAt(state.hour);
    samplePalette(state.hour, palette);
    scene.background = palette.horizon;
    if (!scene.fog) scene.fog = new THREE.Fog(palette.fog, 110, 430);
    scene.fog.color.copy(palette.fog);

    // Jarak pandang menyempit saat berkabut atau badai.
    const wantNear = state.weather === 'haze' ? 55 : state.weather === 'storm' ? 60 : 110;
    const wantFar = state.weather === 'haze' ? 220 : state.weather === 'storm' ? 260 : 430;
    const ease = Math.min(dt * 0.5, 1);
    scene.fog.near += (wantNear - scene.fog.near) * ease;
    scene.fog.far += (wantFar - scene.fog.far) * ease;

    // Matahari melintas langit mengikuti jam; malam hari ia tenggelam
    // dan bulan mengambil alih.
    const sunAngle = ((state.hour - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunAngle) * 220, Math.sin(sunAngle) * 200 + 12, 90);
    sun.intensity = 0.4 + light * 2.4;
    sun.color.copy(palette.sun);
    hemi.intensity = 0.55 + light * 0.75;
    hemi.color.copy(palette.hemi);
    moon.intensity = light < 0.12 ? 0.55 : 0;
    stars.material.opacity = light < 0.15 ? 0.9 - light * 3 : 0;

    // Kilat badai: semburan cahaya singkat dari hemisfer.
    state.flashTimer -= dt;
    if (state.weather === 'storm' && state.flashTimer <= 0) {
      state.flash = 0.22;
      state.flashTimer = rng.range(5, 16);
    }
    if (state.flash > 0) {
      state.flash -= dt;
      hemi.intensity += 1.6;
    }

    // Hujan jatuh di kotak sekitar focus; tetes yang menyentuh tanah
    // naik lagi ke atas kotak.
    rain.visible = raining;
    if (raining) {
      rain.material.opacity = state.weather === 'storm' ? 0.85 : 0.55;
      const positions = rainGeo.attributes.position.array;
      const drift = state.weather === 'storm' ? 9 : 3;
      for (let i = 0; i < DROP_COUNT; i += 1) {
        positions[i * 3 + 1] -= rainSpeed[i] * dt;
        positions[i * 3] += drift * dt;
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3] = focus.x + rng.range(-35, 35);
          positions[i * 3 + 1] = rng.range(26, 34);
          positions[i * 3 + 2] = focus.z + rng.range(-35, 35);
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
  }

  return {
    get hour() { return state.hour; },
    get weather() { return state.weather; },
    get wetness() { return state.wetness; },
    get grip() { return state.grip; },
    update,
    setWeather,
    hourLabel,
    isNight,
    isRaining,
    weatherName,
  };
}
