// Tiny WebAudio synth: no audio files, everything is generated at runtime.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.muted = false;
    this.timers = new Set();
  }

  // Run a callback later, tracked so dispose() can cancel pending jingles.
  _after(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  }

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
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
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
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  toggleMuted() { return this.setMuted(!this.muted); }

  // Stop every oscillator, cancel pending jingles, drop the context.
  dispose() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    if (!this.ctx) return;
    try { this.engineOsc.stop(); } catch { /* already stopped */ }
    try { this.sirenOsc.stop(); } catch { /* already stopped */ }
    this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

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
    if (!on) { this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); return; }
    this.sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.1);
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 920 : 660;
    }
  }

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

  pickup() { this.blip(880, 0.16, 'sine', 0.3); this._after(70, () => this.blip(1320, 0.2, 'sine', 0.25)); }
  mission() { [523, 659, 784, 1046].forEach((f, i) => this._after(i * 90, () => this.blip(f, 0.22, 'triangle', 0.28))); }
  punch() { this.blip(140, 0.12, 'square', 0.3); }
  crash() { this.blip(70, 0.3, 'sawtooth', 0.35); }
  click() { this.blip(660, 0.06, 'sine', 0.2); }
}
