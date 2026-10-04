import { randomUUID } from "node:crypto";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, expect } from "vitest";
import { TodoDetailScreen } from "@/features/todo";
import { todoDetailScreenMessages } from "@/features/todo/screens/todo-detail-screen/todo-detail-screen.messages";
import { commonMessages } from "@/shared/i18n/common.messages";
import { tJa } from "@/test-support/i18n";
import { RouteFetch } from "@/test-support/route-fetch";
import { ScreenSpecProviders } from "@/test-support/screen-spec";
import { TestDatabase } from "../../../../backend/test-support/database";
import { TodoBuilder } from "../../../../backend/test-support/todo/todo-builder";
import { SavedTodos } from "./support";

// 画面仕様（.claude/rules/quality/testing.md の「画面仕様」）: todo-detail-screen.feature の `*` の step を、本物の画面・hook・api/ と、
//   route.ts を通した本番の handler・実 Postgres（テスト用のスキーマ）で確かめる。WHY（モックを使わない・遷移はリンクの行き先で
//   確かめる・操作する step はすべて保存された行を確かめる・前提はテストデータビルダー）は todo-screen.screen-spec.test.tsx の冒頭と同じ。

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

// WHY 各 step の前に画面を片付けて表を空にする: todo-screen.screen-spec.test.tsx の同じ箇所と同じ。
beforeEach(async () => {
  cleanup();
  await database.pool.query("truncate change_logs, todo_status_changes, todos");
});

// 別の画面（別のタブ）で削除した状態を作る。完了の履歴は外部キーの cascade で消える。
async function removeElsewhere(id: string): Promise<void> {
  await database.pool.query("delete from todos where id = $1", [id]);
}

function renderScreen(todoId: string) {
  const user = userEvent.setup();
  render(<TodoDetailScreen todoId={todoId} />, {
    wrapper: ScreenSpecProviders,
  });
  return user;
}

function titleInput(): Promise<HTMLInputElement> {
  return screen.findByRole("textbox", {
    name: tJa(todoDetailScreenMessages, "titleLabel"),
  }) as Promise<HTMLInputElement>;
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", {
    name: tJa(todoDetailScreenMessages, "save"),
  });
}

function completionCheckbox(checked: boolean): Promise<HTMLInputElement> {
  return screen.findByRole("checkbox", {
    name: tJa(todoDetailScreenMessages, "completed"),
    checked,
  }) as Promise<HTMLInputElement>;
}

function heading(name: string): Promise<HTMLElement> {
  return screen.findByRole("heading", { level: 1, name });
}

// 送らないことは、待っても何も起きないことでしか確かめられない（todo-screen.screen-spec.test.tsx の settle と同じ）。
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

const feature = await loadFeature("./todo-detail-screen.feature");

describeFeature(feature, ({ Scenario }) => {
  Scenario("表示項目", ({ And }) => {
    And(
      "Todo のタイトルが見出しに出て、タイトルの入力の初期値になる",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();

        // when
        renderScreen(milk.id);
        const title = await heading("牛乳を買う");

        // then
        expect(title).toBeDefined();
        expect((await titleInput()).value).toBe("牛乳を買う");
      },
    );

    And("完了済みの Todo は、完了のチェックが付いて出る", async () => {
      // given
      const milk = await TodoBuilder.of(database.db)
        .title("牛乳を買う")
        .completed(true)
        .build();

      // when
      renderScreen(milk.id);
      const checkbox = await completionCheckbox(true);

      // then
      expect(checkbox.checked).toBe(true);
    });

    And("Todo を読み込み終えるまで、読み込み中と出る", async () => {
      // given
      const milk = await TodoBuilder.of(database.db)
        .title("牛乳を買う")
        .build();

      // when
      renderScreen(milk.id);
      const loading = screen.getByText(
        tJa(todoDetailScreenMessages, "loading"),
      );

      // then
      expect(loading).toBeDefined();
      await heading("牛乳を買う");
      expect(
        screen.queryByText(tJa(todoDetailScreenMessages, "loading")),
      ).toBeNull();
    });

    And("一覧へ戻るリンクは、一覧画面を指す", async () => {
      // given
      const milk = await TodoBuilder.of(database.db)
        .title("牛乳を買う")
        .build();

      // when
      renderScreen(milk.id);
      await heading("牛乳を買う");
      const back = screen.getByRole("link", {
        name: tJa(todoDetailScreenMessages, "back"),
      });

      // then
      expect(back.getAttribute("href")).toBe("/");
    });
  });

  Scenario("インタラクション", ({ And }) => {
    And("タイトルを変えて保存すると、保存されて見出しも変わる", async () => {
      // given
      const milk = await TodoBuilder.of(database.db)
        .title("牛乳を買う")
        .build();
      const user = renderScreen(milk.id);
      const input = await titleInput();

      // when
      await user.clear(input);
      await user.type(input, "豆乳を買う");
      await user.click(saveButton());
      const title = await heading("豆乳を買う");

      // then
      expect(title).toBeDefined();
      await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
        { title: "豆乳を買う", completed: false },
      ]);
    });

    And(
      "保存するタイトルの前後の空白は除いて保存され、入力も除いた後のタイトルになる",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen(milk.id);
        const input = await titleInput();

        // when
        await user.clear(input);
        await user.type(input, "  豆乳を買う  ");
        await user.click(saveButton());
        await heading("豆乳を買う");

        // then
        await waitFor(() => expect(input.value).toBe("豆乳を買う"));
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "豆乳を買う", completed: false },
        ]);
      },
    );

    And(
      "空白だけのタイトルで保存しても、何も変わらず、エラーも出ない",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen(milk.id);
        const input = await titleInput();

        // when
        await user.clear(input);
        await user.type(input, "   ");
        await user.click(saveButton());
        await settle();

        // then
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: false },
        ]);
        expect(screen.queryByRole("alert")).toBeNull();
        expect(input.getAttribute("aria-invalid")).toBeNull();
        expect(
          screen.getByRole("heading", { level: 1, name: "牛乳を買う" }),
        ).toBeDefined();
      },
    );

    // submit のイベントを document で受け、既定の動作が止められたか（defaultPrevented）を見る（WHY は
    //   todo-screen.screen-spec.test.tsx の同じ step）。
    And(
      "タイトルのフォームを送っても、ページは再読み込みされない",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen(milk.id);
        const input = await titleInput();
        const submitted: Event[] = [];
        document.addEventListener("submit", (event) => submitted.push(event), {
          once: true,
        });

        // when
        await user.clear(input);
        await user.type(input, "豆乳を買う");
        await user.click(saveButton());
        await heading("豆乳を買う");

        // then
        expect(submitted.map((event) => event.defaultPrevented)).toEqual([
          true,
        ]);
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "豆乳を買う", completed: false },
        ]);
      },
    );

    And(
      "完了のチェックを付けると、完了として保存され、チェックが付く",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen(milk.id);

        // when
        await user.click(await completionCheckbox(false));
        const checked = await completionCheckbox(true);

        // then
        expect(checked.checked).toBe(true);
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: true },
        ]);
      },
    );

    And(
      "完了のチェックを外すと、未完了として保存され、チェックが外れる",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .completed(true)
          .build();
        const user = renderScreen(milk.id);

        // when
        await user.click(await completionCheckbox(true));
        const unchecked = await completionCheckbox(false);

        // then
        expect(unchecked.checked).toBe(false);
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: false },
        ]);
      },
    );

    And(
      "タイトルを編集したまま完了を切り替えると、完了だけが保存され、見出しは保存済みのタイトルのまま",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen(milk.id);
        const input = await titleInput();
        await user.clear(input);
        await user.type(input, "豆乳を買う");

        // when
        await user.click(await completionCheckbox(false));
        await completionCheckbox(true);

        // then
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: true },
        ]);
        expect(
          screen.getByRole("heading", { level: 1, name: "牛乳を買う" }),
        ).toBeDefined();
        expect(input.value).toBe("豆乳を買う");
      },
    );
  });

  Scenario("異常系", ({ And }) => {
    And(
      "存在しない Todo の詳細画面を開くと、見つからないと出て、一覧へ戻るリンクだけが残る",
      async () => {
        // given
        const missing = randomUUID();

        // when
        renderScreen(missing);
        const alert = await screen.findByRole("alert");

        // then
        expect(alert.textContent).toBe(
          tJa(commonMessages, "todo.notFound", { id: missing }),
        );
        expect(
          screen.getByRole("link", {
            name: tJa(todoDetailScreenMessages, "back"),
          }),
        ).toBeDefined();
        expect(screen.queryByRole("heading")).toBeNull();
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.queryByRole("checkbox")).toBeNull();
      },
    );

    And("壊れた Todo の詳細画面を開くと、サーバエラーと出る", async () => {
      // given: 完了の履歴の日時が作成日時より前（Todo の不変条件を満たさない行）
      const broken = await TodoBuilder.of(database.db)
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
      renderScreen(broken.id);
      const alert = await screen.findByRole("alert");

      // then
      expect(alert.textContent).toBe(
        tJa(commonMessages, "server.internalError"),
      );
    });

    And(
      "101 文字のタイトルで保存すると、入力の下に長すぎると出て、何も変わらず、入力は残る",
      async () => {
        // given
        const tooLong = "あ".repeat(101);
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen(milk.id);
        const input = await titleInput();

        // when
        await user.clear(input);
        await user.paste(tooLong);
        await user.click(saveButton());
        const invalid = await screen.findByRole("textbox", {
          name: tJa(todoDetailScreenMessages, "titleLabel"),
          description: tJa(commonMessages, "todo.title.tooLong", { max: 100 }),
        });

        // then
        expect(invalid.getAttribute("aria-invalid")).toBe("true");
        expect((invalid as HTMLInputElement).value).toBe(tooLong);
        expect(screen.queryByRole("alert")).toBeNull();
        await expect(SavedTodos.of(database.pool).read()).resolves.toEqual([
          { title: "牛乳を買う", completed: false },
        ]);
      },
    );

    And(
      "ほかで削除された Todo のタイトルを保存しようとすると、見つからないと出て、入力は誤りの表示にならない",
      async () => {
        // given
        const milk = await TodoBuilder.of(database.db)
          .title("牛乳を買う")
          .build();
        const user = renderScreen(milk.id);
        const input = await titleInput();
        await removeElsewhere(milk.id);

        // when
        await user.click(saveButton());
        const alert = await screen.findByRole("alert");

        // then
        expect(alert.textContent).toBe(
          tJa(commonMessages, "todo.notFound", { id: milk.id }),
        );
        expect(input.getAttribute("aria-invalid")).toBeNull();
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
        const user = renderScreen(milk.id);
        const checkbox = await completionCheckbox(false);
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
