// NEON BAY v3 — procedural sound.
//
// No audio files: every sound is synthesized with WebAudio — the engine is
// two detuned oscillators through a low-pass filter, the horn is a pair of
// square waves, the siren wails with an LFO, and crashes are filtered
// noise. The context is created lazily on the first user gesture (browsers
// refuse audio before one) and everything is silent until then.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      const length = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any user gesture: unlocks audio for the session. */
  function unlock() {
    if (!ensure()) return;
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

  function tone(freq, duration, type, volume, when) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + (when ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  function noiseBurst(duration, filterFreq, volume) {
    if (!ctx || muted || !noiseBuffer) return;
    const start = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  /**
   * Continuous engine hum. Call every frame with speed 0..1 and throttle
   * 0..1; the oscillators are built once and retuned, never recreated.
   */
  function engine(speed01, throttle01) {
    if (!ensure() || muted) {
      if (engineNodes) engineNodes.gain.gain.value = 0;
      return;
    }
    if (!engineNodes) {
      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      const oscB = ctx.createOscillator();
      oscB.type = 'square';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      filter.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      oscA.start();
      oscB.start();
      engineNodes = { oscA, oscB, filter, gain };
    }
    const rpm = 0.12 + speed01 * 0.88;
    const base = 52 + rpm * 165 + throttle01 * 22;
    engineNodes.oscA.frequency.setTargetAtTime(base, ctx.currentTime, 0.06);
    engineNodes.oscB.frequency.setTargetAtTime(base * 0.5, ctx.currentTime, 0.06);
    engineNodes.filter.frequency.setTargetAtTime(320 + rpm * 1500, ctx.currentTime, 0.08);
    engineNodes.gain.gain.setTargetAtTime(0.05 + throttle01 * 0.075 + speed01 * 0.03, ctx.currentTime, 0.1);
  }

  /** Two-tone car horn, 0.4 s. */
  function horn() {
    if (!ensure() || muted) return;
    const start = ctx.currentTime;
    for (const freq of [370, 466]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.14, start);
      gain.gain.setValueAtTime(0.14, start + 0.32);
      gain.gain.linearRampToValueAtTime(0, start + 0.4);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.42);
    }
  }

  /** Bright pickup chime: three rising notes. */
  function pickup() {
    if (!ensure()) return;
    tone(660, 0.12, 'sine', 0.22, 0);
    tone(880, 0.12, 'sine', 0.22, 0.09);
    tone(1320, 0.22, 'sine', 0.2, 0.18);
  }

  /** Mission-complete fanfare. */
  function win() {
    if (!ensure()) return;
    tone(523, 0.14, 'triangle', 0.24, 0);
    tone(659, 0.14, 'triangle', 0.24, 0.12);
    tone(784, 0.14, 'triangle', 0.24, 0.24);
    tone(1047, 0.34, 'triangle', 0.26, 0.36);
  }

  /** Mission-failed descent. */
  function fail() {
    if (!ensure()) return;
    tone(392, 0.18, 'triangle', 0.22, 0);
    tone(330, 0.18, 'triangle', 0.22, 0.16);
    tone(262, 0.4, 'triangle', 0.22, 0.32);
  }

  /** Short UI click. */
  function click() {
    if (!ensure()) return;
    tone(920, 0.06, 'square', 0.1, 0);
  }

  /** Crash thud; strength 0..1 scales the noise burst. */
  function crash(strength) {
    if (!ensure()) return;
    noiseBurst(0.28, 900, 0.12 + 0.5 * Math.min(strength, 1));
    tone(70, 0.2, 'sine', 0.3, 0);
  }

  /** Skid squeal while drifting on wet roads. */
  function skid(amount) {
    if (!ensure() || muted) return;
    noiseBurst(0.12, 2400, 0.05 * Math.min(amount, 1));
  }

  /**
   * Police siren loop. Call with true when any police car is close, false
   * otherwise; the wail is one LFO-driven oscillator, started once.
   */
  function siren(on) {
    if (!ensure()) return;
    if (on && !sirenNodes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 800;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    } else if (!on && sirenNodes) {
      const nodes = sirenNodes;
      sirenNodes = null;
      nodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      window.setTimeout(() => {
        try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already stopped */ }
      }, 400);
    }
  }

  /** Stop every looping sound (engine, siren) — used on pause and bust. */
  function silenceLoops() {
    if (engineNodes) engineNodes.gain.gain.value = 0;
    if (sirenNodes) siren(false);
  }

  /** Release the context entirely (page teardown). */
  function dispose() {
    silenceLoops();
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = null;
    engineNodes = null;
    sirenNodes = null;
  }

  return { unlock, setMuted, isMuted, engine, horn, pickup, win, fail, click, crash, skid, siren, silenceLoops, dispose };
}
