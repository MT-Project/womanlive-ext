// =============================================================
// HTML 注入ミドルウェア
// 既存の client/dist/index.html を「ディスク上は変更せず」、配信時に
// 拡張用の <link>/<script> を <head> へ差し込みます。
// /watch/:id や /performer/:id など、SPA のページ遷移すべてに適用されます。
// =============================================================
const fs = require('fs');
const path = require('path');

const DIST_INDEX = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');

// api/core は React 本体(module)より先に fetch をフックする必要があるため
// あえて defer を付けずに先頭で実行させる。各機能はコールバック登録のみなので defer でよい。
const EARLY_SCRIPTS = [
    '/ext/assets/api.js',
    '/ext/assets/namekey.js',
    '/ext/assets/core.js',
];
const FEATURE_SCRIPTS = [
    '/ext/assets/nav.js',
    '/ext/assets/cover.js',
    '/ext/assets/ssresize.js',
    '/ext/assets/videometa.js',
    '/ext/assets/searchenh.js',
    '/ext/assets/performer.js',
    '/ext/assets/performerlist.js',
    '/ext/assets/serieslist.js',
    '/ext/assets/taglist.js',
    '/ext/assets/releasecal.js',
    '/ext/assets/bookmark.js',
    '/ext/assets/bookmarklist.js',
    '/ext/assets/screenshots.js',
    '/ext/assets/cardenh.js',
    '/ext/assets/bulkselect.js',
    '/ext/assets/homelinks.js',
    '/ext/assets/settings.js',
];

module.exports = function createInject() {
    const cacheBust = Date.now(); // サーバー起動ごとに更新
    const injection =
        `\n  <link rel="stylesheet" href="/ext/assets/womanlive-ext.css?v=${cacheBust}">\n` +
        EARLY_SCRIPTS.map(s => `  <script src="${s}?v=${cacheBust}"></script>`).join('\n') + '\n' +
        FEATURE_SCRIPTS.map(s => `  <script defer src="${s}?v=${cacheBust}"></script>`).join('\n') +
        '\n';

    return function injectMiddleware(req, res, next) {
        if (req.method !== 'GET') return next();

        const p = req.path;
        // API・拡張アセットは対象外
        if (p.startsWith('/api') || p.startsWith('/ext/')) return next();
        // 拡張子を持つパス(=静的ファイル)は対象外
        const lastSeg = p.substring(p.lastIndexOf('/') + 1);
        if (lastSeg.includes('.')) return next();
        // HTML を要求していなければ対象外
        const accept = req.headers.accept || '';
        if (!accept.includes('text/html')) return next();

        try {
            let html = fs.readFileSync(DIST_INDEX, 'utf8');
            if (html.includes('</head>')) {
                html = html.replace('</head>', injection + '</head>');
            }
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'no-cache');
            return res.send(html);
        } catch (e) {
            // dist が無い等の場合は元の処理に委ねる
            return next();
        }
    };
};
