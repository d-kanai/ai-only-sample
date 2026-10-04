// 作業ログ（docs/work-logs/）を日付ごとに 1 つにまとめた HTML を作る。Issue #441。
// 使い方: node scripts/work-log-html.mjs [出力先]（pnpm work-logs:html。既定の出力先は dist/work-logs.html）
//
// WHY: 作業ログはブランチごとのファイル（docs/work-logs/<日付>/<ブランチ>.md）に分けて PR どうしの追記の競合をなくしたが、
//   1 日分が複数のファイルに分かれて読みづらい（daiki、2026-10-03）。保存は分けたまま、読むときだけまとめる。
// WHY 出力をコミットしない（dist/ は .gitignore 済み）: まとめたファイルをコミットすると、どの PR もそのファイルを変えて
//   また競合する。必要なときに作り直す。
// WHY 依存を足さず、Markdown の一部だけを自前で変換する: 作業ログが使う書き方（見出し・入れ子の箇条書き・``` の囲み・
//   `...`・URL）だけで足り、依存の追加（版の固定・リリースからの日数・ライセンスの検査）に見合わない。ほかの書き方は段落の文字になる。
// WHY console を使わない: rule-tests/architecture.test.ts の console-direct-access が scripts/ の .mjs も対象にする（出力は引数の output に書く）。
// 仕様: scripts/work-log-html.test.ts。

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * HTML の特殊文字をエスケープする。
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 1 行の中の `...` を <code> に、URL をリンクにする（ほかはエスケープした文字）。
 * WHY URL を空白・全角の括弧・読点で終える: 作業ログは「根拠（https://...）」「https://... 、」の形で URL を書く。
 * @param {string} text
 * @returns {string}
 */
export function renderInline(text) {
  // WHY ` で分ける: 奇数番目が `...` の中。閉じていない ` は分けた数が偶数になるので、最後の 1 つを文字として戻す。
  const parts = text.split("`");
  const closed = parts.length % 2 === 1 ? parts : parts.slice(0, -1);
  const html = closed
    .map((part, index) =>
      index % 2 === 1
        ? `<code>${escapeHtml(part)}</code>`
        : escapeHtml(part).replace(
            /https?:\/\/[^\s（）、。]+/g,
            (url) => `<a href="${url}">${url}</a>`,
          ),
    )
    .join("");
  return closed === parts ? html : `${html}\`${escapeHtml(parts.at(-1))}`;
}

/**
 * 作業ログの Markdown を 1 行ずつ HTML にする。見出しは 1 段下げる（# → h3。ページの h1・日付の h2 の下に置くため）。
 * WHY クラスにして状態をフィールドに持つ: 開いている段落・箇条書き・``` の囲みを行をまたいで覚える必要があり、
 *   1 つの関数に書くと長く複雑になる（Biome の noExcessiveLinesPerFunction / noExcessiveCognitiveComplexity）。
 */
class MarkdownRenderer {
  /** @type {string[]} */
  #out = [];
  /** @type {string[]} */
  #paragraph = [];
  // 開いている箇条書きの字下げ（外側から）。WHY 字下げの数で段を決める: 作業ログは 2 文字で 1 段の入れ子を書く。
  /** @type {number[]} */
  #listIndents = [];
  // ``` の囲みの中の行。囲みの外なら undefined。
  /** @type {string[] | undefined} */
  #code;

  /**
   * @param {string} markdown
   * @returns {string}
   */
  render(markdown) {
    for (const raw of markdown.replace(/\n$/, "").split("\n"))
      this.#line(raw.replace(/\r$/, ""));
    if (this.#code !== undefined) this.#closeCode(this.#code);
    this.#closeBlocks();
    return this.#out.join("\n");
  }

  /** @param {string} line */
  #line(line) {
    if (this.#code !== undefined) {
      if (line.trim() === "```") this.#closeCode(this.#code);
      else this.#code.push(line);
      return;
    }
    if (line.trim() === "```") {
      this.#closeBlocks();
      this.#code = [];
      return;
    }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading !== null)
      return this.#heading(heading[1].length + 2, heading[2]);
    const item = /^( *)- (.*)$/.exec(line);
    if (item !== null) return this.#item(item[1].length, item[2]);
    if (line.trim() === "") return this.#closeBlocks();
    this.#closeListsDeeperThan(undefined);
    this.#paragraph.push(renderInline(line.trim()));
  }

  /**
   * @param {number} level
   * @param {string} text
   */
  #heading(level, text) {
    this.#closeBlocks();
    this.#out.push(`<h${level}>${renderInline(text)}</h${level}>`);
  }

  /**
   * @param {number} indent
   * @param {string} text
   */
  #item(indent, text) {
    this.#closeParagraph();
    this.#closeListsDeeperThan(indent);
    if (this.#listIndents.at(-1) === indent) this.#closeItem();
    else {
      // 新しい段: 外側の項目の中に開く（外側の <li> は閉じない）。
      this.#listIndents.push(indent);
      this.#out.push("<ul>");
    }
    this.#out.push(`<li>${renderInline(text)}`);
  }

  /** @param {string[]} code 囲みの中の行 */
  #closeCode(code) {
    this.#out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    this.#code = undefined;
  }

  #closeParagraph() {
    if (this.#paragraph.length > 0)
      this.#out.push(`<p>${this.#paragraph.join(" ")}</p>`);
    this.#paragraph = [];
  }

  // 開いたままの項目（<li>）を閉じる。
  // WHY 項目を開いたまま出す: 項目の後に入れ子の ul が来るかは次の行を見るまで分からない（入れ子の ul は親の li の中に入る）。
  #closeItem() {
    const last = this.#out.at(-1);
    if (last?.startsWith("<li>") && !last.endsWith("</li>"))
      this.#out[this.#out.length - 1] = `${last}</li>`;
  }

  /**
   * 字下げが indent より深い（indent が undefined ならすべての）箇条書きを閉じる。
   * @param {number | undefined} indent
   */
  #closeListsDeeperThan(indent) {
    while (
      this.#listIndents.length > 0 &&
      !(indent !== undefined && this.#listIndents.at(-1) <= indent)
    ) {
      this.#closeItem();
      this.#listIndents.pop();
      this.#out.push(this.#listIndents.length > 0 ? "</ul></li>" : "</ul>");
    }
  }

  #closeBlocks() {
    this.#closeParagraph();
    this.#closeListsDeeperThan(undefined);
  }
}

/**
 * 作業ログの Markdown を HTML にする（MarkdownRenderer）。
 * @param {string} markdown
 * @returns {string}
 */
export function renderMarkdown(markdown) {
  return new MarkdownRenderer().render(markdown);
}

/**
 * <日付> のディレクトリの .md（ファイルだけ）を集める。
 * @param {string} dir
 * @returns {{ name: string, path: string }[]}
 */
function branchFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ name, path: join(dir, name) }))
    .filter(({ path }) => statSync(path).isFile());
}

/**
 * docs/work-logs の下のログを日付ごとに集める（新しい日付から。日付の中はファイル名の順）。
 * 1 日 1 ファイルの過去のログ（<日付>.md）と、ブランチごとのファイル（<日付>/<ブランチ>.md）の両方を集める。
 * @param {string} logsDir
 * @returns {{ date: string, files: { name: string, markdown: string }[] }[]}
 */
export function collectLogs(logsDir) {
  const isDate = (name) => /^\d{4}-\d{2}-\d{2}$/.test(name);
  /** @type {Map<string, { name: string, markdown: string }[]>} */
  const byDate = new Map();
  const add = (date, name, path) => {
    const files = byDate.get(date) ?? [];
    files.push({ name, markdown: readFileSync(path, "utf8") });
    byDate.set(date, files);
  };
  for (const entry of readdirSync(logsDir)) {
    const path = join(logsDir, entry);
    if (statSync(path).isDirectory()) {
      if (isDate(entry))
        for (const file of branchFiles(path)) add(entry, file.name, file.path);
    } else if (entry.endsWith(".md") && isDate(entry.slice(0, -3)))
      add(entry.slice(0, -3), entry, path);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, files]) => ({
      date,
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/**
 * 日付ごとの目次と、日付 → ファイルの節を持つ 1 つの HTML にする。
 * @param {{ date: string, files: { name: string, markdown: string }[] }[]} days
 * @returns {string}
 */
export function buildHtml(days) {
  const nav = days
    .map(({ date }) => `<a href="#${date}">${date}</a>`)
    .join("\n");
  const sections = days
    .map(({ date, files }) =>
      [
        `<section id="${date}">`,
        `<h2>${date}</h2>`,
        ...files.map(({ name, markdown }) =>
          [
            "<article>",
            `<p class="file">${escapeHtml(name)}</p>`,
            renderMarkdown(markdown),
            "</article>",
          ].join("\n"),
        ),
        "</section>",
      ].join("\n"),
    )
    .join("\n");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>作業ログ</title>
<style>
/* 読むための 1 列。日付の目次を上に固定し、ファイルごとの節を枠で区切る。
   画面の幅に固定する（横のスクロールを出さない。daiki、2026-10-04）: 長い英数字の並びもコードの囲みも折り返す。 */
:root { --bg: #fbfbfa; --fg: #1d2127; --muted: #5d6673; --line: #d5d9de; --surface: #ffffff; --code: #eef1f4; --accent: #2457a6; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #111418; --fg: #e3e7ec; --muted: #9aa4b1; --line: #2c333c; --surface: #171b21; --code: #20262e; --accent: #7fa8e8; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #111418; --fg: #e3e7ec; --muted: #9aa4b1; --line: #2c333c; --surface: #171b21; --code: #20262e; --accent: #7fa8e8; color-scheme: dark; }
body { font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.7; margin: 0 auto; max-width: 72ch; padding-block: 16px; padding-inline: 16px; color: var(--fg); background: var(--bg); overflow-wrap: anywhere; }
a { color: var(--accent); overflow-wrap: anywhere; }
nav { display: flex; flex-wrap: wrap; gap: 4px 12px; position: sticky; top: env(safe-area-inset-top, 0px); background: var(--bg); padding-block: 8px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
h1 { font-size: 1.4rem; margin: 0 0 8px; }
h2 { font-size: 1.2rem; border-bottom: 2px solid var(--line); margin: 32px 0 0; font-variant-numeric: tabular-nums; }
h3, h4, h5 { text-wrap: balance; line-height: 1.4; }
section { scroll-margin-top: 96px; }
article { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 0 16px 8px; margin: 16px 0; min-width: 0; }
.file { color: var(--muted); font-size: 0.8rem; letter-spacing: 0.02em; margin: 8px 0 0; }
code, pre { background: var(--code); border-radius: 4px; font-size: 0.88em; }
code { padding: 0 4px; overflow-wrap: anywhere; }
pre { white-space: pre-wrap; padding: 8px; }
pre code { padding: 0; }
ul { padding-left: 1.25em; }
</style>
</head>
<body>
<h1>作業ログ</h1>
<nav>
${nav}
</nav>
${sections}
</body>
</html>
`;
}

/**
 * このファイルが入口として実行されたときだけ、<cwd>/docs/work-logs から HTML を作って出力先に書き、書いた場所を output に出す。
 * 処理したら true、import されただけなら false。
 * WHY 入口の判定を関数にして引数で受け取る: テストから import したときに書き込まないようにし、入口のときの動作も同じプロセスで
 *   確かめられる（カバレッジ 100% を保つ。scripts/hooks/work-log-sections.mjs と同じ形）。
 * @param {string} moduleUrl このファイルの import.meta.url
 * @param {string | undefined} entryPath process.argv[1]
 * @param {{ args: string[], cwd: string, output: { write(text: string): unknown } }} context
 *   args の先頭は出力先（省略すると dist/work-logs.html）
 * @returns {boolean}
 */
export function runCli(moduleUrl, entryPath, { args, cwd, output }) {
  if (
    entryPath === undefined ||
    pathToFileURL(realpathSync(entryPath)).href !== moduleUrl
  )
    return false;
  const outPath = resolve(cwd, args[0] ?? "dist/work-logs.html");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildHtml(collectLogs(join(cwd, "docs/work-logs"))));
  output.write(`${outPath}\n`);
  return true;
}

runCli(import.meta.url, process.argv[1], {
  args: process.argv.slice(2),
  cwd: process.cwd(),
  output: process.stdout,
});
