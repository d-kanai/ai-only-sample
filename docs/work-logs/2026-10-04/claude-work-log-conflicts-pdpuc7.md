# 2026-10-04 claude/work-log-conflicts-pdpuc7

## まとめた作業ログをアプリで読めるページ（Artifact）にした
- 理由: daiki が判断カードで「HTML＋アプリで見る」を選んだ（2026-10-04 00:57Z）。
- 根拠: origin/main（5ac2134）の `docs/work-logs/` とこのブランチのログを一時ディレクトリに出し、`scripts/work-log-html.mjs` でまとめて https://claude.ai/artifact/11RQvYHE3brCtdF3nkXNTB に公開した（非公開。閲覧は daiki だけ）。公開の前にサブエージェントに全ファイルを読ませ、秘密情報は 2026-09-28.md の手元の開発用の既定値 `postgresql://app:app@localhost:5432/app` だけ、個人情報と AI への指示は無いことを確かめた。更新するときは同じ URL に出し直す。
- 機械化: 対象外（読むための公開。リポジトリの規則ではない）

## 作業ログのページの横スクロールを無くした
- 理由: daiki の「スマホで開いて横のスクロールがあるのがじゃま。画面はば固定で良い」（2026-10-04、プロジェクトのスレッド）。
- 根拠: 幅 390px の Chromium で、文書の幅が 509px になっていた。原因は本文の空白の無い長い英数字（`MB_APPLICATION_DB_MAX_CONNECTION_POOL_SIZE` などの並び）。本文全体に `overflow-wrap: anywhere`、コードの囲みに `white-space: pre-wrap` を付け、囲みごとの横スクロールもやめた。直した後は文書の幅 390px・横にはみ出す要素 0 件・スクロールする要素 0 件を確かめ、Artifact を同じ URL で出し直した（Version 2。main の 21b1423 の作業ログで作り、増えた 2026-10-04.md は読んで確かめた）。
- 機械化: 縛れない（見た目の確認。HTML の出力はコミットしないので CI で測る対象が無い）
