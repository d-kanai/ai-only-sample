import { zodResolver } from "@hookform/resolvers/zod";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { useFeatureFlag } from "@/features/feature-flag";
import {
  ApiErrorMessage,
  type ErrorMessages,
} from "@/features/todo/api/api-error-message";
import { TodoApi } from "@/features/todo/api/todo-api";
import { TodoQueries } from "@/features/todo/api/todo-queries";
import { useLocale } from "@/shared/i18n/i18n";
import { z } from "@/shared/validation/zod";

// 失敗の理由（reject された値）を包んで持つ。null（失敗なし）と、reject された値そのものが null / undefined の場合を区別するため。
// WHY 文言ではなく理由を持ち、描画のときに翻訳する（ApiErrorMessage.toMessages）: ロケールが変わっても表示中のエラーがそのロケールで出る。
type Failure = { reason: unknown };

// 変更の操作（追加・完了の切り替え・削除）で送る API の呼び出し。
type TodoChange = () => Promise<unknown>;

// WHY 一覧画面の hook を useTodoChanges・useNewTodoForm に分ける（Issue #384）: 1 関数 50 行以内
//   （Biome の complexity/noExcessiveLinesPerFunction）に収めるため。画面のディレクトリには hook のファイルを 1 つしか置けない
//   （rule-tests/screen-outline.test.ts の screen-outline-placement）ので、同じファイルの中で分け、export するのは useTodoScreen だけにする。
// WHY useCallback / useMemo を書かない（Issue #449）: React Compiler（next.config.ts の reactCompiler）がビルドのときに自動でメモ化する。
//   手で書くと依存配列の書き間違い・等価な変異（Stryker の disable）を抱えることになる。

// 一覧画面の状態とイベント。見た目（todo-screen.tsx）はこの戻り値を描くだけにし、ロジックは renderHook で単体テストする。
// 取得・変更の状態（読み込み中・失敗・古い応答の破棄）は TanStack Query に任せる（shared/query/query-provider.tsx）。
export function useTodoScreen() {
  const locale = useLocale();
  // 一覧から詳細画面へのリンクを出すか（フィーチャーフラグ todo-detail-screen。Issue #156）。
  // WHY フラグで出し分ける: 詳細画面を出す・隠すを、コードを戻さずに backend の一覧（FEATURE_FLAGS）の切り替えだけで行えるようにする。
  //   フラグの読み方（準備ができるまでは off で描く）は features/feature-flag/hooks/use-feature-flag.hook.ts。
  const showsDetailLink = useFeatureFlag("todo-detail-screen");
  const list = useQuery(TodoQueries.list());
  const changes = useTodoChanges();
  const newTodo = useNewTodoForm(changes.run);

  // 画面に出す失敗は 1 つ。変更の操作の失敗を、一覧の取得の失敗より優先する。
  // WHY 変更を優先する: 利用者がいま行った操作の結果なので、前からある取得の失敗より新しい。変更が成功すると操作の失敗は消え、
  //   そのあと取り直した一覧の取得の成否（TanStack Query の error。取得に成功すると消える）が出る。
  const failure: Failure | null =
    changes.failure ?? (list.isError ? { reason: list.error } : null);
  // 失敗を、フォーム全体の文言（error。role="alert" で出す）と、入力の下に出す項目ごとの文言（fieldErrors）に分ける（Issue #144）。
  // WHY 項目は "title" だけ: この画面の追加のフォームが描く入力は title だけ。ほかの項目の誤りは error に出る（api-error-message.ts の
  //   ApiErrorMessage.toMessages）。
  const errorMessages: ErrorMessages<"title"> =
    failure === null
      ? { form: null, fields: {} }
      : ApiErrorMessage.toMessages(failure.reason, locale, ["title"]);

  return {
    // 取得前・初回の取得の失敗では一覧が無いので空にする（読み込み中かどうかは isLoading で分ける）。
    todos: list.data?.todos ?? [],
    // 初回の取得が終わるまで（一覧がまだ無い間）だけ true。取り直しの間は前の一覧を出したままにする。
    isLoading: list.isPending,
    showsDetailLink,
    error: errorMessages.form,
    fieldErrors: errorMessages.fields,
    newTitle: newTodo.title,
    setNewTitle: newTodo.setTitle,
    addTodo: newTodo.submit,
    toggleTodo: async (id: string, completed: boolean) => {
      await changes.run(() => TodoApi.changeCompletion(id, completed));
    },
    deleteTodo: async (id: string) => {
      await changes.run(() => TodoApi.delete(id));
    },
  };
}

// 変更の操作（追加・完了の切り替え・削除）を送り、成功したら一覧を取り直す。run は成功したら true を返す。
// WHY 3 つの操作で 1 つの useMutation を使う（送る呼び出しを変数で渡す）: 操作の後の処理（一覧の取り直し・失敗の扱い）は同じで、
//   画面に出す失敗も操作の種類によらず「最後に結果の出た操作」の 1 つだから。
// WHY 失敗を useState で持つ（useMutation の error を使わない）: useMutation は次の操作を送り始めた時点で前の error を消すので、
//   失敗が続くと文言が消えてまた出る（ちらつく）。表示中のエラーは次の操作の成功・失敗で置き換える
//   （.claude/rules/code/frontend.md の「項目ごとの誤り」）。
function useTodoChanges() {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<Failure | null>(null);
  const mutation = useMutation({
    mutationFn: (send: TodoChange) => send(),
    onSuccess: async () => {
      setFailure(null);
      await refreshList(queryClient);
    },
    onError: (reason) => setFailure({ reason }),
  });
  const run = (send: TodoChange): Promise<boolean> =>
    // 失敗は onError で failure に入れたので、ここでは成否だけを返す（呼び出し側が入力を残すかを決める）。
    mutation.mutateAsync(send).then(
      () => true,
      () => false,
    );
  return { failure, run };
}

// 変更の後に一覧を取り直す。
// 変更のレスポンスで手元の一覧を書き換えることもできるが、並び順や他の変更の反映まで画面側で再現することになる。
// サーバの一覧を正とし、画面側に一覧の組み立てロジックを持たせないため、毎回 GET で取り直す（以前と同じ方針）。
// WHY 取り直す前に送信中の GET を取り消す（cancelQueries）: TanStack Query は、データの無いクエリ（初回の取得中）に取り直しを
//   頼まれると、送信中の GET を使い回す（query-core 5.104.0 の Query.fetch。cancelRefetch はデータがあるときだけ効く）。
//   使い回すと、変更の前に送った GET（変更前の一覧）が表示される。取り消した GET の応答は後から届いても使われない。
async function refreshList(queryClient: QueryClient) {
  const { queryKey } = TodoQueries.list();
  await queryClient.cancelQueries({ queryKey });
  await queryClient.invalidateQueries({ queryKey });
}

// 追加のフォーム（react-hook-form）。title の入力と送信。
// WHY react-hook-form: 入力の値・送る前の検査・送った後の reset を自前の useState で書かず、検査はスキーマ（zod）で宣言する。
// WHY useController で繋ぐ: atom の TextInput は value / onChange の制御コンポーネント（shared/ui/atoms/text-input.tsx）で、
//   register（ref で DOM の値を読む非制御の形）では繋げない。atom の API（文字列で受け渡す）は変えない。
function useNewTodoForm(run: (send: TodoChange) => Promise<boolean>) {
  const form = useForm({
    defaultValues: { title: "" },
    // 前後の空白を除いてから 1 文字以上か確かめ、送る値も除いた後の値にする（zodResolver は変換後の値を onValid に渡す）。
    // 空白だけなら送らずに止め、何も表示しない（form.formState.errors は描かない）。サーバの 400（todo.title.empty）と
    //   二重に文言を持たないため。長さの上限などの業務ルールはサーバ（domain）に任せ、ここには書かない。
    // WHY スキーマを hook の中で作る（モジュールの最上位に置かない）: 最上位の式は mutation testing で数えない（stryker.config.mjs の
    //   ignoreStatic）。描画ごとに作り直さないのは React Compiler のメモ化に任せる。
    resolver: zodResolver(z.object({ title: z.string().trim().min(1) })),
  });
  const { field } = useController({ control: form.control, name: "title" });

  const submit = form.handleSubmit(async ({ title }) => {
    const succeeded = await run(() => TodoApi.create({ title }));
    // 失敗したときは入力を残し、直して再送できるようにする。成功したら（一覧の取り直しに失敗しても）空にする: 作成は済んでいるので、
    //   残すと同じ Todo をもう一度送りやすい。
    if (succeeded) form.reset();
  });

  return {
    title: field.value,
    // WHY 戻り値を捨てる（void にする）: field.onChange は react-hook-form 7.89.0 の中で register の onChange（async 関数）の
    //   Promise を返す。返すと act(() => setNewTitle(...)) が非同期の act になり、待たれないまま act の範囲が閉じずに残って、
    //   以後の描画がすべて止まった（2026-10-03 に実測）。入力の反映は同期で済んでいて、Promise を待つ必要は無い。
    setTitle: (title: string): void => {
      void field.onChange(title);
    },
    submit,
  };
}
