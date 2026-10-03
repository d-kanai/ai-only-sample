# 2026-10-03 claude/work-log-conflicts-pdpuc7

## 作業ログを日付のディレクトリの下のブランチごとのファイルにした（Issue #441）
- 理由: daiki の「作業ログを記録するルールが複数スレッドでよくコンフリクトするぽい。改善できるかな」（2026-10-03、プロジェクトのスレッド）。同じ日の棚卸しで、どの PR も同じ日のファイルの末尾に追記するので 1 本マージされるたびに残りが競合し、競合した PR では CI も auto-merge も動かないと分かっていた（2026-10-03.md「残っていた PR とスレッドを棚卸しし…」）。
- 比較: (1) `.gitattributes` の `merge=union` は、GitHub の mergeability と Merge ボタンが merge ドライバを使わないので PR は競合のまま（https://github.com/orgs/community/discussions/9288 ）。採らない。(2) 1 項目 1 ファイルは同じ日に daiki が見送った。(3) 1 ブランチ 1 ファイル（`docs/work-logs/<日付>/<ブランチ>.md`）は、1 PR = 1 ブランチなので PR どうしが同じファイルに書かず、ファイルも細かくなりすぎない。これを採った。マージ後の記録の PR をやめる案は、Stop フックがマージのターンでもログを求めるので別の判断が要り、今回はしない（その PR も別ブランチのファイルになるので競合はしない）。
- 根拠: `scripts/hooks/require-work-log.test.ts`（58 件）・`check-work-logs-diff.test.ts`（44 件）を先に直して失敗を確かめ（49 件・8 件が失敗）、スクリプトを直して通した。CI の既存の検査は `^docs/work-logs/.*\.md$` でサブディレクトリも数えていたが、どのファイルでも通るので 1 日 1 ファイルへの追記に戻るのを止められず、ブランチのファイルを要求する形にした。ブランチ名は CI では `GITHUB_EVENT_PATH` の `pull_request.head.ref`（checkout が detached HEAD のため）。ADR `docs/adr/workflow/20261003-work-log-file-per-branch.md`。
- 機械化: 縛れる（Stop フック `require-work-log.sh` と CI `check-work-logs-diff.sh` が、ブランチのファイル以外のログでは通さない）

## PR #444 の Codex の指摘で、日本語を含むブランチ名のログを CI が数えない誤りを直した
- 理由: Codex のレビュー（P2）「core.quotePath=true だと git diff --name-only が非 ASCII のパスをエスケープして出し、feat/1-日本語 のようなブランチのログが一致しない」。
- 根拠: `feat/1-日本語` のテストを足して失敗を再現し、`git -c core.quotePath=false diff --name-only` にして通した（`check-work-logs-diff.test.ts` 45 件）。Stop フックは `git status --porcelain -- <ログ>` の出力が空かどうかだけを見るので影響しない。
- 機械化: 縛れる（`check-work-logs-diff.test.ts` の日本語のブランチ名のテスト）
