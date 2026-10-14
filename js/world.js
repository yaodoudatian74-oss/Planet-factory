'use strict';
/* 3Dの世界: 宇宙の背景、惑星、大気、環、衛星、月、軌道リング、ダイソン球、光輪、銀河。 */

const T = THREE;
const SUN_DIR = new T.Vector3(-0.72, 0.38, 0.58).normalize();
const AX_X = new T.Vector3(1, 0, 0);
const AX_Y = new T.Vector3(0, 1, 0);
const AX_Z = new T.Vector3(0, 0, 1);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const cap = (k) => k[0].toUpperCase() + k.slice(1);

function randUnit(out) {
  out = out || new T.Vector3();
  const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(th), u, s * Math.sin(th));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialTex(stops, size) {
  size = size || 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return new T.CanvasTexture(c);
}

// ---------- 形状の結合（頂点カラー付き） ----------
// part: {geo, color, pos, rot, scl}
function P(geo, color, pos, rot, scl) { return { geo, color, pos: pos || [0, 0, 0], rot: rot || [0, 0, 0], scl: scl || [1, 1, 1] }; }
const gBox = (w, h, d) => new T.BoxGeometry(w, h, d);
const gCyl = (rt, rb, h, s) => new T.CylinderGeometry(rt, rb, h, s || 12);
const gCone = (r, h, s) => new T.ConeGeometry(r, h, s || 12);
const gSph = (r, w, h) => new T.SphereGeometry(r, w || 14, h || 10);
const gTorus = (R, r, rs, ts) => new T.TorusGeometry(R, r, rs || 8, ts || 28);

function mergeParts(parts) {
  if (!parts || !parts.length) return null;
  const pos = [], nor = [], col = [];
  const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), c = new T.Color();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    q.setFromEuler(e.set(p.rot[0], p.rot[1], p.rot[2]));
    m.compose(new T.Vector3().fromArray(p.pos), q, new T.Vector3().fromArray(p.scl));
    g.applyMatrix4(m);
    c.set(p.color);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
    for (let i = 0; i < pa.length / 3; i++) col.push(c.r, c.g, c.b);
    g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// ---------- 見た目パラメータ ----------
function toLook(l) {
  const o = {};
  LOOK_COLOR_KEYS.forEach((k) => { o[k] = new T.Color(l[k]); });
  LOOK_NUM_KEYS.forEach((k) => { o[k] = l[k]; });
  return o;
}
const LOOKC = LOOKS.map(toLook);
const MOON_LOOK = toLook({ colA: '#1d2026', colB: '#3a3f4a', colC: '#7c8492', lava: 0, lavaCol: '#ff6a1a', grid: 0.8, gridCol: '#9aa7b8',
  circuit: 0.6, circCol: '#47e6ff', city: 0.6, cityCol: '#ffd27a', metal: 0.5, atmo: '#7fd0ff', atmoK: 0.6, iri: 0 });
function cloneLook(l) {
  const o = {};
  LOOK_COLOR_KEYS.forEach((k) => { o[k] = l[k].clone(); });
  LOOK_NUM_KEYS.forEach((k) => { o[k] = l[k]; });
  return o;
}
function lerpLookInto(out, a, b, t) {
  LOOK_COLOR_KEYS.forEach((k) => { out[k].copy(a[k]).lerp(b[k], t); });
  LOOK_NUM_KEYS.forEach((k) => { out[k] = a[k] + (b[k] - a[k]) * t; });
}
function applyLook(mat, look) {
  const u = mat.uniforms;
  LOOK_COLOR_KEYS.forEach((k) => { u['u' + cap(k)].value.copy(look[k]); });
  LOOK_NUM_KEYS.forEach((k) => { u['u' + cap(k)].value = look[k]; });
}
function makePlanetUniforms() {
  const u = { uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() }, uFlash: { value: 0 }, uSeed: { value: new T.Vector3() } };
  LOOK_COLOR_KEYS.forEach((k) => { u['u' + cap(k)] = { value: new T.Color() }; });
  LOOK_NUM_KEYS.forEach((k) => { u['u' + cap(k)] = { value: 0 }; });
  return u;
}

function extrasTarget(st) {
  return {
    sats: st >= 3 ? 1 : 0,
    ring: st >= 4 ? 1 : 0,
    moons: st >= 9 ? 3 : st >= 7 ? 2 : st >= 5 ? 1 : 0,
    orbital: st >= 6 ? 1 : 0,
    dyson: st >= 7 ? 1 : 0,
    halo: st >= 8 ? 1 : 0,
    galaxy: st >= 9 ? 1 : 0,
  };
}

// ---------- 世界の状態 ----------
const W = {
  R: 1,              // 惑星の半径（ワールド単位）
  pop: 1,            // ビッグバン演出用の大きさ倍率
  time: 0,
  look: cloneLook(LOOKC[0]),
  trans: null,
  ex: extrasTarget(0),
  exTarget: extrasTarget(0),
  flash: 0,
};
const view = { target: { t: 0, b: 0, r: 0 }, cur: { t: 0, b: 0, r: 0 }, fullH: 1, fullW: 1, scale: 1 };

let renderer, scene, camera;
let planetRoot, spin, unit, fixedUnit, fxWorld;
let planet, planetMat, atmoMat, ringMesh, ringMat;
let satMesh, satOrbits = [], moons = [], orbital, orbitalMat, climbers = [];
let dyson, dysonShells = [], dysonSwarm = [], halo, haloGlow, gyros = [], galaxy;
let sunCore, sunHalo, starsMat, nebulae = [];
let dotTex;

function initWorld(canvas) {
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    return false;
  }
  if (!renderer.getContext()) return false;
  renderer.setClearColor(0x05060d, 1);
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(42, 1, 0.05, 4000);
  scene.add(camera);

  scene.add(new T.AmbientLight(0x2b3058, 0.6));
  const sun = new T.DirectionalLight(0xfff0dc, 1.25);
  sun.position.copy(SUN_DIR).multiplyScalar(50);
  scene.add(sun);

  dotTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']], 64);

  planetRoot = new T.Group();
  planetRoot.rotation.set(0.12, 0, 0.32);   // 自転軸の傾き
  scene.add(planetRoot);
  spin = new T.Group();
  planetRoot.add(spin);
  unit = new T.Group();          // 半径1で作ってRに拡大。自転する
  spin.add(unit);
  fixedUnit = new T.Group();     // 半径1で作ってRに拡大。自転しない
  planetRoot.add(fixedUnit);
  fxWorld = new T.Group();
  scene.add(fxWorld);

  makeBackground();
  makePlanet();
  makeRing();
  makeSatellites();
  makeMoons();
  makeOrbital();
  makeDyson();
  makeHalo();
  makeGalaxy();
  return true;
}

function makeBackground() {
  const N = 3600;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
  const c = new T.Color(), v = new T.Vector3();
  for (let i = 0; i < N; i++) {
    randUnit(v).multiplyScalar(900 + Math.random() * 500);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    const t = Math.random();
    c.setHSL(t < 0.7 ? 0.62 : t < 0.9 ? 0.11 : 0.02, t < 0.7 ? 0.35 : 0.7, 0.72 + Math.random() * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = 0.9 + Math.pow(Math.random(), 7) * 3.6;
    ph[i] = Math.random() * 6.28;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new T.BufferAttribute(col, 3));
  g.setAttribute('aSize', new T.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new T.BufferAttribute(ph, 1));
  starsMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
    vertexShader: STARS_VS, fragmentShader: STARS_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  });
  const stars = new T.Points(g, starsMat);
  stars.frustumCulled = false;
  scene.add(stars);

  const nebTex = radialTex([[0, 'rgba(255,255,255,0.9)'], [0.35, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']], 256);
  const cols = ['#5a2ca0', '#2340a8', '#0f6a8a', '#8a2a7a', '#3b2a90', '#1b5a9a'];
  for (let i = 0; i < 16; i++) {
    const m = new T.SpriteMaterial({ map: nebTex, color: cols[i % cols.length], transparent: true,
      opacity: 0.05 + Math.random() * 0.09, blending: T.AdditiveBlending, depthWrite: false });
    const s = new T.Sprite(m);
    randUnit(s.position).multiplyScalar(1700);
    s.scale.setScalar(500 + Math.random() * 700);
    s.userData.base = m.opacity;
    nebulae.push(s);
    scene.add(s);
  }

  const sunTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,248,225,1)'], [0.3, 'rgba(255,214,140,0.55)'], [1, 'rgba(255,160,60,0)']], 256);
  sunCore = new T.Sprite(new T.SpriteMaterial({ map: sunTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  sunCore.position.copy(SUN_DIR).multiplyScalar(700);
  sunCore.scale.setScalar(110);
  scene.add(sunCore);
  sunHalo = new T.Sprite(new T.SpriteMaterial({ map: dotTex, color: '#ffb35a', transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false }));
  sunHalo.position.copy(sunCore.position);
  sunHalo.scale.setScalar(430);
  scene.add(sunHalo);
}

function makePlanet() {
  planetMat = new T.ShaderMaterial({
    uniforms: makePlanetUniforms(), vertexShader: PLANET_VS, fragmentShader: PLANET_FS,
    extensions: { derivatives: true },
  });
  planet = new T.Mesh(new T.SphereGeometry(1, 160, 110), planetMat);
  unit.add(planet);

  atmoMat = new T.ShaderMaterial({
    uniforms: { uColor: { value: new T.Color() }, uK: { value: 1 }, uSunDir: { value: SUN_DIR.clone() } },
    vertexShader: ATMO_VS, fragmentShader: ATMO_FS,
    side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  });
  fixedUnit.add(new T.Mesh(new T.SphereGeometry(1.16, 96, 64), atmoMat));
}

function makeRing() {
  ringMat = new T.ShaderMaterial({
    uniforms: {
      uColor: { value: new T.Color() }, uColor2: { value: new T.Color() }, uSunDir: { value: SUN_DIR.clone() },
      uOpacity: { value: 0 }, uInner: { value: 1.5 }, uOuter: { value: 2.35 }, uPlanetR: { value: 1 }, uTime: { value: 0 },
    },
    vertexShader: RING_VS, fragmentShader: RING_FS,
    side: T.DoubleSide, transparent: true, depthWrite: false,
  });
  ringMesh = new T.Mesh(new T.RingGeometry(1.5, 2.35, 180, 1), ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.visible = false;
  fixedUnit.add(ringMesh);
}

function makeSatellites() {
  const geo = mergeParts([
    P(gBox(0.4, 0.4, 0.6), '#d9b45a'),
    P(gBox(1.7, 0.03, 0.42), '#2c55b8', [0, 0, 0]),
    P(gCyl(0.02, 0.02, 0.5, 5), '#dddddd', [0, 0.4, 0]),
  ]);
  satMesh = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ vertexColors: true }), 48);
  satMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  satMesh.count = 0;
  satMesh.frustumCulled = false;
  fixedUnit.add(satMesh);
  for (let i = 0; i < 48; i++) {
    satOrbits.push({ r: 1.24 + Math.random() * 0.5, inc: (Math.random() - 0.5) * 1.5, node: Math.random() * 6.28,
      ph: Math.random() * 6.28, sp: (0.16 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1) });
  }
}

function makeMoons() {
  const defs = [
    { size: 0.2, r: 2.35, inc: 0.25, sp: 0.09, ph: 0.4 },
    { size: 0.15, r: 2.9, inc: -0.4, sp: -0.06, ph: 2.2 },
    { size: 0.24, r: 3.45, inc: 0.6, sp: 0.045, ph: 4.1 },
  ];
  const geo = new T.SphereGeometry(1, 64, 48);
  defs.forEach((d, i) => {
    const mat = planetMat.clone();
    applyLook(mat, MOON_LOOK);
    mat.uniforms.uSeed.value.set(11 + i * 7, 3 + i * 5, 17 - i * 3);
    const mesh = new T.Mesh(geo, mat);
    mesh.visible = false;
    fixedUnit.add(mesh);
    moons.push({ mesh, mat, ...d });
  });
}

function makeOrbital() {
  orbital = new T.Group();
  orbital.visible = false;
  unit.add(orbital);
  orbitalMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() }, uLight: { value: new T.Color('#9fe8ff') } },
    vertexShader: ORBITAL_VS, fragmentShader: ORBITAL_FS,
  });
  const ring = new T.Mesh(new T.TorusGeometry(1.48, 0.014, 8, 256), orbitalMat);
  ring.rotation.x = Math.PI / 2;
  orbital.add(ring);
  const ring2 = new T.Mesh(new T.TorusGeometry(1.43, 0.006, 6, 256), orbitalMat);
  ring2.rotation.x = Math.PI / 2;
  orbital.add(ring2);
  const cableMat = new T.MeshLambertMaterial({ color: '#aab3c4' });
  const climbMat = new T.MeshBasicMaterial({ color: '#bff3ff' });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.3;
    const dir = new T.Vector3(Math.cos(a), 0, Math.sin(a));
    const cable = new T.Mesh(new T.CylinderGeometry(0.005, 0.009, 0.48, 6), cableMat);
    cable.quaternion.setFromUnitVectors(AX_Y, dir);
    cable.position.copy(dir).multiplyScalar(1.24);
    orbital.add(cable);
    const cl = new T.Mesh(new T.BoxGeometry(0.022, 0.022, 0.022), climbMat);
    cl.userData.dir = dir;
    cl.userData.ph = i * 1.7;
    orbital.add(cl);
    climbers.push(cl);
  }
}

function makeDyson() {
  dyson = new T.Group();
  dyson.position.copy(SUN_DIR).multiplyScalar(700);
  dyson.visible = false;
  scene.add(dyson);
  [[34, 1, '#ffcf6b'], [42, 0, '#ff9a3d']].forEach(([r, det, col]) => {
    const m = new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    const shell = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(r, det)), m);
    dyson.add(shell);
    dysonShells.push(shell);
  });
  for (let k = 0; k < 3; k++) {
    const N = 260, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.28, r = 28 + Math.random() * 20, y = (Math.random() - 0.5) * 6;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ size: 3, sizeAttenuation: false, map: dotTex, color: '#ffe2a0',
      transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    pts.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    pts.userData.sp = 0.05 + k * 0.03;
    dyson.add(pts);
    dysonSwarm.push(pts);
  }
}

function makeHalo() {
  halo = new T.Group();
  halo.visible = false;
  fixedUnit.add(halo);
  const ring = new T.Mesh(new T.TorusGeometry(0.42, 0.03, 12, 96), new T.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.42;
  halo.add(ring);
  haloGlow = new T.Sprite(new T.SpriteMaterial({ map: dotTex, color: '#ffd86b', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  haloGlow.position.y = 1.42;
  haloGlow.scale.setScalar(1.5);
  halo.add(haloGlow);
  for (let i = 0; i < 3; i++) {
    const g = new T.Mesh(new T.TorusGeometry(1.75 + i * 0.13, 0.005, 6, 200),
      new T.MeshBasicMaterial({ color: i === 1 ? '#ffffff' : '#ffd86b', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    g.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    halo.add(g);
    gyros.push(g);
  }
}

function makeGalaxy() {
  const N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new T.Color(), core = new T.Color('#fff2d0'), arm1 = new T.Color('#7fa8ff'), arm2 = new T.Color('#ff8ad8');
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  for (let i = 0; i < N; i++) {
    const arm = i % 3, t = Math.pow(Math.random(), 0.7);
    const r = 12 + t * 260, a = arm * Math.PI * 2 / 3 + t * 5.5 + gauss() * 0.35;
    pos[i * 3] = Math.cos(a) * r + gauss() * 8;
    pos[i * 3 + 1] = gauss() * 10 * (1 - t);
    pos[i * 3 + 2] = Math.sin(a) * r + gauss() * 8;
    c.copy(core).lerp(i % 2 ? arm1 : arm2, clamp(t * 1.6, 0, 1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  galaxy = new T.Points(g, new T.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true, map: dotTex,
    transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  galaxy.position.set(-520, 280, -980);
  galaxy.rotation.set(0.9, 0, 0.35);
  galaxy.visible = false;
  galaxy.frustumCulled = false;
  scene.add(galaxy);
}

// ---------- 形態の切り替え ----------
function setStageInstant(st) {
  W.trans = null;
  W.look = cloneLook(LOOKC[st]);
  W.R = STAGES[st].R;
  W.exTarget = extrasTarget(st);
  W.ex = { ...W.exTarget };
  applyLook(planetMat, W.look);
}

function startStageTransition(st) {
  W.trans = { from: cloneLook(W.look), to: LOOKC[st], R0: W.R, R1: STAGES[st].R, t: 0, dur: 2.8 };
  W.exTarget = extrasTarget(st);
}

function setPlanetSeed(seed) {
  const r = mulberry32(seed);
  planetMat.uniforms.uSeed.value.set(r() * 40 - 20, r() * 40 - 20, r() * 40 - 20);
}

function updateWorld(dt, ts) {
  W.time += dt * ts;
  const t = W.time;

  if (W.trans) {
    const tr = W.trans;
    tr.t += dt;
    const k = easeInOut(Math.min(1, tr.t / tr.dur));
    lerpLookInto(W.look, tr.from, tr.to, k);
    W.R = lerp(tr.R0, tr.R1, k);
    if (tr.t >= tr.dur) W.trans = null;
  }
  applyLook(planetMat, W.look);

  for (const k of Object.keys(W.ex)) {
    const target = W.exTarget[k];
    const d = target - W.ex[k];
    const step = (k === 'moons' ? 0.6 : 0.45) * dt;
    W.ex[k] = Math.abs(d) <= step ? target : W.ex[k] + Math.sign(d) * step;
  }
  const ex = W.ex;

  const r = W.R * W.pop;
  unit.scale.setScalar(Math.max(r, 1e-3));
  fixedUnit.scale.setScalar(Math.max(r, 1e-3));
  spin.rotation.y += dt * ts * 0.035;

  W.flash = Math.max(0, W.flash - dt * 2.2);
  planetMat.uniforms.uTime.value = t;
  planetMat.uniforms.uFlash.value = W.flash;
  atmoMat.uniforms.uColor.value.copy(W.look.atmo);
  atmoMat.uniforms.uK.value = W.look.atmoK;
  starsMat.uniforms.uTime.value = t;

  // 環
  ringMesh.visible = ex.ring > 0.01;
  if (ringMesh.visible) {
    ringMat.uniforms.uOpacity.value = ex.ring * 0.8;
    ringMat.uniforms.uColor.value.copy(W.look.atmo).lerp(W.look.colC, 0.4);
    ringMat.uniforms.uColor2.value.copy(W.look.colC).lerp(W.look.circCol, 0.25);
    ringMat.uniforms.uPlanetR.value = r;
    ringMesh.scale.setScalar(0.55 + 0.45 * easeInOut(ex.ring));
  }

  // 人工衛星
  const satCount = Math.round(ex.sats * Math.min(48, 8 + totalBuilt() / 5));
  satMesh.count = satCount;
  if (satCount > 0) {
    const d = new T.Object3D();
    for (let i = 0; i < satCount; i++) {
      const o = satOrbits[i];
      const a = o.ph + t * o.sp;
      d.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r).applyAxisAngle(AX_X, o.inc).applyAxisAngle(AX_Y, o.node);
      d.rotation.set(o.inc, -a + o.node, 0);
      d.scale.setScalar(0.028 * ex.sats);
      d.updateMatrix();
      satMesh.setMatrixAt(i, d.matrix);
    }
    satMesh.instanceMatrix.needsUpdate = true;
  }

  // 月
  moons.forEach((m, i) => {
    const k = clamp(ex.moons - i, 0, 1);
    m.mesh.visible = k > 0.01;
    if (!m.mesh.visible) return;
    const a = m.ph + t * m.sp;
    m.mesh.position.set(Math.cos(a) * m.r, 0, Math.sin(a) * m.r).applyAxisAngle(AX_X, m.inc);
    m.mesh.scale.setScalar(m.size * easeInOut(k));
    m.mesh.rotation.y = t * 0.2;
    m.mat.uniforms.uTime.value = t;
  });

  // 軌道リング
  orbital.visible = ex.orbital > 0.01;
  if (orbital.visible) {
    orbital.scale.setScalar(Math.max(0.01, easeOutBack(ex.orbital)));
    orbitalMat.uniforms.uTime.value = t;
    orbitalMat.uniforms.uLight.value.copy(W.look.circCol).lerp(W.look.cityCol, 0.4);
    climbers.forEach((cl) => {
      cl.position.copy(cl.userData.dir).multiplyScalar(1.24 + 0.21 * Math.sin(t * 0.5 + cl.userData.ph));
    });
  }

  // ダイソン球
  dyson.visible = ex.dyson > 0.01;
  if (dyson.visible) {
    dysonShells.forEach((s, i) => {
      s.material.opacity = ex.dyson * (i ? 0.35 : 0.6);
      s.rotation.y = t * (i ? -0.03 : 0.05);
      s.rotation.x = t * 0.02;
      s.scale.setScalar(0.6 + 0.4 * ex.dyson);
    });
    dysonSwarm.forEach((p) => {
      p.material.opacity = ex.dyson * 0.9;
      p.rotation.y += dt * ts * p.userData.sp;
    });
  }
  sunCore.scale.setScalar(110 * (1 + 0.25 * ex.dyson));
  sunHalo.material.opacity = 0.32 + 0.25 * ex.dyson;

  // 光輪
  halo.visible = ex.halo > 0.01;
  if (halo.visible) {
    halo.children[0].material.opacity = ex.halo;
    haloGlow.material.opacity = ex.halo * 0.7;
    halo.children[0].position.y = haloGlow.position.y = 1.42 + Math.sin(t * 1.2) * 0.03;
    gyros.forEach((g, i) => {
      g.material.opacity = ex.halo * 0.55;
      g.rotation.x += dt * ts * (0.1 + i * 0.05);
      g.rotation.y += dt * ts * (0.07 - i * 0.04);
      g.scale.setScalar(0.7 + 0.3 * ex.halo);
    });
  }

  // 銀河
  galaxy.visible = ex.galaxy > 0.01;
  if (galaxy.visible) {
    galaxy.material.opacity = ex.galaxy * 0.9;
    galaxy.rotation.y = t * 0.01;
  }
  nebulae.forEach((n) => { n.material.opacity = n.userData.base * (1 + 1.5 * ex.galaxy); });
}

// ---------- カメラの表示領域（パネルを避けて惑星を中央に） ----------
function updateView(dt) {
  const k = 1 - Math.exp(-dt * 8);
  const c = view.cur, tg = view.target;
  c.t = lerp(c.t, tg.t, k);
  c.b = lerp(c.b, tg.b, k);
  c.r = lerp(c.r, tg.r, k);
  const w = window.innerWidth, h = window.innerHeight;
  const dy = c.b - c.t;
  const fullH = h + Math.abs(dy), y = dy > 0 ? dy : 0;
  const fullW = w + c.r, x = c.r;
  camera.aspect = fullW / fullH;
  camera.setViewOffset(fullW, fullH, x, y, w, h);
  view.fullH = fullH;
  view.fullW = fullW;
  view.scale = fullH * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
}

// 惑星がちょうど良い大きさに見えるカメラ距離
function fitDistance() {
  const c = view.cur;
  const freeW = window.innerWidth - c.r, freeH = window.innerHeight - c.t - c.b;
  const targetPx = 0.36 * Math.max(120, Math.min(freeW, freeH));
  const f = view.fullH / (2 * Math.tan(camera.fov * Math.PI / 360));
  return W.R * f / targetPx;
}

function resizeRenderer() {
  const pr = S.settings.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  starsMat.uniforms.uPR.value = pr;
}
