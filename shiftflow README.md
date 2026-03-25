# Shiftflow - 店舗向けシフト提出・管理システム
店舗向けシフト提出・管理システム

# 概要

飲食店・小売店舗向けに、紙やLINEでのシフト管理の非効率を解決するために開発したWebアプリです。
現場での課題（紙・LINEでの管理の非効率）を解決するために開発しました。

---

# 主な機能

・従業員ログイン（従業員番号　＋　PIN）
・シフト提出（週単位）
・提出後一回のみ修正可能
・管理者画面（提出状況一覧・ステータス管理・従業員追加）
・コメント機能
・締め切り制御（木曜0:00以降提出不可）
・スマホ対応UI

---

# 技術構成

・Frontend: HTML / TypeScript
・Backend: Hono (Node.js)
・Database: Supabase (PostgreSQL)
・Hosting: Cloudflare Pages / Workers

---

# URL

・管理画面
  https://shiftflow-e14.pages.dev/admin

・提出画面
  https://shiftflow-e14.pages.dev

--- 

# 工夫した点

・実際の店舗運用を想定した仕様設計
・UIとAPIでの二重バリデーション
・更新回数制限など現場ルールの再現
・スマホで使いやすいUI設計

---

# 想定ユースケース

・従業員がスマホからシフト提出
・店長が提出状況を一覧で確認
・未提出者の把握、修正管理

---

# 今後の改善

・通知機能
・管理画面のUX改善
・権限の強化

---

# 従業員側(シフト入力)
<img width="946" height="908" alt="スクリーンショット 2026-03-17 16 44 11" src="https://github.com/user-attachments/assets/2dc1715d-6ead-49ba-aede-8e79022aea04" />

<img width="948" height="955" alt="スクリーンショット 2026-03-17 16 43 59" src="https://github.com/user-attachments/assets/1855a60c-06c6-48ca-95a4-e0468f582baf" />

# 管理画面
<img width="941" height="948" alt="スクリーンショット 2026-03-17 16 48 21" src="https://github.com/user-attachments/assets/c6553557-07c1-41e2-9582-09678ed37e35" />

<img width="937" height="958" alt="スクリーンショット 2026-03-17 16 50 51" src="https://github.com/user-attachments/assets/c93d0d1f-8808-4c27-a4a2-f0d2fdac1b01" />
