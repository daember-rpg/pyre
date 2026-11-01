import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { registerTriggers } from "./triggers/pf2e.js";
import { Director } from "./director.js";
import { wallTools } from "./walls.js";
import { PyreStudio } from "./ui/studio.js";
import { resolveSpell, resolveStrike } from "./resolver.js";

Hooks.once("init", () => {
  registerSettings();
  registerTriggers();
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    director: () => Director.get(),
    studio: () => PyreStudio.open(),
    resolveSpell,
    resolveStrike,
    /** Play a standard preset from a token at others: api.preset("std-fireball", caster, [target]) */
    preset: (id, caster, targets = []) => Director.get().playPreset(id, caster, targets),
  };
  if (canvas?.ready) setTimeout(() => Director.get().auras.refreshAll(), 300);
  const version = mod.version ?? mod.data?.version ?? "?";
  console.log(`${MODULE_ID} | Ready, version ${version}`);
  // Lets the GM confirm which build is loaded (an old copy of the folder is the usual reason nothing changes)
  if (game.user?.isGM) ui.notifications?.info(`Pyre ${version} is active.`);
});

/* Studio button in the token controls (GM only). Handles the V13+ object form and the older array form. */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;
  try { wallTools(controls); } catch (err) { console.warn("pyre | walls tools", err); }
  const tool = {
    name: "pyre-studio",
    title: "Pyre Studio",
    icon: "fa-solid fa-fire",
    button: true,
    order: 99,
    visible: true,
    onChange: () => PyreStudio.open(),
    onClick: () => PyreStudio.open(),
  };
  if (Array.isArray(controls)) {
    const tokens = controls.find((c) => c.name === "token");
    tokens?.tools?.push(tool);
  } else {
    const tokens = controls.tokens ?? controls.token;
    if (tokens?.tools) tokens.tools["pyre-studio"] = tool;
  }
});
