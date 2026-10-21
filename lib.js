/*
 * Qraft 共通部品（host.html / play.html から読み込む ES モジュール）
 *
 * ・Firebase の初期化と匿名ログイン
 * ・サーバー時刻（端末の時計ずれの影響を受けないため、時間はすべてサーバー時刻で測る）
 * ・スコア式
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAuth, getAuth, signInAnonymously, browserSessionPersistence, indexedDBLocalPersistence }
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
  { shape: '▲', color: '#d9453b' },
  { shape: '◆', color: '#1268c3' },
  { shape: '●', color: '#c98f00' },
  { shape: '■', color: '#268a3f' }
];

export const RESULT_SEC = 8;   /* 正解と分布を見せる秒数 */
export const RANK_SEC = 5;     /* ランキングを見せる秒数 */

export function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
export function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
