// Hoang Dã — game sinh tồn thế giới mở 2D. Chạy hoàn toàn trên trình duyệt, lưu vào localStorage.
"use strict";
const $ = id => document.getElementById(id);
const cv = $("game");
let ctx = cv.getContext("2d");
const SAVE_KEY = "hoangda.save.v1";
const CHUNK = 16, TEX = 16; // ô mỗi chunk, pixel mỗi ô trên ảnh nền chunk
const DAY = 360; // giây cho một ngày đêm

// ---------- Ngẫu nhiên & nhiễu ----------
let SEED = 1;
function hash(x, y, k = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((SEED + Math.imul(k, 0x9e3779b9)) | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, k) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, k), b = hash(xi + 1, yi, k), c = hash(xi, yi + 1, k), d = hash(xi + 1, yi + 1, k);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, k, oct) {
  let s = 0, amp = 1, tot = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, k + i * 31) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return s / tot;
}
function seedFrom(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h | 0;
}

// ---------- Địa hình ----------
const G = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, SNOW: 5, DESERT: 6, ROCK: 7 };
const G_NAME = ["Biển sâu", "Nước nông", "Bãi cát", "Đồng cỏ", "Rừng rậm", "Đồng tuyết", "Sa mạc", "Núi đá"];
const G_RGB = [[28, 72, 116], [48, 112, 164], [218, 197, 139], [104, 166, 80], [62, 122, 58], [230, 236, 240], [222, 178, 106], [128, 122, 112]];
const G_VAR = [10, 12, 14, 18, 16, 8, 14, 20];

function ground(x, y) {
  let e = fbm(x / 64, y / 64, 1, 5);
  const d = Math.hypot(x, y);
  if (d < 48) e += 0.14 * (1 - d / 48); // luôn có đất liền quanh điểm xuất phát
  if (e < 0.33) return G.DEEP;
  if (e < 0.39) return G.WATER;
  if (e < 0.42) return G.SAND;
  if (e > 0.67) return G.ROCK;
  const t = fbm(x / 160, y / 160, 3, 3), m = fbm(x / 90, y / 90, 2, 3);
  if (t < 0.36) return G.SNOW;
  if (t > 0.6 && m < 0.47) return G.DESERT;
  if (m > 0.56) return G.FOREST;
  return G.GRASS;
}

// ---------- Vật thể trên ô ----------
const O = { NONE: 0, TREE: 1, PINE: 2, PALM: 3, ROCK: 4, ORE: 5, BUSH: 6, BUSH_EMPTY: 7, TUFT: 8, CACTUS: 9, WALL: 10, SWALL: 11, FIRE: 12, BENCH: 13, BED: 14 };
const OBJ = {
  [O.TREE]: { name: "Cây", hp: 5, block: true, inset: 0.28, tool: "axe", drop: { wood: 3 }, verb: "Chặt", tall: true },
  [O.PINE]: { name: "Cây thông", hp: 5, block: true, inset: 0.28, tool: "axe", drop: { wood: 3 }, verb: "Chặt", tall: true },
  [O.PALM]: { name: "Cây dừa", hp: 4, block: true, inset: 0.3, tool: "axe", drop: { wood: 2, berry: 1 }, verb: "Chặt", tall: true },
  [O.ROCK]: { name: "Tảng đá", hp: 6, block: true, inset: 0.1, tool: "pick", drop: { stone: 3 }, verb: "Đập" },
  [O.ORE]: { name: "Mỏ sắt", hp: 10, block: true, inset: 0.1, tool: "pick", needTool: true, drop: { ore: 2, stone: 1 }, verb: "Đào" },
  [O.BUSH]: { name: "Bụi quả mọng", hp: 1, flat: true, drop: { berry: 2 }, verb: "Hái", becomes: O.BUSH_EMPTY },
  [O.BUSH_EMPTY]: { name: "Bụi cây", flat: true, inert: true },
  [O.TUFT]: { name: "Cỏ cao", hp: 1, flat: true, drop: { fiber: 2 }, verb: "Nhổ" },
  [O.CACTUS]: { name: "Xương rồng", hp: 3, block: true, inset: 0.25, drop: { fiber: 1 }, thirst: 12, prick: 3, verb: "Cắt", tall: true },
  [O.WALL]: { name: "Tường gỗ", hp: 14, block: true, built: true, drop: { wood: 2 }, verb: "Phá" },
  [O.SWALL]: { name: "Tường đá", hp: 34, block: true, built: true, drop: { stone: 2 }, verb: "Phá" },
  [O.FIRE]: { name: "Lửa trại", hp: 6, block: true, inset: 0.15, built: true, light: 6.5, drop: { stone: 2 }, verb: "Dập" },
  [O.BENCH]: { name: "Bàn chế tạo", hp: 10, block: true, inset: 0.08, built: true, drop: { wood: 6 }, verb: "Phá" },
  [O.BED]: { name: "Giường", hp: 8, block: true, inset: 0.12, built: true, drop: { wood: 4, hide: 2 }, verb: "Phá" },
};

function baseObj(x, y, g) {
  if (Math.abs(x) < 3 && Math.abs(y) < 3) return 0;
  const r = hash(x, y, 7);
  switch (g) {
    case G.GRASS: return r < 0.035 ? O.TREE : r < 0.06 ? O.BUSH : r < 0.12 ? O.TUFT : r < 0.13 ? O.ROCK : 0;
    case G.FOREST: return r < 0.2 ? O.TREE : r < 0.24 ? O.BUSH : r < 0.28 ? O.TUFT : r < 0.29 ? O.ROCK : 0;
    case G.SNOW: return r < 0.1 ? O.PINE : r < 0.13 ? O.ROCK : r < 0.14 ? O.ORE : 0;
    case G.DESERT: return r < 0.025 ? O.CACTUS : r < 0.045 ? O.ROCK : r < 0.06 ? O.TUFT : 0;
    case G.SAND: return r < 0.025 ? O.PALM : r < 0.035 ? O.ROCK : 0;
    case G.ROCK: return r < 0.3 ? O.ROCK : r < 0.36 ? O.ORE : 0;
  }
  return 0;
}

// ---------- Đồ vật ----------
const ITEMS = {
  wood: { name: "Gỗ" }, stone: { name: "Đá" }, fiber: { name: "Sợi cỏ" }, hide: { name: "Da thú" },
  ore: { name: "Quặng sắt" }, iron: { name: "Sắt" },
  berry: { name: "Quả mọng", food: { food: 10, water: 4 } },
  meat: { name: "Thịt sống", food: { food: 12, hp: -4 } },
  cooked: { name: "Thịt nướng", food: { food: 38, hp: 8 } },
  bandage: { name: "Băng gạc", food: { hp: 30 } },
  axe: { name: "Rìu đá", tool: { axe: 3, dmg: 8 }, one: true },
  pick: { name: "Cuốc đá", tool: { pick: 3, dmg: 7 }, one: true },
  spear: { name: "Giáo đá", tool: { dmg: 15, reach: 2.4 }, one: true },
  torch: { name: "Đuốc", tool: { dmg: 5, light: 5.5 }, one: true },
  iaxe: { name: "Rìu sắt", tool: { axe: 6, dmg: 12 }, one: true },
  ipick: { name: "Cuốc sắt", tool: { pick: 6, dmg: 10 }, one: true },
  sword: { name: "Kiếm sắt", tool: { dmg: 28, reach: 1.9 }, one: true },
  armor: { name: "Áo da", wear: 0.35, one: true },
  fire: { name: "Lửa trại", place: O.FIRE }, bench: { name: "Bàn chế tạo", place: O.BENCH },
  wall: { name: "Tường gỗ", place: O.WALL }, swall: { name: "Tường đá", place: O.SWALL }, bed: { name: "Giường", place: O.BED },
};
const RECIPES = [
  { id: "axe", need: { wood: 3, stone: 3, fiber: 2 }, desc: "Chặt cây nhanh gấp 3" },
  { id: "pick", need: { wood: 3, stone: 3, fiber: 2 }, desc: "Đập đá nhanh, đào được mỏ sắt" },
  { id: "spear", need: { wood: 4, stone: 2, fiber: 3 }, desc: "Đánh mạnh, với xa" },
  { id: "torch", need: { wood: 1, fiber: 2 }, desc: "Cầm trên tay để soi đường ban đêm" },
  { id: "fire", need: { wood: 5, stone: 3 }, desc: "Sưởi sáng, xua thú dữ, dùng để nướng" },
  { id: "bandage", need: { fiber: 4 }, desc: "Hồi 30 máu" },
  { id: "cooked", need: { meat: 1 }, at: O.FIRE, desc: "No lâu, hồi máu" },
  { id: "iron", need: { ore: 2, wood: 1 }, at: O.FIRE, desc: "Nung quặng thành sắt" },
  { id: "bench", need: { wood: 12, stone: 4 }, desc: "Mở khóa đồ xây và đồ sắt" },
  { id: "wall", n: 2, need: { wood: 4 }, at: O.BENCH, desc: "Chặn thú và quỷ đêm" },
  { id: "swall", n: 2, need: { stone: 4 }, at: O.BENCH, desc: "Tường chắc gấp đôi" },
  { id: "bed", need: { wood: 8, hide: 3, fiber: 6 }, at: O.BENCH, desc: "Hồi sinh tại giường khi gục ngã" },
  { id: "armor", need: { hide: 6, fiber: 4 }, at: O.BENCH, desc: "Giảm 35% sát thương nhận vào" },
  { id: "iaxe", need: { wood: 2, iron: 3 }, at: O.BENCH, desc: "Chặt cây cực nhanh" },
  { id: "ipick", need: { wood: 2, iron: 3 }, at: O.BENCH, desc: "Đào mỏ cực nhanh" },
  { id: "sword", need: { wood: 2, iron: 5 }, at: O.BENCH, desc: "Vũ khí mạnh nhất" },
];
const HOTBAR_ORDER = ["axe", "iaxe", "pick", "ipick", "spear", "sword", "torch", "fire", "bench", "wall", "swall", "bed", "cooked", "berry", "bandage", "meat"];

// ---------- Sinh vật ----------
const MOBS = {
  rabbit: { name: "Thỏ", hp: 10, speed: 4.0, r: 0.26, flee: 3.5, drop: { meat: 1 }, where: [G.GRASS, G.FOREST, G.SNOW], w: 4 },
  deer: { name: "Hươu", hp: 28, speed: 4.4, r: 0.36, flee: 5, drop: { meat: 2, hide: 1 }, where: [G.GRASS, G.FOREST], w: 3 },
  wolf: { name: "Sói", hp: 40, speed: 3.9, r: 0.34, dmg: 8, sight: 6, hostile: true, drop: { meat: 1, hide: 1 }, where: [G.FOREST, G.SNOW], w: 2 },
  bear: { name: "Gấu", hp: 120, speed: 3.3, r: 0.48, dmg: 18, sight: 2.6, neutral: true, drop: { meat: 4, hide: 3 }, where: [G.FOREST, G.SNOW], w: 0.7 },
  scorpion: { name: "Bọ cạp", hp: 22, speed: 3.1, r: 0.3, dmg: 6, sight: 4, hostile: true, drop: { meat: 1 }, where: [G.DESERT], w: 2 },
  ghost: { name: "Quỷ đêm", hp: 50, speed: 3.6, r: 0.36, dmg: 10, sight: 14, hostile: true, night: true, drop: {} },
};

// ---------- Trạng thái ----------
let chunks = new Map(), mods = new Map(), regrow = [], fires = new Set();
let P, inv, eq, clock, spawnPt, mobs = [], fx = [], parts = [], stats;
let running = false, paused = false, dead = false, preview = false;
const key = (x, y) => x * 262144 + y;
const unkey = k => { const y = ((k % 262144) + 262144 + 131072) % 262144 - 131072; return [(k - y) / 262144, y]; };

function chunk(cx, cy) {
  const k = cx * 65536 + cy;
  let ch = chunks.get(k);
  if (!ch) {
    const g = new Uint8Array(CHUNK * CHUNK), o = new Uint8Array(CHUNK * CHUNK);
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const x = cx * CHUNK + i, y = cy * CHUNK + j, gg = ground(x, y);
      g[j * CHUNK + i] = gg; o[j * CHUNK + i] = baseObj(x, y, gg);
    }
    ch = { cx, cy, g, o, img: null };
    chunks.set(k, ch);
  }
  return ch;
}
function groundAt(x, y) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
  return chunk(cx, cy).g[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
}
function objAt(x, y) {
  const k = key(x, y);
  if (mods.has(k)) return mods.get(k);
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
  return chunk(cx, cy).o[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
}
function setObj(x, y, o) {
  const k = key(x, y);
  if (objAt(x, y) === O.FIRE) fires.delete(k);
  mods.set(k, o);
  if (o === O.FIRE) fires.add(k);
}

// ---------- Ảnh nền chunk (pixel art) ----------
const edge = [0, 0, 0, 0];
function paintChunk(ch) {
  const size = CHUNK * TEX, c = document.createElement("canvas");
  c.width = c.height = size;
  const g2 = c.getContext("2d"), img = g2.createImageData(size, size), d = img.data;
  const gAt = (x, y) => {
    const i = x - ch.cx * CHUNK, j = y - ch.cy * CHUNK;
    return i >= 0 && j >= 0 && i < CHUNK && j < CHUNK ? ch.g[j * CHUNK + i] : ground(x, y);
  };
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const x = ch.cx * CHUNK + i, y = ch.cy * CHUNK + j, g = ch.g[j * CHUNK + i];
    const nb = [gAt(x - 1, y), gAt(x + 1, y), gAt(x, y - 1), gAt(x, y + 1)];
    const flower = g === G.GRASS && hash(x, y, 40) < 0.12 ? [Math.floor(hash(x, y, 41) * 12) + 2, Math.floor(hash(x, y, 42) * 12) + 2, Math.floor(hash(x, y, 43) * 3)] : null;
    for (let py = 0; py < TEX; py++) for (let px = 0; px < TEX; px++) {
      const gx = x * TEX + px, gy = y * TEX + py;
      let gg = g;
      // mép ô lởm chởm cho tự nhiên
      edge[0] = px; edge[1] = TEX - 1 - px; edge[2] = py; edge[3] = TEX - 1 - py;
      let shore = 99;
      for (let s = 0; s < 4; s++) {
        if (nb[s] > G.WATER && edge[s] < shore) shore = edge[s];
        if (gg === g && nb[s] !== g && edge[s] < 3 && hash(gx, gy, 9 + s) < (3 - edge[s]) * 0.22) gg = nb[s];
      }
      const base = G_RGB[gg], n = (hash(gx >> 1, gy >> 1, 5) - 0.5) * G_VAR[gg];
      let r = base[0] + n, gr = base[1] + n, b = base[2] + n;
      if (gg <= G.WATER && hash(gx >> 2, gy, 6) < 0.05) { r += 30; gr += 30; b += 30; }
      if (gg === G.WATER && shore < 2) { r += 40; gr += 40; b += 30; }
      if (gg === G.ROCK && hash(gx, gy, 8) < 0.04) { r -= 35; gr -= 35; b -= 35; }
      if (gg === G.FOREST && hash(gx, gy, 8) < 0.05) { r -= 20; gr -= 10; b -= 20; }
      if (flower && gg === g && Math.abs(px - flower[0]) <= 1 && Math.abs(py - flower[1]) <= 1 && (px - flower[0]) * (py - flower[1]) === 0) {
        [r, gr, b] = [[250, 225, 90], [245, 245, 240], [235, 130, 170]][flower[2]];
      }
      const o = ((j * TEX + py) * size + i * TEX + px) * 4;
      d[o] = r; d[o + 1] = gr; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  g2.putImageData(img, 0, 0);
  ch.img = c;
}

// ---------- Khung hình ----------
let dpr = 1, vw = 0, vh = 0, TS = 40;
const cam = { x: 0, y: 0 };
const dark = document.createElement("canvas"), dctx = dark.getContext("2d");
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = innerWidth; vh = innerHeight;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  dark.width = Math.ceil(vw / 2); dark.height = Math.ceil(vh / 2);
  TS = Math.round(Math.max(30, Math.min(48, Math.min(vw, vh) / 13)));
}
addEventListener("resize", resize); resize();
const viewR = () => Math.hypot(vw, vh) / 2 / TS;
const toScreen = (x, y) => [(x - cam.x) * TS + vw / 2, (y - cam.y) * TS + vh / 2];
const toWorld = (sx, sy) => [(sx - vw / 2) / TS + cam.x, (sy - vh / 2) / TS + cam.y];

// ---------- Thời gian ----------
const hours = () => 7 + clock / DAY * 24;
const dayNum = () => Math.floor((hours() - 6) / 24) + 1;
function darkness() {
  const h = hours() % 24;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 20.5) return 0.86 * (h - 18) / 2.5;
  if (h >= 4.5 && h < 7) return 0.86 * (1 - (h - 4.5) / 2.5);
  return 0.86;
}
const isNight = () => darkness() > 0.45;

// ---------- Người chơi ----------
function newPlayer(x, y) { return { x, y, hp: 100, food: 100, water: 100, dir: Math.PI / 2, cd: 0, swing: 0, hurt: 0, walk: 0 }; }
const tool = () => (eq && ITEMS[eq] && ITEMS[eq].tool) || null;
const has = (id, n = 1) => (inv[id] || 0) >= n;
function give(id, n, quiet) {
  inv[id] = (inv[id] || 0) + n;
  if (!quiet) log(`+${n} ${ITEMS[id].name}`, "good");
  refreshUi();
}
function take(id, n) {
  inv[id] -= n;
  if (inv[id] <= 0) { delete inv[id]; if (eq === id) eq = null; }
}
function hurt(n, cause) {
  if (dead) return;
  if (has("armor")) n *= 1 - ITEMS.armor.wear;
  n = Math.max(1, Math.round(n));
  P.hp -= n; P.hurt = 0.35;
  addFx(P.x, P.y - 0.8, "-" + n, "#ff6b5a");
  if (P.hp <= 0) die(cause);
}

function blocked(x, y, mob) {
  const g = groundAt(x, y);
  if (g === G.DEEP || (mob && g === G.WATER)) return null;
  const o = objAt(x, y), def = o && OBJ[o];
  return def && def.block ? def.inset || 0 : false;
}
function collides(px, py, r, mob) {
  for (let ty = Math.floor(py - r); ty <= Math.floor(py + r); ty++)
    for (let tx = Math.floor(px - r); tx <= Math.floor(px + r); tx++) {
      const b = blocked(tx, ty, mob);
      if (b === false) continue;
      const ins = b || 0;
      const cx = Math.max(tx + ins, Math.min(px, tx + 1 - ins)), cy = Math.max(ty + ins, Math.min(py, ty + 1 - ins));
      if ((px - cx) ** 2 + (py - cy) ** 2 < r * r) return true;
    }
  return false;
}
function move(e, dx, dy, r, mob) {
  if (!collides(e.x + dx, e.y, r, mob)) e.x += dx;
  if (!collides(e.x, e.y + dy, r, mob)) e.y += dy;
}
// Chỗ khởi đầu tốt: xung quanh là đất ôn hòa và có nước không quá xa
const MILD = new Set([G.GRASS, G.FOREST, G.SAND, G.WATER]);
function goodStart(x, y) {
  let water = false;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    if (i % 2 === 0 && !MILD.has(ground(Math.round(x + Math.cos(a) * 7), Math.round(y + Math.sin(a) * 7)))) return false;
    const far = ground(Math.round(x + Math.cos(a) * 14), Math.round(y + Math.sin(a) * 14));
    if (far === G.WATER || far === G.SAND) water = true;
  }
  return water;
}
// Tìm ô đất trống gần (x0, y0). Thế giới mới thì ưu tiên đồng cỏ để khởi đầu dễ thở.
function findLand(x0, y0, grassy) {
  for (let rad = 0; rad < 160; rad++)
    for (let i = -rad; i <= rad; i++) for (const [x, y] of [[x0 + i, y0 - rad], [x0 + i, y0 + rad], [x0 - rad, y0 + i], [x0 + rad, y0 + i]]) {
      const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
      const g = chunks.has(cx * 65536 + cy) ? groundAt(x, y) : ground(x, y);
      if (grassy ? g !== G.GRASS || !goodStart(x, y) : g <= G.WATER) continue;
      if (!objAt(x, y) && !collides(x + 0.5, y + 0.5, 0.4)) return { x: x + 0.5, y: y + 0.5 };
    }
  return grassy ? findLand(x0, y0, false) : { x: x0 + 0.5, y: y0 + 0.5 };
}

// ---------- Hành động ----------
const REACH = 1.75;
function nearObj(id, r = 4) {
  const px = Math.floor(P.x), py = Math.floor(P.y);
  for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) if (objAt(x, y) === id) return true;
  return false;
}
function mobAtPoint(wx, wy) {
  let best = null, bd = 0.8;
  for (const m of mobs) { const d = Math.hypot(m.x - wx, m.y - wy) - MOBS[m.type].r; if (d < bd) { bd = d; best = m; } }
  return best;
}
const mobReach = m => (tool()?.reach || 1.5) + MOBS[m.type].r;
const tileDist = (x, y) => Math.hypot(x + 0.5 - P.x, y + 0.5 - P.y);
const waterTile = (x, y) => groundAt(x, y) <= G.WATER;

function placeTile(wx, wy) {
  const fx_ = wx !== undefined ? Math.floor(wx) : Math.floor(P.x + Math.cos(P.dir) * 1.1);
  const fy = wy !== undefined ? Math.floor(wy) : Math.floor(P.y + Math.sin(P.dir) * 1.1);
  return { x: fx_, y: fy };
}
function canPlace(x, y) {
  if (tileDist(x, y) > REACH + 0.4) return false;
  const g = groundAt(x, y);
  if (g <= G.WATER || objAt(x, y)) return false;
  const inTile = e => e.x > x - 0.4 && e.x < x + 1.4 && e.y > y - 0.4 && e.y < y + 1.4;
  return !inTile(P) && !mobs.some(inTile);
}

// Mục tiêu tự chọn khi bấm nút / phím Space: thú gần nhất, rồi vật thể phía trước, rồi nước để uống.
function autoTarget() {
  if (eq && ITEMS[eq].place) { const t = placeTile(); return { kind: "place", ...t, ok: canPlace(t.x, t.y) }; }
  let best = null, bs = 1e9;
  for (const m of mobs) {
    const d = Math.hypot(m.x - P.x, m.y - P.y);
    if (d > mobReach(m)) continue;
    const s = d - (MOBS[m.type].hostile || m.aggro ? 1 : 0);
    if (s < bs) { bs = s; best = { kind: "mob", m }; }
  }
  if (best) return best;
  const px = Math.floor(P.x), py = Math.floor(P.y);
  for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) {
    const o = objAt(x, y), def = o && OBJ[o];
    if (!def || def.built || def.inert) continue;
    const d = tileDist(x, y);
    if (d > REACH) continue;
    const ang = Math.abs(((Math.atan2(y + 0.5 - P.y, x + 0.5 - P.x) - P.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const s = d + ang * 0.6;
    if (s < bs) { bs = s; best = { kind: "obj", x, y, o }; }
  }
  if (best) return best;
  for (let y = py - 1; y <= py + 1; y++) for (let x = px - 1; x <= px + 1; x++)
    if (waterTile(x, y) && tileDist(x, y) < 1.4) return { kind: "water", x, y };
  return null;
}
function pointTarget(wx, wy) {
  if (eq && ITEMS[eq].place) { const t = placeTile(wx, wy); return { kind: "place", ...t, ok: canPlace(t.x, t.y) }; }
  const m = mobAtPoint(wx, wy);
  if (m && Math.hypot(m.x - P.x, m.y - P.y) <= mobReach(m)) return { kind: "mob", m };
  const x = Math.floor(wx), y = Math.floor(wy), o = objAt(x, y), def = o && OBJ[o];
  if (def && !def.inert && tileDist(x, y) <= REACH) return { kind: "obj", x, y, o };
  if (waterTile(x, y) && tileDist(x, y) < 1.6) return { kind: "water", x, y };
  return null;
}
function targetLabel(t) {
  if (!t) return "Đánh";
  if (t.kind === "mob") return "Đánh";
  if (t.kind === "water") return "Uống";
  if (t.kind === "place") return "Đặt";
  const def = OBJ[t.o];
  if (def.needTool && !(tool() && tool()[def.tool])) return "Cần cuốc";
  return def.verb;
}
function targetHint(t) {
  if (!t) return "";
  if (t.kind === "mob") return `${targetLabel(t)} ${MOBS[t.m.type].name}`;
  if (t.kind === "water") return "Uống nước";
  if (t.kind === "place") return t.ok ? `Đặt ${ITEMS[eq].name}` : "Không đặt được ở đây";
  return `${targetLabel(t)} ${OBJ[t.o].name}`;
}

function act(t) {
  if (P.cd > 0 || dead) return;
  P.cd = 0.36; P.swing = 0.25;
  if (!t) return;
  const face = (x, y) => { P.dir = Math.atan2(y - P.y, x - P.x); };
  if (t.kind === "place") {
    if (!t.ok) { P.cd = 0.15; return; }
    const id = eq;
    setObj(t.x, t.y, ITEMS[id].place);
    take(id, 1);
    if (id === "bed") { spawnPt = { x: t.x + 0.5, y: t.y + 1.5 }; log("Đã đặt giường. Gục ngã sẽ hồi sinh ở đây.", "good"); }
    else log(`Đã đặt ${ITEMS[id].name}`);
    refreshUi();
    return;
  }
  if (t.kind === "water") {
    face(t.x + 0.5, t.y + 0.5);
    P.water = Math.min(100, P.water + 20);
    addFx(t.x + 0.5, t.y + 0.3, "+20 nước", "#7cc4f2");
    burst(t.x + 0.5, t.y + 0.5, "#9fd4f5", 5);
    return;
  }
  if (t.kind === "mob") {
    const m = t.m, def = MOBS[m.type];
    face(m.x, m.y);
    const dmg = Math.round((tool()?.dmg || 4) * (0.85 + Math.random() * 0.3));
    m.hp -= dmg; m.flash = 0.15; m.aggro = true; m.scared = 3;
    const a = Math.atan2(m.y - P.y, m.x - P.x);
    move(m, Math.cos(a) * 0.35, Math.sin(a) * 0.35, def.r, true);
    addFx(m.x, m.y - 0.7, "-" + dmg, "#ffe08a");
    burst(m.x, m.y, m.type === "ghost" ? "#b9a3ff" : "#c44", 5);
    if (m.hp <= 0) {
      mobs.splice(mobs.indexOf(m), 1);
      stats.kills++;
      for (const [id, n] of Object.entries(def.drop)) give(id, n);
      if (m.type === "ghost") log("Quỷ đêm tan biến", "good");
    }
    return;
  }
  const def = OBJ[t.o];
  face(t.x + 0.5, t.y + 0.5);
  let power = 1;
  if (def.tool) power = (tool() && tool()[def.tool]) || (def.needTool ? 0 : 1);
  else if (def.built) power = Math.max(2, tool()?.axe || 0, tool()?.pick || 0);
  if (power === 0) { log("Cần cuốc để đào mỏ sắt", "warn"); return; }
  const k = key(t.x, t.y);
  const hp = (hits.get(k) ?? def.hp) - power;
  burst(t.x + 0.5, t.y + 0.5, def.tool === "pick" ? "#bbb" : def.flat ? "#7fbf5a" : "#8b5a2b", 4);
  if (def.prick && !tool()) hurt(def.prick, "Bị gai xương rồng đâm");
  if (hp > 0) { hits.set(k, hp); return; }
  hits.delete(k);
  setObj(t.x, t.y, def.becomes || O.NONE);
  if (def.becomes === O.BUSH_EMPTY) regrow.push([k, clock + 150]);
  if (def.thirst) { P.water = Math.min(100, P.water + def.thirst); addFx(t.x + 0.5, t.y, `+${def.thirst} nước`, "#7cc4f2"); }
  if (t.o === O.BED && spawnPt && Math.floor(spawnPt.x) === t.x && Math.floor(spawnPt.y) === t.y + 1) spawnPt = null;
  for (const [id, n] of Object.entries(def.drop)) give(id, n);
}
const hits = new Map(); // máu còn lại của vật thể đang bị chặt dở

function use(id) {
  const it = ITEMS[id];
  if (!it || !has(id)) return;
  if (it.food) {
    const f = it.food;
    if (f.hp > 0 && P.hp >= 100 && !f.food) { log("Máu đang đầy", "warn"); return; }
    P.food = Math.min(100, P.food + (f.food || 0));
    P.water = Math.min(100, P.water + (f.water || 0));
    P.hp = Math.min(100, P.hp + (f.hp || 0));
    if (f.hp < 0) log("Ăn thịt sống hơi đau bụng", "warn");
    take(id, 1);
  } else if (it.tool || it.place) {
    eq = eq === id ? null : id;
  }
  refreshUi();
}
function craft(r) {
  if (!canCraft(r)) return;
  for (const [id, n] of Object.entries(r.need)) take(id, n);
  give(r.id, r.n || 1);
  if (ITEMS[r.id].tool && !tool()) eq = r.id;
  refreshUi();
}
const stationOk = r => !r.at || nearObj(r.at);
const canCraft = r => stationOk(r) && Object.entries(r.need).every(([id, n]) => has(id, n)) && !(ITEMS[r.id].one && has(r.id));

// ---------- Sinh vật ----------
function nearestFire(x, y, within) {
  let best = null, bd = within;
  for (const k of fires) {
    const [fx_, fy] = unkey(k), d = Math.hypot(fx_ + 0.5 - x, fy + 0.5 - y);
    if (d < bd) { bd = d; best = { x: fx_ + 0.5, y: fy + 0.5, d }; }
  }
  return best;
}
function spawnMob(night) {
  const a = Math.random() * Math.PI * 2, d = Math.max(12, Math.min(24, viewR() * 0.85)) + Math.random() * 6;
  const x = Math.floor(P.x + Math.cos(a) * d), y = Math.floor(P.y + Math.sin(a) * d);
  const g = groundAt(x, y);
  if (g <= G.WATER || collides(x + 0.5, y + 0.5, 0.5, true)) return;
  let type;
  if (night) {
    if (nearestFire(x, y, 8)) return;
    type = "ghost";
  } else {
    const opts = Object.entries(MOBS).filter(([, m]) => m.where && m.where.includes(g));
    if (!opts.length) return;
    let tot = opts.reduce((s, [, m]) => s + m.w, 0), r = Math.random() * tot;
    for (const [t, m] of opts) { r -= m.w; if (r <= 0) { type = t; break; } }
    type = type || opts[0][0];
  }
  const def = MOBS[type];
  mobs.push({ type, x: x + 0.5, y: y + 0.5, hp: def.hp, t: 0, wx: 0, wy: 0, cd: 0, flash: 0, aggro: false, scared: 0, walk: Math.random() * 9, fade: 0 });
}
let spawnT = 0;
function updateMobs(dt) {
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.8;
    const night = isNight();
    const normal = mobs.filter(m => m.type !== "ghost").length, ghosts = mobs.length - normal;
    if (normal < 14) spawnMob(false);
    if (night && ghosts < Math.min(8, 2 + dayNum())) spawnMob(true);
  }
  const night = isNight();
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i], def = MOBS[m.type];
    const dx = P.x - m.x, dy = P.y - m.y, d = Math.hypot(dx, dy);
    if (d > Math.max(34, viewR() + 10)) { mobs.splice(i, 1); continue; }
    m.cd -= dt; m.flash -= dt; m.scared -= dt; m.t -= dt;
    m.fade = Math.min(1, m.fade + dt);
    if (def.night && !night) {
      m.hp -= 25 * dt;
      if (Math.random() < dt * 8) burst(m.x, m.y, "#b9a3ff", 1);
      if (m.hp <= 0) { mobs.splice(i, 1); continue; }
    }
    let vx = 0, vy = 0, sp = def.speed;
    const fire = (def.hostile || def.neutral) && nearestFire(m.x, m.y, 4.5);
    if (d > 14) m.aggro = false;
    const sight = def.sight ? def.sight * (night && def.hostile ? 1.5 : 1) : 0;
    const chasing = !dead && (def.hostile || def.neutral) && (m.aggro || d < sight);
    if (fire) {
      vx = m.x - fire.x; vy = m.y - fire.y;
    } else if (chasing) {
      vx = dx; vy = dy;
      if (d < def.r + 0.62) {
        vx = vy = 0;
        if (m.cd <= 0) { m.cd = 1.1; m.lunge = 0.2; hurt(def.dmg, `Bị ${def.name.toLowerCase()} tấn công`); }
      }
    } else if (def.flee && (d < def.flee || m.scared > 0) && !dead) {
      vx = -dx; vy = -dy; sp *= 1.1;
    } else {
      if (m.t <= 0) {
        m.t = 1.5 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2, go = Math.random() < 0.6;
        m.wx = go ? Math.cos(a) : 0; m.wy = go ? Math.sin(a) : 0;
      }
      vx = m.wx; vy = m.wy; sp *= 0.35;
    }
    const len = Math.hypot(vx, vy);
    if (len > 0.01) {
      const ox = m.x, oy = m.y;
      move(m, vx / len * sp * dt, vy / len * sp * dt, def.r, true);
      if (Math.abs(m.x - ox) + Math.abs(m.y - oy) < 0.001) m.t = 0; // kẹt thì đổi hướng
      m.walk += dt * sp * 3; m.face = vx < 0 ? -1 : 1;
    }
    m.lunge = Math.max(0, (m.lunge || 0) - dt);
    // không chồng lên người chơi
    if (d < def.r + 0.36 && d > 0.001) move(m, -dx / d * 0.02, -dy / d * 0.02, def.r, true);
  }
}

// ---------- Hiệu ứng ----------
function addFx(x, y, text, color) { fx.push({ x, y, text, color, t: 0 }); }
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, t: 0, life: 0.4 + Math.random() * 0.3, color });
  }
}

// ---------- Vẽ ----------
function ell(x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function circ(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function shadow(x, y, rx) { ell(x, y, rx, rx * 0.38, "rgba(0,0,0,.22)"); }
let now = 0;

function drawObj(c, o, x, y, px, py, s, alpha = 1) {
  const save = ctx; ctx = c; // các hàm vẽ nhỏ dùng ctx toàn cục
  const v = hash(x, y, 21), cx = px + s / 2, base = py + s * 0.86;
  c.save();
  switch (o) {
    case O.TREE: {
      const ox = (v - 0.5) * s * 0.16, r = s * (0.5 + v * 0.14), cy = base - s * 0.8;
      shadow(cx + ox, base, s * 0.42);
      c.fillStyle = "#6b4a2f"; c.fillRect(cx + ox - s * 0.08, base - s * 0.55, s * 0.16, s * 0.55);
      c.globalAlpha = alpha;
      circ(cx + ox, cy, r, "#2d6a2e"); circ(cx + ox - r * 0.32, cy - r * 0.2, r * 0.66, "#3c8638"); circ(cx + ox + r * 0.22, cy - r * 0.42, r * 0.45, "#56a447");
      break;
    }
    case O.PINE: {
      const snow = groundAt(x, y) === G.SNOW, h = s * (1.35 + v * 0.3);
      shadow(cx, base, s * 0.36);
      c.fillStyle = "#5a3e28"; c.fillRect(cx - s * 0.07, base - s * 0.3, s * 0.14, s * 0.3);
      c.globalAlpha = alpha;
      for (let i = 0; i < 3; i++) {
        const w = s * (0.52 - i * 0.12), top = base - s * 0.25 - h * (0.32 + i * 0.26), bot = base - s * 0.2 - h * i * 0.26;
        c.fillStyle = i === 2 ? "#2f6d48" : "#24573b";
        c.beginPath(); c.moveTo(cx, top); c.lineTo(cx + w, bot); c.lineTo(cx - w, bot); c.closePath(); c.fill();
        if (snow) { c.fillStyle = "#f1f5f8"; c.beginPath(); c.moveTo(cx, top); c.lineTo(cx + w * 0.35, top + (bot - top) * 0.35); c.lineTo(cx - w * 0.35, top + (bot - top) * 0.35); c.closePath(); c.fill(); }
      }
      break;
    }
    case O.PALM: {
      shadow(cx, base, s * 0.32);
      const tx = cx + s * 0.22 * (v > 0.5 ? 1 : -1), ty = base - s * 1.15;
      c.strokeStyle = "#8a6438"; c.lineWidth = s * 0.13; c.lineCap = "round";
      c.beginPath(); c.moveTo(cx, base); c.quadraticCurveTo(cx, base - s * 0.6, tx, ty); c.stroke();
      c.globalAlpha = alpha; c.strokeStyle = "#3f9a45"; c.lineWidth = s * 0.11;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.75;
        c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * s * 0.4, ty + Math.sin(a) * s * 0.4 - s * 0.1, tx + Math.cos(a) * s * 0.62, ty + Math.sin(a) * s * 0.5 + s * 0.15); c.stroke();
      }
      circ(tx - s * 0.06, ty + s * 0.08, s * 0.07, "#6b4a22"); circ(tx + s * 0.07, ty + s * 0.1, s * 0.07, "#6b4a22");
      break;
    }
    case O.ROCK: case O.ORE: {
      shadow(cx, base, s * 0.44);
      c.fillStyle = o === O.ORE ? "#6f6a66" : "#8e8b86";
      c.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + i / 6 * Math.PI, rr = s * (0.36 + hash(x, y, 30 + i) * 0.1);
        c.lineTo(cx + Math.cos(a) * rr * 1.1, base - s * 0.08 + Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
      c.fillStyle = o === O.ORE ? "#8a8580" : "#aeaba5";
      c.beginPath(); c.ellipse(cx - s * 0.08, base - s * 0.3, s * 0.18, s * 0.1, -0.3, 0, Math.PI * 2); c.fill();
      if (o === O.ORE) for (let i = 0; i < 5; i++) circ(cx + (hash(x, y, 50 + i) - 0.5) * s * 0.55, base - s * 0.1 - hash(x, y, 60 + i) * s * 0.3, s * 0.045, "#e08a3c");
      break;
    }
    case O.BUSH: case O.BUSH_EMPTY: {
      const full = o === O.BUSH;
      shadow(cx, base, s * 0.36);
      circ(cx - s * 0.14, base - s * 0.2, s * 0.22, full ? "#2f7a3a" : "#5b7a45");
      circ(cx + s * 0.15, base - s * 0.22, s * 0.2, full ? "#2f7a3a" : "#5b7a45");
      circ(cx, base - s * 0.34, s * 0.22, full ? "#3e9147" : "#6d8c52");
      if (full) for (let i = 0; i < 5; i++) circ(cx + (hash(x, y, 70 + i) - 0.5) * s * 0.5, base - s * 0.15 - hash(x, y, 80 + i) * s * 0.32, s * 0.055, "#d6304a");
      break;
    }
    case O.TUFT: {
      const dry = groundAt(x, y) === G.DESERT;
      c.strokeStyle = dry ? "#b08a4a" : "#4f9a3c"; c.lineWidth = Math.max(1.5, s * 0.05); c.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const bx = cx + (i - 2.5) * s * 0.08, sway = Math.sin(now * 2 + x + i) * s * 0.03;
        c.beginPath(); c.moveTo(bx, base - s * 0.05); c.quadraticCurveTo(bx + sway, base - s * 0.25, bx + (i - 2.5) * s * 0.05 + sway, base - s * (0.38 + hash(x, y, 90 + i) * 0.15)); c.stroke();
      }
      break;
    }
    case O.CACTUS: {
      shadow(cx, base, s * 0.28);
      c.fillStyle = "#4b8a4a"; c.strokeStyle = "#3a6f39"; c.lineWidth = 1;
      const rr = (X, Y, W, H) => { c.beginPath(); c.roundRect(X, Y, W, H, W / 2); c.fill(); c.stroke(); };
      rr(cx - s * 0.12, base - s * 0.95, s * 0.24, s * 0.95);
      rr(cx - s * 0.36, base - s * 0.62, s * 0.14, s * 0.32); rr(cx - s * 0.36, base - s * 0.38, s * 0.3, s * 0.12);
      rr(cx + s * 0.22, base - s * 0.75, s * 0.14, s * 0.32); rr(cx + s * 0.06, base - s * 0.5, s * 0.3, s * 0.12);
      break;
    }
    case O.WALL: case O.SWALL: {
      const stone = o === O.SWALL, h = s * 0.5;
      c.fillStyle = stone ? "#6e6c69" : "#6b4527"; c.fillRect(px, py + s - h, s, h);
      c.fillStyle = stone ? "#9a9792" : "#9a6a3c"; c.fillRect(px, py - h * 0.6, s, s - h + h * 0.6);
      c.strokeStyle = stone ? "#5d5b58" : "#5a3a1f"; c.lineWidth = 1;
      const top = py - h * 0.6, rowH = (s - h + h * 0.6) / 3;
      c.beginPath();
      if (stone) for (let r = 0; r < 3; r++) {
        if (r) { c.moveTo(px, top + r * rowH); c.lineTo(px + s, top + r * rowH); }
        for (let q = r % 2 ? s / 4 : s / 2; q < s; q += s / 2) { c.moveTo(px + q, top + r * rowH); c.lineTo(px + q, top + (r + 1) * rowH); }
      }
      c.stroke();
      if (!stone) for (let q = 1; q < 4; q++) { c.beginPath(); c.moveTo(px + q * s / 4, py - h * 0.6); c.lineTo(px + q * s / 4, py + s); c.stroke(); }
      break;
    }
    case O.FIRE: {
      shadow(cx, base, s * 0.42);
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; circ(cx + Math.cos(a) * s * 0.3, base - s * 0.18 + Math.sin(a) * s * 0.13, s * 0.08, "#7d7a75"); }
      c.strokeStyle = "#5a3a1f"; c.lineWidth = s * 0.09; c.lineCap = "round";
      c.beginPath(); c.moveTo(cx - s * 0.2, base - s * 0.1); c.lineTo(cx + s * 0.2, base - s * 0.26); c.moveTo(cx + s * 0.2, base - s * 0.1); c.lineTo(cx - s * 0.2, base - s * 0.26); c.stroke();
      const fl = Math.sin(now * 13 + x) * 0.06 + Math.sin(now * 7.3) * 0.05;
      const flame = (w, h, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(cx - w, base - s * 0.2); c.quadraticCurveTo(cx - w, base - s * (0.2 + h * 0.6), cx + fl * s, base - s * (0.2 + h)); c.quadraticCurveTo(cx + w, base - s * (0.2 + h * 0.6), cx + w, base - s * 0.2); c.fill(); };
      flame(s * 0.2, 0.62 + fl, "#e8572a"); flame(s * 0.13, 0.45 + fl, "#f6a33a"); flame(s * 0.07, 0.28, "#ffe7a0");
      break;
    }
    case O.BENCH: {
      shadow(cx, base, s * 0.46);
      c.fillStyle = "#5a3a1f"; c.fillRect(px + s * 0.12, base - s * 0.3, s * 0.1, s * 0.3); c.fillRect(px + s * 0.78, base - s * 0.3, s * 0.1, s * 0.3);
      c.fillStyle = "#9a6a3c"; c.fillRect(px + s * 0.04, base - s * 0.58, s * 0.92, s * 0.3);
      c.fillStyle = "#b9844e"; c.fillRect(px + s * 0.04, base - s * 0.58, s * 0.92, s * 0.08);
      c.fillStyle = "#c9c6c0"; c.fillRect(px + s * 0.2, base - s * 0.7, s * 0.3, s * 0.1);
      c.fillStyle = "#6b4527"; c.fillRect(px + s * 0.6, base - s * 0.76, s * 0.08, s * 0.2); c.fillStyle = "#8d8a86"; c.fillRect(px + s * 0.54, base - s * 0.8, s * 0.2, s * 0.08);
      break;
    }
    case O.BED: {
      c.fillStyle = "#5a3a1f"; c.fillRect(px + s * 0.08, py + s * 0.02, s * 0.84, s * 0.92);
      c.fillStyle = "#e9e1cf"; c.fillRect(px + s * 0.14, py + s * 0.08, s * 0.72, s * 0.24);
      c.fillStyle = "#b8463a"; c.fillRect(px + s * 0.14, py + s * 0.36, s * 0.72, s * 0.54);
      c.fillStyle = "#9c3a30"; c.fillRect(px + s * 0.14, py + s * 0.36, s * 0.72, s * 0.06);
      break;
    }
  }
  c.restore();
  ctx = save;
}

function drawMob(m) {
  const def = MOBS[m.type], [sx, sy] = toScreen(m.x, m.y), s = TS, f = m.face || 1;
  const bob = Math.sin(m.walk) * s * 0.03, lg = Math.sin(m.walk) * s * 0.06;
  ctx.save();
  ctx.globalAlpha = m.fade;
  if (m.type !== "ghost") shadow(sx, sy + def.r * s * 0.7, def.r * s * 0.9);
  ctx.translate(sx + (m.lunge ? Math.sign(P.x - m.x) * s * 0.12 : 0), sy - bob);
  ctx.scale(f, 1);
  const hit = m.flash > 0;
  const leg = (x, c) => { ctx.fillStyle = c; ctx.fillRect(x, s * 0.05, s * 0.07, s * 0.16 + (x > 0 ? lg : -lg)); };
  switch (m.type) {
    case "rabbit": {
      const c = hit ? "#fff" : "#d9ccb6";
      ell(0, 0, s * 0.22, s * 0.16, c); circ(s * 0.18, -s * 0.1, s * 0.12, c);
      ell(s * 0.16, -s * 0.3, s * 0.04, s * 0.13, c); ell(s * 0.24, -s * 0.28, s * 0.04, s * 0.12, c);
      circ(-s * 0.22, -s * 0.02, s * 0.06, "#f4efe6"); circ(s * 0.23, -s * 0.12, s * 0.025, "#222");
      break;
    }
    case "deer": {
      const c = hit ? "#fff" : "#a8743f";
      leg(-s * 0.22, "#7a522b"); leg(-s * 0.1, "#7a522b"); leg(s * 0.1, "#7a522b"); leg(s * 0.2, "#7a522b");
      ell(0, -s * 0.05, s * 0.32, s * 0.17, c); ctx.fillStyle = c; ctx.fillRect(s * 0.2, -s * 0.38, s * 0.1, s * 0.3);
      ell(s * 0.32, -s * 0.38, s * 0.13, s * 0.09, c);
      ctx.strokeStyle = "#e8dcc3"; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.moveTo(s * 0.28, -s * 0.44); ctx.lineTo(s * 0.22, -s * 0.66); ctx.lineTo(s * 0.14, -s * 0.72); ctx.moveTo(s * 0.23, -s * 0.6); ctx.lineTo(s * 0.32, -s * 0.7); ctx.stroke();
      for (let i = 0; i < 3; i++) circ(-s * 0.12 + i * s * 0.1, -s * 0.12, s * 0.025, "#efe2c8");
      circ(s * 0.37, -s * 0.4, s * 0.025, "#222");
      break;
    }
    case "wolf": case "bear": {
      const bear = m.type === "bear", k = bear ? 1.35 : 1, c = hit ? "#fff" : bear ? "#5e4130" : "#7d838b", dk = bear ? "#47301f" : "#5c6168";
      leg(-s * 0.22 * k, dk); leg(-s * 0.1 * k, dk); leg(s * 0.08 * k, dk); leg(s * 0.2 * k, dk);
      ell(0, -s * 0.04 * k, s * 0.3 * k, s * 0.17 * k, c);
      circ(s * 0.3 * k, -s * 0.14 * k, s * 0.14 * k, c);
      ell(s * 0.42 * k, -s * 0.1 * k, s * 0.08 * k, s * 0.06 * k, bear ? "#7a5640" : "#9aa0a8");
      if (bear) { circ(s * 0.24 * k, -s * 0.27 * k, s * 0.05 * k, c); circ(s * 0.36 * k, -s * 0.27 * k, s * 0.05 * k, c); }
      else {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(s * 0.22, -s * 0.22); ctx.lineTo(s * 0.26, -s * 0.38); ctx.lineTo(s * 0.32, -s * 0.24); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = s * 0.07; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.08); ctx.lineTo(-s * 0.42, -s * 0.2); ctx.stroke();
      }
      circ(s * 0.34 * k, -s * 0.17 * k, s * 0.03, isNight() && !bear ? "#ff4b3a" : "#1b1b1b");
      break;
    }
    case "scorpion": {
      const c = hit ? "#fff" : "#b5793a";
      ctx.strokeStyle = "#7d5226"; ctx.lineWidth = s * 0.03;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.05 + i * s * 0.08, 0); ctx.lineTo(-s * 0.1 + i * s * 0.1, s * 0.16 + (i % 2 ? lg : -lg)); ctx.stroke(); }
      ell(0, 0, s * 0.2, s * 0.12, c);
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.07; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-s * 0.18, 0); ctx.quadraticCurveTo(-s * 0.42, -s * 0.2, -s * 0.22, -s * 0.38); ctx.stroke();
      circ(-s * 0.18, -s * 0.38, s * 0.05, "#3a2410");
      circ(s * 0.26, -s * 0.06, s * 0.07, c); circ(s * 0.26, s * 0.06, s * 0.07, c);
      break;
    }
    case "ghost": {
      const w = Math.sin(now * 4 + m.walk) * s * 0.04;
      ctx.globalAlpha = m.fade * (0.75 + Math.sin(now * 3) * 0.1);
      ctx.fillStyle = hit ? "#fff" : "#6b5bb3";
      ctx.beginPath(); ctx.arc(0, -s * 0.28, s * 0.3, Math.PI, 0);
      ctx.lineTo(s * 0.3, s * 0.15);
      for (let i = 0; i < 4; i++) ctx.lineTo(s * (0.22 - i * 0.15), s * (i % 2 ? 0.15 : 0.28) + w);
      ctx.lineTo(-s * 0.3, s * 0.15); ctx.closePath(); ctx.fill();
      circ(-s * 0.1, -s * 0.3, s * 0.06, "#e9f0ff"); circ(s * 0.1, -s * 0.3, s * 0.06, "#e9f0ff");
      circ(-s * 0.09, -s * 0.29, s * 0.03, "#ff3d7a"); circ(s * 0.11, -s * 0.29, s * 0.03, "#ff3d7a");
      break;
    }
  }
  ctx.restore();
  if (m.hp < def.hp) {
    const w = s * 0.7;
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(sx - w / 2, sy - s * 0.85, w, 5);
    ctx.fillStyle = "#e0503c"; ctx.fillRect(sx - w / 2 + 1, sy - s * 0.85 + 1, (w - 2) * Math.max(0, m.hp / def.hp), 3);
  }
}

function drawToolShape(c, id, s) {
  // vẽ đồ cầm tay quanh gốc (0,0), cán hướng sang phải
  c.lineCap = "round";
  const handle = (len, col = "#8a5a32") => { c.strokeStyle = col; c.lineWidth = s * 0.08; c.beginPath(); c.moveTo(0, 0); c.lineTo(len, 0); c.stroke(); };
  const metal = id && id[0] === "i" || id === "sword" ? "#cfd6dc" : "#8f8b85";
  switch (id) {
    case "axe": case "iaxe":
      handle(s * 0.62);
      c.fillStyle = metal; c.beginPath(); c.moveTo(s * 0.48, -s * 0.04); c.quadraticCurveTo(s * 0.62, -s * 0.28, s * 0.74, -s * 0.2); c.lineTo(s * 0.62, s * 0.02); c.closePath(); c.fill();
      break;
    case "pick": case "ipick":
      handle(s * 0.62);
      c.strokeStyle = metal; c.lineWidth = s * 0.09; c.beginPath(); c.moveTo(s * 0.48, -s * 0.24); c.quadraticCurveTo(s * 0.68, -s * 0.04, s * 0.58, s * 0.22); c.stroke();
      break;
    case "spear":
      handle(s * 0.9);
      c.fillStyle = metal; c.beginPath(); c.moveTo(s * 0.86, -s * 0.07); c.lineTo(s * 1.08, 0); c.lineTo(s * 0.86, s * 0.07); c.closePath(); c.fill();
      break;
    case "sword":
      c.strokeStyle = "#5a3a1f"; c.lineWidth = s * 0.08; c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 0.16, 0); c.stroke();
      c.strokeStyle = "#d9a43a"; c.lineWidth = s * 0.07; c.beginPath(); c.moveTo(s * 0.17, -s * 0.12); c.lineTo(s * 0.17, s * 0.12); c.stroke();
      c.strokeStyle = metal; c.lineWidth = s * 0.08; c.beginPath(); c.moveTo(s * 0.2, 0); c.lineTo(s * 0.78, 0); c.stroke();
      break;
    case "torch":
      handle(s * 0.5, "#6b4527");
      circ2(c, s * 0.54, 0, s * 0.1 + Math.sin(now * 14) * s * 0.015, "#f08a2c"); circ2(c, s * 0.55, 0, s * 0.055, "#ffe39a");
      break;
  }
}
function circ2(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

function drawPlayer() {
  const [sx, sy] = toScreen(P.x, P.y), s = TS;
  const bob = Math.abs(Math.sin(P.walk)) * s * 0.04;
  shadow(sx, sy + s * 0.26, s * 0.3);
  const fx_ = Math.cos(P.dir), back = Math.sin(P.dir) < -0.3;
  const swingA = P.swing > 0 ? Math.sin((1 - P.swing / 0.25) * Math.PI) * 1.4 - 0.6 : 0;
  const drawHand = () => {
    ctx.save();
    ctx.translate(sx + fx_ * s * 0.22, sy - s * 0.08 - bob + Math.sin(P.dir) * s * 0.08);
    ctx.rotate(P.dir - 0.5 + swingA);
    if (eq && ITEMS[eq].tool) drawToolShape(ctx, eq, s);
    circ(0, 0, s * 0.08, "#e3b48a");
    ctx.restore();
  };
  if (back) drawHand();
  // chân
  const lg = Math.sin(P.walk) * s * 0.07;
  ctx.fillStyle = "#3b3a4a"; ctx.fillRect(sx - s * 0.14, sy + s * 0.05, s * 0.1, s * 0.18 + lg); ctx.fillRect(sx + s * 0.04, sy + s * 0.05, s * 0.1, s * 0.18 - lg);
  // thân
  const body = P.hurt > 0 ? "#ffd2c8" : has("armor") ? "#8a5f3a" : "#c2573a";
  ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(sx - s * 0.2, sy - s * 0.25 - bob, s * 0.4, s * 0.36, s * 0.1); ctx.fill();
  // đầu
  circ(sx, sy - s * 0.42 - bob, s * 0.17, "#e3b48a");
  ctx.fillStyle = "#4a3022"; ctx.beginPath(); ctx.arc(sx, sy - s * 0.46 - bob, s * 0.175, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  if (!back) {
    const ex = fx_ * s * 0.06;
    circ(sx - s * 0.06 + ex, sy - s * 0.41 - bob, s * 0.025, "#1e1e1e"); circ(sx + s * 0.06 + ex, sy - s * 0.41 - bob, s * 0.025, "#1e1e1e");
  } else {
    ctx.fillStyle = "#4a3022"; ctx.beginPath(); ctx.arc(sx, sy - s * 0.42 - bob, s * 0.17, 0, Math.PI * 2); ctx.fill();
  }
  if (!back) drawHand();
}

let target = null, hintT = 0;
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1c486f"; ctx.fillRect(0, 0, vw, vh);
  const x0 = Math.floor(cam.x - vw / 2 / TS) - 1, x1 = Math.ceil(cam.x + vw / 2 / TS) + 1;
  const y0 = Math.floor(cam.y - vh / 2 / TS) - 1, y1 = Math.ceil(cam.y + vh / 2 / TS) + 2;
  // nền
  ctx.imageSmoothingEnabled = false;
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++)
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
      const ch = chunk(cx, cy);
      if (!ch.img) paintChunk(ch);
      const [ax, ay] = toScreen(cx * CHUNK, cy * CHUNK), [bx, by] = toScreen((cx + 1) * CHUNK, (cy + 1) * CHUNK);
      const rx = Math.round(ax), ry = Math.round(ay);
      ctx.drawImage(ch.img, rx, ry, Math.round(bx) - rx, Math.round(by) - ry);
    }
  ctx.imageSmoothingEnabled = true;
  // vật thể phẳng trước, vật thể cao xếp theo chiều sâu cùng sinh vật
  const list = [];
  for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1; x++) {
    const o = objAt(x, y);
    if (!o) continue;
    const [px, py] = toScreen(x, y);
    if (OBJ[o].flat || o === O.BED) drawObj(ctx, o, x, y, px, py, TS);
    else list.push({ z: y + 0.9, o, x, y, px, py });
  }
  for (const m of mobs) list.push({ z: m.y + MOBS[m.type].r * 0.5, m });
  if (!preview) list.push({ z: P.y + 0.25, p: true });
  list.sort((a, b) => a.z - b.z);
  // khung chọn mục tiêu
  if (target && !dead) drawTarget(target);
  for (const it of list) {
    if (it.p) drawPlayer();
    else if (it.m) drawMob(it.m);
    else {
      const def = OBJ[it.o];
      let alpha = 1;
      if (def.tall && Math.abs(P.x - (it.x + 0.5)) < 0.9 && P.y < it.y + 0.6 && P.y > it.y - 1.6) alpha = 0.45;
      drawObj(ctx, it.o, it.x, it.y, it.px, it.py, TS, alpha);
    }
  }
  // hạt & chữ bay
  for (const p of parts) { const [sx, sy] = toScreen(p.x, p.y); ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.color; ctx.fillRect(sx - 2, sy - 2, 4, 4); }
  ctx.globalAlpha = 1;
  ctx.font = `700 ${Math.round(TS * 0.36)}px "Be Vietnam Pro", system-ui, sans-serif`;
  ctx.textAlign = "center";
  for (const f of fx) {
    const [sx, sy] = toScreen(f.x, f.y - f.t * 0.9);
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.strokeText(f.text, sx, sy);
    ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;
  drawLight(x0, y0, x1, y1);
  if (!preview && (P.hurt > 0 || P.hp < 25)) {
    const a = Math.max(P.hurt * 1.4, P.hp < 25 ? 0.25 + Math.sin(now * 5) * 0.1 : 0);
    const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
    g.addColorStop(0, "rgba(200,30,20,0)"); g.addColorStop(1, `rgba(200,30,20,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  }
}
function drawTarget(t) {
  ctx.save();
  ctx.lineWidth = 2;
  if (t.kind === "mob") {
    const [sx, sy] = toScreen(t.m.x, t.m.y), r = MOBS[t.m.type].r * TS;
    ctx.strokeStyle = "rgba(255,120,90,.9)"; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.6, r * 1.2, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    const [px, py] = toScreen(t.x, t.y);
    ctx.strokeStyle = t.kind === "place" && !t.ok ? "rgba(230,80,60,.9)" : "rgba(255,230,160,.9)";
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(px + 2, py + 2, TS - 4, TS - 4);
    if (t.kind === "place") { ctx.globalAlpha = 0.5; drawObj(ctx, ITEMS[eq].place, t.x, t.y, px, py, TS); }
  }
  ctx.restore();
}
function drawLight(x0, y0, x1, y1) {
  const a = darkness();
  if (a <= 0.01) return;
  const W = dark.width, H = dark.height, k = W / vw;
  dctx.globalCompositeOperation = "source-over";
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = `rgba(6,10,28,${a})`; dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = "destination-out";
  const hole = (wx, wy, r) => {
    const [sx, sy] = toScreen(wx, wy), R = r * TS * k;
    const g = dctx.createRadialGradient(sx * k, sy * k, R * 0.15, sx * k, sy * k, R);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g; dctx.beginPath(); dctx.arc(sx * k, sy * k, R, 0, Math.PI * 2); dctx.fill();
  };
  const lights = [];
  hole(P.x, P.y, tool()?.light ? tool().light + Math.sin(now * 11) * 0.15 : 2.4);
  for (const kk of fires) {
    const [fx_, fy] = unkey(kk);
    if (fx_ < x0 - 7 || fx_ > x1 + 7 || fy < y0 - 7 || fy > y1 + 7) continue;
    const r = OBJ[O.FIRE].light + Math.sin(now * 9 + fx_) * 0.2;
    hole(fx_ + 0.5, fy + 0.5, r); lights.push([fx_ + 0.5, fy + 0.5, r]);
  }
  ctx.drawImage(dark, 0, 0, vw, vh);
  // ánh lửa ấm
  ctx.globalCompositeOperation = "lighter";
  for (const [lx, ly, r] of lights) {
    const [sx, sy] = toScreen(lx, ly), R = r * TS * 0.8;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, `rgba(255,140,40,${0.28 * a})`); g.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = g; ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

// ---------- Bản đồ nhỏ ----------
const mm = $("minimap"), mmx = mm.getContext("2d"), mmImg = mmx.createImageData(96, 96);
function drawMinimap() {
  const ox = Math.floor(P.x) - 48, oy = Math.floor(P.y) - 48, d = mmImg.data;
  for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
    const x = ox + i, y = oy + j, g = groundAt(x, y), o = objAt(x, y), c = G_RGB[g], p = (j * 96 + i) * 4;
    const tree = o === O.TREE || o === O.PINE || o === O.PALM, rock = o === O.ROCK || o === O.ORE;
    const built = o >= O.WALL;
    d[p] = built ? 240 : tree ? c[0] * 0.6 : rock ? 110 : c[0];
    d[p + 1] = built ? 160 : tree ? c[1] * 0.7 : rock ? 108 : c[1];
    d[p + 2] = built ? 60 : tree ? c[2] * 0.6 : rock ? 104 : c[2];
    d[p + 3] = 255;
  }
  mmx.putImageData(mmImg, 0, 0);
  if (spawnPt && Math.abs(spawnPt.x - P.x) < 48 && Math.abs(spawnPt.y - P.y) < 48) { mmx.fillStyle = "#ff5a4a"; mmx.fillRect(spawnPt.x - ox - 2, spawnPt.y - oy - 3, 4, 4); }
  mmx.fillStyle = "#fff"; mmx.fillRect(46, 46, 4, 4);
  mmx.fillStyle = "#111"; mmx.fillRect(47, 47, 2, 2);
  $("where").textContent = `${G_NAME[groundAt(Math.floor(P.x), Math.floor(P.y))]} · ${Math.floor(P.x)}, ${Math.floor(P.y)}`;
}

// ---------- Giao diện ----------
const icons = {};
function makeIcons() {
  const draw = (id, fn) => { const c = document.createElement("canvas"); c.width = c.height = 64; fn(c.getContext("2d")); icons[id] = c.toDataURL(); };
  const obj = (o, ox = 0, oy = 0) => g => drawObj(g, o, 0, 0, 12 + ox, 18 + oy, 40);
  draw("wood", g => { g.fillStyle = "#8a5a32"; g.save(); g.translate(32, 32); g.rotate(-0.5); g.fillRect(-22, -9, 44, 18); g.fillStyle = "#c8945a"; g.beginPath(); g.ellipse(22, 0, 5, 9, 0, 0, 7); g.fill(); g.restore(); });
  draw("stone", g => { g.fillStyle = "#8e8b86"; g.beginPath(); g.ellipse(32, 36, 20, 14, 0, 0, 7); g.fill(); g.fillStyle = "#b5b2ac"; g.beginPath(); g.ellipse(26, 31, 8, 5, -0.3, 0, 7); g.fill(); });
  draw("fiber", g => { g.strokeStyle = "#6fb04a"; g.lineWidth = 3; g.lineCap = "round"; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(22 + i * 5, 54); g.quadraticCurveTo(28 + i * 2, 30, 18 + i * 8, 10); g.stroke(); } g.strokeStyle = "#c9a35a"; g.beginPath(); g.moveTo(20, 40); g.lineTo(46, 40); g.stroke(); });
  draw("hide", g => { g.fillStyle = "#b98a5a"; g.beginPath(); g.moveTo(14, 18); g.lineTo(50, 16); g.lineTo(46, 30); g.lineTo(52, 48); g.lineTo(32, 44); g.lineTo(12, 50); g.lineTo(18, 32); g.closePath(); g.fill(); g.fillStyle = "#9a6e42"; g.beginPath(); g.ellipse(32, 32, 9, 7, 0, 0, 7); g.fill(); });
  draw("ore", g => { g.fillStyle = "#6f6a66"; g.beginPath(); g.ellipse(32, 36, 20, 15, 0, 0, 7); g.fill(); g.fillStyle = "#e08a3c"; for (const [x, y] of [[24, 32], [36, 28], [40, 40], [28, 42]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); } });
  draw("iron", g => { g.fillStyle = "#9aa3ab"; g.beginPath(); g.moveTo(14, 44); g.lineTo(22, 26); g.lineTo(50, 26); g.lineTo(54, 44); g.closePath(); g.fill(); g.fillStyle = "#cfd6dc"; g.fillRect(22, 26, 28, 5); });
  draw("berry", g => { for (const [x, y] of [[26, 30], [38, 28], [32, 40], [22, 42], [42, 40]]) { g.fillStyle = "#d6304a"; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = "#ff8a9a"; g.beginPath(); g.arc(x - 2, y - 2, 2, 0, 7); g.fill(); } g.fillStyle = "#3e9147"; g.beginPath(); g.ellipse(32, 18, 9, 4, 0.3, 0, 7); g.fill(); });
  const leg = col => g => { g.fillStyle = "#efe6d2"; g.save(); g.translate(32, 32); g.rotate(-0.7); g.fillRect(6, -3, 20, 6); g.beginPath(); g.arc(26, -4, 4, 0, 7); g.arc(26, 4, 4, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.ellipse(-6, 0, 16, 12, 0, 0, 7); g.fill(); g.restore(); };
  draw("meat", leg("#e07a7a")); draw("cooked", leg("#9a5a2a"));
  draw("bandage", g => { g.fillStyle = "#efe6d2"; g.beginPath(); g.ellipse(32, 32, 20, 14, -0.4, 0, 7); g.fill(); g.fillStyle = "#d8503f"; g.fillRect(28, 22, 8, 20); g.fillRect(22, 28, 20, 8); });
  for (const id of ["axe", "iaxe", "pick", "ipick", "spear", "sword", "torch"]) draw(id, g => { g.translate(id === "spear" ? 6 : 12, 52); g.rotate(-0.8); drawToolShape(g, id, id === "spear" ? 52 : 64); });
  draw("armor", g => { g.fillStyle = "#8a5f3a"; g.beginPath(); g.moveTo(20, 12); g.lineTo(28, 16); g.lineTo(36, 16); g.lineTo(44, 12); g.lineTo(54, 22); g.lineTo(46, 30); g.lineTo(46, 54); g.lineTo(18, 54); g.lineTo(18, 30); g.lineTo(10, 22); g.closePath(); g.fill(); g.strokeStyle = "#5a3a1f"; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 18); g.lineTo(32, 52); g.stroke(); });
  draw("fire", obj(O.FIRE, 0, 2)); draw("bench", obj(O.BENCH, 0, 4)); draw("wall", obj(O.WALL, 0, 4)); draw("swall", obj(O.SWALL, 0, 4)); draw("bed", obj(O.BED, 0, -6));
}

let uiDirty = true;
function refreshUi() { uiDirty = true; }
function renderUi() {
  uiDirty = false;
  // thanh đồ nhanh
  const hb = $("hotbar"), list = HOTBAR_ORDER.filter(id => has(id)).slice(0, 9);
  hb.innerHTML = "";
  const slot = (id, label, i) => {
    const b = document.createElement("button");
    b.className = "slot" + ((id === null ? eq === null : eq === id) ? " on" : "");
    b.title = id ? ITEMS[id].name : "Tay không";
    b.innerHTML = id ? `<img src="${icons[id]}" alt="${ITEMS[id].name}"><span class="n">${inv[id] > 1 ? inv[id] : ""}</span>` : `<span class="hand">${label}</span>`;
    if (i !== undefined) b.insertAdjacentHTML("beforeend", `<span class="k">${i}</span>`);
    b.onclick = () => { if (id === null) eq = null; else use(id); refreshUi(); };
    hb.appendChild(b);
  };
  slot(null, "Tay", touchMode ? undefined : 1);
  list.forEach((id, i) => slot(id, "", touchMode ? undefined : i + 2));
  if (!$("bag").hidden) renderBag();
}
let bagTab = "craft";
function renderBag() {
  const nearFire = nearObj(O.FIRE), nearBench = nearObj(O.BENCH);
  $("stationTxt").textContent = `Gần lửa trại: ${nearFire ? "có" : "không"} · Gần bàn chế tạo: ${nearBench ? "có" : "không"}`;
  const cl = $("craftList"), il = $("invList");
  cl.hidden = bagTab !== "craft"; il.hidden = bagTab !== "inv";
  $("tabCraft").classList.toggle("on", bagTab === "craft"); $("tabInv").classList.toggle("on", bagTab === "inv");
  if (bagTab === "craft") {
    cl.innerHTML = "";
    const sorted = [...RECIPES].sort((a, b) => canCraft(b) - canCraft(a));
    for (const r of sorted) {
      const it = ITEMS[r.id], ok = canCraft(r), owned = it.one && has(r.id);
      const row = document.createElement("div");
      row.className = "recipe" + (ok ? " ok" : "");
      const chips = Object.entries(r.need).map(([id, n]) => `<span class="chip ${has(id, n) ? "have" : "lack"}">${ITEMS[id].name} ${inv[id] || 0}/${n}</span>`).join("")
        + (r.at ? `<span class="chip ${stationOk(r) ? "have" : "lack"}">Gần ${OBJ[r.at].name.toLowerCase()}</span>` : "");
      row.innerHTML = `<img src="${icons[r.id]}" alt=""><div><div class="name">${it.name}${r.n ? " ×" + r.n : ""}</div><div class="desc">${r.desc}</div><div class="needs">${chips}</div></div>`;
      const b = document.createElement("button");
      b.className = "btn small"; b.textContent = owned ? "Đã có" : "Chế"; b.disabled = !ok;
      b.onclick = () => craft(r);
      row.appendChild(b); cl.appendChild(row);
    }
  } else {
    il.innerHTML = "";
    const ids = Object.keys(inv).filter(id => inv[id] > 0);
    if (!ids.length) il.innerHTML = `<p class="empty">Túi trống. Nhổ cỏ cao lấy sợi, chặt cây lấy gỗ, đập đá lấy đá.</p>`;
    for (const id of ids) {
      const it = ITEMS[id], b = document.createElement("button");
      b.className = "item" + (eq === id || (id === "armor") ? " on" : "");
      const hint = it.food ? "Bấm để dùng" : it.tool || it.place ? (eq === id ? "Đang cầm" : "Bấm để cầm") : id === "armor" ? "Đang mặc" : "";
      b.innerHTML = `<img src="${icons[id]}" alt=""><span>${it.name}</span><b>${inv[id]}</b><span class="muted">${hint}</span>`;
      b.onclick = () => use(id);
      il.appendChild(b);
    }
  }
}
function openBag(open = $("bag").hidden) {
  $("bag").hidden = !open;
  paused = open && touchMode;
  if (open) renderBag();
}
function setBar(id, v) {
  $(id + "Bar").style.width = Math.max(0, v) + "%";
  $(id + "Txt").textContent = Math.max(0, Math.ceil(v));
  $(id + "Txt").parentElement.classList.toggle("low", v < 25);
}
let lastLog = "", lastLogT = 0;
function log(text, cls = "") {
  if (text === lastLog && now - lastLogT < 2) return;
  lastLog = text; lastLogT = now;
  const li = document.createElement("li");
  li.textContent = text; li.className = cls;
  const ul = $("log"); ul.appendChild(li);
  while (ul.children.length > 5) ul.firstChild.remove();
  setTimeout(() => li.remove(), 5000);
}

// ---------- Điều khiển ----------
const keys = new Set();
let touchMode = false, stick = null, holdPt = null, btnHeld = false, mouse = null;
addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if (k === "e" || k === "tab") { e.preventDefault(); if (running && !dead) openBag(); return; }
  if (k === "escape") { if (!$("bag").hidden) openBag(false); else if (running && !dead) showMenu(); return; }
  if (/^[1-9]$/.test(k) && running) {
    const n = +k;
    if (n === 1) eq = null;
    else { const id = HOTBAR_ORDER.filter(i => has(i)).slice(0, 9)[n - 2]; if (id) use(id); }
    refreshUi(); return;
  }
  if (k === " ") e.preventDefault();
  keys.add(k);
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => { keys.clear(); holdPt = null; btnHeld = false; stick = null; $("stick").hidden = true; });

function setTouch(on) {
  if (touchMode === on) return;
  touchMode = on; document.body.classList.toggle("touch", on); refreshUi();
}
cv.addEventListener("pointerdown", e => {
  if (!running || dead) return;
  setTouch(e.pointerType !== "mouse");
  if (touchMode && e.clientX < vw * 0.45 && !stick) {
    stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    const s = $("stick"); s.hidden = false; s.style.left = e.clientX + "px"; s.style.top = e.clientY + "px"; s.firstChild.style.transform = "";
  } else if (e.button === 0) {
    holdPt = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
  }
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", e => {
  if (e.pointerType === "mouse") mouse = { sx: e.clientX, sy: e.clientY };
  if (stick && e.pointerId === stick.id) {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const l = Math.hypot(dx, dy), max = 46;
    if (l > max) { dx *= max / l; dy *= max / l; }
    stick.dx = dx / max; stick.dy = dy / max;
    $("stick").firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (holdPt && e.pointerId === holdPt.id) { holdPt.sx = e.clientX; holdPt.sy = e.clientY; }
});
const endPtr = e => {
  if (stick && e.pointerId === stick.id) { stick = null; $("stick").hidden = true; }
  if (holdPt && e.pointerId === holdPt.id) holdPt = null;
};
cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("contextmenu", e => e.preventDefault());
const ab = $("actBtn");
ab.addEventListener("pointerdown", e => { e.preventDefault(); btnHeld = true; ab.classList.add("press"); ab.setPointerCapture(e.pointerId); });
const abUp = () => { btnHeld = false; ab.classList.remove("press"); };
ab.addEventListener("pointerup", abUp); ab.addEventListener("pointercancel", abUp);

$("bagBtn").onclick = () => openBag();
$("bagClose").onclick = () => openBag(false);
$("tabCraft").onclick = () => { bagTab = "craft"; renderBag(); };
$("tabInv").onclick = () => { bagTab = "inv"; renderBag(); };
$("menuBtn").onclick = () => showMenu();

// ---------- Vòng lặp ----------
let last = performance.now(), mmT = 0, saveT = 0, slowT = 0;
function update(dt) {
  clock += dt;
  P.cd -= dt; P.swing = Math.max(0, P.swing - dt); P.hurt = Math.max(0, P.hurt - dt);
  // di chuyển
  let mx = 0, my = 0;
  if (keys.has("w") || keys.has("arrowup")) my--;
  if (keys.has("s") || keys.has("arrowdown")) my++;
  if (keys.has("a") || keys.has("arrowleft")) mx--;
  if (keys.has("d") || keys.has("arrowright")) mx++;
  if (stick) { mx = stick.dx; my = stick.dy; }
  const len = Math.hypot(mx, my);
  if (len > 0.15) {
    const k = Math.min(1, len) / len;
    const g = groundAt(Math.floor(P.x), Math.floor(P.y));
    const sp = 4.3 * (g === G.WATER ? 0.5 : g === G.SNOW ? 0.85 : 1);
    move(P, mx * k * sp * dt, my * k * sp * dt, 0.3);
    if (!mouse || touchMode || keys.size) P.dir = Math.atan2(my, mx);
    P.walk += dt * 10;
  } else P.walk = 0;
  if (mouse && !touchMode && !len) { const [wx, wy] = toWorld(mouse.sx, mouse.sy); P.dir = Math.atan2(wy - P.y, wx - P.x); }
  // mục tiêu
  const pt = holdPt || (!touchMode && mouse);
  if (pt) { const [wx, wy] = toWorld(pt.sx, pt.sy); target = pointTarget(wx, wy) || autoTarget(); }
  else target = autoTarget();
  if (holdPt || btnHeld || keys.has(" ") || keys.has("f")) act(target);
  // cơ thể
  P.food -= dt * 100 / 430; P.water -= dt * 100 / 300;
  if (P.food <= 0) { P.food = 0; P.hp -= dt * 1.2; }
  if (P.water <= 0) { P.water = 0; P.hp -= dt * 1.6; }
  if (P.food > 55 && P.water > 55 && P.hp < 100) P.hp = Math.min(100, P.hp + dt * 0.6);
  if (P.hp <= 0 && !dead) die(P.food <= 0 ? "Chết đói" : P.water <= 0 ? "Chết khát" : "Kiệt sức");
  updateMobs(dt);
  for (let i = fx.length - 1; i >= 0; i--) if ((fx[i].t += dt) > 1.1) fx.splice(i, 1);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; if (p.t > p.life) parts.splice(i, 1); }
  cam.x += (P.x - cam.x) * Math.min(1, dt * 10); cam.y += (P.y - cam.y) * Math.min(1, dt * 10);
}
function slowTick() {
  for (let i = regrow.length - 1; i >= 0; i--) if (regrow[i][1] <= clock) {
    const [x, y] = unkey(regrow[i][0]);
    if (objAt(x, y) === O.BUSH_EMPTY) setObj(x, y, O.BUSH);
    regrow.splice(i, 1);
  }
  const pcx = Math.floor(P.x / CHUNK), pcy = Math.floor(P.y / CHUNK);
  for (const [k, ch] of chunks) if (Math.abs(ch.cx - pcx) > 5 || Math.abs(ch.cy - pcy) > 5) chunks.delete(k);
  const was = slowTick.night, night = isNight();
  if (night && !was) log("Trời tối rồi. Quỷ đêm sắp xuất hiện, hãy ở gần lửa.", "warn");
  if (!night && was) log(`Bình minh ngày ${dayNum()}`, "good");
  slowTick.night = night;
  if (P.water < 25 && Math.random() < 0.15) log("Khát quá, tìm nước uống đi", "bad");
  if (P.food < 25 && Math.random() < 0.15) log("Đói quá, tìm gì đó ăn đi", "bad");
}
function hud() {
  setBar("hp", P.hp); setBar("food", P.food); setBar("water", P.water);
  const h = hours() % 24;
  $("dayTxt").textContent = `Ngày ${dayNum()}`;
  $("timeTxt").textContent = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60 / 10) * 10).padStart(2, "0")}`;
  const lbl = targetLabel(target);
  if (ab.textContent !== lbl) ab.textContent = lbl;
  const hint = $("hint"), ht = targetHint(target);
  hint.hidden = !ht || touchMode;
  if (ht) hint.textContent = `${ht} · ${mouse ? "Chuột trái hoặc Space" : "Space"}`;
}
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t; now = t / 1000;
  if (running && !paused && !dead) {
    update(dt);
    if ((slowT -= dt) <= 0) { slowT = 2; slowTick(); }
    if ((saveT -= dt) <= 0) { saveT = 15; save(); }
  }
  if (preview) { cam.x += dt * 1.1; cam.y += dt * 0.35; render(); }
  if (running) {
    render();
    if ((mmT -= dt) <= 0) { mmT = 1; drawMinimap(); }
    hud();
    if (uiDirty) renderUi();
  }
  requestAnimationFrame(frame);
}

// ---------- Chết & hồi sinh ----------
function die(cause) {
  dead = true; P.hp = 0;
  stats.deaths++;
  $("deathTxt").textContent = `${cause} vào ngày ${dayNum()}. Hồi sinh sẽ rơi mất một nửa nguyên liệu, giữ lại công cụ.`;
  openBag(false);
  $("death").hidden = false;
  save();
}
$("respawnBtn").onclick = () => {
  for (const id of Object.keys(inv)) if (!ITEMS[id].tool && !ITEMS[id].wear) { inv[id] = Math.floor(inv[id] / 2); if (!inv[id]) delete inv[id]; }
  if (eq && !has(eq)) eq = null;
  const sp = spawnPt ? findLand(Math.floor(spawnPt.x), Math.floor(spawnPt.y)) : findLand(0, 0);
  Object.assign(P, { x: sp.x, y: sp.y, hp: 70, food: Math.max(P.food, 60), water: Math.max(P.water, 60), hurt: 0 });
  cam.x = P.x; cam.y = P.y;
  mobs = mobs.filter(m => !MOBS[m.type].hostile && !MOBS[m.type].neutral);
  dead = false; $("death").hidden = true;
  refreshUi(); save();
};

// ---------- Lưu & tải ----------
function save() {
  if (!P) return;
  const data = { v: 1, seed: SEED, seedName: stats.seedName, P: { x: P.x, y: P.y, hp: P.hp, food: P.food, water: P.water }, inv, eq, clock, spawnPt, stats, mods: [...mods], regrow };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* bộ nhớ trình duyệt không dùng được: chơi không lưu */ }
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 1 ? s : null; } catch (e) { return null; }
}
function startWorld(data) {
  chunks = new Map(); mods = new Map(); fires = new Set(); hits.clear(); mobs = []; fx = []; parts = [];
  $("log").innerHTML = "";
  if (data) {
    SEED = data.seed; inv = data.inv || {}; eq = data.eq || null; clock = data.clock || 0; spawnPt = data.spawnPt || null;
    stats = Object.assign({ kills: 0, deaths: 0, seedName: "" }, data.stats);
    for (const [k, o] of data.mods || []) { mods.set(k, o); if (o === O.FIRE) fires.add(k); }
    regrow = data.regrow || [];
    P = newPlayer(data.P.x, data.P.y); Object.assign(P, data.P);
  } else {
    const name = $("seedInput").value.trim();
    SEED = name ? seedFrom(name) : (Math.random() * 2 ** 31) | 0;
    inv = {}; eq = null; clock = 0; spawnPt = null; regrow = [];
    stats = { kills: 0, deaths: 0, seedName: name };
    const sp = findLand(0, 0, true);
    P = newPlayer(sp.x, sp.y);
    log("Nhổ cỏ cao lấy sợi, chặt cây lấy gỗ, đập đá lấy đá.", "");
    log("Mở Túi & chế tạo để làm rìu, cuốc và lửa trại.", "");
  }
  cam.x = P.x; cam.y = P.y;
  slowTick.night = isNight();
  running = true; dead = false; paused = false; preview = false;
  $("menu").hidden = true; $("hud").hidden = false; $("death").hidden = !(P.hp <= 0);
  if (P.hp <= 0) { dead = true; $("deathTxt").textContent = "Bạn đã gục ngã ở lần chơi trước."; }
  mmT = 0; refreshUi(); save();
}
let confirmNew = false;
function showMenu() {
  if (running) { save(); paused = true; }
  openBag(false);
  const s = loadSave();
  $("resumeBtn").hidden = !running;
  $("continueBtn").hidden = running || !s;
  if (s) $("continueBtn").textContent = `Chơi tiếp · Ngày ${Math.floor((7 + s.clock / DAY * 24 - 6) / 24) + 1}`;
  $("saveInfo").textContent = s ? `Thế giới đang lưu${s.seedName ? ` "${s.seedName}"` : ""}: đã hạ ${s.stats?.kills || 0} con thú, gục ngã ${s.stats?.deaths || 0} lần.` : "Chưa có thế giới nào được lưu.";
  confirmNew = false; $("newBtn").textContent = "Thế giới mới";
  $("newBtn").classList.toggle("ghost", running || !!s);
  $("menu").hidden = false;
}
$("resumeBtn").onclick = () => { $("menu").hidden = true; paused = false; };
$("continueBtn").onclick = () => { const s = loadSave(); if (s) startWorld(s); };
$("newBtn").onclick = () => {
  if ((loadSave() || running) && !confirmNew) { confirmNew = true; $("newBtn").textContent = "Bấm lần nữa: xóa thế giới cũ"; return; }
  startWorld(null);
};
addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
if (matchMedia("(pointer: coarse)").matches) setTouch(true);

// Thế giới xem trước chạy chậm phía sau màn hình chính
function startPreview() {
  SEED = (Math.random() * 2 ** 31) | 0;
  inv = {}; eq = null; clock = DAY * 0.2;
  const sp = findLand(0, 0, true);
  P = newPlayer(sp.x, sp.y); cam.x = P.x; cam.y = P.y;
  preview = true;
}
makeIcons();
startPreview();
showMenu();
requestAnimationFrame(frame);
