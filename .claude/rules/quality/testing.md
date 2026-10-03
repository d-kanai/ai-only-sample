---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "apps/e2e/**"
  - "apps/backend/spec/**"
  - "rule-tests/**"
  - "vitest.config.mts"
  - "vitest.global-setup.ts"
  - "stryker.config.mjs"
---

# テスト

テストは仕様。仕様が黙って外れたり、壊れたコードを見逃したりしない状態を保つ。

## 機能を足すときに書くテスト
- 層ごとの単体テスト: 分岐と失敗の網羅、mutation を殺す担い手。
- domain 仕様: Entity の業務ルール。domain の単体テストには技術の仕組み（id の形・不変・値の凍結・型を偽った値・Invalid Date・origin・完全コンストラクタ）だけを残す。
- API 仕様: API ごとに必ず置く（`api-spec-pair`）。API ジャーニー: API を足したら、それを使う業務の流れを足す（API 網羅率 100%）。E2E: 画面を通した利用者の操作。
- 役割の違う 2 か所での重複は許す（業務ルールは domain 仕様だけ）。

## 基本
- テストを先に書き、**失敗を確認してから**実装する。WHY: 先に失敗を見ないと、何も検査していないテストに気づけない。
- テスト名は日本語の仕様文（「〜すると〜になる」「〜のときは〜しない」）。WHY: 一覧がそのまま仕様になり、どの仕様が破れたかが分かる。
- 分岐を通すだけにせず、起きること（返り値・状態・呼び出し・出力）を検証する。WHY: 検証しなくてもカバレッジは上がる。
- `it.skip` / `it.only` を残さない（Biome の `noSkippedTests` / `noFocusedTests`）。Gherkin の skip・only・タグは各仕様の検査（`*-no-skip` / `*-tag` / `e2e-feature-tag`）が止める。WHY: skip は仕様を黙って外し、only はほかを黙って止める。
- 失敗（reject / throw）は `rejects.toEqual(new Error("..."))` でクラスと message を比べる（クラスが決まらなければ `rejects.toBeInstanceOf(Error)` と `rejects.toMatchObject({ message })`）。WHY: Vitest 5.0.1 の `toThrow("文字列")` / `toThrowError("文字列")`（`rejects.` も同期も）は値が `undefined` だと文字列を照合せずに通る。
- フェーズコメント: テストの本体（ブロック `{ }`）に行頭の `// given` → `// when` → `// then`（when → then の繰り返しは可）。when / then にはコードを置き、`expect(f(x))` は `const result = f(x)`、`expect(() => f())` は `const action = () => f()` で分ける。given が空なら `// given: <前提>`。対象は `it` / `test`（`.each` なども）と `*` の step（Given / When / Then の step は対象外）。検査は `rule-tests/test-phases.test.ts`（`test-phase-comments`）。WHY: 前提・操作・検証の境目が一目で分かる。
- 複数件を扱う処理（一覧・1 対多・グループ化・集計）は、親と子の 0 / 1 / 複数件のうち仕様上ありうる組み合わせを並べ、**親が複数で各子も複数**を必ず含める。結果は全体を `toEqual` / `toStrictEqual` で比べ、子の値を親ごとに変え、保存の順を期待の並びと変える。WHY: 境目で子が隣の親に混ざる・最後の親の子が落ちる誤りは、片方が 1 件では起きない。機械化: 縛れない（ありうる組み合わせは字句で決まらない）。
- テストを足す・書き換えたら、守るコードを 1 度壊して（条件の反転・戻り値の変更・呼び出しの削除）落ちることを確かめ、戻す。WHY: 検証が弱いと壊しても緑のまま。

## 置き方と環境
対象と同じディレクトリに `<対象>.test.ts(x)`（`apps/frontend_customer/app/` には置かない）。仕様は `apps/backend/spec/`、E2E は `apps/e2e/spec/`。

| カテゴリ | 対象 | 方法 | 環境 |
| --- | --- | --- | --- |
| Backend UT | `apps/backend/**/domain` | 純粋な単体テスト（時計は `Clock.now` の `vi.mock`） | Node |
| Backend UT | `apps/backend/**/application` | InMemory リポジトリ（`apps/backend/test-support/<feature>/*.in-memory.ts`）を渡す | Node |
| Backend UT | `apps/backend/**/infra` の `*.postgres.ts`・`database.ts` | 実 Postgres。`TestDatabase.create()` がファイルごとの別スキーマ（`test_<UUID>`）にマイグレーションを当て、各テストの前に `TRUNCATE` | Node |
| Backend UT | `apps/backend/**/presentation` | 空の InMemory で組み立てた handler（`new <X>Api(new <X>Query(new InMemory<Entity>Repository())).handle`）に `new Request()`（と `ctx`）を渡し `Response` を検証。本番の handler（`export const GET` など）は結線だけ（「テストダブル」） | Node |
| Backend 仕様 | `apps/backend/spec/domain/<feature>/<name>.domain-spec.test.ts` | Entity を直接呼ぶ（下の「domain 仕様」） | Node |
| Backend 仕様 | `apps/backend/spec/api/<feature>/<api>.api-spec.test.ts` | 実 Postgres で本番と同じに組み立てた handler（下の「API 仕様テスト」） | Node |
| Backend ジャーニー | `apps/backend/spec/journey/<usecase>.api-journey.test.ts` | 実 Postgres で本番と同じに組み立てた複数の handler を業務の流れの順に呼ぶ（下の「API ジャーニーテスト」） | Node |
| Shared UT | `apps/shared/` | 純粋な単体テスト（一時ディレクトリの `.env`・`console` の spy・`Clock.now` の `vi.mock`） | Node |
| Frontend UT | `apps/frontend_customer/features/**/*.hook.ts` | `renderHook` で状態とイベント | jsdom |
| Frontend UT | `apps/frontend_customer/features/**/*-screen.tsx` | render して操作し、表示を検証 | jsdom |
| E2E | `apps/e2e/spec/<name>.feature` と `<name>.steps.ts` | Playwright で本番ビルドを起動し、Chromium で操作（下の「E2E」） | Chromium |

- `apps/backend/`・`apps/shared/` のテストは先頭に `// @vitest-environment node`（既定は jsdom）。
- WHY 別スキーマ: Vitest はファイルを並列に、Stryker は複数プロセスで実行するので、同じ `public` の表では互いの `TRUNCATE` でデータが消え、`pnpm dev` や E2E の表も消える。drizzle の migrator には同時実行の排他が無い。
- `pnpm test` / `test:unit` / `test:api-journey` / `test:mutation` は Postgres が前提（`pnpm db:up`）。

## カバレッジ（100%）
- `pnpm test`（`vitest run --coverage`）は Statements / Branches / Functions / Lines のどれかが 100% 未満なら失敗する（CI でも）。速く回すなら `pnpm test:unit`、完了前は必ず `pnpm test`。設定と WHY は `vitest.config.mts`。
- 計測対象: `apps/frontend_customer/` の `features/`・`shared/`・`test-support/`、`apps/backend/`、`apps/shared/`、`scripts/`（`.ts` / `.tsx` / `.mjs`。テスト・`*.d.ts`・`apps/backend/` 直下の `*.config.ts` を除く）。
- 計測しない: `apps/frontend_customer/app/`・`proxy.ts`・`instrumentation*.ts`（結線・起動だけ。中身は別のテスト、結線は E2E）、設定ファイル、`.sh`（V8 は JS しか測れない）。
- 足りなければテストを足す（`/* v8 ignore */` で逃がさない）。対象外を増やすときは上の方針に合うか確かめ、`vitest.config.mts` とここに理由を書く。

## globalSetup（テスト用スキーマの後始末）
- `vitest.global-setup.ts` が実行の最初に `test_` で始まるスキーマを `DROP SCHEMA ... CASCADE` で消す（`TestSchemas.cleanup`。`afterAll` の削除も残す）。WHY: `afterAll` の前に止まる（Stryker が worker を止める・Ctrl-C）と残り、テストの前なら消してよいのは前の実行の残りだけ。
- 探し方は `starts_with(schema_name, 'test_')`（LIKE の `_` は任意の 1 文字）。接続できなければ英語のエラーで止める。
- `STRYKER_MUTATOR_WORKER` があれば消さない（並行する worker のスキーマを消すため）。同じ DB に `pnpm test` を 2 つ同時に動かさない。
- `TestSchemas.cleanup` のテストは接頭辞 `test_cleanup_<UUID>_` で行う（`test_` だと並列の他のファイルのスキーマを消す）。

## テストダブル
- backend: InMemory リポジトリ（`apps/backend/test-support/<feature>/<名前>-repository.in-memory.ts`。`in-memory-placement`）を query / command に渡す。書き込みの command には `InMemoryTransactionRunner`（`test-support/transaction-runner.in-memory.ts`。rollback は再現しない）も渡す。直接置くときは `repository.insert(<entity>, inMemoryTransaction)`。WHY: モックは「こう呼ばれるはず」を書き込むので、実装とずれても緑のまま。
  - 検査は `rule-tests/test-doubles.test.ts`: backend のテストの `vi.mock` / `vi.doMock` は `@repo/shared/now` だけ（ほかは直前の行の `// WHY モック: <理由>`）。`apps/backend/test-support/database` の import は infra のテスト・test-support 自身のテスト（直下と `<feature>/*-builder.test.ts`）・API ジャーニー・API 仕様・`vitest.global-setup.ts` だけ（`db-tests-in-infra-only`）。
  - Postgres の実装はモックせず実 Postgres で（SQL・uuid は差し替えると検証できない）。例外は api ファイルの本番の handler の結線の確認: `Postgres<Entity>Repository.prototype` と `PostgresTransactionRunner.prototype.run`（work に `inMemoryTransaction` を渡し DB に接続しない）を spy し、呼ばれることだけを見る。
  - InMemory で起こせない失敗の経路だけ差し替える（常に reject する repository など）。
- テストデータビルダー: 実 Postgres のテストの前提の行は `apps/backend/test-support/<feature>/<名前>-builder.ts`（`<Entity>Builder.of(db).<項目>(値).build()`）で表に直接入れる。`build()` は入れた値を返し、指定しない値は既定値、setter は新しいビルダーを返す。`change_logs` は書かない。テストは隣の `*-builder.test.ts`。WHY API・Repository を通さない: 前提を対象でない API に依存させず、不変条件を満たさない行も作れ、確かめる記録が対象の操作のものだけになる。
- 時計: `Clock.now`（`apps/shared/now.ts`）を `vi.mock`（backend は `"@repo/shared/now"`、`apps/shared` は `"./now"`）し、`vi.mocked(Clock.now).mockReturnValue(date)` / `mockReturnValueOnce(date)`、`afterEach` で `mockReset()`。自動モックの既定は `undefined`。実時刻のテストもあるファイルは `{ spy: true }`。`vi.useFakeTimers` は `now.ts` 自身のテストだけ。WHY: 時計は横断的な seam（`.claude/rules/code/shared.md`）。
- 画面側の hook / screen: `vi.mock("@/features/<feature>/api/<feature>-api")` と `vi.mocked(<Feature>Api.list).mockResolvedValue(...)`。WHY: 境界の `api/` で切ると HTTP やサーバの状態に依存しない。
- `api/`: `vi.stubGlobal("fetch", vi.fn<typeof fetch>())` で、送った URL・メソッド・本文と応答の扱いを検証する。
- 非同期の順序（古い応答が後から届くなど）は任意の時に resolve できる `deferred()`（各テストファイルに定義）で作る。WHY: `mockResolvedValue` は即時で、タイマーは環境の速さに左右される。

## ルール検査テスト（規則・設定が効いていることを検査するテスト）
今あるもの: `rule-tests/architecture.test.ts`（`.claude/rules/code/architecture-check.md`）、`rule-tests/lint.test.ts`（`.claude/rules/quality/lint.md`）、`rule-tests/package.test.ts`・`rule-tests/pnpm-workspace.test.ts`・`rule-tests/licenses.test.ts`（`.claude/rules/tooling/dependencies.md`）、`rule-tests/typecheck.test.ts`（`pnpm typecheck` と CI の順序）、`rule-tests/schema.test.ts`・`rule-tests/migration.test.ts`・`rule-tests/persistence.test.ts`・`rule-tests/api-request.test.ts`・`rule-tests/use-case.test.ts`・`rule-tests/domain-validation.test.ts`・`rule-tests/test-support.test.ts`（`.claude/rules/code/backend.md`）、`rule-tests/test-doubles.test.ts`・`rule-tests/test-phases.test.ts`・`rule-tests/api-journey.test.ts`・`rule-tests/api-spec.test.ts`・`rule-tests/domain-spec.test.ts`・`rule-tests/e2e-feature.test.ts`・`rule-tests/rule-test-feature.test.ts`（このファイル）、`rule-tests/rules-table.test.ts`（`.claude/rules/code/*.md` は見出し・`| カテゴリ | WHAT | WHY | 強制 |` の表・コードブロックだけ、強制は `レビュー` / `説明` / 実在する検査）、`rule-tests/design-system.test.ts`・`rule-tests/screen-outline.test.ts`（`.claude/rules/code/frontend.md`）、`rule-tests/settings.test.ts`（`.claude/rules/tooling/git-guard.md`）、`rule-tests/work-logs-check.test.ts`（`.claude/rules/tooling/work-log-hooks.md`）、`rule-tests/github-actions.test.ts`（`.claude/rules/tooling/github-actions.md`）、`rule-tests/security-scan.test.ts`（`.claude/rules/tooling/security-scan.md`）、`rule-tests/issue-template.test.ts`（`<type>.yml` と `config.yml` だけ・labels はファイル名の type・項目は 目的・内容・完了条件・前提（任意）の順・空の Issue の禁止）、`rule-tests/gitattributes.test.ts`（`linguist-generated` は lockfile・drizzle-kit の meta・`docs/`・`.claude/` だけ）、`rule-tests/instructions.test.ts`（指示ファイル・ADR・スキルの形。この行の一覧は `rule-tests-index` が検査）、`scripts/cloud-session-start.test.ts`（`.claude/rules/tooling/cloud-session.md`）と、git ガード・作業ログ・worktree のフックのテスト（`scripts/hooks/*.test.ts`）。テスト以外のゲート（カバレッジ・フック・CI の required check・型チェック）も同じ扱い。
- 形: `rule-tests/<名前>.feature`（`Feature:` の下に `Scenario:` と `*` の step だけ）と、`loadFeature("./<名前>.feature")` で読む `<名前>.test.ts` の対。describe 1 つ = Scenario 1 つ、it 1 つ = `*` 1 つ。表のケースは `*` 1 行にまとめ、原則 `rule-tests/case-table.ts` の `casesByName` で比べる（名前が重なる・1 件に expect が複数なら `for` と `expect` の第 2 引数のケース名）。vitest から it / test / describe / suite を import しない。step の文に先頭以外の `*`・波かっこ・対でないかっこを書かない（正規表現として読まれる）。検査は `rule-tests/rule-test-feature.test.ts`。
- **must pass と must reject の両方**を持つ（「今のリポジトリで違反 0 件」は must pass の 1 例にすぎない）。判定を関数に切り出して架空の入力で固定し、同じ関数で実ファイルを検査する。一時ディレクトリの fixture で end-to-end に通し、違反の集合は `toEqual` で丸ごと比べる。列挙が空なら失敗させる。規則を変えたら例と fixture も直す。WHY: must reject だけでは「何でも違反」、must pass だけでは「常に緑」を、判定だけでは抽出の漏れを検出できない。
- **fault injection** は必須（最小セット: 規則を破る 1 件・判定を常に許可・常に拒否）。戻して `git status --short` と `git diff` を確かめ、何を壊して何件落ちたかを報告・PR に書く。手順はスキル `rule-check-test`。

## API ジャーニーテスト
実 Postgres で、複数の API の handler を業務の流れの順に呼ぶテスト。流れを Gherkin（`@amiceli/vitest-cucumber`）の `.feature` に日本語の step で書き、step の実装を対の `.api-journey.test.ts` に書く（この対だけ）。検査は `rule-tests/api-journey.test.ts`（WHY と限界はその冒頭）。
- 分岐の網羅は持ち込まない（単体で行う）。WHY: 単体は Postgres を通したつながりを見ず、E2E は遅く切り分けにくい。
- 置き場所: `apps/backend/spec/journey/` の直下に `<usecase>.feature` と `<usecase>.api-journey.test.ts`（`api-journey-feature-pair`）。外の `.feature`（`spec/api/`・`spec/domain/`・`apps/e2e/` を除く）と `*.api-journey.test.*` / `*.journey.test.*` は違反（`api-journey-placement`）。WHY: `.feature` を実行するのは対の step だけ。共通の補助は `apps/backend/test-support/`。1 対 = 1 業務ユースケース、1 シナリオ = 1 つの流れ（順序で状態を担保）。
- step のファイルは `loadFeature("./<usecase>.feature")` で対の `.feature` を読む（読むパスが対かは検査しない）。
- 組み立ては本番の api ファイルの最下部と同じで、db だけ `TestDatabase.create()`（本番の `export const GET` は `.env` の DB を指す）。`beforeAll` で `create()` と `migrate()`、`Background` で `TRUNCATE`、`afterAll` で `close()`。
- `.feature` の書き方（E2E も同じ。禁止語は API 仕様・domain 仕様も同じ）:
  - キーワードは英語（`Feature` / `Background` / `Scenario` / `Given` / `When` / `Then` / `And`）、step は日本語。値は `{string}` / `{int}` で受け、引数に型を注釈する（`(_ctx: TestContext, name: string)`）。
  - 業務の言葉だけ。`#` のコメント行以外（仕切りの見出しは見る）に `rule-tests/feature-business-language.ts` の `FORBIDDEN_WORDS_IN_FEATURE`（DB・テーブル・ステータス・状態コード・3 桁の 1xx〜5xx の数・JSON・null・id・HTTP のメソッド名・変更の記録 など）を書かない（`api-journey-business-language`）。後ろに「文字」「件」「行」が続く 3 桁の数は許す。技術の検証（状態コード・応答の本文・DB の行・変更の記録）は step の実装に閉じる（例: 「状態 404 で not found が返る」→「… は存在しないと伝えられる」）。WHY: `.feature` は開発者でない人も読む業務の仕様。
  - 禁止語に無い一般的な言葉（API・HTTP・リクエスト・レスポンス・ETag など）はそのまま使い、独自の言い換えにしない。WHY: 知っている言葉のほうが読みやすい。機械化: 縛れない（レビューで見る）。
  - シナリオの When の直前（空行なし）に仕切り `# ───── <業務の動作> ─────`（`─` は 5 つ、前後に空白）。Background には置かない（`api-journey-section-divider`）。WHY: 長いシナリオを見出しで拾い読みできる。
  - 同じシナリオで同じ種類の step が同じ式に一致しないよう文を変える（vitest-cucumber 8.0.0 は 2 つ目を「Missing steps」で失敗にする）。
  - step 間の値はシナリオの関数の中の変数で渡し、`.feature` の値を step に固定値で書かない。WHY: 値を変えると後続が落ちる。
  - `@` のタグを書かず、`.skip(` / `.only(` とタグの絞り込みを使わない（`api-journey-tag` / `api-journey-no-skip`）。WHY: 既定の excludeTags（`@ignore` など）で skip され、黙って緑になる。
  - 見逃されること: API を呼ぶ step を When 以外で書くと仕切りを要求しない。一覧に無い語（複数形・全角）は見ない。
- 各 step は status と本文で確かめ、変更系の API の後は `db.select(` で DB の行を読み `toStrictEqual` で行全体を比べる（失敗した要求の後は行が変わらないこと）。WHY: 応答が正しくても永続化がずれる誤りは次の API の応答では見逃しうる。
  - handler の変数（オブジェクトのキーも）は HTTP メソッドで始める（`post<Entity>` / `put<項目>` / `get<Entity>` など。`api-journey-handler-naming`）。WHY: 検査は名前（`post` / `put` / `patch` / `delete`）で変更系を見分ける。
  - `db.select(` は変更系の呼び出しごとにその後に直接書く（補助にまとめない）。step の関数は `.feature` と同じ順に書く（検査はソースの順）。
  - 見逃されること: 読んだ行を検証しているか、名前と Api の実際の働きが合っているか（reviewer が見る）。
  - 異なる `*.api` を 2 つ以上と `test-support/database` を値で import する。
- テストダブルは使わない: `vitest` から `vi` を import しない（別名・名前空間・dynamic import も違反）、`*.in-memory` を import しない（`import type` も）。時刻に依存する並びは実時計が進むのを待って作る（`waitUntilAfter`）。
- 実行: `pnpm test:api-journey`（`pnpm test` にも含む）。
- API 網羅率: 全 API（`apps/frontend_customer/app/api/**/route.ts` が re-export する HTTP メソッド）がどこかの API ジャーニーで呼ばれていなければ `pnpm test` が失敗する。WHY: 流れに現れない API は確かめられていないか要らない。
  - 各 Api を `ApiCoverage.track(new XxxApi(...))` で包む。判定は全ジャーニーを含む実行だけ（単体・API 仕様の呼び出しは数えない）。
  - route.ts は re-export（`export { GET } from "@repo/backend/..."`）と `//` のコメントだけ。ほかの書き方・2 つの API が同じ Api のクラスを指すと例外になる。
- Stryker では実行しない（`vitest.stryker.config.mts` の `exclude`）。WHY: Stryker が test を絞ると前提の step 抜きで後の step が落ち、killed と数えられうる。

## API 仕様テスト（spec/api）
API 1 つ（`apps/backend/features/<feature>/internal/presentation/<api>.api.ts`）の振る舞いを `<api>.feature` に業務の言葉で書き、`<api>.api-spec.test.ts` が実 Postgres の上で本番の組み立てを通して確かめる。presentation の単体テストも残す。検査は `rule-tests/api-spec.test.ts`（WHY と限界はその冒頭）。
- 置き場所: `apps/backend/spec/api/<feature>/` の直下に `<api>.feature`・`<api>.api-spec.test.ts`・補助の `support.ts` だけ（`api-spec-placement`）。API 仕様だけの補助は `apps/backend/test-support/` に置かない（ほかのテストも使うテストダブル・DB 基盤・ビルダーだけを置く）。api ファイルごとに対を置き、API の追加・削除・改名に合わせる（`api-spec-pair`）。
- `.feature`: `Feature:`（下に説明の行を書いてよい。step で確かめられない振る舞いは説明に書き、単体テストが固定する）の下に `Scenario:`。見出しは次の一覧から 1 回ずつこの順に、該当の無いものは省く（`api-spec-scenario-heading` / `api-spec-scenario-order`）。作成 / 更新 / 削除は 1 つまでで、記録か副作用があれば 1 つ要る（`api-spec-write-heading`）。

  | API | 見出し | 書くこと |
  | --- | --- | --- |
  | 読み取り | `レスポンス` / `ソート` / `検索` | 返る内容 / 並び順 / 絞り込みの条件 |
  | 読み取り | `異常系` | 失敗と、そのときに伝えられること |
  | 書き込み | `作成` / `更新` / `削除` のどれか | 対象自身が操作の後どうなるか（step は保存された行を見る） |
  | 書き込み | `レスポンス` | 返る内容 |
  | 書き込み | `記録` / `副作用` | 対象のほかに残るもの（履歴など） / 外へ出ていくもの（通知など） |
  | 書き込み | `異常系` | 拒否と、そのときに何も変わらないこと |

  - WHY: 同じ観点で拾い読みでき、抜けが分かる。「作られる」と「返る」を読み分ける。
  - `Scenario Outline` / `Scenario Template` / `Rule` / `Background` / `Example(s)` / `Scenarios`・`# language:`・`@` のタグは使わない（`api-spec-keyword` / `api-spec-tag`）。WHY: 別名や別の言語で見出しの検査を逃れさせず、タグで skip させない。
  - step は `*` だけで各 Scenario に 1 つ以上（`api-spec-step-star`）。`*` 1 行 = 1 振る舞い = 1 テストで、前提・API の呼び出し・応答と DB の確認を step の中で完結させる。WHY: 読み手には振る舞いだけを見せ、Stryker が絞っても前提が飛ばない。
  - 禁止語は API ジャーニーと同じで、`#` のコメント・空行・`Feature:` / `Scenario:` の見出しの行を除く（`api-spec-business-language`）。
- 前提: 前提の行はテストデータビルダーで入れ、step が呼ぶ API は対象の 1 つだけ。後の状態（削除済みなど）も行を消して作る。期待値は入れた値から作り、変更の記録の期待値は対象の操作のものだけ。WHY: 関係の無い API の変更で仕様が落ちず、記録に前提のものが混ざらない。
- step の実装:
  - `vi` を import しない（`api-spec-no-vi`）。例外は別名なしの `import { vi }` を `vi.spyOn(console, ...)` だけに使い、戻り値の `mockRestore()`・型 `MockInstance` で扱う場合。WHY: 送り先がログの通知は console を差し替えないと読めず、console は本番の部品の外。
  - `*.in-memory` を import しない（`import type` も。`api-spec-no-in-memory`）。step のファイル自身が `test-support/database` を値で（`api-spec-uses-real-database`）、対の api を（型だけでもよい。`api-spec-uses-own-api`）import する。
  - `support.ts` から値で取り込む組み立ては対の `<api の PascalCase>ApiAssembly` だけ。ほかの api ファイルは型だけ（`api-spec-own-api-only`）。WHY: 対象でない API で前提を作らせない。
  - `loadFeature("./<api>.feature")`（第 2 引数なし）で読む。別名・`setVitestCucumberConfiguration`・`loadFeatureFromText`・`defineFeature` は違反（`api-spec-load-feature`）。`.skip(` / `.only(` / `.skipIf(` / `.runIf(` と `includeTags` / `excludeTags` も違反（`api-spec-no-skip`）。
- `support.ts`: 組み立て・DB の読み出し・期待値を共有するクラスだけを export する（`class-based`）。
  - 組み立ては API ごとのクラス `<Api のクラス名>Assembly`（`.handler(db)` が handler を返す）で、その中で Api を 1 つだけ new する（`api-spec-support-assembler-per-api`）。ほかの補助は用途ごとのクラス（行・期待値・記録・要求・失敗の本文）。WHY: 1 つのクラスにまとめると、import するだけでどの API にも触れられる。
  - `support.ts` の中で handler・組み立てを呼ばない。api ファイルは Api のクラス名のまま値で import し、組み立ての `new <名前>Api(` 以外で使わない（`api-spec-support-no-api-call`）。自 feature の api を 1 つ以上値で import する（`api-spec-support-assembles-apis`）。`vi` を import しない。
  - test-support を import できない（`production-imports-test-support`）ので、ビルダーの返り値と同じ形の型を `support.ts` に書く。
  - 見逃されること: step が対の api を実際に呼び、DB の行を確かめているか（reviewer が見る）。
- `pnpm test` と Stryker の実行に含まれる。

## domain 仕様（spec/domain）
Entity の業務ルール（不変条件・用語・規則の理由）を `<name>.feature` に業務の言葉で書き、`<name>.domain-spec.test.ts` が Entity を直接呼んで確かめる。.feature だけ読めば業務が分かるようにする。検査は `rule-tests/domain-spec.test.ts`（WHY と限界はその冒頭）。
- WHY API 仕様と別に置く: API から作れない規則（履歴の不変条件など）も、Entity を直接呼べば前提から確かめられる。
- 置き場所: `apps/backend/spec/domain/<feature>/` の直下の対だけ（`domain-spec-placement` / `domain-spec-pair`）。
- `.feature`: `Feature:` → `Rule:` → `Scenario:` → `*`（各 Scenario に 1 つ以上）。`Feature:` と各 `Rule:` の直後に説明の行（仕様メモ。用語と規則の理由）を 1 行以上（`domain-spec-structure`）。`#` のコメントは開発者向けで仕様メモと混ぜない。キーワードはこの 4 つだけで、タグ・`# language:` は使わない（`domain-spec-keyword` / `domain-spec-tag`）。禁止語は API ジャーニーと同じ（`domain-spec-business-language`）。WHY 仕様メモ: 規則だけでは「なぜ」が読めない。
- step の実装: `loadFeature("./<name>.feature")`（第 2 引数なし）を `describeFeature` に渡し、skip・タグの絞り込みを使わない（`domain-spec-load-feature`）。同じ feature の `internal/domain/` を相対パスで値として import し、InMemory と `test-support/database` は使わない（`domain-spec-pure`）。`Rule` → `RuleScenario` → `And`（`*`）で書き、step 1 つで前提から検証まで完結させる。時計は `Clock.now` の `vi.mock`。Stryker の実行に含まれる。

## mutation testing（Stryker）
手順・生き残りの直し方・日次ジョブはスキル `mutation-testing`、設定の WHY は `stryker.config.mjs`。
- 目標は score 100%（`thresholds.break: 100`。survived が 1 件でも日次ジョブが失敗）。
- カバレッジのしきい値は Stryker では効かない（vitest-runner が coverage を無効にし、変異ごとに通るテストだけを実行する）。カバレッジのゲートは `pnpm test`。
- ロジックの変異はテストを足して殺す。API のエラーの本文（Problem Details の `title`・`detail` など。`apps/backend/shared/http/problem.ts`・`problem-detail.en.ts`）も検証して殺す。
- `// Stryker disable next-line <Mutator>: <理由>` は**等価な変異**と**検証しない文言**（内部のログなど）だけ。殺せるのに省くために使わない。「等価」と決める前にほかの実行経路を探す（例: `<Activity mode="hidden">` でも effect の片付けと state 更新は走る）。
- 等価な変異を生む書き方をしない: 結果を変えない検査（`"error" in value` の後の型の確認）を書かない、握りつぶす `try` は対象の呼び出しだけを囲む、ロジックの定数（正規表現・変換表・URL・接頭辞）は関数の中に置く（最上位は `ignoreStatic` で外れる）。
- disable は理由をコメントに書く（`// Stryker disable next-line <Mutator>: <理由>`）。今ある disable は `grep -rn "Stryker disable" apps` で引く。
- `ignoreStatic` で外れる最上位の値: テーブル宣言（`schema.ts`・`*.schema.ts`）は等価として受け入れる（理由は `stryker.config.mjs`）。列の分類表と `apps/shared/log-event.ts` の `LOG_EVENT_SCHEMAS` は、番兵の値を含む行の丸ごとの比較で固定する。`apps/backend/shared/change-log/change-operation.ts` の定数は等価の確認をしていない。
- テストで `@repo/backend/...`・`@repo/shared/...` から値を import すると変異が届かない。それぞれの中のテスト（相対 import）で確かめる。

## E2E（Playwright + playwright-bdd）
画面・ビルド・ルーティングを通した利用者の操作を、API ジャーニーと同じ書き方の `.feature` に書き、step をクラスに書く。検査は `rule-tests/e2e-feature.test.ts`（WHY と限界はその冒頭）。
- `apps/e2e` は workspace パッケージ `@repo/e2e`。E2E だけの依存（Playwright・`pg` など）は `apps/e2e/package.json` に置く。
- `pnpm test:e2e`（`bddgen && playwright test`）。`bddgen` が `.features-gen/` に生成し、step の実装が無い・同じ文の step が 2 つあると失敗する。`webServer` が本番ビルドを `E2E_PORT` で起動する（起動済みならそれを使う）。`pnpm test` には含めない。
- 置き方: `apps/e2e/spec/` の直下に `<name>.feature` と `<name>.steps.ts` の対、共有の step は `shared.steps.ts`。手書きの `*.spec.*` / `*.test.*` は置かない（`e2e-feature-placement` / `e2e-feature-pair`）。土台は `apps/e2e/support/`（`database.ts`・`log-server.ts`・`fixtures.ts`）。WHY `test-support/` にしない: 全体がテストの `apps/e2e` では区別にならない。
- `.feature` は API ジャーニーと同じ（`e2e-feature-business-language` / `e2e-feature-section-divider`）。`Background` で `E2eDatabase` が表を `TRUNCATE` する（外部キーで参照し合う表と `change_logs` は同じ文で。保存の状態に依存しない `.feature` は除く）。WHY: データはサーバを起動し直しても残る。部品の探し方・状態コード・ログの形・DB の件数は step に閉じる。
- step: メソッドに `@Given` / `@When` / `@Then`、クラスに `@Fixture<typeof test>("<名前>")` を付け、`fixtures.ts` で fixture にする。`page`・`request` などはコンストラクタで受け、step 間の値はフィールドに持つ（シナリオごとに作り直される）。WHY: 最上位に関数を置かない（`class-based`）。step の文はファイルをまたいで重ねない（bddgen が失敗する）。
- タグは `@ブラウザの言語が英語` だけ（`e2e-feature-tag`。locale を `en-US` にする。既定は `ja-JP`）。WHY: context は step より前に作られ、Accept-Language の上書きでは Chromium が locale を送り続ける。Given「ブラウザの言語が英語である」が `navigator.language` を確かめて付け忘れを止める。
- サーバとテストは同じ `env.DATABASE_URL`。前提は `pnpm db:up && pnpm db:migrate`（`webServer.command` では当てない）。起動済みのサーバを使うときはその環境変数・コードのまま動く。
- 1 シナリオで CRUD を一周する（`workers: 1`。順序で状態を担保する）。
- サーバの stdout を見る `.feature` は、worker の fixture `logServer` が `next start -p 0` を子プロセスで起動して読む。WHY: webServer の stdout は worker から読めない。
- Chromium が合わないとき（クラウド VM）は `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:e2e`。入れるのは `pnpm --filter @repo/e2e exec playwright install chromium`（OS の依存も入れるなら `--with-deps` か `pnpm --filter @repo/e2e install-browser`）。
