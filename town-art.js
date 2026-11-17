/*
 * 歩ける町の地面を1枚の絵として描く（2026-11-17。モック mock/town-mock.html を本番に入れたもの）。quest.html の drawMap から呼ぶ。
 * - 草・道（土の広場）・石畳・川・畑を、マスの区切りなしにつなげる（となりのマスとの間をノイズでぼかして、ふちを不ぞろいに）。
 * - 柵・石の壁・見張り塔・門の渡り・橋・飛び石、物の下のやわらかい影、草のふさと花。
 * - 光：街灯・塔の窓・噴水のまわりの灯り、川のきらめき、光のつぶ（CSSだけ。動きを減らす設定では止める）。
 * どの段階（0〜12）でも、buildTown の地図（g・tiles・objs・fountain・dry）から描く。
 * 重さ：止まった絵は段階とマスの大きさごとに1回だけ描いて取っておく。描く間は少しずつ区切って（画面を止めない）、
 * 読み終わるまでは下にある今のタイル（div）が見える。
 */
var CACHE = {}, STYLE = false;
var G, M, MW, MH, TX, TS, PX, LAYER, MASKS, LOWWALL;
var GR = 0, PATH = 1, PLAZA = 2, WATER = 3, SOIL = 4;
function rng(seed) { return function () { return (seed = (seed * 16807) % 2147483647) / 2147483647; }; }
function cell(x, y) { var r = G[y]; return r ? r[x] : undefined; }
function hash(x, y) { var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function sm(t) { return t * t * (3 - 2 * t); }
function vn(x, y) { var i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
  var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
function fbm(x, y) { return vn(x, y) * .5 + vn(x * 2.03 + 17, y * 2.03 + 9) * .3 + vn(x * 4.1 + 41, y * 4.1 + 3) * .2; }
var WF1, WF2, WID;
function worley(x, y) { var i = Math.floor(x), j = Math.floor(y); WF1 = 9; WF2 = 9;
  for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var ci = i + di, cj = j + dj, px = ci + .12 + .76 * hash(ci * 3 + 1, cj * 7 + 2), py = cj + .12 + .76 * hash(ci * 5 + 3, cj * 11 + 5), d = Math.hypot(px - x, py - y);
    if (d < WF1) { WF2 = WF1; WF1 = d; WID = hash(ci, cj * 13 + 7); } else if (d < WF2) WF2 = d; } }
function mix(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function mval(m, i, j) { i = clamp(i, 0, MW - 1); j = clamp(j, 0, MH - 1); return m[j * MW + i]; }
function field(m, X, Y) { var u = X - .5, v = Y - .5, i = Math.floor(u), j = Math.floor(v), fx = sm(u - i), fy = sm(v - j);
  var a = mval(m, i, j), b = mval(m, i + 1, j), c = mval(m, i, j + 1), d = mval(m, i + 1, j + 1); return mix(mix(a, b, fx), mix(c, d, fx), fy); }

function setup(m) {
  M = m; G = m.g; MW = G[0].length; MH = G.length; LOWWALL = !!(m.tiles && m.tiles.F && m.tiles.F.indexOf('t-swall') === 0);
  var dirtPlaza = !!(m.tiles && m.tiles.P === 't-dirt');
  function base(c) {
    if ('=Gde'.includes(c)) return PATH;
    if ('PO'.includes(c)) return dirtPlaza ? PATH : PLAZA;
    if ('~hH'.includes(c)) return WATER;
    if (c === 'a') return SOIL;
    if ('.,TrUWKBX'.includes(c) || (c === 'F')) return GR;
    return -1;
  }
  var GROUND = [], x, y;
  for (y = 0; y < MH; y++) { GROUND.push([]); for (x = 0; x < MW; x++) GROUND[y].push(base(G[y][x])); }
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (GROUND[y][x] < 0) {   /* 物の下（街灯・人・樽など）はまわりの多いほうの地面 */
    var cnt = [0, 0, 0, 0, 0];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var r = GROUND[y + d[1]], v = r && r[x + d[0]]; if (v != null && v >= 0) cnt[v]++; });
    var best = 0; for (var k = 1; k < 5; k++) if (cnt[k] > cnt[best]) best = k;
    if (cnt[PLAZA] >= 2) best = PLAZA;
    GROUND[y][x] = best;
  }
  MASKS = [];
  for (var q = 0; q < 5; q++) { var mm = new Float32Array(MW * MH); for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) mm[y * MW + x] = GROUND[y][x] === q ? 1 : 0; MASKS.push(mm); }
}
function layerAt(X, Y) { var px = Math.floor(X * PX), py = Math.floor(Y * PX); if (px < 0 || py < 0 || px >= MW * PX || py >= MH * PX) return -1; return LAYER[py * MW * PX + px]; }
/* 地面（1画素ずつ）を、区切りながら描く */
function terrain(done) {
  var tw = MW * PX, th = MH * PX, cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
  var ctx = cv.getContext('2d'), img = ctx.createImageData(tw, th), D = img.data, py = 0;
  LAYER = new Uint8Array(tw * th);
  (function chunk() {
    var t0 = performance.now();
    for (; py < th && performance.now() - t0 < 24; py++) for (var px = 0; px < tw; px++) {
    var X = (px + .5) / PX, Y = (py + .5) / PX;
    var n1 = fbm(X * 1.6, Y * 1.6) - .5, n2 = vn(X * 6.5 + 50, Y * 6.5) - .5, jit = n1 * .42 + n2 * .14;
    var eW = field(MASKS[WATER], X, Y) + jit * 1.25 - .5, eP = field(MASKS[PLAZA], X, Y) + (n1 * .34 + n2 * .1) - .5,
        eD = field(MASKS[PATH], X, Y) + jit * .9 - .5, eS = field(MASKS[SOIL], X, Y) + jit * .5 - .5;
    var r, g, b, lay = GR;
    /* 草：ゆるい色むら＋葉の向きのすじ */
    var g1 = fbm(X * .32, Y * .32), g2 = vn(X * 2.3 + 7, Y * 2.3), st = vn(X * 16, Y * 4.5) - .5, grain = hash(px, py) - .5;
    r = mix(84, 132, g1); g = mix(168, 206, g1); b = mix(74, 96, g1);
    var gm = .9 + .18 * g2 + st * .1 + grain * .05; r *= gm; g *= gm; b *= gm;
    if (vn(X * .9 + 90, Y * .9) > .72) { r += 18; g += 10; b -= 4; }   /* 日だまりの明るい草 */
    var rim = 0;
    if (eS > 0) { lay = SOIL; r = 150; g = 108; b = 66; }
    if (eD > -0.07 && lay === GR) {
      if (eD > 0) { lay = PATH;
        var pv = fbm(X * .9 + 3, Y * .9); r = mix(212, 236, pv); g = mix(176, 206, pv); b = mix(118, 152, pv);
        worley(X * 4.6, Y * 4.6); if (WF1 < .16) { var pk = WID > .5 ? 1.08 : .88; r *= pk; g *= pk; b *= pk; }
        var rd = clamp(eD / .09, 0, 1); var dk = mix(.80, 1, sm(rd)); r *= dk; g *= dk; b *= dk;
        r = mix(r * .8, r, rd); /* 縁は少し草に寄せる */ g = mix(g * .95, g, rd);
      } else { var wt = 1 - (-eD / .07); r = mix(r, r * .82 + 30, wt * .5); g = mix(g, g * .86 + 18, wt * .5); b = mix(b, b * .8 + 10, wt * .5); }
    }
    if (eP > -0.05) {
      if (eP > 0) { lay = PLAZA;
        var wx = X + (fbm(X * .9 + 11, Y * .9) - .5) * .5, wy = Y + (fbm(X * .9, Y * .9 + 23) - .5) * .5;
        worley(wx * 2.1, wy * 2.1); var mort = (WF2 - WF1) / 2.1, sv = WID;
        if (sv < .38) { worley(wx * 4.2 + 7, wy * 4.2); mort = Math.min(mort, (WF2 - WF1) / 4.2); sv = WID * .9 + .05; }   /* 小さい石の区画 */
        var wear = fbm(X * 1.1 + 5, Y * 1.1), base = mix(198, 220, sv) * (.96 + wear * .07);
        r = base; g = base * mix(.93, .96, sv); b = base * mix(.80, .86, sv);
        if (sv > .8) { r -= 4; g += 1; b += 9; } else if (sv < .12) { r += 6; g += 2; b -= 6; }   /* 青み・赤みの石を少し */
        var ed = clamp(mort / .045, 0, 1), soft = .9 + .1 * sm(ed); r *= soft; g *= soft; b *= soft;   /* 石の縁はやわらかく暗く */
        if (mort < .016) { var mt = sm(1 - mort / .016); r = mix(r, 168, mt * .55); g = mix(g, 152, mt * .55); b = mix(b, 126, mt * .55); }
        if (vn(X * 3 + 70, Y * 3) > .78) { r = mix(r, 130, .12); g = mix(g, 150, .12); b = mix(b, 100, .12); }   /* すき間のこけ */
        if (eP < .07) { var ct = 1 - eP / .07; r = mix(r, 150, ct * .55); g = mix(g, 138, ct * .55); b = mix(b, 120, ct * .55); }
      } else { var sh = .78 + .22 * (-eP / .05); r *= sh; g *= sh; b *= sh; }
    }
    if (eW > -0.11) {
      if (eW > 0) { lay = WATER;
        var dep = clamp(eW / .42, 0, 1), wv = fbm(X * 1.2 + 30, Y * .5);
        r = mix(120, 44, dep); g = mix(212, 126, dep); b = mix(226, 196, dep);
        r += (wv - .5) * 20; g += (wv - .5) * 20; b += (wv - .5) * 14;
        if (eW < .045) { var f = 1 - eW / .045; r = mix(r, 236, f * .7); g = mix(g, 248, f * .7); b = mix(b, 252, f * .7); }
      } else { var bt = sm(1 - (-eW / .11)); r = mix(r, 150, bt * .6); g = mix(g, 128, bt * .6); b = mix(b, 86, bt * .6); if (eW > -.025) { r *= .82; g *= .82; b *= .86; } }
    }
    var o = (py * tw + px) * 4; D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = 255; LAYER[py * tw + px] = lay;
    }
    if (py < th) return setTimeout(chunk, 0);
    ctx.putImageData(img, 0, 0); done(cv);
  })();
}
function shadow(ctx, cx, cy, rx, ry, a) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(rx, ry);
  var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(40,24,70,' + a + ')'); gr.addColorStop(.6, 'rgba(40,24,70,' + a * .55 + ')'); gr.addColorStop(1, 'rgba(40,24,70,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function decorate(ctx) {
  var r = rng(11), i, x, y;
  /* 草のふさ（草の上だけ） */
  for (i = 0; i < MW * MH * 2.2; i++) {
    var X = r() * MW, Y = r() * MH; if (layerAt(X, Y) !== GR || layerAt(X, Y + .15) !== GR) continue;
    var s = .09 + r() * .07, dkc = 'rgba(46,112,52,.55)', lt = 'rgba(190,236,140,.55)';
    ctx.lineWidth = .028; ctx.strokeStyle = dkc; ctx.beginPath();
    for (var bl = -1; bl <= 1; bl++) { ctx.moveTo(X + bl * s * .25, Y); ctx.quadraticCurveTo(X + bl * s * .45, Y - s * .5, X + bl * s * .7, Y - s * (bl ? .8 : 1.1)); }
    ctx.stroke(); ctx.strokeStyle = lt; ctx.lineWidth = .016; ctx.beginPath(); ctx.moveTo(X + .01, Y - s * .3); ctx.lineTo(X + .03, Y - s * 1); ctx.stroke();
  }
  /* 花（"," のマスのまわりにばらまく。マスの真ん中にそろえない） */
  var FC = ['#ffffff', '#ffd23f', '#ff9ac6', '#c8a8ff', '#fff3b0'];
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (G[y][x] === ',') {
    var nf = 4 + Math.floor(r() * 4), col = FC[Math.floor(r() * FC.length)];
    for (i = 0; i < nf; i++) { var fx = x + .5 + (r() - .5) * 1.5, fy = y + .5 + (r() - .5) * 1.4; if (layerAt(fx, fy) !== GR) continue;
      ctx.fillStyle = 'rgba(30,90,40,.35)'; ctx.beginPath(); ctx.arc(fx + .01, fy + .02, .055, 0, 7); ctx.fill();
      ctx.fillStyle = r() < .3 ? FC[Math.floor(r() * FC.length)] : col; for (var p = 0; p < 5; p++) { var a = p * 1.2566; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * .035, fy + Math.sin(a) * .035, .03, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(fx, fy, .02, 0, 7); ctx.fill(); }
  }
  /* 影（建物・物・木） */
  (M.blds || []).forEach(function (b) { shadow(ctx, b.x + b.w / 2 + .25, b.y + b.h - .05, b.w * .62, .75, .45); });
  (M.objs || []).forEach(function (o) { if (o.s !== 'flags' && o.s !== 'field') shadow(ctx, o.x + o.w / 2 + .12, o.y + o.h - .1, o.dw * .42, .32, .4); });
  if (M.fountain) shadow(ctx, M.fountain[0] + 1.4, M.fountain[1] + 1.65, 1.35, .45, .38);
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) { var c = G[y][x];
    if (c === 'T') shadow(ctx, x + .62, y + .9, .72, .3, .42);
    else if ('rURCSde'.includes(c)) shadow(ctx, x + .55, y + .9, .42, .17, .4);
    else if (c === 'L') shadow(ctx, x + .55, y + .9, .2, .1, .45);
    else if (c === 'V') shadow(ctx, x + .5, y + .85, .38, .14, .3);
  }
  /* 柵（地面から続く木の柵） */
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (G[y][x] === 'F' && !LOWWALL) {
    var L = G[y][x - 1] === 'F', R = G[y][x + 1] === 'F';
    ctx.fillStyle = 'rgba(40,24,70,.25)'; ctx.fillRect(x + (L ? 0 : .12), y + .78, (L ? .5 : .38) + (R ? .5 : .38), .1);
    ctx.fillStyle = '#9b6a35'; ctx.fillRect(x + (L ? 0 : .12), y + .38, (L ? .5 : .38) + (R ? .5 : .38), .08); ctx.fillRect(x + (L ? 0 : .12), y + .58, (L ? .5 : .38) + (R ? .5 : .38), .08);
    [.14, .62].forEach(function (pp) { if (pp < .3 && L) return; ctx.fillStyle = '#7d5226'; ctx.fillRect(x + pp, y + .26, .1, .58); ctx.fillStyle = '#c79054'; ctx.fillRect(x + pp, y + .26, .1, .05); });
  }
  /* 橋 */
  var hb = []; for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (G[y][x] === 'H') hb.push([x, y]);
  if (hb.length) { var bx0 = Math.min.apply(null, hb.map(function (p) { return p[0]; })), bx1 = Math.max.apply(null, hb.map(function (p) { return p[0]; })), by0 = Math.min.apply(null, hb.map(function (p) { return p[1]; })), by1 = Math.max.apply(null, hb.map(function (p) { return p[1]; }));
  var bx = bx0 - .3, bw = bx1 - bx0 + 1.6, by = by0 + .02, bh = by1 - by0 + .96;
  ctx.fillStyle = 'rgba(20,40,80,.35)'; ctx.fillRect(bx + .05, by + bh - .02, bw, .22);
  for (i = 0; i < 13; i++) { var xx = bx + i * bw / 13; ctx.fillStyle = i % 2 ? '#a8733c' : '#b98448'; ctx.fillRect(xx, by, bw / 13 + .002, bh); ctx.fillStyle = 'rgba(70,40,15,.45)'; ctx.fillRect(xx, by, .02, bh); }
  ctx.fillStyle = '#6e4520'; ctx.fillRect(bx, by - .02, bw, .12); ctx.fillRect(bx, by + bh - .12, bw, .14);
  ctx.fillStyle = '#d29a5c'; ctx.fillRect(bx, by - .02, bw, .035); }
  /* 飛び石（橋がかかるまで） */
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (G[y][x] === 'h') {
    [[.3, .3, .22], [.68, .62, .2], [.35, .78, .16]].forEach(function (s, k) { var sx = x + s[0], sy = y + s[1];
      ctx.fillStyle = 'rgba(20,50,90,.35)'; ctx.beginPath(); ctx.ellipse(sx + .03, sy + .05, s[2] * 1.05, s[2] * .7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = k % 2 ? '#b3ada4' : '#c6c0b6'; ctx.beginPath(); ctx.ellipse(sx, sy, s[2], s[2] * .68, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(sx - s[2] * .25, sy - s[2] * .2, s[2] * .4, s[2] * .2, 0, 0, 7); ctx.fill(); });
  }
  drawWalls(ctx);
}
function isW(x, y) { var c = cell(x, y); return c === 'W' || c === 'K' || (LOWWALL && c === 'F'); }
function stone(ctx, x, y, w, h, seed, base, rad) {
  if (w <= .01 || h <= .01) return;
  var v = (hash(seed, 91) - .5) * 26, c = [base[0] + v, base[1] + v * .95, base[2] + v * .85 + (hash(seed, 7) - .5) * 10].map(function (q) { return Math.round(q); });
  ctx.fillStyle = 'rgb(' + c + ')'; ctx.beginPath(); ctx.roundRect(x, y, w, h, rad == null ? Math.min(w, h) * .3 : rad); ctx.fill();
  ctx.fillStyle = 'rgba(255,248,230,.28)'; ctx.beginPath(); ctx.roundRect(x + w * .08, y + h * .08, w * .84, Math.min(.035, h * .25), .02); ctx.fill();
  ctx.fillStyle = 'rgba(40,30,60,.18)'; ctx.fillRect(x + w * .1, y + h - Math.min(.035, h * .25), w * .8, Math.min(.035, h * .25));
}
function drawWalls(ctx) {
  var x, y, r = rng(29), MORT = '#6f6658';
  /* 地面に落ちる影（壁の下） */
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (isW(x, y) && !isW(x, y + 1)) {
    var g = ctx.createLinearGradient(0, y + .95, 0, y + 1.38); g.addColorStop(0, 'rgba(40,24,70,.45)'); g.addColorStop(1, 'rgba(40,24,70,0)'); ctx.fillStyle = g; ctx.fillRect(x - .05, y + .95, 1.1, .43);
  }
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (isW(x, y) && G[y][x] !== 'K') {   /* 縦の壁の東側の影 */
    if (!isW(x + 1, y) && isW(x, y + 1)) { var g2 = ctx.createLinearGradient(x + .86, 0, x + 1.2, 0); g2.addColorStop(0, 'rgba(40,24,70,.38)'); g2.addColorStop(1, 'rgba(40,24,70,0)'); ctx.fillStyle = g2; ctx.fillRect(x + .86, y, .34, 1); }
  }
  /* 上の面（笠石）：目地の暗い下地に、大きさのちがう平たい石 */
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (isW(x, y)) {
    var horiz = !isW(x, y + 1) || !isW(x, y - 1) && isW(x + 1, y);
    var l = isW(x - 1, y) ? 0 : .1, rr = isW(x + 1, y) ? 1 : .9, t = isW(x, y - 1) ? 0 : .08, bt = isW(x, y + 1) ? 1 : .42;
    ctx.fillStyle = MORT; ctx.fillRect(x + l, y + t, rr - l, bt - t);
    if (!isW(x, y + 1)) {   /* 横に走る壁：横長の石を2段 */
      [[t + .02, .5], [.5, bt - .02]].forEach(function (rw, k) { if (k === 1) return; });
      var xs = x + l + .02, seg = 0;
      while (xs < x + rr - .04) { var w = .28 + hash(x * 7 + seg, y * 3) * .34; w = Math.min(w, x + rr - .02 - xs); stone(ctx, xs, y + t + .02, w - .03, bt - t - .05, x * 31 + seg + y * 7, [206, 199, 186]); xs += w; seg++; }
    } else {   /* 縦に走る壁：縦長の石 */
      var ys = y + t + .02, sg = 0;
      while (ys < y + bt - .04) { var hh = .3 + hash(x * 5, y * 9 + sg) * .32; hh = Math.min(hh, y + bt - .02 - ys);
        var half = hash(x + sg, y) > .55;
        if (half) { stone(ctx, x + l + .03, ys, (rr - l) / 2 - .05, hh - .03, x * 13 + y * 5 + sg, [206, 199, 186]); stone(ctx, x + l + (rr - l) / 2, ys, (rr - l) / 2 - .05, hh - .03, x * 17 + y * 3 + sg, [206, 199, 186]); }
        else stone(ctx, x + l + .03, ys, rr - l - .08, hh - .03, x * 11 + y * 7 + sg, [206, 199, 186]);
        ys += hh; sg++; }
      ctx.fillStyle = 'rgba(70,58,90,.35)'; ctx.fillRect(x + rr - .07, y + t, .07, bt - t);   /* 東の縁の影 */
    }
    ctx.fillStyle = 'rgba(255,248,230,.3)'; if (!isW(x, y - 1)) ctx.fillRect(x + l, y + t, rr - l, .03);
  }
  /* 手前の面：段ごとに長さのちがう石を積む */
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (isW(x, y) && !isW(x, y + 1)) {
    var l2 = isW(x - 1, y) ? 0 : .1, r2 = isW(x + 1, y) ? 1 : .9, top = y + .42;
    ctx.fillStyle = '#5d5448'; ctx.fillRect(x + l2, top, r2 - l2, 1 - .42);
    var rows = [.2, .19, .19], yy = top;
    rows.forEach(function (rh, k) {
      var xs = x + l2 + (k % 2 ? 0 : .0), sg = 0, off = hash(x, y * 5 + k) * .2;
      xs += isW(x - 1, y) ? -off : .01;
      while (xs < x + r2 - .02) { var w = .24 + hash(x * 9 + sg, k * 41 + y) * .36, x0 = Math.max(xs, x + l2), x1 = Math.min(xs + w, x + r2);
        if (x1 - x0 > .05) stone(ctx, x0 + .015, yy + .015, x1 - x0 - .03, rh - .03, x * 71 + k * 13 + sg, [168, 158, 142], .035);
        xs += w; sg++; }
      yy += rh;
    });
    var gd = ctx.createLinearGradient(0, top, 0, y + 1); gd.addColorStop(0, 'rgba(40,24,70,.28)'); gd.addColorStop(.25, 'rgba(40,24,70,0)'); gd.addColorStop(1, 'rgba(40,24,70,.18)'); ctx.fillStyle = gd; ctx.fillRect(x + l2, top, r2 - l2, 1 - .42);
    /* こけ（下の方） */
    for (var m = 0; m < 4; m++) { if (hash(x * 3 + m, y) > .55) continue; var mx = x + l2 + hash(x, m * 7 + y) * (r2 - l2), my = y + .86 + hash(m, x) * .12;
      ctx.fillStyle = 'rgba(92,150,70,.8)'; ctx.beginPath(); ctx.ellipse(mx, my, .07 + hash(x, m) * .08, .05, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(150,200,100,.6)'; ctx.beginPath(); ctx.ellipse(mx - .02, my - .02, .04, .025, 0, 0, 7); ctx.fill(); }
    /* つた（ところどころ） */
    if (hash(x * 17, y * 3) < .22) { var vx = x + .2 + hash(x, y * 7) * .6;
      ctx.strokeStyle = '#3f7a3a'; ctx.lineWidth = .025; ctx.beginPath(); ctx.moveTo(vx, y + .4);
      for (var q = 1; q <= 5; q++) ctx.lineTo(vx + Math.sin(q * 1.7 + x) * .05, y + .4 + q * .11); ctx.stroke();
      for (q = 0; q < 7; q++) { var lx = vx + Math.sin(q * 1.3 + x) * .07, ly = y + .36 + q * .08; ctx.fillStyle = q % 2 ? '#5fa84a' : '#4b9440'; ctx.beginPath(); ctx.ellipse(lx, ly, .045, .03, q, 0, 7); ctx.fill(); } }
  }
  /* 上の縁のこけ */
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (isW(x, y) && hash(x * 5, y * 11) < .3) {
    var ex = x + hash(x, y) * .8 + .1, ey = isW(x, y + 1) ? y + hash(y, x) : y + .1 + hash(y, x) * .25;
    ctx.fillStyle = 'rgba(110,165,80,.75)'; ctx.beginPath(); ctx.ellipse(ex, ey, .08, .045, 0, 0, 7); ctx.fill();
  }
  M.towers = [];
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) if (G[y][x] === 'K') { shadow(ctx, x + .7, y + 1.08, .85, .28, .5); M.towers.push([x, y]); }
}
/* 見張り塔（人より手前・奥を正しく重ねるため、1つずつ別のキャンバス） */
function towerCanvas(tx, ty) {
  var cv = document.createElement('canvas'), ox = tx - .45, oy = ty - 2.3, w = 1.9, h = 3.4;
  cv.width = Math.round(w * TX); cv.height = Math.round(h * TX); cv.className = 'tw-cv';
  cv.style.cssText = 'position:absolute;pointer-events:none;left:' + ox * TS + 'px;top:' + oy * TS + 'px;width:' + w * TS + 'px;height:' + h * TS + 'px;z-index:' + (ty * 10 + 6);
  var c = cv.getContext('2d'); c.scale(TX, TX); c.translate(-ox, -oy);
  var L = tx - .22, R = tx + 1.22, top = ty - .55, bot = ty + 1.02;
  /* 胴：段ごとにずらした石 */
  c.fillStyle = '#5d5448'; c.fillRect(L, top, R - L, bot - top);
  var yy = top, k = 0;
  while (yy < bot - .02) { var rh = .19 + hash(tx, k) * .06, xs = L - hash(k, ty) * .25, sg = 0;
    while (xs < R) { var w2 = .26 + hash(sg * 3 + k, ty * 7 + tx) * .3, x0 = Math.max(xs, L), x1 = Math.min(xs + w2, R); if (x1 - x0 > .05) stone(c, x0 + .015, yy + .015, x1 - x0 - .03, Math.min(rh, bot - yy) - .03, ty * 97 + k * 11 + sg, [182, 172, 156], .035); xs += w2; sg++; }
    yy += rh; k++; }
  var sh = c.createLinearGradient(L, 0, R, 0); sh.addColorStop(0, 'rgba(255,240,220,.18)'); sh.addColorStop(.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(40,24,70,.35)'); c.fillStyle = sh; c.fillRect(L, top, R - L, bot - top);
  /* 窓（灯り） */
  c.fillStyle = '#3a2f55'; c.beginPath(); c.moveTo(tx + .38, ty + .55); c.lineTo(tx + .38, ty + .2); c.arc(tx + .5, ty + .2, .12, Math.PI, 0); c.lineTo(tx + .62, ty + .55); c.fill();
  c.fillStyle = '#ffd27a'; c.beginPath(); c.moveTo(tx + .42, ty + .52); c.lineTo(tx + .42, ty + .22); c.arc(tx + .5, ty + .22, .08, Math.PI, 0); c.lineTo(tx + .58, ty + .52); c.fill();
  /* 胸壁（凸凹） */
  var cy = top - .28; c.fillStyle = '#5d5448'; c.fillRect(L - .08, cy + .12, R - L + .16, .2);
  for (var m = 0; m < 5; m++) { var mx = L - .08 + m * (R - L + .16 - .22) / 4; stone(c, mx, cy - .05, .22, .3, ty * 5 + m, [200, 192, 178], .04); }
  stone(c, L - .1, cy + .2, R - L + .2, .14, ty * 3, [196, 188, 172], .04);
  /* 屋根（円すい） */
  var ap = ty - 2.15, rl = L - .02, rrr = R + .02, rb = cy + .02;
  var rg = c.createLinearGradient(rl, 0, rrr, 0); rg.addColorStop(0, '#8a74c8'); rg.addColorStop(.5, '#6a55a8'); rg.addColorStop(1, '#45367a');
  c.fillStyle = rg; c.beginPath(); c.moveTo(tx + .5, ap); c.quadraticCurveTo(tx + .3, rb - .4, rl, rb); c.quadraticCurveTo(tx + .5, rb + .12, rrr, rb); c.quadraticCurveTo(tx + .7, rb - .4, tx + .5, ap); c.fill();
  c.strokeStyle = 'rgba(40,24,90,.35)'; c.lineWidth = .02;
  for (var s2 = 1; s2 < 4; s2++) { var f = s2 / 4, yy2 = ap + (rb - ap) * f; c.beginPath(); c.moveTo(tx + .5 - (tx + .5 - rl) * f * .98, yy2); c.quadraticCurveTo(tx + .5, yy2 + .06 * f, tx + .5 + (rrr - tx - .5) * f * .98, yy2); c.stroke(); }
  c.strokeStyle = '#2a1f4a'; c.lineWidth = .035; c.beginPath(); c.moveTo(tx + .5, ap); c.quadraticCurveTo(tx + .3, rb - .4, rl, rb); c.quadraticCurveTo(tx + .5, rb + .12, rrr, rb); c.quadraticCurveTo(tx + .7, rb - .4, tx + .5, ap); c.stroke();
  /* 旗 */
  c.strokeStyle = '#6b5a3a'; c.lineWidth = .035; c.beginPath(); c.moveTo(tx + .5, ap); c.lineTo(tx + .5, ap - .4); c.stroke();
  c.fillStyle = '#e8506a'; c.beginPath(); c.moveTo(tx + .52, ap - .4); c.quadraticCurveTo(tx + .75, ap - .38, tx + .92, ap - .3); c.quadraticCurveTo(tx + .72, ap - .26, tx + .52, ap - .2); c.fill();
  cv._ts = TS; return cv;
}
/* 門のアーチ（2つの塔をつなぐ石の弧。人より手前） */
function gateCanvas() {
  var t1 = M.towers[0], t2 = M.towers[1]; if (!t1 || !t2 || t1[0] !== t2[0]) return null;
  var cv = document.createElement('canvas'), ox = t1[0] - .3, oy = t1[1] - .9, w = 1.6, h = t2[1] - t1[1] + .2;
  cv.width = Math.round(w * TX); cv.height = Math.round(h * TX); cv.className = 'tw-cv';
  cv.style.cssText = 'position:absolute;pointer-events:none;left:' + ox * TS + 'px;top:' + oy * TS + 'px;width:' + w * TS + 'px;height:' + h * TS + 'px;z-index:' + (t1[1] * 10 + 7);
  var c = cv.getContext('2d'); c.scale(TX, TX); c.translate(-ox, -oy);
  var x0 = t1[0] + .05, x1 = t1[0] + .95, ya = t1[1] - .55, yb = t2[1] - .55;
  /* 塔の胸壁の高さで、2つの塔をつなぐ渡り（下をくぐれる） */
  c.fillStyle = 'rgba(40,24,70,.25)'; c.fillRect(x0 + .1, ya + .2, x1 - x0, yb - ya);
  c.fillStyle = '#5d5448'; c.fillRect(x0, ya, x1 - x0, .0);
  var n = 7, step = (yb - ya) / n;
  for (var i = 0; i < n; i++) { var bulge = Math.sin((i + .5) / n * Math.PI) * .18; stone(c, x0 + .12 - bulge * .3, ya + i * step + .01, x1 - x0 - .24 + bulge * .6, step - .03, 300 + i, i === 3 ? [214, 204, 186] : [190, 181, 165], .03); }
  c.fillStyle = 'rgba(255,248,230,.25)'; c.fillRect(x0 + .12, ya, .03, yb - ya);
  c.fillStyle = 'rgba(40,24,70,.3)'; c.fillRect(x1 - .15, ya, .04, yb - ya);
  cv._ts = TS; return cv;
}

function style() {
  if (STYLE) return; STYLE = true;
  var s = document.createElement('style');
  s.textContent = '.tw-cv{position:absolute;left:0;top:0;pointer-events:none}' +
    '.tw-glow{position:absolute;border-radius:50%;pointer-events:none;z-index:396;mix-blend-mode:screen;animation:twflick 2.6s ease-in-out infinite alternate}@keyframes twflick{40%{opacity:.8}100%{opacity:1}}' +
    '.tw-grade{position:absolute;inset:0;pointer-events:none;z-index:395;mix-blend-mode:soft-light;background:linear-gradient(155deg,rgba(255,240,200,.22) 0%,rgba(255,240,200,0) 45%,rgba(150,120,230,.10) 100%)}' +
    '.tw-spark{position:absolute;width:.5em;height:.08em;border-radius:.1em;background:#fff;pointer-events:none;z-index:3;opacity:0;animation:twspark ease-in-out infinite}@keyframes twspark{0%,100%{opacity:0;transform:scaleX(.3)}50%{opacity:.75;transform:scaleX(1)}}' +
    '.tw-mote{position:absolute;width:.22em;height:.22em;border-radius:50%;pointer-events:none;z-index:397;opacity:0;animation:twmote linear infinite}@keyframes twmote{0%{transform:translateY(0);opacity:0}20%{opacity:.8}80%{opacity:.55}100%{transform:translateY(-4em);opacity:0}}' +
    '.tw-gate{position:absolute;display:flex;align-items:center;justify-content:center;font-weight:900;color:#8a5a12;font-size:1.2em;pointer-events:none;z-index:3;animation:bob 1.2s ease-in-out infinite}' +
    '@media (prefers-reduced-motion: reduce){.tw-glow,.tw-gate{animation:none!important}.tw-spark,.tw-mote{display:none}}';
  document.head.appendChild(s);
}
var QUEUE = Promise.resolve();   /* 描く途中の絵（区切って描く）が混ざらないよう、1つずつ順に描く */
function render(m, tx, ts) {
  return (QUEUE = QUEUE.then(function () { return render1(m, tx, ts); }));
}
function render1(m, tx, ts) {
  return new Promise(function (ok) {
    setup(m); TX = tx; TS = ts; PX = Math.min(tx, 28);
    var t0 = performance.now();
    terrain(function (tcv) {
      setup(m); TX = tx; TS = ts; PX = Math.min(tx, 28);   /* 区切って描く間に、ほかの段階の絵が描かれていても混ざらないように */
      var cv = document.createElement('canvas'); cv.width = MW * TX; cv.height = MH * TX;
      var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.drawImage(tcv, 0, 0, cv.width, cv.height);
      ctx.save(); ctx.scale(TX, TX); ctx.lineCap = 'round'; decorate(ctx); ctx.restore();
      var towers = M.towers.slice(), tc = towers.map(function (t) { return towerCanvas(t[0], t[1]); }), gc = gateCanvas();
      townArt.lastMs = Math.round(performance.now() - t0);
      ok({ ground: cv, towers: tc, gate: gc, towerPos: towers });
    });
  });
}
function copy(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.className = src.className; c.style.cssText = src.style.cssText; c.getContext('2d').drawImage(src, 0, 0); return c; }
function reduced() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }

/* 町の地図の上に、つながった地面と光を置く。drawMap で innerHTML を作ったあとに呼ぶ。m＝buildTown の地図 */
export function townArt(mapEl, m, ts) {
  if (!mapEl || !m || typeof document === 'undefined') return;
  style();
  var W = m.g[0].length, H = m.g.length, dpr = Math.min(window.devicePixelRatio || 1, 1.5), tx = Math.max(12, Math.min(48, Math.round(ts * dpr)));
  var key = m.st + '|' + tx + '|' + (m.dry ? 1 : 0);
  var cv = document.createElement('canvas'); cv.className = 'tw-cv'; cv.width = W * tx; cv.height = H * tx; cv.style.cssText = 'width:' + W * ts + 'px;height:' + H * ts + 'px;z-index:1;visibility:hidden';
  mapEl.appendChild(cv);
  function box(x, y, w, h) { return 'left:' + x * ts + 'px;top:' + y * ts + 'px;width:' + w * ts + 'px;height:' + h * ts + 'px'; }
  var html = '<div class="tw-grade"></div>', g = m.g, x, y, glows = [];
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    if (g[y][x] === 'L') glows.push([x + .5, y - .25, 2.4, '255,196,110', .6]);
    if (g[y][x] === 'K') glows.push([x + .5, y + .35, 1.4, '255,200,120', .55]);
    if (g[y][x] === 'G' && x === W - 1 && !(g[y][x - 1] === 'G' && g[y - 1] && g[y - 1][x] === 'G' && false)) html += '<div class="tw-gate" style="' + box(x, y, 1, 1) + '">→</div>';
  }
  if (m.fountain && !m.dry) glows.push([m.fountain[0] + 1.4, m.fountain[1] + .7, 3, '150,220,255', .4]);
  glows.forEach(function (q, i) { html += '<div class="tw-glow" style="' + box(q[0] - q[2], q[1] - q[2], 2 * q[2], 2 * q[2]) + ';background:radial-gradient(circle, rgba(' + q[3] + ',' + q[4] + ') 0%, rgba(' + q[3] + ',' + (q[4] * .3).toFixed(2) + ') 35%, rgba(0,0,0,0) 70%);animation-delay:-' + (i * .37 % 2.6).toFixed(2) + 's"></div>'; });
  if (!reduced()) {
    var water = []; for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (g[y][x] === '~') water.push([x, y]);
    for (var i = 0; i < Math.min(30, water.length); i++) { var w = water[Math.floor(hash(i, 5) * water.length)];
      html += '<i class="tw-spark" style="left:' + (w[0] + hash(i, 6) * .7) * ts + 'px;top:' + (w[1] + hash(i, 8)) * ts + 'px;font-size:' + ts * .5 + 'px;animation-duration:' + (1.6 + hash(i, 9) * 2).toFixed(1) + 's;animation-delay:-' + (hash(i, 10) * 3).toFixed(1) + 's"></i>'; }
    for (i = 0; i < 18; i++) { var c = ['255,226,140', '255,240,200', '220,190,255', '255,190,220'][i % 4];
      html += '<i class="tw-mote" style="left:' + hash(i, 13) * W * ts + 'px;top:' + hash(i, 17) * H * ts + 'px;font-size:' + ts * .5 + 'px;background:radial-gradient(circle, rgba(' + c + ',1), rgba(' + c + ',0) 70%);animation-duration:' + (6 + hash(i, 19) * 6).toFixed(1) + 's;animation-delay:-' + (hash(i, 23) * 10).toFixed(1) + 's"></i>'; }
  }
  mapEl.insertAdjacentHTML('beforeend', html);
  var job = CACHE[key] || (CACHE[key] = render(m, tx, ts));
  job.then(function (res) {
    if (!cv.isConnected) return;
    cv.getContext('2d').drawImage(res.ground, 0, 0); cv.style.visibility = '';
    res.towers.concat(res.gate ? [res.gate] : []).forEach(function (t) {
      var c = copy(t);   /* 塔と門は、人と重なる順番（z）を保つため別のキャンバス。位置はマスの大きさで置きなおす */
      var r = t._box || null; c.style.left = parseFloat(t.style.left) / TS_OF(t) * ts + 'px'; c.style.top = parseFloat(t.style.top) / TS_OF(t) * ts + 'px';
      c.style.width = parseFloat(t.style.width) / TS_OF(t) * ts + 'px'; c.style.height = parseFloat(t.style.height) / TS_OF(t) * ts + 'px';
      mapEl.appendChild(c);
    });
  });
}
function TS_OF(t) { return t._ts || 1; }
townArt.lastMs = 0;
