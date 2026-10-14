'use strict';
/* 工場の3Dモデル（プリミティブを組み合わせて生成）と、惑星への配置。 */

const CAP = 70;              // 1種類あたり3Dで表示する最大数
const BUILD_SIZE = 0.06;     // 半径1の惑星に対する建物の大きさ

function lathePoints() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const y = i / 10 * 1.1;
    pts.push(new T.Vector2(0.2 + 0.13 * Math.pow((y - 0.72) / 0.72, 2), y));
  }
  return pts;
}

// body: 光らない部分 / glow: 光る部分 / glowAt: 光の点 / smoke: 煙の出口（すべてモデル座標、地面がy=0）
function buildModels() {
  const PI = Math.PI;
  const lathe = new T.LatheGeometry(lathePoints(), 18);
  const pylon = (x, z) => P(gCyl(0.03, 0.04, 0.6, 6), '#8b7aa8', [x, 0.5, z]);
  const lamp = (x, z) => P(gBox(0.06, 0.03, 0.06), '#7dffb0', [x, 0.1, z]);
  return {
    mine: {
      body: [
        P(gBox(1, 0.1, 1), '#5a4636', [0, 0.05, 0]),
        P(gCyl(0.05, 0.32, 1.1, 4), '#c9a14a', [0.18, 0.6, 0.12], [0, PI / 4, 0]),
        P(gBox(0.42, 0.32, 0.38), '#8a6a45', [-0.25, 0.26, 0.24]),
        P(gBox(0.46, 0.06, 0.42), '#5a3f28', [-0.25, 0.45, 0.24]),
        P(new T.DodecahedronGeometry(0.24), '#7a6552', [0.28, 0.12, -0.28], [0, 0, 0], [1, 0.6, 1]),
        P(gBox(0.08, 0.08, 0.7), '#3a2c22', [-0.2, 0.14, -0.25], [0.3, 0, 0]),
      ],
      glow: [P(gBox(0.12, 0.08, 0.12), '#ffd36b', [0.18, 1.18, 0.12])],
      glowAt: [0.18, 1.25, 0.12], glowCol: '#ffcc66', glowSize: 1.3, smoke: [],
    },
    smelter: {
      body: [
        P(gBox(1.0, 0.5, 0.7), '#6b6f78', [0, 0.25, 0.05]),
        P(gBox(1.06, 0.06, 0.76), '#3d4048', [0, 0.53, 0.05]),
        P(gCyl(0.08, 0.1, 0.95, 10), '#b8483c', [0.3, 0.72, -0.2]),
        P(gCyl(0.07, 0.09, 0.75, 10), '#b8483c', [0.05, 0.62, -0.2]),
        P(gCyl(0.085, 0.085, 0.1, 10), '#eeeeee', [0.3, 0.95, -0.2]),
        P(gCyl(0.075, 0.075, 0.1, 10), '#eeeeee', [0.05, 0.8, -0.2]),
        P(gBox(0.3, 0.25, 0.3), '#585c64', [-0.35, 0.62, -0.1]),
      ],
      glow: [P(gBox(0.55, 0.16, 0.02), '#ff7a2a', [0, 0.2, 0.41])],
      glowAt: [0, 0.25, 0.5], glowCol: '#ff8a3a', glowSize: 1.4,
      smoke: [[0.3, 1.22, -0.2], [0.05, 1.02, -0.2]], smokeCol: '#b9b4ad',
    },
    power: {
      double: true,
      body: [
        P(gBox(1.0, 0.08, 1.0), '#4b505a', [0, 0.04, 0]),
        P(lathe, '#cfcac0', [-0.2, 0.05, -0.1]),
        P(lathe, '#c4bfb5', [0.28, 0.05, 0.22], [0, 0, 0], [0.75, 0.75, 0.75]),
        P(gBox(0.32, 0.3, 0.28), '#7d8590', [0.25, 0.2, -0.3]),
        P(gCyl(0.03, 0.03, 0.5, 6), '#8b929c', [0.33, 0.45, -0.35]),
      ],
      glow: [P(gBox(0.06, 0.06, 0.06), '#ff3030', [-0.2, 1.2, -0.1])],
      glowAt: [-0.2, 1.22, -0.1], glowCol: '#ff4a4a', glowSize: 0.9,
      smoke: [[-0.2, 1.15, -0.1], [0.28, 0.9, 0.22]], smokeCol: '#f2f4f8',
    },
    robot: {
      body: [
        P(gBox(1.1, 0.36, 0.9), '#4d6aa0', [0, 0.18, 0]),
        P(gCyl(0.2, 0.2, 0.88, 3), '#e8eef8', [-0.36, 0.42, 0], [PI / 2, 0, 0]),
        P(gCyl(0.2, 0.2, 0.88, 3), '#e8eef8', [0, 0.42, 0], [PI / 2, 0, 0]),
        P(gCyl(0.2, 0.2, 0.88, 3), '#e8eef8', [0.36, 0.42, 0], [PI / 2, 0, 0]),
        P(gBox(0.12, 0.4, 0.12), '#ffb13b', [0.42, 0.56, 0.32]),
        P(gBox(0.4, 0.08, 0.08), '#ffb13b', [0.3, 0.76, 0.32], [0, 0, 0.4]),
      ],
      glow: [P(gBox(1.12, 0.06, 0.02), '#7fe0ff', [0, 0.22, 0.46])],
      glowAt: [0, 0.3, 0.5], glowCol: '#7fe0ff', glowSize: 1.3, smoke: [],
    },
    chip: {
      body: [
        P(gBox(1.1, 0.3, 1.0), '#e9edf2', [0, 0.15, 0]),
        P(gBox(0.7, 0.22, 0.6), '#cfd6de', [0.1, 0.41, 0.05]),
        P(gCyl(0.07, 0.07, 0.16, 10), '#a7b0bc', [-0.38, 0.38, -0.3]),
        P(gCyl(0.07, 0.07, 0.16, 10), '#a7b0bc', [-0.38, 0.38, 0]),
        P(gCyl(0.07, 0.07, 0.16, 10), '#a7b0bc', [-0.38, 0.38, 0.3]),
      ],
      glow: [
        P(gBox(1.12, 0.035, 1.02), '#3ff0ff', [0, 0.1, 0]),
        P(gBox(0.72, 0.03, 0.62), '#3ff0ff', [0.1, 0.45, 0.05]),
      ],
      glowAt: [0.1, 0.6, 0.05], glowCol: '#46f0ff', glowSize: 1.3, smoke: [],
    },
    port: {
      body: [
        P(gCyl(0.55, 0.6, 0.08, 18), '#5d636e', [0, 0.04, 0]),
        P(gCyl(0.075, 0.075, 0.6, 12), '#f2f2f2', [0, 0.4, 0]),
        P(gCone(0.075, 0.2, 12), '#e2403a', [0, 0.8, 0]),
        P(gBox(0.26, 0.12, 0.02), '#2c3340', [0, 0.16, 0]),
        P(gBox(0.02, 0.12, 0.26), '#2c3340', [0, 0.16, 0]),
        P(gBox(0.07, 0.95, 0.07), '#d6a13a', [0.24, 0.48, 0]),
        P(gBox(0.2, 0.04, 0.04), '#d6a13a', [0.14, 0.7, 0]),
      ],
      glow: [lamp(0.5, 0), lamp(-0.5, 0), lamp(0, 0.5), lamp(0, -0.5)],
      glowAt: [0, 0.95, 0], glowCol: '#9dffc8', glowSize: 1.1, smoke: [],
    },
    fusion: {
      body: [
        P(gCyl(0.5, 0.56, 0.16, 20), '#3b4250', [0, 0.08, 0]),
        P(new T.SphereGeometry(0.42, 20, 12, 0, PI * 2, 0, PI / 2), '#d9dee8', [0, 0.16, 0]),
        P(gBox(0.16, 0.3, 0.16), '#59606e', [0.55, 0.15, 0]),
      ],
      glow: [P(gTorus(0.5, 0.045, 8, 40), '#ff9a3d', [0, 0.3, 0], [PI / 2, 0, 0])],
      glowAt: [0, 0.62, 0], glowCol: '#ffa85a', glowSize: 2.2, smoke: [],
    },
    anti: {
      body: [
        P(gBox(0.85, 0.2, 0.85), '#2a2335', [0, 0.1, 0]),
        pylon(0.32, 0.32), pylon(-0.32, 0.32), pylon(0.32, -0.32), pylon(-0.32, -0.32),
      ],
      glow: [P(new T.OctahedronGeometry(0.28, 0), '#ff4fd8', [0, 0.78, 0], [0, 0, 0], [1, 1.4, 1])],
      glowAt: [0, 0.78, 0], glowCol: '#ff5fe0', glowSize: 2.4, smoke: [],
    },
    hole: {
      body: [
        P(gCyl(0.45, 0.55, 0.2, 16), '#2c2c34', [0, 0.1, 0]),
        P(gCyl(0.06, 0.08, 0.4, 8), '#555566', [0, 0.35, 0]),
        P(gSph(0.3, 20, 14), '#050507', [0, 0.82, 0]),
      ],
      glow: [
        P(gTorus(0.46, 0.05, 8, 40), '#ffb347', [0, 0.82, 0], [PI / 2 - 0.35, 0, 0]),
        P(gTorus(0.36, 0.025, 6, 36), '#fff0c0', [0, 0.82, 0], [PI / 2 - 0.35, 0, 0]),
      ],
      glowAt: [0, 0.82, 0], glowCol: '#ffb347', glowSize: 2.4, smoke: [],
    },
    dim: {
      body: [
        P(gBox(0.9, 0.15, 0.6), '#3a3d52', [0, 0.075, 0]),
        P(gTorus(0.4, 0.06, 10, 36), '#9aa0c0', [0, 0.55, 0]),
        P(gBox(0.12, 0.3, 0.12), '#5a5f7a', [0.42, 0.2, 0]),
        P(gBox(0.12, 0.3, 0.12), '#5a5f7a', [-0.42, 0.2, 0]),
      ],
      glow: [P(gCyl(0.35, 0.35, 0.02, 28), '#a070ff', [0, 0.55, 0], [PI / 2, 0, 0])],
      glowAt: [0, 0.55, 0.05], glowCol: '#b48cff', glowSize: 2.4, smoke: [],
    },
    genesis: {
      body: [
        P(gCyl(0.5, 0.56, 0.16, 8), '#b8923a', [0, 0.08, 0]),
        P(gCone(0.24, 1.5, 6), '#e8c35a', [0, 0.9, 0]),
      ],
      glow: [
        P(gTorus(0.32, 0.03, 6, 32), '#fff0b0', [0, 0.5, 0], [PI / 2, 0, 0]),
        P(gTorus(0.22, 0.025, 6, 32), '#fff0b0', [0, 0.9, 0], [PI / 2, 0, 0]),
        P(gSph(0.08, 10, 8), '#ffffff', [0, 1.68, 0]),
      ],
      glowAt: [0, 1.68, 0], glowCol: '#ffe9a0', glowSize: 2.6, smoke: [],
    },
    cosmos: {
      body: [
        P(gCyl(0.6, 0.7, 0.2, 12), '#20243a', [0, 0.1, 0]),
        P(gCyl(0.08, 0.12, 0.5, 8), '#454b70', [0, 0.45, 0]),
      ],
      glow: [
        P(new T.IcosahedronGeometry(0.36, 0), '#dcd4ff', [0, 1.02, 0]),
        P(gTorus(0.6, 0.025, 6, 40), '#ff8ad8', [0, 1.02, 0], [PI / 2, 0, 0]),
        P(gTorus(0.68, 0.02, 6, 40), '#7fa8ff', [0, 1.02, 0], [PI / 2 + 0.6, 0.4, 0]),
      ],
      glowAt: [0, 1.02, 0], glowCol: '#ffffff', glowSize: 3.0, smoke: [],
    },
  };
}

const ROCKET_PARTS = () => [
  P(gCyl(0.08, 0.08, 0.55, 10), '#f2f2f2', [0, 0.275, 0]),
  P(gCone(0.08, 0.2, 10), '#e2403a', [0, 0.65, 0]),
  P(gBox(0.28, 0.12, 0.02), '#2c3340', [0, 0.08, 0]),
  P(gBox(0.02, 0.12, 0.28), '#2c3340', [0, 0.08, 0]),
];

// ---------- 配置 ----------
const BLD = [];             // 種類ごと: {f, model, body, glow, items}
let glowPoints, glowGeo;
let bldR = -1;
const animating = [];
const smokeEmitters = [];   // {it, pt, col}
const thumbs = {};

function initBuildings() {
  const models = buildModels();
  FACTORIES.forEach((f) => {
    const m = models[f.id];
    const bodyGeo = mergeParts(m.body);
    const glowGeoT = mergeParts(m.glow);
    const body = new T.InstancedMesh(bodyGeo, new T.MeshLambertMaterial({ vertexColors: true, side: m.double ? T.DoubleSide : T.FrontSide }), CAP);
    body.instanceMatrix.setUsage(T.DynamicDrawUsage);
    body.count = 0;
    body.frustumCulled = false;
    unit.add(body);
    let glow = null;
    if (glowGeoT) {
      glow = new T.InstancedMesh(glowGeoT, new T.MeshBasicMaterial({ vertexColors: true }), CAP);
      glow.instanceMatrix.setUsage(T.DynamicDrawUsage);
      glow.count = 0;
      glow.frustumCulled = false;
      unit.add(glow);
    }
    BLD.push({ f, model: m, body, glow, bodyGeo, glowGeo: glowGeoT, items: [], glowColor: new T.Color(m.glowCol) });
  });

  const max = FACTORIES.length * CAP;
  glowGeo = new T.BufferGeometry();
  glowGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(max * 3), 3).setUsage(T.DynamicDrawUsage));
  glowGeo.setAttribute('aColor', new T.BufferAttribute(new Float32Array(max * 3), 3));
  glowGeo.setAttribute('aSize', new T.BufferAttribute(new Float32Array(max), 1).setUsage(T.DynamicDrawUsage));
  const ph = new Float32Array(max);
  for (let i = 0; i < max; i++) ph[i] = Math.random() * 6.28;
  glowGeo.setAttribute('aPhase', new T.BufferAttribute(ph, 1));
  glowGeo.setDrawRange(0, 0);
  glowPoints = new T.Points(glowGeo, new T.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uTime: { value: 0 } },
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  }));
  glowPoints.frustumCulled = false;
  unit.add(glowPoints);
}

let glowCount = 0;
const _q = new T.Quaternion(), _qy = new T.Quaternion(), _v = new T.Vector3(), _s = new T.Vector3();

const buildScale = (f) => BUILD_SIZE * f.size * Math.pow(W.R, -0.5);

function composeItem(b, idx, k) {
  const it = b.items[idx];
  _q.setFromUnitVectors(AX_Y, it.dir);
  _qy.setFromAxisAngle(AX_Y, it.yaw);
  _q.multiply(_qy);
  const s = Math.max(1e-4, buildScale(b.f) * k);
  it.m.compose(_v.copy(it.dir).multiplyScalar(0.997), _q, _s.set(s, s, s));
  b.body.setMatrixAt(idx, it.m);
  b.body.instanceMatrix.needsUpdate = true;
  if (b.glow) {
    b.glow.setMatrixAt(idx, it.m);
    b.glow.instanceMatrix.needsUpdate = true;
  }
  const gp = glowGeo.attributes.position, gs = glowGeo.attributes.aSize;
  _v.fromArray(b.model.glowAt).applyMatrix4(it.m);
  gp.setXYZ(it.glowIdx, _v.x, _v.y, _v.z);
  gs.setX(it.glowIdx, b.model.glowSize * s * W.R);
  gp.needsUpdate = true;
  gs.needsUpdate = true;
}

function isFree(v, sep) {
  const c = Math.cos(sep);
  for (const b of BLD) for (const it of b.items) if (it.dir.dot(v) > c) return false;
  return true;
}

const _cam = new T.Vector3();
function pickDir(biased, rng) {
  if (biased) {
    _cam.copy(camera.position);
    unit.updateMatrixWorld();
    unit.worldToLocal(_cam);
    _cam.normalize();
  }
  let sep = 0.085;
  const v = new T.Vector3();
  for (let a = 0; a < 40; a++) {
    if (biased && a < 28) {
      v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).multiplyScalar(0.85 + a * 0.04).add(_cam).normalize();
    } else {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      v.set(s * Math.cos(th), u, s * Math.sin(th));
    }
    if (isFree(v, sep)) return v;
    sep *= 0.94;
  }
  return v;
}

// 建物を1つ置く。置けたら item を返す（上限ならnull）
function addBuilding(fi, opts) {
  const b = BLD[fi];
  if (b.items.length >= CAP) return null;
  const rng = opts.rng || Math.random;
  const it = { dir: pickDir(!!opts.biased, rng), yaw: rng() * 6.28, m: new T.Matrix4(), glowIdx: glowCount++, age: opts.animate ? 0 : -1 };
  b.items.push(it);
  const idx = b.items.length - 1;
  b.body.count = b.items.length;
  if (b.glow) b.glow.count = b.items.length;
  glowGeo.attributes.aColor.setXYZ(it.glowIdx, b.glowColor.r, b.glowColor.g, b.glowColor.b);
  glowGeo.attributes.aColor.needsUpdate = true;
  glowGeo.setDrawRange(0, glowCount);
  composeItem(b, idx, opts.animate ? 0 : 1);
  if (opts.animate) animating.push({ b, idx, it });
  for (const pt of b.model.smoke) smokeEmitters.push({ it, pt, col: new T.Color(b.model.smokeCol || '#cccccc') });
  return it;
}

function clearBuildings() {
  BLD.forEach((b) => {
    b.items.length = 0;
    b.body.count = 0;
    if (b.glow) b.glow.count = 0;
  });
  glowCount = 0;
  glowGeo.setDrawRange(0, 0);
  animating.length = 0;
  smokeEmitters.length = 0;
}

function placeAllFromState() {
  clearBuildings();
  const rng = mulberry32(S.seed);
  FACTORIES.forEach((f, fi) => {
    const n = Math.min(S.owned[f.id], CAP);
    for (let i = 0; i < n; i++) addBuilding(fi, { rng });
  });
  bldR = W.R;
}

// 建設直後の「ポンッ」と出てくる動き、惑星の巨大化への追従
function updateBuildings(dt) {
  if (Math.abs(W.R - bldR) > 1e-4) {
    bldR = W.R;
    BLD.forEach((b) => b.items.forEach((it, i) => composeItem(b, i, it.age >= 0 ? animK(it.age) : 1)));
  }
  for (let i = animating.length - 1; i >= 0; i--) {
    const a = animating[i];
    a.it.age += dt;
    composeItem(a.b, a.idx, animK(a.it.age));
    if (a.it.age > 1.0) { a.it.age = -1; composeItem(a.b, a.idx, 1); animating.splice(i, 1); }
  }
  glowPoints.material.uniforms.uTime.value = W.time;
  glowPoints.material.uniforms.uScale.value = view.scale;
}
const animK = (age) => (age < 0.3 ? 0 : clamp(easeOutBack(Math.min(1, (age - 0.3) / 0.55)), 0, 1.3));

// ランダムな建物（カメラ側にあるもの）
function randomVisibleItem(filterFi) {
  _cam.copy(camera.position);
  unit.worldToLocal(_cam);
  _cam.normalize();
  for (let tries = 0; tries < 12; tries++) {
    const fi = filterFi != null ? filterFi : Math.floor(Math.random() * BLD.length);
    const b = BLD[fi];
    if (!b.items.length) continue;
    const it = b.items[Math.floor(Math.random() * b.items.length)];
    if (it.dir.dot(_cam) > 0.35) return { b, it };
  }
  return null;
}

// 一覧用のサムネイル画像を3Dモデルから作る
function makeThumbs() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  let r;
  try {
    r = new T.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch (e) {
    return;
  }
  const sc = new T.Scene();
  const cam = new T.PerspectiveCamera(28, 1, 0.1, 50);
  sc.add(new T.AmbientLight(0x8890c0, 0.75));
  const dl = new T.DirectionalLight(0xffffff, 0.95);
  dl.position.set(-2, 3, 2.5);
  sc.add(dl);
  BLD.forEach((b) => {
    const outer = new T.Group(), inner = new T.Group();
    inner.add(new T.Mesh(b.bodyGeo, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));
    if (b.glowGeo) inner.add(new T.Mesh(b.glowGeo, new T.MeshBasicMaterial({ vertexColors: true })));
    inner.rotation.y = 0.65;
    outer.add(inner);
    sc.add(outer);
    outer.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(outer);
    const size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
    inner.position.sub(center);
    const rad = Math.max(size.x, size.y, size.z) * 0.62;
    cam.position.set(0, rad * 1.3, rad * 3.4);
    cam.lookAt(0, 0, 0);
    r.render(sc, cam);
    try { thumbs[b.f.id] = c.toDataURL('image/png'); } catch (e) { /* noop */ }
    sc.remove(outer);
  });
  r.dispose();
  if (r.forceContextLoss) r.forceContextLoss();
}
