// =============================================================
// バックアップ エクスポート / インポート
//  拡張機能が生成する全データ(追加メタ・出演者・カバー・ブックマーク・設定)を
//  JSON で入出力する。インポートは「全置換(復元)」。
// =============================================================
const { db } = require('../db');

const b64enc = (buf) => (buf ? Buffer.from(buf).toString('base64') : null);
const b64dec = (s) => (s ? Buffer.from(s, 'base64') : null);
function pick(o, keys) { const r = {}; keys.forEach(k => { r[k] = (o && o[k] !== undefined) ? o[k] : null; }); return r; }

const META_KEYS = ['hash', 'rating', 'display_name', 'model_no', 'release_date', 'series', 'maker', 'label', 'directors', 'genres', 'performers', 'updated_at'];
const PERF_KEYS = ['id', 'name', 'furigana', 'birthday', 'height', 'weight', 'bust', 'cup', 'waist', 'hip', 'blood_type', 'aliases', 'rating', 'tags', 'created_at', 'updated_at'];

// GET /ext/api/backup/export
exports.exportAll = (req, res) => {
    try {
        const settings = {};
        db.prepare("SELECT key, value FROM settings WHERE key LIKE 'ext_%'").all()
            .forEach(r => { try { settings[r.key] = JSON.parse(r.value); } catch (e) { settings[r.key] = r.value; } });

        const data = {
            app: 'WomanLive-ext',
            version: 1,
            exported_at: new Date().toISOString(),
            settings,
            video_meta: db.prepare('SELECT * FROM ext_video_meta').all(),
            performers: db.prepare('SELECT * FROM ext_performers').all().map(p => ({ ...p, image: b64enc(p.image) })),
            video_cover: db.prepare('SELECT * FROM ext_video_cover').all().map(c => ({ ...c, image: b64enc(c.image) })),
            bookmark_folders: db.prepare('SELECT * FROM ext_bookmark_folders').all(),
            bookmarks: db.prepare('SELECT * FROM ext_bookmarks').all(),
        };
        res.json(data);
    } catch (e) { console.error('[ext backup export]', e); res.status(500).json({ error: e.message }); }
};

// POST /ext/api/backup/import  { data }
exports.importAll = (req, res) => {
    try {
        const d = (req.body && req.body.data) || req.body;
        if (!d || typeof d !== 'object') return res.status(400).json({ error: '不正なバックアップデータです' });

        const stats = {};
        db.transaction(() => {
            // 設定 (ext_ キー)
            if (d.settings && typeof d.settings === 'object') {
                const st = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                Object.keys(d.settings).forEach(k => { if (k.indexOf('ext_') === 0) st.run(k, JSON.stringify(d.settings[k])); });
            }

            // 関連動画キャッシュは作り直しになるためクリア
            db.prepare('DELETE FROM ext_related').run();

            // 追加メタ
            db.prepare('DELETE FROM ext_video_meta').run();
            if (Array.isArray(d.video_meta)) {
                const s = db.prepare(`INSERT OR REPLACE INTO ext_video_meta
                    (hash,rating,display_name,model_no,release_date,series,maker,label,directors,genres,performers,updated_at)
                    VALUES (@hash,@rating,@display_name,@model_no,@release_date,@series,@maker,@label,@directors,@genres,@performers,@updated_at)`);
                d.video_meta.forEach(r => s.run(pick(r, META_KEYS)));
                stats.video_meta = d.video_meta.length;
            }

            // 出演者 (画像含む)
            db.prepare('DELETE FROM ext_performers').run();
            if (Array.isArray(d.performers)) {
                const s = db.prepare(`INSERT OR REPLACE INTO ext_performers
                    (id,name,furigana,birthday,height,weight,bust,cup,waist,hip,blood_type,aliases,rating,tags,image,created_at,updated_at)
                    VALUES (@id,@name,@furigana,@birthday,@height,@weight,@bust,@cup,@waist,@hip,@blood_type,@aliases,@rating,@tags,@image,@created_at,@updated_at)`);
                d.performers.forEach(p => s.run({ ...pick(p, PERF_KEYS), image: b64dec(p.image) }));
                stats.performers = d.performers.length;
            }

            // カバー画像
            db.prepare('DELETE FROM ext_video_cover').run();
            if (Array.isArray(d.video_cover)) {
                const s = db.prepare('INSERT OR REPLACE INTO ext_video_cover (hash,image,updated_at) VALUES (@hash,@image,@updated_at)');
                d.video_cover.forEach(c => s.run({ hash: c.hash, image: b64dec(c.image), updated_at: c.updated_at || null }));
                stats.video_cover = d.video_cover.length;
            }

            // ブックマーク
            db.prepare('DELETE FROM ext_bookmark_folders').run();
            if (Array.isArray(d.bookmark_folders)) {
                const s = db.prepare('INSERT OR REPLACE INTO ext_bookmark_folders (id,name,created_at) VALUES (@id,@name,@created_at)');
                d.bookmark_folders.forEach(f => s.run({ id: f.id, name: f.name || '', created_at: f.created_at || null }));
                stats.bookmark_folders = d.bookmark_folders.length;
            }
            db.prepare('DELETE FROM ext_bookmarks').run();
            if (Array.isArray(d.bookmarks)) {
                const s = db.prepare('INSERT OR REPLACE INTO ext_bookmarks (folder_id,hash,created_at) VALUES (@folder_id,@hash,@created_at)');
                d.bookmarks.forEach(b => s.run({ folder_id: b.folder_id, hash: b.hash, created_at: b.created_at || null }));
                stats.bookmarks = d.bookmarks.length;
            }
        })();

        res.json({ success: true, ...stats });
    } catch (e) { console.error('[ext backup import]', e); res.status(500).json({ error: e.message }); }
};
