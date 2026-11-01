import * as THREE from "./vendor/three.js";
import { MODULE_ID, debug } from "./constants.js";
import { Overlay } from "./core/overlay.js";
import { TokenFX, tokenFt, tokenRadiusFt } from "./core/tokens.js";
import { AuraManager } from "./core/auras.js";
import { AreaEffect } from "./effects/area.js";
import { StrikeEffect } from "./effects/strike.js";
import { GlowEffect } from "./effects/glow.js";
import { resolveSpell, resolveStrike } from "./resolver.js";
import { PRESETS } from "./data/presets.js";
import { seedFrom } from "./core/util.js";

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }

/** Which tradition colours a creature's summon circle uses, from its traits. */
const CREATURE_TRADITION = { celestial: "divine", fiend: "divine", monitor: "divine", undead: "occult", aberration: "occult", fey: "primal",
  elemental: "primal", animal: "primal", beast: "primal", plant: "primal", fungus: "primal", dragon: "arcane", construct: "arcane", giant: "primal" };

/**
 * Turns "who did what to whom" into effects on the overlay.
 * Every client runs the same request with the same seed, so everyone sees the same thing.
 */
export class Director {
  static #instance = null;
  static get() { return (Director.#instance ??= new Director()); }

  constructor() {
    this.overlay = Overlay.get();
    this.fx = new TokenFX(this.overlay);
    this.auras = new AuraManager(this.overlay);
    this.pendingReveal = new Set();
    this.revealStarted = new Set();
  }

  get enabled() { return setting("enabled", true) && canvas?.ready; }

  info(token) {
    if (!token) return null;
    return { token, ft: tokenFt(this.overlay, token), r: tokenRadiusFt(token) };
  }

  /** Other creatures on the scene that may react to an area. */
  bystanders(exclude = []) {
    const ids = new Set(exclude.filter(Boolean).map((t) => t.id));
    return canvas.tokens.placeables.filter((t) => !ids.has(t.id) && t.actor && !t.document.hidden).map((t) => this.info(t));
  }

  /** Point where an effect leaves a caster towards a target point. */
  edge(info, toward) {
    const d = toward.clone().sub(info.ft);
    if (d.lengthSq() < 0.0001) return info.ft.clone();
    return info.ft.clone().addScaledVector(d.normalize(), info.r);
  }

  #visibleToMe(...tokens) {
    if (game.user.isGM) return true;
    return tokens.some((t) => t && t.visible !== false && !t.document?.hidden);
  }

  #add(effect) {
    this.overlay.add(effect);
    return effect;
  }

  /* -------------------- spells -------------------- */

  /** Spell with a template (cone, line, burst, emanation, cylinder, square). */
  playTemplate({ item, plan, caster, shape, seed }) {
    if (!this.enabled || !plan || plan.kind === "none") return;
    const c = this.info(caster);
    let req;
    const look = plan.look ?? PRESETS["std-fireball"];
    if (shape.type === "cone" || shape.type === "ray") {
      const dir = new THREE.Vector2(Math.cos(shape.angleRad), -Math.sin(shape.angleRad));
      req = { recipe: "breath", look, origin: shape.origin, dir,
        shape: shape.type === "cone" ? { mode: 0, length: shape.distance, halfAng: shape.coneRad / 2 } : { mode: 1, length: shape.distance, width: shape.width || 5 } };
    } else if (shape.type === "rect") {
      req = { recipe: "field", look, at: shape.center, side: shape.side };
    } else {
      let recipe = plan.engineRecipe ?? "point";
      if (recipe === "breath" || recipe === "ray" || recipe === "darts" || recipe === "chain") recipe = "point";
      if (plan.areaType === "cylinder") recipe = "column";
      if (plan.areaType === "emanation") recipe = "point";
      if (recipe === "fireball" && !c) recipe = "point";
      req = { recipe, look, at: shape.center, radius: shape.distance };
      if (recipe === "fireball") { req.from = this.edge(c, shape.center); req.to = shape.center; }
    }
    req.targets = this.bystanders([caster]);
    req.seed = seed;
    debug("template", plan.slug, req.recipe, plan.element);
    this.#add(new AreaEffect(this.overlay, this.fx, req));
  }

  /** Spell aimed at creatures without a template (attack rays, bolts, pulses, darts, chain). */
  playTargeted({ plan, caster, targets, outcome = "hit", seed }) {
    if (!this.enabled || !plan || plan.kind === "none") return;
    const c = this.info(caster);
    const list = (targets ?? []).map((t) => this.info(t)).filter(Boolean);
    if (!c || !list.length) return;
    if (!this.#visibleToMe(caster, ...targets)) return;
    const look = plan.look;
    const recipe = plan.engineRecipe;
    if (recipe === "chain") {
      const chain = [this.edge(c, list[0].ft), ...list.map((t) => t.ft.clone())];
      // Leap on to the nearest creatures not yet struck, within 30 ft
      const struck = new Set(list.map((t) => t.token.id));
      let cur = list[list.length - 1];
      const chainTargets = [...list];
      const others = this.bystanders([caster]).filter((t) => !struck.has(t.token.id));
      while (others.length && chain.length < 7) {
        others.sort((a, b) => a.ft.distanceTo(cur.ft) - b.ft.distanceTo(cur.ft));
        if (others[0].ft.distanceTo(cur.ft) > 30) break;
        cur = others.shift();
        chain.push(cur.ft.clone()); chainTargets.push(cur);
      }
      this.#add(new AreaEffect(this.overlay, this.fx, { recipe: "chain", look, from: chain[0], to: chain[1], chain, chainTargets, seed }));
      return;
    }
    list.forEach((t, i) => {
      const s = seed + i * 7919;
      if (recipe === "darts") {
        this.#add(new AreaEffect(this.overlay, this.fx, { recipe: "darts", look, from: this.edge(c, t.ft), to: t.ft.clone(), mainTarget: t, darts: look.darts ?? 3, seed: s }));
      } else if (recipe === "point") {
        // Pulse on the creature (Heal, Harm and other targeted bursts)
        this.#add(new AreaEffect(this.overlay, this.fx, { recipe: "point", look, at: t.ft.clone(), radius: Math.max(3, t.r * 1.6), targets: [t], seed: s }));
      } else {
        const out = recipe === "ray" && plan.recipe === "bolt" ? "hidden" : outcome;
        this.#add(new AreaEffect(this.overlay, this.fx, { recipe: "ray", look, from: this.edge(c, t.ft), to: t.ft.clone(), mainTarget: t, outcome: out, seed: s }));
      }
    });
  }

  /** Spell without damage: tradition circle and a blessing / hex / self motion. */
  playGlow({ plan, caster, targets, outcome = "affected", seed, conjureActive = false }) {
    if (!this.enabled || !plan) return;
    const c = this.info(caster);
    if (!c) return;
    if (!this.#visibleToMe(caster, ...(targets ?? []))) return;
    let intent = plan.intent ?? "auto";
    // Summon spells: the circle plays on the caster; the creature's arrival is its own effect (Conjure or token creation).
    if (intent === "summon") intent = "self";
    const list = (targets ?? []).filter((t) => t && t.id !== caster.id).map((t) => this.info(t));
    if (intent === "auto") {
      if (!list.length) intent = "self";
      else intent = list[0].token.document.disposition === caster.document.disposition ? "buff" : "debuff";
    }
    if ((intent === "buff" || intent === "debuff") && !list.length) intent = "self";
    const reqBase = { intent, tradition: plan.tradition, color: plan.custom ?? null, outcome, caster: c, look: { intensity: 1, pace: 1 }, seed };
    if (intent === "buff" || intent === "debuff") list.forEach((t) => this.#add(new GlowEffect(this.overlay, this.fx, { ...reqBase, target: t })));
    else this.#add(new GlowEffect(this.overlay, this.fx, reqBase));
  }

  /* -------------------- strikes -------------------- */

  playStrike({ item, attacker, target, outcome = "hit", seed, flurry = false, look = {}, options = [] }) {
    if (!this.enabled || !setting("strikes", true)) return;
    const a = this.info(attacker), t = this.info(target);
    if (!a || !t || a.token.id === t.token.id) return;
    if (!this.#visibleToMe(attacker, target)) return;
    // Gap between the two tokens' edges, in feet: tells a thrown dagger from a stab
    const gap = Math.max(0, a.ft.distanceTo(t.ft) - a.r - t.r);
    const plan = resolveStrike(item, options, { gap });
    debug("strike", item?.name, plan);
    this.#add(new StrikeEffect(this.overlay, this.fx, { ...plan, flurry, outcome, attacker: a, target: t,
      nearby: this.bystanders([attacker, target]), seed, look }));
  }

  /* -------------------- summons (Conjure bridge) -------------------- */

  /** A summoned creature appears: circle under it, a stream from the summoner, then it rises in. */
  async playArrival(tokenDoc) {
    if (!this.enabled) return;
    const token = await this.#waitForToken(tokenDoc);
    if (!token) { this.pendingReveal.delete(tokenDoc.id); return; }
    if (!game.user.isGM && !token.isVisible) { this.pendingReveal.delete(tokenDoc.id); return; }
    const flags = tokenDoc.flags?.conjure ?? {};
    let summoner = null;
    try {
      const sync = foundry.utils?.fromUuidSync ?? globalThis.fromUuidSync;
      const actor = flags.summoner ? sync(flags.summoner) : null;
      summoner = actor?.getActiveTokens?.()?.[0] ?? null;
    } catch { /* summoner not on this scene */ }
    let tradition = null;
    try {
      const sync = foundry.utils?.fromUuidSync ?? globalThis.fromUuidSync;
      const spell = flags.spell?.uuid ? sync(flags.spell.uuid) : null;
      tradition = spell?.system?.traits?.traditions?.[0] ?? null;
    } catch { /* compendium spell not indexed */ }
    if (!tradition) {
      const traits = tokenDoc.actor?.system?.traits?.value ?? [];
      tradition = traits.map((t) => CREATURE_TRADITION[t]).find(Boolean) ?? "arcane";
    }
    const arrive = this.info(token);
    const effect = new GlowEffect(this.overlay, this.fx, {
      intent: "arrive", tradition, caster: summoner ? this.info(summoner) : null, arrive, outcome: "affected",
      look: { intensity: 1, pace: 1 }, seed: seedFrom(tokenDoc.id),
      onReveal: (at) => this.#revealToken(token, tokenDoc.id, at),
    });
    this.#add(effect);
  }

  /** A summoned creature leaves: it folds into a point of light. */
  playDismissal(tokenDoc) {
    if (!this.enabled || !canvas?.ready) return;
    const d = canvas.dimensions;
    const w = (tokenDoc.width ?? 1) * d.size, h = (tokenDoc.height ?? 1) * d.size;
    const ft = this.overlay.toFeet({ x: tokenDoc.x + w / 2, y: tokenDoc.y + h / 2 });
    if (!game.user.isGM) {
      const visible = canvas.visibility?.testVisibility?.({ x: tokenDoc.x + w / 2, y: tokenDoc.y + h / 2 }, { tolerance: d.size / 4 });
      if (visible === false) return;
    }
    const traits = tokenDoc.actor?.system?.traits?.value ?? [];
    const tradition = traits.map((t) => CREATURE_TRADITION[t]).find(Boolean) ?? "arcane";
    const ghost = { token: null, ft, r: ((tokenDoc.width ?? 1) * d.distance) / 2 * 0.92 };
    this.#add(new GlowEffect(this.overlay, this.fx, { intent: "teleport", tradition, caster: ghost, outcome: "affected", look: { intensity: 0.9, pace: 1.2 }, seed: seedFrom(tokenDoc.id) }));
  }

  async #waitForToken(tokenDoc, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const t = tokenDoc.object;
      if (t?.mesh && !t.destroyed) return t;
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  }

  /** Fade and scale the new token in once the circle has opened. */
  #revealToken(token, id, delay) {
    const start = performance.now() + delay * 1000;
    const mesh = token.mesh;
    if (!mesh) { this.pendingReveal.delete(id); return; }
    const base = { sx: mesh.scale.x, sy: mesh.scale.y };
    const ticker = {
      update: () => {
        if (!mesh || mesh.destroyed) { this.pendingReveal.delete(id); return false; }
        const t = (performance.now() - start) / 450;
        if (t < 0) { mesh.alpha = 0; return true; }
        this.revealStarted.add(id);
        const k = Math.min(1, t);
        const back = 1 + 1.6 * Math.pow(k - 1, 3) + 1.6 * Math.pow(k - 1, 2);
        mesh.alpha = k * k * (token.document.hidden ? 0.5 : 1);
        mesh.scale.set(base.sx * (0.55 + 0.45 * back), base.sy * (0.55 + 0.45 * back));
        if (k >= 1) {
          this.pendingReveal.delete(id);
          this.revealStarted.delete(id);
          mesh.alpha = token.document.hidden ? 0.5 : 1;
          mesh.scale.set(base.sx, base.sy);
          token.renderFlags?.set?.({ refreshState: true, refreshMesh: true });
          return false;
        }
        return true;
      },
      reset: () => this.pendingReveal.delete(id),
    };
    this.overlay.addTicker(ticker);
  }

  /* -------------------- tests from the Studio -------------------- */

  /** Play a standard preset from the controlled token at the targeted tokens (or straight ahead). */
  playPreset(presetId, caster, targets = []) {
    const p = PRESETS[presetId];
    if (!p || !caster) return;
    const c = this.info(caster);
    const list = targets.map((t) => this.info(t)).filter(Boolean);
    const aim = list[0]?.ft ?? c.ft.clone().add(new THREE.Vector2(20, 0));
    const seed = Math.floor(Math.random() * 1e9);
    const look = { ...p };
    const others = this.bystanders([caster]);
    const dir = aim.clone().sub(c.ft).normalize();
    let req;
    switch (p.recipe) {
      case "breath":
        req = { recipe: "breath", look, origin: this.edge(c, aim), dir, targets: others,
          shape: p.shape === "line" ? { mode: 1, length: 60, width: 5 } : { mode: 0, length: 30, halfAng: Math.PI / 4 } };
        break;
      case "fireball": req = { recipe: "fireball", look, from: this.edge(c, aim), to: aim.clone(), at: aim.clone(), radius: 20, targets: others }; break;
      case "point": req = { recipe: "point", look, at: aim.clone(), radius: 10, targets: others }; break;
      case "column": req = { recipe: "column", look, at: aim.clone(), radius: 10, targets: others }; break;
      case "field": req = { recipe: "field", look, at: aim.clone(), side: 15, targets: others }; break;
      default:
        if (!list.length) { ui.notifications.info("Pyre: target a token first (T) to test this effect."); return; }
        this.playTargeted({ plan: { look, engineRecipe: p.recipe, recipe: p.recipe }, caster, targets: list.map((x) => x.token), outcome: "hit", seed });
        return;
    }
    req.seed = seed;
    this.#add(new AreaEffect(this.overlay, this.fx, req));
  }

  playTestStrike(spec, attacker, target) {
    const a = this.info(attacker), t = this.info(target);
    if (!a || !t) { ui.notifications.info("Pyre: select an attacker and target a token (T) first."); return; }
    this.#add(new StrikeEffect(this.overlay, this.fx, { ...spec, attacker: a, target: t, nearby: this.bystanders([attacker, target]), seed: Math.floor(Math.random() * 1e9) }));
  }

  playTestGlow(tradition, intent, caster, targets) {
    const plan = { kind: "glow", intent, tradition };
    this.playGlow({ plan, caster, targets, outcome: "affected", seed: Math.floor(Math.random() * 1e9) });
  }

  reset() {
    this.overlay.reset();
    this.fx.reset();
    this.auras.reset();
  }
}

export { resolveSpell };
