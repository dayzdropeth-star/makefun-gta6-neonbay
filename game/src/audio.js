// Tiny WebAudio synth for NEON BAY: no audio files, everything is
// generated at runtime from oscillators. The class owns two continuous
// loops (engine hum + police siren) plus one-shot blips for game events.
//
// Public API used by main.js:
//   ensure() / setMuted() / toggleMuted() / dispose()
//   setEngine(speedNorm, driving) / setSiren(on, dt)
//   blip(freq, dur, type, vol) — raw building block
//   pickup() / mission() / punch() / crash() / click()
//   ding()   — taxi passenger boards (two-tone bell)
//   fail()   — mission failed (descending buzz)
//   horn()   — short car horn, used when a taxi fare is ready
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    // Continuous loops, created once in ensure().
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.muted = false;
    // Pending jingle timeouts, so dispose() can cancel them.
    this.timers = new Set();
  }

  // Run a callback later, tracked so dispose() can cancel pending jingles.
  _schedule(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  // Build the AudioContext on first user gesture (browsers block audio
  // before interaction). Safe to call repeatedly; resumes if suspended.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);

    // Engine: low sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // Siren: square wave alternating between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  // Stop every oscillator, cancel pending jingles, drop the context.
  dispose() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    if (!this.ctx) return;
    try {
      this.engineOsc.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.sirenOsc.stop();
    } catch {
      /* already stopped */
    }
    this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  // Continuous loops, called every frame from the main loop.
  setEngine(speedNorm, driving) {
    if (!this.ctx) return;
    const target = driving ? 0.05 + 0.11 * speedNorm : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + 130 * speedNorm, this.ctx.currentTime, 0.08);
    // Open the lowpass as the engine revs, so fast driving sounds brighter.
    this.engineFilter.frequency.setTargetAtTime(420 + 900 * speedNorm, this.ctx.currentTime, 0.1);
  }

  setSiren(on, dt) {
    if (!this.ctx) return;
    if (!on) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    this.sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.1);
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 920 : 660;
    }
  }

  // One-shot tone that slides down in pitch and fades out. All event
  // sounds below are built on this single primitive.
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.6), t + dur);
    gain.gain.setValueAtTime(vol || 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A short rising arpeggio from a list of notes, spaced `step` ms apart.
  _arpeggio(notes, step, dur, type, vol) {
    notes.forEach((f, i) =>
      this._schedule(i * step, () => this.blip(f, dur, type, vol)),
    );
  }

  // --- Event sounds -------------------------------------------------------
  pickup() {
    this.blip(880, 0.16, 'sine', 0.3);
    this._schedule(70, () => this.blip(1320, 0.2, 'sine', 0.25));
  }

  mission() {
    this._arpeggio([523, 659, 784, 1046], 90, 0.22, 'triangle', 0.28);
  }

  punch() {
    this.blip(140, 0.12, 'square', 0.3);
  }

  crash() {
    this.blip(70, 0.3, 'sawtooth', 0.35);
  }

  click() {
    this.blip(660, 0.06, 'sine', 0.2);
  }

  // Taxi passenger boards: bright two-tone bell.
  ding() {
    this.blip(1174, 0.18, 'sine', 0.3);
    this._schedule(110, () => this.blip(1568, 0.28, 'sine', 0.28));
  }

  // Taxi fare paid: two bright coin-like pings, the second one higher.
  fare() {
    this.blip(1568, 0.14, 'sine', 0.3);
    this._schedule(90, () => this.blip(2093, 0.24, 'sine', 0.28));
  }

  // Mission failed: three descending notes, low and flat.
  fail() {
    this._arpeggio([392, 311, 233], 140, 0.3, 'sawtooth', 0.22);
  }

  // Short car horn: two quick square-wave honks.
  horn() {
    this.blip(370, 0.14, 'square', 0.2);
    this._schedule(160, () => this.blip(370, 0.14, 'square', 0.2));
  }
}
