// Standard presets from the Effect Lab. Spells map to these by slug; everything else uses the recipe defaults.

export const PRESET_KEYS = ["recipe", "element", "material", "darts", "custom", "core", "glow", "intensity", "emit", "turb", "size", "edge", "burst", "bloom", "haze",
  "thickness", "speed", "wobble", "wobbleFreq", "arc", "trailLen", "hitstop", "knockback", "flash", "punch", "chroma"];
export const base = { material: "stone", darts: 3, custom: false, core: "#ff8a1c", glow: "#ff6a1a", intensity: 1, turb: 1, size: 1, edge: 1, burst: 1, bloom: 0.6, haze: 1,
  thickness: 1, speed: 1, wobble: 0.7, wobbleFreq: 1.1, arc: 1, trailLen: 1,
  hitstop: 60, knockback: 1, flash: 0.6, punch: 0.8, chroma: 0.6 };
const breathFeel = { hitstop: 35, knockback: 0.6, flash: 0.6, punch: 0.4, chroma: 0.3 };
const straight = { wobble: 0, arc: 0 };
export const STANDARD = [
  { ...base, id: "std-red-dragon", name: "Red Dragon Breath", note: "Roaring jet, black smoke, scorched stone.",
    recipe: "breath", element: "fire", emit: 1.6, ...breathFeel },
  { ...base, id: "std-white-dragon", name: "White Dragon Breath", note: "Freezing gust that shatters into ice glitter.",
    recipe: "breath", element: "cold", intensity: 1.1, emit: 1.8, turb: 0.9, size: 1.05, edge: 1.1, burst: 1.25, bloom: 0.75, ...breathFeel },
  { ...base, id: "std-black-dragon", name: "Black Dragon Breath", note: "Spitting spray, hissing fumes, corroded floor.",
    recipe: "breath", shape: "line", element: "acid", emit: 1.4, size: 0.95, edge: 1.2, bloom: 0.55, ...breathFeel },
  { ...base, id: "std-green-dragon", name: "Green Dragon Breath", note: "A slow, rolling cloud that lingers.",
    recipe: "breath", element: "poison", emit: 2.2, turb: 1.1, size: 1.15, edge: 1.3, bloom: 0.4, haze: 0,
    hitstop: 0, knockback: 0.2, flash: 0.3, punch: 0.1, chroma: 0.1 },
  { ...base, id: "std-fireball", name: "Fireball", note: "A blazing bead arcs out, then detonates in a 20 ft burst.",
    recipe: "fireball", element: "fire", emit: 0.45, intensity: 1.1, bloom: 0.7, hitstop: 90, knockback: 1.6, flash: 0.75, punch: 1.3, chroma: 1 },
  { ...base, id: "std-ice-ball", name: "Ice Ball (enemy variant)", note: "Same recipe as Fireball with the element swapped to cold.",
    recipe: "fireball", element: "cold", emit: 0.5, burst: 1.4, bloom: 0.75, hitstop: 100, knockback: 1.4, flash: 0.75, punch: 1.1, chroma: 0.8 },
  { ...base, id: "std-ray-of-frost", name: "Ray of Frost", note: "A thin freezing beam; the impact follows the attack roll.",
    recipe: "ray", element: "cold", emit: 0.3, burst: 1.2, bloom: 0.8, ...straight, hitstop: 70, knockback: 0.9, punch: 0.6, chroma: 0.6 },
  { ...base, id: "std-blue-dragon", name: "Blue Dragon Breath", note: "A crackling line of lightning.",
    recipe: "breath", shape: "line", element: "electricity", emit: 1.0, intensity: 1.1, bloom: 0.8, hitstop: 45, knockback: 0.7, flash: 0.6, punch: 0.5, chroma: 0.5 },
  { ...base, id: "std-sound-burst", name: "Sound Burst", note: "A 10 ft concussion at a point: waves, dust and a shudder.",
    recipe: "point", element: "sonic", emit: 0.35, haze: 1.2, hitstop: 70, knockback: 1.2, flash: 0.3, punch: 1.0, chroma: 0.8 },
  { ...base, id: "std-heal", name: "Heal (burst)", note: "Warm motes and soft halos. No knockback: healing should not hurt.",
    recipe: "point", element: "vitality", emit: 0.8, bloom: 0.8, hitstop: 0, knockback: 0, flash: 0.5, punch: 0.1, chroma: 0 },
  { ...base, id: "std-harm", name: "Harm (burst)", note: "Shadow rendering with a violet rim; the floor withers.",
    recipe: "point", element: "void", emit: 0.7, bloom: 0.5, hitstop: 50, knockback: 0.6, flash: 0.5, punch: 0.5, chroma: 0.6 },
  { ...base, id: "std-force-bolt", name: "Force Bolt", note: "A clean violet dart with a crisp ring on impact.",
    recipe: "ray", element: "force", emit: 0.3, burst: 1.2, bloom: 0.75, ...straight, wobble: 0.15, wobbleFreq: 2, thickness: 1.3, hitstop: 70, knockback: 1, punch: 0.6, chroma: 0.5 },
  { ...base, id: "std-psychic-ripple", name: "Psychic Ripple", note: "Pink ripples that warp the air around the point.",
    recipe: "point", element: "mental", emit: 0.6, haze: 1, hitstop: 40, knockback: 0.3, flash: 0.5, punch: 0.4, chroma: 1.0 },
  { ...base, id: "std-spirit-ray", name: "Spirit Ray", note: "Pale ghostly beam with drifting wisps.",
    recipe: "ray", element: "spirit", emit: 0.4, bloom: 0.8, ...straight, wobble: 0.4, wobbleFreq: 1.4, hitstop: 60, knockback: 0.8, chroma: 0.6 },
  { ...base, id: "std-scatter-scree", name: "Scatter Scree", note: "A line of tumbling rocks, a wall of dust and a cracked floor.",
    recipe: "breath", shape: "line", element: "kinetic", material: "stone", emit: 0.7, hitstop: 70, knockback: 1.3, flash: 0.3, punch: 0.9, chroma: 0.4 },
  { ...base, id: "std-timber", name: "Timber", note: "A falling trunk's worth of splinters and leaves.",
    recipe: "breath", shape: "line", element: "kinetic", material: "wood", emit: 0.6, hitstop: 80, knockback: 1.4, flash: 0.3, punch: 1.0, chroma: 0.3 },
  { ...base, id: "std-hurtling-stone", name: "Hurtling Stone", note: "A thrown boulder that bursts into rubble on impact.",
    recipe: "ray", element: "kinetic", material: "stone", emit: 0.3, ...straight, thickness: 1.6, speed: 0.7, arc: 0.6, hitstop: 90, knockback: 1.5, flash: 0.3, punch: 1.0, chroma: 0.3 },
  { ...base, id: "std-blade-storm", name: "Shrapnel (metal)", note: "Steel shards that glint and spark as they scatter.",
    recipe: "fireball", element: "kinetic", material: "metal", emit: 0.4, hitstop: 70, knockback: 1.2, flash: 0.4, punch: 0.9, chroma: 0.6 },
  { ...base, id: "std-hydraulic-push", name: "Hydraulic Push", note: "A jet of water that bursts into spray and soaks the floor.",
    recipe: "ray", element: "water", emit: 0.35, ...straight, wobble: 0.25, wobbleFreq: 2.5, thickness: 1.4, hitstop: 60, knockback: 1.4, flash: 0.3, punch: 0.6, chroma: 0.3 },
  { ...base, id: "std-quench", name: "Quench", note: "A sphere of water that crashes down in a 20 ft splash.",
    recipe: "fireball", element: "water", emit: 0.5, bloom: 0.5, hitstop: 50, knockback: 1, flash: 0.3, punch: 0.7, chroma: 0.3 },
  { ...base, id: "std-buffeting-winds", name: "Buffeting Winds", note: "A cone of gale: streaks, dust and warped air.",
    recipe: "breath", element: "air", emit: 1.0, haze: 1.3, hitstop: 30, knockback: 1.6, flash: 0.1, punch: 0.4, chroma: 0.3 },
  { ...base, id: "std-blast-of-the-bellows", name: "Blast of the Bellows", note: "A burst of air at a point that shoves everything outward.",
    recipe: "point", element: "air", emit: 0.4, haze: 1.5, hitstop: 40, knockback: 1.8, flash: 0.1, punch: 0.7, chroma: 0.4 },
  { ...base, id: "std-flame-strike", name: "Flame Strike", note: "A column of divine fire narrows from the sky onto a 10 ft cylinder.",
    recipe: "column", element: "fire", emit: 0.7, intensity: 1.1, bloom: 0.8, hitstop: 90, knockback: 1.2, flash: 0.7, punch: 1.2, chroma: 0.9 },
  { ...base, id: "std-whirlwind", name: "Whirlwind", note: "A spinning column of wind that keeps churning.",
    recipe: "column", element: "air", emit: 2.2, turb: 1.6, haze: 1.6, hitstop: 40, knockback: 1.3, flash: 0.1, punch: 0.6, chroma: 0.3 },
  { ...base, id: "std-bramble-bush", name: "Bramble Bush", note: "Thorny growth fills the square and lingers.",
    recipe: "field", element: "kinetic", material: "wood", emit: 2.6, hitstop: 0, knockback: 0.3, flash: 0.2, punch: 0.2, chroma: 0 },
  { ...base, id: "std-spout", name: "Spout", note: "Water bursts up across the square.",
    recipe: "field", element: "water", emit: 0.9, hitstop: 40, knockback: 0.8, flash: 0.3, punch: 0.4, chroma: 0.2 },
  { ...base, id: "std-force-barrage", name: "Force Barrage", note: "One homing dart per action, each landing with its own hit.",
    recipe: "darts", element: "force", darts: 3, emit: 0.35, thickness: 1, bloom: 0.8, hitstop: 35, knockback: 0.8, flash: 0.5, punch: 0.4, chroma: 0.4 },
  { ...base, id: "std-chain-lightning", name: "Chain Lightning", note: "Strikes one creature, then leaps to the nearest within 30 ft, again and again.",
    recipe: "chain", element: "electricity", emit: 0.5, bloom: 0.85, hitstop: 50, knockback: 0.9, flash: 0.6, punch: 0.6, chroma: 0.7 },
  { ...base, id: "std-umbral-ray", name: "Umbral Ray (custom colour)", note: "Black core with a violet glow: dark colours switch to shadow rendering.",
    recipe: "ray", element: "fire", emit: 0.35, custom: true, core: "#07040b", glow: "#9b4dff", bloom: 0.8, haze: 0.4, ...straight, wobble: 0.35, wobbleFreq: 3.2, hitstop: 80, knockback: 1, flash: 0.7, punch: 0.7, chroma: 1.3 },
];

export const PRESETS = Object.fromEntries(STANDARD.map((p) => [p.id, p]));

/** Default look per recipe when no preset matches the spell. */
export const RECIPE_LOOK = {
  breath: { emit: 1.4, hitstop: 40, knockback: 0.7, flash: 0.5, punch: 0.5, chroma: 0.4 },
  fireball: { emit: 0.45, hitstop: 80, knockback: 1.4, flash: 0.7, punch: 1.1, chroma: 0.8 },
  point: { emit: 0.45, hitstop: 60, knockback: 1, flash: 0.5, punch: 0.8, chroma: 0.5 },
  column: { emit: 0.7, hitstop: 80, knockback: 1.2, flash: 0.6, punch: 1.1, chroma: 0.7 },
  field: { emit: 2.2, hitstop: 0, knockback: 0.3, flash: 0.2, punch: 0.2, chroma: 0 },
  darts: { emit: 0.35, hitstop: 35, knockback: 0.8, flash: 0.5, punch: 0.4, chroma: 0.4 },
  chain: { emit: 0.5, hitstop: 50, knockback: 0.9, flash: 0.6, punch: 0.6, chroma: 0.6 },
  ray: { emit: 0.3, wobble: 0, arc: 0, hitstop: 60, knockback: 0.9, flash: 0.6, punch: 0.6, chroma: 0.6 },
};

/** Spell slugs whose look matches a standard preset. */
export const SLUG_PRESET = {
  fireball: "std-fireball", "ray-of-frost": "std-ray-of-frost", "breathe-fire": "std-red-dragon", "lightning-bolt": "std-blue-dragon",
  "sound-burst": "std-sound-burst", heal: "std-heal", harm: "std-harm", "force-barrage": "std-force-barrage", "chain-lightning": "std-chain-lightning",
  "flame-strike": "std-flame-strike", whirlwind: "std-whirlwind", "bramble-bush": "std-bramble-bush", spout: "std-spout",
  "scatter-scree": "std-scatter-scree", timber: "std-timber", "hurtling-stone": "std-hurtling-stone", "hydraulic-push": "std-hydraulic-push",
  quench: "std-quench", "buffeting-winds": "std-buffeting-winds", "blast-of-the-bellows": "std-blast-of-the-bellows",
};
