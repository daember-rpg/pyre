// GLSL ported from the Pyre labs. Units are feet; +y is up (the overlay camera flips Foundry's y).

export const COMMON = `
uniform float uTime, uEmit, uLength, uHalfAng, uHalfTan, uLineWidth, uMode, uTurb, uSize, uSeedOff, uEdgeNoise;
uniform vec2 uOrigin, uDir;
uniform sampler2D uNoise;

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec2 rot2(vec2 v, float a){ float c=cos(a), s=sin(a); return vec2(c*v.x-s*v.y, s*v.x+c*v.y); }
float isLine(){ return step(0.5,uMode)*(1.0-step(1.5,uMode)); }
float isBurst(){ return step(1.5,uMode); }

// PF2e area mask: cone = quarter circle (radial far edge), line = rectangle, burst = circle.
float area(vec2 w, float L, float inset, float soft){
  vec2 rel = w-uOrigin;
  if(uMode > 2.5){ vec2 q = abs(rel) - vec2(L*0.5 - inset); return 1.0 - smoothstep(-soft, soft, max(q.x, q.y)); }
  if(uMode > 1.5) return 1.0 - smoothstep(L-inset-soft, L-inset+soft, length(rel));
  float a = dot(rel,uDir);
  float l = dot(rel, vec2(-uDir.y,uDir.x));
  float ln = isLine();
  float far = mix(length(rel), a, ln);
  float halfW = mix(max(a,0.0)*uHalfTan, uLineWidth*0.5, ln) - inset;
  float m = smoothstep(inset-soft, inset+soft, a);
  m *= 1.0 - smoothstep(L-inset-soft, L-inset+soft, far);
  m *= 1.0 - smoothstep(halfW-soft, halfW+soft, abs(l));
  return m;
}
`;

/** Walls near the effect, as segments in feet. A particle whose path from its start crosses one bounces back
 *  off it: the part of the path beyond the wall is mirrored to this side and shortened by the restitution. */
export const WALLS_GLSL = `
uniform vec4 uWalls[24];
uniform float uWallN, uBounce;
float bounceWalls(vec2 s, inout vec2 p, inout vec2 vel){
  if(uWallN < 0.5) return 0.0;
  vec2 d = p - s;
  float best = 1.0; vec2 hit = p; vec2 nrm = vec2(0.0);
  for(int i = 0; i < 24; i++){
    if(float(i) >= uWallN) break;
    vec4 w = uWalls[i];
    vec2 e = w.zw - w.xy;
    float den = d.x*e.y - d.y*e.x;
    if(abs(den) < 1e-6) continue;
    vec2 as = w.xy - s;
    float t = (as.x*e.y - as.y*e.x)/den;
    float u = (as.x*d.y - as.y*d.x)/den;
    if(t > 0.0 && t < best && u >= 0.0 && u <= 1.0){ best = t; hit = s + d*t; nrm = normalize(vec2(-e.y, e.x)); }
  }
  if(best >= 1.0) return 0.0;
  if(dot(s - hit, nrm) < 0.0) nrm = -nrm;          // face the side the particle came from
  vec2 over = p - hit;
  vec2 refl = over - 2.0*dot(over, nrm)*nrm;
  p = hit + refl*uBounce + nrm*0.12;
  vel = (vel - 2.0*dot(vel, nrm)*nrm)*uBounce;
  return 1.0;
}
`;

export const PARTICLE_ATTRS = `
attribute vec4 aSeed;
attribute float aBirth;
attribute float aLife;
varying vec2 vUv;
varying float vT;
varying vec4 vSeed;
varying float vAlive;
`;

export const FIRE_VS = COMMON + WALLS_GLSL + PARTICLE_ATTRS + `
uniform float uLifeMin, uLifeMax;
varying float vHeat;
void main(){
  vHeat = 1.0;
  float L1 = isLine(), B = isBurst();
  float life = mix(uLifeMin, uLifeMax, aLife) * mix(1.0, 1.15, L1);
  float age = uTime - aBirth*uEmit;
  float t = age/life;
  vUv = uv; vT = t; vSeed = aSeed;
  if(t < 0.0 || t > 1.0){ vAlive = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  vAlive = 1.0;
  vec2 perp = vec2(-uDir.y, uDir.x);
  float r = aSeed.y*2.0-1.0;
  vec2 p;
  float d;
  if(B > 0.5){
    float prog = (1.0-exp(-4.5*t))/(1.0-exp(-4.5));
    float ang = aSeed.y*6.2831;
    vec2 dirv = vec2(cos(ang), sin(ang));
    d = uLength*(0.15+0.85*pow(aSeed.x,0.55))*prog;
    float edgeN = snoise(vec3(dirv*1.6, uTime*0.8 + uSeedOff));
    d *= 1.0 + uEdgeNoise*0.22*edgeN*smoothstep(0.3,1.0,prog);
    p = uOrigin + dirv*d;
    if(uMode > 2.5){
      // Square field: fill the square instead of a disc
      vec2 sq = vec2(fract(aSeed.y*7.13 + aSeed.w), aSeed.x) - 0.5;
      p = uOrigin + sq*uLength*(0.85 + 0.15*prog);
      d = length(sq)*uLength;
    }
    // Bursts burn white-hot at the heart and cooler, smokier at the rim.
    vHeat = 0.55 + 0.75*(1.0 - clamp(d/uLength, 0.0, 1.0));
  } else {
    r = sign(r)*pow(abs(r), 1.2);
    float prog = (1.0-exp(-3.2*t))/(1.0-exp(-3.2));
    d = uLength*(0.62+0.42*aSeed.x)*prog;
    // Organic edges: side walls and the front breathe with noise instead of tracing the template.
    float sideN = snoise(vec3(d*0.13, r*1.7, uTime*0.9 + uSeedOff));
    float frontN = snoise(vec3(r*2.3, uTime*0.75, uSeedOff + 3.7));
    r *= 1.0 + uEdgeNoise*0.32*sideN*smoothstep(0.3, 1.0, abs(r));
    d *= 1.0 + uEdgeNoise*0.16*frontN*smoothstep(0.45, 1.0, prog);
    vec2 dirv = mix(rot2(uDir, r*uHalfAng*0.88), uDir, L1);
    p = uOrigin + dirv*d + perp*(r*uLineWidth*0.42*(0.3+0.7*prog))*L1;
    p += perp*(aSeed.w-0.5)*0.8;
  }
  float scaleK = mix(1.0, clamp(uLength/18.0, 0.4, 1.1), B);
  float amp = uTurb*(0.5 + d*0.11)*smoothstep(0.0,0.55,t)*mix(1.0,0.35,L1)*mix(1.0, 0.7, B);
  vec3 q = vec3(p*0.09, uTime*0.7 + uSeedOff);
  p += vec2(snoise(q), snoise(q+vec3(31.4,17.2,5.1)))*amp;
  { vec2 s0 = uOrigin + perp*dot(p - uOrigin, perp)*L1; vec2 vv = vec2(0.0); bounceWalls(s0, p, vv); }
  float size = uSize*(0.9+3.4*pow(t,0.75))*(0.7+0.6*aSeed.w)*mix(0.55+0.45*min(d/8.0,1.0), 1.0, B)*mix(1.0,0.62,L1)*scaleK;
  float ang2 = aSeed.z*6.2831 + age*(aSeed.x-0.5)*3.0;
  vec2 c = rot2(position.xy*size, ang2);
  gl_Position = projectionMatrix*viewMatrix*vec4(p+c, 0.0, 1.0);
}`;

export const FIRE_FS = COMMON + `
uniform vec3 uC0, uC1, uC2, uC3, uRim;
uniform float uFireGain, uDark, uDarkAlpha;
varying vec2 vUv; varying float vT; varying vec4 vSeed; varying float vAlive; varying float vHeat;
vec3 ramp(float x){
  x = clamp(x,0.0,1.0);
  if(x < 0.33) return mix(uC0,uC1,x/0.33);
  if(x < 0.66) return mix(uC1,uC2,(x-0.33)/0.33);
  return mix(uC2,uC3,(x-0.66)/0.34);
}
void main(){
  if(vAlive < 0.5) discard;
  vec2 p = vUv*2.0-1.0;
  float m = 1.0 - smoothstep(0.15, 1.0, length(p));
  vec2 nuv = vUv*0.28 + vSeed.xy*7.0 + vec2(0.0, uTime*0.3);
  float n = texture2D(uNoise, nuv).r*0.6 + texture2D(uNoise, nuv*1.8 + vSeed.zw).g*0.4;
  float dens = m*(0.55 + n*0.9);
  float er = vT*0.55;
  float shape = smoothstep(er, er+0.55, dens)*m;
  float T = (pow(1.0-vT, 1.35)*(0.75+0.25*vSeed.z) + (dens-0.5)*0.25)*vHeat;
  float fade = smoothstep(0.0,0.05,vT)*(1.0-smoothstep(0.55,1.0,vT));
  if(uDark > 0.5){
    // Shadow mode: light cannot be black, so dark colours are painted (alpha) with a glowing rim.
    // Young, hot wisps glow in the rim colour; older ones sink into the dark core (no per-puff outlines).
    float glowAmt = pow(clamp(T, 0.0, 1.0), 2.0)*(0.35 + 0.65*n);
    vec3 c = mix(ramp(T)*0.5, uRim*1.5, glowAmt*0.6);
    gl_FragColor = vec4(c, clamp(shape*fade*uDarkAlpha, 0.0, 1.0));
  } else {
    float energy = mix(0.35, 1.6, clamp(T,0.0,1.0));
    gl_FragColor = vec4(ramp(T)*energy*uFireGain*fade, shape);
  }
}`;

export const SMOKE_VS = COMMON + WALLS_GLSL + PARTICLE_ATTRS + `
uniform float uLifeMin, uLifeMax;
uniform vec2 uWind;
void main(){
  float L1 = isLine(), B = isBurst();
  float life = mix(uLifeMin, uLifeMax, aLife);
  float d0 = 0.2 + 0.8*aSeed.x;
  float birth = aBirth*(uEmit+0.35) + d0*mix(0.35, 0.15, B);
  float age = uTime - birth;
  float t = age/life;
  vUv = uv; vT = t; vSeed = aSeed;
  if(t < 0.0 || t > 1.0){ vAlive = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  vAlive = 1.0;
  vec2 perp = vec2(-uDir.y, uDir.x);
  float r = aSeed.y*2.0-1.0;
  r *= 1.0 + uEdgeNoise*0.3*snoise(vec3(d0*3.0, r*1.5, uTime*0.3 + uSeedOff));
  float ang = aSeed.y*6.2831;
  vec2 dirv = B > 0.5 ? vec2(cos(ang), sin(ang)) : mix(rot2(uDir, r*uHalfAng*0.9), uDir, L1);
  vec2 start = uOrigin + perp*r*uLineWidth*0.45*L1;
  float d = uLength*d0*mix(0.95, 0.85, B) + uLength*0.16*(1.0-exp(-2.0*t));
  vec2 p = start + dirv*d + uWind*age;
  if(uMode > 2.5) p = uOrigin + (vec2(fract(aSeed.y*7.13 + aSeed.w), aSeed.x) - 0.5)*uLength + uWind*age;
  vec3 q = vec3(p*0.05, uTime*0.22 + aSeed.z*5.0 + uSeedOff);
  p += vec2(snoise(q), snoise(q+vec3(12.3,4.5,7.8)))*uTurb*(1.5+5.0*t);
  { vec2 vv = vec2(0.0); bounceWalls(start, p, vv); }
  float size = uSize*(2.0+5.5*pow(t,0.7))*(0.7+0.6*aSeed.w)*mix(1.0,0.8,L1)*mix(1.0, clamp(uLength/18.0,0.45,1.1), B);
  float a = aSeed.z*6.2831 + age*(aSeed.x-0.5)*0.6;
  gl_Position = projectionMatrix*viewMatrix*vec4(p + rot2(position.xy*size, a), 0.0, 1.0);
}`;

export const SMOKE_FS = COMMON + `
uniform vec3 uSmokeColor, uSmokeGlow;
uniform float uSmokeGain;
varying vec2 vUv; varying float vT; varying vec4 vSeed; varying float vAlive;
void main(){
  if(vAlive < 0.5) discard;
  vec2 p = vUv*2.0-1.0;
  float m = 1.0 - smoothstep(0.2, 1.0, length(p));
  vec2 nuv = vUv*0.45 + vSeed.xy*5.0 + vec2(uTime*0.02);
  float n = texture2D(uNoise, nuv).r*0.6 + texture2D(uNoise, nuv*2.3 + vSeed.zw).g*0.4;
  float dens = m*n;
  float shape = smoothstep(0.12+vT*0.25, 0.55+vT*0.2, dens + m*0.25);
  float a = shape*smoothstep(0.0,0.12,vT)*pow(1.0-vT,1.4)*uSmokeGain;
  vec3 col = mix(uSmokeColor, uSmokeGlow*1.4, pow(1.0-vT,5.0)*0.7);
  gl_FragColor = vec4(col, clamp(a,0.0,1.0));
}`;

export const EMBER_VS = COMMON + WALLS_GLSL + PARTICLE_ATTRS + `
uniform float uLifeMin, uLifeMax, uEmberDrag, uEmberSpeed, uEmberSize, uEmberStreak, uEmberMode, uEmberBurst, uEmberScatter;
varying float vMode;
varying float vPop;
void main(){
  float L1 = isLine(), B = isBurst();
  float life = mix(uLifeMin, uLifeMax, aLife);
  float isB = step(fract(aSeed.x*7.31 + aSeed.w*3.1), uEmberBurst);
  float bd = mix(0.15, 0.95, fract(aSeed.y*5.7 + aSeed.z*2.3));
  float age = uTime - aBirth*uEmit - isB*bd*mix(0.45, 0.2, B);
  float t = age/life;
  vUv = uv; vT = t; vSeed = aSeed; vMode = uEmberMode;
  if(t < 0.0 || t > 1.0){ vAlive = 0.0; vPop = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  vAlive = 1.0;
  vPop = isB*exp(-age*9.0);
  vec2 perp = vec2(-uDir.y, uDir.x);
  float r = aSeed.y*2.0-1.0;
  float ang = aSeed.y*6.2831;
  vec2 radial = vec2(cos(ang), sin(ang));
  vec2 inArea = B > 0.5 ? radial : mix(rot2(uDir, r*uHalfAng*0.85), uDir, L1);
  vec2 lineOff = perp*r*uLineWidth*0.45*L1;
  vec2 start = mix(uOrigin + lineOff, uOrigin + inArea*uLength*bd + lineOff, isB);
  if(uMode > 2.5) start = uOrigin + (vec2(fract(aSeed.y*5.7 + aSeed.x), fract(aSeed.w*3.3 + aSeed.z)) - 0.5)*uLength;
  float sa = aSeed.z*6.2831;
  vec2 rnd = vec2(cos(sa), sin(sa));
  vec2 jetBase = B > 0.5 ? radial : mix(rot2(uDir, r*uHalfAng*0.95), uDir, L1);
  vec2 jetDir = normalize(jetBase + rnd*uEmberScatter*aSeed.w);
  vec2 dirv = normalize(mix(jetDir, rnd + uDir*0.35*(1.0-B), isB));
  float k = uEmberDrag;
  float v0 = uLength*k*mix(0.8,1.5,aSeed.x)*uEmberSpeed*mix(1.0, 0.32, isB)*mix(1.0, 0.75, B)*mix(1.0, 0.18, step(2.5, uMode));
  float e = exp(-k*age);
  vec2 p = start + dirv*(v0*(1.0-e)/k);
  vec2 vel = dirv*v0*e;
  vec3 q = vec3(p*0.12, uTime*1.1 + aSeed.z*7.0 + uSeedOff);
  vec2 n = vec2(snoise(q), snoise(q+vec3(9.1,3.3,1.7)));
  p += n*uTurb*1.6*t;
  vel += n*uTurb*3.0;
  bounceWalls(start, p, vel);
  float sz = uEmberSize*(0.6+0.8*aSeed.w)*(1.0 + isB*0.5);
  if(uEmberMode > 1.5) sz *= (1.0 - t*0.6);
  float speed = length(vel);
  vec2 fwd = speed > 0.001 ? vel/speed : dirv;
  float len = sz + speed*uEmberStreak;
  vec2 c = position.xy;
  vec2 world = p + fwd*c.x*len + vec2(-fwd.y,fwd.x)*c.y*sz;
  gl_Position = projectionMatrix*viewMatrix*vec4(world, 0.0, 1.0);
}`;

export const EMBER_FS = COMMON + `
uniform vec3 uEmberColor;
uniform float uEmberGain;
varying vec2 vUv; varying float vT; varying vec4 vSeed; varying float vAlive; varying float vMode; varying float vPop;
void main(){
  if(vAlive < 0.5) discard;
  vec2 p = vUv*2.0-1.0;
  float shape;
  float flick;
  if(vMode > 0.5 && vMode < 1.5){
    shape = exp(-abs(p.x)*7.0)*exp(-p.y*p.y*40.0) + exp(-abs(p.y)*7.0)*exp(-p.x*p.x*40.0) + exp(-dot(p,p)*10.0);
    flick = pow(0.5+0.5*sin(uTime*(6.0+10.0*vSeed.z) + vSeed.x*40.0), 3.0)*1.4 + 0.15;
  } else {
    shape = exp(-p.y*p.y*7.0)*(1.0-smoothstep(0.3,1.0,abs(p.x)));
    shape += exp(-dot(p-vec2(0.45,0.0), p-vec2(0.45,0.0))*9.0)*0.8;
    flick = 0.65 + 0.35*sin(uTime*(18.0+30.0*vSeed.z) + vSeed.x*40.0);
  }
  shape *= 1.0 - smoothstep(0.6, 1.0, length(p));
  float fade = smoothstep(0.0,0.04,vT)*pow(1.0-vT,1.2);
  gl_FragColor = vec4(uEmberColor*uEmberGain*(flick + vPop*2.5)*fade*2.2, clamp(shape,0.0,1.0));
}`;

export const TRAIL_VS = COMMON + PARTICLE_ATTRS + `
uniform float uPT, uTravel, uTrailLife, uTrailWidth, uTrailSize, uArc, uWobble, uWobbleFreq;
uniform vec2 uFrom, uTo;
varying float vHeat;
void main(){
  vHeat = 1.0;
  float e = aBirth*uTravel;
  float life = mix(0.35, 1.0, aLife)*uTrailLife;
  float age = uPT - e;
  float t = age/life;
  vUv = uv; vT = t; vSeed = aSeed;
  if(uTravel <= 0.0 || t < 0.0 || t > 1.0){ vAlive = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  vAlive = 1.0;
  vec2 dir = normalize(uTo-uFrom + 1e-5);
  vec2 perp = vec2(-dir.y, dir.x);
  float s = e/uTravel;
  float h = 4.0*s*(1.0-s)*uArc;
  // Same sway as the head (computed in JS): two sines give a straight, swaying or staggering path.
  float sway = uWobble*(sin(s*uWobbleFreq*6.2831 + uSeedOff)*0.65 + sin(s*uWobbleFreq*2.7*6.2831 + uSeedOff*1.7)*0.35);
  vec2 base = mix(uFrom, uTo, s) + perp*sway;
  vec2 p = base + perp*(aSeed.y-0.5)*uTrailWidth*(0.5+1.6*t) - dir*age*2.0*(0.4+aSeed.x);
  vec3 q = vec3(p*0.15, uPT*1.2 + aSeed.z*4.0 + uSeedOff);
  p += vec2(snoise(q), snoise(q+vec3(5.2,1.3,8.8)))*uTurb*0.9*t*(uTrailWidth+0.3);
  float size = uTrailSize*(0.6+1.7*t)*(0.6+0.8*aSeed.w)*(1.0+h*0.9);
  float a = aSeed.z*6.2831 + age*2.0;
  gl_Position = projectionMatrix*viewMatrix*vec4(p + rot2(position.xy*size, a), 0.0, 1.0);
}`;

export const QUAD_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

export const HEAD_FS = `
uniform sampler2D uNoise;
uniform vec3 uCore, uGlow;
uniform float uGain, uClock;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0-1.0;
  float r = length(p);
  float n = texture2D(uNoise, vUv*0.6 + vec2(uClock*0.9, uClock*0.35)).r;
  float core = exp(-r*r*16.0);
  float halo = exp(-r*r*3.2)*(0.55+0.7*n);
  vec3 c = uCore*core*3.2 + uGlow*halo*1.3;
  gl_FragColor = vec4(c*uGain*(1.0-smoothstep(0.75,1.0,r)), 1.0);
}`;

export const BEAM_FS = `
uniform sampler2D uNoise;
uniform vec3 uCore, uGlow;
uniform float uGain, uClock, uLen;
varying vec2 vUv;
void main(){
  float y = vUv.y*2.0-1.0;
  float n = texture2D(uNoise, vec2(vUv.x*uLen*0.06 - uClock*2.5, vUv.y*0.4 + uClock*0.5)).r;
  float wob = (n-0.5)*0.25;
  float core = exp(-pow(y+wob*0.3, 2.0)*70.0);
  float glow = exp(-y*y*5.0)*(0.35+0.9*n);
  float ends = smoothstep(0.0,0.02,vUv.x)*(1.0-smoothstep(0.985,1.0,vUv.x));
  gl_FragColor = vec4((uCore*core*3.0 + uGlow*glow)*uGain*ends, 1.0);
}`;

export const DEBRIS_FS = COMMON + `
uniform vec3 uDebrisColor;
uniform float uShape;
varying vec2 vUv; varying float vT; varying vec4 vSeed; varying float vAlive; varying float vMode; varying float vPop;
void main(){
  if(vAlive < 0.5) discard;
  vec2 p = vUv*2.0 - 1.0;
  float spin = vSeed.z*6.28 + vT*(vSeed.x - 0.5)*14.0;
  vec2 q = rot2(p, spin);
  float a = atan(q.y, q.x);
  float sides = uShape > 1.5 ? 4.0 : uShape > 0.5 ? 3.0 : 5.0 + floor(vSeed.w*3.0);
  float seg = floor((a + 3.14159)/(6.28318)*sides);
  float edge = 0.62 + 0.3*fract(sin(seg*12.9898 + vSeed.y*78.233)*43758.5453);
  if(uShape > 1.5) q.x *= 0.45;
  float inside = 1.0 - smoothstep(edge - 0.06, edge, length(q));
  if(inside < 0.01) discard;
  vec2 n = normalize(q + 0.001);
  float lit = 0.55 + 0.45*dot(n, normalize(vec2(-0.6, 0.8)));
  vec3 col = uDebrisColor*(0.6 + 0.5*vSeed.w)*lit;
  if(uShape > 0.5 && uShape < 1.5) col += vec3(1.0)*pow(max(dot(n, normalize(vec2(-0.6, 0.8))), 0.0), 12.0)*0.8*step(0.5, fract(vT*9.0 + vSeed.x*7.0));
  float fade = smoothstep(0.0, 0.03, vT)*(1.0 - smoothstep(0.75, 1.0, vT));
  gl_FragColor = vec4(col, inside*fade);
}`;

export const ROCK_FS = `
uniform vec3 uCore, uGlow;
uniform float uGain, uClock, uLen;
varying vec2 vUv;
vec2 rot2(vec2 v, float a){ float c=cos(a), s=sin(a); return vec2(c*v.x-s*v.y, s*v.x+c*v.y); }
void main(){
  vec2 p = rot2(vUv*2.0 - 1.0, uClock*5.0);
  if(uLen > 1.5) p.x *= 0.4;
  float a = atan(p.y, p.x);
  float sides = uLen > 0.5 && uLen < 1.5 ? 3.0 : 7.0;
  float seg = floor((a + 3.14159)/6.28318*sides);
  float edge = 0.68 + 0.22*fract(sin(seg*12.9898)*43758.5453);
  float inside = 1.0 - smoothstep(edge - 0.05, edge, length(p));
  if(inside < 0.01) discard;
  vec2 n = normalize(p + 0.001);
  float lit = 0.5 + 0.5*dot(n, normalize(vec2(-0.6, 0.8)));
  gl_FragColor = vec4(uCore*lit*(0.8 + 0.2*uGain), inside);
}`;

export const ARC_VS = `
attribute vec4 aSeg;
attribute vec2 aWA;
varying vec2 vUv; varying float vA;
void main(){
  vec2 p0 = aSeg.xy, p1 = aSeg.zw;
  vec2 d = p1 - p0; float L = length(d);
  vec2 f = L > 0.0 ? d/L : vec2(1.0, 0.0);
  vec2 n = vec2(-f.y, f.x);
  vec2 w = p0 + f*(position.x + 0.5)*L + n*position.y*aWA.x;
  vUv = uv; vA = aWA.y;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 0.0, 1.0);
}`;

export const ARC_FS = `
uniform vec3 uCore, uGlow;
uniform float uGain;
varying vec2 vUv; varying float vA;
void main(){
  float y = vUv.y*2.0 - 1.0;
  float core = exp(-y*y*45.0), glow = exp(-y*y*4.0);
  gl_FragColor = vec4((uCore*core*2.6 + uGlow*glow*0.8)*vA*uGain, 1.0);
}`;

export const HOP_RING_FS = `
uniform vec2 uC;
uniform float uR, uW, uA;
uniform vec3 uCol;
varying vec2 vW;
void main(){
  float d = abs(length(vW - uC) - uR);
  gl_FragColor = vec4(uCol*exp(-d*d/(uW*uW))*uA, 1.0);
}`;

export const AREA_RING_FS = COMMON + `
uniform float uR, uW, uA;
uniform vec3 uCol;
varying vec2 vW;
void main(){
  float d = abs(length(vW - uOrigin) - uR);
  float ring = exp(-d*d/(uW*uW));
  if(uMode < 1.5) ring *= area(vW, uLength*1.3, -1.5, 1.5);
  gl_FragColor = vec4(uCol*ring*uA, 1.0);
}`;

export const SMEAR_FS = `
uniform sampler2D uNoise;
uniform vec2 uC, uDir;
uniform float uMode, uT, uR, uLen, uGain, uSide;
uniform float uSpan, uDur, uThick, uWave, uWidth, uFade;
uniform vec3 uCore, uTint;
varying vec2 vW;
void main(){
  vec2 rel = vW - uC;
  float a = dot(rel, uDir), l = dot(rel, vec2(-uDir.y, uDir.x))*uSide;
  float I = 0.0;
  if(uMode < 0.5){
    // Arc swing. Span, speed and thickness make the sword, the axe chop, the polearm reap and the lash.
    float ang = atan(l, a);
    float r = length(rel) + uWave*sin(ang*8.0 - uT*55.0)*0.55*smoothstep(-uSpan, uSpan, ang);
    float sweep = mix(-uSpan, uSpan, smoothstep(0.0, 1.0, uT/uDur));
    float behind = sweep - ang;
    float tail = smoothstep(-0.1, 0.06, behind)*exp(-max(behind, 0.0)*1.9*1.35/uSpan);
    float band = smoothstep(uR-uThick, uR-0.3, r)*(1.0 - smoothstep(uR+0.05, uR+0.6, r));
    float edge = smoothstep(uR-0.7, uR, r)*(1.0 - smoothstep(uR, uR+0.45, r));
    float n = texture2D(uNoise, vec2(ang*0.6, r*0.09 - uT*2.0)).r;
    float fade = 1.0 - smoothstep(uDur + 0.01, uDur + 0.29, uT);
    I = (band*0.6*(0.5 + 0.8*n) + edge*1.8)*tail*(1.0 - smoothstep(uSpan - 0.3, uSpan + 0.05, abs(ang)))*fade;
  } else if(uMode < 1.5){
    float tip = uLen*smoothstep(0.0, 0.07, uT);
    float w = uWidth*(1.0 - 0.6*clamp(a/max(uLen, 0.01), 0.0, 1.0));
    float core = exp(-l*l/(w*w)*3.0);
    float inLen = step(0.0, a)*(1.0 - smoothstep(tip - 0.1, tip + 0.35, a));
    float tailF = smoothstep(tip - uLen*0.95, tip, a);
    float fade = 1.0 - smoothstep(uFade*0.32, uFade, uT);
    I = core*inLen*tailF*fade*1.7;
  } else if(uMode < 2.5){
    float r = length(rel);
    float ang = atan(l, a);
    float sweep = mix(-0.95, 0.95, smoothstep(0.0, 1.0, uT/0.1));
    float behind = sweep - ang;
    float tail = smoothstep(-0.14, 0.08, behind)*exp(-max(behind, 0.0)*2.0);
    float band = smoothstep(uR-3.2, uR-0.4, r)*(1.0 - smoothstep(uR, uR+0.9, r));
    float fade = 1.0 - smoothstep(0.1, 0.3, uT);
    float n = texture2D(uNoise, vec2(ang*0.5, r*0.1 - uT*1.5)).r;
    I = band*tail*(1.0 - smoothstep(0.8, 1.05, abs(ang)))*fade*1.25*(0.55 + 0.7*n);
  } else if(uMode < 3.5){
    // Claw: three parallel rakes drawn across the target, one after another
    float hl = uLen*0.5;
    for(int k = 0; k < 3; k++){
      float fk = float(k) - 1.0;
      float tk = uT - 0.035*(fk + 1.0);
      float d = l - fk*0.95 - a*0.07*fk;
      float head = mix(-hl, hl, smoothstep(0.0, 0.09, tk));
      float inLen = step(-hl, a)*(1.0 - smoothstep(head - 0.05, head + 0.3, a));
      float taper = 1.0 - smoothstep(hl*0.5, hl, abs(a));
      float w = 0.13 + 0.13*taper;
      float core = exp(-d*d/(w*w)*2.5);
      float fade = 1.0 - smoothstep(0.16, 0.5, tk);
      I += core*inLen*(0.35 + 0.65*taper)*fade*step(0.0, tk)*1.9;
    }
  } else if(uMode > 5.5){
    // Shield bash: a wave front rolls out ahead of the shield
    float r = length(rel);
    float ang = atan(l, a);
    float R = mix(uR*0.3, uR, smoothstep(0.0, 0.13, uT));
    float span = 1.0 - smoothstep(0.65, 1.05, abs(ang));
    float front = exp(-pow((r - R)/0.5, 2.0));
    float wake = exp(-pow((r - R + 1.1)/1.0, 2.0))*0.35;
    float fade = 1.0 - smoothstep(0.12, 0.34, uT);
    I = (front*1.3 + wake)*span*fade;
  } else {
    // Bite: an upper and a lower jaw, lined with teeth, snap shut on the target
    float close = smoothstep(0.02, 0.15, uT);
    float gap = mix(2.6, 0.0, close*close);
    float span = 1.0 - smoothstep(uR*0.75, uR, abs(a));
    for(int k = 0; k < 2; k++){
      float s = k == 0 ? 1.0 : -1.0;
      float lip = s*(gap + 0.09*a*a);
      float d = l - lip;
      float jaw = exp(-d*d/0.05);
      // Teeth: short triangles pointing at the other jaw, offset between the two jaws
      float ph = a*1.6 + (k == 0 ? 0.0 : 0.5);
      float tri = 1.0 - abs(fract(ph) - 0.5)*2.0;
      float inner = -d*s;
      float tooth = step(0.0, inner)*step(inner, 0.75*tri)*smoothstep(0.0, 0.15, tri);
      I += (jaw*0.8 + tooth*1.1)*span;
    }
    float snap = exp(-pow((uT - 0.15)/0.04, 2.0))*exp(-(a*a + l*l)/2.0)*1.4;
    float fade = 1.0 - smoothstep(0.2, 0.5, uT);
    I = (I + snap)*fade;
  }
  vec3 c = mix(uCore, uTint, 0.55)*I*uGain + uCore*pow(I, 3.0)*uGain*0.6;
  gl_FragColor = vec4(c, 1.0);
}`;

export const ARROW_FS = `
uniform vec3 uCore, uTint;
uniform float uGain;
varying vec2 vUv;
void main(){
  vec2 p = vec2(vUv.x, vUv.y*2.0 - 1.0);
  float shaft = exp(-p.y*p.y*900.0)*smoothstep(0.05, 0.12, p.x)*(1.0 - smoothstep(0.8, 0.83, p.x));
  float headW = (1.0 - smoothstep(0.82, 1.0, p.x))*0.32*step(0.8, p.x);
  float head = (1.0 - smoothstep(headW - 0.05, headW + 0.02, abs(p.y)))*step(0.8, p.x);
  float fl = (1.0 - smoothstep(0.0, 0.2, p.x))*(1.0 - smoothstep(0.05, 0.4, abs(abs(p.y) - (0.25 - p.x))));
  float glow = exp(-p.y*p.y*14.0)*smoothstep(0.0, 0.3, p.x);
  vec3 c = uCore*(shaft*1.6 + head*2.0 + fl*0.6) + uTint*glow*0.9;
  gl_FragColor = vec4(c*uGain, 1.0);
}`;

export const VIAL_FS = `
uniform vec3 uLiquid;
uniform float uGain;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0 - 1.0;
  float rb = length(p - vec2(0.0, -0.15));
  float body = 1.0 - smoothstep(0.5, 0.56, rb);
  float neck = (1.0 - smoothstep(0.15, 0.2, abs(p.x)))*step(0.3, p.y)*(1.0 - step(0.82, p.y));
  float glass = max(body, neck);
  float rim = body*smoothstep(0.42, 0.52, rb);
  float liquid = (1.0 - smoothstep(0.4, 0.46, rb))*smoothstep(0.1, -0.05, p.y);
  float halo = exp(-dot(p, p)*2.2)*0.45;
  vec3 c = vec3(0.7, 0.75, 0.8)*glass*0.3 + vec3(1.0)*rim*0.35 + uLiquid*(liquid*1.8 + halo);
  gl_FragColor = vec4(c*uGain, 1.0);
}`;

export const STRIKE_RING_FS = `
uniform vec2 uC;
uniform float uR, uW, uA, uDarkR;
uniform vec3 uCol;
varying vec2 vW;
void main(){
  float d = abs(length(vW - uC) - uR);
  float ring = exp(-d*d/(uW*uW));
  if(uDarkR > 0.5) gl_FragColor = vec4(uCol, clamp(ring*uA, 0.0, 1.0));
  else gl_FragColor = vec4(uCol*ring*uA, 1.0);
}`;

export const SIGIL_FS = `
uniform sampler2D uNoise;
uniform float uStyle, uReveal, uAlpha, uClock, uSpin;
uniform vec3 uCore, uGlow;
varying vec2 vUv;
#define PI 3.14159265
float ring(float r, float R, float w){ float d = (r-R)/w; return exp(-d*d); }
float line(float d, float w){ return exp(-(d*d)/(w*w)); }
vec2 rot(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x-s*p.y, s*p.x+c*p.y); }
float sdTri(vec2 p, float r){
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r; p.y = p.y + r/k;
  if(p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y)/2.0;
  p.x -= clamp(p.x, -2.0*r, 0.0);
  return -length(p)*sign(p.y);
}
float hash(float n){ return fract(sin(n)*43758.5453); }
void main(){
  vec2 p = (vUv*2.0 - 1.0)*1.12;
  float r = length(p);
  float a = atan(p.y, p.x);
  float sweep = fract((a + PI)/(2.0*PI) + 0.25);
  float drawn = 1.0 - smoothstep(uReveal*1.05 - 0.05, uReveal*1.05, 1.0 - sweep);
  drawn = uReveal >= 1.0 ? 1.0 : drawn;
  float lines = 0.0, fill = 0.0;
  float t = uClock*uSpin;
  if(uStyle < 0.5){
    // Arcane: three rings, tick marks, counter-rotating hexagram, a band of glyph dashes.
    lines += ring(r, 1.0, 0.012)*1.2 + ring(r, 0.9, 0.008) + ring(r, 0.5, 0.008);
    float ta = a + t*0.35;
    float tick = step(fract(ta*36.0/(2.0*PI)), 0.18)*smoothstep(0.9, 0.92, r)*(1.0 - smoothstep(0.97, 0.99, r));
    lines += tick*0.9;
    vec2 q = rot(p, -t*0.5);
    lines += line(sdTri(q, 0.42), 0.012) + line(sdTri(rot(q, PI), 0.42), 0.012);
    float ga = a - t*0.25;
    float cell = floor(ga*28.0/(2.0*PI));
    float glyph = step(0.35, hash(cell))*smoothstep(0.66, 0.68, r)*(1.0 - smoothstep(0.78, 0.8, r));
    glyph *= step(0.15, fract(ga*28.0/(2.0*PI)))*step(fract(ga*28.0/(2.0*PI)), 0.85);
    glyph *= 0.5 + 0.5*step(0.5, fract(r*24.0 + hash(cell + 3.0)));
    lines += glyph*0.75;
    fill = exp(-r*r*2.5)*0.25;
  } else if(uStyle < 1.5){
    // Divine: soft halo, sunburst rays, inner ring with eight points.
    lines += ring(r, 0.86, 0.035)*0.9 + ring(r, 0.42, 0.01);
    float rays = pow(abs(cos(a*8.0 + t*0.2)), 28.0) + 0.6*pow(abs(cos(a*8.0 + PI/16.0 - t*0.15)), 60.0);
    lines += rays*smoothstep(0.45, 0.6, r)*(1.0 - smoothstep(0.95, 1.15, r))*0.9;
    float pts = pow(abs(cos(a*4.0)), 120.0)*ring(r, 0.42, 0.06);
    lines += pts*1.6;
    fill = exp(-r*r*4.0)*0.55 + ring(r, 0.86, 0.18)*0.18;
  } else if(uStyle < 2.5){
    // Occult: twin thin rings, six moon phases, a spiral and an eye.
    lines += ring(r, 0.98, 0.008) + ring(r, 0.92, 0.008);
    for(int k = 0; k < 6; k++){
      float ang = float(k)/6.0*2.0*PI + t*0.12;
      vec2 c = vec2(cos(ang), sin(ang))*0.76;
      float d1 = length(p - c), d2 = length(p - c - vec2(cos(ang), sin(ang))*(0.03*float(k) - 0.075));
      float moon = smoothstep(0.075, 0.068, d1)*(1.0 - smoothstep(0.075, 0.068, d2));
      lines += moon*0.9 + ring(d1, 0.075, 0.006)*0.5;
    }
    float sp = fract(r*3.0 - (a + t*0.3)/(2.0*PI));
    lines += line(sp - 0.5, 0.03)*smoothstep(0.12, 0.2, r)*(1.0 - smoothstep(0.55, 0.62, r))*0.5;
    vec2 e = rot(p, -t*0.05);
    float lid = max(length(e - vec2(0.0, 0.16)) - 0.27, length(e + vec2(0.0, 0.16)) - 0.27);
    lines += line(lid, 0.01)*1.2;
    lines += smoothstep(0.065, 0.055, length(e))*1.4;
    fill = exp(-r*r*3.0)*0.3;
  } else {
    // Primal: wobbling living ring, a crown of leaves, a vine.
    float n = texture2D(uNoise, vec2(a*0.25, t*0.05)).r - 0.5;
    lines += ring(r, 0.95 + n*0.04, 0.014) + ring(r, 0.62 + 0.035*sin(a*7.0 + t*0.6), 0.012);
    for(int k = 0; k < 12; k++){
      float ang = float(k)/12.0*2.0*PI + t*0.1;
      vec2 c = vec2(cos(ang), sin(ang))*0.79;
      vec2 lp = rot(p - c, -ang);
      float leaf = length(vec2(lp.x/0.11, lp.y/0.045));
      lines += smoothstep(1.0, 0.85, leaf)*0.7 + line(lp.y, 0.006)*step(abs(lp.x), 0.1)*0.6;
    }
    float vine = line(r - 0.3 - 0.06*sin(a*5.0 - t*0.4), 0.012);
    lines += vine*0.8;
    fill = exp(-r*r*3.0)*0.3;
  }
  float edge = 1.0 - smoothstep(1.02, 1.12, r);
  vec3 col = (uCore*lines*1.35 + uGlow*(lines*0.8 + fill))*drawn*edge;
  gl_FragColor = vec4(col*uAlpha, 1.0);
}`;

export const MOTE_VS = `
attribute vec4 aSeed;
uniform float uT, uMode, uR, uTravel, uLife, uSize, uArc, uClock;
uniform vec2 uA, uB;
varying vec2 vUv; varying float vF; varying vec4 vS;
#define PI 3.14159265
void main(){
  float birth = aSeed.x*mix(0.9, 0.35, step(1.5, uMode)*step(uMode, 2.5));
  float life = uLife*(0.6 + 0.6*aSeed.y);
  float age = uT - birth;
  float f = age/life;
  vUv = uv; vF = f; vS = aSeed;
  if(f < 0.0 || f > 1.0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 p;
  float ang0 = aSeed.z*2.0*PI;
  if(uMode < 0.5){
    float rr = uR*(0.55 + 0.6*aSeed.w) + f*0.6;
    float ang = ang0 + f*1.6*(aSeed.y > 0.5 ? 1.0 : -1.0);
    p = uB + vec2(cos(ang), sin(ang))*rr + vec2(0.0, f*3.2);
  } else if(uMode < 1.5){
    float e = pow(f, 1.6);
    float rr = uR*2.4*(0.7 + 0.5*aSeed.w)*(1.0 - e) + 0.2;
    float ang = ang0 + e*3.5;
    p = uB + vec2(cos(ang), sin(ang))*rr;
  } else if(uMode < 2.5){
    float s = clamp((uT - aSeed.x*0.35)/max(uTravel, 0.01), 0.0, 1.0);
    vec2 d = uB - uA; vec2 n = normalize(vec2(-d.y, d.x) + 1e-5);
    float braid = sin(s*12.0 + aSeed.z*6.28 + uClock*4.0)*0.45*(aSeed.w > 0.5 ? 1.0 : -1.0);
    p = mix(uA, uB, s) + n*(sin(s*PI)*uArc + braid*sin(s*PI)) + vec2(aSeed.y - 0.5, aSeed.w - 0.5)*0.5*f;
  } else {
    float k = 4.0;
    float dist = uR*(1.2 + 1.6*aSeed.w)*(1.0 - exp(-k*age))/(1.0 - exp(-k*life));
    p = uB + vec2(cos(ang0), sin(ang0))*dist;
  }
  float tw = 0.75 + 0.25*sin(uClock*(8.0 + 10.0*aSeed.y) + aSeed.z*40.0);
  float sz = uSize*(0.6 + 0.8*aSeed.w)*tw;
  gl_Position = projectionMatrix*viewMatrix*vec4(p + position.xy*sz, 0.0, 1.0);
}`;

export const MOTE_FS = `
uniform vec3 uCore, uGlow;
uniform float uGain;
varying vec2 vUv; varying float vF; varying vec4 vS;
void main(){
  vec2 p = vUv*2.0 - 1.0;
  float r2 = dot(p, p);
  float core = exp(-r2*14.0), halo = exp(-r2*3.5);
  float star = (exp(-abs(p.x)*9.0)*exp(-p.y*p.y*60.0) + exp(-abs(p.y)*9.0)*exp(-p.x*p.x*60.0))*step(0.7, vS.y);
  float fade = smoothstep(0.0, 0.12, vF)*(1.0 - smoothstep(0.6, 1.0, vF));
  vec3 c = uCore*(core*1.8 + star) + uGlow*halo*0.7;
  gl_FragColor = vec4(c*fade*uGain*(1.0 - smoothstep(0.75, 1.0, sqrt(r2))), 1.0);
}`;

export const AURA_FS = `
uniform sampler2D uNoise;
uniform float uStyle, uLife, uClock, uDisc, uSeed;
uniform vec3 uTint;
varying vec2 vUv;
#define PI 3.14159265
float hash(float n){ return fract(sin(n)*43758.5453); }
float ring(float r, float R, float w){ float d = (r - R)/w; return exp(-d*d); }
void main(){
  vec2 p = vUv*2.0 - 1.0;
  float r = length(p), a = atan(p.y, p.x);
  float t = uClock + uSeed*13.0;
  float D = uDisc;
  vec3 add = vec3(0.0); float dark = 0.0; vec3 darkCol = vec3(0.0);
  if(uStyle < 0.5){
    // Blessed: soft halo, slow dashed ring, motes drifting up
    add += uTint*(ring(r, D*1.08, 0.05)*0.55 + exp(-pow(max(r - D, 0.0)/0.12, 2.0))*0.25*step(D*0.9, r));
    add += uTint*ring(r, D*1.32, 0.012)*step(fract((a + t*0.35)*10.0/(2.0*PI)), 0.55)*0.9;
    for(int i = 0; i < 10; i++){
      float h = hash(float(i) + uSeed*7.0);
      float ang = h*2.0*PI + t*0.15;
      float life = fract(t*0.28 + h*3.7);
      vec2 c = vec2(cos(ang), sin(ang))*D*(1.05 + 0.25*hash(float(i)*3.1)) + vec2(0.0, life*0.55);
      float m = exp(-dot(p - c, p - c)/0.00045)*sin(life*PI);
      add += mix(uTint, vec3(1.0), 0.5)*m*1.6;
    }
  } else if(uStyle < 1.5 || (uStyle > 3.5 && uStyle < 4.5)){
    // Hexed / frightened: smoky wisps clinging to the rim, glowing at their edges
    float n = texture2D(uNoise, vec2(a*0.32 + t*0.03, r*1.4 - t*0.12)).r*0.65 + texture2D(uNoise, vec2(a*0.9 - t*0.05, r*3.0)).g*0.35;
    float inner = uStyle > 3.5 ? D*0.55 : D*0.9;
    float band = smoothstep(inner, D*1.05, r)*(1.0 - smoothstep(D*1.2, D*1.65, r));
    float w = smoothstep(0.42, 0.7, n)*band;
    dark = w*0.75; darkCol = uTint*0.08;
    add += uTint*smoothstep(0.38, 0.44, n)*(1.0 - smoothstep(0.44, 0.52, n))*band*(uStyle > 3.5 ? 0.7 : 1.1);
    if(uStyle > 3.5) add += uTint*ring(r, D*1.02, 0.02)*(0.5 + 0.5*sin(t*6.0))*0.6;
  } else if(uStyle < 2.5){
    // Quickened: gold ring with speed streaks racing around
    add += uTint*ring(r, D*1.18, 0.012)*0.5;
    float s1 = pow(fract(a/(2.0*PI)*3.0 - t*1.4), 7.0);
    float s2 = pow(fract(a/(2.0*PI)*2.0 + 0.33 - t*1.1), 9.0);
    add += uTint*(ring(r, D*1.18, 0.03)*s1*2.2 + ring(r, D*1.32, 0.02)*s2*1.6);
  } else if(uStyle < 3.5){
    // Slowed: clock face with twelve ticks and one slow hand
    add += uTint*ring(r, D*1.25, 0.01)*0.7;
    float tick = pow(abs(cos(a*6.0)), 80.0)*smoothstep(D*1.12, D*1.16, r)*(1.0 - smoothstep(D*1.22, D*1.25, r));
    add += uTint*tick*0.9;
    float hand = a - mod(t*0.25, 2.0*PI) + PI;
    hand = mod(hand + PI, 2.0*PI) - PI;
    add += uTint*exp(-hand*hand*60.0)*ring(r, D*1.25, 0.04)*2.0;
    dark = ring(r, D*1.18, 0.12)*0.25; darkCol = vec3(0.02, 0.03, 0.06);
  } else if(uStyle < 5.5){
    // Sickened: queasy green haze drifting off the token
    float n = texture2D(uNoise, p*0.55 + vec2(uSeed, -t*0.06)).r;
    float haze = smoothstep(0.48, 0.78, n)*smoothstep(D*1.7, D*0.7, r);
    dark = haze*0.35; darkCol = uTint*0.25;
    add += uTint*haze*0.25;
  } else if(uStyle < 6.5){
    // Burning: flames licking outward and up from the rim
    float n = texture2D(uNoise, vec2(a*0.5 + uSeed, r*1.6 - t*0.9)).r*0.6 + texture2D(uNoise, vec2(a*1.3, r*3.0 - t*1.6)).g*0.4;
    float up = max(p.y, 0.0)*0.8;
    float top = D*(1.15 + 0.75*n) + up*n;
    float f = smoothstep(D*0.9, D*1.0, r)*(1.0 - smoothstep(top - 0.06, top, r));
    float heat = 1.0 - clamp((r - D)/(top - D + 0.001), 0.0, 1.0);
    vec3 fire = mix(vec3(0.9, 0.15, 0.02), vec3(1.0, 0.85, 0.4), heat*heat);
    add += fire*f*(0.6 + 1.2*heat)*smoothstep(0.25, 0.55, n);
  } else if(uStyle < 7.5){
    // Bleeding: drops sliding off the lower rim
    for(int i = 0; i < 6; i++){
      float h = hash(float(i)*5.3 + uSeed*3.0);
      float x = (h - 0.5)*D*1.4;
      float life = fract(t*0.45 + h*2.3);
      float y0 = -sqrt(max(D*D - x*x, 0.0)) + 0.02;
      vec2 c = vec2(x, y0 - life*0.45);
      vec2 q = (p - c)/vec2(0.022, 0.034);
      float drop = smoothstep(1.0, 0.7, length(q))*(1.0 - life*0.6);
      dark = max(dark, drop*0.9);
    }
    darkCol = uTint;
    dark = max(dark, ring(r, D*0.98, 0.025)*0.35);
  } else if(uStyle < 8.5){
    // Shielded: force bubble with a hex lattice and a passing shimmer
    float R = D*1.28;
    float shell = smoothstep(R*0.55, R, r)*(1.0 - smoothstep(R, R + 0.015, r));
    vec2 g = p*16.0;
    vec2 h1 = vec2(1.0, 1.7320508);
    vec2 ga = mod(g, h1) - h1*0.5, gb = mod(g - h1*0.5, h1) - h1*0.5;
    vec2 gc = dot(ga, ga) < dot(gb, gb) ? ga : gb;
    float hexEdge = smoothstep(0.42, 0.5, max(abs(gc.x)*0.866 + abs(gc.y)*0.5, abs(gc.y)));
    float sweep = exp(-pow(fract(p.x*0.35 + p.y*0.35 - t*0.25) - 0.5, 2.0)*80.0);
    add += uTint*shell*(0.35 + hexEdge*0.8 + sweep*1.2);
    add += uTint*ring(r, R, 0.012)*1.2;
  } else if(uStyle > 9.5){
    // Lit (the Light spell): a warm pool of lantern light on the floor and a small flame bobbing beside the token
    float flick = 0.88 + 0.08*sin(t*7.3) + 0.05*sin(t*13.1 + 1.7) + 0.04*texture2D(uNoise, vec2(t*0.11, uSeed)).r;
    add += uTint*smoothstep(1.0, D*0.95, r)*0.32*flick;
    add += uTint*exp(-pow(max(r - D, 0.0)/0.07, 2.0))*0.22*step(D*0.95, r)*flick;
    float oa = t*0.45 + uSeed*6.0;
    vec2 oc = vec2(cos(oa), sin(oa))*D*1.22 + vec2(0.0, 0.04*sin(t*1.9));
    float od = length(p - oc);
    add += mix(uTint, vec3(1.0), 0.6)*exp(-od*od/0.0009)*2.2*flick + uTint*exp(-od*od/0.012)*0.55*flick;
    for(int i = 0; i < 5; i++){
      float h = hash(float(i)*2.7 + uSeed*5.0);
      float life = fract(t*0.5 + h);
      vec2 c = oc + vec2((h - 0.5)*0.08, life*0.12);
      add += uTint*exp(-dot(p - c, p - c)/0.00012)*sin(life*PI)*0.9;
    }
  } else {
    // Invisible: a faint heat-shimmer outline
    float n = texture2D(uNoise, vec2(a*0.6, t*0.2)).r;
    add += uTint*ring(r, D*(1.0 + 0.04*(n - 0.5)), 0.018)*0.45;
  }
  float L = uLife;
  gl_FragColor = vec4(add*L + darkCol*dark*L, dark*L);
}`;

export const WORLD_VS = `
varying vec2 vW; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xy; gl_Position = projectionMatrix*viewMatrix*w; }`;

export const GLOW_RING_FS = `
uniform vec2 uC;
uniform float uR, uW, uA, uDarkR, uSeg, uClock;
uniform vec3 uCol;
varying vec2 vW;
void main(){
  vec2 rel = vW - uC;
  float d = abs(length(rel) - uR);
  float ring = exp(-d*d/(uW*uW));
  if(uSeg > 0.5){
    // Broken ring: links of a shackle, rotating.
    float a = atan(rel.y, rel.x) + uClock*0.8;
    ring *= step(0.3, fract(a*uSeg/6.28318));
  }
  if(uDarkR > 0.5) gl_FragColor = vec4(uCol, clamp(ring*uA, 0.0, 1.0));
  else gl_FragColor = vec4(uCol*ring*uA, 1.0);
}`;


/** Thrown weapon: a steel blade silhouette that spins on its way. */
export const BLADE_FS = `
uniform vec3 uCore, uTint;
uniform float uGain;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0 - 1.0;
  float hw = 0.13*(1.0 - abs(p.x));
  float blade = (1.0 - smoothstep(hw - 0.03, hw + 0.02, abs(p.y)))*step(abs(p.x), 0.98);
  float guard = (1.0 - smoothstep(0.03, 0.06, abs(p.x + 0.45)))*(1.0 - smoothstep(0.22, 0.26, abs(p.y)));
  float glint = exp(-p.y*p.y*400.0)*(1.0 - abs(p.x));
  float halo = exp(-dot(p, p)*2.5)*0.3;
  vec3 c = uCore*(blade*0.75 + guard*0.6 + glint*1.3) + uTint*halo;
  gl_FragColor = vec4(c*uGain, 1.0);
}`;

/** Sling stone: a small shaded pebble (premultiplied, it is dark). */
export const STONE_FS = `
uniform float uGain;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0 - 1.0;
  float r = length(p*vec2(1.0, 1.15));
  float body = 1.0 - smoothstep(0.42, 0.5, r);
  float z = sqrt(max(0.0, 0.25 - r*r))*2.0;
  float lit = clamp(dot(normalize(vec3(p, z + 0.01)), normalize(vec3(-0.5, 0.6, 0.65))), 0.0, 1.0);
  vec3 col = vec3(0.32, 0.29, 0.25)*(0.35 + 0.9*lit);
  gl_FragColor = vec4(col*body, body*uGain);
}`;

/* ---------------- Walls: a breaking (or rebuilding) wall ----------------
 * One instanced quad per chunk or dust puff. Chunks fly out from the wall line, tumbling, and land as rubble
 * (mostly on the far side from the blast); dust rolls out and settles. uRev = 1 plays it backwards: the rubble rises
 * and flies back into the wall. */
export const WALL_VS = `
attribute vec4 aSeed;
attribute float aBirth;
attribute float aLife;
uniform vec2 uA, uB;
uniform float uT, uSide, uMode, uRev, uSize, uFade;
varying vec2 vUv; varying vec4 vSeed; varying float vAlpha; varying float vHop; varying float vT;
vec2 rot2(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
void main(){
  vec2 e = uB - uA; float L = max(length(e), 0.01); vec2 t = e/L; vec2 n = vec2(-t.y, t.x);
  float u = aSeed.x;
  vec2 base = uA + e*u;
  float side = uSide == 0.0 ? (aSeed.y < 0.5 ? -1.0 : 1.0) : (aSeed.y < 0.85 ? uSide : -uSide);
  float dust = step(0.5, uMode);
  // Mostly fist-sized chunks, some bigger blocks that stay near the wall, a spray of grit that flies far
  float slab = step(0.88, fract(aSeed.y*13.7 + aSeed.w*5.3))*(1.0 - dust);
  float grit = step(aSeed.w, 0.35)*(1.0 - slab)*(1.0 - dust);
  float reach = mix(0.4 + 5.0*pow(aSeed.z, 1.5), 0.8 + 3.6*aSeed.z, dust)*(1.0 - slab*0.6)*(1.0 + grit*0.7);
  // Thrown out at a spread of angles, not straight across
  vec2 dir = normalize(n*side + t*(aSeed.w - 0.5)*mix(1.1, 0.9, dust));
  vec2 rest = base + dir*reach;
  // The break runs out from the middle of the wall
  float delay = abs(u - 0.5)*0.18 + aBirth*0.06;
  float flight = mix(0.55 + 0.45*aLife, 1.7 + 0.9*aLife, dust)*(1.0 + slab*0.25);
  float k = clamp((uT - delay)/flight, 0.0, 1.0);
  if(uRev > 0.5) k = 1.0 - clamp((uT - (0.25 - delay*0.6))/flight, 0.0, 1.0);
  // Quick burst that slows as the piece skids to a stop
  float ease = 1.0 - pow(1.0 - k, mix(2.6, 2.0, dust));
  vec2 p = mix(base + n*side*0.15, rest, ease);
  // One arc through the air, then a small bounce
  float hop = (k < 0.62 ? sin(3.14159*k/0.62) : 0.28*sin(3.14159*clamp((k - 0.62)/0.24, 0.0, 1.0)))*(1.0 - dust)*(0.55 + 0.9*aSeed.w)*(1.0 - slab*0.5);
  // Pieces tumble while flying and lie still once landed
  float spin = aSeed.z*6.2831 + (1.0 - ease)*(aSeed.x - 0.5)*16.0*(1.0 - slab*0.6);
  float size = mix(uSize*(0.2 + 0.55*aSeed.w*aSeed.w + slab*(0.8 + 0.7*aSeed.z))*(1.0 - grit*0.55)*(1.0 + hop*0.6),
                   uSize*(1.2 + 3.4*ease)*(0.6 + 0.8*aSeed.w), dust);
  vUv = uv; vSeed = aSeed; vHop = hop; vT = k;
  float started = step(delay, uT);
  if(uRev > 0.5) started = 1.0;
  vAlpha = started*uFade*mix(1.0, (1.0 - k)*smoothstep(0.0, 0.12, k), dust);
  if(uRev > 0.5) vAlpha *= smoothstep(0.0, 0.25, uT)*mix(step(0.02, k), 1.0, dust);
  vec2 world = p + rot2(position.xy*size, spin);
  gl_Position = projectionMatrix*viewMatrix*vec4(world, 0.0, 1.0);
}`;

export const WALL_FS = `
uniform sampler2D uNoise;
uniform float uMode, uWood, uHot, uGlass;
uniform vec3 uPalA, uPalB, uDust, uHotCol;
varying vec2 vUv; varying vec4 vSeed; varying float vAlpha; varying float vHop; varying float vT;
float h1(float x){ return fract(sin(x*12.9898 + vSeed.y*78.233 + vSeed.z*37.719)*43758.5453); }
vec2 vert(float i, float sides){
  float a = (i + 0.38*(h1(i) - 0.5))/sides*6.28318;
  float r = 0.6 + 0.36*h1(i + 17.0);
  return vec2(cos(a), sin(a))*r;
}
float polyD(vec2 q, float sides, out vec2 nb){
  float d = -10.0; nb = vec2(0.0, 1.0);
  for(int i = 0; i < 8; i++){
    float fi = float(i);
    if(fi >= sides) break;
    vec2 v0 = vert(fi, sides), v1 = vert(mod(fi + 1.0, sides), sides);
    vec2 ed = v1 - v0;
    vec2 nn = normalize(vec2(ed.y, -ed.x));
    float sd = dot(q - v0, nn);
    if(sd > d){ d = sd; nb = nn; }
  }
  return d;
}
void main(){
  vec2 p = vUv*2.0 - 1.0;
  if(uMode > 0.5){
    // Dust: a billowing cloud with a ragged edge, darker in its folds
    float n = texture2D(uNoise, vUv*0.55 + vSeed.xy*5.0).r;
    float n2 = texture2D(uNoise, vUv*1.3 + vSeed.zw*3.0).r;
    float r = length(p) + (n - 0.5)*0.55;
    float m = 1.0 - smoothstep(0.35, 0.95, r);
    float a = clamp(m*vAlpha*(0.22 + 0.25*n2), 0.0, 1.0);
    gl_FragColor = vec4(uDust*(0.75 + 0.35*n2)*a, a);
    return;
  }
  vec2 q = p;
  float body, bevel, facet;
  if(uWood > 0.5){
    // Planks and splinters: long boards with torn, uneven ends
    float tear = 0.78 + 0.18*fract(sin(floor(p.y*6.0 + vSeed.z*20.0)*12.9898 + vSeed.y*78.2)*43758.5);
    float bx = abs(p.x)/tear, by = abs(p.y)/0.26;
    float d = max(bx, by);
    body = 1.0 - smoothstep(0.92, 1.0, d);
    bevel = smoothstep(0.7, 0.98, by);
    facet = p.y > 0.0 ? 1.0 : 0.25;
    q = vec2(p.x, p.y*2.6);
  } else {
    // A broken block: a flat-sided polygon with bevelled faces, not a rounded blob
    q.x *= 1.0 + 0.45*vSeed.z;
    float sides = uGlass > 0.5 ? 3.0 : 5.0 + floor(vSeed.w*3.0);
    vec2 nb;
    float d = polyD(q, sides, nb);
    body = 1.0 - smoothstep(-0.03, 0.02, d);
    bevel = smoothstep(-0.24, -0.02, d);
    // The bevel facing the light (top left) is bright, the far ones dark
    facet = 0.5 + 0.5*dot(nb, normalize(vec2(-0.55, 0.85)));
  }
  float grain = texture2D(uNoise, vUv*1.9 + vSeed.zw*3.0).r;
  float tone = mix(0.42 + 0.14*vSeed.y, facet, bevel*0.85) + (grain - 0.5)*0.35;
  vec3 col = mix(uPalA, uPalB, clamp(tone, 0.0, 1.0));
  // A soft contact shadow, longer while the piece is in the air
  vec2 sp = q - vec2(0.16, -0.22)*(0.3 + vHop*1.1);
  float shadow;
  if(uWood > 0.5) shadow = (1.0 - smoothstep(0.45, 0.95, length(sp)))*(1.0 - body)*0.45;
  else { vec2 nd; float sides2 = uGlass > 0.5 ? 3.0 : 5.0 + floor(vSeed.w*3.0); shadow = (1.0 - smoothstep(-0.05, 0.12, polyD(sp, sides2, nd)))*(1.0 - body)*0.55; }
  float a = clamp((body + shadow)*vAlpha, 0.0, 1.0);
  // What broke it shows on some pieces: glowing or tinted edges that cool as they land
  float marked = step(0.5, fract(vSeed.y*7.13 + vSeed.x*3.1));
  vec3 hot = uHotCol*uHot*bevel*body*marked*(0.5 + 0.7*grain)*(1.0 - smoothstep(0.1, 0.6, vT))*0.5;
  // Glass: see-through shards that catch the light as they turn
  float glint = uGlass*pow(max(0.0, sin(vSeed.x*40.0 + vT*26.0 + q.x*3.0)), 14.0)*body;
  float see = mix(1.0, 0.55, uGlass);
  vec3 c = col*body + hot + vec3(1.0)*glint*1.6;
  gl_FragColor = vec4(c*vAlpha, a*see);
}`;

/** The wall line itself: jagged cracks that flash before it breaks, or a soft seam of light as it closes again. */
export const SEAM_FS = `
uniform sampler2D uNoise;
uniform float uT, uRev, uLen;
uniform vec3 uCol;
varying vec2 vUv;
void main(){
  vec2 p = vec2(vUv.x, vUv.y*2.0 - 1.0);
  float n = texture2D(uNoise, vec2(p.x*uLen*0.08, 0.31)).r - 0.5;
  float d = abs(p.y - n*0.55);
  float crack = exp(-d*d*260.0);
  float branch = exp(-pow(abs(p.y + (fract(p.x*uLen*0.35) - 0.5)*0.9) , 2.0)*90.0)*step(0.7, texture2D(uNoise, vec2(p.x*uLen*0.21, 0.7)).r);
  float ends = smoothstep(0.0, 0.04, p.x)*smoothstep(1.0, 0.96, p.x);
  float I = uRev > 0.5 ? exp(-pow((uT - 1.05)/0.18, 2.0))*(exp(-p.y*p.y*30.0)*0.8 + crack*0.6)
                       : (1.0 - smoothstep(0.05, 0.22, uT))*smoothstep(0.0, 0.04, uT)*(crack*1.6 + branch*0.9);
  gl_FragColor = vec4(uCol*I*ends, 1.0);
}`;
