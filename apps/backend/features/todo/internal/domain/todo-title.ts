import { z } from "zod";
import { KeyedIssue } from "../../../../shared/error/keyed-issue";
import { DomainValidation } from "../../../../shared/error/validate";

// タイトルの上限の文字数（前後の空白を除いたコードポイント数）。
// WHY export する（Issue #144）: presentation のリクエストのスキーマ（create-todo.api.ts・rename-todo.api.ts）が同じ上限を
//   同じキー（todo.title.tooLong）で重ね、項目ごとの誤り（Problem の errors）として返す。数値を 2 か所に書くと片方だけ
//   直してずれ、presentation が domain より厳しく（domain が通す値を弾く）なりうるので、この定数を参照させる。
// WHY UPPER_SNAKE_CASE: presentation が feature の domain から値で import してよいのは、この形の名前の定数だけ
//   （規則 presentation。rule-tests/architecture.test.ts）。値オブジェクトのクラスや関数を値で使わせない。
// WHY 100 文字: 一覧で 1 行に収まる程度の上限。上限を設けないと巨大な文字列でメモリと画面が埋まる。
// WHY 最上位の定数のまま（下の schema のようにメソッドの中に置かない）: presentation が import するため。最上位の定数は mutation testing で
//   数えない（stryker.config.mjs の ignoreStatic）ので、値は todo-title.test.ts が 100 で、境界（100 は通し 101 は弾く）は同じテストと
//   domain 仕様（apps/backend/spec/domain/todo/todo.feature）が固定する。
export const TODO_TITLE_MAX_LENGTH = 100;

// Todo のタイトルの値オブジェクト（Issue #423）。
// WHY 値オブジェクトにする（string のまま Todo に持たせない）: 「タイトルの規則を満たす文字列」を型で表す。以前（Issue #94 から #423 まで）は
//   Todo の todoPropsSchema がタイトルを検証し、「Todo 型そのものが不変条件を満たす値を表すので、title だけに brand を付けても守れるものが
//   増えない」として branded 型にしなかった。その頃の前提（ADR docs/adr/architecture/20260929-zod-for-backend-validation.md の、restore が
//   検証しない口があった）は Issue #94 で無くなっている。値オブジェクトにすると、タイトルの規則が Todo から独立した 1 か所に集まり、
//   application が Todo に渡す前に規則を満たす値を作ったことが型で分かる（daiki の依頼、Issue #423）。
// 完全コンストラクタ: コンストラクタが毎回、規則（schema）を検証する。どの口（application の入力・DB の行）から作っても、TodoTitle 型の
//   値は規則を満たす。
// WHY 検証の結果（trim した値）を持つ: タイトルは trim した値が規則の対象で、その値を保存する（schema のコメント）。
// WHY 不変（readonly と Object.freeze）: 値オブジェクトは値そのもの。readonly は型の上だけなので、Object.freeze で実行時も止める。
export class TodoTitle {
  readonly value: string;

  constructor(value: string) {
    this.value = DomainValidation.validated(this.schema(), value);
    Object.freeze(this);
  }

  // WHY 値で比べる: 同じタイトルを別々に作ると別のインスタンスになる。比べるのは trim した後の値（前後の空白だけが違うタイトルは同じ）。
  equals(other: TodoTitle): boolean {
    return this.value === other.value;
  }

  // タイトルの規則: 前後の空白を除いて 1〜TODO_TITLE_MAX_LENGTH 文字。presentation は同じ規則を同じキーで重ねてよいが、これより
  //   厳しくしない（Issue #144。.claude/rules/code/backend.md）。
  // WHY trim してから数え、trim した値を保持する: 空白だけのタイトルを「空」とみなし、前後の空白の有無だけが違う Todo が混ざらないように
  //   する。z.string().trim() は値を置き換える（後の refine も parse の結果も trim 後の値）。
  // WHY 文字数を Array.from で数える（zod の .min / .max を使わない）: .min / .max は String#length（UTF-16 のコード単位の数）で数え、
  //   絵文字（サロゲートペア）を 2 と数える。利用者の感覚の「文字数」に近いコードポイント数で数える（rule-tests/domain-validation.test.ts の
  //   no-zod-length-in-domain が .min / .max を止める）。
  // WHY refine を 2 つに分ける: 空と長すぎでキーを変える（どちらも API の Problem Details の key として画面が翻訳する契約）。zod は同じ
  //   スキーマの refine をすべて実行するが、同じ値で両方が失敗することは無い（0 文字と 101 文字以上は両立しない）。
  // WHY 文字列でないときのキーも付ける: zod の既定の英語の文言を domain の外に出さない。この経路を通るのは型を as で偽ったときだけ
  //   （presentation は z.string で弾き、DB の列は NOT NULL text）。
  // WHY private のインスタンスのメソッドにする（最上位の定数・static にしない）: static な変異は mutation testing で数えない
  //   （stryker.config.mjs の ignoreStatic）。インスタンスで使うクラスに static を置かない（規則 no-static-in-instance-class）。
  private schema() {
    return z
      .string(KeyedIssue.of("todo.title.invalid"))
      .trim()
      .refine(
        (title) => Array.from(title).length >= 1,
        KeyedIssue.of("todo.title.empty"),
      )
      .refine(
        (title) => Array.from(title).length <= TODO_TITLE_MAX_LENGTH,
        // 画面の文言に上限の文字数を埋め込めるよう、params で渡す（上限を変えても画面の辞書を直さずに済む）。
        KeyedIssue.refine("todo.title.tooLong", { max: TODO_TITLE_MAX_LENGTH }),
      );
  }
}
