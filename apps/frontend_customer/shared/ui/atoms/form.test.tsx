import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { activeTheme } from "@/shared/ui/active-theme";
import { DesignSystem } from "@/test-support/design-system";
import { Form } from "./form";

// Vitest は globals を無効にしているため、Testing Library の自動 cleanup が働かない。前のテストの DOM を明示的に消す。
afterEach(cleanup);

// 操作は user-event で行う（WHY は features/todo/screens/todo-screen/todo-screen.test.tsx の冒頭）。
// submit のイベントを document で受け、既定の動作が止められたか（defaultPrevented）を見る。
// WHY document で受ける: React はハンドラを描いた根の要素で受ける（イベントの委譲）ので、document に届いた時点で
//   Form の onSubmit（preventDefault）は動き終わっている。
test("送信すると、ページの遷移（既定の動作）を止めて onSubmit を引数なしで呼ぶ", async () => {
  // given
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(
    <Form onSubmit={onSubmit}>
      <button type="submit">送信</button>
    </Form>,
    { wrapper: DesignSystem },
  );
  const submitted: Event[] = [];
  document.addEventListener("submit", (event) => submitted.push(event), {
    once: true,
  });

  // when
  await user.click(screen.getByRole("button", { name: "送信" }));

  // then
  expect(submitted.map((event) => event.defaultPrevented)).toEqual([true]);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith();
});

test("フォームを面として描き、テーマが Paper に決めた見た目のクラスが付く", () => {
  // given: 前提なし（テーマは DesignSystem の既定 activeTheme）
  // when
  render(
    <Form onSubmit={vi.fn()}>
      <span>中身</span>
    </Form>,
    { wrapper: DesignSystem },
  );

  // then
  const form = screen.getByText("中身").parentElement;
  expect(form?.tagName).toBe("FORM");
  expect(form?.classList).toContain(
    activeTheme.theme.components.Paper.classNames.root,
  );
});
