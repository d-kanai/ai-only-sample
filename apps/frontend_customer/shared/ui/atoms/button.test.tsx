import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { activeTheme } from "@/shared/ui/active-theme";
import { DesignSystem } from "@/test-support/design-system";
import { Button } from "./button";

// Vitest は globals を無効にしているため、Testing Library の自動 cleanup が働かない。前のテストの DOM を明示的に消す。
afterEach(cleanup);

test("子の文字を名前にしたボタンとして描き、type は button（フォームを送信しない）", () => {
  // given: 前提なし
  // when
  render(<Button>追加</Button>, { wrapper: DesignSystem });

  // then
  expect(
    screen.getByRole("button", { name: "追加" }).getAttribute("type"),
  ).toBe("button");
});

test("aria-label を渡すと、見える文字は子のまま、名前は aria-label になる", () => {
  // given: 前提なし
  // when
  render(<Button aria-label="「牛乳を買う」を削除">削除</Button>, {
    wrapper: DesignSystem,
  });

  // then
  expect(
    screen.getByRole("button", { name: "「牛乳を買う」を削除" }).textContent,
  ).toBe("削除");
});

test("type に submit を渡すと、フォームの送信ボタンになる", () => {
  // given: 前提なし
  // when
  render(<Button type="submit">保存</Button>, { wrapper: DesignSystem });

  // then
  expect(
    screen.getByRole("button", { name: "保存" }).getAttribute("type"),
  ).toBe("submit");
});

// 操作は user-event で行う（WHY は features/todo/screens/todo-screen/todo-screen.test.tsx の冒頭）。
test("押すと onClick が引数なしで呼ばれる（画面はイベントを受け取らない）", async () => {
  // given
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(<Button onClick={onClick}>削除</Button>, { wrapper: DesignSystem });

  // when
  await user.click(screen.getByRole("button", { name: "削除" }));

  // then
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(onClick).toHaveBeenCalledWith();
});

test("テーマが Button に決めた見た目のクラスが付く", () => {
  // given: 前提なし（テーマは DesignSystem の既定 activeTheme）
  // when
  render(<Button>追加</Button>, { wrapper: DesignSystem });

  // then
  expect(screen.getByRole("button").classList).toContain(
    activeTheme.theme.components.Button.classNames.root,
  );
});
