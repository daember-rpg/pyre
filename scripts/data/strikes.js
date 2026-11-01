// Strike data ported from the Strike Lab.
import { ELEMENTS } from "./looks.js";

/* Weapon signatures, one per PF2e weapon group.
 * style: how the blow is drawn. impactT: when it lands (melee). speed: ft/s (ranged).
 * smear: arc/thrust shape overrides. mark: ground mark left behind. */
export const WEAPONS = {
  longsword: { name: "Sword", style: "slash", ranged: false, knock: 0.8, shake: 0.14, sparks: 1.0, dust: 0.3, steel: true },
  axe:       { name: "Axe", style: "chop", ranged: false, knock: 1.25, shake: 0.3, sparks: 0.35, dust: 0.5, impactT: 0.24, chips: true, mark: "gash",
               smear: { span: 0.7, dur: 0.09, thick: 3.6 } },
  dagger:    { name: "Dagger / knife", style: "stab", ranged: false, knock: 0.4, shake: 0.05, sparks: 0.3, dust: 0.08, impactT: 0.15, double: 0.31, quiet: true,
               smear: { width: 0.2, fade: 0.2 } },
  flail:     { name: "Flail / whip", style: "lash", ranged: false, knock: 1.0, shake: 0.2, sparks: 0.7, dust: 0.35, impactT: 0.22, crack: true,
               smear: { span: 1.25, dur: 0.15, thick: 1.6, wave: 1 } },
  warhammer: { name: "Hammer / club", style: "blunt", ranged: false, knock: 1.6, shake: 0.5, sparks: 0.25, dust: 0.75, pebbles: true, quake: true },
  pick:      { name: "Pick", style: "pierce", ranged: false, knock: 0.8, shake: 0.26, sparks: 0.9, dust: 0.6, impactT: 0.22, mark: "crack",
               smear: { width: 0.6, fade: 0.22, short: true } },
  polearm:   { name: "Polearm", style: "reap", ranged: false, knock: 1.1, shake: 0.2, sparks: 0.6, dust: 0.5, impactT: 0.28, pull: true,
               smear: { span: 1.7, dur: 0.26, thick: 3.8 }, reach: 13 },
  spear:     { name: "Spear", style: "thrust", ranged: false, knock: 0.7, shake: 0.1, sparks: 0.7, dust: 0.25,
               smear: { width: 0.38, fade: 0.4, long: true } },
  shield:    { name: "Shield", style: "bash", ranged: false, knock: 2.2, shake: 0.32, sparks: 0.15, dust: 0.7, impactT: 0.2 },
  longbow:   { name: "Bow", style: "arrow", ranged: true, speed: 130, knock: 0.6, shake: 0.08, sparks: 0.5, dust: 0.2 },
  crossbow:  { name: "Crossbow", style: "bolt", ranged: true, speed: 280, knock: 0.8, shake: 0.1, sparks: 0.6, dust: 0.25, snap: true },
  sling:     { name: "Sling", style: "stone", ranged: true, speed: 70, knock: 0.9, shake: 0.12, sparks: 0, dust: 1.1 },
  firearm:   { name: "Firearm", style: "shot", ranged: true, speed: 520, knock: 1.0, shake: 0.18, sparks: 0.5, dust: 0.6, muzzle: true },
  dart:      { name: "Thrown", style: "thrown", ranged: true, speed: 62, knock: 0.6, shake: 0.08, sparks: 0.5, dust: 0.2 },
  fist:      { name: "Fist", style: "punch", ranged: false, knock: 1.0, shake: 0.16, sparks: 0.25, dust: 0.35 },
  claw:      { name: "Claw", style: "claw", ranged: false, knock: 0.7, shake: 0.12, sparks: 0.2, dust: 0.25 },
  jaws:      { name: "Jaws", style: "bite", ranged: false, knock: 0.9, shake: 0.16, sparks: 0.15, dust: 0.3 },
  tail:      { name: "Tail", style: "sweep", ranged: false, knock: 1.5, shake: 0.32, sparks: 0.3, dust: 0.9 },
  bomb:      { name: "Bomb", style: "bomb", ranged: true, knock: 0.9, shake: 0.2, sparks: 0, dust: 0.5 },
};
// Alchemical bombs reuse the elemental rune looks as a 5 ft splash.
export const BOMBS = {
  fire: { name: "Alchemist's Fire", rune: "flaming" },
  frost: { name: "Frost Vial", rune: "frost" },
  acid: { name: "Acid Flask", rune: "corrosive" },
  lightning: { name: "Bottled Lightning", rune: "shock" },
  thunder: { name: "Thunderstone", rune: "thundering" },
  blight: { name: "Blight Bomb", rune: "blight" },
};
export const BOMB_SIZE = [0.8, 1, 1.25, 1.5];

export const PALETTES = {
  fire: { ramp: ELEMENTS.fire.ramp, light: ELEMENTS.fire.light },
  cold: { ramp: ELEMENTS.cold.ramp, light: ELEMENTS.cold.light },
  acid: { ramp: ELEMENTS.acid.ramp, light: ELEMENTS.acid.light },
  electricity: { ramp: [[0.03, 0.04, 0.2], [0.25, 0.35, 1.0], [0.65, 0.78, 1.0], [0.95, 0.97, 1.0]], light: [0.5, 0.65, 1.0] },
  spirit: { ramp: [[0.04, 0.08, 0.12], [0.3, 0.62, 0.8], [0.72, 0.95, 1.0], [0.96, 1.0, 1.0]], light: [0.6, 0.9, 1.0] },
  holy: { ramp: [[0.2, 0.1, 0.01], [0.9, 0.5, 0.06], [1.0, 0.74, 0.26], [1.0, 0.9, 0.6]], light: [1.0, 0.76, 0.32] },
  unholy: { dark: true, ramp: [[0.03, 0.0, 0.01], [0.06, 0.0, 0.02], [0.1, 0.01, 0.03], [0.35, 0.03, 0.08]], rim: [0.85, 0.08, 0.18], light: [0.85, 0.1, 0.2] },
  poison: { ramp: ELEMENTS.poison.ramp, light: ELEMENTS.poison.light },
  sonic: { ramp: [[0.1, 0.1, 0.12], [0.5, 0.52, 0.6], [0.85, 0.87, 0.95], [1, 1, 1]], light: [0.85, 0.88, 1.0] },
};

const ember = (o) => ({ mode: 0, color: [1, 0.6, 0.2], count: 1, drag: 2.4, speed: 0.9, size: 0.18, streak: 0.04, burst: 0.2, scatter: 0.5, life: [0.5, 1.3], ...o });
export const RUNES = {
  none: { name: "None", family: "none" },
  flaming: { name: "Flaming", family: "elemental", palette: "fire", puff: 1, decal: 0,
    ember: ember({ color: [1.0, 0.55, 0.15], streak: 0.05 }) },
  frost: { name: "Frost", family: "elemental", palette: "cold", puff: 0.8, decal: 1,
    ember: ember({ mode: 1, color: [0.8, 0.95, 1.0], count: 1.3, drag: 3.2, size: 0.36, streak: 0, burst: 0.6, scatter: 0.6, life: [0.6, 1.6] }) },
  shock: { name: "Shock", family: "elemental", palette: "electricity", puff: 0.45, arcs: true,
    ember: ember({ color: [0.7, 0.8, 1.0], count: 0.8, drag: 4, speed: 1.2, size: 0.12, streak: 0.06, burst: 0.1, scatter: 0.9, life: [0.2, 0.6] }) },
  corrosive: { name: "Corrosive", family: "elemental", palette: "acid", puff: 0.7, decal: 2,
    ember: ember({ mode: 2, color: [0.55, 1.0, 0.2], drag: 2.4, speed: 0.8, size: 0.25, streak: 0.03, burst: 0.3, life: [0.5, 1.2] }) },
  thundering: { name: "Thundering", family: "elemental", palette: "sonic", puff: 0, shock: 1.2, shake: 1.6,
    rings: [{ d: 0, dur: 0.35, r1: 6, w: 0.35, a: 1.4 }, { d: 0.07, dur: 0.4, r1: 8, w: 0.3, a: 1.0 }, { d: 0.14, dur: 0.45, r1: 10, w: 0.25, a: 0.7 }] },
  astral: { name: "Astral", family: "elemental", palette: "spirit", puff: 0.6, slow: true,
    ember: ember({ mode: 1, color: [0.75, 0.95, 1.0], count: 0.8, drag: 2, speed: 0.6, size: 0.3, streak: 0, burst: 0.5, life: [0.8, 1.8] }),
    rings: [{ d: 0, dur: 0.6, r1: 5, w: 0.5, a: 0.6 }] },
  holy: { name: "Holy", family: "elemental", palette: "holy", puff: 0.7,
    ember: ember({ mode: 1, color: [1.0, 0.85, 0.45], count: 1, drag: 2.6, speed: 0.8, size: 0.32, streak: 0, burst: 0.5, life: [0.6, 1.6] }),
    rings: [{ d: 0, dur: 0.7, r1: 6, w: 0.4, a: 1.0 }] },
  unholy: { name: "Unholy", family: "elemental", palette: "unholy", puff: 0.9,
    ember: ember({ color: [0.9, 0.1, 0.18], count: 0.9, drag: 2.2, size: 0.16, streak: 0.04 }),
    rings: [{ d: 0, dur: 0.6, r1: 5, w: 0.6, a: 0.8, dark: true, color: [0.05, 0.0, 0.02] }] },
  wounding: { name: "Wounding", family: "effect", blood: true },
  fearsome: { name: "Fearsome", family: "effect", dread: true,
    rings: [{ d: 0, dur: 0.9, r1: 7, w: 1.2, a: 0.75, dark: true, color: [0.06, 0.0, 0.09] }, { d: 0.25, dur: 0.9, r1: 9, w: 1.0, a: 0.5, dark: true, color: [0.06, 0.0, 0.09] }] },
  ghostTouch: { name: "Ghost Touch", family: "effect", palette: "spirit", puff: 0.35, slow: true,
    rings: [{ d: 0, dur: 0.8, r1: 4, w: 0.8, a: 0.35 }] },
  speed: { name: "Speed", family: "effect", afterimages: true },
  blight: { name: "Blight", family: "bomb", palette: "poison", puff: 0.35, gas: true, decal: 3 },
};

export const STRIKING_WEIGHT = [1, 1.25, 1.5, 1.8];
