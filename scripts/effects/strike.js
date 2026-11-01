import * as THREE from "../vendor/three.js";
import { MODULE_ID } from "../constants.js";
import * as GL from "../core/shaders-lab.js";
import { CUT_FS, FLOOR_FS, GHOST_FS, MARK_FS } from "../core/shaders-pyre.js";
import { particles, quad, material, setBlend, disposeGroup } from "../core/layers.js";
import { clamp, smoothstep, v3, mulberry32 } from "../core/util.js";
import { WEAPONS, PALETTES, RUNES, BOMBS, BOMB_SIZE, STRIKING_WEIGHT } from "../data/strikes.js";

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }
const QK = { low: 0.5, medium: 1, high: 1.6 };
const texCache = new Map();
function tokenTexture(src) {
  if (!src) return null;
  if (!texCache.has(src)) {
    const t = new THREE.TextureLoader().load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(src, t);
  }
  return texCache.get(src);
}

/**
 * Weapon strike (the Strike Lab engine).
 * req = { weapon, runes: [{id, greater}], potency, striking, bomb, bombLevel, flurry,
 *         outcome: hit | crit | miss | hidden,
 *         attacker: { token, ft, r }, target: { token, ft, r }, nearby: [{token, ft, r}], seed, look }
 */
export class StrikeEffect {
  constructor(overlay, tokenFx, req) {
    this.o = overlay; this.fx = tokenFx; this.req = req;
    this.look = { hitstop: 70, knockback: 1, flash: 0.6, punch: 0.8, intensity: 1, ...(req.look ?? {}) };
    this.group = new THREE.Group();
    overlay.scene.add(this.group);
    this.rnd = mulberry32(req.seed ?? 1);
    this.clock = 0; this.hitstop = 0; this.arcTimer = 0; this.arcSeed = req.seed ?? 1;
    this.history = [];
    this.#plan();
    this.#build();
    this.#looks();
    this.#events();
    // Floor light and marks, dust and smoke, and the speed rune's afterimages lie beneath the tokens
    this.under = new THREE.Group();
    overlay.underScene().add(this.under);
    for (const m of [this.floor, this.mark, this.dust.mesh, this.muzzle.mesh, ...this.ghosts]) this.under.add(m);
    this.elevation = req.attacker?.token?.document?.elevation ?? 0;
  }

  #runes() {
    const r = this.req;
    if (r.weapon === "bomb") {
      const id = (BOMBS[r.bomb] ?? BOMBS.fire).rune;
      return [{ id, rune: RUNES[id], greater: (r.bombLevel ?? 1) >= 2, bomb: true }];
    }
    return (r.runes ?? []).filter((x) => RUNES[x.id]).slice(0, 2).map((x) => ({ ...x, rune: RUNES[x.id] }));
  }

  #plan() {
    const r = this.req, W = this.W = WEAPONS[r.weapon] ?? WEAPONS.longsword;
    const a = r.attacker, t = r.target;
    const plan = this.plan = {};
    plan.dir = t.ft.clone().sub(a.ft).normalize();
    plan.miss = r.outcome === "miss"; plan.crit = r.outcome === "crit"; plan.neutral = r.outcome === "hidden";
    plan.weight = (W.style === "bomb" ? BOMB_SIZE[r.bombLevel ?? 1] : STRIKING_WEIGHT[r.striking ?? 0]) * (plan.crit ? 1.45 : 1);
    plan.impact2T = W.double ?? (W.style === "punch" && r.flurry ? 0.36 : null);
    plan.side = this.rnd() < 0.5 ? 1 : -1;
    plan.impact = t.ft.clone().addScaledVector(plan.dir, -t.r * 0.75);
    plan.from = a.ft.clone().addScaledVector(plan.dir, a.r);
    const perp = new THREE.Vector2(-plan.dir.y, plan.dir.x);
    if (W.style === "bomb") {
      plan.release = 0.2;
      plan.impact = t.ft.clone().addScaledVector(plan.dir, -t.r * 0.4);
      if (plan.miss) plan.impact = t.ft.clone().addScaledVector(perp, (t.r + 3) * plan.side);
      plan.travel = plan.from.distanceTo(plan.impact) / 45;
      plan.impactT = plan.release + plan.travel;
    } else if (W.ranged) {
      plan.release = 0.18;
      if (plan.miss) plan.impact = t.ft.clone().addScaledVector(plan.dir, t.r + 9).addScaledVector(perp, 3 * plan.side);
      plan.travel = Math.max(0.05, plan.from.distanceTo(plan.impact) / (W.speed ?? 130));
      plan.impactT = plan.release + plan.travel;
    } else {
      plan.travel = 0; plan.impactT = W.impactT ?? 0.2; plan.release = plan.impactT - 0.08;
      if (plan.miss) plan.impact.addScaledVector(perp, t.r * 0.9 * plan.side);
    }
    this.shown = W.style === "bomb" || !(plan.miss || plan.neutral);
  }

  #build() {
    const g = this.group, noise = this.o.noise, plan = this.plan;
    const U = this.U = {
      uTime: { value: -1 }, uEmit: { value: 0.15 }, uLength: { value: 4 }, uHalfAng: { value: 0 }, uHalfTan: { value: 0 }, uLineWidth: { value: 0 },
      uMode: { value: 2 }, uTurb: { value: 0.8 }, uSize: { value: 1.4 }, uSeedOff: { value: (this.req.seed ?? 1) % 300 }, uEdgeNoise: { value: 1 },
      uOrigin: { value: plan.impact.clone() }, uDir: { value: plan.dir.clone() }, uNoise: { value: noise },
    };
    const emberU = () => ({
      uLifeMin: { value: 0.5 }, uLifeMax: { value: 1.2 }, uEmberDrag: { value: 2 }, uEmberSpeed: { value: 1 }, uEmberSize: { value: 0.2 },
      uEmberStreak: { value: 0.04 }, uEmberMode: { value: 0 }, uEmberBurst: { value: 0 }, uEmberScatter: { value: 0 },
      uEmberColor: { value: new THREE.Vector3(1, 1, 1) }, uEmberGain: { value: 1 },
    });
    const makeC = () => ({ uC0: { value: new THREE.Vector3() }, uC1: { value: new THREE.Vector3() }, uC2: { value: new THREE.Vector3() },
      uC3: { value: new THREE.Vector3() }, uRim: { value: new THREE.Vector3() }, uDark: { value: 0 } });
    this.floor = quad(g, GL.WORLD_VS, FLOOR_FS, {
      ...U, uLightColor: { value: new THREE.Vector3(0.9, 0.85, 0.75) }, uDecalColor: { value: new THREE.Vector3() }, uLightGain: { value: 0.3 },
      uDecalMode: { value: 9 }, uProjOn: { value: 0 }, uProjPos: { value: new THREE.Vector2(9e5, 9e5) }, uDecalFade: { value: 1 },
    }, { blend: "premult", order: 0.2, visible: true });
    this.floor.position.set(plan.impact.x, plan.impact.y, 0);
    this.floor.scale.set(40, 40, 1);
    this.sparkLen = { value: 6 };
    this.sparks = particles(g, { max: 2600, seed: 51, vs: GL.EMBER_VS, fs: GL.EMBER_FS, order: 3, uniforms: {
      ...U, ...emberU(), uMode: { value: 0 }, uLength: this.sparkLen, uHalfAng: { value: 0.7 }, uHalfTan: { value: Math.tan(0.7) }, uEmit: { value: 0.05 } } });
    this.dustLen = { value: 3 };
    this.dust = particles(g, { max: 900, seed: 52, vs: GL.SMOKE_VS, fs: GL.SMOKE_FS, blend: "normal", order: 1, uniforms: {
      ...U, uLifeMin: { value: 0.6 }, uLifeMax: { value: 1.4 }, uWind: { value: new THREE.Vector2(0.4, 0.6) },
      uSmokeColor: { value: new THREE.Vector3(0.2, 0.17, 0.14) }, uSmokeGlow: { value: new THREE.Vector3(0.2, 0.17, 0.14) }, uSmokeGain: { value: 0.4 },
      uLength: this.dustLen, uEmit: { value: 0.1 }, uTurb: { value: 0.6 } } });
    this.slots = [0, 1].map((i) => {
      const C = makeC(), len = { value: 4 };
      const fire = particles(g, { max: 4200, seed: 61 + i, vs: GL.FIRE_VS, fs: GL.FIRE_FS, order: 2, uniforms: {
        ...U, ...C, uLifeMin: { value: 0.5 }, uLifeMax: { value: 0.85 }, uFireGain: { value: 0.04 }, uDarkAlpha: { value: 0.2 },
        uLength: len, uEmit: { value: 0.15 }, uTurb: { value: 0.8 } } });
      const emb = particles(g, { max: 3200, seed: 71 + i, vs: GL.EMBER_VS, fs: GL.EMBER_FS, order: 3, uniforms: {
        ...U, ...emberU(), uLength: len, uEmit: { value: 0.12 }, uMode: { value: 2 }, uHalfAng: { value: 0 }, uHalfTan: { value: 0 } } });
      return { C, len, fire, emb };
    });
    this.P = {
      uPT: { value: -1 }, uTravel: { value: plan.travel }, uTrailLife: { value: 0.35 }, uTrailWidth: { value: 0.25 }, uTrailSize: { value: 0.45 },
      uArc: { value: 0 }, uWobble: { value: 0 }, uWobbleFreq: { value: 1 }, uFrom: { value: plan.from.clone() }, uTo: { value: plan.impact.clone() },
    };
    this.trail = particles(g, { max: 1800, seed: 81, vs: GL.TRAIL_VS, fs: GL.FIRE_FS, order: 2, uniforms: {
      ...U, ...this.slots[0].C, ...this.P, uLifeMin: { value: 0 }, uLifeMax: { value: 0 }, uFireGain: { value: 0.12 }, uDarkAlpha: { value: 0.35 } } });
    this.smear = quad(g, GL.WORLD_VS, GL.SMEAR_FS, {
      uNoise: { value: noise }, uC: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) }, uMode: { value: 0 }, uT: { value: 0 },
      uR: { value: 5 }, uLen: { value: 5 }, uGain: { value: 1 }, uSide: { value: 1 },
      uSpan: { value: 1.35 }, uDur: { value: 0.17 }, uThick: { value: 2.6 }, uWave: { value: 0 }, uWidth: { value: 0.42 }, uFade: { value: 0.28 },
      uCore: { value: new THREE.Vector3(1, 0.97, 0.92) }, uTint: { value: new THREE.Vector3(1, 0.97, 0.92) } }, { order: 4 });
    // Ground mark (axe gash, pick crack), thrown blade, sling stone
    this.mark = quad(g, GL.WORLD_VS, MARK_FS, { uNoise: { value: noise }, uC: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) },
      uMode: { value: 0 }, uLen: { value: 5 }, uA: { value: 0 }, uSeed: { value: this.rnd() } }, { blend: "premult", order: 0.3 });
    this.mark.visible = false;
    this.blade = quad(g, GL.QUAD_VS, GL.BLADE_FS, { uCore: { value: new THREE.Vector3(0.85, 0.9, 1) }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: 1 } }, { order: 5 });
    this.stone = quad(g, GL.QUAD_VS, GL.STONE_FS, { uGain: { value: 1 } }, { blend: "premult", order: 5 });
    this.blade.visible = false; this.stone.visible = false;
    // Firearm: the smoke that hangs at the muzzle
    this.muzzleU = { ...U, uTime: { value: -1 }, uOrigin: { value: plan.from.clone() }, uDir: { value: plan.dir.clone() }, uLength: { value: 2.2 }, uEmit: { value: 0.12 }, uTurb: { value: 0.45 } };
    this.muzzle = particles(g, { max: 500, seed: 53, vs: GL.SMOKE_VS, fs: GL.SMOKE_FS, blend: "normal", order: 1, uniforms: {
      ...this.muzzleU, uLifeMin: { value: 2.2 }, uLifeMax: { value: 3.6 }, uWind: { value: new THREE.Vector2(0.5, 0.7) },
      uSmokeColor: { value: new THREE.Vector3(0.62, 0.6, 0.57) }, uSmokeGlow: { value: new THREE.Vector3(1.0, 0.7, 0.35) }, uSmokeGain: { value: 0.32 } } });
    this.muzzle.geo.instanceCount = 0;
    this.cut = quad(g, GL.WORLD_VS, CUT_FS, {
      uC: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) }, uT: { value: -1 }, uR: { value: 6 }, uLen: { value: 6 },
      uSide: { value: 1 }, uGain: { value: 1 }, uTint: { value: new THREE.Vector3(0.75, 0.88, 1) } }, { blend: "premult", order: 4.5 });
    this.cut.visible = false;
    this.arrow = quad(g, GL.QUAD_VS, GL.ARROW_FS, { uCore: { value: new THREE.Vector3(1, 0.95, 0.85) }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: 1 } }, { order: 5 });
    this.vial = quad(g, GL.QUAD_VS, GL.VIAL_FS, { uLiquid: { value: new THREE.Vector3(1, 0.5, 0.1) }, uGain: { value: 1 } }, { order: 5 });
    this.streak = quad(g, GL.QUAD_VS, GL.BEAM_FS, { uNoise: { value: noise }, uCore: { value: new THREE.Vector3(1, 1, 1) },
      uGlow: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: 0.5 }, uClock: { value: 0 }, uLen: { value: 8 } }, { order: 4 });
    const ARC_MAX = 260;
    const b = new THREE.PlaneGeometry(1, 1);
    const ag = new THREE.InstancedBufferGeometry();
    ag.index = b.index; ag.setAttribute("position", b.getAttribute("position")); ag.setAttribute("uv", b.getAttribute("uv"));
    ag.setAttribute("aSeg", new THREE.InstancedBufferAttribute(new Float32Array(ARC_MAX * 4), 4));
    ag.setAttribute("aWA", new THREE.InstancedBufferAttribute(new Float32Array(ARC_MAX * 2), 2));
    ag.instanceCount = 0;
    this.arcMax = ARC_MAX; this.arcGeo = ag;
    this.arcMat = material(GL.ARC_VS, GL.ARC_FS, { uCore: { value: new THREE.Vector3(0.9, 0.95, 1) }, uGlow: { value: new THREE.Vector3(0.35, 0.5, 1) }, uGain: { value: 1 } });
    this.arcMesh = new THREE.Mesh(ag, this.arcMat);
    this.arcMesh.frustumCulled = false; this.arcMesh.renderOrder = 4; this.arcMesh.visible = false;
    g.add(this.arcMesh);
    this.rings = Array.from({ length: 8 }, () => ({ mesh: quad(g, GL.WORLD_VS, GL.STRIKE_RING_FS, { uC: { value: new THREE.Vector2() }, uR: { value: 1 },
      uW: { value: 0.3 }, uA: { value: 0 }, uDarkR: { value: 0 }, uCol: { value: new THREE.Vector3(1, 1, 1) } }, { order: 3.5 }), spec: null }));
    this.ghosts = Array.from({ length: 3 }, (_, i) => quad(g, GL.QUAD_VS, GHOST_FS, { uTex: { value: null }, uTint: { value: new THREE.Vector3(0.5, 0.9, 1) },
      uA: { value: 0 } }, { blend: "add", order: 0.45 - i * 0.01 }));
  }

  #looks() {
    const r = this.req, W = this.W, plan = this.plan;
    const runes = this.runes = this.#runes();
    const qk = (QK[setting("quality", "high")] ?? 1);
    const wgt = plan.weight, crit = plan.crit, miss = plan.miss;
    const I = (this.look.intensity ?? 1) * setting("intensity", 1);
    const su = this.sparks.u;
    this.sparkLen.value = (W.style === "blunt" || W.style === "sweep" ? 5 : 6) * (0.8 + 0.2 * wgt);
    su.uMode.value = W.style === "blunt" || W.style === "sweep" ? 2 : 0;
    su.uHalfAng.value = W.style === "thrust" ? 0.45 : 0.75; su.uHalfTan.value = Math.tan(su.uHalfAng.value);
    su.uLifeMin.value = 0.15; su.uLifeMax.value = 0.55;
    su.uEmberDrag.value = 4.5; su.uEmberSpeed.value = 1; su.uEmberSize.value = 0.12; su.uEmberStreak.value = 0.07;
    su.uEmberMode.value = 0; su.uEmberBurst.value = 0; su.uEmberScatter.value = 0.5;
    v3(su.uEmberColor, [1.0, 0.78, 0.45]); su.uEmberGain.value = 1.1 / Math.max(1, qk);
    this.sparks.geo.instanceCount = miss ? 0 : Math.min(this.sparks.max, Math.round(420 * W.sparks * wgt * qk * (plan.neutral ? 0.5 : 1)));
    if (W.style === "bomb") {
      su.uMode.value = 2; su.uEmberMode.value = 1; v3(su.uEmberColor, [0.85, 0.92, 1.0]);
      su.uEmberSize.value = 0.14; su.uEmberDrag.value = 5; su.uLifeMin.value = 0.2; su.uLifeMax.value = 0.5; su.uEmberGain.value = 0.8;
      this.sparkLen.value = 4;
      this.sparks.geo.instanceCount = Math.round(280 * qk);
    }
    const du = this.dust.u;
    const gas = runes.some((x) => x.rune.gas);
    this.dustLen.value = gas ? 5 * wgt : (W.style === "blunt" || W.style === "sweep" ? 5 : W.style === "bomb" ? 3.5 : 2.5) * (0.8 + 0.2 * wgt);
    du.uSmokeGain.value = gas ? 0.9 : 0.35 * W.dust * (0.8 + 0.2 * wgt);
    v3(du.uSmokeColor, gas ? [0.3, 0.36, 0.1] : [0.2, 0.17, 0.14]); v3(du.uSmokeGlow, gas ? [0.5, 0.6, 0.15] : [0.2, 0.17, 0.14]);
    const smokeK = clamp(setting("smokeTime", 1), 0.2, 1.5);
    du.uLifeMin.value = (gas ? 2.2 : 0.6) * smokeK; du.uLifeMax.value = (gas ? 3.8 : 1.4) * smokeK;
    this.muzzle.u.uLifeMin.value = 2.2 * smokeK; this.muzzle.u.uLifeMax.value = 3.6 * smokeK;
    this.dust.geo.instanceCount = Math.min(this.dust.max, Math.round((gas ? 700 : 320 * W.dust) * qk * (miss && W.style !== "bomb" ? 0.4 : 1)));

    // Weapon signatures
    const st = W.style;
    if (W.chips || W.pebbles) {
      // Wood chips (axe) or stone pebbles (hammer): dark bits thrown out, not sparks
      setBlend(this.sparks.mat, "normal");
      su.uMode.value = 2; su.uEmberMode.value = 2; su.uEmberStreak.value = 0; su.uEmberDrag.value = 3.2;
      su.uEmberSize.value = W.chips ? 0.22 : 0.26; su.uLifeMin.value = 0.35; su.uLifeMax.value = 0.9; su.uEmberSpeed.value = W.chips ? 1.1 : 0.9;
      v3(su.uEmberColor, W.chips ? [0.66, 0.48, 0.27] : [0.42, 0.39, 0.34]); su.uEmberGain.value = 1;
      this.sparkLen.value = W.chips ? 5 : 6.5;
      this.sparks.geo.instanceCount = miss ? 0 : Math.round((W.chips ? 220 : 320) * wgt * qk);
    }
    if (st === "stab" || st === "pierce") {
      su.uHalfAng.value = 0.22; su.uHalfTan.value = Math.tan(0.22);
      this.sparkLen.value = st === "stab" ? 2.6 : 4;
      su.uEmberSize.value = 0.09;
    }
    if (st === "lash") { su.uHalfAng.value = 1.3; su.uHalfTan.value = Math.tan(1.3); su.uEmberStreak.value = 0.1; }
    if (W.muzzle && !miss) this.muzzle.geo.instanceCount = Math.round(260 * qk);
    else if (W.muzzle) this.muzzle.geo.instanceCount = Math.round(200 * qk);
    if (st === "stone") { this.sparks.geo.instanceCount = 0; }
    const sm = this.smear.material.uniforms, S = W.smear ?? {};
    sm.uSpan.value = S.span ?? 1.35; sm.uDur.value = S.dur ?? 0.17; sm.uThick.value = S.thick ?? 2.6; sm.uWave.value = S.wave ?? 0;
    sm.uWidth.value = S.width ?? 0.42; sm.uFade.value = S.fade ?? 0.28;

    this.slots.forEach((slot, i) => {
      const x = runes[i];
      slot.fire.geo.instanceCount = 0; slot.emb.geo.instanceCount = 0;
      if (!x || !this.shown) return;
      const g = x.greater ? 1 : 0, R = x.rune;
      slot.len.value = x.bomb ? 5 * BOMB_SIZE[r.bombLevel ?? 1] * (crit ? 1.3 : 1) : 4.2 * (1 + 0.45 * g) * (crit ? 1.35 : 1) * (1 + 0.08 * (r.striking ?? 0));
      const fu = slot.fire.u;
      if (R.palette && R.puff) {
        const pal = PALETTES[R.palette];
        v3(slot.C.uC0, pal.ramp[0]); v3(slot.C.uC1, pal.ramp[1]); v3(slot.C.uC2, pal.ramp[2]); v3(slot.C.uC3, pal.ramp[3]);
        v3(slot.C.uRim, pal.rim || pal.light); slot.C.uDark.value = pal.dark ? 1 : 0;
        setBlend(slot.fire.mat, pal.dark ? "normal" : "add");
        const count = Math.min(slot.fire.max, Math.round(1800 * qk * R.puff * (1 + 0.5 * g)));
        slot.fire.geo.instanceCount = count;
        // Rune fire sits on top of the weapon's own mark; two runes share the light so they never wash out to white.
        const share = runes.length > 1 ? 0.55 : 1;
        fu.uFireGain.value = 0.05 * I * (1 + 0.15 * g) * (1800 * qk / Math.max(count, 1)) * (R.puff > 0.5 ? 1 : 0.8) * (pal.dark ? 1 : 0.32 * share);
        fu.uDarkAlpha.value = Math.min(0.9, 0.3 * I * (1800 * qk / Math.max(count, 1)));
        fu.uLifeMin.value = R.slow ? 0.8 : 0.45; fu.uLifeMax.value = R.slow ? 1.4 : 0.85;
        fu.uTurb.value = R.slow ? 0.4 : 0.8;
      }
      const eu = slot.emb.u;
      if (R.blood) {
        setBlend(slot.emb.mat, "normal");
        eu.uEmberMode.value = 2; v3(eu.uEmberColor, [0.32, 0.015, 0.02]); eu.uEmberGain.value = 0.42;
        eu.uEmberDrag.value = 3.2; eu.uEmberSpeed.value = 0.7; eu.uEmberSize.value = 0.26 * (1 + 0.3 * g); eu.uEmberStreak.value = 0.04;
        eu.uEmberBurst.value = 0; eu.uEmberScatter.value = 0.7; eu.uLifeMin.value = 0.4; eu.uLifeMax.value = 0.9;
        eu.uMode.value = 0; eu.uHalfAng.value = 0.9; eu.uHalfTan.value = Math.tan(0.9);
        slot.emb.geo.instanceCount = Math.min(slot.emb.max, Math.round(380 * qk * wgt));
      } else if (R.ember) {
        setBlend(slot.emb.mat, "add");
        const e = R.ember;
        eu.uMode.value = 2; eu.uHalfAng.value = 0; eu.uHalfTan.value = 0;
        eu.uEmberMode.value = e.mode; v3(eu.uEmberColor, e.color); eu.uEmberGain.value = I * (1 + 0.3 * g) / Math.max(1, qk);
        eu.uEmberDrag.value = e.drag; eu.uEmberSpeed.value = e.speed; eu.uEmberSize.value = e.size; eu.uEmberStreak.value = e.streak;
        eu.uEmberBurst.value = Math.min(0.9, e.burst * (1 + 0.5 * g)); eu.uEmberScatter.value = e.scatter;
        eu.uLifeMin.value = e.life[0]; eu.uLifeMax.value = e.life[1];
        slot.emb.geo.instanceCount = Math.min(slot.emb.max, Math.round(520 * e.count * qk * (1 + 0.6 * g) * (crit ? 1.4 : 1)));
      }
    });
    const lightRune = runes.find((x) => x.rune.palette);
    const decalRune = runes.find((x) => x.rune.decal !== undefined);
    const mu = this.floor.material.uniforms;
    const pal = lightRune ? PALETTES[lightRune.rune.palette] : null;
    this.pal = pal;
    v3(mu.uLightColor, pal && this.shown ? pal.light : [0.9, 0.85, 0.75]);
    mu.uLightGain.value = !this.shown ? (plan.neutral ? 0.2 : 0.1) : (pal ? 0.35 * I * (pal.dark ? 0.6 : 1) : 0.18);
    mu.uDecalMode.value = !this.shown || !setting("groundMarks", true) ? 9 : decalRune ? decalRune.rune.decal : runes.some((x) => x.rune.blood) ? 5 : 9;
    v3(mu.uDecalColor, decalRune ? PALETTES[decalRune.rune.palette].light : [0.5, 0.05, 0.05]);
    this.U.uLength.value = runes.length ? Math.max(...this.slots.map((s) => s.len.value)) : 2.5;
    const tint = pal && this.shown ? (pal.dark ? pal.rim : pal.ramp[2]) : W.steel || W.style === "thrown" || W.style === "bolt" ? [0.78, 0.87, 1.0] : [1, 0.97, 0.92];
    const glowK = 0.8 + 0.3 * (r.potency ?? 0);
    v3(this.smear.material.uniforms.uTint, tint);
    this.smear.material.uniforms.uGain.value = 1.4 * glowK * (pal ? 1.15 : 1) * ({ slash: 0.45, stab: 0.35, chop: 0.55, reap: 0.5, lash: 0.6, bash: 0.5 }[W.style] ?? 1);
    if (W.steel && !pal) v3(this.smear.material.uniforms.uCore, [0.9, 0.94, 1.0]);
    v3(this.blade.material.uniforms.uTint, tint);
    this.blade.material.uniforms.uGain.value = 1.15 + 0.2 * (r.potency ?? 0) + (pal ? 0.3 : 0);
    v3(this.arrow.material.uniforms.uTint, tint);
    this.arrow.material.uniforms.uGain.value = 0.55 + 0.25 * (r.potency ?? 0) + (pal ? 0.3 : 0);
    v3(this.streak.material.uniforms.uCore, tint); v3(this.streak.material.uniforms.uGlow, tint);
    if (W.style === "bomb" && pal) v3(this.vial.material.uniforms.uLiquid, pal.dark ? pal.rim : pal.ramp[2]);
    if (["arrow", "bolt", "thrown", "stone", "shot"].includes(W.style) && lightRune && lightRune.rune.puff && this.shown) {
      const tu = this.trail.u;
      this.trail.geo.instanceCount = Math.round(1100 * qk);
      tu.uFireGain.value = 0.12 * I * (1100 / Math.max(1, this.trail.geo.instanceCount));
      setBlend(this.trail.mat, pal.dark ? "normal" : "add");
      const pl = PALETTES[lightRune.rune.palette];
      const C0 = this.slots[0].C;
      v3(C0.uC0, pl.ramp[0]); v3(C0.uC1, pl.ramp[1]); v3(C0.uC2, pl.ramp[2]); v3(C0.uC3, pl.ramp[3]);
      v3(C0.uRim, pl.rim || pl.light); C0.uDark.value = pl.dark ? 1 : 0;
    }
    if (runes.some((x) => x.rune.afterimages) && this.shown) {
      const tex = tokenTexture(r.attacker.token?.document?.texture?.src);
      for (const gh of this.ghosts) gh.material.uniforms.uTex.value = tex;
      this.ghostTex = tex;
    }
  }

  #events() {
    const r = this.req, W = this.W, plan = this.plan, a = r.attacker, t = r.target, d = plan.dir;
    const ev = this.events = [];
    if (!W.ranged) {
      const wind = { chop: -13, bash: -10, reap: -9, blunt: -9, stab: -3, pierce: -9 }[W.style] ?? -7;
      const lunge = { chop: 30, bash: 40, reap: 14, stab: 18, lash: 12 }[W.style] ?? 26;
      ev.push({ time: 0, fn: () => this.fx.nudge(a.token, d, wind) });
      ev.push({ time: plan.release, fn: () => this.fx.nudge(a.token, d, lunge) });
      if (plan.impact2T) {
        ev.push({ time: plan.impact2T - 0.09, fn: () => this.fx.nudge(a.token, d, W.style === "stab" ? 16 : 18) });
        if (!plan.miss) ev.push({ time: plan.impact2T, fn: () => { this.#hitTarget(plan.neutral ? 0.3 : 0.7); this.#secondKick(); } });
      }
    } else {
      ev.push({ time: 0, fn: () => this.fx.nudge(a.token, d, -4) });
      ev.push({ time: plan.release, fn: () => this.fx.nudge(a.token, d, W.style === "shot" ? -14 : W.style === "thrown" ? 8 : -6) });
    }
    const perp = new THREE.Vector2(-d.y, d.x);
    if (plan.miss && W.style === "bomb") ev.push({ time: plan.impactT, fn: () => this.#hitTarget(0.35) });
    else if (plan.miss) ev.push({ time: plan.impactT - 0.1, fn: () => this.fx.react(t.token, perp.clone().multiplyScalar(-plan.side), 15 / 17 / this.#mass(t), { dodge: true }) });
    else ev.push({ time: plan.impactT, fn: () => this.#hitTarget(plan.neutral ? 0.35 : 1) });
    ev.push({ time: plan.impactT, fn: () => this.#impactKick() });
    if (W.snap || W.muzzle) ev.push({ time: plan.release, fn: () => this.#releaseKick() });
    for (const e of ev) e.done = false;
  }

  #mass(t) { return (t.token?.document?.width ?? 1) >= 2 ? 2.6 : 1; }

  #hitTarget(scale = 1) {
    const plan = this.plan, t = this.req.target;
    const mag = this.W.knock * plan.weight * scale / this.#mass(t);
    const dir = this.W.pull ? plan.dir.clone().multiplyScalar(-1) : plan.dir;
    const dread = this.shown && this.runes.some((x) => x.rune.dread);
    const flashCol = dread ? [0.1, 0, 0.16] : (this.pal && this.shown ? this.pal.light.map((v) => Math.min(1.6, v * 1.2 + 0.3)) : [1.4, 1.35, 1.25]);
    const markStyle = ["slash", "claw", "bite", "chop", "stab", "pierce", "reap", "lash"].includes(this.W.style) ? 0.3 : 1;
    this.fx.react(t.token, dir, mag, { knockback: this.look.knockback, flash: this.look.flash * Math.min(1.3, 0.7 + 0.3 * mag) * (scale < 0.5 ? 0.5 : 1) * markStyle,
      flashCol, dark: dread });
  }

  #secondKick() {
    const k = this.plan.neutral ? 0.4 : 0.7 * this.plan.weight;
    this.hitstop = (this.look.hitstop / 1000) * k * 0.7;
    this.o.punch({ shake: this.W.shake * k * 0.5, zoom: 0.02 * this.look.punch * k, at: this.plan.impact });
  }

  #impactKick() {
    const W = this.W, plan = this.plan, runes = this.runes;
    const quiet = plan.miss && W.style !== "bomb";
    const k = quiet ? 0.3 : plan.neutral ? 0.55 : plan.weight;
    this.hitstop = quiet ? 0 : (this.look.hitstop / 1000) * k * (W.style === "blunt" || W.style === "sweep" ? 1.3 : 1);
    const thunder = runes.some((x) => x.rune.shake);
    this.o.punch({ shake: W.shake * k * (thunder && this.shown ? 1.6 : 1) * 0.6, zoom: 0.03 * this.look.punch * k * (W.style === "blunt" || W.style === "sweep" ? 1.4 : 1), at: plan.impact });
    const specs = [];
    if (W.style === "punch" && !quiet) {
      specs.push({ d: 0, dur: 0.22, r1: 2.6, w: 0.25, a: 0.9, color: [1, 0.97, 0.9] });
      if (plan.impact2T) specs.push({ d: plan.impact2T - plan.impactT, dur: 0.22, r1: 2.8, w: 0.25, a: 0.9, color: [1, 0.97, 0.9] });
    }
    if (this.shown && !quiet) {
      for (const x of runes) for (const s of x.rune.rings || []) {
        const pal = x.rune.palette ? PALETTES[x.rune.palette] : null;
        specs.push({ ...s, r1: s.r1 * (x.greater ? 1.35 : 1) * (plan.crit ? 1.25 : 1), color: s.color || (pal ? pal.light : [1, 1, 1]), a: s.a * (this.look.intensity ?? 1) });
      }
    }
    if ((W.style === "claw" || W.style === "bite") && !quiet) specs.push({ d: 0, dur: 0.2, r1: 2.2, w: 0.22, a: 0.6, color: [1, 0.9, 0.85] });
    if ((W.style === "blunt" || W.style === "sweep") && !quiet) specs.push({ d: 0, dur: 0.4, r1: 6 * (0.8 + 0.2 * plan.weight), w: 0.7, a: 0.55, dark: true, color: [0.16, 0.13, 0.1] });
    // Hammer: a shockwave of dust rolls across the floor
    if (W.quake && !quiet) {
      specs.push({ d: 0.02, dur: 0.6, r1: 11 * (0.8 + 0.2 * plan.weight), w: 1.3, a: 0.45, dark: true, color: [0.36, 0.32, 0.26] });
      specs.push({ d: 0, dur: 0.22, r1: 4, w: 0.5, a: 0.8, color: [1, 0.92, 0.8] });
    }
    // Whip / flail: the crack
    if (W.crack && !quiet) specs.push({ d: 0, dur: 0.12, r1: 1.8, w: 0.14, a: 1.6, color: [1, 0.98, 0.92] });
    // Pick and axe: a short dull thud ring
    if ((W.style === "pierce" || W.style === "chop") && !quiet) specs.push({ d: 0, dur: 0.3, r1: 3.5, w: 0.5, a: 0.5, dark: true, color: [0.12, 0.1, 0.08] });
    // Shield: the wave hits
    if (W.style === "bash" && !quiet) specs.push({ d: 0, dur: 0.3, r1: 4.5, w: 0.6, a: 0.7, color: [0.95, 0.92, 0.85] });
    if (W.style === "stone" && !quiet) specs.push({ d: 0, dur: 0.35, r1: 3, w: 0.6, a: 0.5, dark: true, color: [0.25, 0.21, 0.16] });
    this.#addRings(specs);
  }

  /** Rings go to free slots, so the shooter's flash and the impact's rings can overlap. */
  #addRings(specs) {
    this.ringNext ??= 0;
    for (const s of specs) {
      if (this.ringNext >= this.rings.length) break;
      this.rings[this.ringNext++].spec = s;
    }
  }

  /** Crossbow snap and firearm muzzle flash, at the shooter on release. */
  #releaseKick() {
    const W = this.W, plan = this.plan;
    const back = plan.release - plan.impactT;
    const specs = [];
    if (W.snap) specs.push({ d: back, dur: 0.14, r1: 1.6, w: 0.18, a: 1.1, color: [1, 0.96, 0.9], at: "from" });
    if (W.muzzle) {
      specs.push({ d: back, dur: 0.1, r1: 1.4, w: 0.9, a: 2.2, color: [1, 0.78, 0.38], at: "from" });
      specs.push({ d: back, dur: 0.3, r1: 3.2, w: 0.4, a: 0.6, color: [1, 0.85, 0.6], at: "from" });
      this.o.punch({ shake: 0.12, at: plan.from });
    }
    this.#addRings(specs);
  }

  update(dt, now) {
    let tScale = 1;
    if (this.hitstop > 0) { this.hitstop -= dt; tScale = 0; }
    this.clock += dt * tScale;
    const T = this.clock;
    for (const e of this.events) if (!e.done && T >= e.time) { e.done = true; try { e.fn(); } catch (err) { console.warn(`${MODULE_ID} | strike event`, err); } }
    const plan = this.plan, W = this.W, r = this.req, runes = this.runes, clock = now;
    const tI = T - plan.impactT;
    this.U.uTime.value = tI;
    this.P.uPT.value = T - plan.release;
    const mu = this.floor.material.uniforms;
    const markT = clamp(setting("markTime", 12), 2, 30);
    mu.uDecalFade.value = 1 - smoothstep(markT * 0.7, markT, tI);
    const a = r.attacker;
    const off = this.fx.offset(a.token);
    const ax = a.ft.x + off.x, ay = a.ft.y + off.y;

    // Afterimages (speed rune)
    this.history.push({ t: T, x: ax, y: ay });
    while (this.history.length > 40) this.history.shift();
    const speed = this.ghostTex && runes.some((x) => x.rune.afterimages);
    this.ghosts.forEach((g, i) => {
      const on = speed && T > 0.05 && T < plan.impactT + 0.2;
      g.visible = !!on;
      if (!on) return;
      const want = T - 0.035 * (i + 1);
      let h = this.history[0];
      for (const e of this.history) if (e.t <= want) h = e;
      g.material.uniforms.uA.value = (0.4 - i * 0.11) * (1 - smoothstep(plan.impactT, plan.impactT + 0.2, T));
      g.position.set(h.x, h.y, 0);
      const s = a.r * 2 / 0.92;
      g.scale.set(s, s, 1);
    });

    // Weapon smear
    const st = W.style;
    const onTarget = st === "claw" || st === "bite";
    const it = plan.impactT;
    const smearStart = st === "thrust" || st === "punch" ? 0.13 : st === "bite" ? 0.04
      : ({ chop: it - 0.08, reap: it - 0.2, lash: it - 0.12, stab: it - 0.06, pierce: it - 0.07, bash: it - 0.11 }[st] ?? 0.1);
    const secondAt = plan.impact2T ? plan.impact2T - (it - smearStart) : Infinity;
    const second = T >= secondAt;
    const sT = second ? T - secondAt : T - smearStart;
    const sm = this.smear;
    if (!W.ranged && sT >= 0 && sT < 0.55) {
      const su = sm.material.uniforms;
      const d = Math.hypot(plan.impact.x - ax, plan.impact.y - ay);
      su.uT.value = sT; su.uSide.value = plan.side;
      if (onTarget) {
        // Claws rake diagonally across the target; jaws close along the line of attack.
        const tr = r.target.r;
        su.uMode.value = st === "claw" ? 3 : 4;
        const ang = st === "claw" ? 0.95 * plan.side : 0;
        const c = Math.cos(ang), s2 = Math.sin(ang);
        su.uDir.value.set(plan.dir.x * c - plan.dir.y * s2, plan.dir.x * s2 + plan.dir.y * c);
        // Jaws close just in front of the target, so the snap is not lost under its flash
        const at = plan.miss ? plan.impact : st === "bite" ? r.target.ft.clone().addScaledVector(plan.dir, -r.target.r * 0.45) : r.target.ft;
        su.uC.value.set(at.x, at.y);
        su.uLen.value = tr * 2.2 + 1.2;
        su.uR.value = st === "bite" ? tr * 1.3 + 1.2 : tr * 1.15 + 1;
        sm.position.set(at.x, at.y, 0);
        const sc = (tr + 4) * 2;
        sm.scale.set(sc, sc, 1);
      } else {
        const line = ["thrust", "punch", "stab", "pierce"].includes(st);
        su.uMode.value = ["slash", "chop", "reap", "lash"].includes(st) ? 0 : line ? 1 : st === "bash" ? 6 : 2;
        const fistOff = st === "punch" ? (second ? -0.7 : 0.7) * plan.side : st === "stab" ? (second ? -0.45 : 0.45) * plan.side : 0;
        su.uC.value.set(ax - plan.dir.y * fistOff, ay + plan.dir.x * fistOff); su.uDir.value.copy(plan.dir);
        // The swing stays within reach of the attacker even if the target stands farther away (reach weapons, odd setups).
        const reach = a.r + (W.reach ?? (st === "sweep" ? 11 : 7));
        su.uR.value = line ? Math.min(d + 0.6, reach)
          : st === "bash" ? Math.min(d + 0.3, a.r + 6)
          : clamp(d + (st === "sweep" ? 1.5 : 0.6), a.r + (st === "sweep" || st === "reap" ? 5 : 3.6), reach);
        su.uLen.value = Math.min(st === "punch" ? d + 0.2 : st === "pierce" ? d + 0.2 : d + 0.6, reach);
        sm.position.set(ax, ay, 0);
        sm.scale.set((su.uR.value + 8) * 2, (su.uR.value + 8) * 2, 1);
      }
      sm.visible = true;
    } else sm.visible = false;

    // Firearm: a short tongue of flame at the muzzle
    const mT = T - plan.release;
    if (st === "shot" && mT >= 0 && mT < 0.12) {
      const su = sm.material.uniforms;
      su.uMode.value = 1; su.uT.value = mT * 0.5; su.uSide.value = 1;
      su.uC.value.set(plan.from.x, plan.from.y); su.uDir.value.copy(plan.dir);
      su.uR.value = 3.2; su.uLen.value = 3.2; su.uWidth.value = 0.9; su.uFade.value = 0.12;
      v3(su.uCore, [1, 0.85, 0.5]); v3(su.uTint, [1, 0.6, 0.2]); su.uGain.value = 2.2;
      sm.position.set(plan.from.x, plan.from.y, 0); sm.scale.set(14, 14, 1);
      sm.visible = true;
    }

    // Ground marks: the axe's gash, the pick's star crack
    const gashT = Math.min(4.2, markT);
    if (W.mark && this.shown && !plan.miss && tI >= 0 && tI < gashT) {
      const mk = this.mark.material.uniforms, tr = r.target.r;
      if (W.mark === "gash") {
        const ang = 1.2 * plan.side, c = Math.cos(ang), s2 = Math.sin(ang);
        mk.uDir.value.set(plan.dir.x * c - plan.dir.y * s2, plan.dir.x * s2 + plan.dir.y * c);
        mk.uC.value.copy(r.target.ft); mk.uMode.value = 0; mk.uLen.value = tr * 2.4 + 2.5 * plan.weight;
        this.mark.position.set(r.target.ft.x, r.target.ft.y, 0);
      } else {
        mk.uDir.value.copy(plan.dir); mk.uC.value.copy(plan.impact); mk.uMode.value = 1; mk.uLen.value = 2.4 * (0.8 + 0.25 * plan.weight);
        this.mark.position.set(plan.impact.x, plan.impact.y, 0);
      }
      mk.uA.value = (plan.crit ? 0.95 : 0.75) * smoothstep(0, 0.06, tI) * (1 - smoothstep(gashT * 0.62, gashT, tI));
      const sz = mk.uLen.value * 1.4 + 3;
      this.mark.scale.set(sz, sz, 1);
      this.mark.visible = setting("groundMarks", true);
    } else this.mark.visible = false;

    // Sword cut across the target, from just before impact
    const cT = T - (plan.impactT - 0.03);
    if (st === "slash" && this.shown !== false && cT >= 0 && cT < 0.65) {
      const cu = this.cut.material.uniforms, tr = r.target.r;
      const at = plan.miss ? plan.impact : r.target.ft;
      const ang = 1.15 * plan.side, c = Math.cos(ang), s2 = Math.sin(ang);
      cu.uDir.value.set(plan.dir.x * c - plan.dir.y * s2, plan.dir.x * s2 + plan.dir.y * c);
      cu.uC.value.set(at.x, at.y);
      cu.uR.value = tr * 2.6 + 2;
      cu.uLen.value = tr * 2.7 + 2.2;
      cu.uSide.value = plan.side;
      cu.uT.value = cT;
      cu.uGain.value = plan.miss ? 0.45 : plan.crit ? 1.35 : 1;
      if (this.pal && this.shown) cu.uTint.value.set(...this.pal.light.map((v) => Math.min(1.2, v)));
      this.cut.position.set(at.x, at.y, 0);
      const sc = (tr + 5) * 2;
      this.cut.scale.set(sc, sc, 1);
      this.cut.visible = true;
    } else this.cut.visible = false;

    // Projectiles: arrow, crossbow bolt, thrown blade, sling stone, bullet; and the bomb's vial
    const fT = T - plan.release;
    this.arrow.visible = false; this.streak.visible = false; this.vial.visible = false; this.blade.visible = false; this.stone.visible = false;
    mu.uProjOn.value = 0;
    const PROJ = ["arrow", "bolt", "thrown", "stone", "shot"];
    if (W.style === "bomb" && fT >= 0 && fT <= plan.travel) {
      const s = fT / plan.travel;
      const x = plan.from.x + (plan.impact.x - plan.from.x) * s, y = plan.from.y + (plan.impact.y - plan.from.y) * s;
      const h = 4 * s * (1 - s);
      this.vial.visible = true; this.vial.position.set(x, y, 0); this.vial.rotation.z = fT * 14;
      const sc = 1.4 * (1 + h * 0.8); this.vial.scale.set(sc, sc, 1);
      mu.uProjPos.value.set(x, y); mu.uProjOn.value = 0.25;
    } else if (PROJ.includes(st) && fT >= 0 && fT <= plan.travel) {
      const s = fT / plan.travel;
      const x = plan.from.x + (plan.impact.x - plan.from.x) * s, y = plan.from.y + (plan.impact.y - plan.from.y) * s;
      const h = 4 * s * (1 - s) * (st === "stone" ? 1 : st === "thrown" ? 0.45 : 0);
      const ang = Math.atan2(plan.dir.y, plan.dir.x);
      const lit = this.trail.geo.instanceCount > 0;
      if (st === "arrow" || st === "bolt") {
        const bolt = st === "bolt";
        this.arrow.visible = true; this.arrow.position.set(x - plan.dir.x * (bolt ? 1 : 1.5), y - plan.dir.y * (bolt ? 1 : 1.5), 0);
        this.arrow.rotation.z = ang; this.arrow.scale.set(bolt ? 2.2 : 3.2, bolt ? 0.75 : 0.9, 1);
      } else if (st === "thrown") {
        this.blade.visible = true; this.blade.position.set(x, y, 0);
        this.blade.rotation.z = fT * 24 * plan.side;
        const sc = 2.4 * (1 + h * 0.5); this.blade.scale.set(sc, sc, 1);
      } else if (st === "stone") {
        this.stone.visible = true; this.stone.position.set(x, y, 0);
        const sc = 1.35 * (1 + h * 0.9); this.stone.scale.set(sc, sc, 1);
      }
      const maxL = { arrow: 9, bolt: 13, shot: 8, thrown: 3.5, stone: 3 }[st];
      const sl = Math.min(maxL, plan.from.distanceTo(new THREE.Vector2(x, y)));
      const sk = this.streak;
      sk.visible = sl > 0.3;
      if (sk.visible) {
        sk.position.set(x - plan.dir.x * sl / 2, y - plan.dir.y * sl / 2, 0); sk.rotation.z = ang;
        sk.scale.set(sl, st === "shot" ? 0.45 : st === "bolt" ? 0.55 : st === "stone" ? 0.9 : 0.7, 1);
        if (st === "stone" && !lit) { v3(sk.material.uniforms.uCore, [0.75, 0.7, 0.62]); v3(sk.material.uniforms.uGlow, [0.5, 0.45, 0.38]); }
        const ku = sk.material.uniforms;
        if (st === "shot" && !lit) { v3(ku.uCore, [1, 0.9, 0.65]); v3(ku.uGlow, [1, 0.6, 0.25]); }
        ku.uGain.value = (st === "shot" ? 0.9 : st === "stone" ? 0.15 : 0.25) + 0.12 * (r.potency ?? 0) + (lit ? 0.3 : 0);
        ku.uClock.value = clock; ku.uLen.value = sl;
      }
      mu.uProjPos.value.set(x, y); mu.uProjOn.value = lit ? 0.6 : st === "shot" ? 0.3 : 0.15 * (r.potency ?? 0);
    }
    this.muzzleU.uTime.value = T - plan.release;

    // Lightning
    const shock = runes.find((x) => x.rune.arcs);
    const arcLife = shock ? (0.45 + 0.3 * (shock.greater ? 1 : 0)) * (plan.crit ? 1.3 : 1) : 0;
    if (shock && this.shown && tI >= 0 && tI < arcLife) {
      this.arcTimer -= dt;
      if (this.arcTimer <= 0) { this.#regenArcs(shock); this.arcTimer = 0.045; }
      this.arcMat.uniforms.uGain.value = (this.look.intensity ?? 1) * (1 - smoothstep(arcLife * 0.5, arcLife, tI));
      this.arcMesh.visible = true;
    } else this.arcMesh.visible = false;

    // Rings
    for (const ring of this.rings) {
      const s = ring.spec, m = ring.mesh;
      if (!s) { m.visible = false; continue; }
      const t = tI - s.d;
      if (t < 0 || t > s.dur) { m.visible = false; continue; }
      const f = t / s.dur, ease = 1 - Math.pow(1 - f, 3);
      const u = m.material.uniforms;
      const at = s.at === "from" ? plan.from : plan.impact;
      u.uC.value.copy(at);
      u.uR.value = 0.5 + (s.r1 - 0.5) * ease; u.uW.value = s.w * (1 + f); u.uA.value = s.a * (1 - f);
      u.uDarkR.value = s.dark ? 1 : 0; u.uCol.value.set(s.color[0], s.color[1], s.color[2]);
      if (m.userData.dark !== !!s.dark) { setBlend(m.material, s.dark ? "normal" : "add"); m.userData.dark = !!s.dark; }
      m.visible = true;
      m.position.set(at.x, at.y, 0);
      const sz = (s.r1 + s.w * 4) * 2.2;
      m.scale.set(sz, sz, 1);
    }
    const particlesOn = tI < 4.5;
    for (const l of [this.sparks, this.dust, this.trail, this.muzzle, ...this.slots.flatMap((s) => [s.fire, s.emb])]) l.mesh.visible = particlesOn && l.geo.instanceCount > 0;
    return tI < (mu.uDecalMode.value < 8.5 ? Math.max(markT, 4.5) : 4.5);
  }

  #regenArcs(shock) {
    const plan = this.plan;
    const segs = this.arcGeo.getAttribute("aSeg"), wa = this.arcGeo.getAttribute("aWA");
    let n = 0;
    const rnd = mulberry32(this.arcSeed++);
    const MAXA = this.arcMax;
    const bolt = (x0, y0, x1, y1, steps, jag, width, alpha) => {
      let px = x0, py = y0;
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      for (let s = 1; s <= steps && n < MAXA; s++) {
        const f = s / steps;
        const off = s === steps ? 0 : (rnd() - 0.5) * jag * Math.sin(f * Math.PI);
        const qx = x0 + dx * f + nx * off, qy = y0 + dy * f + ny * off;
        segs.setXYZW(n, px, py, qx, qy); wa.setXY(n, width, alpha); n++;
        if (rnd() < 0.18 && n < MAXA - 4) {
          const ba = Math.atan2(dy, dx) + (rnd() - 0.5) * 2.2, bl = L * 0.25 * rnd();
          segs.setXYZW(n, qx, qy, qx + Math.cos(ba) * bl, qy + Math.sin(ba) * bl); wa.setXY(n, width * 0.6, alpha * 0.6); n++;
        }
        px = qx; py = qy;
      }
    };
    const g = shock.greater ? 1 : 0;
    const count = 5 + 3 * g + (plan.crit ? 2 : 0);
    const rad = (3.2 + 1.8 * g) * (plan.crit ? 1.3 : 1);
    for (let i = 0; i < count; i++) {
      const ang = rnd() * Math.PI * 2, len = rad * (0.45 + 0.55 * rnd());
      const x0 = plan.impact.x + (rnd() - 0.5) * 0.6, y0 = plan.impact.y + (rnd() - 0.5) * 0.6;
      bolt(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, 7, len * 0.35, 0.55, 0.6 + 0.4 * rnd());
    }
    // Greater shock on a critical: lightning leaps to nearby creatures.
    if (g && plan.crit) {
      for (const t of this.req.nearby ?? []) {
        const d = t.ft.distanceTo(plan.impact);
        if (d < 26) bolt(plan.impact.x, plan.impact.y, t.ft.x, t.ft.y, 14, d * 0.18, 0.7, 1);
      }
    }
    this.arcGeo.instanceCount = n;
    segs.needsUpdate = true; wa.needsUpdate = true;
  }

  dispose() { this.arcGeo.dispose(); disposeGroup(this.under); disposeGroup(this.group); }
}
