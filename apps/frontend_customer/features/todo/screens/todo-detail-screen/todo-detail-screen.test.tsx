import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TodoDetailScreen } from "@/features/todo";
import { ApiError } from "@/features/todo/api/api-error";
import { TodoApi } from "@/features/todo/api/todo-api";
import { commonMessages } from "@/shared/i18n/common.messages";
import { EnLocale, JaLocale, tJa } from "@/test-support/i18n";
import { todoDetailScreenMessages } from "./todo-detail-screen.messages";

// 画面の表示・操作・異常系の仕様は、実 DB まで通す画面仕様（todo-detail-screen.feature と todo-detail-screen.screen-spec.test.tsx）が
//   持つ。ここには画面仕様で起こせないもの・業務でない見た目の仕組みだけを残す: en の表示、保存の API が返さない失敗（400 の errors の
//   組み合わせ）、項目の誤りの DOM の位置（label の外・入力の後ろ）、エラーが無いときの表示。API は差し替える。
// 状態遷移の細かい仕様は todo-detail-screen.hook.test.ts で固定している。
vi.mock("@/features/todo/api/todo-api");

// 操作は user-event（userEvent.setup()）で行う（WHY は todo-screen.test.tsx の同じ箇所）。
// globals 無効のため Testing Library の自動 cleanup が働かない。テストごとに DOM を片付ける。
afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
});

const milk = {
  id: "todo-1",
  title: "牛乳を買う",
  completed: false,
  createdAt: "2026-09-28T00:00:00.000Z",
};

test("エラーが無いときは alert を表示しない", async () => {
  // given
  vi.mocked(TodoApi.get).mockResolvedValue(milk);

  // when
  render(<TodoDetailScreen todoId={milk.id} />, { wrapper: JaLocale });

  // then
  expect(
    await screen.findByRole("heading", { level: 1, name: "牛乳を買う" }),
  ).toBeDefined();
  expect(screen.queryByRole("alert")).toBeNull();
});

// 画面の文言が LocaleProvider のロケールに従うこと（ja と en で違う文言のキーで見る）。
test("LocaleProvider のロケールが en なら、英語の文言で表示する", async () => {
  // given
  vi.mocked(TodoApi.get).mockResolvedValue(milk);

  // when
  render(<TodoDetailScreen todoId={milk.id} />, { wrapper: EnLocale });

  // then
  expect(screen.getByText("Loading…")).toBeDefined();
  expect(await screen.findByRole("button", { name: "Save" })).toBeDefined();
  expect(screen.getByRole("link", { name: "Back to list" })).toBeDefined();
  expect(screen.getByRole("textbox", { name: "Title" })).toBeDefined();
  expect(screen.getByRole("checkbox", { name: "Completed" })).toBeDefined();
});

// 400 の項目ごとの誤り（ApiError の errors）は、その入力の直下に出し、aria-describedby と aria-invalid で入力と結び付ける。
// WHY role="alert" はフォーム全体の文言だけ: 項目の文言は入力の説明（accessible description）として読まれる。
async function saveTitleWithFailure(reason: unknown) {
  vi.mocked(TodoApi.get).mockResolvedValue(milk);
  vi.mocked(TodoApi.rename).mockRejectedValue(reason);
  const user = userEvent.setup();
  render(<TodoDetailScreen todoId={milk.id} />, { wrapper: JaLocale });
  await user.click(
    await screen.findByRole("button", {
      name: tJa(todoDetailScreenMessages, "save"),
    }),
  );
}

test("エラーが無いときは、title の入力は invalid でなく、説明も無い", async () => {
  // given
  vi.mocked(TodoApi.get).mockResolvedValue(milk);

  // when
  render(<TodoDetailScreen todoId={milk.id} />, { wrapper: JaLocale });

  // then
  const input = await screen.findByRole("textbox", {
    name: tJa(todoDetailScreenMessages, "titleLabel"),
    description: "",
  });
  // aria-invalid は付けない（Mantine の TextInput は誤りが無いと属性を出さない。Issue #292 で "false" から変わった）。
  expect(input.getAttribute("aria-invalid")).toBeNull();
  expect(input.getAttribute("aria-describedby")).toBeNull();
  // 項目のエラーの文言も描画しない（フォームの文字はラベルとボタンだけ）。WHY: aria-invalid / aria-describedby だけを
  //   見ると、エラーが無いのに文言の要素を描画しても通ってしまう（Issue #202 で、描画の条件を常に偽にする変異が生き残った）。
  //   限界: 文字の無い要素を描いても通る（Mantine は error に空でない値が入ると aria-invalid="true" も付けるので、上の検証で落ちる）。
  expect(input.closest("form")?.textContent).toBe(
    tJa(todoDetailScreenMessages, "titleLabel") +
      tJa(todoDetailScreenMessages, "save"),
  );
});

test("空タイトルの 400（#/title）は、title の入力の説明として直下に出し、alert は出さない", async () => {
  // given
  const message = tJa(commonMessages, "todo.title.empty");
  const failure = new ApiError({
    status: 400,
    type: "/problems/validation-error",
    key: "todo.title.empty",
    errors: [{ pointer: "#/title", key: "todo.title.empty" }],
  });

  // when
  await saveTitleWithFailure(failure);

  // then
  const input = await screen.findByRole("textbox", {
    name: tJa(todoDetailScreenMessages, "titleLabel"),
    description: message,
  });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  // 直下: 説明の要素（aria-describedby が指す要素）は、入力より後ろにあり、label の外にある。
  // WHY label の中に置かない: label の中の文字はすべて入力の名前（accessible name）になり、名前にエラーの文言が混ざる。
  //   部品の DOM の組み立て（label が入力を包むか）は Mantine が決めるので、兄弟の位置ではなく前後関係と label の外かを見る。
  const description = document.getElementById(
    input.getAttribute("aria-describedby") ?? "",
  );
  expect(description?.textContent).toBe(message);
  expect(
    input.compareDocumentPosition(description as Node) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(description?.closest("label")).toBeNull();
  expect(screen.getAllByText(message)).toHaveLength(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("title の型の誤り（#/title）と未知の項目（#）の 2 件は、title の入力の下に 1 件、未知の項目は alert に出す", async () => {
  // given
  const failure = new ApiError({
    status: 400,
    type: "/problems/validation-error",
    key: "request.field.notString",
    params: { path: "title" },
    errors: [
      {
        pointer: "#/title",
        key: "request.field.notString",
        params: { path: "title" },
      },
      {
        pointer: "#",
        key: "request.body.unknownKeys",
        params: { keys: "extra" },
      },
    ],
  });

  // when
  await saveTitleWithFailure(failure);

  // then
  expect(
    await screen.findByRole("textbox", {
      name: tJa(todoDetailScreenMessages, "titleLabel"),
      description: tJa(commonMessages, "request.field.notString", {
        path: "title",
      }),
    }),
  ).toBeDefined();
  expect(screen.getByRole("alert").textContent).toBe(
    tJa(commonMessages, "request.body.unknownKeys", { keys: "extra" }),
  );
});
