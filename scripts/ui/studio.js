import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Director } from "../director.js";
import { STANDARD } from "../data/presets.js";
import { RUNES, BOMBS } from "../data/strikes.js";
import { TRADITIONS } from "../data/glow.js";
import { slugOf } from "../resolver.js";
import { MATERIALS, setMaterial, restoreWalls, breakWalls, brokenCount, sceneMaterial } from "../walls.js";
import { clearScars } from "../core/scars.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const RECIPE_CHOICES = {
  breath: "Breath (cone or line from the caster)", fireball: "Lob → burst", point: "Burst at a point", column: "Column from above",
  field: "Field (lingers)", ray: "Ray → impact", darts: "Homing darts", chain: "Chain (leaps)", glow: "Cast glow (no damage)",
};
const ELEMENT_CHOICES = ["fire", "cold", "acid", "poison", "electricity", "sonic", "force", "vitality", "void", "mental", "spirit", "kinetic", "water", "air"];
const WEAPON_CHOICES = {
  longsword: "Sword (arc of steel)", axe: "Axe (heavy chop, gash)", dagger: "Dagger / knife (two quick stabs)",
  flail: "Flail / whip (lash and crack)", warhammer: "Hammer / club / mace (shockwave)", pick: "Pick (star crack)",
  polearm: "Polearm (long reap, pulls)", spear: "Spear (long thrust)", shield: "Shield (bash, pushes back)",
  longbow: "Bow (arrow)", crossbow: "Crossbow (fast bolt)", sling: "Sling (stone)", firearm: "Firearm (muzzle flash, smoke)",
  dart: "Thrown (spinning)", fist: "Unarmed (punch, kick)", claw: "Claws (rake)", jaws: "Jaws (bite)", tail: "Tail / wing (wide sweep)", bomb: "Alchemical bomb",
};

/** Attack names on this scene's creatures, for the attack override field. */
function attackNames() {
  const out = new Set();
  for (const t of canvas?.tokens?.placeables ?? []) {
    for (const i of t.actor?.items ?? []) if (i.type === "melee" || (i.type === "weapon" && i.isEquipped !== false)) out.add(i.name);
  }
  return [...out].sort();
}

let spellIndex = null;
async function spellNames() {
  if (spellIndex) return spellIndex;
  const out = new Map();
  for (const item of game.items ?? []) if (item.type === "spell") out.set(item.name, slugOf(item));
  const pack = game.packs.get("pf2e.spells-srd");
  if (pack) {
    const idx = await pack.getIndex({ fields: ["system.slug"] });
    for (const e of idx) if (!out.has(e.name)) out.set(e.name, slugOf(e));
  }
  spellIndex = out;
  return out;
}

/** GM window: test effects on the scene and edit per-spell overrides. */
export class PyreStudio extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pyre-studio",
    classes: ["pyre-studio"],
    tag: "div",
    window: { title: "Pyre Studio", icon: "fa-solid fa-fire", resizable: true },
    position: { width: 540, height: 660 },
    actions: {
      pyreTab: PyreStudio.#onTab,
      playPreset: PyreStudio.#onPlayPreset,
      playStrike: PyreStudio.#onPlayStrike,
      playGlow: PyreStudio.#onPlayGlow,
      saveOverride: PyreStudio.#onSaveOverride,
      removeOverride: PyreStudio.#onRemoveOverride,
      saveStrikeOverride: PyreStudio.#onSaveStrikeOverride,
      removeStrikeOverride: PyreStudio.#onRemoveStrikeOverride,
      setWallMaterial: PyreStudio.#onSetWallMaterial,
      breakSelected: PyreStudio.#onBreakSelected,
      restoreWalls: PyreStudio.#onRestoreWalls,
      clearMarks: PyreStudio.#onClearMarks,
    },
  };

  static PARTS = { body: { template: `${TEMPLATE_PATH}/studio.hbs`, scrollable: [".ps-scroll"] } };

  static open() {
    const existing = foundry.applications.instances?.get?.("pyre-studio");
    if (existing) return existing.bringToFront?.() ?? existing.render(true);
    return new PyreStudio().render(true);
  }

  tabName = "test";

  async _prepareContext() {
    const overrides = game.settings.get(MODULE_ID, "overrides") ?? {};
    const strikeOv = game.settings.get(MODULE_ID, "strikeOverrides") ?? {};
    const names = await spellNames();
    const bySlug = new Map([...names].map(([n, s]) => [s, n]));
    const groups = {};
    for (const p of STANDARD) {
      const g = { breath: "Breaths", fireball: "Lobbed bursts", point: "Bursts", column: "Columns", field: "Fields", ray: "Rays", darts: "Darts", chain: "Chains" }[p.recipe] ?? "Other";
      (groups[g] ??= []).push({ id: p.id, name: p.name });
    }
    return {
      tab: this.tabName,
      wallsOn: game.settings.get(MODULE_ID, "breakableWalls"),
      marksOn: game.settings.get(MODULE_ID, "persistentMarks"),
      sceneMat: canvas?.scene ? sceneMaterial() : "stone",
      weaknessOn: game.settings.get(MODULE_ID, "wallWeakness"),
      materials: Object.entries(MATERIALS).map(([id, m]) => ({ id, label: Number.isFinite(m.hp) ? `${m.name} (Dureza ${m.hardness}, ${m.hp} PV)` : m.name })),
      selectedWalls: canvas?.walls?.controlled?.length ?? 0,
      brokenWalls: canvas?.ready ? brokenCount() : 0,
      marks: (canvas?.scene?.getFlag(MODULE_ID, "scars") ?? []).length,
      presetGroups: Object.entries(groups).map(([label, items]) => ({ label, items })),
      weapons: Object.entries(WEAPON_CHOICES).map(([id, label]) => ({ id, label })),
      runes: Object.entries(RUNES).filter(([, r]) => r.family !== "bomb").map(([id, r]) => ({ id, label: r.name })),
      bombs: Object.entries(BOMBS).map(([id, b]) => ({ id, label: b.name })),
      traditions: Object.entries(TRADITIONS).map(([id, t]) => ({ id, label: t.name })),
      recipes: Object.entries(RECIPE_CHOICES).map(([id, label]) => ({ id, label })),
      elements: ELEMENT_CHOICES.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) })),
      spellNames: [...names.keys()].sort(),
      attackNames: attackNames(),
      strikeOverrides: Object.entries(strikeOv).map(([key, o]) => ({
        key, name: o.name ?? key,
        summary: [WEAPON_CHOICES[o.weapon]?.split(" (")[0], o.rune ? RUNES[o.rune]?.name : null].filter(Boolean).join(" · "),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      overrides: Object.entries(overrides).map(([slug, o]) => ({
        slug, name: bySlug.get(slug) ?? slug,
        summary: o.disabled ? "No animation" : [o.recipe ? RECIPE_CHOICES[o.recipe]?.split(" (")[0] : null, o.element, o.material, o.color ? "custom colours" : null].filter(Boolean).join(" · ") || "—",
        swatch: o.color ? `linear-gradient(90deg, ${o.color[0]}, ${o.color[1]})` : null,
      })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Scene tab: the scene's default material and the damage-type rule save as soon as they change. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const sel = this.element.querySelector("[name=sceneMat]");
    sel?.addEventListener("change", async () => {
      await canvas.scene?.setFlag(MODULE_ID, "wallMaterial", sel.value);
      this.#msg(`This scene's walls are now ${MATERIALS[sel.value].name} unless set otherwise.`);
    });
    const wk = this.element.querySelector("[name=weakness]");
    wk?.addEventListener("change", async () => {
      await game.settings.set(MODULE_ID, "wallWeakness", wk.checked);
      this.#msg(wk.checked ? "Materials react to damage types." : "Every damage type counts the same against walls.");
    });
  }

  #val(sel) { return this.element.querySelector(sel)?.value ?? ""; }
  #msg(text, err = false) {
    const el = this.element.querySelector(".ps-msg");
    if (el) { el.textContent = text; el.classList.toggle("err", err); }
  }

  #caster() {
    const t = canvas.tokens.controlled[0];
    if (!t) { this.#msg("Select the token that casts or attacks first.", true); return null; }
    return t;
  }
  #targets() { return [...game.user.targets].filter((t) => t.scene?.id === canvas.scene?.id || t.document?.parent?.id === canvas.scene?.id); }

  static #onTab(event, target) {
    this.tabName = target.dataset.tab;
    this.render();
  }

  static #onPlayPreset() {
    const caster = this.#caster(); if (!caster) return;
    Director.get().playPreset(this.#val("[name=preset]"), caster, this.#targets());
    this.#msg("");
  }

  static #onPlayStrike() {
    const caster = this.#caster(); if (!caster) return;
    const target = this.#targets()[0];
    if (!target) return this.#msg("Target a token (press T over it) to strike at.", true);
    const weapon = this.#val("[name=weapon]");
    const runes = [this.#val("[name=rune1]"), this.#val("[name=rune2]")].filter((r) => r && r !== "none").map((id) => ({ id, greater: this.element.querySelector("[name=greater]")?.checked ?? false }));
    Director.get().playTestStrike({
      weapon, runes, potency: Number(this.#val("[name=potency]")) || 0, striking: Number(this.#val("[name=striking]")) || 0,
      bomb: this.#val("[name=bomb]"), bombLevel: 1, flurry: this.element.querySelector("[name=flurry]")?.checked ?? false,
      outcome: this.#val("[name=outcome]"),
    }, caster, target);
    this.#msg("");
  }

  static #onPlayGlow() {
    const caster = this.#caster(); if (!caster) return;
    Director.get().playTestGlow(this.#val("[name=tradition]"), this.#val("[name=intent]"), caster, this.#targets());
    this.#msg("");
  }

  static async #onSaveOverride() {
    const name = this.#val("[name=ovSpell]").trim();
    const names = await spellNames();
    const slug = names.get(name) ?? (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "");
    if (!slug) return this.#msg("Type or pick a spell name first.", true);
    const o = {};
    if (this.element.querySelector("[name=ovOff]")?.checked) o.disabled = true;
    else {
      const recipe = this.#val("[name=ovRecipe]"), element = this.#val("[name=ovElement]"), material = this.#val("[name=ovMaterial]");
      if (recipe) o.recipe = recipe;
      if (element) o.element = element;
      if (material && (element === "kinetic" || !element)) o.material = material;
      if (this.element.querySelector("[name=ovColor]")?.checked) o.color = [this.#val("[name=ovCore]"), this.#val("[name=ovGlow]")];
    }
    if (!Object.keys(o).length) return this.#msg("Nothing to change: pick a recipe, an element, colours or Off.", true);
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "overrides") ?? {});
    all[slug] = o;
    await game.settings.set(MODULE_ID, "overrides", all);
    this.tabName = "overrides";
    await this.render();
    this.#msg(`Saved. ${name} now plays your version.`);
  }

  static async #onSaveStrikeOverride() {
    const name = this.#val("[name=soName]").trim();
    if (!name) return this.#msg("Type or pick an attack name first.", true);
    const o = { name, weapon: this.#val("[name=soWeapon]") };
    const rune = this.#val("[name=soRune]");
    if (rune && rune !== "none") o.rune = rune;
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "strikeOverrides") ?? {});
    all[name.toLowerCase()] = o;
    await game.settings.set(MODULE_ID, "strikeOverrides", all);
    this.tabName = "overrides";
    await this.render();
    this.#msg(`Saved. ${name} now plays as ${WEAPON_CHOICES[o.weapon]?.split(" (")[0] ?? o.weapon}.`);
  }

  static async #onRemoveStrikeOverride(event, target) {
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "strikeOverrides") ?? {});
    delete all[target.dataset.key];
    await game.settings.set(MODULE_ID, "strikeOverrides", all);
    await this.render();
    this.#msg("Back to automatic.");
  }

  static async #onSetWallMaterial() {
    const docs = (canvas.walls?.controlled ?? []).map((w) => w.document);
    if (!docs.length) return this.#msg("Select walls on the Walls layer first.", true);
    const mat = this.#val("[name=wallMat]");
    await setMaterial(docs, mat);
    await this.render();
    this.#msg(`${docs.length} wall(s) are now ${MATERIALS[mat].name}.`);
  }

  static async #onBreakSelected() {
    const docs = (canvas.walls?.controlled ?? []).map((w) => w.document).filter((d) => !d.getFlag(MODULE_ID, "broken"));
    if (!docs.length) return this.#msg("Select walls on the Walls layer first.", true);
    await breakWalls(docs);
    await this.render();
    this.#msg(`${docs.length} wall(s) broken. Restore them here whenever you like.`);
  }

  static async #onRestoreWalls() {
    const n = await restoreWalls();
    await this.render();
    this.#msg(n ? `${n} wall(s) restored.` : "No broken walls in this scene.");
  }

  static async #onClearMarks() {
    await clearScars();
    this.tabName = "scene";
    await this.render();
    this.#msg("Marks cleared.");
  }

  static async #onRemoveOverride(event, target) {
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "overrides") ?? {});
    delete all[target.dataset.slug];
    await game.settings.set(MODULE_ID, "overrides", all);
    await this.render();
    this.#msg("Back to automatic.");
  }
}
