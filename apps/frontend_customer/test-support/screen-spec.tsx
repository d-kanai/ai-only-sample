import type { ReactNode } from "react";
import { FeatureFlagProvider } from "@/features/feature-flag";
import { JaLocale } from "./i18n";

// テスト専用（本番のコードからは使わない。test-support/ に置くのが目印。i18n.tsx と同じ）。
// 画面仕様（features/<f>/screens/<name>/<name>.screen-spec.test.tsx。.claude/rules/quality/testing.md の「画面仕様」）の render の
//   wrapper（render(<TodoScreen />, { wrapper: ScreenSpecProviders })）。
// WHY JaLocale に FeatureFlagProvider を足す: 本番の app/layout.tsx はフィーチャーフラグの Provider でも包み、画面はフラグで表示を
//   変える（一覧の title を詳細画面へのリンクにするか）。画面仕様はフラグも本物（backend の OFREP の API を route.ts 経由で呼ぶ）で
//   読むので、本番と同じく包む。画面・hook の単体テストは useFeatureFlag を vi.mock で差し替えるので、JaLocale のままでよい。
export function ScreenSpecProviders({ children }: { children: ReactNode }) {
  return (
    <JaLocale>
      <FeatureFlagProvider>{children}</FeatureFlagProvider>
    </JaLocale>
  );
}
