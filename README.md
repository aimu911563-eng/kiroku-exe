# kiroku.exe

店舗業務を効率化するためのWebアプリ群

# 概要
店舗運営の現場で感じた課題をもとに、
シフト管理・勤務時間管理・在庫管理・有給申請などの業務を効率化するWebアプリを個人開発しています。

---

# 主なアプリ

① ShiftFlow（シフト管理）
従業員がスマホからシフトを提出し、管理者が一覧で管理できるシステム

- 週単位のシフト提出
- 提出後1回のみ修正可能
- 管理者画面で提出状況確認
- コメント機能
- 締切制御（木曜0:00）
- スマホ対応UI

- 提出画面： https://shiftflow-e14.pages.dev
- 管理画面： https://shiftflow-e14.pages.dev/admin
- GitHub: https://github.com/aimu911563-eng/kiroku-exe/blob/main/shiftflow%20README.md

---

② Worktime（勤務時間管理）
勤務時間の入力・集計・管理

- 提出画面： https://shiftflow-e14.pages.dev/worktime
- 管理画面： https://shiftflow-e14.pages.dev/worktime-admin
- GitHub: https://github.com/aimu911563-eng/kiroku-exe/blob/main/Worktime%20README.md

---

③ Inventory（在庫管理）
売上予測から必要量を算出する在庫管理ツール

- 常時画面： https://kiroku-exe.pages.dev/inventory
- GitHub: https://github.com/aimu911563-eng/kiroku-exe/blob/main/inventory%20README.md

---

④ Leave（有給申請）
有給申請・承認・履歴管理システム

- 提出画面： https://kiroku-exe.pages.dev/
- 管理画面： https://kiroku-exe.pages.dev/admin
- GitHub: https://github.com/aimu911563-eng/kiroku-exe/blob/main/kiroku-exe%20README.md


---

#　技術構成
- Frontend: React(一部機能) / TypeScript
- Backend: Hono (Node.js)
- Database: Supabase (PostgreSQL)
- Hosting: Cloudflare Pages / Workers

---

#　ポイント
- 実際の店舗運用を想定した業務システム設計
- フロント・バックエンドの両方を実装
- 認証・状態管理・バリデーションなどを考慮
- すべて実運用を想定して設計・開発

---

#　GitHub
https://github.com/aimu911563-eng
