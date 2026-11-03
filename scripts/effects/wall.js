import * as THREE from "../vendor/three.js";
import * as GL from "../core/shaders-lab.js";
import { particles, quad, disposeGroup } from "../core/layers.js";
import { v3 } from "../core/util.js";
import { MODULE_ID } from "../constants.js";

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }
const QK = { low: 0.5, medium: 0.8, high: 1 };
/** What broke the wall tints its pieces: [edge glow colour, glow strength, palette override] */
const CAUSE = {
  fire: { hot: [1.0, 0.45, 0.1], k: 1.6, wood: { a: [0.07, 0.05, 0.04], b: [0.28, 0.2, 0.14], dust: [0.25, 0.22, 0.2] } },
  acid: { hot: [0.5, 1.0, 0.15], k: 0.9 },
  electricity: { hot: [0.55, 0.7, 1.0], k: 1.2 },
  cold: { hot: [0.75, 0.92, 1.0], k: 0.8, all: { a: [0.45, 0.55, 0.62], b: [0.85, 0.94, 1.0], dust: [0.75, 0.85, 0.92] } },
  sonic: { hot: [1.0, 0.95, 0.85], k: 0.5 },
  force: { hot: [0.75, 0.6, 1.0], k: 0.9 },
};
const PAL = {
  stone: { a: [0.14, 0.13, 0.12], b: [0.52, 0.49, 0.45], dust: [0.46, 0.42, 0.37] },
  wood:  { a: [0.2, 0.12, 0.06], b: [0.6, 0.42, 0.24], dust: [0.45, 0.36, 0.26] },
  metal: { a: [0.18, 0.19, 0.21], b: [0.62, 0.64, 0.68], dust: [0.42, 0.42, 0.44] },
  glass: { a: [0.35, 0.45, 0.5], b: [0.85, 0.95, 1.0], dust: [0.6, 0.66, 0.7] },
};

/**
 * A wall breaking (chunks fly out, mostly away from the blast, and land as rubble in a cloud of dust)
 * or being restored (the rubble rises and flies back into the wall, which closes with a seam of light).
 * req = { a, b (feet), material, side (-1, 0, 1: which side of the wall the chunks fly to), rebuild }
 */
export class WallEffect {
  constructor(overlay, req) {
    this.o = overlay; this.req = req;
    this.group = new THREE.Group(); overlay.scene.add(this.group);
    this.under = new THREE.Group(); overlay.underScene().add(this.under);
    this.clock = 0; this.hitstop = 0;
    this.dur = req.rebuild ? 1.5 : 2.8;
    const len = req.a.distanceTo(req.b);
    const C = CAUSE[req.cause] ?? null;
    // A door bursts into a few long planks, a window into a spray of small shards, a wall into chunks
    const glass = req.material === "glass", door = req.kind === "door";
    const size = door ? 1.7 : glass ? 0.5 : req.material === "wood" ? 1.1 : 1.25;
    const density = door ? 4 : glass ? 16 : 9, dustK = glass ? 0.5 : door ? 1.2 : 1.6;
    const pal = (C && (C[req.material] ?? C.all)) ?? PAL[req.material] ?? PAL.stone, q = QK[setting("quality", "high")] ?? 1;
    const U = (mode) => ({ uA: { value: req.a.clone() }, uB: { value: req.b.clone() }, uT: { value: 0 }, uSide: { value: req.side ?? 0 }, uMode: { value: mode },
      uRev: { value: req.rebuild ? 1 : 0 }, uSize: { value: size }, uFade: { value: 1 }, uNoise: { value: overlay.noise }, uGlass: { value: glass ? 1 : 0 },
      uWood: { value: req.material === "wood" ? 1 : 0 }, uPalA: { value: new THREE.Vector3(...pal.a) }, uPalB: { value: new THREE.Vector3(...pal.b) },
      uDust: { value: new THREE.Vector3(...pal.dust) }, uHot: { value: C ? C.k : 0 }, uHotCol: { value: new THREE.Vector3(...(C?.hot ?? [0, 0, 0])) } });
    this.chunks = particles(this.group, { max: 1200, seed: 91, vs: GL.WALL_VS, fs: GL.WALL_FS, uniforms: U(0), blend: "premult", order: 3 });
    this.dust = particles(this.under, { max: 500, seed: 92, vs: GL.WALL_VS, fs: GL.WALL_FS, uniforms: U(1), blend: "premult", order: 1 });
    this.chunks.geo.instanceCount = Math.min(1200, Math.round(len * density * q) + 8);
    this.dust.geo.instanceCount = Math.min(500, Math.round(len * dustK * q) + 3);
    // The wall line: cracks before it goes, a seam of light when it closes again
    this.seam = quad(this.group, GL.QUAD_VS, GL.SEAM_FS, { uNoise: { value: overlay.noise }, uT: { value: 0 }, uRev: { value: req.rebuild ? 1 : 0 }, uLen: { value: len },
      uCol: { value: new THREE.Vector3(...(req.rebuild ? [1, 0.9, 0.7] : [1, 0.75, 0.45])) } }, { order: 4, visible: true });
    const mid = req.a.clone().add(req.b).multiplyScalar(0.5), d = req.b.clone().sub(req.a);
    this.seam.position.set(mid.x, mid.y, 0); this.seam.rotation.z = Math.atan2(d.y, d.x); this.seam.scale.set(len + 0.6, 1.6, 1);
    this.elevation = 0;
    if (!req.rebuild) overlay.punch({ shake: 0.7, zoom: 0.025, at: mid });
  }

  update(dt) {
    this.clock += dt;
    const T = this.clock;
    for (const l of [this.chunks, this.dust]) {
      l.u.uT.value = T;
      // Break: the chunks fade as the rubble on the floor takes over; rebuild: everything is gone when the wall closes
      l.u.uFade.value = this.req.rebuild ? 1 - Math.max(0, (T - this.dur + 0.3) / 0.3) : 1 - Math.max(0, Math.min(1, (T - (this.dur - 0.9)) / 0.9));
    }
    this.seam.material.uniforms.uT.value = T;
    return T < this.dur;
  }

  dispose() { disposeGroup(this.under); disposeGroup(this.group); }
}
