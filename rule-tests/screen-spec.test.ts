// @vitest-environment node
// WHY: vitest.config.mts の既定環境は jsdom（コンポーネントテスト用）。このテストはファイルの一覧とソースを文字列として読むだけで
//   DOM を使わないため、node 環境で動かす。
import {
  type Dirent,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterAll, expect } from "vitest";
import { casesByName } from "./case-table";
import { containsForbiddenWord } from "./feature-business-language";

// 画面仕様（.claude/rules/quality/testing.md の「画面仕様」、ADR docs/adr/quality/20261004-screen-spec-with-real-api.md）の置き場所と
//   形を、ファイルの一覧とソースで機械的に検査するテスト。
// 画面仕様 = 画面 1 つ（apps/frontend_customer/features/<f>/screens/<name>/<name>.tsx）の表示項目・インタラクション・異常系を、人が読む
//   仕様として <name>.feature に業務の言葉で書き、step の実装（<name>.screen-spec.test.tsx）が本物の画面・hook・api/ と、route.ts を
//   通した本番の handler・実 Postgres で確かめるテスト。`*` の 1 行 = 1 振る舞い = 1 テスト（API 仕様と同じ）。
// 違反にするもの:
//   - screen-spec-placement: apps/frontend_customer/ の下の *.feature と *.screen-spec.test.*（拡張子は広く取る）は、
//     features/<f>/screens/<name>/ の直下の <name>.feature と <name>.screen-spec.test.tsx だけ。画面のディレクトリの外・名前が
//     ディレクトリと違う・入れ子・.ts の step は違反。
//     WHY 画面のディレクトリに置く: 画面を消すときに仕様もディレクトリごと消せる（画面・hook・辞書と同じ。frontend.md の「feature」）。
//       名前をディレクトリと同じにすると、どの画面の仕様かがファイル名で分かり、対の検査ができる。
//     WHY .tsx だけ: 画面を render するので JSX を書く。置き場所を 1 つにすると、ほかの検査（Biome の ../ の例外・test-doubles の
//       db-tests-in-infra-only の例外）もこの名前に絞れる。
//   - screen-spec-pair: 画面（features/<f>/screens/<name>/<name>.tsx）ごとに <name>.feature と <name>.screen-spec.test.tsx の両方が要る
//     （無いほうを画面のファイルの違反にする）。画面の無い .feature・step の実装は、そのファイルの違反にする。
//     WHY: 画面ごとに、表示・操作・異常系の仕様を漏れなく持つ（daiki の要望。api ファイルごとの API 仕様と同じ）。.feature だけでは
//       何も実行されず、step の実装だけでは読む仕様が無い。
//   以下は .feature（置き場所の正しいもの）の中身の規則。行の読み方は API 仕様（rule-tests/api-spec.test.ts）と同じ:
//   - screen-spec-scenario-heading: `Scenario:` の見出しが SCENARIO_HEADINGS（表示項目 / インタラクション / 異常系）のどれでもない、
//     同じ見出しの 2 つ目以降は違反。
//   - screen-spec-scenario-order: 見出しが一覧の順でなければ、前の見出しより一覧で前に来る見出しの行を違反にする。
//   - screen-spec-scenario-required: 一覧の見出しのうち無いものを、ファイルの違反にする（1 つにつき 1 件）。
//     WHY 3 つの見出しを順に 1 回ずつ: 画面の仕様を「何が出るか（保存された内容で変わる部分）」「何ができるか（クリック・入力と送信・
//       画面のギミックのすべて）」「失敗したら何が出るか」の 3 つで書く（daiki の要望）。どの画面も同じ場所を拾い読みでき、観点の抜けが
//       見出しで分かる。該当の無い観点も見出しを省かない（無いことを書く）ことで、書き忘れと区別する。
//   - screen-spec-keyword: `Scenario Outline:` / `Scenario Template:` / `Rule:` / `Background:` / `Example:` / `Examples:` / `Scenarios:`
//     と `# language:` の行は違反（API 仕様と同じ。別名で見出しの検査を逃れさせない）。
//   - screen-spec-tag: `@` で始まる行（タグ）は違反（既定の excludeTags で skip され、黙って緑になる）。
//   - screen-spec-step-star: `*` 以外の step（Given / When / Then / And / But）と、`*` の無い Scenario は違反。
//   - screen-spec-business-language: `#` のコメント・空行・Feature と Scenario の見出しを除く行に、FORBIDDEN_WORDS_IN_FEATURE
//     （rule-tests/feature-business-language.ts。API 仕様・E2E と共有）の禁止語があれば違反。
//     WHY: daiki は .feature を項目として読み、コードは読まない。保存先の表・状態コードなどの確かめ方は step の実装に閉じる。
//   以下は step の実装（置き場所の正しい <name>.screen-spec.test.tsx）の中身の規則:
//   - screen-spec-mock-only-navigation: `vi.mock(` / `vi.doMock(` の第 1 引数が文字列の "next/navigation" でなければ、その行の違反。
//     WHY: 画面仕様は画面 → API → 保存先のつながりで確かめる（daiki の要望「step はモックを使わない」）。差し替えてよいのは、テストの中では
//       動かない次の画面への遷移（next/navigation の useRouter など）だけ。
//   - screen-spec-no-feature-api: feature の api/ の <x>-api（apps/frontend_customer/features/<f>/api/<x>-api。TodoApi など）を import しない
//     （import type・dynamic import()・export … from も）。
//     WHY: api/ は画面とネットワークの境界で、画面の単体テストが vi.mock で差し替える場所。画面仕様は api/ を通るので、step から直接
//       呼ぶ（前提を API で作る）ことも差し替えることもしない。前提の行はテストデータビルダーで入れる。
//   - screen-spec-no-in-memory: *.in-memory（InMemory の Repository）を import しない（API 仕様と同じ。実 DB で確かめる）。
//   - screen-spec-uses-real-database: apps/backend/test-support/database（TestDatabase）を値で import する。
//   - screen-spec-uses-route-fetch: apps/frontend_customer/test-support/route-fetch（RouteFetch。fetch を Route Handler の直接の呼び出しに
//     替える）を値で import する。
//     WHY 2 つを求める: 実 DB の準備とネットワークの差し替えの 2 つが、モック無しで画面から保存先までをつなぐ仕組み（daiki の要望
//       「backend と Postgres もつなぐ」「差し替えは fetch の基盤の 1 か所で」）。型だけの import では何も用意しない。
//   - screen-spec-load-feature: `loadFeature("./<name>.feature")`（対の .feature を第 2 引数なしで読む）が 1 つ以上要る（無ければファイルの
//     違反）。対でない・第 2 引数のある呼び出し、`loadFeature as` の別名、setVitestCucumberConfiguration・loadFeatureFromText・
//     defineFeature はその行の違反（API 仕様と同じ。言語の切り替えで見出しの検査を逃れさせない）。
//   - screen-spec-no-skip: `.skip` / `.only` / `.skipIf` / `.runIf` と includeTags / excludeTags はその行の違反（API 仕様と同じ）。
// コメントの扱い: .ts は行コメントとブロックコメントの中を見ない。モック・loadFeature・skip の検査は文字列の中も見ない（第 1 引数・
//   loadFeature の引数の文字列だけは形を読む）。
// 限界（字句の推定。API 仕様と同じ方式）:
//   - .feature: 行ごとに見るので docstring の中も行の種類を区別しない。`*` の文が振る舞い 1 つか・静的な文言を書いていないかは
//     見ない（reviewer が見る）。禁止語は一覧の語だけ。
//   - step の実装: vi を別名で import する・`vi["mock"]`・require・変数を渡す import(x) は見ない。`vi.spyOn`・`vi.stubGlobal`・
//     `vi.fn` は止めない（fetch の差し替えは route-fetch を使うことを求めるだけで、ほかの差し替えを足していないかは reviewer が見る）。
//     step が実際に画面を操作し、保存された行を確かめているかは見ない（reviewer が見る）。
// 列挙: apps/frontend_customer/ の下（node_modules・.next は除く）の *.feature・*.screen-spec.test.*・画面のファイル。列挙が 0 件なら
//   実ファイルのテストで失敗させる（0 件だと違反も 0 件で常に緑になる）。
// WHY 文字列で判定する（AST にしない）: 見るのはパス・行の先頭のキーワード・import の参照先・呼び出しの第 1 引数だけで、正規表現で
//   足りる（rule-tests/api-spec.test.ts と同じ）。

type ScreenSpecRuleId =
  | "screen-spec-placement"
  | "screen-spec-pair"
  | "screen-spec-scenario-heading"
  | "screen-spec-scenario-order"
  | "screen-spec-scenario-required"
  | "screen-spec-keyword"
  | "screen-spec-tag"
  | "screen-spec-step-star"
  | "screen-spec-business-language"
  | "screen-spec-mock-only-navigation"
  | "screen-spec-no-feature-api"
  | "screen-spec-no-in-memory"
  | "screen-spec-uses-real-database"
  | "screen-spec-uses-route-fetch"
  | "screen-spec-load-feature"
  | "screen-spec-no-skip";

// line: ファイルの中の位置で決まる違反だけ持つ（1 始まり）。note: ファイルの違反の理由（無いもの）。
type ScreenSpecViolation = {
  rule: ScreenSpecRuleId;
  line?: number;
  note?: string;
};

const FRONTEND_DIR = "apps/frontend_customer";

// 見出しの一覧（この順に 1 回ずつ）。
const SCENARIO_HEADINGS: readonly string[] = [
  "表示項目",
  "インタラクション",
  "異常系",
];

// 列挙で入らないディレクトリ（依存とビルドの出力。自分たちが書くファイルではない）。
const SKIPPED_DIRS = new Set(["node_modules", ".next"]);

const FEATURE_FILE = /\.feature$/;
// 画面仕様の step の名前（置き場所の検査のため、拡張子は広く取る）。
const STEP_FILE = /\.screen-spec\.test\.[cm]?[jt]sx?$/;
// 置き場所の正しい .feature・step の実装（1: 画面のディレクトリ、2: 画面の名前、3: 種類）。
const PLACED = new RegExp(
  `^(${FRONTEND_DIR}/features/[^/]+/screens/([^/]+))/\\2\\.(feature|screen-spec\\.test\\.tsx)$`,
);
// 画面のファイル（1: 画面のディレクトリ、2: 画面の名前）。
const SCREEN_FILE = new RegExp(
  `^(${FRONTEND_DIR}/features/[^/]+/screens/([^/]+))/\\2\\.tsx$`,
);

const TEST_DATABASE_MODULE = "apps/backend/test-support/database";
const ROUTE_FETCH_MODULE = `${FRONTEND_DIR}/test-support/route-fetch`;
// feature の api/ の <x>-api（拡張子なしのリポジトリ相対）。
const FEATURE_API_MODULE = new RegExp(
  `^${FRONTEND_DIR}/features/[^/]+/api/[^/]+-api$`,
);
// モックしてよい唯一のモジュール（遷移）。
const NAVIGATION_MODULE = "next/navigation";

function isTarget(path: string): boolean {
  return (
    FEATURE_FILE.test(path) || STEP_FILE.test(path) || SCREEN_FILE.test(path)
  );
}

// 画面のディレクトリと名前から、対の 3 つ（画面・.feature・step の実装）のパス。
function pairOf(dir: string, name: string) {
  return {
    screen: `${dir}/${name}.tsx`,
    feature: `${dir}/${name}.feature`,
    steps: `${dir}/${name}.screen-spec.test.tsx`,
  };
}

// 対の違反。画面には .feature と step の実装の両方が要り、.feature と step の実装には画面が要る。
// WHY 無いものを報告する場所を分ける: 画面の .feature が無いことを .feature の側では報告できない（ファイルが無い）ので画面に、画面が
//   無いことは .feature・step の側に出す。同じ欠けを 2 か所で重ねて出さない。
function findPairViolations(
  path: string,
  files: ReadonlySet<string>,
): ScreenSpecViolation[] {
  const screen = SCREEN_FILE.exec(path);
  if (screen !== null) {
    const pair = pairOf(screen[1] ?? "", screen[2] ?? "");
    return [pair.feature, pair.steps]
      .filter((needed) => !files.has(needed))
      .map((needed) => ({
        rule: "screen-spec-pair",
        note: `${posix.basename(needed)} が無い`,
      }));
  }
  const placed = PLACED.exec(path);
  const pair = pairOf(placed?.[1] ?? "", placed?.[2] ?? "");
  return files.has(pair.screen)
    ? []
    : [
        {
          rule: "screen-spec-pair",
          note: `${posix.basename(pair.screen)} が無い`,
        },
      ];
}

// .feature の 1 行の種類（rule-tests/api-spec.test.ts の featureLineKind と同じ）。
type FeatureLineKind =
  | "skip"
  | "language"
  | "tag"
  | "scenario"
  | "keyword"
  | "keyword-step"
  | "star"
  | "text";

function featureLineKind(line: string): FeatureLineKind {
  if (/^\s*#\s*language\s*:/i.test(line)) {
    return "language";
  }
  if (/^\s*(?:#|$)/.test(line) || /^\s*Feature\s*:/.test(line)) {
    return "skip";
  }
  if (/^\s*@/.test(line)) {
    return "tag";
  }
  if (/^\s*Scenario\s*:/.test(line)) {
    return "scenario";
  }
  if (
    /^\s*(?:Scenario Outline|Scenario Template|Rule|Background|Examples?|Scenarios)\s*:/.test(
      line,
    )
  ) {
    return "keyword";
  }
  if (/^\s*(?:Given|When|Then|And|But)(?:\s|$)/.test(line)) {
    return "keyword-step";
  }
  return /^\s*\*(?:\s|$)/.test(line) ? "star" : "text";
}

const RULE_OF_LINE_KIND: Partial<Record<FeatureLineKind, ScreenSpecRuleId>> = {
  language: "screen-spec-keyword",
  tag: "screen-spec-tag",
  keyword: "screen-spec-keyword",
  "keyword-step": "screen-spec-step-star",
};

// 禁止語を見ない行の種類（見出しは固定の一覧が言葉を決める）。
const LINE_KINDS_WITHOUT_WORDING: ReadonlySet<FeatureLineKind> = new Set([
  "skip",
  "language",
  "scenario",
]);

type ScenarioHeading = { line: number; name: string };

// 見出しの並びの違反（screen-spec-scenario-heading・order・required）。
// WHY 一覧に無い見出しと同じ見出しの 2 つ目を順と数えに入れない: heading の違反なので、ほかの規則で重ねて数えない。
function headingViolations(
  headings: readonly ScenarioHeading[],
): ScreenSpecViolation[] {
  const seen = new Set<string>();
  const violations: ScreenSpecViolation[] = [];
  let furthest = -1;
  for (const heading of headings) {
    const position = SCENARIO_HEADINGS.indexOf(heading.name);
    if (position === -1 || seen.has(heading.name)) {
      violations.push({
        rule: "screen-spec-scenario-heading",
        line: heading.line,
      });
    } else if (position < furthest) {
      violations.push({
        rule: "screen-spec-scenario-order",
        line: heading.line,
      });
    }
    seen.add(heading.name);
    furthest = Math.max(furthest, position);
  }
  const missing = SCENARIO_HEADINGS.filter((name) => !seen.has(name)).map(
    (name): ScreenSpecViolation => ({
      rule: "screen-spec-scenario-required",
      note: `見出し ${name} が無い`,
    }),
  );
  return [...violations, ...missing];
}

// .feature の中身の違反（行の順。ファイルの違反（足りない見出し）は最後）。
function findFeatureContentViolations(source: string): ScreenSpecViolation[] {
  // WHY \r\n・\r・\n のどれでも分ける: vitest-cucumber は readline で読み、単独の \r でも行を分ける（api-spec.test.ts と同じ）。
  const lines = source.split(/\r\n|\r|\n/);
  const violations: ScreenSpecViolation[] = [];
  const headings: ScenarioHeading[] = [];
  let scenario: { line: number; stars: number } | undefined;
  const closeScenario = () => {
    if (scenario !== undefined && scenario.stars === 0) {
      violations.push({ rule: "screen-spec-step-star", line: scenario.line });
    }
    scenario = undefined;
  };
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const kind = featureLineKind(line);
    if (kind === "scenario" || kind === "keyword") {
      closeScenario();
    }
    const rule = RULE_OF_LINE_KIND[kind];
    if (rule !== undefined) {
      violations.push({ rule, line: lineNumber });
    }
    if (kind === "scenario") {
      scenario = { line: lineNumber, stars: 0 };
      headings.push({
        line: lineNumber,
        name: line.slice(line.indexOf(":") + 1).trim(),
      });
    }
    if (kind === "star" && scenario !== undefined) {
      scenario.stars += 1;
    }
    if (!LINE_KINDS_WITHOUT_WORDING.has(kind) && containsForbiddenWord(line)) {
      violations.push({
        rule: "screen-spec-business-language",
        line: lineNumber,
      });
    }
  });
  closeScenario();
  violations.push(...headingViolations(headings));
  // WHY 並べ直す: `*` の無い Scenario の違反は次の Scenario で分かり、見出しの違反は読み終えてから積む。ファイルの違反（行なし）は最後。
  return violations.sort(
    (a, b) =>
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER),
  );
}

// コメントを消す（文字列は残す。改行は残して行番号を変えない。api-spec.test.ts の stripComments と同じ）。
function stripComments(source: string): string {
  const stringOrComment =
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  return source.replace(stringOrComment, (match, literal?: string) =>
    literal === undefined ? match.replace(/[^\n]/g, " ") : literal,
  );
}

// 文字列の中身を空白にする（改行と長さは残す。api-spec.test.ts の blankStrings と同じ）。
function blankStrings(code: string): string {
  return code.replace(
    /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
    (literal) => literal.replace(/[^\n]/g, " "),
  );
}

function lineAt(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}

// import の参照先と、値の名前を取る静的な import か（value）。type: `import type` か、すべてに inline の type。
//   other: export … from・副作用だけの import・dynamic import()。
type ImportRef = {
  specifier: string;
  kind: "value" | "type" | "other";
  line: number;
};

// `{ type A, type B }` のように、すべてに inline の type が付いているか（api-spec.test.ts と同じ）。
function isInlineTypeOnly(clause: string): boolean {
  const braces = /^\{([\s\S]*)\}$/.exec(clause.trim());
  const names = (braces?.[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names.length > 0 && names.every((name) => /^type\s/.test(name));
}

// ソース（コメントを消したもの）の import / export … from / import "…" / import("…") の参照先（api-spec.test.ts の
//   extractImports と同じ正規表現）。
function extractImports(code: string): ImportRef[] {
  const staticImports = [
    ...code.matchAll(
      /(?:^|;)\s*(import|export)\s+(type\s+)?((?:(?!^\s*(?:import|export)\b)[\w\s{},*$])*?)\s*\bfrom\s*(["'])([^"'\n]+)\4/gm,
    ),
  ].map((match): ImportRef => {
    const [whole, keyword, typeKeyword, clause, , specifier = ""] = match;
    return {
      specifier,
      kind:
        keyword === "export"
          ? "other"
          : typeKeyword !== undefined || isInlineTypeOnly(clause ?? "")
            ? "type"
            : "value",
      line: lineAt(code, match.index + whole.lastIndexOf(specifier)),
    };
  });
  const otherImports = (pattern: RegExp) =>
    [...code.matchAll(pattern)].map(
      (match): ImportRef => ({
        specifier: match[2] ?? "",
        kind: "other",
        line: lineAt(code, match.index),
      }),
    );
  return [
    ...staticImports,
    ...otherImports(/\bimport\s*(["'])([^"'\n]+)\1/g),
    ...otherImports(/\bimport\s*\(\s*(["'`])([^"'`$\n]+)\1\s*[,)]/g),
  ];
}

// 参照先をリポジトリ相対のパス（拡張子なし）にする。パッケージは undefined。
// WHY `@/` を apps/frontend_customer に解決する: 画面仕様は frontend のファイルで、自前のコードは `@/` で書く（frontend.md の
//   「import と exports」）。backend の test-support だけは exports に無いので相対パスで書く（biome.json の画面仕様の override）。
function resolveSpecifier(from: string, specifier: string): string | undefined {
  const resolved = specifier.startsWith(".")
    ? posix.join(posix.dirname(from), specifier)
    : specifier.startsWith("@/")
      ? posix.join(FRONTEND_DIR, specifier.slice(2))
      : undefined;
  return resolved?.replace(/\.[cm]?[jt]sx?$/, "");
}

// vi.mock / vi.doMock の違反（第 1 引数が文字列の "next/navigation" でないもの）。code はコメントを消したもの。
function findMockViolations(code: string): ScreenSpecViolation[] {
  return [...blankStrings(code).matchAll(/\bvi\s*\.\s*(?:mock|doMock)\s*\(/g)]
    .filter((call) => {
      const first = /^\s*(["'])([^"'\n]*)\1\s*[,)]/.exec(
        code.slice(call.index + call[0].length),
      );
      return first?.[2] !== NAVIGATION_MODULE;
    })
    .map((call) => ({
      rule: "screen-spec-mock-only-navigation",
      line: lineAt(code, call.index),
    }));
}

// loadFeature の違反（api-spec.test.ts の findLoadFeatureViolations と同じ形）。paired は "./<name>.feature"。
function findLoadFeatureViolations(
  code: string,
  paired: string,
): ScreenSpecViolation[] {
  const blanked = blankStrings(code);
  const calls = [...blanked.matchAll(/\bloadFeature\s*\(/g)].map((match) => {
    const args = /^loadFeature\s*\(\s*(["'])([^"'\n]*)\1\s*\)/.exec(
      code.slice(match.index),
    );
    return { index: match.index, paired: args?.[2] === paired };
  });
  const others = [
    ...blanked.matchAll(
      /\bloadFeature\s+as\b|\b(?:setVitestCucumberConfiguration|loadFeatureFromText|defineFeature)\b/g,
    ),
  ].map((match) => match.index);
  const lines = [
    ...calls.filter((call) => !call.paired).map((call) => call.index),
    ...others,
  ].map(
    (index): ScreenSpecViolation => ({
      rule: "screen-spec-load-feature",
      line: lineAt(code, index),
    }),
  );
  return calls.some((call) => call.paired)
    ? lines
    : [
        ...lines,
        { rule: "screen-spec-load-feature", note: `${paired} を読んでいない` },
      ];
}

function findSkipViolations(code: string): ScreenSpecViolation[] {
  return [
    ...blankStrings(code).matchAll(
      /(?<!\.)\.\s*(?:skip|only|skipIf|runIf)\b|\b(?:includeTags|excludeTags)\b/g,
    ),
  ].map((match) => ({
    rule: "screen-spec-no-skip",
    line: lineAt(code, match.index),
  }));
}

// step の実装の中身の違反（行の順。ファイルの違反（行なし）は最後）。
function findStepContentViolations(
  path: string,
  source: string,
): ScreenSpecViolation[] {
  const code = stripComments(source);
  const imports = extractImports(code).map((ref) => ({
    ...ref,
    module: resolveSpecifier(path, ref.specifier),
  }));
  const importViolations = imports.flatMap((ref): ScreenSpecViolation[] => [
    ...(ref.module !== undefined && FEATURE_API_MODULE.test(ref.module)
      ? [{ rule: "screen-spec-no-feature-api" as const, line: ref.line }]
      : []),
    ...(/\.in-memory$/.test(ref.specifier.replace(/\.[cm]?[jt]sx?$/, ""))
      ? [{ rule: "screen-spec-no-in-memory" as const, line: ref.line }]
      : []),
  ]);
  const importsValue = (module: string) =>
    imports.some((ref) => ref.kind === "value" && ref.module === module);
  const required: ScreenSpecViolation[] = [
    ...(importsValue(TEST_DATABASE_MODULE)
      ? []
      : [
          {
            rule: "screen-spec-uses-real-database" as const,
            note: `${TEST_DATABASE_MODULE} を値で import していない`,
          },
        ]),
    ...(importsValue(ROUTE_FETCH_MODULE)
      ? []
      : [
          {
            rule: "screen-spec-uses-route-fetch" as const,
            note: `${ROUTE_FETCH_MODULE} を値で import していない`,
          },
        ]),
  ];
  const name = posix.basename(path).replace(STEP_FILE, "");
  return [
    ...findMockViolations(code),
    ...importViolations,
    ...findLoadFeatureViolations(code, `./${name}.feature`),
    ...findSkipViolations(code),
    ...required,
  ].sort(
    (a, b) =>
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER),
  );
}

// path の違反。置き場所が違えば置き場所の違反だけを返す（中身と対は見ない）。
function findScreenSpecViolations(
  path: string,
  source: string,
  files: ReadonlySet<string>,
): ScreenSpecViolation[] {
  if (SCREEN_FILE.test(path)) {
    return findPairViolations(path, files);
  }
  if (!PLACED.test(path)) {
    return [{ rule: "screen-spec-placement" }];
  }
  return [
    ...(FEATURE_FILE.test(path)
      ? findFeatureContentViolations(source)
      : findStepContentViolations(path, source)),
    ...findPairViolations(path, files),
  ];
}

// root の下の apps/frontend_customer の対象のファイル（リポジトリ相対の / 区切り、名前順）。
// WHY root を引数で受け取る: 本番（リポジトリ直下）と fixture（一時ディレクトリ）で同じ列挙を通すため。
function listScreenSpecTargets(root: string): string[] {
  const walk = (relative: string): string[] => {
    let entries: Dirent[];
    try {
      entries = readdirSync(join(root, relative), { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const path = posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRS.has(entry.name) ? [] : walk(path);
      }
      return entry.isFile() && isTarget(path) ? [path] : [];
    });
  };
  return walk(FRONTEND_DIR).sort();
}

// 違反を「規則: パス(:行)（理由）」の文字列にして返す。
function collectScreenSpecViolations(root: string): string[] {
  const paths = listScreenSpecTargets(root);
  const files = new Set(paths);
  return paths.flatMap((path) =>
    findScreenSpecViolations(
      path,
      readFileSync(join(root, path), "utf8"),
      files,
    ).map(({ rule, line, note }) => {
      const where = line === undefined ? path : `${path}:${line}`;
      return note === undefined
        ? `${rule}: ${where}`
        : `${rule}: ${where}（${note}）`;
    }),
  );
}

const repoRoot = join(import.meta.dirname, "..");

// テストの入力を行の配列で書き、1 行目を 1 として違反の行番号を読みやすくする。
const source = (...lines: string[]) => lines.join("\n");

const SCREENS = "apps/frontend_customer/features/todo/screens";
const SCREEN_DIR = `${SCREENS}/x-screen`;
const SCREEN = `${SCREEN_DIR}/x-screen.tsx`;
const FEATURE = `${SCREEN_DIR}/x-screen.feature`;
const STEPS = `${SCREEN_DIR}/x-screen.screen-spec.test.tsx`;

// 業務の言葉だけで、3 つの見出しを順に置いた .feature（must reject の例は、これに違反を足す）。
const GOOD_FEATURE = [
  "# 冒頭のコメントは技術の言葉（DB・GET）があってもよい",
  "Feature: Todo の一覧画面",
  "  一覧の説明の行",
  "  Scenario: 表示項目",
  "    * 保存済みの Todo が並ぶ",
  "  Scenario: インタラクション",
  "    * 追加すると保存される",
  "  Scenario: 異常系",
  "    * 101 文字のタイトルは長すぎると出る",
];

// 違反の無い step の実装（must reject の例は、これに行を足す）。
const GOOD_STEPS = [
  'import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";',
  'import { vi } from "vitest";',
  'import { TestDatabase } from "../../../../../backend/test-support/database";',
  'import { RouteFetch } from "@/test-support/route-fetch";',
  'vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));',
  'const feature = await loadFeature("./x-screen.feature");',
  "describeFeature(feature, () => {});",
];

// WHY OS の一時ディレクトリに置く: リポジトリ内に置くと本番の検査や Biome・git の差分に混ざる。afterAll で消す。
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "screen-spec-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const feature = await loadFeature("./screen-spec.feature");

describeFeature(feature, ({ Scenario }) => {
  Scenario(
    "置き場所と対（findScreenSpecViolations の screen-spec-placement・screen-spec-pair）",
    ({ And }) => {
      And(
        "画面のディレクトリの .feature と step の実装と、画面仕様でないファイルは違反なし（画面・hook のテスト・ほかの名前の .tsx など）",
        () => {
          // given: 対の 3 つがそろっている
          const all = new Set([SCREEN, FEATURE, STEPS]);
          const cases: [string, string, string][] = [
            ["画面", SCREEN, ""],
            [".feature", FEATURE, source(...GOOD_FEATURE)],
            ["step の実装", STEPS, source(...GOOD_STEPS)],
          ];
          const outside = [
            `${SCREEN_DIR}/x-screen.test.tsx`,
            `${SCREEN_DIR}/x-screen.hook.test.ts`,
            `${SCREEN_DIR}/x-screen.hook.ts`,
            `${SCREEN_DIR}/other.tsx`,
            "apps/frontend_customer/features/todo/components/x.tsx",
          ];

          // when
          const result = casesByName(cases, ([, path, text]) =>
            findScreenSpecViolations(path, text, all),
          );
          const targets = outside.filter(isTarget);

          // then
          expect(result).toEqual(casesByName(cases, () => []));
          expect(targets).toEqual([]);
        },
      );

      And(
        "画面のディレクトリの外・名前の違う・拡張子の違う .feature と step の実装は、置き場所の違反だけになる（中身と対は見ない）",
        () => {
          // given
          const cases: [string, string][] = [
            ["frontend の直下の .feature", "apps/frontend_customer/x.feature"],
            [
              "feature の直下の .feature",
              "apps/frontend_customer/features/todo/x-screen.feature",
            ],
            ["screens の直下の .feature", `${SCREENS}/x-screen.feature`],
            [
              "名前がディレクトリと違う .feature",
              `${SCREEN_DIR}/other.feature`,
            ],
            [
              "入れ子のディレクトリの .feature",
              `${SCREEN_DIR}/nested/nested.feature`,
            ],
            [
              "名前がディレクトリと違う step",
              `${SCREEN_DIR}/other.screen-spec.test.tsx`,
            ],
            [".ts の step", `${SCREEN_DIR}/x-screen.screen-spec.test.ts`],
            [
              "components の step",
              "apps/frontend_customer/features/todo/components/x.screen-spec.test.tsx",
            ],
            [
              "shared の step",
              "apps/frontend_customer/shared/ui/x.screen-spec.test.tsx",
            ],
          ];

          // when
          const result = casesByName(cases, ([, path]) =>
            findScreenSpecViolations(
              path,
              source("Feature: DB", "  Scenario: x", "    Given 状態 201"),
              new Set([path]),
            ),
          );

          // then
          expect(result).toEqual(
            casesByName(cases, () => [{ rule: "screen-spec-placement" }]),
          );
        },
      );

      And(
        "画面に .feature か step の実装が無い・画面の無い .feature と step の実装は、対の違反になる",
        () => {
          // given
          const cases: [string, string, string[], ScreenSpecViolation[]][] = [
            [
              "画面に .feature も step も無い",
              SCREEN,
              [SCREEN],
              [
                { rule: "screen-spec-pair", note: "x-screen.feature が無い" },
                {
                  rule: "screen-spec-pair",
                  note: "x-screen.screen-spec.test.tsx が無い",
                },
              ],
            ],
            [
              "画面に step だけが無い",
              SCREEN,
              [SCREEN, FEATURE],
              [
                {
                  rule: "screen-spec-pair",
                  note: "x-screen.screen-spec.test.tsx が無い",
                },
              ],
            ],
            [
              "画面の無い .feature",
              FEATURE,
              [FEATURE, STEPS],
              [{ rule: "screen-spec-pair", note: "x-screen.tsx が無い" }],
            ],
            [
              "画面の無い step",
              STEPS,
              [FEATURE, STEPS],
              [{ rule: "screen-spec-pair", note: "x-screen.tsx が無い" }],
            ],
          ];

          // when
          const result = casesByName(cases, ([, path, present]) =>
            findScreenSpecViolations(
              path,
              path === FEATURE
                ? source(...GOOD_FEATURE)
                : source(...GOOD_STEPS),
              new Set(present),
            ),
          );

          // then
          expect(result).toEqual(
            casesByName(cases, ([, , , expected]) => expected),
          );
        },
      );
    },
  );

  Scenario(
    ".feature の中身（findFeatureContentViolations）: must pass",
    ({ And }) => {
      And(
        "固定の見出しの Scenario を順に 1 回ずつ置き、箇条書きの step を業務の言葉だけで書いた .feature は違反なし（コメントの技術の言葉・説明の行・助数詞付きの 3 桁の数）",
        () => {
          // given
          const cases: [string, string][] = [
            [
              "業務の言葉だけで 3 つの見出しを順に置く",
              source(...GOOD_FEATURE),
            ],
            ["CRLF の行末", GOOD_FEATURE.join("\r\n")],
            [
              "Scenario の中のコメントと空行",
              source(
                ...GOOD_FEATURE.slice(0, 5),
                "    # 確かめ方は step に閉じる（保存先の表を読む）",
                "",
                ...GOOD_FEATURE.slice(5),
              ),
            ],
          ];

          // when
          const result = casesByName(cases, ([, text]) =>
            findFeatureContentViolations(text),
          );

          // then
          expect(result).toEqual(casesByName(cases, () => []));
        },
      );
    },
  );

  Scenario(
    ".feature の中身（findFeatureContentViolations）: must reject",
    ({ And }) => {
      And(
        "一覧に無い見出し・同じ見出しの 2 つ目・順の違う見出し・足りない見出しは、見出しの違反になる",
        () => {
          // given
          const cases: [string, string[], ScreenSpecViolation[]][] = [
            [
              "一覧に無い見出し",
              [...GOOD_FEATURE, "  Scenario: 遷移", "    * 一覧に戻る"],
              [{ rule: "screen-spec-scenario-heading", line: 10 }],
            ],
            [
              "同じ見出しの 2 つ目",
              [...GOOD_FEATURE, "  Scenario: 異常系", "    * 失敗が出る"],
              [{ rule: "screen-spec-scenario-heading", line: 10 }],
            ],
            [
              "順の違う見出し（異常系の後のインタラクション）",
              [
                "Feature: x",
                "  Scenario: 表示項目",
                "    * a",
                "  Scenario: 異常系",
                "    * b",
                "  Scenario: インタラクション",
                "    * c",
              ],
              [{ rule: "screen-spec-scenario-order", line: 6 }],
            ],
            [
              "足りない見出し（インタラクションと異常系）",
              ["Feature: x", "  Scenario: 表示項目", "    * a"],
              [
                {
                  rule: "screen-spec-scenario-required",
                  note: "見出し インタラクション が無い",
                },
                {
                  rule: "screen-spec-scenario-required",
                  note: "見出し 異常系 が無い",
                },
              ],
            ],
          ];

          // when
          const result = casesByName(cases, ([, lines]) =>
            findFeatureContentViolations(source(...lines)),
          );

          // then
          expect(result).toEqual(
            casesByName(cases, ([, , expected]) => expected),
          );
        },
      );

      And(
        "使わないキーワード・タグ・箇条書きでない step・step の無い Scenario・技術の言葉は、その行の違反になる",
        () => {
          // given: GOOD_FEATURE（9 行）の後に 10 行目として足す
          const cases: [string, string, ScreenSpecRuleId][] = [
            ["Background", "  Background: 前提", "screen-spec-keyword"],
            [
              "Scenario Outline",
              "  Scenario Outline: x",
              "screen-spec-keyword",
            ],
            ["Rule", "  Rule: x", "screen-spec-keyword"],
            ["# language:", "# language: ja", "screen-spec-keyword"],
            ["タグ", "  @skip", "screen-spec-tag"],
            ["Given の step", "    Given Todo がある", "screen-spec-step-star"],
            ["And の step", "    And 一覧に出る", "screen-spec-step-star"],
            [
              "技術の言葉（DB）",
              "    * DB に保存される",
              "screen-spec-business-language",
            ],
            [
              "状態コード",
              "    * 404 が返ると出る",
              "screen-spec-business-language",
            ],
            [
              "説明の行の技術の言葉（POST）",
              "  POST で送る",
              "screen-spec-business-language",
            ],
          ];

          // when
          const result = casesByName(cases, ([, line]) =>
            findFeatureContentViolations(source(...GOOD_FEATURE, line)),
          );
          const emptyScenario = findFeatureContentViolations(
            source(
              "Feature: x",
              "  Scenario: 表示項目",
              "  Scenario: インタラクション",
              "    * a",
              "  Scenario: 異常系",
              "    * b",
            ),
          );

          // then
          expect(result).toEqual(
            casesByName(cases, ([, , rule]) => [{ rule, line: 10 }]),
          );
          expect(emptyScenario).toEqual([
            { rule: "screen-spec-step-star", line: 2 },
          ]);
        },
      );
    },
  );

  Scenario(
    "step の実装の中身（findStepContentViolations）: must pass",
    ({ And }) => {
      And(
        "実 DB の準備と fetch の差し替えを値で import し、対の .feature を読み、遷移だけをモックする step の実装は違反なし（複数行の import・拡張子付き・モック無し・ほかの test-support）",
        () => {
          // given
          const cases: [string, string[]][] = [
            ["遷移をモックする", GOOD_STEPS],
            [
              "モック無し（vi を import しない）",
              GOOD_STEPS.filter((line) => !/\bvi\b/.test(line)),
            ],
            [
              "複数行の import・拡張子付き・ほかの test-support",
              [
                'import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";',
                "import {",
                "  TestDatabase,",
                '} from "../../../../../backend/test-support/database.ts";',
                'import { TodoBuilder } from "../../../../../backend/test-support/todo/todo-builder";',
                'import { RouteFetch } from "@/test-support/route-fetch.ts";',
                'import { ScreenSpecProviders } from "@/test-support/screen-spec";',
                'import type { Todo } from "@/features/todo/api/todo-queries";',
                "const feature = await loadFeature('./x-screen.feature');",
              ],
            ],
            [
              "コメントと文字列の中の api の import・モック・skip",
              [
                ...GOOD_STEPS,
                '// import { TodoApi } from "@/features/todo/api/todo-api";',
                '// vi.mock("@/features/todo/api/todo-api");',
                'const text = "Scenario.skip(";',
              ],
            ],
          ];

          // when
          const result = casesByName(cases, ([, lines]) =>
            findStepContentViolations(STEPS, source(...lines)),
          );

          // then
          expect(result).toEqual(casesByName(cases, () => []));
        },
      );
    },
  );

  Scenario(
    "step の実装の中身（findStepContentViolations）: must reject",
    ({ And }) => {
      And(
        "遷移でないモック・feature の api と InMemory の import・skip と対でない読み込みは、その行の違反になる（vi.doMock・api の import type と dynamic import()・相対パスの api・別名の loadFeature など）",
        () => {
          // given: GOOD_STEPS（7 行）の後に 8 行目として足す
          const cases: [string, string, ScreenSpecRuleId][] = [
            [
              "api の vi.mock",
              'vi.mock("@/features/todo/api/todo-api");',
              "screen-spec-mock-only-navigation",
            ],
            [
              "vi.doMock",
              'vi.doMock("@/features/feature-flag");',
              "screen-spec-mock-only-navigation",
            ],
            [
              "next/navigation の前方一致だけの別モジュール",
              'vi.mock("next/navigation-x");',
              "screen-spec-mock-only-navigation",
            ],
            [
              "next/link のモック",
              'vi.mock("next/link");',
              "screen-spec-mock-only-navigation",
            ],
            [
              "引数が文字列でないモック",
              'vi.mock(import("next/navigation"));',
              "screen-spec-mock-only-navigation",
            ],
            [
              "feature の api の値の import",
              'import { TodoApi } from "@/features/todo/api/todo-api";',
              "screen-spec-no-feature-api",
            ],
            [
              "feature の api の import type",
              'import type { Todo } from "@/features/todo/api/todo-api";',
              "screen-spec-no-feature-api",
            ],
            [
              "feature の api の相対パス・拡張子付き",
              'import { TodoApi } from "../../api/todo-api.ts";',
              "screen-spec-no-feature-api",
            ],
            [
              "別の feature の api の dynamic import()",
              'const api = await import("@/features/feature-flag/api/feature-flag-api");',
              "screen-spec-no-feature-api",
            ],
            [
              "feature の api の export … from",
              'export { TodoApi } from "@/features/todo/api/todo-api";',
              "screen-spec-no-feature-api",
            ],
            [
              "InMemory の Repository",
              'import { InMemoryTodoRepository } from "../../../../../backend/test-support/todo/todo-repository.in-memory";',
              "screen-spec-no-in-memory",
            ],
            [
              "Scenario.skip",
              'Scenario.skip("表示項目", () => {});',
              "screen-spec-no-skip",
            ],
            [
              "only",
              "describeFeature.only(feature, () => {});",
              "screen-spec-no-skip",
            ],
            [
              "タグの絞り込み",
              "describeFeature(feature, () => {}, { excludeTags: [] });",
              "screen-spec-no-skip",
            ],
            [
              "ほかの .feature の読み込み",
              'const other = await loadFeature("./y-screen.feature");',
              "screen-spec-load-feature",
            ],
            [
              "第 2 引数のある読み込み",
              'const ja = await loadFeature("./x-screen.feature", { language: "ja" });',
              "screen-spec-load-feature",
            ],
            [
              "別名の loadFeature",
              'import { loadFeature as load } from "@amiceli/vitest-cucumber";',
              "screen-spec-load-feature",
            ],
            [
              "言語の設定",
              "setVitestCucumberConfiguration({ language: 'ja' });",
              "screen-spec-load-feature",
            ],
          ];

          // when
          const result = casesByName(cases, ([, line]) =>
            findStepContentViolations(STEPS, source(...GOOD_STEPS, line)),
          );

          // then
          expect(result).toEqual(
            casesByName(cases, ([, , rule]) => [{ rule, line: 8 }]),
          );
        },
      );

      And(
        "実 DB の準備・fetch の差し替え・対の .feature の読み込みが無ければ、ファイルの違反になる（型だけの import・名前の一部だけが同じ別のモジュール）",
        () => {
          // given
          const database = {
            rule: "screen-spec-uses-real-database" as const,
            note: "apps/backend/test-support/database を値で import していない",
          };
          const routeFetch = {
            rule: "screen-spec-uses-route-fetch" as const,
            note: "apps/frontend_customer/test-support/route-fetch を値で import していない",
          };
          const load = {
            rule: "screen-spec-load-feature" as const,
            note: "./x-screen.feature を読んでいない",
          };
          const cases: [string, string[], ScreenSpecViolation[]][] = [
            ["何も import しない", [], [load, database, routeFetch]],
            [
              "型だけの import",
              [
                'import type { TestDatabase } from "../../../../../backend/test-support/database";',
                'import { type RouteFetch } from "@/test-support/route-fetch";',
                'const feature = await loadFeature("./x-screen.feature");',
              ],
              [database, routeFetch],
            ],
            [
              "名前の一部だけが同じ別のモジュール",
              [
                'import { TestDatabase } from "../../../../../backend/test-support/database-x";',
                'import { RouteFetch } from "@/test-support/route-fetch/x";',
                'const feature = await loadFeature("./x-screen.feature");',
              ],
              [database, routeFetch],
            ],
          ];

          // when
          const result = casesByName(cases, ([, lines]) =>
            findStepContentViolations(STEPS, source(...lines)),
          );

          // then
          expect(result).toEqual(
            casesByName(cases, ([, , expected]) => expected),
          );
        },
      );
    },
  );

  Scenario("画面仕様の列挙と検査（fixture）", ({ And }) => {
    And(
      "apps/frontend_customer の下の .feature・step の実装・画面を対象にし（依存・ビルドの出力は除く）、違反を「規則: パス(:行)（理由）」で返す",
      () => {
        // given
        const root = fixture({
          [SCREEN]: "",
          [FEATURE]: source(...GOOD_FEATURE),
          [STEPS]: source(...GOOD_STEPS),
          // 中身の違反（禁止語・api のモック）と、対の欠け（.feature と step の無い画面）。
          [`${SCREENS}/y-screen/y-screen.tsx`]: "",
          [`${SCREENS}/z-screen/z-screen.tsx`]: "",
          [`${SCREENS}/z-screen/z-screen.feature`]: source(
            ...GOOD_FEATURE,
            "    * DB に残る",
          ),
          [`${SCREENS}/z-screen/z-screen.screen-spec.test.tsx`]: source(
            ...GOOD_STEPS.map((line) =>
              line.replaceAll("x-screen", "z-screen"),
            ),
            'vi.mock("@/features/todo/api/todo-api");',
          ),
          "apps/frontend_customer/x.feature": "Feature: x\n",
          // 対象外: 画面の隣のテスト・hook、依存・ビルドの出力の中、frontend の外。
          [`${SCREEN_DIR}/x-screen.test.tsx`]: "",
          [`${SCREEN_DIR}/x-screen.hook.ts`]: "",
          "apps/frontend_customer/node_modules/x/x.feature": "",
          "apps/frontend_customer/.next/x.screen-spec.test.tsx": "",
          "apps/backend/spec/api/todo/x.feature": "Feature: DB\n",
        });

        // when
        const result = {
          files: listScreenSpecTargets(root),
          violations: collectScreenSpecViolations(root),
        };

        // then
        expect(result).toEqual({
          files: [
            `${SCREENS}/x-screen/x-screen.feature`,
            `${SCREENS}/x-screen/x-screen.screen-spec.test.tsx`,
            `${SCREENS}/x-screen/x-screen.tsx`,
            `${SCREENS}/y-screen/y-screen.tsx`,
            `${SCREENS}/z-screen/z-screen.feature`,
            `${SCREENS}/z-screen/z-screen.screen-spec.test.tsx`,
            `${SCREENS}/z-screen/z-screen.tsx`,
            "apps/frontend_customer/x.feature",
          ],
          violations: [
            `screen-spec-pair: ${SCREENS}/y-screen/y-screen.tsx（y-screen.feature が無い）`,
            `screen-spec-pair: ${SCREENS}/y-screen/y-screen.tsx（y-screen.screen-spec.test.tsx が無い）`,
            `screen-spec-business-language: ${SCREENS}/z-screen/z-screen.feature:10`,
            `screen-spec-mock-only-navigation: ${SCREENS}/z-screen/z-screen.screen-spec.test.tsx:8`,
            "screen-spec-placement: apps/frontend_customer/x.feature",
          ],
        });
      },
    );

    And(
      "apps/frontend_customer が無ければ対象は 0 件（本番の検査は 0 件を失敗にする）",
      () => {
        // given
        const root = fixture({ "README.md": "# x\n" });

        // when
        const result = {
          files: listScreenSpecTargets(root),
          violations: collectScreenSpecViolations(root),
        };

        // then
        expect(result).toEqual({ files: [], violations: [] });
      },
    );
  });

  Scenario("画面仕様（実ファイル）", ({ And }) => {
    And(
      "画面ごとに .feature と step の実装の対があり、.feature は固定の見出しと箇条書きの step を業務の言葉だけで書き、step の実装は実 DB と fetch の差し替えを使い、遷移のほかをモックしない",
      () => {
        // given
        // WHY 対象を確かめてから違反 0 件を見る: 列挙が壊れて 0 件になると、違反も 0 件になり常に緑になる。
        const files = listScreenSpecTargets(repoRoot);

        // when
        const violations = collectScreenSpecViolations(repoRoot);

        // then
        expect(files).toEqual(
          expect.arrayContaining([
            `${SCREENS}/todo-screen/todo-screen.tsx`,
            `${SCREENS}/todo-screen/todo-screen.feature`,
            `${SCREENS}/todo-screen/todo-screen.screen-spec.test.tsx`,
            `${SCREENS}/todo-detail-screen/todo-detail-screen.tsx`,
            `${SCREENS}/todo-detail-screen/todo-detail-screen.feature`,
            `${SCREENS}/todo-detail-screen/todo-detail-screen.screen-spec.test.tsx`,
          ]),
        );
        expect(violations).toEqual([]);
      },
    );
  });
});
