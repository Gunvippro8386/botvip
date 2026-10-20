// Tu Tiên Online — server (Node.js + ws). Server quyết định mọi thứ: vị trí, chiến đấu, tu luyện.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, "data", "players.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- Cảnh giới ----------
const REALMS = ["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh", "Hóa Thần", "Luyện Hư", "Hợp Thể", "Đại Thừa", "Độ Kiếp"];
const STAGES = ["Sơ kỳ", "Trung kỳ", "Hậu kỳ", "Viên mãn"];
const need = p => Math.round(100 * Math.pow(3.2, p.realm) * Math.pow(1.6, p.stage));
const level = p => p.realm * 4 + p.stage;
const maxHp = p => Math.round(100 * Math.pow(1.35, level(p)));
const atk = p => Math.round(12 * Math.pow(1.33, level(p)));
const meditateRate = p => 2 * Math.pow(1.8, p.realm);

// ---------- Bản đồ ----------
const W = 72, H = 56;
const T = { GRASS: 0, TREE: 1, WATER: 2, STONE: 3, SPRING: 4, PATH: 5 };
const TOWN = { x: 36, y: 28 };
const BLOCKED = new Set([T.TREE, T.WATER]);

function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
function makeMap() {
  const r = rng(20261020);
  const m = new Array(W * H).fill(T.GRASS);
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = t; };
  // rừng rải rác
  for (let i = 0; i < 900; i++) set(Math.floor(r() * W), Math.floor(r() * H), T.TREE);
  // cụm rừng rậm
  for (let c = 0; c < 14; c++) {
    const cx = r() * W, cy = r() * H, rad = 2 + r() * 4;
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y < rad * rad && r() < 0.75) set(Math.round(cx + x), Math.round(cy + y), T.TREE);
  }
  // hồ nước
  for (const [cx, cy, rx, ry] of [[14, 12, 6, 4], [58, 42, 7, 5], [60, 10, 4, 3], [12, 44, 5, 4]])
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) set(cx + x, cy + y, T.WATER);
  // đường đá từ thành ra bốn hướng
  for (let x = 0; x < W; x++) { set(x, TOWN.y, T.PATH); set(x, TOWN.y + 1, T.PATH); }
  for (let y = 0; y < H; y++) { set(TOWN.x, y, T.PATH); set(TOWN.x + 1, y, T.PATH); }
  // thành trấn
  for (let y = -6; y <= 7; y++) for (let x = -8; x <= 9; x++) set(TOWN.x + x, TOWN.y + y, T.STONE);
  // linh tuyền
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) set(TOWN.x + x - 4, TOWN.y + y - 2, T.SPRING);
  return m;
}
const MAP = makeMap();
const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.TREE : MAP[Math.floor(y) * W + Math.floor(x)];
const walkable = (x, y) => !BLOCKED.has(tileAt(x, y));
const distTown = (x, y) => Math.hypot(x - TOWN.x, y - TOWN.y);
const inTown = (x, y) => tileAt(x, y) === T.STONE || tileAt(x, y) === T.SPRING;

// ---------- Yêu thú ----------
const MOB_TYPES = [
  { n: "Thỏ linh", c: "#e8d9b5" }, { n: "Sói xám", c: "#9aa3a8" }, { n: "Hồ ly", c: "#e0874a" },
  { n: "Hổ vằn", c: "#d9a13b" }, { n: "Mãng xà", c: "#6fa85a" }, { n: "Hắc hùng", c: "#5b4a42" },
  { n: "Huyết lang", c: "#b8433a" }, { n: "Băng giao", c: "#7fc4e0" }, { n: "Hỏa kỳ lân", c: "#ff6a3d" }
];
let mobSeq = 1;
const mobs = new Map();
function spawnMob() {
  for (let tries = 0; tries < 50; tries++) {
    const x = Math.random() * W, y = Math.random() * H, d = distTown(x, y);
    if (d < 14 || !walkable(x, y)) continue;
    const lvl = Math.min(32, Math.floor((d - 12) / 2.2));
    const type = MOB_TYPES[Math.min(MOB_TYPES.length - 1, Math.floor(lvl / 4))];
    const hp = Math.round(60 * Math.pow(1.35, lvl));
    const m = { id: mobSeq++, n: type.n, c: type.c, lvl, x, y, hx: x, hy: y, hp, max: hp, atk: Math.round(6 * Math.pow(1.33, lvl)), cd: 0, target: null, wander: 0, dx: 0, dy: 0 };
    mobs.set(m.id, m);
    return;
  }
}
for (let i = 0; i < 70; i++) spawnMob();

// ---------- Lưu dữ liệu ----------
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { accounts = {}; }
let dirty = false;
function saveAll() {
  if (!dirty) return;
  for (const p of online.values()) accounts[p.key].data = pub(p, true);
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(accounts));
  fs.renameSync(tmp, DATA_FILE);
  dirty = false;
}
const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString("hex");

// ---------- Người chơi ----------
const online = new Map(); // ws -> player
let pidSeq = 1;
function newChar(name) {
  return { name, realm: 0, stage: 0, qi: 0, stones: 0, kills: 0, x: TOWN.x + 0.5, y: TOWN.y + 3.5, hp: 100 };
}
function pub(p, full) {
  const base = { name: p.name, realm: p.realm, stage: p.stage, x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
  if (!full) return { ...base, id: p.id, med: p.med, hp: p.hp, max: maxHp(p), hit: p.hitFlash > 0 };
  return { ...base, qi: p.qi, stones: p.stones, kills: p.kills, hp: p.hp };
}
function gainQi(p, a) {
  p.qi += a;
  for (;;) {
    const n = need(p);
    if (p.qi < n) break;
    if (p.stage < 3) { p.qi -= n; p.stage++; p.hp = maxHp(p); send(p.ws, { t: "log", text: `Tiến vào ${REALMS[p.realm]} ${STAGES[p.stage]}.`, cls: "good" }); }
    else { p.qi = n; break; }
  }
  dirty = true;
}

// ---------- Mạng ----------
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = msg => { const s = JSON.stringify(msg); for (const ws of online.keys()) if (ws.readyState === 1) ws.send(s); };
const sysChat = text => broadcast({ t: "chat", from: "Thiên Đạo", text, sys: true });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.join(PUBLIC_DIR, url === "/" ? "index.html" : url);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }).end(buf);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", ws => {
  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const p = online.get(ws);
    if (!p) { if (m.t === "login") login(ws, m); return; }
    handle(p, m);
  });
  ws.on("close", () => {
    const p = online.get(ws);
    if (!p) return;
    accounts[p.key].data = pub(p, true);
    online.delete(ws);
    dirty = true;
    sysChat(`${p.name} đã rời thế giới.`);
  });
});

function login(ws, m) {
  const name = String(m.name || "").trim().replace(/\s+/g, " ");
  const pass = String(m.pass || "");
  if (!/^[\p{L}\p{N}_ ]{2,16}$/u.test(name)) return send(ws, { t: "error", text: "Tên 2–16 ký tự, chỉ gồm chữ, số, dấu cách hoặc _." });
  if (pass.length < 4) return send(ws, { t: "error", text: "Mật khẩu tối thiểu 4 ký tự." });
  const key = name.toLowerCase();
  let acc = accounts[key];
  if (acc) {
    if (hash(pass, acc.salt) !== acc.hash) return send(ws, { t: "error", text: "Sai mật khẩu, hoặc tên này đã có người dùng." });
    for (const [ows, op] of online) if (op.key === key) {
      acc.data = pub(op, true);
      online.delete(ows);
      send(ows, { t: "error", text: "Tài khoản đăng nhập ở nơi khác." });
      ows.close();
    }
  } else {
    const salt = crypto.randomBytes(16).toString("hex");
    acc = accounts[key] = { salt, hash: hash(pass, salt), data: newChar(name) };
    dirty = true;
  }
  const p = { ...newChar(name), ...acc.data, id: pidSeq++, key, ws, dx: 0, dy: 0, med: false, atkCd: 0, lastHurt: 0, hitFlash: 0, chatAt: 0 };
  p.hp = Math.min(p.hp || maxHp(p), maxHp(p));
  online.set(ws, p);
  send(ws, { t: "welcome", id: p.id, w: W, h: H, map: MAP, realms: REALMS, stages: STAGES });
  sendMe(p);
  sysChat(`${p.name} (${REALMS[p.realm]}) đã tiến vào thế giới.`);
}

function sendMe(p) {
  send(p.ws, { t: "me", name: p.name, realm: p.realm, stage: p.stage, qi: p.qi, need: need(p), stones: p.stones, hp: p.hp, max: maxHp(p), atk: atk(p), kills: p.kills, med: p.med, chance: breakChance(p) });
}
const breakChance = p => Math.max(0.2, 0.85 - p.realm * 0.07);

function handle(p, m) {
  switch (m.t) {
    case "input": {
      let dx = Number(m.dx) || 0, dy = Number(m.dy) || 0;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      p.dx = dx; p.dy = dy;
      if (len > 0.1 && p.med) { p.med = false; sendMe(p); }
      break;
    }
    case "meditate":
      p.med = !!m.on; p.dx = p.dy = 0; sendMe(p);
      break;
    case "attack": attack(p); break;
    case "break": breakthrough(p); break;
    case "chat": {
      const text = String(m.text || "").trim().slice(0, 150);
      const now = Date.now();
      if (!text || now - p.chatAt < 800) return;
      p.chatAt = now;
      broadcast({ t: "chat", from: p.name, realm: p.realm, text });
      break;
    }
    case "top": {
      const all = Object.values(accounts).map(a => a.data);
      for (const op of online.values()) { const i = all.findIndex(d => d.name === op.name); if (i >= 0) all[i] = pub(op, true); }
      all.sort((a, b) => (b.realm * 4 + b.stage) - (a.realm * 4 + a.stage) || b.qi - a.qi);
      send(p.ws, { t: "top", list: all.slice(0, 10).map(d => ({ name: d.name, realm: d.realm, stage: d.stage, kills: d.kills })) });
      break;
    }
  }
}

function attack(p) {
  if (p.atkCd > 0 || p.hp <= 0) return;
  let best = null, bd = 1.9;
  for (const mob of mobs.values()) { const d = Math.hypot(mob.x - p.x, mob.y - p.y); if (d < bd) { bd = d; best = mob; } }
  if (!best) return send(p.ws, { t: "log", text: "Không có yêu thú nào trong tầm đánh." });
  p.atkCd = 0.6; p.med = false;
  const dmg = Math.round(atk(p) * (0.85 + Math.random() * 0.3));
  best.hp -= dmg; best.target = p.id;
  broadcast({ t: "fx", x: best.x, y: best.y, text: "-" + dmg, kind: "dmg" });
  if (best.hp <= 0) {
    mobs.delete(best.id);
    const qi = Math.round(15 * Math.pow(1.5, best.lvl));
    const stones = Math.round(3 * Math.pow(1.4, best.lvl) * (0.7 + Math.random() * 0.6));
    p.stones += stones; p.kills++;
    gainQi(p, qi);
    send(p.ws, { t: "log", text: `Hạ ${best.n} Lv${best.lvl}: +${qi} linh khí, +${stones} linh thạch.`, cls: "good" });
    setTimeout(spawnMob, 8000 + Math.random() * 8000);
  }
  sendMe(p);
}

function breakthrough(p) {
  if (p.stage !== 3 || p.qi < need(p)) return;
  const last = p.realm === REALMS.length - 1;
  if (last) return send(p.ws, { t: "log", text: "Đã ở đỉnh Độ Kiếp. Phi thăng sẽ có ở bản cập nhật sau.", cls: "great" });
  if (Math.random() < breakChance(p)) {
    p.realm++; p.stage = 0; p.qi = 0; p.hp = maxHp(p);
    send(p.ws, { t: "log", text: `Đột phá thành công! Bước vào ${REALMS[p.realm]}.`, cls: "great" });
    sysChat(`Thiên địa chấn động! ${p.name} đột phá ${REALMS[p.realm]}!`);
  } else {
    p.qi = Math.round(need(p) * 0.6);
    send(p.ws, { t: "log", text: "Đột phá thất bại, linh khí phản phệ, mất 40% linh khí.", cls: "bad" });
  }
  dirty = true;
  sendMe(p);
}

// ---------- Vòng lặp thế giới ----------
const TICK = 50, SPEED = 4.2, MOB_SPEED = 2.6;
let tickN = 0;
function moveEntity(e, dx, dy, speed, dt) {
  const nx = e.x + dx * speed * dt, ny = e.y + dy * speed * dt;
  if (walkable(nx, e.y)) e.x = Math.min(W - 0.5, Math.max(0.5, nx));
  if (walkable(e.x, ny)) e.y = Math.min(H - 0.5, Math.max(0.5, ny));
}
setInterval(() => {
  const dt = TICK / 1000, now = Date.now();
  tickN++;
  const byId = new Map();
  for (const p of online.values()) {
    byId.set(p.id, p);
    if (p.hp <= 0) continue;
    if (p.dx || p.dy) moveEntity(p, p.dx, p.dy, SPEED, dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    const mx = maxHp(p);
    if (p.med) {
      const spring = tileAt(p.x, p.y) === T.SPRING ? 3 : 1;
      gainQi(p, meditateRate(p) * spring * dt);
      p.hp = Math.min(mx, p.hp + mx * 0.05 * dt);
    } else if (now - p.lastHurt > 5000) {
      p.hp = Math.min(mx, p.hp + mx * 0.02 * dt);
    }
    if (tickN % 10 === 0) sendMe(p);
  }
  for (const m of mobs.values()) {
    m.cd = Math.max(0, m.cd - dt);
    let tgt = m.target ? byId.get(m.target) : null;
    if (tgt && (tgt.hp <= 0 || inTown(tgt.x, tgt.y) || Math.hypot(tgt.x - m.x, tgt.y - m.y) > 9)) { tgt = null; m.target = null; }
    if (!tgt) {
      for (const p of byId.values()) {
        if (p.hp > 0 && !inTown(p.x, p.y) && Math.hypot(p.x - m.x, p.y - m.y) < 4.5 && m.lvl >= 3 && m.lvl >= level(p) - 2) { tgt = p; m.target = p.id; break; }
      }
    }
    if (tgt) {
      const d = Math.hypot(tgt.x - m.x, tgt.y - m.y);
      if (d > 1.0) moveEntity(m, (tgt.x - m.x) / d, (tgt.y - m.y) / d, MOB_SPEED, dt);
      else if (m.cd <= 0) {
        m.cd = 1.2;
        const dmg = Math.round(m.atk * (0.85 + Math.random() * 0.3));
        tgt.hp -= dmg; tgt.lastHurt = now; tgt.hitFlash = 0.2; tgt.med = false;
        send(tgt.ws, { t: "fx", x: tgt.x, y: tgt.y, text: "-" + dmg, kind: "hurt" });
        if (tgt.hp <= 0) {
          const lost = Math.round(tgt.qi * 0.2);
          tgt.qi -= lost;
          send(tgt.ws, { t: "log", text: `Bị ${m.n} đánh trọng thương, mất ${lost} linh khí. Hồi sinh ở thành trấn.`, cls: "bad" });
          setTimeout(() => { tgt.x = TOWN.x + 0.5; tgt.y = TOWN.y + 3.5; tgt.hp = maxHp(tgt); sendMe(tgt); }, 1500);
          m.target = null; dirty = true;
        }
        sendMe(tgt);
      }
    } else {
      m.wander -= dt;
      if (m.wander <= 0) {
        m.wander = 2 + Math.random() * 3;
        const back = Math.hypot(m.hx - m.x, m.hy - m.y) > 4;
        const a = Math.random() * Math.PI * 2;
        [m.dx, m.dy] = back ? [(m.hx - m.x) / 4, (m.hy - m.y) / 4] : Math.random() < 0.4 ? [0, 0] : [Math.cos(a), Math.sin(a)];
      }
      if (m.dx || m.dy) moveEntity(m, m.dx, m.dy, MOB_SPEED * 0.35, dt);
    }
  }
  if (tickN % 2 === 0) {
    broadcast({
      t: "state",
      players: [...byId.values()].map(p => pub(p, false)),
      mobs: [...mobs.values()].map(m => ({ id: m.id, n: m.n, c: m.c, lvl: m.lvl, x: +m.x.toFixed(2), y: +m.y.toFixed(2), hp: m.hp, max: m.max }))
    });
  }
}, TICK);

setInterval(saveAll, 15000);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { dirty = true; saveAll(); process.exit(0); });

server.listen(PORT, () => console.log(`Tu Tiên Online chạy tại http://localhost:${PORT}`));
