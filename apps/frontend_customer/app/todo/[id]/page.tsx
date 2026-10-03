import { TodoDetailScreen } from "@/features/todo";

// props の型は Next 16 のグローバル型 PageProps<"/todo/[id]"> ではなく明示的に書く。
// PageProps は next build / next dev が .next/types に生成する型で、ビルド前（clone 直後の tsc やエディタ、Vitest）には存在せず型エラーになるため（app/layout.tsx と同じ理由）。
// Next 16 では動的セグメントの params は Promise なので、await して id を取り出してから screen に todoId として渡す。
// key={id}（Issue #449）: id が変わったら（/todo/1 → /todo/2）、画面を作り直す（React は key の違う要素を別のものとして mount し直す）。
//   WHY 作り直す: 編集中の title の入力（react-hook-form）と表示中の更新の失敗（hook の state）は todoId ごとに戻す仕組みを hook に
//   持たない（取得の結果は TanStack Query が todoId ごとのキャッシュで分ける）。作り直せば漏れなく初期値から始まる
//   （https://react.dev/learn/preserving-and-resetting-state）。以前は hook の中の世代（todoGenerationRef）・ignore で 1 つずつ戻していた。
//   WHY Next に任せず明示する: next 16.3.6 も、区間ごとに createRouterCacheKey(区間) の key を付けて描く（動的区間は値を含むので
//   id が変われば作り直される。node_modules/next/dist/client/components/layout-router.js）。ただしそれは Next の内部の実装で、
//   文書で約束されたものではない。hook が作り直しを前提にしているので、前提をこのファイルに書いて保つ。
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TodoDetailScreen key={id} todoId={id} />;
}
