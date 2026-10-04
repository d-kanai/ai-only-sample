import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { RouteFetch, type RouteModule, RouteTable } from "./route-fetch";

// RouteTable（app/api の route.ts の一覧と URL の照合）と RouteFetch（fetch の差し替え）の仕様。
// WHY 一時ディレクトリに route.ts を置き、読み込みは差し替える: 本物の app/api の handler は DB を使う（画面仕様が実 Postgres で
//   確かめる）。ここでは URL の形・メソッド・params の渡し方だけを、受け取ったものを返す handler で確かめる。route.ts を本当に
//   import する既定の読み込みは、画面仕様（*.screen-spec.test.tsx）が通る。

// 受け取った要求（メソッド・URL・本文・params）を JSON で返す handler。
async function echo(
  request: Request,
  context: { params: Promise<Record<string, string>> },
): Promise<Response> {
  return Response.json({
    method: request.method,
    url: request.url,
    body: request.method === "GET" ? null : await request.text(),
    params: await context.params,
  });
}

// route.ts のファイル（apiDir からの相対パス）ごとの、読み込んだときのモジュール。
const MODULES: Record<string, RouteModule> = {
  "todos/route.ts": { GET: echo, POST: echo },
  "todos/[id]/route.ts": { GET: echo, DELETE: echo },
  "todos/[id]/title/route.ts": { PUT: echo },
  "v1.x/route.ts": { GET: echo },
};

// dir の下の route.ts を読む代わりに、MODULES のモジュールを返す。
function loaderFor(dir: string) {
  return (file: string) =>
    Promise.resolve(MODULES[file.slice(dir.length + 1)] ?? {});
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function apiDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "route-fetch-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

// 画面仕様と同じ形の app/api（一覧・1 件・1 件の下の項目・名前に正規表現の記号を含む区間）。
const API = {
  "todos/route.ts": "",
  "todos/[id]/route.ts": "",
  "todos/[id]/title/route.ts": "",
  "v1.x/route.ts": "",
  "todos/[id]/README.md": "# route.ts ではないファイル\n",
};

describe("RouteTable", () => {
  test("app/api の route.ts ごとに URL のパスを照合し、動的セグメントの値をエンコードを戻して params にする", () => {
    // given
    const dir = apiDir(API);
    const table = RouteTable.read(dir);

    // when
    const result = {
      list: table.match("/api/todos"),
      detail: table.match("/api/todos/a%20b"),
      title: table.match("/api/todos/a%2Fb/title"),
      dotted: table.match("/api/v1.x"),
    };

    // then
    expect(result).toEqual({
      list: { file: join(dir, "todos/route.ts"), params: {} },
      detail: { file: join(dir, "todos/[id]/route.ts"), params: { id: "a b" } },
      title: {
        file: join(dir, "todos/[id]/title/route.ts"),
        params: { id: "a/b" },
      },
      dotted: { file: join(dir, "v1.x/route.ts"), params: {} },
    });
  });

  test("route.ts の無いパス・区間の数が違うパス・正規表現の記号を任意の文字として読んだパスは一致しない", () => {
    // given
    const table = RouteTable.read(apiDir(API));

    // when
    const result = [
      "/api",
      "/api/todos/",
      "/api/todos/a/b",
      "/api/todos/a/title/x",
      "/api/v1Xx",
      "/todos",
      "/api/todos/a/README.md",
    ].map((path) => table.match(path));

    // then
    expect(result).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
  test("固定の区間（todos/stats）は、同じ位置の動的の区間（todos/[id]）より先に照合する（Next の App Router と同じ振り分け）", () => {
    // given
    // WHY 名前順で [id] が stats より前に来る一覧にする: '[' は小文字より文字コードが小さく、名前順に照合すると stats が [id] に吸われる。
    //   区間の位置ごとに固定を優先し、その次の区間でも同じ規則で比べる（a/[x]/c と a/[x]/[y] の 2 段目も確かめる）。
    const dir = apiDir({
      "todos/[id]/route.ts": "",
      "todos/stats/route.ts": "",
      "todos/[id]/[field]/route.ts": "",
      "todos/[id]/title/route.ts": "",
    });
    const table = RouteTable.read(dir);

    // when
    const result = {
      stats: table.match("/api/todos/stats"),
      detail: table.match("/api/todos/1"),
      title: table.match("/api/todos/1/title"),
      field: table.match("/api/todos/1/done"),
    };

    // then
    expect(result).toEqual({
      stats: { file: join(dir, "todos/stats/route.ts"), params: {} },
      detail: { file: join(dir, "todos/[id]/route.ts"), params: { id: "1" } },
      title: {
        file: join(dir, "todos/[id]/title/route.ts"),
        params: { id: "1" },
      },
      field: {
        file: join(dir, "todos/[id]/[field]/route.ts"),
        params: { id: "1", field: "done" },
      },
    });
  });
});

describe("RouteFetch", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  test("install はグローバルの fetch を替え、restore で元の fetch に戻す", () => {
    // given
    const table = RouteTable.read(apiDir(API));

    // when
    const routeFetch = RouteFetch.install(table);
    const installed = globalThis.fetch;
    routeFetch.restore();

    // then
    expect(installed).toBe(routeFetch.fetch);
    expect(globalThis.fetch).toBe(original);
  });

  test("パスと init で呼ぶと、ページのオリジンで URL にし、メソッドと本文と params を handler に渡す", async () => {
    // given
    const dir = apiDir(API);
    RouteFetch.install(RouteTable.read(dir), loaderFor(dir));

    // when
    const response = await fetch("/api/todos/a%20b/title", {
      method: "PUT",
      body: '{"title":"x"}',
    });

    // then
    await expect(response.json()).resolves.toEqual({
      method: "PUT",
      url: `${window.location.origin}/api/todos/a%20b/title`,
      body: '{"title":"x"}',
      params: { id: "a b" },
    });
  });

  test("Request で呼ぶと、その Request のメソッドと本文を handler に渡す（init があれば上書きする）", async () => {
    // given
    const dir = apiDir(API);
    RouteFetch.install(RouteTable.read(dir), loaderFor(dir));
    const origin = window.location.origin;

    // when
    const plain = await fetch(
      new Request(`${origin}/api/todos`, { method: "POST", body: "a" }),
    );
    const overridden = await fetch(new Request(`${origin}/api/todos/1`), {
      method: "DELETE",
    });

    // then
    await expect(plain.json()).resolves.toEqual({
      method: "POST",
      url: `${origin}/api/todos`,
      body: "a",
      params: {},
    });
    await expect(overridden.json()).resolves.toEqual({
      method: "DELETE",
      url: `${origin}/api/todos/1`,
      body: "",
      params: { id: "1" },
    });
  });

  test("route.ts の無いパスと、route.ts に無いメソッドは、ネットワークに出さずに失敗する", async () => {
    // given
    const dir = apiDir(API);
    RouteFetch.install(RouteTable.read(dir), loaderFor(dir));

    // when
    const missingRoute = fetch("/api/unknown");
    const missingMethod = fetch("/api/todos/1/title", { method: "GET" });

    // then
    await expect(missingRoute).rejects.toEqual(
      new Error("RouteFetch: no Route Handler for GET /api/unknown"),
    );
    await expect(missingMethod).rejects.toEqual(
      new Error("RouteFetch: no Route Handler for GET /api/todos/1/title"),
    );
  });
});
