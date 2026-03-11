# 在庫管理 v0.1 開発ログ

## 2026-03-07

### 従業員名取得
ShiftFlow の employees テーブルを流用

API
GET /api/public/employees?store_id=terajima

レスポンス
{
  ok: true,
  employees: [{ employee_name }]
}

フロント
InventoryApp.tsx

従業員名取得
fetchEmployees()

cleaning 完了送信
POST /inventory/cleaning/done
body:
{
  store_id,
  employee_name
}

---

### Cloudflare Pages デプロイ

URL
https://kiroku-exe.pages.dev

在庫画面
https://kiroku-exe.pages.dev/inventory.html

build

npm run build
dist に inventory.html 出力確認

---

### iPad 表示用

ホーム画面追加で擬似フルスクリーン

meta

<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="在庫管理">

iPad設定
自動ロック：なし