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

// --- 監視役 (ライブラリ切り替え時の再起動) ---
// 最初に起動したプロセスは監視役になり、同じ引数で子プロセス(=実際のサーバー)を起動して終了を待つ。
// 子が RESTART_CODE で終わったら起動し直す (ライブラリ切り替え)。それ以外の終わり方なら同じコードで終わる。
// 監視役は spawnSync で待つだけで、server/index.js には進まない (process.exit で抜ける)。
// コンソール画面はそのまま使われ、2回目以降は -browser を外すので新しいタブも開かない。
if (!process.env.WLEXT_CHILD) {
    const { spawnSync } = require('child_process');
    const { RESTART_CODE } = require('./library');
    const base = [...process.execArgv, ...process.argv.slice(1)];
    let first = true, r = null;
    for (;;) {
        const args = first ? base : base.filter(a => a !== '-browser' && a !== '--browser');
        r = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, WLEXT_CHILD: '1' } });
        if (r.error || r.status !== RESTART_CODE) break;
        first = false;
        console.log('[WomanLive拡張] ライブラリを切り替えて再起動します');
    }
    if (r && r.error && first) {
        // 子を起動できなかった: 監視役なしで、このプロセスがそのままサーバーになる (切り替えは手動再起動)
        console.error('[WomanLive拡張] 監視役を起動できませんでした。ライブラリの切り替えには手動の再起動が必要です:', r.error.message);
    } else {
        process.exit(r && r.status != null ? r.status : 1);
    }
} else {
    // 子: 監視役が強制終了された (コンソールを閉じた・開発ツールが止めた等) ら一緒に終わる。
    // Windows では親を殺しても子は残り、19190 を握ったままになるため。
    const ppid = process.ppid;
    setInterval(() => {
        try { process.kill(ppid, 0); } catch (e) { process.exit(0); }
    }, 2000).unref();
}

// --- 本体の DB を、使用中ライブラリのファイルで開かせる ---
try {
    require('./library').installDbHook(require('path').join(__dirname, '..'));
} catch (e) {
    console.error('[WomanLive拡張] ライブラリの準備に失敗しました (既定のライブラリで起動します):', e);
}

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
