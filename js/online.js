'use strict';
/* オンライン: 部屋を作って、協力と妨害（ミサイル・ジャミング）をする。
   接続先は2つ。Claudeのアーティファクトの中では room / db、
   普通のブラウザでは Firebase（js/online-config.js の設定があるとき）を使う。どちらもなければオフ。
   開くと自動で、みんなが入る「公開ロビー」に入る。友だちだけの部屋（4文字のコード）も作れる。
   注意: 攻撃の結果は受け取ったほうのブラウザで計算するため、改造すれば不正はできてしまう。 */

// ---------- 接続先（Claude版） ----------
function claudeBackend(room, db, user) {
  let me = null, named = null;
  const missilesPath = (c) => 'rooms/' + c + '/missiles';
  return {
    async init() { me = await user.id(); return me; },
    async exists(c) { return (await db.doc('rooms/' + c).get()).exists; },
    async create(c) { await db.doc('rooms/' + c).set({ host: me, created: Date.now() }); },
    async join(c, cb) {
      named = await room.join('pf-' + c.toLowerCase());
      const stopPeers = named.onPeers(({ peers }) => cb.onPlayers(peers
        .filter((p) => p.kind === 'viewer' && p.by && p.presence)
        .map((p) => ({ uid: p.by, name: p.presence.name, stage: p.presence.stage, built: p.presence.built, inc: p.presence.inc }))),
        cb.onError);
      const stopMissiles = db.collection(missilesPath(c)).where('to', '==', me).onSnapshot((snap) => {
        for (const ch of snap.docChanges()) if (ch.type === 'added') cb.onMissile(ch.doc.data(), ch.doc.id);
      }, cb.onError);
      const leaving = named;
      return () => {
        stopPeers();
        stopMissiles();
        leaving.leave().catch(() => {});
        named = null;
      };
    },
    async publish(c, info) { if (named) await named.presence(info); },
    async send(c, to, payload) { await db.collection(missilesPath(c)).add({ ...payload, to }); },
    async removeMissile(c, id) { await db.doc(missilesPath(c) + '/' + id).delete(); },
  };
}

// ---------- 接続先（Firebase版） ----------
function firebaseBackend() {
  const database = firebase.database();
  let me = null, unsubs = [];
  return {
    async init() {
      if (!firebase.apps.length) firebase.initializeApp(window.PF_FIREBASE_CONFIG);
      const c = await firebase.auth().signInAnonymously();
      me = c.user.uid;
      return me;
    },
    async exists(c) { return (await database.ref('rooms/' + c).once('value')).exists(); },
    async create(c) { await database.ref('rooms/' + c).set({ host: me, created: Date.now() }); },
    async join(c, cb) {
      const playersRef = database.ref('rooms/' + c + '/players');
      const missilesRef = database.ref('rooms/' + c + '/missiles');
      const myRef = database.ref('rooms/' + c + '/players/' + me);
      myRef.onDisconnect().remove();
      const onPlayers = (snap) => {
        const v = snap.val() || {};
        cb.onPlayers(Object.entries(v).filter(([, p]) => p).map(([id, p]) => ({ uid: id, ...p })));
      };
      const onMissile = (snap) => {
        const m = snap.val();
        if (m && m.to === me) cb.onMissile(m, snap.key);
      };
      playersRef.on('value', onPlayers, cb.onError);
      missilesRef.on('child_added', onMissile, cb.onError);
      unsubs = [() => playersRef.off('value', onPlayers), () => missilesRef.off('child_added', onMissile)];
      return () => {
        unsubs.forEach((f) => f());
        unsubs = [];
        myRef.onDisconnect().cancel();
        myRef.remove().catch(() => {});
      };
    },
    async publish(c, info) { await database.ref('rooms/' + c + '/players/' + me).set(info); },
    async send(c, to, payload) { await database.ref('rooms/' + c + '/missiles').push({ ...payload, to }); },
    async removeMissile(c, id) { await database.ref('rooms/' + c + '/missiles/' + id).remove(); },
  };
}

const Online = (() => {
  const NAME_KEY = 'planet-factory-name';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // I, L, O, 0, 1 は見間違えやすいので除く
  const CODE_RE = new RegExp('^[' + CODE_CHARS + ']{4}$');
  const SEND_EVERY = 4;           // 自分の状況を送る間隔（秒）
  const COOLDOWN = { missile: 45, jam: 60 };   // 妨害の種類ごとの再使用までの秒数（サーバーも同じ値で守る）
  const JAM_SECONDS = 30;         // ジャミングで収入が下がる秒数
  const JAM_MULT = 0.5;           // ジャミング中の収入の倍率
  const MISSILE_MAX_PCT = 0.08;   // 1発で失うお金の上限（持ち金の割合）
  const MISSILE_MAX_SEC = 60;     // 1発で失うお金の上限（毎秒収入の秒数）
  const MISSILE_TTL = 10 * 60 * 1000;   // これより古いミサイルは当たらずに消す
  const COOP_PER_PLAYER = 0.1;    // 仲間1人ごとの収入ボーナス
  const COOP_MAX = 1.5;           // 協力ボーナスの上限

  const PUBLIC_CODE = 'PUBS';     // みんなが入る公開ロビーのコード
  let backend = null, uid = null, code = null, leaveFn = null, inRoom = false;
  let isPublic = false;           // いま公開ロビーにいるか
  let autoOn = true;              // 開いたら自動で公開ロビーに入る（自分で部屋を出たら、次に開くまで止める）
  let retry = 0;
  let status = 'off';             // off: この表示では使えない / connecting / ready / in / error
  let error = '';
  const cooldowns = { missile: 0, jam: 0 };
  let sendT = 0;
  let peerList = [];
  let name = null;
  let handlers = { onChange() {}, onIncoming() {} };
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
    if (inRoom) publish();
    changed();
  }

  // Claudeの中ならClaude版、そうでなく設定があればFirebase版
  async function pickBackend() {
    if (window.claude && typeof window.claude.use === 'function') {
      const [room, db, user] = await Promise.all(['room', 'db', 'user'].map((n) => window.claude.use(n)));
      if (room && db && user) return claudeBackend(room, db, user);
    }
    const cfg = window.PF_FIREBASE_CONFIG;
    if (cfg && cfg.databaseURL && window.firebase && firebase.database && firebase.auth) return firebaseBackend();
    return null;
  }

  async function init(h) {
    handlers = { ...handlers, ...h };
    backend = await pickBackend().catch(() => null);
    if (!backend) { status = 'off'; changed(); return; }
    status = 'connecting';
    changed();
    try {
      uid = await backend.init();
      status = uid ? 'ready' : 'off';
    } catch (e) {
      status = 'error';
      error = '接続できませんでした。設定（js/online-config.js）かネットを確認してください。';
      changed();
      scheduleReconnect();
      return;
    }
    changed();
    if (status === 'ready' && autoOn) joinPublic();
  }

  function randomCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  const failed = (msg) => { error = msg; changed(); };

  async function createRoom() {
    if (status !== 'ready') return;
    try {
      for (let i = 0; i < 8; i++) {
        const c = randomCode();
        if (!(await backend.exists(c))) {
          await backend.create(c);
          return enter(c);
        }
      }
      failed('部屋を作れませんでした。もう一度試してください。');
    } catch (e) {
      failed('部屋を作れませんでした。共同編集できる権限があるか確かめてください。');
    }
  }

  // 開いたら自動で入る公開ロビー。みんなが同じ1部屋（PUBS）に入る
  async function joinPublic() {
    if (status !== 'ready') return;
    try {
      if (!(await backend.exists(PUBLIC_CODE))) await backend.create(PUBLIC_CODE);
      await enter(PUBLIC_CODE, true);
    } catch (e) {
      failed('公開ロビーに入れませんでした。');
    }
  }

  // 通信が切れたら、数秒おきに最大5回、つなぎ直して公開ロビーに戻る
  function scheduleReconnect() {
    if (!autoOn || retry >= 5) return;
    retry++;
    setTimeout(async () => {
      if (!autoOn || inRoom) return;
      try {
        uid = await backend.init();
        status = uid ? 'ready' : 'off';
        changed();
        if (status === 'ready') await joinPublic();
        if (inRoom) retry = 0; else scheduleReconnect();
      } catch (e) {
        status = 'error';
        changed();
        scheduleReconnect();
      }
    }, 3000);
  }

  async function joinRoom(input) {
    if (status !== 'ready') return;
    const c = String(input || '').trim().toUpperCase();
    if (!CODE_RE.test(c)) return failed('コードは4文字です。');
    try {
      if (!(await backend.exists(c))) return failed('部屋が見つかりません。コードを確かめてください。');
      await enter(c);
    } catch (e) {
      failed('部屋に入れませんでした。もう一度試してください。');
    }
  }

  // 部屋の中で起きたエラー（接続が切れた・権限がない など）は、部屋を出た状態にして知らせる
  function onRoomError() {
    const wasPublic = isPublic;
    leaveRoom(false);
    if (wasPublic && autoOn) {
      failed('接続が切れました。つなぎ直しています…');
      scheduleReconnect();
    } else {
      failed('部屋との接続が切れました。もう一度入り直してください。');
    }
  }

  async function enter(c, auto = false) {
    leaveRoom(false);
    error = '';
    const cb = {
        name: myName(),
        onPlayers(list) { peerList = list; changed(); },
        onMissile(m, id) {
          backend.removeMissile(c, id).catch(() => {});   // 受け取ったら消す
          if (m.to === uid && Date.now() - m.ts < MISSILE_TTL) handlers.onIncoming(m);
        },
        onNotice(msg) { failed(msg); },   // 部屋は保ったまま知らせる（再使用中など）
        onError: onRoomError,
    };
    try {
      leaveFn = await backend.join(c, cb);
    } catch (e) {
      return failed(auto ? '公開ロビーに入れませんでした。' : '部屋に入れませんでした。もう一度試してください。');
    }
    code = c;
    isPublic = auto;
    inRoom = true;
    status = 'in';
    retry = 0;
    publish();
    sendT = SEND_EVERY;
    changed();
  }

  function leaveRoom(notify = true) {
    if (leaveFn) leaveFn();
    leaveFn = null;
    inRoom = false;
    isPublic = false;
    code = null;
    peerList = [];
    if (status === 'in') status = 'ready';
    setCoop(1);
    if (notify) changed();
  }

  function publish() {
    if (!inRoom) return;
    backend.publish(code, { name: myName(), stage: S.stage, built: totalBuilt(), inc: Math.round(baseIncome()), t: Date.now() })
      .catch(() => {});
  }

  const coopFor = (n) => Math.min(COOP_MAX, 1 + COOP_PER_PLAYER * Math.max(0, n - 1));

  function activePlayers() {
    return peerList
      .filter((p) => p.uid && p.name)
      .sort((a, b) => (a.uid === uid ? -1 : b.uid === uid ? 1 : 0));
  }

  // 毎フレーム呼ぶ。自分の状況の送信・協力ボーナス・妨害の再使用時間
  function tick(dt) {
    for (const k of Object.keys(cooldowns)) if (cooldowns[k] > 0) cooldowns[k] = Math.max(0, cooldowns[k] - dt);
    if (!inRoom) return;
    sendT -= dt;
    if (sendT <= 0) { sendT = SEND_EVERY; publish(); }
    setCoop(coopFor(activePlayers().length));
  }

  // kind: 'missile'（持ち金を奪う）または 'jam'（しばらく収入を下げる）
  function attack(target, kind = 'missile') {
    if (status !== 'in' || !inRoom || !(kind in COOLDOWN) || cooldowns[kind] > 0 || !target || target === uid) return false;
    backend.send(code, target, { kind, from: uid, fromName: myName(), ts: Date.now() })
      .catch(() => failed('撃てませんでした。共同編集できる権限が必要です。'));
    cooldowns[kind] = COOLDOWN[kind];
    return true;
  }

  // 1発で失うお金（持ち金の8%と、毎秒収入60秒分のうち少ないほう）
  function missileLoss(money, income) {
    return Math.max(0, Math.min(money * MISSILE_MAX_PCT, income * MISSILE_MAX_SEC));
  }

  return {
    init, createRoom, joinRoom, joinPublic, setName, tick, attack, missileLoss, coopFor,
    JAM_SECONDS, JAM_MULT,
    // 自分で部屋を出たときは、自動で戻らない（「公開ロビーに入る」を押すと、また自動で入る）
    leave: () => { autoOn = false; leaveRoom(true); },
    enablePublic: () => { autoOn = true; retry = 0; return joinPublic(); },
    get isPublic() { return isPublic; },
    players: activePlayers,
    cooldownOf: (kind) => cooldowns[kind] || 0,
    get status() { return status; },
    get error() { return error; },
    get code() { return code; },
    get uid() { return uid; },
    get name() { return myName(); },
  };
})();
