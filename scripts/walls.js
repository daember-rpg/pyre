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

export function wallMaterial(doc) {
  const m = doc?.getFlag?.(MODULE_ID, "material") ?? doc?.flags?.[MODULE_ID]?.material;
  return MATERIALS[m] ? m : setting("defaultWallMaterial", "stone");
}
export function wallHP(doc) {
  const M = MATERIALS[wallMaterial(doc)];
  const hp = doc?.getFlag?.(MODULE_ID, "hp") ?? doc?.flags?.[MODULE_ID]?.hp;
  return Number.isFinite(hp) ? hp : M.hp;
}
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
  let total = 0; const types = new Set();
  for (const r of message.rolls ?? []) {
    total += Number(r.total) || 0;
    for (const inst of r.instances ?? []) if (inst.type) types.add(inst.type);
  }
  return { total, types: [...types] };
}

export async function onDamageRoll(message, area) {
  if (!setting("breakableWalls", false) || !game.user.isGM) return;
  if (game.users?.activeGM && game.users.activeGM !== game.user) return;     // one GM decides
  if (!area?.shape || area.sceneId !== canvas.scene?.id) return;
  const { total, types } = readDamage(message);
  if (!total) return;
  const useful = types.length ? types.filter((t) => !NO_EFFECT.has(t)) : ["untyped"];
  if (!useful.length) return report("Walls", ["this damage does not harm objects"]);
  const reached = wallsReached(area.shape);
  if (!reached.length) return;
  const rows = reached.map((d) => {
    const mat = wallMaterial(d), M = MATERIALS[mat], hp = wallHP(d);
    const dealt = Math.max(0, total - M.hardness);
    return { d, mat, M, hp, dealt, left: hp - dealt, breaks: Number.isFinite(hp) && hp - dealt <= 0 };
  }).filter((r) => r.dealt > 0 && Number.isFinite(r.hp));
  report("Walls", [`${total} damage reaches ${reached.length} wall(s)`, ...rows.map((r) => `${r.M.name}: ${r.dealt} after Hardness ${r.M.hardness} → ${Math.max(0, r.left)}/${r.M.hp}`)]);
  if (!rows.length) return;
  const chosen = await confirmDialog(area.name ?? "A explosão", total, rows);
  if (!chosen) return;
  const toBreak = rows.filter((r, i) => chosen.has(i));
  const damaged = rows.filter((r, i) => !chosen.has(i));
  for (const r of damaged) await r.d.setFlag(MODULE_ID, "hp", Math.max(1, r.left));
  if (toBreak.length) await breakWalls(toBreak.map((r) => r.d), area.originPx ?? null);
}

async function confirmDialog(name, total, rows) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const list = rows.map((r, i) => `<label class="pyre-wall-row"><input type="checkbox" name="w${i}" ${r.breaks ? "checked" : ""}>
    <span><b>${esc(r.M.name)}</b> · ${r.dealt} de dano (Dureza ${r.M.hardness}) · ${r.breaks ? "<em>rompe</em>" : `fica com ${Math.max(1, r.left)}/${r.M.hp} PV`}</span></label>`).join("");
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
export async function breakWalls(docs, fromPx = null) {
  const updates = docs.map((d) => ({
    _id: d.id, move: 0, sight: 0, light: 0, sound: 0,
    [`flags.${MODULE_ID}.broken`]: { move: d.move, sight: d.sight, light: d.light, sound: d.sound, at: Date.now(), from: fromPx },
  }));
  await canvas.scene.updateEmbeddedDocuments("Wall", updates);
  // The rubble lands on the far side from the blast, like the flying chunks
  await addScars(docs.map((d) => ({ k: "rubble", c: [...d.c], mat: wallMaterial(d), side: sideOf(d.c, fromPx), seed: Math.floor(Math.random() * 1e6) })));
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
  if (f.broken) Director.get().playCollapse(doc.c, wallMaterial(doc), f.broken.from ?? null);
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

/** A "Material (Pyre)" field in the wall's own configuration sheet. Saves the moment it changes. */
export function injectWallConfig(app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const doc = app.document ?? app.object;
  if (!root || !doc || root.querySelector(".pyre-wall-material")) return;
  const cur = doc.getFlag(MODULE_ID, "material") ?? "";
  const def = MATERIALS[setting("defaultWallMaterial", "stone")]?.name ?? "";
  const group = document.createElement("div");
  group.className = "form-group pyre-wall-material";
  const opts = [`<option value="">Padrão da cena (${def})</option>`]
    .concat(Object.entries(MATERIALS).map(([id, m]) => `<option value="${id}" ${id === cur ? "selected" : ""}>${m.name}${Number.isFinite(m.hp) ? ` — Dureza ${m.hardness}, ${m.hp} PV` : ""}</option>`));
  group.innerHTML = `<label>Material (Pyre)</label><div class="form-fields"><select data-pyre="material">${opts.join("")}</select></div>
    <p class="hint">Usado pelas paredes que quebram. Salva na hora.</p>`;
  const sel = group.querySelector("select");
  sel.addEventListener("change", async (ev) => {
    ev.stopPropagation();
    if (sel.value) await doc.setFlag(MODULE_ID, "material", sel.value);
    else await doc.unsetFlag(MODULE_ID, "material");
    await doc.unsetFlag?.(MODULE_ID, "hp");
  });
  const anchor = root.querySelector("form .form-group, .form-group");
  if (anchor?.parentElement) anchor.parentElement.insertBefore(group, anchor);
  else (root.querySelector("form") ?? root).prepend(group);
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
