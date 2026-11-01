import { MODULE_ID } from "./constants.js";
import { PyreStudio } from "./ui/studio.js";
import { Director } from "./director.js";

export function registerSettings() {
  const client = (key, data) => game.settings.register(MODULE_ID, key, { scope: "client", config: true, ...data });
  const world = (key, data) => game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });

  game.settings.registerMenu(MODULE_ID, "studio", {
    name: "Pyre Studio",
    label: "Open Pyre Studio",
    hint: "Test effects on the current scene and change how individual spells look.",
    icon: "fa-solid fa-fire",
    type: PyreStudio,
    restricted: true,
  });

  client("enabled", { name: "Show effects", hint: "Turn every Pyre effect on or off on this computer.", type: Boolean, default: true });
  client("quality", {
    name: "Quality", hint: "Low suits older laptops; High uses more particles and a sharper image.",
    type: String, choices: { low: "Low", medium: "Medium", high: "High" }, default: "high",
  });
  client("intensity", { name: "Brightness", hint: "Scales how bright effects are on this computer.", type: Number, range: { min: 0.3, max: 2, step: 0.05 }, default: 1 });
  client("bloom", { name: "Glow (bloom)", hint: "How much bright effects bleed light around them. 0 turns it off.", type: Number, range: { min: 0, max: 2, step: 0.05 }, default: 0.7 });
  client("screenShake", { name: "Screen shake and impact zoom", hint: "Shake and punch the map on heavy hits.", type: Boolean, default: true });
  client("tokenReactions", { name: "Token reactions", hint: "Struck tokens are pushed back, squash and flash. Purely visual; tokens never move on the map.", type: Boolean, default: true });
  client("groundMarks", { name: "Ground marks", hint: "Scorch, frost, wet stone and cracks left on the floor for a few seconds.", type: Boolean, default: true });
  client("smokeTime", { name: "Smoke and dust duration", hint: "How long smoke and dust hang over the map and tokens. 1 is the full look; lower clears them sooner.", type: Number, range: { min: 0.2, max: 1.5, step: 0.05 }, default: 1 });
  client("markTime", { name: "Ground mark duration (seconds)", hint: "How long scorch, frost, gashes and cracks stay on the floor.", type: Number, range: { min: 2, max: 30, step: 1 }, default: 12 });
  client("underTokens", { name: "Floor effects under tokens", hint: "Scorch, floor light, smoke, dust and casting circles are drawn beneath the tokens (reload to apply).", type: Boolean, default: true, requiresReload: true });
  client("circleSize", { name: "Casting circle size", type: Number, range: { min: 0.5, max: 2, step: 0.05 }, default: 1 });
  client("auras", {
    name: "Condition auras",
    hint: "Lasting looks for conditions and spell effects (quickened, frightened, burning…).",
    type: String, choices: { everyone: "On every creature", friendly: "Only on my and allied tokens", off: "Off" }, default: "everyone",
    onChange: () => Director.get().auras.refreshAll(),
  });

  world("wallsBlock", { name: "Walls stop areas", hint: "Bursts, breaths and other areas stop at walls that block movement, and creatures behind them do not react.", type: Boolean, default: true });
  world("spells", { name: "Animate spells", hint: "Casts, spell attacks and templates.", type: Boolean, default: true });
  world("strikes", { name: "Animate strikes", hint: "Weapon, unarmed and NPC attacks.", type: Boolean, default: true });
  world("animatePostedCards", {
    name: "Animate posted spell cards",
    hint: "Also animate spell cards that were posted to chat without being cast.",
    type: Boolean, default: false,
  });
  world("areaWithoutPlacing", {
    name: "Areas that are never placed",
    hint: "Area spells wait for their area to be placed. If nobody places it and damage is rolled at targeted creatures, aim the area at them. Emanations always play around the caster at once.",
    type: Boolean, default: true,
  });
  world("overrides", { name: "Spell overrides", type: Object, default: {}, config: false });
  world("strikeOverrides", { name: "Attack overrides", type: Object, default: {}, config: false });
  client("debug", { name: "Debug logging", hint: "Show what Pyre decides for each attack and spell in a small box on screen, and write it to the console (F12).", type: Boolean, default: false });
}
