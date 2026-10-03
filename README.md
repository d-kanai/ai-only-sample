# ai-only-template

AI（Claude Code）が Issue → ブランチ → PR → マージ の流れで開発を進めるためのテンプレートリポジトリ。
運用ルールは `CLAUDE.md` から辿れるように置いている（下の「指示ファイルの構成」）。

## Tech Stack

| 領域 | 技術 | 備考 |
| --- | --- | --- |
| バージョン管理 | [asdf](https://asdf-vm.com/) | Node.js と pnpm の版を `.tool-versions` で固定し、人間・AI が同じ環境で動かす（`.claude/rules/tooling/env.md`） |
| ランタイム | [Node.js](https://nodejs.org/) | |
| パッケージマネージャ | [pnpm](https://pnpm.io/) | npm / yarn は使わない。npm パッケージの版は完全固定（`.claude/rules/tooling/dependencies.md`） |
| 言語 | [TypeScript](https://www.typescriptlang.org/) | 7 |
| フレームワーク | [Next.js](https://nextjs.org/) | App Router |
| UI | [React](https://react.dev/) + [Mantine](https://mantine.dev/) | Mantine を直接使うのは `shared/ui` だけ（`.claude/rules/code/frontend.md`） |
| フィーチャーフラグ | [OpenFeature](https://openfeature.dev/)（OFREP） | フラグの値は backend に固定で持つ（ADR `docs/adr/architecture/20261002-feature-flag-ofrep-hardcoded.md`） |
| 入力の検証 | [zod](https://zod.dev/) | backend と環境変数の検証 |
| データベース | [PostgreSQL](https://www.postgresql.org/) | 18。アプリは常に Postgres（InMemory のリポジトリはテスト用） |
| ORM / マイグレーション | [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit | 生成した SQL でマイグレーションする（スキル `db-migration`） |
| DB ドライバ | [node-postgres（pg）](https://node-postgres.com/) | |
| コンテナ | [Docker Compose](https://docs.docker.com/compose/) | `compose.yaml` を手元・GitHub Actions・クラウドセッションで共通に使う |
| インフラ | GCP（Cloud Run + Cloud SQL）+ Terraform | 下の「デプロイ」 |
| Git フック | [Lefthook](https://github.com/evilmartians/lefthook) | pre-commit・pre-push・commit-msg で検査を動かす |

テスト・lint・セキュリティのツールは下の「品質ツール」の表。

### 品質ツール（役割と実行タイミング）

どれも設定ファイルが正（`lefthook.yml`・`.github/workflows/*.yml`・`biome.json`・`vitest.config.mts`・`.github/renovate.json5`・`scripts/security/scan.sh`）。セキュリティの検査は `scripts/security/scan.sh` が Docker イメージで動かし（イメージは digest で固定。zizmor だけは版を固定した Dockerfile から手元でビルドしたイメージ）、フック・CI・デプロイが同じスクリプトを呼ぶ（`.claude/rules/tooling/security-scan.md`）。

タイミングの凡例:
* commit: `git commit` のとき（lefthook の pre-commit / commit-msg）
* push: `git push` のとき（lefthook の pre-push）
* CI: PR と main への push のたび（`ci.yml` の `ci` ジョブ。required status check）
* 毎日: GitHub Actions の schedule（手動実行も可）
* デプロイ: main への push と手動のデプロイ（`deploy.yml`）
* 手元: 必要なときに自分で実行する

#### テスト

| 種類 | ツール | 役割 | いつ |
| --- | --- | --- | --- |
| テスト | [Vitest](https://vitest.dev/) | 単体・API ジャーニーのテスト。カバレッジは 4 指標すべて 100% を下回ると失敗 | CI（`pnpm test`） |
| E2E | [Playwright](https://playwright.dev/) + [playwright-bdd](https://vitalets.github.io/playwright-bdd/) | 本番ビルドをブラウザで操作して業務の流れを検証する（`apps/e2e/spec/*.feature`） | CI（下の ZAP の中で流す）・手元（`pnpm test:e2e`） |
| mutation testing | [Stryker](https://stryker-mutator.io/) | テストが変異（コードの一部を壊したもの）を検出できるかを測り、レポートを artifact に残す（スキル `mutation-testing`） | 毎日（`mutation.yml`。08:55 JST）・手元（`pnpm test:mutation`） |

#### コード品質

| 種類 | ツール | 役割 | いつ |
| --- | --- | --- | --- |
| Lint / Format | [Biome](https://biomejs.dev/) | lint と format。warn でも失敗（`--error-on-warnings`）。長さ・複雑さの上限: 関数 50 行・ファイル 300 行・引数 4 個・1 ファイル 1 クラス・認知的複雑度（`.claude/rules/quality/lint.md`） | commit（ステージ済みファイル）・CI（`pnpm lint`） |
| 型 | [TypeScript](https://www.typescriptlang.org/)（tsc） | 型検査（ルート・`apps/backend`・`apps/shared` の 3 つ） | CI（`pnpm typecheck`） |
| ルール検査テスト | Vitest（`rule-tests/`） | 依存の向き・命名・置き場所・設定値など、規則が守られていることを検査する。依存パッケージのライセンスの許可リスト（`licenses`）もここ | CI（`pnpm test` に含む） |
| ルールのレビュー | Claude Code のスキル `rule-review` | 機械で止めていないコード・設計ルール（`.claude/rules/code` の表の「レビュー」の行）で差分をレビューし、結果を PR に残す | 手元（PR を作った後、マージの前） |
| ワークフローの lint | [actionlint](https://github.com/rhysd/actionlint) | GitHub Actions の構文・式・`run` の shellcheck | commit（ワークフローを変えたとき）・CI |
| Dockerfile の lint | [hadolint](https://github.com/hadolint/hadolint) | Dockerfile の書き方。warning 以上で失敗 | commit（Dockerfile を変えたとき）・CI |

#### セキュリティ

| 種類 | ツール | 役割 | いつ |
| --- | --- | --- | --- |
| 秘密情報 | [gitleaks](https://github.com/gitleaks/gitleaks) | API キー・トークンなどの混入を検出する | commit（ステージ済みの変更）・CI（全履歴） |
| コードの脆弱性（SAST） | [Semgrep](https://semgrep.dev/) | JavaScript / TypeScript の脆弱性のパターン（security の ERROR の規則） | push・CI |
| 依存の脆弱性 | pnpm audit | 依存パッケージの既知の脆弱性。high 以上で失敗 | CI（`pnpm audit --audit-level high`） |
| サプライチェーン保護 | pnpm の設定（`pnpm-workspace.yaml`） | 公開から 5 日未満の版・信頼度の下がった版・推移的依存の git / URL 取得を install で拒否する | `pnpm install` のたび |
| ワークフローのセキュリティ | [zizmor](https://github.com/zizmorcore/zizmor) | GitHub Actions のセキュリティ（スクリプトインジェクション・資格情報の残留など） | commit（ワークフローを変えたとき）・CI |
| 設定・イメージの脆弱性 | [Trivy](https://trivy.dev/) | Dockerfile と Terraform（`infra/`）の設定ミス、ビルドしたイメージの OS パッケージの脆弱性。HIGH / CRITICAL で失敗（イメージは直した版があるものだけ） | commit（Dockerfile か `infra/` を変えたとき）・CI（設定）・デプロイ（イメージ） |
| 動的検査（DAST） | [ZAP](https://www.zaproxy.org/) | E2E の通信をプロキシで受け、受け身の検査（passive scan）にかける。Low 以上の警告で失敗 | CI（`scan.sh zap-e2e`） |
| CSP の評価 | [CSP Evaluator](https://csp-evaluator.withgoogle.com/)（npm `csp_evaluator`） | セキュリティヘッダの CSP を Google の検査で評価する（`security-headers.test.ts`） | CI（`pnpm test` に含む） |
| AI のセキュリティレビュー | [Claude Code Action](https://github.com/anthropics/claude-code-action) | 前回から main に入った差分を Claude がレビューし、見つかったものを private の security advisory にする | 毎日（`security-review.yml`。08:47 JST） |

#### 依存の更新

| 種類 | ツール | 役割 | いつ |
| --- | --- | --- | --- |
| 依存の更新 | [Renovate](https://docs.renovatebot.com/) | npm・asdf・GitHub Actions の更新 PR を作る。公開から 5 日経った版だけ。minor / patch は CI が緑なら自動マージ（0.x と Next.js / React を除く） | 毎週月曜 00:00〜08:59 JST |

#### 開発の進め方

| 種類 | ツール | 役割 | いつ |
| --- | --- | --- | --- |
| コミットメッセージ | `scripts/hooks/check-commit-msg.sh` | 4 項目（WHY / WHAT / 実装経緯 / 検証内容）と `Co-Authored-By:` の形式 | commit（commit-msg） |
| 作業ログ | `scripts/hooks/check-work-logs-diff.sh` ほか | PR の差分に作業ログ（`docs/work-logs/`）があり、各項目に `- 機械化:` の行があること | CI（PR のとき）・Claude Code の Stop フック |

## ディレクトリ構成

機能（feature）単位で置く。画面側（Next.js）を `apps/frontend_customer/`、API 側（Next・React に依存しない TypeScript）を `apps/backend/` に分け、それぞれ pnpm workspace のパッケージ（`@repo/frontend-customer` / `@repo/backend`）にする（Issue #68。プロセスは Next 1 つのまま）。両方が使う環境変数の入口とログの出口は `apps/shared/`（`@repo/shared`。Issue #90）に置く。`src/` は使わない（例は Todo）。

```
apps/
  frontend_customer/  # @repo/frontend-customer。Next.js（app/ はルーティングだけ、features/<feature>/ に画面、shared/ に共通部品）
  backend/            # @repo/backend。API 側（features/<feature>/ が 1 モジュールで internal/ と、他のモジュールに公開するときだけ expose/、shared/ に共通部品、spec/ に API の仕様とジャーニー、test-support/ にテストの土台）
  shared/             # @repo/shared。frontend と backend で共通の基盤（env・logger）だけ
  e2e/                # @repo/e2e。E2E（spec/ に .feature と step、support/ に土台）
rule-tests/           # ルール検査テスト（.feature と .test.ts の対）
infra/                # Terraform（GCP）
scripts/              # クラウドセッション・フック・セキュリティの検査のスクリプト
docs/                 # ADR（adr/）・作業ログ（work-logs/）・構成図（diagrams/）
```

- 画面は SSR を前提にせず、データは hook から `/api/...` を呼んで取る。サーバの処理はすべて `apps/backend/` に置く。
- 依存の向き（frontend → backend は `@repo/backend/<path>` の exports だけ、など）は `rule-tests/architecture.test.ts` が検査する。

詳細は `.claude/rules/code/backend.md`（API 側）・`.claude/rules/code/frontend.md`（画面側）・`.claude/rules/code/shared.md`・`.claude/rules/code/architecture-check.md`（依存の向き）・`.claude/rules/quality/testing.md`（テストの置き方）、決定と採用しなかった案は ADR（`docs/adr/README.md` の一覧）を参照。

## セットアップ

```sh
asdf plugin add nodejs
asdf plugin add pnpm
asdf install
```

バージョンの確認方法や更新手順の詳細は `.claude/rules/tooling/env.md` を参照。

環境変数は `.env` に置く。最初に `.env.example` をコピーする（開発用の値がそのまま入っている）。

```sh
cp .env.example .env
```

- `.env` はコミットしない（`.gitignore` 済み）。変数はすべて必須で、コードに既定値は無い。`.env` が無い・変数が欠けていると、`pnpm dev` / `pnpm start` / `pnpm build` / `pnpm test` / `pnpm test:e2e` / `pnpm db:migrate` は欠けた変数の名前を出して起動時に止まる（非 0 で終わる。`pnpm dev` / `pnpm start` は `apps/frontend_customer/instrumentation.ts` で検証する）。
- コマンドの前に付けた環境変数（`DATABASE_URL=... pnpm db:migrate`）は `.env` より優先される。
- `.env` はリポジトリ直下に 1 つだけ置く（`apps/frontend_customer/` などには置かない）。
- 仕組み（`apps/shared/env.ts` への一元化、`process.env` の直参照の禁止）は `.claude/rules/tooling/env.md` の「環境変数」を参照。

開発用の PostgreSQL は Docker Compose（`compose.yaml`）で起動する。

```sh
pnpm db:up       # Postgres を起動し、healthcheck が通るまで待つ（docker compose up -d --wait）
pnpm db:migrate  # apps/backend/shared/drizzle/ のマイグレーションを当てる（入口 migrate.ts を esbuild で束ねて実行。Cloud Run の migrate ジョブと同じファイル。当て済みのものは飛ばす）
pnpm db:psql     # psql で接続する（docker compose exec db psql -U app -d app）
pnpm db:down     # 止める（データは名前付きボリューム pgdata に残る。消すときは docker compose down -v）
pnpm db:generate # apps/backend/features/*/internal/infra/schema.ts を変えたら、差分の SQL を apps/backend/shared/drizzle/ に生成する（drizzle-kit generate。DB には接続しない）
```

- 接続先は `.env` の `DATABASE_URL`（`.env.example` の値は `postgresql://app:app@localhost:5432/app`。開発用の固定値で秘密ではない）。アプリは常に Postgres を使うので、`pnpm dev` の前にも `pnpm db:up` と `pnpm db:migrate` が要る。
- 接続・プールの環境変数（`DATABASE_POOL_MAX` など）は `.claude/rules/code/backend.md` の「Repository」の表の「接続とプール」、スキーマの変え方はスキル `db-migration` を参照。
- Docker Desktop は、従業員 250 人以上または年間売上 1,000 万ドル以上の企業での業務利用などに有料サブスクリプションが必要になる（[Docker Desktop license agreement](https://docs.docker.com/subscription-billing/desktop-license/)）。該当する場合は [Podman](https://podman.io/) の `podman compose up -d --wait` でも同じ `compose.yaml` を使える想定（Podman での実動作は未確認）。

Claude Code のクラウドセッション（asdf が無い環境）では、setup script と SessionStart フックが Node.js / pnpm・Postgres・`.env`・マイグレーションを用意する（`.claude/rules/tooling/cloud-session.md`・スキル `cloud-session`）。

## 開発

```sh
pnpm install   # 依存をインストール（リポジトリ直下で実行する。workspace のすべてのパッケージに入る）
pnpm dev       # 開発サーバを起動（http://localhost:3000。pnpm --filter @repo/frontend-customer dev。引数は pnpm dev -p 3001 のように渡せる）
pnpm typecheck # 型チェック（リポジトリ全体と apps/backend・apps/shared の tsconfig。next build は frontend から import したファイルしか見ないため）
pnpm test      # 単体テストを実行し、カバレッジ 100% 未満なら失敗（Vitest。詳細は .claude/rules/quality/testing.md）
pnpm test:unit # 単体テストだけを実行（カバレッジを計測しない。速く回したいとき）
pnpm test:api-journey # API ジャーニーテストだけを実行（実 Postgres で複数の API を、.feature に書いた業務の流れの順に呼ぶ。詳細は .claude/rules/quality/testing.md）
pnpm test:e2e  # E2E テストを実行（Playwright。本番ビルドを Postgres に接続して起動し、ブラウザで操作する。詳細は .claude/rules/quality/testing.md）
pnpm test:mutation # mutation testing を実行し、reports/mutation/ にレポートを出す（Stryker。数分かかる。詳細はスキル mutation-testing）
pnpm lint      # lint + format の違反を検査（Biome。変更しない）
pnpm check     # 安全な自動修正を適用して再検査（Biome）
pnpm format    # format だけを適用（Biome）
pnpm build     # 本番ビルド（pnpm --filter @repo/frontend-customer build。apps/frontend_customer/.next/ に出力）
pnpm start     # 本番ビルドを起動（pnpm --filter @repo/frontend-customer start）
```

- コマンドはリポジトリ直下で実行する。`dev` / `build` / `start` は `apps/frontend_customer`、`db:generate` は `apps/backend` の script を `pnpm --filter` で呼ぶ。`db:migrate` はリポジトリ直下の script で、`apps/backend/shared/drizzle/migrate.ts` を esbuild で `dist/migrate/` に束ねて実行する（Issue #326）（そのパッケージのディレクトリで動くが、`.env` はリポジトリ直下の 1 つを読む）。依存の追加は `pnpm --filter @repo/backend add <pkg>@<x.y.z>` のように置き場所のパッケージを指定する（`.claude/rules/tooling/dependencies.md`）。

- どのコマンドも `.env` がある前提（上の「セットアップ」）。
- `pnpm dev` は Postgres の起動とマイグレーションが前提（先に `pnpm db:up && pnpm db:migrate`）。
- `pnpm test` / `pnpm test:unit` / `pnpm test:mutation` は Postgres が起動している前提（先に `pnpm db:up`）。Postgres を使うテストは、テストファイルごとに別のスキーマを作ってマイグレーションを当てるので、`pnpm db:migrate` は不要で、`pnpm dev` のデータも消さない。前の実行が残したテスト用のスキーマは、実行の最初に消す（Postgres に接続できなければそこで止まる）。
- `pnpm test:e2e` は Postgres の起動とマイグレーションが前提（先に `pnpm db:up && pnpm db:migrate`）。各テストの前に `todos` を空にする（`pnpm dev` と同じ DB を使うので、開発中のデータも消える）。

`pnpm install` で pre-commit フック（Lefthook）も入り、コミット時にステージ済みファイルが Biome で検査される。詳細は `.claude/rules/quality/lint.md` を参照。

## デプロイ

デプロイ先は GCP の Cloud Run（`frontend-customer`）+ Cloud SQL for PostgreSQL で、環境は stg と prod の 2 つ（GCP のプロジェクトが別。Issue #137。決定は ADR `docs/adr/tech-stack/20260930-gcp-cloud-run-and-cloud-sql.md`）。

- 器（Cloud SQL・Cloud Run の service / job・Secret・IAM・GitHub Actions 用の WIF）は Terraform。リソースは `infra/modules/app`、環境ごとの設定は `infra/envs/stg`・`infra/envs/prod`（同じ module を別のプロジェクトで呼ぶ）。初回の手順（環境ごとに state のバケット → `terraform apply` → GitHub の Environment の Variables）と、Data Studio・Metabase・Cloud SQL の MCP の接続は `infra/README.md`。
- main へのマージで `.github/workflows/deploy.yml` が stg にデプロイする（イメージを build し、migrate ジョブ → service の順に入れ替える）。prod は Actions の「Run workflow」で `prod` を選んだ手動実行だけ。
- ロールバック・migrate の再実行・パスワードのローテーションはスキル `deploy`（`.claude/skills/deploy/SKILL.md`）。

## 指示ファイルの構成

AI（Claude Code）への指示は `CLAUDE.md` から辿る。どのファイルがいつ読み込まれるかは `CLAUDE.md` の「指示ファイルの置き場所」の表、構成の検査は `rule-tests/instructions.test.ts`。
