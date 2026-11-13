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
/* 新しく作るキャラは、学年の始まりの目安のレベルから（2026-11-13 決定。転入生・3年から受け持つクラスも同じ）。
   その分のスキルポイントを持った状態で始まる。ルール（gen_rules.py）の「作るとき」と同じ値にすること */
export var START_LV = [1, 1, 16, 30];
export function startLv(grade) { return START_LV[grade] || 1; }
export function newChar(name, job, look, grade) { var L = startLv(grade); return { n: name, j: job, lk: look, lv: L, exp: 0, gold: 0, sp: L - 1, spt: L - 1 }; }
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
  var j = JOBS[job] ? job : 'warrior', l = look === 'b' ? 'b' : 'a';
  return 'img/rikaria/chara/' + j + '-' + l + '.webp';
}
export function spiritImg(e) { return 'img/rikaria/chara/spirit-' + (ELEM[e] ? e : 'fire') + '.webp'; }   /* 精霊使いの横に浮かぶ精霊 */
export function fieldImg(job, look, dir) {
  var j = JOBS[job] ? job : 'warrior', l = look === 'b' ? 'b' : 'a';
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
/* ------------------------------------------------------------ 武器・防具・道具・町（2026-11-13 確定。方向性「数値の表」）
 * 武器・防具は職業ごとに6段階。id は w1〜w6・a1〜a6（段階）。名前と効果は職業で変わる。
 * 段階kは町の段階 2×(k−1) から店に並ぶ。値段は武器・防具とも同じ。
 *   武器：攻撃（与えるダメージ）が +10%〜+100%。職業ごとのおまけ（魔法使い・精霊使い＝最大MP、僧侶＝回復量、狩人＝会心、武闘家＝最大HP）
 *   防具：受けるダメージ ×0.95〜0.5（戦士）／×0.95〜0.7（ほか）。おまけ（MP型＝最大MP、HP型＝最大HP）
 */
export var GEAR_PRICE = [150, 220, 300, 400, 500, 600];
export var GEAR_PCT = [.1, .2, .4, .6, .8, 1];
export var GEAR_TIERS = 6;
export function gearStage(k) { return 2 * (k - 1); }                       /* 段階k（1〜6）が並ぶ町の段階 */
var WNAME = {
  warrior: ['ブロンズソード', '鉄の剣', 'はがねの剣', '炎の剣', 'きらめきの大剣', '光の聖剣'],
  mage: ['見習いの杖', 'かしの杖', 'ルーンの杖', '月の杖', '星くずの杖', '賢者の杖'],
  priest: ['木のメイス', '鉄のメイス', '白銀のメイス', 'いやしのメイス', '祈りのメイス', '聖なるメイス'],
  hunter: ['木の弓', '狩人の弓', '長弓', '風切りの弓', '月光の弓', '星射ちの弓'],
  monk: ['布のバンテージ', '鉄のナックル', 'はがねのナックル', '虎のこぶし', '竜のこぶし', '覇王のこぶし'],
  summoner: ['精霊の小枝', 'かしのロッド', '四色のロッド', '精霊石のロッド', '大精霊のロッド', '精霊王のロッド']
};
var ANAME = {
  warrior: ['皮のよろい', 'くさりかたびら', '鉄のよろい', 'はがねのよろい', '竜のよろい', '光のよろい'],
  mage: ['布のローブ', '魔術師のローブ', '月光のローブ', '星のローブ', '賢者のローブ', '天空のローブ'],
  priest: ['麻の法衣', '白の法衣', '祈りの法衣', '銀の法衣', '聖者の法衣', '天使の法衣'],
  hunter: ['旅人の服', '革の胸当て', '狩人の装束', '森の外套', '風の外套', '月影の外套'],
  monk: ['道着', '黒帯の道着', '修行僧の衣', '虎の道着', '竜の道着', '覇王の道着'],
  summoner: ['精霊の衣', '若葉のローブ', '四季のローブ', '精霊のローブ', '大精霊のローブ', '精霊王のローブ']
};
var W_MP = [0, 0, 1, 1, 2, 2], W_CRIT = [.02, .04, .06, .08, .1, .12], W_HP = [2, 4, 6, 8, 10, 12];
var CUT_W = [.95, .9, .8, .7, .6, .5], CUT_O = [.95, .9, .85, .8, .75, .7];
var A_MP = [0, 1, 1, 2, 2, 3], A_HP = [3, 6, 9, 12, 15, 18];
var A_TYPE = { warrior: 'cut', mage: 'mp', summoner: 'mp', priest: 'hp', hunter: 'hp', monk: 'hp' };
function tierOf(id, c) { var k = id && id.charAt(0) === c ? Number(id.slice(1)) : 0; return k >= 1 && k <= GEAR_TIERS ? k : 0; }
export function weaponTier(id) { return tierOf(id, 'w'); }
export function armorTier(id) { return tierOf(id, 'a'); }
export function weaponName(job, id) { var k = weaponTier(id); return k ? (WNAME[job] || WNAME.warrior)[k - 1] : 'なし'; }
export function armorName(job, id) { var k = armorTier(id); return k ? (ANAME[job] || ANAME.warrior)[k - 1] : 'なし'; }
/* 店に並べる品（町の段階 st まで）。{ id, k, n, p, d（効果の説明）, st } */
export function weaponList(job, st) {
  var out = [];
  for (var k = 1; k <= GEAR_TIERS; k++) {
    var d = '攻撃 +' + Math.round(GEAR_PCT[k - 1] * 100) + '%';
    if (job === 'mage' || job === 'summoner') { if (W_MP[k - 1]) d += '・最大MP +' + W_MP[k - 1]; }
    else if (job === 'priest') d += '・回復 +' + Math.round(GEAR_PCT[k - 1] * 100) + '%';
    else if (job === 'hunter') d += '・会心 +' + Math.round(W_CRIT[k - 1] * 100) + '%';
    else if (job === 'monk') d += '・最大HP +' + W_HP[k - 1];
    out.push({ id: 'w' + k, k: k, n: weaponName(job, 'w' + k), p: GEAR_PRICE[k - 1], d: d, st: gearStage(k), open: st == null || gearStage(k) <= st });
  }
  return out;
}
export function armorList(job, st) {
  var out = [], t = A_TYPE[job] || 'cut';
  for (var k = 1; k <= GEAR_TIERS; k++) {
    var cut = (t === 'cut' ? CUT_W : CUT_O)[k - 1], d = '受けるダメージ −' + Math.round((1 - cut) * 100) + '%';
    if (t === 'mp' && A_MP[k - 1]) d += '・最大MP +' + A_MP[k - 1];
    if (t === 'hp') d += '・最大HP +' + A_HP[k - 1];
    out.push({ id: 'a' + k, k: k, n: armorName(job, 'a' + k), p: GEAR_PRICE[k - 1], d: d, st: gearStage(k), open: st == null || gearStage(k) <= st });
  }
  return out;
}
/* 装備の効果。atkX 攻撃の倍率・healX 回復の倍率・cut 受けるダメージの倍率・hp 最大HP・mp 最大MP・crit 会心 */
export function gearOf(job, eq) {
  eq = eq || {}; var w = weaponTier(eq.w), a = armorTier(eq.a), t = A_TYPE[job] || 'cut';
  var g = { atkX: 1, healX: 1, cut: 1, hp: 0, mp: 0, crit: 0 };
  if (w) {
    g.atkX = 1 + GEAR_PCT[w - 1];
    if (job === 'mage' || job === 'summoner') g.mp += W_MP[w - 1];
    if (job === 'priest') g.healX = 1 + GEAR_PCT[w - 1];
    if (job === 'hunter') g.crit = W_CRIT[w - 1];
    if (job === 'monk') g.hp += W_HP[w - 1];
  }
  if (a) {
    g.cut = (t === 'cut' ? CUT_W : CUT_O)[a - 1];
    if (t === 'mp') g.mp += A_MP[a - 1];
    if (t === 'hp') g.hp += A_HP[a - 1];
  }
  return g;
}
/* 能力値（チーム戦はレベルでHPを増やさない）。atk は武器の倍率をかけたあとの値 */
export function statsOf(ch, team) {
  var j = JOBS[ch.j] || JOBS.warrior, g = gearOf(JOBS[ch.j] ? ch.j : 'warrior', ch.eq);
  return { atk: Math.round(j.atk * g.atkX * 10) / 10, def: j.def, cut: g.cut, healX: g.healX, crit: g.crit, mmp: MP_MAX + g.mp,
           mhp: j.hp + g.hp + (team ? 0 : 2 * ((ch.lv || 1) - 1)) };
}

/* 道具屋。st＝並ぶ町の段階（1年＝0・2年＝4・3年＝8）。team＝チーム戦に持っていける */
export var ITEMS = {
  potion:  { ic: '🧪', n: '回復のしずく', d: 'HPを20回復', p: 30, st: 0, team: true, hp: 20 },
  ether:   { ic: '🔷', n: 'マナの実', d: 'MPを3回復', p: 40, st: 0, team: true, mp: 3 },
  wing:    { ic: '🪶', n: '帰還の羽', d: 'エリアから町へ一瞬でもどる（ひとりで冒険だけ）', p: 20, st: 0 },
  potion2: { ic: '🧪', n: '大きなしずく', d: 'HPを35回復', p: 55, st: 4, team: true, hp: 35 },
  ether2:  { ic: '🔷', n: '大きなマナの実', d: 'MPを5回復', p: 70, st: 4, team: true, mp: 5 },
  potion3: { ic: '✨', n: 'ひかりのしずく', d: 'HPを全回復', p: 90, st: 8, team: true, hp: 999 },
  ether3:  { ic: '🌟', n: '星のマナの実', d: 'MPを全回復', p: 110, st: 8, team: true, mp: 99 }
};
export var ITEM_KEYS = ['potion', 'ether', 'wing', 'potion2', 'ether2', 'potion3', 'ether3'];
/* チーム戦に1つだけ持っていける持ち物（回復系＝HPかMPがもどるもの） */
export function isCarry(k) { var it = ITEMS[k]; return !!(it && it.team && (it.hp || it.mp)); }
/* 持ち物の中の、持っていけるものの一覧（1つ以上あるものだけ） */
export function carryList(ch) { var inv = (ch && ch.inv) || {}; return ITEM_KEYS.filter(function (k) { return isCarry(k) && inv[k] > 0; }); }

/* 町の段階（0〜12）。単元ボスをクラスで最初に倒した班が出たら1つ進む。オブリオンでは進まない */
export var TOWN = [
  { n: '廃墟の村', d: 'がれきと枯れ木。こわれた噴水' },
  { n: '片付いた村', d: 'がれきが片付き、道ができた' },
  { n: '畑の村', d: '畑と井戸がよみがえり、木に葉が戻った' },
  { n: '家の建つ村', d: '民家が建ち直り、村の人が増えた' },
  { n: '村', d: '噴水に水が戻った' },
  { n: '広場の村', d: '石畳の広場に街灯がともった' },
  { n: '水車の村', d: '川に橋がかかり、水車が回りはじめた' },
  { n: '市場の村', d: '市場に屋台が並び、旗と花がかざられた' },
  { n: '町', d: '町を囲む壁と門ができた' },
  { n: '時計塔の町', d: '2階建ての家並みに時計塔が建った' },
  { n: '学びの町', d: '図書館と天文台が建った' },
  { n: '城のある町', d: '奥の城の修復が進んだ' },
  { n: '城下町', d: '城がよみがえり、城下町が完成した' }
];
export var TOWN_MAX = TOWN.length - 1;
export var TOWN_DEFAULT = 'ルーメンの村';
export var TOWN_NAME_MAX = 12;
/* 町の名前を整える（前後の空白を取る・12文字まで・空なら決まるまでの名前） */
export function townName(s) { var t = Array.from(String(s == null ? '' : s).replace(/\s+/g, ' ').trim()).slice(0, TOWN_NAME_MAX).join('').trim(); return t || TOWN_DEFAULT; }
/* 町の段階の絵（13枚。物語の場面に使う。まだ無いときは画面の側でかくす） */
export function townImg(stage) { return 'img/rikaria/town/stage-' + Math.max(0, Math.min(TOWN_MAX, Number(stage) || 0)) + '.webp'; }
/* クラス替えのあとの開始段階（学年の4月） */
export function townStart(grade) { return [0, 0, 4, 8][Number(grade) || 1] || 0; }

/* ゴールドの学年倍率（1年×1・2年×1.9・3年×3） */
export var GOLD = { zako: [5, 10, 15], guard: [15, 28, 45], boss: [60, 115, 180], ob: [100, 190, 300] };   /* ob＝オブリオンの形態を倒したとき（クラスの学年で決まる） */
export function goldOf(kind, grade) { var t = GOLD[kind]; return t ? t[Math.max(1, Math.min(3, Number(grade) || 1)) - 1] : 0; }
/* ひとりで冒険のゴールド：敵1体・1日の上限（学年で倍） */
export function soloGold(grade) { return 2 * Math.max(1, Math.min(3, Number(grade) || 1)); }
export function soloDayCap(grade) { return 10 * Math.max(1, Math.min(3, Number(grade) || 1)); }
/* 日本時間の日の番号（ルールと同じ計算） */
export function dayNo(ms) { return Math.floor(((ms == null ? Date.now() : ms) + 9 * 3600000) / 86400000); }

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
  hp: { zako: 23, guard: 80, boss: 130 },            /* 敵のHP＝この数×その日の人数（ボスは技を持たせた 2026-11-13 に150→130） */
  hit: { zako: 3, guard: 4, boss: 4.5 },             /* ふつうの攻撃のダメージ（ボスは技の回復を入れた試算で全滅2割前後になるように） */
  atk: { zako: 7, guard: 4, boss: 4 },               /* 攻撃の間隔（秒）＝この数＋0〜3秒 */
  chg: { zako: 6, guard: 8, boss: 14 },              /* 強い攻撃のダメージ（全員） */
  chgSec: { zako: 10, guard: 10, boss: 12 },         /* ためる時間（秒） */
  guardOk: { zako: 3, guard: 3, boss: 4 },           /* ガードに要る班の正解数 */
  need: 2,                                           /* 番人の部屋が開くまでに倒す群れの数 */
  floors: 4,                                         /* 階の数（4階＋ボス） */
  revive: 2,                                         /* 倒れた人が復活するのに要る正解 */
  base: 6.2,                                         /* ふつうの攻撃の基準のダメージ（atk 9 のとき。技を使う前提で、表の時間に合わせた） */
  lapHp: 1.4, lapHit: 1.3,                           /* 2周目からの強さ */
  /* ボスの技：every 秒ごと（はじめは first 秒後）・予兆 cast 秒。効果の強さ（ふつうの攻撃の何倍か・秒） */
  bsk: { every: 20, first: 10, cast: 2, all: .5, big: 1.3, multi: 3, multiPow: .5, seal: 25, poison: 15, psnDmg: 1, drain: 2, drainHeal: .03,
         heal: .06, heals: 2, ward: 15, wardCut: .5, rage: 15, rageX: 1.4, rageSpd: .6 },
  /* オブリオン：HP＝hp×参加人数×レベルの強さ（正答率70%・15分×2回で倒れるように試算）。hitUp＝形態が1つ進むごとの攻撃の上がり方。rest＝全滅した班が休む秒数 */
  ob: { hp: 900, hpX: [1.3, 1.35, 1.35, 1.1, 1.35, 1.05, 1.25, 1.2, .9], hitUp: .06, rest: 12, swap: 20, spin: 10 }   /* hpX＝形態ごとの補正（技と苦手の変わり方で倒す時間がちがうのをそろえる） */
};
/* 報酬（班の全員に同じだけ）。ob＝オブリオンを倒したとき、その形態の戦いに一度でも参加した人に（SPも） */
/* gold は1年の値。学年の倍率は goldOf（エンジンが使う） */
export var REWARD = { zako: { exp: 30, gold: 5 }, guard: { exp: 80, gold: 15 }, boss: { exp: 250, gold: 60 }, ob: { exp: 400, gold: 100, sp: 3 }, ok: 6, wipeExp: .8 };
/* 称号 */
/* 称号（ルールで20文字まで） */
export function bossTitle(u, lap) { return u.unit + 'の霧を晴らす者' + (lap > 0 ? '★' + (lap + 1) : ''); }

/* ------------------------------------------------------------ ボスの技（2026-11-13 決定。ボスの技｜案.md）
 * k＝型：all 全体攻撃 / big 強い全体攻撃 / multi 連続攻撃 / seal 封印 / poison 毒 / drain MP吸い / heal 回復 / ward 守り / rage 怒り
 * late＝HPが半分を切ってから使う。n2＝封印する人数。mask＝双面の仮面（0 光・1 影）のときだけ使う */
function B(n, k, x) { return Object.assign({ n: n, k: k }, x || {}); }
var L = { late: 1 };
export var BOSS_SK = {
  matter:   [B('錬金の炎', 'all'), B('ゴールドロック', 'seal'), B('エリクサー', 'heal', L)],
  classify: [B('大角の突進', 'multi'), B('ほうしの霧', 'poison'), B('年輪の守り', 'ward', L)],
  force:    [B('ミラーレイ', 'multi'), B('はね返しの鏡', 'ward'), B('プリズムバースト', 'all', L)],
  earth:    [B('火山弾', 'multi'), B('火山灰の雲', 'poison'), B('大噴火', 'all', L)],
  life:     [B('つるのしばり', 'seal'), B('花粉のあらし', 'all'), B('光合成', 'heal', L)],
  reaction: [B('ファイアバースト', 'all'), B('さびの毒', 'poison'), B('ハイパー反応', 'rage', L)],
  weather:  [B('トリプルサンダー', 'multi'), B('暴風のうず', 'all'), B('台風の目', 'ward', L)],
  electric: [B('スパークロック', 'seal'), B('ボルトストーム', 'all'), B('フルチャージ', 'rage', L)],
  ion:      [B('イオンスプラッシュ', 'multi'), B('イオンキャッチ', 'drain'), B('中和の泉', 'heal', L)],
  space:    [B('流れ星の雨', 'all'), B('日食のやみ', 'seal'), B('満月のいやし', 'heal', L)],
  heredity: [B('らせんのうず', 'all'), B('細胞分裂', 'heal'), B('突然変異', 'rage', L)],
  energy:   [B('ギアラッシュ', 'multi'), B('エネルギーすいとり', 'drain'), B('フルパワー', 'rage', L)]
};
/* 型ごとの説明（画面に出す） */
export var BSK_SAY = { all: '全員にダメージ', big: '全員に大ダメージ', multi: '連続攻撃', seal: '技が封じられた（正解1回で治る）', poison: '全員が毒に（正解1回で治る）',
  drain: '全員のMPをうばった', heal: 'HPを回復した', ward: '守りを固めた（15秒 ダメージ半分）', rage: '怒った！（15秒 攻撃が強く・速く）' };

/* ------------------------------------------------------------ オブリオン（学期の終わり。2026-11-13 決定：クラス全員で1体・持ち越しあり）
 * t＝タイプ。sw＝苦手の変わり方：hp HPが減るたび / swap 約20秒ごとに仮面が交代 / spin 約10秒ごとに順番に / guard 班がガードに成功するたび（班ごと） */
export var OBLION = [
  { n: '霧影オブリオン', t: ['wind'], sk: [B('かげのつめ', 'multi'), B('忘れの霧', 'seal')] },
  { n: '仮面の語り部オブリオン', t: ['water'], sk: [B('インクの波', 'all'), B('白紙のページ', 'drain')] },
  { n: '忘却の王オブリオン', t: ['wind', 'water', 'earth'], sw: 'hp', sk: [B('王の命令', 'rage'), B('忘れの霧', 'seal'), B('封印のうず', 'all', L)] },
  { n: '鎖の番王オブリオン', t: ['earth'], sk: [B('封印の鎖', 'seal', { n2: 2 }), B('ロックガード', 'ward')] },
  { n: '白紙の翼オブリオン', t: ['wind'], sk: [B('ページの羽ばたき', 'multi'), B('ページストーム', 'all')] },
  { n: '結晶冠の大王オブリオン', t: ['earth', 'water', 'fire'], sw: 'hp', sk: [B('クリスタルレイン', 'all'), B('封印の鎖', 'seal', { n2: 2 }), B('結晶の再生', 'heal', L)] },
  { n: '双面のオブリオン', t: ['fire', 'water'], sw: 'swap', sk: [B('光のいやし', 'heal', { mask: 0 }), B('かげの連撃', 'multi', { mask: 1 })] },
  { n: '天球のオブリオン', t: ['fire', 'water', 'wind', 'earth'], sw: 'spin', sk: [B('惑星めぐり', 'all'), B('星のすいとり', 'drain'), B('惑星直列', 'big', L)] },
  { n: '真なる忘却王オブリオン', t: ['fire', 'water', 'wind', 'earth'], sw: 'guard', sk: [B('星空の忘却', 'seal', { n2: 2 }), B('終わらない再生', 'heal'), B('ビッグバン', 'big', L)] }
];
export function oblionImg(k) { return 'img/rikaria/boss/oblion-' + Math.max(1, Math.min(9, k)) + '.webp'; }
/* 学期制ごとに使う形態（2学期制は 1・3・4・6・7・9） */
export var OB_FORMS = { 3: [1, 2, 3, 4, 5, 6, 7, 8, 9], 2: [1, 3, 4, 6, 7, 9] };
export function obNext(k, sem) { var a = OB_FORMS[sem] || OB_FORMS[3], i = a.indexOf(k); return i < 0 ? a[0] : i + 1 < a.length ? a[i + 1] : 0; }   /* 0＝もう全部たおした */
export function obFirst(grade, sem) { var a = OB_FORMS[sem] || OB_FORMS[3], per = a.length / 3; return a[Math.max(0, Math.min(2, (grade || 1) - 1)) * per]; }
export function obTitle(k) { return OBLION[k - 1].n + 'を封じた者'; }   /* 20文字まで */

/* ------------------------------------------------------------ 冒険の地図（先生の準備画面で単元をえらぶ。2026-11-13 決定）
 * 学年ごとに1枚。x・y＝場所の印の位置（絵の左上から％）。town＝町、castle＝忘却の城（かざり） */
export var ADV_MAP = [null,
  { img: 'img/quest/worldmap.webp', ratio: '2400 / 1340', town: [13, 72], castle: [88, 22],
    at: { matter: [52, 52], classify: [27, 31], force: [58, 22], earth: [80, 62] } },
  { img: 'img/rikaria/map/grade-2.webp', ratio: '1672 / 941', town: [17, 69], castle: [51, 20],
    at: { life: [13, 38], reaction: [49, 77], weather: [82, 63], electric: [87, 38] } },
  { img: 'img/rikaria/map/grade-3.webp', ratio: '1672 / 941', town: [78, 73], castle: [12, 20],
    at: { energy: [43, 16], ion: [83, 27], space: [52, 43], heredity: [22, 63] } }
];
export function advMap(grade) { return ADV_MAP[Math.max(1, Math.min(3, Number(grade) || 1))]; }
export function unitsOf(grade) { return UNITS.filter(function (u) { return u.g === Number(grade); }); }

/* ------------------------------------------------------------ 物語の場面（2026-11-13 確定。正本は 物語の場面｜下書き.md）
 * {町}＝クラスで決めた町の名前、{単元}＝単元の名前、{町の様子}＝TOWN[段階].d。1場面は2〜3文 */
export var STORY = {
  open: [null,
    { h: 'はじまりの村', s: '忘却の王オブリオンが世界の知識を封じ、{町}は霧に包まれた廃墟になった。ここに残ったのは、知識の力で戦う見習いの冒険者たち――きみたちだ。正解のひとつひとつが、この村をよみがえらせる。' },
    { h: 'ひろがる町', s: '{町}に人がもどり、噴水がふたたび歌いはじめた。けれど、霧の向こうにはまだ封じられた知識が眠っている。生命、変化、空、電気。新しい冒険が待っている。' },
    { h: '城のよみがえる日', s: '壁と門に守られて、{町}は町になった。奥の城だけが、まだ霧の中で眠っている。最後の知識を取りもどし、オブリオンとの決着をつけよう。' }],
  bossEnd: '「{単元}の知識」が{町}にもどってきた。――{町の様子}。',
  boss: {
    matter: '工房の炉の火が静まり、ビーカーの中に澄んだ水が満ちる。物の性質を見分ける力が、きみたちの手にもどった。',
    classify: 'ざわめいていた森が静かになり、木々が名前を思い出したように葉をゆらす。仲間どうしを見分ける目が、もどってきた。',
    force: '割れた鏡のかけらが光になって散り、洞窟に音がひびきわたる。見えない力をとらえる知恵が、もどってきた。',
    earth: '火山のふるえがおさまり、地層に刻まれた長い時間が語りはじめる。大地を読み解く知識が、もどってきた。',
    life: '大樹の根が大地に深くのび、枝いっぱいに花がひらく。生きもののしくみを知る力が、もどってきた。',
    reaction: '燃えさかる溶鉱炉が静まり、ばらばらだった原子がもとの結びつきを取りもどす。変化を見通す知恵が、もどってきた。',
    weather: '塔をとりまく嵐が晴れ、雲のすき間から青空がのぞく。空の変化を読む知識が、もどってきた。',
    electric: '鳴りやまなかった雷が止み、発電所にやわらかな明かりがともる。電気をあやつる知恵が、もどってきた。',
    ion: '湖の水晶がすき通り、水の中を小さな粒が静かに行き交う。目に見えない粒を見通す力が、もどってきた。',
    space: '天文台の天井に星空がもどり、星たちがふたたび決まった道をめぐりはじめる。宇宙を読み解く知識が、もどってきた。',
    heredity: '神殿の螺旋がほどけ、命から命へ受けつがれてきた記憶がよみがえる。命のつながりを知る力が、もどってきた。',
    energy: '止まっていた歯車がいっせいに回りだし、城じゅうに力が行きわたる。エネルギーのゆくえを見通す知恵が、もどってきた。'
  },
  /* オブリオンの形態1〜9：b＝戦いの前のセリフ、a＝倒したあと（倒した日だけ出す） */
  ob: [
    { b: '「知識など、霧の中に消えればよい」', a: '霧がうすれ、影はかき消えた。だが、どこかで笑い声がひびく。「まだ始まったばかりだ」' },
    { b: '「物語を書き換えてやろう。きみたちが学んだことも、白紙にもどして」', a: '仮面が割れ、インクが流れ落ちた。消されたページに、文字がもどってくる。' },
    { b: '「わが名は忘却の王。ここまで来たことは、ほめてやろう」', a: '王の姿がくずれ、霧の中へしりぞいた。「次は、もっと深い忘却で迎えよう」' },
    { b: '「知識は鎖で封じておくものだ。二度と取り出せぬように」', a: '鎖がはじけ飛び、封じられていた知識が光になってあふれ出した。' },
    { b: '「すべてのページを、白い風で吹き飛ばしてくれる」', a: '白い翼がちぎれ、舞い散ったページが{町}へ降りそそいだ。' },
    { b: '「忘れることは、やすらぎだ。なぜ、それがわからぬ」', a: '結晶の冠がくだけ、王はひざをついた。「……覚えていることが、それほど大事か」' },
    { b: '「光と影、どちらの顔がほんとうか。見破れるものなら見破ってみよ」', a: '二つの仮面が重なって消えた。残ったのは、さびしげな一つの影だった。' },
    { b: '「星々の動きさえ、わたしは忘れさせられる」', a: '星々がもとの道へもどり、天球はしずかに回りはじめた。オブリオンの声が遠くなる。' },
    { b: '「最後だ。おまえたちが学んだすべてを、ここで終わらせる」', a: '霧がすべて晴れ、オブリオンは光の粒になって消えていった。「……おぼえて、いてくれ」' }
  ],
  ending: [
    '最後の霧が晴れ、よみがえった城に朝の光がさしこんだ。{町}の人々は広場に集まり、三年間で取りもどしたすべての知識をたたえた。',
    '廃墟だったあの村は、いま、城下町になった。きみたちが答えたひとつひとつの正解が、この町の石だたみになり、明かりになり、歌になった。',
    '――忘却の霧は、もう二度と、この町をおおわない。きみたちが、覚えているかぎり。'
  ]
};
function fill(s, o) { return String(s).replace(/\{(町の様子|町|単元)\}/g, function (m, k) { return o[k] != null ? o[k] : ''; }); }
function stg(stage) { return Math.max(0, Math.min(TOWN_MAX, Number(stage) || 0)); }
/* 場面を1つ作る。{ h 見出し, s 文, img 絵 }。town＝町の名前（無ければ決まるまでの名前）、stage＝町の段階 */
export function storyOpen(grade, town, stage) {
  var g = Math.max(1, Math.min(3, Number(grade) || 1)), o = STORY.open[g];
  return { h: g + '年の章「' + o.h + '」', s: fill(o.s, { 町: town || TOWN_DEFAULT }), img: townImg(stage != null ? stage : townStart(g)) };
}
export function storyBoss(u, town, stage) {
  var st = stg(stage);
  return { h: u.boss.n + ' をたおした！', s: (STORY.boss[u.id] || '') + fill(STORY.bossEnd, { 単元: u.unit, 町: town || TOWN_DEFAULT, 町の様子: TOWN[st].d }), img: townImg(st) };
}
/* when＝'b' 戦いの前 / 'a' 倒したあと */
export function storyOb(k, when, town) {
  var i = Math.max(1, Math.min(9, Number(k) || 1)), o = STORY.ob[i - 1];
  return { h: OBLION[i - 1].n, s: fill(when === 'a' ? o.a : o.b, { 町: town || TOWN_DEFAULT }), img: oblionImg(i) };
}
/* エンディング（3つの段落を順に出す） */
export function storyEnding(town) {
  return STORY.ending.map(function (s, i) { return { h: i ? '' : '城下町の朝', s: fill(s, { 町: town || TOWN_DEFAULT }), img: townImg(TOWN_MAX) }; });
}
