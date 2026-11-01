import * as THREE from "../vendor/three.js";
import { mulberry32, BLEND } from "./util.js";

/*
 * Layer factory. Seeds for particles are shared GPU buffers (one set per seed/size),
 * so a new effect costs a few draw calls, not new uploads.
 */
const PLANE = new THREE.PlaneGeometry(1, 1);
for (const v of Object.values(PLANE.attributes)) v.__pyreShared = true;
PLANE.index.__pyreShared = true;
const SHARED = new Map();

function sharedAttrs(max, seed) {
  const key = `${max}:${seed}`;
  let a = SHARED.get(key);
  if (a) return a;
  const rnd = mulberry32(seed);
  const s = new Float32Array(max * 4), b = new Float32Array(max), l = new Float32Array(max);
  for (let i = 0; i < max; i++) {
    s[i * 4] = rnd(); s[i * 4 + 1] = rnd(); s[i * 4 + 2] = rnd(); s[i * 4 + 3] = rnd();
    b[i] = Math.pow(rnd(), 1.08); l[i] = rnd();
  }
  a = {
    aSeed: new THREE.InstancedBufferAttribute(s, 4),
    aBirth: new THREE.InstancedBufferAttribute(b, 1),
    aLife: new THREE.InstancedBufferAttribute(l, 1),
  };
  for (const v of Object.values(a)) v.__pyreShared = true;
  SHARED.set(key, a);
  return a;
}

export function material(vs, fs, uniforms, blend = "add") {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, ...BLEND[blend] });
}

export function setBlend(mat, blend) {
  Object.assign(mat, BLEND[blend]);
  mat.needsUpdate = true;
}

/** Instanced particle layer. */
export function particles(group, { max, seed, vs, fs, uniforms, blend = "add", order = 2 }) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = PLANE.index;
  geo.setAttribute("position", PLANE.getAttribute("position"));
  geo.setAttribute("uv", PLANE.getAttribute("uv"));
  const at = sharedAttrs(max, seed);
  for (const [k, v] of Object.entries(at)) geo.setAttribute(k, v);
  geo.instanceCount = 0;
  const mat = material(vs, fs, uniforms, blend);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  group.add(mesh);
  return { mesh, geo, mat, max, u: mat.uniforms };
}

/** Single quad (sprite, beam, ring, floor). */
export function quad(group, vs, fs, uniforms, { blend = "add", order = 4, visible = false } = {}) {
  const mat = material(vs, fs, uniforms, blend);
  const mesh = new THREE.Mesh(PLANE, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  mesh.visible = visible;
  group.add(mesh);
  return mesh;
}

/** Free everything in a group without touching shared buffers. */
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.material) o.material.dispose();
    if (o.geometry && o.geometry !== PLANE) {
      // Detach shared buffers first so disposing the geometry frees only what this effect owns.
      for (const [k, v] of Object.entries(o.geometry.attributes)) if (v.__pyreShared) delete o.geometry.attributes[k];
      if (o.geometry.index?.__pyreShared) o.geometry.index = null;
      o.geometry.dispose();
    }
  });
  group.parent?.remove(group);
}
