/*
 * ダンジョンの地面を1枚の絵として描く（2026-11-17。モック mock/dungeon-mock.html を本番に入れたもの）。
 * ひとりで冒険のエリア（quest.html）と、チーム戦・なかまと冒険（rikaria-view.js）で共通。
 *
 * - 床：単元の「つながった床」img/rikaria/tile/<単元>-ground.webp と ground2.webp を、マスの区切りなしに敷き、大きなまだらでまぜる。
 *   無ければ今の床の絵（<単元>-floor.webp）を敷く。
 * - 壁：天井のかたまりは1つにつなげ、床に面したところだけ壁の面（<単元>-wall.webp）。床に落ちるやわらかい影。
 * - じゅうたん：1本の帯（じゅうたんの絵から色だけ取る）。
 * - 光：全体を少し暗くし、たいまつ・ボスのまわりを明るく抜く（キャラ・魔物・小物は暗くしない＝この絵の上に乗る）。
 * - 動くもの：たいまつのゆらぎ・霧の流れ・光のつぶ（CSSだけ。動きを減らす設定では止める）。
 *
 * 重さ（学校のChromebook）：止まった絵は、単元・マスの大きさ・地図ごとに1回だけ描いて取っておく（cache）。
 * 描き直し（drawField が毎回 innerHTML を作り直す）では、取っておいた絵を写すだけ。
 * 絵が読み終わるまでは、下にある今のタイル（div）がそのまま見える。
 */
var IMGS = {}, CACHE = {}, STYLE = false;
function load(src) {
  if (!IMGS[src]) IMGS[src] = new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  return IMGS[src];
}
function hash(x, y) { var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function sm(t) { return t * t * (3 - 2 * t); }
function vn(x, y) { var i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
  var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
function fbm(x, y) { return vn(x, y) * .5 + vn(x * 2.03 + 17, y * 2.03 + 9) * .3 + vn(x * 4.1 + 41, y * 4.1 + 3) * .2; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function avg(img, sx, sy, sw, sh) { try { var c = document.createElement('canvas'); c.width = c.height = 1; var x = c.getContext('2d'); x.drawImage(img, sx, sy, sw, sh, 0, 0, 1, 1); var d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; } catch (e) { return null; } }
function pat(ctx, img, size) { var p = ctx.createPattern(img, 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().scale(size / img.width)); return p; }
function rgb(c, k) { return 'rgb(' + c.map(function (q) { return Math.round(clamp(q * (k == null ? 1 : k), 0, 255)); }) + ')'; }
function reduced() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }

/* 単元ごとの灯りの色・霧の色 */
var TINT = { matter: '255,170,90', classify: '255,210,130', force: '220,235,255', earth: '255,140,70', life: '255,200,140', reaction: '255,150,70', weather: '230,230,255',
  electric: '255,240,140', ion: '140,220,255', space: '200,200,255', heredity: '255,230,180', energy: '255,190,100' };
var FOGC = { ion: [190, 235, 255], earth: [230, 170, 150], reaction: [220, 180, 160], space: [190, 190, 255], classify: [200, 235, 190], life: [210, 240, 200] };

function style() {
  if (STYLE) return; STYLE = true;
  var s = document.createElement('style');
  s.textContent = '.dg-cv{position:absolute;left:0;top:0;pointer-events:none;z-index:1}' +
    '.dg-exit{position:absolute;z-index:3;pointer-events:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#ffd23f;font-size:1.2em;text-shadow:0 .05em 0 rgba(0,0,0,.4)}' +
    '.dg-fog{position:absolute;pointer-events:none;z-index:2;animation:dgdrift 14s ease-in-out infinite alternate}.dg-fog.b{animation-duration:19s;animation-direction:alternate-reverse}' +
    '@keyframes dgdrift{from{transform:translate(-2%,-1%)}to{transform:translate(2%,1.5%)}}' +
    '.dg-torch{position:absolute;pointer-events:none;z-index:3}.dg-torch img{position:absolute;left:10%;top:0;width:80%;height:95%;object-fit:contain}' +
    '.dg-glow{position:absolute;border-radius:50%;pointer-events:none;z-index:2;mix-blend-mode:screen;animation:dgflick 1.3s ease-in-out infinite alternate}' +
    '@keyframes dgflick{0%{opacity:.8}100%{opacity:1}}' +
    '.dg-mote{position:absolute;width:.22em;height:.22em;border-radius:50%;pointer-events:none;z-index:399;opacity:0;animation:dgmote linear infinite}' +
    '@keyframes dgmote{0%{transform:translateY(0);opacity:0}20%{opacity:.85}80%{opacity:.6}100%{transform:translateY(-4em);opacity:0}}' +
    '@media (prefers-reduced-motion: reduce){.dg-fog,.dg-glow{animation:none!important}.dg-mote{display:none}}';
  document.head.appendChild(s);
}

/*
 * 地図の上に、つながった地面を置く。drawField / drawMap で innerHTML を作ったあとに呼ぶ。
 * o = { key, g, unit, ts, wall(c), carpet(c), fog(c), torches:[[x,y]...]（壁のマス）, torchDom, lights:[[x,y,r]...], mini }
 */
export function dungeonArt(mapEl, o) {
  if (!mapEl || !o.unit || typeof document === 'undefined') return;
  style();
  var W = o.g[0].length, H = o.g.length, ts = o.ts, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var TX = Math.max(8, Math.min(o.mini ? 24 : 48, Math.round(ts * dpr)));
  var key = o.key + '|' + o.unit + '|' + TX;
  var cv = document.createElement('canvas'); cv.className = 'dg-cv'; cv.width = W * TX; cv.height = H * TX; cv.style.width = W * ts + 'px'; cv.style.height = H * ts + 'px';
  cv.style.visibility = 'hidden';
  mapEl.appendChild(cv);
  /* 出口の矢印（下のタイルの ::after）は、絵の上に出す */
  o.g.forEach(function (r, y) { r.forEach(function (c, x) { if (c === '<') { var d = document.createElement('div'); d.className = 'dg-exit'; d.textContent = '←'; d.style.cssText = 'left:' + x * ts + 'px;top:' + y * ts + 'px;width:' + ts + 'px;height:' + ts + 'px'; mapEl.appendChild(d); } }); });
  var tint = TINT[o.unit] || '255,190,110', html = '';
  function box(x, y, w, h) { return 'left:' + x * ts + 'px;top:' + y * ts + 'px;width:' + w * ts + 'px;height:' + h * ts + 'px'; }
  (o.torches || []).forEach(function (t, i) {
    if (o.torchDom) html += '<div class="dg-torch" style="' + box(t[0], t[1] - .05, 1, 1) + '"><img alt="" src="img/rikaria/prop/torch.webp"></div>';
    if (!o.mini && o.torchDom) html += '<div class="dg-glow" style="' + box(t[0] - 1.9, t[1] - 1.9, 4.8, 4.8) + ';background:radial-gradient(circle, rgba(' + tint + ',.42) 0%, rgba(' + tint + ',.14) 35%, rgba(0,0,0,0) 70%);animation-delay:-' + (i * .37 % 1.3).toFixed(2) + 's"></div>';
  });
  if (!o.mini && !reduced()) {
    var n = Math.min(24, Math.round(W * H / 45));
    for (var i = 0; i < n; i++) { var mx = hash(i, 3) * W, my = hash(i, 7) * H;
      html += '<i class="dg-mote" style="left:' + mx * ts + 'px;top:' + my * ts + 'px;font-size:' + ts * .5 + 'px;background:radial-gradient(circle, rgba(' + tint + ',1), rgba(' + tint + ',0) 70%);animation-duration:' + (5 + hash(i, 9) * 6).toFixed(1) + 's;animation-delay:-' + (hash(i, 11) * 10).toFixed(1) + 's"></i>'; }
  }
  if (html) mapEl.insertAdjacentHTML('beforeend', html);
  var fogRect = null;
  o.g.forEach(function (r, y) { r.forEach(function (c, x) { if (o.fog && o.fog(c)) { if (!fogRect) fogRect = [x, y, x, y]; fogRect[0] = Math.min(fogRect[0], x); fogRect[1] = Math.min(fogRect[1], y); fogRect[2] = Math.max(fogRect[2], x); fogRect[3] = Math.max(fogRect[3], y); } }); });
  var job = CACHE[key] || (CACHE[key] = render(o, W, H, TX, fogRect));
  job.then(function (res) {
    if (!res || !cv.isConnected) return;
    cv.getContext('2d').drawImage(res.ground, 0, 0); cv.style.visibility = '';
    if (res.fog && !o.mini) ['a', 'b'].forEach(function (k, li) {
      var f = document.createElement('canvas'), fr = res.fogBox; f.width = res.fog[li].width; f.height = res.fog[li].height; f.getContext('2d').drawImage(res.fog[li], 0, 0);
      f.className = 'dg-fog ' + k; f.style.cssText = box(fr[0], fr[1], fr[2], fr[3]); mapEl.appendChild(f);
    });
  });
}

function render(o, W, H, TX, fogRect) {
  var t0 = performance.now(), b = 'img/rikaria/tile/' + o.unit + '-';
  return Promise.all(['ground', 'ground2', 'floor', 'wall', 'walltop', 'carpet'].map(function (n) { return load(b + n + '.webp'); })).then(function (im) {
    var ground = im[0], ground2 = im[1], floor = im[2], wall = im[3], walltop = im[4], carpet = im[5];
    if (!(ground || floor) || !wall || !walltop) return null;   /* 絵が無い単元は、今のタイルのまま */
    var g = o.g, cv = document.createElement('canvas'); cv.width = W * TX; cv.height = H * TX;
    var ctx = cv.getContext('2d'); ctx.scale(TX, TX);
    function isW(x, y) { var r = g[y]; if (!r) return true; if (r[x] === undefined) return !(r[x + 1] === '<' || r[x - 1] === '<');   /* 出口の外は床あつかい（出口に黒い半円が出ないように） */
      return o.wall(r[x]); }
    function isC(x, y) { var r = g[y]; return !!r && r[x] !== undefined && o.carpet(r[x]); }
    /* 床 */
    var base = ground || floor;
    ctx.fillStyle = pat(ctx, base, ground ? 5 : 4); ctx.fillRect(0, 0, W, H);
    var mask = document.createElement('canvas'); mask.width = W * 8; mask.height = H * 8; var mx = mask.getContext('2d'), md = mx.createImageData(mask.width, mask.height);
    for (var py = 0; py < mask.height; py++) for (var px = 0; px < mask.width; px++) {
      var X = px / 8, Y = py / 8, oo = (py * mask.width + px) * 4;
      if (ground && ground2) { md.data[oo + 3] = sm(clamp((fbm(X * .3 + 40, Y * .3) - .42) / .16, 0, 1)) * 255; }
      else { var dk = clamp((fbm(X * .35, Y * .35) - .5) * 2.2, -1, 1); md.data[oo] = dk > 0 ? 20 : 255; md.data[oo + 1] = dk > 0 ? 10 : 245; md.data[oo + 2] = dk > 0 ? 40 : 225; md.data[oo + 3] = Math.abs(dk) * (dk > 0 ? 70 : 38); }
    }
    mx.putImageData(md, 0, 0);
    if (ground && ground2) {
      var g2 = document.createElement('canvas'); g2.width = cv.width; g2.height = cv.height; var gx = g2.getContext('2d');
      gx.save(); gx.scale(TX, TX); gx.fillStyle = pat(gx, ground2, 5); gx.fillRect(0, 0, W, H); gx.restore();
      gx.globalCompositeOperation = 'destination-in'; gx.drawImage(mask, 0, 0, g2.width, g2.height);
      ctx.drawImage(g2, 0, 0, W, H);
    } else ctx.drawImage(mask, 0, 0, W, H);
    /* じゅうたん（1本の帯） */
    if (carpet) {
      var cm = avg(carpet, carpet.width * .3, 0, carpet.width * .4, carpet.height) || [150, 40, 90], ce = avg(carpet, carpet.width * .02, 0, carpet.width * .06, carpet.height) || [220, 120, 80];
      ctx.save(); ctx.shadowColor = 'rgba(10,0,30,.4)'; ctx.shadowBlur = TX * .12; ctx.shadowOffsetY = TX * .04; ctx.fillStyle = rgb(cm);
      ctx.beginPath(); for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (isC(x, y)) ctx.rect(x - .002, y - .002, 1.004, 1.004);
      ctx.fill('nonzero'); ctx.restore();
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (isC(x, y)) {
        [[0, -1, x, y, 1, .12], [0, 1, x, y + .88, 1, .12], [-1, 0, x, y, .12, 1], [1, 0, x + .88, y, .12, 1]].forEach(function (s) {
          if (isC(x + s[0], y + s[1])) return;
          ctx.fillStyle = rgb(ce); ctx.fillRect(s[2], s[3], s[4], s[5]);
          ctx.fillStyle = rgb(ce, .75); if (s[4] === 1) ctx.fillRect(s[2], s[1] < 0 ? s[3] : s[3] + .1, 1, .02); else ctx.fillRect(s[0] < 0 ? s[2] : s[2] + .1, s[3], .02, 1);
        });
      }
    }
    /* 壁の影 */
    /* 地図の外も壁として影を作る（端で影が丸く切れないように、2マス広く描いて真ん中を使う） */
    var sc = document.createElement('canvas'); sc.width = (W + 4) * 12; sc.height = (H + 4) * 12; var sx = sc.getContext('2d'); sx.scale(12, 12); sx.translate(2, 2); sx.fillStyle = '#000';
    for (y = -2; y < H + 2; y++) for (x = -2; x < W + 2; x++) if (isW(x, y) && !(y >= 0 && y < H && x < 0 && !isW(0, y)) && !(y >= 0 && y < H && x >= W && !isW(W - 1, y))) sx.fillRect(x, y + .35, 1, 1);
    ctx.save(); ctx.globalAlpha = .5; ctx.filter = 'blur(' + Math.max(2, Math.round(TX * .28)) + 'px)'; ctx.drawImage(sc, -2, -2, W + 4, H + 4); ctx.restore();
    /* 天井のかたまり */
    var wt = avg(walltop, walltop.width * .2, walltop.height * .2, walltop.width * .6, walltop.height * .5) || [90, 70, 130];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (isW(x, y) && isW(x, y + 1)) { ctx.fillStyle = rgb(wt, .42 + (fbm(x * .4, y * .4) - .5) * .25); ctx.fillRect(x - .002, y - .002, 1.004, 1.004); }
    ctx.save(); ctx.globalAlpha = .2; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = pat(ctx, walltop, 1.6);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (isW(x, y) && isW(x, y + 1)) ctx.fillRect(x - .002, y - .002, 1.004, 1.004);
    ctx.restore();
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (isW(x, y) && isW(x, y + 1)) {
      if (!isW(x - 1, y)) { ctx.fillStyle = rgb(wt, .9); ctx.fillRect(x, y, .12, 1); }
      if (!isW(x + 1, y)) { ctx.fillStyle = rgb(wt, .9); ctx.fillRect(x + .88, y, .12, 1); }
    }
    /* 壁の面 */
    var wp = pat(ctx, wall, 2);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (isW(x, y) && !isW(x, y + 1)) {
      ctx.fillStyle = wp; ctx.fillRect(x - .001, y + .22, 1.002, .78);
      ctx.fillStyle = rgb(wt, .9); ctx.fillRect(x - .001, y, 1.002, .24);
      ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x, y + .2, 1, .035);
      var gd = ctx.createLinearGradient(0, y + .22, 0, y + 1); gd.addColorStop(0, 'rgba(10,0,30,.25)'); gd.addColorStop(.3, 'rgba(10,0,30,0)'); gd.addColorStop(1, 'rgba(10,0,30,.35)'); ctx.fillStyle = gd; ctx.fillRect(x, y + .22, 1, .78);
      if (isW(x - 1, y) && isW(x - 1, y + 1)) { var s1 = ctx.createLinearGradient(x, 0, x + .35, 0); s1.addColorStop(0, 'rgba(10,0,30,.45)'); s1.addColorStop(1, 'rgba(10,0,30,0)'); ctx.fillStyle = s1; ctx.fillRect(x, y + .22, .35, .78); }
      if (isW(x + 1, y) && isW(x + 1, y + 1)) { var s2 = ctx.createLinearGradient(x + 1, 0, x + .65, 0); s2.addColorStop(0, 'rgba(10,0,30,.45)'); s2.addColorStop(1, 'rgba(10,0,30,0)'); ctx.fillStyle = s2; ctx.fillRect(x + .65, y + .22, .35, .78); }
    }
    /* 暗さと灯り（床の明るさに合わせる：もとから暗い床はあまり暗くしない） */
    var fl = avg(base, 0, 0, base.width, base.height) || [120, 120, 120], lum = (fl[0] + fl[1] + fl[2]) / 3, dark = clamp((lum - 60) / 300, .08, .3);
    var lc = document.createElement('canvas'); lc.width = W * 6; lc.height = H * 6; var lx = lc.getContext('2d'); lx.scale(6, 6);
    lx.fillStyle = 'rgba(14,6,40,' + dark + ')'; lx.fillRect(0, 0, W, H); lx.globalCompositeOperation = 'destination-out';
    (o.torches || []).map(function (t) { return [t[0] + .5, t[1] + 1.1, 3.6]; }).concat(o.lights || []).forEach(function (t) {
      var gr = lx.createRadialGradient(t[0], t[1], 0, t[0], t[1], t[2]); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.5, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = gr; lx.beginPath(); lx.arc(t[0], t[1], t[2], 0, 7); lx.fill(); });
    ctx.drawImage(lc, 0, 0, W, H);
    /* 霧 */
    var fog = null, fogBox = null;
    if (fogRect) {
      var fc = FOGC[o.unit] || [205, 195, 250], ox = fogRect[0] - 2.5, oy = fogRect[1] - 2, fw = fogRect[2] - fogRect[0] + 5, fh = fogRect[3] - fogRect[1] + 4;
      fogBox = [ox, oy, fw, fh]; fog = [0, 1].map(function (li) {
        var f = document.createElement('canvas'); f.width = Math.round(fw * 10); f.height = Math.round(fh * 10); var fx = f.getContext('2d'), fd = fx.createImageData(f.width, f.height);
        for (var j = 0; j < f.height; j++) for (var i = 0; i < f.width; i++) { var X2 = ox + i / 10, Y2 = oy + j / 10;
          var inside = Math.min(X2 - fogRect[0], fogRect[2] + 1 - X2, Y2 - fogRect[1], fogRect[3] + 1 - Y2);
          var m = clamp(inside / 1.6 + .5, 0, 1) + (fbm(X2 * .55 + li * 9, Y2 * .55) - .5) * .9, cl = fbm(X2 * .45 + li * 20, Y2 * .45 + 5);
          var al = sm(clamp((m - .2) / .6, 0, 1)) * (.2 + cl * .5) * (li ? .38 : .46), q = (j * f.width + i) * 4;
          fd.data[q] = fc[0]; fd.data[q + 1] = fc[1]; fd.data[q + 2] = fc[2]; fd.data[q + 3] = al * 255; }
        fx.putImageData(fd, 0, 0); return f; });
    }
    dungeonArt.lastMs = Math.round(performance.now() - t0);
    return { ground: cv, fog: fog, fogBox: fogBox };
  });
}
dungeonArt.lastMs = 0;
/* 壁の床に面したマスから、たいまつの場所を選ぶ（ソロのエリア用。部屋ごとにまばらに） */
export function autoTorches(g, wall, avoid) {
  var out = [];
  g.forEach(function (r, y) { r.forEach(function (c, x) { var below = g[y + 1] && g[y + 1][x];
    if (wall(c) && below !== undefined && !wall(below) && !(avoid && avoid(below)) && (x * 7 + y * 3) % 4 === 0) out.push([x, y]); }); });
  return out;
}
