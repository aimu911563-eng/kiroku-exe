# Worktime - 勤務時間管理システム

勤務時間の入力・集計・管理を行うWebアプリ

---

# 概要
従業員が勤務時間を入力し、管理者が集計・管理できるシステムです。  
手動管理や不正確な記録を防ぐために開発しました。

---

# 特徴
・週単位で勤務時間を管理  
・月ごとの合計時間・進捗を可視化  
・未提出の把握・管理が可能  

---

# 主な機能
・従業員ログイン（従業員番号＋PIN）  
・勤務時間入力（hh:mm形式）  
・週単位での提出・1回のみ修正可能  
・月合計の自動計算  
・管理者画面で一覧確認・集計  
・ステータス管理（未提出 / 提出済 / 更新済）  

---

# 技術構成
・Frontend: HTML / TypeScript  
・Backend: Hono (Node.js)  
・Database: Supabase (PostgreSQL)  
・Hosting: Cloudflare Pages / Workers  

---

# URL
・提出画面  
https://shiftflow-e14.pages.dev/worktime  

・管理画面  
https://shiftflow-e14.pages.dev/worktime-admin  

---

# 工夫した点
・入力中にリアルタイムで合計時間を再計算  
・hh:mm形式を自動補正（例：830 → 08:30）  
・UIとAPIの両方でバリデーションを実装  
・月跨ぎでも正確に集計されるロジック  

---

# 想定ユースケース
・従業員が勤務時間を入力・提出  
・店長が提出状況を一覧で確認  
・月の労働時間を管理・把握  

---

# 今後の改善
・リマインド通知機能  
・グラフによる可視化強化  
・管理画面のUX改善  

---

# 画面イメージ

# 従業員側（勤務時間入力）
<img width="951" height="710" alt="スクリーンショット 2026-03-25 19 24 11" src="https://github.com/user-attachments/assets/074fa377-92bf-445e-866f-a72509c9179d" />
<img width="942" height="953" alt="スクリーンショット 2026-03-25 19 24 48" src="https://github.com/user-attachments/assets/23e8d069-918b-474d-9502-9d83d1a2757c" />

# 管理画面
<img width="955" height="878" alt="スクリーンショット 2026-03-25 19 25 14" src="https://github.com/user-attachments/assets/0ed3fbad-c30d-4bff-b6cc-ab345e8edcfc" />
<img width="948" height="916" alt="スクリーンショット 2026-03-25 19 25 32" src="https://github.com/user-attachments/assets/d7067891-8680-4071-9f54-7283e2084ced" />
