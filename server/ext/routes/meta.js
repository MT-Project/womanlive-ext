// =============================================================
// 動画の拡張メタデータ ルート
// =============================================================
const { db, splitList, joinList, hashOfVideo } = require('../db');

const EMPTY = {
    rating: 0, display_name: '', model_no: '', release_date: '',
    series: '', maker: '', label: '',
    directors: [], genres: [], performers: []
};

function expandPerformers(idsCsvLines) {
    const ids = splitList(idsCsvLines);
    if (ids.length === 0) return [];
    const out = [];
    const stmt = db.prepare('SELECT id, name, furigana, birthday, (image IS NOT NULL) AS has_image FROM ext_performers WHERE id = ?');
    for (const idStr of ids) {
        const p = stmt.get(parseInt(idStr, 10));
        if (p) out.push({ id: p.id, name: p.name, furigana: p.furigana, birthday: p.birthday, has_image: !!p.has_image });
    }
    return out;
}

// GET /ext/api/video/:id/meta
exports.getMeta = (req, res) => {
    try {
        const file = db.prepare('SELECT hash, filename, updated_at FROM files WHERE id = ?').get(req.params.id);
        if (!file) return res.status(404).json({ error: 'video not found' });

        const row = db.prepare('SELECT * FROM ext_video_meta WHERE hash = ?').get(file.hash);

        const meta = {
            ...EMPTY,
            file_name: file.filename,
            video_date: file.updated_at,   // 動画の作成日時(ファイル更新日時) 年齢計算の既定基準
        };

        if (row) {
            meta.rating = row.rating || 0;
            meta.display_name = row.display_name || '';
            meta.model_no = row.model_no || '';
            meta.release_date = row.release_date || '';
            meta.series = row.series || '';
            meta.maker = row.maker || '';
            meta.label = row.label || '';
            meta.directors = splitList(row.directors);
            meta.genres = splitList(row.genres);
            meta.performers = expandPerformers(row.performers);
        }
        res.json(meta);
    } catch (e) {
        console.error('[ext meta get]', e);
        res.status(500).json({ error: e.message });
    }
};

// PUT /ext/api/video/:id/meta
exports.putMeta = (req, res) => {
    try {
        const hash = hashOfVideo(req.params.id);
        if (!hash) return res.status(404).json({ error: 'video not found' });

        const b = req.body || {};
        // performers は id の配列で受け取る
        const performerIds = Array.isArray(b.performers)
            ? b.performers.map(p => (typeof p === 'object' ? p.id : p)).filter(x => x !== undefined && x !== null)
            : [];

        const rating = Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0));

        db.prepare(`
            INSERT INTO ext_video_meta
                (hash, rating, display_name, model_no, release_date, series, maker, label, directors, genres, performers, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(hash) DO UPDATE SET
                rating=excluded.rating, display_name=excluded.display_name, model_no=excluded.model_no,
                release_date=excluded.release_date, series=excluded.series, maker=excluded.maker,
                label=excluded.label, directors=excluded.directors, genres=excluded.genres,
                performers=excluded.performers, updated_at=CURRENT_TIMESTAMP
        `).run(
            hash, rating,
            (b.display_name || '').trim() || null,
            (b.model_no || '').trim() || null,
            (b.release_date || '').trim() || null,
            (b.series || '').trim() || null,
            (b.maker || '').trim() || null,
            (b.label || '').trim() || null,
            joinList(b.directors),
            joinList(b.genres),
            joinList(performerIds)
        );

        res.json({ success: true });
    } catch (e) {
        console.error('[ext meta put]', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/meta/bulk?ids=1,2,3  -> { "1": {display_name, rating}, ... }
// 一覧画面で表示名を置換するための軽量バルク取得
exports.bulk = (req, res) => {
    try {
        const ids = String(req.query.ids || '').split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
        if (ids.length === 0) return res.json({});

        const placeholders = ids.map(() => '?').join(',');
        const rows = db.prepare(`
            SELECT f.id, e.display_name, e.rating, e.maker
            FROM files f
            JOIN ext_video_meta e ON e.hash = f.hash
            WHERE f.id IN (${placeholders})
        `).all(...ids);

        const map = {};
        for (const r of rows) {
            if (r.display_name || r.rating || r.maker) {
                map[r.id] = { display_name: r.display_name || '', rating: r.rating || 0, maker: r.maker || '' };
            }
        }
        res.json(map);
    } catch (e) {
        console.error('[ext meta bulk]', e);
        res.status(500).json({ error: e.message });
    }
};
