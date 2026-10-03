import { useQueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/features/todo/api/api-error";
import { TodoApi } from "@/features/todo/api/todo-api";
import { TodoQueries } from "@/features/todo/api/todo-queries";
import { useTodoDetailScreen } from "@/features/todo/screens/todo-detail-screen/todo-detail-screen.hook";
import { commonMessages } from "@/shared/i18n/common.messages";
import { formatMessage } from "@/shared/i18n/i18n";
import { EnLocale, JaLocale, tJa } from "@/test-support/i18n";

// HTTP の詳細は todo-api.test.ts で検証済みなので差し替え、hook が API をいつ何で呼び、結果をどう状態に反映するかを見る。
//
// この hook が保証する範囲（todoId が変わるとき）:
// - 取得の結果（todo・isLoading・取得の失敗）は、TanStack Query のキャッシュのキー（TodoQueries.detail(todoId)）で todoId ごとに分かれる。
//   hook のまま todoId だけが変わっても前の Todo を出さず、前の Todo の遅れた応答も新しい Todo に混ざらない。ここで見る。
// - 更新の応答は、応答の Todo の id のキャッシュにだけ入る（別の Todo の表示を書き換えない）。ここで見る。
// - 編集中の title・更新の失敗（hook の state）は、todoId が変わったら画面ごと作り直す前提（app/todo/[id]/page.tsx の key={id}）で、
//   hook は todoId の変化を見ない。WHY: state を todoId ごとに戻す仕組み（以前の世代の ref・ignore）を hook に持たず、React の key に
//   任せる。そのため、todoId だけを変えたときの入力・更新の失敗の扱いはここでは見ない（page.tsx は単体テストの対象外）。
vi.mock("@/features/todo/api/todo-api");

// globals 無効のため Testing Library の自動 cleanup が働かない。renderHook のコンポーネントもテストごとに unmount する。
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
const bread = { ...milk, id: "todo-2", title: "パンを買う" };

// テストから任意のタイミングで resolve できる Promise。即時 resolve のモックでは「古い応答が後から届く」順序を再現できないため使う。
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Promise の初期化前に resolve が呼ばれた");
  };
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// act の中で操作を行い、TanStack Query の知らせまで描画に反映してから返す。
// WHY: 操作の Promise が終わった時点では、TanStack Query の hook への知らせ（テストでは microtask。test-support/i18n.tsx の
//   notifyManager.setScheduler）がまだ届いていないことがあり、act だけでは前の値のまま見える。setTimeout(0) を 1 回待つと、
//   その前に積まれた microtask（知らせを含む）がすべて動く。値が変わらないこと（古い応答で上書きしない）を見るときも、
//   知らせを待ってから見ないと、上書きされる前の値を見て通ってしまう。
async function actAndFlush(operation: () => unknown) {
  await act(async () => {
    await operation();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

// hook と同じ QueryClient を、テストからキャッシュを読む・取り直させるために一緒に返す。
async function renderLoadedWithClient(todoId = "todo-1") {
  const view = renderHook(
    () => ({
      screen: useTodoDetailScreen(todoId),
      queryClient: useQueryClient(),
    }),
    { wrapper: JaLocale },
  );
  await waitFor(() => expect(view.result.current.screen.isLoading).toBe(false));
  return view;
}

// todo-1 → todo-2 の遷移を再現するため、todoId を props で変えられる形で描画する。
function renderWithTodoId(todoId: string) {
  return renderHook(
    (props: { todoId: string }) => useTodoDetailScreen(props.todoId),
    {
      initialProps: { todoId },
      wrapper: JaLocale,
    },
  );
}

async function renderLoaded(todoId = "todo-1") {
  const view = renderHook(() => useTodoDetailScreen(todoId), {
    wrapper: JaLocale,
  });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

describe("初回の読み込み", () => {
  // 最初の描画（effect が動く前）の値も見るため、描画のたびに戻り値を記録する。
  // WHY: 最初の描画で isLoading が false だと、取得前の一瞬だけ「読み込み中」ではない画面（Todo の無い画面）が出る。
  test("最初の描画から読み込み中で、編集中の title は空", async () => {
    // given
    const todoResponse = deferred<typeof milk>();
    vi.mocked(TodoApi.get).mockReturnValue(todoResponse.promise);
    const renders: { isLoading: boolean; title: string }[] = [];

    // when
    renderHook(
      () => {
        const state = useTodoDetailScreen("todo-1");
        renders.push({ isLoading: state.isLoading, title: state.title });
        return state;
      },
      { wrapper: JaLocale },
    );

    // then
    expect(renders[0]).toEqual({ isLoading: true, title: "" });
    expect(renders.at(-1)).toEqual({ isLoading: true, title: "" });
    await actAndFlush(async () => todoResponse.resolve(milk));
  });

  test("id の Todo を取得し、todo と編集中の title に入れる", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);

    // when
    const { result } = renderHook(() => useTodoDetailScreen("todo-1"), {
      wrapper: JaLocale,
    });

    // then
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(TodoApi.get).toHaveBeenCalledWith("todo-1");
    expect(result.current.todo).toEqual(milk);
    expect(result.current.title).toBe("牛乳を買う");
    expect(result.current.error).toBeNull();
  });

  test("取得に失敗すると（not_found など）、todo は null のまま、ApiError のキーと params を翻訳した文言が error に入る", async () => {
    // given
    vi.mocked(TodoApi.get).mockRejectedValue(
      new ApiError({
        status: 404,
        type: "/problems/not-found",
        key: "todo.notFound",
        params: { id: "missing" },
      }),
    );

    // when
    const { result } = await renderLoaded("missing");

    // then
    expect(result.current.todo).toBeNull();
    expect(result.current.error).toBe(
      tJa(commonMessages, "todo.notFound", { id: "missing" }),
    );
  });

  // WHY 翻訳は描画のときに LocaleProvider のロケールで行う（hook はキーと params を持つ失敗を保持する）。
  test("LocaleProvider のロケールが en なら、error は英語の文言になる", async () => {
    // given
    vi.mocked(TodoApi.get).mockRejectedValue(
      new ApiError({
        status: 404,
        type: "/problems/not-found",
        key: "todo.notFound",
        params: { id: "missing" },
      }),
    );

    // when
    const { result } = renderHook(() => useTodoDetailScreen("missing"), {
      wrapper: EnLocale,
    });

    // then
    await waitFor(() =>
      expect(result.current.error).toBe(
        formatMessage(commonMessages, "en", "todo.notFound", { id: "missing" }),
      ),
    );
  });

  // fetch そのものの失敗（ネットワークの切断で TypeError）など、API の応答ではない失敗。
  test.each([
    ["ApiError でない Error", new TypeError("Failed to fetch")],
    ["Error でない値", "network down"],
  ])(
    "%s で取得に失敗すると、固定の文言（error.unexpected）が error に入る",
    async (_label, reason) => {
      // given
      vi.mocked(TodoApi.get).mockRejectedValue(reason);

      // when
      const { result } = await renderLoaded();

      // then
      expect(result.current.todo).toBeNull();
      expect(result.current.error).toBe(
        tJa(commonMessages, "error.unexpected"),
      );
    },
  );

  test("todoId が変わると、新しい todoId の Todo を取得し直す", async () => {
    // given
    vi.mocked(TodoApi.get).mockImplementation(async (id) =>
      id === "todo-1" ? milk : bread,
    );
    const { result, rerender } = renderWithTodoId("todo-1");
    await waitFor(() => expect(result.current.todo).toEqual(milk));

    // when
    rerender({ todoId: "todo-2" });

    // then
    await waitFor(() => expect(result.current.todo).toEqual(bread));
  });

  test("todoId が変わると、新しい Todo の取得を待つ間は前の Todo とエラーを消して読み込み中にする", async () => {
    // given
    const breadResponse = deferred<typeof bread>();
    vi.mocked(TodoApi.get)
      .mockRejectedValueOnce(
        new ApiError({
          status: 404,
          type: "/problems/not-found",
          key: "todo.notFound",
          params: { id: "todo-1" },
        }),
      )
      .mockReturnValueOnce(breadResponse.promise);
    const { result, rerender } = renderWithTodoId("todo-1");
    await waitFor(() =>
      expect(result.current.error).toBe(
        tJa(commonMessages, "todo.notFound", { id: "todo-1" }),
      ),
    );

    // when
    rerender({ todoId: "todo-2" });

    // then
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);

    // when
    await actAndFlush(async () => breadResponse.resolve(bread));

    // then
    expect(result.current.todo).toEqual(bread);
  });

  test("todoId が変わると、新しい Todo が届くまで前の Todo を表示しない", async () => {
    // given
    const breadResponse = deferred<typeof bread>();
    vi.mocked(TodoApi.get)
      .mockResolvedValueOnce(milk)
      .mockReturnValueOnce(breadResponse.promise);
    const { result, rerender } = renderWithTodoId("todo-1");
    await waitFor(() => expect(result.current.todo).toEqual(milk));

    // when
    rerender({ todoId: "todo-2" });

    // then
    expect(result.current.todo).toBeNull();
    expect(result.current.isLoading).toBe(true);

    // when
    await actAndFlush(async () => breadResponse.resolve(bread));

    // then
    expect(result.current.todo).toEqual(bread);
  });

  test("todoId が変わった後に前の todoId の取得が終わっても、新しい Todo の取得が終わるまで読み込み中のまま", async () => {
    // given
    const milkResponse = deferred<typeof milk>();
    const breadResponse = deferred<typeof bread>();
    vi.mocked(TodoApi.get)
      .mockReturnValueOnce(milkResponse.promise)
      .mockReturnValueOnce(breadResponse.promise);
    const { result, rerender } = renderWithTodoId("todo-1");

    // when
    rerender({ todoId: "todo-2" });
    await actAndFlush(async () => milkResponse.resolve(milk));

    // then
    expect(result.current.isLoading).toBe(true);
    expect(result.current.todo).toBeNull();

    // when
    await actAndFlush(async () => breadResponse.resolve(bread));

    // then
    expect(result.current.isLoading).toBe(false);
  });

  test("todoId が変わった後に前の todoId の取得結果が届いても、新しい Todo の表示を上書きしない", async () => {
    // given
    const milkResponse = deferred<typeof milk>();
    vi.mocked(TodoApi.get).mockImplementation((id) =>
      id === "todo-1" ? milkResponse.promise : Promise.resolve(bread),
    );
    const { result, rerender } = renderWithTodoId("todo-1");

    // when
    rerender({ todoId: "todo-2" });
    await waitFor(() => expect(result.current.todo).toEqual(bread));
    await actAndFlush(async () => milkResponse.resolve(milk));

    // then
    expect(result.current.todo).toEqual(bread);
    expect(result.current.title).toBe("パンを買う");
  });

  test("todoId が変わった後に前の todoId の取得が失敗しても、新しい Todo の画面にエラーを出さない", async () => {
    // given
    const milkResponse = deferred<void>();
    vi.mocked(TodoApi.get).mockImplementation((id) =>
      id === "todo-1"
        ? milkResponse.promise.then(() => {
            throw new Error("Todo が見つかりません");
          })
        : Promise.resolve(bread),
    );
    const { result, rerender } = renderWithTodoId("todo-1");

    // when
    rerender({ todoId: "todo-2" });
    await waitFor(() => expect(result.current.todo).toEqual(bread));
    await actAndFlush(async () => milkResponse.resolve());

    // then
    expect(result.current.todo).toEqual(bread);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

// WHY 編集中の title とエラーは見ない: ファイルの冒頭の「この hook が保証する範囲」のとおり、画面ごとの作り直し（page.tsx の key）が前提。
describe("todoId が変わった後に届いた前の Todo の更新結果", () => {
  test("title の保存の結果で、新しい Todo の表示を上書きしない", async () => {
    // given
    const putResponse = deferred<typeof milk>();
    vi.mocked(TodoApi.get).mockImplementation(async (id) =>
      id === "todo-1" ? milk : bread,
    );
    vi.mocked(TodoApi.rename).mockReturnValue(putResponse.promise);
    const { result, rerender } = renderWithTodoId("todo-1");
    await waitFor(() => expect(result.current.todo).toEqual(milk));

    // when
    act(() => result.current.setTitle("豆乳を買う"));
    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = result.current.saveTitle();
    });
    rerender({ todoId: "todo-2" });
    await waitFor(() => expect(result.current.todo).toEqual(bread));
    await actAndFlush(async () => {
      putResponse.resolve({ ...milk, title: "豆乳を買う" });
      await saving;
    });

    // then
    expect(result.current.todo).toEqual(bread);
  });

  test("完了の切り替えの結果で、新しい Todo の表示を上書きしない", async () => {
    // given
    const putResponse = deferred<typeof milk>();
    vi.mocked(TodoApi.get).mockImplementation(async (id) =>
      id === "todo-1" ? milk : bread,
    );
    vi.mocked(TodoApi.changeCompletion).mockReturnValue(putResponse.promise);
    const { result, rerender } = renderWithTodoId("todo-1");
    await waitFor(() => expect(result.current.todo).toEqual(milk));

    // when
    let toggling: Promise<void> = Promise.resolve();
    act(() => {
      toggling = result.current.toggleCompleted();
    });
    rerender({ todoId: "todo-2" });
    await waitFor(() => expect(result.current.todo).toEqual(bread));
    await actAndFlush(async () => {
      putResponse.resolve({ ...milk, completed: true });
      await toggling;
    });

    // then
    expect(result.current.todo).toEqual(bread);
  });
});

describe("todoId が変わった後の更新", () => {
  test("完了の切り替えは、新しい todoId の Todo に送る", async () => {
    // given
    vi.mocked(TodoApi.get).mockImplementation(async (id) =>
      id === "todo-1" ? milk : bread,
    );
    vi.mocked(TodoApi.changeCompletion).mockResolvedValue({
      ...bread,
      completed: true,
    });
    const { result, rerender } = renderWithTodoId("todo-1");
    await waitFor(() => expect(result.current.todo).toEqual(milk));
    rerender({ todoId: "todo-2" });
    await waitFor(() => expect(result.current.todo).toEqual(bread));

    // when
    await actAndFlush(() => result.current.toggleCompleted());

    // then
    expect(TodoApi.changeCompletion).toHaveBeenCalledWith("todo-2", true);
    expect(result.current.todo).toEqual({ ...bread, completed: true });
  });
});

describe("title の保存", () => {
  test("編集した title（前後の空白は除く）で更新し、更新後の Todo を反映する", async () => {
    // given
    const renamed = { ...milk, title: "豆乳を買う" };
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.rename).mockResolvedValue(renamed);
    const { result } = await renderLoaded();

    // when
    act(() => result.current.setTitle("  豆乳を買う  "));
    await actAndFlush(() => result.current.saveTitle());

    // then
    expect(TodoApi.rename).toHaveBeenCalledWith("todo-1", "豆乳を買う");
    expect(TodoApi.changeCompletion).not.toHaveBeenCalled();
    expect(result.current.todo).toEqual(renamed);
    expect(result.current.title).toBe("豆乳を買う");
  });

  // 保存済みと同じ title に前後の空白を付けて保存した場合。応答の Todo は変わらないが、入力は応答の title（空白を除いた値）にする。
  test("保存に成功すると、入力を応答の title にする（保存済みと同じ title でも）", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.rename).mockResolvedValue(milk);
    const { result } = await renderLoaded();

    // when
    act(() => result.current.setTitle("  牛乳を買う  "));
    await actAndFlush(() => result.current.saveTitle());

    // then
    expect(TodoApi.rename).toHaveBeenCalledWith("todo-1", "牛乳を買う");
    expect(result.current.title).toBe("牛乳を買う");
  });

  // WHY 一覧を無効にする: 一覧画面のキャッシュには変更前の title が残っている。無効にしておけば、一覧に戻ったときに取り直す。
  test.each<
    [string, (screen: ReturnType<typeof useTodoDetailScreen>) => Promise<void>]
  >([
    [
      "title の保存",
      async (screen) => {
        act(() => screen.setTitle("豆乳を買う"));
        await actAndFlush(() => screen.saveTitle());
      },
    ],
    ["完了の切り替え", (screen) => act(() => screen.toggleCompleted())],
  ])("%sに成功すると、一覧のキャッシュを無効にする", async (_label, update) => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.rename).mockResolvedValue({
      ...milk,
      title: "豆乳を買う",
    });
    vi.mocked(TodoApi.changeCompletion).mockResolvedValue({
      ...milk,
      completed: true,
    });
    const { result } = await renderLoadedWithClient();
    const listKey = TodoQueries.list().queryKey;
    act(() =>
      result.current.queryClient.setQueryData(listKey, { todos: [milk] }),
    );

    // when
    await update(result.current.screen);

    // then
    expect(
      result.current.queryClient.getQueryState(listKey)?.isInvalidated,
    ).toBe(true);
  });

  // 画面にフォーカスが戻ったときなど、TanStack Query が詳細を取り直している間に保存した場合。
  // WHY 利用者に見える振る舞いとして残す: 送信中の GET（保存の前のサーバの状態）が保存の後に届くと、保存した title が古い title に戻って見える。
  test("保存の前から取り直していた詳細の応答が後から届いても、保存後の Todo を上書きしない", async () => {
    // given
    const staleResponse = deferred<typeof milk>();
    const renamed = { ...milk, title: "豆乳を買う" };
    vi.mocked(TodoApi.get)
      .mockResolvedValueOnce(milk)
      .mockReturnValueOnce(staleResponse.promise);
    vi.mocked(TodoApi.rename).mockResolvedValue(renamed);
    const { result } = await renderLoadedWithClient();
    act(() => {
      void result.current.queryClient.invalidateQueries({
        queryKey: TodoQueries.detail("todo-1").queryKey,
      });
    });
    await waitFor(() => expect(TodoApi.get).toHaveBeenCalledTimes(2));

    // when
    act(() => result.current.screen.setTitle("豆乳を買う"));
    await actAndFlush(() => result.current.screen.saveTitle());
    await actAndFlush(async () => staleResponse.resolve(milk));

    // then
    expect(result.current.screen.todo).toEqual(renamed);
    expect(result.current.screen.title).toBe("豆乳を買う");
  });

  // 編集中（未保存）の入力は、保存するまで利用者のもの。サーバの title が変わっても（別の端末での変更など）黙って書き換えない。
  // WHY: 画面へのフォーカスで TanStack Query が詳細を取り直すと、入力中の文字が消える。見出し（保存済みの title）は新しい値になる。
  test.each<
    [
      string,
      (
        view: Awaited<ReturnType<typeof renderLoadedWithClient>>,
      ) => Promise<void>,
    ]
  >([
    [
      "画面へのフォーカスなどで詳細を取り直した",
      async (view) => {
        await actAndFlush(() =>
          view.result.current.queryClient.invalidateQueries({
            queryKey: TodoQueries.detail("todo-1").queryKey,
          }),
        );
      },
    ],
    [
      "完了の切り替えの応答が届いた",
      async (view) => {
        await actAndFlush(() => view.result.current.screen.toggleCompleted());
      },
    ],
  ])(
    "編集中に%sとき、別の title が届いても入力は上書きしない",
    async (_label, receive) => {
      // given
      const changedElsewhere = { ...milk, title: "別の端末で変えた" };
      vi.mocked(TodoApi.get)
        .mockResolvedValueOnce(milk)
        .mockResolvedValueOnce(changedElsewhere);
      vi.mocked(TodoApi.changeCompletion).mockResolvedValue({
        ...changedElsewhere,
        completed: true,
      });
      const view = await renderLoadedWithClient();
      act(() => view.result.current.screen.setTitle("編集中"));

      // when
      await receive(view);

      // then
      expect(view.result.current.screen.todo?.title).toBe("別の端末で変えた");
      expect(view.result.current.screen.title).toBe("編集中");
    },
  );

  test("空白だけの title は送らない", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    const { result } = await renderLoaded();

    // when
    act(() => result.current.setTitle("   "));
    await actAndFlush(() => result.current.saveTitle());

    // then
    expect(TodoApi.rename).not.toHaveBeenCalled();
  });

  test("更新に失敗すると error に message が入り、編集中の title は残る", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.rename).mockRejectedValue(
      new ApiError({
        status: 400,
        type: "/problems/validation-error",
        key: "todo.title.tooLong",
        params: { max: 100 },
      }),
    );
    const { result } = await renderLoaded();

    // when
    act(() => result.current.setTitle("豆乳を買う"));
    await actAndFlush(() => result.current.saveTitle());

    // then
    expect(result.current.error).toBe(
      tJa(commonMessages, "todo.title.tooLong", { max: 100 }),
    );
    expect(result.current.title).toBe("豆乳を買う");
    expect(result.current.todo).toEqual(milk);
  });
});

// 400 の項目ごとの誤り（ApiError の errors）。入力の下に出す文言（fieldErrors）と、フォーム全体の文言（error）に分ける
//   （分け方の細部は api-error.test.ts の ApiErrorMessage.toMessages で固定）。
describe("項目ごとのエラー", () => {
  async function saveWithFailure(reason: unknown) {
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.rename).mockRejectedValue(reason);
    const view = await renderLoaded();
    act(() => view.result.current.setTitle("豆乳を買う"));
    await actAndFlush(() => view.result.current.saveTitle());
    return view;
  }

  test("エラーが無いときは、fieldErrors は空", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);

    // when
    const { result } = await renderLoaded();

    // then
    expect(result.current.fieldErrors).toStrictEqual({});
  });

  // WHY 全体の文言を出さない: 本文の key は errors の最初の 1 件と同じで、両方を出すと同じ文言が 2 回出る。
  test("空タイトルの 400（#/title）は、title の項目の文言になり、フォーム全体の error は null", async () => {
    // given
    const failure = new ApiError({
      status: 400,
      type: "/problems/validation-error",
      key: "todo.title.empty",
      errors: [{ pointer: "#/title", key: "todo.title.empty" }],
    });

    // when
    const { result } = await saveWithFailure(failure);

    // then
    expect(result.current.fieldErrors).toStrictEqual({
      title: tJa(commonMessages, "todo.title.empty"),
    });
    expect(result.current.error).toBeNull();
    expect(result.current.title).toBe("豆乳を買う");
  });

  test("title の型の誤り（#/title）と未知の項目（#）の 2 件は、title の項目の文言とフォーム全体の文言に分ける", async () => {
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
    const { result } = await saveWithFailure(failure);

    // then
    expect(result.current.fieldErrors).toStrictEqual({
      title: tJa(commonMessages, "request.field.notString", { path: "title" }),
    });
    expect(result.current.error).toBe(
      tJa(commonMessages, "request.body.unknownKeys", { keys: "extra" }),
    );
  });

  test("errors の無い 404 は、フォーム全体の文言だけで、fieldErrors は空", async () => {
    // given
    const failure = new ApiError({
      status: 404,
      type: "/problems/not-found",
      key: "todo.notFound",
      params: { id: "todo-1" },
    });

    // when
    const { result } = await saveWithFailure(failure);

    // then
    expect(result.current.error).toBe(
      tJa(commonMessages, "todo.notFound", { id: "todo-1" }),
    );
    expect(result.current.fieldErrors).toStrictEqual({});
  });

  test("項目のエラーは、次の操作が成功すると消える", async () => {
    // given
    const { result } = await saveWithFailure(
      new ApiError({
        status: 400,
        type: "/problems/validation-error",
        key: "todo.title.empty",
        errors: [{ pointer: "#/title", key: "todo.title.empty" }],
      }),
    );
    vi.mocked(TodoApi.rename).mockResolvedValue({
      ...milk,
      title: "豆乳を買う",
    });

    // when
    await actAndFlush(() => result.current.saveTitle());

    // then
    expect(result.current.fieldErrors).toStrictEqual({});
    expect(result.current.error).toBeNull();
  });

  test("LocaleProvider のロケールが en なら、項目の文言は英語になる", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.rename).mockRejectedValue(
      new ApiError({
        status: 400,
        type: "/problems/validation-error",
        key: "todo.title.empty",
        errors: [{ pointer: "#/title", key: "todo.title.empty" }],
      }),
    );
    const { result } = renderHook(() => useTodoDetailScreen("todo-1"), {
      wrapper: EnLocale,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // when
    await actAndFlush(() => result.current.saveTitle());

    // then
    expect(result.current.fieldErrors).toStrictEqual({
      title: formatMessage(commonMessages, "en", "todo.title.empty"),
    });
  });
});

describe("完了の切り替え", () => {
  test("現在の completed を反転して更新し、更新後の Todo を反映する", async () => {
    // given
    const completedMilk = { ...milk, completed: true };
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.changeCompletion).mockResolvedValue(completedMilk);
    const { result } = await renderLoaded();

    // when
    await actAndFlush(() => result.current.toggleCompleted());

    // then
    expect(TodoApi.changeCompletion).toHaveBeenCalledWith("todo-1", true);
    expect(TodoApi.rename).not.toHaveBeenCalled();
    expect(result.current.todo).toEqual(completedMilk);
  });

  test("切り替えでは編集中（未保存）の title を上書きしない", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.changeCompletion).mockResolvedValue({
      ...milk,
      completed: true,
    });
    const { result } = await renderLoaded();

    // when
    act(() => result.current.setTitle("編集中"));
    await actAndFlush(() => result.current.toggleCompleted());

    // then
    expect(result.current.title).toBe("編集中");
  });

  test("前の操作のエラーは、次の操作が成功すると消える", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);
    vi.mocked(TodoApi.changeCompletion)
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          type: "/problems/internal-error",
          key: "server.internalError",
        }),
      )
      .mockResolvedValueOnce({ ...milk, completed: true });
    const { result } = await renderLoaded();

    // when
    await actAndFlush(() => result.current.toggleCompleted());

    // then
    expect(result.current.error).toBe(
      tJa(commonMessages, "server.internalError"),
    );

    // when
    await actAndFlush(() => result.current.toggleCompleted());

    // then
    expect(result.current.error).toBeNull();
  });

  test("Todo の取得が終わる前に切り替えても、反転元の completed が無いので更新を送らない", async () => {
    // given
    const todoResponse = deferred<typeof milk>();
    vi.mocked(TodoApi.get).mockReturnValue(todoResponse.promise);
    const { result } = renderHook(() => useTodoDetailScreen("todo-1"), {
      wrapper: JaLocale,
    });

    // when
    await actAndFlush(() => result.current.toggleCompleted());

    // then
    expect(TodoApi.changeCompletion).not.toHaveBeenCalled();
    expect(result.current.todo).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });
});
