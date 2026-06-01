# My Todo App Scrap Saver

開いているページを My Todo App のスクラップに保存する Chrome 拡張機能です。
https://github.com/tokuzou0829/my-todo-app

## 使い方

1. Chrome で `chrome://extensions` を開きます。
2. 「デベロッパーモード」を有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」からこのディレクトリを選択します。
4. 拡張機能の設定画面でアプリケーションURLと API キーを保存します。
5. 保存したいページで拡張機能をクリックし、コメントや写真を追加して「保存」を押します。

## 設定

- アプリケーションURL: `https://example.com` のように指定します。
- APIキー: My Todo App の Developer API キーを指定します。

保存時に `GET /api/developer/v1/me` で API キーを確認し、成功した場合だけユーザー情報を表示します。

## スクラップ保存

保存時は `POST /api/developer/v1/scraps` に `multipart/form-data` で送信します。

- `title`: 現在タブの URL。自動入力され、編集できません。
- `sourceUrl`: 現在タブの URL。
- `body`: コメント欄の内容。
- `isPrivate`: 非公開チェックの状態。
- `images`: 添付写真。最大4枚、各8MBまで。

ポップアップ表示時に現在タブの URL で既存スクラップを検索し、候補がある場合は「もしかしてこれ?」として入力欄の下に表示します。YouTube の場合は URL 全体ではなく動画 ID だけで検索します。

## 注意

API キーは `chrome.storage.local` に保存します。共有端末では注意してください。
