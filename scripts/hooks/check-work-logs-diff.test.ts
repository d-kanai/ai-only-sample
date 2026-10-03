// @vitest-environment node
// WHY: vitest.config.mts の既定環境は jsdom（コンポーネントテスト用）だが、このテストは bash と git を子プロセスで
//   起動するだけで DOM を使わない。
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// CI の PR で作業ログの追記を必須にするスクリプト（scripts/hooks/check-work-logs-diff.sh <base-ref>）の仕様。Issue #64。
// `git diff --name-only <base-ref>...HEAD` に、PR のブランチの作業ログ docs/work-logs/<日付>/<ブランチ名の / を - にしたもの>.md
// （Issue #441）の追加・変更があれば exit 0、無ければ理由を出して exit 1。ブランチ名は CI では GITHUB_EVENT_PATH の
// pull_request.head.ref、手元では今のブランチ。
// CI の ci.yml に組み込まれていることは rule-tests/work-logs-check.test.ts が検査する。

const scriptPath = resolve(import.meta.dirname, "check-work-logs-diff.sh");

describe("check-work-logs-diff.sh", () => {
  let tmp: string;
  let repo: string;
  let gitEnv: NodeJS.ProcessEnv;

  function git(args: string[]) {
    const result = spawnSync("git", args, {
      cwd: repo,
      env: gitEnv,
      encoding: "utf8",
    });
    if (result.status !== 0)
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
  }

  function commitFiles(files: Record<string, string>, message = "change") {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(repo, path, ".."), { recursive: true });
      writeFileSync(join(repo, path), content);
    }
    git(["add", "-A"]);
    git(["commit", "-q", "-m", message]);
  }

  function run(args: string[], env: Record<string, string> = {}) {
    return spawnSync("bash", [scriptPath, ...args], {
      cwd: repo,
      env: { ...gitEnv, ...env },
      encoding: "utf8",
    });
  }

  // GitHub Actions が GITHUB_EVENT_PATH に置く pull_request のイベントの JSON（必要な pull_request.user.login と head.ref だけ）を作る。
  function pullRequestEvent(login: string, headRef = "work") {
    const path = join(tmp, "event.json");
    writeFileSync(
      path,
      JSON.stringify({
        pull_request: { user: { login }, head: { ref: headRef } },
      }),
    );
    return { GITHUB_EVENT_PATH: path };
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "check-work-logs-diff-"));
    repo = join(tmp, "repo");
    mkdirSync(repo);
    const home = join(tmp, "home");
    mkdirSync(home);
    writeFileSync(join(home, "gitconfig"), "");
    // 実行元の git の設定（グローバルのフック・署名など）がテストに漏れないようにする。
    gitEnv = {
      // WHY NODE_ENV: Next.js の型定義が ProcessEnv の NODE_ENV を必須にしており、無いと spawnSync の env に渡せない（tsc）。
      NODE_ENV: process.env.NODE_ENV,
      PATH: process.env.PATH,
      HOME: home,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(home, "gitconfig"),
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    };
    git(["init", "-q", "-b", "main"]);
    commitFiles(
      {
        "README.md": "readme\n",
        // 1 日 1 ファイルの頃（Issue #441 より前）のログと、PR のブランチ work の前の日のログ。
        "docs/work-logs/2026-09-27.md": "# 27\n",
        "docs/work-logs/2026-09-27/work.md": "# 27 work\n",
      },
      "init",
    );
    git(["checkout", "-q", "-b", "work"]);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("通す（must pass）", () => {
    it("PR のブランチの作業ログ docs/work-logs/<日付>/<ブランチ>.md を足した PR は 0 で終わる", () => {
      // given
      commitFiles({
        "src.ts": "x\n",
        "docs/work-logs/2026-09-28/work.md": "# 28\n",
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });

    it("前の日の PR のブランチの作業ログに追記しただけの PR も 0 で終わる", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-27/work.md": "# 27 work\n追記\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });

    it("ブランチ名の / を - にしたファイル名（feat/1-x → feat-1-x.md）で数える", () => {
      // given
      git(["checkout", "-q", "-b", "feat/1-x"]);
      commitFiles({ "docs/work-logs/2026-09-28/feat-1-x.md": "# 28\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });

    // WHY 日本語のブランチ名: git の既定（core.quotePath=true）では --name-only が非 ASCII のパスを "..." と 8 進でエスケープして出すので、
    //   ファイル名の比較で一致しなくなる（PR #444 の Codex の指摘）。
    it("日本語を含むブランチ名（feat/1-日本語 → feat-1-日本語.md）でも数える", () => {
      // given
      git(["checkout", "-q", "-b", "feat/1-日本語"]);
      commitFiles({ "docs/work-logs/2026-09-28/feat-1-日本語.md": "# 28\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });

    // WHY head.ref: CI の actions/checkout は PR のマージコミットを detached HEAD で取り出すので、今のブランチ名が無い。
    it("GITHUB_EVENT_PATH があれば pull_request.head.ref のブランチ名で見る（detached HEAD でも）", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28/feat-1-x.md": "# 28\n" });
      git(["checkout", "-q", "--detach"]);

      // when
      const result = run(["main"], pullRequestEvent("d-kanai", "feat/1-x"));

      // then
      expect(result.status).toBe(0);
    });

    it("base が PR の後に作業ログを変えずに進んでいても、PR 側の作業ログの変更で 0 になる", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28/work.md": "# 28\n" });
      git(["checkout", "-q", "main"]);
      commitFiles({ "other.ts": "y\n" });
      git(["checkout", "-q", "work"]);

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });
  });

  describe("rename の扱い（--no-renames）", () => {
    it("ログの名前を PR のブランチの作業ログに変えただけの PR は、追加 + 削除として見えるので 0 で終わる（限界）", () => {
      // given
      // --no-renames: 利用者の diff.renames の設定に左右されず、名前の変更を常に「削除 + 追加」として扱う。
      //   rename の検出が効くと R になり --diff-filter=AM で外れる（設定で結果が変わる）。
      // 限界: 中身を足していない名前の変更でも通る（.claude/rules/tooling/work-log-hooks.md）。
      mkdirSync(join(repo, "docs/work-logs/2026-09-28"), { recursive: true });
      git([
        "mv",
        "docs/work-logs/2026-09-27.md",
        "docs/work-logs/2026-09-28/work.md",
      ]);
      git(["commit", "-q", "-m", "rename log"]);

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });

    it("diff.renames=false の設定でも結果が同じ（0）", () => {
      // given
      mkdirSync(join(repo, "docs/work-logs/2026-09-28"), { recursive: true });
      git([
        "mv",
        "docs/work-logs/2026-09-27.md",
        "docs/work-logs/2026-09-28/work.md",
      ]);
      git(["commit", "-q", "-m", "rename log"]);
      git(["config", "diff.renames", "false"]);

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });
  });

  describe("落とす（must reject）", () => {
    it("作業ログの変更が無い PR は 1 で終わり、書くべきファイルと理由を stderr に出す", () => {
      // given
      commitFiles({ "src.ts": "x\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("docs/work-logs/<日付>/work.md");
      expect(result.stderr).toContain("main...HEAD");
    });

    // WHY 1 日 1 ファイルを must reject に置く: Issue #441 で、どの PR も同じ日のファイルの末尾に追記して PR どうしが
    //   競合したので、ブランチごとのファイルに分けた。1 日 1 ファイルのログで通すと、競合する書き方に戻るのを見逃す。
    it("1 日 1 ファイルの docs/work-logs/<日付>.md を足しただけの PR は 1 で終わる", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28.md": "# 28\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("既存の 1 日 1 ファイルの docs/work-logs/<日付>.md に追記しただけの PR は 1 で終わる", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-27.md": "# 27\n追記\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("別のブランチの作業ログ（docs/work-logs/<日付>/other.md）だけなら 1 で終わる", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28/other.md": "# 28\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("ブランチ名の / を残したパス（docs/work-logs/<日付>/feat/1-x.md）は数えない", () => {
      // given
      git(["checkout", "-q", "-b", "feat/1-x"]);
      commitFiles({ "docs/work-logs/2026-09-28/feat/1-x.md": "# 28\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("日付のディレクトリの下でなければ（docs/work-logs/work.md・docs/work-logs/2026/work.md・docs/work-logs/2026-9-28/work.md）1 で終わる", () => {
      // given
      commitFiles({
        "docs/work-logs/work.md": "x\n",
        "docs/work-logs/2026/work.md": "x\n",
        "docs/work-logs/2026-9-28/work.md": "x\n",
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("GITHUB_EVENT_PATH があれば、今のブランチ名ではなく pull_request.head.ref のファイルを求める", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28/work.md": "# 28\n" });

      // when
      const result = run(["main"], pullRequestEvent("d-kanai", "feat/1-x"));

      // then
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("docs/work-logs/<日付>/feat-1-x.md");
    });

    it("ブランチに居ない（detached HEAD）で GITHUB_EVENT_PATH も無ければ 1 で終わり、理由を出す", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28/work.md": "# 28\n" });
      git(["checkout", "-q", "--detach"]);

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ブランチ名");
    });

    it("作業ログ以外の .md だけを変えた（文書だけの）PR も 1 で終わる", () => {
      // given
      commitFiles({ "docs/adr/x.md": "# doc\n", "README.md": "changed\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("PR のブランチの作業ログを削除しただけの PR は 1 で終わる（追加・変更だけを数える）", () => {
      // given
      git(["rm", "-q", "docs/work-logs/2026-09-27/work.md"]);
      git(["commit", "-q", "-m", "remove log"]);

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("作業ログの .md 以外のファイル（docs/work-logs/<日付>/work.txt）だけなら 1 で終わる", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28/work.txt": "x\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("別のディレクトリの docs/work-logs/（apps/docs/work-logs/<日付>/work.md）は数えない", () => {
      // given
      commitFiles({ "apps/docs/work-logs/2026-09-28/work.md": "x\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    // WHY 旧い置き場所を must reject に置く: Issue #101 で work-logs/ を docs/ の下に移した。旧い置き場所のログを数えると、
    //   リポジトリ直下に作り直した旧いディレクトリに書く誤りを CI が見逃す。
    it("旧い置き場所（リポジトリ直下の work-logs/）の .md だけなら 1 で終わる", () => {
      // given
      commitFiles({ "work-logs/2026-09-28/work.md": "# 28\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("docs/work-logs の前方一致のディレクトリ（docs/work-logs-old/）の .md だけなら 1 で終わる", () => {
      // given
      commitFiles({ "docs/work-logs-old/2026-09-28/work.md": "x\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("base 側だけで既存のログが変わっていても（三点 diff なので）PR 側に変更が無ければ 1 で終わる", () => {
      // given
      // WHY 既存のログの変更にする: base 側で新しいログを足すだけだと、二点 diff（..）でも HEAD 側から見て「削除」になり、
      //   --diff-filter=AM で外れて 1 になる（二点に壊しても落ちない）。変更（M）なら二点では数えてしまい 0 になる。
      commitFiles({ "src.ts": "x\n" });
      git(["checkout", "-q", "main"]);
      commitFiles({
        "docs/work-logs/2026-09-27/work.md": "# 27\nmain で追記\n",
      });
      git(["checkout", "-q", "work"]);

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("作業ツリーにある未コミットの作業ログの変更は数えない（PR の差分だけを見る）", () => {
      // given
      commitFiles({ "src.ts": "x\n" });
      mkdirSync(join(repo, "docs/work-logs/2026-09-28"), { recursive: true });
      writeFileSync(
        join(repo, "docs/work-logs/2026-09-28/work.md"),
        "# 未コミット\n",
      );

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("base-ref が存在しなければ 0 以外で終わる（差分を取れないまま通さない）", () => {
      // given
      commitFiles({ "docs/work-logs/2026-09-28/work.md": "# 28\n" });

      // when
      const result = run(["origin/nope"]);

      // then
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("origin/nope");
    });

    it("base-ref を渡さなければ 0 以外で終わり、使い方を出す", () => {
      // given: 前提なし（引数なしで実行する）
      // when
      const result = run([]);

      // then
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("usage");
    });
  });

  // PR で追加した項目（`## ` の見出し）ごとに `- 機械化:` の行を要求する（Issue #178。CLAUDE.md の 7.）。
  // 見るのは `git diff --diff-filter=AM <base>...HEAD -- docs/work-logs/*.md` の `+` の行だけ。判定の細部は
  // scripts/hooks/work-log-sections.test.ts。
  describe("追加した項目の `- 機械化:` の行", () => {
    const item = (heading: string, mechanization?: string) =>
      [
        `## ${heading}`,
        "- 理由: x",
        ...(mechanization === undefined ? [] : [`- 機械化: ${mechanization}`]),
      ].join("\n");
    const log = (...items: string[]) => `# log\n\n${items.join("\n\n")}\n`;
    // stderr の見出しの一覧（`  - <見出し>` の行）。
    const listedHeadings = (stderr: string) =>
      stderr
        .split("\n")
        .filter((l) => l.startsWith("  - "))
        .map((l) => l.slice(4));

    it("追加した項目に無ければ 1 で終わり、無い見出しだけを stderr に挙げる", () => {
      // given
      commitFiles({
        "docs/work-logs/2026-09-28/work.md": log(
          item("足した1"),
          item("足した2", "縛れる（CI）"),
        ),
        "docs/work-logs/2026-09-29/work.md": log(item("足した3")),
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("main...HEAD");
      expect(result.stderr).toContain("- 機械化:");
      expect(listedHeadings(result.stderr)).toEqual(["足した1", "足した3"]);
    });

    it("既存のログに追加した項目に無ければ 1 で終わる", () => {
      // given
      commitFiles({
        "docs/work-logs/2026-09-27/work.md": `# 27\n\n${item("足した")}\n`,
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
      expect(listedHeadings(result.stderr)).toEqual(["足した"]);
    });

    it("追加した項目にすべてあれば 0 で終わる", () => {
      // given
      commitFiles({
        "docs/work-logs/2026-09-28/work.md": log(
          item("足した1", "縛れない（判断の中身）"),
          item("足した2", "対象外（調査のみ）"),
        ),
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });

    it("base 側に元からある項目（`- 機械化:` が無い）は見ず、追加した項目にあれば 0 で終わる", () => {
      // given
      commitFiles(
        { "docs/work-logs/2026-09-26/work.md": log(item("前からある")) },
        "old log",
      );
      git(["checkout", "-q", "main"]);
      git(["merge", "-q", "--ff-only", "work"]);
      git(["checkout", "-q", "work"]);
      commitFiles({
        "docs/work-logs/2026-09-26/work.md": log(
          item("前からある"),
          item("足した", "縛れる（Stop フック）"),
        ),
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });

    it("PR の後に base 側で消した項目を、PR の追加と取り違えない（三点 diff）", () => {
      // given
      // 二点（..）だと、base 側で消した項目が HEAD 側から見て「追加」になり、`- 機械化:` の無い見出しとして挙がる。
      commitFiles(
        { "docs/work-logs/2026-09-26/work.md": log(item("前からある")) },
        "old log",
      );
      git(["checkout", "-q", "main"]);
      git(["merge", "-q", "--ff-only", "work"]);
      commitFiles(
        { "docs/work-logs/2026-09-26/work.md": "# log\n" },
        "remove item",
      );
      git(["checkout", "-q", "work"]);
      commitFiles({
        "docs/work-logs/2026-09-28/work.md": log(
          item("足した", "縛れない（理由）"),
        ),
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });

    it("作業ログの名前変更・移動では、元からある項目（`- 機械化:` が無い）を追加として挙げない（diff.renames=false でも）", () => {
      // given
      // 機械化の検査の diff は -M で名前変更を検出する。--no-renames だと移動が「削除 + 追加」になり、この規則より前の
      // ログの項目がすべて追加として挙がって CI が赤になる（reviewer 指摘）。移動と同時に足した項目だけを見る。
      const old = log(item("前からある1"), item("前からある2"));
      commitFiles({ "docs/work-logs/2026-09-26/work.md": old }, "old log");
      git(["checkout", "-q", "main"]);
      git(["merge", "-q", "--ff-only", "work"]);
      git(["checkout", "-q", "work"]);
      git(["config", "diff.renames", "false"]);
      mkdirSync(join(repo, "docs/work-logs/2026-09-28"), { recursive: true });
      git([
        "mv",
        "docs/work-logs/2026-09-26/work.md",
        "docs/work-logs/2026-09-28/work.md",
      ]);
      commitFiles({
        "docs/work-logs/2026-09-28/work.md": `${old}\n${item("移動と同時に足した")}\n`,
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
      expect(listedHeadings(result.stderr)).toEqual(["移動と同時に足した"]);
    });

    it("作業ログの名前変更・移動だけなら 0 で終わる", () => {
      // given
      commitFiles(
        {
          "docs/work-logs/2026-09-26/work.md": log(
            item("前からある1"),
            item("前からある2"),
          ),
        },
        "old log",
      );
      git(["checkout", "-q", "main"]);
      git(["merge", "-q", "--ff-only", "work"]);
      git(["checkout", "-q", "work"]);
      mkdirSync(join(repo, "docs/work-logs/2026-09-28"), { recursive: true });
      git([
        "mv",
        "docs/work-logs/2026-09-26/work.md",
        "docs/work-logs/2026-09-28/work.md",
      ]);
      git(["commit", "-q", "-m", "move log"]);

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });

    it("作業ログ以外の .md で追加した見出しは見ない", () => {
      // given
      commitFiles({
        "docs/work-logs/2026-09-28/work.md": log(
          item("足した", "対象外（調査のみ）"),
        ),
        "docs/adr/x.md": "# x\n\n## 背景\n",
      });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(0);
    });
  });

  // Renovate（bot）の依存更新の PR は作業ログを書けないので、依存のファイルだけを変えた Renovate の PR は通す（Issue #111）。
  describe("Renovate の依存更新の PR（Issue #111）", () => {
    it("作者が renovate[bot] で、依存のファイルだけを変えた PR は作業ログが無くても 0 で終わり、通した理由を出す", () => {
      // given
      commitFiles({
        "package.json": "{}\n",
        "apps/backend/package.json": "{}\n",
        "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
        ".tool-versions": "nodejs 24.21.1\n",
        ".github/workflows/ci.yml": "name: CI\n",
      });

      // when
      const result = run(["main"], pullRequestEvent("renovate[bot]"));

      // then
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("renovate[bot]");
    });

    it("作者が renovate[bot] でも、依存以外のファイルを変えた PR は 1 で終わる", () => {
      // given
      commitFiles({ "package.json": "{}\n", "src.ts": "x\n" });

      // when
      const result = run(["main"], pullRequestEvent("renovate[bot]"));

      // then
      expect(result.status).toBe(1);
    });

    it("作者が renovate[bot] でも、変更が無い PR は 1 で終わる", () => {
      // given: 何も変えていない（work ブランチは main と同じ）

      // when
      const result = run(["main"], pullRequestEvent("renovate[bot]"));

      // then
      expect(result.status).toBe(1);
    });

    it("作者が人間なら、依存のファイルだけでも作業ログが無ければ 1 で終わる", () => {
      // given
      commitFiles({ "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" });

      // when
      const result = run(["main"], pullRequestEvent("d-kanai"));

      // then
      expect(result.status).toBe(1);
    });

    it("作者の名前が renovate[bot] に似ているだけ（renovate）なら 1 で終わる", () => {
      // given
      commitFiles({ "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" });

      // when
      const result = run(["main"], pullRequestEvent("renovate"));

      // then
      expect(result.status).toBe(1);
    });

    it("GITHUB_EVENT_PATH が無い（手元での実行）なら、依存のファイルだけでも 1 で終わる", () => {
      // given
      commitFiles({ "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" });

      // when
      const result = run(["main"]);

      // then
      expect(result.status).toBe(1);
    });

    it("GITHUB_EVENT_PATH のファイルが JSON でなければ、依存のファイルだけでも 1 で終わる", () => {
      // given
      commitFiles({ "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" });
      const path = join(tmp, "broken.json");
      writeFileSync(path, "not json");

      // when
      const result = run(["main"], { GITHUB_EVENT_PATH: path });

      // then
      expect(result.status).toBe(1);
    });

    it.each([
      ["apps の下の深い階層の package.json", "apps/backend/src/package.json"],
      ["別のディレクトリの pnpm-lock.yaml", "docs/pnpm-lock.yaml"],
      ["workflows の下のディレクトリ", ".github/workflows/sub/ci.yml"],
      ["名前の後ろに続きがある", "package.json.bak"],
    ])(
      "依存のファイルに似た名前（%s: %s）は依存のファイルとして数えず 1 で終わる",
      (_, path) => {
        // given
        commitFiles({ [path]: "x\n" });

        // when
        const result = run(["main"], pullRequestEvent("renovate[bot]"));

        // then
        expect(result.status).toBe(1);
      },
    );
  });
});
