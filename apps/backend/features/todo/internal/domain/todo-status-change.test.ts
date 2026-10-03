// @vitest-environment node
import { describe, expect, test } from "vitest";
import { DomainError } from "../../../../shared/error/domain-error";
import { TodoStatusChange } from "./todo-status-change";

// 完了の履歴の 1 件の値オブジェクト（TodoStatusChange）の単体テスト。持つ値・型を偽った値・Invalid Date・不変を見る。
// 履歴どうしの規則（1 件以上・古い順・最後の状態が今の状態と同じ）は Todo の不変条件で、domain 仕様
//   （apps/backend/spec/domain/todo/todo.feature）が見る。

const CHANGED_AT = new Date("2026-09-28T01:00:00.000Z");

// key は API の Problem Details の拡張メンバーとして画面に渡る契約（Issue #116）。params が無いことも比べる（todo.test.ts と同じ）。
function expectInvalidStatusChange(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    const { code, key, params } = error as DomainError;
    expect({ code, key, params }).toEqual({
      code: "validation_error",
      key: "todo.statusChanges.invalid",
      params: undefined,
    });
    return;
  }
  throw new Error("DomainError(validation_error) が投げられなかった");
}

describe("new TodoStatusChange", () => {
  test.each([false, true])(
    "completed（%s）と日時をそのまま持つ",
    (completed) => {
      // given: 前提なし
      // when
      const change = new TodoStatusChange({ completed, changedAt: CHANGED_AT });

      // then
      expect(change.completed).toBe(completed);
      expect(change.changedAt).toEqual(CHANGED_AT);
    },
  );

  // 型に反する値を as で渡す（DB からは来ないが、zod の既定の英語の文言を domain の外に出さない）。
  test.each([
    [
      "completed が boolean でない",
      {
        completed: "false" as unknown as boolean,
        changedAt: CHANGED_AT,
      },
    ],
    [
      "日時が Invalid Date",
      { completed: false, changedAt: new Date("not a date") },
    ],
    [
      "日時が Date でない",
      {
        completed: false,
        changedAt: CHANGED_AT.toISOString() as unknown as Date,
      },
    ],
    [
      "値がオブジェクトでない",
      undefined as unknown as { completed: boolean; changedAt: Date },
    ],
  ])(
    "%sなら validation_error（todo.statusChanges.invalid）を投げる",
    (_label, values) => {
      // given: 前提なし
      // when
      const action = () => new TodoStatusChange(values);

      // then
      expectInvalidStatusChange(action);
    },
  );

  // WHY 凍結する: 履歴は Todo の値で、Todo は不変（todo.ts）。要素を書き換えられると、update の前に保持中の値（InMemory）や
  //   origin との差分が変わる。
  test("作った値は凍結されていて書き換えられない", () => {
    // given: 前提なし
    // when
    const change = new TodoStatusChange({
      completed: true,
      changedAt: CHANGED_AT,
    });

    // then
    expect(Object.isFrozen(change)).toBe(true);
  });
});

describe("TodoStatusChange#equals", () => {
  // WHY 日時を getTime で比べる（参照で比べない）: 同じ時刻の別の Date（DB から読み直した値）を等しいとみなす。
  test("completed と日時が同じなら別のインスタンスでも等しく、どちらかが違えば等しくない", () => {
    // given
    const change = new TodoStatusChange({
      completed: true,
      changedAt: CHANGED_AT,
    });

    // when
    const same = change.equals(
      new TodoStatusChange({
        completed: true,
        changedAt: new Date(CHANGED_AT.getTime()),
      }),
    );
    const otherCompleted = change.equals(
      new TodoStatusChange({ completed: false, changedAt: CHANGED_AT }),
    );
    const otherChangedAt = change.equals(
      new TodoStatusChange({
        completed: true,
        changedAt: new Date(CHANGED_AT.getTime() + 1),
      }),
    );

    // then
    expect(same).toBe(true);
    expect(otherCompleted).toBe(false);
    expect(otherChangedAt).toBe(false);
  });
});
