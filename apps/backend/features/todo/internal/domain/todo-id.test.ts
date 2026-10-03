// @vitest-environment node
import { describe, expect, test } from "vitest";
import { DomainError } from "../../../../shared/error/domain-error";
import { TodoId } from "./todo-id";

// Todo の id の値オブジェクト（TodoId）の単体テスト。形（RFC 9562 の uuid）・作り方（generate）・等価（equals）・不変を見る。
// WHY Todo のテスト（todo.test.ts）から分ける: id の規則は TodoId の完全コンストラクタが持ち、Todo は TodoId のインスタンスで
//   あることだけを確かめる（todo.ts）。規則の境界はこの値を作る口で確かめる。

const VALID_ID = "8d0f4f39-6f0b-4a39-9d53-0a3f8b1c2d4e";

// key は API の Problem Details の拡張メンバーとして画面に渡る契約（Issue #116）。params が無いことも比べる（todo.test.ts と同じ）。
function expectInvalidId(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    const { code, key, params } = error as DomainError;
    expect({ code, key, params }).toEqual({
      code: "validation_error",
      key: "todo.id.invalid",
      params: undefined,
    });
    return;
  }
  throw new Error("DomainError(validation_error) が投げられなかった");
}

describe("new TodoId", () => {
  test("uuid の形の値をそのまま持つ", () => {
    // given: 前提なし
    // when
    const id = new TodoId(VALID_ID);

    // then
    expect(id.value).toBe(VALID_ID);
  });

  // WHY 大文字も通す: presentation の ResourceId.parseUuid（z.uuid()）と同じ形にそろえる。z.uuid() は大文字も通す。
  test("大文字の uuid も受け付け、そのまま持つ", () => {
    // given
    const upper = VALID_ID.toUpperCase();

    // when
    const id = new TodoId(upper);

    // then
    expect(id.value).toBe(upper);
  });

  test.each([
    ["uuid の形でない", "missing"],
    ["空文字", ""],
    // Postgres の uuid 型は受け付けるが、RFC 9562 の形ではない（版の桁が 0）。
    ["版の桁が 0", "8d0f4f39-6f0b-0a39-9d53-0a3f8b1c2d4e"],
    // 型に反する値を as で渡す（型の上では渡せないが、zod の既定の英語の文言を domain の外に出さない）。
    ["文字列でない", undefined as unknown as string],
  ])("%sなら validation_error（todo.id.invalid）を投げる", (_label, value) => {
    // given: 前提なし
    // when
    const action = () => new TodoId(value);

    // then
    expectInvalidId(action);
  });

  // WHY 凍結する: 値オブジェクトは不変。readonly は型の上だけで、as で外せば書き換えられる。
  test("作った値は凍結されていて書き換えられない", () => {
    // given: 前提なし
    // when
    const id = new TodoId(VALID_ID);

    // then
    expect(Object.isFrozen(id)).toBe(true);
  });
});

describe("TodoId.generate", () => {
  test("randomUUID の形（8-4-4-4-12 の 16 進）の id を作り、作るたびに別の値になる", () => {
    // given: 前提なし
    // when
    const first = TodoId.generate();
    const second = TodoId.generate();

    // then
    expect(first).toBeInstanceOf(TodoId);
    expect(first.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(first.value).not.toBe(second.value);
  });
});

describe("TodoId#equals", () => {
  test("同じ値なら別のインスタンスでも等しく、違う値なら等しくない", () => {
    // given
    const id = new TodoId(VALID_ID);

    // when
    const same = id.equals(new TodoId(VALID_ID));
    const other = id.equals(TodoId.generate());

    // then
    expect(same).toBe(true);
    expect(other).toBe(false);
  });
});
