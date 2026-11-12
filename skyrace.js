/*
 * スカイレース（ミニゲーム）の盤面エンジン（通信なし）。bomb.js と同じ形（newGame / step / draw）。
 * ・5〜6人の小グループで1つの空を飛ぶ。画面は自動で右へ流れる。
 * ・雲・鳥の群れ・雷雲をよけながら、星を早いもの勝ちで集める。当たっても脱落せず、押し戻されて星を2つ落とす。
 * ・生徒が送るのは「向き（0〜4）」と「ブースト」だけ。1ステップ=0.1秒。
 */
export var VW = 20, VH = 11;          /* 画面に見える空の大きさ（単位） */
export var TICK_MS = 100;
export var RULE = {
  length: 600,      /* 60秒 */
  scroll: 0.13,     /* 画面が流れる速さ（単位/ステップ） */
  speed: 0.26,      /* 飛行機の速さ */
  boost: 0.30,      /* ブースト中に足される前向きの速さ */
  boostLen: 12,     /* ブースト 1.2秒 */
  boosts: 3,
  dizzy: 10,        /* 当たったあと、ふらふらする 1秒 */
  invul: 20,        /* 当たったあとの無敵 2秒 */
  drop: 2,          /* 当たると落とす星の数 */
  fever: 100        /* 最後の10秒は星が2倍 */
};
var DX = [0, 0, 0, -1, 1], DY = [0, -1, 1, 0, 0];

export function newGame(n, seed) {
  var g = { t: 0, cam: 0, over: false, players: [], obs: [], stars: [], rng: seed || 1, gen: VW * 0.75, oid: 0, ev: [], evq: [] };
  for (var i = 0; i < n; i++) g.players.push({ x: 2 + (i % 2) * 1.2, y: 1.5 + i * (VH - 3) / Math.max(1, n - 1), vx: 0, vy: 0, d: 0, boost: 0, left: RULE.boosts, dizzy: 0, invul: 0, score: 0, hits: 0, big: 0 });
  g.players.forEach(function (p) { p.ox = p.x; p.oy = p.y; });
  while (g.gen < VW + 4) chunk(g);
  return g;
}
function rnd(g) { g.rng = (g.rng * 1664525 + 1013904223) >>> 0; return g.rng / 4294967296; }
function emit(g, e) { g.ev.push(e); g.evq.push(e); }
function add(g, o) { o.id = ++g.oid; o.ox = o.x; o.oy = o.y; return o; }

/* 4単位ずつ、先の空を作る。時間がたつほど障害物が増える */
function chunk(g) {
  var x0 = g.gen, lv = Math.min(1, g.gen / 70), r = rnd(g);
  if (r < 0.18 + 0.1 * lv) {
    /* 星の帯：ゆるい波の形に星が並ぶ。みんなが集まる場所 */
    var y0 = 2 + rnd(g) * (VH - 4), amp = 1 + rnd(g) * 1.5;
    for (var k = 0; k < 7; k++) g.stars.push(add(g, { x: x0 + k * 0.55, y: y0 + Math.sin(k * 0.9) * amp, v: 1 }));
  } else {
    var ns = 2 + Math.floor(rnd(g) * 3);
    for (k = 0; k < ns; k++) g.stars.push(add(g, { x: x0 + rnd(g) * 4, y: 0.8 + rnd(g) * (VH - 1.6), v: 1 }));
  }
  if (rnd(g) < 0.12) g.stars.push(add(g, { x: x0 + 2, y: 1 + rnd(g) * (VH - 2), v: 5 }));   /* 大きい星 */
  var no = (rnd(g) < 0.5 + 0.4 * lv ? 1 : 0) + (rnd(g) < 0.25 * lv ? 1 : 0);
  for (k = 0; k < no; k++) {
    var q = rnd(g), ox = x0 + 1 + rnd(g) * 3, oy = 1 + rnd(g) * (VH - 2);
    if (q < 0.5) g.obs.push(add(g, { k: 'c', x: ox, y: oy, r: 0.9 + rnd(g) * 0.6 }));                          /* 雲：押し戻される */
    else if (q < 0.8) g.obs.push(add(g, { k: 'b', x: ox + 4, y: oy, r: 0.6, by: oy, ph: rnd(g) * 6 }));      /* 鳥の群れ：上下にゆれながら左へ */
    else g.obs.push(add(g, { k: 't', x: ox, y: oy, r: 1.3, ph: Math.floor(rnd(g) * 40) }));                   /* 雷雲：ときどき光る。光っている間だけ危ない */
  }
  g.gen += 4;
}
export function zapping(o, t) { return o.k === 't' && (t + o.ph) % 40 >= 28; }
export function warning(o, t) { return o.k === 't' && (t + o.ph) % 40 >= 18 && (t + o.ph) % 40 < 28; }

/* inputs[i] = { d: 0〜4, b: ブーストを押したか }。d は「上下左右」。斜めは d2 で受け取れる（なければ d のみ） */
export function step(g, inputs) {
  if (g.over) return;
  g.t++; g.ev = [];
  g.cam += RULE.scroll;
  while (g.gen < g.cam + VW + 4) chunk(g);
  var mult = g.t > RULE.length - RULE.fever ? 2 : 1;

  g.players.forEach(function (p, i) {
    p.ox = p.x; p.oy = p.y;
    var inp = inputs[i] || {};
    if (p.invul) p.invul--;
    if (p.boost) p.boost--;
    if (inp.b && p.left > 0 && !p.boost) { p.boost = RULE.boostLen; p.left--; emit(g, { k: 'boost', i: i }); }
    var ax = DX[inp.d || 0] + DX[inp.d2 || 0], ay = DY[inp.d || 0] + DY[inp.d2 || 0], len = Math.hypot(ax, ay) || 1;
    var tx = ax / len * RULE.speed, ty = ay / len * RULE.speed;
    if (p.dizzy) { p.dizzy--; tx = -0.12; ty = Math.sin(g.t) * 0.08; }
    p.vx += (tx - p.vx) * 0.45; p.vy += (ty - p.vy) * 0.45;
    p.x += RULE.scroll + p.vx + (p.boost ? RULE.boost : 0); p.y += p.vy;
    /* ふだんは画面の7割まで。ブースト中だけ、もっと前へ出られる（先の星を取れる） */
    var lim = p.boost ? VW - 1.4 : VW * 0.68; if (p.x > g.cam + lim) p.x = Math.max(g.cam + VW * 0.68, p.x - (p.boost ? 0 : 0.12));
    p.x = Math.max(g.cam + 0.6, Math.min(g.cam + VW - 1.4, p.x)); p.y = Math.max(0.5, Math.min(VH - 0.5, p.y));
    p.d = inp.d || 0;

    g.stars.forEach(function (s) {
      if (s.got || Math.hypot(s.x - p.x, s.y - p.y) > (s.v > 1 ? 0.75 : 0.55)) return;
      s.got = true; p.score += s.v * mult; if (s.v > 1) p.big++;
      emit(g, { k: 'star', i: i, v: s.v * mult, x: s.x, y: s.y });
    });
    if (p.invul) return;
    for (var j = 0; j < g.obs.length; j++) {
      var o = g.obs[j];
      if (o.k === 't' && !zapping(o, g.t)) continue;
      if (Math.hypot(o.x - p.x, (o.y - p.y) * (o.k === 'c' ? 1.4 : 1)) < o.r * 0.75 + 0.3) {
        p.hits++; p.dizzy = RULE.dizzy; p.invul = RULE.invul; p.vx = -0.2;
        var lost = Math.min(RULE.drop, p.score); p.score -= lost;
        /* 落とした星は、後ろにこぼれる（だれでも拾える） */
        for (var s2 = 0; s2 < lost; s2++) g.stars.push(add(g, { x: p.x - 1 - s2 * 0.7, y: Math.max(0.8, Math.min(VH - 0.8, p.y + (s2 ? 1 : -1) * 0.9)), v: 1, drop: 1 }));
        emit(g, { k: 'hit', i: i, x: p.x, y: p.y, o: o.k, lost: lost });
        break;
      }
    }
  });

  g.obs.forEach(function (o) { o.ox = o.x; o.oy = o.y; if (o.k === 'b') { o.x -= 0.07; o.y = o.by + Math.sin((g.t + o.ph * 10) / 7) * 1.2; } });
  g.stars.forEach(function (s) { s.ox = s.x; s.oy = s.y; });
  g.obs = g.obs.filter(function (o) { return o.x > g.cam - 3; });
  g.stars = g.stars.filter(function (s) { return !s.got && s.x > g.cam - 2; });
  if (g.t >= RULE.length) g.over = true;
}

/* ====================================================================
   描画。a = 0〜1（前のステップから今のステップまでの補間。なめらかに見せる）
   ==================================================================== */
var SPR = {};
function sprite(name) {
  if (SPR[name] === undefined) { var im = new Image(); im.src = 'img/robot/' + name + '.webp'; SPR[name] = im; }
  var im2 = SPR[name]; return im2.complete && im2.naturalWidth ? im2 : null;
}
export var ANIMAL_NAMES = ['fox', 'panda', 'rabbit', 'bear', 'tiger', 'frog', 'monkey', 'penguin', 'lion', 'cow', 'pig', 'koala', 'hamster', 'unicorn', 'octopus', 'owl', 'dog', 'cat', 'chick', 'raccoon'];
var ACC_NAMES = ['', 'tophat', 'crown', 'bow', 'cap', 'gradcap', 'santa', 'headphones', 'glasses', 'sunglasses', 'goggles', 'mask'];
export var PCOL = ['#ff5a5a', '#35a7ff', '#ffd23f', '#3ddc84', '#c264ff', '#ff9f1c'];
function putSprite(ctx, im, cx, baseY, h) { var w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, cx - w / 2, baseY - h, w, h); }
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function starPath(ctx, x, y, r) { ctx.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
function puff(ctx, cx, cy, r, col, shade) {
  ctx.fillStyle = shade; [[-.55, .2, .55], [0, .25, .65], [.55, .2, .55]].forEach(function (b) { ctx.beginPath(); ctx.arc(cx + b[0] * r, cy + b[1] * r + r * .12, b[2] * r, 0, 6.283); ctx.fill(); });
  ctx.fillStyle = col; [[-.55, .15, .5], [-.15, -.2, .6], [.35, -.1, .55], [.6, .2, .45], [0, .22, .55]].forEach(function (b) { ctx.beginPath(); ctx.arc(cx + b[0] * r, cy + b[1] * r, b[2] * r, 0, 6.283); ctx.fill(); });
}
function lerp(a, b, k) { return a + (b - a) * k; }

export function draw(ctx, g, px, opt) {
  opt = opt || {};
  var u = px / VW, ph = u * VH, now = performance.now(), a = opt.a === undefined ? 1 : opt.a;
  var cam = g.cam - RULE.scroll * (1 - a);
  function sx(o) { return (lerp(o.ox === undefined ? o.x : o.ox, o.x, a) - cam) * u; }
  function sy(o) { return lerp(o.oy === undefined ? o.y : o.oy, o.y, a) * u; }
  g.fx = g.fx || [];
  (g.evq || []).forEach(function (e) {
    if (e.k === 'star') {
      g.fx.push({ k: 'p', wx: e.x, y: e.y, text: '+' + e.v, col: e.v > 1 ? '#ffe14a' : '#fff', t0: now, life: 800, big: e.v > 2 });
      for (var n = 0; n < (e.v > 1 ? 16 : 6); n++) { var an = Math.random() * 6.283, v = .002 + Math.random() * .004; g.fx.push({ k: 's', wx: e.x, y: e.y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, t0: now, life: 400 + Math.random() * 300, col: '#ffe14a' }); }
    }
    if (e.k === 'hit') g.fx.push({ k: 'p', wx: e.x, y: e.y - .4, text: e.o === 't' ? 'ビリビリ！' : e.o === 'b' ? 'わわっ！' : 'もくもく…', col: '#ffb3b3', t0: now, life: 900 });
    if (e.k === 'boost') { var bp = g.players[e.i]; for (n = 0; n < 10; n++) g.fx.push({ k: 's', wx: bp.x - .5, y: bp.y, vx: -.004 - Math.random() * .004, vy: (Math.random() - .5) * .004, t0: now, life: 400, col: '#9be7ff' }); }
  });
  g.evq = [];

  /* 空：上が濃い青、下が明るい。遠くの山と海は、ゆっくり流れる（奥行き） */
  var sk = ctx.createLinearGradient(0, 0, 0, ph);
  var fever = g.t > RULE.length - RULE.fever && !g.over;
  sk.addColorStop(0, fever ? '#ff7eb3' : '#3a9bff'); sk.addColorStop(.65, fever ? '#ffc46b' : '#9fd8ff'); sk.addColorStop(1, fever ? '#ffe9a8' : '#e2f5ff');
  ctx.fillStyle = sk; ctx.fillRect(0, 0, px, ph);
  ctx.fillStyle = 'rgba(255,255,230,.85)'; ctx.beginPath(); ctx.arc(px * .82, ph * .16, u * .9, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,230,.25)'; ctx.beginPath(); ctx.arc(px * .82, ph * .16, u * 1.5, 0, 6.283); ctx.fill();
  for (var L = 0; L < 2; L++) {
    var par = L ? .35 : .15, base = ph * (L ? .9 : .84), col = L ? 'rgba(90,170,140,.85)' : 'rgba(140,190,220,.7)';
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, ph);
    for (var X = 0; X <= px + 10; X += 10) { var wx = (X / u + cam * par) * (L ? .9 : .5); ctx.lineTo(X, base - (Math.sin(wx) * .5 + Math.sin(wx * 2.3) * .3 + .6) * u * (L ? .8 : 1.4)); }
    ctx.lineTo(px, ph); ctx.fill();
  }
  ctx.fillStyle = 'rgba(70,150,220,.9)'; ctx.fillRect(0, ph - u * .35, px, u * .35);
  /* 遠くのうす雲（背景。当たらない） */
  for (var k = 0; k < 6; k++) { var bx = ((k * 5.3 - cam * .5) % 26 + 26) % 26 - 3; puff(ctx, bx * u, (1.2 + (k * 1.7) % 6) * u, u * .7, 'rgba(255,255,255,.35)', 'rgba(255,255,255,.15)'); }
  /* 速さの線 */
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, u * .04);
  for (k = 0; k < 10; k++) { var ly = ((k * 37) % 100) / 100 * ph, lx = (((k * 53 - cam * 3.2) % 24) + 24) % 24 - 2; ctx.beginPath(); ctx.moveTo(lx * u, ly); ctx.lineTo(lx * u + u * 1.2, ly); ctx.stroke(); }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  /* 星 */
  g.stars.forEach(function (s) {
    var x = sx(s), y = sy(s) + Math.sin(now / 300 + s.id) * u * .08, r = (s.v > 1 ? .55 : .32) * u * (1 + .08 * Math.sin(now / 200 + s.id));
    if (s.v > 1) { var gl = ctx.createRadialGradient(x, y, r * .3, x, y, r * 2.4); gl.addColorStop(0, 'rgba(255,240,120,.7)'); gl.addColorStop(1, 'rgba(255,240,120,0)'); ctx.fillStyle = gl; ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(now / 500 + s.id) * .3);
    ctx.fillStyle = '#e8a400'; starPath(ctx, 0, r * .12, r); ctx.fill();
    ctx.fillStyle = fever ? '#ff8ad8' : '#ffd93d'; starPath(ctx, 0, 0, r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; starPath(ctx, -r * .15, -r * .2, r * .35); ctx.fill();
    ctx.restore();
  });

  /* 障害物 */
  g.obs.forEach(function (o) {
    var x = sx(o), y = sy(o), r = o.r * u;
    if (o.k === 'c') {
      /* 当たる雲は、背景の雲と見分けられるよう少し灰色で、顔つき */
      puff(ctx, x, y, r, '#e9eef6', '#a9b8cc');
      ctx.fillStyle = '#55627a'; [-.22, .22].forEach(function (ex) { ctx.beginPath(); ctx.ellipse(x + ex * r, y, r * .06, r * .1, 0, 0, 6.283); ctx.fill(); });
      ctx.strokeStyle = '#55627a'; ctx.lineWidth = Math.max(1.5, r * .05); ctx.beginPath(); ctx.arc(x, y + r * .28, r * .12, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    else if (o.k === 't') {
      var z = zapping(o, g.t), w = warning(o, g.t);
      if (z) { var zg = ctx.createRadialGradient(x, y, r * .4, x, y, r * 1.6); zg.addColorStop(0, 'rgba(255,240,100,.6)'); zg.addColorStop(1, 'rgba(255,240,100,0)'); ctx.fillStyle = zg; ctx.fillRect(x - r * 1.7, y - r * 1.7, r * 3.4, r * 3.4); }
      puff(ctx, x, y, r, z ? '#6b6f8a' : '#7d8199', '#4a4d63');
      if (w && Math.floor(now / 120) % 2) { ctx.fillStyle = '#ffe14a'; ctx.font = '900 ' + Math.round(u * .5) + 'px sans-serif'; ctx.fillText('⚡', x, y - r * .1); }
      if (z) {
        ctx.strokeStyle = '#fff36b'; ctx.lineWidth = Math.max(2, u * .08); ctx.lineJoin = 'round';
        for (var b = 0; b < 3; b++) { var a0 = b * 2.1 + now / 90; ctx.beginPath(); ctx.moveTo(x, y); for (var s = 1; s <= 4; s++) { var rr = r * .32 * s; ctx.lineTo(x + Math.cos(a0 + (s % 2 ? .35 : -.35)) * rr, y + Math.sin(a0 + (s % 2 ? .35 : -.35)) * rr); } ctx.stroke(); }
      }
    } else {
      /* 鳥の群れ：はばたく小さな鳥3羽 */
      [[0, 0], [-.45, -.35], [-.45, .35]].forEach(function (q, n) {
        var bx2 = x + q[0] * u, by2 = y + q[1] * u, fl = Math.sin(now / 90 + n + o.id) * .22 * u;
        ctx.fillStyle = '#4a4a5e'; ctx.beginPath(); ctx.ellipse(bx2, by2, u * .2, u * .12, 0, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx2 - u * .05, by2); ctx.quadraticCurveTo(bx2, by2 - u * .1 - fl, bx2 + u * .14, by2 - fl * 1.2); ctx.lineTo(bx2 + u * .06, by2); ctx.fill();
        ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.moveTo(bx2 - u * .2, by2 - u * .03); ctx.lineTo(bx2 - u * .3, by2); ctx.lineTo(bx2 - u * .2, by2 + u * .03); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx2 - u * .1, by2 - u * .03, u * .035, 0, 6.283); ctx.fill();
      });
    }
  });

  /* 飛行機（色＝プレイヤーの色）。操縦席に動物 */
  g.players.forEach(function (p, i) {
    var x = sx(p), y = sy(p), col = PCOL[i % 6], tilt = Math.max(-.35, Math.min(.35, (p.y - (p.oy === undefined ? p.y : p.oy)) * 2.2));
    ctx.save();
    if (p.invul > 0 && Math.floor(now / 100) % 2) ctx.globalAlpha = .4;
    /* 飛行機雲 */
    ctx.strokeStyle = p.boost ? 'rgba(155,231,255,.9)' : 'rgba(255,255,255,.7)'; ctx.lineWidth = u * (p.boost ? .22 : .12); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - u * .55, y + u * .05); ctx.lineTo(x - u * (p.boost ? 2.4 : 1.4), y + u * .05); ctx.stroke();
    ctx.translate(x, y); ctx.rotate(tilt + (p.dizzy ? Math.sin(now / 60) * .4 : 0));
    var s = u * .62;
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, s * .95, s * .9, s * .15, 0, 0, 6.283); ctx.fill();
    /* 尾翼・つばさ（奥） */
    ctx.fillStyle = shade(col, -.25); ctx.beginPath(); ctx.moveTo(-s * .75, -s * .05); ctx.lineTo(-s * 1.0, -s * .6); ctx.lineTo(-s * .65, -s * .55); ctx.lineTo(-s * .45, -s * .05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * .1, 0); ctx.lineTo(-s * .45, -s * .5); ctx.lineTo(-s * .2, -s * .5); ctx.lineTo(s * .25, 0); ctx.fill();
    /* 胴体 */
    var bg = ctx.createLinearGradient(0, -s * .35, 0, s * .35); bg.addColorStop(0, shade(col, .35)); bg.addColorStop(1, shade(col, -.15));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, s * .95, s * .32, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(s * .82, 0, s * .16, s * .24, 0, 0, 6.283); ctx.fill();
    /* プロペラ */
    ctx.fillStyle = 'rgba(80,80,90,.55)'; ctx.beginPath(); ctx.ellipse(s * 1.0, 0, s * .06, s * (.3 + .12 * Math.abs(Math.sin(now / 30))), 0, 0, 6.283); ctx.fill();
    /* 操縦席の動物 */
    var ai = opt.chars ? opt.chars[i] : i, ps = ANIMAL_NAMES[ai] ? sprite('animal-' + ANIMAL_NAMES[ai]) : null;
    if (ps) putSprite(ctx, ps, s * .1, -s * .05, s * 1.0); else { ctx.font = (s * .8) + 'px serif'; ctx.fillText('🐻', s * .1, -s * .45); }
    var ak = opt.accs ? opt.accs[i] : 0, as = ak ? sprite('acc-' + ACC_NAMES[ak]) : null;
    if (as) { var face = ak >= 8; putSprite(ctx, as, s * .14, face ? -s * .48 : -s * .78, s * (face ? .25 : .36)); }
    /* つばさ（手前） */
    ctx.fillStyle = shade(col, .1); ctx.beginPath(); ctx.moveTo(-s * .15, s * .1); ctx.lineTo(-s * .5, s * .62); ctx.lineTo(-s * .2, s * .62); ctx.lineTo(s * .3, s * .1); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, s * .95, s * .32, 0, 0, 6.283); ctx.stroke();
    if (p.dizzy) { ctx.font = (s * .5) + 'px serif'; ctx.fillText('💫', 0, -s * 1.1); }
    ctx.restore();
    if (opt.names && u >= 26 && opt.names[i]) {
      ctx.font = '800 ' + Math.round(u * .3) + 'px sans-serif'; var tw = ctx.measureText(opt.names[i]).width + u * .3;
      ctx.fillStyle = col; round(ctx, x - tw / 2, y - u * 1.05, tw, u * .36, u * .18); ctx.fill();
      ctx.fillStyle = i % 6 === 2 ? '#3a2a00' : '#fff'; ctx.fillText(opt.names[i], x, y - u * .87);
    }
    if (opt.me === i) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - u * 1.12 - (opt.names ? 0 : -u * .35)); ctx.lineTo(x - u * .14, y - u * 1.32 - (opt.names ? 0 : -u * .35)); ctx.lineTo(x + u * .14, y - u * 1.32 - (opt.names ? 0 : -u * .35)); ctx.fill(); }
  });

  /* 火花と文字 */
  g.fx = g.fx.filter(function (f) { return now - f.t0 < f.life; });
  g.fx.forEach(function (f) {
    var k = (now - f.t0) / f.life, fx = (f.wx - cam) * u;
    if (f.k === 's') { ctx.fillStyle = f.col; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(fx + f.vx * (now - f.t0) * u, (f.y + f.vy * (now - f.t0)) * u, u * .07 * (1 - k * .6), 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
    else { ctx.font = '900 ' + Math.round(u * (f.big ? .7 : .42)) + 'px sans-serif'; ctx.globalAlpha = 1 - k * k; ctx.lineWidth = u * .12; ctx.strokeStyle = 'rgba(20,40,90,.85)'; ctx.strokeText(f.text, fx, (f.y - .5 - k * .8) * u); ctx.fillStyle = f.col; ctx.fillText(f.text, fx, (f.y - .5 - k * .8) * u); ctx.globalAlpha = 1; }
  });
  if (fever && Math.floor(now / 250) % 2) { ctx.strokeStyle = 'rgba(255,90,170,.7)'; ctx.lineWidth = u * .2; ctx.strokeRect(0, 0, px, ph); }
}
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  function f(c) { return Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)); }
  return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
}

/* ====================================================================
   通信用：先生の画面が計算した空を、短い文字列にして生徒の画面へ送る（bomb.js と同じ考え方）
   ==================================================================== */
export function newView() { return { t: 0, cam: 0, over: false, players: [], obs: [], stars: [], ev: [], evq: [] }; }
function r2(v) { return Math.round(v * 100) / 100; }
export function serialize(g) {
  return JSON.stringify({
    t: g.t, c: r2(g.cam), o: g.over ? 1 : 0,
    p: g.players.map(function (p) { return [r2(p.x), r2(p.y), p.boost, p.dizzy, p.invul, p.score, p.left, p.hits, p.big]; }),
    s: g.stars.map(function (s) { return [s.id, r2(s.x), r2(s.y), s.v]; }),
    b: g.obs.map(function (o) { return [o.id, o.k, r2(o.x), r2(o.y), r2(o.r), o.ph || 0]; }),
    e: g.ev.map(function (e) { return e.k === 'star' ? ['s', e.i, e.v, r2(e.x), r2(e.y)] : e.k === 'hit' ? ['h', e.i, r2(e.x), r2(e.y), e.o, e.lost] : ['b', e.i]; })
  });
}
/* 受け取るたびに、前の位置を ox/oy に残す（draw がその間をなめらかにつなぐ） */
export function applyData(v, str) {
  var d = JSON.parse(str);
  v.t = d.t; v.cam = d.c; v.over = !!d.o;
  v.players = d.p.map(function (a, i) { var p = v.players[i] || { x: a[0], y: a[1] }; p.ox = p.x; p.oy = p.y; p.x = a[0]; p.y = a[1]; p.boost = a[2]; p.dizzy = a[3]; p.invul = a[4]; p.score = a[5]; p.left = a[6]; p.hits = a[7]; p.big = a[8]; return p; });
  var os = {}; v.stars.forEach(function (s) { os[s.id] = s; });
  v.stars = d.s.map(function (a) { var s = os[a[0]] || { id: a[0], x: a[1], y: a[2] }; s.ox = s.x; s.oy = s.y; s.x = a[1]; s.y = a[2]; s.v = a[3]; return s; });
  var ob = {}; v.obs.forEach(function (o) { ob[o.id] = o; });
  v.obs = d.b.map(function (a) { var o = ob[a[0]] || { id: a[0], x: a[2], y: a[3] }; o.ox = o.x; o.oy = o.y; o.k = a[1]; o.x = a[2]; o.y = a[3]; o.r = a[4]; o.ph = a[5]; return o; });
  d.e.forEach(function (e) { v.evq.push(e[0] === 's' ? { k: 'star', i: e[1], v: e[2], x: e[3], y: e[4] } : e[0] === 'h' ? { k: 'hit', i: e[1], x: e[2], y: e[3], o: e[4], lost: e[5] } : { k: 'boost', i: e[1] }); });
}
