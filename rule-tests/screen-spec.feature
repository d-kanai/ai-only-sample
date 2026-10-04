# 画面仕様（apps/frontend_customer/spec/screen/<f>/ の .feature と step の実装と support）を検査するルール検査テストの仕様。
# step の実装は対の screen-spec.test.ts。規則の WHY と限界は screen-spec.test.ts の冒頭。
Feature: 画面仕様の置き場所と書き方
  Scenario: 置き場所と対（findScreenSpecViolations の screen-spec-placement・screen-spec-pair）
    * spec/screen/<f>/ の .feature と step の実装と support と、画面仕様でないファイルは違反なし（画面・hook のテスト・ほかの名前の .tsx など）
    * spec/screen/<f>/ の外・入れ子・拡張子の違う .feature と step の実装と、spec/ の下のほかのファイルは、置き場所の違反だけになる（中身と対は見ない）
    * 画面に .feature か step の実装が無い・画面の無い .feature と step の実装（feature の違う画面を含む）は、対の違反になる
  Scenario: .feature の中身（findFeatureContentViolations）: must pass
    * 固定の見出しの Scenario を順に 1 回ずつ置き、箇条書きの step を業務の言葉だけで書いた .feature は違反なし（コメントの技術の言葉・説明の行・助数詞付きの 3 桁の数）
  Scenario: .feature の中身（findFeatureContentViolations）: must reject
    * 一覧に無い見出し・同じ見出しの 2 つ目・順の違う見出し・足りない見出しは、見出しの違反になる
    * 使わないキーワード・タグ・箇条書きでない step・step の無い Scenario・技術の言葉は、その行の違反になる
  Scenario: step の実装の中身（findStepContentViolations）: must pass
    * 実 DB の準備と fetch の差し替えを値で import して呼び出し、対の .feature を読み、遷移だけをモックする step の実装は違反なし（複数行の import と呼び出し・拡張子付き・モック無し・ほかの test-support）
  Scenario: step の実装の中身（findStepContentViolations）: must reject
    * 遷移でないモック・feature の api と InMemory の import・skip と対でない読み込みは、その行の違反になる（vi.doMock・api の import type と dynamic import()・相対パスの api・別名の loadFeature など）
    * 実 DB の準備・fetch の差し替え・対の .feature の読み込みが無ければ、ファイルの違反になる（型だけの import・名前の一部だけが同じ別のモジュール・import しても installAsAppDatabase と RouteFetch.install を呼ばない）
  Scenario: 操作する step の保存先の確認（findStepContentViolations の screen-spec-operation-reads-saved）: must pass
    * 操作する step が ./support の Saved で始まる補助の結果を expect する・操作しない step は確かめなくてよい、は違反なし（await を挟む・別名の import・拡張子付き・複数行・コメントと文字列の中の操作）
  Scenario: 操作する step の保存先の確認（findStepContentViolations の screen-spec-operation-reads-saved）: must reject
    * 操作する step が保存先を読まない・読んでも expect に直接渡さない・ほかの step だけが読む・./support の外や型だけの import や Saved で始まらない名前の補助を使うと、その step の違反になる（fireEvent・別の名前の受け手・When と Given の step）
  Scenario: 画面仕様の列挙と検査（fixture）
    * apps/frontend_customer の下の .feature・step の実装・画面と spec/ の下のファイルを対象にし（依存・ビルドの出力は除く）、違反を「規則: パス(:行)（理由）」で返す
    * apps/frontend_customer が無ければ対象は 0 件（本番の検査は 0 件を失敗にする）
  Scenario: 画面仕様（実ファイル）
    * 画面ごとに .feature と step の実装の対があり、.feature は固定の見出しと箇条書きの step を業務の言葉だけで書き、step の実装は実 DB と fetch の差し替えを使い、遷移のほかをモックせず、操作する step は保存先を確かめる
