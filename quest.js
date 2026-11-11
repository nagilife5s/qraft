/*
 * クエスト（RPGモード）の決まりごと。先生の画面（quest-host.html）と生徒の画面（quest-play.html）で共通。
 * 数値の根拠は RPGモード設計メモ.md（2026-11-11 決定分）。
 *   ・1回＝制限時間（5／8／10分）
 *   ・チームモードの攻撃倍率＝1＋0.025×(Lv−1)、上限1.5倍
 *   ・応援：気絶中の子が正解すると復活し、班の仲間全員の次の攻撃が1.2倍（重ねがけなし）
 *   ・シングルモードの書き込み上限：経験値＋300・ゴールド＋200（firebase-rules.json）
 */

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

/* 報酬 */
export var REWARD = { killGold: 15, killExpRate: 0.5, bossExp: 200, bossGold: 120 };

/* 町の段階（ボスを倒すたびに1つ上がる） */
export var TOWN = [
  { n: '霧に包まれた廃墟の村', add: '広場だけ' }, { n: '小さな村', add: '道具屋' }, { n: '村', add: '教会' },
  { n: '町', add: '武器・防具屋' }, { n: '大きな町', add: '図書館' }, { n: '王都', add: '城' }
];
export var TOWN_DEFAULT = 'ルーメンの村';

/* 物語（エリアに入るとき・ボスを倒したとき） */
export function storyEnter(area) { return area.name + '――忘却の王オブリオンに、知識を封じられた地。正解の力で、魔物を打ち払え！'; }
export function storyClear(area, town, stage) {
  return area.name + 'をおおっていた霧が晴れ、「' + area.unit + 'の知識」が' + town + 'に もどってきた。' +
    (TOWN[stage] ? '村は「' + TOWN[stage].n + '」になり、' + TOWN[stage].add + 'が建った！' : '');
}

/* ====================================================================
   スキル・装備・持ち物（2026-11-11 決定）
   ・スキルは技ごとに5段階。1ポイントで威力・回復量 +10%。
     技2は1以上、大技は3以上振ると使えるようになる。キャラを作ったときは技2に1ポイント入っている（無料）。
   ・装備は武器と防具を1つずつ（買うと付け替え）。持ち物は道具屋で買い、チームモードには1つだけ持っていける。
   ・店は町の段階で開く：道具屋1・教会2・武器・防具屋3・図書館4・城5
   ==================================================================== */
export var SK_MAX = 5, SK_UNLOCK = [0, 1, 3], SK_FREE = [0, 1, 0];
export function skOf(ch) { var s = (ch && ch.sk) || {}; return [0, 1, 2].map(function (i) { return Number(s[i] != null ? s[i] : SK_FREE[i]) || 0; }); }
export function canUse(ch, i) { return skOf(ch)[i] >= SK_UNLOCK[i]; }
export function skMult(ch, i) { return 1 + 0.1 * skOf(ch)[i]; }

var WNAME = { warrior: ['ブロンズソード', 'はがねの剣', 'きらめきの大剣'], mage: ['見習いの杖', 'ルーンの杖', '星くずの杖'], priest: ['木のメイス', '白銀のメイス', '聖なるメイス'] };
export var WEAPONS = [{ id: 'w1', atk: 2, p: 120 }, { id: 'w2', atk: 4, p: 300 }, { id: 'w3', atk: 7, p: 700 }];
export var ARMORS = [{ id: 'a1', n: '旅人の服', def: 1, hp: 4, p: 100 }, { id: 'a2', n: 'くさりかたびら', def: 2, hp: 8, p: 260 }, { id: 'a3', n: '光のよろい', def: 4, hp: 14, p: 600 }];
export function weaponName(job, id) { var i = WEAPONS.findIndex(function (w) { return w.id === id; }); return i < 0 ? 'なし' : (WNAME[job] || WNAME.warrior)[i]; }
export function armorName(id) { var a = ARMORS.filter(function (x) { return x.id === id; })[0]; return a ? a.n : 'なし'; }
export var ITEMS = {
  potion: { ic: '🧪', n: '回復のしずく', d: 'HPを20回復', p: 30, team: true },
  ether:  { ic: '🔷', n: 'マナの実', d: 'MPを3回復', p: 40, team: true },
  wing:   { ic: '🪶', n: '帰還の羽', d: 'エリアから町へ一瞬でもどる（ひとりで冒険だけ）', p: 20 }
};
export var ITEM_KEYS = ['potion', 'ether', 'wing'];
export var FACS = [
  { ic: '⛲', nm: '広場', ds: '町の真ん中', st: 0 }, { ic: '🧪', nm: '道具屋', ds: '回復アイテム', st: 1 },
  { ic: '⛪', nm: '教会', ds: 'スキルの振り直し・見た目の変更', st: 2 }, { ic: '⚔️', nm: '武器・防具屋', ds: '装備を買う', st: 3 },
  { ic: '📚', nm: '図書館', ds: '知識の書を読む', st: 4 }, { ic: '🏰', nm: '城', ds: '称号を見る', st: 5 }
];
export var RESPEC_COST = 100;

/* 能力値。team=true のときはレベルでHPを増やさない（チームモードはレベル差をおさえる） */
export function statsOf(ch, team) {
  var j = JOBS[ch.j] || JOBS.warrior, eq = ch.eq || {}, w = WEAPONS.filter(function (x) { return x.id === eq.w; })[0], a = ARMORS.filter(function (x) { return x.id === eq.a; })[0];
  return { atk: j.atk + (w ? w.atk : 0), def: j.def + (a ? a.def : 0), mhp: j.hp + (a ? a.hp : 0) + (team ? 0 : 2 * ((ch.lv || 1) - 1)) };
}
/* ひとりで冒険の攻撃倍率（上限なし。育てた分だけ強くなる） */
export function soloMult(lv) { return 1 + 0.05 * (Math.max(1, lv) - 1); }
/* ひとりで冒険の報酬（1回の書き込みは 経験値300・ゴールド200 まで。ルールでも弾く） */
export function soloReward(enemyMax, review) { var r = review ? 0.5 : 1; return { exp: Math.min(300, Math.round(enemyMax * 0.8 * r)), gold: Math.min(200, Math.round(10 * r)) }; }
export function soloEnemyHp(areaIndex) { return 30 + 8 * areaIndex; }
