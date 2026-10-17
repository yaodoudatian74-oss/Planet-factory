'use strict';
/* オンライン: Claudeのアーティファクトの機能（room と db）で部屋を作り、協力とミサイル攻撃をする。
   Claudeのアーティファクトの外（ダウンロードしたHTMLなど）では、この機能はオフのまま。
   注意: 攻撃の結果は受け取ったほうのブラウザで計算するため、改造すれば不正はできてしまう。 */

const Online = (() => {
  const NAME_KEY = 'planet-factory-name';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // I, L, O, 0, 1 は見間違えやすいので除く
  const CODE_RE = new RegExp('^[' + CODE_CHARS + ']{4}$');
  const SEND_EVERY = 4;           // 自分の状況を送る間隔（秒）
  const MISSILE_COOLDOWN = 45;    // 攻撃の再使用までの秒数
  const MISSILE_MAX_PCT = 0.08;   // 1発で失うお金の上限（持ち金の割合）
  const MISSILE_MAX_SEC = 60;     // 1発で失うお金の上限（毎秒収入の秒数）
  const MISSILE_TTL = 10 * 60 * 1000;   // これより古いミサイルは当たらずに消す
  const COOP_PER_PLAYER = 0.1;    // 仲間1人ごとの収入ボーナス
  const COOP_MAX = 1.5;           // 協力ボーナスの上限

  let claudeRoom = null, claudeDb = null, claudeUser = null;
  let uid = null, code = null, named = null, missilesUnsub = null, peersUnsub = null;
  let status = 'off';             // off: この表示では使えない / connecting / ready / in / error
  let error = '';
  let cooldown = 0, sendT = 0;
  let peerList = [];
  let name = null;
  let handlers = { onChange() {}, onIncoming() {} };
  const changed = () => handlers.onChange();
  const missilesPath = (c) => 'rooms/' + c + '/missiles';

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
    if (named) publish();
    changed();
  }

  async function init(h) {
    handlers = { ...handlers, ...h };
    if (!window.claude || typeof window.claude.use !== 'function') { status = 'off'; return; }
    status = 'connecting';
    changed();
    try {
      [claudeRoom, claudeDb, claudeUser] = await Promise.all(['room', 'db', 'user'].map((n) => window.claude.use(n)));
      uid = claudeUser ? await claudeUser.id() : null;
      status = claudeRoom && claudeDb && uid ? 'ready' : 'off';
    } catch (e) {
      status = 'error';
      error = '接続できませんでした。ページを開き直してください。';
    }
    changed();
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
        const doc = claudeDb.doc('rooms/' + c);
        const snap = await doc.get();
        if (!snap.exists) {
          await doc.set({ host: uid, created: Date.now() });
          return enter(c);
        }
      }
      failed('部屋を作れませんでした。もう一度試してください。');
    } catch (e) {
      failed('部屋を作れませんでした。共同編集できる権限があるか確かめてください。');
    }
  }

  async function joinRoom(input) {
    if (status !== 'ready') return;
    const c = String(input || '').trim().toUpperCase();
    if (!CODE_RE.test(c)) return failed('コードは4文字です。');
    try {
      const snap = await claudeDb.doc('rooms/' + c).get();
      if (!snap.exists) return failed('部屋が見つかりません。コードを確かめてください。');
      enter(c);
    } catch (e) {
      failed('部屋に入れませんでした。もう一度試してください。');
    }
  }

  // 部屋の中で起きたエラー（接続が切れた・権限がない など）は、部屋を出た状態にして知らせる
  function onRoomError(e) {
    leaveRoom(false);
    failed('部屋との接続が切れました。もう一度入り直してください。');
  }

  async function enter(c) {
    leaveRoom(false);
    error = '';
    code = c;
    status = 'in';
    changed();
    let room;
    try {
      room = await claudeRoom.join('pf-' + c.toLowerCase());
    } catch (e) {
      code = null;
      status = 'ready';
      return failed('部屋に入れませんでした。もう一度試してください。');
    }
    named = room;
    publish();
    sendT = SEND_EVERY;
    peersUnsub = room.onPeers(({ peers }) => { peerList = peers; changed(); }, onRoomError);
    missilesUnsub = claudeDb.collection(missilesPath(c)).where('to', '==', uid).onSnapshot((snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type !== 'added') continue;
        const m = ch.doc.data();
        claudeDb.doc(missilesPath(c) + '/' + ch.doc.id).delete().catch(() => {});   // 受け取ったら消す
        if (m && m.to === uid && Date.now() - m.ts < MISSILE_TTL) handlers.onIncoming(m);
      }
    }, onRoomError);
  }

  function leaveRoom(notify = true) {
    if (missilesUnsub) missilesUnsub();
    if (peersUnsub) peersUnsub();
    missilesUnsub = peersUnsub = null;
    if (named) named.leave().catch(() => {});
    named = null;
    code = null;
    peerList = [];
    if (status === 'in') status = 'ready';
    setCoop(1);
    if (notify) changed();
  }

  function publish() {
    if (!named) return;
    named.presence({ name: myName(), stage: S.stage, built: totalBuilt(), inc: Math.round(baseIncome()) }).catch(() => {});
  }

  const coopFor = (n) => Math.min(COOP_MAX, 1 + COOP_PER_PLAYER * Math.max(0, n - 1));

  function activePlayers() {
    return peerList
      .filter((p) => p.kind === 'viewer' && p.by && p.presence && p.presence.name)
      .map((p) => ({ uid: p.by, name: p.presence.name, stage: p.presence.stage, built: p.presence.built, inc: p.presence.inc }))
      .sort((a, b) => (a.uid === uid ? -1 : b.uid === uid ? 1 : 0));
  }

  // 毎フレーム呼ぶ。自分の状況の送信・協力ボーナス・攻撃の再使用時間
  function tick(dt) {
    if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
    if (status !== 'in' || !named) return;
    sendT -= dt;
    if (sendT <= 0) { sendT = SEND_EVERY; publish(); }
    setCoop(coopFor(activePlayers().length));
  }

  function attack(target) {
    if (status !== 'in' || !named || cooldown > 0 || !target || target === uid) return false;
    claudeDb.collection(missilesPath(code))
      .add({ from: uid, fromName: myName(), to: target, ts: Date.now() })
      .catch(() => failed('ミサイルを撃てませんでした。共同編集できる権限が必要です。'));
    cooldown = MISSILE_COOLDOWN;
    return true;
  }

  // 1発で失うお金（持ち金の8%と、毎秒収入60秒分のうち少ないほう）
  function missileLoss(money, income) {
    return Math.max(0, Math.min(money * MISSILE_MAX_PCT, income * MISSILE_MAX_SEC));
  }

  return {
    init, createRoom, joinRoom, setName, tick, attack, missileLoss, coopFor,
    leave: () => leaveRoom(true),
    players: activePlayers,
    get status() { return status; },
    get error() { return error; },
    get code() { return code; },
    get uid() { return uid; },
    get cooldown() { return cooldown; },
    get name() { return myName(); },
  };
})();
