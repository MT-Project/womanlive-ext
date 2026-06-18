// =============================================================
// ブックマーク機能
//  ext_bookmark_folders (フォルダ) / ext_bookmarks (フォルダ×動画hash)
// =============================================================
const { db } = require('../db');

// GET /ext/api/bookmark/folders  フォルダ一覧 (本数・平均評価・サムネ付き)
exports.folders = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT bf.id, bf.name,
                   COUNT(f.id) AS count,
                   AVG(CASE WHEN e.rating > 0 THEN e.rating END) AS avg_rating,
                   MAX(CASE WHEN m.thumbnail IS NOT NULL THEN f.id END) AS thumb_id
            FROM ext_bookmark_folders bf
            LEFT JOIN ext_bookmarks b ON b.folder_id = bf.id
            LEFT JOIN files f ON f.hash = b.hash
            LEFT JOIN metadata m ON m.hash = f.hash
            LEFT JOIN ext_video_meta e ON e.hash = f.hash
            GROUP BY bf.id
            ORDER BY bf.name
        `).all();
        res.json(rows.map(r => ({
            id: r.id, name: r.name || '',
            count: r.count || 0,
            avgRating: r.avg_rating != null ? Math.round(r.avg_rating * 10) / 10 : null,
            thumbId: r.thumb_id || null
        })));
    } catch (e) { console.error('[ext bm folders]', e); res.status(500).json({ error: e.message }); }
};

// POST /ext/api/bookmark/folders  {name}
exports.createFolder = (req, res) => {
    try {
        const name = ((req.body && req.body.name) || '').trim() || '新しいフォルダ';
        const info = db.prepare('INSERT INTO ext_bookmark_folders (name) VALUES (?)').run(name);
        res.json({ id: info.lastInsertRowid, name });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// PUT /ext/api/bookmark/folders/:id  {name}
exports.renameFolder = (req, res) => {
    try {
        const name = ((req.body && req.body.name) || '').trim();
        if (!name) return res.status(400).json({ error: 'フォルダ名が必要です' });
        const info = db.prepare('UPDATE ext_bookmark_folders SET name = ? WHERE id = ?').run(name, req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'フォルダが見つかりません' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /ext/api/bookmark/folders/:id
exports.deleteFolder = (req, res) => {
    try {
        db.transaction(() => {
            db.prepare('DELETE FROM ext_bookmarks WHERE folder_id = ?').run(req.params.id);
            db.prepare('DELETE FROM ext_bookmark_folders WHERE id = ?').run(req.params.id);
        })();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /ext/api/bookmark/video/:id  この動画が属するフォルダ状況
exports.videoFolders = (req, res) => {
    try {
        const file = db.prepare('SELECT hash FROM files WHERE id = ?').get(req.params.id);
        if (!file) return res.status(404).json({ error: '動画が見つかりません' });
        const rows = db.prepare(`
            SELECT bf.id, bf.name,
                   EXISTS(SELECT 1 FROM ext_bookmarks b WHERE b.folder_id = bf.id AND b.hash = ?) AS in_folder
            FROM ext_bookmark_folders bf
            ORDER BY bf.name
        `).all(file.hash);
        res.json({ folders: rows.map(r => ({ id: r.id, name: r.name || '', in: !!r.in_folder })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /ext/api/bookmark/video/:id  {folderId}
exports.addVideo = (req, res) => {
    try {
        const file = db.prepare('SELECT hash FROM files WHERE id = ?').get(req.params.id);
        if (!file) return res.status(404).json({ error: '動画が見つかりません' });
        const folderId = req.body && req.body.folderId;
        if (!folderId) return res.status(400).json({ error: 'folderId が必要です' });
        db.prepare('INSERT OR IGNORE INTO ext_bookmarks (folder_id, hash) VALUES (?, ?)').run(folderId, file.hash);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /ext/api/bookmark/video/:id  {folderId}
exports.removeVideo = (req, res) => {
    try {
        const file = db.prepare('SELECT hash FROM files WHERE id = ?').get(req.params.id);
        if (!file) return res.status(404).json({ error: '動画が見つかりません' });
        const folderId = req.body && req.body.folderId;
        db.prepare('DELETE FROM ext_bookmarks WHERE folder_id = ? AND hash = ?').run(folderId, file.hash);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /ext/api/bookmark/ids  ブックマーク済みの動画(ファイル)id一覧
exports.ids = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT f.id FROM files f
            JOIN ext_bookmarks b ON b.hash = f.hash
            GROUP BY f.id
        `).all();
        res.json(rows.map(r => r.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
};
