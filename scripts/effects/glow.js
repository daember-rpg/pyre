import * as THREE from "../vendor/three.js";
import { MODULE_ID } from "../constants.js";
import * as GL from "../core/shaders-lab.js";
import { FLOOR_FS } from "../core/shaders-pyre.js";
import { quad, material, setBlend, disposeGroup } from "../core/layers.js";
import { clamp, smoothstep, v3, linear } from "../core/util.js";
import { TRADITIONS } from "../data/glow.js";

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }
const QK = { low: 0.5, medium: 1, high: 1.6 };
const PLANE = new THREE.PlaneGeometry(1, 1);

function moteLayer(group, max, seed, noise) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = PLANE.index;
  geo.setAttribute("position", PLANE.getAttribute("position"));
  geo.setAttribute("uv", PLANE.getAttribute("uv"));
  const s = new Float32Array(max * 4);
  let a = seed;
  for (let i = 0; i < s.length; i++) { a = (a * 16807) % 2147483647; s[i] = a / 2147483647; }
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(s, 4));
  geo.instanceCount = 0;
  const mat = material(GL.MOTE_VS, GL.MOTE_FS, {
    uT: { value: -1 }, uMode: { value: 0 }, uR: { value: 2 }, uTravel: { value: 0.4 }, uLife: { value: 1 }, uSize: { value: 0.3 },
    uArc: { value: 1 }, uClock: { value: 0 }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uGain: { value: 1 },
    uCore: { value: new THREE.Vector3(1, 1, 1) }, uGlow: { value: new THREE.Vector3(1, 1, 1) },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  group.add(mesh);
  return { mesh, geo, mat, u: mat.uniforms };
}

/**
 * Cast glow for spells without damage (the Cast Glow Lab engine).
 * req = { intent: buff | debuff | self | teleport | summon | arrive, tradition, color: {core, glow} | null,
 *         outcome: affected | resisted | hidden, caster: {token, ft, r}, target: {token, ft, r} | null,
 *         arrive: { token, ft, r } (summoned creature), look: { intensity, pace } }
 */
export class GlowEffect {
  constructor(overlay, tokenFx, req) {
    this.o = overlay; this.fx = tokenFx; this.req = req;
    this.group = new THREE.Group();
    overlay.scene.add(this.group);
    this.pace = req.look?.pace ?? 1;
    this.I = (req.look?.intensity ?? 1) * setting("intensity", 1);
    const T = TRADITIONS[req.tradition] ?? TRADITIONS.arcane;
    this.core = req.color ? linear(req.color.core) : T.core;
    this.glow = req.color ? linear(req.color.glow) : T.glow;
    this.style = T.style;
    this.clock = 0; this.hitstop = 0;
    this.released = false; this.arrived = false; this.shatterAt = null;
    this.ringSpecs = [];
    this.#plan();
    this.#build();
    // The casting circle and the floor light lie beneath the tokens
    this.under = new THREE.Group();
    overlay.underScene().add(this.under);
    for (const m of [...this.sigils, this.floor]) this.under.add(m);
    this.elevation = (req.caster ?? req.target ?? req.arrive)?.token?.document?.elevation ?? 0;
  }

  #plan() {
    const r = this.req, pace = 1 / this.pace;
    this.release = 0.45 * pace;
    const c = r.caster;
    if (r.intent === "arrive") {
      // Summon arrival: the circle opens under the new creature first, then it appears.
      this.release = 0.1; this.travel = c && r.arrive ? clamp(c.ft.distanceTo(r.arrive.ft) / 60, 0.2, 0.6) * pace : 0;
      this.arriveT = 0.45 * pace;
      this.end = this.arriveT + 1.9 * pace;
    } else if ((r.intent === "buff" || r.intent === "debuff") && r.target && c) {
      this.travel = clamp(c.ft.distanceTo(r.target.ft) / 45, 0.25, 0.7) * pace;
      this.arriveT = this.release + this.travel;
      this.end = this.arriveT + 1.7 * pace;
    } else {
      this.travel = 0; this.arriveT = 0.55 * pace; this.end = 2.2 * pace;
    }
  }

  #build() {
    const g = this.group, noise = this.o.noise, q = (QK[setting("quality", "high")] ?? 1);
    const sigU = () => ({ uNoise: { value: noise }, uStyle: { value: this.style }, uReveal: { value: 0 }, uAlpha: { value: 0 }, uClock: { value: 0 },
      uSpin: { value: 1 }, uCore: { value: new THREE.Vector3(...this.core) }, uGlow: { value: new THREE.Vector3(...this.glow) } });
    this.sigils = [quad(g, GL.WORLD_VS, GL.SIGIL_FS, sigU(), { order: 0.4 }), quad(g, GL.WORLD_VS, GL.SIGIL_FS, sigU(), { order: 0.4 })];
    this.motes = { caster: moteLayer(g, 900, 3, noise), stream: moteLayer(g, 900, 5, noise), target: moteLayer(g, 1200, 7, noise), burst: moteLayer(g, 900, 9, noise) };
    for (const m of Object.values(this.motes)) { v3(m.u.uCore, this.core); v3(m.u.uGlow, this.glow); }
    const r = this.req;
    if (r.intent === "debuff") { v3(this.motes.target.u.uCore, this.core.map((v) => v * 0.7)); v3(this.motes.target.u.uGlow, this.glow.map((v) => v * 0.6)); }
    this.motes.caster.geo.instanceCount = r.caster && r.intent !== "arrive" ? Math.round(160 * q) : 0;
    this.motes.stream.geo.instanceCount = this.travel > 0 && r.caster ? Math.round(240 * q) : 0;
    this.motes.target.geo.instanceCount = Math.round((r.intent === "arrive" ? 420 : 280) * q);
    this.rings = Array.from({ length: 6 }, () => quad(g, GL.WORLD_VS, GL.GLOW_RING_FS, { uC: { value: new THREE.Vector2() }, uR: { value: 1 },
      uW: { value: 0.3 }, uA: { value: 0 }, uDarkR: { value: 0 }, uSeg: { value: 0 }, uClock: { value: 0 }, uCol: { value: new THREE.Vector3(1, 1, 1) } }, { order: 3.5 }));
    // Light on the floor
    const U = this.U = { uTime: { value: 100 }, uEmit: { value: 0.8 }, uLength: { value: 4 }, uHalfAng: { value: 0 }, uHalfTan: { value: 0 }, uLineWidth: { value: 0 },
      uMode: { value: 2 }, uTurb: { value: 0.8 }, uSize: { value: 1 }, uSeedOff: { value: 0 }, uEdgeNoise: { value: 1 },
      uOrigin: { value: new THREE.Vector2(9e5, 9e5) }, uDir: { value: new THREE.Vector2(1, 0) }, uNoise: { value: noise } };
    this.floor = quad(g, GL.WORLD_VS, FLOOR_FS, { ...U, uLightColor: { value: new THREE.Vector3(...this.glow) }, uDecalColor: { value: new THREE.Vector3() },
      uLightGain: { value: 0.5 * this.I }, uDecalMode: { value: 9 }, uProjOn: { value: 0 }, uProjPos: { value: new THREE.Vector2(9e5, 9e5) }, uDecalFade: { value: 1 } },
    { blend: "premult", order: 0.2, visible: true });
    const center = r.caster?.ft ?? r.target?.ft ?? r.arrive?.ft;
    this.floor.position.set(center.x, center.y, 0);
    this.floor.scale.set(120, 120, 1);
  }

  #dest() {
    const r = this.req;
    if (r.intent === "arrive") return r.arrive;
    if (r.intent === "buff" || r.intent === "debuff") return r.target;
    return r.caster;
  }

  #onRelease() {
    this.released = true;
    const c = this.req.caster;
    if (c?.token) this.fx.pulse(c.token, 1.08);
    if (this.req.intent === "arrive") this.req.onReveal?.(this.arriveT, this.pace);
  }

  #onArrive() {
    this.arrived = true;
    const r = this.req, I = this.I, glow = this.glow, core = this.core;
    const t = this.#dest();
    if (!t) return;
    if (r.intent === "buff") {
      this.fx.pulse(t.token, 0.9, 0.55 * I, glow.map((v) => v * 1.4));
      this.ringSpecs.push({ c: t.ft, t0: this.clock, dur: 0.9, r0: t.r * 1.9, r1: t.r * 1.15, w: 0.35, a: 1.2 * I, col: glow, lift: 2.2 });
      this.ringSpecs.push({ c: t.ft, t0: this.clock + 0.15, dur: 0.9, r0: t.r * 2.3, r1: t.r * 1.3, w: 0.25, a: 0.7 * I, col: core, lift: 3.0 });
      this.o.punch({ zoom: 0.008, at: t.ft });
    } else if (r.intent === "debuff") {
      const resisted = r.outcome === "resisted", hidden = r.outcome === "hidden";
      this.ringSpecs.push({ c: t.ft, t0: this.clock, dur: 0.8, r0: t.r * 2.6, r1: t.r * (resisted ? 1.5 : 1.05), w: Math.min(0.5, 0.18 + t.r * 0.03), a: 1.1 * I, col: glow, seg: 14, spin: true });
      if (!hidden) this.ringSpecs.push({ c: t.ft, t0: this.clock, dur: 1.0, r0: t.r * 2.2, r1: t.r, w: 0.9, a: 0.55, col: [0.04, 0.02, 0.06], dark: true });
      if (resisted) this.shatterAt = this.clock + 0.45 / this.pace;
      else if (!hidden) {
        this.fx.react(t.token, new THREE.Vector2(0, 0), 0.6, { flash: 0.6 * I, flashCol: [0.08, 0.03, 0.12], dark: true, spin: false });
        this.hitstop = 0.05;
        this.o.punch({ zoom: 0.015, at: t.ft });
      } else this.fx.pulse(t.token, 0.95, 0.35 * I, glow.map((v) => v * 1.2));
    } else if (r.intent === "arrive") {
      for (let i = 0; i < 4; i++) this.ringSpecs.push({ c: t.ft, t0: this.clock + i * 0.12, dur: 1.0, r0: t.r * 1.6, r1: t.r * 1.35, w: 0.22, a: 0.8 * I, col: i % 2 ? core : glow, lift: 5 + i * 1.5 });
      this.o.punch({ zoom: 0.012, at: t.ft });
    } else {
      // self, teleport, summon cast without a destination: the glow stays on the caster
      this.fx.pulse(t.token, 0.92, 0.45 * I, glow.map((v) => v * 1.4));
      this.ringSpecs.push({ c: t.ft, t0: this.clock, dur: 0.8, r0: t.r * 1.2, r1: t.r * 2.6, w: 0.3, a: 1.0 * I, col: glow });
      if (r.intent === "teleport") {
        const mb = this.motes.burst;
        mb.u.uB.value.copy(t.ft); mb.u.uR.value = t.r; mb.u.uMode.value = 1; mb.u.uLife.value = 0.5;
        mb.geo.instanceCount = Math.round(260 * (QK[setting("quality", "high")] ?? 1));
        mb.t0 = this.clock;
      }
    }
  }

  #shatter() {
    const t = this.#dest();
    this.shatterAt = null;
    if (!t) return;
    const mb = this.motes.burst;
    mb.u.uB.value.copy(t.ft); mb.u.uR.value = t.r * 1.2; mb.u.uMode.value = 3; mb.u.uLife.value = 0.6;
    v3(mb.u.uCore, [1, 1, 1]); v3(mb.u.uGlow, this.glow);
    mb.geo.instanceCount = Math.round(220 * (QK[setting("quality", "high")] ?? 1));
    mb.t0 = this.clock;
    this.ringSpecs.push({ c: t.ft, t0: this.clock, dur: 0.4, r0: t.r * 1.5, r1: t.r * 3.2, w: 0.25, a: 1.1, col: [1, 1, 1] });
    this.fx.react(t.token, new THREE.Vector2(1, 0), 0.35, { flash: 0.5, flashCol: [1, 1, 1] });
    this.o.punch({ shake: 0.06, at: t.ft });
  }

  update(dt, now) {
    let tScale = 1;
    if (this.hitstop > 0) { this.hitstop -= dt; tScale = 0; }
    this.clock += dt * tScale;
    const T = this.clock, pace = this.pace, I = this.I, r = this.req, clock = now;
    if (!this.released && T >= this.release) this.#onRelease();
    if (!this.arrived && T >= this.arriveT) this.#onArrive();
    if (this.shatterAt !== null && T >= this.shatterAt) this.#shatter();
    const c = r.caster, dest = this.#dest();
    const size = setting("circleSize", 1);

    // Caster circle
    const s0 = this.sigils[0], su = s0.material.uniforms;
    const sigOn = c && r.intent !== "arrive" && T < this.arriveT + 0.9 / pace;
    s0.visible = !!sigOn;
    if (sigOn) {
      su.uReveal.value = smoothstep(0, 0.42 / pace, T);
      su.uAlpha.value = I * (1 - smoothstep(this.arriveT + 0.2 / pace, this.arriveT + 0.9 / pace, T)) * (0.6 + 0.4 * smoothstep(0, 0.2, T));
      su.uClock.value = clock;
      s0.position.set(c.ft.x, c.ft.y, 0);
      const sz = c.r * 2 * 3.2 * size * (1 + 0.04 * Math.sin(clock * 3));
      s0.scale.set(sz, sz, 1);
    }
    // Summon circle under the new creature
    const s1 = this.sigils[1], s1u = s1.material.uniforms;
    const second = r.intent === "arrive" && T < this.end;
    s1.visible = second;
    if (second) {
      s1u.uReveal.value = smoothstep(0, 0.4 / pace, T);
      s1u.uAlpha.value = I * 1.1 * (1 - smoothstep(this.end - 0.6 / pace, this.end, T));
      s1u.uClock.value = clock * 1.6;
      s1.position.set(r.arrive.ft.x, r.arrive.ft.y, 0);
      const sz = r.arrive.r * 2 * 2.6 * size;
      s1.scale.set(sz, sz, 1);
    }

    // Motes
    const mc = this.motes.caster.u;
    mc.uT.value = T; mc.uMode.value = 0; mc.uR.value = c ? c.r * 0.9 : 2; mc.uLife.value = 0.9 / pace; mc.uSize.value = 0.32;
    if (c) mc.uB.value.copy(c.ft);
    mc.uClock.value = clock; mc.uGain.value = I * (T < this.arriveT + 0.4 ? 1 : 1 - smoothstep(this.arriveT + 0.4, this.arriveT + 1, T));
    const ms = this.motes.stream.u;
    ms.uT.value = T - this.release; ms.uMode.value = 2; ms.uTravel.value = Math.max(0.05, this.travel); ms.uLife.value = this.travel + 0.35;
    ms.uSize.value = 0.38; ms.uClock.value = clock; ms.uGain.value = I;
    if (c && dest) { ms.uA.value.copy(c.ft); ms.uB.value.copy(dest.ft); ms.uArc.value = r.intent === "debuff" ? -1.6 : 1.6; }
    const mt = this.motes.target.u;
    mt.uT.value = T - this.arriveT; mt.uClock.value = clock;
    if (dest) {
      if (r.intent === "debuff") { mt.uMode.value = 1; mt.uLife.value = 0.8 / pace; mt.uSize.value = 0.3; mt.uGain.value = I * (r.outcome === "hidden" ? 0.6 : 1); }
      else if (r.intent === "arrive") { mt.uMode.value = 0; mt.uLife.value = 1.3 / pace; mt.uSize.value = 0.36; mt.uGain.value = I; mt.uT.value = T - 0.1; }
      else { mt.uMode.value = 0; mt.uLife.value = 1.1 / pace; mt.uSize.value = 0.32; mt.uGain.value = I; }
      mt.uR.value = dest.r * (r.intent === "arrive" ? 1.4 : 1);
      mt.uB.value.copy(dest.ft);
    }
    const mb = this.motes.burst;
    mb.u.uT.value = mb.t0 !== undefined ? T - mb.t0 : -1; mb.u.uClock.value = clock; mb.u.uGain.value = I; mb.u.uSize.value = 0.3;

    // Rings
    this.rings.forEach((m, i) => {
      const s = this.ringSpecs[i];
      if (!s) { m.visible = false; return; }
      const t = (T - s.t0) * pace;
      if (t < 0 || t > s.dur) { m.visible = false; return; }
      const f = t / s.dur, ease = 1 - Math.pow(1 - f, 3);
      const u = m.material.uniforms;
      const cy = s.c.y + (s.lift || 0) * ease;
      u.uC.value.set(s.c.x, cy);
      u.uR.value = s.r0 + (s.r1 - s.r0) * ease; u.uW.value = s.w;
      u.uA.value = s.a * (f < 0.15 ? f / 0.15 : 1 - smoothstep(0.55, 1, f));
      u.uDarkR.value = s.dark ? 1 : 0; u.uSeg.value = s.seg || 0; u.uClock.value = s.spin ? clock : 0;
      u.uCol.value.set(s.col[0], s.col[1], s.col[2]);
      if (m.userData.dark !== !!s.dark) { setBlend(m.material, s.dark ? "normal" : "add"); m.userData.dark = !!s.dark; }
      m.visible = true;
      m.position.set(s.c.x, cy, 0);
      const sz = (Math.max(s.r0, s.r1) + s.w * 4) * 2.2;
      m.scale.set(sz, sz, 1);
    });

    // Floor light: on the caster while the circle draws, then at the destination
    const mu = this.floor.material.uniforms;
    if (c && T < this.arriveT + 0.9 / pace && r.intent !== "arrive") {
      const head = this.travel > 0 && T > this.release && T < this.arriveT ? (T - this.release) / this.travel : null;
      if (head !== null && dest) mu.uProjPos.value.set(c.ft.x + (dest.ft.x - c.ft.x) * head, c.ft.y + (dest.ft.y - c.ft.y) * head);
      else mu.uProjPos.value.copy(c.ft);
      mu.uProjOn.value = 0.55 * I * (1 - smoothstep(this.arriveT + 0.2, this.arriveT + 0.9 / pace, T));
    } else mu.uProjOn.value = 0;
    if (dest && this.arrived) {
      this.U.uOrigin.value.copy(dest.ft);
      this.U.uLength.value = r.intent === "arrive" ? 7 : 4;
      this.U.uTime.value = T - this.arriveT;
      this.U.uEmit.value = (r.intent === "arrive" ? 1.2 : 0.7) / pace;
      mu.uLightGain.value = (r.intent === "debuff" ? 0.25 : 0.5) * I;
    }
    return T < this.end + 0.9;
  }

  dispose() { disposeGroup(this.under); disposeGroup(this.group); }
}
