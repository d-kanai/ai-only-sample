// @vitest-environment node
import { Clock } from "@repo/shared/now";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DomainError } from "../../../../shared/error/domain-error";
import type { ErrorKey } from "../../../../shared/error/error-key";
import { Todo } from "./todo";
import { TodoId } from "./todo-id";
import { TodoStatusChange } from "./todo-status-change";
import { TodoTitle } from "./todo-title";

// Todo の技術の仕組み（id の作り方・現在時刻の読み方・不変（元の Todo を変えない）・値の凍結・型を偽った値・Invalid Date・
//   読み込んだときの値 origin・どの口も全体を検証する完全コンストラクタ）の単体テスト。
// 値ごとの規則（id の形・タイトルの文字数と trim・履歴の 1 件の形）は値オブジェクトのテスト（todo-id.test.ts・todo-title.test.ts・
//   todo-status-change.test.ts）が見る。ここでは Todo が値オブジェクトでない値を拒むこと（型を as で偽った値）だけを見る（Issue #423）。
// 業務ルール（タイトルの規則・完了と履歴の規則・履歴の不変条件）は domain 仕様 apps/backend/spec/domain/todo/todo.feature
//   （step の実装は todo.domain-spec.test.ts）に書き、ここでは重ねない（Issue #318）。

// WHY 時計（Clock.now）を差し替える: Todo.create は作成日時を Clock.now() から自動で入れる（引数では受け取らない）。
//   テストで決まった時刻にするには、現在時刻の唯一の出口（apps/shared/now.ts）を差し替えるしかない。
//   自動モックの Clock.now は既定で undefined を返すので、beforeEach で決まった時刻を返させる（返させ忘れた Todo.create は
//   作成日時の不変条件で validation_error になり、気づける）。
vi.mock("@repo/shared/now");

const NOW = new Date("2026-09-28T00:00:00.000Z");

beforeEach(() => {
  vi.mocked(Clock.now).mockReturnValue(NOW);
});

afterEach(() => {
  vi.mocked(Clock.now).mockReset();
});

// key と params は API の Problem Details（problem.ts）の拡張メンバーとして画面に渡る（画面が翻訳するクライアントとの契約。Issue #116）ので、両方を検証する。
// WHY toEqual に params: undefined を含める: params の無いキーで params が {} などになっていないことも確かめる
//   （toEqual は undefined のプロパティと無いプロパティを同じに扱うが、{} とは区別する）。
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

const INVALID_ID = { key: "todo.id.invalid" } as const;
const INVALID_TITLE = { key: "todo.title.invalid" } as const;
const INVALID_COMPLETED = { key: "todo.completed.invalid" } as const;
const INVALID_CREATED_AT = { key: "todo.createdAt.invalid" } as const;
const INVALID_STATUS_CHANGES = { key: "todo.statusChanges.invalid" } as const;

// タイトルの値オブジェクトを作る（テストの前提を短く書くため）。
function title(value: string): TodoTitle {
  return new TodoTitle(value);
}

// 完了の履歴の 1 件を作る（テストの前提を短く書くため）。
function change(completed: boolean, changedAt: Date): TodoStatusChange {
  return new TodoStatusChange({ completed, changedAt });
}

describe("Todo.create", () => {
  test("id は TodoId.generate で作った値（randomUUID の形）で付き、現在時刻（Clock.now()）は 1 回だけ読む", () => {
    // given: beforeEach で now() が NOW を返すようにしてある
    // when
    const todo = Todo.create(title("牛乳を買う"));

    // then
    expect(Clock.now).toHaveBeenCalledTimes(1);
    expect(todo.id).toBeInstanceOf(TodoId);
    // randomUUID の形式（8-4-4-4-12 の 16 進）。
    expect(todo.id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("渡したタイトル（値オブジェクト）をそのまま持つ", () => {
    // given
    const given = title("牛乳を買う");

    // when
    const todo = Todo.create(given);

    // then
    expect(todo.title).toBe(given);
  });

  // WHY 型で止める: 作成日時は Entity の生成ルールとして Clock.now() から入れる。呼び出し側が渡せると、ルールが呼び出し側に漏れる。
  test("作成日時は引数で受け取らない（型エラーで、渡しても Clock.now() の値が入る）", () => {
    // given
    const createdAt = new Date("2000-01-01T00:00:00.000Z");

    // when
    // @ts-expect-error Todo.create はタイトルだけを受け取る。
    const todo = Todo.create(title("牛乳を買う"), createdAt);

    // then
    expect(todo.createdAt).toEqual(NOW);
  });

  // WHY 型で止める: タイトルの規則は TodoTitle が持つ（Issue #423）。文字列を受け取ると、規則を通さない値を Todo に渡せてしまう。
  test("タイトルは文字列では受け取らない（型エラーで、渡すと validation_error（todo.title.invalid）になる）", () => {
    // given: beforeEach で now() が NOW を返すようにしてある
    // when
    // @ts-expect-error Todo.create は TodoTitle を受け取る。
    const action = () => Todo.create("牛乳を買う");

    // then
    expectValidationError(action, INVALID_TITLE);
  });

  test("作るたびに別の id になる", () => {
    // given: beforeEach で now() が NOW を返すようにしてある
    // when
    const first = Todo.create(title("a"));
    const second = Todo.create(title("a"));

    // then
    expect(first.id.equals(second.id)).toBe(false);
  });

  // 完全コンストラクタ: create もすべての値を検証してから作る。作成日時は最初の履歴（TodoStatusChange）の日時にも使うので、
  //   履歴の値を作るときの検証が先に失敗する（todo.ts の create のコメント。Issue #423 より前は todo.createdAt.invalid）。
  test("作成日時が日付として不正（Invalid Date）なら validation_error（todo.statusChanges.invalid）を投げる", () => {
    // given
    vi.mocked(Clock.now).mockReturnValueOnce(new Date("not a date"));

    // when
    const action = () => Todo.create(title("牛乳を買う"));

    // then
    expectValidationError(action, INVALID_STATUS_CHANGES);
  });
});

describe("Todo#rename", () => {
  test("新しいタイトルの Todo を返し、元の Todo は変えない（作成日時は作ったときのまま）", () => {
    // given
    // WHY 作成時だけ別の時刻にする: rename が Clock.now() を読み直す書き換えでは、作成日時が既定の NOW に変わって落ちる。
    const createdAt = new Date("2026-09-27T00:00:00.000Z");
    vi.mocked(Clock.now).mockReturnValueOnce(createdAt);
    const original = Todo.create(title("牛乳を買う"));
    const renamedTitle = title("卵を買う");

    // when
    const renamed = original.rename(renamedTitle);

    // then
    expect(renamed.title).toBe(renamedTitle);
    expect(renamed.id).toBe(original.id);
    expect(renamed.createdAt).toEqual(createdAt);
    expect(original.title.value).toBe("牛乳を買う");
  });

  // WHY 型に反する値を as で渡す: 型の上では TodoTitle しか渡せないが、完全コンストラクタは口によらず全体を検証する（todo.ts のコメント）。
  test("タイトルが TodoTitle でなければ validation_error（todo.title.invalid）を投げる（全体を検証する）", () => {
    // given
    const todo = Todo.create(title("牛乳を買う"));

    // when
    const action = () => todo.rename("卵を買う" as unknown as TodoTitle);

    // then
    expectValidationError(action, INVALID_TITLE);
  });
});

describe("Todo#changeCompletion", () => {
  test("完了 / 未完了を切り替えた Todo を返し、元の Todo は変えない（作成日時は変わらない）", () => {
    // given
    // WHY 作成時だけ別の時刻にする: changeCompletion が Clock.now() を読み直す書き換えでは、作成日時が既定の NOW に変わって落ちる。
    const createdAt = new Date("2026-09-27T00:00:00.000Z");
    vi.mocked(Clock.now).mockReturnValueOnce(createdAt);
    const original = Todo.create(title("牛乳を買う"));

    // when
    const completed = original.changeCompletion(true);
    const reopened = completed.changeCompletion(false);

    // then
    expect(completed.completed).toBe(true);
    expect(reopened.completed).toBe(false);
    expect(completed.id).toBe(original.id);
    expect(completed.title).toBe(original.title);
    expect(completed.createdAt).toEqual(createdAt);
    expect(reopened.createdAt).toEqual(createdAt);
    expect(original.completed).toBe(false);
  });

  // WHY 元の履歴を見る: 履歴は Todo の値で、Todo は不変。足した履歴が元の Todo に混ざると、保存前の値や origin との差分が変わる。
  test("完了状態を変えても、元の Todo の完了の履歴は変えない", () => {
    // given
    const original = Todo.create(title("牛乳を買う"));

    // when
    const completed = original.changeCompletion(true);
    completed.changeCompletion(false);

    // then
    expect(original.statusChanges).toStrictEqual([change(false, NOW)]);
    expect(completed.statusChanges).toStrictEqual([
      change(false, NOW),
      change(true, NOW),
    ]);
  });

  // WHY 現在時刻を読まないことを見る: 同じ状態の指定は何も変えない（domain 仕様）。時刻を読むのは履歴を足すときだけで、読む誤りは
  //   結果の Todo（toBe）では分からない（reviewer の指摘、Issue #318）。
  test.each([false, true])(
    "今と同じ値（%s）を渡すと、現在時刻（Clock.now()）を読まない",
    (value) => {
      // given
      const todo =
        value === false
          ? Todo.create(title("牛乳を買う"))
          : Todo.create(title("牛乳を買う")).changeCompletion(true);
      vi.mocked(Clock.now).mockClear();

      // when
      todo.changeCompletion(value);

      // then
      expect(Clock.now).not.toHaveBeenCalled();
    },
  );

  // WHY 型に反する値を as で渡す: 型の上では boolean しか渡せないが、完全コンストラクタは口によらず全体を検証する
  //   （todo.ts のコメント）。末尾に足す履歴（TodoStatusChange）の検証が先に失敗するので、キーは todo.statusChanges.invalid
  //   （todo.ts の changeCompletion のコメント。Issue #423 より前は todo.completed.invalid）。
  test("completed が boolean でなければ validation_error（todo.statusChanges.invalid）を投げる", () => {
    // given
    const todo = Todo.create(title("牛乳を買う"));

    // when
    const action = () => todo.changeCompletion("true" as unknown as boolean);

    // then
    expectValidationError(action, INVALID_STATUS_CHANGES);
  });
});

describe("Todo.reconstruct", () => {
  const ID = new TodoId("8d0f4f39-6f0b-4a39-9d53-0a3f8b1c2d4e");
  const CREATED_AT = new Date("2026-09-28T00:00:00.000Z");

  test("保存済みの値（id・title・completed・作成日時・完了の履歴）をそのまま持つ Todo を作る", () => {
    // given
    const completedAt = new Date("2026-09-28T01:00:00.000Z");
    const storedTitle = title("牛乳を買う");

    // when
    const todo = Todo.reconstruct({
      id: ID,
      title: storedTitle,
      completed: true,
      createdAt: CREATED_AT,
      statusChanges: [change(false, CREATED_AT), change(true, completedAt)],
    });

    // then
    expect(todo).toBeInstanceOf(Todo);
    expect(todo.id).toBe(ID);
    expect(todo.title).toBe(storedTitle);
    expect(todo.completed).toBe(true);
    expect(todo.createdAt).toEqual(CREATED_AT);
    expect(todo.statusChanges).toStrictEqual([
      change(false, CREATED_AT),
      change(true, completedAt),
    ]);
  });

  // WHY 凍結する: 履歴は Todo の値で、Todo は不変（todo.ts）。配列や要素を書き換えられると、update の前に保持中の値
  //   （InMemory）や origin との差分が変わる。配列は todoPropsSchema の readonly()、要素は TodoStatusChange 自身が凍結する。
  test("完了の履歴の配列と要素は凍結されていて書き換えられない", () => {
    // given: 前提なし
    // when
    const todo = Todo.reconstruct({
      id: ID,
      title: title("牛乳を買う"),
      completed: false,
      createdAt: CREATED_AT,
      statusChanges: [change(false, CREATED_AT)],
    });

    // then
    expect(Object.isFrozen(todo.statusChanges)).toBe(true);
    expect(Object.isFrozen(todo.statusChanges[0])).toBe(true);
  });

  // Issue #94: 保存済みの値も今の不変条件で検査する（Todo 型 = 不変条件を満たす値）。値ごとの規則は値オブジェクトが、履歴の規則は
  //   domain 仕様が見るので、ここで見るのは「値オブジェクトでない値・型に反する値を拒むこと」と、そのときのキー。
  // 型に反する値を as で渡す（型の上では渡せないが、zod の既定の英語の文言を domain の外に出さない）。
  test.each([
    [
      "id が TodoId でない（uuid の文字列のまま）",
      { id: ID.value as unknown as TodoId },
      INVALID_ID,
    ],
    [
      "title が TodoTitle でない（文字列のまま）",
      { title: "牛乳を買う" as unknown as TodoTitle },
      INVALID_TITLE,
    ],
    [
      "completed が boolean でない",
      { completed: "false" as unknown as boolean },
      INVALID_COMPLETED,
    ],
    [
      "作成日時が Invalid Date",
      { createdAt: new Date("not a date") },
      INVALID_CREATED_AT,
    ],
    [
      "完了の履歴が配列でない",
      { statusChanges: undefined as unknown as [] },
      INVALID_STATUS_CHANGES,
    ],
    [
      "履歴の要素が TodoStatusChange でない（同じ形のオブジェクト）",
      {
        statusChanges: [
          { completed: false, changedAt: CREATED_AT } as TodoStatusChange,
        ],
      },
      INVALID_STATUS_CHANGES,
    ],
  ])(
    "%sなら validation_error を、理由の key 付きで投げる",
    (_label, override, expected) => {
      // given: 前提なし
      // when
      const action = () =>
        Todo.reconstruct({
          id: ID,
          title: title("牛乳を買う"),
          completed: false,
          createdAt: CREATED_AT,
          statusChanges: [change(false, CREATED_AT)],
          ...override,
        });

      // then
      expectValidationError(action, expected);
    },
  );
});

// origin: 読み込んだとき（reconstruct）の値。Repository の update が「変わった列だけ」を書くために差分を取る（Issue #165）。
describe("Todo#origin", () => {
  const CREATED_AT = new Date("2026-09-28T00:00:00.000Z");
  const VALUES = {
    id: new TodoId("8d0f4f39-6f0b-4a39-9d53-0a3f8b1c2d4e"),
    title: title("牛乳を買う"),
    completed: false,
    createdAt: CREATED_AT,
    statusChanges: [change(false, CREATED_AT)],
  };

  test("create した Todo の origin は undefined（新規で、読み込んだ値が無い）", () => {
    // given: 前提なし
    // when
    const todo = Todo.create(title("牛乳を買う"));
    const renamed = todo.rename(title("卵を買う"));
    const completed = todo.changeCompletion(true);

    // then
    expect(todo.origin).toBeUndefined();
    expect(renamed.origin).toBeUndefined();
    expect(completed.origin).toBeUndefined();
  });

  // WHY 検証後の値: 差分は今の値（常に検証後）と比べる。値オブジェクトは z.instanceof がそのまま返すので同じインスタンス、
  //   履歴は凍結した配列になる。
  test("reconstruct した Todo の origin は検証後の値（値オブジェクトは渡したもの、履歴は凍結した配列）", () => {
    // given: 前提なし
    // when
    const todo = Todo.reconstruct(VALUES);

    // then
    expect(todo.origin).toStrictEqual(VALUES);
    expect(todo.origin?.id).toBe(VALUES.id);
    expect(todo.origin?.title).toBe(VALUES.title);
    expect(Object.isFrozen(todo.origin?.statusChanges)).toBe(true);
  });

  test("rename・changeCompletion した Todo は元の origin を引き継ぐ（今の値は変わっても origin は読み込んだときのまま）", () => {
    // given
    const loaded = Todo.reconstruct(VALUES);

    // when
    const renamed = loaded.rename(title("卵を買う"));
    const completed = renamed.changeCompletion(true);

    // then
    expect(renamed.title.value).toBe("卵を買う");
    expect(completed.completed).toBe(true);
    expect(renamed.origin).toBe(loaded.origin);
    expect(completed.origin).toBe(loaded.origin);
    expect(completed.origin).toStrictEqual(VALUES);
  });

  // WHY: origin は永続化のための付帯情報で、Todo の値ではない。列挙されるプロパティに出すと、値の等価（テストの toEqual）
  //   が「読み込んだかどうか」で変わり、Todo を直列化したときにも混ざる。
  test("origin は Todo の値（列挙されるプロパティ）に含めない", () => {
    // given: 前提なし
    // when
    const todo = Todo.reconstruct(VALUES).rename(title("卵を買う"));

    // then
    expect(Object.keys(todo)).toEqual([
      "id",
      "title",
      "completed",
      "createdAt",
      "statusChanges",
    ]);
    expect(todo).toEqual(
      Todo.reconstruct({ ...VALUES, title: title("卵を買う") }).rename(
        title("卵を買う"),
      ),
    );
  });
});
