import { z } from "zod";

// 画面（ブラウザ）で使う zod。画面のコード（hook のフォームのスキーマ）は "zod" ではなくここから z を import する（Issue #449）。
//
// jitless: true … zod が検査の関数を文字列から作る（new Function。JIT）のをやめ、eval が使えるかの試し（new Function("")）もしない。
//   WHY: 画面の CSP は script-src に 'unsafe-eval' を入れない（shared/security/security-headers.ts）。zod 4 は z.object を作るときに
//   new Function("") で eval が使えるかを試し、失敗の例外は握りつぶすが、ブラウザはそれを CSP の違反（script-src eval）として報告する
//   （zod 4.6.5 の v4/core/util.js の allowsEval のコメントにも、jitless はこのために試しを省くとある）。E2E
//   （apps/e2e/spec/security-headers.feature の「ブラウザがブロックした読み込みは 1 件も無い」）がこの違反で落ちた（2026-10-03 実測）。
//   JIT は大きなオブジェクトの検査を速くするためのもので、画面のフォーム（項目 1 つ）では差が出ない。
// WHY 設定をこのモジュールに置く（各 hook で z.config を呼ばない）: zod の設定は globalThis の 1 つの値で、スキーマを作る前に
//   設定されていないと試しが走る。z をここからだけ取らせれば、どの画面でも使う前に必ず設定される。
// WHY 関数でなく読み込み時の文で設定する: z.config はモジュールの最上位で 1 回呼べばよく、クラスの static メソッドに包むと呼び忘れうる。
z.config({ jitless: true });

export { z };
