import { MODULE_ID, report } from "./constants.js";
import { Director } from "./director.js";
import { addScars } from "./core/scars.js";

/*
 * Breakable walls (optional, GM only).
 * After an area's damage roll, walls the blast reaches take its damage minus their Hardness (PF2e object rules).
 * The GM confirms which walls break. A broken wall stops blocking (movement, sight, light, sound); its original
 * settings are kept in its flags, so the Pyre Studio can restore it.
 */

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }

/** PF2e "structure" statistics (GM Core, Material Statistics): Hardness, HP. */
export const MATERIALS = {
  wood:  { name: "Madeira", hardness: 10, hp: 40 },
  stone: { name: "Pedra", hardness: 14, hp: 56 },
  metal: { name: "Ferro / aço", hardness: 18, hp: 72 },
  glass: { name: "Vidro", hardness: 2, hp: 8 },
  none:  { name: "Inquebrável", hardness: Infinity, hp: Infinity },
};
/** Damage types that do nothing to objects. */
const NO_EFFECT = new Set(["mental", "spirit", "poison", "vitality", "void", "bleed"]);

/**
 * How each material takes each kind of damage (multiplier on that part of the damage, before Hardness).
 * Wood burns; stone cracks under sound and hammering, shrugs off fire and frost; metal corrodes and grows brittle in the cold;
 * glass shatters. Force hits everything the same.
 */
export const WEAKNESS = {
  wood:  { fire: 2, acid: 1.25, slashing: 1.25, cold: 0.5, piercing: 0.5 },
  stone: { sonic: 2, bludgeoning: 1.5, acid: 1.5, fire: 0.5, cold: 0.5, electricity: 0.5, piercing: 0.5, slashing: 0.5 },
  metal: { acid: 2, cold: 1.5, electricity: 0.5, fire: 0.5, piercing: 0.5, slashing: 0.5 },
  glass: { sonic: 2, bludgeoning: 2, cold: 1.5 },
};
const TYPE_PT = { fire: "fogo", cold: "frio", acid: "ácido", electricity: "eletricidade", sonic: "sônico", force: "força", bludgeoning: "concussão",
  piercing: "perfuração", slashing: "corte", untyped: "dano" };

const flag = (doc, k) => doc?.getFlag?.(MODULE_ID, k) ?? doc?.flags?.[MODULE_ID]?.[k];

/** The scene's own default material (Pyre Studio → Scene); walls without a material of their own use it. */
export function sceneMaterial(scene = canvas?.scene) {
  const m = scene?.getFlag?.(MODULE_ID, "wallMaterial") ?? scene?.flags?.[MODULE_ID]?.wallMaterial;
  return MATERIALS[m] ? m : (MATERIALS[setting("defaultWallMaterial", "stone")] ? setting("defaultWallMaterial", "stone") : "stone");
}
export function wallMaterial(doc) {
  const m = flag(doc, "material");
  return MATERIALS[m] ? m : sceneMaterial(doc?.parent ?? canvas?.scene);
}
/** Hardness, maximum and current HP: the wall's own numbers when it has them, otherwise its material's. */
export function wallStats(doc) {
  const mat = wallMaterial(doc), M = MATERIALS[mat];
  const own = (k) => { const v = Number(flag(doc, k)); return Number.isFinite(v) && flag(doc, k) !== null && flag(doc, k) !== undefined && flag(doc, k) !== "" ? v : null; };
  const hardness = own("hardness") ?? M.hardness;
  const maxHp = own("maxHp") ?? M.hp;
  const hp = Math.min(own("hp") ?? maxHp, maxHp);
  return { mat, M, name: M.name, hardness, maxHp, hp, unbreakable: !Number.isFinite(hardness) || !Number.isFinite(maxHp), custom: own("hardness") !== null || own("maxHp") !== null };
}
export function wallHP(doc) { return wallStats(doc).hp; }
const isBroken = (doc) => !!(doc?.getFlag?.(MODULE_ID, "broken") ?? doc?.flags?.[MODULE_ID]?.broken);
const blocks = (doc) => doc.move !== 0 && !(doc.door > 0 && doc.ds === 1);

/* -------------------- the area, in canvas pixels -------------------- */

function areaInPx(shape) {
  const o = Director.get().overlay, k = o.ppf;
  if (shape.type === "circle") { const c = o.toPx(shape.center); return { kind: "circle", x: c.x, y: c.y, R: shape.distance * k, ox: c.x, oy: c.y }; }
  if (shape.type === "rect") { const c = o.toPx(shape.center); return { kind: "rect", x: c.x, y: c.y, h: shape.side * k / 2, ox: c.x, oy: c.y }; }
  const p = o.toPx(shape.origin);
  const dx = Math.cos(shape.angleRad), dy = Math.sin(shape.angleRad);
  if (shape.type === "cone") return { kind: "cone", ox: p.x, oy: p.y, dx, dy, R: shape.distance * k, half: (shape.coneRad ?? Math.PI / 2) / 2 };
  return { kind: "ray", ox: p.x, oy: p.y, dx, dy, L: shape.distance * k, w: (shape.width ?? 5) * k / 2 };
}
function inside(A, x, y) {
  const rx = x - A.ox, ry = y - A.oy;
  switch (A.kind) {
    case "circle": return Math.hypot(x - A.x, y - A.y) <= A.R;
    case "rect": return Math.abs(x - A.x) <= A.h && Math.abs(y - A.y) <= A.h;
    case "cone": { const d = Math.hypot(rx, ry); if (d > A.R || d < 1) return d < 1; return Math.acos(Math.max(-1, Math.min(1, (rx * A.dx + ry * A.dy) / d))) <= A.half; }
    case "ray": { const al = rx * A.dx + ry * A.dy, lat = Math.abs(-rx * A.dy + ry * A.dx); return al >= 0 && al <= A.L && lat <= A.w; }
  }
  return false;
}
function crosses(ax, ay, bx, by, c) {
  const ex = c[2] - c[0], ey = c[3] - c[1], dx = bx - ax, dy = by - ay, den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((c[0] - ax) * ey - (c[1] - ay) * ex) / den, u = ((c[0] - ax) * dy - (c[1] - ay) * dx) / den;
  return t > 0.001 && t < 0.999 && u >= 0 && u <= 1;
}

/** Walls the blast actually reaches: some part inside the area, with nothing else blocking the way from its origin. */
export function wallsReached(shape) {
  const A = areaInPx(shape);
  const walls = (canvas?.walls?.placeables ?? []).map((w) => w.document ?? w).filter((d) => d.c && blocks(d) && !isBroken(d));
  const out = [];
  for (const d of walls) {
    const c = d.c, len = Math.hypot(c[2] - c[0], c[3] - c[1]);
    const steps = Math.max(2, Math.ceil(len / (canvas.dimensions.size / 4)));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps, x = c[0] + (c[2] - c[0]) * f, y = c[1] + (c[3] - c[1]) * f;
      if (!inside(A, x, y)) continue;
      // Step back a hair toward the origin so the wall itself does not count
      const back = Math.hypot(x - A.ox, y - A.oy) || 1;
      const px = x + (A.ox - x) / back * 2, py = y + (A.oy - y) / back * 2;
      if (walls.some((o) => o !== d && crosses(A.ox, A.oy, px, py, o.c))) continue;
      out.push(d);
      break;
    }
  }
  return out;
}

/* -------------------- after the damage roll -------------------- */

/** Total and damage types of a PF2e damage roll. */
function readDamage(message) {
  let total = 0; const byType = {};
  for (const r of message.rolls ?? []) {
    const t = Number(r.total) || 0;
    total += t;
    const inst = (r.instances ?? []).filter((i) => i.type);
    if (!inst.length) { byType.untyped = (byType.untyped ?? 0) + t; continue; }
    // Split the roll by its damage instances (their own totals when PF2e gives them, otherwise evenly)
    const sum = inst.reduce((a, i) => a + (Number(i.total) || 0), 0);
    for (const i of inst) byType[i.type] = (byType[i.type] ?? 0) + (sum > 0 ? Number(i.total) || 0 : t / inst.length);
  }
  return { total, byType, types: Object.keys(byType) };
}

/** Damage a wall of this material really takes, before Hardness, and the reasons (for the dialog). */
function effective(byType, mat) {
  const W = setting("wallWeakness", true) ? (WEAKNESS[mat] ?? {}) : {};
  let dmg = 0; const notes = [];
  for (const [type, amount] of Object.entries(byType)) {
    if (NO_EFFECT.has(type)) continue;
    const k = W[type] ?? 1;
    dmg += amount * k;
    if (k !== 1) notes.push(`${TYPE_PT[type] ?? type} ${k > 1 ? "×" + k : "÷" + Math.round(1 / k)}`);
  }
  return { dmg: Math.floor(dmg), notes };
}

export async function onDamageRoll(message, area) {
  if (!setting("breakableWalls", false) || !game.user.isGM) return;
  if (game.users?.activeGM && game.users.activeGM !== game.user) return;     // one GM decides
  if (!area?.shape || area.sceneId !== canvas.scene?.id) return;
  const { total, types, byType } = readDamage(message);
  if (!total) return;
  const useful = types.length ? types.filter((t) => !NO_EFFECT.has(t)) : ["untyped"];
  if (!useful.length) return report("Walls", ["this damage does not harm objects"]);
  const reached = wallsReached(area.shape);
  if (!reached.length) return;
  const rows = reached.map((d) => {
    const S = wallStats(d), mat = S.mat;
    const eff = effective(byType, mat);
    const dealt = Math.max(0, eff.dmg - S.hardness);
    const M = { name: S.name, hardness: S.hardness, hp: S.maxHp };
    return { d, mat, M, hp: S.hp, eff, dealt, left: S.hp - dealt, breaks: !S.unbreakable && S.hp - dealt <= 0 };
  }).filter((r) => r.dealt > 0 && Number.isFinite(r.hp));
  report("Walls", [`${total} damage reaches ${reached.length} wall(s)`, ...rows.map((r) => `${r.M.name}: ${r.eff.dmg}${r.eff.notes.length ? " (" + r.eff.notes.join(", ") + ")" : ""} − Hardness ${r.M.hardness} = ${r.dealt} → ${Math.max(0, r.left)}/${r.M.hp}`)]);
  if (!rows.length) return;
  const chosen = await confirmDialog(area.name ?? "A explosão", total, rows);
  if (!chosen) return;
  const toBreak = rows.filter((r, i) => chosen.has(i));
  const damaged = rows.filter((r, i) => !chosen.has(i));
  for (const r of damaged) await r.d.setFlag(MODULE_ID, "hp", Math.max(1, r.left));
  if (toBreak.length) await breakWalls(toBreak.map((r) => r.d), area.originPx ?? null, Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0]);
}

async function confirmDialog(name, total, rows) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const list = rows.map((r, i) => `<label class="pyre-wall-row"><input type="checkbox" name="w${i}" ${r.breaks ? "checked" : ""}>
    <span><b>${esc(r.M.name)}</b> · ${r.eff.notes.length ? `<i>${esc(r.eff.notes.join(", "))}</i> · ` : ""}${r.dealt} de dano (Dureza ${r.M.hardness}) · ${r.breaks ? "<em>rompe</em>" : `fica com ${Math.max(1, r.left)}/${r.M.hp} PV`}</span></label>`).join("");
  const content = `<p>${esc(name)} causou <b>${total}</b> de dano. Marque as paredes que se quebram:</p><div class="pyre-wall-list">${list}</div>
    <p class="hint">Desmarcadas guardam o dano. Paredes quebradas podem ser restauradas no Pyre Studio.</p>`;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return new Set(rows.map((r, i) => (r.breaks ? i : -1)).filter((i) => i >= 0));
  try {
    const result = await DialogV2.wait({
      window: { title: "Pyre: paredes atingidas", icon: "fa-solid fa-dungeon" },
      content,
      buttons: [
        { action: "apply", label: "Aplicar", icon: "fa-solid fa-hammer", default: true,
          callback: (event, button) => { const f = button.form; return rows.map((r, i) => (f.elements[`w${i}`]?.checked ? i : -1)).filter((i) => i >= 0); } },
        { action: "ignore", label: "Ignorar", icon: "fa-solid fa-xmark", callback: () => null },
      ],
      rejectClose: false,
    });
    return Array.isArray(result) ? new Set(result) : null;
  } catch { return null; }
}

/** Break walls: they stop blocking, a collapse plays for everyone, rubble is left on the floor. */
export async function breakWalls(docs, fromPx = null, cause = null) {
  const updates = docs.map((d) => ({
    _id: d.id, move: 0, sight: 0, light: 0, sound: 0,
    [`flags.${MODULE_ID}.broken`]: { move: d.move, sight: d.sight, light: d.light, sound: d.sound, at: Date.now(), from: fromPx, cause },
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  // The rubble lands on the far side from the blast, like the flying chunks
  await addScars(docs.map((d) => ({ k: "rubble", c: [...d.c], mat: wallMaterial(d), side: sideOf(d.c, fromPx), cause, seed: Math.floor(Math.random() * 1e6) })));
  postRestoreCard(docs);
}

function sideOf(c, fromPx) {
  if (!fromPx) return 0;
  const mx = (c[0] + c[2]) / 2, my = (c[1] + c[3]) / 2, ex = c[2] - c[0], ey = c[3] - c[1];
  // Normal in canvas pixels, matching the feet-space normal the effect uses (y flips between the two)
  return Math.sign((my - fromPx[1]) * ex - (mx - fromPx[0]) * ey) || 0;
}

/** A card only the GMs see, with a button that puts those walls back. */
async function postRestoreCard(docs) {
  try {
    const ids = docs.map((d) => d.id);
    const gms = game.users.filter((u) => u.isGM).map((u) => u.id);
    await ChatMessage.create({
      content: `<div class="pyre-card"><p><i class="fa-solid fa-dungeon"></i> <b>${ids.length} parede(s) quebrada(s).</b></p>
        <button type="button" class="pyre-restore-btn" data-walls="${ids.join(",")}"><i class="fa-solid fa-rotate-left"></i> Restaurar</button></div>`,
      whisper: gms, speaker: { alias: "Pyre" }, flags: { [MODULE_ID]: { restoreCard: ids } },
    });
  } catch { /* the Studio can still restore */ }
}

/** Every client plays the collapse when a wall becomes broken. */
export function onWallUpdate(doc, changes) {
  const f = changes?.flags?.[MODULE_ID];
  if (!f || doc.parent?.id !== canvas.scene?.id) return;
  if (f.broken) Director.get().playCollapse(doc.c, wallMaterial(doc), f.broken.from ?? null, f.broken.cause ?? null);
  else if (f.restored || "-=broken" in f) Director.get().playRebuild(doc.c, wallMaterial(doc));
}

export async function restoreWalls(ids = null) {
  const docs = (canvas?.walls?.placeables ?? []).map((w) => w.document).filter((d) => isBroken(d) && (!ids || ids.includes(d.id)));
  if (!docs.length) return 0;
  await canvas.scene.updateEmbeddedDocuments("Wall", docs.map((d) => {
    const b = d.getFlag(MODULE_ID, "broken");
    return { _id: d.id, move: b.move, sight: b.sight, light: b.light, sound: b.sound, [`flags.${MODULE_ID}.-=broken`]: null, [`flags.${MODULE_ID}.-=hp`]: null,
      [`flags.${MODULE_ID}.restored`]: Date.now() };
  }));
  // Take the rubble of those walls off the floor once it has flown back into the wall
  await new Promise((r) => setTimeout(r, 900));
  const key = (c) => c.map((v) => Math.round(v)).join(",");
  const gone = new Set(docs.map((d) => key(d.c)));
  const scars = canvas.scene.getFlag(MODULE_ID, "scars") ?? [];
  const keep = scars.filter((sc) => !(sc.k === "rubble" && gone.has(key(sc.c))));
  if (keep.length !== scars.length) await canvas.scene.setFlag(MODULE_ID, "scars", keep);
  return docs.length;
}

export async function setMaterial(docs, mat) {
  if (!docs.length) return 0;
  await canvas.scene.updateEmbeddedDocuments("Wall", docs.map((d) => ({ _id: d.id, [`flags.${MODULE_ID}.material`]: mat, [`flags.${MODULE_ID}.-=hp`]: null })));
  return docs.length;
}

export function brokenCount() { return (canvas?.walls?.placeables ?? []).filter((w) => isBroken(w.document)).length; }

/**
 * The wall's own Pyre section in its configuration sheet: material, Hardness, HP (maximum and current).
 * Saves the moment a field changes. With "apply to the selected walls" ticked, the change goes to every
 * selected wall at once.
 */
export function injectWallConfig(app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app.document ?? app.object;
  if (!root || !doc || root.querySelector(".pyre-wall-section")) return;
  const S = wallStats(doc);
  const own = (k) => { const v = doc.getFlag(MODULE_ID, k); return v === undefined || v === null ? "" : v; };
  const curMat = doc.getFlag(MODULE_ID, "material") ?? "";
  const sceneMat = MATERIALS[sceneMaterial(doc.parent)];
  const M = MATERIALS[S.mat];
  const others = (canvas.walls?.controlled ?? []).filter((w) => w.document.id !== doc.id).length;
  const box = document.createElement("fieldset");
  box.className = "pyre-wall-section";
  const opts = [`<option value="">Padrão da cena (${sceneMat.name})</option>`]
    .concat(Object.entries(MATERIALS).map(([id, m]) => `<option value="${id}" ${id === curMat ? "selected" : ""}>${m.name}${Number.isFinite(m.hp) ? ` (Dureza ${m.hardness}, ${m.hp} PV)` : ""}</option>`));
  const num = (v) => (Number.isFinite(v) ? v : "∞");
  box.innerHTML = `<legend><i class="fa-solid fa-dungeon"></i> Pyre: parede quebrável</legend>
    <div class="form-group"><label>Material</label><div class="form-fields"><select data-pyre="material">${opts.join("")}</select></div></div>
    <div class="form-group"><label>Dureza</label><div class="form-fields"><input type="number" min="0" step="1" data-pyre="hardness" value="${own("hardness")}" placeholder="${num(M.hardness)}"></div></div>
    <div class="form-group"><label>PV máximos</label><div class="form-fields"><input type="number" min="1" step="1" data-pyre="maxHp" value="${own("maxHp")}" placeholder="${num(M.hp)}"></div></div>
    <div class="form-group"><label>PV atuais</label><div class="form-fields"><input type="number" min="0" step="1" data-pyre="hp" value="${own("hp")}" placeholder="${num(S.maxHp)}">
      <button type="button" data-pyre="heal" title="Voltar aos PV máximos"><i class="fa-solid fa-heart"></i></button></div></div>
    ${others ? `<div class="form-group"><label class="checkbox"><input type="checkbox" data-pyre="batch"> Aplicar também às outras ${others} parede(s) selecionada(s)</label></div>` : ""}
    <p class="hint">Campos vazios usam o material. Inquebrável ignora os números. Salva na hora.</p>`;
  const batch = () => box.querySelector("[data-pyre=batch]")?.checked;
  const targets = () => [doc, ...(batch() ? canvas.walls.controlled.map((w) => w.document).filter((d) => d.id !== doc.id) : [])];
  const save = async (key, raw) => {
    const value = key === "material" ? raw : raw === "" ? null : Math.max(0, Math.round(Number(raw)));
    const updates = targets().map((d) => {
      const u = { _id: d.id };
      if (value === null || value === "") u[`flags.${MODULE_ID}.-=${key}`] = null; else u[`flags.${MODULE_ID}.${key}`] = value;
      // A new material or maximum starts the wall at full health
      if (key === "material" || key === "maxHp") u[`flags.${MODULE_ID}.-=hp`] = null;
      return u;
    });
    await canvas.scene.updateEmbeddedDocuments("Wall", updates);
    const n = updates.length;
    ui.notifications?.info(`Pyre: ${n > 1 ? `${n} paredes atualizadas` : "parede atualizada"}.`);
  };
  for (const el of box.querySelectorAll("[data-pyre]")) {
    const key = el.dataset.pyre;
    if (key === "batch") continue;
    if (key === "heal") { el.addEventListener("click", (ev) => { ev.preventDefault(); box.querySelector("[data-pyre=hp]").value = ""; save("hp", ""); }); continue; }
    // Keep these fields out of Foundry's own form submit; Pyre saves them itself
    el.removeAttribute("name");
    el.addEventListener("change", (ev) => { ev.stopPropagation(); save(key, el.value); });
    el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); el.blur(); } });
  }
  const form = root.querySelector("form") ?? root;
  const footer = form.querySelector("footer, .form-footer, button[type=submit]");
  if (footer?.parentElement === form) form.insertBefore(box, footer); else form.appendChild(box);
  app.setPosition?.({ height: "auto" });
}

/** Walls layer tools for the GM: put every broken wall back, and open the Scene tools. */
export function wallTools(controls, openStudio) {
  if (!game.user?.isGM) return;
  const restore = { name: "pyre-restore-walls", title: "Pyre: restaurar paredes quebradas", icon: "fa-solid fa-trowel-bricks", button: true, order: 98, visible: true,
    onChange: () => restoreWalls().then((n) => ui.notifications.info(n ? `Pyre: ${n} parede(s) restaurada(s).` : "Pyre: nenhuma parede quebrada nesta cena.")) };
  restore.onClick = restore.onChange;
  if (Array.isArray(controls)) controls.find((c) => c.name === "walls")?.tools?.push(restore);
  else { const w = controls.walls; if (w?.tools) w.tools["pyre-restore-walls"] = restore; }
}
