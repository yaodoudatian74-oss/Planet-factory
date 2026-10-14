'use strict';
/* ゲームデータ: 工場・惑星の形態・強化・神の力。数値はシミュレーションで調整済み
   （普通に遊んで第10形態まで約1時間）。 */

// ---------- 数字の表示（日本の命数法） ----------
const UNITS = ['', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載', '極', '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数'];

function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 10 && n % 1 !== 0) return (Math.floor(n * 10) / 10).toFixed(1);
  if (n < 1e4) return Math.floor(n).toLocaleString('ja-JP');
  let u = Math.floor(Math.log10(n) / 4);
  let v = n / Math.pow(10, u * 4);
  if (v >= 1e4) { u += 1; v /= 1e4; }          // 浮動小数の誤差対策
  if (v < 1) { u -= 1; v *= 1e4; }
  if (u >= UNITS.length) return n.toExponential(2);
  let s;
  if (v >= 1000) s = String(Math.floor(v));
  else if (v >= 100) s = (Math.floor(v * 10) / 10).toFixed(1);
  else if (v >= 10) s = (Math.floor(v * 100) / 100).toFixed(2);
  else s = (Math.floor(v * 1000) / 1000).toFixed(3);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s + UNITS[u];
}
const yen = (n) => '¥' + fmt(n);

function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return h + '時間' + m + '分';
  if (m > 0) return m + '分' + s + '秒';
  return s + '秒';
}

// ---------- 工場 ----------
// cost: 1棟目の値段, inc: 1棟あたり毎秒収入, stage: 解放される形態(0始まり), size: 3Dモデルの大きさ
const FACTORIES = [
  { id: 'mine',    name: '採掘場',           desc: '地面を掘って鉱石を売る。すべての始まり。',   cost: 15,     inc: 0.3,   stage: 0, size: 0.9 },
  { id: 'smelter', name: '製鉄所',           desc: '鉱石を溶かして鉄にする。煙がもくもく。',     cost: 150,    inc: 2,     stage: 0, size: 1.0 },
  { id: 'power',   name: '発電所',           desc: '巨大な冷却塔で、星じゅうに電気を送る。',     cost: 2000,   inc: 14,    stage: 1, size: 1.05 },
  { id: 'robot',   name: 'ロボット工場',     desc: 'ロボットがロボットを作る。休まない。',       cost: 3e4,    inc: 100,   stage: 2, size: 1.1 },
  { id: 'chip',    name: '半導体工場',       desc: '星の頭脳になるチップを量産する。',           cost: 5e5,    inc: 700,   stage: 3, size: 1.15 },
  { id: 'port',    name: '宇宙港',           desc: '製品をロケットで宇宙じゅうに出荷！',         cost: 9e6,    inc: 5000,  stage: 4, size: 1.25 },
  { id: 'fusion',  name: '核融合炉',         desc: '小さな太陽を地上にともす。',                 cost: 1.7e8,  inc: 3.5e4, stage: 5, size: 1.3 },
  { id: 'anti',    name: '反物質工場',       desc: '1グラムで国が買える燃料を作る。',            cost: 3.5e9,  inc: 2.5e5, stage: 6, size: 1.35 },
  { id: 'hole',    name: 'ブラックホール炉', desc: '重力そのものを電気に変える。',               cost: 8e10,   inc: 1.8e6, stage: 7, size: 1.45 },
  { id: 'dim',     name: '次元工場',         desc: 'となりの次元の工場に外注する。',             cost: 2e12,   inc: 1.3e7, stage: 7, size: 1.5 },
  { id: 'genesis', name: '創世エンジン',     desc: '無から有を生み出す、神の機械。',             cost: 5e13,   inc: 1e8,   stage: 8, size: 1.65 },
  { id: 'cosmos',  name: '宇宙創造機',       desc: '新しい宇宙を毎秒プリントする。',             cost: 1.5e15, inc: 8e8,   stage: 9, size: 1.8 },
];
const FACTORY_BY_ID = {};
FACTORIES.forEach((f, i) => { f.index = i; FACTORY_BY_ID[f.id] = f; });

const COST_GROWTH = 1.15;   // 1棟建てるごとに値段が1.15倍
const STAGE_MULT = 1.7;     // 進化1回ごとに全収入が1.7倍

// ---------- 惑星の形態（進化） ----------
// R: 3D上の半径, cost/need: その形態へ進化するためのお金と工場の合計数
const STAGES = [
  { name: '荒野の星',       size: '直径 3,400 km（月くらい）',          R: 1.0,  cost: 0,      need: 0,
    desc: 'なにもない岩のかたまり。ここから神の工場づくりが始まる。' },
  { name: '採掘の星',       size: '直径 6,800 km（火星くらい）',        R: 1.12, cost: 1000,   need: 10,
    desc: '地殻を掘りまくった。割れ目から溶岩の光がもれだす。' },
  { name: '鋼鉄の星',       size: '直径 1.3万 km（地球くらい）',        R: 1.26, cost: 2.5e4,  need: 25,
    desc: '地表が鉄板でおおわれはじめた。星が金属の音をたてる。' },
  { name: '機械の星',       size: '直径 5万 km（海王星くらい）',        R: 1.42, cost: 6e5,    need: 45,
    desc: '星そのものが巨大な機械に。光る回路が地表を走る。' },
  { name: '都市の星',       size: '直径 14万 km（木星くらい）',         R: 1.6,  cost: 1.5e7,  need: 70,
    desc: '地表すべてが工場都市。夜の側が黄金に輝き、環ができた。' },
  { name: 'ネオンの星',     size: '直径 140万 km（太陽くらい）',        R: 1.8,  cost: 3e8,    need: 100,
    desc: 'ネオンが脈打つ、眠らない星。ついに月まで工場にした。' },
  { name: '軌道リングの星', size: '直径 3億 km（地球の公転軌道くらい）', R: 2.0,  cost: 6e9,    need: 135,
    desc: '星を一周する軌道リングと、宇宙エレベーターが完成。' },
  { name: '恒星工場の星',   size: '直径 120億 km（太陽系くらい）',      R: 2.25, cost: 1.2e11, need: 175,
    desc: '太陽をまるごと工場に組み込んだ。ダイソン球、稼働開始。' },
  { name: '神の星',         size: '直径 1光年',                         R: 2.5,  cost: 2.5e12, need: 220,
    desc: '黄金に輝く、神のための星。頭上に光の輪が浮かぶ。' },
  { name: '創世の星',       size: '直径 10万光年（銀河くらい）',        R: 2.8,  cost: 5e13,   need: 270,
    desc: 'この星はもう、ひとつの宇宙そのものだ。' },
];
const MAX_STAGE = STAGES.length - 1;
const formLabel = (st) => '第' + (st + 1) + '形態';

// 惑星シェーダーの見た目パラメータ（形態ごと）
const LOOKS = [
  { colA: '#24170f', colB: '#5e3f2a', colC: '#a3876a', lava: 0.0,  lavaCol: '#ff6a1a', grid: 0.0,  gridCol: '#9aa3b5', circuit: 0.0,  circCol: '#3fdcff', city: 0.0,  cityCol: '#ffd27a', metal: 0.05, atmo: '#d08a55', atmoK: 0.55, iri: 0.0 },
  { colA: '#1b120d', colB: '#4a3426', colC: '#8a705a', lava: 0.9,  lavaCol: '#ff5a14', grid: 0.12, gridCol: '#9aa3b5', circuit: 0.0,  circCol: '#3fdcff', city: 0.05, cityCol: '#ffbf66', metal: 0.12, atmo: '#ff7a3d', atmoK: 0.7,  iri: 0.0 },
  { colA: '#1f2328', colB: '#474d55', colC: '#8f969e', lava: 0.35, lavaCol: '#ff6a1a', grid: 0.55, gridCol: '#c3ccd6', circuit: 0.1,  circCol: '#ffb347', city: 0.12, cityCol: '#ffcf7a', metal: 0.55, atmo: '#a9bdd4', atmoK: 0.6,  iri: 0.0 },
  { colA: '#121519', colB: '#2a3139', colC: '#5d6874', lava: 0.1,  lavaCol: '#ff6a1a', grid: 0.85, gridCol: '#8c9aa8', circuit: 0.75, circCol: '#35d9ff', city: 0.18, cityCol: '#9be9ff', metal: 0.65, atmo: '#38d6ff', atmoK: 0.7,  iri: 0.0 },
  { colA: '#16171f', colB: '#323446', colC: '#6c6f88', lava: 0.0,  lavaCol: '#ff6a1a', grid: 0.92, gridCol: '#a7adc8', circuit: 0.4,  circCol: '#ffcf6b', city: 0.6,  cityCol: '#ffc95e', metal: 0.5,  atmo: '#5fa2ff', atmoK: 0.8,  iri: 0.0 },
  { colA: '#100820', colB: '#29173f', colC: '#4f3070', lava: 0.0,  lavaCol: '#ff3fa8', grid: 0.92, gridCol: '#ff4fd8', circuit: 0.95, circCol: '#2ef2ff', city: 0.65, cityCol: '#ff5fd2', metal: 0.6,  atmo: '#b84dff', atmoK: 0.9,  iri: 0.05 },
  { colA: '#1a1f29', colB: '#3d4759', colC: '#b0bfd2', lava: 0.0,  lavaCol: '#ff6a1a', grid: 1.0,  gridCol: '#eef4ff', circuit: 0.6,  circCol: '#7fb4ff', city: 0.72, cityCol: '#cfe6ff', metal: 0.8,  atmo: '#8fc7ff', atmoK: 0.9,  iri: 0.05 },
  { colA: '#160b06', colB: '#3a1d10', colC: '#7d4a28', lava: 0.75, lavaCol: '#ff8a2a', grid: 0.9,  gridCol: '#ffb070', circuit: 0.85, circCol: '#ffae3a', city: 0.8,  cityCol: '#ffd28a', metal: 0.6,  atmo: '#ff9a3d', atmoK: 1.0,  iri: 0.08 },
  { colA: '#4d3510', colB: '#b38b3b', colC: '#fff0c2', lava: 0.0,  lavaCol: '#fff2b0', grid: 0.7,  gridCol: '#fff6da', circuit: 0.75, circCol: '#ffffff', city: 0.85, cityCol: '#fff3c0', metal: 0.95, atmo: '#ffd86b', atmoK: 1.1,  iri: 0.25 },
  { colA: '#0b0820', colB: '#3a2a7a', colC: '#e6e0ff', lava: 0.2,  lavaCol: '#ff7ad9', grid: 0.6,  gridCol: '#ffffff', circuit: 1.0,  circCol: '#ff7ad9', city: 1.0,  cityCol: '#ffffff', metal: 0.85, atmo: '#b48cff', atmoK: 1.2,  iri: 0.85 },
];
const LOOK_COLOR_KEYS = ['colA', 'colB', 'colC', 'lavaCol', 'gridCol', 'circCol', 'cityCol', 'atmo'];
const LOOK_NUM_KEYS = ['lava', 'grid', 'circuit', 'city', 'metal', 'atmoK', 'iri'];

// ---------- 強化 ----------
const TIER_OWNED = [1, 10, 25, 50, 100, 150, 200, 300];
const TIER_COSTX = [10, 100, 2000, 5e4, 2e6, 1e8, 5e9, 3e11];
const TIER_NAMES = ['改良', '自動化', '高速化', 'AI化', '量子化', '超光速化', '次元化', '神格化'];

const UPGRADES = [];
const FACT_UPGS = {};
FACTORIES.forEach((f) => {
  FACT_UPGS[f.id] = [];
  TIER_OWNED.forEach((need, t) => {
    const u = { id: f.id + '_' + t, kind: 'fac', fac: f.id, need, cost: f.cost * TIER_COSTX[t],
      name: f.name + 'の' + TIER_NAMES[t], desc: f.name + 'の生産 ×2' };
    UPGRADES.push(u);
    FACT_UPGS[f.id].push(u);
  });
});

const TAP_UPGS = [
  { name: '神の指先',     cost: 60,   mult: 2 },
  { name: '神のデコピン', cost: 600,  mult: 2 },
  { name: '神の手のひら', cost: 8000, pct: 0.01 },
  { name: '神の拍手',     cost: 2e5,  pct: 0.01 },
  { name: '神のげんこつ', cost: 5e6,  pct: 0.02 },
  { name: '神の連打',     cost: 2e8,  pct: 0.02 },
  { name: '神の一撃',     cost: 1e10, pct: 0.03 },
  { name: '神の全力',     cost: 5e11, pct: 0.03 },
  { name: '神の本気',     cost: 3e13, pct: 0.04 },
];
TAP_UPGS.forEach((u, i) => {
  u.id = 'tap_' + i;
  u.kind = 'tap';
  u.desc = u.mult ? 'タップ収入 ×' + u.mult : 'タップするたびに毎秒収入の' + Math.round(u.pct * 100) + '%を追加';
  UPGRADES.push(u);
});

const GLOBAL_NAMES = ['24時間操業', 'ベルトコンベア網', '惑星規模の自動化', '物流の最適化', 'ネオン広告',
  '軌道物流網', '恒星エネルギー直結', '神の加護', '宇宙の理'];
const GLOBAL_UPGS = GLOBAL_NAMES.map((name, i) => ({
  id: 'glob_' + (i + 1), kind: 'glob', name, stage: i + 1, cost: STAGES[i + 1].cost * 2, mult: 1.25,
  desc: '全工場の生産 +25%',
}));
GLOBAL_UPGS.forEach((u) => UPGRADES.push(u));
const UPGRADE_BY_ID = {};
UPGRADES.forEach((u) => { UPGRADE_BY_ID[u.id] = u; });

// ---------- 神の力 ----------
const POWERS = [
  { id: 'thunder', name: '神の雷',   stage: 1, cd: 75,  desc: '20秒間、生産とタップが ×5' },
  { id: 'rain',    name: '黄金の雨', stage: 2, cd: 110, desc: '毎秒収入の60秒分のお金が降ってくる' },
  { id: 'warp',    name: '時間加速', stage: 4, cd: 160, desc: '20秒間、時間の流れが3倍になる' },
  { id: 'meteor',  name: '星降り',   stage: 6, cd: 200, desc: '金色の隕石を3つ呼び寄せる' },
];

// ---------- アイコン(SVG) ----------
const ICONS = {
  thunder: '<svg viewBox="0 0 24 24"><path d="M13.5 2 4.5 13.5h6l-1.5 8.5 9.5-12h-6.2z"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><circle cx="7" cy="6.5" r="3.2"/><circle cx="16.5" cy="10" r="3.2"/><circle cx="9.5" cy="16.5" r="3.2"/><circle cx="18" cy="19" r="2"/></svg>',
  warp: '<svg viewBox="0 0 24 24"><path d="M3 5.5 11 12l-8 6.5zm9 0 8 6.5-8 6.5z"/></svg>',
  meteor: '<svg viewBox="0 0 24 24"><circle cx="15.5" cy="8.5" r="4.5"/><path d="M12.2 12.6 3.5 21.3l-1-1 8.7-8.7zM10.3 9.6l-6.4 6.4-1-1 6.4-6.4zM15.6 14.4l-5.6 5.6-1-1 5.6-5.6z"/></svg>',
  tap: '<svg viewBox="0 0 24 24"><path d="M9.5 2.8a1.7 1.7 0 0 1 1.7 1.7v6.2h.6V8.9a1.6 1.6 0 0 1 3.2 0v1.8h.5v-.9a1.6 1.6 0 0 1 3.2 0v5.1a6.7 6.7 0 0 1-6.7 6.7h-.8a6.4 6.4 0 0 1-5.2-2.7l-3-4.2a1.6 1.6 0 0 1 2.6-1.9l2.2 2.7V4.5a1.7 1.7 0 0 1 1.7-1.7z"/></svg>',
  glob: '<svg viewBox="0 0 24 24"><path d="m12 2 2.9 6.6 7.1.6-5.4 4.8 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>',
};
