import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TodoApi } from "@/features/todo/api/todo-api";
import { TodoQueries } from "@/features/todo/api/todo-queries";

// HTTP の詳細は todo-api.test.ts で固定済みなので差し替え、ここは「どのキーで・どの API を呼ぶか」だけを見る。
vi.mock("@/features/todo/api/todo-api");

beforeEach(() => {
  vi.resetAllMocks();
});

const milk = {
  id: "todo-1",
  title: "牛乳を買う",
  completed: false,
  createdAt: "2026-09-28T00:00:00.000Z",
};

// queryFn は TanStack Query の取得の経路（QueryClient の fetchQuery）で動かす。
// WHY queryFn を直接呼ばない: queryFn の引数（QueryFunctionContext）をテストで組み立てずに済み、本番の useQuery と同じ渡し方で呼ばれる。
// WHY テストごとに新しい QueryClient: キャッシュがテストをまたいで残ると、2 回目以降は queryFn が呼ばれない。

describe("TodoQueries.list", () => {
  test("キーは ['todos', 'list'] で、一覧の API（TodoApi.list）の応答をそのまま返す", async () => {
    // given
    vi.mocked(TodoApi.list).mockResolvedValue({ todos: [milk] });

    // when
    const options = TodoQueries.list();
    const data = await new QueryClient().fetchQuery(options);

    // then
    expect(options.queryKey).toEqual(["todos", "list"]);
    expect(data).toEqual({ todos: [milk] });
    expect(TodoApi.list).toHaveBeenCalledTimes(1);
  });
});

describe("TodoQueries.detail", () => {
  test("キーは ['todos', 'detail', id] で、その id の Todo を TodoApi.get で取る", async () => {
    // given
    vi.mocked(TodoApi.get).mockResolvedValue(milk);

    // when
    const options = TodoQueries.detail("todo-1");
    const data = await new QueryClient().fetchQuery(options);

    // then
    expect(options.queryKey).toEqual(["todos", "detail", "todo-1"]);
    expect(data).toEqual(milk);
    expect(TodoApi.get).toHaveBeenCalledWith("todo-1");
  });

  test("id ごとに別のキーになる（別の Todo のキャッシュを取り違えない）", () => {
    // given: 前提なし
    // when
    const first = TodoQueries.detail("todo-1").queryKey;
    const second = TodoQueries.detail("todo-2").queryKey;

    // then
    expect(first).not.toEqual(second);
  });
});

// WHY 根（'todos'）を共有する: invalidateQueries({ queryKey: ['todos'] }) のように、Todo のクエリをまとめて無効にできる。
//   キーの根を TodoQueries の 1 か所にし、一覧・詳細で書き分けて食い違うのを防ぐ。
describe("キーの根", () => {
  test("一覧と詳細のキーは、どちらも同じ根（'todos'）で始まる", () => {
    // given: 前提なし
    // when
    const listRoot = TodoQueries.list().queryKey[0];
    const detailRoot = TodoQueries.detail("todo-1").queryKey[0];

    // then
    expect(listRoot).toBe("todos");
    expect(detailRoot).toBe("todos");
  });
});
