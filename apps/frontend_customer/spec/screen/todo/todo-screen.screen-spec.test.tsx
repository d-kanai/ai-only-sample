import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, expect } from "vitest";
import { TodoScreen } from "@/features/todo";
import { todoScreenMessages } from "@/features/todo/screens/todo-screen/todo-screen.messages";
import { commonMessages } from "@/shared/i18n/common.messages";
import { tJa } from "@/test-support/i18n";
import { RouteFetch } from "@/test-support/route-fetch";
import { ScreenSpecProviders } from "@/test-support/screen-spec";
import { TestDatabase } from "../../../../backend/test-support/database";
import { TodoBuilder } from "../../../../backend/test-support/todo/todo-builder";
import { SavedTodos } from "./support";

// 画面仕様（.claude/rules/quality/testing.md の「画面仕様」）: todo-screen.feature の `*` の step を、本物の画面・hook・api/ と、
//   route.ts を通した本番の handler・実 Postgres（テスト用のスキーマ）で確かめる。差し替えるのはネットワークだけ
//   （test-support/route-fetch.ts の RouteFetch が fetch を Route Handler の直接の呼び出しに替える）。
// WHY モックを使わない: 画面の表示が保存された内容から来ること・操作が保存されることを、画面 → API → 保存先のつながりで確かめる。
//   api/ を vi.mock で差し替える画面のテストは「こう呼ばれるはず」を書き込むので、API の契約や保存がずれても緑のまま。
//   分岐の網羅（失敗の種類ごとの表示・古い応答の破棄など）は hook の単体テスト（todo-screen.hook.test.ts）が持つ。
// WHY 遷移はリンクの行き先（href）で確かめる: 画面は next/link のリンクで遷移し、useRouter を使わない。next/link のクリックは
//   Next のルーターの本体（app-router-instance）を呼び、next/navigation のモックでは捕まえられない（next 16.3.6 の
//   dist/client/app-dir/link.js）。遷移先の画面は、その画面の画面仕様が確かめる。
// WHY 操作する step はすべて保存された行を確かめる（support.ts の SavedTodos。rule-tests/screen-spec.test.ts の
//   screen-spec-operation-reads-saved）: 画面に出ただけでは、キャッシュの書き換えだけで保存されていない誤りを見逃す。どの値が
//   保存されたか（前後の空白・完了かどうか）も行を読まないと分からない。書き込みが起きないはずの操作（空白だけ・長すぎる・ほかで
//   削除された）でも、行が変わっていないことを確かめる。
// 前提の Todo は backend のテストデータビルダー（TodoBuilder）で表に直接入れる（API を通さない。理由は todo-builder.ts の冒頭）。

let database: TestDatabase;
let routeFetch: RouteFetch;

beforeAll(async () => {
  database = await TestDatabase.create();
  await database.migrate();
  // route.ts（本番の handler）を読み込む前に、テスト用のスキーマの接続を渡す（読み込むのは RouteFetch が最初のリクエストのとき）。
  database.installAsAppDatabase();
  routeFetch = RouteFetch.install();
});

afterAll(async () => {
  cleanup();
  routeFetch.restore();
  await database.close();
});

// WHY 各 step の前に画面を片付けて表を空にする: `*` の 1 行は前の行に依存しない（前提から確かめまでを step の中で完結させる）。
//   todo_status_changes は todos を外部キーで参照するので、同じ文で消す（.claude/rules/code/backend.md の「外部キー」）。
beforeEach(async () => {
  cleanup();
  await database.pool.query("truncate change_logs, todo_status_changes, todos");
});

type ListedTodo = { title: string; completed: boolean };

// 別の画面（別のタブ）で削除した状態を作る。完了の履歴は外部キーの cascade で消える。
async function removeElsewhere(id: string): Promise<void> {
  await database.pool.query("delete from todos where id = $1", [id]);
}

function renderScreen() {
  const user = userEvent.setup();
  render(<TodoScreen />, { wrapper: ScreenSpecProviders });
  return user;
}

function titleInput(): HTMLInputElement {
  return screen.getByRole("textbox", {
    name: tJa(todoScreenMessages, "form.newTitle"),
  }) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", {
    name: tJa(todoScreenMessages, "form.submit"),
  });
}

function completionCheckbox(title: string): Promise<HTMLInputElement> {
  return screen.findByRole("checkbox", {
    name: tJa(todoScreenMessages, "toggle", { title }),
  }) as Promise<HTMLInputElement>;
}

function deleteButton(title: string): Promise<HTMLElement> {
  return screen.findByRole("button", {
    name: tJa(todoScreenMessages, "deleteAria", { title }),
  });
}

// 一覧の行を、タイトルと完了のチェックの組で読む。
function listedTodos(): ListedTodo[] {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => ({
      title: within(item).getByRole("link").textContent ?? "",
      completed: (within(item).getByRole("checkbox") as HTMLInputElement)
        .checked,
    }));
}

// 送らないことは、待っても何も起きないことでしか確かめられない。フォームの検査（zodResolver）は非同期なので、検査と送信が
//   終わるだけの時間を待つ。
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

const feature = await loadFeature("./todo-screen.feature");

describeFeature(feature, ({ Scenario }) => {
  Scenario("表示項目", ({ And }) => {
    And(
      "保存済みの Todo が、作成日時の古い順に、タイトルと完了のチェックとともに並ぶ",
      async () => {
        // given: 入れる順と作成日時の順を変える
        await TodoBuilder.of(database.db)
          .title("パンを買う")
          .createdAt(new Date("2026-09-28T10:00:00.000Z"))
          .build();
        await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .completed(true)
          .createdAt(new Date("2026-09-28T09:00:00.000Z"))
          .build();
        await TodoBuilder.of(database.db)
          .title("卵を買う")
          .createdAt(new Date("2026-09-28T11:00:00.000Z"))
          .build();

        // when
        renderScreen();
        await screen.findByRole("link", { name: "卵を買う" });

        // then
        expect(listedTodos()).toEqual([
          { title: "牛乳を買う", completed: true },
          { title: "パンを買う", completed: false },
          { title: "卵を買う", completed: false },
        ]);
      },
    );

    And("完了済みの Todo は、完了のチェックが付いて出る", async () => {
      // given
      await TodoBuilder.of(database.db)
        .title("牛乳を買う")
        .completed(true)
        .build();

      // when
      renderScreen();
      const checkbox = await completionCheckbox("牛乳を買う");

      // then
      expect(checkbox.checked).toBe(true);
    });

    // テストの実行環境のタイムゾーンは UTC（vitest.config.mts の test.env.TZ）。画面はブラウザのタイムゾーンで出す。
    And(
      "作成日時は、ロケールの書式とブラウザのタイムゾーンで出る",
      async () => {
        // given
        await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .createdAt(new Date("2026-09-28T00:00:00.000Z"))
          .build();

        // when
        renderScreen();
        const time = await screen.findByText("2026/09/28 0:00");

        // then
        expect(time.tagName).toBe("TIME");
        expect(time.getAttribute("datetime")).toBe("2026-09-28T00:00:00.000Z");
      },
    );

    And(
      "各 Todo のタイトルは、その Todo の詳細画面へのリンクになる",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();

        // when
        renderScreen();
        const link = await screen.findByRole("link", { name: "牛乳を買う" });

        // then
        expect(link.getAttribute("href")).toBe(`/todo/${milk.id}`);
      },
    );

    And("Todo が無ければ、一覧は空で出る", async () => {
      // given: beforeEach で表を空にしてある

      // when
      renderScreen();
      const list = await screen.findByRole("list");

      // then
      expect(within(list).queryAllByRole("listitem")).toEqual([]);
    });

    And("一覧を読み込み終えるまで、読み込み中と出る", async () => {
      // given
      await TodoBuilder.of(database.db).title("牛乳を買う").build();

      // when
      renderScreen();
      const loading = screen.getByText(tJa(todoScreenMessages, "loading"));

      // then
      expect(loading).toBeDefined();
      await screen.findByRole("link", { name: "牛乳を買う" });
      expect(screen.queryByText(tJa(todoScreenMessages, "loading"))).toBeNull();
    });
  });

  Scenario("インタラクション", ({ And }) => {
    And(
      "タイトルを入力して追加すると、Todo が保存されて一覧に出て、入力は空に戻る",
      async () => {
        // given
        const user = renderScreen();
        await screen.findByRole("list");

        // when
        await user.type(titleInput(), "牛乳を買う");
        await user.click(addButton());
        await screen.findByRole("link", { name: "牛乳を買う" });

        // then
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: false },
        ]);
        expect(titleInput().value).toBe("");
      },
    );

    And("追加するタイトルの前後の空白は、除いて保存される", async () => {
      // given
      const user = renderScreen();
      await screen.findByRole("list");

      // when
      await user.type(titleInput(), "  牛乳を買う  ");
      await user.click(addButton());
      await screen.findByRole("link", { name: "牛乳を買う" });

      // then
      await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
        { title: "牛乳を買う", completed: false },
      ]);
    });

    And(
      "空白だけのタイトルで追加しても、何も保存されず、エラーも出ない",
      async () => {
        // given
        const user = renderScreen();
        await screen.findByRole("list");

        // when
        await user.type(titleInput(), "   ");
        await user.click(addButton());
        await settle();

        // then
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([]);
        expect(screen.queryByRole("alert")).toBeNull();
        expect(titleInput().getAttribute("aria-invalid")).toBeNull();
      },
    );

    // submit のイベントを document で受け、既定の動作が止められたか（defaultPrevented）を見る。
    // WHY document で受ける: React は画面のハンドラを描いた根の要素で受ける（イベントの委譲）ので、その先の document に届いた時点で
    //   画面のハンドラ（atom の Form の preventDefault）は動き終わっている。
    And("追加のフォームを送っても、ページは再読み込みされない", async () => {
      // given
      const user = renderScreen();
      await screen.findByRole("list");
      const submitted: Event[] = [];
      document.addEventListener("submit", (event) => submitted.push(event), {
        once: true,
      });

      // when
      await user.type(titleInput(), "牛乳を買う");
      await user.click(addButton());
      await screen.findByRole("link", { name: "牛乳を買う" });

      // then
      expect(submitted.map((event) => event.defaultPrevented)).toEqual([true]);
      await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
        { title: "牛乳を買う", completed: false },
      ]);
    });

    And(
      "未完了の Todo の完了のチェックを付けると、完了として保存され、チェックが付いて出る",
      async () => {
        // given
        await TodoBuilder.of(database.db).title("牛乳を買う").build();
        const user = renderScreen();

        // when
        await user.click(await completionCheckbox("牛乳を買う"));
        const checked = await screen.findByRole("checkbox", {
          name: tJa(todoScreenMessages, "toggle", { title: "牛乳を買う" }),
          checked: true,
        });

        // then
        expect(checked).toBeDefined();
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: true },
        ]);
      },
    );

    And(
      "完了済みの Todo の完了のチェックを外すと、未完了として保存され、チェックが外れて出る",
      async () => {
        // given
        await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .completed(true)
          .build();
        const user = renderScreen();
        const checkbox = await screen.findByRole("checkbox", {
          name: tJa(todoScreenMessages, "toggle", { title: "牛乳を買う" }),
          checked: true,
        });

        // when
        await user.click(checkbox);
        const unchecked = await screen.findByRole("checkbox", {
          name: tJa(todoScreenMessages, "toggle", { title: "牛乳を買う" }),
          checked: false,
        });

        // then
        expect(unchecked).toBeDefined();
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: false },
        ]);
      },
    );

    And(
      "Todo を削除すると、その Todo だけが保存先からも一覧からも消える",
      async () => {
        // given
        await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .createdAt(new Date("2026-09-28T09:00:00.000Z"))
          .build();
        await TodoBuilder.of(database.db)
          .title("パンを買う")
          .createdAt(new Date("2026-09-28T10:00:00.000Z"))
          .build();
        const user = renderScreen();

        // when
        await user.click(await deleteButton("牛乳を買う"));
        await waitFor(() =>
          expect(screen.queryByRole("link", { name: "牛乳を買う" })).toBeNull(),
        );

        // then
        expect(listedTodos()).toEqual([
          { title: "パンを買う", completed: false },
        ]);
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "パンを買う", completed: false },
        ]);
      },
    );
  });

  Scenario("異常系", ({ And }) => {
    And(
      "101 文字のタイトルで追加すると、入力の下に長すぎると出て、何も保存されず、入力は残る",
      async () => {
        // given
        const tooLong = "あ".repeat(101);
        const user = renderScreen();
        await screen.findByRole("list");

        // when
        await user.click(titleInput());
        await user.paste(tooLong);
        await user.click(addButton());
        const input = await screen.findByRole("textbox", {
          name: tJa(todoScreenMessages, "form.newTitle"),
          description: tJa(commonMessages, "todo.title.tooLong", { max: 100 }),
        });

        // then
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect((input as HTMLInputElement).value).toBe(tooLong);
        expect(screen.queryByRole("alert")).toBeNull();
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([]);
      },
    );

    And(
      "壊れた Todo があって一覧を読み込めないと、サーバエラーと出る",
      async () => {
        // given: 完了の履歴の日時が作成日時より前（Todo の不変条件を満たさない行）
        await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .createdAt(new Date("2026-09-28T10:00:00.000Z"))
          .statusChanges([
            {
              completed: false,
              changedAt: new Date("2026-09-28T09:00:00.000Z"),
            },
          ])
          .build();

        // when
        renderScreen();
        const alert = await screen.findByRole("alert");

        // then
        expect(alert.textContent).toBe(
          tJa(commonMessages, "server.internalError"),
        );
      },
    );

    And(
      "ほかで削除された Todo を削除しようとすると、見つからないと出る",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen();
        const button = await deleteButton("牛乳を買う");
        await removeElsewhere(milk.id);

        // when
        await user.click(button);
        const alert = await screen.findByRole("alert");

        // then
        expect(alert.textContent).toBe(
          tJa(commonMessages, "todo.notFound", { id: milk.id }),
        );
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([]);
      },
    );

    And(
      "ほかで削除された Todo の完了を切り替えようとすると、見つからないと出る",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen();
        const checkbox = await completionCheckbox("牛乳を買う");
        await removeElsewhere(milk.id);

        // when
        await user.click(checkbox);
        const alert = await screen.findByRole("alert");

        // then
        expect(alert.textContent).toBe(
          tJa(commonMessages, "todo.notFound", { id: milk.id }),
        );
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([]);
      },
    );
  });
});
