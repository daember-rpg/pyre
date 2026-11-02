/*
 * Pyre sound: every sound is synthesised in the browser with the Web Audio API, no audio files.
 * Noise shaped by filters and envelopes gives whooshes, fire, dust and impacts; oscillators give
 * the tonal parts (metal ringing, bow strings, spell chimes). A small generated room reverb glues them.
 *
 *   const sfx = PyreSound.get();
 *   sfx.play("fireball", { intensity: 1, pan: 0 });
 */

const rand = (a, b) => a + Math.random() * (b - a);

export class PyreSound {
  static #instance = null;
  static get() { return (PyreSound.#instance ??= new PyreSound()); }

  constructor() { this.ctx = null; this.volume = 0.8; }

  /** Created on first use: browsers only allow audio after the user has interacted with the page. */
  #init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return this.ctx; }
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return null;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    // Gentle limiter so stacked effects never clip
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 8; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(ctx.destination);
    // Room reverb from a decaying noise impulse
    this.verb = ctx.createConvolver(); this.verb.buffer = this.#impulse(2.2, 2.6);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.32;
    this.verbIn.connect(this.verb).connect(this.master);
    // Shared noise buffers
    this.white = this.#noise(2, "white"); this.brown = this.#noise(3, "brown");
    return ctx;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  #noise(seconds, kind) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  #impulse(seconds, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return buf;
  }

  /* ---------------- building blocks ---------------- */

  /** An output for one sound: gain → pan → master (+ a send to the reverb). */
  #out(t, { gain = 1, pan = 0, wet = 0.25 } = {}) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(this.master); } else g.connect(this.master);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s).connect(this.verbIn); }
    return g;
  }
  /** Envelope: attack to peak, then exponential decay. */
  #env(param, t, peak, attack, decay, hold = 0) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(attack, 0.001));
    if (hold) param.setValueAtTime(Math.max(peak, 0.0002), t + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
  }
  /** Filtered noise burst. f: filter frequency (or [from, to] for a sweep). */
  #noiseHit(out, t, { type = "lowpass", f = 1000, q = 0.7, peak = 0.8, attack = 0.005, decay = 0.3, hold = 0, brown = false, rate = 1 } = {}) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white; src.playbackRate.value = rate; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    const [f0, f1] = Array.isArray(f) ? f : [f, f];
    flt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + hold + decay);
    const g = ctx.createGain(); this.#env(g.gain, t, peak, attack, decay, hold);
    src.connect(flt).connect(g).connect(out);
    src.start(t, Math.random()); src.stop(t + attack + hold + decay + 0.05);
  }
  /** Oscillator tone with an optional pitch glide. */
  #tone(out, t, { type = "sine", f = 440, f1 = null, peak = 0.5, attack = 0.005, decay = 0.4, hold = 0, detune = 0 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + attack + hold + decay);
    const g = ctx.createGain(); this.#env(g.gain, t, peak, attack, decay, hold);
    o.connect(g).connect(out); o.start(t); o.stop(t + attack + hold + decay + 0.05);
  }
  /** Ringing metal: inharmonic partials decaying at different rates. */
  #ring(out, t, base, peak = 0.25, decay = 0.9) {
    for (const [k, a, d] of [[1, 1, 1], [2.76, 0.55, 0.7], [5.4, 0.35, 0.45], [8.93, 0.2, 0.3]]) this.#tone(out, t, { f: base * k * rand(0.995, 1.005), peak: peak * a, attack: 0.002, decay: decay * d });
  }
  /** Rattle of many small hits (rubble, splinters, embers). */
  #rattle(out, t, { count = 20, spread = 0.8, f = [400, 2500], peak = 0.3, decay = 0.05, curve = 1.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const dt = Math.pow(Math.random(), curve) * spread;
      this.#noiseHit(out, t + dt, { type: "bandpass", f: rand(f[0], f[1]), q: rand(2, 6), peak: peak * rand(0.3, 1) * (1 - dt / (spread * 1.3)), attack: 0.001, decay: decay * rand(0.5, 1.5) });
    }
  }
  /** Crunch: soft clip for heavy impacts. */
  #crunch(out, amount = 6) {
    const ctx = this.ctx, ws = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    ws.curve = c; ws.connect(out); return ws;
  }

  /* ---------------- the sounds ---------------- */

  play(name, { intensity = 1, pan = 0, delay = 0 } = {}) {
    const ctx = this.#init(); if (!ctx) return;
    const fn = this[`s_${name}`]; if (!fn) return;
    try { fn.call(this, ctx.currentTime + 0.01 + delay, Math.max(0.2, Math.min(2, intensity)), pan); } catch (err) { console.warn("pyre | sound", name, err); }
  }
  get names() { return Object.getOwnPropertyNames(PyreSound.prototype).filter((k) => k.startsWith("s_")).map((k) => k.slice(2)); }

  // Weapons ------------------------------------------------------------
  s_swish(t, I, pan) { const o = this.#out(t, { gain: 2.8 * I, pan, wet: 0.1 }); this.#noiseHit(o, t, { type: "bandpass", f: [700, 3200], q: 1.4, peak: 0.6, attack: 0.07, decay: 0.12 }); }
  s_sword(t, I, pan) {
    const o = this.#out(t, { gain: 0.8 * I, pan, wet: 0.2 });
    this.#noiseHit(o, t, { type: "bandpass", f: [600, 3400], q: 1.6, peak: 0.55, attack: 0.08, decay: 0.1 });
    this.#noiseHit(o, t + 0.17, { type: "highpass", f: 2500, peak: 0.6, attack: 0.001, decay: 0.06 });
    this.#ring(o, t + 0.17, rand(780, 900), 0.14 * I, 0.7);
    this.#noiseHit(o, t + 0.17, { type: "lowpass", f: 500, peak: 0.5, attack: 0.002, decay: 0.12, brown: true });
  }
  s_axe(t, I, pan) {
    const o = this.#out(t, { gain: 0.9 * I, pan, wet: 0.2 });
    this.#noiseHit(o, t, { type: "bandpass", f: [300, 1600], q: 1.1, peak: 0.6, attack: 0.12, decay: 0.08 });
    const c = this.#crunch(o, 4);
    this.#tone(c, t + 0.22, { f: 140, f1: 55, peak: 0.9, attack: 0.002, decay: 0.25 });
    this.#noiseHit(c, t + 0.22, { type: "bandpass", f: 900, q: 1.2, peak: 0.7, attack: 0.001, decay: 0.12 });
    this.#rattle(o, t + 0.24, { count: 10, spread: 0.35, f: [1200, 3500], peak: 0.18, decay: 0.03 });
  }
  s_dagger(t, I, pan) {
    const o = this.#out(t, { gain: 2.7 * I, pan, wet: 0.1 });
    for (const dt of [0, 0.16]) {
      this.#noiseHit(o, t + dt, { type: "bandpass", f: [1500, 5000], q: 2, peak: 0.45, attack: 0.04, decay: 0.05 });
      this.#noiseHit(o, t + dt + 0.06, { type: "lowpass", f: 900, peak: 0.45, attack: 0.001, decay: 0.07, brown: true });
    }
  }
  s_hammer(t, I, pan) {
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.35 });
    this.#noiseHit(o, t, { type: "bandpass", f: [200, 900], q: 0.9, peak: 0.45, attack: 0.15, decay: 0.06 });
    const c = this.#crunch(o, 5);
    this.#tone(c, t + 0.22, { f: 95, f1: 32, peak: 1, attack: 0.002, decay: 0.5 });
    this.#noiseHit(c, t + 0.22, { type: "lowpass", f: [1800, 150], peak: 0.9, attack: 0.001, decay: 0.45, brown: true });
    this.#rattle(o, t + 0.25, { count: 14, spread: 0.6, f: [500, 2200], peak: 0.2, decay: 0.05 });
  }
  s_flail(t, I, pan) {
    const o = this.#out(t, { gain: 0.8 * I, pan, wet: 0.15 });
    for (let i = 0; i < 3; i++) this.#noiseHit(o, t + i * 0.05, { type: "bandpass", f: [900, 2400], q: 3, peak: 0.25, attack: 0.03, decay: 0.03 });
    this.#noiseHit(o, t + 0.2, { type: "highpass", f: 3000, peak: 1, attack: 0.0005, decay: 0.03 });
    this.#tone(o, t + 0.2, { type: "square", f: 2400, f1: 900, peak: 0.12, attack: 0.001, decay: 0.05 });
  }
  s_spear(t, I, pan) {
    const o = this.#out(t, { gain: 2.1 * I, pan, wet: 0.12 });
    this.#noiseHit(o, t, { type: "bandpass", f: [1200, 2600], q: 2.2, peak: 0.5, attack: 0.1, decay: 0.05 });
    this.#noiseHit(o, t + 0.17, { type: "lowpass", f: 1200, peak: 0.6, attack: 0.001, decay: 0.1, brown: true });
    this.#ring(o, t + 0.17, 1250, 0.06 * I, 0.3);
  }
  s_shield(t, I, pan) {
    const o = this.#out(t, { gain: 0.95 * I, pan, wet: 0.3 });
    const c = this.#crunch(o, 3);
    this.#tone(c, t + 0.15, { f: 120, f1: 60, peak: 0.8, attack: 0.002, decay: 0.3 });
    this.#noiseHit(c, t + 0.15, { type: "bandpass", f: 700, q: 1, peak: 0.6, attack: 0.001, decay: 0.2 });
    this.#ring(o, t + 0.15, 310, 0.12 * I, 1.1);
  }
  s_punch(t, I, pan) {
    const o = this.#out(t, { gain: 0.85 * I, pan, wet: 0.1 });
    this.#tone(o, t + 0.12, { f: 110, f1: 50, peak: 0.9, attack: 0.002, decay: 0.16 });
    this.#noiseHit(o, t + 0.12, { type: "lowpass", f: 700, peak: 0.7, attack: 0.001, decay: 0.08, brown: true });
  }
  s_claw(t, I, pan) {
    const o = this.#out(t, { gain: 2.45 * I, pan, wet: 0.12 });
    for (let i = 0; i < 3; i++) this.#noiseHit(o, t + i * 0.035, { type: "bandpass", f: [5000, 1800], q: 4, peak: 0.45, attack: 0.005, decay: 0.12 });
    this.#noiseHit(o, t + 0.05, { type: "lowpass", f: 600, peak: 0.4, attack: 0.002, decay: 0.1, brown: true });
  }
  s_bite(t, I, pan) {
    const o = this.#out(t, { gain: 0.85 * I, pan, wet: 0.12 });
    this.#noiseHit(o, t + 0.12, { type: "highpass", f: 1800, peak: 0.7, attack: 0.001, decay: 0.03 });
    this.#noiseHit(o, t + 0.15, { type: "highpass", f: 1400, peak: 0.6, attack: 0.001, decay: 0.03 });
    const c = this.#crunch(o, 6);
    this.#noiseHit(c, t + 0.15, { type: "lowpass", f: 800, peak: 0.6, attack: 0.001, decay: 0.18, brown: true });
  }
  s_arrow(t, I, pan) {
    const o = this.#out(t, { gain: 1.2 * I, pan, wet: 0.15 });
    this.#tone(o, t, { type: "triangle", f: 180, f1: 170, peak: 0.25, attack: 0.002, decay: 0.25 });
    this.#noiseHit(o, t + 0.02, { type: "bandpass", f: [2500, 900], q: 3, peak: 0.35, attack: 0.02, decay: 0.3 });
    this.#noiseHit(o, t + 0.36, { type: "bandpass", f: 600, q: 2, peak: 0.7, attack: 0.001, decay: 0.08 });
    this.#tone(o, t + 0.36, { f: 220, f1: 150, peak: 0.35, attack: 0.001, decay: 0.12 });
  }
  s_crossbow(t, I, pan) {
    const o = this.#out(t, { gain: 2.21 * I, pan, wet: 0.15 });
    this.#tone(o, t, { type: "sawtooth", f: 140, f1: 110, peak: 0.3, attack: 0.001, decay: 0.12 });
    this.#noiseHit(o, t, { type: "highpass", f: 2200, peak: 0.6, attack: 0.0005, decay: 0.02 });
    this.#noiseHit(o, t + 0.01, { type: "bandpass", f: [3500, 1500], q: 3, peak: 0.3, attack: 0.01, decay: 0.12 });
    this.#noiseHit(o, t + 0.16, { type: "bandpass", f: 700, q: 2, peak: 0.75, attack: 0.001, decay: 0.07 });
  }
  s_sling(t, I, pan) {
    const o = this.#out(t, { gain: 2.08 * I, pan, wet: 0.15 });
    for (let i = 0; i < 3; i++) this.#noiseHit(o, t + i * 0.09, { type: "bandpass", f: [500, 1300], q: 2.5, peak: 0.3, attack: 0.04, decay: 0.04 });
    this.#noiseHit(o, t + 0.55, { type: "lowpass", f: 900, peak: 0.8, attack: 0.001, decay: 0.12, brown: true });
    this.#rattle(o, t + 0.56, { count: 6, spread: 0.25, f: [800, 2200], peak: 0.15, decay: 0.03 });
  }
  s_firearm(t, I, pan) {
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.5 });
    const c = this.#crunch(o, 8);
    this.#noiseHit(c, t, { type: "highpass", f: 1200, peak: 1, attack: 0.0005, decay: 0.05 });
    this.#noiseHit(c, t, { type: "lowpass", f: [3000, 200], peak: 1, attack: 0.001, decay: 0.6, brown: true });
    this.#tone(c, t, { f: 70, f1: 35, peak: 0.8, attack: 0.001, decay: 0.35 });
    this.#noiseHit(o, t + 0.08, { type: "lowpass", f: 900, peak: 0.25, attack: 0.05, decay: 1.4, brown: true });
  }
  s_thrown(t, I, pan) {
    const o = this.#out(t, { gain: 1.96 * I, pan, wet: 0.12 });
    for (let i = 0; i < 5; i++) this.#noiseHit(o, t + i * 0.085, { type: "bandpass", f: [1500, 3000], q: 3, peak: 0.25 + i * 0.05, attack: 0.03, decay: 0.035 });
    this.#noiseHit(o, t + 0.45, { type: "bandpass", f: 800, q: 1.5, peak: 0.6, attack: 0.001, decay: 0.08 });
    this.#ring(o, t + 0.45, 1100, 0.07, 0.35);
  }
  s_bomb(t, I, pan) {
    const o = this.#out(t, { gain: 0.9 * I, pan, wet: 0.35 });
    for (let i = 0; i < 6; i++) this.#tone(o, t + 0.4 + rand(0, 0.03), { f: rand(2500, 6000), peak: 0.08, attack: 0.001, decay: rand(0.2, 0.5) });
    this.#noiseHit(o, t + 0.4, { type: "highpass", f: 3000, peak: 0.5, attack: 0.001, decay: 0.15 });
    this.#noiseHit(o, t + 0.42, { type: "lowpass", f: [2500, 300], peak: 0.7, attack: 0.005, decay: 0.5 });
  }

  // Elements and spells --------------------------------------------------
  s_fireball(t, I, pan) {
    // Gathering, the bead's flight, then the blast and the roar of the fire
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.45 });
    this.#noiseHit(o, t, { type: "lowpass", f: [300, 1400], peak: 0.35, attack: 0.5, decay: 0.08, brown: true });
    this.#noiseHit(o, t + 0.55, { type: "bandpass", f: [400, 2000], q: 1, peak: 0.4, attack: 0.45, decay: 0.05 });
    const T = t + 1.05;
    const c = this.#crunch(o, 4);
    this.#tone(c, T, { f: 65, f1: 28, peak: 1, attack: 0.003, decay: 1.2 });
    this.#noiseHit(c, T, { type: "lowpass", f: [4000, 180], peak: 1, attack: 0.004, decay: 1.6, brown: true });
    this.#noiseHit(o, T + 0.05, { type: "lowpass", f: 1200, peak: 0.35, attack: 0.2, decay: 1.8, hold: 0.4 });
    this.#rattle(o, T + 0.1, { count: 40, spread: 2.2, f: [1500, 5000], peak: 0.1, decay: 0.012, curve: 1.3 });
  }
  s_fire(t, I, pan) {
    const o = this.#out(t, { gain: 0.9 * I, pan, wet: 0.3 });
    this.#noiseHit(o, t, { type: "lowpass", f: [600, 1600], peak: 0.6, attack: 0.15, decay: 0.9, hold: 0.6, brown: true });
    this.#noiseHit(o, t, { type: "bandpass", f: 900, q: 0.8, peak: 0.25, attack: 0.2, decay: 1, hold: 0.5 });
    this.#rattle(o, t + 0.1, { count: 45, spread: 1.8, f: [1800, 6000], peak: 0.12, decay: 0.01, curve: 1 });
  }
  s_cold(t, I, pan) {
    const o = this.#out(t, { gain: 0.8 * I, pan, wet: 0.5 });
    this.#noiseHit(o, t, { type: "highpass", f: [2500, 5000], peak: 0.3, attack: 0.1, decay: 0.7, hold: 0.3 });
    for (let i = 0; i < 26; i++) this.#tone(o, t + rand(0, 1.2), { f: rand(2600, 7000), peak: rand(0.03, 0.08), attack: 0.001, decay: rand(0.15, 0.6) });
    this.#rattle(o, t + 0.3, { count: 18, spread: 0.9, f: [3000, 8000], peak: 0.12, decay: 0.015 });
  }
  s_lightning(t, I, pan) {
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.55 });
    const c = this.#crunch(o, 10);
    this.#noiseHit(c, t, { type: "highpass", f: 800, peak: 1, attack: 0.0005, decay: 0.08 });
    for (let i = 0; i < 6; i++) this.#noiseHit(c, t + rand(0.01, 0.18), { type: "highpass", f: rand(1500, 4000), peak: rand(0.4, 0.8), attack: 0.0005, decay: 0.025 });
    this.#tone(o, t, { type: "sawtooth", f: 60, peak: 0.15, attack: 0.001, decay: 0.3 });
    this.#noiseHit(o, t + 0.12, { type: "lowpass", f: [500, 60], peak: 0.8, attack: 0.08, decay: 2.2, brown: true });
  }
  s_acid(t, I, pan) {
    const o = this.#out(t, { gain: 0.8 * I, pan, wet: 0.25 });
    this.#noiseHit(o, t, { type: "highpass", f: [3500, 6000], peak: 0.4, attack: 0.03, decay: 1.2, hold: 0.3 });
    for (let i = 0; i < 18; i++) this.#tone(o, t + rand(0.05, 1.3), { f: rand(300, 900), f1: rand(900, 1600), peak: 0.05, attack: 0.005, decay: 0.05 });
    this.#noiseHit(o, t, { type: "lowpass", f: 500, peak: 0.4, attack: 0.002, decay: 0.2, brown: true });
  }
  s_sonic(t, I, pan) {
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.6 });
    const c = this.#crunch(o, 6);
    this.#tone(c, t, { f: 55, f1: 40, peak: 1, attack: 0.002, decay: 0.9 });
    this.#noiseHit(c, t, { type: "lowpass", f: [1500, 120], peak: 0.8, attack: 0.002, decay: 0.8, brown: true });
    this.#tone(o, t, { type: "triangle", f: 880, f1: 600, peak: 0.12, attack: 0.002, decay: 0.6 });
  }
  s_force(t, I, pan) {
    const o = this.#out(t, { gain: 0.8 * I, pan, wet: 0.4 });
    this.#tone(o, t, { type: "sine", f: 220, f1: 880, peak: 0.25, attack: 0.15, decay: 0.05 });
    this.#tone(o, t + 0.2, { f: 160, f1: 80, peak: 0.8, attack: 0.002, decay: 0.35 });
    this.#tone(o, t + 0.2, { type: "triangle", f: 1320, peak: 0.1, attack: 0.002, decay: 0.5 });
    this.#noiseHit(o, t + 0.2, { type: "bandpass", f: 1500, q: 1, peak: 0.3, attack: 0.001, decay: 0.1 });
  }
  s_poison(t, I, pan) {
    const o = this.#out(t, { gain: 2.4 * I, pan, wet: 0.4 });
    this.#noiseHit(o, t, { type: "bandpass", f: [400, 900], q: 0.8, peak: 0.35, attack: 0.4, decay: 1.4, hold: 0.4, brown: true });
    for (let i = 0; i < 10; i++) this.#tone(o, t + rand(0.1, 1.5), { f: rand(120, 260), f1: rand(260, 500), peak: 0.06, attack: 0.02, decay: 0.12 });
  }
  s_heal(t, I, pan) {
    const o = this.#out(t, { gain: 0.96 * I, pan, wet: 0.6 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.#tone(o, t + i * 0.09, { type: "sine", f, peak: 0.18, attack: 0.05, decay: 1.2 }));
    this.#noiseHit(o, t, { type: "highpass", f: 6000, peak: 0.08, attack: 0.3, decay: 0.8 });
  }
  s_void(t, I, pan) {
    const o = this.#out(t, { gain: 1.53 * I, pan, wet: 0.6 });
    this.#tone(o, t, { type: "sawtooth", f: 55, f1: 38, peak: 0.18, attack: 0.3, decay: 1.2 });
    this.#tone(o, t, { type: "sawtooth", f: 55.8, f1: 37, peak: 0.18, attack: 0.3, decay: 1.2 });
    this.#noiseHit(o, t, { type: "lowpass", f: [1500, 200], peak: 0.35, attack: 0.6, decay: 0.8, brown: true });
  }

  // Casting circles, by tradition --------------------------------------
  #chord(t, I, pan, notes, type, wet = 0.6) {
    const o = this.#out(t, { gain: 0.5 * I, pan, wet });
    notes.forEach((f, i) => { this.#tone(o, t + i * 0.04, { type, f, peak: 0.16, attack: 0.25, decay: 1.4, hold: 0.2 }); this.#tone(o, t + i * 0.04, { type, f: f * 1.004, peak: 0.08, attack: 0.3, decay: 1.4 }); });
    return o;
  }
  s_cast_arcane(t, I, pan) { const o = this.#chord(t, I, pan, [392, 587.33, 880], "triangle"); this.#ring(o, t + 0.5, 1568, 0.05, 1.6); }
  s_cast_divine(t, I, pan) { this.#chord(t, I, pan, [261.63, 329.63, 392, 523.25], "sine", 0.8); }
  s_cast_occult(t, I, pan) { const o = this.#chord(t, I, pan, [220, 233.08, 329.63], "sawtooth", 0.7); this.#noiseHit(o, t, { type: "bandpass", f: [300, 1200], q: 4, peak: 0.12, attack: 0.6, decay: 0.8 }); }
  s_cast_primal(t, I, pan) {
    const o = this.#chord(t, I, pan, [196, 293.66, 392], "triangle", 0.5);
    this.#noiseHit(o, t, { type: "bandpass", f: [600, 1400], q: 1, peak: 0.12, attack: 0.5, decay: 0.8 });
    for (let i = 0; i < 8; i++) this.#noiseHit(o, t + rand(0.1, 1), { type: "bandpass", f: rand(2000, 4000), q: 5, peak: 0.05, attack: 0.001, decay: 0.04 });
  }

  // Walls -----------------------------------------------------------------
  s_wall_stone(t, I, pan) {
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.45 });
    const c = this.#crunch(o, 5);
    this.#noiseHit(c, t, { type: "highpass", f: 1500, peak: 0.6, attack: 0.001, decay: 0.08 });
    this.#tone(c, t + 0.05, { f: 70, f1: 30, peak: 0.9, attack: 0.003, decay: 0.9 });
    this.#noiseHit(c, t + 0.05, { type: "lowpass", f: [1600, 120], peak: 0.9, attack: 0.01, decay: 1.4, brown: true });
    this.#rattle(o, t + 0.25, { count: 55, spread: 1.6, f: [300, 2400], peak: 0.3, decay: 0.06, curve: 1.8 });
  }
  s_wall_wood(t, I, pan) {
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.35 });
    this.#tone(o, t, { type: "sawtooth", f: 180, f1: 70, peak: 0.25, attack: 0.05, decay: 0.3 });
    const c = this.#crunch(o, 6);
    this.#noiseHit(c, t + 0.1, { type: "bandpass", f: 1400, q: 1.5, peak: 0.9, attack: 0.001, decay: 0.12 });
    this.#tone(c, t + 0.1, { f: 110, f1: 45, peak: 0.7, attack: 0.002, decay: 0.4 });
    this.#rattle(o, t + 0.15, { count: 40, spread: 1.1, f: [900, 3500], peak: 0.22, decay: 0.03 });
  }
  s_wall_metal(t, I, pan) {
    const o = this.#out(t, { gain: 1 * I, pan, wet: 0.5 });
    this.#ring(o, t, 196, 0.3 * I, 2.2);
    this.#ring(o, t + 0.12, 277, 0.2 * I, 1.6);
    this.#noiseHit(o, t, { type: "lowpass", f: [1200, 150], peak: 0.7, attack: 0.002, decay: 0.8, brown: true });
    this.#rattle(o, t + 0.2, { count: 25, spread: 1.2, f: [1500, 5000], peak: 0.15, decay: 0.08 });
  }
  s_wall_glass(t, I, pan) {
    const o = this.#out(t, { gain: 1.62 * I, pan, wet: 0.45 });
    this.#noiseHit(o, t, { type: "highpass", f: 3000, peak: 0.8, attack: 0.0005, decay: 0.12 });
    for (let i = 0; i < 40; i++) this.#tone(o, t + Math.pow(Math.random(), 1.7) * 1.2, { f: rand(2000, 7500), peak: rand(0.04, 0.12), attack: 0.001, decay: rand(0.08, 0.4) });
  }
  s_wall_rebuild(t, I, pan) {
    const o = this.#out(t, { gain: 0.8 * I, pan, wet: 0.5 });
    // The rubble rattles back together, then the seam closes with a soft chime
    this.#rattle(o, t, { count: 40, spread: 1.0, f: [400, 2500], peak: 0.18, decay: 0.04, curve: 0.6 });
    this.#noiseHit(o, t, { type: "lowpass", f: [200, 1400], peak: 0.4, attack: 0.9, decay: 0.15, brown: true });
    this.#tone(o, t + 1.0, { f: 80, f1: 60, peak: 0.6, attack: 0.002, decay: 0.3 });
    [659.25, 987.77].forEach((f, i) => this.#tone(o, t + 1.02 + i * 0.05, { f, peak: 0.1, attack: 0.01, decay: 1.2 }));
  }
}
