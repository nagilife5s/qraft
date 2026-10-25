/* ====================================================================
   Qraft の音（BGM と効果音）
   ・BGM は bgm/<名前>.mp3 を、ループで鳴らす。ファイルが無ければ鳴らさない（置けば、そのまま鳴る）
     名前：lobby（待機）・quiz（クラシックの出題中）・podium（結果発表）・chase（ジェットチェイス）・blast（ブラストタイム）・home（おうちで練習）
   ・効果音は Web Audio で、その場で合成する（ファイル不要）
   ・ブラウザは、最初にクリックかキーを押すまで音を出せない。最初の操作で、自動で鳴らせる状態にする
   ・🔊ボタン（class="snd"）で消音。設定は端末に記憶する
   ==================================================================== */
var ctx = null, master = null, bgmBus = null, sfxBus = null;
var on = true; try { on = localStorage.getItem('qraft.sound') !== 'off'; } catch (e) {}
var bufs = {}, cur = null, want = null, rate = 1, last = {};
var VOL = { bgm: 0.45, sfx: 0.7 };

function ac() {
  if (ctx) return ctx;
  var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  ctx = new C();
  master = ctx.createGain(); master.gain.value = on ? 1 : 0; master.connect(ctx.destination);
  bgmBus = ctx.createGain(); bgmBus.gain.value = VOL.bgm; bgmBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = VOL.sfx; sfxBus.connect(master);
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
    s.connect(g); g.connect(bgmBus);
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
    s.start(); cur = { name: name, s: s, g: g };
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
  var c = ac(); if (!c || !on || c.state !== 'running' || !SFX[name]) return;
  var t = c.currentTime; if (last[name] && t - last[name] < 0.08) return; last[name] = t;
  SFX[name](t + 0.01);
}

/* ---- 🔊ボタン */
export function soundOn() { return on; }
export function setSound(v) {
  on = !!v; try { localStorage.setItem('qraft.sound', on ? 'on' : 'off'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
  paint();
}
function paint() {
  document.querySelectorAll('.snd').forEach(function (b) { b.textContent = on ? '🔊 音' : '🔇 音なし'; b.title = on ? '音を消す' : '音を出す'; b.setAttribute('aria-label', b.title); });
}
export function wireSoundButtons() {
  document.querySelectorAll('.snd').forEach(function (b) { if (b.dataset.w) return; b.dataset.w = '1'; b.type = 'button'; b.onclick = function () { setSound(!on); }; });
  paint();
}
