// =============================================================
// ライブラリ API (仕組みは ../library.js)
//   GET    /ext/api/libraries              一覧
//   GET    /ext/api/libraries/current      使用中 (切り替え後の再起動待ちに使う)
//   POST   /ext/api/libraries              作成 { name, mode: empty|settings|clone }
//   POST   /ext/api/libraries/import       取り込み { path, name }
//   PUT    /ext/api/libraries/:id          名前の変更 { name }
//   POST   /ext/api/libraries/:id/switch   切り替え (この PC からのみ)
//   DELETE /ext/api/libraries/:id          削除     (この PC からのみ)
// =============================================================
const { db } = require('../db');
const library = require('../library');

function fail(res, e, tag) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    console.error('[ext library ' + tag + ']', e);
    res.status(500).json({ error: e.message });
}
function localOnly(req, res, what) {
    if (library.isLocal(req)) return true;
    res.status(403).json({ error: 'ライブラリの' + what + 'は、サーバーを動かしている PC（localhost）からのみ行えます' });
    return false;
}

// 書き込み系のガード: 画面を開いたときのライブラリと今のライブラリが違えば拒否する。
// 動画の id はライブラリごとに振られるので、切り替え前の画面から「id 123 に★5」が通ると
// 別のライブラリの別の動画に入ってしまう。ヘッダーはクライアント(api.js)が全リクエストに付ける。
// あわせて、書き込みの後に共通設定を既定ライブラリへ書き戻す。
exports.middleware = (req, res, next) => {
    res.set('X-WLExt-Library', library.runtime.id);
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const from = req.get('X-WLExt-Library');
    if (from && from !== library.runtime.id) {
        return res.status(409).json({ error: 'ライブラリが切り替わっています。画面を読み直してください。', code: 'library_changed' });
    }
    if (library.runtime.shared) {
        res.on('finish', () => setImmediate(() => {
            try { library.syncSharedOut(db); } catch (e) { console.error('[ext library sync]', e); }
        }));
    }
    next();
};

exports.list = (req, res) => {
    try {
        res.json({
            current: library.runtime.id,
            local: library.isLocal(req),
            canRestart: process.env.WLEXT_CHILD === '1',
            warning: library.runtime.warning || '',
            libraries: library.list(db),
        });
    } catch (e) { fail(res, e, 'list'); }
};

exports.current = (req, res) => res.json({ id: library.runtime.id });

exports.create = async (req, res) => {
    try {
        const b = req.body || {};
        const mode = ['empty', 'settings', 'clone'].includes(b.mode) ? b.mode : 'empty';
        res.json(await library.create(db, b.name, mode));
    } catch (e) { fail(res, e, 'create'); }
};

exports.importDb = async (req, res) => {
    try {
        const b = req.body || {};
        res.json(await library.importDb(b.path, b.name));
    } catch (e) { fail(res, e, 'import'); }
};

exports.rename = (req, res) => {
    try { res.json(library.rename(req.params.id, (req.body || {}).name)); }
    catch (e) { fail(res, e, 'rename'); }
};

exports.switchTo = (req, res) => {
    if (!localOnly(req, res, '切り替え')) return;
    try { res.json(library.switchTo(db, req.params.id)); }
    catch (e) { fail(res, e, 'switch'); }
};

exports.remove = (req, res) => {
    if (!localOnly(req, res, '削除')) return;
    try { res.json(library.remove(req.params.id)); }
    catch (e) { fail(res, e, 'remove'); }
};
