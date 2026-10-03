# ドメイン機能の開発（常時）

ドメインの機能（業務ルールや API を足す・変える）は、仕様の .feature を先にそろえてから実装する。WHY: 実装から入ると、同じ依頼でも AI ごとに判断（境界値・エラーの扱い・テストの置き方）が揺れた。daiki が読むのは .feature なので、そこを固定点にすると揺れが仕様の範囲に閉じる（ADR `docs/adr/workflow/20261003-spec-first-feature-development.md`、Issue #443）。

1. 仕様を書く（最初の step）: 次の 4 種の .feature に、今回の変更の仕様を整理して書く（書き方は `.claude/rules/quality/testing.md`）。変更の無い種類は書かず、その理由を PR の「実装経緯」に書く。
   - E2E: `apps/e2e/spec/<name>.feature`（画面からの操作）
   - API ジャーニー: `apps/backend/spec/journey/<usecase>.feature`（複数の API を業務の流れの順に）
   - API 仕様: `apps/backend/spec/api/<feature>/<api>.feature`（API 1 つの振る舞い）
   - domain 仕様: `apps/backend/spec/domain/<feature>/<name>.feature`（Entity の業務ルール）
2. 整合性を確かめる: 4 種を並べて、同じ規則が食い違っていないか（文言・境界値・エラーの扱い）、ある層にだけあって別の層に要る仕様が抜けていないかを見る。ルールに無く自分で決めたことは、PR の「実装経緯」に一覧で書く。
3. TDD で実装する: 問題が無ければ、.feature を満たす実装をテストから進める（CLAUDE.md の 2.）。どのテストから着手するか（domain から外へ・E2E から内へなど）は AI が判断してよい。実装中に仕様を変えるときは、1. の .feature を先に直して 2. をやり直す。
