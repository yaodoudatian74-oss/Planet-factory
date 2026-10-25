'use strict';
/* 操作・ゲームの進行・メインループ・起動。 */

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const cam = { theta: 0.35, phi: 1.2, zoom: 1, vT: 0, vP: 0, dist: 4, idle: 0 };
const pointers = new Map();
let pinch = null, tapCand = null, canvasEl = null;
let bigBangAnim = null;
const timers = { meteor: 45, meteorQueue: 0, meteorGap: 0, ship: 3, rocket: 4, bolt: 0 };

// ---------- 入力（ドラッグで回転、ピンチ/ホイールでズーム、タップで収入） ----------
function initInput(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    cam.idle = 0;
    cam.vT = cam.vP = 0;
    if (pointers.size === 1) {
      tapCand = e.pointerId;
    } else {
      tapCand = null;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zoom };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 9) tapCand = null;
      if (tapCand !== null) return;
      const k = 0.0058 * Math.min(1.3, cam.zoom);
      cam.theta -= dx * k;
      cam.phi = clamp(cam.phi - dy * k, 0.25, Math.PI - 0.25);
      cam.vT = -dx * k * 50;
      cam.vP = -dy * k * 50;
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.zoom = clamp(pinch.z * pinch.d / Math.max(d, 1), 0.45, 2.6);
    }
    cam.idle = 0;
  });
  const up = (e) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (p && tapCand === e.pointerId && e.type === 'pointerup' && performance.now() - p.t < 500) handleTap(e.clientX, e.clientY);
    if (tapCand === e.pointerId) tapCand = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 2.6);
    cam.idle = 0;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

let raycaster = null, _ndc = null;
function raycastPlanet(x, y) {
  if (!raycaster) { raycaster = new T.Raycaster(); _ndc = new T.Vector2(); }
  _ndc.set(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const out = new T.Vector3();
  return raycaster.ray.intersectSphere(new T.Sphere(new T.Vector3(), W.R * W.pop), out) ? out : null;
}

function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* noop */ } }

function handleTap(x, y) {
  if (bigBangAnim) return;
  const m = meteorAt(x, y);
  if (m) { catchMeteor(m); return; }
  const hit = raycastPlanet(x, y);
  if (!hit) return;
  const v = tapValue();
  earn(v);
  S.taps++;
  floatText(x, y - 12, '+' + yen(v));
  burst(hit, 14, { speed: 0.35 * W.R, size: 0.05 * W.R, life: 0.7 });
  shockwave(hit, unit.worldToLocal(hit.clone()).normalize(), 0.13 * W.R, '#ffe7a0', 0.5);
  Sound.tap();
  vibrate(5);
  refreshMoney();
}

function updateCamera(dt) {
  if (pointers.size === 0) {
    cam.theta += cam.vT * dt;
    cam.phi = clamp(cam.phi + cam.vP * dt, 0.25, Math.PI - 0.25);
    const d = Math.exp(-dt * 3.5);
    cam.vT *= d;
    cam.vP *= d;
    cam.idle += dt;
    if (cam.idle > 6) cam.theta += dt * 0.02;
  }
  const target = fitDistance() * cam.zoom * (1 + FX.zoomKick);
  cam.dist = lerp(cam.dist, target, 1 - Math.exp(-dt * 4));
  const sp = Math.sin(cam.phi);
  camera.position.set(cam.dist * sp * Math.sin(cam.theta), cam.dist * Math.cos(cam.phi), cam.dist * sp * Math.cos(cam.theta));
  camera.lookAt(0, 0, 0);
  if (FX.shake > 0 && !reduceMotion) {
    const s = FX.shake * FX.shake * 0.06 * W.R;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
}

// パネルに隠れない場所の真ん中に惑星を置く
function computeInsets() {
  const dock = $('#dock');
  const desktop = window.innerWidth >= 860;
  document.documentElement.style.setProperty('--hud-h', $('#hud').offsetHeight + 'px');
  if (desktop) {
    view.target.r = dock.offsetWidth;
    view.target.b = 0;
    view.target.t = 0;
    return;
  }
  view.target.r = 0;
  const powersH = ($('#powers').offsetHeight + 12) * 0.35;
  const tabsH = dock.querySelector('.tabs').offsetHeight + parseFloat(getComputedStyle(dock).paddingBottom || 0);
  view.target.b = (dock.classList.contains('collapsed') ? tabsH : dock.offsetHeight) + powersH;
  view.target.t = $('#hud').offsetHeight;
}

// ---------- ゲームの行動 ----------
function buyFactory(id, el) {
  const f = FACTORY_BY_ID[id];
  if (!f || f.stage > S.stage) return;
  const q = buyQuote(f, UI.qty);
  if (S.money < q.cost) { Sound.deny(); shakeEl(el); return; }
  S.money -= q.cost;
  S.owned[f.id] += q.n;
  S.built += q.n;
  const b = BLD[f.index];
  const room = Math.min(q.n, CAP - b.items.length);
  for (let i = 0; i < room; i++) {
    const it = addBuilding(f.index, { biased: true, animate: true });
    if (it && i < 4) godBeam(it.dir);
  }
  if (q.n > 1 || room === 0) {
    const s = worldToScreen(new T.Vector3());
    if (s) floatText(s.x, s.y - 40, f.name + ' +' + q.n + '棟', 'small');
  }
  Sound.buy();
  refreshMoney();
  refreshFacList();
  if (S.built === 1) toast('工場が建った！ 工場はほうっておいても毎秒お金を稼ぐ');
}

function buyUpgrade(id, el) {
  const u = UPGRADE_BY_ID[id];
  if (!u || !upgradeVisible(u)) return;
  if (S.money < u.cost) { Sound.deny(); shakeEl(el); return; }
  S.money -= u.cost;
  S.upg[u.id] = true;
  Sound.upgrade();
  const s = worldToScreen(new T.Vector3());
  if (s) floatText(s.x, s.y - 40, u.name + '！', 'small');
  refreshMoney();
  buildUpgList();
}

function doEvolve() {
  if (!canEvolve() || W.trans || bigBangAnim) { Sound.deny(); return; }
  const nx = nextStage();
  S.money -= nx.cost;
  S.stage++;
  startStageTransition(S.stage);
  evolutionBurst(LOOKS[S.stage].atmo);
  screenFlash(reduceMotion ? 0.3 : 0.85);
  Sound.evolve();
  vibrate(40);
  showBanner(formLabel(S.stage), STAGES[S.stage].name, STAGES[S.stage].desc);
  FACTORIES.filter((f) => f.stage === S.stage).forEach((f) => toast('新しい工場「' + f.name + '」を建てられるようになった'));
  POWERS.filter((p) => p.stage === S.stage).forEach((p) => toast('神の力「' + p.name + '」が使えるようになった：' + p.desc));
  if (S.stage === MAX_STAGE) toast('最終形態に到達！ 神殿で「ビッグバン」ができるようになった');
  buildFacList();
  if (UI.tab === 'evo') buildEvoPane();
  refreshPanels();
  writeSave();
}

function usePower(id) {
  const p = POWERS.find((x) => x.id === id);
  if (!p || bigBangAnim) return;
  if (S.stage < p.stage) { Sound.deny(); toast(formLabel(p.stage) + 'で使えるようになる神の力：' + p.desc); return; }
  if ((S.cd[p.id] || 0) > 0) { Sound.deny(); return; }
  S.cd[p.id] = p.cd;
  const center = worldToScreen(new T.Vector3());
  if (id === 'thunder') {
    addBuff('thunder', 5, 20);
    Sound.thunder();
    lightningStrike();
    lightningStrike();
    timers.bolt = 0.5;
    toast('神の雷！ 20秒間、生産とタップが5倍');
  } else if (id === 'rain') {
    const v = baseIncome() * 60 * buffMult() + tapValue() * 30;
    earn(v);
    goldRain();
    Sound.coins();
    if (center) floatText(center.x, center.y - 30, '+' + yen(v), 'big');
  } else if (id === 'warp') {
    addBuff('warp', 1, 20);
    Sound.warp();
    FX.zoomKick = 0.12;
    toast('時間加速！ 20秒間、時間の流れが3倍');
  } else if (id === 'meteor') {
    timers.meteorQueue = 3;
    timers.meteorGap = 0;
    toast('星降り！ 金色の隕石をタップしよう');
  }
  refreshPowers();
  refreshHud();
}

function catchMeteor(m) {
  const pos = m.mesh.position.clone();
  const s = worldToScreen(pos);
  removeMeteor(m);
  const r = Math.random();
  const inc = baseIncome();
  let text;
  if (r < 0.1) {
    const v = inc * 300 + tapValue() * 100;
    earn(v);
    text = '神の大当たり！ +' + yen(v);
  } else if (r < 0.4) {
    addBuff('frenzy', 5, 20);
    text = '熱狂！ 生産×5（20秒）';
  } else {
    const v = inc * 60 + tapValue() * 30;
    earn(v);
    text = '隕石を換金！ +' + yen(v);
  }
  burst(pos, 120, { speed: 1.2 * W.R, size: 0.08 * W.R, life: 1.1 });
  shockwave(pos, null, 0.9 * W.R, '#ffd36b', 0.7);
  Sound.meteor();
  vibrate(20);
  if (s) floatText(s.x, s.y, text, 'big');
  refreshMoney();
}

function doBigBang() {
  if (!canBigBang() || bigBangAnim) return;
  if (UI.confirm !== 'bb') {
    UI.confirm = 'bb';
    UI.confirmT = 4;
    buildGodPane();
    return;
  }
  UI.confirm = null;
  bigBangAnim = { t: 0, gain: bigBangGain(), done: false };
  Sound.bigbang();
  FX.shake = 1;
}

function performBigBang(gain) {
  const keep = {
    divinity: S.divinity + gain, universe: S.universe + 1, allTotal: S.allTotal, taps: S.taps, play: S.play,
    built: S.built, settings: S.settings, hints: S.hints, intro: true,
  };
  S = freshState();
  Object.assign(S, keep);
  buffs.length = 0;
  setStageInstant(0);
  setPlanetSeed(S.seed);
  placeAllFromState();
  buildFacList();
  setTab('fac');
  showBanner('宇宙 #' + S.universe, '新しい宇宙の誕生', '神格 +' + gain + '。すべての収入とタップが ×' + divMult().toFixed(1));
  writeSave();
}

function updateBigBang(dt) {
  const a = bigBangAnim;
  if (!a) return;
  a.t += dt;
  if (a.t < 1.4) {
    W.pop = 1 - 0.985 * easeInOut(a.t / 1.4);
    if (Math.random() < 0.6) burst(new T.Vector3(), 6, { speed: 3 * W.R, size: 0.1 * W.R, life: 0.8, colors: [C_WHITE, C_GOLD] });
  } else if (!a.done) {
    a.done = true;
    screenFlash(1);
    performBigBang(a.gain);
    W.pop = 0.015;
    evolutionBurst('#ffffff');
  } else {
    const k = clamp((a.t - 1.4) / 2.4, 0, 1);
    W.pop = 0.015 + 0.985 * easeOutBack(k);
    if (k >= 1) { W.pop = 1; bigBangAnim = null; }
  }
}

// ---------- オンライン（妨害・部屋） ----------
function onlineClick(e) {
  const atk = e.target.closest('[data-attack]');
  if (atk) {
    Sound.unlock();
    const kind = atk.dataset.kind || 'missile';
    if (Online.attack(atk.dataset.attack, kind)) {
      Sound.whoosh();
      toast(kind === 'jam' ? 'ジャミングを発射した！' : 'ミサイルを発射した！');
    } else Sound.deny();
    renderOnline();
    return true;
  }
  if (e.target.closest('#onPublic')) { Sound.unlock(); Online.enablePublic(); return true; }
  if (e.target.closest('#onNew')) { Sound.unlock(); Online.createRoom(); return true; }
  if (e.target.closest('#onJoin')) { Sound.unlock(); Online.joinRoom($('#onCode').value); return true; }
  if (e.target.closest('#onLeave')) { Online.leave(); return true; }
  return false;
}

// 他のプレイヤーからの妨害が来た。ミサイルは弾が当たってからお金が減り、ジャミングは収入が下がる
function onMissileHit(m) {
  incomingMissile();
  Sound.meteor();
  vibrate(60);
  FX.shake = Math.max(FX.shake, 0.6);
  if (m.kind === 'jam') {
    setTimeout(() => {
      addBuff('jam', Online.JAM_MULT, Online.JAM_SECONDS);
      Sound.warp();
      refreshHud();
      toast((m.fromName || '誰か') + 'からジャミング！ ' + Online.JAM_SECONDS + '秒間、収入が半分に');
    }, 1400);
    return;
  }
  setTimeout(() => {
    const loss = Online.missileLoss(S.money, baseIncome());
    S.money = Math.max(0, S.money - loss);
    refreshMoney();
    toast((m.fromName || '誰か') + 'からミサイル攻撃！ お金 -' + yen(loss));
    writeSave();
  }, 1400);
}

function doWipe() {
  if (UI.confirm !== 'wipe') {
    UI.confirm = 'wipe';
    UI.confirmT = 4;
    buildGodPane();
    return;
  }
  UI.confirm = null;
  Online.leave();
  wipeSave();
  const settings = S.settings;
  S = freshState();
  S.settings = settings;
  buffs.length = 0;
  setStageInstant(0);
  setPlanetSeed(S.seed);
  placeAllFromState();
  setTab('fac');
  $('#intro').hidden = false;
}

// 時間で起きること: 隕石、雷、ロケット、出荷の数字
function gameTimers(dt, ts) {
  if (S.built > 0 || S.stage > 0) timers.meteor -= dt;
  if (timers.meteor <= 0) {
    timers.meteor = 55 + Math.random() * 65;
    spawnMeteor();
    if (!S.hints.meteor) { S.hints.meteor = 1; toast('金色の隕石が来た！ タップしてつかまえよう'); }
  }
  if (timers.meteorQueue > 0) {
    timers.meteorGap -= dt;
    if (timers.meteorGap <= 0) { spawnMeteor(); timers.meteorQueue--; timers.meteorGap = 0.8; }
  }
  if (buffs.some((b) => b.id === 'thunder')) {
    timers.bolt -= dt;
    if (timers.bolt <= 0) { lightningStrike(); timers.bolt = 0.45 + Math.random() * 0.7; }
  }
  const ports = S.owned.port;
  if (ports > 0) {
    timers.rocket -= dt * ts;
    if (timers.rocket <= 0) { launchRocket(); timers.rocket = Math.max(1.4, 8 / Math.sqrt(ports)) * (0.6 + Math.random() * 0.8); }
  }
  timers.ship -= dt;
  if (timers.ship <= 0) {
    timers.ship = 2.2 + Math.random() * 1.2;
    const pick = randomVisibleItem();
    if (pick) {
      _a.copy(pick.it.dir).multiplyScalar(1.02);
      unit.localToWorld(_a);
      const s = worldToScreen(_a);
      const v = S.owned[pick.b.f.id] * unitIncome(pick.b.f) * buffMult() * ts * 2.5;
      if (s && v > 0) floatText(s.x, s.y, '+' + yen(v), 'small');
    }
  }
}

function hints() {
  const h = S.hints;
  if (!S.intro) return;
  if (!h.tap && S.taps === 0 && S.play > 1.5) { h.tap = 1; toast('惑星をタップして、お金を集めよう'); }
  if (!h.build && S.money >= 15 && S.built === 0) { h.build = 1; toast('お金がたまった！「工場」から採掘場を建てよう'); }
  if (!h.upg && S.built >= 3 && availableUpgrades().some((u) => S.money >= u.cost)) { h.upg = 1; toast('「強化」タブで工場をパワーアップできる'); }
  if (!h.evo && canEvolve()) { h.evo = 1; toast('惑星を進化させられるようになった！ 上の金色のボタンをタップ'); }
  if (!h.power && S.stage >= 1) { h.power = 1; toast('金色の丸いボタンが「神の力」。タップで発動！'); }
}

function welcomeBack(sec) {
  const inc = baseIncome();
  if (!(inc > 0)) return;
  const t = Math.min(sec, OFFLINE_CAP);
  const v = inc * t * OFFLINE_RATE;
  earn(v);
  showModal('おかえりなさい、神様', '留守のあいだ（' + fmtTime(t) + '）も工場は動きつづけ、<br><b>' + yen(v) + '</b> 稼ぎました。');
}

// ---------- UIのイベント ----------
function bindUi() {
  const dock = $('#dock');
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    dock.classList.remove('collapsed');
    document.body.classList.remove('dock-collapsed');
    setTab(t.dataset.tab);
    computeInsets();
  }));
  $('#collapseBtn').addEventListener('click', () => {
    dock.classList.toggle('collapsed');
    document.body.classList.toggle('dock-collapsed', dock.classList.contains('collapsed'));
    $('#collapseBtn').setAttribute('aria-label', dock.classList.contains('collapsed') ? 'パネルを開く' : 'パネルを閉じる');
    computeInsets();
  });
  $('#qty').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    UI.qty = b.dataset.q === 'max' ? 'max' : +b.dataset.q;
    document.querySelectorAll('#qty button').forEach((x) => x.classList.toggle('on', x === b));
    refreshFacList();
  });
  $('#facList').addEventListener('click', (e) => {
    const row = e.target.closest('button.row');
    if (row) buyFactory(row.dataset.fac, row);
  });
  $('#upgList').addEventListener('click', (e) => {
    const row = e.target.closest('button.row');
    if (row) buyUpgrade(row.dataset.upg, row);
  });
  $('#evoPane').addEventListener('click', (e) => { if (e.target.closest('#evoBtn')) doEvolve(); });
  $('#godPane').addEventListener('change', (e) => { if (e.target.id === 'onName') Online.setName(e.target.value); });
  $('#godPane').addEventListener('click', (e) => {
    if (e.target.closest('#bbBtn')) { doBigBang(); return; }
    if (e.target.closest('#wipeBtn')) { doWipe(); return; }
    if (onlineClick(e)) return;
    const seg = e.target.closest('.seg button');
    if (!seg) return;
    if (seg.parentElement.id === 'segSound') { S.settings.sound = seg.dataset.v === 'on'; refreshSoundBtn(); Sound.unlock(); }
    if (seg.parentElement.id === 'segQuality') { S.settings.quality = seg.dataset.v; resizeRenderer(); }
    writeSave();
    buildGodPane();
  });
  $('#powers').addEventListener('click', (e) => {
    const b = e.target.closest('.pw');
    if (b) { Sound.unlock(); usePower(b.dataset.pw); }
  });
  $('#evoCta').addEventListener('click', doEvolve);
  $('#netChip').addEventListener('click', () => {
    dock.classList.remove('collapsed');
    document.body.classList.remove('dock-collapsed');
    setTab('god');
    computeInsets();
  });
  $('#stageChip').addEventListener('click', () => {
    dock.classList.remove('collapsed');
    document.body.classList.remove('dock-collapsed');
    setTab('evo');
    computeInsets();
  });
  $('#soundBtn').addEventListener('click', () => {
    S.settings.sound = !S.settings.sound;
    if (S.settings.sound) Sound.unlock();
    refreshSoundBtn();
    if (UI.tab === 'god') buildGodPane();
    writeSave();
  });
  $('#introGo').addEventListener('click', () => {
    S.intro = true;
    $('#intro').hidden = true;
    Sound.unlock();
    Sound.upgrade();
    writeSave();
  });
  $('#mOk').addEventListener('click', () => { $('#modal').hidden = true; });
  window.addEventListener('resize', () => { resizeRenderer(); computeInsets(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
  window.addEventListener('pagehide', writeSave);
}

// ---------- メインループ ----------
let lastT = 0, uiAcc = 0, saveAcc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!lastT) lastT = now;
  const gap = (now - lastT) / 1000;
  lastT = now;
  if (gap > 1.5) {
    // タブが裏にあった時間の分
    if (gap > 120) welcomeBack(gap); else earn(baseIncome() * gap);
    tickBuffs(gap);
  }
  const dt = Math.min(gap, 0.1);
  const ts = timeScale();

  earn(liveIncome() * dt * ts);
  S.play += dt;
  tickBuffs(dt);
  gameTimers(dt, ts);
  Online.tick(dt);
  updateBigBang(dt);

  updateView(dt);
  updateCamera(dt);
  updateWorld(dt, ts);
  updateBuildings(dt);
  updateFx(dt, ts);

  refreshMoney();
  updateToast(dt);
  uiAcc += dt;
  if (uiAcc > 0.25) {
    uiAcc = 0;
    if (UI.confirm) {
      UI.confirmT -= 0.25;
      if (UI.confirmT <= 0) { UI.confirm = null; if (UI.tab === 'god') buildGodPane(); }
    }
    refreshPanels();
    hints();
    computeInsets();
  }
  saveAcc += dt;
  if (saveAcc > 10) { saveAcc = 0; writeSave(); }
  renderer.render(scene, camera);
}

function showFatal(msg) {
  $('#fatalMsg').textContent = msg;
  $('#fatal').hidden = false;
}

function start(data) {
  const fromHot = data && data.save;
  S = mergeState(fromHot ? data.save : readSave());
  canvasEl = $('#scene');
  if (!initWorld(canvasEl)) { showFatal('このブラウザでは3D（WebGL）が使えないようです。別のブラウザで試してください。'); return; }
  initBuildings();
  initFx();
  makeThumbs();
  setStageInstant(S.stage);
  setPlanetSeed(S.seed);
  placeAllFromState();
  resizeRenderer();
  initInput(canvasEl);
  buildPowers();
  bindUi();
  Online.init({
    onChange: () => { if (UI.tab === 'god') renderOnline(); },
    onIncoming: onMissileHit,
  });
  setTab('fac');
  refreshSoundBtn();
  refreshPanels();
  computeInsets();
  view.cur = { ...view.target };
  updateView(0);
  cam.dist = fitDistance();
  if (!S.intro) {
    $('#intro').hidden = false;
  } else if (!fromHot) {
    const away = (Date.now() - S.last) / 1000;
    if (away > 60) welcomeBack(away);
  }
  window.PF = { get state() { return S; }, give(n) { earn(n); }, evolve: doEvolve };
  requestAnimationFrame(loop);
}

(function boot() {
  if (!window.THREE) {
    const el = document.getElementById('fatal');
    document.getElementById('fatalMsg').textContent = '3Dエンジン（three.js）を読み込めませんでした。インターネットにつながっているか確認してください。';
    el.hidden = false;
    return;
  }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try { hot.snapshot(() => ({ save: JSON.parse(JSON.stringify(S)) })); } catch (e) { /* noop */ }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
