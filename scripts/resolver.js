import { MODULE_ID } from "./constants.js";
import { PRESETS, SLUG_PRESET, RECIPE_LOOK, base as LOOK_BASE } from "./data/presets.js";
import { TRADITIONS } from "./data/glow.js";
import { RUNES, BOMBS } from "./data/strikes.js";

/*
 * Reads PF2e items and decides what to play.
 * Order: the GM's override for this slug, then a signature preset, then deduction from the data.
 */

const DAMAGE_TO_ELEMENT = {
  fire: "fire", cold: "cold", acid: "acid", electricity: "electricity", sonic: "sonic", force: "force",
  vitality: "vitality", void: "void", mental: "mental", spirit: "spirit", poison: "poison",
  bludgeoning: "kinetic", piercing: "kinetic", slashing: "kinetic", bleed: "kinetic",
};
const TRAIT_TO_ELEMENT = {
  fire: "fire", cold: "cold", acid: "acid", electricity: "electricity", sonic: "sonic", force: "force",
  vitality: "vitality", void: "void", mental: "mental", spirit: "spirit", poison: "poison",
  earth: "kinetic", metal: "kinetic", wood: "kinetic", plant: "kinetic", water: "water", air: "air",
  light: "vitality", darkness: "void", shadow: "void", illusion: "mental", emotion: "mental", fear: "mental",
  healing: "vitality", death: "void", holy: "spirit", unholy: "spirit",
};
const ELEMENT_TRAITS = Object.keys(TRAIT_TO_ELEMENT);
const ENERGY = new Set(["fire", "cold", "acid", "electricity", "sonic", "force", "vitality", "void", "mental", "spirit", "poison"]);
/** Areas without an element take the caster's tradition colours over a base element. */
const TRADITION_BASE = { arcane: "force", divine: "vitality", occult: "mental", primal: "spirit" };

function slugify(name) {
  return String(name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Compendium spells often carry no slug, and Babele translates names.
 * Prefer the stored slug, then the English name Babele keeps, then the name itself.
 */
export function slugOf(item) {
  const s = item?.slug ?? item?.system?.slug;
  if (s) return s;
  const original = item?.flags?.babele?.originalName ?? item?._source?.flags?.babele?.originalName;
  return slugify(original ?? item?.name ?? "");
}

function overrides() {
  try { return game.settings.get(MODULE_ID, "overrides") ?? {}; } catch { return {}; }
}

function feet(range) {
  const r = String(range ?? "").toLowerCase();
  if (!r) return 0;
  if (r.includes("touch")) return 5;
  const m = r.match(/(\d[\d,]*)\s*(feet|foot|ft)/);
  if (m) return parseInt(m[1].replace(/,/g, ""), 10);
  if (/mile|planetary|unlimited|varies/.test(r)) return 999;
  return 0;
}

function hexToArr(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function arrToHex(a) {
  return "#" + a.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

function damageInfo(item) {
  const types = [];
  let healing = false;
  for (const d of Object.values(item.system?.damage ?? {})) {
    // Prepared PF2e data holds kinds as a Set; source data (and imports) as an array.
    const kinds = d.kinds instanceof Set ? [...d.kinds] : Array.isArray(d.kinds) ? d.kinds : [];
    if (kinds.includes("healing")) healing = true;
    if (d.type && (kinds.length === 0 || kinds.includes("damage"))) types.push(d.type);
  }
  return { types, healing };
}

/** Pick element + material from damage types and traits. */
function readElement(types, traits, steps) {
  const energy = types.map((t) => DAMAGE_TO_ELEMENT[t]).find((e) => e && ENERGY.has(e));
  if (energy) { steps.push(`damage ${types.join(", ")} → ${energy}`); return { element: energy }; }
  const elTrait = ELEMENT_TRAITS.find((t) => traits.includes(t));
  const material = traits.includes("metal") ? "metal" : traits.includes("wood") || traits.includes("plant") ? "wood" : "stone";
  if (types.length) {
    if (elTrait && !["earth", "metal", "wood", "plant"].includes(elTrait)) {
      const element = TRAIT_TO_ELEMENT[elTrait];
      steps.push(`physical damage, trait ${elTrait} → ${element}`);
      return { element };
    }
    steps.push(`physical damage → kinetic (${material})`);
    return { element: "kinetic", material };
  }
  if (elTrait) {
    const element = TRAIT_TO_ELEMENT[elTrait];
    steps.push(`trait ${elTrait} → ${element}`);
    return { element, material: element === "kinetic" ? material : undefined };
  }
  return { element: null };
}

/**
 * Spell → effect plan.
 * ctx: { tradition, rank, hasTemplate, conjureActive }
 */
/** NPC abilities and feats (Breath Weapon and the like) keep their area and damage in inline rolls in the text. */
const DAMAGE_WORDS = Object.keys(DAMAGE_TO_ELEMENT).join("|");
function inlineInfo(item) {
  const text = String(item?.system?.description?.value ?? "");
  const types = new Set();
  for (const m of text.matchAll(/@Damage\[([^\]]*(?:\][^\]]*)*)\]/gi)) {
    for (const t of m[1].matchAll(new RegExp(`\\b(${DAMAGE_WORDS})\\b`, "gi"))) types.add(t[1].toLowerCase());
  }
  // Older entries use plain inline rolls: [[/r 12d6[cold]]]
  for (const m of text.matchAll(/\[\[\/(?:r|roll|br)\s+([^\]]*(?:\][^\]]*)*)\]\]/gi)) {
    for (const t of m[1].matchAll(new RegExp(`\\b(${DAMAGE_WORDS})\\b`, "gi"))) types.add(t[1].toLowerCase());
  }
  // Last resort: the words themselves ("deals 12d6 cold damage")
  if (!types.size) {
    const plain = text.replace(/<[^>]+>/g, " ");
    for (const t of plain.matchAll(new RegExp(`\\b(${DAMAGE_WORDS})\\s+damage\\b`, "gi"))) types.add(t[1].toLowerCase());
  }
  let area = null;
  const tm = text.match(/@Template\[([^\]]+)\]/i);
  if (tm) {
    const parts = Object.fromEntries(tm[1].split("|").map((x) => { const [k, v] = x.split(":"); return v === undefined ? ["type", k.trim()] : [k.trim(), v.trim()]; }));
    const type = { ray: "line", rect: "square", circle: "burst" }[parts.type] ?? parts.type;
    if (type) area = { type, value: Number(parts.distance) || null };
  }
  if (!area) {
    const am = text.replace(/<[^>]+>/g, " ").match(/(\d+)[- ](?:foot|feet|ft\.?)[- ](cone|line|burst|emanation)/i);
    if (am) area = { type: am[2].toLowerCase(), value: Number(am[1]) };
  }
  return { types: [...types], area };
}

export function resolveSpell(item, ctx = {}) {
  const sys = item?.system ?? {};
  const slug = slugOf(item);
  const traits = sys.traits?.value ?? [];
  const inline = item?.type && item.type !== "spell" ? inlineInfo(item) : null;
  const area = sys.area ?? inline?.area ?? null;
  const save = sys.defense?.save?.statistic ?? "";
  const range = sys.range?.value ?? "";
  const target = String(sys.target?.value ?? "").toLowerCase();
  const dmg = damageInfo(item);
  const types = dmg.types.length ? dmg.types : (inline?.types ?? []), healing = dmg.healing;
  const hasDamage = types.length > 0 || healing;
  const steps = [];
  const tradition = ctx.tradition || (sys.traits?.traditions ?? [])[0] || "arcane";

  let kind = "area", recipe, intent = null;
  if (area?.type === "cone" || area?.type === "line") recipe = "breath";
  else if (area?.type === "burst") recipe = feet(range) > 0 && hasDamage ? "fireball" : "point";
  else if (area?.type === "emanation") recipe = "aura";
  else if (area?.type === "cylinder") recipe = "column";
  else if (area?.type === "cube" || area?.type === "square") recipe = "field";
  else if (traits.includes("attack")) recipe = "ray";
  else if (hasDamage && save && feet(range) > 0) recipe = healing && !types.length ? "pulse" : "bolt";
  else if (hasDamage) recipe = "pulse";
  else {
    kind = "glow"; recipe = "glow";
    if (traits.includes("teleportation")) intent = "teleport";
    else if (traits.includes("summon")) intent = "summon";
    else if (/willing|ally|allies|you and/.test(target)) intent = "buff";
    else if (save) intent = "debuff";
    else if (!target || /^you\b/.test(target)) intent = "self";
    else intent = "auto";
  }
  if (area) steps.push(`area ${area.type} ${area.value} ft → ${recipe}`);
  else steps.push(`${traits.includes("attack") ? "spell attack" : save ? `${save} save` : "no defense"} → ${recipe}`);

  let { element, material } = healing && !types.some((t) => t !== "vitality") ? { element: "vitality" } : readElement(types, traits, steps);
  let custom = null;
  if (!element) {
    element = TRADITION_BASE[tradition] ?? "force";
    const T = TRADITIONS[tradition] ?? TRADITIONS.arcane;
    custom = { core: arrToHex(T.core), glow: arrToHex(T.glow) };
    steps.push(`no element → ${tradition} tradition colours`);
  }

  // Signature preset by slug, then the GM override
  let look = { ...LOOK_BASE, ...(RECIPE_LOOK[mapRecipe(recipe)] ?? {}) };
  const presetId = SLUG_PRESET[slug];
  if (presetId && PRESETS[presetId]) {
    const p = PRESETS[presetId];
    look = { ...look, ...p };
    recipe = reverseRecipe(p.recipe, recipe);
    element = p.element; material = p.material ?? material; custom = p.custom ? { core: p.core, glow: p.glow } : custom;
    steps.push(`signature preset: ${p.name}`);
  }
  const ov = overrides()[slug];
  if (ov) {
    if (ov.disabled) return { kind: "none", steps: [...steps, "turned off by the GM"] };
    if (ov.recipe) recipe = ov.recipe === "glow" ? "glow" : ov.recipe;
    if (ov.element) element = ov.element;
    if (ov.material) material = ov.material;
    if (ov.color) custom = { core: ov.color[0], glow: ov.color[1] };
    if (ov.recipe === "glow") kind = "glow";
    else if (ov.recipe) kind = "area";
    steps.push("GM override");
  }
  if (kind === "glow") {
    return { kind, slug, intent: intent ?? "auto", tradition, custom, steps, traits };
  }
  return {
    kind, slug, recipe, engineRecipe: mapRecipe(recipe), element, material: material ?? "stone", custom,
    look: { ...look, element, material: material ?? "stone", custom: !!custom, core: custom?.core ?? look.core, glow: custom?.glow ?? look.glow },
    radius: area?.value ?? null, areaType: area?.type ?? null, steps, traits, tradition,
    multi: /\b(or 2|1 or 2|up to|creatures)\b/.test(target),
  };
}

/** Resolver recipes → engine recipes. */
function mapRecipe(r) {
  return { breath: "breath", fireball: "fireball", point: "point", aura: "point", column: "column", field: "field",
    ray: "ray", bolt: "ray", pulse: "point", darts: "darts", chain: "chain", lob: "fireball" }[r] ?? r;
}
function reverseRecipe(presetRecipe, current) {
  // A preset can override the delivery (Force Barrage → darts); keep resolver names for logging.
  return presetRecipe ?? current;
}

/* -------------------------------------------- */
/*  Strikes                                     */
/* -------------------------------------------- */

const GROUP_STYLE = {
  sword: "longsword", axe: "axe", knife: "dagger", spear: "spear", polearm: "polearm",
  club: "warhammer", hammer: "warhammer", flail: "flail", pick: "pick",
  brawling: "fist", shield: "shield", bow: "longbow", crossbow: "crossbow", firearm: "firearm", dart: "dart", sling: "sling", bomb: "bomb",
};
const RANGED_STYLES = new Set(["longbow", "crossbow", "firearm", "sling", "dart", "bomb"]);
const RUNE_ALIAS = { ghostTouch: "ghostTouch", greaterFearsome: "fearsome" };

/** Map a PF2e rune key (camelCase, maybe with greater/major/true) to a lab rune. */
function readRune(key) {
  if (!key) return null;
  const m = String(key).match(/^(greater|major|true|lesser|moderate)?(.+)$/);
  const tier = m[1] ?? "";
  let base = m[2];
  base = base.charAt(0).toLowerCase() + base.slice(1);
  base = RUNE_ALIAS[base] ?? base;
  if (!RUNES[base]) return null;
  return { id: base, greater: ["greater", "major", "true"].includes(tier) };
}

/**
 * Weapon or NPC strike → strike plan.
 * Returns { weapon (lab style key), runes: [{id, greater}], potency, striking, bomb, ranged }
 */
/** Attack names, English and Portuguese (PF2e Babele) → style. Natural attacks first. */
const NAME_STYLE = [
  [/\b(claws?|talons?|rake|garras?|talões?|unhas?)\b/i, "claw"],
  [/\b(jaws?|bite|fangs?|mandibles?|maw|beak|mordida|mand[ií]bulas?|presas?|bico|boca|dentes)\b/i, "jaws"],
  [/\b(tail|tails|wing|wings|tentacles?|cauda|rabo|asas?|tent[aá]culos?)\b/i, "tail"],
  [/\b(bomb|bomba|alchemist'?s fire|acid flask|frost vial|fogo alqu[ií]mico|frasco)\b/i, "bomb"],
  [/\b(crossbow|arbalest|besta|balestra)\b/i, "crossbow"],
  [/\b(sling|funda|estilingue)\b/i, "sling"],
  [/\b(gun|pistol|musket|rifle|arquebus|blunderbuss|firearm|pistola|mosquete|arcabuz|bacamarte|espingarda)\b/i, "firearm"],
  [/\b(bow|longbow|shortbow|arco)\b/i, "longbow"],
  [/\b(darts?|javelins?|shuriken|dardos?|azagaias?|dardo)\b/i, "dart"],
  [/\b(shield|escudo)\b/i, "shield"],
  [/\b(fist|punch|kick|knee|elbow|headbutt|unarmed|punho|soco|chute|joelhada|cotovelada|cabeçada|desarmado)\b/i, "fist"],
  [/\b(whip|flail|morningstar|chain|scourge|chicote|mangual|corrente|a[cç]oite)\b/i, "flail"],
  [/\b(pick|picks|picareta|picaretas|picão)\b/i, "pick"],
  [/\b(hammer|warhammer|maul|mace|club|greatclub|staff|quarterstaff|slam|hoof|hooves|stomp|fist of|martelo|marreta|ma[cç]a|clava|porrete|cajado|bord[aã]o|pancada|casco|cascos|pisot[aã]o)\b/i, "warhammer"],
  [/\b(glaive|halberd|scythe|guisarme|ranseur|bardiche|naginata|poleaxe|polearm|alabarda|foice|gl[aá]dio|archa)\b/i, "polearm"],
  [/\b(axe|greataxe|battleaxe|hatchet|cleaver|machado|machadinha|cutelo|acha)\b/i, "axe"],
  [/\b(dagger|knife|kukri|stiletto|dirk|main-gauche|sickle|adaga|punhal|faca|estilete|foice curta)\b/i, "dagger"],
  [/\b(spear|lance|pike|trident|rapier|horn|horns|gore|stinger|sting|lan[cç]a|pique|tridente|rapieira|estoque|chifres?|ferr[aã]o|chifrada)\b/i, "spear"],
  [/\b(sword|longsword|shortsword|greatsword|bastard|blade|scimitar|falchion|katana|saber|sabre|espada|l[aâ]mina|cimitarra)\b/i, "longsword"],
];

/** GM overrides for attacks, by attack name. */
function strikeOverrides() {
  try { return game.settings.get(MODULE_ID, "strikeOverrides") ?? {}; } catch { return {}; }
}
function nameKey(name) { return String(name ?? "").trim().toLowerCase(); }

export function styleFromName(name) {
  const n = String(name ?? "");
  for (const [re, style] of NAME_STYLE) if (re.test(n)) return style;
  return null;
}

/** Read item:group:*, item:base:*, item:slug:*, item:trait:* from a check's roll options. */
function fromOptions(options = []) {
  const out = { group: null, base: null, slug: null, traits: [] };
  for (const o of options ?? []) {
    let m;
    if ((m = /^item:group:(.+)$/.exec(o))) out.group ??= m[1];
    else if ((m = /^item:base:(.+)$/.exec(o))) out.base ??= m[1];
    else if ((m = /^item:slug:(.+)$/.exec(o))) out.slug ??= m[1];
    else if ((m = /^item:trait:(.+)$/.exec(o))) out.traits.push(m[1]);
  }
  return out;
}

export function resolveStrike(item, options = [], ctx = {}) {
  const opt = fromOptions(options);
  const sys = { ...(item?.system ?? {}) };
  sys.group ??= opt.group;
  sys.baseItem ??= opt.base;
  sys.slug ??= opt.slug;
  const traits = sys.traits?.value?.length ? sys.traits.value : opt.traits;
  const steps = [];
  const ranged = !!(item?.isRanged ?? traits.some((t) => t.startsWith("range") || t.startsWith("thrown")));
  const types = [];
  if (item?.type === "melee") {
    for (const d of Object.values(sys.damageRolls ?? {})) if (d.damageType) types.push(d.damageType);
  } else if (sys.damage?.damageType) types.push(sys.damage.damageType);

  // 1. The GM said so
  const ov = strikeOverrides()[nameKey(item?.name)] ?? null;
  let style = ov?.weapon ?? null;
  if (style) steps.push(`GM override "${item?.name}" → ${style}`);
  // 2. PF2e weapon data (characters). Brawling covers claws and jaws too, so names win there.
  const byName = styleFromName(item?.name) ?? styleFromName(sys.slug) ?? styleFromName(sys.baseItem);
  if (!style && GROUP_STYLE[sys.group] && !(sys.group === "brawling" && byName && byName !== "fist")) {
    style = GROUP_STYLE[sys.group];
    steps.push(`group ${sys.group} → ${style}`);
  }
  // 3. The attack's name (NPCs rarely have a group)
  if (!style && byName) {
    style = byName;
    // A ranged attack named like a melee one (thrown dagger, spit) still flies
    if (ranged && !RANGED_STYLES.has(style)) style = "dart";
    steps.push(`name "${item?.name}" → ${style}`);
  }
  // 4. Traits and damage
  if (!style) {
    if (ranged) style = "dart";
    else if (types[0] === "bludgeoning") style = "warhammer";
    else if (types[0] === "piercing") style = traits.includes("unarmed") ? "jaws" : "spear";
    else if (types[0] === "slashing") style = traits.includes("unarmed") ? "claw" : "longsword";
    else if (traits.includes("unarmed")) style = "fist";
    else style = "longsword";
    steps.push(`no group or known name; ${ranged ? "ranged" : types[0] ?? "no damage type"} → ${style}`);
  }

  // A melee weapon thrown at range (dagger, javelin, hatchet) spins through the air.
  const thrownTrait = traits.some((t) => t === "thrown" || t.startsWith("thrown-"));
  const reachFt = Number((traits.find((t) => t.startsWith("reach-")) ?? "").split("-")[1]) || (traits.includes("reach") ? 10 : 5);
  const thrownNow = options?.some?.((o) => o === "item:ranged" || o === "item:thrown" || o === "thrown") || (ctx.gap != null && ctx.gap > reachFt + 2.5);
  if (!ov?.weapon && thrownTrait && thrownNow && !RANGED_STYLES.has(style)) {
    steps.push(`thrown ${style} at ${ctx.gap != null ? Math.round(ctx.gap) + " ft" : "range"} → dart`);
    style = "dart";
  }

  const runes = [];
  if (ov?.rune && RUNES[ov.rune]) { runes.push({ id: ov.rune, greater: false }); steps.push(`GM rune ${ov.rune}`); }
  for (const key of sys.runes?.property ?? []) {
    const r = readRune(key);
    if (r && runes.length < 3) runes.push(r);   // PF2e: up to 3 property runes (one per point of potency)
  }
  // NPC strikes: extra energy damage reads like an elemental rune
  if (!runes.length) {
    const energy = types.slice(1).concat(traits).find((t) => ["fire", "cold", "electricity", "acid", "sonic", "spirit"].includes(t));
    const map = { fire: "flaming", cold: "frost", electricity: "shock", acid: "corrosive", sonic: "thundering", spirit: "astral" };
    if (energy && map[energy]) runes.push({ id: map[energy], greater: false });
  }
  let bomb = null;
  if (style === "bomb") {
    const dmg = types[0] ?? traits.find((t) => DAMAGE_TO_ELEMENT[t]);
    const byType = { fire: "fire", cold: "frost", acid: "acid", electricity: "lightning", sonic: "thunder", poison: "blight" };
    bomb = byType[dmg] ?? "fire";
  }
  return {
    weapon: style, runes, potency: Number(sys.runes?.potency ?? 0) || 0, striking: Number(sys.runes?.striking ?? 0) || 0,
    bomb, bombLevel: /major/i.test(item?.name ?? "") ? 3 : /greater/i.test(item?.name ?? "") ? 2 : /lesser/i.test(item?.name ?? "") ? 0 : 1,
    ranged: ranged || RANGED_STYLES.has(style), steps,
  };
}

export { hexToArr, arrToHex, BOMBS };
