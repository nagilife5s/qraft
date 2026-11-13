/*
 * リカリア・チーム戦の画面の部品（生徒の rikaria-play.html と先生の rikaria-host.html で共通）。
 * 地図（ソロのフィールドと同じタイル）・技のエフェクト（採用したエフェクト画像＋衝撃の輪・火花・カットイン）・帯の表示。
 */
import { propImg, zakoImg, guardImg, fieldImg, effectImg, heroImg, spiritImg } from './rikaria-data.js';
import { buildMap } from './rikaria-engine.js';

export var MAP = buildMap();
export function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }

/* 物質（工房）は前からある小物の絵を使う。ほかの単元は採用した小物（1〜8） */
var OLD_PROPS = { 1: ['prop-shelf', 1.4], 2: ['prop-bookshelf', 1.8], 3: ['prop-labtable', 1.15], 4: ['prop-pipes', 1.2], 5: ['prop-cauldron', 1.15], 6: ['prop-crystal', 1.2], 7: ['prop-sacks', 1.1], 8: ['prop-barrel', 1.1] };
var TILE_CLS = { k: 't-floor', '#': 't-wall', c: 't-carpet', '<': 't-exitw', D: 't-carpet' };

/* 壁のたいまつ（下が床の壁のマス）。絵 img/rikaria/prop/torch.webp が届いたら絵を使い、無いあいだはCSSの炎 */
var TORCHES = [[15, 1], [21, 2], [2, 7], [5, 7], [10, 10], [21, 10], [24, 10], [29, 4], [33, 4], [14, 20], [20, 20]].filter(function (p) {
  var g = MAP.g; return g[p[1]] && g[p[1]][p[0]] === '#' && g[p[1] + 1] && g[p[1] + 1][p[0]] !== '#' && g[p[1] + 1][p[0]] !== undefined;
});
var TORCH_IMG = 'img/rikaria/prop/torch.webp', torchOk = false;
if (typeof Image !== 'undefined') { var tp = new Image(); tp.onload = function () { torchOk = true; document.querySelectorAll('.torch:not(.pic)').forEach(function (t) { t.classList.add('pic'); t.insertAdjacentHTML('afterbegin', '<img alt="" src="' + TORCH_IMG + '">'); }); }; tp.src = TORCH_IMG; }
function dirOf(d) { return d === 'left' || d === 'right' ? 'right' : (d || 'down'); }
/* リーダーの後ろを一列で歩く班員（gv.mem の順。リーダーは除く） */
function followers(gv, lead) {
  var ids = Object.keys(gv.mem || {}).filter(function (id) { return !lead || id !== lead.id; });
  return (gv.tr || []).slice(0, ids.length).map(function (t, i) { var m = gv.mem[ids[i]]; return { x: t[0], y: t[1], dir: t[2], j: m.j, lk: m.lk }; });
}
/* 精霊使いの横に浮かぶ、いま切りかえている精霊（精霊使いでなければ空） */
export function spiritHtml(m) { return m && m.j === 'summoner' && !m.dn ? '<img class="spirit" alt="" data-el="' + esc(m.el || 'fire') + '" src="' + spiritImg(m.el) + '">' : ''; }

/* 床・壁・じゅうたんは単元ごとの絵（img/rikaria/tile/<単元>-<種類>.webp。2026-11-13）。
   床の絵は石4×4個で1枚なので、4マス四方に1枚を敷く。壁は上の面（walltop）と手前の面（wall。2マスに1枚）。
   じゅうたんは、たての通路はそのまま、よこの通路は90度回した絵（carpetv） */
function tileBg(U, cls, x, y, ts) {
  if (!U || !U.id) return '';
  var b = 'img/rikaria/tile/' + U.id + '-', f = function (n, size, px, py) { return ";background:url('" + b + n + ".webp') " + (-px) + 'px ' + (-py) + 'px / ' + size + 'px ' + size + 'px'; };
  if (cls.indexOf('t-floor') === 0) return f('floor', ts * 4, (x % 4) * ts, (y % 4) * ts);
  if (cls.indexOf('t-wall') === 0) return cls.indexOf(' top') > 0 ? f('walltop', ts, 0, 0) : f('wall', ts * 2, (x % 2) * ts, 0);
  if (cls.indexOf('t-carpet') === 0) return f(cls.indexOf(' v') > 0 ? 'carpet' : 'carpetv', ts, 0, 0);
  return '';
}

/* 地図を描く。gv＝班の画面データ、U＝単元、lead＝リーダー {id, j, lk, name} */
export function drawField(mapEl, ts, gv, U, lead, mini) {
  var g = MAP.g, W = MAP.w, H = MAP.h, open = gv.wins >= 2;
  function box(x, y, w, h) { return 'left:' + x * ts + 'px;top:' + y * ts + 'px;width:' + (w || 1) * ts + 'px;height:' + (h || 1) * ts + 'px'; }
  mapEl.style.width = W * ts + 'px'; mapEl.style.height = H * ts + 'px'; mapEl.style.fontSize = ts * .5 + 'px';
  var h = '', props = '';
  g.forEach(function (r, y) { r.forEach(function (c, x) {
    var pi = '12345678'.indexOf(c) + 1, cls = pi ? 't-floor' : (c === 'D' && !open ? 't-wall' : TILE_CLS[c]);
    if (cls === 't-floor' && (x + y) % 2) cls += ' alt';
    if (c === '#' && (g[y + 1] == null || g[y + 1][x] === '#')) cls += ' top';
    if ((c === 'c' || c === 'D') && g[y - 1] && g[y - 1][x] === 'c' && g[y + 1] && g[y + 1][x] === 'c') cls += ' v';
    var tb = tileBg(U, cls, x, y, ts);
    h += '<div class="tile ' + cls + (tb ? ' tx' : '') + '" style="' + box(x, y) + tb + '"></div>';
    if (pi) {
      var src = propImg(U, pi), s = 1.25;
      if (!src) { src = 'img/quest/' + OLD_PROPS[pi][0] + '.webp'; s = OLD_PROPS[pi][1]; }
      props += '<img class="prop" alt="" src="' + src + '" style="left:' + (x + .5 - s / 2) * ts + 'px;top:' + (y + 1 - s) * ts + 'px;width:' + s * ts + 'px;height:' + s * ts + 'px;z-index:' + (y * 10 + 4) + '">';
    }
  }); });
  h += props;
  TORCHES.forEach(function (t) { h += '<div class="torch' + (torchOk ? ' pic' : '') + '" style="' + box(t[0], t[1]) + '">' + (torchOk ? '<img alt="" src="' + TORCH_IMG + '">' : '') + '<i></i></div>'; });
  if (!open) h += '<div class="door-lock" style="' + box(MAP.door[0], MAP.door[1]) + '">🔒</div>';
  else h += '<div class="door-glow" style="' + box(MAP.door[0], MAP.door[1]) + '"></div>';   /* 扉が開いたら光らせて、行き先を知らせる */
  var gd = MAP.guard;
  h += '<div class="mob boss" style="' + box(gd[0] - .5, gd[1] - 1, 2, 2) + ';z-index:' + (gd[1] * 10 + 6) + '"><img alt="" src="' + guardImg(U, Math.min(4, gv.fl)) + '" style="scale:-1 1"></div>';
  h += (gv.mobs || []).map(function (m, i) { return '<div class="mob" data-i="' + i + '" style="' + box(m[0], m[1]) + ';z-index:' + (m[1] * 10 + 5) + '"><img alt="" src="' + zakoImg(U, m[2]) + '"></div>'; }).join('');
  var p = gv.pos || MAP.start;
  h += followers(gv, lead).map(function (f, i) { return '<div class="unit fol' + (f.dir === 'left' ? ' left' : '') + '" data-f="' + i + '" style="' + box(f.x, f.y) + ';z-index:' + (f.y * 10 + 8) + '"><img class="hero" alt="" src="' + fieldImg(f.j, f.lk, dirOf(f.dir)) + '"></div>'; }).join('');
  h += '<div class="unit leader' + (gv.dir === 'left' ? ' left' : '') + '" data-me="1" style="' + box(p[0], p[1]) + ';z-index:' + (p[1] * 10 + 9) + '">' + (mini || !lead ? '' : '<span class="nm">' + esc(lead.name) + '</span>') +
       '<img class="hero" alt="" src="' + (lead ? fieldImg(lead.j, lead.lk, gv.dir === 'left' || gv.dir === 'right' ? 'right' : gv.dir) : 'img/quest/hero-warrior-a.webp') + '"></div>';
  mapEl.innerHTML = h;
}
/* 動いたところだけ直す（リーダーと魔物） */
export function moveField(mapEl, ts, gv, lead) {
  var u = mapEl.querySelector('[data-me]'), p = gv.pos;
  if (u && p) {
    u.style.left = p[0] * ts + 'px'; u.style.top = p[1] * ts + 'px'; u.style.zIndex = p[1] * 10 + 9; u.classList.toggle('left', gv.dir === 'left');
    var im = u.querySelector('img'); if (lead) { var src = fieldImg(lead.j, lead.lk, gv.dir === 'left' || gv.dir === 'right' ? 'right' : gv.dir); if (im.getAttribute('src') !== src) im.src = src; }
    u.classList.add('walk'); clearTimeout(u._t); u._t = setTimeout(function () { u.classList.remove('walk'); }, 300);
  }
  var fs = followers(gv, lead), fe = mapEl.querySelectorAll('.unit.fol');
  if (fe.length !== fs.length) return false;   /* 列の人数が変わったら描き直す */
  fs.forEach(function (f, i) {
    var e = fe[i]; e.style.left = f.x * ts + 'px'; e.style.top = f.y * ts + 'px'; e.style.zIndex = f.y * 10 + 8; e.classList.toggle('left', f.dir === 'left');
    var fi = e.querySelector('img'), fsrc = fieldImg(f.j, f.lk, dirOf(f.dir)); if (fi.getAttribute('src') !== fsrc) fi.src = fsrc;
    e.classList.add('walk'); clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('walk'); }, 300);
  });
  var mobs = mapEl.querySelectorAll('.mob[data-i]');
  if (mobs.length !== (gv.mobs || []).length) return false;   /* 数が変わったら描き直す */
  (gv.mobs || []).forEach(function (m, i) { var e = mobs[i]; e.style.left = m[0] * ts + 'px'; e.style.top = m[1] * ts + 'px'; e.style.zIndex = m[1] * 10 + 5; });
  return true;
}
export function cameraOf(wrapEl, mapEl, ts, pos) {
  var r = wrapEl.getBoundingClientRect(), W = MAP.w * ts, H = MAP.h * ts, p = pos || MAP.start;
  var cx = Math.min(0, Math.max(r.width - W, r.width / 2 - (p[0] + .5) * ts)), cy = Math.min(0, Math.max(r.height - H, r.height / 2 - (p[1] + .5) * ts));
  mapEl.style.transform = 'translate(' + (W < r.width ? (r.width - W) / 2 : cx) + 'px,' + (H < r.height ? (r.height - H) / 2 : cy) + 'px)';
}
/* 地図のマス（クリックした場所） */
export function cellAt(mapEl, ts, e) { var r = mapEl.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / ts), Math.floor((e.clientY - r.top) / ts)]; }

export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
export function hero(m) { return heroImg(m.j, m.lk); }

/* ------------------------------------------------------------ エフェクト */
var COL = { '01': '#cfeaff', '02': '#ff7a2a', '03': '#9fe4ff', '04': '#fff36a', '05': '#8af0b0', '06': '#5fb6ff', '07': '#c9915a', '08': '#fffbe0', '09': '#fff3b8', '10': '#9dffb8',
  '11': '#9fd8ff', '12': '#ffe9a0', '13': '#ffe9a0', '14': '#ffb36a', '15': '#a8f0ff', '16': '#b07cff', '17': '#a07cff', '18': '#fff3b8', '19': '#ff8a3c', '20': '#ffd23f',
  '21': '#fffbe0', '22': '#e8ecff', '23': '#7cffd8', '24': '#ffd23f', '25': '#ffffff' };
/* ダメージ（ev: {d, crit, weak, n, fx, ult, guard, dot}）。who＝技を使った人の呼び名 */
export function dmgFx(enemyEl, arenaEl, rootEl, ev, who) {
  if (!enemyEl) return;
  var d = el('div', 'dmg' + (ev.guard ? ' guard' : ev.crit ? ' crit' : ''));
  d.innerHTML = ev.guard ? 'バリア！' : '<small>' + esc(who || '') + (ev.n ? 'の' + esc(ev.n) : '') + (ev.weak ? ' 苦手！' : '') + '</small>' + ev.d;
  enemyEl.appendChild(d); setTimeout(function () { d.remove(); }, 1100);
  if (ev.guard) return;
  var skill = !!ev.n && ev.n !== 'カウンター', fx = ev.fx || (ev.dot ? '16' : '01'), c = COL[fx] || '#fff';
  if (skill || ev.crit) {   /* 採用したエフェクト画像を、黒を消して重ねる */
    var im = el('img', 'fximg' + (ev.ult ? ' ult' : '')); im.src = effectImg(fx); im.alt = '';
    enemyEl.appendChild(im); setTimeout(function () { im.remove(); }, 900);
  }
  var hf = el('div', 'hitflash'); enemyEl.appendChild(hf); setTimeout(function () { hf.remove(); }, 400);
  [0, skill ? 120 : -1, ev.ult ? 240 : -1].forEach(function (t) { if (t < 0) return; setTimeout(function () { var r = el('div', 'ring' + (skill ? ' big' : '')); r.style.setProperty('--rc', c); r.style.setProperty('--rs', ev.ult ? 6 : skill ? 4.2 : 2.6); enemyEl.appendChild(r); setTimeout(function () { r.remove(); }, 900); }, t); });
  var n = ev.ult ? 30 : skill ? 18 : 8;
  for (var i = 0; i < n; i++) {
    var pt = el('div', 'pt'), ang = Math.random() * Math.PI * 2, dist = (ev.ult ? 9 : skill ? 6.5 : 4) * (0.5 + Math.random());
    pt.style.setProperty('--dx', Math.cos(ang) * dist + 'em'); pt.style.setProperty('--dy', Math.sin(ang) * dist + 'em'); pt.style.setProperty('--pc', i % 3 ? c : '#fff'); pt.style.setProperty('--pd', (0.5 + Math.random() * .5) + 's');
    enemyEl.appendChild(pt); (function (q) { setTimeout(function () { q.remove(); }, 1100); })(pt);
  }
  if (arenaEl) { arenaEl.classList.remove('quake', 'big'); void arenaEl.offsetWidth; if (skill || ev.crit) arenaEl.classList.add('quake'); if (ev.ult) arenaEl.classList.add('big'); }
  if (skill && arenaEl) { var cu = el('div', 'cutin' + (ev.ult ? ' ult' : '')); cu.innerHTML = '<small>' + esc(who || '') + 'の</small>' + esc(ev.n) + (ev.ult ? '！！' : '！'); if (!ev.ult) cu.style.setProperty('--cg', c); arenaEl.appendChild(cu); setTimeout(function () { cu.remove(); }, 1000); }
  if (ev.ult && rootEl) { var w = el('div', 'ultflash'); rootEl.appendChild(w); setTimeout(function () { w.remove(); }, 700); }
  enemyEl.classList.remove('hit'); void enemyEl.offsetWidth; enemyEl.classList.add('hit');
}
/* 回復・強化など、敵に当たらない技（自分たちの上に光） */
export function supportFx(hostEl, fx, name, who, ult) {
  if (!hostEl) return;
  var im = el('img', 'fximg team' + (ult ? ' ult' : '')); im.src = effectImg(fx || '10'); im.alt = ''; hostEl.appendChild(im); setTimeout(function () { im.remove(); }, 1000);
  var cu = el('div', 'cutin' + (ult ? ' ult' : '')); cu.innerHTML = '<small>' + esc(who || '') + 'の</small>' + esc(name) + '！'; cu.style.setProperty('--cg', COL[fx] || '#9dffb8'); hostEl.appendChild(cu); setTimeout(function () { cu.remove(); }, 1000);
}
export function ovban(host, s, big) { if (!host || !s) return; host.querySelectorAll(':scope > .ovban').forEach(function (o) { o.remove(); }); var b = el('div', 'ovban' + (big ? ' big' : ''), s); host.appendChild(b); setTimeout(function () { b.remove(); }, 2000); }
export function redflash(host) { var f = el('div', 'redflash'); host.appendChild(f); setTimeout(function () { f.remove(); }, 500); }
