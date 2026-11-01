import * as THREE from "../vendor/three.js";
import { MODULE_ID } from "../constants.js";
import * as GL from "../core/shaders-lab.js";
import { FLOOR_FS } from "../core/shaders-pyre.js";
import { particles, quad, material, setBlend, disposeGroup } from "../core/layers.js";
import { clamp, smoothstep, mixA, scaleA, v3, luma, linear, mulberry32, setWalls, wallUniforms } from "../core/util.js";
import { ELEMENTS, RECIPES, OUTCOMES, QUALITY, MATERIALS, MAX } from "../data/looks.js";
import { base as LOOK_BASE } from "../data/presets.js";

// WebGL stencil constants (three.js values) and the wall mask's shaders
const STENCIL = { always: 519, equal: 514, keep: 7680, replace: 7681 };
const MASK_VS = "void main(){ gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position, 1.0); }";
const MASK_FS = "void main(){ gl_FragColor = vec4(0.0); }";
function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }

/**
 * Area / projectile spell effect (the Effect Lab engine, one instance per cast).
 *
 * req = {
 *   recipe: breath | fireball | point | column | field | ray | darts | chain,
 *   look: preset params (element, material, custom/core/glow, intensity, emit, …),
 *   origin, dir (Vector2 ft) and shape {mode, length, halfAng, width} for breath,
 *   at (Vector2) centre for point / fireball / column / field, radius / side,
 *   from, to (Vector2) for projectiles, chain: [Vector2] for chain,
 *   outcome: hit | crit | miss | hidden, darts: n,
 *   targets: [{ token, ft: Vector2, r }]   creatures that may react
 *   seed
 * }
 */
export class AreaEffect {
  constructor(overlay, tokenFx, req) {
    this.o = overlay; this.fx = tokenFx; this.req = req;
    this.p = { ...LOOK_BASE, ...(req.look ?? {}) };
    this.group = new THREE.Group();
    overlay.scene.add(this.group);
    this.clock = 0; this.hitstop = 0; this.impactFired = false;
    this.rnd = mulberry32(req.seed ?? 1);
    this.seedOff = (req.seed ?? 1) % 1000 * 0.37;
    this.arcTimer = 0; this.arcSeed = req.seed ?? 1;
    this.hopRingSpecs = [];
    this.#build();
    this.#geometry();
    this.#looks();
    // Floor light, scorch and smoke lie beneath the tokens
    this.under = new THREE.Group();
    overlay.underScene().add(this.under);
    for (const m of [this.floor, this.smoke.mesh]) this.under.add(m);
    this.elevation = (req.caster?.token ?? req.targets?.[0]?.token)?.document?.elevation ?? 0;
    this.#wallMask();
    this.#planHits();
    // Creatures behind a wall are not struck
    if (this.reach) this.hits = this.hits.filter((h) => h.hop || this.reaches(h.t.ft));
    // Projectiles gather at the caster first, so the spell visibly leaves their hands.
    const R0 = RECIPES[req.recipe];
    this.charge = req.from && R0?.travel && req.recipe !== "column" ? (req.recipe === "fireball" ? 0.55 : 0.4) : 0;
    this.clock = -this.charge;
  }

  /* ---------------- construction ---------------- */
  #build() {
    const g = this.group, noise = this.o.noise;
    const U = this.U = {
      uTime: { value: -1 }, uEmit: { value: 1 }, uLength: { value: 30 }, uHalfAng: { value: 0 }, uHalfTan: { value: 0 }, uLineWidth: { value: 0 },
      uMode: { value: 0 }, uTurb: { value: 1 }, uSize: { value: 1.4 }, uSeedOff: { value: this.seedOff }, uEdgeNoise: { value: 1 },
      uOrigin: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) }, uNoise: { value: noise },
      ...wallUniforms(),
    };
    const C = this.C = {
      uC0: { value: new THREE.Vector3() }, uC1: { value: new THREE.Vector3() }, uC2: { value: new THREE.Vector3() }, uC3: { value: new THREE.Vector3() },
      uRim: { value: new THREE.Vector3() }, uDark: { value: 0 },
    };
    this.P = {
      uPT: { value: -1 }, uTravel: { value: 0 }, uTrailLife: { value: 0.6 }, uTrailWidth: { value: 1 }, uTrailSize: { value: 1 },
      uArc: { value: 1 }, uWobble: { value: 0.7 }, uWobbleFreq: { value: 1.1 }, uFrom: { value: new THREE.Vector2() }, uTo: { value: new THREE.Vector2() },
    };
    const emberU = () => ({
      uLifeMin: { value: 0.8 }, uLifeMax: { value: 2.2 }, uEmberDrag: { value: 1.6 }, uEmberSpeed: { value: 1 }, uEmberSize: { value: 0.2 },
      uEmberStreak: { value: 0.06 }, uEmberMode: { value: 0 }, uEmberBurst: { value: 0 }, uEmberScatter: { value: 0 },
      uEmberColor: { value: new THREE.Vector3() }, uEmberGain: { value: 1 },
    });
    this.floor = quad(g, GL.WORLD_VS, FLOOR_FS, {
      ...U, uLightColor: { value: new THREE.Vector3() }, uDecalColor: { value: new THREE.Vector3() }, uLightGain: { value: 1 },
      uDecalMode: { value: 9 }, uProjOn: { value: 0 }, uProjPos: { value: new THREE.Vector2(9e5, 9e5) }, uDecalFade: { value: 1 },
    }, { blend: "premult", order: 0.2, visible: true });
    this.smoke = particles(g, { max: MAX.smoke, seed: 21, vs: GL.SMOKE_VS, fs: GL.SMOKE_FS, blend: "normal", order: 1, uniforms: {
      ...U, uLifeMin: { value: 2 }, uLifeMax: { value: 4 }, uWind: { value: new THREE.Vector2(0.7, 1.1) },
      uSmokeColor: { value: new THREE.Vector3() }, uSmokeGlow: { value: new THREE.Vector3() }, uSmokeGain: { value: 0.2 } } });
    this.fire = particles(g, { max: MAX.fire, seed: 11, vs: GL.FIRE_VS, fs: GL.FIRE_FS, order: 2, uniforms: {
      ...U, ...C, uLifeMin: { value: 0.55 }, uLifeMax: { value: 0.95 }, uFireGain: { value: 0.3 }, uDarkAlpha: { value: 0.1 } } });
    this.debris = particles(g, { max: 1400, seed: 37, vs: GL.EMBER_VS, fs: GL.DEBRIS_FS, blend: "normal", order: 2.5, uniforms: {
      ...U, ...emberU(), uDebrisColor: { value: new THREE.Vector3() }, uShape: { value: 0 } } });
    this.embers = particles(g, { max: MAX.ember, seed: 31, vs: GL.EMBER_VS, fs: GL.EMBER_FS, order: 3, uniforms: { ...U, ...emberU() } });
    this.trail = particles(g, { max: MAX.trail, seed: 41, vs: GL.TRAIL_VS, fs: GL.FIRE_FS, order: 2, uniforms: {
      ...U, ...C, ...this.P, uLifeMin: { value: 0 }, uLifeMax: { value: 0 }, uFireGain: { value: 0.2 }, uDarkAlpha: { value: 0.2 } } });
    const qU = () => ({ uNoise: { value: noise }, uCore: { value: new THREE.Vector3(1, 1, 1) }, uGlow: { value: new THREE.Vector3(1, 1, 1) },
      uGain: { value: 0 }, uClock: { value: 0 }, uLen: { value: 1 } });
    this.head = quad(g, GL.QUAD_VS, GL.HEAD_FS, qU(), { order: 5 });
    this.beam = quad(g, GL.QUAD_VS, GL.BEAM_FS, qU(), { order: 4 });
    this.rock = quad(g, GL.QUAD_VS, GL.ROCK_FS, { uCore: { value: new THREE.Vector3(0.5, 0.45, 0.4) }, uGlow: { value: new THREE.Vector3() },
      uGain: { value: 1 }, uClock: { value: 0 }, uLen: { value: 0 } }, { blend: "normal", order: 5 });
    this.dartHeads = []; this.dartTails = [];
    if (this.req.recipe === "darts") for (let i = 0; i < 9; i++) {
      this.dartHeads.push(quad(g, GL.QUAD_VS, GL.HEAD_FS, qU(), { order: 5 }));
      this.dartTails.push(quad(g, GL.QUAD_VS, GL.BEAM_FS, qU(), { order: 4 }));
    }
    this.chainBeams = [];
    if (this.req.recipe === "chain") for (let i = 0; i < 6; i++) this.chainBeams.push(quad(g, GL.QUAD_VS, GL.BEAM_FS, qU(), { order: 4 }));
    // Arcs (lightning)
    const ARC_MAX = 400;
    const b = new THREE.PlaneGeometry(1, 1);
    const ag = new THREE.InstancedBufferGeometry();
    ag.index = b.index;
    ag.setAttribute("position", b.getAttribute("position"));
    ag.setAttribute("uv", b.getAttribute("uv"));
    ag.setAttribute("aSeg", new THREE.InstancedBufferAttribute(new Float32Array(ARC_MAX * 4), 4));
    ag.setAttribute("aWA", new THREE.InstancedBufferAttribute(new Float32Array(ARC_MAX * 2), 2));
    ag.instanceCount = 0;
    this.arcMax = ARC_MAX;
    this.arcGeo = ag;
    this.arcMat = material(GL.ARC_VS, GL.ARC_FS, { uCore: { value: new THREE.Vector3(0.9, 0.95, 1) }, uGlow: { value: new THREE.Vector3(0.35, 0.5, 1) }, uGain: { value: 1 } });
    this.arcMesh = new THREE.Mesh(ag, this.arcMat);
    this.arcMesh.frustumCulled = false; this.arcMesh.renderOrder = 4; this.arcMesh.visible = false;
    g.add(this.arcMesh);
    this.rings = Array.from({ length: 6 }, () => quad(g, GL.WORLD_VS, GL.AREA_RING_FS, { ...U, uR: { value: 1 }, uW: { value: 0.4 }, uA: { value: 0 },
      uCol: { value: new THREE.Vector3(1, 1, 1) } }, { order: 3.5 }));
    this.hopRings = Array.from({ length: 10 }, () => quad(g, GL.WORLD_VS, GL.HOP_RING_FS, { uC: { value: new THREE.Vector2() }, uR: { value: 1 },
      uW: { value: 0.3 }, uA: { value: 0 }, uCol: { value: new THREE.Vector3(1, 1, 1) } }, { order: 3.6 }));
  }

  /* ---------------- geometry ---------------- */
  #geometry() {
    const r = this.req, U = this.U, P = this.P, p = this.p;
    const R = RECIPES[r.recipe] ?? RECIPES.point;
    this.R = R;
    this.travel = 0;
    if (r.recipe === "breath") {
      const S = r.shape;
      U.uMode.value = S.mode; U.uLength.value = S.length; U.uHalfAng.value = S.halfAng ?? 0;
      U.uHalfTan.value = Math.tan(S.halfAng ?? 0); U.uLineWidth.value = S.width ?? 5;
      U.uDir.value.copy(r.dir); U.uOrigin.value.copy(r.origin);
    } else if (r.recipe === "point" || r.recipe === "column" || r.recipe === "field") {
      const field = r.recipe === "field";
      U.uMode.value = field ? 3 : 2;
      U.uLength.value = field ? (r.side ?? R.side) : (r.radius ?? R.radius);
      U.uDir.value.copy(r.dir ?? new THREE.Vector2(1, 0));
      U.uOrigin.value.copy(r.at);
      this.travel = r.recipe === "column" ? R.descent / p.speed : 0;
    } else if (r.recipe === "darts" || r.recipe === "chain") {
      const dir = r.to.clone().sub(r.from).normalize();
      U.uMode.value = 2; U.uLength.value = R.radius;
      U.uDir.value.copy(dir); U.uOrigin.value.copy(r.to);
      const speed = R.speed * p.speed;
      if (r.recipe === "darts") this.travel = (r.from.distanceTo(r.to) * 1.25) / speed;
      else {
        const pts = r.chain;
        this.hopTimes = [0];
        for (let i = 1; i < pts.length; i++) this.hopTimes.push(this.hopTimes[i - 1] + pts[i - 1].distanceTo(pts[i]) / speed + (i > 1 ? 0.08 : 0));
        this.travel = this.hopTimes[1] ?? 0;
      }
    } else {
      // fireball / ray
      const O = OUTCOMES[r.outcome] ?? OUTCOMES.hit;
      const to = r.to.clone();
      const dir = to.clone().sub(r.from).normalize();
      let radius = r.radius ?? R.radius;
      if (r.recipe === "ray") {
        radius = R.radius * O.radius;
        if (O.miss) { const perp = new THREE.Vector2(-dir.y, dir.x); to.addScaledVector(dir, 9).addScaledVector(perp, 3.5 * (this.rnd() < 0.5 ? -1 : 1)); }
      }
      this.to = to;
      U.uMode.value = 2; U.uLength.value = radius; U.uDir.value.copy(dir); U.uOrigin.value.copy(to);
      // Short throws still fly long enough to read; the trail thins with the distance so it never piles up into a white clump.
      this.flightLen = r.from.distanceTo(to);
      this.travel = Math.max(this.flightLen / (R.speed * p.speed), R.minTravel ?? 0.3);
      P.uFrom.value.copy(r.from); P.uTo.value.copy(to); P.uTravel.value = this.travel;
      P.uArc.value = p.arc; P.uWobble.value = p.wobble; P.uWobbleFreq.value = p.wobbleFreq;
    }
    // Floor covers the whole area plus margin
    const L = U.uLength.value;
    const f = this.floor;
    if (r.recipe === "breath") {
      const c = r.origin.clone().addScaledVector(r.dir, L / 2);
      f.position.set(c.x, c.y, 0); f.scale.set(L * 2 + 20, L * 2 + 20, 1);
    } else if (r.from) {
      // Projectile: the floor light must reach back to the caster's hands
      const o = U.uOrigin.value, c = o.clone().add(r.from).multiplyScalar(0.5);
      const size = Math.max(L * 3 + 24, o.distanceTo(r.from) * 2 + 24);
      f.position.set(c.x, c.y, 0); f.scale.set(size, size, 1);
    } else {
      f.position.set(U.uOrigin.value.x, U.uOrigin.value.y, 0);
      f.scale.set(L * 3 + 24, L * 3 + 24, 1);
    }
  }

  /* ---------------- colours and gains ---------------- */
  #looks() {
    const p = this.p, U = this.U, C = this.C;
    const E = this.E = ELEMENTS[p.element] ?? ELEMENTS.fire;
    const R = this.R;
    const Q = QUALITY[setting("quality", "high")] ?? QUALITY.high;
    const O = this.req.recipe === "ray" ? (OUTCOMES[this.req.outcome] ?? OUTCOMES.hit) : OUTCOMES.hit;
    const I = p.intensity * O.intensity * setting("intensity", 1);
    this.I = I; this.O = O;
    const mode = U.uMode.value, L = U.uLength.value;
    let ramp = E.ramp, light = E.light, emberC = E.ember.color, smokeC = E.smoke.color, smokeG = E.smoke.glow, decalC = E.decalColor;
    let dark = !!E.dark, rim = E.rim || E.light;
    if (p.custom) {
      const core = linear(p.core), glow = linear(p.glow);
      dark = luma(core) < 0.06;
      rim = glow;
      ramp = dark
        ? [scaleA(core, 0.4), scaleA(core, 0.7), core, mixA(core, glow, 0.25)]
        : [scaleA(core, 0.12), scaleA(core, 0.55), mixA(core, [1, 1, 1], 0.25), mixA(core, [1, 1, 1], 0.8)];
      light = glow; emberC = glow; smokeG = glow; decalC = glow;
      smokeC = dark ? scaleA(core, 0.6) : mixA(smokeC, scaleA(core, 0.3), 0.5);
    }
    this.colors = { ramp, light, rim, dark };
    v3(C.uC0, ramp[0]); v3(C.uC1, ramp[1]); v3(C.uC2, ramp[2]); v3(C.uC3, ramp[3]); v3(C.uRim, rim);
    C.uDark.value = dark ? 1 : 0;
    for (const layer of [this.fire, this.trail]) setBlend(layer.mat, dark ? "normal" : "add");

    U.uEmit.value = p.emit; U.uTurb.value = E.turb * p.turb; U.uSize.value = 1.4 * p.size; U.uEdgeNoise.value = p.edge;

    const areaSize = mode === 0 ? Math.PI * L * L / 4 : mode === 1 ? L * 5 : mode === 3 ? L * L : Math.PI * L * L;
    const aRatio = areaSize / 707;
    const countK = clamp(aRatio, 0.22, 1);
    const scaleK = mode >= 2 ? clamp(L / 18, 0.4, 1.1) : 1;
    const live = Math.min(1, ((E.lifeMin + E.lifeMax) / 2) / p.emit);
    const density = (5000 / 707) / ((Q.fire * countK) / areaSize);
    const norm = density / (scaleK * scaleK) * (0.47 / live);
    const lineK = mode === 1 ? 0.75 : 1;

    const fu = this.fire.u;
    fu.uLifeMin.value = E.lifeMin; fu.uLifeMax.value = E.lifeMax;
    fu.uFireGain.value = Math.min(0.5, 0.028 * E.fireGain * I * norm * lineK);
    fu.uDarkAlpha.value = Math.min(0.9, 0.22 * I * norm);
    this.fire.geo.instanceCount = E.fireGain > 0 ? Math.round(Q.fire * countK) : 0;

    const su = this.smoke.u;
    v3(su.uSmokeColor, smokeC); v3(su.uSmokeGlow, smokeG);
    const smokeK = clamp(setting("smokeTime", 1), 0.2, 1.5);
    su.uLifeMin.value = E.smoke.lifeMin * smokeK; su.uLifeMax.value = E.smoke.lifeMax * smokeK;
    su.uSmokeGain.value = 0.16 * E.smoke.gain * Math.min(1.6, 650 / Q.smoke) * Math.min(1.3, 0.6 + I * 0.4) * (dark ? 1.4 : 1);
    this.smoke.geo.instanceCount = Math.round(Q.smoke * clamp(aRatio, 0.25, 1));

    const eu = this.embers.u;
    eu.uLifeMin.value = E.ember.lifeMin; eu.uLifeMax.value = E.ember.lifeMax;
    eu.uEmberDrag.value = E.ember.drag; eu.uEmberSpeed.value = E.ember.speed;
    eu.uEmberSize.value = E.ember.size * p.size; eu.uEmberStreak.value = E.ember.streak;
    eu.uEmberMode.value = E.ember.mode; v3(eu.uEmberColor, emberC);
    eu.uEmberGain.value = E.ember.gain * I * (p.custom && E.ember.gain === 0 ? 0 : 1);
    eu.uEmberBurst.value = Math.min(0.9, E.ember.burst * p.burst);
    eu.uEmberScatter.value = E.ember.scatter * p.burst;
    this.embers.geo.instanceCount = Math.min(MAX.ember, Math.round(Q.ember * E.ember.count * (0.75 + 0.25 * p.burst) * clamp(aRatio, 0.15, 1)));

    const M = MATERIALS[p.material] ?? MATERIALS.stone;
    this.M = M;
    if (E.debris) {
      const D = E.debris, du = this.debris.u;
      du.uLifeMin.value = D.lifeMin; du.uLifeMax.value = D.lifeMax; du.uEmberDrag.value = D.drag; du.uEmberSpeed.value = D.speed;
      du.uEmberSize.value = D.size * p.size * (M.shape === 2 ? 1.25 : 1); du.uEmberStreak.value = M.streak;
      du.uEmberBurst.value = Math.min(0.9, D.burst * p.burst); du.uEmberScatter.value = D.scatter;
      v3(du.uDebrisColor, M.color); du.uShape.value = M.shape;
      this.debris.geo.instanceCount = Math.min(this.debris.max, Math.round(Q.ember * 0.9 * D.count * clamp(aRatio, 0.2, 1) * I));
      v3(eu.uEmberColor, M.ember);
      eu.uEmberGain.value = (M.shape === 1 ? 1.1 : 0.3) * I;
      eu.uEmberStreak.value = M.shape === 1 ? 0.06 : 0.02;
    }

    const hot = dark ? rim : ramp[3];
    const warm = dark ? scaleA(rim, 0.8) : ramp[2];
    this.hot = hot; this.warm = warm;
    for (const m of [this.head, this.beam, ...this.dartHeads, ...this.dartTails, ...this.chainBeams]) {
      v3(m.material.uniforms.uCore, hot); v3(m.material.uniforms.uGlow, warm);
    }
    if (R.travel && !R.own) {
      const tu = this.trail.u;
      tu.uTrailLife.value = R.trail.life * p.trailLen;
      tu.uTrailWidth.value = R.trail.width * p.size * p.thickness;
      tu.uTrailSize.value = R.trail.size * p.size * Math.sqrt(p.thickness);
      this.trail.geo.instanceCount = Math.round(Q.trail * Math.min(1, Math.max(0.3, (this.flightLen ?? 60) / 60)));
      const tNorm = 1300 / Q.trail;
      tu.uFireGain.value = 0.11 * Math.max(E.fireGain, E.debris ? 0.12 : 0) * p.intensity * tNorm * (this.req.recipe === "ray" ? 1.4 : 1);
      tu.uDarkAlpha.value = Math.min(0.9, 0.35 * p.intensity * tNorm);
    }
    const mu = this.floor.material.uniforms;
    v3(mu.uLightColor, light); v3(mu.uDecalColor, decalC);
    mu.uLightGain.value = E.lightGain * Math.min(1.6, I) * (dark ? 0.5 : 1);
    mu.uDecalMode.value = setting("groundMarks", true) ? E.decal : 9;
  }

  /* ---------------- who reacts ---------------- */
  #planHits() {
    const r = this.req, U = this.U;
    const targets = r.targets ?? [];
    const hits = this.hits = [];
    this.impactTime = null;
    this.impactPoint = U.uOrigin.value.clone();
    if (r.recipe === "breath") {
      const o = U.uOrigin.value, aim = U.uDir.value, perp = new THREE.Vector2(-aim.y, aim.x);
      const L = U.uLength.value, line = U.uMode.value === 1;
      for (const t of targets) {
        const rx = t.ft.x - o.x, ry = t.ft.y - o.y;
        const along = rx * aim.x + ry * aim.y, lat = Math.abs(rx * perp.x + ry * perp.y);
        const inside = line ? along > -t.r && along < L + t.r && lat <= (U.uLineWidth.value / 2) + t.r
          : along > 0 && Math.hypot(rx, ry) <= L + t.r && lat <= along * U.uHalfTan.value + t.r;
        if (inside) hits.push({ t, time: 0.4 * clamp(along / L, 0, 1), dx: aim.x, dy: aim.y, mag: 0.75, sustained: true });
      }
      if (hits.length) { const first = hits.reduce((a, b) => (a.time < b.time ? a : b)); this.impactTime = first.time; this.impactPoint = first.t.ft.clone(); }
    } else if (r.recipe === "field") {
      const c = U.uOrigin.value, half = U.uLength.value / 2;
      for (const t of targets) {
        if (Math.abs(t.ft.x - c.x) <= half + t.r && Math.abs(t.ft.y - c.y) <= half + t.r) {
          const dx = t.ft.x - c.x, dy = t.ft.y - c.y, d = Math.hypot(dx, dy) || 1;
          hits.push({ t, time: 0.15 + 0.1 * this.rnd(), dx: dx / d, dy: dy / d, mag: 0.35, sustained: true });
        }
      }
      this.impactTime = 0.15;
    } else if (r.recipe === "darts") {
      const tgt = r.mainTarget;
      const dir = r.to.clone().sub(r.from).normalize();
      for (let i = 0; i < (r.darts ?? this.p.darts ?? 3); i++) {
        if (tgt) hits.push({ t: tgt, time: this.travel + i * this.R.stagger, dx: dir.x, dy: dir.y, mag: 0.45, hop: true });
      }
      this.impactTime = this.travel; this.impactPoint = r.to.clone();
    } else if (r.recipe === "chain") {
      (r.chainTargets ?? []).forEach((t, i) => {
        const p = r.chain[i + 1], prev = r.chain[i];
        if (!t || !p) return;
        const d = p.clone().sub(prev).normalize();
        hits.push({ t, time: this.hopTimes[i + 1], dx: d.x, dy: d.y, mag: i === 0 ? 1 : 0.8, hop: true });
      });
      this.impactTime = this.travel; this.impactPoint = r.to.clone();
    } else if (r.recipe === "ray") {
      const O = this.O, tgt = r.mainTarget;
      const dir = r.to.clone().sub(r.from).normalize();
      if (tgt && !O.miss) hits.push({ t: tgt, time: this.travel, dx: dir.x, dy: dir.y, mag: r.outcome === "crit" ? 1.7 : O.neutral ? 0.45 : 1 });
      if (tgt && O.miss) {
        const side = (tgt.ft.x - r.from.x) * -dir.y + (tgt.ft.y - r.from.y) * dir.x >= 0 ? 1 : -1;
        hits.push({ t: tgt, time: this.travel * 0.45, dx: -dir.y * side, dy: dir.x * side, mag: 1.1, dodge: true });
      }
      this.impactTime = this.travel; this.impactPoint = this.to.clone();
    } else {
      const c = U.uOrigin.value, Rr = U.uLength.value;
      for (const t of targets) {
        const dx = t.ft.x - c.x, dy = t.ft.y - c.y, d = Math.hypot(dx, dy);
        if (d <= Rr + t.r) {
          const n = d > 0.5 ? [dx / d, dy / d] : [1, 0];
          hits.push({ t, time: this.travel + 0.25 * clamp(d / Rr, 0, 1), dx: n[0], dy: n[1], mag: 1.2 - 0.6 * clamp(d / Rr, 0, 1) });
        }
      }
      this.impactTime = this.travel;
    }
    for (const h of hits) h.done = false;
  }

  #applyHit(h) {
    const p = this.p;
    const flashCol = mixA(this.colors.light, [1, 1, 1], 0.55).map((v) => v * 1.5);
    const tremble = h.sustained && !this.o.reduceMotion ? { amp: 0.09 * p.knockback, ms: p.emit * 1000 } : null;
    this.fx.react(h.t.token, new THREE.Vector2(h.dx, h.dy), h.mag, {
      knockback: p.knockback, dodge: h.dodge, flash: h.dodge ? 0 : p.flash * Math.min(1.3, h.mag), flashCol, tremble,
    });
    if (h.hop) this.hopRingSpecs.push({ c: h.t.ft.clone(), t0: this.clock, r: h.t.r });
  }

  #impact() {
    const r = this.req, p = this.p;
    const crit = r.recipe === "ray" && r.outcome === "crit";
    const miss = r.recipe === "ray" && r.outcome === "miss";
    const hidden = r.recipe === "ray" && r.outcome === "hidden";
    const k = crit ? 1.5 : miss ? 0.35 : hidden ? 0.55 : 1;
    this.hitstop = (p.hitstop / 1000) * k;
    const shake = 0.28 * (this.E.shake ?? 1) * p.intensity * (this.R.shake ?? 1) * (this.O.shake ?? 1) * 0.5;
    this.o.punch({ shake, zoom: 0.03 * p.punch * k, at: this.impactPoint });
  }

  /* ---------------- per frame ---------------- */
  update(dt, now) {
    let tScale = 1;
    if (this.hitstop > 0) { this.hitstop -= dt; tScale = 0; }
    this.clock += dt * tScale;
    const T = this.clock, travel = this.travel, tA = T - travel;
    for (const h of this.hits) if (!h.done && T >= h.time) { h.done = true; this.#applyHit(h); }
    if (!this.impactFired && this.impactTime !== null && T >= this.impactTime) { this.impactFired = true; this.#impact(); }

    const r = this.req, R = this.R, p = this.p, U = this.U, E = this.E;
    U.uTime.value = tA;
    this.P.uPT.value = T;
    const clock = now;
    const mu = this.floor.material.uniforms;
    const markT = clamp(setting("markTime", 12), 2, 30);
    mu.uDecalFade.value = 1 - smoothstep(markT * 0.7, markT, tA);

    // Classic projectile (lob, ray)
    const flying = R.travel && !R.own && T >= 0 && T <= travel;
    this.head.visible = false; this.rock.visible = false;
    mu.uProjOn.value = 0;
    if (this.charge && T < 0) {
      const k = 1 + T / this.charge, e = k * k * (3 - 2 * k);
      const from = r.from;
      const sc = (R.head ?? 1) * p.size * p.thickness * (0.3 + 0.95 * e) * (0.9 + 0.1 * Math.sin(clock * 55));
      this.head.visible = true;
      this.head.position.set(from.x, from.y, 0); this.head.scale.set(sc * 2.4, sc * 2.4, 1);
      this.head.material.uniforms.uGain.value = p.intensity * (0.5 + 0.7 * e) * (this.colors.dark ? 0.7 : 1);
      this.head.material.uniforms.uClock.value = clock;
      mu.uProjPos.value.set(from.x, from.y); mu.uProjOn.value = 0.3 + 0.9 * e;
    }
    if (flying) {
      const s = T / travel;
      const from = r.from, to = this.to;
      const dir = to.clone().sub(from).normalize();
      const f = p.wobbleFreq * Math.PI * 2, so = this.seedOff;
      const sway = p.wobble * (Math.sin(s * f + so) * 0.65 + Math.sin(s * f * 2.7 + so * 1.7) * 0.35);
      const hx = from.x + (to.x - from.x) * s - dir.y * sway, hy = from.y + (to.y - from.y) * s + dir.x * sway;
      const h = 4 * s * (1 - s) * p.arc;
      const sc = (R.head ?? 1) * p.size * p.thickness * (1 + h * 0.9) * (0.92 + 0.08 * Math.sin(clock * 40));
      if (E.debris) {
        this.rock.visible = true;
        this.rock.position.set(hx, hy, 0); this.rock.scale.set(sc * 1.6, sc * 1.6, 1);
        const M = this.M;
        this.rock.material.uniforms.uCore.value.set(M.color[0] * 1.3, M.color[1] * 1.3, M.color[2] * 1.3);
        this.rock.material.uniforms.uClock.value = T; this.rock.material.uniforms.uLen.value = M.shape;
      } else {
        this.head.visible = true;
        this.head.position.set(hx, hy, 0); this.head.scale.set(sc * 2.2, sc * 2.2, 1);
        this.head.material.uniforms.uGain.value = p.intensity * (this.colors.dark ? 0.7 : 1);
        this.head.material.uniforms.uClock.value = clock;
      }
      mu.uProjPos.value.set(hx, hy); mu.uProjOn.value = 0.9 + h * 0.4;
    }
    if (R.beam && !E.arcs && !E.debris && T >= 0 && T <= travel + 0.45) {
      const s = Math.min(1, T / travel);
      const ex = flying ? this.head.position.x : r.from.x + (this.to.x - r.from.x) * s;
      const ey = flying ? this.head.position.y : r.from.y + (this.to.y - r.from.y) * s;
      const len = Math.hypot(ex - r.from.x, ey - r.from.y);
      const b = this.beam;
      b.visible = len > 0.05;
      b.position.set((r.from.x + ex) / 2, (r.from.y + ey) / 2, 0);
      b.rotation.z = Math.atan2(ey - r.from.y, ex - r.from.x);
      b.scale.set(Math.max(len, 0.01), 1.6 * p.size * p.thickness, 1);
      b.material.uniforms.uGain.value = p.intensity * this.O.intensity * (T > travel ? 1 - (T - travel) / 0.45 : 1) * (this.colors.dark ? 0.8 : 1);
      b.material.uniforms.uClock.value = clock; b.material.uniforms.uLen.value = len;
    } else this.beam.visible = false;

    // Column descent
    if (r.recipe === "column" && T >= 0 && T <= travel) {
      const s = T / travel, Rr = U.uLength.value;
      if (E.debris) {
        const M = this.M;
        this.rock.visible = true;
        this.rock.position.set(r.at.x, r.at.y, 0);
        this.rock.scale.set(Rr * (1.6 - 1.1 * s), Rr * (1.6 - 1.1 * s), 1);
        this.rock.material.uniforms.uCore.value.set(M.color[0] * 1.3, M.color[1] * 1.3, M.color[2] * 1.3);
        this.rock.material.uniforms.uClock.value = T * 0.6; this.rock.material.uniforms.uLen.value = M.shape;
      } else {
        const sc = Rr * (2.4 - 1.9 * s * s);
        this.head.visible = true;
        this.head.position.set(r.at.x, r.at.y, 0); this.head.scale.set(sc, sc, 1);
        this.head.material.uniforms.uGain.value = p.intensity * (0.25 + 1.1 * s * s);
        this.head.material.uniforms.uClock.value = clock;
      }
      mu.uProjPos.value.copy(r.at); mu.uProjOn.value = 0.4 + 1.6 * s * s;
    }

    // Darts
    this.dartHeads.forEach((m, i) => {
      const tail = this.dartTails[i];
      const t0 = i * R.stagger;
      const s = i < (r.darts ?? p.darts ?? 3) ? (T - t0) / travel : -1;
      if (s < 0 || s > 1) { m.visible = false; tail.visible = false; return; }
      const A = r.from, B = r.to;
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
      const side = (i % 2 ? 1 : -1) * (0.25 + 0.12 * (i >> 1));
      const cx = A.x + dx * 0.35 - (dy / L) * L * side, cy = A.y + dy * 0.35 + (dx / L) * L * side;
      const bez = (u) => [(1 - u) * (1 - u) * A.x + 2 * (1 - u) * u * cx + u * u * B.x, (1 - u) * (1 - u) * A.y + 2 * (1 - u) * u * cy + u * u * B.y];
      const [hx, hy] = bez(s), [tx, ty] = bez(Math.max(0, s - 0.16));
      m.visible = true;
      m.position.set(hx, hy, 0);
      const sc = 1.9 * p.thickness * p.size;
      m.scale.set(sc, sc, 1);
      m.material.uniforms.uGain.value = p.intensity; m.material.uniforms.uClock.value = clock + i;
      const len = Math.hypot(hx - tx, hy - ty);
      tail.visible = len > 0.05;
      tail.position.set((hx + tx) / 2, (hy + ty) / 2, 0);
      tail.rotation.z = Math.atan2(hy - ty, hx - tx);
      tail.scale.set(len, 0.8 * p.thickness * p.size, 1);
      tail.material.uniforms.uGain.value = p.intensity * 0.8;
      tail.material.uniforms.uClock.value = clock; tail.material.uniforms.uLen.value = len;
      if (i === 0) { mu.uProjPos.value.set(hx, hy); mu.uProjOn.value = 0.6; }
    });

    // Chain legs (beams for any element; arcs added for electricity)
    const chain = r.recipe === "chain";
    const chainEnd = chain ? this.hopTimes[this.hopTimes.length - 1] : 0;
    this.chainBeams.forEach((m, i) => {
      if (!chain || E.arcs || i + 1 >= r.chain.length) { m.visible = false; return; }
      const a = r.chain[i], b = r.chain[i + 1];
      const t0 = this.hopTimes[i] + (i > 0 ? 0.08 : 0), t1 = this.hopTimes[i + 1];
      if (T < t0 || T > chainEnd + 0.5) { m.visible = false; return; }
      const f = clamp((T - t0) / Math.max(0.01, t1 - t0), 0, 1);
      const ex = a.x + (b.x - a.x) * f, ey = a.y + (b.y - a.y) * f;
      const len = Math.hypot(ex - a.x, ey - a.y);
      m.visible = len > 0.05;
      m.position.set((a.x + ex) / 2, (a.y + ey) / 2, 0);
      m.rotation.z = Math.atan2(ey - a.y, ex - a.x);
      m.scale.set(len, 1.3 * p.size * p.thickness, 1);
      m.material.uniforms.uGain.value = p.intensity * (T > chainEnd ? 1 - (T - chainEnd) / 0.5 : 1);
      m.material.uniforms.uClock.value = clock; m.material.uniforms.uLen.value = len;
    });

    // Hop rings
    this.hopRings.forEach((m, i) => {
      const sp = this.hopRingSpecs[i];
      if (!sp) { m.visible = false; return; }
      const f = (this.clock - sp.t0) / 0.35;
      if (f < 0 || f > 1) { m.visible = false; return; }
      const u = m.material.uniforms;
      u.uC.value.copy(sp.c);
      u.uR.value = sp.r * (0.8 + 1.4 * (1 - Math.pow(1 - f, 3)));
      u.uW.value = 0.3; u.uA.value = (1 - f) * 1.2 * p.intensity;
      v3(u.uCol, this.warm);
      m.visible = true;
      m.position.set(sp.c.x, sp.c.y, 0);
      const sz = (sp.r * 2.4 + 2) * 2.2;
      m.scale.set(sz, sz, 1);
    });

    // Lightning
    const arcAreaLife = p.emit + (U.uMode.value === 2 ? 0.3 : 0.15);
    const arcChain = E.arcs && chain && T >= 0 && T <= chainEnd + 0.4;
    const arcFlight = E.arcs && R.travel && !R.own && T >= 0 && T <= travel;
    const arcArea = E.arcs && !chain && tA >= 0 && tA <= arcAreaLife;
    if (arcFlight || arcArea || arcChain) {
      this.arcTimer -= dt;
      if (this.arcTimer <= 0) { this.#regenArcs(arcChain ? "chain" : arcFlight ? "flight" : "area", T); this.arcTimer = 0.05; }
      const glow = p.custom ? linear(p.glow) : E.light;
      v3(this.arcMat.uniforms.uGlow, glow);
      v3(this.arcMat.uniforms.uCore, p.custom && this.colors.dark ? glow : [0.9, 0.95, 1.0]);
      this.arcMat.uniforms.uGain.value = p.intensity * (arcArea ? 1 - smoothstep(arcAreaLife * 0.6, arcAreaLife, tA) : 1);
      this.arcMesh.visible = true;
    } else this.arcMesh.visible = false;

    // Wave rings
    const rs = E.rings;
    this.rings.forEach((m, i) => {
      if (!rs || i >= rs.count) { m.visible = false; return; }
      const t = tA - i * rs.every;
      if (t < 0 || t > rs.dur) { m.visible = false; return; }
      const f = t / rs.dur, ease = 1 - Math.pow(1 - f, 3);
      const R1 = rs.r1f * U.uLength.value;
      const u = m.material.uniforms;
      u.uR.value = 0.5 + (R1 - 0.5) * ease;
      u.uW.value = rs.w * (1 + f) * Math.max(0.6, U.uLength.value / 15);
      u.uA.value = rs.a * (1 - f) * p.intensity;
      const col = p.custom ? linear(p.glow) : rs.color;
      u.uCol.value.set(col[0], col[1], col[2]);
      m.visible = true;
      m.position.set(U.uOrigin.value.x, U.uOrigin.value.y, 0);
      const sz = (R1 + 6) * 2.2;
      m.scale.set(sz, sz, 1);
    });

    // Particles are done after the emission plus their longest life; the floor mark fades later.
    const particlesEnd = travel + p.emit + 4.5;
    const particlesOn = T < particlesEnd;
    for (const l of [this.fire, this.smoke, this.embers, this.debris, this.trail]) l.mesh.visible = particlesOn && l.geo.instanceCount > 0;
    const end = (mu.uDecalMode.value < 8.5 ? travel + Math.max(clamp(setting("markTime", 12), 2, 30), 4.5) : particlesEnd);
    return T < end;
  }

  #regenArcs(stage, T) {
    const segs = this.arcGeo.getAttribute("aSeg"), wa = this.arcGeo.getAttribute("aWA");
    let n = 0;
    const rnd = mulberry32(this.arcSeed++);
    const MAXA = this.arcMax, p = this.p, sz = p.size;
    const bolt = (x0, y0, x1, y1, steps, jag, width, alpha, fork = 0.18) => {
      let px = x0, py = y0;
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      for (let s = 1; s <= steps && n < MAXA; s++) {
        const f = s / steps;
        const off = s === steps ? 0 : (rnd() - 0.5) * jag * Math.sin(f * Math.PI);
        const qx = x0 + dx * f + nx * off, qy = y0 + dy * f + ny * off;
        segs.setXYZW(n, px, py, qx, qy); wa.setXY(n, width, alpha); n++;
        if (rnd() < fork && n < MAXA - 6) {
          const ba = Math.atan2(dy, dx) + (rnd() - 0.5) * 2.0, bl = L * (0.12 + 0.2 * rnd());
          let bx = qx, by = qy;
          for (let k = 1; k <= 3 && n < MAXA; k++) {
            const ex = qx + Math.cos(ba) * bl * k / 3 + (rnd() - 0.5) * bl * 0.3, ey = qy + Math.sin(ba) * bl * k / 3 + (rnd() - 0.5) * bl * 0.3;
            segs.setXYZW(n, bx, by, ex, ey); wa.setXY(n, width * 0.55, alpha * 0.6); n++;
            bx = ex; by = ey;
          }
        }
        px = qx; py = qy;
      }
    };
    const U = this.U, r = this.req;
    const o = U.uOrigin.value, d = U.uDir.value, L = U.uLength.value, mode = U.uMode.value;
    if (stage === "chain") {
      for (let i = 0; i + 1 < r.chain.length; i++) {
        const a = r.chain[i], b = r.chain[i + 1];
        const t0 = this.hopTimes[i] + (i > 0 ? 0.08 : 0), t1 = this.hopTimes[i + 1];
        if (T < t0) break;
        const f = clamp((T - t0) / Math.max(0.01, t1 - t0), 0, 1);
        const ex = a.x + (b.x - a.x) * f, ey = a.y + (b.y - a.y) * f;
        const len = Math.hypot(ex - a.x, ey - a.y);
        if (len < 0.2) continue;
        bolt(a.x, a.y, ex, ey, Math.max(6, Math.round(len / 1.6)), 1.6 * sz, 0.75 * p.thickness, 1, 0.14);
        bolt(a.x, a.y, ex, ey, Math.max(6, Math.round(len / 1.6)), 2.4 * sz, 0.4 * p.thickness, 0.5, 0.05);
      }
      for (let i = 1; i < r.chain.length; i++) {
        if (T < this.hopTimes[i]) break;
        const q = r.chain[i];
        for (let k = 0; k < 3; k++) { const ang = rnd() * 6.28, l = 1.5 + 2 * rnd(); bolt(q.x, q.y, q.x + Math.cos(ang) * l, q.y + Math.sin(ang) * l, 5, l * 0.4, 0.4, 0.7); }
      }
    } else if (stage === "flight") {
      const h = this.head.visible ? this.head.position : this.rock.position;
      const len = Math.hypot(h.x - r.from.x, h.y - r.from.y);
      bolt(r.from.x, r.from.y, h.x, h.y, Math.max(6, Math.round(len / 1.6)), 1.4 * sz, 0.75 * p.thickness, 1, 0.12);
      bolt(r.from.x, r.from.y, h.x, h.y, Math.max(6, Math.round(len / 1.6)), 2.2 * sz, 0.4 * p.thickness, 0.5, 0.06);
    } else if (mode === 0) {
      for (let i = 0; i < 6; i++) {
        const a = (rnd() * 2 - 1) * U.uHalfAng.value * 0.9, len = L * (0.55 + 0.45 * rnd());
        const ex = o.x + (d.x * Math.cos(a) - d.y * Math.sin(a)) * len, ey = o.y + (d.x * Math.sin(a) + d.y * Math.cos(a)) * len;
        bolt(o.x, o.y, ex, ey, 12, len * 0.14 * sz, 0.6, 0.7 + 0.3 * rnd());
      }
    } else if (mode === 1) {
      const ex = o.x + d.x * L, ey = o.y + d.y * L;
      bolt(o.x, o.y, ex, ey, 26, 1.6 * sz, 0.9, 1, 0.22);
      bolt(o.x, o.y, ex, ey, 22, 2.4 * sz, 0.45, 0.55, 0.1);
    } else {
      const count = L > 8 ? 10 : 6;
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2, len = L * (0.5 + 0.5 * rnd());
        const x0 = o.x + (rnd() - 0.5) * 0.8, y0 = o.y + (rnd() - 0.5) * 0.8;
        bolt(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, 9, len * 0.3 * sz, 0.55, 0.6 + 0.4 * rnd());
      }
    }
    this.arcGeo.instanceCount = n;
    segs.needsUpdate = true; wa.needsUpdate = true;
  }

  /**
   * Walls stop an area: Foundry works out what the blast reaches from its origin (the same sweep it uses for
   * movement), and everything that belongs to the area is clipped to it through the stencil buffer.
   */
  #wallMask() {
    this.reach = null;
    const r = this.req;
    if (!["breath", "fireball", "point", "column", "field"].includes(r.recipe) || r.collapse) return;
    if (setting("wallsBlock", true) === false) return;
    try {
      const o = this.U.uOrigin.value, k = this.o.ppf;
      const L = Math.max(this.U.uLength.value, r.side ?? 0);
      // Flames, sparks and smoke that reach a wall bounce off it
      setWalls(this.U, this.o, o, L * 1.3 + 8);
      const originPx = this.o.toPx(o);
      // The origin of a breath sits on the dragon's edge; step a hair forward so its own token wall does not swallow it
      const backend = globalThis.CONFIG?.Canvas?.polygonBackends?.move ?? foundry?.canvas?.geometry?.ClockwiseSweepPolygon;
      if (!backend?.create) return;
      const poly = backend.create(originPx, { type: "move", radius: (L * 1.25 + 6) * k });
      const pts = poly?.points;
      if (!pts || pts.length < 6) return;
      // Nothing blocks it: skip the mask altogether
      const full = Math.PI * ((L * 1.25 + 6) * k) ** 2;
      let area = 0;
      for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; area += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; }
      if (Math.abs(area) / 2 > full * 0.985) return;
      this.reach = poly;
      // Triangle fan from the origin (the sweep is star-shaped around it), in feet
      const verts = [];
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const a = this.o.toFeet({ x: pts[i * 2], y: pts[i * 2 + 1] }), b = this.o.toFeet({ x: pts[((i + 1) % n) * 2], y: pts[((i + 1) % n) * 2 + 1] });
        verts.push(o.x, o.y, 0, a.x, a.y, 0, b.x, b.y, 0);
      }
      // The bundled three.js is trimmed: reach the base classes through the instanced ones
      const BufferGeometry = Object.getPrototypeOf(THREE.InstancedBufferGeometry);
      const BufferAttribute = Object.getPrototypeOf(THREE.InstancedBufferAttribute);
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(new Float32Array(verts), 3));
      const ref = this.o.nextStencil();
      const maskMat = () => new THREE.ShaderMaterial({ vertexShader: MASK_VS, fragmentShader: MASK_FS, side: 2, colorWrite: false, depthWrite: false, depthTest: false,
        stencilWrite: true, stencilRef: ref, stencilFunc: STENCIL.always, stencilZPass: STENCIL.replace, stencilFail: STENCIL.replace, stencilZFail: STENCIL.replace });
      for (const g of [this.group, this.under]) {
        const m = new THREE.Mesh(geo, maskMat());
        m.frustumCulled = false; m.renderOrder = -100;
        g.add(m);
      }
      this.maskGeo = geo;
      // Everything that belongs to the area obeys the mask; the projectile's flight (head, trail, beams) does not
      const keepFree = new Set([this.head, this.beam, this.trail.mesh, ...this.dartHeads, ...this.dartTails, ...this.chainBeams]);
      for (const g of [this.group, this.under]) g.traverse((m) => {
        if (!m.material || keepFree.has(m) || m.renderOrder === -100) return;
        Object.assign(m.material, { stencilWrite: true, stencilRef: ref, stencilFunc: STENCIL.equal,
          stencilFail: STENCIL.keep, stencilZFail: STENCIL.keep, stencilZPass: STENCIL.keep });
        m.material.needsUpdate = true;
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | wall clipping skipped`, err);
      this.reach = null;
    }
  }

  /** Is this point (feet) inside what the blast reaches? */
  reaches(ft) {
    if (!this.reach) return true;
    try { const p = this.o.toPx(ft); return this.reach.contains(p.x, p.y); } catch { return true; }
  }

  dispose() {
    this.arcGeo.dispose();
    this.maskGeo?.dispose();
    disposeGroup(this.under);
    disposeGroup(this.group);
  }
}
