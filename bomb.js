/*
 * ボンバーマン・ミニゲームの盤面エンジン（通信なし）。
 * ・ロボットランの「安全地帯」の代わりに遊ぶ。5〜6人の小グループで1つの盤面を使う。
 * ・本番では、先生の画面がこのエンジンで全グループを動かし、生徒の入力（向き・爆弾）を毎ステップ取り込む。
 * ・1ステップ=0.1秒。盤面は 13×11。柱は (奇数, 奇数) のマス。
 */
export var W = 13, H = 11;
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
  length: 750      /* ゲームの長さ 75秒 */
};
var SPAWN = [[0, 0], [W - 1, H - 1], [W - 1, 0], [0, H - 1], [6, 0], [6, H - 1]];
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
      g.bombs.push({ x: p.x, y: p.y, o: i, t: RULE.fuse }); g.ev.push({ k: 'put', i: i });
    }
  });

  /* 爆弾：時間で爆発。炎に触れた爆弾は連鎖して爆発 */
  g.bombs.forEach(function (b) { b.t--; });
  var queue = g.bombs.filter(function (b) { return b.t <= 0; });
  while (queue.length) {
    var b = queue.pop();
    if (g.bombs.indexOf(b) < 0) continue;
    g.bombs.splice(g.bombs.indexOf(b), 1);
    g.ev.push({ k: 'boom', x: b.x, y: b.y });
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
        p.down = RULE.down; p.score = Math.max(0, p.score - RULE.hitPenalty); g.ev.push({ k: 'hit', i: i, o: f.o });
      }
    });
    g.robots = g.robots.filter(function (r) {
      if (r.x !== f.x || r.y !== f.y) return true;
      var o = g.players[f.o]; if (o) { o.score += RULE.robotPts; o.kills++; }
      g.ev.push({ k: 'kill', o: f.o, x: r.x, y: r.y }); return false;
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

/* 盤面を描く（canvas）。px = 盤面の横幅。me = 自分の番号（枠で目立たせる）。names/emojis は表示用 */
export function draw(ctx, g, px, opt) {
  opt = opt || {};
  var c = px / W, hpx = c * H, now = performance.now();
  ctx.clearRect(0, 0, px, hpx);
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#c9a2dc' : '#d8b4e8'; ctx.fillRect(x * c, y * c, c, c);
    if (isPillar(x, y)) {
      var gr = ctx.createLinearGradient(x * c, y * c, x * c, (y + 1) * c); gr.addColorStop(0, '#8d7fb0'); gr.addColorStop(1, '#4a3d73');
      ctx.fillStyle = gr; ctx.fillRect(x * c + c * .05, y * c + c * .05, c * .9, c * .9);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x * c + c * .05, y * c + c * .05, c * .9, c * .14);
    }
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  g.flames.forEach(function (f) {
    var a = f.t / RULE.flame;
    ctx.fillStyle = 'rgba(255,150,30,' + (.5 + .4 * a) + ')'; ctx.fillRect(f.x * c + c * .08, f.y * c + c * .08, c * .84, c * .84);
    ctx.fillStyle = 'rgba(255,240,120,' + (.6 * a) + ')'; ctx.fillRect(f.x * c + c * .28, f.y * c + c * .28, c * .44, c * .44);
  });
  g.bombs.forEach(function (b) {
    var s = 1 + .12 * Math.sin(now / (b.t < 8 ? 40 : 110));
    ctx.font = (c * .72 * s) + 'px serif'; ctx.fillText('💣', (b.x + .5) * c, (b.y + .55) * c);
    if (b.t < 8) { ctx.fillStyle = 'rgba(255,60,60,.35)'; ctx.fillRect(b.x * c, b.y * c, c, c); }
  });
  g.robots.forEach(function (r) { ctx.font = (c * .72) + 'px serif'; ctx.fillText('🤖', (r.x + .5) * c, (r.y + .55) * c); });
  g.players.forEach(function (p, i) {
    var em = (opt.emojis && opt.emojis[i]) || '🐻';
    ctx.save();
    if (p.down > 0) { ctx.globalAlpha = .45; ctx.font = (c * .72) + 'px serif'; ctx.fillText('💫', (p.x + .5) * c, (p.y + .3) * c); }
    else if (p.invul > 0 && Math.floor(now / 100) % 2) ctx.globalAlpha = .4;
    ctx.font = (c * .8) + 'px serif'; ctx.fillText(em, (p.x + .5) * c, (p.y + .55) * c);
    ctx.restore();
    if (opt.me === i) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(2, c * .08); ctx.strokeRect(p.x * c + 1, p.y * c + 1, c - 2, c - 2); }
  });
}
