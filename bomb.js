/*
 * ボンバーマン・ミニゲームの盤面エンジン（通信なし）。
 * ・ロボットランの「安全地帯」の代わりに遊ぶ。5〜6人の小グループで1つの盤面を使う。
 * ・本番では、先生の画面がこのエンジンで全グループを動かし、生徒の入力（向き・爆弾）を毎ステップ取り込む。
 * ・1ステップ=0.1秒。盤面は 15×13。柱は (奇数, 奇数) のマス。
 */
export var W = 15, H = 13;
export var TICK_MS = 100;
export var RULE = {
  fuse: 20,        /* 爆弾が爆発するまで 2.0秒 */
  flame: 5,        /* 炎が残る 0.5秒 */
  range: 2,        /* 爆風の長さ（マス） */
  maxBombs: 2,     /* 同時に置ける爆弾 */
  move: 2,         /* 1マス進むのに 0.2秒 */
  down: 50,        /* 巻き込まれたあと、復活まで 5秒 */
  invul: 20,       /* 復活後の無敵 2秒 */
  hitPenalty: 30,  /* 巻き込まれたときの減点（0未満にはならない） */
  robotPts: 100,   /* 小ロボットを倒した得点 */
  robotMove: 4,    /* 小ロボットは 0.4秒で1マス */
  length: 600      /* ゲームの長さ 60秒 */
};
var SPAWN = [[0, 0], [W - 1, H - 1], [W - 1, 0], [0, H - 1], [Math.floor(W / 2), 0], [Math.floor(W / 2), H - 1]];
var DX = [0, 0, 0, -1, 1], DY = [0, -1, 1, 0, 0];   /* 0:なし 1:上 2:下 3:左 4:右 */

export function isPillar(x, y) { return x % 2 === 1 && y % 2 === 1; }
function inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

/* n人のゲームを作る。seed を渡すと同じ盤面・同じロボットの動きになる */
export function newGame(n, seed) {
  var g = { t: 0, over: false, players: [], bombs: [], flames: [], robots: [], rng: seed || 1, ev: [] };
  for (var i = 0; i < n; i++) {
    var s = SPAWN[i % SPAWN.length];
    g.players.push({ x: s[0], y: s[1], sx: s[0], sy: s[1], mc: 0, down: 0, invul: 0, score: 0, kills: 0, d: 0 });
  }
  for (var k = 0; k < 3; k++) spawnRobot(g);
  return g;
}
function emit(g, e) { g.ev.push(e); (g.evq = g.evq || []).push(e); }
function rnd(g) { g.rng = (g.rng * 1664525 + 1013904223) >>> 0; return g.rng / 4294967296; }
function bombAt(g, x, y) { for (var i = 0; i < g.bombs.length; i++) if (g.bombs[i].x === x && g.bombs[i].y === y) return g.bombs[i]; return null; }
function free(g, x, y) { return inside(x, y) && !isPillar(x, y) && !bombAt(g, x, y); }
function spawnRobot(g) {
  for (var tries = 0; tries < 40; tries++) {
    var x = Math.floor(rnd(g) * W), y = Math.floor(rnd(g) * H);
    if (!free(g, x, y)) continue;
    var near = g.players.some(function (p) { return Math.abs(p.x - x) + Math.abs(p.y - y) < 4; });
    if (near || g.robots.some(function (r) { return r.x === x && r.y === y; })) continue;
    g.robots.push({ x: x, y: y, cd: RULE.robotMove, d: 1 + Math.floor(rnd(g) * 4) }); return;
  }
}

/* inputs[i] = {d: 0〜4, b: 爆弾を置く(true/false)} を受けて 1 ステップ進める */
export function step(g, inputs) {
  if (g.over) return;
  g.t++; g.ev = [];
  g.players.forEach(function (p, i) {
    var inp = inputs[i] || { d: 0, b: false };
    if (p.invul > 0) p.invul--;
    if (p.down > 0) { p.down--; if (p.down === 0) { p.x = p.sx; p.y = p.sy; p.invul = RULE.invul; } return; }
    if (p.mc > 0) p.mc--;
    if (inp.d && p.mc === 0) {
      var nx = p.x + DX[inp.d], ny = p.y + DY[inp.d];
      p.d = inp.d;
      if (free(g, nx, ny)) { p.x = nx; p.y = ny; p.mc = RULE.move; }
    }
    if (inp.b && !bombAt(g, p.x, p.y) && g.bombs.filter(function (b) { return b.o === i; }).length < RULE.maxBombs) {
      g.bombs.push({ x: p.x, y: p.y, o: i, t: RULE.fuse }); emit(g, { k: 'put', i: i });
    }
  });

  /* 爆弾：時間で爆発。炎に触れた爆弾は連鎖して爆発 */
  g.bombs.forEach(function (b) { b.t--; });
  var queue = g.bombs.filter(function (b) { return b.t <= 0; });
  while (queue.length) {
    var b = queue.pop();
    if (g.bombs.indexOf(b) < 0) continue;
    g.bombs.splice(g.bombs.indexOf(b), 1);
    emit(g, { k: 'boom', x: b.x, y: b.y });
    var cells = [[b.x, b.y]];
    for (var d = 1; d <= 4; d++) for (var r = 1; r <= RULE.range; r++) {
      var x = b.x + DX[d] * r, y = b.y + DY[d] * r;
      if (!inside(x, y) || isPillar(x, y)) break;
      cells.push([x, y]);
      var chain = bombAt(g, x, y); if (chain && queue.indexOf(chain) < 0) { chain.t = 0; queue.push(chain); }
    }
    cells.forEach(function (c) { g.flames.push({ x: c[0], y: c[1], t: RULE.flame, o: b.o }); });
    var ch = g.bombs.filter(function (q) { return q.t <= 0 && queue.indexOf(q) < 0; }); ch.forEach(function (q) { queue.push(q); });
  }

  /* 炎：触れた人は倒れ、小ロボットは壊れて、爆弾を置いた人に得点 */
  g.flames.forEach(function (f) {
    g.players.forEach(function (p, i) {
      if (p.down === 0 && p.invul === 0 && p.x === f.x && p.y === f.y) {
        p.down = RULE.down; p.score = Math.max(0, p.score - RULE.hitPenalty); emit(g, { k: 'hit', i: i, o: f.o });
      }
    });
    g.robots = g.robots.filter(function (r) {
      if (r.x !== f.x || r.y !== f.y) return true;
      var o = g.players[f.o]; if (o) { o.score += RULE.robotPts; o.kills++; }
      emit(g, { k: 'kill', o: f.o, x: r.x, y: r.y }); return false;
    });
  });
  g.flames.forEach(function (f) { f.t--; });
  g.flames = g.flames.filter(function (f) { return f.t > 0; });

  /* 小ロボット：ランダムに歩く。時間がたつと増える */
  g.robots.forEach(function (r) {
    if (r.cd > 0) { r.cd--; return; }
    r.cd = RULE.robotMove;
    var dirs = [1, 2, 3, 4].filter(function (d) { return free(g, r.x + DX[d], r.y + DY[d]); });
    if (!dirs.length) return;
    if (!(free(g, r.x + DX[r.d], r.y + DY[r.d]) && rnd(g) < 0.7)) r.d = dirs[Math.floor(rnd(g) * dirs.length)];
    r.x += DX[r.d]; r.y += DY[r.d];
  });
  var want = 3 + Math.floor(g.t / 150);
  if (g.robots.length < want && g.t % 30 === 0) spawnRobot(g);
  if (g.t >= RULE.length) g.over = true;
}

/* 盤面を描く（canvas）。px = 盤面の横幅。me = 自分の番号（枠で目立たせる）。emojis/names は表示用 */
/* 絵（Geminiの動物・小ロボット）。読み込めるまで、また9番目以降の動物は絵文字で描く */
var SPR = {};
function sprite(name) {
  if (SPR[name] === undefined) { var im = new Image(); im.src = 'img/robot/' + name + '.webp'; SPR[name] = im; }
  var im2 = SPR[name]; return im2.complete && im2.naturalWidth ? im2 : null;
}
var ANIMAL_NAMES = ['fox', 'panda', 'rabbit', 'bear', 'tiger', 'frog', 'monkey', 'penguin', 'lion', 'cow', 'pig', 'koala', 'hamster', 'unicorn', 'octopus', 'owl', 'dog', 'cat', 'chick', 'raccoon'];
var ACC_NAMES = ['', 'tophat', 'crown', 'bow', 'cap', 'gradcap', 'santa', 'headphones', 'glasses', 'sunglasses', 'goggles', 'mask'];
function putSprite(ctx, im, cx, baseY, h) { var w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, cx - w / 2, baseY - h, w, h); }
var PCOL = ['#ff5a5a', '#35a7ff', '#ffd23f', '#3ddc84', '#c264ff', '#ff9f1c'];
export function draw(ctx, g, px, opt) {
  opt = opt || {};
  var c = px / W, hpx = c * H, now = performance.now();
  /* 起きたこと（爆発・撃破・巻き込まれ）を、火花や点数の飛び出しに変える */
  g.fx = g.fx || [];
  (g.evq || []).forEach(function (e) {
    if (e.k === 'boom') g.fx.push({ k: 'b', x: e.x + .5, y: e.y + .5, t0: now, life: 380 });
    if (e.k === 'boom') for (var n = 0; n < 16; n++) {
      var a = Math.random() * 6.283, v = .004 + Math.random() * .008;
      g.fx.push({ k: 's', x: e.x + .5, y: e.y + .5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: now, life: 380 + Math.random() * 300, col: Math.random() < .5 ? '#ffd23f' : '#ff7a1c' });
    } else if (e.k === 'kill') g.fx.push({ k: 'p', x: e.x + .5, y: e.y, text: '+' + RULE.robotPts, col: '#ffe14a', t0: now, life: 900 });
    else if (e.k === 'hit') { var q = g.players[e.i]; g.fx.push({ k: 'p', x: q.x + .5, y: q.y, text: '−' + RULE.hitPenalty, col: '#ff6a6a', t0: now, life: 900 }); }
  });
  g.evq = [];
  ctx.clearRect(0, 0, px, hpx);

  /* ゆか：面取りのあるタイル */
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var base = (x + y) % 2 ? '#dcc2ee' : '#e9d6f6';
    ctx.fillStyle = base; ctx.fillRect(x * c, y * c, c, c);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x * c, y * c, c, Math.max(1, c * .05)); ctx.fillRect(x * c, y * c, Math.max(1, c * .05), c);
    ctx.fillStyle = 'rgba(90,40,130,.18)'; ctx.fillRect(x * c, (y + 1) * c - Math.max(1, c * .05), c, Math.max(1, c * .05)); ctx.fillRect((x + 1) * c - Math.max(1, c * .05), y * c, Math.max(1, c * .05), c);
  }
  /* 柱の影 → 柱（立体のブロック） */
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (isPillar(x, y)) { ctx.fillStyle = 'rgba(60,20,100,.22)'; ctx.fillRect(x * c + c * .1, (y + 1) * c - c * .05, c * .95, c * .28); }
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (isPillar(x, y)) {
    var X = x * c, Y = y * c, top = ctx.createLinearGradient(X, Y, X, Y + c * .78);
    top.addColorStop(0, '#b79bff'); top.addColorStop(1, '#7c5be0');
    ctx.fillStyle = '#4a2fb0'; round(ctx, X + c * .04, Y + c * .12, c * .92, c * .86, c * .14); ctx.fill();
    ctx.fillStyle = top; round(ctx, X + c * .04, Y + c * .04, c * .92, c * .78, c * .14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; round(ctx, X + c * .14, Y + c * .1, c * .5, c * .1, c * .05); ctx.fill();
    ctx.fillStyle = '#ffe14a'; [[.2, .6], [.8, .6]].forEach(function (pt) { ctx.beginPath(); ctx.arc(X + c * pt[0], Y + c * pt[1], c * .05, 0, 6.283); ctx.fill(); });
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  /* 爆弾（描きおこし）：本体・つや・導火線の火花。爆発が近いと赤く光る */
  g.bombs.forEach(function (b) {
    var near = b.t < 8, pulse = 1 + .1 * Math.sin(now / (near ? 45 : 130)), cx = (b.x + .5) * c, cy = (b.y + .58) * c, r = c * .3 * pulse;
    shadow(ctx, c, b.x, b.y);
    if (near) { var gl = ctx.createRadialGradient(cx, cy, r * .4, cx, cy, r * 2.2); gl.addColorStop(0, 'rgba(255,60,40,.55)'); gl.addColorStop(1, 'rgba(255,60,40,0)'); ctx.fillStyle = gl; ctx.fillRect(cx - r * 2.3, cy - r * 2.3, r * 4.6, r * 4.6); }
    var bs = sprite('bomb');
    if (bs) { putSprite(ctx, bs, cx, cy + r * 1.15, r * 2.6); return; }
    var bg = ctx.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r); bg.addColorStop(0, '#6a6a7a'); bg.addColorStop(1, '#14141c');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(cx - r * .38, cy - r * .42, r * .22, r * .13, -.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#4a4a5a'; round(ctx, cx - r * .22, cy - r * 1.18, r * .44, r * .3, r * .08); ctx.fill();
    ctx.strokeStyle = '#a07a3a'; ctx.lineWidth = Math.max(1.5, c * .04); ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.15); ctx.quadraticCurveTo(cx + r * .5, cy - r * 1.5, cx + r * .75, cy - r * 1.25); ctx.stroke();
    var sp = 1 + Math.sin(now / 50) * .35; ctx.fillStyle = '#ffd23f'; star(ctx, cx + r * .75, cy - r * 1.25, r * .3 * sp); ctx.fill();
  });

  /* 炎：中心が白く、外が橙。にじむ光つき */
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  g.flames.forEach(function (f) {
    var a = f.t / RULE.flame, cx = (f.x + .5) * c, cy = (f.y + .5) * c;
    var fg = ctx.createRadialGradient(cx, cy, c * .05, cx, cy, c * .75); fg.addColorStop(0, 'rgba(255,250,200,' + (.95 * a) + ')'); fg.addColorStop(.45, 'rgba(255,160,40,' + (.8 * a) + ')'); fg.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = fg; ctx.fillRect(cx - c * .8, cy - c * .8, c * 1.6, c * 1.6);
  });
  ctx.restore();
  g.flames.forEach(function (f) {
    var a = f.t / RULE.flame; ctx.fillStyle = 'rgba(255,120,20,' + (.55 * a) + ')'; round(ctx, f.x * c + c * .1, f.y * c + c * .1, c * .8, c * .8, c * .25); ctx.fill();
  });

  /* 小ロボット：足元の警告リングと赤いまたたき */
  g.robots.forEach(function (r) {
    var m = glide(r, now, 1 / (RULE.robotMove * TICK_MS)), cx = (r.vx + .5) * c, cy = (r.vy + .55) * c;
    shadow(ctx, c, r.vx, r.vy);
    ctx.strokeStyle = 'rgba(255,60,80,' + (.35 + .3 * Math.sin(now / 160)) + ')'; ctx.lineWidth = Math.max(1.5, c * .05); ctx.beginPath(); ctx.ellipse(cx, (r.vy + .86) * c, c * .38, c * .14, 0, 0, 6.283); ctx.stroke();
    var rs = sprite('mini');
    if (rs) putSprite(ctx, rs, cx, (r.vy + .9) * c - bob(m, now) * c, c * .86); else { ctx.font = (c * .74) + 'px serif'; ctx.fillText('🤖', cx, cy - bob(m, now) * c); }
  });

  /* プレイヤー：足元に色のリング。名前札つき */
  g.players.forEach(function (p, i) {
    var em = (opt.emojis && opt.emojis[i]) || '🐻', m = glide(p, now, 1 / (RULE.move * TICK_MS)), cx = (p.vx + .5) * c, cy = (p.vy + .55) * c;
    ctx.save();
    if (p.down > 0) ctx.globalAlpha = .45; else if (p.invul > 0 && Math.floor(now / 100) % 2) ctx.globalAlpha = .4;
    shadow(ctx, c, p.vx, p.vy);
    ctx.strokeStyle = PCOL[i % PCOL.length]; ctx.lineWidth = Math.max(2, c * .09); ctx.beginPath(); ctx.ellipse(cx, (p.vy + .86) * c, c * .36, c * .13, 0, 0, 6.283); ctx.stroke();
    var ai = opt.chars ? opt.chars[i] : -1, ps = ANIMAL_NAMES[ai] ? sprite('animal-' + ANIMAL_NAMES[ai]) : null;
    if (ps) putSprite(ctx, ps, cx, (p.vy + .92) * c - bob(m, now) * c, c * .9); else { ctx.font = (c * .8) + 'px serif'; ctx.fillText(em, cx, cy - bob(m, now) * c); }
    var ak = opt.accs ? opt.accs[i] : 0, as = ak ? sprite('acc-' + ACC_NAMES[ak]) : null;
    if (as) { var face = ak >= 8, bobY = bob(m, now) * c; putSprite(ctx, as, cx + c * .04, (p.vy + (face ? .5 : .3)) * c - bobY, c * (face ? .22 : .32)); }
    if (p.down > 0) { ctx.font = (c * .5) + 'px serif'; ctx.fillText('💫', cx, (p.vy + .12) * c); }
    ctx.restore();
    if (opt.names && c >= 26 && opt.names[i]) {
      ctx.font = '800 ' + Math.round(c * .3) + 'px sans-serif'; var tw = ctx.measureText(opt.names[i]).width + c * .3;
      ctx.fillStyle = PCOL[i % PCOL.length]; round(ctx, cx - tw / 2, (p.vy - .12) * c, tw, c * .36, c * .18); ctx.fill();
      ctx.fillStyle = i % PCOL.length === 2 ? '#3a2a00' : '#fff'; ctx.fillText(opt.names[i], cx, (p.vy + .06) * c);
    }
    if (opt.me === i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, c * .06); ctx.setLineDash([c * .12, c * .08]); ctx.strokeRect(p.vx * c + 2, p.vy * c + 2, c - 4, c - 4); ctx.setLineDash([]); }
  });

  /* 火花と、+100 / −30 の飛び出し */
  g.fx = g.fx.filter(function (f) { return now - f.t0 < f.life; });
  g.fx.forEach(function (f) {
    var k = (now - f.t0) / f.life;
    if (f.k === 'b') { var bm = sprite('boom'); if (bm) { var sc2 = .6 + k * 1.1; ctx.globalAlpha = 1 - k * k; putSprite(ctx, bm, f.x * c, (f.y + .5 * sc2) * c, c * 1.7 * sc2); ctx.globalAlpha = 1; } }
    else if (f.k === 's') { ctx.fillStyle = f.col; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc((f.x + f.vx * (now - f.t0)) * c, (f.y + f.vy * (now - f.t0) + k * .3) * c, c * .07 * (1 - k * .6), 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
    else { ctx.font = '900 ' + Math.round(c * .5) + 'px sans-serif'; ctx.globalAlpha = 1 - k * k; ctx.lineWidth = c * .12; ctx.strokeStyle = 'rgba(40,10,70,.9)'; ctx.strokeText(f.text, f.x * c, (f.y - k * .9) * c); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x * c, (f.y - k * .9) * c); ctx.globalAlpha = 1; }
  });
}
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function star(ctx, x, y, r) { ctx.beginPath(); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr = i % 2 ? r * .4 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }

/* 見た目の位置（vx, vy）を、実際のマス（x, y）へ一定の速さで滑らかに寄せる。戻り値=動いている間 true。
   位置が大きく飛んだとき（復活など）はその場で合わせる。draw が何回呼ばれても、時間で計算するので速さは変わらない */
function glide(o, now, speed) {
  if (o.vx === undefined || Math.abs(o.vx - o.x) > 2.5 || Math.abs(o.vy - o.y) > 2.5) { o.vx = o.x; o.vy = o.y; o.vt = now; }
  var dt = Math.min(100, now - (o.vt || now)); o.vt = now;
  var dx = o.x - o.vx, dy = o.y - o.vy, dist = Math.abs(dx) + Math.abs(dy);
  if (dist < 0.001) return false;
  var k = Math.min(1, speed * 1.08 * dt / dist);
  o.vx += dx * k; o.vy += dy * k;
  return true;
}
function bob(moving, now) { return moving ? Math.abs(Math.sin(now / 75)) * .09 : 0; }
function shadow(ctx, c, vx, vy) {
  ctx.fillStyle = 'rgba(40,10,70,.28)'; ctx.beginPath(); ctx.ellipse((vx + .5) * c, (vy + .86) * c, c * .3, c * .1, 0, 0, 6.2832); ctx.fill();
}
