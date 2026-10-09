# ShiftFlow 機能案

## LINEグループ通知

状態: 基本機能を実装済み（LINEチャネル設定と実機テスト待ち）

### 目的

店舗ごとのLINEグループへ、シフト提出期限や勤務表公開などをShiftFlowから通知する。
管理者がLINEのグループIDを調べたり、グループ名を事前入力したりしなくても連携できるようにする。

### 連携フロー

1. ShiftFlow用のLINE公式アカウントとMessaging APIチャネルを作成する。
2. 「グループ・複数人トークへの参加を許可」を有効にする。
3. 店舗のLINEグループへ公式アカウントを招待する。
4. ShiftFlow管理画面で、店舗に紐づく一回限りの6桁連携コードを発行する。
5. LINEグループ内で `連携 123456` のように送信する。
6. Webhookで受け取った`groupId`からグループ情報を取得し、店舗と通知先を紐づける。
7. 管理画面でテスト通知を送り、連携完了を確認する。

### 管理画面

- LINE通知先のグループ名と連携状態
- 最終送信日時と送信結果
- テスト送信
- 通知項目ごとのON/OFF
- 連携解除と再連携

### 通知候補

- シフト提出期限の前日・当日通知
- 未提出者がいる場合の管理者向け通知
- 勤務表公開・再公開の通知
- 必要人数を下回る時間帯の警告
- 管理者が入力する任意メッセージ
- 従業員カレンダーへのリンク

### 保存データ案

- `store_id`
- LINEの`groupId`（暗号化またはアクセスを制限したサーバー側テーブルへ保存）
- グループ表示名
- 連携日時・最終送信日時
- 通知設定
- 連携コードのハッシュと有効期限

Channel access tokenとChannel secretはDBやブラウザへ保存せず、Cloudflare WorkersのSecretとして管理する。

### API案

- `POST /api/admin/line/link-code`: 連携コード発行
- `GET /api/admin/line/status`: 連携状態取得
- `POST /api/admin/line/test`: テスト通知
- `PUT /api/admin/line/settings`: 通知設定更新
- `DELETE /api/admin/line/link`: 連携解除
- `POST /api/line/webhook`: LINE Webhook受信

Webhookでは`x-line-signature`をChannel secretで必ず検証する。

### LINE側の制約

- LINE公式アカウントを対象グループへ招待する必要がある。
- グループIDはWebhookイベントから取得する。
- 1つのグループへ参加できるLINE公式アカウントは1つ。
- グループへのプッシュ通知は、グループ参加人数に応じてメッセージ通数へ加算される。

### 実機テストに必要なもの

- LINE公式アカウント
- Messaging APIチャネル
- Channel access token
- Channel secret
- 公開済みのWebhook URL
