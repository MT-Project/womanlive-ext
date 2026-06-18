# WomanLive 拡張機能 (非公式アドオン)

動画管理ソフト **WomanLive** に、個人利用向けの機能を追加する非公式アドオンです。
**WomanLive 本体のファイルは一切変更しません**（`--require` プリロードで読み込みます）。

> 本アドオンは WomanLive 本体を含みません。WomanLive がインストール・セットアップ済みの
> 環境に追加してください。WomanLive 本体は MIT ライセンス (Copyright 2016 woman projects)。

## 追加される主な機能
- カバー画像（フォルダから動画名一致で自動表示）
- 拡張メタデータ（評価★・表示動画名・品番・公開日・シリーズ・メーカー・レーベル・監督・出演者・ジャンル）
- 関連動画をメタデータの類似度で選定（シリーズ最重視・重み調整可・事前計算）
- 出演者ページ／出演者一覧（ソート・タグ絞込・重複検出・画像登録）
- シリーズ一覧／公開カレンダー
- 評価ソート・評価絞り込み、各メタデータのクリック検索
- メタデータの除外検索（ジャンル/メーカー/シリーズ/レーベル/監督/出演者を「含まない」で絞り込み）
- スクリーンショット枚数の表示（検索結果）・枚数ソート
- キーワード検索で「表示動画名」もヒット
- 出演者タグのプリセット、出演者タグの自動付与ルール
- DMM(FANZA) 商品検索によるメタデータ自動設定
- ブックマーク（フォルダ分け）
- 追加データのバックアップ（エクスポート／インポート）
- ナビゲーション統一（本家と同じ単色アイコン・共通ヘッダー・ヘッダーのメニューから全ページへ移動）

機能の詳細は `ext/README.md` を参照してください。

## 動作要件
- セットアップ済みの WomanLive（同梱の Node.js / ffmpeg / better-sqlite3 / sharp を利用します）。
- 追加の部品インストールは不要です（新しい npm パッケージは使いません）。
- DMM 商品検索とカバー画像の取得時のみ、インターネット接続を使用します。

## 導入方法（推奨：本体を書き換えない方法）
1. この配布物の **`ext` フォルダ**を、WomanLive の **`server` フォルダの中**へコピーします
   （結果として `server/ext` になります）。
2. **`womanlive-ext.bat`** を WomanLive の**ルート**（`womanlive.bat` と同じ場所）へコピーします。
3. WomanLive を一度終了し、**`womanlive-ext.bat`** で起動します。
   （以後、拡張機能つきで使うときは `womanlive-ext.bat` から起動してください）
4. ブラウザ右上の設定から、必要に応じてカバー画像フォルダや DMM API ID などを設定します。

### 別の導入方法（本体を1行だけ編集する場合）
`womanlive-ext.bat` を使わず、通常の `womanlive.bat` で使いたい場合は、
`server/index.js` の `app.use(cors());` の直後に次の1行を追加してください。
```js
try { require('./ext')(app); } catch (e) { console.error('[WomanLive拡張]', e); }
```
（この方法では `womanlive.bat` で起動できます。両方を併用しても二重には読み込まれません）

## アンインストール
- `womanlive-ext.bat` の使用をやめ、通常の `womanlive.bat` で起動すれば拡張は無効になります。
- 完全に削除する場合は `server/ext` フォルダと `womanlive-ext.bat` を削除してください。
- 追加データも消す場合は、設定画面のバックアップでエクスポートしておいた上で、
  `videos.db` の次のテーブルを削除（DROP）してください：
  `ext_video_meta` / `ext_performers` / `ext_video_cover` /
  `ext_bookmark_folders` / `ext_bookmarks`
  （`ext_related` は再計算できるキャッシュなので任意。
  `settings` テーブルの `ext_` で始まるキーも拡張用の設定です）

## データ・バックアップ
追加した情報（メタデータ・出演者・画像・ブックマーク・設定）は WomanLive の `videos.db` 内の
**新規テーブル**に保存され、既存データは変更しません。設定画面の「バックアップ」から JSON で
書き出し／復元できます。

## ライセンス
本アドオンは MIT ライセンスです（`LICENSE` 参照）。WomanLive 本体（MIT, Copyright 2016
woman projects）とは別の独立したプログラムであり、本体のコードは同梱していません。
"WomanLive" の名称は対象ソフトの識別のために使用しているもので、woman projects による
公式の承認・提供を受けたものではありません。

## 配布物の構成
```
womanlive-ext/
  README.md            このファイル
  LICENSE              MIT ライセンス
  womanlive-ext.bat    拡張機能つき起動 (server/index.js を書き換えずに読み込む)
  ext/                 アドオン本体 (server/ の中へコピーして server/ext にする)
    preload.js         本体無改変で拡張をロードするためのプリロード
    index.js db.js inject.js
    routes/  public/   サーバーAPI / ブラウザ側UI
    README.md          機能の詳細
```
