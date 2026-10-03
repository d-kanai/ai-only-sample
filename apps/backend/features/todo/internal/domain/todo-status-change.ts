import { z } from "zod";
import { KeyedIssue } from "../../../../shared/error/keyed-issue";
import { DomainValidation } from "../../../../shared/error/validate";

// 完了の履歴の 1 件の値オブジェクト（Issue #423。以前は Todo の型 TodoStatusChange）: 完了状態が completed に変わった日時（changedAt）。
//   Todo の履歴（statusChanges）の要素。
// WHY id を持たない: 履歴は Todo（集約）の中の値で、Todo の外から 1 件を指すことは無い。DB の行の id は永続化の都合で、
//   Repository（infra）だけが扱う。
// WHY 値オブジェクトにする: 1 件の形（completed は boolean、changedAt は有効な日時）を、Todo の不変条件から切り離してこの値の規則にする。
//   Todo は「要素が TodoStatusChange であること」と、履歴どうし・今の状態との整合（todo.ts の isConsistentHistory）だけを見る。
// 完全コンストラクタ: コンストラクタが毎回、形（schema）を検証する。
// WHY 引数をオブジェクトにする: 名前で渡し、DB の行（{ completed, changedAt }）からそのまま作れるようにする。
// WHY 不変（readonly と Object.freeze）: 履歴は Todo の値で、Todo は不変。要素を書き換えられると、InMemory が保持中の値や、update が
//   比べる origin の履歴が update の前に変わる。
export class TodoStatusChange {
  readonly completed: boolean;
  readonly changedAt: Date;

  constructor(values: { completed: boolean; changedAt: Date }) {
    const valid = DomainValidation.validated(this.schema(), values);
    this.completed = valid.completed;
    this.changedAt = valid.changedAt;
    Object.freeze(this);
  }

  // 値で比べる（.claude/rules/code/backend.md の「値オブジェクト」）。
  // WHY 日時を getTime で比べる: Date は参照で比べると、同じ時刻でも DB から読み直した値が等しくならない。
  equals(other: TodoStatusChange): boolean {
    return (
      this.completed === other.completed &&
      this.changedAt.getTime() === other.changedAt.getTime()
    );
  }

  // WHY どの項目の誤りも同じキー（todo.statusChanges.invalid）: 履歴は DB の行か Todo の遷移（changeCompletion）からしか作られず、
  //   利用者の入力で違反することは無い。形の誤りは「履歴が壊れている」の 1 つの理由で足りる（以前の Todo の todoPropsSchema と同じキー）。
  // WHY z.object にもキーを付ける: 値がオブジェクトでない（as で偽った）ときも、zod の既定の英語の文言を domain の外に出さない。
  // WHY z.date(): Invalid Date も弾く（zod 4 の z.date は Invalid Date を受け付けない）。
  // WHY private のインスタンスのメソッドにする（最上位の定数・static にしない）: static な変異は mutation testing で数えない
  //   （stryker.config.mjs の ignoreStatic）。インスタンスで使うクラスに static を置かない（規則 no-static-in-instance-class）。
  private schema() {
    return z.object(
      {
        completed: z.boolean(KeyedIssue.of("todo.statusChanges.invalid")),
        changedAt: z.date(KeyedIssue.of("todo.statusChanges.invalid")),
      },
      KeyedIssue.of("todo.statusChanges.invalid"),
    );
  }
}
