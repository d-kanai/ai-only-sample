import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import {
  ApiErrorMessage,
  type ErrorMessages,
} from "@/features/todo/api/api-error-message";
import { type Todo, TodoApi } from "@/features/todo/api/todo-api";
import { TodoQueries } from "@/features/todo/api/todo-queries";
import { useLocale } from "@/shared/i18n/i18n";
import { z } from "@/shared/validation/zod";

// 失敗の理由（reject された値）を包んで持つ。null（失敗なし）と、reject された値そのものが null / undefined の場合を区別するため。
// WHY 文言ではなく理由を持ち、描画のときに翻訳する（ApiErrorMessage.toMessages）: ロケールが変わっても表示中のエラーがそのロケールで出る。
type Failure = { reason: unknown };

// 更新（名前の変更・完了の切り替え）で送る API の呼び出し。どちらも更新後の Todo を返す契約。
type TodoUpdate = () => Promise<Todo>;

// WHY 詳細画面の hook を useTodoUpdates・useTitleForm に分ける（Issue #384）: 1 関数 50 行以内
//   （Biome の complexity/noExcessiveLinesPerFunction）に収めるため。画面のディレクトリには hook のファイルを 1 つしか置けない
//   （rule-tests/screen-outline.test.ts の screen-outline-placement）ので、同じファイルの中で分け、export するのは useTodoDetailScreen だけにする。
// WHY useCallback / useMemo を書かない（Issue #449）: React Compiler（next.config.ts の reactCompiler）がビルドのときに自動でメモ化する。
//
// todoId が変わったとき（/todo/1 → /todo/2）: app/todo/[id]/page.tsx が key={id} で画面ごと mount し直すので、編集中の title・
//   表示中のエラーは前の Todo のものが残らない。この hook の中で todoId の変化を扱うのは、取得と更新の結果の行き先
//   （TanStack Query のキャッシュのキー。todoId ごとに別）だけで、以前の自前の世代（todoGenerationRef）・ignore は要らない。

// 詳細画面の状態とイベント。見た目（todo-detail-screen.tsx）はこの戻り値を描くだけにする。
export function useTodoDetailScreen(todoId: string) {
  const locale = useLocale();
  const detail = useQuery(TodoQueries.detail(todoId));
  // 取得前・取得失敗（not_found など）を「Todo がない」として区別できるよう null を使う。
  const todo = detail.data ?? null;
  const updates = useTodoUpdates();
  const titleForm = useTitleForm(todo, todoId, updates.run);

  const toggleCompleted = async () => {
    // 取得前は反転する元の completed が無いので送らない。
    if (todo === null) return;
    // 完了の API（本文は completed だけ）を呼ぶので、編集中で未保存の title は保存されない。
    const completed = !todo.completed;
    await updates.run(() => TodoApi.changeCompletion(todoId, completed));
  };

  // 画面に出す失敗は 1 つ。更新の失敗を、取得の失敗より優先する（一覧画面の useTodoScreen と同じ。利用者がいま行った操作の結果のため）。
  const failure: Failure | null =
    updates.failure ?? (detail.isError ? { reason: detail.error } : null);
  // 失敗を、フォーム全体の文言（error。role="alert" で出す）と、入力の下に出す項目ごとの文言（fieldErrors）に分ける（Issue #144）。
  // WHY 項目は "title" だけ: この画面の title のフォームが描く入力は title だけ。ほかの項目の誤りは error に出る（api-error-message.ts の
  //   ApiErrorMessage.toMessages）。
  const errorMessages: ErrorMessages<"title"> =
    failure === null
      ? { form: null, fields: {} }
      : ApiErrorMessage.toMessages(failure.reason, locale, ["title"]);

  return {
    todo,
    title: titleForm.title,
    setTitle: titleForm.setTitle,
    // 取得が終わるまで（Todo がまだ無い間）だけ true。
    isLoading: detail.isPending,
    error: errorMessages.form,
    fieldErrors: errorMessages.fields,
    saveTitle: titleForm.submit,
    toggleCompleted,
  };
}

// 更新（名前の変更・完了の切り替え）を送り、応答の Todo を詳細のキャッシュに入れる。run は成功したら更新後の Todo、失敗したら null を返す。
// どちらの PUT も更新後の Todo を返す契約なので、GET で取り直さずレスポンスをそのまま反映する（一覧画面と違い 1 件だけのため）。
// WHY 1 つの useMutation・失敗は useState: 一覧画面の useTodoChanges と同じ（後の処理が同じで、出す失敗は最後に結果の出た操作の 1 つ。
//   useMutation の error は次の操作を送り始めると消え、文言がちらつく）。
function useTodoUpdates() {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<Failure | null>(null);
  const mutation = useMutation({
    mutationFn: (send: TodoUpdate) => send(),
    onSuccess: async (updated) => {
      setFailure(null);
      // WHY キーは応答の Todo の id から作る（hook の todoId を使わない）: 応答を待つ間に画面の todoId が変わっても、更新した Todo の
      //   キャッシュにだけ入り、別の Todo の表示を書き換えない。
      const { queryKey } = TodoQueries.detail(updated.id);
      // WHY 入れる前に送信中の GET を取り消す: 画面へのフォーカスなどで TanStack Query が詳細を取り直している途中だと、
      //   保存の前のサーバの状態の応答が後から届き、保存した内容が古い内容に戻って見える。
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, updated);
      // 一覧画面のキャッシュは変更前の内容なので無効にし、一覧に戻ったときに取り直させる（いま一覧が描かれていなければ取りには行かない）。
      await queryClient.invalidateQueries({
        queryKey: TodoQueries.list().queryKey,
      });
    },
    onError: (reason) => setFailure({ reason }),
  });
  const run = (send: TodoUpdate): Promise<Todo | null> =>
    // 失敗は onError で failure に入れたので、ここでは更新後の Todo か null だけを返す（呼び出し側が入力を残すかを決める）。
    mutation.mutateAsync(send).then(
      (updated) => updated,
      () => null,
    );
  return { failure, run };
}

// title の編集のフォーム（react-hook-form）。WHY react-hook-form と useController は一覧画面の useNewTodoForm と同じ。
function useTitleForm(
  todo: Todo | null,
  todoId: string,
  run: (send: TodoUpdate) => Promise<Todo | null>,
) {
  const form = useForm({
    defaultValues: { title: "" },
    // values … 取得した Todo の title を入力の値にする。react-hook-form は前の描画の values と中身が違うときだけ入力を置き換える
    //   （7.89.0 の useForm の values の effect。deepEqual で比べる）。
    //   WHY: 取得が終わったら（と、名前の変更の応答で title が変わったら）入力に入れ、完了の切り替えのように title が変わらない
    //   更新では編集中の入力を残す。取得前（todo が null）は渡さず、既定の "" のまま。
    values: todo === null ? undefined : { title: todo.title },
    // 前後の空白を除いてから 1 文字以上か確かめる（一覧画面の追加と同じ。空白だけなら送らず、何も表示しない）。
    // WHY スキーマを hook の中で作る: 一覧画面の useNewTodoForm と同じ（最上位の式は mutation testing で数えない）。
    resolver: zodResolver(z.object({ title: z.string().trim().min(1) })),
  });
  const { field } = useController({ control: form.control, name: "title" });

  const submit = form.handleSubmit(async ({ title }) => {
    const updated = await run(() => TodoApi.rename(todoId, title));
    // 成功したら入力を応答の title（空白を除いた保存済みの値）にする。保存済みと同じ title を保存したときは values が変わらず
    //   置き換わらないので、ここで入れる。失敗したときは入力を残し、直して再送できるようにする。
    if (updated !== null) form.reset({ title: updated.title });
  });

  return {
    // 保存前の編集中の値。todo.title（保存済みの値）とは別に持ち、見出しは保存済みの値を出す。
    title: field.value,
    // WHY 戻り値を捨てる: 一覧画面の useNewTodoForm の setTitle と同じ（field.onChange の Promise を返すと act が閉じない）。
    setTitle: (title: string): void => {
      void field.onChange(title);
    },
    submit,
  };
}
