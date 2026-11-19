/*
 * クエスト（RPGモード）の決まりごと。ひとりで冒険（quest.html）とリカリアの画面で共通（古いチーム戦 quest-host／quest-play は 2026-11-13 にリカリアへ切り替え）。
 * 数値の根拠は RPGモード設計メモ.md（2026-11-11 決定分）。
 *   ・1回＝制限時間（5／8／10分）
 *   ・チームモードの攻撃倍率＝1＋0.025×(Lv−1)、上限1.5倍
 *   ・応援：気絶中の子が正解すると復活し、班の仲間全員の次の攻撃が1.2倍（重ねがけなし）
 *   ・シングルモードの書き込み上限：経験値＋300・ゴールド＋200（firebase-rules.json）
 */

import { TOWN, TOWN_DEFAULT, TOWN_MAX, ITEMS, ITEM_KEYS, weaponName, armorName, weaponList, armorList, gearOf, goldOf, soloGold, soloDayCap, dayNo } from './rikaria-data.js?v=20261121030000';
/* 町・装備・道具は rikaria-data.js が正本（2026-11-13 確定の数値の表） */
export { goldOf, TOWN, TOWN_DEFAULT, TOWN_MAX, ITEMS, ITEM_KEYS, weaponName, armorName, weaponList, armorList, soloGold, soloDayCap, dayNo };

/* 年度（4月はじまり） */
export function fiscalYear(d) { d = d || new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; }

/* ------------------------------------------------------------ 職業と技 */
/* a: 攻撃倍率  mp: 使うMP  heal: 班全員を最大HPの何割回復  revive: 気絶した仲間を全員復活  streak: 連続正解が何回いるか */
export var JOBS = {
  warrior: { name: '戦士', atk: 10, hp: 36, def: 3, desc: '正解するたび大ダメージ。打たれ強い。',
    acts: [{ n: 'こうげき', a: 1, mp: 0 }, { n: 'ブレイズスラッシュ', a: 1.8, mp: 2 }, { n: 'ラグナブレイク', a: 4, mp: 5, ult: 1 }] },
  mage: { name: '魔法使い', atk: 9, hp: 28, def: 0, desc: 'MPを貯めて大魔法。連続正解で真価を発揮。',
    acts: [{ n: 'フレア', a: 1, mp: 0 }, { n: 'スパーク', a: 2, mp: 2 }, { n: 'ステラフォール', a: 5, mp: 5, streak: 3, ult: 1 }] },
  priest: { name: '僧侶', atk: 7, hp: 30, def: 1, desc: '正解で仲間を回復。気絶した仲間を起こせる。',
    acts: [{ n: 'こうげき', a: 1, mp: 0 }, { n: 'ルミエール', a: 0.5, mp: 2, heal: 0.4 }, { n: 'リヴァイヴ', a: 0, mp: 4, heal: 1, revive: 1, ult: 1 }] }
};
export var JOB_KEYS = ['warrior', 'mage', 'priest'];
export var MP_MAX = 5;
export function heroImg(job, look) { return 'img/quest/hero-' + (JOBS[job] ? job : 'warrior') + '-' + (look === 'b' ? 'b' : 'a') + '.webp'; }

/* レベル差をおさえる倍率（チームモード） */
export function lvMult(lv) { return Math.min(1.5, 1 + 0.025 * (Math.max(1, lv) - 1)); }
export var CHEER = 1.2;
/* 次のレベルまでの経験値（Lv→Lv+1） */
export function expToNext(lv) { return 40 + 20 * lv; }
/* 経験値を足して、レベルとスキルポイントを進める */
export function addExp(c, gain) {
  c.exp = (c.exp || 0) + gain;
  var up = 0;
  while (c.exp >= expToNext(c.lv)) { c.exp -= expToNext(c.lv); c.lv++; c.sp = (c.sp || 0) + 1; up++; }
  return up;
}

/* ------------------------------------------------------------ 敵とエリア */
export var ENEMIES = {
  metarich: { n: 'メタリッチ', img: 'img/quest/metarich.webp' },
  donbuka:  { n: 'ドンブーカ', img: 'img/quest/donbuka.webp' },
  banara:   { n: 'バナーラ',   img: 'img/quest/banara.webp' },
  awabon:   { n: 'アワボン',   img: 'img/quest/awabon.webp' },
  tokerun:  { n: 'トケルン',   img: 'img/quest/tokerun.webp' },
  mistoru:  { n: 'ミストル',   img: 'img/quest/mistoru.webp' }
};
var ALL_ZAKO = Object.keys(ENEMIES);
/* 分野タグ → 敵（中1 身のまわりの物質） */
export var TAG_ENEMY = { '物質と金属': 'metarich', '密度': 'donbuka', 'ガスバーナー': 'banara', '気体': 'awabon', '水溶液': 'tokerun', '状態変化': 'mistoru' };

/*
 * エリア＝単元。名前は冒険の地図（quest-mock.html）と同じ。
 * ★絵がそろっているのは「まどろみの錬金工房」だけ。ほかの単元は、絵ができるまで工房の敵とボスを借りる。
 */
var AREA_NAMES = {
  '1-分類': 'ささやきの森', '1-物質': 'まどろみの錬金工房', '1-音・光・力': 'ひびきの洞窟', '1-大地': 'ゆらぎの火山'
};
export var BOSS = { n: '錬金王アルケミラ', img: 'img/quest/boss-alchemira.webp', title: '錬金を解きし者' };
export function areaOf(set) {
  var unit = set.file === 'chu1-mono.json' ? '物質' : set.unit, g = set.file === 'chu1-mono.json' ? 1 : set.grade;
  var id = (g || 0) + '-' + unit;
  return { id: id, name: AREA_NAMES[id] || (unit + 'の封印の地'), unit: unit, grade: g };
}
/* 出す敵の順番。問題にタグがあれば、そのタグの敵を、なければ工房の6体を順に */
export function enemyFor(tag, i) { return TAG_ENEMY[tag] || ALL_ZAKO[i % ALL_ZAKO.length]; }

/* 雑魚のHP：班の人数ぶん、ひとり約2回の正解で倒れるくらい */
export function zakoHp(size) { return Math.round(20 * Math.max(1, size)); }
/* チームモードの難易度（2026-11-12 授業で「難易度を選べると面白い・敵がめっちゃ強いと面白い」）
   hp：敵のHPの倍率、hit：まちがえたとき受けるダメージの倍率。報酬は変えない（ルールの検査と合わせるため） */
export var QUEST_DIFF = { easy: { n: 'やさしい', hp: 0.75, hit: 0.7 }, normal: { n: 'ふつう', hp: 1, hit: 1 }, hard: { n: 'つよい', hp: 1.4, hit: 1.4 }, oni: { n: 'おに', hp: 2, hit: 1.8 } };
/* 敵の攻撃（まちがえたとき受けるダメージ） */
export function enemyHit(job, isBoss) { return Math.max(4, (isBoss ? 13 : 10) - JOBS[job].def); }
/*
 * ボスのHP：参加人数と平均レベルから決める。正答率7割で、2〜3回のボス戦で倒せる量。
 *   1人が1回の戦いで答える数 ≒ 制限時間 ÷ 12秒（解く・技を選ぶ・演出）
 */
export function bossHp(n, avgLv, tlSec) {
  var perHead = (tlSec / 12) * 0.7 * 9 * lvMult(avgLv) * 1.25;
  return Math.max(200, Math.round(n * perHead * 2.5 / 10) * 10);
}

/*
 * 報酬（チームモード。2026-11-11 レビュー指摘5で、職業の差が出にくい形に変更）
 *   経験値 = 正解1問 expPerOk ＋ 活躍ポイント × contribRate ＋ 撃破ボーナス
 *   活躍ポイント = 与えたダメージ ＋ 回復したHP（実際に減っていた分）× healRate ＋ 起こした仲間 × reviveBonus
 *   撃破ボーナスとゴールドは、その敵と戦っている間に1問でも正解した班員全員に同じだけ
 *   試算（正解20問）：戦士310・魔法使い320・僧侶（攻撃）274・僧侶（回復）281〜303。前は僧侶（回復）103・戦士279
 */
export var REWARD = { killExpRate: 0.5, bossExp: 200, expPerOk: 12, contribRate: 0.25, healRate: 0.5, reviveBonus: 15 };


/* 物語（エリアに入るとき・ボスを倒したとき） */
export function storyEnter(area) { return area.name + '――忘却の王オブリオンに、知識を封じられた地。正解の力で、魔物を打ち払え！'; }
export function storyClear(area, town, stage) {
  return area.name + 'をおおっていた霧が晴れ、「' + area.unit + 'の知識」が' + town + 'に もどってきた。' +
    (TOWN[stage] ? TOWN[stage].d + '。町は「' + TOWN[stage].n + '」になった！' : '');
}

/* ====================================================================
   スキル・装備・持ち物（2026-11-11 決定）
   ・スキルは技ごとに5段階。1ポイントで威力・回復量 +10%。
     技2は1以上、大技は3以上振ると使えるようになる。キャラを作ったときは技2に1ポイント入っている（無料）。
   ・装備は武器と防具を1つずつ（買うと付け替え）。持ち物は道具屋で買い、チームモードには1つだけ持っていける。
   ・店と施設は最初からぜんぶ開いている。品ぞろえ（装備の段階・道具の上位版）が町の段階で増える（2026-11-13）
   ==================================================================== */
export var SK_MAX = 5, SK_UNLOCK = [0, 1, 3], SK_FREE = [0, 1, 0];
export function skOf(ch) { var s = (ch && ch.sk) || {}; return [0, 1, 2].map(function (i) { return Number(s[i] != null ? s[i] : SK_FREE[i]) || 0; }); }
export function canUse(ch, i) { return skOf(ch)[i] >= SK_UNLOCK[i]; }
export function skMult(ch, i) { return 1 + 0.1 * skOf(ch)[i]; }

export var FACS = [
  { ic: '⛲', nm: '広場', ds: '町の真ん中', st: 0 }, { ic: '🧪', nm: '道具屋', ds: '回復アイテム', st: 0 },
  { ic: '⛪', nm: '教会', ds: 'スキルの振り直し・見た目の変更', st: 0 }, { ic: '⚔️', nm: '武器・防具屋', ds: '装備を買う', st: 0 },
  { ic: '📚', nm: '図書館', ds: '知識の書を読む', st: 0 }, { ic: '🏰', nm: '城', ds: '称号を見る', st: 0 }
];
export var RESPEC_COST = 100;
/* 教会で職業を変える値段＝学年×これ（ルール gen_rules.py の JOBCHG_GOLD と同じ。2026-11-20） */
export var JOBCHG_GOLD = 100;

/* ====================================================================
   合言葉（2026-11-11 レビュー指摘2）
   ・先生が記録画面（records.html）で、出席番号ごとに合言葉を作って配る（quest/<年度>/keys/<学年-組-番号>）
   ・生徒は初回と端末を変えたときだけ入力する。合うと quest/<年度>/owners/<学年-組-番号>/<端末のuid> が書ける
   ・キャラを読み書きできるのは、持ち主の端末と先生だけ（firebase-rules.json）
   ==================================================================== */
var CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';   /* まぎらわしい i l o 0 1 は使わない */
export function makeCode() { var a = new Uint32Array(6); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return CODE_ABC[x % CODE_ABC.length]; }).join(''); }
export function normCode(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, ''); }
/*
 * この端末が sid の持ち主か確かめる。まだなら合言葉を聞く。持ち主なら true、やめたら false。
 * fb = { db, ref, get, set }
 */
export async function ensureOwner(fb, y, sid, uid, label) {
  var p = 'quest/' + y + '/owners/' + sid + '/' + uid;
  try { if ((await fb.get(fb.ref(fb.db, p))).exists()) return true; } catch (e) {}
  return new Promise(function (resolve) {
    var bg = document.createElement('div');
    bg.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(10,8,30,.72);display:flex;align-items:center;justify-content:center;padding:16px';
    bg.innerHTML = '<form style="background:#fff;color:#241c4a;border-radius:16px;padding:1.4em 1.5em;width:22em;max-width:100%;display:flex;flex-direction:column;gap:.7em;font-size:1.05em">' +
      '<b style="font-size:1.15em">合言葉を入れてください</b>' +
      '<div style="font-size:.9em;line-height:1.6"></div>' +
      '<input autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="12" style="font:inherit;font-size:1.4em;letter-spacing:.15em;padding:.4em .6em;border:2px solid #bdb5de;border-radius:10px;text-align:center" aria-label="合言葉">' +
      '<div role="alert" style="color:#b3261e;font-size:.9em;min-height:1.3em"></div>' +
      '<div style="display:flex;gap:.6em;justify-content:flex-end"><button type="button" style="font:inherit;padding:.5em 1em;border-radius:10px;border:1px solid #bdb5de;background:#fff">もどる</button>' +
      '<button type="submit" style="font:inherit;padding:.5em 1.2em;border-radius:10px;border:0;background:#5b3fd6;color:#fff;font-weight:700">OK</button></div></form>';
    var f = bg.firstChild, msg = f.children[1], inp = f.children[2], er = f.children[3], btns = f.children[4].children;
    msg.textContent = (label || sid) + ' のキャラを使うには、先生からもらった合言葉（6文字）が必要です。この端末で1回入れれば、次からは聞かれません。';
    function close(v) { bg.remove(); resolve(v); }
    btns[0].onclick = function () { close(false); };
    f.onsubmit = async function (e) {
      e.preventDefault(); var c = normCode(inp.value); er.textContent = '';
      if (c.length < 4) { er.textContent = '合言葉を入れてください'; return; }
      btns[1].disabled = true;
      try { await fb.set(fb.ref(fb.db, p), { c: c, t: { '.sv': 'timestamp' } }); close(true); }
      catch (x) { er.textContent = '合言葉がちがいます。番号と合言葉を確かめてください。'; btns[1].disabled = false; inp.select(); }
    };
    document.body.appendChild(bg); inp.focus();
  });
}
/* スキルを3つとも数で書く（ルールが「残りのポイント＋振ったポイント＝レベル」を確かめるため） */
export function normChar(c) { var s = skOf(c); c.sk = { 0: s[0], 1: s[1], 2: s[2] }; return c; }

/* 能力値。team=true のときはレベルでHPを増やさない（チームモードはレベル差をおさえる） */
export function statsOf(ch, team) {
  var j = JOBS[ch.j] || JOBS.warrior, g = gearOf(JOBS[ch.j] ? ch.j : 'warrior', ch.eq, ch.up);
  return { atk: j.atk * g.atkX, def: j.def, cut: g.cut, healX: g.healX, mhp: j.hp + g.hp + (team ? 0 : 2 * ((ch.lv || 1) - 1)) };
}
/* ひとりで冒険の攻撃倍率（上限なし。育てた分だけ強くなる） */
export function soloMult(lv) { return 1 + 0.05 * (Math.max(1, lv) - 1); }
/* ひとりで冒険の報酬（1回の書き込みは 経験値300・ゴールド200 まで。ルールでも弾く） */
/* ゴールドは学年の値（soloGold＝学年×2G）。1日の上限（soloDayCap＝学年×50G）は呼ぶ側とルールで止める。復習は半分。ボスはゴールド3倍 */
export function soloReward(enemyMax, review, grade, boss) { var r = review ? 0.5 : 1; return { exp: Math.min(300, Math.round(enemyMax * 0.8 * r)), gold: Math.max(1, Math.round(soloGold(grade) * (boss ? 3 : 1) * r)) }; }
/* 敵の強さは、その子のレベルに合わせる（2026-11-16）。どの学年の単元に入っても、自分のレベルに合った強さ。
   前は単元の学年で決めていた（2年はLv16・3年はLv30から始まるため）。数値はその時の値をレベルでつないだもの：
   HP：(30＋8×エリアの番号) × レベルの攻撃倍率 × (1 → Lv30で1.5)。攻撃：1＋0.07×(Lv−1)（キャラのHPの伸びに合わせる）。
   Lv1・Lv16・Lv30 では、前の1年・2年・3年の値とほぼ同じ */
export function soloHpX(lv) { return 1 + 0.5 * Math.min(1, Math.max(0, (Number(lv) || 1) - 1) / 29); }
export function soloEnemyHp(areaIndex, lv) { lv = Math.max(1, Number(lv) || 1); return Math.round((30 + 8 * areaIndex) * soloMult(lv) * soloHpX(lv)); }
/* ひとりで冒険のボス（エリアの奥の霧。2026-11-16）：ひとりで倒せるように、HPは自分のレベルの敵の3倍。授業のチーム戦のボス（クラス全員で削る）とは別 */
export function soloBossHp(areaIndex, lv) { return 3 * soloEnemyHp(areaIndex, lv); }
export function soloEnemyAtkX(lv) { return 1 + 0.07 * (Math.max(1, Number(lv) || 1) - 1); }

/* ====================================================================
   はじめての戦闘の案内（端末ごとに一度だけ。2026-11-12）
   mode: 'solo'（ひとりで冒険）／'team'（チームモード）。閉じると resolve
   ==================================================================== */
export function battleGuide(mode) {
  var key = 'qraft.quest.guide.' + mode;
  try { if (localStorage.getItem(key)) return Promise.resolve(); } catch (e) { return Promise.resolve(); }
  var steps = [
    ['❓', '問題に答える', '正解すると MP が 1 たまります。まちがえると、敵の攻撃を受けます。📌は、まえにまちがえた問題です。'],
    ['✨', '技をえらぶ', '正解したら技をえらびます。MP を使う技ほど強力です。' + (mode === 'team' ? '僧侶の回復や、仲間を起こすのも大事な活躍です。' : '')],
    ['⭐', '経験値がもらえる', mode === 'team' ? '経験値は、正解した数と活躍（ダメージ・回復）で決まります。職業による差はほとんどありません。' : '敵をたおすと経験値とゴールド。レベルが上がるとスキルポイントがもらえます。']
  ];
  return new Promise(function (resolve) {
    var bg = document.createElement('div');
    bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-label', 'たたかい方');
    bg.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(10,8,30,.75);display:flex;align-items:center;justify-content:center;padding:16px';
    var box = '<div style="background:#fff;color:#241c4a;border-radius:16px;padding:1.3em 1.4em;width:26em;max-width:100%;display:flex;flex-direction:column;gap:.7em;font-size:1.05em"><b style="font-size:1.2em">⚔️ たたかい方</b>';
    steps.forEach(function (s, i) { box += '<div style="display:flex;gap:.6em;align-items:flex-start"><span style="font-size:1.6em;line-height:1">' + s[0] + '</span><div><b>' + (i + 1) + '. ' + s[1] + '</b><div style="font-size:.9em;line-height:1.6">' + s[2] + '</div></div></div>'; });
    box += '<button type="button" style="font:inherit;font-weight:900;padding:.55em 1.2em;border-radius:999px;border:0;background:#5b3fd6;color:#fff;align-self:center">わかった！</button></div>';
    bg.innerHTML = box;
    var b = bg.querySelector('button');
    b.onclick = function () { try { localStorage.setItem(key, '1'); } catch (e) {} bg.remove(); resolve(); };
    document.body.appendChild(bg); b.focus();
  });
}

/*
 * 戦闘の問題の図（2026-11-12 授業で「図が小さい・見切れる」）。押すと画面いっぱいに拡大し、もう一度押すと閉じる
 */
export function cmdImg(src, alt) {
  var im = document.createElement('img'); im.className = 'qimg cmd-img'; im.src = src; im.alt = alt || '';
  im.tabIndex = 0; im.setAttribute('role', 'button'); im.title = '押すと大きく見られます';
  im.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); im.click(); } };   /* クリックの拡大は lib.js */
  return im;
}

/* ------------------------------------------------------------ 町に立つ施設の6人（2026-11-17）
 * 各施設の前（広場は噴水のそば）に、全身の絵の人を1人ずつ立たせる。話しかける＝その施設に入る（広場は噴水を調べる）のと同じ。
 * 置く場所は候補から順に、「草・花・広場の石畳」のマスで、置いても今まで行けたマスがどこも行けなくならない最初のマス。
 * g＝町の地図（置いたマスは 'N' にする）、blocked(c)＝通れない文字か、start＝出発のマス。返すのは [{x, y, f, img}] */
export var FAC_NPC_IMG = ['npc6-chief', 'npc6-item', 'npc6-sister', 'npc6-smith', 'npc6-librarian', 'npc6-gate'];
export function townReach(g, blocked, start) {
  var H = g.length, W = g[0].length, seen = new Uint8Array(W * H), q = [start];
  if (blocked(g[start[1]][start[0]])) return seen;
  seen[start[1] * W + start[0]] = 1;
  while (q.length) { var p = q.shift();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = p[0] + d[0], y = p[1] + d[1];
      if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x] || blocked(g[y][x])) return; seen[y * W + x] = 1; q.push([x, y]); }); }
  return seen;
}
export function placeFacNpcs(g, blds, fountain, blocked, start) {
  var W = g[0].length, out = [];
  function ok(x, y) {
    if (!g[y] || '.,P'.indexOf(g[y][x]) < 0) return false;
    var before = townReach(g, blocked, start), c = g[y][x]; g[y][x] = 'N';
    var after = townReach(g, blocked, start), good = true;
    for (var i = 0; i < before.length && good; i++) if (before[i] && !after[i] && i !== y * W + x) good = false;
    if (!good) g[y][x] = c;
    return good;
  }
  var spots = [[0, fountain ? [[fountain[0] + 2, fountain[1] - 1], [fountain[0] - 1, fountain[1] - 1], [fountain[0] + 2, fountain[1] + 2], [fountain[0] - 1, fountain[1] + 2]] : []]];
  blds.forEach(function (b) {
    var fy = b.y + b.h, c = [];
    c.push([b.x + b.w, fy - 1], [b.x - 1, fy - 1], [b.x + b.w - 1, fy], [b.x, fy], [b.x + b.w, fy], [b.x - 1, fy]);   /* 横・前の角（入口のまん中はあける） */
    spots.push([b.f, c]);
  });
  spots.forEach(function (s) { for (var i = 0; i < s[1].length; i++) { var p = s[1][i]; if (ok(p[0], p[1])) { out.push({ x: p[0], y: p[1], f: s[0], img: FAC_NPC_IMG[s[0]] }); break; } } });
  return out;
}
