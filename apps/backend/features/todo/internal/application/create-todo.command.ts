import type { TransactionRunner } from "../../../../shared/transaction/transaction";
import { Todo } from "../domain/todo";
import type { TodoRepository } from "../domain/todo-repository";
import { TodoTitle } from "../domain/todo-title";

export type CreateTodoInput = {
  title: string;
};

// Todo を作って保存する（command: 状態を変える）。
// WHY 作った Todo を返す: command は状態を変えるのが役割だが、API が作成結果（id・作成日時）を 201 で返す仕様のため、
//   保存し直した値を読み直す query を別に呼ばずに済むよう、作った Todo をそのまま返す。
// WHY transactions（TransactionRunner）を受け取り、execute の本体を run で包む（Issue #215。ADR
//   docs/adr/architecture/20260930-transaction-from-application.md）: 書き込みの範囲（トランザクション）は command が決め、Repository は
//   run が渡した tx で書く。Todo（集約）は todos と完了の履歴の 2 つの表にまたがり、1 つのトランザクションで書く。command が run を
//   呼ぶことは rule-tests/use-case.test.ts の command-runs-in-transaction が見る。
export class CreateTodoCommand {
  constructor(
    private readonly repository: TodoRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async execute(input: CreateTodoInput): Promise<Todo> {
    return this.transactions.run(async (tx) => {
      // タイトルの検証（trim・長さ）は TodoTitle のコンストラクタが行う。ここで重ねて書かない（規則は domain に 1 か所）。
      // WHY ここで TodoTitle を作る（Input は string のまま）: Input は presentation から届く値の形で、値オブジェクトにするのは domain に
      //   渡す直前（Issue #423）。
      const todo = Todo.create(new TodoTitle(input.title));
      await this.repository.insert(todo, tx);
      return todo;
    });
  }
}
