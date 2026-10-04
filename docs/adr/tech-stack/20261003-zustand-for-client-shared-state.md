# frontend の画面をまたぐクライアントだけの状態は zustand で持ち、store は stores/ の下にだけ置く

- 日付: 2026-10-03
- 状態: 採用
- 関連: Issue #452 / `apps/frontend_customer/package.json` / `rule-tests/architecture.test.ts` の `zustand-in-stores` / `.claude/rules/code/frontend.md` の「クライアントの共有状態」 / ADR `docs/adr/tech-stack/20261003-tanstack-query-react-hook-form-react-compiler.md`

## 背景
frontend の状態は、サーバのデータを TanStack Query、フォームの値を React Hook Form、1 画面の状態を `useState` と画面の hook で持つ（ADR `docs/adr/tech-stack/20261003-tanstack-query-react-hook-form-react-compiler.md`）。画面をまたいで共有するクライアントだけの状態（サーバに無い・URL に載せない UI の状態）を持つ仕組みは決めていなかった。決めないまま要るようになると、React Context・モジュールの変数・別のライブラリが画面ごとに混ざり、サーバのデータまで共有の状態に写されうる。
制約: Server Components での取得・Server Actions は使わない。Client Components も Next のサーバの描画（SSR）で動く。版は react 19.2.8 / next 16.3.6。

## 決定
- 画面をまたいで共有するクライアントだけの状態は zustand（`zustand@5.0.15`、MIT、`apps/frontend_customer` の dependencies）で持つ。サーバのデータ・フォームの値・1 画面の状態は zustand に入れない。
- store は `apps/frontend_customer/features/<f>/stores/`（1 つの feature の画面をまたぐ状態）と `apps/frontend_customer/shared/stores/`（feature をまたぐ状態）の下にだけ置く。`"zustand"`（サブパスも、型だけも）を import してよいのはこの下だけで、`rule-tests/architecture.test.ts` の規則 `zustand-in-stores` が止める。
- store はモジュールの最上位で作らず、Provider が mount ごとに 1 回作って context で配る（zustand の Next.js の手引きの per-request store。`shared/query/query-provider.tsx` の `QueryClient` と同じ形）。
- 今は使う store が無いので、依存だけを入れ、store は作らない。

## 理由
- 状態の種類ごとに持つ場所を 1 つにする。zustand を「画面をまたぐクライアントだけの状態」に限ると、TanStack Query のキャッシュ（無効化・再取得）と同じデータを二重に持たない。
- Provider で配った store も hook 1 つで読め、selector で読む値を選んだ部品だけが描き直される。React の `useSyncExternalStore` で store を購読する（`zustand@5.0.15` の `esm/react.mjs`。2026-10-03 に確認）。
- store を置く場所を決めると、共有の状態の一覧がディレクトリで読め、「store にしてよい状態か」をレビューで見る場所が 1 つになる。zustand への依存も `stores/` に閉じ込められ、ライブラリを替えるときは `stores/` の中だけを直せばよい。名前を `stores/` にするのは、feature の中の役割のディレクトリ（`api/`・`hooks/`・`components/`）と同じく複数形の役割名にそろえるため。
- モジュールの最上位の store は、Next のサーバではすべての要求で共有される。zustand の Next.js の手引きは、store を要求ごとに作り、グローバルの store を置かないことを勧めている（https://github.com/pmndrs/zustand/blob/main/docs/learn/guides/nextjs.md の「No global stores」。2026-10-03 に確認。手引きの冒頭に、今後更新するとの注記がある）。

## 採用しなかった案
- Jotai: 小さな atom を組み合わせる形で、状態が散らばりやすく、どこに何の共有の状態があるかをディレクトリで決めにくい。
- Redux Toolkit: action・reducer・slice の決まりが多く、今の規模（store がまだ無い）には重い。
- React Context だけ: Provider の値が変わると、値の一部しか使わない部品も描き直され、読む値を選ぶ仕組み（selector）を自前で書くことになる。

## 影響
- 良い点: 共有の状態の置き場所とライブラリが先に決まり、要るようになったときに画面ごとの書き方がばらつかない。
- 悪い点: まだ使わない依存が 1 つ増える（依存は無く、`react` は peer）。Renovate の更新の対象になる。
- 見直す条件: zustand の Next.js の手引きが更新されたとき。共有の状態を URL（検索のパラメータ）やサーバに移す方針に変えるとき。
