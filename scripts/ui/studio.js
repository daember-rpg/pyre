import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Director } from "../director.js";
import { STANDARD } from "../data/presets.js";
import { RUNES, BOMBS } from "../data/strikes.js";
import { TRADITIONS } from "../data/glow.js";
import { slugOf } from "../resolver.js";
import { MATERIALS, openWallBatch, setMaterial, restoreWalls, breakWalls, brokenCount, sceneMaterial, materialName, materialLabel } from "../walls.js";
import { clearScars } from "../core/scars.js";
import { t } from "../i18n.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const RECIPE_EN = {
  breath: "Breath (cone or line from the caster)", fireball: "Lob → burst", point: "Burst at a point", column: "Column from above",
  field: "Field (lingers)", ray: "Ray → impact", darts: "Homing darts", chain: "Chain (leaps)", glow: "Cast glow (no damage)",
};
const ELEMENT_CHOICES = ["fire", "cold", "acid", "poison", "electricity", "sonic", "force", "vitality", "void", "mental", "spirit", "kinetic", "water", "air"];
const WEAPON_EN = {
  longsword: "Sword (arc of steel)", axe: "Axe (heavy chop, gash)", dagger: "Dagger / knife (two quick stabs)",
  flail: "Flail / whip (lash and crack)", warhammer: "Hammer / club / mace (shockwave)", pick: "Pick (star crack)",
  polearm: "Polearm (long reap, pulls)", spear: "Spear (long thrust)", shield: "Shield (bash, pushes back)",
  longbow: "Bow (arrow)", crossbow: "Crossbow (fast bolt)", sling: "Sling (stone)", firearm: "Firearm (muzzle flash, smoke)",
  dart: "Thrown (spinning)", fist: "Unarmed (punch, kick)", claw: "Claws (rake)", jaws: "Jaws (bite)", tail: "Tail / wing (wide sweep)", bomb: "Alchemical bomb",
};
const recipeLabel = (id) => t(`Recipe.${id}`, null, RECIPE_EN[id] ?? id);
const weaponLabel = (id) => t(`Weapon.${id}`, null, WEAPON_EN[id] ?? id);
const short = (s) => s?.split(" (")[0];

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
    window: { title: "PYRE.Studio.Title", icon: "fa-solid fa-fire", resizable: true },
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
      batchWalls: async function () { await openWallBatch(); this.render(); },
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
      const known = ["breath", "fireball", "point", "column", "field", "ray", "darts", "chain"].includes(p.recipe);
      const g = t(`Group.${known ? p.recipe : "other"}`);
      (groups[g] ??= []).push({ id: p.id, name: p.name });
    }
    return {
      tab: this.tabName,
      wallsOn: game.settings.get(MODULE_ID, "breakableWalls"),
      marksOn: game.settings.get(MODULE_ID, "persistentMarks"),
      sceneMat: canvas?.scene ? sceneMaterial() : "stone",
      weaknessOn: game.settings.get(MODULE_ID, "wallWeakness"),
      materials: Object.keys(MATERIALS).map((id) => ({ id, label: materialLabel(id) })),
      selectedWalls: canvas?.walls?.controlled?.length ?? 0,
      brokenWalls: canvas?.ready ? brokenCount() : 0,
      marks: (canvas?.scene?.getFlag(MODULE_ID, "scars") ?? []).length,
      presetGroups: Object.entries(groups).map(([label, items]) => ({ label, items })),
      weapons: Object.keys(WEAPON_EN).map((id) => ({ id, label: weaponLabel(id) })),
      runes: Object.entries(RUNES).filter(([, r]) => r.family !== "bomb").map(([id, r]) => ({ id, label: t(`Rune.${id}`, null, r.name) })),
      bombs: Object.entries(BOMBS).map(([id, b]) => ({ id, label: t(`Bomb.${id}`, null, b.name) })),
      traditions: Object.entries(TRADITIONS).map(([id, tr]) => ({ id, label: t(`Tradition.${id}`, null, tr.name) })),
      recipes: Object.keys(RECIPE_EN).map((id) => ({ id, label: recipeLabel(id) })),
      elements: ELEMENT_CHOICES.map((id) => ({ id, label: t(`Element.${id}`, null, id.charAt(0).toUpperCase() + id.slice(1)) })),
      spellNames: [...names.keys()].sort(),
      attackNames: attackNames(),
      strikeOverrides: Object.entries(strikeOv).map(([key, o]) => ({
        key, name: o.name ?? key,
        summary: [WEAPON_EN[o.weapon] ? short(weaponLabel(o.weapon)) : null, o.rune ? t(`Rune.${o.rune}`, null, RUNES[o.rune]?.name ?? o.rune) : null].filter(Boolean).join(" · "),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      overrides: Object.entries(overrides).map(([slug, o]) => ({
        slug, name: bySlug.get(slug) ?? slug,
        summary: o.disabled ? t("Studio.NoAnimation") : [o.recipe ? short(recipeLabel(o.recipe)) : null, o.element ? t(`Element.${o.element}`, null, o.element) : null, o.material ? materialName(o.material) : null, o.color ? t("Studio.CustomColours") : null].filter(Boolean).join(" · ") || "—",
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
      this.#msg(t("Studio.Msg.SceneMaterial", { name: materialName(sel.value) }));
    });
    const wk = this.element.querySelector("[name=weakness]");
    wk?.addEventListener("change", async () => {
      await game.settings.set(MODULE_ID, "wallWeakness", wk.checked);
      this.#msg(t(wk.checked ? "Studio.Msg.WeaknessOn" : "Studio.Msg.WeaknessOff"));
    });
  }

  #val(sel) { return this.element.querySelector(sel)?.value ?? ""; }
  #msg(text, err = false) {
    const el = this.element.querySelector(".ps-msg");
    if (el) { el.textContent = text; el.classList.toggle("err", err); }
  }

  #caster() {
    const t = canvas.tokens.controlled[0];
    if (!t) { this.#msg(t("Studio.Msg.SelectToken"), true); return null; }
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
    if (!target) return this.#msg(t("Studio.Msg.TargetToken"), true);
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
    if (!slug) return this.#msg(t("Studio.Msg.PickSpell"), true);
    const o = {};
    if (this.element.querySelector("[name=ovOff]")?.checked) o.disabled = true;
    else {
      const recipe = this.#val("[name=ovRecipe]"), element = this.#val("[name=ovElement]"), material = this.#val("[name=ovMaterial]");
      if (recipe) o.recipe = recipe;
      if (element) o.element = element;
      if (material && (element === "kinetic" || !element)) o.material = material;
      if (this.element.querySelector("[name=ovColor]")?.checked) o.color = [this.#val("[name=ovCore]"), this.#val("[name=ovGlow]")];
    }
    if (!Object.keys(o).length) return this.#msg(t("Studio.Msg.NothingToChange"), true);
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "overrides") ?? {});
    all[slug] = o;
    await game.settings.set(MODULE_ID, "overrides", all);
    this.tabName = "overrides";
    await this.render();
    this.#msg(t("Studio.Msg.Saved", { name }));
  }

  static async #onSaveStrikeOverride() {
    const name = this.#val("[name=soName]").trim();
    if (!name) return this.#msg(t("Studio.Msg.PickAttack"), true);
    const o = { name, weapon: this.#val("[name=soWeapon]") };
    const rune = this.#val("[name=soRune]");
    if (rune && rune !== "none") o.rune = rune;
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "strikeOverrides") ?? {});
    all[name.toLowerCase()] = o;
    await game.settings.set(MODULE_ID, "strikeOverrides", all);
    this.tabName = "overrides";
    await this.render();
    this.#msg(t("Studio.Msg.SavedAttack", { name, look: short(weaponLabel(o.weapon)) }));
  }

  static async #onRemoveStrikeOverride(event, target) {
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "strikeOverrides") ?? {});
    delete all[target.dataset.key];
    await game.settings.set(MODULE_ID, "strikeOverrides", all);
    await this.render();
    this.#msg(t("Studio.Msg.Automatic"));
  }

  static async #onSetWallMaterial() {
    const docs = (canvas.walls?.controlled ?? []).map((w) => w.document);
    if (!docs.length) return this.#msg(t("Studio.Msg.SelectWalls"), true);
    const mat = this.#val("[name=wallMat]");
    await setMaterial(docs, mat);
    await this.render();
    this.#msg(t("Studio.Msg.MaterialSet", { n: docs.length, name: materialName(mat) }));
  }

  static async #onBreakSelected() {
    const docs = (canvas.walls?.controlled ?? []).map((w) => w.document).filter((d) => !d.getFlag(MODULE_ID, "broken"));
    if (!docs.length) return this.#msg(t("Studio.Msg.SelectWalls"), true);
    await breakWalls(docs);
    await this.render();
    this.#msg(t("Studio.Msg.Broken", { n: docs.length }));
  }

  static async #onRestoreWalls() {
    const n = await restoreWalls();
    await this.render();
    this.#msg(n ? t("Studio.Msg.Restored", { n }) : t("Studio.Msg.NoneBroken"));
  }

  static async #onClearMarks() {
    await clearScars();
    this.tabName = "scene";
    await this.render();
    this.#msg(t("Studio.Msg.MarksCleared"));
  }

  static async #onRemoveOverride(event, target) {
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "overrides") ?? {});
    delete all[target.dataset.slug];
    await game.settings.set(MODULE_ID, "overrides", all);
    await this.render();
    this.#msg(t("Studio.Msg.Automatic"));
  }
}
