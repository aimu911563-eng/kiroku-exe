# 動作・本番影響の確認記録

確認日：2026-09-29（日本時間）。対象はローカルの未コミットの整理変更です。
実 DB への書き込みとメール送信はしていません。

## 2026-09-29 在庫DB復旧・接続分離

- 在庫用 Supabase `ximaxzekfsyrkqmixzfa` を `INACTIVE` から復旧し、`ACTIVE_HEALTHY` を確認。
- ShiftFlow 用 Supabase `wrrdondtrybuuazprhtk` も `ACTIVE_HEALTHY`。
- ローカルは `INVENTORY_SUPABASE_*` を在庫・発注・清掃、`SUPABASE_*` を ShiftFlow・従業員マスターに使用。
- ローカルの在庫読み取り、従業員一覧、ShiftFlow 店舗一覧はいずれも HTTP 200。
- 現行本番の Render 在庫読み取り、ShiftFlow Worker / Pages はいずれも HTTP 200。
- Render の既存 `SUPABASE_*` との互換フォールバックを残しているため、専用変数追加前でも現行接続を維持する。
- コード変更は未デプロイ。Supabase復旧だけが即時に本番へ反映され、停止中だった在庫DB接続が回復した。

## 今回修正した本番への影響

### 有休管理の署名キー不一致

整理の途中で Node の `app.fetch` に `process.env` 全体を渡す変更を入れていました。
有休ログインと認証ミドルウェアでは署名キーのフォールバック順序が異なり、
`ADMIN_TOKEN_SECRET` だけがある環境ではログインで発行したトークンが次の取得で401になりました。

`scripts/production-smoke.mjs` のダミー環境で **401を再現**し、Node の `app.fetch` 呼び出しを
以前の形へ戻しました。修正後はログイン200、認証付き残数取得200、未認証取得401を確認しています。
今回の整理では、有休の既存の認証ポリシーや既存のトークンの解釈を変更しません。
有休の認証設定の整理・デフォルト値廃止は別途必要で、環境変数の全渡しで代用してはいけません。

### Render の本番依存関係

API 実行に必要な `hono`、`@hono/node-server`、`tsx` が devDependencies にありました。
Render 等で開発用依存関係を省くと起動できなくなるため dependencies に移しました。
既存のロック済みバージョンは変えていません。
`/tmp` の独立したコピーに `npm ci --omit=dev --ignore-scripts` でインストールし、
`NODE_ENV=production` の `npm start` と認証付き取得まで確認しました。

## 検証結果

| 検証 | 結果・範囲 |
|---|---|
| kiroku 画面の本番ビルド | 成功。未完成の期限管理画面は従来どおり含めない |
| Shift Flow 画面の本番ビルド・型チェック | 成功 |
| Chrome の本番用画面 | 10画面 × 390px / 1280px。初期表示のJS例外なし、CSS読込あり、ページ全体の横はみ出しなし |
| Pages Functions コンパイル | kiroku / Shift Flow とも成功 |
| Pages Functions ローカル実行 | パス、クエリ、POST本文、Authorization が元の本番APIホストへ向くことをダミー転送先で確認 |
| Shift Flow Workers dry-run | 成功。アップロードなし |
| Workers ローカルランタイム | ヘルスチェック200、未認証 `/api/shifts` は401。DB問い合わせなし |
| Render 相当の起動 | 本番依存関係だけで成功。環境指定PORTを使用 |
| 有休認証の互換性 | 修正前401 → 修正後200。ローカルDBスタブの対象店舗条件も確認 |
| 開発の同時起動・API分離 | `scripts/smoke-dev.mjs` で検証。起動したテスト用プロセスは停止 |
| 全体 TypeScript | 成功。未完成の期限管理画面は本番対象・型検査対象から除外 |
| ESLint | 既存コードの `any` や空白規約などのエラーが残る |

ブラウザ検証は本番用 `dist` をローカルで配信し、API・天気のリクエストをダミー応答に置き換えました。
ログイン後の全業務操作、実DBのデータ整合性、実メール送信、Safari等の他ブラウザは未検証です。
Workers と Pages Functions は一時インストールした Wrangler / Miniflare で検証しています。
検証用ツールはアプリの dependencies には追加していません。

## 現在公開中の環境

次の公開URLに対し、トップページはHEAD、DBを問い合わせないヘルスチェックはGETだけ実行しました。

- `https://kiroku-exe.pages.dev/`
- `https://shiftflow-e14.pages.dev/`
- `https://kiroku-exe.pages.dev/api/inventory/health`
- `https://shiftflow-e14.pages.dev/api/health`

この実行環境からはすべて403でした。Shift Flowのエラー応答にはCloudflareの `error code: 1010` がありました。
この結果から利用者のブラウザでも停止しているとは断定できません。
認証やアクセス制御を変更して確認を通すことはしていません。
Render / Cloudflare の管理画面上の起動コマンド・ルートディレクトリ・秘密情報・自動デプロイ設定は未確認です。

## デプロイすると変わる点

- 画面の `/api` は既存と同じ本番APIへ転送します。`API_ORIGIN` を設定した場合だけ上書きします。
- Pages Functions はプロジェクトルートの `functions/` からコンパイルします。`dist` へのソースコピーは不要です。
- 在庫管理・Insight のHTMLをビルドに追加しているため、この2画面も配布対象になります。
- 在庫管理CSSは外部ファイルに分離され、ビルド済みHTMLからハッシュ付きCSSを読み込みます。
- API は Render の `PORT` を使います。Shift Flow Workers のエントリーは従来と同じ `src/server.ts` です。
- ローカルでは画面5173/5174、API8787/8788に分離します。本番のホスト名やDB接続先は変更していません。

既知の認証・公開API・通知対象の問題は [開発ガイドの残件](DEVELOPMENT.md#別途対応が必要な問題) に記載しています。
この記録は「本番全体の安全性や全業務フローに問題がない」という保証ではありません。
