import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { QueryProvider } from "./query-provider";

// Vitest は globals を無効にしているため、Testing Library の自動 cleanup が働かない。前のテストの DOM を明示的に消す。
afterEach(cleanup);

describe("QueryProvider", () => {
  test("子要素をそのまま描く", () => {
    // given: 前提なし
    // when
    render(
      <QueryProvider>
        <p>child</p>
      </QueryProvider>,
    );

    // then
    expect(screen.getByText("child")).toBeDefined();
  });

  test("再描画しても同じ QueryClient を配る（キャッシュが描画のたびに消えない）", () => {
    // given
    const { result, rerender } = renderHook(() => useQueryClient(), {
      wrapper: QueryProvider,
    });
    const first = result.current;

    // when
    rerender();

    // then
    expect(result.current).toBe(first);
  });

  // WHY mount ごとに作る（モジュールの定数にしない）: テストごとに mount し直せばキャッシュが空から始まり、前のテストの取得結果が残らない。
  //   本番でも、ブラウザのタブ（の mount）ごとに 1 つになる。
  test("mount し直すと、別の QueryClient を配る", () => {
    // given
    const clients: QueryClient[] = [];
    const first = renderHook(() => useQueryClient(), {
      wrapper: QueryProvider,
    });
    clients.push(first.result.current);
    first.unmount();

    // when
    const second = renderHook(() => useQueryClient(), {
      wrapper: QueryProvider,
    });
    clients.push(second.result.current);

    // then
    expect(clients[1]).not.toBe(clients[0]);
  });

  // WHY 再試行しない: 取得の失敗をすぐ画面のエラーにする（TanStack Query の既定は 3 回まで間隔を空けて再試行し、その間は読み込み中のまま）。
  test("取得に失敗しても再試行せず、1 回でエラーになる", async () => {
    // given
    const queryFn = vi.fn(() =>
      Promise.reject(new Error("取得に失敗しました")),
    );

    // when
    const { result } = renderHook(
      () => useQuery({ queryKey: ["failing"], queryFn }),
      { wrapper: QueryProvider },
    );

    // then
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
