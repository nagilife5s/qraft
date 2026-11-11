/* ====================================================================
   Qraft の音（BGM と効果音）
   ・BGM は bgm/<名前>.mp3 を、ループで鳴らす。ファイルが無ければ鳴らさない（置けば、そのまま鳴る）
     名前：top（トップ画面）・lobby（待機）・quiz（クラシックの出題中）・podium（結果発表）・chase（ジェットチェイス）・blast（ブラストタイム）・home（おうちで練習）
   ・効果音は Web Audio で、その場で合成する（ファイル不要）
   ・ブラウザは、最初にクリックかキーを押すまで音を出せない。最初の操作で、自動で鳴らせる状態にする
   ・🔊ボタン（class="snd"）を押すと、BGM と効果音を別々に切りかえ・音量を変えるメニューが開く。設定は端末に記憶する（2026-11-12）
   ==================================================================== */
var ctx = null, master = null, bgmBus = null, sfxBus = null;
/* bgmOn・sfxOn：BGMと効果音を別々に。vol：全体の音量（0〜1）。前の「音なし」（qraft.sound=off）は両方オフとして引き継ぐ */
var bgmOn = true, sfxOn = true, vol = 1;
try {
  var old = localStorage.getItem('qraft.sound') === 'off';
  bgmOn = (localStorage.getItem('qraft.sound.bgm') || (old ? 'off' : 'on')) !== 'off';
  sfxOn = (localStorage.getItem('qraft.sound.sfx') || (old ? 'off' : 'on')) !== 'off';
  var v = parseFloat(localStorage.getItem('qraft.sound.vol')); if (v >= 0 && v <= 1) vol = v;
} catch (e) {}
var bufs = {}, cur = null, want = null, rate = 1, last = {};
var VOL = { bgm: 0.45, sfx: 0.7 };
/* つなぎ目に間が空かないよう、ループする範囲を曲ごとに指定する（秒）
   mp3 は頭に無音（priming）と末尾に詰め物が入る。ブラウザが取り除かなかったときは、その分をよけてループする */
var P = 576 / 44100;
var LOOP = {
  top:    { len: 63.9,             prime: P },
  lobby:  { len: 2849280 / 44100,  prime: P },
  quiz:   { len: 2791424 / 44100,  prime: P },
  podium: { len: 2854912 / 44100,  prime: P },
  chase:  { len: 2798976 / 44100,  prime: P },
  blast:  { len: 2823680 / 44100,  prime: P },
  home:   { len: 2752512 / 44100,  prime: P }
};

function ac() {
  if (ctx) return ctx;
  var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  ctx = new C();
  master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
  bgmBus = ctx.createGain(); bgmBus.gain.value = bgmOn ? VOL.bgm : 0; bgmBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? VOL.sfx : 0; sfxBus.connect(master);
  return ctx;
}
function unlock() { var c = ac(); if (c && c.state === 'suspended') c.resume(); }
['pointerdown', 'keydown'].forEach(function (t) { addEventListener(t, unlock, true); });

function load(name) {
  if (!bufs[name]) bufs[name] = fetch('bgm/' + name + '.mp3')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(function (a) { return new Promise(function (ok, ng) { ac().decodeAudioData(a, ok, ng); }); })
    .catch(function () { return null; });                                  /* ファイルがまだ無い → 鳴らさない */
  return bufs[name];
}
/* 先に読み込んでおく（場面が変わったとき、すぐ鳴るように） */
export function preload(names) { if (ac()) names.forEach(load); }

/* BGM を切り替える（前の曲は0.8秒で消し、次の曲は0.6秒で大きくする）。null で止める */
export function bgm(name) {
  if (want === name) return;
  want = name;
  var c = ac(); if (!c) return;
  if (cur) { fadeOut(cur, 0.8); cur = null; }
  if (!name) return;
  load(name).then(function (b) {
    if (!b || want !== name || cur) return;
    var s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.loop = true; s.playbackRate.value = rate;
    var lp = LOOP[name];
    if (lp && b.duration > lp.len) {
      var st = (b.duration - lp.len > 0.03) ? lp.prime : 0;      /* 無音が残っている → 頭をよける */
      s.loopStart = st; s.loopEnd = Math.min(b.duration, st + lp.len);
    }
    s.connect(g); g.connect(bgmBus);
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
    s.start(0, s.loopStart || 0); cur = { name: name, s: s, g: g };
  });
}
function fadeOut(t, sec) {
  var now = ctx.currentTime;
  t.g.gain.cancelScheduledValues(now); t.g.gain.setValueAtTime(t.g.gain.value, now); t.g.gain.linearRampToValueAtTime(0, now + sec);
  t.s.stop(now + sec + 0.05);
}
/* BGM の速さ（1＝ふつう。ジェットチェイスでロボットが近いほど速くする） */
export function bgmRate(r) {
  if (Math.abs(r - rate) < 0.005) return;
  rate = r; if (cur) cur.s.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.5);
}

/* ---- 効果音（合成） */
function tone(f, t0, dur, type, vol, f2) {
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(sfxBus); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, vol, f1, f2) {
  var n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  var s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = b; lp.type = 'lowpass'; lp.frequency.setValueAtTime(f1, t0); lp.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(lp); lp.connect(g); g.connect(sfxBus); s.start(t0);
}
function seq(t, notes, step, dur, type, vol) { notes.forEach(function (f, i) { tone(f, t + i * step, dur, type, vol); }); }
var SFX = {
  join:    function (t) { tone(660, t, 0.08, 'triangle', 0.3); tone(990, t + 0.06, 0.12, 'triangle', 0.3); },
  go:      function (t) { seq(t, [523, 659, 784, 1047], 0.07, 0.16, 'square', 0.16); },
  tick:    function (t) { tone(880, t, 0.09, 'square', 0.16); },
  ok:      function (t) { tone(784, t, 0.12, 'triangle', 0.35); tone(1175, t + 0.1, 0.28, 'triangle', 0.35); },
  ng:      function (t) { tone(233, t, 0.32, 'sawtooth', 0.16, 150); },
  reveal:  function (t) { for (var i = 0; i < 10; i++) noise(t + i * 0.055, 0.05, 0.25, 3000, 800); tone(1047, t + 0.6, 0.35, 'triangle', 0.3); },
  rank:    function (t) { tone(400, t, 0.25, 'sine', 0.2, 1200); },
  fanfare: function (t) { seq(t, [523, 659, 784], 0.13, 0.14, 'square', 0.15); tone(1047, t + 0.39, 0.7, 'square', 0.15); tone(784, t + 0.39, 0.7, 'triangle', 0.25); },
  lose:    function (t) { seq(t, [523, 494, 466], 0.22, 0.2, 'square', 0.14); tone(440, t + 0.66, 0.8, 'square', 0.14, 220); },
  step:    function (t) { tone(1320, t, 0.05, 'square', 0.07); },
  levelup: function (t) { seq(t, [523, 659, 784, 1047, 1319], 0.06, 0.12, 'square', 0.13); },
  caught:  function (t) { tone(330, t, 0.3, 'sawtooth', 0.2, 90); noise(t, 0.3, 0.3, 1500, 100); },
  boom:    function (t) { noise(t, 0.4, 0.5, 1400, 60); },
  kill:    function (t) { tone(988, t, 0.06, 'square', 0.14); tone(1319, t + 0.06, 0.14, 'square', 0.14); }
};
/* 同じ音を短い間に何度も鳴らさない（40人が一度に正解しても、うるさくならないように） */
export function sfx(name) {
  var c = ac(); if (!c || !sfxOn || c.state !== 'running' || !SFX[name]) return;
  var t = c.currentTime; if (last[name] && t - last[name] < 0.08) return; last[name] = t;
  SFX[name](t + 0.01);
}

/* ---- 🔊ボタン */
export function soundOn() { return bgmOn || sfxOn; }
function save() { try { localStorage.setItem('qraft.sound.bgm', bgmOn ? 'on' : 'off'); localStorage.setItem('qraft.sound.sfx', sfxOn ? 'on' : 'off'); localStorage.setItem('qraft.sound.vol', String(vol)); localStorage.removeItem('qraft.sound'); } catch (e) {} }
function apply() {
  if (!ctx) return;
  var t = ctx.currentTime;
  master.gain.setTargetAtTime(vol, t, 0.05);
  bgmBus.gain.setTargetAtTime(bgmOn ? VOL.bgm : 0, t, 0.05);
  sfxBus.gain.setTargetAtTime(sfxOn ? VOL.sfx : 0, t, 0.05);
}
/* 両方まとめて（前の🔊ボタンと同じ） */
export function setSound(v) { bgmOn = sfxOn = !!v; save(); apply(); paint(); }
export function setBgm(v) { bgmOn = !!v; save(); apply(); paint(); }
export function setSfx(v) { sfxOn = !!v; save(); apply(); paint(); }
export function setVolume(v) { vol = Math.max(0, Math.min(1, v)); save(); apply(); paint(); }
function paint() {
  var all = bgmOn && sfxOn && vol > 0, none = (!bgmOn && !sfxOn) || vol === 0;
  document.querySelectorAll('.snd').forEach(function (b) {
    b.textContent = none ? '🔇 音なし' : all ? '🔊 音' : '🔉 音';
    b.title = '音の設定（BGM・効果音・音量）'; b.setAttribute('aria-label', '音の設定'); b.setAttribute('aria-haspopup', 'dialog');
  });
  var m = document.getElementById('sndMenu');
  if (m) { m.querySelector('[data-k=bgm]').checked = bgmOn; m.querySelector('[data-k=sfx]').checked = sfxOn; m.querySelector('[data-k=vol]').value = Math.round(vol * 100); }
}
/* 🔊ボタンを押すと開く小さなメニュー（キーボードでも操作できる。Esc か外を押すと閉じる） */
function openMenu(btn) {
  var m = document.getElementById('sndMenu');
  if (m) { closeMenu(); return; }
  m = document.createElement('div'); m.id = 'sndMenu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', '音の設定');
  m.style.cssText = 'position:fixed;z-index:1000;background:#fff;color:#241c4a;border-radius:14px;padding:.8em 1em;box-shadow:0 .4em 1.2em rgba(0,0,0,.35);display:flex;flex-direction:column;gap:.55em;font:700 15px/1.4 var(--font, sans-serif);min-width:13em';
  m.innerHTML = '<label style="display:flex;gap:.5em;align-items:center;cursor:pointer"><input type="checkbox" data-k="bgm"> BGM（音楽）</label>' +
    '<label style="display:flex;gap:.5em;align-items:center;cursor:pointer"><input type="checkbox" data-k="sfx"> 効果音</label>' +
    '<label style="display:flex;flex-direction:column;gap:.2em">音量<input type="range" data-k="vol" min="0" max="100" step="5" aria-label="音量"></label>';
  document.body.appendChild(m);
  var r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  m.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  m.querySelector('[data-k=bgm]').onchange = function () { ac(); setBgm(this.checked); };
  m.querySelector('[data-k=sfx]').onchange = function () { ac(); setSfx(this.checked); if (this.checked) sfx('ok'); };
  m.querySelector('[data-k=vol]').oninput = function () { ac(); setVolume(this.value / 100); };
  m.dataset.btn = '1'; menuBtn = btn; btn.setAttribute('aria-expanded', 'true');
  paint(); m.querySelector('[data-k=bgm]').focus();
  setTimeout(function () { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); });
}
var menuBtn = null;
function outside(e) { var m = document.getElementById('sndMenu'); if (m && !m.contains(e.target) && e.target !== menuBtn) closeMenu(); }
function esc(e) { if (e.key === 'Escape') { closeMenu(); if (menuBtn) menuBtn.focus(); } }
function closeMenu() {
  var m = document.getElementById('sndMenu'); if (m) m.remove();
  document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true);
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}
export function wireSoundButtons() {
  document.querySelectorAll('.snd').forEach(function (b) { if (b.dataset.w) return; b.dataset.w = '1'; b.type = 'button'; b.setAttribute('aria-expanded', 'false'); b.onclick = function () { openMenu(b); }; });
  paint();
}
