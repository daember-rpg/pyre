import * as THREE from "../vendor/three.js";
import { MODULE_ID } from "../constants.js";
import { POST_VS, BRIGHT_FS, BLUR_FS, FINAL_FS } from "./shaders-pyre.js";
import { noiseTexture, clamp } from "./util.js";

const QUALITY_DPR = { low: 1, medium: 1.5, high: 2 };

function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key); } catch { return fallback; }
}

/**
 * A transparent three.js canvas laid over Foundry's board.
 * World units are feet; +y points up (Foundry's y is flipped). The camera follows the board's pan and zoom.
 * The render loop sleeps when nothing is playing.
 */
export class Overlay {
  static #instance = null;
  static get() { return (Overlay.#instance ??= new Overlay()); }

  constructor() {
    this.dom = document.createElement("canvas");
    this.dom.id = "pyre-overlay";
    Object.assign(this.dom.style, { position: "fixed", left: "0", top: "0", pointerEvents: "none", zIndex: "1" });
    this.renderer = new THREE.WebGLRenderer({ canvas: this.dom, alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    // Floor layer: drawn by a second renderer into Foundry's own canvas, beneath the tokens (see #ensureGround)
    this.groundScene = new THREE.Scene();
    this.stencilRef = 0;
    this.camera = new THREE.OrthographicCamera(-50, 50, 30, -30, -100, 100);
    this.camera.position.set(0, 0, 10);
    this.noise = noiseTexture();
    this.effects = new Set();
    this.tickers = new Set();      // per-frame helpers (token reactions, auras)
    this.running = false;
    this.last = 0;
    this.kick = { shake: 0, zoom: 0, zoomV: 0, at: { x: 0, y: 0 } };
    this.size = { w: 0, h: 0, dpr: 0 };
    this.#buildPost();
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  get ppf() { return canvas.dimensions.size / canvas.dimensions.distance; }
  /** Foundry pixels → overlay feet */
  toFeet(p) { const k = this.ppf; return new THREE.Vector2(p.x / k, -p.y / k); }
  /** Overlay feet → Foundry pixels */
  toPx(v) { const k = this.ppf; return { x: v.x * k, y: -v.y * k }; }

  attach() {
    const board = canvas?.app?.view ?? document.getElementById("board");
    if (!board) return;
    if (this.dom.parentElement !== board.parentElement || this.dom.previousElementSibling !== board) board.after(this.dom);
    const z = getComputedStyle(board).zIndex;
    this.dom.style.zIndex = z && z !== "auto" ? z : "0";
  }

  add(effect) {
    this.effects.add(effect);
    this.wake();
    return effect;
  }

  addTicker(t) { this.tickers.add(t); this.wake(); }

  wake() {
    if (this.running || !canvas?.ready) return;
    this.attach();
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((n) => this.#frame(n));
  }

  /** Camera shake and a zoom punch, applied to the board and the overlay together via CSS. */
  punch({ shake = 0, zoom = 0, at = null } = {}) {
    if (this.reduceMotion || !setting("screenShake", true)) return;
    this.kick.shake = Math.max(this.kick.shake, shake);
    if (zoom) { this.kick.zoom = Math.max(this.kick.zoom, zoom); this.kick.zoomV = 0; }
    if (at) this.kick.at = at;
    this.wake();
  }

  #buildPost() {
    const mk = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false });
    // The scene target keeps a stencil buffer: areas are clipped by walls through it
    const mkS = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true });
    this.rt = { scene: mkS(4, 4), halfA: mk(2, 2), halfB: mk(2, 2), qA: mk(1, 1), qB: mk(1, 1) };
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.Camera();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.postQuad = quad;
    const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: POST_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mBright = mat(BRIGHT_FS, { tSrc: { value: null }, uThreshold: { value: 0.75 } });
    this.mBlur = mat(BLUR_FS, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.mFinal = mat(FINAL_FS, { tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, uBloom: { value: 0.7 }, uExposure: { value: 1.05 } });
  }

  /** Next stencil value for a wall mask (1-255). */
  nextStencil() { this.stencilRef = (this.stencilRef % 255) + 1; return this.stencilRef; }

  /**
   * The scene that floor effects go in: beneath the tokens when Foundry's canvas accepts our layer,
   * otherwise the normal overlay scene (everything above, as before).
   */
  underScene() { return this.#ensureGround() ? this.groundScene : this.scene; }

  #ensureGround() {
    if (this.groundTried) return this.groundOk;
    this.groundTried = true;
    this.groundOk = false;
    try {
      if (!setting("underTokens", true) || !canvas?.primary || !globalThis.PIXI?.Texture) return false;
      this.gCanvas = document.createElement("canvas");
      this.gCanvas.width = 4; this.gCanvas.height = 4;
      this.gRenderer = new THREE.WebGLRenderer({ canvas: this.gCanvas, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
      this.gRenderer.setClearColor(0x000000, 0);
      this.gRenderer.autoClear = false;
      this.gRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true });
      this.gFinal = new THREE.ShaderMaterial({ vertexShader: POST_VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
        uniforms: { tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, uBloom: { value: 0 }, uExposure: { value: 1.05 } } });
      this.#attachGround();
      this.groundOk = !!this.gHolder;
    } catch (err) {
      console.warn(`${MODULE_ID} | floor layer unavailable, drawing everything above tokens`, err);
      this.groundOk = false;
    }
    return this.groundOk;
  }

  #freshGroundTexture() {
    const old = this.gTex;
    this.gTex = PIXI.BaseTexture ? new PIXI.Texture(new PIXI.BaseTexture(this.gCanvas)) : PIXI.Texture.from(this.gCanvas);
    if (this.gSprite && !this.gSprite.destroyed) this.gSprite.texture = this.gTex;
    // Free the old GPU copy, never our canvas
    try { if (old && old !== this.gTex) { const ob = old.baseTexture; old.destroy(false); if (ob && ob !== this.gTex.baseTexture) { ob.resource = null; ob.destroy(); } } } catch { /* already gone */ }
  }

  /** Put (or put back, after a scene change) our sprite in Foundry's primary group, between tiles and tokens. */
  #attachGround() {
    if (this.gHolder && !this.gHolder.destroyed && this.gHolder.parent === canvas.primary) return;
    // A scene change tears down Foundry's canvas and may take our texture with it: make a fresh one
    const bt = this.gTex?.baseTexture ?? this.gTex?.source;
    if (!this.gTex || this.gTex.destroyed || !bt || bt.destroyed) {
      this.gTex = PIXI.BaseTexture ? new PIXI.Texture(new PIXI.BaseTexture(this.gCanvas)) : PIXI.Texture.from(this.gCanvas);
    }
    const holder = new PIXI.Container();
    holder.elevation = 0; holder.sort = 1e5; holder.sortLayer = 600; holder.zIndex = 1e5;
    holder.eventMode = "none"; holder.interactiveChildren = false;
    const sprite = new PIXI.Sprite(this.gTex);
    holder.addChild(sprite);
    canvas.primary.addChild(holder);
    canvas.primary.sortDirty = true;
    canvas.primary.sortChildren?.();
    this.gHolder = holder; this.gSprite = sprite;
  }

  #renderGround(rect, s, tx, ty) {
    if (!this.groundOk) return;
    try {
      this.#attachGround();
      const busy = this.groundScene.children.some((c) => c.visible);
      this.gHolder.visible = busy;
      if (!busy) { if (this.gDirty) { this.gRenderer.setRenderTarget(null); this.gRenderer.clear(); this.gDirty = false; } return; }
      this.gDirty = true;
      const r = this.gRenderer;
      // Floor effects are soft: a fixed, modest resolution keeps the copy into Foundry cheap. It does not follow
      // adaptive resolution, so the floor picture only changes size when the window does.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const W = Math.max(1, Math.round(rect.width * dpr)), H = Math.max(1, Math.round(rect.height * dpr));
      if (this.gCanvas.width !== W || this.gCanvas.height !== H) {
        r.setPixelRatio(1); r.setSize(W, H, false); this.gRT.setSize(W, H);
        // Foundry's texture keeps the picture's old size when the canvas is resized: the floor effects then
        // land off their target (scaled toward the corner of the screen). Give the sprite a fresh texture.
        this.#freshGroundTexture();
      }
      r.setRenderTarget(this.gRT); r.clear();
      r.render(this.groundScene, this.camera);
      this.gFinal.uniforms.tScene.value = this.gRT.texture;
      this.gFinal.uniforms.tBloom1.value = this.gRT.texture; this.gFinal.uniforms.tBloom2.value = this.gRT.texture;
      this.postQuad.material = this.gFinal;
      r.setRenderTarget(null); r.clear();
      r.render(this.postScene, this.postCam);
      // Place the sprite over the visible part of the board, in canvas coordinates
      const sp = this.gSprite;
      sp.position.set(-tx / s, -ty / s);
      sp.width = rect.width / s; sp.height = rect.height / s;
      // Follow the level the action happens on (Scene Levels)
      let elev = 0;
      for (const e of this.effects) if (Number.isFinite(e.elevation)) elev = Math.max(elev, e.elevation);
      if (this.gHolder.elevation !== elev) { this.gHolder.elevation = elev; canvas.primary.sortDirty = true; }
      const bt = this.gTex.baseTexture ?? this.gTex.source;
      bt?.update?.();
    } catch (err) {
      console.warn(`${MODULE_ID} | floor layer failed, drawing everything above tokens from now on`, err);
      this.groundOk = false;
      try { this.gHolder?.destroy({ children: true }); } catch { /* gone */ }
      // Move anything already on the floor layer back into the overlay
      for (const c of [...this.groundScene.children]) this.scene.add(c);
    }
  }

  #pass(material, target) {
    this.postQuad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCam);
  }

  #resize(w, h) {
    const q = setting("quality", "high");
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, QUALITY_DPR[q] ?? 1.5) * (this.adapt ?? 1));
    if (w === this.size.w && h === this.size.h && dpr === this.size.dpr) return;
    this.size = { w, h, dpr };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.dom.style.width = `${w}px`;
    this.dom.style.height = `${h}px`;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    this.rt.scene.setSize(W, H);
    this.rt.halfA.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    this.rt.halfB.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    this.rt.qA.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    this.rt.qB.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
  }

  /** Match the camera to the board's current pan and zoom. */
  #syncCamera() {
    const board = canvas.app.view;
    // While the screen shake / impact zoom is on, the board carries a CSS transform and its on-screen box is moved
    // and scaled. Measuring that box would apply the shake twice to the effects (they would land beside their
    // target, more so far from the impact). Use the board's resting box until the shake is over.
    const rect = this.kickApplied && this.restRect ? this.restRect : (this.restRect = board.getBoundingClientRect());
    this.dom.style.left = `${rect.left}px`;
    this.dom.style.top = `${rect.top}px`;
    this.#resize(Math.round(rect.width), Math.round(rect.height));
    const wt = canvas.stage.worldTransform;
    const s = wt.a || 1, k = this.ppf;
    const left = (0 - wt.tx) / s, right = (rect.width - wt.tx) / s;
    const top = (0 - wt.ty) / s, bottom = (rect.height - wt.ty) / s;
    this.camera.left = left / k; this.camera.right = right / k;
    this.camera.top = -top / k; this.camera.bottom = -bottom / k;
    this.camera.updateProjectionMatrix();
    this.screen = { rect, s, tx: wt.tx, ty: wt.ty };
  }

  /** Feet → CSS pixels on screen (for the zoom punch origin). */
  toScreen(v) {
    const p = this.toPx(v), sc = this.screen;
    return { x: p.x * sc.s + sc.tx, y: p.y * sc.s + sc.ty };
  }

  #applyKick(dt) {
    const k = this.kick;
    k.zoomV += (-160 * k.zoom - 14 * k.zoomV) * dt; k.zoom += k.zoomV * dt;
    k.shake *= Math.exp(-dt * 9);
    const board = canvas.app.view;
    const active = Math.abs(k.zoom) > 0.0005 || k.shake > 0.02;
    if (!active) {
      if (this.kickApplied) { board.style.transform = ""; this.dom.style.transform = ""; this.kickApplied = false; }
      return false;
    }
    const t = performance.now() / 1000;
    const sx = (Math.sin(t * 61) + Math.sin(t * 97) * 0.6) * k.shake * this.ppf * (this.screen?.s ?? 1);
    const sy = (Math.cos(t * 71) + Math.sin(t * 113) * 0.6) * k.shake * this.ppf * (this.screen?.s ?? 1);
    const o = this.screen ? this.toScreen(k.at) : { x: 0, y: 0 };
    const tf = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px) scale(${(1 + k.zoom).toFixed(4)})`;
    for (const el of [board, this.dom]) {
      el.style.transformOrigin = `${o.x}px ${o.y}px`;
      el.style.transform = tf;
    }
    this.kickApplied = true;
    return true;
  }

  /**
   * Adaptive resolution: when frames run long while effects play (a busy scene on a weaker GPU), render the
   * effects at a lower resolution, and climb back once frames are quick again. Turned off by "Adaptive resolution".
   */
  #adaptResolution(raw) {
    this.adapt ??= 1;
    // A gap of a second or more is a hidden tab or a breakpoint, not a slow GPU
    if (!(raw > 0 && raw < 1) || !this.effects.size || !setting("adaptive", true)) { this.slow = 0; this.fast = 0; return; }
    if (raw > 0.026) { this.slow = (this.slow ?? 0) + Math.min(raw, 0.1); this.fast = 0; }
    else if (raw < 0.0145) { this.fast = (this.fast ?? 0) + raw; this.slow = Math.max(0, (this.slow ?? 0) - raw * 0.5); }
    if (this.slow > 0.5 && this.adapt > 0.5) { this.adapt = Math.max(0.5, this.adapt - 0.15); this.slow = 0; }
    else if (this.fast > 2.5 && this.adapt < 1) { this.adapt = Math.min(1, this.adapt + 0.1); this.fast = 0; }
  }

  #frame(now) {
    if (!canvas?.ready) { this.running = false; return; }
    const raw = (now - this.last) / 1000;
    // Animation speed (per player): below 1 every effect plays slower, giving it more time to read
    const pace = Math.max(0.4, Math.min(1.6, Number(setting("pace", 0.85)) || 0.85));
    const dt = Math.min(0.05, raw) * (globalThis.__pyreTimeScale ?? 1) * pace;
    this.last = now;
    this.#adaptResolution(raw);
    // Shader clock: the page clock grows for hours in a Foundry session, and at those values the GPU's
    // texture lookups and sines lose precision (noise turned into flat white shapes). Keep it small.
    const clock = ((now / 1000 + (globalThis.__pyreClockShift ?? 0)) % 256);
    let busy = false;
    try {
      this.#syncCamera();
      for (const e of [...this.effects]) {
        let alive = false;
        try { alive = e.update(dt, clock); } catch (err) { console.error(`${MODULE_ID} | effect failed`, err); }
        if (!alive) { this.effects.delete(e); try { e.dispose(); } catch { /* already gone */ } }
      }
      for (const t of [...this.tickers]) {
        let keep = false;
        try { keep = t.update(dt, clock); } catch (err) { console.error(`${MODULE_ID} | ticker failed`, err); }
        if (!keep) this.tickers.delete(t);
      }
      const kicking = this.#applyKick(dt);
      busy = this.effects.size > 0 || this.tickers.size > 0 || kicking;
      this.#render(this.effects.size > 0);
    } catch (err) {
      console.error(`${MODULE_ID} | overlay frame`, err);
    }
    if (busy) requestAnimationFrame((n) => this.#frame(n));
    else {
      this.running = false;
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      if (this.gHolder) this.gHolder.visible = false;
    }
  }

  #render(withBloom) {
    const r = this.renderer;
    r.setRenderTarget(this.rt.scene);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    const bloom = withBloom ? clamp(setting("bloom", 0.7), 0, 2) : 0;
    if (bloom > 0) {
      const { halfA, halfB, qA, qB } = this.rt;
      this.mBright.uniforms.tSrc.value = this.rt.scene.texture;
      this.#pass(this.mBright, halfA);
      const blur = (src, dst, x, y) => {
        this.mBlur.uniforms.tSrc.value = src.texture;
        this.mBlur.uniforms.uStep.value.set(x / src.width, y / src.height);
        this.#pass(this.mBlur, dst);
      };
      blur(halfA, halfB, 1, 0); blur(halfB, halfA, 0, 1);
      blur(halfA, qA, 1, 0); blur(qA, qB, 0, 1); blur(qB, qA, 2, 0); blur(qA, qB, 0, 2);
      this.mFinal.uniforms.tBloom1.value = halfA.texture;
      this.mFinal.uniforms.tBloom2.value = qB.texture;
    } else {
      this.mFinal.uniforms.tBloom1.value = this.rt.qB.texture;
      this.mFinal.uniforms.tBloom2.value = this.rt.qB.texture;
    }
    this.mFinal.uniforms.uBloom.value = bloom;
    this.mFinal.uniforms.tScene.value = this.rt.scene.texture;
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.clear();
    this.#pass(this.mFinal, null);
    if (this.screen) this.#renderGround(this.screen.rect, this.screen.s, this.screen.tx, this.screen.ty);
  }

  /** Remove everything (scene change). */
  reset() {
    for (const e of this.effects) { try { e.dispose(); } catch { /* ignore */ } }
    if (this.gHolder) this.gHolder.visible = false;
    this.effects.clear();
    for (const t of this.tickers) { try { t.reset?.(); } catch { /* ignore */ } }
    const board = canvas?.app?.view;
    if (board) board.style.transform = "";
    this.dom.style.transform = "";
    this.kick.shake = 0; this.kick.zoom = 0;
  }
}
