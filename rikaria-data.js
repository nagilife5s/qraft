/*
 * リカリア（チーム戦の作り直し・第2版）の決まりごと。数値と名前はここだけに置く。
 * 出どころ：職業と技｜案.md（技60個・ランク）・ワスレモノの苦手な精霊｜案.md（タイプと苦手）・
 *           依頼文/済み/番人48体の設計と画像依頼文.md（番人）・クエスト・チーム戦の作り直し｜方向性.md（8.5 数値）
 * 画面も通信も持たない。rikaria-engine.js・rikaria-host.html・rikaria-play.html・quest.html（ソロ）が読む。
 */

/* ------------------------------------------------------------ レベル・経験値・スキルポイント */
export var LV_MAX = 50;
/* 次のレベルまでの経験値：100＋50×Lv（650で頭打ち） */
export function expToNext(lv) { return Math.min(650, 100 + 50 * lv); }
/* 経験値を足して、レベル・残りSP・もらったSPの合計を進める。上がったレベルの数を返す */
export function addExp(c, gain) {
  c.exp = (c.exp || 0) + Math.max(0, Math.round(gain)); var up = 0;
  while ((c.lv || 1) < LV_MAX && c.exp >= expToNext(c.lv || 1)) { c.exp -= expToNext(c.lv || 1); c.lv = (c.lv || 1) + 1; c.sp = (c.sp || 0) + 1; c.spt = (c.spt || 0) + 1; up++; }
  if ((c.lv || 1) >= LV_MAX) c.exp = 0;
  return up;
}
/* ボスを倒したときのSP（1周目2・周回3） */
export function bossSp(lap) { return lap > 0 ? 3 : 2; }
/* チーム戦のレベル差をおさえる倍率（上限1.5倍） */
export function lvMult(lv) { return Math.min(1.5, 1 + 0.012 * (Math.max(1, lv) - 1)); }

/* 技を覚えるレベル（10個の並び順） */
export var LEARN = [1, 3, 5, 8, 12, 16, 20, 25, 30, 36];
/* ランクアップに要るSP［2つ目の名前へ, 3つ目の名前へ］。MPで決まる */
export function rankCost(mp) { return mp >= 5 ? [6, 12] : mp >= 3 ? [4, 8] : mp >= 2 ? [3, 6] : [2, 4]; }
/* ランク（0〜2）ごとの強さ */
export var RANK_POW = [1, 1.35, 1.75], RANK_SEC = [1, 1.25, 1.5];
export var MP_MAX = 6;
/* 準備画面で持っていく技：ふつうの技4つ＋必殺技1つ */
export var LOAD_N = 4;

/*
 * 技の効果（エンジンが読む）。1つの技に、次の部品を組み合わせる。
 *   pow 威力（ふつうの攻撃＝1）・hits 回数・all 敵全体・crit 必ず会心・vsChg ためている敵に2倍・cancel ためを打ち消す
 *   bossX ボスと番人に何倍・hpPct 敵の残りHPの割合ダメージ・pierce バリアをつらぬく・barrierX バリアに何倍
 *   slow 敵の攻撃を遅らせる秒・stun 止める秒・dot しばらく少しずつ{pow,sec}
 *   heal 回復（班全員・最大HPの割合）・healOne 仲間1人（いちばん減っている人）・revive 倒れた仲間を全員起こす
 *   shield 班の受けるダメージを減らす{cut,sec}・guardSelf 自分の受けるダメージを減らす{cut,sec}・selfHeal 自分を回復
 *   buff 班の攻撃を上げる{x,sec}・mpOne 仲間1人にMP・mpAll 班全員にMP・regen しばらく回復{pct,sec}・mpRate 正解のMPが増える{sec}
 *   nextCrit 次の攻撃が会心・keep 次の1回のまちがいで連続が切れない・counter 殴り返す{pow,sec}・trap わな{stun}
 *   streakX 連続正解1つにつき威力が何倍ずつ増えるか・useStreak 連続を全部使う・elem 今の精霊で攻撃・quad 4つの精霊・dual 2つの精霊
 *   reveal 苦手を班に見せる・elemBuff 班の攻撃に今の精霊を乗せる{sec}
 */
function S(lv, mp, names, d, fx, e) { e.lv = lv; e.mp = mp; e.names = names; e.d = d; e.fx = fx; return e; }

export var JOBS = {
  warrior: { n: '戦士', atk: 10, hp: 36, def: 3, mpGain: 1, color: '#e0484d', trait: '1回のダメージが大きい。HPが多い',
    sk: [
      S(1, 1, ['スラッシュ', 'ダブルスラッシュ', 'ソニックスラッシュ'], 'すばやく2回切る', '01', { pow: .9, hits: 2 }),
      S(3, 2, ['ファイアソード', 'ブレイズスラッシュ', 'フレイムブレード'], '炎の一撃で大ダメージ', '02', { pow: 2.6 }),
      S(5, 1, ['ガッツ', 'ガッツチャージ', 'アイアンハート'], '自分のHPを少し回復し、しばらく受けるダメージを減らす', '24', { selfHeal: .25, guardSelf: { cut: .5, sec: 15 } }),
      S(8, 2, ['なぎはらい', 'ワイドスラッシュ', 'トルネードスラッシュ'], '敵全体をなぎはらう', '05', { pow: 1.4, all: 1 }),
      S(12, 5, ['ギガブレイク', 'ラグナブレイク', 'ラグナロク'], '必殺技：特大の一撃', '25', { pow: 7, ult: 1 }),
      S(16, 3, ['ウォークライ', 'ブレイブクライ', 'ヒーローズクライ'], 'さけんで、しばらく班全員の攻撃を上げる', '24', { buff: { x: 1.3, sec: 20 } }),
      S(20, 2, ['アイスソード', 'フロストブレード', 'アブソリュートゼロ'], '氷の剣で切り、敵の動きを遅くする', '03', { pow: 1.8, slow: 4 }),
      S(25, 3, ['ガードブレイク', 'クラッシュブレイク', 'インパクトブレイク'], 'ためている敵に当てると、ためを打ち消す', '25', { pow: 2, cancel: 1 }),
      S(30, 3, ['サンダーソード', 'ライトニングブレード', 'ボルテックスブレード'], 'いなずまの剣。バリアに2倍', '04', { pow: 2.6, barrierX: 2, pierce: 1 }),
      S(36, 5, ['ドラゴンスラッシュ', 'ドラゴンバスター', 'ドラゴニックノヴァ'], '必殺技：竜の力で敵全体に特大ダメージ', '20', { pow: 4.5, all: 1, ult: 1 })
    ] },
  mage: { n: '魔法使い', atk: 9, hp: 28, def: 0, mpGain: 1.5, color: '#6a5bd6', trait: 'MPがたまりやすい。全体への大技',
    sk: [
      S(1, 1, ['フレア', 'フレアバースト', 'ギガフレア'], '小さな火の玉', '02', { pow: 1.8 }),
      S(3, 2, ['スパーク', 'サンダー', 'ライトニングボルト'], 'いなずまで敵全体を攻撃', '04', { pow: 1.2, all: 1 }),
      S(5, 1, ['アクアショット', 'アクアバレット', 'アクアスパイラル'], '水の弾。続けて当てると強くなる', '06', { pow: 1.4, streakX: .15 }),
      S(8, 2, ['アイス', 'アイスロック', 'ブリザード'], '氷で敵1体の動きを少し止める', '03', { pow: 1.4, stun: 4 }),
      S(12, 5, ['スターダスト', 'ステラフォール', 'スーパーノヴァ'], '必殺技：星を降らせて、敵全体に大ダメージ', '18', { pow: 3.6, all: 1, ult: 1 }),
      S(16, 3, ['マナシェア', 'マナギフト', 'マナブレッシング'], '仲間1人にMPを分ける', '08', { mpOne: 3 }),
      S(20, 2, ['ウインドカッター', 'ストームカッター', 'テンペスト'], '風の刃で敵全体を2回攻撃', '05', { pow: .8, hits: 2, all: 1 }),
      S(25, 3, ['マジックバリア', 'マジックウォール', 'アルカナウォール'], '班全員の受けるダメージを減らす', '11', { shield: { cut: .4, sec: 20 } }),
      S(30, 3, ['グラビティ', 'グラビティプレス', 'ブラックホール'], '敵の残りHPに合わせた大ダメージ（ボスに強い）', '17', { hpPct: .12, bossX: 1.5 }),
      S(36, 5, ['メテオ', 'メテオストライク', 'メテオスウォーム'], '必殺技：いん石を落として敵全体に特大ダメージ', '19', { pow: 4.8, all: 1, ult: 1 })
    ] },
  priest: { n: '僧侶', atk: 7, hp: 30, def: 1, mpGain: 1, color: '#e9c46a', trait: '正解したとき、攻撃か回復を選べる。倒れた仲間を起こせる', healOnOk: .12,
    sk: [
      S(1, 1, ['ライトボール', 'ホーリーショット', 'ホーリーレイ'], '光の玉で攻撃', '08', { pow: 1.8 }),
      S(3, 2, ['ヒール', 'ルミエール', 'グランドヒール'], '班全員のHPを回復', '10', { heal: .35 }),
      S(5, 1, ['キュア', 'ハイキュア', 'パーフェクトキュア'], '仲間1人を大きく回復', '10', { healOne: .6 }),
      S(8, 2, ['シールド', 'ライトシールド', 'ホーリーウォール'], 'しばらく班全員の受けるダメージを減らす', '11', { shield: { cut: .35, sec: 20 } }),
      S(12, 5, ['リバイブ', 'リヴァイヴオール', 'ミラクルライト'], '必殺技：倒れた仲間を全員起こして、全回復', '21', { revive: 1, heal: 1, ult: 1 }),
      S(16, 3, ['ライトスピア', 'ホーリーランス', 'セイクリッドランス'], '光の槍で大ダメージ。ボスに強い', '09', { pow: 2.4, bossX: 1.5 }),
      S(20, 2, ['ブレス', 'ホーリーブレス', 'ゴッドブレス'], '班全員のMPを1ふやす', '10', { mpAll: 1 }),
      S(25, 3, ['ジャッジ', 'ホーリージャッジ', 'ラストジャッジメント'], '敵全体に光の攻撃。ためている敵に2倍', '09', { pow: 1.3, all: 1, vsChg: 2 }),
      S(30, 3, ['リジェネ', 'ハイリジェネ', 'エターナルリジェネ'], 'しばらく、班全員のHPが少しずつ回復する', '10', { regen: { pct: .03, sec: 25 } }),
      S(36, 5, ['エンジェルウィング', 'エンジェルハロー', 'ヘブンズゲート'], '必殺技：敵全体に大ダメージ＋班全員を回復', '21', { pow: 3.2, all: 1, heal: .6, ult: 1 })
    ] },
  hunter: { n: '狩人', atk: 9, hp: 30, def: 1, mpGain: 1, color: '#4caf50', trait: '会心が出やすい。ためている敵に当てると、ためが遅れる', crit: .25, delayChg: 2,
    sk: [
      S(1, 1, ['クイックショット', 'ラピッドショット', 'ソニックアロー'], 'すばやく1本', '12', { pow: 1.9 }),
      S(3, 2, ['ダブルアロー', 'トリプルアロー', 'スプレッドアロー'], '2体に同時に当てる', '12', { pow: 1.5, multi: 2 }),
      S(5, 1, ['ねらいうち', 'ロックオン', 'パーフェクトエイム'], '次の攻撃が必ず会心になる', '12', { nextCrit: 1 }),
      S(8, 2, ['ストップアロー', 'バインドアロー', 'タイムロックアロー'], '敵1体の動きを5秒止める', '12', { pow: 1, stun: 5 }),
      S(12, 5, ['アローレイン', 'メテオアロー', 'スターダストアロー'], '必殺技：たくさんの矢を降らせる', '13', { pow: 3.8, all: 1, ult: 1 }),
      S(16, 3, ['ポイズンアロー', 'ベノムアロー', 'デッドリーベノム'], 'しばらく、敵1体に少しずつダメージ', '16', { pow: .8, dot: { pow: .5, sec: 15 } }),
      S(20, 2, ['ファイアアロー', 'フレイムアロー', 'フェニックスアロー'], '炎の矢', '02', { pow: 2.4 }),
      S(25, 3, ['トラップ', 'ネットトラップ', 'ハンタートラップ'], 'わなをしかけ、次に攻撃してきた敵を止める', '12', { trap: { stun: 6 } }),
      S(30, 3, ['ピアシングアロー', 'ブレイクアロー', 'シールドブレイカー'], 'バリアをつらぬく矢', '12', { pow: 2.6, pierce: 1, barrierX: 1.5 }),
      S(36, 5, ['ムーンアロー', 'フルムーンアロー', 'ルナストライク'], '必殺技：月の光の矢で敵全体に特大ダメージ。必ず会心', '22', { pow: 3, all: 1, crit: 1, ult: 1 })
    ] },
  monk: { n: '武闘家', atk: 8, hp: 34, def: 2, mpGain: 1, color: '#ff8a1c', trait: '続けて正解するほど強くなる（最大5連続）。まちがえると元に戻る', streakAtk: .15, streakMax: 5,
    sk: [
      S(1, 1, ['ジャブ', 'ストレート', 'マッハパンチ'], 'すばやいパンチ', '14', { pow: 1.8 }),
      S(3, 2, ['れんげき', 'さんれんげき', 'ごれんげき'], '3回つづけて殴る', '14', { pow: .9, hits: 3 }),
      S(5, 1, ['キック', 'ハイキック', 'トルネードキック'], 'まわしげり。連続正解が多いほど強い', '14', { pow: 1.2, streakX: .2 }),
      S(8, 2, ['きあいため', 'スーパーきあい', 'ハイパーきあい'], '次に1回まちがえても、連続が切れない', '24', { keep: 1 }),
      S(12, 5, ['ひゃくれつけん', 'せんれつけん', 'むそうれっぱ'], '必殺技：連続正解の数だけ殴る', '14', { pow: 1.4, hitsStreak: 1, ult: 1 }),
      S(16, 3, ['カウンター', 'クロスカウンター', 'ミラーカウンター'], 'しばらく、攻撃してきた敵に殴り返す', '14', { counter: { pow: 1.5, sec: 20 } }),
      S(20, 2, ['エナジーショット', 'エナジーブラスト', 'フルエナジー'], '気の弾で敵全体を攻撃', '15', { pow: 1.3, all: 1 }),
      S(25, 3, ['アイアンボディ', 'スチールボディ', 'ダイヤモンドボディ'], '体をかたくして、受けるダメージを大きく減らす', '11', { guardSelf: { cut: .7, sec: 20 } }),
      S(30, 3, ['かかとおとし', 'ドラゴンキック', 'ライジングドラゴン'], '1体に大ダメージ。連続正解が多いほど強い', '20', { pow: 2.2, streakX: .25 }),
      S(36, 5, ['ゴッドハンド', 'ゴッドフィスト', 'ゴッドインパクト'], '必殺技：連続正解を全部使って、特大の一撃', '14', { pow: 4, useStreak: .6, ult: 1 })
    ] },
  summoner: { n: '精霊使い', atk: 8, hp: 28, def: 0, mpGain: 1, color: '#2ec4b6', trait: '火・水・風・土の精霊を切りかえる。苦手な精霊で当てると2倍',
    sk: [
      S(1, 1, ['ファイア／アクア／ウインド／ストーン', '○○ボール', '○○ストライク'], '今の精霊で小さな攻撃', 'elem', { pow: 1.5, elem: 1 }),
      S(3, 2, ['エレメントショット', 'エレメントバースト', 'エレメントノヴァ'], '今の精霊で敵全体を攻撃', 'elem', { pow: 1.1, all: 1, elem: 1 }),
      S(5, 1, ['せいれいのささやき', 'ウィークサーチ', 'オールスキャン'], '敵全員の苦手な精霊を、班全員に見せる', '18', { reveal: 1 }),
      S(8, 2, ['せいれいのかご', 'せいれいのまもり', 'せいれいおうのかご'], 'しばらく、班全員の攻撃に今の精霊の力が乗る', '23', { elemBuff: { sec: 20 } }),
      S(12, 5, ['エレメントストーム', 'クアトロストーム', 'エレメンタルカオス'], '必殺技：4つの精霊で敵全体を攻撃。苦手が必ず当たる', '23', { pow: 3, all: 1, quad: 1, ult: 1 }),
      S(16, 3, ['ヒールスプリング', 'アクアヒール', 'いやしのいずみ'], '水の精霊で班全員を回復', '06', { heal: .3 }),
      S(20, 2, ['ストーンウォール', 'ロックウォール', 'ガイアウォール'], '土の精霊のかべで、班全員を守る', '07', { shield: { cut: .35, sec: 18 } }),
      S(25, 3, ['ウインドステップ', 'ゲイルステップ', 'ストームステップ'], '風の精霊で、しばらく班全員のMPがたまりやすくなる', '05', { mpRate: { sec: 20 } }),
      S(30, 3, ['ダブルエレメント', 'ツインエレメント', 'デュアルノヴァ'], '2つの精霊で2回攻撃', '23', { pow: 1.6, hits: 2, dual: 1 }),
      S(36, 5, ['スピリットキング', 'エレメントキング', 'グランドスピリット'], '必殺技：精霊王を呼んで、敵全体に特大ダメージ', '23', { pow: 4.6, all: 1, quad: 1, ult: 1 })
    ] }
};
export var JOB_KEYS = ['warrior', 'mage', 'priest', 'hunter', 'monk', 'summoner'];

/* 精霊（精霊使い） */
export var ELEMS = ['fire', 'water', 'wind', 'earth'];
export var ELEM = {
  fire:  { n: '火', sp: 'ヒコン', ic: '🔥', col: '#ff5a3c', img: 'img/rikaria/chara/spirit-fire.webp', weak: 'water', head: 'ファイア', tail: 'ファイア' },
  water: { n: '水', sp: 'シズク', ic: '💧', col: '#3c9dff', img: 'img/rikaria/chara/spirit-water.webp', weak: 'earth', head: 'アクア', tail: 'アクア' },
  wind:  { n: '風', sp: 'フウタ', ic: '🌪', col: '#4cd07d', img: 'img/rikaria/chara/spirit-wind.webp', weak: 'fire', head: 'ウインド', tail: 'ウインド' },
  earth: { n: '土', sp: 'ゴロ', ic: '🪨', col: '#b07a3c', img: 'img/rikaria/chara/spirit-earth.webp', weak: 'wind', head: 'ストーン', tail: 'ストーン' }
};
/* タイプ t の敵が苦手な精霊 */
export function weakOf(t) { return ELEM[t] ? ELEM[t].weak : null; }

/* 技の名前（ランクごと。精霊使いの1つ目は今の精霊で名前が変わる） */
export function skillName(job, i, rank, elem) {
  var s = JOBS[job].sk[i], r = Math.max(0, Math.min(2, rank || 0));
  if (job === 'summoner' && i === 0) { var h = ELEM[elem || 'fire'].head; return r === 0 ? h : h + (r === 1 ? 'ボール' : 'ストライク'); }
  return s.names[r];
}
export function isUlt(job, i) { return !!JOBS[job].sk[i].ult; }

/* ------------------------------------------------------------ キャラ（第2版） */
export function heroImg(job, look) {
  var j = JOBS[job] ? job : 'warrior', l = look === 'b' && job !== 'mage' ? 'b' : 'a';   /* 魔法使いBは絵ができるまでA */
  return 'img/rikaria/chara/' + j + '-' + l + '.webp';
}
export function fieldImg(job, look, dir) {
  var j = JOBS[job] ? job : 'warrior', l = look === 'b' && job !== 'mage' ? 'b' : 'a';
  return 'img/rikaria/field/' + j + '-' + l + '-' + (dir || 'down') + '.webp';
}
/* 覚えている技の番号 */
export function learned(lv) { return LEARN.map(function (L, i) { return L <= (lv || 1) ? i : -1; }).filter(function (i) { return i >= 0; }); }
export function rankOf(ch, i) { var r = ch && ch.sr && ch.sr[i]; return Math.max(0, Math.min(2, Number(r) || 0)); }
/* 使ったSPの合計（ルールの「sp＋使った分＝もらった合計」と同じ計算） */
export function spUsed(ch) {
  var J = JOBS[ch.j] || JOBS.warrior, t = 0;
  J.sk.forEach(function (s, i) { var r = rankOf(ch, i), c = rankCost(s.mp); if (r >= 1) t += c[0]; if (r >= 2) t += c[1]; });
  return t;
}
/* 次のランクに上げられるか（覚えていて・SPが足りる） */
export function canRankUp(ch, i) {
  var s = (JOBS[ch.j] || JOBS.warrior).sk[i], r = rankOf(ch, i);
  return r < 2 && LEARN[i] <= (ch.lv || 1) && (ch.sp || 0) >= rankCost(s.mp)[r];
}
export function rankUp(ch, i) {
  if (!canRankUp(ch, i)) return false;
  var s = (JOBS[ch.j] || JOBS.warrior).sk[i], r = rankOf(ch, i);
  ch.sp -= rankCost(s.mp)[r]; ch.sr = Object.assign({}, ch.sr || {}); ch.sr[i] = r + 1; return true;
}
/* 持っていく技（覚えていない技は外す。足りないときは覚えた順に入れる） */
export function loadoutOf(ch) {
  var J = JOBS[ch.j] || JOBS.warrior, got = learned(ch.lv), ld = ch.ld || {};
  var normal = got.filter(function (i) { return !J.sk[i].ult; }), ults = got.filter(function (i) { return J.sk[i].ult; });
  var a = (Array.isArray(ld.a) ? ld.a : []).map(Number).filter(function (i, k, arr) { return normal.indexOf(i) >= 0 && arr.indexOf(i) === k; }).slice(0, LOAD_N);
  normal.forEach(function (i) { if (a.length < LOAD_N && a.indexOf(i) < 0) a.push(i); });
  var u = ults.indexOf(Number(ld.u)) >= 0 ? Number(ld.u) : (ults.length ? ults[ults.length - 1] : -1);
  return { a: a, u: u };
}
/* 第1版のキャラ（sk に3つのランク）を第2版に移す。振っていたポイントは返す。変えたら true */
export function migrateChar(ch) {
  if (!ch) return false;
  var changed = false;
  if (ch.sk != null || ch.spt == null) {
    ch.spt = Math.max(0, (ch.lv || 1) - 1); ch.sr = ch.sr || {};
    ch.sp = Math.max(0, ch.spt - spUsed(ch)); delete ch.sk; changed = true;
  }
  if (ch.lv > LV_MAX) { ch.lv = LV_MAX; changed = true; }
  return changed;
}
/* 能力値（チーム戦はレベルでHPを増やさない） */
export var WEAPONS = [{ id: 'w1', atk: 2, p: 120 }, { id: 'w2', atk: 4, p: 300 }, { id: 'w3', atk: 7, p: 700 }];
export var ARMORS = [{ id: 'a1', n: '旅人の服', def: 1, hp: 4, p: 100 }, { id: 'a2', n: 'くさりかたびら', def: 2, hp: 8, p: 260 }, { id: 'a3', n: '光のよろい', def: 4, hp: 14, p: 600 }];
var WNAME = { warrior: ['ブロンズソード', 'はがねの剣', 'きらめきの大剣'], mage: ['見習いの杖', 'ルーンの杖', '星くずの杖'], priest: ['木のメイス', '白銀のメイス', '聖なるメイス'],
  hunter: ['木の弓', '狩人の長弓', '月光の弓'], monk: ['布のバンテージ', '鉄のナックル', '竜のこぶし'], summoner: ['精霊の小枝', '四色のロッド', '精霊王のロッド'] };
export function weaponName(job, id) { var i = WEAPONS.findIndex(function (w) { return w.id === id; }); return i < 0 ? 'なし' : (WNAME[job] || WNAME.warrior)[i]; }
export function statsOf(ch, team) {
  var j = JOBS[ch.j] || JOBS.warrior, eq = ch.eq || {}, w = WEAPONS.filter(function (x) { return x.id === eq.w; })[0], a = ARMORS.filter(function (x) { return x.id === eq.a; })[0];
  return { atk: j.atk + (w ? w.atk : 0), def: j.def + (a ? a.def : 0), mhp: j.hp + (a ? a.hp : 0) + (team ? 0 : 2 * ((ch.lv || 1) - 1)) };
}

/* ------------------------------------------------------------ 単元・敵 */
/* 1単元：ダンジョンの名前・ワスレモノ6体・番人4体（1〜4階）・ボス。t＝タイプ（苦手は weakOf） */
function U(id, g, unit, area, z, guards, boss) { return { id: id, g: g, unit: unit, area: area, z: z, guards: guards, boss: boss }; }
function Z(n, t) { return { n: n, t: t }; }
export var UNITS = [
  U('matter', 1, '物質', 'まどろみの錬金工房',
    [Z('メタリッチ', 'earth'), Z('ドンブーカ', 'water'), Z('バナーラ', 'fire'), Z('アワボン', 'wind'), Z('トケルン', 'water'), Z('ミストル', 'wind')],
    [Z('ビーカーン', 'earth'), Z('ミツドラン', 'water'), Z('ヨウカイダー', 'water'), Z('ジョウタイガ', 'wind')], Z('錬金王アルケミラ', 'fire')),
  U('classify', 1, '分類', 'ささやきの森',
    [Z('ケンビーン', 'earth'), Z('ハナビラン', 'wind'), Z('マツボック', 'earth'), Z('シダモジャ', 'water'), Z('フタバッタ', 'wind'), Z('セキツイン', 'fire')],
    [Z('ルーペオン', 'earth'), Z('シュシーノ', 'wind'), Z('ネッコグモ', 'water'), Z('ドウブツカイ', 'fire')], Z('森の賢者ブンルイオウ', 'earth')),
  U('force', 1, '音・光・力', 'ひびきの洞窟',
    [Z('トツレンズ', 'fire'), Z('オトナミン', 'wind'), Z('バネッチョ', 'wind'), Z('ツリアイン', 'earth'), Z('ジュウリョク', 'earth'), Z('ハタラキン', 'water')],
    [Z('ハンシャン', 'fire'), Z('クッセツリュウ', 'water'), Z('シンドウキ', 'wind'), Z('マサツオウ', 'earth')], Z('反射の魔鏡ミラージュ', 'fire')),
  U('earth', 1, '大地', 'ゆらぎの火山',
    [Z('マグマル', 'fire'), Z('カザンバイ', 'wind'), Z('カセイガン', 'earth'), Z('ユレルン', 'earth'), Z('ピーエスナミ', 'water'), Z('プレートン', 'water')],
    [Z('チソウガメ', 'earth'), Z('カセキング', 'earth'), Z('タイセキン', 'water'), Z('シンゲンジン', 'fire')], Z('大地の竜ガイアドラ', 'fire')),
  U('life', 2, '植物と動物', 'いのちの大樹',
    [Z('サイボック', 'water'), Z('コウゴウセン', 'wind'), Z('ショウカン', 'water'), Z('コキュウン', 'wind'), Z('ハートドク', 'fire'), Z('シンケーン', 'earth')],
    [Z('ヨウリョクタイ', 'wind'), Z('ジョウサン', 'water'), Z('ショウカコソ', 'earth'), Z('ハンシャー', 'fire')], Z('生命の樹王イノチノキ', 'earth')),
  U('reaction', 2, '化学変化', '結合の溶鉱炉',
    [Z('ゲンソッチ', 'earth'), Z('ブンカイン', 'fire'), Z('デンキブンカ', 'water'), Z('サンカマン', 'fire'), Z('カンゲンジャ', 'wind'), Z('シツリョーン', 'earth')],
    [Z('ネンショウジ', 'fire'), Z('カリュウテツ', 'earth'), Z('ハツネツン', 'fire'), Z('ゲンシオウ', 'wind')], Z('反応の魔王リアクター', 'fire')),
  U('weather', 2, '天気', '嵐の天空塔',
    [Z('シツドン', 'water'), Z('ロテンヌ', 'water'), Z('アツリョク', 'earth'), Z('トウアツセン', 'wind'), Z('ゼンセンジャ', 'wind'), Z('キセツフウ', 'wind')],
    [Z('キアツオウ', 'wind'), Z('ジョウショウキ', 'water'), Z('カンレイ', 'water'), Z('ヘイソクン', 'wind')], Z('嵐の王テンペスト', 'wind')),
  U('electric', 2, '電気', '雷鳴の発電所',
    [Z('セイデンキ', 'wind'), Z('デンリュー', 'water'), Z('デンアツン', 'earth'), Z('テイコウジ', 'fire'), Z('ジカイオン', 'earth'), Z('ハツデンキ', 'wind')],
    [Z('チョクレツン', 'earth'), Z('ヘイレツリュウ', 'wind'), Z('デンジコイル', 'fire'), Z('ユウドウオウ', 'wind')], Z('雷帝ボルテクス', 'wind')),
  U('ion', 3, 'イオン', '水晶の電解湖',
    [Z('イオンヌ', 'wind'), Z('デンカイ', 'water'), Z('シヤクン', 'water'), Z('チュウワ', 'fire'), Z('ダニエール', 'earth'), Z('ナリヤスイ', 'earth')],
    [Z('サンセイダ', 'water'), Z('アルカリス', 'water'), Z('エンノカミ', 'earth'), Z('デンキョクン', 'fire')], Z('電解の女王イオニア', 'water')),
  U('space', 3, '天体', '星降る天文台',
    [Z('ホウイジン', 'earth'), Z('ニッシュウ', 'fire'), Z('ホシメグリ', 'wind'), Z('ミチカケ', 'water'), Z('ショクムーン', 'earth'), Z('キンセイン', 'fire')],
    [Z('チジクン', 'earth'), Z('コウテンドウ', 'fire'), Z('ワクセイン', 'wind'), Z('ギンガオウ', 'water')], Z('星の王コスモス', 'wind')),
  U('heredity', 3, '遺伝', '螺旋の神殿',
    [Z('ネッコン', 'earth'), Z('センショクタイ', 'wind'), Z('ゲンスウン', 'water'), Z('カエルラン', 'water'), Z('イデンシ', 'fire'), Z('シンカー', 'earth')],
    [Z('ブンレツン', 'water'), Z('ジュセイラン', 'fire'), Z('エンドウキシ', 'earth'), Z('ソウドウキ', 'wind')], Z('螺旋の神ヘリクス', 'water')),
  U('energy', 3, 'エネルギー', '歯車の機関城',
    [Z('シゴトン', 'earth'), Z('カッシャ', 'wind'), Z('シゴトリツ', 'wind'), Z('デンドウ', 'fire'), Z('タイリュウ', 'water'), Z('ホウシャ', 'fire')],
    [Z('フリコン', 'earth'), Z('ソクドリュウ', 'wind'), Z('ハツデンジン', 'water'), Z('ホゾンオウ', 'fire')], Z('機関王エネルギア', 'earth'))
];
var MATTER_IMG = ['metarich', 'donbuka', 'banara', 'awabon', 'tokerun', 'mistoru'];
/* 単元を、問題セットの「学年・単元」から探す（見つからなければ物質） */
export function unitOf(grade, unit) {
  return UNITS.filter(function (u) { return u.unit === unit && (!grade || u.g === Number(grade)); })[0] || UNITS.filter(function (u) { return u.unit === unit; })[0] || UNITS[0];
}
export function unitById(id) { return UNITS.filter(function (u) { return u.id === id; })[0] || UNITS[0]; }
/* 敵の絵 */
export function zakoImg(u, i) { return u.id === 'matter' ? 'img/quest/' + MATTER_IMG[i] + '.webp' : 'img/rikaria/enemy/' + u.id + '-' + (i + 1) + '.webp'; }
export function guardImg(u, fl) { return 'img/rikaria/guard/' + u.id + '-' + fl + '.webp'; }
export function bossImg(u) { return u.id === 'matter' ? 'img/quest/boss-alchemira.webp' : 'img/rikaria/enemy/' + u.id + '-boss.webp'; }
export function battleBg(u) { return u.id === 'matter' ? 'img/bg/lab.webp' : 'img/rikaria/bg/' + u.id + '.webp'; }
export function propImg(u, i) { return u.id === 'matter' ? null : 'img/rikaria/prop/' + u.id + '-' + i + '.webp'; }
export function effectImg(fx) { return 'img/rikaria/effect/fx-' + fx + '.webp'; }

/* ------------------------------------------------------------ 戦闘の数値（方向性 8.5。モックで試算済み） */
export var N = {
  hp: { zako: 23, guard: 80, boss: 150 },            /* 敵のHP＝この数×その日の人数 */
  hit: { zako: 3, guard: 4, boss: 6 },               /* ふつうの攻撃のダメージ（ボスは技の回復を入れた試算で全滅2割前後になるように） */
  atk: { zako: 7, guard: 4, boss: 4 },               /* 攻撃の間隔（秒）＝この数＋0〜3秒 */
  chg: { zako: 6, guard: 8, boss: 14 },              /* 強い攻撃のダメージ（全員） */
  chgSec: { zako: 10, guard: 10, boss: 12 },         /* ためる時間（秒） */
  guardOk: { zako: 3, guard: 3, boss: 4 },           /* ガードに要る班の正解数 */
  need: 2,                                           /* 番人の部屋が開くまでに倒す群れの数 */
  floors: 4,                                         /* 階の数（4階＋ボス） */
  revive: 2,                                         /* 倒れた人が復活するのに要る正解 */
  base: 6.2,                                         /* ふつうの攻撃の基準のダメージ（atk 9 のとき。技を使う前提で、表の時間に合わせた） */
  lapHp: 1.4, lapHit: 1.3                            /* 2周目からの強さ */
};
/* 報酬（班の全員に同じだけ） */
export var REWARD = { zako: { exp: 30, gold: 12 }, guard: { exp: 80, gold: 30 }, boss: { exp: 250, gold: 120 }, ok: 6, wipeExp: .8 };
/* 称号 */
/* 称号（ルールで20文字まで） */
export function bossTitle(u, lap) { return u.unit + 'の霧を晴らす者' + (lap > 0 ? '★' + (lap + 1) : ''); }

/* ------------------------------------------------------------ オブリオン（学期の終わり） */
export var OBLION = [
  { n: '霧影オブリオン', t: ['wind'] }, { n: '仮面の語り部オブリオン', t: ['water'] }, { n: '忘却の王オブリオン', t: ['wind', 'water', 'earth'] },
  { n: '鎖の番王オブリオン', t: ['earth'] }, { n: '白紙の翼オブリオン', t: ['wind'] }, { n: '結晶冠の大王オブリオン', t: ['earth', 'water', 'fire'] },
  { n: '双面のオブリオン', t: ['fire', 'water'] }, { n: '天球のオブリオン', t: ['fire', 'water', 'wind', 'earth'] }, { n: '真なる忘却王オブリオン', t: ['fire', 'water', 'wind', 'earth'] }
];
export function oblionImg(k) { return k <= 5 ? 'img/rikaria/boss/oblion-' + k + '.webp' : 'img/rikaria/boss/oblion-5.webp'; }
