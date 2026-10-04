import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useFeatureFlag } from "@/features/feature-flag";
import { TodoScreen } from "@/features/todo";
import { ApiError } from "@/features/todo/api/api-error";
import { TodoApi } from "@/features/todo/api/todo-api";
import { commonMessages } from "@/shared/i18n/common.messages";
import { EnLocale, JaLocale, tJa } from "@/test-support/i18n";
import { todoScreenMessages } from "./todo-screen.messages";

// 画面の表示・操作・異常系の仕様は、実 DB まで通す画面仕様（todo-screen.feature と todo-screen.screen-spec.test.tsx）が持つ。
// ここには画面仕様で起こせないもの・業務でない見た目の仕組みだけを残す: 決まった文言（見出し・ボタン）と en の表示、フィーチャーフラグの
//   off、作成の API が返さない失敗（400 の errors の組み合わせ・404）、項目の誤りの DOM の位置（label の外・入力の後ろ）。API は差し替える。
// 再取得などの細かいロジックは todo-screen.hook.test.ts で固定している。
vi.mock("@/features/todo/api/todo-api");
// フィーチャーフラグ（Issue #156）は feature-flag feature の公開 API（index）で差し替える（WHY は todo-screen.hook.test.ts の同じ箇所）。
vi.mock("@/features/feature-flag");

// 操作は user-event（userEvent.setup()）で行う（Issue #449）。
// WHY fireEvent にしない: fireEvent はイベントを 1 つ送るだけで、実際の操作（クリックの前の pointer・focus、1 文字ずつの入力）を
//   再現しない。user-event は利用者の操作の順にイベントを送るので、画面が実際の操作で動くことを見られる（Testing Library の推奨）。
// globals 無効のため Testing Library の自動 cleanup が働かない。テストごとに DOM を片付ける。
afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  // 本番の一覧と同じく詳細画面のフラグは on を前提にする（off は「詳細画面のフラグが off なら」のテスト）。
  vi.mocked(useFeatureFlag).mockReturnValue(true);
});

const milk = {
  id: "todo-1",
  title: "牛乳を買う",
  completed: false,
  createdAt: "2026-09-28T00:00:00.000Z",
};

test("level 1 の見出しに Todo が表示される", async () => {
  // given
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [] });

  // when
  render(<TodoScreen />, { wrapper: JaLocale });

  // then
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: tJa(todoScreenMessages, "title"),
    }),
  ).toBeDefined();
  // 初回の取得が終わるのを待ってからテストを終える（終了後の state 更新を残さないため）。
  expect(await screen.findByRole("list")).toBeDefined();
});

test("エラーが無いときは alert を表示しない", async () => {
  // given
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [milk] });

  // when
  render(<TodoScreen />, { wrapper: JaLocale });

  // then
  expect(await screen.findByRole("link", { name: "牛乳を買う" })).toBeDefined();
  expect(screen.queryByRole("alert")).toBeNull();
});

// 画面の文言が LocaleProvider のロケールに従うこと（ja と en で違う文言のキーで見る）。
test("LocaleProvider のロケールが en なら、英語の文言で表示する", async () => {
  // given
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [] });

  // when
  render(<TodoScreen />, { wrapper: EnLocale });

  // then
  expect(screen.getByText("Loading…")).toBeDefined();
  expect(await screen.findByRole("list")).toBeDefined();
  expect(screen.getByRole("textbox", { name: "New todo" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
});

test("詳細画面のフラグが off なら、一覧の行の title はリンクにせず文字だけで表示する", async () => {
  // given
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [milk] });
  vi.mocked(useFeatureFlag).mockReturnValue(false);

  // when
  render(<TodoScreen />, { wrapper: JaLocale });

  // then
  expect(await screen.findByText("牛乳を買う")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});

// aria-label は title を含む（行の数だけ並ぶ削除ボタンを区別する）が、見えるのは「削除」だけ。
test("一覧の行の削除ボタンには、辞書の削除の文言が見える文字として出る", async () => {
  // given
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [milk] });

  // when
  render(<TodoScreen />, { wrapper: JaLocale });

  // then
  expect(
    (
      await screen.findByRole("button", {
        name: tJa(todoScreenMessages, "deleteAria", { title: "牛乳を買う" }),
      })
    ).textContent,
  ).toBe(tJa(todoScreenMessages, "delete"));
});

test("LocaleProvider のロケールが en なら、一覧の行も英語の文言と書式で表示する", async () => {
  // given
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [milk] });

  // when
  render(<TodoScreen />, { wrapper: EnLocale });

  // then
  expect(
    await screen.findByRole("checkbox", {
      name: "Mark “牛乳を買う” as completed",
    }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Delete “牛乳を買う”" }).textContent,
  ).toBe("Delete");
  expect(screen.getByText("Sep 28, 2026, 12:00 AM")).toBeDefined();
});

// 400 の項目ごとの誤り（ApiError の errors）は、その入力の直下に出し、aria-describedby と aria-invalid で入力と結び付ける。
// WHY role="alert" はフォーム全体の文言だけ: 項目の文言は入力の説明（accessible description）として読まれる。
async function submitTitleWithFailure(reason: unknown) {
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [] });
  vi.mocked(TodoApi.create).mockRejectedValue(reason);
  const user = userEvent.setup();
  render(<TodoScreen />, { wrapper: JaLocale });
  await screen.findByRole("list");
  await user.type(
    screen.getByRole("textbox", {
      name: tJa(todoScreenMessages, "form.newTitle"),
    }),
    "牛乳を買う",
  );
  await user.click(
    screen.getByRole("button", {
      name: tJa(todoScreenMessages, "form.submit"),
    }),
  );
}

test("エラーが無いときは、title の入力は invalid でなく、説明も無い", async () => {
  // given
  vi.mocked(TodoApi.list).mockResolvedValue({ todos: [] });

  // when
  render(<TodoScreen />, { wrapper: JaLocale });
  await screen.findByRole("list");

  // then
  const input = screen.getByRole("textbox", {
    name: tJa(todoScreenMessages, "form.newTitle"),
    description: "",
  });
  // aria-invalid は付けない（Mantine の TextInput は誤りが無いと属性を出さない。Issue #292 で "false" から変わった）。
  expect(input.getAttribute("aria-invalid")).toBeNull();
  expect(input.getAttribute("aria-describedby")).toBeNull();
  // 項目のエラーの文言も描画しない（フォームの文字はラベルとボタンだけ）。WHY: aria-invalid / aria-describedby だけを
  //   見ると、エラーが無いのに文言の要素を描画しても通ってしまう（Issue #202 で、描画の条件を常に偽にする変異が生き残った）。
  //   限界: 文字の無い要素を描いても通る（Mantine は error に空でない値が入ると aria-invalid="true" も付けるので、上の検証で落ちる）。
  expect(input.closest("form")?.textContent).toBe(
    tJa(todoScreenMessages, "form.newTitle") +
      tJa(todoScreenMessages, "form.submit"),
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
  await submitTitleWithFailure(failure);

  // then
  const input = await screen.findByRole("textbox", {
    name: tJa(todoScreenMessages, "form.newTitle"),
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
  await submitTitleWithFailure(failure);

  // then
  expect(
    await screen.findByRole("textbox", {
      name: tJa(todoScreenMessages, "form.newTitle"),
      description: tJa(commonMessages, "request.field.notString", {
        path: "title",
      }),
    }),
  ).toBeDefined();
  expect(screen.getByRole("alert").textContent).toBe(
    tJa(commonMessages, "request.body.unknownKeys", { keys: "extra" }),
  );
});

test("errors の無い 404 は、alert に全体の文言だけを出し、title の入力は invalid にしない", async () => {
  // given
  const failure = new ApiError({
    status: 404,
    type: "/problems/not-found",
    key: "todo.notFound",
    params: { id: "todo-1" },
  });

  // when
  await submitTitleWithFailure(failure);

  // then
  expect((await screen.findByRole("alert")).textContent).toBe(
    tJa(commonMessages, "todo.notFound", { id: "todo-1" }),
  );
  const input = screen.getByRole("textbox", {
    name: tJa(todoScreenMessages, "form.newTitle"),
    description: "",
  });
  expect(input.getAttribute("aria-invalid")).toBeNull();
});
