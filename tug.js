/*
 * チーム綱引き（ミニゲーム）のエンジン（通信なし）。
 * ・グループどうしが2チームで1本の綱を引き合う。連打ではなく「かけ声のリズム」に合わせて押す。
 * ・チームの多くがそろって押せると「息ぴったり！」で力が1.5倍。チームの中はみんな味方。
 * ・タイミングの判定は生徒の端末で行い、結果（perfect / good / miss）だけを送る想定。
 */
export var RULE = {
  length: 60000,      /* 60秒（ミリ秒） */
  beat: 900,          /* かけ声の間かく */
  beatFever: 650,     /* ラスト10秒は速くなる */
  fever: 10000,
  perfect: 100,       /* ±0.1秒で PERFECT */
  good: 220,          /* ±0.22秒で GOOD */
  syncRate: 0.7,      /* チームの7割がそろうと息ぴったり */
  syncBonus: 1.5,
  pull: 0.1,          /* 1回のかけ声で動く量（1人あたりの平均の力 1.0 のとき） */
  maxDiff: 0.6,       /* 1回で動く差の上限（力の差が大きくても、15秒くらいは勝負が続くように） */
  slip: 0.25,         /* タイミング外れの空ぶりは、その回の自分の力を 0.25 減らす */
  ptsPerfect: 10, ptsGood: 5, ptsWin: 30
};
export var PCOL = ['#ff5a5a', '#35a7ff'];

/* a, b = 各チームの人数 */
export function newMatch(a, b) {
  return { t: 0, pos: 0, over: false, win: -1, beatNo: 0, nextBeat: beatAt(1), teams: [mk(a), mk(b)], ev: [], evq: [] };
}
function mk(n) { var t = { players: [], sync: 0, last: 0 }; for (var i = 0; i < n; i++) t.players.push({ score: 0, perfect: 0, good: 0, pose: -9999, fb: null }); return t; }
/* n 回目のかけ声の時刻（ミリ秒）。先生の画面と生徒の端末で、同じ式で計算する */
export function beatAt(n) { var t = 1500; for (var k = 1; k < n; k++) t += t > RULE.length - RULE.fever ? RULE.beatFever : RULE.beat; return t; }
export function beatLen(m) { return m.t > RULE.length - RULE.fever ? RULE.beatFever : RULE.beat; }
/* 時刻 t に押したときの判定：いちばん近いかけ声の番号と、p / g / m */
export function judge(t) {
  var n = 1; while (beatAt(n + 1) < t) n++;
  var d0 = Math.abs(t - beatAt(n)), d1 = Math.abs(t - beatAt(n + 1)), beat = d1 < d0 ? n + 1 : n, d = Math.min(d0, d1);
  return { beat: beat, res: d <= RULE.perfect ? 'p' : d <= RULE.good ? 'g' : 'm' };
}
export var RES = ['', 'p', 'g', 'm'];   /* 通信では 1 / 2 / 3 にする */

/* 押した結果を記録する（先生の画面では、生徒の端末から届いた結果をここへ入れる） */
export function setTap(m, side, i, beat, res) {
  if (m.over) return;
  var p = m.teams[side] && m.teams[side].players[i]; if (!p) return;
  if (p.tapBeat === beat || beat <= m.beatNo) return;   /* 1回のかけ声には1回だけ。締めたあとの分は数えない */
  p.tapBeat = beat; p.pend = { beat: beat, res: res };
  p.fb = { res: res, t: m.t }; p.pose = m.t;
}
/* その場で押す（先生チームのボットなど） */
export function tap(m, side, i) { var j = judge(m.t); setTap(m, side, i, j.beat, j.res); }

/* 時刻を t ミリ秒にする。かけ声の GOOD の幅をすぎたら、その回の力を計算する */
export function stepTo(m, t) {
  m.ev = [];
  if (m.over) return;
  m.t = t;
  while (m.t >= m.nextBeat + RULE.good) {
    m.beatNo++;
    var force = m.teams.map(function (tm, side) {
      var sum = 0, hit = 0;
      tm.players.forEach(function (p) {
        var r = p.pend && p.pend.beat === m.beatNo ? p.pend.res : null;
        if (r === 'p') { sum += 1; hit++; p.score += RULE.ptsPerfect; p.perfect++; }
        else if (r === 'g') { sum += .6; hit++; p.score += RULE.ptsGood; p.good++; }
        else if (r === 'm') sum -= RULE.slip;
      });
      var n = tm.players.length || 1, sync = hit / n >= RULE.syncRate;
      tm.last = Math.max(0, sum) / n * (sync ? RULE.syncBonus : 1);
      if (sync) emit(m, { k: 'sync', side: side });
      return tm.last;
    });
    m.pos += Math.max(-RULE.maxDiff, Math.min(RULE.maxDiff, force[1] - force[0])) * RULE.pull;   /* pos < 0：左（赤）が引いている */
    emit(m, { k: 'beat', no: m.beatNo });
    m.nextBeat = beatAt(m.beatNo + 1);
    if (Math.abs(m.pos) >= 1) { finish(m, m.pos < 0 ? 0 : 1); return; }
  }
  if (m.t >= RULE.length) finish(m, m.pos < 0 ? 0 : m.pos > 0 ? 1 : -1);
}
export function step(m, dt) { stepTo(m, m.t + dt); }
function emit(m, e) { m.ev.push(e); (m.evq = m.evq || []).push(e); }
function finish(m, w) {
  m.over = true; m.win = w; m.pos = Math.max(-1, Math.min(1, m.pos));
  if (w >= 0) m.teams[w].players.forEach(function (p) { p.score += RULE.ptsWin; });
  emit(m, { k: 'end', win: w });
}

/* ====================================================================
   描画
   ==================================================================== */
var SPR = {};
function sprite(path) {
  if (SPR[path] === undefined) { var im = new Image(); im.src = path; SPR[path] = im; }
  var im2 = SPR[path]; return im2.complete && im2.naturalWidth ? im2 : null;
}
export var ANIMAL_NAMES = ['fox', 'panda', 'rabbit', 'bear', 'tiger', 'frog', 'monkey', 'penguin', 'lion', 'cow', 'pig', 'koala', 'hamster', 'unicorn', 'octopus', 'owl', 'dog', 'cat', 'chick', 'raccoon'];
var ACC_NAMES = ['', 'tophat', 'crown', 'bow', 'cap', 'gradcap', 'santa', 'headphones', 'glasses', 'sunglasses', 'goggles', 'mask'];
function putSprite(ctx, im, cx, baseY, h, flip) { var w = h * im.naturalWidth / im.naturalHeight; ctx.save(); ctx.translate(cx, 0); if (flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, baseY - h, w, h); ctx.restore(); }
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* opt: chars[side][i], accs[side][i], names[side][i], me: {side, i}, labels: [チーム名2つ], big: 生徒の画面ならtrue（かけ声の輪を出す） */
export function draw(ctx, m, w, h, opt) {
  opt = opt || {};
  var now = performance.now(), u = w / 20;
  m.fx = m.fx || [];
  (m.evq || []).forEach(function (e) {
    if (e.k === 'sync') m.fx.push({ k: 't', side: e.side, text: '息ぴったり！', t0: now, life: 700 });
    if (e.k === 'beat') m.fx.push({ k: 'beat', t0: now, life: 300 });
  });
  m.evq = [];
  /* 空と運動場 */
  var sk = ctx.createLinearGradient(0, 0, 0, h * .55); sk.addColorStop(0, '#7cc8ff'); sk.addColorStop(1, '#d6f0ff');
  ctx.fillStyle = sk; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; [[3, .12], [11, .08], [16.5, .16]].forEach(function (q) { ctx.beginPath(); ctx.arc(q[0] * u, q[1] * h, u * .5, 0, 6.283); ctx.arc((q[0] + .6) * u, q[1] * h - u * .15, u * .6, 0, 6.283); ctx.arc((q[0] + 1.2) * u, q[1] * h, u * .45, 0, 6.283); ctx.fill(); });
  /* 観客席のフェンスと旗 */
  ctx.fillStyle = '#9fd18a'; ctx.fillRect(0, h * .42, w, h * .1);
  for (var k = 0; k < 20; k++) { ctx.fillStyle = ['#ff5a5a', '#ffd23f', '#35a7ff', '#3ddc84'][k % 4]; ctx.beginPath(); ctx.moveTo(k * u, h * .3); ctx.lineTo(k * u + u * .5, h * .3 + u * .25); ctx.lineTo(k * u + u, h * .3); ctx.fill(); }
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h * .3); ctx.lineTo(w, h * .3); ctx.stroke();
  var gr = ctx.createLinearGradient(0, h * .5, 0, h); gr.addColorStop(0, '#d9b98a'); gr.addColorStop(1, '#c49a62');
  ctx.fillStyle = gr; ctx.fillRect(0, h * .5, w, h * .5);
  /* 中央線と、勝ちになる線 */
  var gy = h * .78, cx0 = w / 2, span = w * .14;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, u * .12); ctx.beginPath(); ctx.moveTo(cx0, h * .52); ctx.lineTo(cx0, h * .98); ctx.stroke();
  [-1, 1].forEach(function (s) { ctx.strokeStyle = s < 0 ? 'rgba(255,90,90,.8)' : 'rgba(53,167,255,.8)'; ctx.setLineDash([u * .3, u * .2]); ctx.beginPath(); ctx.moveTo(cx0 + s * span, h * .52); ctx.lineTo(cx0 + s * span, h * .98); ctx.stroke(); ctx.setLineDash([]); });

  /* 綱の位置（なめらかに） */
  m.vpos = m.vpos === undefined ? m.pos : m.vpos + (m.pos - m.vpos) * .15;
  var off = m.vpos * span, ry = gy - u * 1.0;
  /* 綱 */
  ctx.strokeStyle = '#b07a3c'; ctx.lineWidth = u * .28; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(u * .3, ry + u * .1); ctx.quadraticCurveTo(cx0 + off, ry + u * .25, w - u * .3, ry + u * .1); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,180,.6)'; ctx.lineWidth = u * .07; ctx.setLineDash([u * .25, u * .25]); ctx.beginPath(); ctx.moveTo(u * .3, ry + u * .05); ctx.quadraticCurveTo(cx0 + off, ry + u * .2, w - u * .3, ry + u * .05); ctx.stroke(); ctx.setLineDash([]);
  /* まん中の旗 */
  var fx = cx0 + off, fy = ry + u * .18;
  ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(2, u * .06); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + u * 1.1); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(fx, fy + u * .3); ctx.lineTo(fx + u * .6, fy + u * .55); ctx.lineTo(fx, fy + u * .8); ctx.fill();

  /* チーム：左が赤（右を向く）、右が青（左を向く）。かけ声でいっせいに後ろへのけぞる */
  [0, 1].forEach(function (side) {
    var tm = m.teams[side], n = tm.players.length, dir = side ? 1 : -1;
    tm.players.forEach(function (p, i) {
      var base = cx0 + off + dir * (u * 1.3 + i * u * 1.0), lean = 0;
      var since = m.t - (p.pose || -9999); if (since >= 0 && since < 350) lean = Math.sin(since / 350 * Math.PI);
      var x = base + dir * lean * u * .25, y = gy;
      ctx.fillStyle = 'rgba(80,50,20,.25)'; ctx.beginPath(); ctx.ellipse(x, y + u * .05, u * .5, u * .12, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = PCOL[side]; ctx.lineWidth = Math.max(2, u * .1); ctx.beginPath(); ctx.ellipse(x, y + u * .05, u * .48, u * .14, 0, 0, 6.283); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.rotate(dir * (.12 + lean * .25));
      var ai = opt.chars ? opt.chars[side][i] : i + side * 6, ps = sprite('img/robot/animal-' + ANIMAL_NAMES[ai % 20] + '.webp');
      if (ps) putSprite(ctx, ps, 0, 0, u * 1.5, side === 1); else { ctx.font = (u * 1.2) + 'px serif'; ctx.textAlign = 'center'; ctx.fillText('🐻', 0, -u * .6); }
      var ak = opt.accs ? opt.accs[side][i] : 0, as = ak ? sprite('img/robot/acc-' + ACC_NAMES[ak] + '.webp') : null;
      if (as) { var face = ak >= 8; putSprite(ctx, as, -dir * u * .04, face ? -u * .62 : -u * 1.02, u * (face ? .4 : .55), side === 1); }
      /* はちまき */
      ctx.fillStyle = PCOL[side]; round(ctx, -u * .42, -u * 1.08, u * .84, u * .14, u * .07); ctx.fill();
      ctx.restore();
      /* 自分 */
      var isMe = opt.me && opt.me.side === side && opt.me.i === i;
      if (isMe) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - u * 1.85); ctx.lineTo(x - u * .2, y - u * 2.15); ctx.lineTo(x + u * .2, y - u * 2.15); ctx.fill(); ctx.strokeStyle = '#1d1630'; ctx.lineWidth = 2; ctx.stroke(); }
      if (opt.names && opt.names[side][i] && u > 22) {
        ctx.font = '800 ' + Math.round(u * .32) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; var tw = ctx.measureText(opt.names[side][i]).width + u * .3;
        ctx.fillStyle = PCOL[side]; round(ctx, x - tw / 2, y + u * .25, tw, u * .4, u * .2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(opt.names[side][i], x, y + u * .45);
      }
      /* PERFECT / GOOD / MISS */
      if (p.fb && m.t - p.fb.t < 600 && opt.big) {
        var k2 = (m.t - p.fb.t) / 600, txt = p.fb.res === 'p' ? 'PERFECT' : p.fb.res === 'g' ? 'GOOD' : 'MISS', col = p.fb.res === 'p' ? '#ffe14a' : p.fb.res === 'g' ? '#7cf3ff' : '#ff9a9a';
        ctx.globalAlpha = 1 - k2; ctx.font = '900 ' + Math.round(u * (isMe ? .5 : .32)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = u * .1; ctx.strokeStyle = 'rgba(30,20,50,.85)';
        ctx.strokeText(txt, x, y - u * 2.0 - k2 * u * .5); ctx.fillStyle = col; ctx.fillText(txt, x, y - u * 2.0 - k2 * u * .5); ctx.globalAlpha = 1;
      }
    });
  });
  /* 息ぴったり！の文字 */
  m.fx = m.fx.filter(function (f) { return now - f.t0 < f.life; });
  m.fx.forEach(function (f) {
    var k = (now - f.t0) / f.life;
    if (f.k === 't') {
      var tx = f.side ? w * .75 : w * .25, ty = h * .22 - k * u * .6;
      ctx.globalAlpha = 1 - k * k; ctx.font = '900 ' + Math.round(u * .75) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = u * .18; ctx.strokeStyle = PCOL[f.side]; ctx.strokeText(f.text, tx, ty); ctx.fillStyle = '#fff'; ctx.fillText(f.text, tx, ty); ctx.globalAlpha = 1;
    }
  });
  /* チーム名と、どちらが優勢か */
  if (opt.labels) {
    ctx.font = '900 ' + Math.round(u * .5) + 'px sans-serif'; ctx.textBaseline = 'middle';
    [0, 1].forEach(function (s) { var t = opt.labels[s], tw = ctx.measureText(t).width + u * .6, x = s ? w - tw - u * .3 : u * .3; ctx.fillStyle = PCOL[s]; round(ctx, x, u * .3, tw, u * .8, u * .4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(t, x + tw / 2, u * .7); });
  }
  /* かけ声の輪（生徒の画面だけ）。外の輪が縮んで、内の輪に重なった瞬間に押す */
  if (opt.big && !m.over) {
    var bl = beatLen(m), toNext = m.nextBeat - m.t, cx = w / 2, cy = h * .25, r0 = u * 1.0;
    var flash = m.fx.some(function (f) { return f.k === 'beat'; });
    ctx.fillStyle = flash ? 'rgba(255,225,74,.95)' : 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(cx, cy, r0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#1d1630'; ctx.lineWidth = u * .08; ctx.stroke();
    ctx.fillStyle = '#1d1630'; ctx.font = '900 ' + Math.round(u * .55) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.beatNo % 2 ? 'エス！' : 'オー！', cx, cy);
    if (toNext > 0 && toNext < bl) { var rr = r0 + (toNext / bl) * u * 2.2; ctx.strokeStyle = 'rgba(255,90,90,' + (1 - toNext / bl * .6) + ')'; ctx.lineWidth = u * .14; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke(); }
  }
  /* 勝負あり */
  if (m.over) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, w, h);
    var t2 = m.win < 0 ? 'ひきわけ！' : (opt.labels ? opt.labels[m.win] : (m.win ? '青' : '赤')) + ' の勝ち！';
    ctx.font = '900 ' + Math.round(u * 1.2) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = u * .25;
    ctx.strokeStyle = m.win < 0 ? '#666' : PCOL[m.win]; ctx.strokeText(t2, w / 2, h * .4); ctx.fillStyle = '#fff'; ctx.fillText(t2, w / 2, h * .4);
  }
}

/* ====================================================================
   通信用
   ==================================================================== */
export function serialize(m) {
  return JSON.stringify({
    t: Math.round(m.t), x: Math.round(m.pos * 1000) / 1000, n: m.beatNo, o: m.over ? 1 : 0, w: m.win,
    p: m.teams.map(function (tm) { return tm.players.map(function (p) { return [p.score, p.perfect, p.good, p.fb ? RES.indexOf(p.fb.res) : 0, p.fb ? Math.round(p.fb.t) : 0]; }); }),
    e: m.ev.filter(function (e) { return e.k === 'sync'; }).map(function (e) { return e.side; })
  });
}
export function newView() { return { t: 0, pos: 0, over: false, win: -1, beatNo: 0, nextBeat: beatAt(1), teams: [{ players: [] }, { players: [] }], ev: [], evq: [] }; }
export function applyData(v, str) {
  var d = JSON.parse(str);
  v.pos = d.x; v.over = !!d.o; v.win = d.w;
  if (d.n > v.beatNo) { v.beatNo = d.n; v.nextBeat = beatAt(d.n + 1); }
  v.teams = d.p.map(function (arr, s) {
    var old = (v.teams[s] && v.teams[s].players) || [];
    return { players: arr.map(function (a, i) {
      var p = old[i] || { pose: -9999 }; p.score = a[0]; p.perfect = a[1]; p.good = a[2];
      if (a[3] && (!p.fb || p.fb.t !== a[4]) && !p.localFb) { p.fb = { res: RES[a[3]], t: a[4] }; p.pose = a[4]; }
      return p;
    }) };
  });
  d.e.forEach(function (side) { v.evq.push({ k: 'sync', side: side }); });
}
