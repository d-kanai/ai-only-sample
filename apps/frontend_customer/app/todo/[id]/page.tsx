import { TodoDetailScreen } from "@/features/todo";

// props の型は Next 16 のグローバル型 PageProps<"/todo/[id]"> ではなく明示的に書く。
// PageProps は next build / next dev が .next/types に生成する型で、ビルド前（clone 直後の tsc やエディタ、Vitest）には存在せず型エラーになるため（app/layout.tsx と同じ理由）。
// Next 16 では動的セグメントの params は Promise なので、await して id を取り出してから screen に todoId として渡す。
// key={id}（Issue #449）: id が変わったら（/todo/1 → /todo/2）、画面を作り直す（React は key の違う要素を別のものとして mount し直す）。
//   WHY: App Router は同じページの間の遷移で画面を作り直さず props だけを変えうる。作り直さないと、編集中の title の入力
//   （react-hook-form）と表示中のエラー（hook の state）に前の Todo のものが残る。取得の結果は TanStack Query が todoId ごとの
//   キャッシュで分けるので、作り直しが要るのは画面の中の state だけ。以前は hook の中の世代（todoGenerationRef）・ignore で
//   1 つずつ戻していたが、key なら漏れなく初期値から始まる（https://react.dev/learn/preserving-and-resetting-state）。
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TodoDetailScreen key={id} todoId={id} />;
}
