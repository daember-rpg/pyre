import { COMMON } from "./shaders-lab.js";

/*
 * Shaders that exist only in the module.
 * The overlay is a transparent canvas over Foundry's board, so every layer writes
 * premultiplied colour: light adds (alpha 0), marks and smoke darken (alpha > 0).
 */

/* Floor layer: the light an effect throws on the map and the mark it leaves behind. */
export const FLOOR_FS = COMMON + /* glsl */`
uniform vec3 uLightColor, uDecalColor;
uniform float uLightGain, uDecalMode, uProjOn, uDecalFade;
uniform vec2 uProjPos;
varying vec2 vW;
vec4 over(vec4 dst, vec3 col, float a){ a = clamp(a, 0.0, 1.0); return vec4(dst.rgb*(1.0 - a) + col*a, dst.a + a*(1.0 - dst.a)); }
void main(){
  float t = uTime;
  float B = isBurst();
  vec2 rel = vW - uOrigin;
  vec2 perp = vec2(-uDir.y, uDir.x);
  float along = mix(dot(rel, uDir), length(rel), B);
  vec4 c = vec4(0.0);
  vec3 add = vec3(0.0);

  // Light from the effect (the board underneath is roughly mid-dark, so light adds a share of itself)
  float on = smoothstep(0.0, 0.12, t)*(1.0 - smoothstep(uEmit, uEmit + 0.7, t));
  float flick = 0.8 + 0.4*texture2D(uNoise, vec2(t*0.9, 0.37)).r;
  float front = uLength*clamp(t/mix(0.4, 0.25, B), 0.0, 1.0);
  float mL = area(vW, front + 3.0, -3.0, 3.5);
  float fall = 1.0 - 0.5*clamp(along/max(uLength, 0.1), 0.0, 1.0);
  float mouth = exp(-dot(rel, rel)/mix(40.0, 20.0 + uLength*uLength*0.25, B));
  float flash = B*exp(-max(t, 0.0)*6.0)*step(0.0, t)*2.2;
  float light = on*flick*(mL*fall*0.85 + mouth*mix(1.1, 1.6, B)) + flash*mouth;
  float pd = distance(vW, uProjPos);
  float plight = uProjOn*exp(-pd*pd/35.0);
  add += uLightColor*(light*1.25 + plight*1.4)*uLightGain*0.16;

  // Burst shockwave: thin bright ring of kicked-up dust
  float ringR = uLength*1.25*smoothstep(0.0, 0.5, t);
  float ring = B*step(0.0, t)*exp(-pow((length(rel) - ringR)/1.1, 2.0))*(1.0 - smoothstep(0.1, 0.65, t));
  add += (vec3(0.18) + uLightColor*0.1)*ring*uLightGain;

  // Ground mark
  float dn = texture2D(uNoise, vW*0.045).r;
  float dn2 = texture2D(uNoise, rot2(vW, 0.7)*0.061 + 0.3).g*0.65 + texture2D(uNoise, rot2(vW, -1.1)*0.13).b*0.35;
  float reachD = uLength*clamp((t - 0.05)/mix(0.5, 0.3, B), 0.0, 1.0);
  float mD = area(vW, reachD, (dn - 0.55)*3.2*(0.4 + 0.6*uEdgeNoise)*mix(1.0, clamp(uLength/20.0, 0.3, 1.0), B), 0.9);
  float halfWd = max(mix(along*uHalfTan, uLineWidth*0.5, isLine()), 0.5);
  float centre = B > 0.5 ? 1.0 - clamp(length(rel)/max(uLength, 0.1), 0.0, 1.0) : 1.0 - clamp(abs(dot(rel, perp))/halfWd, 0.0, 1.0);
  float d = mD*(0.55 + 0.45*sqrt(centre))*uDecalFade*smoothstep(0.1, 1.0, t);
  if(uDecalMode < 0.5){
    c = over(c, vec3(0.02, 0.015, 0.01), d*(0.55 + 0.25*dn2));
    float hot = d*pow(smoothstep(0.35, 0.95, dn2), 2.0)*(1.0 - smoothstep(uEmit*0.5, uEmit + 3.0, t));
    add += uDecalColor*hot*0.9;
  } else if(uDecalMode < 1.5){
    float frost = d*smoothstep(0.3, 0.7, dn2 + dn*0.3);
    c = over(c, uDecalColor*0.55, frost*0.6);
    add += uDecalColor*pow(smoothstep(0.55, 1.0, dn2), 6.0)*d*1.2;
  } else if(uDecalMode < 2.5){
    c = over(c, vec3(0.08, 0.14, 0.02), d*0.45);
    float b = smoothstep(0.72, 0.78, texture2D(uNoise, vW*0.3 + vec2(0.0, t*0.04)).b);
    add += uDecalColor*b*d*(1.0 - smoothstep(2.0, 8.0, t))*0.9;
  } else if(uDecalMode < 3.5){
    c = over(c, vec3(0.16, 0.2, 0.05), d*0.25);
  } else if(uDecalMode < 5.5){
    float sp = smoothstep(0.6, 0.68, dn2 + dn*0.25);
    c = over(c, vec3(0.12, 0.005, 0.005), d*sp*0.8);
  } else if(uDecalMode < 6.5){
    c = over(c, vec3(0.05, 0.03, 0.07), d*0.45);
    add += uDecalColor*pow(smoothstep(0.6, 1.0, dn2), 4.0)*d*0.4;
  } else if(uDecalMode < 7.5){
    c = over(c, vec3(0.01, 0.02, 0.03), d*0.38);
    add += uDecalColor*pow(smoothstep(0.55, 1.0, dn2), 5.0)*d*0.35;
  } else if(uDecalMode < 8.5){
    float ridge = 1.0 - abs(texture2D(uNoise, vW*0.07 + 0.2).r*2.0 - 1.0);
    float ridge2 = 1.0 - abs(texture2D(uNoise, rot2(vW, 0.9)*0.16).g*2.0 - 1.0);
    float crack = max(smoothstep(0.94, 0.985, ridge), smoothstep(0.95, 0.99, ridge2)*0.7)*smoothstep(0.2, 0.6, d);
    c = over(c, vec3(0.2, 0.17, 0.13), d*0.3);
    c = over(c, vec3(0.0), crack*0.8);
  }
  gl_FragColor = vec4(c.rgb + add, c.a);
}`;

/* Token flash: a soft disc over a struck creature, additive or (for dread) darkening. */
export const FLASH_FS = /* glsl */`
uniform vec3 uCol;
uniform float uA, uDark;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0 - 1.0;
  float r = length(p);
  float m = (1.0 - smoothstep(0.55, 1.0, r))*uA;
  if(uDark > 0.5) gl_FragColor = vec4(uCol*m, m*0.85);
  else gl_FragColor = vec4(uCol*m, 0.0);
}`;

/* Afterimage (speed rune): the token art, tinted and faded. */
export const GHOST_FS = /* glsl */`
uniform sampler2D uTex;
uniform vec3 uTint;
uniform float uA;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(mix(c.rgb, uTint, 0.55)*c.a*uA, 0.0);
}`;

/* Post: bright pass, separable blur, and the final tone map that keeps the overlay transparent. */
export const POST_VS = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy*2.0, 0.0, 1.0); }`;

export const BRIGHT_FS = /* glsl */`
uniform sampler2D tSrc;
uniform float uThreshold;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  gl_FragColor = vec4(c*smoothstep(uThreshold, uThreshold + 0.4, l), 1.0);
}`;

export const BLUR_FS = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uStep;
varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb*0.227;
  s += (texture2D(tSrc, vUv + uStep*1.38).rgb + texture2D(tSrc, vUv - uStep*1.38).rgb)*0.316;
  s += (texture2D(tSrc, vUv + uStep*3.23).rgb + texture2D(tSrc, vUv - uStep*3.23).rgb)*0.070;
  gl_FragColor = vec4(s, 1.0);
}`;

export const FINAL_FS = /* glsl */`
uniform sampler2D tScene, tBloom1, tBloom2;
uniform float uBloom, uExposure;
varying vec2 vUv;
vec3 aces(vec3 x){
  x *= 0.6;
  return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec4 s = texture2D(tScene, vUv);
  vec3 bloom = texture2D(tBloom1, vUv).rgb*0.6 + texture2D(tBloom2, vUv).rgb*0.8;
  vec3 col = aces((s.rgb + bloom*uBloom)*uExposure);
  // Valid premultiplied output: alpha must cover the brightest channel. Light written with no alpha of its own
  // only adds on some compositors; the macOS/Metal one drops it (no trails, no arcs, no glow) and shows the
  // dark backings as flat white shapes. Light now covers the board in proportion to its brightness.
  vec3 c = toSRGB(col);
  float a = clamp(max(s.a, max(max(c.r, c.g), c.b)), 0.0, 1.0);
  gl_FragColor = vec4(min(c, vec3(a)), a);
}`;

/** Sword cut: a crescent slash across the target, bright core with a dark backing so it reads on light maps.
 *  Premultiplied output: light in rgb, the dark backing through alpha. */
export const CUT_FS = `
uniform vec2 uC, uDir;
uniform float uT, uR, uLen, uSide, uGain;
uniform vec3 uTint;
varying vec2 vW;
void main(){
  vec2 rel = vW - uC;
  float a = dot(rel, uDir), l = dot(rel, vec2(-uDir.y, uDir.x))*uSide;
  vec2 p = vec2(a, l + uR);
  float r = length(p);
  float span = uLen/uR*0.5;
  float u = atan(p.x, p.y)/span;
  float head = mix(-1.25, 1.25, smoothstep(0.0, 0.07, uT));
  float drawn = 1.0 - smoothstep(head - 0.05, head + 0.12, u);
  float inSpan = 1.0 - smoothstep(0.82, 1.0, abs(u));
  float thick = (0.7 - 0.5*u*u)*(1.0 - 0.65*smoothstep(0.07, 0.5, uT));
  float d = r - uR;
  float core = 1.0 - smoothstep(thick*0.3, thick*0.6, abs(d));
  float glow = exp(-d*d/(thick*thick*1.4));
  float sd = d + thick*0.95;
  float shadow = exp(-sd*sd/(thick*thick*1.1));
  float fade = 1.0 - smoothstep(0.28, 0.6, uT);
  float m = drawn*inSpan*fade*step(0.0, uT);
  vec3 light = (mix(uTint, vec3(1.0), 0.35)*core*0.85 + uTint*glow*0.35)*m*uGain;
  float alpha = clamp(shadow*0.75*m*(1.0 - core*0.7), 0.0, 1.0);
  gl_FragColor = vec4(light, alpha);
}`;

/** Ground marks that stay a few seconds: an axe gash, or a pick's star crack (premultiplied, dark). */
export const MARK_FS = `
uniform sampler2D uNoise;
uniform vec2 uC, uDir;
uniform float uMode, uLen, uA, uSeed;
varying vec2 vW;
void main(){
  vec2 rel = vW - uC;
  float a = dot(rel, uDir), l = dot(rel, vec2(-uDir.y, uDir.x));
  float m = 0.0;
  if(uMode < 0.5){
    float n = texture2D(uNoise, vec2(a*0.12 + uSeed, 0.37)).r;
    float along = 1.0 - smoothstep(uLen*0.32, uLen*0.5, abs(a));
    float w = 0.42*along*(0.65 + 0.7*n);
    float d = abs(l + (n - 0.5)*0.35);
    float core = (1.0 - smoothstep(w*0.45, w + 0.03, d))*step(0.05, along);
    float bruise = exp(-l*l/(w*w*9.0 + 0.01))*0.3*along;
    // A pale torn lip on one side, so the gash reads on dark floors too
    float lip = exp(-pow((l - w*1.4)/(w*0.7 + 0.01), 2.0))*along*0.55;
    m = max(core, bruise);
    float alpha = clamp(max(m, lip)*uA, 0.0, 1.0);
    vec3 col = mix(vec3(0.03, 0.022, 0.015), vec3(0.55, 0.48, 0.38), clamp(lip - m, 0.0, 1.0));
    gl_FragColor = vec4(col*alpha, alpha);
    return;
  } else {
    float r = length(rel);
    for(int i = 0; i < 7; i++){
      float fi = float(i);
      float aa = fi*0.8976 + uSeed*6.0 + sin(fi*1.7 + uSeed*9.0)*0.35;
      float len = uLen*(0.5 + 0.5*fract(sin(fi*12.9 + uSeed*31.0)*43758.5));
      vec2 d = vec2(cos(aa), sin(aa));
      float along = dot(rel, d);
      float side = abs(dot(rel, vec2(-d.y, d.x)) + sin(along*2.6 + fi)*0.1*along);
      float w = 0.14*(1.0 - clamp(along/len, 0.0, 1.0));
      m = max(m, step(0.0, along)*step(along, len)*(1.0 - smoothstep(w*0.5, w + 0.02, side)));
    }
    m = max(m, 1.0 - smoothstep(0.3, 0.6, r));
    // Pale dust kicked out of the hole
    float dust = exp(-r*r/(uLen*uLen*0.35))*0.35;
    float alpha = clamp(max(m, dust)*uA, 0.0, 1.0);
    vec3 col = mix(vec3(0.5, 0.45, 0.38), vec3(0.03, 0.022, 0.015), clamp(m*1.5, 0.0, 1.0));
    gl_FragColor = vec4(col*alpha, alpha);
    return;
  }
  float alpha = clamp(m*uA, 0.0, 1.0);
  gl_FragColor = vec4(vec3(0.03, 0.022, 0.015)*alpha, alpha);
}`;
