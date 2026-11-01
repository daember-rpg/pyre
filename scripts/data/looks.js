// Look data ported from the labs. Every number here was tuned there.

export const SHAPES = {
  cone: { mode: 0, length: 30, halfAng: Math.PI / 4, width: 0 },
  line: { mode: 1, length: 60, halfAng: 0, width: 5 },
};

export const RECIPES = {
  breath:   { label: "Breath", stages: (p) => [`Area from caster · ${p.shape === "line" ? "Line 60 ft" : "Cone 30 ft"}`], travel: false },
  fireball: { label: "Lob → Burst", stages: () => ["Projectile (lob)", "Burst 20 ft"], travel: true, speed: 55, arc: 1, minTravel: 0.55,
              trail: { life: 1.3, width: 1.4, size: 1.0, count: 1 }, radius: 20, shake: 1.6, beam: false, head: 1.6 },
  point:    { label: "Burst at point", stages: () => ["Burst 10 ft at a point"], travel: false, radius: 10, shake: 1 },
  // These four drive their own flight instead of the single projectile.
  column:   { label: "Column", stages: () => ["Falls from above", "Cylinder 10 ft"], travel: true, own: true, radius: 10, descent: 0.42, shake: 1.5 },
  field:    { label: "Field", stages: () => ["Fills a 15 ft square", "Lingers"], travel: false, own: true, side: 15, shake: 0.5 },
  darts:    { label: "Darts", stages: (p) => [`${p.darts} homing ${p.darts === 1 ? "dart" : "darts"}`, "Impact on each"], travel: true, own: true, speed: 55, stagger: 0.09, radius: 3, shake: 0.6 },
  chain:    { label: "Chain", stages: () => ["Bolt to the first target", "Leaps to the nearest within 30 ft", "Burst on each"], travel: true, own: true, speed: 170, radius: 4, shake: 0.9 },
  ray:      { label: "Ray → Impact", stages: () => ["Ray", "Impact 5 ft"], travel: true, speed: 150, arc: 0,
              trail: { life: 0.5, width: 0.35, size: 0.5, count: 1 }, radius: 5, shake: 0.5, beam: true, head: 0.9 },
};

export const OUTCOMES = {
  hit:  { radius: 1, intensity: 1, shake: 1, miss: false },
  crit: { radius: 1.6, intensity: 1.45, shake: 2.2, miss: false },
  miss: { radius: 0.7, intensity: 0.7, shake: 0, miss: true },
  // A secret GM roll: players see the ray land, but nothing tells them hit, miss or critical.
  hidden: { radius: 0.85, intensity: 0.78, shake: 0.5, miss: false, neutral: true },
};

export const ELEMENTS = {
  fire: {
    ramp: [[0.22, 0.025, 0.01], [0.95, 0.22, 0.02], [1.0, 0.56, 0.12], [1.0, 0.93, 0.74]],
    fireGain: 1.0, lifeMin: 0.55, lifeMax: 0.95, turb: 1.0,
    smoke: { color: [0.045, 0.04, 0.036], glow: [1.0, 0.33, 0.07], gain: 1.0, lifeMin: 2.2, lifeMax: 4.0 },
    ember: { mode: 0, color: [1.0, 0.52, 0.14], gain: 0.8, drag: 1.6, speed: 1.0, size: 0.2, streak: 0.035, lifeMin: 0.8, lifeMax: 2.2, count: 1, burst: 0.0, scatter: 0.15 },
    light: [1.0, 0.46, 0.15], lightGain: 1.0, decal: 0, decalColor: [1.0, 0.32, 0.04], haze: 1.0, shake: 1.0,
  },
  cold: {
    ramp: [[0.03, 0.08, 0.18], [0.16, 0.42, 0.85], [0.55, 0.82, 1.0], [0.93, 0.98, 1.0]],
    fireGain: 0.7, lifeMin: 0.6, lifeMax: 1.05, turb: 0.7,
    smoke: { color: [0.42, 0.55, 0.7], glow: [0.55, 0.8, 1.0], gain: 0.26, lifeMin: 2.0, lifeMax: 3.6 },
    ember: { mode: 1, color: [0.78, 0.94, 1.0], gain: 1.35, drag: 3.0, speed: 1.25, size: 0.48, streak: 0.0, lifeMin: 0.9, lifeMax: 2.4, count: 1.6, burst: 0.55, scatter: 0.55 },
    light: [0.45, 0.7, 1.0], lightGain: 0.6, decal: 1, decalColor: [0.85, 0.94, 1.0], haze: 0.25, shake: 0.6,
  },
  acid: {
    ramp: [[0.03, 0.1, 0.0], [0.18, 0.48, 0.02], [0.52, 0.9, 0.12], [0.88, 1.0, 0.55]],
    fireGain: 0.6, lifeMin: 0.7, lifeMax: 1.1, turb: 0.55,
    smoke: { color: [0.16, 0.22, 0.05], glow: [0.45, 0.9, 0.1], gain: 0.75, lifeMin: 2.2, lifeMax: 4.0 },
    ember: { mode: 2, color: [0.55, 1.0, 0.2], gain: 0.9, drag: 2.0, speed: 1.1, size: 0.3, streak: 0.03, lifeMin: 0.7, lifeMax: 1.6, count: 1, burst: 0.25, scatter: 0.3 },
    light: [0.45, 1.0, 0.2], lightGain: 0.45, decal: 2, decalColor: [0.55, 0.9, 0.1], haze: 0.3, shake: 0.5,
  },
  poison: {
    ramp: [[0.06, 0.08, 0.01], [0.3, 0.38, 0.05], [0.62, 0.7, 0.18], [0.85, 0.9, 0.5]],
    fireGain: 0.32, lifeMin: 0.9, lifeMax: 1.5, turb: 1.5,
    smoke: { color: [0.3, 0.36, 0.1], glow: [0.6, 0.7, 0.2], gain: 1.5, lifeMin: 3.0, lifeMax: 5.5 },
    ember: { mode: 0, color: [0.6, 0.7, 0.2], gain: 0, drag: 1, speed: 1, size: 0.2, streak: 0, lifeMin: 1, lifeMax: 2, count: 0, burst: 0, scatter: 0 },
    light: [0.6, 0.75, 0.2], lightGain: 0.18, decal: 3, decalColor: [0.5, 0.6, 0.1], haze: 0.0, shake: 0.3,
  },
};

// Elements beyond the first four bring their own extras: lightning arcs, wave rings, shadow rendering.
export const rings = (o) => ({ count: 1, every: 0, dur: 0.6, r1f: 1.0, w: 0.4, a: 0.8, color: [1, 1, 1], ...o });
Object.assign(ELEMENTS, {
  electricity: {
    ramp: [[0.03, 0.04, 0.2], [0.25, 0.35, 1.0], [0.65, 0.78, 1.0], [0.95, 0.97, 1.0]],
    fireGain: 0.35, lifeMin: 0.3, lifeMax: 0.55, turb: 0.4,
    smoke: { color: [0.1, 0.1, 0.14], glow: [0.4, 0.5, 1.0], gain: 0.25, lifeMin: 1.2, lifeMax: 2.4 },
    ember: { mode: 0, color: [0.7, 0.8, 1.0], gain: 1.0, drag: 5, speed: 0.9, size: 0.12, streak: 0.04, lifeMin: 0.15, lifeMax: 0.5, count: 0.6, burst: 0.35, scatter: 0.45 },
    light: [0.55, 0.7, 1.0], lightGain: 0.9, decal: 0, decalColor: [0.5, 0.6, 1.0], haze: 0.2, shake: 0.9, arcs: true,
  },
  sonic: {
    ramp: [[0.1, 0.1, 0.12], [0.45, 0.47, 0.55], [0.8, 0.82, 0.9], [1, 1, 1]],
    fireGain: 0.1, lifeMin: 0.5, lifeMax: 0.9, turb: 0.5,
    smoke: { color: [0.22, 0.19, 0.16], glow: [0.22, 0.19, 0.16], gain: 0.55, lifeMin: 1.2, lifeMax: 2.4 },
    ember: { mode: 0, color: [1, 1, 1], gain: 0, drag: 1, speed: 1, size: 0.2, streak: 0, lifeMin: 1, lifeMax: 2, count: 0, burst: 0, scatter: 0 },
    light: [0.85, 0.88, 1.0], lightGain: 0.15, decal: 9, decalColor: [1, 1, 1], haze: 2.2, shake: 1.5,
    rings: rings({ count: 4, every: 0.13, dur: 0.55, r1f: 1.15, w: 0.5, a: 0.9, color: [0.9, 0.92, 1.0] }),
  },
  force: {
    ramp: [[0.05, 0.03, 0.15], [0.3, 0.25, 0.9], [0.65, 0.6, 1.0], [0.95, 0.93, 1.0]],
    fireGain: 0.4, lifeMin: 0.4, lifeMax: 0.7, turb: 0.3,
    smoke: { color: [0.1, 0.08, 0.2], glow: [0.5, 0.45, 1.0], gain: 0, lifeMin: 1, lifeMax: 2 },
    ember: { mode: 1, color: [0.7, 0.65, 1.0], gain: 1.2, drag: 3.4, speed: 1.0, size: 0.34, streak: 0, lifeMin: 0.5, lifeMax: 1.2, count: 1.2, burst: 0.6, scatter: 0.4 },
    light: [0.55, 0.5, 1.0], lightGain: 0.5, decal: 9, decalColor: [0.6, 0.55, 1], haze: 0.6, shake: 1.0,
    rings: rings({ count: 1, dur: 0.35, r1f: 1.05, w: 0.25, a: 1.2, color: [0.7, 0.65, 1.0] }),
  },
  vitality: {
    ramp: [[0.25, 0.18, 0.05], [0.95, 0.75, 0.3], [1.0, 0.92, 0.65], [1.0, 1.0, 0.92]],
    fireGain: 0.32, lifeMin: 0.8, lifeMax: 1.3, turb: 0.4,
    smoke: { color: [0.5, 0.42, 0.25], glow: [1, 0.85, 0.5], gain: 0, lifeMin: 1, lifeMax: 2 },
    ember: { mode: 1, color: [1.0, 0.88, 0.55], gain: 1.1, drag: 1.2, speed: 0.4, size: 0.35, streak: 0, lifeMin: 1.2, lifeMax: 2.4, count: 1.4, burst: 0.7, scatter: 0.5 },
    light: [1.0, 0.88, 0.55], lightGain: 0.7, decal: 9, decalColor: [1, 0.9, 0.6], haze: 0, shake: 0,
    rings: rings({ count: 2, every: 0.25, dur: 0.9, r1f: 1.0, w: 0.6, a: 0.6, color: [1.0, 0.88, 0.55] }),
  },
  void: {
    dark: true, rim: [0.55, 0.25, 0.75],
    ramp: [[0.02, 0.01, 0.03], [0.05, 0.02, 0.06], [0.09, 0.04, 0.1], [0.2, 0.1, 0.22]],
    fireGain: 0.6, lifeMin: 0.6, lifeMax: 1.0, turb: 0.9,
    smoke: { color: [0.04, 0.02, 0.05], glow: [0.35, 0.15, 0.5], gain: 0.9, lifeMin: 2.2, lifeMax: 4 },
    ember: { mode: 0, color: [0.5, 0.2, 0.7], gain: 0.7, drag: 2, speed: 0.8, size: 0.18, streak: 0.03, lifeMin: 0.8, lifeMax: 1.8, count: 0.7, burst: 0.3, scatter: 0.4 },
    light: [0.5, 0.25, 0.7], lightGain: 0.35, decal: 6, decalColor: [0.3, 0.1, 0.4], haze: 0.3, shake: 0.6,
  },
  mental: {
    ramp: [[0.12, 0.02, 0.1], [0.75, 0.2, 0.65], [1.0, 0.55, 0.9], [1.0, 0.9, 1.0]],
    fireGain: 0.22, lifeMin: 0.6, lifeMax: 1.0, turb: 0.6,
    smoke: { color: [0.2, 0.05, 0.18], glow: [1, 0.5, 0.95], gain: 0, lifeMin: 1, lifeMax: 2 },
    ember: { mode: 1, color: [1.0, 0.6, 0.95], gain: 0.9, drag: 2, speed: 0.6, size: 0.3, streak: 0, lifeMin: 0.8, lifeMax: 1.8, count: 0.6, burst: 0.5, scatter: 0.5 },
    light: [0.95, 0.45, 0.9], lightGain: 0.4, decal: 9, decalColor: [1, 0.5, 0.9], haze: 1.3, shake: 0.4,
    rings: rings({ count: 3, every: 0.18, dur: 0.7, r1f: 1.0, w: 0.4, a: 0.7, color: [1.0, 0.5, 0.95] }),
  },
  kinetic: {
    ramp: [[0.1, 0.08, 0.06], [0.3, 0.25, 0.2], [0.5, 0.44, 0.36], [0.7, 0.64, 0.55]],
    fireGain: 0, lifeMin: 0.5, lifeMax: 0.9, turb: 0.7,
    smoke: { color: [0.16, 0.135, 0.11], glow: [0.2, 0.17, 0.14], gain: 0.95, lifeMin: 1.6, lifeMax: 3.2 },
    ember: { mode: 0, color: [0.8, 0.7, 0.55], gain: 0.25, drag: 3, speed: 1, size: 0.1, streak: 0.02, lifeMin: 0.3, lifeMax: 0.8, count: 0.5, burst: 0.2, scatter: 0.6 },
    debris: { count: 1.3, size: 0.62, drag: 2.6, speed: 0.95, lifeMin: 1.2, lifeMax: 2.4, burst: 0.35, scatter: 0.5 },
    light: [0.6, 0.55, 0.45], lightGain: 0.05, decal: 8, decalColor: [0.2, 0.17, 0.13], haze: 0, shake: 1.7,
  },
  water: {
    ramp: [[0.02, 0.1, 0.18], [0.1, 0.38, 0.62], [0.45, 0.78, 0.95], [0.9, 0.98, 1.0]],
    fireGain: 0.3, lifeMin: 0.5, lifeMax: 0.85, turb: 0.9,
    smoke: { color: [0.62, 0.76, 0.85], glow: [0.7, 0.88, 1.0], gain: 0.45, lifeMin: 1.0, lifeMax: 2.0 },
    ember: { mode: 2, color: [0.6, 0.85, 1.0], gain: 0.75, drag: 2.6, speed: 1.0, size: 0.24, streak: 0.04, lifeMin: 0.5, lifeMax: 1.2, count: 1.5, burst: 0.4, scatter: 0.6 },
    light: [0.45, 0.7, 1.0], lightGain: 0.25, decal: 7, decalColor: [0.6, 0.8, 1.0], haze: 0, shake: 0.9,
    rings: rings({ count: 2, every: 0.12, dur: 0.6, r1f: 1.05, w: 0.3, a: 0.45, color: [0.6, 0.85, 1.0] }),
  },
  air: {
    ramp: [[0.15, 0.17, 0.2], [0.45, 0.5, 0.56], [0.75, 0.8, 0.86], [0.95, 0.97, 1.0]],
    fireGain: 0.1, lifeMin: 0.4, lifeMax: 0.75, turb: 1.7,
    smoke: { color: [0.42, 0.4, 0.37], glow: [0.5, 0.48, 0.45], gain: 0.4, lifeMin: 1.0, lifeMax: 2.0 },
    ember: { mode: 0, color: [0.85, 0.9, 1.0], gain: 0.4, drag: 1.3, speed: 1.6, size: 0.06, streak: 0.22, lifeMin: 0.35, lifeMax: 0.8, count: 2.2, burst: 0.1, scatter: 0.35 },
    light: [0.8, 0.85, 0.95], lightGain: 0.05, decal: 9, decalColor: [1, 1, 1], haze: 0.9, shake: 0.8,
    rings: rings({ count: 3, every: 0.1, dur: 0.5, r1f: 1.1, w: 0.25, a: 0.35, color: [0.85, 0.9, 1.0] }),
  },
  spirit: {
    ramp: [[0.04, 0.08, 0.12], [0.3, 0.62, 0.8], [0.72, 0.95, 1.0], [0.96, 1.0, 1.0]],
    fireGain: 0.4, lifeMin: 0.9, lifeMax: 1.5, turb: 0.5,
    smoke: { color: [0.5, 0.65, 0.7], glow: [0.6, 0.9, 1.0], gain: 0.15, lifeMin: 1.8, lifeMax: 3 },
    ember: { mode: 1, color: [0.75, 0.95, 1.0], gain: 0.9, drag: 1.6, speed: 0.5, size: 0.3, streak: 0, lifeMin: 1, lifeMax: 2.2, count: 0.8, burst: 0.5, scatter: 0.5 },
    light: [0.6, 0.9, 1.0], lightGain: 0.5, decal: 9, decalColor: [0.6, 0.9, 1], haze: 0.2, shake: 0.5,
    rings: rings({ count: 1, dur: 0.8, r1f: 0.9, w: 0.6, a: 0.4, color: [0.6, 0.9, 1.0] }),
  },
});

// Kinetic look depends on the material named by the spell's traits.
export const MATERIALS = {
  stone: { color: [0.52, 0.46, 0.38], shape: 0, streak: 0, ember: [0.85, 0.75, 0.6] },
  metal: { color: [0.55, 0.57, 0.6], shape: 1, streak: 0.02, ember: [1.0, 0.82, 0.5] },
  wood:  { color: [0.55, 0.37, 0.2], shape: 2, streak: 0.07, ember: [0.55, 0.75, 0.3] },
};

export const QUALITY = {
  low:    { fire: 2500, smoke: 380, ember: 600,  trail: 700,  dpr: 1 },
  medium: { fire: 5000, smoke: 650, ember: 1200, trail: 1300, dpr: 1.5 },
  high:   { fire: 9000, smoke: 1000, ember: 2000, trail: 2200, dpr: 2 },
};
export const MAX = { ...QUALITY.high, ember: 3600 };
