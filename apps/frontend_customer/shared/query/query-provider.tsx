"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

// TanStack Query の QueryClient を配る Provider（Issue #449）。app/layout.tsx が LocaleProvider の中で全画面を包み、画面の hook は
//   useQuery / useMutation でサーバの状態（取得の結果・読み込み中・失敗）を扱う。テストでは test-support/i18n.tsx の JaLocale も包む。
// WHY データ取得に TanStack Query を使う: 以前は hook ごとに useEffect + 自前の連番（latestListRequestRef）・ignore・世代で、古い応答の
//   上書きや unmount 後の更新を防いでいた。重複の排除・古い応答の破棄・再取得・キャッシュはライブラリに任せ、hook には「何を取り、
//   変更の後に何を取り直すか」だけを書く（React の文書も Effect での取得よりキャッシュのライブラリを勧める。
//   https://react.dev/learn/synchronizing-with-effects）。決定は ADR（docs/adr/tech-stack/ の TanStack Query の ADR）。
// "use client": QueryClientProvider は context を使うので Client Component でしか動かない。app/layout.tsx（Server Component）は
//   この Provider を置くだけで、QueryClient（関数を持つオブジェクト）をサーバからクライアントへ渡さない。
// WHY useState(() => new QueryClient()) で作る: mount ごとに 1 回だけ作り、再描画では同じものを使う（作り直すとキャッシュが消える）。
//   モジュールの定数にしない: Client Component もサーバの描画（SSR）で動くので、モジュールの定数だとサーバではすべての要求で
//   キャッシュを共有してしまう（TanStack Query の文書 https://tanstack.com/query/latest/docs/framework/react/guides/ssr の
//   「NEVER DO THIS」と、その代わりの useState の形）。テストでも mount ごとに空のキャッシュから始まり、前のテストの取得結果が残らない。
//   限界: 同じ文書（advanced-ssr の「Initial setup」）は、Provider と suspend する部品の間に Suspense の境界が無いと最初の描画で
//   useState の値が捨てられると注意している。今は suspend する取得（useSuspenseQuery）を使わないので当たらない。使うときは見直す。
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // retry: false … 取得（useQuery）が失敗したら再試行せず、すぐ失敗の状態にする。
          //   WHY: TanStack Query の既定は 3 回まで間隔を空けて再試行し、その間は読み込み中のまま。以前の hook は 1 回の失敗で
          //   エラーを出していたので、その挙動を保つ（404 の Todo を何度も取り直さない・エラーをすぐ見せる）。
          //   変更（useMutation）は既定で再試行しないので書かない。ほかの既定（staleTime 0・画面へのフォーカスでの再取得など）は変えない。
          queries: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
