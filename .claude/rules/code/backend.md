---
paths:
  - "apps/backend/**"
---

# backend

## 概要

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| パッケージ | `apps/backend/` は API 側の workspace パッケージ `@repo/backend`。Next・React に依存しない TypeScript で、起動口を持たず Next の Route Handler から呼ばれる | - | 説明 |
| 検査 | 依存の向きの規則は `rule-tests/architecture.test.ts` が検査する（一覧は `.claude/rules/code/architecture-check.md`） | - | 説明 |
| 将来の分割 | 分けるときは起動口を足し、`app/api/**` を消して Next の `rewrites` で `/api/*` を向ける | env・logger は `apps/shared` にあり両方が使える | 説明 |

## ディレクトリ構成

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 直下 | `apps/backend/` の直下は `features/`・`shared/`・`test-support/`・`spec/` と `package.json`・`tsconfig.json` だけ | frontend と同じ構成にし、feature を足すときの置き場所をそろえる | `rule-tests/architecture.test.ts` の `backend-placement` |
| 直下 | `backend-placement` はテスト以外のソースだけを見るので、テスト・`.md` の置き場所（`spec/` の下が `api/`・`domain/`・`journey/` だけであることも）はレビューで見る | 機械が見逃す | レビュー |
| feature | ファイルは `features/<feature>/internal/` の `domain/`・`application/`・`presentation/`・`infra/` のどれかか、`shared/` の単位 `error/`・`transaction/`・`http/`・`drizzle/`・`change-log/` のどれかの下に置く | 層・単位の外のファイルにはどの規則もかからない。単位を一覧で固定し、足すときに規則と文書を一緒に見直させる | `rule-tests/architecture.test.ts` の `backend-placement` |
| feature | feature の直下は `expose/`（他のモジュールへの公開の入口）と `internal/`（4 層）だけ。`expose/` は直下のファイルだけでディレクトリを作らない。`internal/` の直下にファイルを置かない | モジュラーモノリス。境界は「依存の向き」の表の「モジュールの境界」 | `rule-tests/architecture.test.ts` の `backend-placement` |
| feature | HTTP の route を持つもの（ヘルスチェックを含む）は shared ではなく feature に置き、ほかの API と同じ層と組み立てにする | 置き場所と組み立てを API ごとにずらさない | レビュー |
| feature | ヘルスチェックを liveness probe に使うなら DB を見ない口を別に足す | DB の障害で全インスタンスが再起動する | レビュー |
| 層 | 層ごとに置くものを下の行で、参照してよい先を「依存の向き」の表の許可の一覧で決める | 禁止の一覧だと書き忘れた参照先が黙って通る | 説明 |
| 層 | `presentation/` は api ファイル（1 API = 1 ファイル `<verb>-<noun>.api.ts`）、`application/` は query / command（1 ユースケース = 1 ファイル）、`domain/` は Entity・Value Object・Repository の interface、`infra/` は Repository の Postgres の実装と `schema.ts` | - | 説明 |
| shared | `apps/backend/shared/` は feature をまたぐ道具で、層ではなく意味の単位のディレクトリに分ける | 層に分けると 1 つの関心が `domain/`・`infra/`・`presentation/` に散る | `rule-tests/architecture.test.ts` の `backend-placement` |
| shared | 単位: `error/`（`ErrorKey`・`DomainError`・`KeyedIssue`・`DomainValidation`）、`transaction/`（`Transaction`・`TransactionRunner`。Drizzle を知らない port）、`http/`（`ProblemResponse`・`InvalidRequestError`・`RequestBody`・`ResourceId`・`SameOrigin`）、`drizzle/`（`Database`・`AppDatabase`・`PostgresTransactionRunner`・`PostgresWriter`・`ColumnClassifier`・`ChangedProps`・migrations）、`change-log/`（`change_logs`） | - | 説明 |
| shared | 環境変数 `env.ts`・ログ `logger.ts`・現在時刻 `now.ts`（`Clock`）は workspace パッケージ `apps/shared` にあり、`@repo/shared/env`・`@repo/shared/logger`・`@repo/shared/now` で使う（`.claude/rules/code/shared.md`） | - | 説明 |
| test-support | `apps/backend/test-support/` にテストだけが使うコード（`TestDatabase`、`<feature>/<name>-repository.in-memory.ts`、`<feature>/<name>-builder.ts`、`InMemoryTransactionRunner`、`ApiCoverage`）を置く。層の規則はかからない | 1 か所なら `.dockerignore` の 1 行で外せ、検査も場所で書ける | 説明 |
| test-support | 本番のコードから test-support を参照しない | - | `rule-tests/test-support.test.ts` の `production-imports-test-support` |
| test-support | test-support を exports に載せない | - | `rule-tests/test-support.test.ts` の `exports-test-support` |
| test-support | test-support と、それを import するテストは Docker のイメージに入れない（`.dockerignore` の `**/test-support` と `**/*.test.ts`） | テストを残すと next build の型チェックが失敗する | `rule-tests/test-support.test.ts` の `dockerignore-entry`・`dockerignore-excludes` |
| test-support | push した runtime のイメージに test-support が無いことを `find` で確かめる | - | `.github/workflows/deploy.yml` の `find` |
| test-support | `*.in-memory.*` は `apps/backend/test-support/` の下だけ | - | `rule-tests/test-support.test.ts` の `in-memory-placement` |
| spec | `spec/` は人が読む仕様で、`api/<feature>/`（API 仕様）・`domain/<feature>/`（domain 仕様）・`journey/`（API ジャーニー）だけ。置くファイルと書き方は `.claude/rules/quality/testing.md` | API ジャーニーは feature をまたぐので `features/<f>/` の下に置かない | `rule-tests/api-spec.test.ts` の `api-spec-placement`、`rule-tests/domain-spec.test.ts` の `domain-spec-placement`、`rule-tests/api-journey.test.ts` の `api-journey-placement`・`api-journey-feature-pair` |

## 依存の向き

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 層 | 向きは `apps/frontend_customer/app/api → presentation → application → domain`。infra は domain の Repository の interface を実装する。他 feature・`apps/frontend_customer/`・層や単位の外は参照しない。自モジュールの `expose/` を `internal/` から参照しない（循環） | 許可の一覧にする: 禁止の一覧だと書き忘れた参照先が黙って通る | `rule-tests/architecture.test.ts` の `domain`・`application`・`presentation`・`infra` |
| `presentation/` | 参照してよい先: 自 feature の `presentation`・`application`・`domain`（domain は `import type` と UPPER_SNAKE_CASE の定数の値の import だけ）、自 feature の `infra/<name>-repository.postgres`（InMemory・`schema` は不可）、他のモジュールの `expose/`、`apps/backend/shared/`、`@repo/shared/logger`・`@repo/shared/now`。`next` / `react` / `react-dom` は不可 | 本番の handler が InMemory で動くとデータが保存されないまま気づけない | `rule-tests/architecture.test.ts` の `presentation` |
| `application/` | 参照してよい先: 自 feature の `application`・`domain`、`apps/backend/shared/`、`@repo/shared/now`。パッケージは `next` / `react` / `react-dom` と DB（`drizzle-orm` とサブパス、`pg`。型だけでも不可）以外 | - | `rule-tests/architecture.test.ts` の `application`・`core-to-persistence` |
| `domain/` | 参照してよい先: 自 feature の `domain`、`apps/backend/shared/`、`@repo/shared/now` だけ。パッケージは application と同じ制限 | ビジネスルールを永続化やフレームワークから切り離し、純粋な単体テストで検証する | `rule-tests/architecture.test.ts` の `domain`・`core-to-persistence` |
| `infra/` | 参照してよい先: 自 feature の `infra`・`domain`、`apps/backend/shared/`、`@repo/shared/env`・`@repo/shared/logger`・`@repo/shared/now`。パッケージは `next` / `react` / `react-dom` 以外 | - | `rule-tests/architecture.test.ts` の `infra` |
| shared | feature のどの層からも `apps/backend/shared/` のどの単位も参照してよい | shared は feature をまたぐ道具で、層の向きは feature の中で守れば足りる | 説明 |
| shared | domain・application が shared の `drizzle/` などを経由して DB に触れない | 機械は `drizzle-orm`・`pg` の直接の import だけを見る | レビュー |
| shared | `apps/backend/shared/` が参照してよい自前コードは shared の中と `apps/shared` だけ。`next` / `react` / `react-dom` も不可 | - | `rule-tests/architecture.test.ts` の `backend-shared` |
| apps/shared | feature の層が使ってよい `apps/shared`: env は infra だけ、logger は presentation・infra、now はすべての層 | env・logger は外の世界（環境変数・stdout）に触る。now は Date を返すだけで、作成日時の生成ルールを domain に置くため | `rule-tests/architecture.test.ts` の `SHARED_MODULES_BY_LAYER` |
| モジュールの境界 | backend の feature を 1 つのモジュールとし、他のモジュールとは `expose/` を通してだけつながる | - | 説明 |
| モジュールの境界 | `module-internal`: 他のモジュールの `internal/` を参照しない（値・型・re-export・dynamic import のどれも。`expose/` からも） | 他のモジュールが中身に依存すると、中身を変えるたびに壊れ境界が無くなる | `rule-tests/architecture.test.ts` の `module-internal` |
| モジュールの境界 | 他のモジュールの `expose/` を参照してよいのは自モジュールの `internal/presentation/`（組み立ての場所）だけ | application が他のモジュールを import すると、ユースケースのテストで差し替えられず依存が散る | `rule-tests/architecture.test.ts` の `module-expose-only-from-presentation` |
| モジュールの境界 | `expose/` が参照してよい自前コードは、自モジュールの `internal/`・`expose/`、`apps/backend/shared/`、`@repo/shared/env`・`@repo/shared/logger`・`@repo/shared/now` だけ | `expose/` は層の規則がかからない組み立ての場所なので、許可の一覧をここで持つ | `rule-tests/architecture.test.ts` の `expose-imports` |
| モジュールの境界 | `expose/` が公開するのは `expose/` に書いたクラス（中で internal を組み立てる入口）と型にとどめ、internal の実装のクラスをそのまま公開しない。関数は export しない | 実装のクラスをそのまま公開すると境界が薄くなる。`expose-imports` は re-export を止めない | レビュー |
| モジュールの境界 | `apps/backend/features/` の外（test-support・spec・frontend の `app/api`）とテストから `internal/` への参照は `module-internal` の対象外。境界を崩していないかはレビューで見る | 機械が見逃す（exports と `app-api` が一部を見る） | レビュー |
| モジュール間の呼び出し | command は他のモジュールの機能を、コンストラクタで受け取る interface（`notify` のような最小のメソッド）として使い、他のモジュールを import しない。api ファイルの組み立てが他のモジュールの `expose/` のクラスを渡す | - | `rule-tests/architecture.test.ts` の `module-expose-only-from-presentation` |
| モジュール間の呼び出し | テストは interface を満たす記録するオブジェクトを渡す。本番の組み立てが `expose/` のクラスを渡していることは api のテストで確かめる | - | レビュー |
| モジュール間の呼び出し | 結果を待たない作用（通知など）を `expose/` で公開するときは、公開するメソッドを同期の `void` にして中で `.catch` し `phase: failed` のログを出す。中で使う internal の command はコンストラクタで組み立てる private のフィールドにする | 外に出した Promise の未処理の reject で Node が終了する | レビュー |
| モジュール間の呼び出し | 通知などの外への作用は保存の後（`run` が resolve した = COMMIT の後）、状態が実際に変わったときだけ行い、作用の失敗で保存を取り消さない | 冪等な要求を 2 回送っても作用は 1 回。保存・COMMIT に失敗した変更を知らせない | レビュー |
| モジュール間の呼び出し | 通知などの本文は id など決まった形の英語だけにし、利用者の入力（自由な値）を入れない | 本文は自由文で、logger の正規表現の網はメールなど決まった形しか伏せず、自由な値はそのまま出る（`.claude/rules/code/shared.md` の「ログのスキーマとマスクの印」） | レビュー |

## import と exports

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| import | backend の中の import は相対パスだけ（`@/` と `@repo/backend/` は使わない） | `@/`: Next（Turbopack）が backend のファイルにも frontend の paths を当て、ビルドが失敗する。`@repo/backend/`: exports を通り、公開していないファイルを指せない | `rule-tests/architecture.test.ts` の `backend-relative-only` |
| import | `apps/shared` は `@repo/shared/...` だけで書き、相対パスで指さない | exports を経由しない参照を許すと `apps/shared` の公開範囲が意味を持たない | `rule-tests/architecture.test.ts` の `backend-relative-only`・`shared-exports` |
| exports | 外（frontend・e2e・リポジトリ直下の設定）が使ってよいのは `apps/backend/package.json` の `exports` に書いたファイルだけ。`"./*"` は公開しない。使わなくなったキーは消す | - | `rule-tests/architecture.test.ts` の `backend-exports` |
| exports | 値はキーのパスに `.ts` を付けた TS のソース。feature を足したら `./features/<feature>/internal/presentation/*.api` を足し、それ以外は 1 ファイルずつ | Node の exports のパターンは `*` を 1 つしか持てない | `rule-tests/architecture.test.ts` の `backend-exports` |
| exports | test-support は公開しない。exports を通さず相対パスで指してよいのは `vitest.global-setup.ts` の import と `vitest.config.mts` の `reporters` の文字列だけ | reporters は Vitest が読むパスの文字列で、import の規則には見えない | `rule-tests/test-support.test.ts` の `exports-test-support` |
| package.json と tsconfig | backend のコードが import する依存は `apps/backend/package.json` に置く（`.claude/rules/tooling/dependencies.md`） | - | 説明 |
| package.json と tsconfig | `pnpm typecheck` が backend を単体で型チェックする | - | `pnpm typecheck` |
| package.json と tsconfig | `apps/backend/tsconfig.json` に Next の plugin・jsx・DOM の型を足さない（`Response#json()` は `unknown` なのでテストで `as` を付ける） | tsconfig の中身はどの検査も見ない | レビュー |

## API の書き方

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 1 API = 1 command | 1 ユースケース = 1 API = 1 command。複数の項目を任意で受けて command の中で分岐する部分更新 API は作らず、項目ごとに `PUT /api/<resources>/:id/<field>` のように分ける | 業務プロセスが別の操作を混ぜると、片方だけに処理が付いたときに command に if が増える | 説明 |
| 1 API = 1 command | command の `*Input` 型に任意の項目を置かず、`input.<x> !== undefined`（`null` の比較も）で分岐しない。null が正当な値の操作は別のユースケースにする | - | `rule-tests/use-case.test.ts` の `no-optional-input-field`・`no-undefined-branch-on-input` |
| 1 API = 1 command | リクエストの項目に `.optional()` を付けない。同じユースケースの中で本当に任意の項目は直前の行の `// WHY 任意: <理由>` で通す | - | `rule-tests/api-request.test.ts` |
| 1 API = 1 command | `.partial()` / `.nullish()` / `.default()` / `z.optional(x)` で任意の項目を作って検査を逃れない | 機械が見逃す | レビュー |
| ファイルの形 | その API のリクエスト / レスポンスの型（DTO）は api ファイルで定義して export する。同じ形でも各ファイルに直接書き、共通の型ファイル・別名の型を置かない（domain の Entity を各 api の `toResponse` で写す） | api ファイルを 1 つ開けば契約と処理がすべて見える | レビュー |
| ファイルの形 | handler は `(request: Request) => Promise<Response>`。動的セグメントがあれば `(request, ctx: { params: Promise<{ id: string }> })` で、`await ctx.params` は api ファイルで行う | - | レビュー |
| ファイルの形 | api ファイルはクラス `<Verb><Noun>Api` を export し、コンストラクタで query / command を `Pick<<Verb><Noun>Query, "execute">`（書き込みは `Pick<<Verb><Noun>Command, "execute">`）の型で受け取り、`handle` を Route Handler にする | application の query / command と同じコンストラクタ注入の形にそろえる | レビュー |
| handle | `handle` は `readonly handle = ProblemResponse.wrap(async (request[, ctx]) => { ... })` のアロー関数のプロパティにする | アロー関数: インスタンスから取り出して渡すとメソッドでは `this` が外れる。wrap: Next の Route Handler には共通の catch が無く、包み忘れると Next の素の 500 が漏れる | `rule-tests/architecture.test.ts` の `presentation-with-problem-response` |
| handle | handle の中に try / catch を書かない（try / finally は可）。handle から呼ぶ private メソッド・`.catch()`・`.then(_, onRejected)` でも例外を握りつぶさない | 例外を Problem Details に変えるのは wrap の 1 か所。機械は handle の中の try / catch だけを見る | `rule-tests/architecture.test.ts` の `handle-without-try-catch` |
| handle | `RequestBody.parse` と `await ctx.params` + `ResourceId.parseUuid` は handler の中に書き、共通化しない | 本文・動的セグメントの有無と確かめる順番が api ごとに違い、handler の中にあれば 1 か所で読める | レビュー |
| 組み立て | 組み立てはファイルの最下部に `export const <METHOD> = new <Verb><Noun>Api(new <Verb><Noun>Query(new Postgres<Name>Repository(AppDatabase.get().db))).handle;` の形で書く。書き込みは `<Verb><Noun>Command` にし、Repository の次に `new PostgresTransactionRunner(AppDatabase.get().db)` を渡す。DI コンテナは置かない | その API が何で動くかを api ファイル 1 つで読める | レビュー |
| 組み立て | api ファイルごとに Repository を new してよい | プールは `AppDatabase.get` が `globalThis` に 1 つだけ持つ。全 api ファイルに渡る db が 1 つであることをテストが確かめる | `apps/backend/shared/http/route-handlers-share-database.test.ts` |
| テスト | api のテストは空の InMemory の Repository と `InMemoryTransactionRunner` で組み立てた `handle` に `new Request()` を渡す（前のテストのデータに依存しない） | - | レビュー |
| テスト | backend のテストの `vi.mock` は `@repo/shared/now` だけ。InMemory で起こせない検証だけ、直前の行の `// WHY モック: <理由>` で通す | 型で縛られ、query / command の形が変わればテストがコンパイルエラーになる | `rule-tests/test-doubles.test.ts` の `vi-mock-only-now` |
| テスト | 差し替えはコンストラクタで行う。コンストラクタで渡せない依存（本番の組み立てが作る Postgres の Repository・runner、`expose/` のクラスが中で作る command）だけ `vi.spyOn(<Class>.prototype, "<method>")` で差し替え、理由を WHY のコメントに書く | `vi-mock-only-now` は `vi.spyOn` を止めない | レビュー |

## エラー応答

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| エラーのキー | エラーは安定したキー（`ErrorKey`）と params で表し、画面の文言は画面の辞書が key と params から翻訳する | 文言は画面の関心。key は分岐にも翻訳にも使える機械可読な契約になる | 説明 |
| エラーのキー | `apps/backend` の非テストコードに日本語のリテラルを置かない | - | `rule-tests/architecture.test.ts` の `server-hardcoded-text` |
| エラーのキー | ログ・開発者向けの Error の message・`detail` は英語 | `server-hardcoded-text` は日本語だけを止める | レビュー |
| エラーのキー | キーは `"<領域>.<対象>.<理由>"`。対象全体の理由なら `"<領域>.<理由>"` も可（`<feature>.notFound`・`server.internalError`） | - | レビュー |
| エラーのキー | キーは `error-key.ts` の `ErrorKeyParams` に params の形（string か number）と一緒に足す。`DomainError` などの params はキーごとに型で縛る | 渡し忘れ・形違い・画面の訳の書き忘れが型エラーで止まる | `pnpm typecheck` |
| エラーのキー | 公開したキーの名前は変えない（変えるなら画面の辞書と同じ変更で） | - | レビュー |
| エラーのキー | Error の `message` は開発者向けの `<key> <params の JSON>`（`ErrorKeys.describe`） | ログから画面の辞書を引ける | 説明 |
| Problem Details | エラー応答は RFC 9457 の Problem Details（`Content-Type: application/problem+json`）にし、拡張メンバーに key を残す | HTTP API のエラー本文の標準で、汎用のクライアントが読める。`type` は大分類で、画面の文言は細かいキーで決まる | 説明 |
| Problem Details | 作るのは `problem.ts` の `ProblemResponse.from` だけで、api から直接呼ばない（`ProblemResponse.wrap` から呼ぶ）。別名・分割代入・変数経由で呼んで検査を逃れない | 機械は `ProblemResponse.from` の名前だけを見る | `rule-tests/architecture.test.ts` の `problem-response-from-only-in-problem` |
| Problem Details | メンバーは `type`（`/problems/<kind>` の相対参照。`about:blank` は使わない）・`title`（種類ごとに固定）・`status`・`detail`・`instance`（クエリを除くパス）と、拡張の `key`・`params`・`errors`（presentation の誤りのときだけ。`{ pointer: "#/<field>", key, params?, detail }`） | - | 説明 |
| Problem Details | `DomainErrorCode` → `{ type, title, status }` は `problemKindOf`、`detail`（開発者向けの英語。契約に含めない）は `problem-detail.en.ts` の `ErrorKey` ごとの関数だけに書く | 種類・キーを足して書き忘れると型エラー | `pnpm typecheck` |
| Problem Details | ほかの場所に `detail` の英語を書かず、翻訳しない | backend に辞書を持つと画面の辞書と二重管理になる | レビュー |
| オリジン | GET / HEAD / OPTIONS 以外の要求は、`Origin` が `X-Forwarded-Proto`（無ければ URL）のスキームと `Host` に一致しなければ（読めない値も）handler の前に 403（`request.origin.forbidden`）を返す。`Origin` の無い要求は通し、CORS のヘッダは返さない。判定は wrap が呼ぶ `SameOrigin.rejects` | CORS では CSRF（プリフライト無しの POST）を止められない。Cloud Run は前段で TLS を終える | `apps/backend/shared/http/same-origin.test.ts`、`apps/backend/shared/http/problem.test.ts`、`apps/backend/shared/http/ofrep.test.ts` |
| オリジン | 前段が `Host` を書き換える・`X-Forwarded-Proto` を付けない構成では同じオリジンの書き込みも 403 になる（Cloud Run での確認は未確認） | 止めすぎる方向の限界 | 説明 |

## 入力検証

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 方針 | 入力検証は zod で統一する。presentation と domain の分担は下の 1〜4（presentation ⊆ domain） | 規則の宣言と型の導出を 1 か所にし、項目ごとの誤りを応答に出せる | 説明 |
| 方針 | 1. domain は常に完全: 値の規則の正は domain のスキーマで、presentation を通った値も含めて毎回すべてを検証する | presentation を通らない口（DB の行の `reconstruct`・application からの直接の呼び出し）でも不変条件が守られる | レビュー |
| 方針 | 2. presentation は domain より厳しくしない（domain が通す値を弾かない） | - | レビュー |
| 方針 | 3. 数値は domain の定数（`<NAME>_MAX_LENGTH` など）を presentation が参照し、2 か所に書かない | 数値の二重管理でずれる | レビュー |
| 方針 | presentation が domain から値で import してよいのは UPPER_SNAKE_CASE の定数だけ | - | `rule-tests/architecture.test.ts` の `presentation` |
| 方針 | 4. presentation は形（JSON・オブジェクト・未知の項目・型）を必ず検査し、必須・長さを domain と同じキー・数え方・定数で重ねてよい。誤りは項目ごとの `errors[]` にまとめる | domain の DomainError はどの項目の誤りかを持たない。重ねると形と値の誤りを項目ごとに 1 回で返せる | レビュー |
| 方針 | スキーマは関数の中で作る（最上位の定数にしない） | 最上位は static な変異になり mutation testing で数えない（`stryker.config.mjs` の `ignoreStatic`） | レビュー |
| リクエスト | api ファイルに `RequestBody.schema({ ... })` でスキーマを置き、`RequestBody.parse(request, schema)` で読む。型の検査に `error` を書かず、必須・長さは `refine` に `KeyedIssue.of` / `KeyedIssue.refine` で domain と同じキーを付ける。型は `z.infer` で導出する | 型の検査ごとにキーを書くと同じ対応を項目ごとに重ねる | レビュー |
| リクエスト | 違反は `InvalidRequestError` → 400（`errors` の一覧、`key`・`params` は最初の 1 件） | - | 説明 |
| リクエスト | zod の issue からキーと `pointer` を決める対応は `json-body.ts` の `toProblemError` 1 か所だけに書く。対応の無い issue は 500 の Error にする | キーの集合は画面の辞書と共有する閉じた集合で、近いキーに寄せると画面が誤った文言を出す | レビュー |
| リクエスト | 未知のキーは拒否する（`z.strictObject`） | 打ち間違えた項目・別の API の項目を黙って捨てると、変更が反映されないまま成功する | レビュー |
| リクエスト | 動的セグメントの `id` は `ResourceId.parseUuid`（`z.uuid()`）で本文より先に確かめ、形が違えば 404（無い id と同じ契約） | - | レビュー |
| リクエスト | `z.uuid()` は RFC 9562 の形（版の桁 1〜8、variant 8 / 9 / a / b、nil と max）だけを受け付け大文字も通す。id は `randomUUID`（v4）で作る | zod 4.6.5 の挙動。Postgres の uuid 型より狭い | 説明 |
| domain | 値の規則の正は domain の zod スキーマで、Entity のコンストラクタがそれで検証し、違反は `DomainError("validation_error", key, params)` → 400（`errors` は付かない） | - | レビュー |
| domain | 文字数はコードポイント数で数え（`refine` と `Array.from`）、features の domain で zod の `.min(` / `.max(` を使わない（`Math.min` / `Math.max` は可）。`.length(`・`.nonempty(`・`z.minLength(` / `z.maxLength(` も使わない | zod の長さは `String#length` で数え、絵文字 1 文字を 2 と数える。機械は `.min(` / `.max(` だけを見る | `rule-tests/domain-validation.test.ts` の `no-zod-length-in-domain` |
| domain | domain で zod の `parse` / `safeParse` を直接呼ばず `DomainValidation.validated` を通す | - | `rule-tests/domain-validation.test.ts` の `no-direct-zod-parse-in-domain` |
| domain | `validation_error` の DomainError を作るのは backend 全体で `validate.ts` だけ | - | `rule-tests/domain-validation.test.ts` の `validation-error-only-in-validate` |
| domain | domain のスキーマ・refine の `error` にはキーだけを `KeyedIssue.of(key)` / `KeyedIssue.refine(key, params)` で渡し、文字列リテラルを書かない。`message:`・`z.string("...")`・`.refine(fn, "...")`・変数経由でも書かない | zod の `error` は任意の文字列を受け、打ち間違い・params の渡し忘れを型で止められない。機械は `error:` のリテラルだけを見る | `rule-tests/domain-validation.test.ts` の `no-literal-error-in-domain-schema` |
| domain | params は refine の `params` で運び、`DomainValidation.validated` が最初の issue の message（= キー）と params を DomainError に戻す | zod 4.6.5 は refine の `params` を custom の issue にそのまま載せる | 説明 |

## Entity

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 生成 | `<Entity>.create(...)` は id・作成日時（`Clock.now()`）・初期状態を自分で決め、作成日時を引数で受け取らない。DB の行から戻す `reconstruct` は保存済みの値を受け取る | 作ったときの時刻が入るのは生成ルールで、呼び出し側が渡せるとルールが漏れる | レビュー |
| 完全コンストラクタ | Entity の private コンストラクタが毎回、値のすべてを不変条件のスキーマで検証する。`create`・`reconstruct`・遷移メソッドはコンストラクタに値を渡すだけで、口ごとに検証の範囲を分けない | Entity 型の値 = 不変条件を満たす値が常に成り立つ | レビュー |
| 完全コンストラクタ | 規則を変えるときは既存のデータを移行して追従する（スキル `db-migration`） | - | レビュー |
| 完全コンストラクタ | branded 型は使わない | Entity 型そのものが不変条件を満たす値を表す | レビュー |

## ユースケースとトランザクション

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| query / command | 読むだけは query、状態を変えるものは command に分ける | 副作用の有無をファイル名で見分ける | レビュー |
| query / command | `*.query.ts` は `.run(` / `.insert(` / `.update(` / `.delete(` を呼ばず、トランザクションを張らない | - | `rule-tests/use-case.test.ts` の `query-without-writes` |
| query / command | query は別の名前の書き込み（`save` など）・分割代入・ブラケットの呼び出し・`this.db.transaction(` で検査を逃れない。行ロックも取らない | 機械は名前だけを見る | レビュー |
| トランザクションの張り方 | 状態を変える command はコンストラクタで Repository の次に `TransactionRunner` を受け取り、`execute` の本体を `this.transactions.run(async (tx) => …)` で包み、Repository の読み込み（`findByIdForUpdate`）と書き込みに `tx` を渡す。DB に触らない command は `execute` の直前の行の `// WHY トランザクション無し: <理由>` で通す | - | `rule-tests/use-case.test.ts` の `command-runs-in-transaction` |
| トランザクションの張り方 | command の中で遅い処理（外部 API など）をしない | トランザクションの間は接続を 1 本占有する。接続待ちは `DATABASE_CONNECTION_TIMEOUT_MS` でエラーになる | レビュー |
| Transaction と runner | 本番は `PostgresTransactionRunner(db, actorId)`（`db.transaction` の tx を包んだ Writer を `Transaction` として渡す）、テストは `InMemoryTransactionRunner`（work を呼ぶだけで rollback は再現しない。原子性は Postgres のテストで確かめる） | - | 説明 |
| Transaction と runner | `Transaction` は brand の型で、作るのは `PostgresWriter` の `asTransaction`、取り出すのは `PostgresWriter.of` だけ（InMemory の tx を Postgres の Repository に渡すと Error） | cast を 1 か所に閉じる | レビュー |
| 分離レベルとロック | 分離レベルは既定の READ COMMITTED。同じ集約を変える command は `findByIdForUpdate` で根の行を `FOR UPDATE` でロックして直列化し、後の command は先の COMMIT の後の値を読む。並行の振る舞いは Repository の Postgres のテストで 2 つのトランザクションを同時に開いて確かめる | - | レビュー |
| 分離レベルとロック | 楽観ロックの version 列は入れない | - | レビュー |
| 分離レベルとロック | 変更系の応答は command が読み込んで変えた値で返し、update の後に読み直さない | SELECT が 1 回増える | レビュー |

## Repository

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 常に Postgres | アプリは常に Postgres（Drizzle + node-postgres）。本番の handler は Postgres の Repository（と runner）で組み立て、環境変数で InMemory に切り替える分岐を持たない。InMemory はテストで query / command に渡すだけ | 切り替えがあると、書き忘れでもデータが保存されないまま動く | `rule-tests/architecture.test.ts` の `presentation` |
| 常に Postgres | 各 api ファイルのテストが、本番の handler が Postgres の Repository と runner を呼ぶことを prototype の spy で確かめる（DB には接続しない） | - | レビュー |
| 常に Postgres | `pnpm dev` の前にも `pnpm db:up` と `pnpm db:migrate` が要る。api ファイルを読み込むテストは `.env` が要る | - | 説明 |
| 接続とプール | プールは `env` の値で作り `globalThis` に 1 つだけ持つ。アイドル中の接続のエラーはログに出すだけ。`AppDatabase.close()` はテストの後始末だけで使い、SIGTERM では呼ばない | HMR でプールを増やさない。停止時は Next.js が処理中の要求を待って終了し、接続はプロセスの終了で切れる | 説明 |
| 書き込み | Postgres の Repository はコンストラクタで `Database`（query の読み取り用）だけを受け取り、トランザクションを張らない（command が張って `tx` を渡す） | - | `rule-tests/persistence.test.ts` の `no-direct-transaction` |
| insert / update | Entity は読み込んだとき（`reconstruct`）の値を `origin` に持ち（`create` は `undefined`、遷移メソッドは引き継ぐ）、`update` はそれと今の値を `ChangedProps.of` で比べた差分だけを書く | 遷移メソッドに差分を記録させると書き漏れた変更が保存されない。どの列・SQL にするかは infra の都合 | `rule-tests/persistence.test.ts` の `update-uses-changed-props`・`entity-with-reconstruct-has-origin` |
| insert / update | `origin` は private フィールド（getter で読む）にし、列挙されるプロパティに出さない | 値の等価と直列化に混ざらない | レビュー |
| insert / update | insert を upsert（`onConflictDoUpdate` / `onConflictDoNothing`）で書かない | 2 回 insert する呼び出しは実装ミスで、upsert は黙って通し、id の衝突した別の行も上書きする | `rule-tests/persistence.test.ts` の `no-upsert` |
| insert / update | `insert(entity, tx)` は `origin` が `undefined` のものだけを受け付け、根の全列と子表の全件を素の `INSERT` で書く（`origin` があれば Error、同じ id は一意制約違反で 500）。command は新規なら `insert`、読み込み済みなら `update` を呼ぶ | 呼び出し側は新規か読み込み済みかを知っている。Repository が `origin` で分岐しない | レビュー |
| insert / update | `update(entity, tx)` は `origin` のあるものだけを受け付け、変わった列だけの UPDATE と、`origin` の件数より後ろに増えた子表の行だけの INSERT を書く（何も変わらなければ SQL を出さない。行が無ければ Error） | 全列を書くと先の変更を巻き戻す（lost update）。zod の parse が配列を作り直すので子表の増分は件数で見る | レビュー |
| InMemory | InMemory も同じ意味にする（読み出しは `reconstruct` で origin を持たせ、update は変わった項目だけ、同じ id の insert は Error。`tx` は使わず、ログ・変更履歴は出さない） | - | レビュー |
| InMemory | Postgres と InMemory の Repository のテストは共通の契約を同じテスト名で確かめる。DB を直接見るテスト（SQL の発行・書いた列・行ロック・変更履歴・ログ）は Postgres だけ | 本番とテストの実装のずれを無くす | レビュー |
| 集約の読み出し | 集約は根を子表に LEFT JOIN した 1 文で、子表の全件を `position` の順で読む（一部だけ・N+1 にしない） | 一部だと不変条件で検証できず、2 文だと片方だけに別の変更が見える。LEFT JOIN なら子の無い行も違反として気づける。日時は同値がありうる | `rule-tests/persistence.test.ts` の `aggregate-loads-all-children` |
| 集約の読み出し | 引数を変数経由にして全件の読み出しの検査を逃れない | 機械は字句で推定する | レビュー |
| findById | `findById(id)`（query 用。ロック無し）は無ければ `undefined`、`findByIdForUpdate(id, tx)`（command 用）は無ければ `DomainError("not_found", ...)`（404）。query は domain の `Required<Name>.of(found, id)`（Entity ごとのクラス）で同じ例外にし、自分で throw を書かない。各実装も同じクラスを使う | 例外の code・key・params を 1 か所に決め、ユースケース・実装ごとのずれを無くす | レビュー |
| findById | Postgres の `findByIdForUpdate` は、根の行を `FOR UPDATE` でロックする文と集約を LEFT JOIN で読む文の 2 文にする | READ COMMITTED で 1 文の `SELECT … LEFT JOIN … FOR UPDATE` がロックを待つと、ロックした行だけを最新の版で読み直し、JOIN した子は古いスナップショットのままになる（PostgreSQL の Read Committed の仕様） | レビュー |
| findById | 行ロック（`.for(`）をするメソッドは名前を `ForUpdate` で終え、`ForUpdate` で終わるメソッドは `.for(` を持つ。`.for(` を別の関数に置いて逃れない | ロックの有無で呼び出し側の前提（直列化・tx が要ること）が変わる | `rule-tests/persistence.test.ts` の `lock-method-name-for-update` |
| 行から Entity へ | DB の行から Entity に戻すときは `reconstruct` を使い、`*.postgres.ts` で zod の `.parse(` / `.safeParse(` を呼ばない（`JSON.parse`・`Date.parse` は可）。利用者の入力からは `create` と遷移メソッド | 行の型は Drizzle のスキーマが保証し、不変条件はコンストラクタが検証する | `rule-tests/persistence.test.ts` の `no-zod-parse-in-postgres` |
| 不変条件を満たさない行 | 不変条件を満たさない行は Repository が補わず、行を読み飛ばさず、DomainError ではない `Error`（id と理由を message、元の DomainError を cause）にして 500 にする。domain の不変条件は緩めない | DomainError のままだと 400 で、直せない誤りを「リクエストの誤り」と伝える。500 なら `ProblemResponse.from` がログに残す | レビュー |
| 不変条件を満たさない行 | そうした行が 1 件あると一覧とその id への操作が 500 になり画面からは直せない。DB 側で直し、ログの id と理由で行を特定する | - | 説明 |
| テスト | 実 Postgres を使うテストは `TestDatabase.create()` でファイルごとに別スキーマを使う（`.claude/rules/quality/testing.md`） | - | レビュー |

## DB スキーマ

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| マイグレーション | スキーマは `apps/backend/features/<feature>/internal/infra/schema.ts` に `pgTable` で宣言する（codebase-first）。feature をまたぐ横断の表だけ `apps/backend/shared/<unit>/<name>.schema.ts` に置く | - | レビュー |
| マイグレーション | SQL は `pnpm db:generate` で生成し `pnpm db:migrate` で当てる。生成済みの SQL は手で直さず、`drizzle-kit push` は使わない。手順はスキル `db-migration` | push は SQL が残らずレビューも記録もできない | レビュー |
| マイグレーション | schema は infra に置き、Entity との変換は Repository の実装が行う | 表の形は永続化の都合で domain は知らない | `rule-tests/architecture.test.ts` の `domain`・`core-to-persistence` |
| マイグレーション | `apps/backend/shared/drizzle/migrations/**/*.sql` に表のスキーマ修飾 `"public".` を書かない | テストはファイルごとの別スキーマにマイグレーションを当てるので、public を指すと壊れる | `rule-tests/migration.test.ts` の `no-public-schema-qualifier` |
| マイグレーション | データの移行（既存の行を足す・直す）の仕組みは持たない。要るようになったら方法を決める | 本番環境が無く移すデータが無い | 説明 |
| 列の型 | 長さ・精度は意味があるときだけ書く。既定から外れるときは列の直前の行（空行を挟まない `//` の連続）に、規則ごとの見出し `// WHY 長さ: <理由>`（varchar / char）・`// WHY タイムゾーン: <理由>`・`// WHY 連番: <理由>`・`// WHY json: <理由>` で理由を書く（別の見出しでは通らない） | - | `rule-tests/schema.test.ts` の `varchar`・`char`・`timestamp-without-timezone`・`serial`・`json` |
| 列の型 | 文字列は `text`。長さそのものを DB で保証する必要があるとき（外部システムの固定長コードなど）だけ `varchar(n)` / `char(n)` か CHECK。文字数の上限は domain が持つ | Postgres では 3 つの型に性能差が無い（公式の datatype-character）。上限を 2 か所に書くとずれ、DB の違反は 500 になって domain の 400 に負ける | `rule-tests/schema.test.ts` の `varchar`・`char` |
| 列の型 | 整数は `integer`（連番の id・件数・金額の最小単位など 21 億を超えうるものは `bigint`）で長さを書かない。小数・金額は `numeric(p, s)` で精度を常に書く。真偽は `boolean` | Postgres の整数に長さは無い。精度は意味そのもの | レビュー |
| 列の型 | 日時は `timestamp(..., { withTimezone: true })` | timezone 無しはサーバ・DB の設定で時刻の意味が変わる | `rule-tests/schema.test.ts` の `timestamp-without-timezone` |
| 列の型 | id は `uuid`（アプリが `randomUUID` で作る）。`serial` / `bigserial` / `smallserial` は使わない | - | `rule-tests/schema.test.ts` の `serial` |
| 列の型 | JSON は `jsonb` で、`json` は使わない | `json` は処理のたびに解析し直す。`jsonb` は速くインデックスも張れる（公式の datatype-json） | `rule-tests/schema.test.ts` の `json` |
| id と主キー | すべての表（子表・履歴表も）の列の定義の直下に `id: uuid("id").primaryKey()` を書く。複合主キーだけの表にせず、自然キー・複合キーは一意制約で表す。例外（`// WHY`）は認めない | どの行も id で指せ、変更履歴（`row_id` は uuid）・削除・参照が表によらず一様になる | `rule-tests/schema.test.ts` の `surrogate-key` |
| id と主キー | `uuid("id")` は `drizzle-orm/pg-core` から import し、後ろのチェーンは `notNull` / `primaryKey` / `defaultRandom` / `default` / `$defaultFn` / `$default` / `unique` だけ。列の定義を変数・スプレッド・関数で渡さない | 検査は fail closed で、ほかの書き方は違反になる | `rule-tests/schema.test.ts` の `surrogate-key` |
| id と主キー | id の形の検査は presentation の `ResourceId.parseUuid` だけで、Repository は検査しない（形の違う id は Postgres のエラーで 500） | Repository に来る形の違う id は呼び出し側の実装ミスで、「無い」として通すと誤りが隠れる | レビュー |
| 子表 | 状態の遷移の履歴は insert のみの子表に積み、今の値は根の表に残す（一覧・詳細は根だけを読む）。Entity は履歴を古い順に持つ | - | レビュー |
| 子表 | insert のみの表は `pgTable` の表名を `_changes` / `_events` / `_logs` で終え、`Changes` / `Events` / `Logs` で終わる変数で受ける | 次の行の検査が変数名で見分ける | `rule-tests/persistence.test.ts` の `append-only-table-naming` |
| 子表 | insert のみの表の行は UPDATE / DELETE しない（消えるのは親を消したときの `on delete cascade` だけ） | - | `rule-tests/persistence.test.ts` の `no-update-delete-on-append-only-tables` |
| 子表 | 子表の (`<parent>_id`, `position`) は一意にする。同じ集約を 2 か所で読んで両方が履歴を足すと、後の update は一意制約違反で 500 になり同じトランザクションも戻る。InMemory も Error を投げる | 両方を足すと履歴の最後と根の値がずれ、その集約が読めなくなる | レビュー |
| 外部キー | 外部キーは `schema.ts` の `.references()` で書かず、`pnpm db:generate --custom` の SQL にスキーマなしで書く。手順と `ON DELETE` の選び方はスキル `db-migration` の「外部キー」 | drizzle-kit の generate は `REFERENCES "public"."<table>"` とスキーマ付きで書く | `rule-tests/migration.test.ts` の `no-public-schema-qualifier` |
| 外部キー | テストの `truncate` と E2E のリセットは、参照する表と参照される表（と `change_logs`）を同じ文で消す | 参照される表だけの TRUNCATE は Postgres が拒否する | レビュー |
| インデックス | インデックスは検索するクエリが決まってから足す。例外は `change_logs` の `(table_name, row_id)` | 変更履歴は「ある行の履歴」を表の名前と id で引く使い方が主 | レビュー |
| 列の分類 | すべての表（Writer を通らない表も）の隣に `export const <name>Columns = ColumnClassifier.classify(<name>, { ... })` で列ごとの `"public"` / `"sensitive"` を置く（`ColumnClassifier` は値で名前の import をし、表は変数で受ける）。例外は認めない | Drizzle の列にメタデータを持たせる公式の手段が無い。隣に置くと列の追加と分類が同じ変更になる | `rule-tests/schema.test.ts` の `column-classification` |
| 列の分類 | キーは Drizzle のプロパティ名で、全列の網羅は `ColumnClassifier.classify` の引数の型が強制する | 列の分類し忘れ・表に無い列名・ほかの値は型エラーになる | `pnpm typecheck` |
| 列の分類 | sensitive は利用者の入力に由来する値・人を指しうる値。public は id・状態・日時のようにコードが決める値 | - | レビュー |
| 列の分類 | Writer が `db_write` のログの before / after を logger に渡す前に、`ColumnClassifier.maskRow` で public 以外の列を `***` にする（分類の無い表・表に無い列も `***`、`null` は `null`）。`change_logs` の表には生の値を書く | `apps/shared` の logger は backend の表を参照できない | `rule-tests/architecture.test.ts` の `shared-self-contained` |

## 変更履歴と Writer

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 変更履歴 | すべての表の行の変更を、横断の表 `change_logs`（`table_name`・`row_id`・`operation`・`changes`（jsonb。列名 → `{ before, after }`）・`actor_id`・`occurred_at`。insert のみ・外部キー無し）に積む | 監査 | 説明 |
| 変更履歴 | Writer が書いた行ごとに 1 件。insert は全列の `after`、update は渡した列だけの `before`（Repository が渡す `origin`。Writer は読み直さない）と `after`、delete は `returning` で受けた全列の `before`。日時は ISO 8601。差分の無い update・無い id の delete・cascade で消えた子は記録しない | - | 説明 |
| 変更履歴 | 記録の組み立て（`ChangeRecords`）を使うのは Writer だけ。Repository は `change-log` を import せず（`import type` も）、`recordChange` の名前を書かない。ほかのファイルからも使わない | 機械は `*.postgres.ts` だけを見る | `rule-tests/persistence.test.ts` の `no-change-log-in-repository`・`no-direct-record-change` |
| 変更履歴 | `actor_id` は runner のコンストラクタの `actorId` から Writer に渡す。ログインが入ったら要求ごとに渡す | actor は要求の文脈で、要求ごとに組み立てる runner が持つ | 説明 |
| 変更履歴 | 手書きの SQL（マイグレーション・手で直した行）の変更は記録されない | DB のトリガーにしない代わりの限界 | 説明 |
| Writer | Repository（`*.postgres.ts`）の書き込みは `shared/drizzle/writer` を値で import し、`PostgresWriter.of(tx)` で得た Writer の `insert(table, rows)` / `update(table, id, origin, changes)` / `delete(table, id)` だけを通す | Writer が横断的にログと変更履歴を残し、Repository ごとの書き忘れを無くす | `rule-tests/persistence.test.ts` の `writes-through-writer` |
| Writer | `*.postgres.ts` は `db` を受け手にした `.insert(` / `.update(` / `.delete(` を書かず、`transaction` の名前を書かない（runner の `transaction.postgres.ts` は対象外） | - | `rule-tests/persistence.test.ts` の `no-direct-db-write`・`no-direct-transaction` |
| Writer | 生の SQL（`this.db.execute(sql…)`）・ドライバの直接の呼び出し（`$client.query`）・Writer の受け手の入れ替えで書き込まない | 機械は字句で推定する | レビュー |
| Writer | Writer は 1 文ごとに `returning()` で実行し、変更履歴を同じトランザクションで書き、前後にログを出す（`select` は記録しない。空の書き込みは何もしない。id の無い行の id は `randomUUID`） | - | `apps/backend/shared/drizzle/writer.test.ts` |

## ログ

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| 口 | サーバ側のログは必ず `apps/shared/logger.ts` の `logger.emit(event)` を通す。`console.*` を書いてよいのは `logger.ts` だけ（テストは除く） | 行の形をずらさず、出力先を変えるときに直すのが 1 か所で済む | `biome.json` の `noConsole`、`rule-tests/architecture.test.ts` の `console-direct-access` |
| 行の形 | 1 呼び出し = JSON 1 行で、先頭は `severity`・`time`・`message`・`event`。stack は出さない | Cloud Run が重大度・時刻として読む特別フィールド | 説明 |
| 行の形 | 重大度は種類と `event.phase` が決め（`LogSeverity.of`）、呼び出し側は選ばない | 同じ種類の行の重大度がずれると、重大度で絞ったアラートが行を拾わない | `pnpm typecheck` |
| 行の形 | ほかのキーは OTel semconv の名前を入れ子のオブジェクトの snake_case で書く（平らな `"http.request.method"` にしない） | 基盤を移っても対応表が要らない | レビュー |
| 種類 | 種類ごとの項目と必須は `apps/shared/log-event.ts` の `LOG_EVENT_SCHEMAS` が決め、`message`（英語の 1 文）と `event.name`（`LOG_EVENT_NAMES` の一覧だけ）は必須 | 1 つの条件で種類を引け、名前の揺れでアラートが行を取りこぼさない | `pnpm typecheck` |
| 種類 | 段階は `event.phase`、所要時間は `event.duration_ms` に入れ、名前に段階を入れない | - | レビュー |
| 種類 | 種類・項目を足すときは `LOG_EVENT_NAMES`・`LOG_EVENT_SCHEMAS`・`logger.test.ts` の期待値を同じ変更で直す（`.claude/rules/code/shared.md` の「ログのスキーマとマスクの印」） | - | レビュー |
| マスク | 呼び出し側は生の値を渡すだけで、伏せる・省く処理を書かない。マスクは logger の中の 3 段（スキーマの allowlist・印・自由文の正規表現）で行い、DB の行の値だけは Writer が列の分類表で行う | 呼び出し側ごとに伏せると書き忘れた 1 か所から漏れる。allowlist なので足し忘れた値は出ないほうに倒れる | レビュー |
| マスク | (1) スキーマに書いた項目だけが出る。(2) `LogFieldMarks.sensitive()` の値は常に `***`。全種類の sensitive の項目と一覧に無いキーに番兵の値を入れ、出力に含まれないことを確かめる | - | `apps/shared/logger.test.ts` |
| マスク | (3) `LogFieldMarks.freeText()` の項目だけに決まった形（メールなど）を伏せる正規表現をかける。クライアントが決める文字列は 256 文字に切る | 正規表現は見逃し・誤検知があるので最後の網に限る | 説明 |
| 使ってよい場所 | backend で logger を使ってよいのは feature の `presentation`・`infra`・`expose/` と `apps/backend/shared/` だけ（domain・application は使わない） | 外の世界に触る基盤 | `rule-tests/architecture.test.ts` の `presentation`・`infra`・`expose-imports`・`SHARED_MODULES_BY_LAYER` |
| 使ってよい場所 | `apps/backend/shared/` の中の logger の使用はどの規則も止めないので、レビューで見る | 機械が見逃す | レビュー |
| 使ってよい場所 | 非同期の作用（通知など）の失敗を `server_error` にしない | `server_error` は HTTP の境界の 500 だけの種類で、作用の失敗は応答を 500 にしない | レビュー |
| db_write | Writer が文ごとに `db_write` の start（INFO）・done（INFO。所要時間と行ごとの before / after。public 以外は `***`）・failed（WARNING。同じ例外を投げ直す）を出す。done は COMMIT の前に出る | 何をどう変えたかをログで追える。500 は `server_error`（ERROR）が別に残す | `apps/backend/shared/drizzle/writer.test.ts` |
| db_write | `event.duration_ms` は `performance.now()` の差をミリ秒の整数に四捨五入する（`Clock.now()` の規則の対象外） | 経過時間で時刻ではない | 説明 |
| DB のエラー | DB のエラーのログは pg の message の最初の `"` から最後の `"` までを `"***"` にし、SQL の値（`params`）は全要素 `***` にする。SQLSTATE と制約名は別の項目に出す | pg は入力値を引用符で囲んで含み、中の `"` を逃がさない | `apps/backend/shared/drizzle/writer.test.ts` |
| DB のエラー | Writer を通らずに `server_error` に届く DrizzleQueryError は、logger が「`query` か `params` のプロパティを持つ Error の message は `***`」にする | message が SQL とパラメータの値を含む | `apps/backend/shared/http/problem.test.ts` |
| テスト | ログのテストは `vi.spyOn(console, "<method>")` で出力を抑え、渡された 1 行を `JSON.parse` して確かめる。書き込みのある Repository のテストは `beforeEach` で `console.log` / `console.warn` を黙らせる | - | レビュー |

## クラスと命名

| カテゴリ | WHAT | WHY | 強制 |
| --- | --- | --- | --- |
| クラス | 本番コードとテストの補助（`test-support/`・`spec/` の `support.ts`）はファイルの最上位に関数を置かず、クラスにする | - | `rule-tests/architecture.test.ts` の `class-based` |
| クラス | インスタンスで使うクラス（Repository・Api・Entity など）の補助は `private` のインスタンスのメソッドにし、static は自分のクラスを返すファクトリだけ。インスタンスを作らない補助は static だけのクラスにする（Biome の override は `.claude/rules/quality/lint.md`） | - | `rule-tests/architecture.test.ts` の `no-static-in-instance-class` |
| 命名 | ディレクトリ・ファイルは kebab-case、型は PascalCase | - | レビュー |
| 命名 | api ファイル・query・command は `<verb>-<noun>` に役割の接尾辞（`.api.ts`・`.query.ts`・`.command.ts`・`.in-memory.ts`・`.postgres.ts`・`.test.ts`）。クラス名は `<Verb><Noun>` に役割（`Api`・`Query`・`Command`） | - | レビュー |
| 命名 | Repository の実装は `<name>-repository.<impl>.ts`、クラスは `Postgres<Name>Repository` / `InMemory<Name>Repository` | `presentation` は組み立てに使う実装をファイル名 `*-repository.postgres` で見分け、ほかの名前の付け方は止めない | レビュー |
