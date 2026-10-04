// todo の画面仕様（spec/screen/todo/ の *.screen-spec.test.tsx）が共有する補助。.claude/rules/quality/testing.md の「画面仕様」。
// 保存先の行を読むクラスは名前を Saved で始め、ここに置く。WHY: 操作する step は、同じ step の中でこの補助の結果を expect する
//   （rule-tests/screen-spec.test.ts の screen-spec-operation-reads-saved）。画面に出ただけでは、キャッシュの書き換えだけで保存されて
//   いない誤りを見逃すため。規則は置き場所（./support）と名前（Saved…）でこの補助を見分ける。

// 行を読む接続（step の TestDatabase の pool を渡す）。
// WHY 型をここに書く: この補助はテストでない名前のソースで、TestDatabase（backend の test-support）を相対パスで import できない
//   （rule-tests/architecture.test.ts の frontend-to-backend-specifier）。frontend は pg にも依存しない。使うのは query だけ。
type RowQuery = {
  query(text: string): Promise<{ rows: unknown[] }>;
};

// 保存された Todo の行（タイトルと完了。一覧と同じ、作成日時の古い順）。
// WHY 2 列だけ読む: 画面仕様が操作で変わることを確かめるのはこの 2 つ。id・日時は前提で入れた値のままで、ほかの仕様（API 仕様）が見る。
// WHY 行の型を決めずに unknown のまま返す: step は toEqual で行を丸ごと比べるだけで、型で読み替えると列の取り違えを型が隠す。
export class SavedTodos {
  private constructor(private readonly pool: RowQuery) {}

  static of(pool: RowQuery): SavedTodos {
    return new SavedTodos(pool);
  }

  async read(): Promise<unknown[]> {
    const { rows } = await this.pool.query(
      "select title, completed from todos order by created_at, id",
    );
    return rows;
  }
}
