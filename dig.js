/*
 * ほりほりトレジャー（化石ほりミニゲーム）の盤面エンジン（通信なし）。bomb.js と同じ形（newGame / step / draw）。
 * ・地面を横から見た断面。上から 表土 → 新生代 → 中生代 → 古生代。下ほどかたい。
 * ・5〜6人の小グループで1つの地面を掘る。掘ったトンネルはみんなで使える。
 * ・生徒が送るのは「向き（0〜4）」と「ドリル」だけ。1ステップ=0.1秒。
 */
export var W = 28, H = 52;
export var TICK_MS = 100;
export var RULE = {
  length: 600,     /* 60秒 */
  move: 2,         /* 掘ったところを1マス進むのに 0.2秒 */
  drills: 3,       /* ドリルの回数 */
  drillLen: 25,    /* ドリル 2.5秒 */
  fever: 100       /* 最後の10秒は得点2倍 */
};
/* 地層。row = その層が始まる行。hard = 掘るのに必要なステップ数 */
export var LAYERS = [
  { k: 'sky', row: 0, name: '' },
  { k: 'top', row: 2, name: '表土', hard: 3, c1: '#8a5a32', c2: '#7a4e2a' },
  { k: 'cen', row: 5, name: '新生代', hard: 4, c1: '#e3b873', c2: '#d4a35c', c3: '#c99654' },
  { k: 'ash', row: 18, name: '火山灰の層', hard: 1, c1: '#f2efe6', c2: '#e2ddd0' },
  { k: 'mes', row: 19, name: '中生代', hard: 7, c1: '#c9785a', c2: '#b8684c', c3: '#a95d44' },
  { k: 'ash', row: 34, name: '火山灰の層', hard: 1, c1: '#f2efe6', c2: '#e2ddd0' },
  { k: 'pal', row: 35, name: '古生代', hard: 10, c1: '#8e93a6', c2: '#7b8096', c3: '#6d7288' }
];
export var FOSSIL = {
  vicarya:   { n: 'ビカリア',         era: '新生代', pts: 10, ic: '🐚', layer: 'cen' },
  naumann:   { n: 'ナウマンゾウの歯', era: '新生代', pts: 10, ic: '🦷', layer: 'cen' },
  ammonite:  { n: 'アンモナイト',     era: '中生代', pts: 20, ic: '🌀', layer: 'mes' },
  dino:      { n: '恐竜の骨',         era: '中生代', pts: 20, ic: '🦴', layer: 'mes' },
  trilobite: { n: '三葉虫',           era: '古生代', pts: 30, ic: '🪲', layer: 'pal' },
  fusulina:  { n: 'フズリナ',         era: '古生代', pts: 30, ic: '🌾', layer: 'pal' },
  shijimi:   { n: 'シジミ',  era: '示相化石', pts: 15, ic: '🦪', layer: 'cen', env: '河口や湖だった！' },
  buna:      { n: 'ブナの葉', era: '示相化石', pts: 15, ic: '🍂', layer: 'cen', env: 'やや寒い気候の陸地だった！' },
  coral:     { n: 'サンゴ',  era: '示相化石', pts: 15, ic: '🪸', layer: 'mes', env: 'あたたかくて浅い海だった！' }
};
export var FOSSIL_ORDER = ['vicarya', 'naumann', 'ammonite', 'dino', 'trilobite', 'fusulina', 'shijimi', 'buna', 'coral'];
/* 1つの地面に埋める数 */
var PLACE = { vicarya: 16, naumann: 14, shijimi: 4, buna: 4, ammonite: 18, dino: 12, coral: 5, trilobite: 18, fusulina: 15 };
var DX = [0, 0, 0, -1, 1], DY = [0, -1, 1, 0, 0];

export function layerAt(y) { var L = LAYERS[0]; for (var i = 0; i < LAYERS.length; i++) if (y >= LAYERS[i].row) L = LAYERS[i]; return L; }
function rowsOf(k) { var r = []; for (var y = 0; y < H; y++) if (layerAt(y).k === k) r.push(y); return r; }

export function newGame(n, seed) {
  var g = { t: 0, over: false, players: [], cells: [], fos: {}, rng: seed || 1, ev: [], evq: [] };
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var L = layerAt(y);
    g.cells.push(L.k === 'sky' ? { dug: 1, dmg: 0 } : { dug: 0, dmg: 0, rock: 0 });
  }
  /* かたい岩（ドリルでないと時間がかかる）を少し */
  for (var r = 0; r < 60; r++) { var rx = Math.floor(rnd(g) * W), ry = 6 + Math.floor(rnd(g) * (H - 7)); if (layerAt(ry).k !== 'ash') cell(g, rx, ry).rock = 1; }
  Object.keys(PLACE).forEach(function (k) { for (var i = 0; i < PLACE[k]; i++) bury(g, k); });
  var gap = W / n;
  for (var i = 0; i < n; i++) { var px = Math.floor(gap * (i + .5)); g.players.push({ x: px, y: 1, mc: 0, d: 0, face: 2, drill: 0, left: RULE.drills, score: 0, got: [], dig: 0 }); }
  return g;
}
/* 化石を1つ、まだ掘られていない土の中に埋める。トンネルのすぐ横には出さない（見えているのに取れない、を防ぐ） */
function bury(g, k) {
  var rows = rowsOf(FOSSIL[k].layer);
  for (var tries = 0; tries < 60; tries++) {
    var fx = Math.floor(rnd(g) * W), fy = rows[Math.floor(rnd(g) * rows.length)], c = cell(g, fx, fy);
    if (c.f || c.rock || c.dug) continue;
    var near = false; for (var d = 1; d <= 4; d++) { var nc = cell(g, fx + DX[d], fy + DY[d]); if (nc && nc.dug) near = true; }
    if (near) continue;
    c.f = k; return true;
  }
  return false;
}
function rnd(g) { g.rng = (g.rng * 1664525 + 1013904223) >>> 0; return g.rng / 4294967296; }
function emit(g, e) { g.ev.push(e); g.evq.push(e); }
export function cell(g, x, y) { return x >= 0 && y >= 0 && x < W && y < H ? g.cells[y * W + x] : null; }
export function hardness(g, x, y) { var c = cell(g, x, y); return (layerAt(y).hard || 1) * (c && c.rock ? 3 : 1); }

/* inputs[i] = { d: 0〜4, b: ドリルを押したか } */
export function step(g, inputs) {
  if (g.over) return;
  g.t++; g.ev = [];
  var mult = g.t > RULE.length - RULE.fever ? 2 : 1;
  g.players.forEach(function (p, i) {
    var inp = inputs[i] || {};
    if (p.drill) p.drill--;
    if (inp.b && p.left > 0 && !p.drill) { p.drill = RULE.drillLen; p.left--; emit(g, { k: 'drill', i: i }); }
    if (p.mc > 0) p.mc--;
    p.d = inp.d || 0; p.dig = 0;
    if (!p.d) return;
    p.face = p.d;
    var nx = p.x + DX[p.d], ny = p.y + DY[p.d], c = cell(g, nx, ny);
    if (!c || ny < 1) return;
    if (c.dug) { if (p.mc === 0) { p.x = nx; p.y = ny; p.mc = RULE.move; } return; }
    /* 掘る：同じマスをみんなで掘ると早い（ダメージはマスにたまる） */
    p.dig = 1;
    c.dmg += p.drill ? 99 : 1;
    if (c.dmg >= hardness(g, nx, ny)) {
      c.dug = 1; emit(g, { k: 'dug', x: nx, y: ny, i: i });
      if (c.f) {
        var F = FOSSIL[c.f], pts = F.pts * mult;
        p.score += pts; p.got.push(c.f); g.fos[c.f] = (g.fos[c.f] || 0) + 1;
        emit(g, { k: 'find', i: i, f: c.f, x: nx, y: ny, pts: pts }); c.f = null;
      }
    }
  });
  /* 取られた化石は、2秒ごとに別の場所へ埋めなおす（最後まで掘るものがなくならない） */
  if (g.t % 20 === 0) {
    var left = {}; g.cells.forEach(function (c) { if (c.f) left[c.f] = (left[c.f] || 0) + 1; });
    Object.keys(PLACE).forEach(function (k) { if ((left[k] || 0) < PLACE[k] * 0.6) bury(g, k); });
  }
  if (g.t >= RULE.length) g.over = true;
}

/* ====================================================================
   描画。cam = 見せる範囲の上端（行）、rows = 見せる行数。省略すると全体
   ==================================================================== */
var SPR = {};
function sprite(path) {
  if (SPR[path] === undefined) { var im = new Image(); im.src = path; SPR[path] = im; }
  var im2 = SPR[path]; return im2.complete && im2.naturalWidth ? im2 : null;
}
export var ANIMAL_NAMES = ['fox', 'panda', 'rabbit', 'bear', 'tiger', 'frog', 'monkey', 'penguin', 'lion', 'cow', 'pig', 'koala', 'hamster', 'unicorn', 'octopus', 'owl', 'dog', 'cat', 'chick', 'raccoon'];
var ACC_NAMES = ['', 'tophat', 'crown', 'bow', 'cap', 'gradcap', 'santa', 'headphones', 'glasses', 'sunglasses', 'goggles', 'mask'];
export var PCOL = ['#ff5a5a', '#35a7ff', '#ffd23f', '#3ddc84', '#c264ff', '#ff9f1c'];
export function fossilImg(k) { return sprite('img/fossil/fossil-' + k + '.webp'); }
function putSprite(ctx, im, cx, baseY, h) { var w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, cx - w / 2, baseY - h, w, h); }
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function hash(x, y) { var h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h & 1023) / 1023; }
function drawFossil(ctx, k, cx, cy, s) {
  var im = fossilImg(k);
  if (im) { putSprite(ctx, im, cx, cy + s / 2, s); return; }
  ctx.font = Math.round(s * .8) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(FOSSIL[k].ic, cx, cy);
}

export function draw(ctx, g, px, opt) {
  opt = opt || {};
  var cols = opt.cols || W, c = px / cols, now = performance.now(), cam = opt.cam || 0, camX = opt.camX || 0, rows = opt.rows || H, fw = W * c;
  g.fx = g.fx || [];
  (g.evq || []).forEach(function (e) {
    if (e.k === 'dug') for (var n = 0; n < 6; n++) { var a = Math.random() * 6.283, v = .002 + Math.random() * .003; g.fx.push({ k: 's', x: e.x + .5, y: e.y + .5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .002, t0: now, life: 350, col: (layerAt(e.y).c2 || '#a77') }); }
    if (e.k === 'find') {
      g.fx.push({ k: 'f', f: e.f, x: e.x + .5, y: e.y + .5, t0: now, life: (opt.me === undefined || e.i === opt.me) ? 3200 : 1200, pts: e.pts, i: e.i });
      for (n = 0; n < 18; n++) { a = Math.random() * 6.283; v = .003 + Math.random() * .005; g.fx.push({ k: 's', x: e.x + .5, y: e.y + .5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: now, life: 600, col: '#ffe14a' }); }
    }
  });
  g.evq = [];
  ctx.save();
  ctx.clearRect(0, 0, px, rows * c);
  ctx.translate(-camX * c, -cam * c);
  var x0 = Math.max(0, Math.floor(camX) - 1), x1 = Math.min(W, Math.ceil(camX + cols) + 1);
  var y0 = Math.max(0, Math.floor(cam) - 1), y1 = Math.min(H, Math.ceil(cam + rows) + 1);

  /* 空 */
  var sk = ctx.createLinearGradient(0, 0, 0, 2 * c); sk.addColorStop(0, '#7cc8ff'); sk.addColorStop(1, '#c8ecff');
  ctx.fillStyle = sk; ctx.fillRect(0, 0, fw, 2 * c);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; [[2, .6], [9, .9], [13.5, .5], [19, .7], [25, .55]].forEach(function (q) { ctx.beginPath(); ctx.arc(q[0] * c, q[1] * c, c * .3, 0, 6.283); ctx.arc((q[0] + .35) * c, (q[1] - .1) * c, c * .38, 0, 6.283); ctx.arc((q[0] + .75) * c, q[1] * c, c * .28, 0, 6.283); ctx.fill(); });

  /* 地面のマス */
  for (var y = Math.max(2, y0); y < y1; y++) {
    var L = layerAt(y);
    for (var x = x0; x < x1; x++) {
      var ce = cell(g, x, y), X = x * c, Y = y * c, h = hash(x, y);
      /* 地層のしま：行ごとに少し色を変える */
      var band = (y % 3 === 0 && L.c3) ? L.c3 : (y % 2 ? L.c1 : L.c2);
      if (ce.dug) {
        ctx.fillStyle = band; ctx.fillRect(X, Y, c + .5, c + .5);
        ctx.fillStyle = 'rgba(30,15,5,.62)'; ctx.fillRect(X, Y, c + .5, c + .5);
        continue;
      }
      ctx.fillStyle = band; ctx.fillRect(X, Y, c + .5, c + .5);
      /* つぶつぶの質感 */
      ctx.fillStyle = 'rgba(0,0,0,.10)';
      for (var d = 0; d < 3; d++) { var hx = hash(x * 3 + d, y * 7), hy = hash(y * 5 + d, x * 11); ctx.beginPath(); ctx.arc(X + hx * c, Y + hy * c, c * (.04 + .04 * hash(x + d, y)), 0, 6.283); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(X, Y, c, Math.max(1, c * .06));
      if (L.k === 'top' && y === 2) { ctx.fillStyle = '#5cc85a'; ctx.fillRect(X, Y, c + .5, c * .28); ctx.fillStyle = '#3fa344'; for (var gg = 0; gg < 3; gg++) { ctx.beginPath(); ctx.moveTo(X + c * (.15 + gg * .33), Y + c * .28); ctx.lineTo(X + c * (.22 + gg * .33), Y - c * .1); ctx.lineTo(X + c * (.29 + gg * .33), Y + c * .28); ctx.fill(); } }
      if (ce.rock) {
        var rg = ctx.createRadialGradient(X + c * .4, Y + c * .35, c * .05, X + c * .5, Y + c * .5, c * .5); rg.addColorStop(0, '#b9bcc6'); rg.addColorStop(1, '#5d6070');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(X + c * .12, Y + c * .55); ctx.lineTo(X + c * .3, Y + c * .14); ctx.lineTo(X + c * .72, Y + c * .1); ctx.lineTo(X + c * .9, Y + c * .5); ctx.lineTo(X + c * .74, Y + c * .9); ctx.lineTo(X + c * .26, Y + c * .88); ctx.closePath(); ctx.fill();
      }
      /* 化石：土の中で、ときどきキラッと光る */
      if (ce.f) {
        var tw = (now / 1000 + h * 7) % 3;
        ctx.globalAlpha = .22; drawFossil(ctx, ce.f, X + c * .5, Y + c * .5, c * .7); ctx.globalAlpha = 1;
        if (tw < .5) { var k2 = Math.sin(tw / .5 * Math.PI); ctx.fillStyle = 'rgba(255,255,220,' + k2 + ')'; ctx.beginPath(); var sx = X + c * .7, sy = Y + c * .3, r = c * .22 * k2; ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * .25, sy - r * .25); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r * .25, sy + r * .25); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * .25, sy + r * .25); ctx.lineTo(sx - r, sy); ctx.lineTo(sx - r * .25, sy - r * .25); ctx.fill(); }
      }
      /* ひび（掘りかけ） */
      if (ce.dmg > 0) {
        var pr = Math.min(1, ce.dmg / hardness(g, x, y));
        ctx.strokeStyle = 'rgba(40,20,10,.75)'; ctx.lineWidth = Math.max(1, c * .05);
        ctx.beginPath(); ctx.moveTo(X + c * .5, Y + c * .5); ctx.lineTo(X + c * (.5 - .35 * pr), Y + c * (.5 - .3 * pr));
        ctx.moveTo(X + c * .5, Y + c * .5); ctx.lineTo(X + c * (.5 + .38 * pr), Y + c * (.5 - .12 * pr));
        ctx.moveTo(X + c * .5, Y + c * .5); ctx.lineTo(X + c * (.5 + .1 * pr), Y + c * (.5 + .4 * pr)); ctx.stroke();
      }
    }
  }
  /* 掘ったトンネルのふちに影をつける（立体感） */
  for (y = Math.max(2, y0); y < y1; y++) for (x = x0; x < x1; x++) {
    if (!cell(g, x, y).dug) continue;
    var up = cell(g, x, y - 1);
    if (up && !up.dug) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x * c, y * c, c, c * .14); }
  }
  /* 時代のなまえ（層の境目に） */
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  LAYERS.forEach(function (L) {
    if (!L.name || L.k === 'top') return;
    var ly = L.row * c;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([c * .25, c * .2]); ctx.lineWidth = Math.max(1, c * .04); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(fw, ly); ctx.stroke(); ctx.setLineDash([]);
    if (L.k === 'ash') return;
    ctx.font = '900 ' + Math.round(c * .42) + 'px sans-serif'; var tw2 = ctx.measureText(L.name).width + c * .4;
    ctx.fillStyle = 'rgba(30,20,40,.7)'; round(ctx, camX * c + c * .15, ly + c * .12, tw2, c * .56, c * .2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(L.name, camX * c + c * .35, ly + c * .41);
  });

  /* プレイヤー：ヘルメットとつるはし */
  ctx.textAlign = 'center';
  g.players.forEach(function (p, i) {
    if (p.vx === undefined) { p.vx = p.x; p.vy = p.y; }
    p.vx += (p.x - p.vx) * .3; p.vy += (p.y - p.vy) * .3;
    var cx = (p.vx + .5) * c, by = (p.vy + .95) * c, col = PCOL[i % 6], sw = p.dig ? Math.sin(now / 55) : 0;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, c * .08); ctx.beginPath(); ctx.ellipse(cx, by - c * .05, c * .34, c * .1, 0, 0, 6.283); ctx.stroke();
    var ai = opt.chars ? opt.chars[i] : i, ps = ANIMAL_NAMES[ai] ? sprite('img/robot/animal-' + ANIMAL_NAMES[ai] + '.webp') : null;
    var jig = p.dig ? Math.abs(sw) * c * .05 : 0;
    if (ps) putSprite(ctx, ps, cx, by - jig, c * .86); else { ctx.font = (c * .7) + 'px serif'; ctx.fillText('🐻', cx, by - c * .4); }
    var ak = opt.accs ? opt.accs[i] : 0, as = ak >= 8 ? sprite('img/robot/acc-' + ACC_NAMES[ak] + '.webp') : null;
    if (as) putSprite(ctx, as, cx + c * .04, by - c * .42 - jig, c * .2);
    /* ヘルメット（プレイヤーの色）とライト */
    var hy = by - c * .74 - jig;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, hy + c * .08, c * .26, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - c * .32, hy + c * .06, c * .64, c * .06);
    ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(cx, hy - c * .02, c * .07, 0, 6.283); ctx.fill();
    /* つるはし（向いている方へ、掘っているときは振る） */
    var dir = p.face === 3 ? -1 : 1, ang = (p.face === 2 ? .9 : p.face === 1 ? -1.6 : 0) * dir + (p.dig ? sw * .6 : -.3) * dir;
    ctx.translate(cx + dir * c * .3, by - c * .38); ctx.rotate(ang);
    ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = Math.max(2, c * .07); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dir * c * .38, 0); ctx.stroke();
    ctx.strokeStyle = p.drill ? '#ffd23f' : '#c9ced8'; ctx.lineWidth = Math.max(2, c * .09); ctx.beginPath(); ctx.moveTo(dir * c * .38, -c * .18); ctx.quadraticCurveTo(dir * c * .48, 0, dir * c * .38, c * .18); ctx.stroke();
    ctx.restore();
    if (p.drill) { ctx.strokeStyle = 'rgba(255,210,63,' + (.5 + .4 * Math.sin(now / 60)) + ')'; ctx.lineWidth = Math.max(2, c * .07); ctx.beginPath(); ctx.arc(cx, by - c * .45, c * .55, 0, 6.283); ctx.stroke(); }
    if (opt.names && c >= 24 && opt.names[i]) {
      ctx.font = '800 ' + Math.round(c * .28) + 'px sans-serif'; var tw3 = ctx.measureText(opt.names[i]).width + c * .3;
      ctx.fillStyle = col; round(ctx, cx - tw3 / 2, by - c * 1.32, tw3, c * .34, c * .17); ctx.fill();
      ctx.fillStyle = i % 6 === 2 ? '#3a2a00' : '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(opt.names[i], cx, by - c * 1.15);
    }
    if (opt.me === i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, c * .05); ctx.setLineDash([c * .12, c * .08]); ctx.strokeRect(p.vx * c + 2, p.vy * c + 2, c - 4, c - 4); ctx.setLineDash([]); }
  });

  /* 火花・化石発見の演出 */
  g.fx = g.fx.filter(function (f) { return now - f.t0 < f.life; });
  g.fx.forEach(function (f) {
    var k = (now - f.t0) / f.life;
    if (f.k === 's') { ctx.fillStyle = f.col; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc((f.x + f.vx * (now - f.t0)) * c, (f.y + f.vy * (now - f.t0) + k * .4) * c, c * .07 * (1 - k * .5), 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; return; }
    /* 化石が飛び出して、名前と時代の札が出る */
    var up = Math.min(1, k * 4), sc = 1 + .25 * Math.sin(Math.min(1, k * 3) * Math.PI), fy = (f.y - up * 1.1) * c;
    ctx.globalAlpha = k > .8 ? (1 - k) / .2 : 1;
    if (opt.me === undefined || f.i === opt.me) { var gl = ctx.createRadialGradient(f.x * c, fy, c * .1, f.x * c, fy, c * 1.1); gl.addColorStop(0, 'rgba(255,240,150,.8)'); gl.addColorStop(1, 'rgba(255,240,150,0)'); ctx.fillStyle = gl; ctx.fillRect(f.x * c - c * 1.2, fy - c * 1.2, c * 2.4, c * 2.4); }
    drawFossil(ctx, f.f, f.x * c, fy, c * (opt.me !== undefined && f.i !== opt.me ? .7 : 1.1) * sc);
    /* 名前の札は「自分が見つけたとき」だけ。ほかの人のは小さい点数だけ（画面がうるさくならないように） */
    if (c < 24 || (opt.me !== undefined && f.i !== opt.me)) {
      if (c >= 24) { ctx.font = '900 ' + Math.round(c * .32) + 'px sans-serif'; ctx.textBaseline = 'middle'; ctx.lineWidth = c * .1; ctx.strokeStyle = 'rgba(30,20,50,.8)'; ctx.strokeText('+' + f.pts, f.x * c, fy + c * .55); ctx.fillStyle = '#ffe14a'; ctx.fillText('+' + f.pts, f.x * c, fy + c * .55); }
      ctx.globalAlpha = 1; return;
    }
    var F = FOSSIL[f.f], label = F.n + '（' + F.era + '）＋' + f.pts;
    ctx.font = '900 ' + Math.round(c * .34) + 'px sans-serif'; var lw = ctx.measureText(label).width + c * .4, lx = Math.max(camX * c + lw / 2 + 2, Math.min(camX * c + px - lw / 2 - 2, f.x * c));
    ctx.fillStyle = 'rgba(30,20,50,.85)'; round(ctx, lx - lw / 2, fy + c * .62, lw, c * .5, c * .22); ctx.fill();
    ctx.fillStyle = F.env ? '#7cf3ff' : '#ffe14a'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx, fy + c * .88);
    if (F.env) { ctx.font = '800 ' + Math.round(c * .28) + 'px sans-serif'; var ew = ctx.measureText(F.env).width + c * .4; ctx.fillStyle = 'rgba(20,90,120,.85)'; round(ctx, lx - ew / 2, fy + c * 1.16, ew, c * .42, c * .2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(F.env, lx, fy + c * 1.37); }
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

/* ====================================================================
   通信用。地面（マス）は行ごとの文字列で送り、変わった行だけ書きなおす。
   人・ひび・できごとは小さな JSON で毎回送る
   . = 掘った  # = 土  R = かたい岩  a〜i = 化石（FOSSIL_ORDER の順）入りの土
   ==================================================================== */
export function rowStr(g, y) {
  var s = '';
  for (var x = 0; x < W; x++) { var c = cell(g, x, y); s += c.dug ? '.' : c.f ? String.fromCharCode(97 + FOSSIL_ORDER.indexOf(c.f)) : c.rock ? 'R' : '#'; }
  return s;
}
export function rows(g) { var r = {}; for (var y = 0; y < H; y++) r[y] = rowStr(g, y); return r; }
export function serialize(g) {
  var dm = []; g.cells.forEach(function (c, i) { if (!c.dug && c.dmg > 0) dm.push(i, c.dmg); });
  return JSON.stringify({
    t: g.t, o: g.over ? 1 : 0, f: g.fos,
    p: g.players.map(function (p) { return [p.x, p.y, p.face, p.drill, p.left, p.score, p.dig]; }),
    m: dm,
    e: g.ev.filter(function (e) { return e.k !== 'drill'; }).map(function (e) { return e.k === 'find' ? ['f', e.i, e.f, e.x, e.y, e.pts] : ['d', e.x, e.y]; })
  });
}
export function newView() {
  var v = { t: 0, over: false, players: [], cells: [], fos: {}, evq: [] };
  for (var i = 0; i < W * H; i++) v.cells.push({ dug: 1, dmg: 0 });
  return v;
}
/* 地面の行を写す（r = { 行番号: 文字列 }。一部の行だけでもよい） */
export function applyRows(v, r) {
  Object.keys(r || {}).forEach(function (y) {
    var s = r[y]; y = Number(y);
    for (var x = 0; x < W && x < s.length; x++) {
      var c = v.cells[y * W + x], ch = s[x];
      c.dug = ch === '.' ? 1 : 0; c.rock = ch === 'R' ? 1 : 0; c.f = ch >= 'a' && ch <= 'i' ? FOSSIL_ORDER[ch.charCodeAt(0) - 97] : null;
      if (c.dug) c.dmg = 0;
    }
  });
}
export function applyData(v, str) {
  var d = JSON.parse(str);
  v.t = d.t; v.over = !!d.o; v.fos = d.f || {};
  v.players = d.p.map(function (a, i) { var p = v.players[i] || {}; p.x = a[0]; p.y = a[1]; p.face = a[2]; p.drill = a[3]; p.left = a[4]; p.score = a[5]; p.dig = a[6]; return p; });
  v.cells.forEach(function (c) { c.dmg = 0; });
  for (var i = 0; i < d.m.length; i += 2) if (v.cells[d.m[i]]) v.cells[d.m[i]].dmg = d.m[i + 1];
  d.e.forEach(function (e) { v.evq.push(e[0] === 'f' ? { k: 'find', i: e[1], f: e[2], x: e[3], y: e[4], pts: e[5] } : { k: 'dug', x: e[1], y: e[2] }); });
}
