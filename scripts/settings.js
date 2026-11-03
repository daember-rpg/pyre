import { MODULE_ID } from "./constants.js";
import { PyreStudio } from "./ui/studio.js";
import { Director } from "./director.js";

export function registerSettings() {
  const client = (key, data) => game.settings.register(MODULE_ID, key, { scope: "client", config: true, ...data });
  const world = (key, data) => game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });

  game.settings.registerMenu(MODULE_ID, "studio", {
    name: "PYRE.Setting.studio.Name",
    label: "PYRE.Setting.studio.Label",
    hint: "PYRE.Setting.studio.Hint",
    icon: "fa-solid fa-fire",
    type: PyreStudio,
    restricted: true,
  });

  client("enabled", { name: "PYRE.Setting.enabled.Name", hint: "PYRE.Setting.enabled.Hint", type: Boolean, default: true });
  client("quality", {
    name: "PYRE.Setting.quality.Name", hint: "PYRE.Setting.quality.Hint",
    type: String, choices: { low: "PYRE.Setting.quality.Choice.low", medium: "PYRE.Setting.quality.Choice.medium", high: "PYRE.Setting.quality.Choice.high" }, default: "high",
  });
  client("pace", { name: "PYRE.Setting.pace.Name", hint: "PYRE.Setting.pace.Hint", type: Number, range: { min: 0.5, max: 1.5, step: 0.05 }, default: 0.85 });
  client("adaptive", { name: "PYRE.Setting.adaptive.Name", hint: "PYRE.Setting.adaptive.Hint", type: Boolean, default: true });
  client("intensity", { name: "PYRE.Setting.intensity.Name", hint: "PYRE.Setting.intensity.Hint", type: Number, range: { min: 0.3, max: 2, step: 0.05 }, default: 1 });
  client("bloom", { name: "PYRE.Setting.bloom.Name", hint: "PYRE.Setting.bloom.Hint", type: Number, range: { min: 0, max: 2, step: 0.05 }, default: 0.7 });
  client("screenShake", { name: "PYRE.Setting.screenShake.Name", hint: "PYRE.Setting.screenShake.Hint", type: Boolean, default: true });
  client("tokenReactions", { name: "PYRE.Setting.tokenReactions.Name", hint: "PYRE.Setting.tokenReactions.Hint", type: Boolean, default: true });
  client("groundMarks", { name: "PYRE.Setting.groundMarks.Name", hint: "PYRE.Setting.groundMarks.Hint", type: Boolean, default: true });
  client("smokeTime", { name: "PYRE.Setting.smokeTime.Name", hint: "PYRE.Setting.smokeTime.Hint", type: Number, range: { min: 0.2, max: 1.5, step: 0.05 }, default: 1 });
  client("markTime", { name: "PYRE.Setting.markTime.Name", hint: "PYRE.Setting.markTime.Hint", type: Number, range: { min: 2, max: 30, step: 1 }, default: 12 });
  client("underTokens", { name: "PYRE.Setting.underTokens.Name", hint: "PYRE.Setting.underTokens.Hint", type: Boolean, default: true, requiresReload: true });
  client("circleSize", { name: "PYRE.Setting.circleSize.Name", type: Number, range: { min: 0.5, max: 2, step: 0.05 }, default: 1 });
  client("auras", {
    name: "PYRE.Setting.auras.Name",
    hint: "PYRE.Setting.auras.Hint",
    type: String, choices: { everyone: "PYRE.Setting.auras.Choice.everyone", friendly: "PYRE.Setting.auras.Choice.friendly", off: "PYRE.Setting.auras.Choice.off" }, default: "everyone",
    onChange: () => Director.get().auras.refreshAll(),
  });

  world("wallsBlock", { name: "PYRE.Setting.wallsBlock.Name", hint: "PYRE.Setting.wallsBlock.Hint", type: Boolean, default: true });
  world("breakableWalls", { name: "PYRE.Setting.breakableWalls.Name", hint: "PYRE.Setting.breakableWalls.Hint", type: Boolean, default: false });
  // Wall rules live with the walls: per wall in its sheet, per scene and rules in Pyre Studio → Scene
  world("defaultWallMaterial", { config: false, name: "PYRE.Setting.defaultWallMaterial.Name", hint: "PYRE.Setting.defaultWallMaterial.Hint", type: String,
    choices: { stone: "PYRE.Setting.defaultWallMaterial.Choice.stone", wood: "PYRE.Setting.defaultWallMaterial.Choice.wood", metal: "PYRE.Setting.defaultWallMaterial.Choice.metal", glass: "PYRE.Setting.defaultWallMaterial.Choice.glass", none: "PYRE.Setting.defaultWallMaterial.Choice.none" }, default: "stone" });
  world("wallWeakness", { config: false, name: "PYRE.Setting.wallWeakness.Name", hint: "PYRE.Setting.wallWeakness.Hint", type: Boolean, default: true });
  world("persistentMarks", { name: "PYRE.Setting.persistentMarks.Name", hint: "PYRE.Setting.persistentMarks.Hint", type: Boolean, default: false,
    onChange: () => Director.get().scars.refresh() });
  world("spells", { name: "PYRE.Setting.spells.Name", hint: "PYRE.Setting.spells.Hint", type: Boolean, default: true });
  world("strikes", { name: "PYRE.Setting.strikes.Name", hint: "PYRE.Setting.strikes.Hint", type: Boolean, default: true });
  world("animatePostedCards", {
    name: "PYRE.Setting.animatePostedCards.Name",
    hint: "PYRE.Setting.animatePostedCards.Hint",
    type: Boolean, default: false,
  });
  world("areaWithoutPlacing", {
    name: "PYRE.Setting.areaWithoutPlacing.Name",
    hint: "PYRE.Setting.areaWithoutPlacing.Hint",
    type: Boolean, default: true,
  });
  world("overrides", { name: "PYRE.Setting.overrides.Name", type: Object, default: {}, config: false });
  world("strikeOverrides", { name: "PYRE.Setting.strikeOverrides.Name", type: Object, default: {}, config: false });
  client("debug", { name: "PYRE.Setting.debug.Name", hint: "PYRE.Setting.debug.Hint", type: Boolean, default: false });
}
