'use strict';
/* セーブデータと経済の計算。画面や3Dには触らない。 */

const SAVE_KEY = 'planet-factory-save-v1';
const OFFLINE_CAP = 6 * 3600;   // 留守中に稼げる最大時間
const OFFLINE_RATE = 0.5;        // 留守中の稼ぎは50%

function freshState() {
  const owned = {};
  FACTORIES.forEach((f) => { owned[f.id] = 0; });
  return {
    v: 1,
    money: 0,
    runTotal: 0,      // この宇宙で稼いだ合計（ビッグバンで0に）
    allTotal: 0,      // 全宇宙の合計
    owned,
    upg: {},
    stage: 0,
    divinity: 0,      // 神格（ビッグバンで増える永続ボーナス）
    universe: 1,
    taps: 0,
    built: 0,
    play: 0,
    cd: {},
    last: Date.now(),
    seed: Math.floor(Math.random() * 1e9),
    intro: false,
    hints: {},
    settings: { sound: true, quality: 'high' },
  };
}

function mergeState(raw) {
  const s = freshState();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of Object.keys(s)) {
    if (!(k in raw)) continue;
    const def = s[k], val = raw[k];
    if (def && typeof def === 'object') {
      if (val && typeof val === 'object') Object.assign(def, val);
    } else if (typeof val === typeof def) {
      s[k] = val;
    }
  }
  FACTORIES.forEach((f) => { s.owned[f.id] = Math.max(0, Math.floor(+s.owned[f.id] || 0)); });
  s.stage = Math.max(0, Math.min(MAX_STAGE, Math.floor(s.stage)));
  if (!isFinite(s.money) || s.money < 0) s.money = 0;
  return s;
}

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeSave() {
  S.last = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境でも遊べる */ }
}

function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}

let S = freshState();

// 一時的な効果（保存しない）
const buffs = [];   // {id, mult, time, dur}

// ---------- 経済 ----------
const stageMult = (st) => Math.pow(STAGE_MULT, st);
const divMult = () => 1 + 0.1 * S.divinity;

function factoryMult(id) {
  let m = 1;
  for (const u of FACT_UPGS[id]) if (S.upg[u.id]) m *= 2;
  return m;
}

let coopMult = 1;                 // オンラインで仲間がいるときの収入ボーナス（保存しない）
const setCoop = (m) => { coopMult = m; };

function globalMult() {
  let m = stageMult(S.stage) * divMult() * coopMult;
  for (const g of GLOBAL_UPGS) if (S.upg[g.id]) m *= g.mult;
  return m;
}

// 1棟あたりの毎秒収入（一時効果なし）
const unitIncome = (f) => f.inc * factoryMult(f.id) * globalMult();

// 毎秒収入（一時効果なし）
function baseIncome() {
  let s = 0;
  for (const f of FACTORIES) if (S.owned[f.id]) s += S.owned[f.id] * f.inc * factoryMult(f.id);
  return s * globalMult();
}

function buffMult() {
  let m = 1;
  for (const b of buffs) m *= b.mult;
  return m;
}
const timeScale = () => (buffs.some((b) => b.id === 'warp') ? 3 : 1);
const liveIncome = () => baseIncome() * buffMult();

function tapValue() {
  let m = 1, p = 0;
  for (const u of TAP_UPGS) {
    if (!S.upg[u.id]) continue;
    if (u.mult) m *= u.mult;
    if (u.pct) p += u.pct;
  }
  return (stageMult(S.stage) * divMult() * m + baseIncome() * p) * buffMult();
}

const totalBuilt = () => FACTORIES.reduce((a, f) => a + S.owned[f.id], 0);

function earn(v) {
  if (!(v > 0)) return;
  S.money += v;
  S.runTotal += v;
  S.allTotal += v;
}

// 買う数(1/10/100/'max')に応じた個数と値段
function buyQuote(f, qty) {
  const first = f.cost * Math.pow(COST_GROWTH, S.owned[f.id]);
  let n = qty;
  if (qty === 'max') {
    n = Math.floor(Math.log(S.money * (COST_GROWTH - 1) / first + 1) / Math.log(COST_GROWTH));
    n = Math.max(1, n);
  }
  const cost = first * (Math.pow(COST_GROWTH, n) - 1) / (COST_GROWTH - 1);
  return { n, cost };
}

function upgradeVisible(u) {
  if (S.upg[u.id]) return false;
  if (u.kind === 'fac') return FACTORY_BY_ID[u.fac].stage <= S.stage && S.owned[u.fac] >= u.need;
  if (u.kind === 'tap') return S.runTotal >= u.cost * 0.2;
  if (u.kind === 'glob') return S.stage >= u.stage;
  return false;
}

function nextStage() { return S.stage < MAX_STAGE ? STAGES[S.stage + 1] : null; }

function canEvolve() {
  const nx = nextStage();
  return !!nx && S.money >= nx.cost && totalBuilt() >= nx.need;
}

const bigBangGain = () => Math.floor(10 * Math.sqrt(S.runTotal / 1e14));
const canBigBang = () => S.stage >= MAX_STAGE && bigBangGain() >= 1;

function addBuff(id, mult, dur) {
  const b = buffs.find((x) => x.id === id);
  if (b) { b.time = Math.max(b.time, dur); b.dur = dur; return; }
  buffs.push({ id, mult, time: dur, dur });
}

function tickBuffs(dt) {
  for (let i = buffs.length - 1; i >= 0; i--) {
    buffs[i].time -= dt;
    if (buffs[i].time <= 0) buffs.splice(i, 1);
  }
  for (const k of Object.keys(S.cd)) {
    S.cd[k] = Math.max(0, S.cd[k] - dt);
  }
}
