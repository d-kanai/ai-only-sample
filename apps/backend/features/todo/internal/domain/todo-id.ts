import { randomUUID } from "node:crypto";
import { z } from "zod";
import { KeyedIssue } from "../../../../shared/error/keyed-issue";
import { DomainValidation } from "../../../../shared/error/validate";

// Todo の id の値オブジェクト（Issue #423）。Todo の同一性を表す。
// WHY 値オブジェクトにする（string のまま Todo に持たせない）: 「id の形（uuid）を満たす文字列」を型で表し、Todo・Repository・
//   application が id を受け渡すときに、検証していない文字列（タイトルなど別の string）を取り違えて渡すことを型で止める。
//   以前（Issue #94 から #423 まで）は Todo の todoPropsSchema が id を検証し、Todo 型そのものが「不変条件を満たす値」を表していたが、
//   Todo の外（Repository の引数・application の入力）では id がただの string で、形を満たすかは呼び出し側に頼っていた。
// 完全コンストラクタ: コンストラクタが毎回、形（schema）を検証する。どの口（generate・DB の行・application の入力）から作っても、
//   TodoId 型の値は形を満たす。
// WHY 不変（readonly と Object.freeze）: 値オブジェクトは値そのもので、同じ値は同じものとして扱う（equals）。書き換えられると、
//   InMemory が Map のキーにした値や、Todo が持つ値が知らないうちに変わる。readonly は型の上だけなので、Object.freeze で実行時も止める。
export class TodoId {
  readonly value: string;

  constructor(value: string) {
    this.value = DomainValidation.validated(this.schema(), value);
    Object.freeze(this);
  }

  // 新しい Todo の id を作る（Todo.create が使う）。
  // WHY static（ファクトリ）: 自分のクラスを返すファクトリだけは static を許す（規則 no-static-in-instance-class。Issue #300）。
  // WHY randomUUID（v4）: Postgres の uuid 型の列に入り、下の schema（RFC 9562 の形）も必ず満たす。
  static generate(): TodoId {
    return new TodoId(randomUUID());
  }

  // WHY 値で比べる（=== で参照を比べない）: DB から読み直した id・リクエストから作った id は、同じ値でも別のインスタンスになる。
  // WHY 文字列をそのまま比べる（大文字と小文字を同じと見ない）: Postgres は uuid を小文字の正規の形で返すが、TodoId は受け取った
  //   値をそのまま持つ（presentation の ResourceId.parseUuid も大文字を通す）。同じと見るなら、作るときに正規の形へ直すことと一緒に決める。
  equals(other: TodoId): boolean {
    return this.value === other.value;
  }

  // id の規則: RFC 9562 の uuid の形。
  // WHY z.uuid(): presentation の ResourceId.parseUuid と同じ形にそろえる。z.uuid() は RFC 9562 の形（版の桁 1〜8）だけで、大文字も通す
  //   （Postgres の uuid 型は版の桁が 0 の値も受け付けるので、DB の行は DB の型だけでは形を満たさない。.claude/rules/code/backend.md）。
  // WHY キーを付ける: DomainValidation.validated（shared/error/validate.ts）が issue の message（= キー）を DomainError の key にする。zod の既定の
  //   英語の文言を domain の外に出さない（文字列でない値を as で偽ったときも同じキー）。
  // WHY private のインスタンスのメソッドにする（最上位の定数・static にしない）: 最上位の式や static の初期化は読み込み時にだけ評価される
  //   static な変異になり、mutation testing で数えない（stryker.config.mjs の ignoreStatic）。インスタンスで使うクラスに static を置かない
  //   （規則 no-static-in-instance-class）。コンストラクタの中でも prototype のメソッドは呼べる。
  private schema() {
    return z.uuid(KeyedIssue.of("todo.id.invalid"));
  }
}
