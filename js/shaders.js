'use strict';
/* GLSLシェーダー。惑星の地表は画像を使わず、ノイズから毎フレーム描いている。 */

// 3D simplex noise — Ian McEwan, Ashima Arts (MIT License)
const GLSL_NOISE = `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

const PLANET_VS = `
varying vec3 vPos;
varying vec3 vN;
varying vec3 vW;
void main(){
  vPos = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const PLANET_FS = GLSL_NOISE + `
uniform float uTime, uLava, uGrid, uCircuit, uCity, uMetal, uAtmoK, uIri, uFlash;
uniform vec3 uSunDir, uColA, uColB, uColC, uLavaCol, uGridCol, uCircCol, uCityCol, uAtmo, uSeed;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vW;

// 立方体に投影したUV（極でつぶれないパネル模様用）
vec2 cubeUV(vec3 p, out float fid){
  vec3 a = abs(p);
  if (a.x >= a.y && a.x >= a.z) { fid = p.x > 0.0 ? 1.0 : 2.0; return p.yz / a.x; }
  if (a.y >= a.z) { fid = p.y > 0.0 ? 3.0 : 4.0; return p.xz / a.y; }
  fid = p.z > 0.0 ? 5.0 : 6.0; return p.xy / a.z;
}
float gridAA(vec2 uv, float n, float w){
  vec2 g = uv * n;
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 q = abs(fract(g - 0.5) - 0.5) / (fw * w);
  return 1.0 - clamp(min(q.x, q.y), 0.0, 1.0);
}

void main(){
  vec3 p = normalize(vPos);
  vec3 sp = p * 1.7 + uSeed;
  float n1 = snoise(sp);
  float n2 = snoise(sp * 2.03 + 7.1);
  float n3 = snoise(sp * 4.1 + 3.3);
  float n4 = snoise(sp * 8.3 + 1.7);
  float h = n1 * 0.55 + n2 * 0.27 + n3 * 0.12 + n4 * 0.06;
  float h01 = clamp(h * 0.62 + 0.5, 0.0, 1.0);

  vec3 base = mix(uColA, uColB, smoothstep(0.28, 0.52, h01));
  base = mix(base, uColC, smoothstep(0.56, 0.8, h01));
  base *= 0.82 + 0.36 * (n4 * 0.5 + 0.5);

  // 工業化: 鉄板のパネル
  float fid;
  vec2 uv = cubeUV(p, fid);
  vec2 cid = floor(uv * 10.0);
  float c1 = hash13(vec3(cid, fid));
  float c2 = hash13(vec3(cid * 1.7 + 3.1, fid + 9.0));
  float cover = c1 * 0.6 + h01 * 0.4;
  float plate = uGrid > 0.001 ? smoothstep(1.0 - uGrid - 0.04, 1.0 - uGrid + 0.04, cover) : 0.0;
  float gF = gridAA(uv, 40.0, 1.0);
  float gC = gridAA(uv, 10.0, 1.6);
  vec3 plateCol = mix(uColB, uColC, 0.25 + 0.55 * c2);
  plateCol *= 1.0 - 0.35 * gF;
  plateCol = mix(plateCol, uGridCol, gC * 0.7);
  base = mix(base, plateCol, plate);

  // 光
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L);
  float diff = smoothstep(-0.12, 1.0, ndl);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 36.0) * uMetal * (0.35 + 0.65 * plate) * step(0.0, ndl);
  vec3 col = base * (0.05 + 1.05 * diff) + vec3(1.0, 0.96, 0.88) * spec * 0.6;
  float night = 1.0 - smoothstep(-0.25, 0.2, ndl);

  vec3 em = vec3(0.0);
  // 溶岩の割れ目
  float r = 1.0 - abs(snoise(sp * 2.6 + 11.0));
  float crack = smoothstep(0.9, 0.985, r) * uLava * (1.0 - plate * 0.7);
  em += uLavaCol * crack * (0.75 + 0.25 * sin(uTime * 1.7 + n2 * 9.0)) * (0.6 + 0.6 * night);
  // 回路
  float c = 1.0 - abs(snoise(sp * 5.0 + 23.0));
  float circ = smoothstep(0.955, 0.992, c) * uCircuit;
  float pulse = 0.55 + 0.45 * sin(uTime * 2.6 - (p.y * 14.0 + n1 * 6.0));
  em += uCircCol * circ * pulse * (0.5 + 0.7 * night);
  float run = pow(0.5 + 0.5 * sin(uTime * 2.0 + (uv.x + uv.y) * 20.0 + c1 * 6.28), 4.0);
  em += uCircCol * gC * plate * uCircuit * (0.12 + 0.5 * run) * (0.4 + 0.6 * night);
  // 街の灯り
  float cityN = 40.0;
  vec2 cc = floor(uv * cityN);
  vec2 cf = fract(uv * cityN) - 0.5;
  float ch = hash13(vec3(cc, fid * 7.0));
  vec2 jit = vec2(hash13(vec3(cc, fid + 1.0)), hash13(vec3(cc, fid + 2.0))) - 0.5;
  float lit = step(ch, uCity * (0.35 + 0.65 * smoothstep(0.2, 0.7, h01 + 0.2)));
  float dotL = smoothstep(0.32, 0.0, length(cf + jit * 0.4));
  float flick = 0.8 + 0.2 * sin(uTime * (2.0 + ch * 5.0) + ch * 40.0);
  em += uCityCol * lit * dotL * flick * (0.15 + 0.95 * night) * 1.2;

  // 大気のふち
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uAtmo * fres * uAtmoK * (0.2 + 0.8 * clamp(ndl + 0.35, 0.0, 1.0));
  // 虹色（神の星・創世の星）
  vec3 ir = hue(fract(h01 * 1.5 + fres * 0.8 + uTime * 0.03));
  col = mix(col, col * 0.6 + ir * (0.25 + 0.5 * diff), uIri * 0.7);
  em += ir * uIri * 0.12 * night;

  gl_FragColor = vec4(col + em + uFlash, 1.0);
}
`;

const ATMO_VS = `
varying vec3 vN;
varying vec3 vVP;
varying vec3 vWN;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vVP = mv.xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mv;
}
`;
const ATMO_FS = `
uniform vec3 uColor;
uniform float uK;
uniform vec3 uSunDir;
varying vec3 vN;
varying vec3 vVP;
varying vec3 vWN;
void main(){
  float d = clamp(dot(normalize(vN), normalize(vVP)), 0.0, 1.0);
  float a = pow(smoothstep(0.0, 0.62, d), 1.8);
  float sun = 0.25 + 0.75 * smoothstep(-0.6, 0.5, dot(normalize(vWN), uSunDir));
  gl_FragColor = vec4(uColor * a * sun * uK, 1.0);
}
`;

const RING_VS = `
varying vec3 vLocal;
varying vec3 vW;
void main(){
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const RING_FS = `
uniform vec3 uColor, uColor2, uSunDir;
uniform float uOpacity, uInner, uOuter, uPlanetR, uTime;
varying vec3 vLocal;
varying vec3 vW;
void main(){
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  float bands = 0.55 + 0.45 * sin(t * 70.0) * sin(t * 23.0 + 1.3);
  float gaps = smoothstep(0.0, 0.03, abs(t - 0.62) - 0.02);
  float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.85, t);
  float a = bands * gaps * edge * uOpacity;
  vec3 L = normalize(uSunDir);
  float s = dot(-vW, L);
  float shade = 1.0;
  if (s > 0.0 && length(vW + L * s) < uPlanetR) shade = 0.22;
  vec3 col = mix(uColor, uColor2, t) * shade;
  gl_FragColor = vec4(col, a);
}
`;

// 汎用パーティクル（サイズは距離で縮む）
const POINTS_VS = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.001), 0.0, 256.0);
  vColor = aColor;
  vAlpha = aAlpha;
}
`;
const POINTS_FS = `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  a *= a;
  if (vAlpha * a < 0.003) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

// 建物の灯り（ゆらぐ光の点）
const GLOW_VS = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uScale;
uniform float uTime;
varying vec3 vColor;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.78 + 0.22 * sin(uTime * 2.3 + aPhase);
  gl_PointSize = clamp(aSize * tw * uScale / max(-mv.z, 0.001), 0.0, 200.0);
  vColor = aColor;
}
`;
const GLOW_FS = `
varying vec3 vColor;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  a = a * a * a;
  gl_FragColor = vec4(vColor, a);
}
`;

const STARS_VS = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPR;
varying vec3 vColor;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase * 0.5) + aPhase * 20.0);
  gl_PointSize = aSize * uPR * (0.8 + 0.4 * tw);
  vColor = aColor;
  vA = tw;
}
`;
const STARS_FS = `
varying vec3 vColor;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  gl_FragColor = vec4(vColor, a * a * vA);
}
`;

// 光の柱・衝撃波など（加算合成）
const BEAM_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BEAM_FS = `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main(){
  float a = pow(1.0 - vUv.y, 2.2) * uAlpha;
  gl_FragColor = vec4(uColor, a);
}
`;
const SHOCK_VS = `
varying float vR;
void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SHOCK_FS = `
uniform vec3 uColor;
uniform float uAlpha;
varying float vR;
void main(){
  float a = smoothstep(0.55, 0.92, vR) * smoothstep(1.0, 0.94, vR) * uAlpha;
  gl_FragColor = vec4(uColor, a);
}
`;

const ORBITAL_VS = `
varying vec2 vUv;
varying vec3 vWN;
void main(){
  vUv = uv;
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const ORBITAL_FS = `
uniform float uTime;
uniform vec3 uSunDir, uLight;
varying vec2 vUv;
varying vec3 vWN;
void main(){
  float diff = 0.12 + 0.88 * max(dot(normalize(vWN), uSunDir), 0.0);
  vec3 col = vec3(0.52, 0.57, 0.68) * diff;
  float dash = smoothstep(0.55, 1.0, fract(vUv.x * 240.0 - uTime * 1.5));
  float band = smoothstep(0.35, 0.5, abs(fract(vUv.y) - 0.5));
  col += uLight * dash * (0.35 + 0.65 * band);
  gl_FragColor = vec4(col, 1.0);
}
`;
