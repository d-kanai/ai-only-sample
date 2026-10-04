import { readdirSync } from "node:fs";
import { join, sep } from "node:path";

// テスト専用（本番のコードからは使わない。test-support/ に置くのが目印。rule-tests/test-support.test.ts が本番からの import を止め、
//   .dockerignore の **/test-support でイメージに入らない）。
// 画面仕様（spec/screen/<f>/<name>.screen-spec.test.tsx。.claude/rules/quality/testing.md の「画面仕様」）のために、
//   画面が送る fetch を、ネットワークではなく app/api の Route Handler（route.ts が re-export する backend の handler）の
//   直接の呼び出しに替える。
// WHY fetch を替える（TodoApi・FeatureFlagApi を差し替えない）: 画面 → hook → api/ → fetch → Route Handler → backend → Postgres の
//   つながりのうち、替えるのはネットワークだけにし、api/ の URL・メソッド・本文の組み立てと応答の読み方も本番のまま通す。
//   画面が fetch を呼ぶのは api/ の TodoApi と、フィーチャーフラグの OFREP の provider（@openfeature/ofrep-web-provider）の 2 か所で、
//   どちらもグローバルの fetch を呼ぶ。グローバルの fetch を替えれば、この 1 か所で両方に効く。
// WHY Route Handler の一覧を app/api の route.ts から作る（手で並べない）: route.ts を足したときに、ここを直さずに画面仕様から呼べる。
//   URL の形はディレクトリの名前で決まる（Next の App Router の規約）。

// Route Handler の第 2 引数。動的セグメント（[id]）の値を Promise で渡す（Next 16 の Route Handler の規約。
//   apps/backend/features/todo/internal/presentation/get-todo.api.ts の Context と同じ形）。
type RouteContext = { params: Promise<Record<string, string>> };
type RouteHandler = (
  request: Request,
  context: RouteContext,
) => Promise<Response>;
// route.ts のモジュール（HTTP メソッドの名前 → handler）。
export type RouteModule = Partial<Record<string, RouteHandler>>;
// route.ts のファイルのパスからモジュールを読む。
type RouteLoader = (file: string) => Promise<RouteModule>;

// route.ts 1 つ。pattern は URL のパスの全体に一致する正規表現で、動的セグメントの値を順に名前（names）の位置で取り出す。
type Route = { file: string; pattern: RegExp; names: readonly string[] };

// 動的セグメント（[id]）の区間 1 つ。
const DYNAMIC_SEGMENT = /^\[[^\]]+\]$/;

// app/api の route.ts の一覧と、URL のパスから route.ts を探す処理。
export class RouteTable {
  private constructor(private readonly routes: readonly Route[]) {}

  // apiDir（app/api のディレクトリ）の下の route.ts をすべて読み、URL の形を決める。
  // WHY 既定値を test-support からの相対で決める: 呼ぶ側（画面仕様）が app/ の場所を知らずに済む。テストは別のディレクトリを渡す。
  // WHY 照合の順を、区間の位置ごとに固定の区間を動的の区間（[name]）より前にする: Next の App Router は固定の区間を優先して
  //   振り分ける（todos/stats は todos/[id] より先）。名前順だと '[' が小文字より前に並び、todos/stats が todos/[id] に吸われて
  //   本番と違う handler を呼ぶ。最初に違う区間で比べ、そこが同じ種類なら名前順（決まった順にするため）。
  //   並びの鍵は、区間ごとに固定なら "0"・動的なら "1" を前に付け、区間の間を "\0"（どの文字より小さい）でつないだ文字列
  //   （区切りを "/" にすると、todos と todos-x のように前方一致する名前で、区切りと名前の続きの文字の大小が混ざる）。
  // 限界: 動的セグメントは [name] の 1 つの区間だけを読む。[...name]（catch-all）・[[...name]]・ルートグループ (group) は今は無く、
  //   置かれたら名前のとおりの区間として扱う（固定の区間として名前で比べ、一致しない）ので、画面仕様の fetch がエラーになって気づける。
  //   それらを置くときは、照合（pattern）と並び（catch-all を動的の区間より後にする Next の優先順）の両方を足す。
  static read(
    apiDir: string = join(import.meta.dirname, "..", "app", "api"),
  ): RouteTable {
    const files = readdirSync(apiDir, { recursive: true, encoding: "utf8" })
      .filter((path) => path === "route.ts" || path.endsWith(`${sep}route.ts`))
      .map((path) => ({
        path,
        key: path
          .split(sep)
          .map(
            (segment) => `${DYNAMIC_SEGMENT.test(segment) ? 1 : 0}${segment}`,
          )
          .join("\0"),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map(({ path }) => path);
    return new RouteTable(
      files.map((path) => {
        const segments = path.split(sep).slice(0, -1);
        const names = segments.flatMap((segment) =>
          DYNAMIC_SEGMENT.test(segment) ? [segment.slice(1, -1)] : [],
        );
        const source = segments
          .map((segment) =>
            DYNAMIC_SEGMENT.test(segment)
              ? "/([^/]+)"
              : `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          )
          .join("");
        return {
          file: join(apiDir, path),
          pattern: new RegExp(`^/api${source}$`),
          names,
        };
      }),
    );
  }

  // pathname（/api/todos/<id> など）に一致する route.ts と、動的セグメントの値（URL のエンコードを戻した値）。無ければ undefined。
  // WHY 値のエンコードを戻す: Next も動的セグメントの params をデコードして渡す。TodoApi は id を encodeURIComponent で URL に入れる。
  match(
    pathname: string,
  ): { file: string; params: Record<string, string> } | undefined {
    for (const route of this.routes) {
      const found = route.pattern.exec(pathname);
      if (found !== null) {
        const values = found.slice(1).map((value) => decodeURIComponent(value));
        return {
          file: route.file,
          params: Object.fromEntries(
            route.names.map((name, index) => [name, values[index] as string]),
          ),
        };
      }
    }
    return undefined;
  }
}

// グローバルの fetch を、RouteTable の Route Handler の直接の呼び出しに替える。install で替え、restore で元に戻す。
// WHY 一致しない URL・route.ts に無いメソッドは例外にする（本物の fetch に流さない）: 画面仕様はネットワークに出ないことを前提にする。
//   流すと、テストの外のサーバ（pnpm dev）に届いて黙って通ることがある。
// WHY route.ts の import をリクエストのたびに行う（install のときに読まない）: api ファイルはモジュールを読み込んだときに
//   AppDatabase.get().db で組み立てる。テスト用の DB（TestDatabase の installAsAppDatabase）を差し込んだ後に読み込ませるため。
//   2 回目からは Vitest のモジュールのキャッシュが同じモジュールを返す。
export class RouteFetch {
  private constructor(
    private readonly table: RouteTable,
    private readonly load: RouteLoader,
    private readonly original: typeof fetch,
  ) {}

  // WHY 読み込みの関数を引数で受け取る: 既定は route.ts を import するだけ。このファイルのテスト（route-fetch.test.ts）は、
  //   受け取った要求を返す handler を渡して、URL・メソッド・params の渡し方だけを確かめる（Vitest はリポジトリの外の一時
  //   ディレクトリの .ts を import できず「Cannot find module」になった。2026-10-04 に実測）。
  static install(
    table: RouteTable = RouteTable.read(),
    load: RouteLoader = (file) => import(/* @vite-ignore */ file),
  ): RouteFetch {
    const routeFetch = new RouteFetch(table, load, globalThis.fetch);
    globalThis.fetch = routeFetch.fetch;
    return routeFetch;
  }

  restore(): void {
    globalThis.fetch = this.original;
  }

  // WHY アロー関数のプロパティにする: globalThis.fetch に入れて this を持たずに呼ばれる。
  readonly fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // WHY new Request で包み直す: 呼び出しは fetch(path, init)（TodoApi）と fetch(request)（OFREP の provider）の 2 通りある。
    //   Request にそろえると、init の method・headers・body を落とさずに handler に渡せる（input が Request のときに init だけを
    //   読むと method が落ちる）。相対パスは今のページのオリジンで解決する（ブラウザの fetch と同じ。jsdom の location）。
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(String(input), window.location.href), init);
    const { pathname } = new URL(request.url);
    const route = this.table.match(pathname);
    const module = route === undefined ? {} : await this.load(route.file);
    const handler = module[request.method];
    if (route === undefined || handler === undefined) {
      throw new Error(
        `RouteFetch: no Route Handler for ${request.method} ${pathname}`,
      );
    }
    return handler(request, { params: Promise.resolve(route.params) });
  };
}
