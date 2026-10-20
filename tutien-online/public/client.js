// Tu Tiên Online — client
const TS = 32; // pixel mỗi ô
const T = { GRASS: 0, TREE: 1, WATER: 2, STONE: 3, SPRING: 4, PATH: 5 };
const REALM_COLORS = ["#c9d3cf", "#8fd3b4", "#e3c25d", "#7fb8ff", "#c58cff", "#ff9a6b", "#ff6f91", "#ffe08a", "#ffffff"];

const $ = id => document.getElementById(id);
const cv = $("game"), ctx = cv.getContext("2d");
let ws, myId = null, world = null, mapCanvas = null, me = null, realms = [], stages = [];
const players = new Map(), mobs = new Map(), fx = [];
let dpr = 1, vw = 0, vh = 0, cam = { x: 0, y: 0 };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = innerWidth; vh = innerHeight;
  cv.width = vw * dpr; cv.height = vh * dpr;
}
addEventListener("resize", resize); resize();

// ---------- Kết nối ----------
function connect(name, pass) {
  if (ws) { ws.onclose = null; ws.close(); }
  const sock = ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  sock.onopen = () => sock.send(JSON.stringify({ t: "login", name, pass }));
  sock.onmessage = e => onMsg(JSON.parse(e.data));
  sock.onclose = () => {
    if (sock !== ws) return;
    $("hud").hidden = true; $("login").hidden = false;
    if (myId !== null && !$("loginErr").textContent) $("loginErr").textContent = "Mất kết nối với máy chủ. Hãy đăng nhập lại.";
    myId = null; players.clear(); mobs.clear();
  };
}
const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

function onMsg(m) {
  switch (m.t) {
    case "error": $("loginErr").textContent = m.text; break;
    case "welcome":
      myId = m.id; realms = m.realms; stages = m.stages;
      world = { w: m.w, h: m.h, map: m.map };
      buildMap();
      $("login").hidden = true; $("hud").hidden = false; $("loginErr").textContent = "";
      break;
    case "me": me = m; updateHud(); break;
    case "state": syncEntities(players, m.players); syncEntities(mobs, m.mobs); break;
    case "chat": addChat(m); break;
    case "log": addChat({ text: m.text, cls: m.cls || "" }); if (m.cls === "great") toast(m.text); break;
    case "fx": fx.push({ x: m.x, y: m.y - 0.6, text: m.text, kind: m.kind, t: 0 }); break;
    case "top": showTop(m.list); break;
  }
}

function syncEntities(store, list) {
  const seen = new Set();
  for (const e of list) {
    seen.add(e.id);
    const cur = store.get(e.id);
    if (cur) Object.assign(cur, e, { rx: cur.rx, ry: cur.ry });
    else store.set(e.id, { ...e, rx: e.x, ry: e.y });
  }
  for (const id of store.keys()) if (!seen.has(id)) store.delete(id);
}

// ---------- HUD ----------
const fmt = n => n < 1000 ? Math.floor(n).toString() : n < 1e6 ? (n / 1e3).toFixed(1) + "K" : n < 1e9 ? (n / 1e6).toFixed(2) + "M" : (n / 1e9).toFixed(2) + "B";
function updateHud() {
  $("meName").textContent = me.name;
  $("meRealm").textContent = `${realms[me.realm]} ${stages[me.stage]}`;
  $("hpBar").style.width = (100 * Math.max(0, me.hp) / me.max) + "%";
  $("hpTxt").textContent = `Sinh lực ${fmt(Math.max(0, me.hp))}/${fmt(me.max)}`;
  $("qiBar").style.width = (100 * Math.min(1, me.qi / me.need)) + "%";
  $("qiTxt").textContent = `Linh khí ${fmt(me.qi)}/${fmt(me.need)}`;
  $("stones").textContent = fmt(me.stones);
  $("atk").textContent = fmt(me.atk);
  $("kills").textContent = me.kills;
  $("medBtn").classList.toggle("on", me.med);
  $("medBtn").textContent = me.med ? "Đang tọa thiền" : "Tọa thiền";
  const ready = me.stage === 3 && me.qi >= me.need;
  $("breakBtn").hidden = !ready;
  $("breakBtn").textContent = `Đột phá (${Math.round(me.chance * 100)}%)`;
}
function addChat(m) {
  const li = document.createElement("li");
  if (m.from) {
    const f = document.createElement("span");
    f.className = m.sys ? "sys" : "from";
    f.textContent = (m.sys ? "[" + m.from + "]" : m.from) + ": ";
    li.appendChild(f);
    li.appendChild(document.createTextNode(m.text));
  } else { li.className = m.cls; li.textContent = m.text; }
  const log = $("chatLog");
  log.appendChild(li);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
let toastT;
function toast(text) { const t = $("toast"); t.textContent = text; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3500); }
function showTop(list) {
  const ol = $("topList"); ol.innerHTML = "";
  for (const d of list) {
    const li = document.createElement("li");
    li.textContent = d.name + " ";
    const s = document.createElement("span"); s.textContent = `${realms[d.realm]} ${stages[d.stage]} · diệt ${d.kills}`;
    li.appendChild(s); ol.appendChild(li);
  }
  $("topPanel").hidden = false;
}

// ---------- Bản đồ ----------
function buildMap() {
  const { w, h, map } = world;
  mapCanvas = document.createElement("canvas");
  mapCanvas.width = w * TS; mapCanvas.height = h * TS;
  const g = mapCanvas.getContext("2d");
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = map[y * w + x], px = x * TS, py = y * TS, v = r();
    g.fillStyle = ["#2f4a34", "#2f4a34", "#24465e", "#5b5c55", "#2c6e66", "#6b6450"][t];
    if (t === T.GRASS || t === T.TREE) g.fillStyle = v < 0.5 ? "#2f4a34" : "#33503a";
    g.fillRect(px, py, TS, TS);
    if (t === T.GRASS && v > 0.85) { g.fillStyle = "#4a6b45"; g.fillRect(px + 8 + v * 10, py + 10, 2, 5); g.fillRect(px + 18, py + 16 + v * 6, 2, 4); }
    if (t === T.TREE) {
      g.fillStyle = "#4a3426"; g.fillRect(px + 14, py + 18, 4, 10);
      g.fillStyle = v < 0.5 ? "#1d3a24" : "#22442a";
      g.beginPath(); g.arc(px + 16, py + 14, 11, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.06)"; g.beginPath(); g.arc(px + 13, py + 10, 5, 0, 7); g.fill();
    }
    if (t === T.WATER && v > 0.7) { g.strokeStyle = "rgba(160,210,240,.25)"; g.beginPath(); g.moveTo(px + 6, py + 16); g.quadraticCurveTo(px + 12, py + 12, px + 18, py + 16); g.stroke(); }
    if (t === T.STONE || t === T.PATH) { g.strokeStyle = "rgba(0,0,0,.18)"; g.strokeRect(px + .5, py + .5, TS - 1, TS - 1); }
    if (t === T.SPRING) { g.fillStyle = "rgba(140,255,220,.18)"; g.beginPath(); g.arc(px + 16, py + 16, 6 + v * 6, 0, 7); g.fill(); }
  }
}

// ---------- Điều khiển ----------
const keys = new Set();
let moveTo = null, chaseMob = null, lastSent = "", atkTimer = 0;
const typing = () => document.activeElement === $("chatInput") || document.activeElement?.tagName === "INPUT";
addEventListener("keydown", e => {
  if (typing() || myId === null) return;
  const k = e.key.toLowerCase();
  if (k === "f") { send({ t: "attack" }); return; }
  if (k === "m") { send({ t: "meditate", on: !(me && me.med) }); return; }
  if (k === "enter") { $("chatInput").focus(); e.preventDefault(); return; }
  keys.add(k); moveTo = null; chaseMob = null;
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
cv.addEventListener("pointerdown", e => {
  if (myId === null) return;
  document.activeElement?.blur();
  const wx = (e.clientX - vw / 2) / TS + cam.x, wy = (e.clientY - vh / 2) / TS + cam.y;
  chaseMob = null; moveTo = { x: wx, y: wy };
  for (const m of mobs.values()) if (Math.hypot(m.rx - wx, m.ry - wy) < 0.9) { chaseMob = m.id; moveTo = null; break; }
});

function controlTick(dt) {
  const p = players.get(myId);
  if (!p) return;
  let dx = 0, dy = 0;
  if (keys.has("a") || keys.has("arrowleft")) dx--;
  if (keys.has("d") || keys.has("arrowright")) dx++;
  if (keys.has("w") || keys.has("arrowup")) dy--;
  if (keys.has("s") || keys.has("arrowdown")) dy++;
  if (!dx && !dy && chaseMob) {
    const m = mobs.get(chaseMob);
    if (!m) chaseMob = null;
    else {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d > 1.3) { dx = (m.x - p.x) / d; dy = (m.y - p.y) / d; }
      else { atkTimer -= dt; if (atkTimer <= 0) { send({ t: "attack" }); atkTimer = 0.65; } }
    }
  } else if (!dx && !dy && moveTo) {
    const d = Math.hypot(moveTo.x - p.x, moveTo.y - p.y);
    if (d < 0.25) moveTo = null; else { dx = (moveTo.x - p.x) / d; dy = (moveTo.y - p.y) / d; }
  }
  const key = dx.toFixed(2) + "," + dy.toFixed(2);
  if (key !== lastSent) { lastSent = key; send({ t: "input", dx, dy }); }
}

$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  $("loginErr").textContent = "";
  const name = $("nameInput").value.trim(), pass = $("passInput").value;
  try { localStorage.setItem("tt-name", name); } catch {}
  connect(name, pass);
});
try { $("nameInput").value = localStorage.getItem("tt-name") || ""; } catch {}
$("chatForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("chatInput").value.trim();
  if (v) send({ t: "chat", text: v });
  $("chatInput").value = ""; $("chatInput").blur();
});
$("medBtn").addEventListener("click", () => { moveTo = null; chaseMob = null; send({ t: "meditate", on: !(me && me.med) }); });
$("atkBtn").addEventListener("click", () => send({ t: "attack" }));
$("breakBtn").addEventListener("click", () => send({ t: "break" }));
$("topBtn").addEventListener("click", () => send({ t: "top" }));
$("topClose").addEventListener("click", () => $("topPanel").hidden = true);

// ---------- Vẽ ----------
let last = performance.now(), ctlAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  ctlAcc += dt; if (ctlAcc > 0.08) { controlTick(ctlAcc); ctlAcc = 0; }
  for (const s of [players, mobs]) for (const e of s.values()) { const k = Math.min(1, dt * 12); e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k; }
  const mine = players.get(myId);
  if (mine) { cam.x = mine.rx; cam.y = mine.ry; }
  draw(now / 1000);
  requestAnimationFrame(frame);
}
function draw(time) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0e1517"; ctx.fillRect(0, 0, vw, vh);
  if (!mapCanvas) return;
  const ox = Math.round(vw / 2 - cam.x * TS), oy = Math.round(vh / 2 - cam.y * TS);
  ctx.drawImage(mapCanvas, ox, oy);
  const sx = x => ox + x * TS, sy = y => oy + y * TS;
  const ents = [...mobs.values()].map(m => ({ m })).concat([...players.values()].map(p => ({ p })));
  ents.sort((a, b) => (a.m || a.p).ry - (b.m || b.p).ry);
  ctx.textAlign = "center";
  for (const e of ents) {
    if (e.m) {
      const m = e.m, x = sx(m.rx), y = sy(m.ry);
      if (x < -40 || y < -40 || x > vw + 40 || y > vh + 40) continue;
      const r = 9 + Math.min(8, m.lvl / 4);
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + r * .8, r, r * .35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = "#111"; ctx.fillRect(x - 4, y - 3, 2, 2); ctx.fillRect(x + 2, y - 3, 2, 2);
      if (chaseMob === m.id) { ctx.strokeStyle = "#d0624f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.stroke(); }
      ctx.fillStyle = "#000a"; ctx.fillRect(x - 16, y - r - 9, 32, 4);
      ctx.fillStyle = "#d0624f"; ctx.fillRect(x - 16, y - r - 9, 32 * Math.max(0, m.hp / m.max), 4);
      ctx.font = "11px system-ui"; ctx.fillStyle = "#ece6d6";
      ctx.fillText(`${m.n} Lv${m.lvl}`, x, y - r - 13);
    } else {
      const p = e.p, x = sx(p.rx), y = sy(p.ry);
      if (x < -60 || y < -60 || x > vw + 60 || y > vh + 60) continue;
      const col = REALM_COLORS[p.realm] || "#fff";
      if (p.med) {
        ctx.strokeStyle = `rgba(220,183,99,${0.45 + 0.25 * Math.sin(time * 3)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 18 + 3 * Math.sin(time * 2), 0, 7); ctx.stroke();
        for (let i = 0; i < 3; i++) { const a = time * 1.5 + i * 2.09; ctx.fillStyle = "#dcb763"; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 2, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 10, 10, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = p.hit ? "#ff8a7a" : col; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill();
      ctx.fillStyle = "#1b2426"; ctx.beginPath(); ctx.arc(x, y - 4, 4.5, 0, 7); ctx.fill(); // búi tóc
      if (p.id === myId) { ctx.strokeStyle = "#ece6d6"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 12.5, 0, 7); ctx.stroke(); }
      ctx.font = "600 12px system-ui"; ctx.fillStyle = "#000b"; ctx.fillText(p.name, x + 1, y - 21);
      ctx.fillStyle = p.id === myId ? "#dcb763" : "#ece6d6"; ctx.fillText(p.name, x, y - 22);
      ctx.font = "10px system-ui"; ctx.fillStyle = col; ctx.fillText(realms[p.realm] || "", x, y + 25);
    }
  }
  if (moveTo) { ctx.strokeStyle = "rgba(236,230,214,.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(moveTo.x), sy(moveTo.y), 6, 0, 7); ctx.stroke(); }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += 1 / 60;
    if (f.t > 1) { fx.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - f.t;
    ctx.font = "700 14px system-ui"; ctx.fillStyle = f.kind === "hurt" ? "#ff6b5a" : "#ffe08a";
    ctx.fillText(f.text, sx(f.x), sy(f.y) - f.t * 30);
    ctx.globalAlpha = 1;
  }
}
requestAnimationFrame(frame);
