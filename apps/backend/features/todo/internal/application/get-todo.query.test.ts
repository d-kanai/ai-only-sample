// @vitest-environment node
import { describe, expect, test } from "vitest";
import { DomainError } from "../../../../shared/error/domain-error";
import { InMemoryTodoRepository } from "../../../../test-support/todo/todo-repository.in-memory";
import { inMemoryTransaction } from "../../../../test-support/transaction-runner.in-memory";
import { Todo } from "../domain/todo";
import { TodoTitle } from "../domain/todo-title";
import { GetTodoQuery } from "./get-todo.query";

// 無い Todo の id（uuid の形。presentation を通った id と同じく形は満たす。Issue #423 で id が TodoId になり、形を満たさない
//   文字列は not_found より先に todo.id.invalid になるため）。
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("GetTodoQuery", () => {
  test("id に一致する Todo を返す", async () => {
    // given
    const repository = new InMemoryTodoRepository();
    const todo = Todo.create(new TodoTitle("牛乳を買う"));
    await repository.insert(todo, inMemoryTransaction);

    // when
    const found = new GetTodoQuery(repository).execute(todo.id.value);

    // then
    await expect(found).resolves.toEqual(todo);
  });

  test("無ければ、その id を params に持つ DomainError(not_found, todo.notFound) を投げる", async () => {
    // given
    const query = new GetTodoQuery(new InMemoryTodoRepository());

    // when
    const action = () => query.execute(MISSING_ID);

    // then
    await expect(action()).rejects.toBeInstanceOf(DomainError);
    await expect(action()).rejects.toMatchObject({
      code: "not_found",
      key: "todo.notFound",
      params: { id: MISSING_ID },
    });
  });
});
