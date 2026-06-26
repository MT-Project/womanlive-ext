// =============================================================
// WomanLive 拡張機能 エントリポイント
// server/index.js から require('./ext')(app) で呼び出されます。
// すべての追加機能はこのフォルダ配下で完結します。
// =============================================================
const path = require('path');
const express = require('express');

const { initSchema } = require('./db');
const cover = require('./routes/cover');
const meta = require('./routes/meta');
const search = require('./routes/search');
const fullsearch = require('./routes/fullsearch');
const tags = require('./routes/tags');
const screenshots = require('./routes/screenshots');
const related = require('./routes/related');
const performers = require('./routes/performers');
const tagrules = require('./routes/tagrules');
const dmm = require('./routes/dmm');
const bookmark = require('./routes/bookmark');
const backup = require('./routes/backup');
const bulk = require('./routes/bulk');
const createInject = require('./inject');

module.exports = function setupExt(app) {
    // 二重ロード防止 (index.js への追記 と preload の両方が有効でも一度だけ実行)
    if (app.__wlext_loaded) return;
    app.__wlext_loaded = true;

    // 1. 追加テーブルを用意
    initSchema();

    // 1.5 個人用モジュール (server/private) があれば読み込む。
    //     配布物・git には含めない前提。存在しなければ何もしない(配布時は no-op)。
    //     ext の HTML 注入(res.send)より前に private のミドルウェアを登録するため、ここで呼ぶ。
    try {
        if (require('fs').existsSync(path.join(__dirname, '..', 'private', 'index.js'))) {
            require('../private')(app);
        }
    } catch (e) { console.error('[WomanLive private] ロードに失敗しました', e); }

    // 2. 拡張 API 用の JSON ボディパーサ (画像アップロードのため大きめ)
    app.use('/ext/api', express.json({ limit: '25mb' }));

    // 3. クライアント拡張アセット (js/css) の配信
    app.use('/ext/assets', express.static(path.join(__dirname, 'public'), {
        etag: true,
        maxAge: 0,
    }));

    // 4. 拡張 API ルート
    // -- 設定 / カバー画像
    app.get('/ext/api/settings', cover.getSettings);
    app.post('/ext/api/settings', cover.updateSettings);
    app.get('/ext/api/video/:id/cover', cover.getCover);

    // -- DMM(FANZA) 商品検索
    app.get('/ext/api/dmm/search', dmm.search);
    app.post('/ext/api/dmm/apply', dmm.apply);

    // -- 動画の拡張メタデータ
    app.get('/ext/api/video/:id/meta', meta.getMeta);
    app.put('/ext/api/video/:id/meta', meta.putMeta);
    app.get('/ext/api/meta/bulk', meta.bulk);

    // -- 拡張検索
    app.get('/ext/api/search', search.search);
    app.get('/ext/api/fullsearch', fullsearch.fullSearch);
    app.get('/ext/api/release-calendar', search.releaseCalendar);
    app.get('/ext/api/series', search.seriesList);

    // -- タグ一覧 / タグサムネイル
    app.get('/ext/api/tags', tags.list);
    app.get('/ext/api/tag/thumb', tags.getThumb);
    app.post('/ext/api/tag/thumb', tags.setThumb);
    app.delete('/ext/api/tag/thumb', tags.deleteThumb);
    // -- 動画タグ プリセットのグループレイアウト (# 見出し入り)
    app.get('/ext/api/video-tag-layout', tags.getVideoTagLayout);
    app.put('/ext/api/video-tag-layout', tags.setVideoTagLayout);
    // -- 動画単体のタグ 取得/設定
    app.get('/ext/api/video/:id/tags', tags.getVideoTags);
    app.put('/ext/api/video/:id/tags', tags.setVideoTags);

    // -- スクリーンショット枚数
    app.get('/ext/api/screenshots/counts', screenshots.counts);

    // -- 関連動画 (拡張メタデータ類似・事前計算)
    app.get('/ext/api/video/:id/related', related.getForVideo);
    app.get('/ext/api/related/weights', related.getWeightsRoute);
    app.put('/ext/api/related/weights', related.setWeightsRoute);
    app.post('/ext/api/related/rebuild', related.rebuild);

    // -- 出演者タグ プリセット
    app.get('/ext/api/performer-tags', performers.getPresetTags);
    app.put('/ext/api/performer-tags', performers.setPresetTags);

    // -- 出演者タグ 自動付与ルール
    app.get('/ext/api/performer-tag-rules', tagrules.getRules);
    app.put('/ext/api/performer-tag-rules', tagrules.setRules);
    app.post('/ext/api/performer-tag-rules/apply', tagrules.apply);

    // -- ブックマーク
    app.get('/ext/api/bookmark/folders', bookmark.folders);
    app.post('/ext/api/bookmark/folders', bookmark.createFolder);
    app.put('/ext/api/bookmark/folders/:id', bookmark.renameFolder);
    app.delete('/ext/api/bookmark/folders/:id', bookmark.deleteFolder);
    app.get('/ext/api/bookmark/ids', bookmark.ids);
    app.get('/ext/api/bookmark/video/:id', bookmark.videoFolders);
    app.post('/ext/api/bookmark/video/:id', bookmark.addVideo);
    app.delete('/ext/api/bookmark/video/:id', bookmark.removeVideo);

    // -- バックアップ
    app.get('/ext/api/backup/export', backup.exportAll);
    app.post('/ext/api/backup/import', backup.importAll);

    // -- 一括操作
    app.post('/ext/api/bulk/tags', bulk.tags);
    app.post('/ext/api/bulk/meta', bulk.meta);
    app.post('/ext/api/bulk/bookmark', bulk.bookmark);
    app.post('/ext/api/bulk/delete', bulk.delete);

    // -- 出演者
    app.get('/ext/api/performers/all', performers.all);
    app.post('/ext/api/performers/cleanup-unused', performers.cleanupUnused);
    app.get('/ext/api/performers', performers.list);
    app.post('/ext/api/performers', performers.create);
    app.get('/ext/api/performer/:id', performers.get);
    app.put('/ext/api/performer/:id', performers.update);
    app.get('/ext/api/performer/:id/image', performers.getImage);
    app.post('/ext/api/performer/:id/image', performers.setImage);
    app.get('/ext/api/performer/:id/videos', performers.relatedVideos);
    app.get('/ext/api/performer/:id/screenshots', performers.relatedScreenshots);

    // 5. ページ HTML への拡張スクリプト注入 (静的配信より前に登録)
    app.use(createInject());

    console.log('[WomanLive拡張] 拡張機能を読み込みました (/ext)');
};
