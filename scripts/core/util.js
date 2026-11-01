import * as THREE from "../vendor/three.js";

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export const mixA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const scaleA = (a, k) => a.map((v) => v * k);
export const v3 = (u, a) => u.value.set(a[0], a[1], a[2]);
export const luma = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
export function linear(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }

/** Deterministic seed from a string (message or document id) so every client plays the same effect. */
export function seedFrom(str) {
  let h = 2166136261;
  for (const ch of String(str ?? Math.random())) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

let noiseTex = null;
/** Tileable multi-octave value noise in four channels, generated once. */
export function noiseTexture(size = 256) {
  if (noiseTex) return noiseTex;
  const data = new Uint8Array(size * size * 4);
  const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let ch = 0; ch < 4; ch++) {
    const rnd = mulberry32(1337 + ch * 101);
    const octaves = [];
    for (let o = 0; o < 5; o++) {
      const period = 4 << o;
      const grid = new Float32Array(period * period);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd();
      octaves.push({ period, grid, amp: Math.pow(0.55, o) });
    }
    const ampSum = octaves.reduce((s, o) => s + o.amp, 0);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of octaves) {
        const fx = (x / size) * o.period, fy = (y / size) * o.period;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = smooth(fx - x0), ty = smooth(fy - y0), p = o.period;
        const g = (ix, iy) => o.grid[((iy % p) * p) + (ix % p)];
        const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
        v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * o.amp;
      }
      v = Math.min(1, Math.max(0, (v / ampSum - 0.5) * 1.6 + 0.5));
      data[(y * size + x) * 4 + ch] = Math.round(v * 255);
    }
  }
  noiseTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

/** Blending presets. Additive light never touches alpha, so the board shows through. */
export const BLEND = {
  add: { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
  addRaw: { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
  normal: { blending: THREE.NormalBlending },
  premult: { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor },
};
