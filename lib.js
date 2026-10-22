/*
 * Qraft 共通部品（host.html / play.html から読み込む ES モジュール）
 *
 * ・Firebase の初期化と匿名ログイン
 * ・サーバー時刻（端末の時計ずれの影響を受けないため、時間はすべてサーバー時刻で測る）
 * ・スコア式
 * ・見た目まわり：背景の読み込みと切り替え、順位のアニメーション、紙吹雪、QR
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAuth, signInAnonymously, browserSessionPersistence, indexedDBLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, get, update, remove, onValue, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export { ref, set, get, update, remove, onValue, serverTimestamp };

export const app = initializeApp(window.QRAFT_FIREBASE);
/*
 * 通常はブラウザに匿名ユーザーを保存する（再読み込みしても同じ人として戻れる）。
 * ただし同じブラウザの複数タブは同じユーザーになるので、1台で複数人ぶんを試すときは
 * アドレスの末尾に ?sess=1 を付ける。そのタブだけ別のユーザーとして扱う。
 */
var useSession = /[?&]sess=1/.test(location.search);
export const auth = initializeAuth(app, {
  persistence: useSession ? browserSessionPersistence : indexedDBLocalPersistence
});
export const db = getDatabase(app);

/* サーバー時刻 = 端末の時刻 + Firebase が教えてくれるずれ */
let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), function (s) { offset = s.val() || 0; });
export function serverNow() { return Date.now() + offset; }

/*
 * 匿名ログイン。
 * ★authStateReady() を待ってから currentUser を見る。待たずに signInAnonymously
 *   すると、リロードのたびに新しい uid が発行され、再接続（同じ人として戻る）ができない。
 */
export async function signIn() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  try {
    var cred = await signInAnonymously(auth);
    return cred.user;
  } catch (e) {
    throw new Error('匿名ログインに失敗しました（' + (e.code || e.message) +
      '）。Firebase の Authentication で「匿名」が有効か確認してください。');
  }
}

/* 正解のみ 1000 × (1 − 経過 ÷ 制限 ÷ 2)。出題直後=1000点、時間切れ直前=約500点 */
export function calcScore(elapsedMs, limitMs) {
  var r = Math.min(Math.max(elapsedMs, 0), limitMs) / limitMs;
  return Math.round(1000 * (1 - r / 2));
}

/* 選択肢の色と形（Kahoot風）。色だけに頼らないよう形も付ける */
export const CHOICE_STYLE = [
  { shape: '▲', color: '#e21b3c' },
  { shape: '◆', color: '#1368ce' },
  { shape: '●', color: '#ffc00a' },
  { shape: '■', color: '#1fa95b' },
  { shape: '★', color: '#8e44ad' },        /* 5択・6択のとき */
  { shape: '⬢', color: '#e67e22' }
];

export const RESULT_SEC = 8;   /* 正解と分布を見せる秒数 */
export const RANK_SEC = 7;     /* ランキングを見せる秒数（順位が入れ替わる動きを見せるため、少し長め） */

export function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
export function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ====================================================================
   画面まわりの小道具
   ==================================================================== */
export function $(id) { return document.getElementById(id); }
export function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
export function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* OS の「視差効果を減らす」設定の人には、動きを出さない */
export const motionOn = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* 画面を切り替える（.screen のうち、指定した1つだけ表示。表示のたびにCSSの動きが最初から再生される） */
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('on', s.id === id); });
}

/* 時間差のアニメーションの管理（画面が替わるときにまとめて止める） */
var timers = [], rafs = [];
export function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
export function stopAnim() { timers.forEach(clearTimeout); timers = []; rafs.forEach(cancelAnimationFrame); rafs = []; }

export function countUp(node, to, dur, delay, comma) {
  var f = function (v) { node.textContent = comma ? fmt(v) : Math.round(v); };
  if (!motionOn) { f(to); return; }
  f(0);
  later(function () {
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      f(to * e);
      if (k < 1) rafs.push(requestAnimationFrame(step));
    })(t0);
  }, delay);
}

/* 紙吹雪 */
var COLORS = ['#ffd23f', '#ff5fa2', '#35e0ff', '#8bf0b0', '#fff', '#ff9f1c'];
export function confetti(box, n) {
  box.textContent = '';
  if (!motionOn) return;
  for (var i = 0; i < n; i++) {
    var s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%'; s.style.background = COLORS[i % COLORS.length];
    s.style.animationDuration = (3 + Math.random() * 3) + 's'; s.style.animationDelay = (-Math.random() * 6) + 's';
    s.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    box.appendChild(s);
  }
}

/* QR（ライブラリが読めなかったら null を返す。呼び出し側で隠す） */
export function qrSvg(url) {
  try {
    if (typeof window.qrcode !== 'function') return null;
    var q = window.qrcode(0, 'M'); q.addData(url); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) { return null; }
}

/* ====================================================================
   順位のアニメーション
   rows: [{nick, prev, total, from, to, mv}]
     prev/total … この問題の前後の得点  from/to … 表示中の5人の中での前後の位置（0始まり）
     mv … 全体の順位の上下（前の順位 − 今の順位。正なら上がった）
   前の順位で見せる → 得点が増えて棒が伸びる → 追い抜いたカードが持ち上がって入れ替わる → ▲▼の印
   ==================================================================== */
export function buildRank(box, rows, meNick) {
  box.textContent = '';
  var n = rows.length;
  box.style.height = 'calc(3.6em * ' + n + ' - .9em)';
  var max = Math.max.apply(null, rows.map(function (r) { return r.total; })) || 1;

  rows.forEach(function (r) {
    var row = el('div', 'row' + (r.nick === meNick ? ' me' : ''));
    row.innerHTML = '<span class="no"></span><div class="bar2"><i></i><span></span></div><span class="delta"></span><span class="pt"></span><span class="mv"></span>';
    row.querySelector('.bar2 span').textContent = r.nick;
    r.el = row; box.appendChild(row);
  });
  function place(r, idx, pts, w) {
    r.el.style.setProperty('--pos', idx);
    r.el.querySelector('.no').textContent = idx + 1; r.el.dataset.rank = idx + 1;
    r.el.querySelector('.pt').textContent = fmt(pts);
    r.el.querySelector('.bar2 i').style.width = w + '%';
  }
  function mark(r) {
    var mv = r.el.querySelector('.mv'), d = r.mv || 0;
    mv.textContent = d > 0 ? '▲' + d : d < 0 ? '▼' + (-d) : '－';
    mv.className = 'mv show ' + (d > 0 ? 'up' : d < 0 ? 'dn' : 'eq');
  }
  function delta(r) { return r.total - r.prev; }

  if (!motionOn) {
    rows.forEach(function (r) {
      place(r, r.to, r.total, r.total / max * 100); mark(r);
      var dl = r.el.querySelector('.delta'); dl.textContent = delta(r) ? '+' + delta(r) : '';
    });
    return;
  }

  /* ① 前の順位で表示 */
  rows.forEach(function (r) { r.el.style.transition = 'none'; place(r, r.from, r.prev, r.prev / max * 100); });
  void box.offsetWidth; rows.forEach(function (r) { r.el.style.transition = ''; });

  /* ② 得点が増える */
  later(function () {
    rows.forEach(function (r) {
      var dl = r.el.querySelector('.delta'), d = delta(r);
      if (d) { dl.textContent = '+' + d; dl.classList.add('show'); }
      r.el.querySelector('.bar2 i').style.width = (r.total / max * 100) + '%';
      var pt = r.el.querySelector('.pt'), t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3);
        pt.textContent = fmt(r.prev + (r.total - r.prev) * e);
        if (k < 1) rafs.push(requestAnimationFrame(step));
      })(t0);
    });
  }, 900);

  /* ③ 順位が入れ替わる */
  later(function () {
    rows.forEach(function (r) {
      if (r.to < r.from) r.el.classList.add('lift');
      r.el.style.setProperty('--pos', r.to);
    });
    later(function () { rows.forEach(function (r) { r.el.querySelector('.no').textContent = r.to + 1; r.el.dataset.rank = r.to + 1; }); }, 350);
  }, 2400);

  /* ④ 上がった・下がったの印 */
  later(function () {
    rows.forEach(function (r) { r.el.classList.remove('lift'); mark(r); r.el.querySelector('.delta').classList.remove('show'); });
  }, 3500);
}

/* ====================================================================
   背景
   ・ポップ・森・夕やけ は CSS だけで描く。それ以外は画像（img/bg/）。
   ・一覧は img/bg/backgrounds.json（画像の key・名前・暗い膜の濃さ scrim・左右の余白 safe・平均色）。
   ・選ぶのは先生だけ。選んだ key は rooms/<PIN>/state/bg に入り、生徒の画面にも同じ背景が出る。
   ==================================================================== */
var CSS_BGS = {
  pop:    { name: 'ポップ', thumb: 'linear-gradient(160deg,#6a35e8,#2a1280)' },
  forest: { name: '森',     thumb: 'linear-gradient(170deg,#25a862,#062f24)' },
  sunset: { name: '夕やけ', thumb: 'linear-gradient(180deg,#f4605d,#c13584 55%,#4b1d8a)' }
};
var BG_ORDER = ['pop', 'space', 'sea', 'lab', 'forest', 'sunset', 'arcade', 'fantasy', 'safari', 'chalk'];
export var BG_DEFAULT = 'pop';

export async function loadBackgrounds() {
  var man = [];
  try { man = await (await fetch('img/bg/backgrounds.json', { cache: 'no-cache' })).json(); } catch (e) {}
  var by = {}; man.forEach(function (m) { by[m.key] = m; });
  var list = [];
  BG_ORDER.forEach(function (k) {
    if (CSS_BGS[k]) list.push({ key: k, name: CSS_BGS[k].name, thumb: CSS_BGS[k].thumb });
    else if (by[k]) list.push({ key: k, name: by[k].name, img: by[k].file, thumbImg: by[k].thumb, scrim: by[k].scrim, safe: by[k].safe, avg: by[k].avg });
  });
  return list;
}

var currentBg = null;
export function applyBg(key, list, instant) {
  var b = list.filter(function (x) { return x.key === key; })[0] || list[0];
  if (!b || currentBg === b.key) return;
  var de = document.documentElement, app = $('app'), fade = document.querySelector('.bgfade'), deco = document.querySelector('.deco');
  function set() {
    if (b.img) {
      de.dataset.bg = 'image';
      de.style.setProperty('--bgimg', 'linear-gradient(rgba(0,0,0,' + b.scrim + '),rgba(0,0,0,' + b.scrim + ')), url("' + b.img + '")');
      de.style.setProperty('--safe', b.safe + 'cqw');
      ['--bg1', '--bg2', '--bg3'].forEach(function (v) { de.style.setProperty(v, b.avg); });
    } else {
      de.dataset.bg = b.key;
      ['--bgimg', '--safe', '--bg1', '--bg2', '--bg3'].forEach(function (v) { de.style.removeProperty(v); });
    }
    if (deco) deco.style.opacity = '';
  }
  function go() {
    currentBg = b.key;
    if (instant || !motionOn || !fade || !app) { set(); return; }
    /* 旧い背景の写しを重ねてから新しい背景に替え、写しをゆっくり消す */
    fade.style.transition = 'none'; fade.style.backgroundImage = getComputedStyle(app).backgroundImage; fade.style.opacity = '1';
    if (deco) deco.style.opacity = '0';
    void fade.offsetWidth;
    set();
    fade.style.transition = 'opacity .9s ease'; fade.style.opacity = '0';
  }
  if (b.img) { var im = new Image(); im.onload = go; im.onerror = go; im.src = b.img; } else go();
}

/* 背景の選択パネル（先生用）。.bgpick .sw と .bgrow の中に見本付きのボタンを並べる */
export function buildBgPickers(list, current, onPick) {
  document.querySelectorAll('.bgpick .sw, .bgrow').forEach(function (box) {
    box.textContent = '';
    list.forEach(function (b) {
      var btn = el('button'); btn.type = 'button'; btn.dataset.bg = b.key;
      var i = el('i'); i.style.backgroundImage = b.thumbImg ? 'url("' + b.thumbImg + '")' : b.thumb;
      btn.appendChild(i); btn.appendChild(document.createTextNode(b.name));
      btn.onclick = function () {
        markBg(b.key); onPick(b.key);
        document.querySelectorAll('.bgpick').forEach(function (p) { p.classList.remove('open'); });
      };
      box.appendChild(btn);
    });
  });
  document.querySelectorAll('.bgpick .fab').forEach(function (f) {
    f.onclick = function (e) {
      e.stopPropagation();
      var p = f.parentNode, was = p.classList.contains('open');
      document.querySelectorAll('.bgpick').forEach(function (x) { x.classList.remove('open'); });
      if (!was) p.classList.add('open');
    };
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.bgpick')) document.querySelectorAll('.bgpick').forEach(function (p) { p.classList.remove('open'); });
  });
  markBg(current);
}
export function markBg(key) {
  document.querySelectorAll('.bgpick .sw button, .bgrow button').forEach(function (b) { b.classList.toggle('on', b.dataset.bg === key); });
}
export function savedBg() { try { return localStorage.getItem('qraft.bg') || BG_DEFAULT; } catch (e) { return BG_DEFAULT; } }
export function saveBg(k) { try { localStorage.setItem('qraft.bg', k); } catch (e) {} }

/* 共通の背景・飾りの土台を #app の先頭に差し込む */
export function mountStage() {
  var app = $('app');
  app.classList.add('bg');
  var fade = el('div', 'bgfade'); var deco = el('div', 'deco');
  for (var i = 0; i < 10; i++) deco.appendChild(el('i'));
  app.insertBefore(deco, app.firstChild); app.insertBefore(fade, app.firstChild);
}


/* ====================================================================
   問題セット
   ・暗号化した問題ファイル（{enc:1, salt, iv, ct, iter}）を、先生が入れたパスワードで開く。
     鍵は PBKDF2-SHA256 でパスワードから作り、AES-GCM で復号する（tools/encrypt.js と対）。
     暗号文のままでは、公開リポジトリのファイルを見つけても中身（問題・正解）は読めない。
   ==================================================================== */
function b64(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

export async function decryptSet(enc, password) {
  var km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  var key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try {
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (e) {
    throw new Error('パスワードが違います');
  }
}

/*
 * 問題を、ゲームで使う形にそろえる。
 *   choices … 文字列、または {t:文字, image:画像}   answer … 正解の番号（または、どれでも正解の番号の配列）
 *   answers … 全部選べたら正解（複数選択）          shuffle:false で選択肢を入れ替えない
 * 戻り値: {text, image, choices:[{t,image}], correct:[番号...], multi}
 */
export function prepareQuestion(q, doShuffle) {
  if (q.type === 'text') {
    return { type: 'text', text: q.q, image: q.image || null, choices: [], correct: [], multi: false,
             accept: q.accept.slice(), numeric: isNumericList(q.accept) };
  }
  var choices = q.choices.map(function (c) { return typeof c === 'string' ? { t: c, image: null } : { t: c.t || '', image: c.image || null }; });
  var order = choices.map(function (_, i) { return i; });
  if (doShuffle && q.shuffle !== false) shuffle(order);
  var multi = Array.isArray(q.answers);
  var src = multi ? q.answers : (Array.isArray(q.answer) ? q.answer : [q.answer]);
  return {
    text: q.q, image: q.image || null,
    choices: order.map(function (i) { return choices[i]; }),
    correct: src.map(function (a) { return order.indexOf(a); }).sort(function (a, b) { return a - b; }),
    multi: multi
  };
}
export function maskOf(list) { return list.reduce(function (m, i) { return m | (1 << i); }, 0); }

/* ====================================================================
   入力式（答えを打ち込む問題）の判定
   ・全角/半角・大文字/小文字・空白・「、。・」括弧を無視して比べる
   ・カタカナとひらがなは同じものとして扱う
   ・数値は、数として比べる（0.40 と 0.4 は同じ）。数値の答えには、2.7g のように単位がついていても正解にする
   ・Kahootの「正解の候補（漢字とひらがななど）」は、そのまま accept の配列に入っている
   ==================================================================== */
export function normText(s) {
  s = String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/\u2212/g, '-');
  s = s.replace(/[\s\u3000]+/g, '').replace(/[、。,，・･「」『』()\[\]【】'"“”‘’]/g, '');
  s = s.replace(/\.+$/, '');
  return s.replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });   /* カタカナ → ひらがな */
}
var NUM = /^[+-]?\d+(\.\d+)?$/;
function numOf(n) { return NUM.test(n) ? Number(n) : null; }
export function isNumericList(accept) { return accept.length > 0 && accept.every(function (a) { return numOf(normText(a)) !== null; }); }

export function isTextCorrect(input, accept) {
  var x = normText(input);
  if (!x) return false;
  var xn = numOf(x);
  for (var i = 0; i < accept.length; i++) {
    var a = normText(accept[i]);
    if (!a) continue;
    if (x === a) return true;
    var an = numOf(a);
    if (an !== null) {
      if (xn !== null && Math.abs(xn - an) <= 1e-9 * Math.max(1, Math.abs(an))) return true;
      var m = /^([+-]?\d+(\.\d+)?)([a-z\u03bc\u00b0%\/^\u00b2\u00b3\u00b7\-\d\u2103\u03c9]{1,10})$/.exec(x);   /* 数値＋単位（英字・記号）: 2.7g, 27cm, 100℃ */
      if (m && /^[^\d]/.test(m[3]) && Math.abs(Number(m[1]) - an) <= 1e-9 * Math.max(1, Math.abs(an))) return true;
    }
  }
  return false;
}

/* ====================================================================
   ロボットラン（Kahootの「Robot Run」に合わせた、クラス全員で協力するモード）
   ・全員のキャラが1つの群れになり、1体の巨大ロボットに追われる。
   ・各自のペースで解く。全員の正解数の合計が「チームの進捗」。目標に届けばクリア。
   ・追いつかれる（遅れすぎ／時間切れ）とライフが1つ減り、そのレベルの問題をやり直す。
   ・目標に届いたら「安全地帯」ミニゲーム。人数に上限があるゾーンを、先着で取り合う（相談してよい）。
   ・レベルは3つ。ライフは3つ（チーム共通）。
   ==================================================================== */
export var ANIMALS = ['🦊', '🐼', '🐰', '🐻', '🐯', '🐸', '🐵', '🐧', '🦁', '🐮', '🐷', '🐨', '🐹', '🦄', '🐙', '🦉', '🐶', '🐱', '🐥', '🦝'];
export function hashOf(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function avatarOf(uid) { return ANIMALS[hashOf(uid) % ANIMALS.length]; }
export var ROBOT = { levels: 3, lives: 3, Tl: 180, Zt: 20, per: [3, 3.6, 4.2], lagMax: 0.6 };
/* 人数 N のときの、そのレベルの目標（チーム全体の正解数） */
export function robotTarget(N, level) { return Math.max(3, Math.round(N * ROBOT.per[level - 1])); }
/* ロボットの近さ 0〜1（1で追いつかれる）。時間の進み(sec/Tl)に対して、進捗 p が遅れるほど近づく */
export function robotFrac(sec, p) { var lag = sec / ROBOT.Tl - p; return Math.max(0.04, Math.min(1.2, 0.12 + lag / ROBOT.lagMax * 0.88)); }
/* 安全地帯の定員。N人に対し、合計が N+2 以上になるようにする（レベルが上がるほど偏りが大きい） */
export function zonePlan(N, level) {
  var f = level === 1 ? [0.5, 0.5] : level === 2 ? [0.25, 0.35, 0.4] : [0.15, 0.3, 0.55];
  var caps = f.map(function (x) { return Math.max(1, Math.ceil(x * N)); });
  var sum = caps.reduce(function (a, b) { return a + b; }, 0);
  caps[caps.length - 1] += Math.max(0, N + 2 - sum);
  return caps;
}
/* ゾーンの評価：先に押した順に定員まで入れる。入れなかった人（選ばなかった人も）が「つかまった」 */
export function zoneEval(uids, runs, caps, zstart) {
  var caught = [], by = caps.map(function () { return []; });
  uids.forEach(function (id) {
    var r = runs[id];
    if (r && r.z != null && r.zt >= zstart && r.z < caps.length) by[r.z].push({ id: id, t: r.zt }); else caught.push(id);
  });
  by.forEach(function (list, z) {
    list.sort(function (a, b) { return a.t - b.t; });
    list.slice(caps[z]).forEach(function (x) { caught.push(x.id); });
  });
  return caught;
}

/* 場面（宇宙ステーションの通路）。先生の大画面と生徒の小画面で共通 */
export function mountScene(box, mini) {
  box.textContent = '';
  var sc = el('div', 'scene' + (mini ? ' mini' : '')), floor = el('div', 'floor'), robot = el('div', 'rbot', '🤖'), crowd = el('div', 'crowd');
  var wall = el('div', 'wallband');
  wall.appendChild(el('div', 'ceil'));
  [10, 34, 58, 82].forEach(function (x) { var w = el('div', 'win'); w.style.left = x + '%'; w.appendChild(el('i')); wall.appendChild(w); });
  wall.appendChild(el('div', 'pipe'));
  sc.appendChild(wall);
  ['edge top', 'edge bot', 'lane', 'arrows'].forEach(function (c) { floor.appendChild(el('div', c)); });
  sc.appendChild(floor); sc.appendChild(crowd); sc.appendChild(robot);
  sc.appendChild(el('div', 'danger'));
  var zl = el('div', 'zones'); sc.appendChild(zl);
  box.appendChild(sc);
  var chars = {}, api = {};
  api.setPlayers = function (list) {
    var keep = {}; list.forEach(function (p) { keep[p.uid] = 1; });
    Object.keys(chars).forEach(function (u) { if (!keep[u]) { chars[u].remove(); delete chars[u]; } });
    list.forEach(function (p) {
      if (chars[p.uid]) { chars[p.uid].querySelector('.nm').textContent = p.nick; return; }
      var c = el('div', 'ch'); c.appendChild(el('span', 'av', avatarOf(p.uid))); c.appendChild(el('span', 'nm', p.nick));
      crowd.appendChild(c); chars[p.uid] = c;
    });
    var n = list.length;
    sc.style.setProperty('--cs', (mini ? 1.15 : Math.max(1.3, Math.min(2.9, 20 / Math.sqrt(Math.max(n, 1)) / 1.6))) + 'em');
  };
  /* ctx: {phase, frac, caps, choice:{uid:z}, order:[uid], me, caught:[uid]} */
  api.draw = function (ctx) {
    sc.dataset.phase = ctx.phase;
    var zone = ctx.phase === 'zone' || ctx.phase === 'zoneres';
    robot.style.left = (zone ? -30 : -4 + Math.min(ctx.frac, 1) * 40) + '%';
    robot.classList.toggle('near', !zone && ctx.frac > .7);
    sc.style.setProperty('--danger', zone ? 0 : Math.max(0, Math.min(1, (ctx.frac - .35) / .65)));
    zl.textContent = '';
    var Z = (ctx.caps || []).length, slots = {};
    if (zone) ctx.caps.forEach(function (cap, z) {
      var zd = el('div', 'zone'); zd.style.left = (6 + z * (88 / Z)) + '%'; zd.style.width = (88 / Z - 2) + '%';
      zd.appendChild(el('b', '', 'ゾーン' + 'ABC'[z])); zd.appendChild(el('small', '', '定員 ' + cap + ' 人'));
      zl.appendChild(zd);
    });
    var ids = Object.keys(chars), cnt = {};
    ids.forEach(function (u) {
      var c = chars[u], h = hashOf(u), x, y, z = ctx.choice ? ctx.choice[u] : null;
      if (zone && z != null && z < Z) {
        var k = cnt[z] = (cnt[z] || 0) + 1, per = Math.max(2, Math.ceil(Math.sqrt(ctx.caps[z] * 1.6)));
        x = 6 + z * (88 / Z) + (88 / Z - 2) * (((k - 1) % per) + .5) / per; y = 50 + Math.floor((k - 1) / per) * 9;
      } else if (zone) { x = 14 + (h % 70); y = 92; }
      else { x = 50 + (h % 1000) / 1000 * 42; y = 40 + ((h >>> 10) % 1000) / 1000 * 46; }
      c.style.left = x + '%'; c.style.top = y + '%'; c.style.zIndex = Math.round(y);
      c.classList.toggle('me', u === ctx.me);
      c.classList.toggle('out', !!(ctx.caught && ctx.caught.indexOf(u) >= 0));
      c.classList.toggle('run', !zone);
    });
  };
  return api;
}
