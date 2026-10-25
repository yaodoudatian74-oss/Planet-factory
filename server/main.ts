// オンラインの部屋サーバー（Deno Deploy 用）。
// ゲーム本体（index.html など）も配信し、/ws で部屋の通信をする。
// 攻撃の結果（お金の損失）は受け取ったほうのブラウザで計算する。このサーバーは、部屋・仲間の状況・再使用時間だけを管理する。
import { serveDir } from "jsr:@std/http/file-server";

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
const MAX_PLAYERS = 8;
const COOLDOWN_MS: Record<string, number> = { missile: 45_000, jam: 60_000 };
const MAX_MSG_PER_SEC = 30;

type Player = {
  id: string;
  ws: WebSocket;
  name: string;
  stage: number;
  built: number;
  inc: number;
  cool: Record<string, number>;
};
// isPublic: 開いたら自動で入る「公開ロビー」。部屋コードを知らない人も入れる
type Room = { players: Map<string, Player>; isPublic: boolean };

const rooms = new Map<string, Room>();

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function publicPlayers(room: Room) {
  return [...room.players.values()].map((p) => ({ id: p.id, name: p.name, stage: p.stage, built: p.built, inc: p.inc }));
}

function broadcastPlayers(room: Room) {
  const list = publicPlayers(room);
  for (const p of room.players.values()) send(p.ws, { type: "players", players: list });
}

function randomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let tries = 0; tries < 50; tries++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

// 空きのある公開ロビーを探し、なければ新しく作る
function findPublicRoom() {
  for (const [code, room] of rooms) if (room.isPublic && room.players.size < MAX_PLAYERS) return code;
  const code = randomCode();
  if (!code) return null;
  rooms.set(code, { players: new Map(), isPublic: true });
  return code;
}

function cleanText(v: unknown, max: number) {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function cleanNum(v: unknown, max: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

function handleSocket(ws: WebSocket) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  let player: Player | null = null;
  let roomCode: string | null = null;
  let msgCount = 0;
  const tick = setInterval(() => { msgCount = 0; }, 1000);

  // keepRoom: 同じ部屋に入り直すときは、空になっても部屋を消さない
  function leave(keepRoom = false) {
    if (!roomCode) return;
    const code = roomCode;
    const room = rooms.get(code);
    roomCode = null;
    player = null;
    if (!room) return;
    room.players.delete(id);
    if (room.players.size === 0) { if (!keepRoom) rooms.delete(code); }
    else broadcastPlayers(room);
  }

  function join(code: string, name: string) {
    const room = rooms.get(code);
    if (!room) return send(ws, { type: "error", message: "部屋が見つかりません。" });
    if (room.players.size >= MAX_PLAYERS && !room.players.has(id)) return send(ws, { type: "error", message: "部屋が満員です（8人まで）。" });
    leave(true);
    player = { id, ws, name: name || "神様", stage: 0, built: 0, inc: 0, cool: {} };
    room.players.set(id, player);
    roomCode = code;
    send(ws, { type: "joined", code, id, isPublic: room.isPublic, players: publicPlayers(room) });
    broadcastPlayers(room);
  }

  ws.onopen = () => send(ws, { type: "welcome", id });

  ws.onmessage = (e) => {
    if (++msgCount > MAX_MSG_PER_SEC) return;
    let m: Record<string, unknown>;
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (!m || typeof m !== "object") return;
    const code = typeof m.code === "string" ? m.code.toUpperCase() : "";

    switch (m.type) {
      case "check":
        if (CODE_RE.test(code)) send(ws, { type: "checked", code, exists: rooms.has(code) });
        break;
      case "create":
        if (!CODE_RE.test(code)) return send(ws, { type: "error", message: "コードは4文字です。" });
        if (rooms.has(code)) return send(ws, { type: "error", message: "そのコードは使われています。" });
        rooms.set(code, { players: new Map(), isPublic: false });
        send(ws, { type: "created", code });
        break;
      case "auto": {
        const found = findPublicRoom();
        if (!found) return send(ws, { type: "error", message: "いま公開ロビーを作れません。" });
        join(found, cleanText(m.name, 12));
        break;
      }
      case "join":
        if (!CODE_RE.test(code)) return send(ws, { type: "error", message: "コードは4文字です。" });
        join(code, cleanText(m.name, 12));
        break;
      case "status": {
        if (!player || !roomCode) break;
        player.name = cleanText(m.name, 12) || player.name;
        player.stage = Math.floor(cleanNum(m.stage, 9));
        player.built = Math.floor(cleanNum(m.built, 1e9));
        player.inc = cleanNum(m.inc, 1e300);
        broadcastPlayers(rooms.get(roomCode)!);
        break;
      }
      case "attack": {
        if (!player || !roomCode) break;
        const kind = typeof m.kind === "string" && kindOk(m.kind) ? m.kind : "missile";
        const room = rooms.get(roomCode)!;
        const to = typeof m.to === "string" ? m.to : "";
        const target = room.players.get(to);
        if (!target || to === id) return send(ws, { type: "error", message: "その相手には撃てません。" });
        const now = Date.now();
        if ((player.cool[kind] ?? 0) > now) {
          const sec = Math.ceil(((player.cool[kind] ?? 0) - now) / 1000);
          return send(ws, { type: "error", message: `再使用まで、あと${sec}秒です。` });
        }
        player.cool[kind] = now + COOLDOWN_MS[kind];
        send(target.ws, { type: "hit", kind, from: id, fromName: player.name, to, ts: now });
        break;
      }
      case "leave":
        leave();
        break;
    }
  };

  ws.onclose = () => {
    clearInterval(tick);
    leave();
  };
}

function kindOk(k: string) {
  return k in COOLDOWN_MS;
}

const ROOT = new URL("../", import.meta.url).pathname;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/ws") {
    if (req.headers.get("upgrade") !== "websocket") return new Response("websocket only", { status: 400 });
    const { socket, response } = Deno.upgradeWebSocket(req);
    handleSocket(socket);
    return response;
  }
  if (url.pathname === "/health") return new Response("ok");

  // サーバーのコードや設定ファイルは配信しない
  if (url.pathname.startsWith("/server/") || url.pathname.startsWith("/.git") || url.pathname === "/deno.json") {
    return new Response("not found", { status: 404 });
  }
  return serveDir(req, { fsRoot: ROOT, urlRoot: "", showDirListing: false, enableCors: false });
});
