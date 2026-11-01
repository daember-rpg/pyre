import * as THREE from "../vendor/three.js";
import { MODULE_ID, CAST_OPTION, CONJURE_ID, debug, report, fail } from "../constants.js";
import { Director } from "../director.js";
import { resolveSpell, resolveStrike } from "../resolver.js";
import { seedFrom } from "../core/util.js";

/*
 * Every client hears the same chat messages and document changes, so each plays the
 * effect locally from the same data and seed. No sockets.
 */

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }
const sync = (uuid) => { try { return (foundry.utils?.fromUuidSync ?? globalThis.fromUuidSync)(uuid); } catch { return null; } };
const conjureActive = () => !!game.modules.get(CONJURE_ID)?.active;

const OUTCOME = { criticalSuccess: "crit", success: "hit", failure: "miss", criticalFailure: "miss" };

function speakerToken(message) {
  const t = message.token?.object ?? (message.speaker?.token ? canvas.tokens.get(message.speaker.token) : null);
  if (t) return t;
  const actor = message.actor ?? ChatMessage.getSpeakerActor?.(message.speaker);
  return actor?.getActiveTokens?.()?.[0] ?? null;
}

function tokensFromUuids(uuids) {
  return (uuids ?? []).map((u) => sync(u)?.object ?? null).filter((t) => t && !t.destroyed);
}

/** Players do not learn hit, miss or critical from a roll they cannot read. */
function outcomeFor(message, real) {
  const reveal = message.getFlag?.(MODULE_ID, "reveal")?.outcome;
  if (reveal) return reveal;
  if (game.user.isGM) return real;
  return message.isContentVisible === false || message.blind ? "hidden" : real;
}

/** Is this roll hidden from at least one player? (GM side, for the reveal buttons) */
function hiddenFromPlayers(message) {
  if (message.blind) return true;
  const whisper = message.whisper ?? [];
  if (!whisper.length) return false;
  return game.users.some((u) => !u.isGM && u.active && !whisper.includes(u.id));
}

async function itemFromOrigin(message) {
  // PF2e's own answer first: the strike's weapon or unarmed attack, the cast variant, staff and scroll spells.
  try {
    const item = message.item;
    if (item) return item;
  } catch { /* older PF2e or a message without an item */ }
  const flags = message.flags?.pf2e ?? {};
  if (flags.casting?.embeddedSpell) {
    try { return new CONFIG.Item.documentClass(flags.casting.embeddedSpell, { parent: message.actor ?? null }); } catch { /* fall back */ }
  }
  const uuid = flags.origin?.uuid;
  if (!uuid) return null;
  try { return await fromUuid(uuid); } catch { return null; }
}

/** Who cast an area: the card's speaker, then the item's owner on this scene, then the selected token. */
function casterForArea(flags, item) {
  const message = flags.messageId ? game.messages?.get(flags.messageId) : null;
  const fromMessage = message ? speakerToken(message) : null;
  if (fromMessage) return { token: fromMessage, how: "chat card speaker" };
  const actor = (flags.origin?.actor ? sync(flags.origin.actor) : null) ?? item?.actor ?? null;
  if (actor) {
    const direct = actor.token?.object ?? actor.getActiveTokens?.()?.[0] ?? null;
    if (direct) return { token: direct, how: "spell owner" };
    const byId = canvas.tokens.placeables.find((t) => t.actor?.id === actor.id || t.document.actorId === actor.id);
    if (byId) return { token: byId, how: "spell owner (by id)" };
  }
  const selected = canvas.tokens.controlled[0] ?? null;
  return selected ? { token: selected, how: "selected token" } : { token: null, how: "none found: plays at the area only" };
}

function describeStrike(item) {
  const sys = item?.system ?? {};
  const bits = [`${item?.type ?? "?"}`];
  if (sys.group) bits.push(`group ${sys.group}`);
  if (sys.baseItem) bits.push(`base ${sys.baseItem}`);
  const traits = sys.traits?.value ?? [];
  if (traits.length) bits.push(`traits ${traits.slice(0, 5).join(", ")}`);
  return bits.join(" · ");
}

/* -------------------- chat: attacks and casts -------------------- */

/** Casts that had no targets, waiting for their damage roll (keyed by speaker and spell). */
const untargetedCasts = new Map();
function castKey(message, origin) {
  return `${message.speaker?.token ?? message.speaker?.actor ?? "?"}:${String(origin?.uuid ?? "").split(".").pop()}`;
}

async function onChatMessage(message) {
  if (!canvas?.ready || !setting("enabled", true)) return;
  const pf2e = message.flags?.pf2e ?? {};
  const ctx = pf2e.context ?? null;
  const origin = pf2e.origin ?? null;
  const director = Director.get();
  const seed = seedFrom(message.id);

  // Attack rolls: weapons, NPC strikes and spell attacks
  if (ctx && (ctx.type === "attack-roll" || ctx.type === "spell-attack-roll")) {
    const item = await itemFromOrigin(message);
    const attacker = speakerToken(message);
    const targetUuid = ctx.target?.token ?? null;
    const target = (targetUuid ? sync(targetUuid)?.object : null) ?? tokensFromUuids(message.getFlag(MODULE_ID, "targets"))[0];
    if (!attacker || !target) {
      return report(`Attack: ${item?.name ?? origin?.type ?? "?"}`, [!attacker ? "no attacking token on this scene" : "no target: target a token (T) before rolling"]);
    }
    const outcome = outcomeFor(message, OUTCOME[ctx.outcome] ?? "hit");
    if (item?.type === "spell") {
      if (!setting("spells", true)) return;
      const plan = resolveSpell(item, { tradition: pf2e.casting?.tradition });
      report(`Spell attack: ${item.name}`, plan.steps ?? []);
      if (plan.kind !== "area") return;
      const p = { ...plan, engineRecipe: ["darts", "chain", "point"].includes(plan.engineRecipe) ? plan.engineRecipe : "ray", recipe: "ray" };
      director.playTargeted({ plan: p, caster: attacker, targets: [target], outcome, seed });
    } else {
      if (!item) report("Attack: item not found", [`origin ${origin?.uuid ?? "missing"}; reading the roll options`, ...resolveStrike(null, ctx.options).steps]);
      else report(`Strike: ${item.name}`, [describeStrike(item), ...resolveStrike(item, ctx.options).steps]);
      director.playStrike({ item, attacker, target, outcome, seed, options: ctx.options ?? [] });
    }
    return;
  }

  // Damage roll of a spell that was cast without targets: play it now, at the damage roll's targets
  if (ctx?.type === "damage-roll" && origin?.type === "spell") {
    const key = castKey(message, origin);
    const waiting = untargetedCasts.get(key);
    if (!waiting || Date.now() - waiting.at > 10 * 60 * 1000) return;
    if (waiting.area && playedAreas.has(waiting.messageId)) { untargetedCasts.delete(key); return; }
    const targetUuid = ctx.target?.token ?? null;
    let targets = targetUuid ? [sync(targetUuid)?.object].filter(Boolean) : tokensFromUuids(message.getFlag(MODULE_ID, "targets"));
    if (!targets.length && waiting.targets?.length) targets = waiting.targets;
    if (!targets.length) return report(`Damage: ${waiting.name}`, ["no area placed and no targets: nothing to aim at"]);
    untargetedCasts.delete(key);
    if (waiting.area) {
      if (!setting("areaWithoutPlacing", true)) return;
      const shape = aimArea(waiting.plan, waiting.caster, targets);
      if (!shape) return;
      playedAreas.add(waiting.messageId);
      report(`Damage: ${waiting.name}`, [`no area was placed: aimed at ${targets.length} target(s)`]);
      director.playTemplate({ item: waiting.item, plan: waiting.plan, caster: waiting.caster, shape, seed });
      return;
    }
    report(`Damage: ${waiting.name}`, [`plays now at ${targets.length} target(s)`]);
    director.playTargeted({ plan: waiting.plan, caster: waiting.caster, targets, outcome: "hit", seed });
    return;
  }

  // Spell cast cards
  if (!origin || origin.type !== "spell") return;
  // PF2e marks a real cast with a roll option, but casts from other tools (Triad, macros) can arrive without it.
  // A card from a spellcasting entry, or one with a spell-cast context, counts as a cast.
  const isCast = (origin.rollOptions ?? []).includes(CAST_OPTION) || ctx?.type === "spell-cast" || !!pf2e.casting;
  if (!isCast && !setting("animatePostedCards", false)) return;
  if (!setting("spells", true)) return;
  const item = await itemFromOrigin(message);
  if (!item) return report("Cast: spell not found", [origin.uuid ?? "no uuid"]);
  const traits = item.system?.traits?.value ?? [];
  if (traits.includes("attack")) return report(`Cast: ${item.name}`, ["spell attack: waits for the attack roll"]);
  const plan = resolveSpell(item, { tradition: pf2e.casting?.tradition });
  if (plan.kind === "none") return report(`Cast: ${item.name}`, plan.steps ?? []);
  const caster = speakerToken(message);
  if (!caster) return report(`Cast: ${item.name}`, ["the caster has no token on this scene"]);
  const targets = tokensFromUuids(message.getFlag(MODULE_ID, "targets"));
  if (plan.kind === "glow") {
    report(`Cast: ${item.name}`, [...(plan.steps ?? []), `glow, ${plan.intent}, ${targets.length} target(s)`]);
    director.playGlow({ plan, caster, targets, seed, conjureActive: conjureActive() });
    return;
  }
  if (plan.areaType) return castArea(message, item, plan, caster, targets, seed);
  if (!targets.length) {
    untargetedCasts.set(castKey(message, origin), { plan, caster, name: item.name, at: Date.now() });
    return report(`Cast: ${item.name}`, [...(plan.steps ?? []), "no targets yet: plays when damage is rolled with a target"]);
  }
  report(`Cast: ${item.name}`, [...(plan.steps ?? []), `${plan.recipe} at ${targets.length} target(s)`]);
  director.playTargeted({ plan, caster, targets, outcome: "hit", seed });
}

/* -------------------- areas -------------------- */

/** Messages whose area already played (cast-time aim or a placed Region), so it never plays twice. */
const playedAreas = new Set();
const pendingAreas = new Map();

/**
 * PF2e places areas as Regions only when someone clicks the card's button.
 * Emanations play at once around the caster. Other areas aimed at targets play at once
 * (if the GM allows it); without targets they wait for a placed Region.
 */
function castArea(message, item, plan, caster, targets, seed) {
  const director = Director.get();
  const c = director.info(caster);
  const len = Number(plan.radius) || 15;
  // Emanations are always centred on the caster: nothing to place.
  if (plan.areaType === "emanation") {
    playedAreas.add(message.id);
    report(`Cast: ${item.name}`, [...(plan.steps ?? []), `emanation ${len} ft around the caster`]);
    director.playTemplate({ item, plan, caster, shape: { type: "circle", center: c.ft.clone(), distance: len + c.r }, seed });
    return;
  }
  // Everything else waits for its area to be placed. If it never is, the damage roll aims it at the targets.
  untargetedCasts.set(castKey(message, message.flags?.pf2e?.origin), { area: true, messageId: message.id, plan, caster, item, name: item.name, at: Date.now(), targets });
  report(`Cast: ${item.name}`, [...(plan.steps ?? []), "waiting for its area to be placed (or for damage with targets)"]);
}

/** Aim an area at creatures when nobody placed it. */
function aimArea(plan, caster, targets) {
  const director = Director.get();
  const c = director.info(caster);
  const len = Number(plan.radius) || 15;
  const infos = targets.map((t) => director.info(t)).filter(Boolean);
  if (!c || !infos.length) return null;
  const centre = infos.reduce((acc, t) => acc.add(t.ft), new THREE.Vector2()).multiplyScalar(1 / infos.length);
  if (plan.areaType === "cone" || plan.areaType === "line") {
    const d = centre.clone().sub(c.ft);
    const angleRad = Math.atan2(-d.y, d.x);
    const origin = director.edge(c, centre);
    return plan.areaType === "cone"
      ? { type: "cone", origin, distance: len, angleRad, coneRad: Math.PI / 2 }
      : { type: "ray", origin, distance: len, angleRad, width: 5 };
  }
  if (plan.areaType === "cube" || plan.areaType === "square") return { type: "rect", center: centre, side: len };
  return { type: "circle", center: centre, distance: len };
}

const recentTemplates = new Map();

function shapeFromTemplate(doc) {
  const overlay = Director.get().overlay;
  const origin = overlay.toFeet({ x: doc.x, y: doc.y });
  const t = doc.t;
  const dirDeg = doc.direction ?? 0;
  const dist = doc.distance ?? 0;
  if (t === "cone") return { type: "cone", origin, distance: dist, angleRad: (dirDeg * Math.PI) / 180, coneRad: ((doc.angle ?? 90) * Math.PI) / 180 };
  if (t === "ray") return { type: "ray", origin, distance: dist, angleRad: (dirDeg * Math.PI) / 180, width: doc.width ?? 5 };
  if (t === "rect") {
    const k = canvas.dimensions.size / canvas.dimensions.distance;
    const a = (dirDeg * Math.PI) / 180;
    const w = Math.cos(a) * dist * k, h = Math.sin(a) * dist * k;
    const center = overlay.toFeet({ x: doc.x + w / 2, y: doc.y + h / 2 });
    return { type: "rect", center, side: Math.max(Math.abs(w), Math.abs(h)) / k };
  }
  return { type: "circle", center: origin, distance: dist };
}

/**
 * PF2e (V13+) areas are Regions. Shape data is in canvas pixels; rotation in degrees with y down.
 * circle {x,y,radius} · cone {x,y,radius,angle,rotation} · line {x,y,length,width,rotation}
 * rectangle {x,y,width,height,rotation} · emanation {radius, base:{x,y,width,height}} · ring {x,y,radius}
 */
function shapeFromRegion(doc) {
  const s = doc.shapes?.[0];
  if (!s) return null;
  const overlay = Director.get().overlay;
  const size = canvas.dimensions.size;
  const k = size / canvas.dimensions.distance;
  // Canvas angles (clockwise, y down); the Director flips them into feet space.
  const rot = (deg) => ((deg ?? 0) * Math.PI) / 180;
  switch (s.type) {
    case "circle":
    case "ring":
      return { type: "circle", center: overlay.toFeet({ x: s.x, y: s.y }), distance: (s.radius ?? 0) / k };
    case "ellipse":
      return { type: "circle", center: overlay.toFeet({ x: s.x, y: s.y }), distance: Math.max(s.radiusX ?? 0, s.radiusY ?? 0) / k };
    case "cone":
      return { type: "cone", origin: overlay.toFeet({ x: s.x, y: s.y }), distance: (s.radius ?? 0) / k, angleRad: rot(s.rotation), coneRad: ((s.angle ?? 90) * Math.PI) / 180 };
    case "line":
      return { type: "ray", origin: overlay.toFeet({ x: s.x, y: s.y }), distance: (s.length ?? 0) / k, angleRad: rot(s.rotation), width: Math.max(5, (s.width ?? size) / k) };
    case "rectangle": {
      const a = ((s.rotation ?? 0) * Math.PI) / 180;
      const cx = s.x + (s.width / 2) * Math.cos(a) - (s.height / 2) * Math.sin(a);
      const cy = s.y + (s.width / 2) * Math.sin(a) + (s.height / 2) * Math.cos(a);
      return { type: "rect", center: overlay.toFeet({ x: cx, y: cy }), side: Math.max(s.width, s.height) / k };
    }
    case "emanation": {
      const b = s.base ?? {};
      const w = (b.width ?? 1) * size, h = (b.height ?? 1) * size;
      const bx = b.x ?? s.x, by = b.y ?? s.y;
      return { type: "circle", center: overlay.toFeet({ x: bx + w / 2, y: by + h / 2 }), distance: (s.radius ?? 0) / k + Math.max(w, h) / 2 / k };
    }
  }
  if (s.points?.length >= 6) {
    let x = 0, y = 0, r = 0; const n = s.points.length / 2;
    for (let i = 0; i < s.points.length; i += 2) { x += s.points[i]; y += s.points[i + 1]; }
    x /= n; y /= n;
    for (let i = 0; i < s.points.length; i += 2) r = Math.max(r, Math.hypot(s.points[i] - x, s.points[i + 1] - y));
    return { type: "circle", center: overlay.toFeet({ x, y }), distance: r / k };
  }
  return null;
}

async function onArea(doc, shape) {
  if (!canvas?.ready || !setting("enabled", true) || !setting("spells", true)) return;
  if (doc.parent?.id !== canvas.scene?.id) return;
  const flags = doc.flags?.pf2e ?? {};
  const origin = flags.origin;
  if (!origin?.uuid) return;
  if (!shape) return report(`Area: ${origin.name ?? "?"}`, [`shape "${doc.shapes?.[0]?.type ?? "none"}" not understood`]);
  if (flags.messageId && playedAreas.has(flags.messageId)) return report(`Area: ${origin.name}`, ["already played when cast"]);
  if (flags.messageId) { playedAreas.add(flags.messageId); pendingAreas.delete(flags.messageId); }
  const key = `${origin.uuid}:${Math.round(shape.center?.x ?? shape.origin?.x)}:${Math.round(shape.center?.y ?? shape.origin?.y)}`;
  const now = Date.now();
  if (now - (recentTemplates.get(key) ?? 0) < 2500) return;     // a template and a region for the same cast
  recentTemplates.set(key, now);
  let item = null;
  try { item = doc.item ?? null; } catch { /* no getter */ }
  if (!item) { try { item = await fromUuid(origin.uuid); } catch { /* deleted item */ } }
  if (!item) return report(`Area: ${origin.name ?? "?"}`, ["spell not found"]);
  const tradition = flags.messageId ? game.messages?.get(flags.messageId)?.flags?.pf2e?.casting?.tradition : null;
  const plan = resolveSpell(item, { tradition });
  if (plan.kind === "none") return report(`Area: ${item.name}`, plan.steps ?? []);
  const found = casterForArea(flags, item);
  const caster = found.token;
  report(`Area: ${item.name}`, [...(plan.steps ?? []), `placed ${doc.shapes?.[0]?.type} → ${shape.type}`, `caster: ${caster?.name ?? "—"} (${found.how})`]);
  Director.get().playTemplate({ item, plan, caster, shape, seed: seedFrom(doc.id) });
}

/* -------------------- reveal buttons for the GM -------------------- */

function addRevealButtons(message, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const ctx = message.flags?.pf2e?.context;
  const isAttack = ctx && (ctx.type === "attack-roll" || ctx.type === "spell-attack-roll");
  if (!isAttack || !hiddenFromPlayers(message)) return;
  if (root.querySelector(".pyre-reveal")) return;
  const bar = document.createElement("div");
  bar.className = "pyre-reveal";
  const real = OUTCOME[ctx.outcome] ?? "hit";
  const label = document.createElement("span");
  label.textContent = "Players saw a neutral strike. Replay as:";
  bar.append(label);
  for (const [key, text] of [["miss", "Miss"], ["hit", "Hit"], ["crit", "Critical"]]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (key === real) b.classList.add("real");
    b.title = key === real ? "What actually happened" : "Show this to the players instead";
    b.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      message.setFlag(MODULE_ID, "reveal", { outcome: key, at: Date.now() });
    });
    bar.append(b);
  }
  (root.querySelector(".message-content") ?? root).append(bar);
}

/* -------------------- registration -------------------- */

export function registerTriggers() {
  // Remember who the caster was targeting: only the author's client knows.
  Hooks.on("preCreateChatMessage", (message, data, options, userId) => {
    if (userId !== game.user.id) return;
    const pf2e = message.flags?.pf2e ?? data.flags?.pf2e;
    if (!pf2e?.origin && !pf2e?.context) return;
    const targets = [...(game.user.targets ?? [])].map((t) => t.document.uuid);
    if (targets.length) message.updateSource({ [`flags.${MODULE_ID}.targets`]: targets });
  });

  Hooks.on("createChatMessage", (message) => { onChatMessage(message).catch((err) => fail("chat message", err)); });

  // The GM chose to reveal a hidden roll: everyone replays it with that outcome.
  Hooks.on("updateChatMessage", (message, changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.reveal`)) return;
    onChatMessage(message).catch((err) => fail("reveal", err));
  });

  Hooks.on("renderChatMessageHTML", (message, html) => addRevealButtons(message, html));

  Hooks.on("createMeasuredTemplate", (doc) => { onArea(doc, shapeFromTemplate(doc)).catch((err) => fail("template", err)); });
  Hooks.on("createRegion", (doc) => {
    if (!doc.flags?.pf2e?.origin) return;
    onArea(doc, shapeFromRegion(doc)).catch((err) => fail("region", err));
  });

  // Auras follow conditions and effects on actors
  const itemChanged = (item) => {
    if (!["condition", "effect"].includes(item.type)) return;
    const actor = item.parent;
    if (actor?.documentName === "Actor") Director.get().auras.refreshActor(actor);
  };
  Hooks.on("createItem", itemChanged);
  Hooks.on("updateItem", itemChanged);
  Hooks.on("deleteItem", itemChanged);
  Hooks.on("createToken", (doc) => setTimeout(() => doc.object && Director.get().auras.refresh(doc.object), 100));
  Hooks.on("updateToken", (doc, changes) => {
    if ("disposition" in changes || "hidden" in changes || "actorData" in changes || "delta" in changes) Director.get().auras.refresh(doc.object);
  });

  Hooks.on("canvasReady", () => {
    Director.get().reset();
    setTimeout(() => Director.get().auras.refreshAll(), 250);
  });
  Hooks.on("canvasTearDown", () => Director.get().reset());

  // Conjure hand-off: Conjure places the creature, Pyre animates it.
  Hooks.on("createToken", (doc) => {
    if (!doc.flags?.[CONJURE_ID]?.summoner || !setting("enabled", true)) return;
    Director.get().pendingReveal.add(doc.id);
    Director.get().playArrival(doc).catch((err) => { Director.get().pendingReveal.delete(doc.id); console.warn(`${MODULE_ID} | summon`, err); });
  });
  const hideIfPending = (token) => {
    const d = Director.get(), id = token.document?.id;
    if (d.pendingReveal.has(id) && !d.revealStarted.has(id) && token.mesh) token.mesh.alpha = 0;
  };
  Hooks.on("drawToken", hideIfPending);
  Hooks.on("refreshToken", hideIfPending);
  Hooks.on("deleteToken", (doc) => {
    if (!doc.flags?.[CONJURE_ID]?.summoner || !setting("enabled", true)) return;
    Director.get().playDismissal(doc);
  });
}
