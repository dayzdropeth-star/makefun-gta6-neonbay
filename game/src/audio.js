// NEON BAY v4 — suara sintetis, tanpa file audio.
//
// Semua bunyi dibuat dengan WebAudio: mesin dari osilator yang di-filter,
// tabrakan dari noise, sirene dari osilator yang frekuensinya diayun LFO.
// AudioContext baru dibuat saat gestur pertama pengguna (browser menolak
// audio sebelum itu), dan semua method diam saja sampai unlock() dipanggil.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineRig = null;
  let sirenRig = null;
  let noiseBuf = null;

  // Bangun konteks + bus master + buffer noise sekali saja. Gagal = diam.
  function boot() {
    if (ctx) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      const samples = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, samples, ctx.sampleRate);
      const channel = noiseBuf.getChannelData(0);
      for (let i = 0; i < samples; i += 1) {
        channel[i] = Math.random() * 2 - 1;
      }
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  // Panggil dari gestur pengguna: mengaktifkan audio untuk sesi ini.
  function unlock() {
    if (!boot()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  function isMuted() {
    return muted;
  }

  // Satu nada pendek dengan attack cepat dan ekor eksponensial.
  function blip(freq, seconds, type, level, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(level, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  // Semburan noise yang dilembutkan low-pass filter.
  function thud(seconds, cutoff, level) {
    if (!ctx || muted || !noiseBuf) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + seconds + 0.05);
  }

  // Dengung mesin yang terus menyala; dipanggil tiap frame dengan
  // ratio = kecepatan 0..1 dan throttle = gas 0..1. Osilator dibuat
  // sekali lalu di-retune, bukan dibuat ulang tiap frame.
  function engine(ratio, throttle) {
    if (!boot() || muted) {
      if (engineRig) engineRig.out.gain.value = 0;
      return;
    }
    if (!engineRig) {
      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      const oscB = ctx.createOscillator();
      oscB.type = 'sine';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      filter.Q.value = 1.5;
      const out = ctx.createGain();
      out.gain.value = 0;
      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(out);
      out.connect(master);
      oscA.start();
      oscB.start();
      engineRig = { oscA, oscB, filter, out };
    }
    const rev = 0.1 + ratio * 0.9;
    const base = 48 + rev * 170 + throttle * 25;
    const now = ctx.currentTime;
    engineRig.oscA.frequency.setTargetAtTime(base, now, 0.06);
    engineRig.oscB.frequency.setTargetAtTime(base * 0.5, now, 0.06);
    engineRig.filter.frequency.setTargetAtTime(300 + rev * 1600, now, 0.08);
    engineRig.out.gain.setTargetAtTime(0.04 + throttle * 0.08 + ratio * 0.03, now, 0.1);
  }

  // Klakson dua nada, 0.4 detik.
  function horn() {
    if (!boot() || muted) return;
    const t0 = ctx.currentTime;
    for (const freq of [349, 440]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, t0);
      gain.gain.setValueAtTime(0.12, t0 + 0.3);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.38);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    }
  }

  // Klik UI pendek.
  function click() {
    if (!boot()) return;
    blip(880, 0.05, 'square', 0.08, 0);
  }

  // Tabrakan; v 0..1 mengatur kerasnya.
  function crash(v) {
    if (!boot()) return;
    const strength = Math.max(0, Math.min(v || 0, 1));
    thud(0.3, 800, 0.1 + 0.45 * strength);
    blip(65, 0.22, 'sine', 0.28, 0);
  }

  // Decit ban; v 0..1 mengatur kerasnya. Dipanggil berulang saat mobil
  // selip — tiap panggilan hanya semburan 0.12 detik, jadi tidak ada
  // node yang menumpuk bila selip berhenti.
  function skid(v) {
    if (!boot() || muted || !noiseBuf) return;
    const amount = Math.max(0, Math.min(v || 0, 1));
    if (amount <= 0.01) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07 * amount, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + 0.14);
  }

  // Sirene polisi. on=true menyalakan loop naik-turun, on=false mematikannya.
  function siren(on) {
    if (!boot()) return;
    if (on && !sirenRig) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 820;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.5;
      const depth = ctx.createGain();
      depth.gain.value = 190;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      const out = ctx.createGain();
      out.gain.value = 0.045;
      osc.connect(out);
      out.connect(master);
      osc.start();
      lfo.start();
      sirenRig = { osc, lfo, out };
    } else if (!on && sirenRig) {
      const rig = sirenRig;
      sirenRig = null;
      rig.out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      window.setTimeout(() => {
        try { rig.osc.stop(); rig.lfo.stop(); } catch { /* sudah berhenti */ }
      }, 400);
    }
  }

  // Nada turun saat misi gagal.
  function fail() {
    if (!boot()) return;
    blip(370, 0.18, 'triangle', 0.2, 0);
    blip(311, 0.18, 'triangle', 0.2, 0.15);
    blip(247, 0.42, 'triangle', 0.2, 0.3);
  }

  // Matikan semua loop (mesin, sirene) — dipakai saat jeda dan tertangkap.
  function silenceLoops() {
    if (engineRig) engineRig.out.gain.value = 0;
    if (sirenRig) siren(false);
  }

  return { unlock, setMuted, isMuted, click, engine, skid, crash, siren, fail, silenceLoops, horn };
}
