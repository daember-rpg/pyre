import * as THREE from "../vendor/three.js";
import { MODULE_ID } from "../constants.js";
import { QUAD_VS } from "./shaders-lab.js";
import { FLASH_FS } from "./shaders-pyre.js";
import { BLEND } from "./util.js";

/** Token radius in feet. */
export function tokenRadiusFt(token) {
  const d = canvas.dimensions;
  return ((token.document.width ?? 1) * d.distance) / 2 * 0.92;
}

/** Token centre in overlay feet (follows movement animation). */
export function tokenFt(overlay, token) {
  const c = token.center ?? { x: token.x + token.w / 2, y: token.y + token.h / 2 };
  return overlay.toFeet(c);
}

function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key); } catch { return fallback; }
}

const PLANE = new THREE.PlaneGeometry(1, 1);

/**
 * Visual-only reactions on real tokens: knockback, squash, spin, tremble and a flash.
 * The token document never changes; the mesh is nudged and handed back to Foundry at rest.
 */
export class TokenFX {
  constructor(overlay) {
    this.overlay = overlay;
    this.states = new Map();   // token.id → state
  }

  #state(token) {
    let st = this.states.get(token.id);
    if (!st) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Vector3(1, 1, 1) }, uA: { value: 0 }, uDark: { value: 0 } },
        vertexShader: QUAD_VS, fragmentShader: FLASH_FS, transparent: true, depthTest: false, depthWrite: false, ...BLEND.premult,
      });
      const flash = new THREE.Mesh(PLANE, mat);
      flash.frustumCulled = false; flash.renderOrder = 0.6; flash.visible = false;
      this.overlay.scene.add(flash);
      st = { token, ox: 0, oy: 0, vx: 0, vy: 0, s: 1, vs: 0, rot: 0, vrot: 0, flash: 0, flashCol: [1, 1, 1], dark: false,
        tremble: 0, trembleUntil: 0, base: null, written: null, flashMesh: flash, alphaOverride: null };
      this.states.set(token.id, st);
      this.overlay.addTicker(this);
    }
    st.token = token;
    return st;
  }

  /**
   * Push a token. dir is in overlay feet (+y up). mag ~1 = a solid hit.
   * opts: { squash, spin, flash, flashCol, dark, dodge, tremble (seconds) }
   */
  react(token, dir, mag, opts = {}) {
    if (!token?.mesh || token.destroyed) return;
    const st = this.#state(token);
    const motion = this.overlay.reduceMotion || !setting("tokenReactions", true) ? 0 : 1;
    const k = opts.dodge ? 1 : (opts.knockback ?? 1);
    const v = 17 * k * mag * motion;
    st.vx += dir.x * v; st.vy += dir.y * v;
    if (!opts.dodge) {
      if (opts.squash !== false) { st.s = 1 - 0.2 * Math.min(1.5, mag) * motion; st.vs = 0; }
      if (opts.spin !== false) st.vrot += (Math.random() < 0.5 ? -1 : 1) * 4 * mag * motion * Math.min(1, k);
      if (opts.flash) {
        st.flash = Math.max(st.flash, opts.flash);
        st.flashCol = opts.flashCol ?? [1, 1, 1];
        st.dark = !!opts.dark;
      }
    }
    if (opts.tremble) { st.tremble = Math.max(st.tremble, opts.tremble.amp ?? 0.09); st.trembleUntil = performance.now() + opts.tremble.ms; }
    this.overlay.addTicker(this);
  }

  /** Raw velocity kick (wind-up, lunge, recoil), no squash or flash. dir in feet. */
  nudge(token, dir, speed) {
    if (!token?.mesh || this.overlay.reduceMotion || !setting("tokenReactions", true)) return;
    const st = this.#state(token);
    st.vx += dir.x * speed; st.vy += dir.y * speed;
    this.overlay.addTicker(this);
  }

  /** Current visual offset of a token in feet (follows lunges and knockback). */
  offset(token) {
    const st = this.states.get(token?.id);
    return st ? { x: st.ox, y: st.oy } : { x: 0, y: 0 };
  }

  /** Squash/pulse without a push (casting, blessing). */
  pulse(token, scale = 0.9, flash = 0, flashCol = [1, 1, 1]) {
    if (!token?.mesh) return;
    const st = this.#state(token);
    if (!this.overlay.reduceMotion) { st.s = scale; st.vs = 0; }
    if (flash) { st.flash = Math.max(st.flash, flash); st.flashCol = flashCol; st.dark = false; }
    this.overlay.addTicker(this);
  }

  update(dt) {
    let any = false;
    for (const [id, st] of this.states) {
      const token = st.token;
      if (!token || token.destroyed || !token.mesh) { this.#drop(id, st); continue; }
      st.vx += (-150 * st.ox - 13 * st.vx) * dt; st.vy += (-150 * st.oy - 13 * st.vy) * dt;
      st.ox += st.vx * dt; st.oy += st.vy * dt;
      st.vs += (-260 * (st.s - 1) - 9 * st.vs) * dt; st.s += st.vs * dt;
      st.vrot += (-200 * st.rot - 12 * st.vrot) * dt; st.rot += st.vrot * dt;
      st.flash *= Math.exp(-dt * 7);
      if (performance.now() > st.trembleUntil) st.tremble *= Math.exp(-dt * 10);
      const settled = Math.abs(st.ox) + Math.abs(st.oy) < 0.005 && Math.abs(st.vx) + Math.abs(st.vy) < 0.02 &&
        Math.abs(st.s - 1) < 0.002 && Math.abs(st.vs) < 0.02 && Math.abs(st.rot) < 0.002 && st.flash < 0.01 && st.tremble < 0.003;
      if (settled) { this.#drop(id, st); continue; }
      any = true;
      this.#apply(st);
    }
    return any;
  }

  #apply(st) {
    const mesh = st.token.mesh;
    const k = this.overlay.ppf;
    // Foundry may have moved the mesh since our last write (token animation): take that as the new base.
    if (!st.base || !st.written || Math.abs(mesh.x - st.written.x) > 0.5 || Math.abs(mesh.y - st.written.y) > 0.5) {
      st.base = { x: mesh.x, y: mesh.y, sx: mesh.scale.x, sy: mesh.scale.y, r: mesh.rotation };
    }
    const jx = st.tremble ? (Math.random() - 0.5) * 2 * st.tremble : 0, jy = st.tremble ? (Math.random() - 0.5) * 2 * st.tremble : 0;
    const x = st.base.x + (st.ox + jx) * k, y = st.base.y - (st.oy + jy) * k;
    mesh.position.set(x, y);
    mesh.scale.set(st.base.sx * st.s, st.base.sy * (2 - st.s));
    mesh.rotation = st.base.r + st.rot * 0.08;
    st.written = { x, y };
    // Flash disc in the overlay
    const fm = st.flashMesh;
    fm.visible = st.flash > 0.01 && st.token.visible !== false;
    if (fm.visible) {
      const c = this.overlay.toFeet({ x, y });
      const r = tokenRadiusFt(st.token);
      fm.position.set(c.x, c.y, 0);
      fm.scale.set(r * 2.3, r * 2.3, 1);
      fm.material.uniforms.uA.value = Math.min(1, st.flash) * 0.85;
      fm.material.uniforms.uCol.value.set(...st.flashCol);
      fm.material.uniforms.uDark.value = st.dark ? 1 : 0;
    }
  }

  #drop(id, st) {
    const mesh = st.token?.mesh;
    if (mesh && !mesh.destroyed && st.base) {
      mesh.position.set(st.base.x, st.base.y);
      mesh.scale.set(st.base.sx, st.base.sy);
      mesh.rotation = st.base.r;
    }
    try { st.token?.renderFlags?.set?.({ refreshPosition: true, refreshMesh: true, refreshSize: true }); } catch { /* older API */ }
    this.overlay.scene.remove(st.flashMesh);
    st.flashMesh.material.dispose();
    this.states.delete(id);
  }

  reset() { for (const [id, st] of this.states) this.#drop(id, st); }
}
