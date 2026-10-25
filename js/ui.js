'use strict';
/* 画面のパネル・HUD。3Dには触らず、main.js の関数を呼ぶ。 */

const $ = (s) => document.querySelector(s);
const UI = {
  tab: 'fac',
  qty: 1,
  upgSig: '',
  stageShown: -1,
  toastQ: [],
  toastT: 0,
  confirm: null,        // 二度押し確認中のボタンID
  confirmT: 0,
  lastMoney: '',
};

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function thumbHTML(f) {
  return thumbs[f.id] ? '<img alt="" src="' + thumbs[f.id] + '">' : '';
}

// ---------- 工場 ----------
function buildFacList() {
  const list = $('#facList');
  let html = '';
  FACTORIES.forEach((f) => {
    if (f.stage > S.stage) {
      html += '<div class="row locked" data-fac="' + f.id + '"><div class="thumb">' + thumbHTML(f) + '</div>' +
        '<div class="meta"><div class="name">？？？</div><div class="sub">' + formLabel(f.stage) + '「' + STAGES[f.stage].name + '」で解放</div></div><div class="price"></div></div>';
      return;
    }
    html += '<button type="button" class="row" data-fac="' + f.id + '"><div class="thumb">' + thumbHTML(f) + '</div>' +
      '<div class="meta"><div class="name">' + esc(f.name) + '<span class="own"></span></div><div class="sub"></div></div>' +
      '<div class="price"><span class="q"></span><span class="c"></span></div></button>';
  });
  list.innerHTML = html;
  refreshFacList();
}

function refreshFacList() {
  document.querySelectorAll('#facList .row[data-fac]').forEach((el) => {
    const f = FACTORY_BY_ID[el.dataset.fac];
    if (f.stage > S.stage) return;
    const q = buyQuote(f, UI.qty);
    const can = S.money >= q.cost;
    el.classList.toggle('can', can);
    el.classList.toggle('poor', !can);
    el.querySelector('.own').textContent = S.owned[f.id] ? '×' + S.owned[f.id] : '';
    const ui = unitIncome(f);
    el.querySelector('.sub').textContent = S.owned[f.id]
      ? '1棟 毎秒' + yen(ui) + '・合計 毎秒' + yen(ui * S.owned[f.id])
      : f.desc + '（毎秒' + yen(ui) + '）';
    el.querySelector('.q').textContent = '×' + q.n;
    el.querySelector('.c').textContent = yen(q.cost);
  });
}

// ---------- 強化 ----------
function availableUpgrades() {
  return UPGRADES.filter(upgradeVisible).sort((a, b) => a.cost - b.cost);
}

function upgIcon(u) {
  if (u.kind === 'fac') return thumbHTML(FACTORY_BY_ID[u.fac]);
  return ICONS[u.kind === 'tap' ? 'tap' : 'glob'];
}

function buildUpgList(list) {
  list = list || availableUpgrades();
  UI.upgSig = list.map((u) => u.id).join(',');
  const el = $('#upgList');
  if (!list.length) {
    el.innerHTML = '<p class="empty">いま買える強化はありません。<br>工場を増やすと新しい強化が出てきます。</p>';
  } else {
    el.innerHTML = list.slice(0, 40).map((u) =>
      '<button type="button" class="row" data-upg="' + u.id + '"><div class="thumb">' + upgIcon(u) + '</div>' +
      '<div class="meta"><div class="name">' + esc(u.name) + '</div><div class="sub">' + esc(u.desc) + '</div></div>' +
      '<div class="price"><span class="c">' + yen(u.cost) + '</span></div></button>').join('');
  }
  refreshUpgList();
}

function refreshUpgList() {
  const list = availableUpgrades();
  const sig = list.map((u) => u.id).join(',');
  if (sig !== UI.upgSig) { buildUpgList(list); return; }
  let affordable = 0;
  document.querySelectorAll('#upgList .row').forEach((el) => {
    const u = UPGRADE_BY_ID[el.dataset.upg];
    const can = S.money >= u.cost;
    el.classList.toggle('can', can);
    el.classList.toggle('poor', !can);
  });
  list.forEach((u) => { if (S.money >= u.cost) affordable++; });
  const bought = Object.keys(S.upg).length;
  $('#upgCount').textContent = '購入済み ' + bought + ' / ' + UPGRADES.length;
  const badge = $('#upgBadge');
  badge.hidden = affordable === 0;
  badge.textContent = affordable > 9 ? '9+' : String(affordable);
}

// ---------- 進化 ----------
function planetDot(st) {
  const l = LOOKS[st];
  return 'background: radial-gradient(circle at 35% 30%, ' + l.colC + ', ' + l.colB + ' 55%, ' + l.colA + '); box-shadow: 0 0 8px ' + l.atmo + ', inset -3px -3px 6px rgba(0,0,0,.55)';
}

function buildEvoPane() {
  const st = S.stage, cur = STAGES[st], nx = nextStage();
  let html = '<section class="card-sec"><div class="eyebrow2">いまの惑星　' + formLabel(st) + '</div>' +
    '<div class="evo-title">' + cur.name + '</div><p class="evo-desc">' + cur.desc + '<br>' + cur.size + '</p></section>';
  if (nx) {
    const perks = ['すべての収入 ×' + STAGE_MULT, '惑星が巨大化 → ' + nx.size];
    FACTORIES.filter((f) => f.stage === st + 1).forEach((f) => perks.push('新しい工場「' + f.name + '」'));
    POWERS.filter((p) => p.stage === st + 1).forEach((p) => perks.push('神の力「' + p.name + '」'));
    const ex0 = extrasTarget(st), ex1 = extrasTarget(st + 1);
    if (ex1.sats > ex0.sats) perks.push('人工衛星が飛びはじめる');
    if (ex1.ring > ex0.ring) perks.push('惑星に環ができる');
    if (ex1.moons > ex0.moons) perks.push('工場の月が' + (ex0.moons ? 'もうひとつ' : '') + '生まれる');
    if (ex1.orbital > ex0.orbital) perks.push('軌道リングと宇宙エレベーター');
    if (ex1.dyson > ex0.dyson) perks.push('太陽をダイソン球で包む');
    if (ex1.halo > ex0.halo) perks.push('神の光輪');
    if (ex1.galaxy > ex0.galaxy) perks.push('銀河が見える');
    html += '<section class="card-sec next"><div class="eyebrow2">次の進化　' + formLabel(st + 1) + '</div>' +
      '<div class="evo-title">' + nx.name + '</div><p class="evo-desc">' + nx.desc + '</p>' +
      '<ul class="perks">' + perks.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' +
      '<div class="reqs">' +
      '<div class="req"><span>お金</span><span id="evoMoney"></span></div><div class="bar"><i id="evoMoneyBar"></i></div>' +
      '<div class="req"><span>工場の数</span><span id="evoBuilt"></span></div><div class="bar"><i id="evoBuiltBar"></i></div>' +
      '</div><button type="button" class="primary" id="evoBtn">惑星を進化させる</button></section>';
  } else {
    html += '<section class="card-sec next"><div class="eyebrow2">最終形態に到達</div>' +
      '<div class="evo-title">これ以上の進化はない</div><p class="evo-desc">神殿の「ビッグバン」で、この宇宙を新しく作り直せます。神格が増えて、次の宇宙はもっと速く育ちます。</p></section>';
  }
  html += '<section class="card-sec"><div class="eyebrow2">進化の記録</div><ol class="timeline">' +
    STAGES.map((s, i) => '<li class="' + (i < st ? 'done' : i === st ? 'done cur' : '') + '"><span class="pd" style="' + planetDot(i) + '"></span>' +
      '<span class="tf">' + formLabel(i) + '</span><span>' + (i <= st + 1 ? s.name : '？？？') + '</span></li>').join('') +
    '</ol></section>';
  $('#evoPane').innerHTML = html;
  UI.stageShown = st;
  refreshEvoPane();
}

function refreshEvoPane() {
  const nx = nextStage();
  const ok = canEvolve();
  $('#evoBadge').hidden = !ok;
  if (!nx) return;
  const m = $('#evoMoney');
  if (!m) return;
  const built = totalBuilt();
  m.innerHTML = '<span class="' + (S.money >= nx.cost ? 'ok' : 'ng') + '">' + yen(Math.min(S.money, nx.cost)) + '</span> / ' + yen(nx.cost);
  $('#evoBuilt').innerHTML = '<span class="' + (built >= nx.need ? 'ok' : 'ng') + '">' + Math.min(built, nx.need) + '</span> / ' + nx.need + ' 棟';
  $('#evoMoneyBar').style.width = (clamp(S.money / nx.cost, 0, 1) * 100) + '%';
  $('#evoBuiltBar').style.width = (clamp(built / nx.need, 0, 1) * 100) + '%';
  $('#evoBtn').disabled = !ok;
}

// ---------- 神殿 ----------
function buildGodPane() {
  const g = bigBangGain();
  const sound = S.settings.sound, low = S.settings.quality === 'low';
  let bb;
  if (S.stage < MAX_STAGE) {
    bb = '<p class="evo-desc">' + formLabel(MAX_STAGE) + '「' + STAGES[MAX_STAGE].name + '」まで進化させると、宇宙をビッグバンで作り直せます。</p>';
  } else {
    bb = '<p class="evo-desc">この宇宙をリセットして、新しい宇宙を作ります。工場もお金も消えますが、神格が <b>+' + g + '</b> 増えます。</p>' +
      '<button type="button" class="primary" id="bbBtn"' + (g < 1 ? ' disabled' : '') + '>' + (UI.confirm === 'bb' ? '本当にビッグバンする' : 'ビッグバン') + '</button>';
  }
  $('#godPane').innerHTML =
    '<section class="card-sec"><div class="eyebrow2">神格</div><div class="div-big">' + S.divinity + '</div>' +
    '<p class="evo-desc">神格1につき、すべての収入とタップが +10%。いまは ×' + divMult().toFixed(1) + '</p></section>' +
    '<section class="card-sec next stack"><div><div class="eyebrow2">ビッグバン　宇宙 #' + S.universe + '</div>' +
    '<div class="evo-title">宇宙を作り直す</div></div>' + bb + '</section>' +
    '<section class="card-sec stack"><div class="eyebrow2">オンライン</div><div id="onlineSlot"></div></section>' +
    '<section class="card-sec"><div class="eyebrow2">記録</div><dl class="stats" id="statsDl"></dl></section>' +
    '<section class="card-sec stack"><div class="eyebrow2">設定</div>' +
    '<div class="set-row"><span>効果音</span><div class="seg" id="segSound"><button type="button" data-v="on" class="' + (sound ? 'on' : '') + '">オン</button><button type="button" data-v="off" class="' + (sound ? '' : 'on') + '">オフ</button></div></div>' +
    '<div class="set-row"><span>画質</span><div class="seg" id="segQuality"><button type="button" data-v="high" class="' + (low ? '' : 'on') + '">きれい</button><button type="button" data-v="low" class="' + (low ? 'on' : '') + '">軽い</button></div></div>' +
    '<button type="button" class="ghost danger" id="wipeBtn">' + (UI.confirm === 'wipe' ? '本当に消す（元に戻せません）' : 'セーブデータを消して最初から') + '</button></section>';
  onlineSig = '';
  refreshGodPane();
  renderOnline();
}

// ---------- オンライン（神殿の中） ----------
let onlineSig = '';

function onlineHTML(players) {
  if (Online.status === 'off') {
    return '<p class="evo-desc">オンラインは、Claudeのアーティファクトのリンクから開くか、Firebaseの設定を入れた版で使えます（README参照）。</p>';
  }
  if (Online.status === 'connecting') return '<p class="evo-desc">接続しています…</p>';
  if (Online.status === 'error') return '<p class="evo-desc err">' + esc(Online.error) + '</p>';
  if (Online.status !== 'in') {
    return '<label class="field">あなたの名前<input class="txt" id="onName" maxlength="12" value="' + esc(Online.name) + '"></label>' +
      '<button type="button" class="primary" id="onPublic">公開ロビーに入る（みんなと遊ぶ）</button>' +
      '<button type="button" class="ghost" id="onNew">友だち用の部屋を作る</button>' +
      '<div class="join"><input class="txt" id="onCode" maxlength="4" placeholder="4文字のコード" autocomplete="off" autocapitalize="characters">' +
      '<button type="button" class="ghost" id="onJoin">コードで参加</button></div>' +
      (Online.error ? '<p class="evo-desc err">' + esc(Online.error) + '</p>' : '');
  }
  const rows = players.map((p) => {
    const self = p.uid === Online.uid;
    return '<div class="row prow"><div class="meta"><div class="name">' + esc(p.name) + (self ? '<span class="own">（あなた）</span>' : '') + '</div>' +
      '<div class="sub">' + formLabel(p.stage) + ' ・ 毎秒' + yen(p.inc) + ' ・ 工場' + p.built + '棟</div></div>' +
      (self ? '' : '<div class="acts"><button type="button" class="ghost danger" data-attack="' + esc(p.uid) + '" data-kind="missile">ミサイル</button>' +
        '<button type="button" class="ghost" data-attack="' + esc(p.uid) + '" data-kind="jam">ジャミング</button></div>') + '</div>';
  }).join('');
  const head = Online.isPublic
    ? '<div class="room-code"><span>つながっている場所</span><b class="pub">公開ロビー</b></div>'
    : '<div class="room-code"><span>部屋のコード</span><b>' + esc(Online.code) + '</b></div>';
  return head +
    '<p class="evo-desc">仲間1人ごとに収入 +10%（最大 +50%）。いまは ×' + Online.coopFor(players.length).toFixed(2) + '</p>' +
    '<div class="plist">' + rows + '</div>' +
    '<p class="evo-desc">ミサイル: 当たると相手は持ち金の8%（最大は毎秒収入60秒分）を失います。45秒に1回。<br>' +
    'ジャミング: 当たると相手は' + Online.JAM_SECONDS + '秒間、収入が半分になります。60秒に1回。</p>' +
    (Online.error ? '<p class="evo-desc err">' + esc(Online.error) + '</p>' : '') +
    '<button type="button" class="ghost" id="onLeave">' + (Online.isPublic ? '公開ロビーを出る' : '部屋を出る') + '</button>';
}

function renderOnline() {
  const slot = $('#onlineSlot');
  if (!slot) return;
  const players = Online.status === 'in' ? Online.players() : [];
  const sig = [Online.status, Online.code, Online.error, Online.name,
    players.map((p) => p.uid + p.name + p.stage + p.inc + p.built).join(',')].join('|');
  if (sig !== onlineSig) {
    onlineSig = sig;
    slot.innerHTML = onlineHTML(players);
  }
  slot.querySelectorAll('[data-attack]').forEach((b) => {
    const kind = b.dataset.kind || 'missile';
    const left = Online.cooldownOf(kind);
    const name = kind === 'jam' ? 'ジャミング' : 'ミサイル';
    b.disabled = left > 0;
    b.textContent = left > 0 ? '再使用 ' + Math.ceil(left) + '秒' : name;
  });
}

function refreshGodPane() {
  const dl = $('#statsDl');
  if (!dl) return;
  const rows = [
    ['この宇宙で稼いだお金', yen(S.runTotal)],
    ['全宇宙で稼いだお金', yen(S.allTotal)],
    ['いまの毎秒収入', yen(liveIncome())],
    ['工場の数', totalBuilt() + ' 棟'],
    ['タップした回数', S.taps.toLocaleString('ja-JP') + ' 回'],
    ['プレイ時間', fmtTime(S.play)],
  ];
  dl.innerHTML = rows.map((r) => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
}

// ---------- 神の力 ----------
function buildPowers() {
  $('#powers').innerHTML = POWERS.map((p) =>
    '<button type="button" class="pw" data-pw="' + p.id + '" aria-label="' + p.name + '：' + p.desc + '">' +
    '<span class="orb">' + ICONS[p.id] + '<span class="cd"></span><span class="cdt"></span></span>' +
    '<span class="lbl">' + p.name + '</span></button>').join('');
}

function refreshPowers() {
  document.querySelectorAll('.pw').forEach((el) => {
    const p = POWERS.find((x) => x.id === el.dataset.pw);
    const locked = S.stage < p.stage;
    const cd = S.cd[p.id] || 0;
    const active = buffs.some((b) => b.id === p.id);
    el.classList.toggle('locked', locked);
    el.classList.toggle('ready', !locked && cd <= 0);
    el.classList.toggle('active', active);
    el.querySelector('.cd').style.setProperty('--p', locked ? 1 : cd / p.cd);
    el.querySelector('.cdt').textContent = locked ? '🔒' : cd > 0 ? Math.ceil(cd) : '';
    el.querySelector('.lbl').textContent = locked ? formLabel(p.stage) : p.name;
  });
}

// ---------- HUD ----------
function refreshHud() {
  const inc = liveIncome() * timeScale();
  $('#rate').textContent = '毎秒 ' + yen(inc);
  $('#tapv').textContent = 'タップ ' + yen(tapValue());
  $('#stageForm').textContent = formLabel(S.stage);
  $('#stageName').textContent = STAGES[S.stage].name;
  $('#stageSize').textContent = STAGES[S.stage].size.replace(/（.*）/, '');
  $('#buffs').innerHTML = buffs.map((b) => {
    const label = b.id === 'thunder' ? '神の雷 ×5' : b.id === 'warp' ? '時間 ×3' : b.id === 'jam' ? 'ジャミング ×0.5' : '熱狂 ×5';
    return '<span class="buff ' + b.id + '">' + label + '　' + Math.ceil(b.time) + '秒</span>';
  }).join('');
  $('#evoCta').hidden = !canEvolve() || !!W.trans;
}

function refreshMoney() {
  const s = yen(S.money);
  if (s !== UI.lastMoney) { $('#money').textContent = s; UI.lastMoney = s; }
}

function refreshSoundBtn() {
  $('#soundBtn').innerHTML = S.settings.sound ? ICONS.soundOn : ICONS.soundOff;
}

// ---------- タブ ----------
function setTab(tab) {
  UI.tab = tab;
  UI.confirm = null;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + tab));
  if (tab === 'fac') buildFacList();
  if (tab === 'upg') buildUpgList();
  if (tab === 'evo') buildEvoPane();
  if (tab === 'god') buildGodPane();
}

function refreshPanels() {
  if (UI.tab === 'fac') refreshFacList();
  if (UI.tab === 'evo') { if (UI.stageShown !== S.stage) buildEvoPane(); else refreshEvoPane(); }
  if (UI.tab === 'god') { refreshGodPane(); renderOnline(); }
  refreshUpgList();
  refreshEvoPane();
  refreshPowers();
  refreshHud();
}

// ---------- お知らせ ----------
function toast(msg) {
  if (UI.toastQ[UI.toastQ.length - 1] === msg) return;
  UI.toastQ.push(msg);
}

function updateToast(dt) {
  const el = $('#toast');
  if (UI.toastT > 0) {
    UI.toastT -= dt;
    if (UI.toastT <= 0) el.hidden = true;
    return;
  }
  if (UI.toastQ.length) {
    el.textContent = UI.toastQ.shift();
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    UI.toastT = 3.2;
  }
}

function showBanner(form, name, desc) {
  const b = $('#banner');
  $('#bForm').textContent = form;
  $('#bName').textContent = name;
  $('#bDesc').textContent = desc;
  b.hidden = true;
  void b.offsetWidth;
  b.hidden = false;
  clearTimeout(showBanner.t);
  showBanner.t = setTimeout(() => { b.hidden = true; }, 4300);
}

function showModal(title, body) {
  $('#mTitle').textContent = title;
  $('#mBody').innerHTML = body;
  $('#modal').hidden = false;
}

function shakeEl(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
