import { queryOptions } from "@tanstack/react-query";
import { TodoApi } from "./todo-api";

// Todo のクエリ（TanStack Query の queryKey と queryFn の組）。hook は useQuery(TodoQueries.list()) のように使い、
// 変更の後は invalidateQueries({ queryKey: TodoQueries.list().queryKey }) でキーを同じ所から取る（Issue #449）。
// WHY queryOptions で組にする: キーと取得の関数を別々に書くと、同じキーに別の関数（や別の型）を結び付けられる。queryOptions は
//   キーに data の型を載せるので、setQueryData(TodoQueries.detail(id).queryKey, todo) も型で確かめられる（TanStack Query の推奨）。
// WHY api/ に置く: 取得の経路「hook → api/ → /api/...」の api/ の側で、どの API をどのキーで覚えるかを 1 か所にする。
// WHY クラスの static メソッドにする: frontend の React 以外のモジュールの形（規則 class-based）。
export class TodoQueries {
  // 一覧（GET /api/todos の応答 { todos } をそのまま持つ）。
  static list() {
    return queryOptions({
      queryKey: [TodoQueries.root(), "list"] as const,
      queryFn: () => TodoApi.list(),
    });
  }

  // 1 件（GET /api/todos/:id）。id ごとに別のキャッシュになる。
  static detail(id: string) {
    return queryOptions({
      queryKey: [TodoQueries.root(), "detail", id] as const,
      queryFn: () => TodoApi.get(id),
    });
  }

  // キーの根。一覧と詳細のキーはこれで始まり、invalidateQueries({ queryKey: [根] }) で Todo のクエリをまとめて無効にできる。
  // WHY モジュールの最上位の定数にしない: 最上位の式は mutation testing で数えない（stryker.config.mjs の ignoreStatic）。
  //   呼び出し時に評価すれば、根の変異もテストで検出できる（todo-api.ts の todosPath と同じ。Issue #55）。
  private static root() {
    return "todos" as const;
  }
}
