# domain の値の規則を持つ string / number は値オブジェクトのクラスにし、domain のクラスのフィールドに素のまま置かないことを検査で止める

- 日付: 2026-10-03
- 状態: 採用
- 関連: Issue #423 / ADR `architecture/20260929-zod-for-backend-validation.md`（「branded 型は使わない」を置き換える） / ADR `architecture/20260929-todo-invariants-always-validated.md` / `.claude/rules/code/backend.md` の「Entity」の表の「値オブジェクト」 / `.claude/rules/code/architecture-check.md` の `domain-value-object`

## 背景
Todo の Entity は `id: string`・`title: string` を素の string で持ち、値の規則（id は uuid の形、タイトルは前後の空白を除いて 1〜100 文字）は Entity のスキーマ `todoPropsSchema` に書いていた。Todo の外（Repository の引数・application の入力）では id もタイトルもただの string で、規則を満たすかは呼び出し側に頼り、別の string を取り違えても型で止まらなかった。
architecture/20260929-zod-for-backend-validation.md は「branded 型は使わない」と決めていた。理由は、当時は DB の行から組み立てる口（restore）が検証しなかったので、型で「検証済み」を表すには `as` で偽ることになるためだった。architecture/20260929-todo-invariants-always-validated.md（Issue #94）で reconstruct も常に検証するようになり、この理由は無くなった。
daiki の依頼（2026-10-03）: backend の domain で値オブジェクト（VO）をできるだけ作り、ルールにする。まず Todo から。

## 決定
- 値の規則を持つ string / number は VO のクラスにする（Todo は `TodoId`・`TodoTitle`）。VO は 1 クラス 1 ファイルで feature の `domain/` に置き、中身の primitive は `readonly value` に持つ。Todo の完了の履歴の 1 件（`completed`・`changedAt`）も同じ形のクラス `TodoStatusChange` にする（primitive を持たないので `value` は無い）。
- VO は完全コンストラクタ（`DomainValidation.validated` で自分のスキーマを毎回検証する）で、不変、等しさは `equals` で値を比べる。エラーのキーと上限などの定数は VO が持つ。
- Entity のスキーマは VO の項目を `z.instanceof` で確かめ、中身の規則は重ねない。規則を持たない `boolean`・`Date` は VO にしない。
- application は入力の primitive から VO を作って domain に渡し、presentation は応答で `value` から primitive に戻す。
- 「branded 型は使わない」（architecture/20260929-zod-for-backend-validation.md）を置き換える: 検証済みの値を型で表すのは、brand ではなく VO のクラスで行う。
- 規則 `domain-value-object`（`rule-tests/architecture.test.ts`）で、`apps/backend/features/<f>/internal/domain/` のクラスのフィールドの型注釈に `string` / `number` / `bigint` を含むもの（名前が `value` のものを除く）を違反にする。

## 理由
- 型が「規則を満たす値」を表し、規則が VO のコンストラクタの 1 か所にまとまる。Todo の外でも id とタイトルを取り違えると型エラーになる。
- brand ではなくクラスにする: brand は型の上だけの印で、作る口（`as`）を制限できず、規則・キー・`equals` を置く場所が無い。クラスならコンストラクタを通らない値を作れず、`z.instanceof` で実行時にも確かめられる。
- 機械で止める: レビューだけでは、Entity に string のフィールドを足す書き方が新しいコードに写されるのを止められない（CLAUDE.md の 7）。VO と Entity は構文では見分けられないので、中身の名前を `value` に決めて見分ける。
- `boolean`・`Date` を除く: `boolean` は 2 値で規則を持たず、`Date` は日時の型そのもので、包んでも検証するものが無い。

## 採用しなかった案
- branded 型（`string & { readonly brand: unique symbol }`）: 作る口を `as` で偽れ、規則とキーを置く場所が無い。
- VO にせず Entity のスキーマで規則を持ち続ける（今の形）: Entity の外で値がただの string になり、取り違えを型で止められない。
- 規則をレビューだけで見る: 新しいフィールドの書き方の写しを止められない。
- メソッドの引数・戻り値・interface の項目まで検査する: application との境界（`Todo.create(title: string)` のような入口）や Repository の interface も違反になり、VO を作る場所が決まらない。今回はフィールド（Entity が持つ値）だけを止める。

## 影響
- 良い点: domain の値の規則が VO ごとにまとまり、presentation が重ねる定数とキーも VO のファイルを参照する。
- 悪い点: VO を作る・`value` で戻す変換が application と presentation に増える。名前が `value` なら Entity のフィールドでも検査を通る。型の別名（`type Name = string`）や注釈の無いフィールドは検査が見ない（レビューで見る）。
- 見直す条件: 規則を持たない string（自由記述のメモなど）を Entity に持たせたくなったとき。domain の外（application の DTO など）にも VO を広げるとき。
