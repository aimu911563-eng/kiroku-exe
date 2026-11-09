# ファイル・CSS・設定の対応

## 画面とスタイル

| HTML | JavaScript / TypeScript の入口 | CSS |
|---|---|---|
| `index.html` | `src/main.ts` | `src/style.css` |
| `admin.html` | `src/admin.ts` | `src/style.css` |
| `inventory.html` | `src/inventory/main.tsx` | `src/inventory/inventory.css` |
| `inventory-admin.html` | `src/inventory-admin.ts` | `src/inventory-admin.css` |
| `order.html` | `src/inventory/Order.tsx` | `src/inventory/inventory.css` |
| `inventory-date.html`（未完成） | `src/inventory/inventory-date.tsx` | `src/inventory/inventory-date.css`（空ファイル） |
| `insight.html` | `insight/main.tsx` | `insight/insight.css` |
| `shiftflow/index.html` | `shiftflow/src/main.ts` | `shiftflow/style.css` |
| `shiftflow/admin.html` | `shiftflow/src/admin.ts` | `shiftflow/style.css` |
| `shiftflow/worktime.html` | `shiftflow/src/worktime.ts` | `shiftflow/style.css` |
| `shiftflow/worktime-admin.html` | `shiftflow/src/worktime-admin.ts` | `shiftflow/worktime-admin.css` |

HTML の `<link>` で読み込むページと、React の入口から CSS を import するページがあります。
どちらも Vite の処理対象です。各ページは別 HTML なので、別ページの同名 CSS クラスが
自動で混ざることはありません。CSS を一括結合すると `body`、`.card`、`.hidden` などが衝突します。

在庫管理の HTML 内 CSS は `src/inventory-admin.css` に内容を保って移しました。
`src/style.css` の重複リセットと在庫 CSS の重複 `.hourBox` を整理しました。
Insight のグリッドは狭い画面でも列の最小幅が親要素の幅を超えない指定に変更しました。

## 見た目を編集するとき

- 有休の見た目は `src/style.css`。申請と管理の両画面に影響します。
- シフト提出・シフト管理・勤務時間入力は `shiftflow/style.css`。3画面を確認します。
- 勤務時間管理は `shiftflow/worktime-admin.css`。上記とは独立しています。
- 在庫と発注は `src/inventory/inventory.css` を共有します。
- `src/style.css` には後半で上書きするルールと `!important` が残っています。
  上から最初に見つかった定義だけで判断せず、後続ルールも確認してください。
- React や HTML 内のインラインスタイルも残っています。CSS の変更が効かない場合は
  `style={{ ... }}` / `style="..."` を確認します。
- 本番用ビルドを Chrome の幅390px・1280pxで検証済みです。初期表示での JavaScript エラー、
  CSS 読み込み、ページ全体の横はみ出しを確認しています。API 応答はダミーで、
  全操作の確認や iPhone / iPad の実機試験ではありません。

## 現在参照されていない雛形ファイル

次は現行の入口から参照が見つからなかったファイルです。将来利用する可能性を考え、削除はしていません。

- `src/App.css`、`src/index.css`、`src/assets/react.svg`
- `shiftflow/src/style.css`（実際に使われているのは **`shiftflow/style.css`**）
- `shiftflow/src/counter.ts`、`shiftflow/src/typescript.svg`、`shiftflow/public/vite.svg`

ルートの `public/vite.svg` は有休ページの favicon としてまだ使われています。
`src/inventory/inventory-date.css` は参照されていますが、中身は空です。

## 設定ファイル

| ファイル | 対象・注意点 |
|---|---|
| `vite.config.ts` | kiroku 側の画面、開発 proxy、本番 HTML の入口 |
| `shiftflow/vite.config.ts` | Shift Flow の4画面と proxy |
| `tsconfig.json` | ルートの画面設定と Vite 設定を参照 |
| `tsconfig.app.json` | `src`、`insight`、`shared` の型チェック |
| `tsconfig.node.json` | ルート Vite 設定の型チェック |
| `tsconfig.server.json` | `server` の型チェック。`noEmit` と `.ts` import を明示 |
| `shiftflow/tsconfig.json` | Shift Flow の画面・API・ローカル起動ファイル |
| `eslint.config.js` | 両アプリを対象。生成物を除外し、サーバー／設定ファイルには Node のグローバルを追加 |
| `src/vite-env.d.ts` | 使用中の公開環境変数 `VITE_PUBLIC_EMPLOYEES_KEY` の型 |
| `shared/leave.ts` | 有休の画面と API が共有する送信データの型。DOM を操作する画面コードを API から import しない |

Insight を型チェック対象に含め、型の import を `import type` に直しました。
Pages Functions の転送は `npm run test:routing` で検証します。

## 検査コマンドと残っている課題

```sh
npm run build
npm --prefix shiftflow run build
npm --prefix shiftflow run typecheck
npm run typecheck
npm run typecheck:server
npm run lint
```

ビルドと Shift Flow の型チェックは通ります。
ルートの型チェックは `InventoryDateApp.tsx` の既存の構文エラーで失敗します。
サーバー側には有休 API の Hono コンテキスト型と、メールクライアントが null の場合の処理に
エラーが残ります。設定だけでエラーを隠すための除外や strict の無効化はしていません。
ESLint も既存の `any`、未使用変数、全角空白、React Hooks などの指摘が残るため、現時点では合格しません。
`vite build` が通ることと TypeScript / ESLint が通ることは別です。

接続先と起動方法は [開発ガイド](DEVELOPMENT.md) を参照してください。
