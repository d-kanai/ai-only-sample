# React Compiler が最適化できない書き方は、Biome の nursery/useReactCompiler で frontend だけ止める

- 日付: 2026-10-04
- 状態: 採用
- 関連: Issue #451 / `biome.json` / `.claude/rules/quality/lint.md` / `rule-tests/lint.feature` / `rule-tests/lint.test.ts` / tech-stack/20261003-tanstack-query-react-hook-form-react-compiler.md / tech-stack/20260928-biome-instead-of-eslint.md

## 背景
frontend（`apps/frontend_customer`）は `useMemo`・`useCallback`・`memo` を手で書かず、React Compiler（`next.config.ts` の `reactCompiler: true`）に任せている（tech-stack/20261003-tanstack-query-react-hook-form-react-compiler.md）。Compiler は最適化できない component・hook を、既定（babel-plugin-react-compiler 1.0.0 の `panicThreshold: "none"`）ではエラーにせず元のまま出す。そのため render 中に props や `ref.current` を書き換えるような書き方は、ビルド・型チェック・テストを通ったまま、その関数だけメモ化されない。手のメモ化を禁じた（`frontend-no-manual-memo`）以上、Compiler が諦める書き方も機械で止めたい。

本リポジトリは TypeScript 7 を使い、lint は Biome だけで行っている（tech-stack/20260928-biome-instead-of-eslint.md。typescript-eslint が TS 7 に未対応）。

## 決定
- `biome.json` の `apps/frontend_customer/**` の override に限って、`nursery/useReactCompiler` を `"error"` にする（全体の linter には入れない）。
- `.claude/rules/quality/lint.md` の「nursery は入れない」の例外とし、条件（代わりの手段が無い・高い、現在のコードで指摘 0 件、検出したい書き方を `rule-tests/lint.test.ts` で固定する）を書く。
- 効き方は `rule-tests/lint.feature` の Scenario で固定する: frontend の component と hook で render 中に props を書き換える・`ref.current` を読み書きする・state を更新すると失敗し、`useReactCompiler` だけが出る。frontend の外（backend・前方一致だけの別ディレクトリ・リポジトリ直下）では同じコードでも通る。イベントハンドラの中で ref と state を変える書き方は通る。

## 理由
- Biome 2.5.13 の `nursery/useReactCompiler` は React Compiler を lint のモードで動かし、TS 7 のこのリポジトリでもそのまま動く。導入時の frontend の指摘は 0 件（`pnpm lint` が緑）。依存を足さず、lint の道具も Biome 1 つのまま。
- ルールは、いちばん近い `package.json` が React 19 以上を宣言しているときだけ動く（Biome 2.5.13 のルールの説明。`package.json` の無い一時ディレクトリでは違反のコードでも 0 で終わることを 2026-10-04 に実測）。React を依存に持つのは `apps/frontend_customer` だけだが、範囲を override で明示し、この判定に頼らない。
- nursery は semver の対象外で、Biome の更新で名前や検出が変わりうる。検出したい書き方を fixture で固定しておけば、黙って効かなくなったときに `pnpm test` が落ちる（設定を `off` にすると Scenario の must reject が落ちることを確かめた）。

## 採用しなかった案
- ESLint 10.11.0 + eslint-plugin-react-hooks 7.1.1（React Compiler のルール）+ @babel/eslint-parser 8.0.6: TS 7 でも動く（2026-10-03 の work-logs の researcher の実測。typescript-eslint 8.71.0 は TS 7 で止まり、@babel/eslint-parser 7 系は ESLint 10 で失敗する）。ただし ESLint・プラグイン・Babel の parser の依存が増え、lint の道具が Biome と ESLint の 2 つになる（設定・pre-commit・CI の検査を 2 系統持つ）。
- Next の `reactCompiler.panicThreshold`（`"all_errors"` などでビルドを止める）: 1 ファイルの 1 件目で止まり、全体の違反の一覧が出ない（2026-10-03 の work-logs の Issue #451 の調査で実測）。`next build` まで分からず、pre-commit で止められない。

## 影響
- 良い点: Compiler が最適化を諦める書き方が、pre-commit と CI の `pnpm lint` で場所付きで止まる。依存は増えない。
- 悪い点: nursery のルールなので、Biome を上げると検出の範囲が変わりうる（増えれば既存のコードが落ち、減れば `rule-tests/lint.test.ts` が落ちる）。hook が引数のオブジェクトを書き換える書き方は検出しなかった（2026-10-04 に実測）。
- 見直す条件: ルールが安定グループに移ったら group 名を直す。Biome の更新で誤検知が多くなる・ルールが消えるなら、ESLint の案を見直す。
