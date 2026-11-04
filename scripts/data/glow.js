// Cast glow and aura data ported from the Cast Glow Lab.

export const TRADITIONS = {
  arcane: { name: "Arcane", style: 0, core: [0.82, 0.9, 1.0], glow: [0.3, 0.5, 1.0], circle: "geometric runic circle" },
  divine: { name: "Divine", style: 1, core: [1.0, 0.94, 0.75], glow: [1.0, 0.68, 0.22], circle: "radiant halo and rays" },
  occult: { name: "Occult", style: 2, core: [0.93, 0.8, 1.0], glow: [0.62, 0.3, 0.95], circle: "moon phases around an eye" },
  primal: { name: "Primal", style: 3, core: [0.88, 1.0, 0.78], glow: [0.35, 0.82, 0.3], circle: "living ring of leaves" },
};

export const AURAS = {
  blessed:    { name: "Blessed",    style: 0, layer: "under", tint: "trad",  dot: "#e8c66a", from: "spell effects that help" },
  hexed:      { name: "Hexed",      style: 1, layer: "over",  tint: "trad",  dot: "#9a5ad8", from: "spell effects that hinder" },
  quickened:  { name: "Quickened",  style: 2, layer: "under", tint: [1.0, 0.78, 0.3],  dot: "#f2c05a", from: "condition: quickened" },
  slowed:     { name: "Slowed",     style: 3, layer: "under", tint: [0.55, 0.72, 0.95], dot: "#8fb4e8", from: "condition: slowed", shade: 0.25 },
  frightened: { name: "Frightened", style: 4, layer: "over",  tint: [0.55, 0.25, 0.8],  dot: "#8a42b8", from: "condition: frightened", tremble: 0.07 },
  sickened:   { name: "Sickened",   style: 5, layer: "over",  tint: [0.5, 0.7, 0.15],  dot: "#9aa93a", from: "condition: sickened" },
  burning:    { name: "Burning",    style: 6, layer: "over",  tint: [1.0, 0.5, 0.12],  dot: "#ff8a1c", from: "persistent fire damage" },
  bleeding:   { name: "Bleeding",   style: 7, layer: "over",  tint: [0.6, 0.03, 0.04], dot: "#c43a3a", from: "persistent bleed damage" },
  shielded:   { name: "Shielded",   style: 8, layer: "over",  tint: [0.55, 0.6, 1.0],  dot: "#6a5cff", from: "effects like Shield or Mystic Armor" },
  lit:        { name: "Lit", style: 10, layer: "under", tint: [1.0, 0.82, 0.52], dot: "#ffd38a", from: "the Light spell" },
  invisible:  { name: "Invisible",  style: 9, layer: "over",  tint: [0.75, 0.9, 1.0],  dot: "#cfe6ff", from: "condition: invisible (GM view)", alpha: 0.35 },
  confused:    { name: "Confused",    style: 11, layer: "over", tint: [0.95, 0.55, 0.95], dot: "#f08cf0", from: "condition: confused" },
  stunned:     { name: "Stunned",     style: 12, layer: "over", tint: [1.0, 0.85, 0.35], dot: "#ffd85a", from: "condition: stunned" },
  paralyzed:   { name: "Paralyzed",   style: 13, layer: "over", tint: [0.92, 0.9, 0.75], dot: "#ece6bf", from: "condition: paralyzed" },
  petrified:   { name: "Petrified",   style: 14, layer: "over", tint: [0.6, 0.58, 0.55], dot: "#9a948c", from: "condition: petrified" },
  restrained:  { name: "Restrained",  style: 15, layer: "over", tint: [0.85, 0.8, 0.72], dot: "#b8ab95", from: "conditions: restrained, grabbed" },
  immobilized: { name: "Immobilized", style: 16, layer: "over", tint: [0.45, 0.6, 0.25], dot: "#6f8a3c", from: "condition: immobilized" },
  doomed:      { name: "Doomed",      style: 17, layer: "over", tint: [1.0, 0.18, 0.08], dot: "#d8301a", from: "condition: doomed" },
  dazzled:     { name: "Dazzled",     style: 18, layer: "over", tint: [1.0, 0.95, 0.8],  dot: "#fff2c8", from: "condition: dazzled" },
  fascinated:  { name: "Fascinated",  style: 19, layer: "over", tint: [0.75, 0.55, 1.0], dot: "#b48cff", from: "condition: fascinated" },
  corroding:   { name: "Corroding",   style: 20, layer: "over", tint: [0.55, 1.0, 0.2],  dot: "#8cff3a", from: "persistent acid damage" },
  freezing:    { name: "Freezing",    style: 21, layer: "over", tint: [0.7, 0.88, 1.0],  dot: "#b4e0ff", from: "persistent cold damage" },
  shocked:     { name: "Shocked",     style: 22, layer: "over", tint: [0.55, 0.7, 1.0],  dot: "#8cb4ff", from: "persistent electricity damage" },
  poisoned:    { name: "Poisoned",    style: 23, layer: "over", tint: [0.3, 0.6, 0.12],  dot: "#4f9a1f", from: "persistent poison damage" },
};
