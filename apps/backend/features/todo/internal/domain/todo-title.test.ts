// @vitest-environment node
import { describe, expect, test } from "vitest";
import { DomainError } from "../../../../shared/error/domain-error";
import type { ErrorKey } from "../../../../shared/error/error-key";
import { TODO_TITLE_MAX_LENGTH, TodoTitle } from "./todo-title";

// Todo のタイトルの値オブジェクト（TodoTitle）の単体テスト。境界（空・空白だけ・100 と 101・絵文字のコードポイント数）・trim の保持・
//   拒否の理由（key と params）・等価・不変を見る。
// WHY 境界をここで見る: タイトルの規則は TodoTitle の完全コンストラクタが持つ（todo-title.ts）。業務の仕様としての規則は domain 仕様
//   （apps/backend/spec/domain/todo/todo.feature）も見るが、規則を持つ値そのものの境界はこの単体テストで固定する。

// key と params は API の Problem Details の拡張メンバーとして画面に渡る契約（Issue #116）。params の無いキーで params が {} などに
//   なっていないことも確かめる（toEqual は undefined のプロパティと無いプロパティを同じに扱うが、{} とは区別する）。
function expectValidationError(
  action: () => unknown,
  expected: { key: ErrorKey; params?: Record<string, string | number> },
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    const { code, key, params } = error as DomainError;
    expect({ code, key, params }).toEqual({
      code: "validation_error",
      params: undefined,
      ...expected,
    });
    return;
  }
  throw new Error("DomainError(validation_error) が投げられなかった");
}

const EMPTY = { key: "todo.title.empty" } as const;
const TOO_LONG = { key: "todo.title.tooLong", params: { max: 100 } } as const;

describe("new TodoTitle", () => {
  test.each([
    ["1 文字", "a", "a"],
    ["100 文字", "a".repeat(100), "a".repeat(100)],
    // "🍎".length は 2 だが 1 コードポイント。String#length で数えると 200 になり弾かれる。
    ["絵文字だけの 100 文字", "🍎".repeat(100), "🍎".repeat(100)],
    ["前後に空白がある", "  牛乳を買う \n", "牛乳を買う"],
    ["前後の空白を除いて 100 文字", `  ${"a".repeat(100)}\t`, "a".repeat(100)],
  ])("%sなら作れ、前後の空白を除いた値を持つ", (_label, input, expected) => {
    // given: 前提なし
    // when
    const title = new TodoTitle(input);

    // then
    expect(title.value).toBe(expected);
  });

  test.each([
    ["空文字", "", EMPTY],
    ["空白だけ", "   \t\n", EMPTY],
    ["101 文字", "a".repeat(101), TOO_LONG],
    ["前後の空白を除いて 101 文字", ` ${"a".repeat(101)} `, TOO_LONG],
    ["絵文字だけの 101 文字", "🍎".repeat(101), TOO_LONG],
    // 型に反する値を as で渡す（型の上では渡せないが、zod の既定の英語の文言を domain の外に出さない）。
    [
      "文字列でない",
      undefined as unknown as string,
      { key: "todo.title.invalid" } as const,
    ],
  ])(
    "%sなら validation_error を、理由の key（と params）付きで投げる",
    (_label, input, expected) => {
      // given: 前提なし
      // when
      const action = () => new TodoTitle(input);

      // then
      expectValidationError(action, expected);
    },
  );

  // WHY 凍結する: 値オブジェクトは不変。readonly は型の上だけで、as で外せば書き換えられる。
  test("作った値は凍結されていて書き換えられない", () => {
    // given: 前提なし
    // when
    const title = new TodoTitle("牛乳を買う");

    // then
    expect(Object.isFrozen(title)).toBe(true);
  });
});

// WHY 定数の値を固定する: presentation のリクエストのスキーマ（create-todo.api.ts・rename-todo.api.ts）がこの定数を参照して
//   同じ上限を重ねる（Issue #144）。値を変えると画面の文言（params.max）と API の契約が変わるので、変えるときはここも直す。
describe("TODO_TITLE_MAX_LENGTH", () => {
  test("タイトルの上限の文字数は 100", () => {
    // given: 前提なし
    // when
    const max = TODO_TITLE_MAX_LENGTH;

    // then
    expect(max).toBe(100);
  });
});

describe("TodoTitle#equals", () => {
  test("前後の空白を除いた値が同じなら等しく、違えば等しくない", () => {
    // given
    const title = new TodoTitle("牛乳を買う");

    // when
    const same = title.equals(new TodoTitle(" 牛乳を買う "));
    const other = title.equals(new TodoTitle("卵を買う"));

    // then
    expect(same).toBe(true);
    expect(other).toBe(false);
  });
});
