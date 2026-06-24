/* =============================================================
   WomanLive 拡張 - API クライアント
   ============================================================= */
(function () {
    'use strict';
    window.WLExt = window.WLExt || {};
    const WL = window.WLExt;

    // 拡張のフックを通さない素の fetch を保持 (core.js が window.fetch を差し替えるため)
    const rawFetch = window.fetch.bind(window);
    WL._rawFetch = rawFetch;

    async function req(url, opts) {
        const r = await rawFetch(url, opts);
        if (!r.ok) {
            let msg = r.status + '';
            try { const t = await r.text(); try { msg = JSON.parse(t).error || t; } catch (e) { msg = t || msg; } } catch (e) { }
            const err = new Error(msg); err.status = r.status; throw err;
        }
        const ct = r.headers.get('content-type') || '';
        return ct.includes('json') ? r.json() : r.text();
    }
    const jsonOpts = (method, body) => ({
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });

    WL.api = {
        // 設定 / カバー
        getExtSettings: () => req('/ext/api/settings'),
        saveExtSettings: (s) => req('/ext/api/settings', jsonOpts('POST', s)),
        coverUrl: (id) => '/ext/api/video/' + id + '/cover',

        // DMM(FANZA) 商品検索
        dmmSearch: (id) => req('/ext/api/dmm/search?id=' + encodeURIComponent(id)),
        dmmApply: (id, item) => req('/ext/api/dmm/apply', jsonOpts('POST', { id, item })),

        // 動画メタ
        getMeta: (id) => req('/ext/api/video/' + id + '/meta'),
        saveMeta: (id, m) => req('/ext/api/video/' + id + '/meta', jsonOpts('PUT', m)),
        bulkMeta: (ids) => req('/ext/api/meta/bulk?ids=' + ids.join(',')),

        // 出演者
        searchPerformers: (q) => req('/ext/api/performers?q=' + encodeURIComponent(q || '')),
        performersAll: () => req('/ext/api/performers/all'),
        cleanupUnusedPerformers: (dryRun) => req('/ext/api/performers/cleanup-unused', jsonOpts('POST', { dryRun })),
        releaseCalendar: () => req('/ext/api/release-calendar'),
        seriesList: () => req('/ext/api/series'),

        // タグ一覧 / タグサムネイル
        tagsList: () => req('/ext/api/tags'),
        tagThumbUrl: (name, bust) => '/ext/api/tag/thumb?name=' + encodeURIComponent(name) + (bust ? ('&t=' + bust) : ''),
        setTagThumb: (name, dataUrl) => req('/ext/api/tag/thumb', jsonOpts('POST', { name, image: dataUrl })),
        deleteTagThumb: (name) => req('/ext/api/tag/thumb?name=' + encodeURIComponent(name), { method: 'DELETE' }),
        getPerformerTags: () => req('/ext/api/performer-tags'),
        savePerformerTags: (tags) => req('/ext/api/performer-tags', jsonOpts('PUT', { tags })),
        getTagRules: () => req('/ext/api/performer-tag-rules'),
        saveTagRules: (rules) => req('/ext/api/performer-tag-rules', jsonOpts('PUT', { rules })),
        applyTagRules: (sync) => req('/ext/api/performer-tag-rules/apply', jsonOpts('POST', { sync })),
        createPerformer: (name) => req('/ext/api/performers', jsonOpts('POST', { name })),
        getPerformer: (id) => req('/ext/api/performer/' + id),
        updatePerformer: (id, p) => req('/ext/api/performer/' + id, jsonOpts('PUT', p)),
        performerImageUrl: (id, bust) => '/ext/api/performer/' + id + '/image' + (bust ? ('?t=' + bust) : ''),
        setPerformerImage: (id, dataUrl) => req('/ext/api/performer/' + id + '/image', jsonOpts('POST', { image: dataUrl })),
        performerVideos: (id) => req('/ext/api/performer/' + id + '/videos'),
        performerScreenshots: (id) => req('/ext/api/performer/' + id + '/screenshots'),

        // JSON 一括取込
        importMb: (payload) => req('/ext/api/import/mb', jsonOpts('POST', payload)),
        importPerformers: (payload) => req('/ext/api/import/performers', jsonOpts('POST', payload)),

        // ブックマーク
        bmFolders: () => req('/ext/api/bookmark/folders'),
        bmCreateFolder: (name) => req('/ext/api/bookmark/folders', jsonOpts('POST', { name })),
        bmRenameFolder: (id, name) => req('/ext/api/bookmark/folders/' + id, jsonOpts('PUT', { name })),
        bmDeleteFolder: (id) => req('/ext/api/bookmark/folders/' + id, { method: 'DELETE' }),
        bmIds: () => req('/ext/api/bookmark/ids'),
        bmVideoFolders: (id) => req('/ext/api/bookmark/video/' + id),
        bmAdd: (id, folderId) => req('/ext/api/bookmark/video/' + id, jsonOpts('POST', { folderId })),
        bmRemove: (id, folderId) => req('/ext/api/bookmark/video/' + id, jsonOpts('DELETE', { folderId })),

        // スクリーンショット枚数
        ssCounts: (ids) => req('/ext/api/screenshots/counts?ids=' + ids.join(',')),

        // 関連動画 (拡張: メタデータ類似度)
        relatedVideos: (id) => req('/ext/api/video/' + id + '/related'),
        getRelatedWeights: () => req('/ext/api/related/weights'),
        saveRelatedWeights: (weights) => req('/ext/api/related/weights', jsonOpts('PUT', { weights })),
        rebuildRelated: () => req('/ext/api/related/rebuild', jsonOpts('POST', {})),

        // バックアップ
        backupExport: () => req('/ext/api/backup/export'),
        backupImport: (data) => req('/ext/api/backup/import', jsonOpts('POST', { data })),

        // 一括操作
        bulkTags: (ids, tags) => req('/ext/api/bulk/tags', jsonOpts('POST', { ids, tags })),
        bulkEditMeta: (ids, meta) => req('/ext/api/bulk/meta', jsonOpts('POST', { ids, meta })),
        bulkBookmark: (ids, folderId) => req('/ext/api/bulk/bookmark', jsonOpts('POST', { ids, folderId })),
        bulkDelete: (ids) => req('/ext/api/bulk/delete', jsonOpts('POST', { ids })),

        // 動画タグ プリセット (本体の /api/tags を利用)
        getVideoPresetTags: () => req('/api/tags').then(a => Array.isArray(a) ? a.map(t => (t && t.name) || t).filter(Boolean) : []),
        saveVideoPresetTags: (tags) => req('/api/tags/bulk', jsonOpts('PUT', { tags })),

        // 既存 API (フォルダ参照に流用)
        fsList: (p) => req('/api/fs/list?path=' + encodeURIComponent(p)),
        fsResolve: (base, target) => req('/api/fs/resolve?base=' + encodeURIComponent(base) + '&target=' + encodeURIComponent(target)),
    };
})();
