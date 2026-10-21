/*
 * Firebase の接続設定（プロジェクト qraft-e4345 / Sparkプラン）。
 *
 * ★この値は「秘密のパスワード」ではない（Webアプリの設定は画面から誰でも読める）。
 *   守るのは Realtime Database の「ルール」の役目。
 * ★匿名ログイン（Authentication）を使うので、apiKey は正確である必要がある。
 *   接続先を決めるのは databaseURL。
 */
window.QRAFT_FIREBASE = {
  apiKey: "AIzaSyDlwQizZYHkv0KXQ2wcq1ivNFzJeDgELT0",
  authDomain: "qraft-e4345.firebaseapp.com",
  databaseURL: "https://qraft-e4345-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qraft-e4345",
  storageBucket: "qraft-e4345.firebasestorage.app",
  messagingSenderId: "1088665926647",
  appId: "1:1088665926647:web:8fc1841bc26adb3d424cf2"
};
