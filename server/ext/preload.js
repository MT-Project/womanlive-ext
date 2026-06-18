// =============================================================
// WomanLive 拡張 - プリロード (本体無改変で拡張を有効化)
//
// Node の --require で server/index.js より先に読み込み、express の
// アプリ生成をフックして拡張(setupExt)を自動登録します。
// これにより server/index.js を編集せずに拡張を使えます。
//
// 使い方 (例): NODE_OPTIONS=--require=./server/ext/preload.js node server/index.js
//   付属の womanlive-ext.bat はこれを行います。
// =============================================================
try {
    const path = require('path');
    // server/index.js が読み込むのと同じ express を解決
    const expressPath = require.resolve('express', { paths: [path.join(__dirname, '..')] });
    const express = require(expressPath);

    if (!express.__wlextWrapped) {
        const wrapped = function (...args) {
            const app = express.apply(this, args);
            try {
                require('./index')(app);
            } catch (e) {
                console.error('[WomanLive拡張] 拡張のロードに失敗しました:', e);
            }
            return app;
        };
        // express.static / express.json / Router など付属プロパティを引き継ぐ
        Object.assign(wrapped, express);
        wrapped.__wlextWrapped = true;
        require.cache[expressPath].exports = wrapped;
        console.log('[WomanLive拡張] preload 有効 (本体無改変モード)');
    }
} catch (e) {
    console.error('[WomanLive拡張] preload に失敗しました:', e);
}
