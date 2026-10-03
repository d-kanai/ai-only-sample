# frontend のデータ取得は TanStack Query、フォームは React Hook Form + zod にし、React Compiler で手の memo をやめる

- 日付: 2026-10-03
- 状態: 採用
- 関連: Issue #449 / `apps/frontend_customer/next.config.ts` / `apps/frontend_customer/shared/query/` / `apps/frontend_customer/features/todo/api/todo-queries.ts` / `.claude/rules/code/frontend.md`

## 背景
frontend の hook は、`useEffect` で取得し、遅れて届いた古い応答を連番・世代・`ignore` のフラグで捨て、更新の後は手で一覧を取り直していた。コールバックは `useCallback` で包み、依存配列の変異は Stryker の等価な変異として除外していた。
制約: SSR でのデータ取得・Server Components での取得・Server Functions（Server Actions）は使わない（データは hook → `api/` → `/api/...` の Route Handler の 1 本。`.claude/rules/code/frontend.md` の「サーバロジック」）。版は react 19.2.8 / next 16.3.6。

## 決定
- 取得と更新は TanStack Query（`@tanstack/react-query`）の `useQuery` / `useMutation` で行う。クエリのキーと取得の関数は feature の `api/` のクラス（`TodoQueries` の `queryOptions`）に 1 か所で書く。更新の後は一覧を invalidate し、更新の応答を返す API は応答で 1 件のキャッシュを書き換える。
- `QueryClient` はクライアントの Provider（`shared/query/`）の `useState` で 1 回だけ作り、root layout で包む。クエリの再試行は今の挙動に合わせて止める（`retry: false`）。
- フォームは React Hook Form（`react-hook-form`）で持ち、入力の形の検証は zod（`@hookform/resolvers` の `zodResolver`）で書く。値の規則（長さなど）の正は backend の domain で、画面は空白だけの入力を送らない程度にとどめ、サーバの誤り（Problem Details の `errors`）を今までどおり表示する。
- React Compiler を有効にする（`next.config.ts` の `reactCompiler: true`、`babel-plugin-react-compiler`）。`useCallback` / `useMemo` / `memo` は手で書かない。
- 画面のテストの操作は `@testing-library/user-event` で行う（`fireEvent` は使わない）。
- React 19 の `useActionState` / `useOptimistic` / `use()` は今は使わない。

## 理由
- React の公式は、Effect での取得には競合状態・キャッシュが無い・ウォーターフォールの問題があり、フレームワークの仕組みか TanStack Query などのキャッシュを勧めている（https://react.dev/learn/synchronizing-with-effects 、2026-10-03 に確認）。Server Components で取得しない構成では、フレームワークの仕組み（Server Components の fetch・キャッシュ）を使えないので、クライアントのキャッシュのライブラリが受け持つ。
- `use()` に渡す Promise は描画の外で作ってキャッシュする前提（https://react.dev/reference/react/use ）で、クライアントだけで使うには結局キャッシュの層が要る。TanStack Query がその層になる。
- `useActionState` の action はクライアントの async 関数でもよい（https://react.dev/reference/react/useActionState ）が、送信中・失敗の状態は `useMutation` も持つ。2 つの仕組みで同じ状態を持たないよう、TanStack Query に 1 本化する。楽観的な表示が要るときは TanStack Query の `onMutate` / 変数を使う（今の画面は更新の後に一覧を取り直すだけで足りている）。
- React Hook Form は React のフォームのライブラリで最も使われており、zod とは公式のリゾルバでつながる。zod は backend の入力の検証で使っている版と同じものを使う。
- React Compiler は Next 16 で stable になり（Next 16.3.6 同梱 `01-app/02-guides/upgrading/version-16.md` の「React Compiler Support」）、`useMemo` / `useCallback` の手の memo を減らす（同梱 `reactCompiler.md`）。手の memo が無くなると、依存配列の等価な変異の除外も要らなくなる。
- user-event はブラウザでの操作（フォーカス・キー入力・クリックの順）を再現し、Testing Library が `fireEvent` より勧めている。

## 採用しなかった案
- SWR: 取得は同じくできるが、更新（mutation）と invalidate の仕組みは TanStack Query のほうが揃っている。
- 自前の取得の hook を続ける: 競合状態・キャッシュ・再取得を画面ごとに手で書くことになる（今のコードの連番と世代がそれ）。
- `@mantine/form`: Mantine を使っているので相性はよいが、Mantine を直接使ってよいのは `shared/ui` だけ（デザインシステムの境界）で、フォームの状態のライブラリを UI のライブラリに縛らない。
- MSW（API のモック）: 定番だが、hook のテストは `api/` のクラスを差し替える形で足りていて、HTTP の詳細は `api/` のテストで見ている。最新の 3 系は公開から 5 日を満たしていなかった（2026-10-03）。
- TanStack Query Devtools: 開発のときに便利だが、今の画面の規模では要らない。要るときに足す。
- `experimental.turbopackRustReactCompiler`（Rust 版の React Compiler）: 16.3 で experimental。stable になったら見直す。

## 影響
- 良い点: 取得・更新の状態とキャッシュをライブラリに任せ、hook が短くなる。画面に戻ったときやフォーカスを戻したときの再取得が既定で入る。
- 悪い点: 依存が増える（`@tanstack/react-query`・`react-hook-form`・`@hookform/resolvers`・`zod`・`babel-plugin-react-compiler`・`@testing-library/user-event`）。React Compiler は Babel を通すので、build が少し遅くなる。Vitest は React Compiler を通さずに動かす（テストは memo の有無に依らない振る舞いを見る）。
- 見直す条件: Server Components での取得や Server Actions を使う方針に変えるとき。Rust 版の React Compiler が stable になったとき。
