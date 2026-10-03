import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "./zod";

afterEach(() => {
  vi.restoreAllMocks();
});

// 画面の CSP（script-src に 'unsafe-eval' が無い。shared/security/security-headers.ts）の下で、zod が eval を試さないこと。
// WHY: zod 4 は z.object を作るときに new Function("") で eval が使えるかを試す（zod 4.6.5 の v4/core/util.js の allowsEval）。
//   例外は握りつぶされるが、ブラウザは CSP の違反（script-src eval）として報告し、E2E（apps/e2e/spec/security-headers.feature）が落ちる。
describe("画面で使う zod", () => {
  test("このモジュールから使う zod は jitless（eval を使わない）設定になっている", () => {
    // given: 前提なし（モジュールを読み込んだ時点で設定する）
    // when
    const config = z.config();

    // then
    expect(config.jitless).toBe(true);
  });

  test("オブジェクトのスキーマを作って検査しても、Function（eval と同じく文字列からコードを作る）を呼ばない", () => {
    // given
    const functionSpy = vi.spyOn(globalThis, "Function");

    // when
    const result = z
      .object({ title: z.string().trim().min(1) })
      .safeParse({ title: " 牛乳を買う " });

    // then
    expect(result).toEqual({ success: true, data: { title: "牛乳を買う" } });
    expect(functionSpy).not.toHaveBeenCalled();
  });
});
