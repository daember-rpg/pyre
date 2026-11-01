import { MODULE_ID } from "../constants.js";
import { mulberry32 } from "./util.js";

/*
 * Lasting marks on the map: scorch, frost, acid burns and rubble from broken walls.
 * Stored in the scene's flags (the GM writes them), drawn once into a picture the size of the scene and shown
 * beneath the tokens inside Foundry's canvas. Redrawn only when the marks change.
 */

function setting(key, fallback) { try { return game.settings.get(MODULE_ID, key); } catch { return fallback; } }
const MAX_SCARS = 220;

const LOOK = {
  fire:        { core: [16, 11, 8], edge: [70, 34, 12], a: 0.62 },
  electricity: { core: [18, 18, 26], edge: [60, 70, 120], a: 0.7, cracks: true },
  acid:        { core: [22, 34, 6], edge: [70, 110, 20], a: 0.72, pits: true },
  cold:        { core: [210, 232, 245], edge: [150, 200, 235], a: 0.42, light: true },
  sonic:       { core: [30, 26, 22], edge: [60, 54, 48], a: 0.45, cracks: true },
  force:       { core: [24, 20, 30], edge: [70, 60, 110], a: 0.5, cracks: true },
  kinetic:     { core: [34, 28, 22], edge: [70, 60, 50], a: 0.6, cracks: true },
};
export const SCAR_ELEMENTS = new Set(Object.keys(LOOK));

/** GM only: add marks to the current scene. */
export async function addScars(list) {
  if (!game.user.isGM || !canvas?.scene || !list?.length) return;
  const cur = canvas.scene.getFlag(MODULE_ID, "scars") ?? [];
  const next = cur.concat(list).slice(-MAX_SCARS);
  await canvas.scene.setFlag(MODULE_ID, "scars", next);
}
export async function clearScars() {
  if (!game.user.isGM || !canvas?.scene) return;
  await canvas.scene.unsetFlag(MODULE_ID, "scars");
}

export class ScarLayer {
  constructor() { this.canvas = document.createElement("canvas"); this.canvas.width = 4; this.canvas.height = 4; }

  refresh() {
    try {
      const scars = canvas?.scene?.getFlag?.(MODULE_ID, "scars") ?? canvas?.scene?.flags?.[MODULE_ID]?.scars ?? [];
      if (!scars.length || !canvas?.primary || !globalThis.PIXI?.Texture) { if (this.holder) this.holder.visible = false; return; }
      const W = canvas.dimensions.width, H = canvas.dimensions.height;
      const s = Math.min(0.5, 4096 / Math.max(W, H));
      const c = this.canvas;
      c.width = Math.max(1, Math.round(W * s)); c.height = Math.max(1, Math.round(H * s));
      const g = c.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.setTransform(s, 0, 0, s, 0, 0);
      for (const sc of scars) {
        g.save();
        try {
          if (sc.clip?.length >= 6) { g.beginPath(); g.moveTo(sc.clip[0], sc.clip[1]); for (let i = 2; i < sc.clip.length; i += 2) g.lineTo(sc.clip[i], sc.clip[i + 1]); g.closePath(); g.clip(); }
          if (sc.k === "rubble") this.#rubble(g, sc); else this.#burn(g, sc);
        } catch { /* skip a bad mark */ }
        g.restore();
      }
      this.#attach(W, H);
    } catch (err) { console.warn(`${MODULE_ID} | lasting marks`, err); }
  }

  #attach(W, H) {
    const bt = this.tex?.baseTexture ?? this.tex?.source;
    if (!this.tex || this.tex.destroyed || !bt || bt.destroyed) {
      this.tex = PIXI.BaseTexture ? new PIXI.Texture(new PIXI.BaseTexture(this.canvas)) : PIXI.Texture.from(this.canvas);
    } else bt.update?.();
    if (!this.holder || this.holder.destroyed || this.holder.parent !== canvas.primary) {
      const holder = new PIXI.Container();
      holder.elevation = 0; holder.sort = 1e5 - 1; holder.sortLayer = 590; holder.zIndex = 1e5 - 1;
      holder.eventMode = "none"; holder.interactiveChildren = false;
      const sp = new PIXI.Sprite(this.tex);
      holder.addChild(sp);
      canvas.primary.addChild(holder);
      canvas.primary.sortDirty = true;
      canvas.primary.sortChildren?.();
      this.holder = holder; this.sprite = sp;
    }
    if (this.sprite.texture !== this.tex) this.sprite.texture = this.tex;
    this.sprite.position.set(0, 0);
    this.sprite.width = W; this.sprite.height = H;
    this.holder.visible = setting("enabled", true);
  }

  /** Scorch / frost / acid: a ragged blotch built from many soft, darker spots, with a coloured rim. */
  #burn(g, sc) {
    const L = LOOK[sc.el] ?? LOOK.fire, rnd = mulberry32(sc.seed ?? 1), R = sc.r;
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 46; i++) {
      const ang = rnd() * Math.PI * 2, d = Math.pow(rnd(), 0.7) * R * 0.85, r = R * (0.18 + rnd() * 0.32);
      const x = sc.x + Math.cos(ang) * d, y = sc.y + Math.sin(ang) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(L.core, L.a * 0.32)); gr.addColorStop(1, rgba(L.core, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const rim = g.createRadialGradient(sc.x, sc.y, R * 0.55, sc.x, sc.y, R * 1.05);
    rim.addColorStop(0, rgba(L.edge, 0)); rim.addColorStop(0.7, rgba(L.edge, L.a * 0.35)); rim.addColorStop(1, rgba(L.edge, 0));
    g.fillStyle = rim; g.beginPath(); g.arc(sc.x, sc.y, R * 1.05, 0, Math.PI * 2); g.fill();
    if (L.cracks) {
      g.strokeStyle = rgba(L.core, Math.min(0.9, L.a + 0.15)); g.lineCap = "round";
      for (let i = 0; i < 9; i++) {
        let x = sc.x, y = sc.y, ang = rnd() * Math.PI * 2;
        g.lineWidth = R * 0.03; g.beginPath(); g.moveTo(x, y);
        const n = 6 + Math.floor(rnd() * 5);
        for (let j = 0; j < n; j++) { ang += (rnd() - 0.5) * 0.9; const st = R * 0.11; x += Math.cos(ang) * st; y += Math.sin(ang) * st; g.lineTo(x, y); }
        g.stroke();
      }
    }
    if (L.pits) {
      for (let i = 0; i < 30; i++) {
        const ang = rnd() * Math.PI * 2, d = rnd() * R * 0.9, r = R * (0.02 + rnd() * 0.05);
        g.fillStyle = rgba(L.edge, 0.55); g.beginPath(); g.arc(sc.x + Math.cos(ang) * d, sc.y + Math.sin(ang) * d, r, 0, Math.PI * 2); g.fill();
      }
    }
  }

  /** Rubble along a broken wall: a dust band and a scatter of shaded chunks. */
  #rubble(g, sc) {
    const [x1, y1, x2, y2] = sc.c, rnd = mulberry32(sc.seed ?? 1);
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux;
    const size = canvas.dimensions.size;
    const pal = sc.mat === "wood" ? [[96, 66, 38], [122, 86, 50], [70, 48, 28]] : sc.mat === "metal" ? [[90, 94, 100], [120, 124, 130], [60, 62, 68]] : [[110, 104, 96], [138, 130, 120], [80, 75, 70]];
    // Dust band
    g.lineCap = "round";
    // Dust settled around the rubble: soft, uneven patches, not a band
    const sh = (sc.side || 0) * size * 0.3;
    for (let i = 0, m = Math.round(L / size * 7) + 3; i < m; i++) {
      const t = rnd(), off = sh + (rnd() - 0.5) * size * 0.9, x = x1 + ux * L * t + nx * off, y = y1 + uy * L * t + ny * off, r = size * (0.25 + rnd() * 0.45);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(125,115,100,0.22)"); gr.addColorStop(1, "rgba(125,115,100,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const n = Math.round(L / size * 26);
    for (let i = 0; i < n; i++) {
      const t = rnd(), mag = size * (0.1 + 0.75 * Math.pow(rnd(), 1.5));
      const sgn = sc.side ? (rnd() < 0.82 ? sc.side : -sc.side) : (rnd() < 0.5 ? -1 : 1);
      const off = sgn * mag * (sc.side ? 1.15 : 0.7);
      const x = x1 + ux * L * t + nx * off, y = y1 + uy * L * t + ny * off;
      const r = size * (0.04 + Math.pow(rnd(), 2.2) * 0.13);
      const c = pal[Math.floor(rnd() * pal.length)];
      const sides = sc.mat === "wood" ? 4 : 5 + Math.floor(rnd() * 3), rot = rnd() * Math.PI;
      const stretch = sc.mat === "wood" ? 2.6 : 1;
      const jag = Array.from({ length: sides }, () => 0.75 + 0.35 * rnd());
      const poly = (dx, dy, k) => { g.beginPath(); for (let j = 0; j < sides; j++) { const a = j / sides * Math.PI * 2, rr = r * k * jag[j];
        const px = Math.cos(a) * rr * stretch, py = Math.sin(a) * rr; g.lineTo(x + dx + px * Math.cos(rot) - py * Math.sin(rot), y + dy + px * Math.sin(rot) + py * Math.cos(rot)); } g.closePath(); };
      g.fillStyle = "rgba(0,0,0,0.35)"; poly(r * 0.25, r * 0.35, 1.05); g.fill();
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; poly(0, 0, 1); g.fill();
      g.fillStyle = "rgba(255,255,255,0.12)"; poly(-r * 0.15, -r * 0.2, 0.5); g.fill();
    }
  }
}
