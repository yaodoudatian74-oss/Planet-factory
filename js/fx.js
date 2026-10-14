'use strict';
/* 演出: 光の粒、神の光の柱、衝撃波、雷、金色の隕石、ロケット、浮かぶ数字。 */

class Particles {
  constructor(max, additive, parent) {
    this.max = max;
    this.i = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aColor', new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aSize', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aAlpha', new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage));
    this.geo = g;
    this.mat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 1 } },
      vertexShader: POINTS_VS, fragmentShader: POINTS_FS,
      transparent: true, depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending,
    });
    this.points = new T.Points(g, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  // o: {x,y,z, vx,vy,vz, life, s0, s1, color(T.Color), a, grav, drag}
  spawn(o) {
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.col[i3] = o.color.r; this.col[i3 + 1] = o.color.g; this.col[i3 + 2] = o.color.b;
    this.life[i] = this.maxLife[i] = o.life;
    this.s0[i] = o.s0;
    this.s1[i] = o.s1 != null ? o.s1 : o.s0;
    this.a0[i] = o.a != null ? o.a : 1;
    this.grav[i] = o.grav || 0;
    this.drag[i] = o.drag || 0;
  }

  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.grav[i]) {
        const d = Math.hypot(p[i3], p[i3 + 1], p[i3 + 2]) || 1;
        const k = this.grav[i] * dt / d;
        v[i3] -= p[i3] * k; v[i3 + 1] -= p[i3 + 1] * k; v[i3 + 2] -= p[i3 + 2] * k;
      }
      if (this.drag[i]) {
        const f = Math.max(0, 1 - this.drag[i] * dt);
        v[i3] *= f; v[i3 + 1] *= f; v[i3 + 2] *= f;
      }
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.life[i] <= 0 ? 0 : this.a0[i] * Math.min(1, t / 0.12) * (1 - t);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
    this.mat.uniforms.uScale.value = view.scale;
  }
}

let sparks, smoke;
const beams = [], shocks = [], bolts = [], meteors = [], rockets = [];
let beamGeo, shockGeo, meteorGeo, meteorTex, rocketGeo, rocketMat;
const FX = { shake: 0, zoomKick: 0, nextShip: 2, nextRocket: 4, nextSmoke: 0, nextBolt: 0 };
const C_GOLD = new T.Color('#ffd36b'), C_WHITE = new T.Color('#ffffff'), C_ORANGE = new T.Color('#ff9a3d');
const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3();

function initFx() {
  sparks = new Particles(1600, true, fxWorld);
  smoke = new Particles(500, false, unit);
  beamGeo = new T.CylinderGeometry(1, 1, 1, 16, 1, true);
  beamGeo.translate(0, 0.5, 0);
  shockGeo = new T.RingGeometry(0.5, 1, 64, 1);
  meteorGeo = new T.IcosahedronGeometry(1, 0);
  meteorTex = radialTex([[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,210,107,0.8)'], [1, 'rgba(255,150,40,0)']], 128);
  rocketGeo = mergeParts(ROCKET_PARTS());
  rocketMat = new T.MeshLambertMaterial({ vertexColors: true });
}

function beamMaterial(color) {
  return new T.ShaderMaterial({
    uniforms: { uColor: { value: new T.Color(color) }, uAlpha: { value: 0 } },
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
  });
}

// 神の光の柱（建物が建つ場所に降りる）。dirは惑星ローカルの単位ベクトル
function godBeam(dir, color) {
  const mesh = new T.Mesh(beamGeo, beamMaterial(color || '#ffe7a0'));
  mesh.quaternion.setFromUnitVectors(AX_Y, dir);
  mesh.position.copy(dir);
  mesh.scale.set(0.01, 0.75, 0.01);
  unit.add(mesh);
  beams.push({ mesh, t: 0, dur: 1.0 });
  _a.copy(dir);
  unit.localToWorld(_a);
  shockwave(_a, dir, 0.18 * W.R, color || '#ffe7a0');
}

// 衝撃波。posはワールド座標。normalがnullならカメラの方を向く
function shockwave(pos, normal, size, color, dur) {
  const mat = new T.ShaderMaterial({
    uniforms: { uColor: { value: new T.Color(color || '#ffe7a0') }, uAlpha: { value: 1 } },
    vertexShader: SHOCK_VS, fragmentShader: SHOCK_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
  });
  const mesh = new T.Mesh(shockGeo, mat);
  mesh.position.copy(pos);
  if (normal) {
    _b.copy(normal).transformDirection(unit.matrixWorld);
    mesh.quaternion.setFromUnitVectors(AX_Z, _b);
  }
  fxWorld.add(mesh);
  shocks.push({ mesh, t: 0, dur: dur || 0.8, size, billboard: !normal });
}

function burst(pos, n, opts) {
  opts = opts || {};
  const speed = opts.speed || 0.6, size = opts.size || 0.05;
  const cols = opts.colors || [C_GOLD, C_WHITE];
  for (let i = 0; i < n; i++) {
    randUnit(_c);
    if (opts.dir) _c.add(opts.dir).normalize();
    const sp = speed * (0.3 + Math.random() * 0.9);
    sparks.spawn({
      x: pos.x, y: pos.y, z: pos.z, vx: _c.x * sp, vy: _c.y * sp, vz: _c.z * sp,
      life: (opts.life || 0.9) * (0.6 + Math.random() * 0.6), s0: size * (0.6 + Math.random()), s1: 0,
      color: cols[i % cols.length], a: 1, drag: opts.drag != null ? opts.drag : 1.5, grav: opts.grav || 0,
    });
  }
}

// 雷（神の雷の発動中に何度も落ちる）
function lightningStrike() {
  randUnit(_a);
  _b.copy(camera.position).normalize();
  _a.add(_b.multiplyScalar(1.3)).normalize();
  const R = W.R;
  const end = _a.clone().multiplyScalar(R);
  const start = _a.clone().multiplyScalar(R * 2.6).add(randUnit(_c).multiplyScalar(R * 0.5));
  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = start.clone().lerp(end, t);
    if (i > 0 && i < n) p.add(randUnit(_c).multiplyScalar(R * 0.12 * Math.sin(t * Math.PI)));
    pts.push(p);
  }
  const geo = new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 48, 0.012 * R, 5, false);
  const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ color: '#dff0ff', transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false }));
  fxWorld.add(mesh);
  bolts.push({ mesh, t: 0, dur: 0.35 });
  burst(end, 40, { speed: 0.9 * R, size: 0.07 * R, colors: [new T.Color('#bfe3ff'), C_WHITE, C_GOLD] });
  const local = unit.worldToLocal(end.clone()).normalize();
  shockwave(end, local, 0.35 * R, '#cfe8ff', 0.6);
  W.flash = Math.min(0.35, W.flash + 0.18);
  FX.shake = Math.max(FX.shake, 0.25);
}

// 黄金の雨
function goldRain() {
  const R = W.R;
  _b.copy(camera.position).normalize();
  for (let i = 0; i < 220; i++) {
    randUnit(_a).add(_c.copy(_b).multiplyScalar(0.8)).normalize();
    const r = R * (2.2 + Math.random() * 1.6);
    sparks.spawn({
      x: _a.x * r, y: _a.y * r, z: _a.z * r, vx: 0, vy: 0, vz: 0,
      life: 1.4 + Math.random() * 1.2, s0: 0.06 * R, s1: 0.03 * R,
      color: Math.random() < 0.7 ? C_GOLD : C_WHITE, a: 1, grav: 2.4 * R, drag: 0.2,
    });
  }
}

// 進化の大爆発
function evolutionBurst(color) {
  const R = W.R;
  const col = new T.Color(color);
  for (let i = 0; i < 420; i++) {
    randUnit(_a);
    const sp = R * (0.8 + Math.random() * 2.6);
    sparks.spawn({
      x: _a.x * R, y: _a.y * R, z: _a.z * R, vx: _a.x * sp, vy: _a.y * sp, vz: _a.z * sp,
      life: 1.2 + Math.random() * 1.2, s0: 0.09 * R, s1: 0, color: i % 3 ? col : (i % 2 ? C_GOLD : C_WHITE), a: 1, drag: 1.2,
    });
  }
  shockwave(new T.Vector3(), null, R * 4.5, color, 1.6);
  shockwave(new T.Vector3(), null, R * 3.0, '#ffffff', 1.1);
  W.flash = 0.9;
  FX.shake = 0.7;
  FX.zoomKick = 0.32;
}

// ---------- 金色の隕石 ----------
function spawnMeteor() {
  const R = W.R;
  camera.updateMatrixWorld();
  const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const toCam = camera.position.clone().normalize();
  const side = Math.random() < 0.5 ? -1 : 1;
  const front = toCam.clone().multiplyScalar(R * 1.25);
  const p0 = right.clone().multiplyScalar(side * R * 3.4).add(up.clone().multiplyScalar(R * (0.2 + Math.random() * 1.1))).add(front);
  const p1 = right.clone().multiplyScalar(-side * R * 3.4).add(up.clone().multiplyScalar(R * (-0.9 + Math.random() * 0.8))).add(front);
  const mesh = new T.Mesh(meteorGeo, new T.MeshBasicMaterial({ color: '#ffd36b' }));
  mesh.scale.setScalar(0.07 * R);
  const glow = new T.Sprite(new T.SpriteMaterial({ map: meteorTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(0.55 * R);
  mesh.add(glow);
  glow.scale.divideScalar(0.07 * R);
  fxWorld.add(mesh);
  meteors.push({ mesh, p0, p1, t: 0, dur: 8 + Math.random() * 3, dead: false });
  Sound.whoosh();
}

function removeMeteor(m) {
  m.dead = true;
  fxWorld.remove(m.mesh);
  m.mesh.material.dispose();
  m.mesh.children[0].material.dispose();
}

// 画面座標(x,y)の近くの隕石を探す
function meteorAt(x, y) {
  for (const m of meteors) {
    if (m.dead) continue;
    const s = worldToScreen(m.mesh.position);
    if (!s) continue;
    if (Math.hypot(s.x - x, s.y - y) < 56) return m;
  }
  return null;
}

// ---------- ロケット ----------
function launchRocket() {
  const fi = FACTORY_BY_ID.port.index;
  const pick = randomVisibleItem(fi) || (BLD[fi].items.length ? { it: BLD[fi].items[Math.floor(Math.random() * BLD[fi].items.length)] } : null);
  if (!pick) return;
  const mesh = new T.Mesh(rocketGeo, rocketMat);
  const dir = pick.it.dir.clone();
  mesh.quaternion.setFromUnitVectors(AX_Y, dir);
  const s = BUILD_SIZE * 1.25 * Math.pow(W.R, -0.5) * 0.75;
  mesh.scale.setScalar(s);
  mesh.position.copy(dir);
  unit.add(mesh);
  rockets.push({ mesh, dir, t: 0, dur: 3.2 });
}

// ---------- 浮かぶ数字（DOM） ----------
let floaterCount = 0;
function floatText(x, y, text, cls) {
  if (floaterCount > 36) return;
  const el = document.createElement('div');
  el.className = 'floater' + (cls ? ' ' + cls : '');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.getElementById('floaters').appendChild(el);
  floaterCount++;
  el.addEventListener('animationend', () => { el.remove(); floaterCount--; });
}

function worldToScreen(v) {
  _c.copy(v).project(camera);
  if (_c.z > 1) return null;
  return { x: (_c.x * 0.5 + 0.5) * window.innerWidth, y: (-_c.y * 0.5 + 0.5) * window.innerHeight };
}

function screenFlash(strength) {
  const el = document.getElementById('flash');
  el.style.transition = 'none';
  el.style.opacity = String(strength);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = 'opacity 1.1s ease-out';
    el.style.opacity = '0';
  }));
}

// ---------- 毎フレーム ----------
function updateFx(dt, ts) {
  const R = W.R;
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.t += dt;
    const k = b.t / b.dur;
    b.mesh.material.uniforms.uAlpha.value = Math.sin(Math.min(1, k) * Math.PI) * 0.95;
    b.mesh.scale.x = b.mesh.scale.z = 0.01 * (1 - k * 0.6);
    if (k >= 1) { unit.remove(b.mesh); b.mesh.material.dispose(); beams.splice(i, 1); }
  }
  for (let i = shocks.length - 1; i >= 0; i--) {
    const s = shocks[i];
    s.t += dt;
    const k = s.t / s.dur;
    const e = 1 - Math.pow(1 - Math.min(1, k), 3);
    s.mesh.scale.setScalar(Math.max(1e-3, s.size * e));
    s.mesh.material.uniforms.uAlpha.value = (1 - k) * 0.9;
    if (s.billboard) s.mesh.quaternion.copy(camera.quaternion);
    if (k >= 1) { fxWorld.remove(s.mesh); s.mesh.material.dispose(); shocks.splice(i, 1); }
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt;
    b.mesh.material.opacity = (Math.random() * 0.4 + 0.6) * (1 - b.t / b.dur);
    if (b.t >= b.dur) { fxWorld.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bolts.splice(i, 1); }
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    if (m.dead) { meteors.splice(i, 1); continue; }
    m.t += dt;
    const k = m.t / m.dur;
    m.mesh.position.copy(m.p0).lerp(m.p1, k);
    m.mesh.rotation.x += dt * 2;
    m.mesh.rotation.y += dt * 1.3;
    for (let j = 0; j < 3; j++) {
      sparks.spawn({
        x: m.mesh.position.x, y: m.mesh.position.y, z: m.mesh.position.z,
        vx: (Math.random() - 0.5) * 0.08 * R, vy: (Math.random() - 0.5) * 0.08 * R, vz: (Math.random() - 0.5) * 0.08 * R,
        life: 0.9, s0: 0.1 * R, s1: 0, color: j ? C_GOLD : C_ORANGE, a: 0.8,
      });
    }
    if (k >= 1) { removeMeteor(m); meteors.splice(i, 1); }
  }
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.t += dt * ts;
    const k = r.t / r.dur;
    const d = 1 + 0.02 + 1.6 * k * k;
    r.mesh.position.copy(r.dir).multiplyScalar(d);
    if (k > 0.75) r.mesh.scale.multiplyScalar(0.93);
    _a.copy(r.mesh.position).addScaledVector(r.dir, -0.01);
    unit.localToWorld(_a);
    sparks.spawn({ x: _a.x, y: _a.y, z: _a.z, vx: 0, vy: 0, vz: 0, life: 0.5, s0: 0.05 * R, s1: 0.0, color: Math.random() < 0.5 ? C_ORANGE : C_WHITE, a: 0.9 });
    if (k >= 1) { unit.remove(r.mesh); rockets.splice(i, 1); }
  }

  // 煙
  FX.nextSmoke -= dt * ts;
  if (smokeEmitters.length && FX.nextSmoke <= 0) {
    FX.nextSmoke = 1 / Math.min(30, 2 + smokeEmitters.length * 0.35);
    const e = smokeEmitters[Math.floor(Math.random() * smokeEmitters.length)];
    if (e.it.age < 0) {
      _a.fromArray(e.pt).applyMatrix4(e.it.m);
      const n = e.it.dir;
      smoke.spawn({
        x: _a.x, y: _a.y, z: _a.z,
        vx: n.x * 0.022 + (Math.random() - 0.5) * 0.006, vy: n.y * 0.022 + (Math.random() - 0.5) * 0.006, vz: n.z * 0.022 + (Math.random() - 0.5) * 0.006,
        life: 2.6, s0: 0.018 * R, s1: 0.075 * R, color: e.col, a: 0.4, drag: 0.4,
      });
    }
  }

  sparks.update(dt);
  smoke.update(dt * ts);
  FX.shake = Math.max(0, FX.shake - dt * 1.4);
  FX.zoomKick = Math.max(0, FX.zoomKick - dt * 0.18);
}
