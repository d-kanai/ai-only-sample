# 画面ごとに画面仕様の .feature を置き、step は fetch だけを Route Handler の呼び出しに替えて実 Postgres まで通す

- 日付: 2026-10-04
- 状態: 採用
- 関連: Issue #456 / `rule-tests/screen-spec.test.ts` / `apps/frontend_customer/test-support/route-fetch.ts` / `apps/backend/test-support/database.ts` / `.claude/rules/quality/testing.md` の「画面仕様」 / workflow/20261003-spec-first-feature-development.md / quality/20260930-api-spec-in-feature.md

## 背景
画面の振る舞いは、画面と hook の単体テスト（`api/` を `vi.mock` で差し替える）と E2E（`apps/e2e/spec/`）で確かめていた。単体テストは差し替えた応答が実際の API と食い違っても緑のままで、仕様が `*.test.tsx` のテスト名に散らばり、人が画面の仕様として読めない。E2E は本番ビルドとブラウザが要り、遅く、`pnpm test` に入らない。API には API 仕様（`spec/api`）があるが、画面に同じ形の仕様が無かった。

## 決定
- 画面 1 つ（`features/<f>/screens/<name>/`）ごとに、`<name>.feature`（見出しは `表示項目` / `インタラクション` / `異常系` を順に 1 回ずつ、step は `*` だけ、業務の言葉だけ）と、step の実装 `<name>.screen-spec.test.tsx` を画面のディレクトリに置く。
- step は本物の画面・hook・`api/` を jsdom で描いて操作し、グローバルの fetch だけを `RouteFetch`（frontend の test-support）で `app/api` の Route Handler の直接の呼び出しに替える。Route Handler が re-export する本番の handler は、`TestDatabase.installAsAppDatabase()`（backend の test-support）でテスト用のスキーマに向けた `AppDatabase` を使う。前提の行はテストデータビルダーで入れ、書き込みの後は画面と保存された行の両方を確かめる。
- モックしてよいのは遷移（`next/navigation`）だけにする。置き場所・対・見出し・禁止語・モック・import は `rule-tests/screen-spec.test.ts` が検査する。
- 画面の単体テストには、画面仕様で起こせないもの（決まった文言・en の表示・フィーチャーフラグの off・API が返さない失敗の組み合わせ・DOM の構造）だけを残す。
- 仕様を先に書く 4 種の .feature（workflow/20261003-spec-first-feature-development.md）に、5 種目として画面仕様を足す。

## 理由
- fetch だけを替える: 画面 → hook → `api/` → Route Handler → backend → Postgres のうち、ネットワークだけを外し、`api/` の URL・メソッド・本文と応答の読み方も本番のまま通る。画面が fetch を呼ぶ口（`TodoApi` とフィーチャーフラグの OFREP の provider）はどちらもグローバルの fetch なので、1 か所で両方に効く。
- 実 Postgres: 画面に出たことと保存されたことの食い違い（前後の空白・完了の状態）を、API 仕様と同じ確かさで止める。
- 置き場所の分担: Route Handler の一覧と Provider は `app/api` と画面側の部品を知る frontend の test-support に、DB の準備は backend の test-support に置く（backend から frontend は参照できない）。backend の test-support は `exports` に載せないので、画面仕様の step だけが相対パスで import する（Biome の例外を 2 つの参照先に絞る）。
- 見出しを固定する: どの画面も「何が出るか」「何ができるか」「失敗したら何が出るか」を同じ場所で拾い読みでき、観点の抜けが見出しで分かる。

## 採用しなかった案
- `api/` の `vi.mock` のまま .feature だけ足す: 差し替えた応答と実際の API の食い違いを見逃す。
- MSW などのネットワークのモック: 応答を手で書くので `vi.mock` と同じく食い違いを見逃し、依存が増える。
- 画面仕様を E2E にまとめる: 本番ビルドとブラウザが要り、`pnpm test` とカバレッジに入らない。
- Next のサーバをテストの中で起動して本物の HTTP で呼ぶ: 起動が遅く、ポートとプロセスの後始末が要る。Route Handler は関数なので直接呼べば足りる。

## 影響
- 良い点: 画面の仕様を人が .feature で読め、画面から保存までのつながりが `pnpm test` で止まる。画面の単体テストのうち仕様の重複を減らせる。
- 悪い点: 画面仕様は実 Postgres を使うので遅く、`pnpm test` が Postgres を前提にする範囲が frontend にも広がる。Next のルーティング（`proxy.ts`・ミドルウェア・ヘッダ）と遷移の後の画面は通らない（E2E が見る）。
- 見直す条件: 画面が Server Components や Server Functions でデータを取るようになったら（fetch を通らない）、替える場所を決め直す。Route Handler に catch-all などの動的セグメントが入ったら、`RouteTable` の読み方を広げる。
