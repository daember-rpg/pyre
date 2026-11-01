import * as THREE from "../vendor/three.js";
import { MODULE_ID } from "../constants.js";
import { QUAD_VS, AURA_FS } from "./shaders-lab.js";
import { BLEND } from "./util.js";
import { AURAS, TRADITIONS } from "../data/glow.js";
import { tokenFt, tokenRadiusFt } from "./tokens.js";

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }
const PLANE = new THREE.PlaneGeometry(1, 1);
const MAX_PER_TOKEN = 3;
const PRIORITY = ["shielded", "burning", "frightened", "slowed", "quickened", "hexed", "blessed", "lit", "bleeding", "sickened", "invisible"];

/** Which auras an actor should show, from its PF2e conditions and effects. */
/** Spell effects that get their own aura instead of the generic blessing or hex. */
const SPELL_AURAS = { "spell-effect-light": "lit", "spell-effect-dancing-lights": "lit" };

export function aurasFor(actor, token) {
  const out = new Map();
  if (!actor) return out;
  const items = actor.items ?? [];
  for (const item of items) {
    const slug = item.slug ?? item.system?.slug ?? "";
    if (item.type === "condition") {
      if (slug === "persistent-damage") {
        const type = item.system?.persistent?.damageType;
        if (type === "fire") out.set("burning", null);
        else if (type === "bleed") out.set("bleeding", null);
      } else if (AURAS[slug]) out.set(slug, null);
    } else if (item.type === "effect") {
      if (/shield|mystic-armor|protective-ward/.test(slug)) { out.set("shielded", null); continue; }
      if (!slug.startsWith("spell-effect-")) continue;
      // Spells with a look of their own
      if (SPELL_AURAS[slug]) { out.set(SPELL_AURAS[slug], null); continue; }
      // Who cast it decides blessing or hex: same side as this token helps, the other side hinders.
      const ctx = item.system?.context?.origin ?? {};
      const tradition = ctx.spellcasting?.tradition ?? null;
      const tint = TRADITIONS[tradition]?.glow ?? TRADITIONS.divine.glow;
      let friendly = true;
      const sync = foundry.utils?.fromUuidSync ?? globalThis.fromUuidSync;
      let originToken = null;
      try { originToken = ctx.token && sync ? sync(ctx.token) : null; } catch { /* not on this scene */ }
      if (originToken && token?.document) friendly = originToken.disposition === token.document.disposition;
      out.set(friendly ? "blessed" : "hexed", tint);
    }
  }
  return out;
}

/**
 * Persistent auras on tokens. One procedural quad per aura; fades in and out.
 * Follows vision: a token you cannot see shows no aura.
 */
export class AuraManager {
  constructor(overlay) {
    this.o = overlay;
    this.tokens = new Map();   // token.id → { token, auras: Map(key → { mesh, life, target, tint }) }
  }

  /** Recompute auras for one token. */
  refresh(token) {
    if (!token || token.destroyed) return;
    const mode = setting("auras", "everyone");
    let want = new Map();
    if (mode !== "off") {
      const ownedOrFriendly = token.isOwner || token.document.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      if (mode === "everyone" || game.user.isGM || ownedOrFriendly) want = aurasFor(token.actor, token);
    }
    // Keep the strongest few
    const keys = [...want.keys()].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b)).slice(0, MAX_PER_TOKEN);
    let entry = this.tokens.get(token.id);
    if (!entry && !keys.length) return;
    if (!entry) { entry = { token, auras: new Map() }; this.tokens.set(token.id, entry); }
    entry.token = token;
    for (const [k, a] of entry.auras) if (!keys.includes(k)) a.target = 0;
    for (const k of keys) {
      let a = entry.auras.get(k);
      if (!a) { a = { mesh: this.#mesh(k), life: 0, target: 1 }; entry.auras.set(k, a); }
      a.target = 1;
      a.tint = want.get(k) ?? null;
    }
    this.o.addTicker(this);
  }

  refreshActor(actor) {
    if (!canvas?.ready || !actor) return;
    for (const t of actor.getActiveTokens?.() ?? []) this.refresh(t);
  }

  refreshAll() {
    if (!canvas?.ready) return;
    for (const t of canvas.tokens.placeables) this.refresh(t);
  }

  #mesh(key) {
    const A = AURAS[key];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: this.o.noise }, uStyle: { value: A.style }, uLife: { value: 0 }, uClock: { value: 0 }, uDisc: { value: 0.4 },
        uSeed: { value: Math.random() }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
      vertexShader: QUAD_VS, fragmentShader: AURA_FS, transparent: true, depthTest: false, depthWrite: false, ...BLEND.premult,
    });
    const mesh = new THREE.Mesh(PLANE, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = A.layer === "under" ? 0.15 : 0.6;
    mesh.visible = false;
    // Auras that sit around the feet go beneath the token; the rest float over it
    (A.layer === "under" ? this.o.underScene() : this.o.scene).add(mesh);
    return mesh;
  }

  update(dt, now) {
    let any = false;
    const intensity = setting("intensity", 1);
    for (const [id, entry] of this.tokens) {
      const token = entry.token;
      const gone = !token || token.destroyed || !token.mesh;
      const visible = !gone && token.visible !== false && token.mesh.visible !== false && !(token.document.hidden && !game.user.isGM);
      for (const [key, a] of entry.auras) {
        if (gone) a.target = 0;
        a.life += (a.target - a.life) * Math.min(1, dt * (a.target ? 4 : 2.5));
        if (a.target === 0 && a.life < 0.01) {
          a.mesh.parent?.remove(a.mesh); a.mesh.material.dispose();
          entry.auras.delete(key);
          continue;
        }
        any = true;
        const A = AURAS[key];
        const u = a.mesh.material.uniforms;
        a.mesh.visible = visible && a.life > 0.005;
        if (!a.mesh.visible) continue;
        const c = tokenFt(this.o, token), r = tokenRadiusFt(token);
        const qs = r * 2 / 0.92 * 2.0;
        u.uDisc.value = r / (qs / 2);
        u.uLife.value = a.life * intensity;
        u.uClock.value = now;
        const tint = A.tint === "trad" ? (a.tint ?? TRADITIONS.divine.glow) : A.tint;
        u.uTint.value.set(tint[0], tint[1], tint[2]);
        a.mesh.position.set(c.x, c.y, 0);
        a.mesh.scale.set(qs, qs, 1);
      }
      if (!entry.auras.size) this.tokens.delete(id);
    }
    return any;
  }

  reset() {
    for (const entry of this.tokens.values()) for (const a of entry.auras.values()) { a.mesh.parent?.remove(a.mesh); a.mesh.material.dispose(); }
    this.tokens.clear();
  }
}
