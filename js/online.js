'use strict';
/* オンライン: Firebase Realtime Database（無料枠）で部屋を作り、協力とミサイル攻撃をする。
   設定（js/online-config.js）が空のときは何もしない。
   注意: 攻撃の結果は受け取ったほうのブラウザで計算するため、改造すれば不正はできてしまう。 */

const Online = (() => {
  const NAME_KEY = 'planet-factory-name';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // I, L, O, 0, 1 は見間違えやすいので除く
  const CODE_RE = new RegExp('^[' + CODE_CHARS + ']{4}$');
  const SEND_EVERY = 4;           // 自分の状況を送る間隔（秒）
  const MISSILE_COOLDOWN = 45;    // 攻撃の再使用までの秒数
  const MISSILE_MAX_PCT = 0.08;   // 1発で失うお金の上限（持ち金の割合）
  const MISSILE_MAX_SEC = 60;     // 1発で失うお金の上限（毎秒収入の秒数）
  const COOP_PER_PLAYER = 0.1;    // 仲間1人ごとの収入ボーナス
  const COOP_MAX = 1.5;           // 協力ボーナスの上限

  let db = null, auth = null, uid = null, code = null, roomRef = null, name = null;
  let status = 'off';             // off: 未設定・準備中 / error: 失敗 / ready: 接続済み / in: 部屋の中
  let error = '';
  let joinedAt = 0, sendT = 0, cooldown = 0;
  let players = {};
  let unsubs = [];
  let handlers = { onChange() {}, onIncoming() {} };

  const configured = () => !!(window.PF_FIREBASE_CONFIG && window.PF_FIREBASE_CONFIG.databaseURL);
  const changed = () => handlers.onChange();

  function myName() {
    if (!name) {
      try { name = localStorage.getItem(NAME_KEY); } catch (e) { /* 保存できない環境では下で作る */ }
    }
    if (!name) {
      name = '神様' + Math.floor(10 + Math.random() * 90);
      try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* noop */ }
    }
    return name;
  }

  function setName(n) {
    const v = String(n || '').trim().slice(0, 12);
    if (!v) return;
    name = v;
    try { localStorage.setItem(NAME_KEY, v); } catch (e) { /* noop */ }
    if (status === 'in') publish();
    changed();
  }

  async function init(h) {
    handlers = { ...handlers, ...h };
    if (!configured()) { status = 'off'; return; }
    if (!window.firebase) {
      status = 'error';
      error = 'Firebaseを読み込めませんでした。インターネット接続を確認してください。';
      changed();
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.PF_FIREBASE_CONFIG);
      db = firebase.database();
      auth = firebase.auth();
      const c = await auth.signInAnonymously();
      uid = c.user.uid;
      status = 'ready';
    } catch (e) {
      status = 'error';
      error = '接続できませんでした。js/online-config.js の設定を確認してください。';
    }
    changed();
  }

  function randomCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  async function createRoom() {
    if (status !== 'ready') return;
    for (let i = 0; i < 8; i++) {
      const c = randomCode();
      const ref = db.ref('rooms/' + c);
      const snap = await ref.once('value');
      if (!snap.exists()) {
        await ref.set({ host: uid, created: Date.now() });
        enter(c);
        return;
      }
    }
    error = '部屋を作れませんでした。もう一度試してください。';
    changed();
  }

  async function joinRoom(input) {
    if (status !== 'ready') return;
    const c = String(input || '').trim().toUpperCase();
    if (!CODE_RE.test(c)) { error = 'コードは4文字です。'; changed(); return; }
    const snap = await db.ref('rooms/' + c).once('value');
    if (!snap.exists()) { error = '部屋が見つかりません。コードを確かめてください。'; changed(); return; }
    enter(c);
  }

  function enter(c) {
    detach();
    error = '';
    code = c;
    roomRef = db.ref('rooms/' + c);
    joinedAt = Date.now();
    status = 'in';
    roomRef.child('players/' + uid).onDisconnect().remove();
    publish();
    sendT = SEND_EVERY;

    const playersRef = roomRef.child('players');
    const missilesRef = roomRef.child('missiles');
    const onPlayers = (snap) => { players = snap.val() || {}; changed(); };
    const onMissile = (snap) => {
      const m = snap.val();
      if (!m || m.to !== uid) return;
      snap.ref.remove();                       // 自分宛てのミサイルは受け取ったら消す
      if (m.ts >= joinedAt - 3000) handlers.onIncoming(m);
    };
    playersRef.on('value', onPlayers);
    missilesRef.on('child_added', onMissile);
    unsubs = [
      () => playersRef.off('value', onPlayers),
      () => missilesRef.off('child_added', onMissile),
    ];
    changed();
  }

  // 監視をやめる（部屋の情報は残す）
  function detach() {
    unsubs.forEach((f) => f());
    unsubs = [];
  }

  function leaveRoom() {
    detach();
    if (roomRef) roomRef.child('players/' + uid).remove().catch(() => {});
    roomRef = null;
    code = null;
    players = {};
    if (status === 'in') status = 'ready';
    setCoop(1);
    changed();
  }

  function publish() {
    if (!roomRef) return;
    roomRef.child('players/' + uid).set({
      name: myName(), stage: S.stage, built: totalBuilt(), inc: Math.round(baseIncome()), t: Date.now(),
    }).catch(() => {});
  }

  const coopFor = (n) => Math.min(COOP_MAX, 1 + COOP_PER_PLAYER * Math.max(0, n - 1));

  function activePlayers() {
    return Object.entries(players)
      .filter(([, p]) => p)
      .map(([id, p]) => ({ uid: id, ...p }))
      .sort((a, b) => (a.uid === uid ? -1 : b.uid === uid ? 1 : 0));
  }

  // 毎フレーム呼ぶ。送信・協力ボーナス・攻撃の再使用時間
  function tick(dt) {
    if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
    if (status !== 'in') return;
    sendT -= dt;
    if (sendT <= 0) { sendT = SEND_EVERY; publish(); }
    setCoop(coopFor(activePlayers().length));
  }

  function attack(target) {
    if (status !== 'in' || cooldown > 0 || !target || target === uid) return false;
    roomRef.child('missiles').push({ from: uid, fromName: myName(), to: target, ts: Date.now() }).catch(() => {});
    cooldown = MISSILE_COOLDOWN;
    return true;
  }

  // 1発で失うお金（持ち金の8%と、毎秒収入60秒分のうち少ないほう）
  function missileLoss(money, income) {
    return Math.max(0, Math.min(money * MISSILE_MAX_PCT, income * MISSILE_MAX_SEC));
  }

  return {
    init, createRoom, joinRoom, setName, tick, attack, missileLoss, coopFor,
    leave: leaveRoom,
    players: activePlayers,
    configured,
    get status() { return status; },
    get error() { return error; },
    get code() { return code; },
    get uid() { return uid; },
    get cooldown() { return cooldown; },
    get name() { return myName(); },
  };
})();
