// @vitest-environment node
// WHY: vitest.config.mts の既定環境は jsdom（コンポーネントテスト用）だが、このテストは文字列の変換とファイルの読み書きだけで
//   DOM を使わない。
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildHtml,
  collectLogs,
  renderInline,
  renderMarkdown,
  runCli,
} from "./work-log-html.mjs";

// 作業ログ（docs/work-logs/）を日付ごとに 1 つにまとめた HTML を作るスクリプト（scripts/work-log-html.mjs）の仕様。Issue #441。
// WHY: 作業ログはブランチごとのファイル（docs/work-logs/<日付>/<ブランチ>.md）に分けて PR どうしの競合をなくしたが、
//   1 日分が複数のファイルに分かれて読みづらい（daiki、2026-10-03）。保存は分けたまま、読むときだけまとめる。

const scriptPath = resolve(import.meta.dirname, "work-log-html.mjs");

describe("renderInline", () => {
  it("HTML の特殊文字をエスケープする", () => {
    // given: 前提なし（文字列を直接渡す）
    // when
    const html = renderInline(`<a href="x">&'</a>`);

    // then
    expect(html).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });

  it("`...` を <code> にし、その中の URL はリンクにしない", () => {
    // given: 前提なし
    // when
    const html = renderInline("実行: `git log https://x.example` を見た");

    // then
    expect(html).toBe("実行: <code>git log https://x.example</code> を見た");
  });

  it("URL をリンクにし、空白・全角の括弧・読点で終わる", () => {
    // given: 前提なし
    // when
    const html = renderInline(
      "根拠（https://a.example/x?y=1&z=2）、https://b.example 、https://c.example、",
    );

    // then
    expect(html).toBe(
      '根拠（<a href="https://a.example/x?y=1&amp;z=2">https://a.example/x?y=1&amp;z=2</a>）、<a href="https://b.example">https://b.example</a> 、<a href="https://c.example">https://c.example</a>、',
    );
  });

  it("閉じていない ` はそのまま文字として出す", () => {
    // given: 前提なし
    // when
    const html = renderInline("a ` b");

    // then
    expect(html).toBe("a ` b");
  });
});

describe("renderMarkdown", () => {
  it("見出し（# / ## / ###）を 1 段ずつ下げて h3 / h4 / h5 にする（ページの h1・日付の h2 の下に置くため）", () => {
    // given: 前提なし
    // when
    const html = renderMarkdown("# ファイル\n## 項目\n### 小見出し\n");

    // then
    expect(html).toBe("<h3>ファイル</h3>\n<h4>項目</h4>\n<h5>小見出し</h5>");
  });

  it("箇条書きを入れ子（2 文字の字下げで 1 段）の ul にし、空行で閉じる", () => {
    // given: 前提なし
    // when
    const html = renderMarkdown(
      "- 理由: a\n  - 入れ子\n    - さらに\n- 根拠: b\n\n- 次\n",
    );

    // then
    expect(html).toBe(
      [
        "<ul>",
        "<li>理由: a",
        "<ul>",
        "<li>入れ子",
        "<ul>",
        "<li>さらに</li>",
        "</ul></li>",
        "</ul></li>",
        "<li>根拠: b</li>",
        "</ul>",
        "<ul>",
        "<li>次</li>",
        "</ul>",
      ].join("\n"),
    );
  });

  it("段落は空行で区切り、続く行を空白でつなぐ", () => {
    // given: 前提なし
    // when
    const html = renderMarkdown("1 行目\n2 行目\n\n次の段落\n");

    // then
    expect(html).toBe("<p>1 行目 2 行目</p>\n<p>次の段落</p>");
  });

  it("見出し・箇条書きの前の段落と、見出しの前の箇条書きを閉じる", () => {
    // given: 前提なし
    // when
    const html = renderMarkdown("段落\n- 項目\n## 見出し\n段落2\n- 項目2\n");

    // then
    expect(html).toBe(
      [
        "<p>段落</p>",
        "<ul>",
        "<li>項目</li>",
        "</ul>",
        "<h4>見出し</h4>",
        "<p>段落2</p>",
        "<ul>",
        "<li>項目2</li>",
        "</ul>",
      ].join("\n"),
    );
  });

  it("``` の囲みはエスケープして <pre> にし、中の見出し・箇条書きを解釈しない", () => {
    // given: 前提なし
    // when
    const html = renderMarkdown(
      "- 例:\n  ```\n  ## 見出しではない\n  - <b>\n  ```\n後\n",
    );

    // then
    expect(html).toBe(
      [
        "<ul>",
        "<li>例:</li>",
        "</ul>",
        "<pre><code>  ## 見出しではない",
        "  - &lt;b&gt;</code></pre>",
        "<p>後</p>",
      ].join("\n"),
    );
  });

  it("閉じていない ``` の囲みはファイルの終わりで閉じる", () => {
    // given: 前提なし
    // when
    const html = renderMarkdown("```\nx\n");

    // then
    expect(html).toBe("<pre><code>x</code></pre>");
  });

  it("CRLF の改行も扱う", () => {
    // given: 前提なし
    // when
    const html = renderMarkdown("## 見出し\r\n- 項目\r\n");

    // then
    expect(html).toBe("<h4>見出し</h4>\n<ul>\n<li>項目</li>\n</ul>");
  });
});

describe("collectLogs / buildHtml / runCli（ファイル）", () => {
  let tmp: string;
  let logsDir: string;

  function write(path: string, content: string) {
    mkdirSync(join(logsDir, path, ".."), { recursive: true });
    writeFileSync(join(logsDir, path), content);
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "work-log-html-"));
    logsDir = join(tmp, "docs/work-logs");
    mkdirSync(logsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("日付ごとに、1 日 1 ファイルの過去のログとブランチごとのファイルを集め、新しい日付から並べる", () => {
    // given
    write("2026-10-02.md", "# 2 日\n");
    write("2026-10-03/feat-2-b.md", "# b\n");
    write("2026-10-03/feat-1-a.md", "# a\n");
    write("2026-10-03.md", "# 3 日の過去のログ\n");

    // when
    const days = collectLogs(logsDir);

    // then
    expect(days).toEqual([
      {
        date: "2026-10-03",
        files: [
          { name: "2026-10-03.md", markdown: "# 3 日の過去のログ\n" },
          { name: "feat-1-a.md", markdown: "# a\n" },
          { name: "feat-2-b.md", markdown: "# b\n" },
        ],
      },
      {
        date: "2026-10-02",
        files: [{ name: "2026-10-02.md", markdown: "# 2 日\n" }],
      },
    ]);
  });

  it("日付でない名前のファイル・ディレクトリと、.md 以外のファイルは集めない", () => {
    // given
    write("README.md", "x");
    write("2026-10-03/note.txt", "x");
    write("2026-10-03/nested/x.md", "x");
    write("2026/x.md", "x");
    write("2026-10-03/a.md", "# a\n");

    // when
    const days = collectLogs(logsDir);

    // then
    expect(days).toEqual([
      { date: "2026-10-03", files: [{ name: "a.md", markdown: "# a\n" }] },
    ]);
  });

  it("日付ごとの目次と、ファイルごとの節を持つ 1 つの HTML にする", () => {
    // given
    const days = [
      {
        date: "2026-10-03",
        files: [{ name: "feat-1-a.md", markdown: "## 項目\n- 理由: x\n" }],
      },
    ];

    // when
    const html = buildHtml(days);

    // then
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<a href="#2026-10-03">2026-10-03</a>');
    expect(html).toContain('<section id="2026-10-03">\n<h2>2026-10-03</h2>');
    expect(html).toContain(
      '<article>\n<p class="file">feat-1-a.md</p>\n<h4>項目</h4>\n<ul>\n<li>理由: x</li>\n</ul>\n</article>',
    );
  });

  it("入口として実行されたら、<cwd>/docs/work-logs から出力先（既定 dist/work-logs.html）に書き、書いた場所を出す", () => {
    // given
    write("2026-10-03/a.md", "## 項目\n");
    const out: string[] = [];

    // when
    const handled = runCli(pathToFileURL(scriptPath).href, scriptPath, {
      args: [],
      cwd: tmp,
      output: { write: (t: string) => out.push(t) },
    });

    // then
    expect(handled).toBe(true);
    const html = readFileSync(join(tmp, "dist/work-logs.html"), "utf8");
    expect(html).toContain("<h4>項目</h4>");
    expect(out.join("")).toBe(`${join(tmp, "dist/work-logs.html")}\n`);
  });

  it("出力先を引数で変えられる", () => {
    // given
    write("2026-10-03/a.md", "## 項目\n");

    // when
    runCli(pathToFileURL(scriptPath).href, scriptPath, {
      args: ["out/x.html"],
      cwd: tmp,
      output: { write: () => undefined },
    });

    // then
    expect(readFileSync(join(tmp, "out/x.html"), "utf8")).toContain(
      "<h4>項目</h4>",
    );
  });

  it("import されただけ（入口が別のファイル・入口が無い）なら何もしない", () => {
    // given: 前提なし
    // when
    const context = { args: [], cwd: tmp, output: { write: () => undefined } };
    const otherEntry = runCli(
      pathToFileURL(scriptPath).href,
      join(import.meta.dirname, "work-log-html.test.ts"),
      context,
    );
    const noEntry = runCli(pathToFileURL(scriptPath).href, undefined, context);

    // then
    expect(otherEntry).toBe(false);
    expect(noEntry).toBe(false);
  });
});
