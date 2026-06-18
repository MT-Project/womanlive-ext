// =============================================================
// 出演者 ルート
// =============================================================
const { db, splitList, joinList, getSetting, setSetting } = require('../db');

const PERFORMER_TAGS_KEY = 'ext_performer_preset_tags';

// GET /ext/api/performer-tags  出演者タグのプリセット一覧 (動画タグとは別管理)
exports.getPresetTags = (req, res) => {
    try {
        const tags = getSetting(PERFORMER_TAGS_KEY, []);
        res.json(Array.isArray(tags) ? tags : []);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// PUT /ext/api/performer-tags  {tags:[...]}
exports.setPresetTags = (req, res) => {
    try {
        const tags = (req.body && req.body.tags) || [];
        const clean = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
        // 重複除去
        setSetting(PERFORMER_TAGS_KEY, [...new Set(clean)]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('[ext] sharp 未読込: 画像はそのまま保存します'); }

// 一覧の動画 SELECT (VideoList が必要とするフィールドを揃える)
const VIDEO_FIELDS = `
    f.id, f.path, f.filename, f.size,
    m.hash, m.duration,
    (m.thumbnail IS NOT NULL) AS has_thumbnail,
    LENGTH(m.thumbnail) AS thumbnail_size,
    m.tags, m.use_transcode, m.last_pos,
    e.display_name AS ext_display_name
`;

function rowToPerformer(row, includeImageFlag = true) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name || '',
        furigana: row.furigana || '',
        birthday: row.birthday || '',
        height: row.height || '',
        weight: row.weight || '',
        bust: row.bust || '',
        cup: row.cup || '',
        waist: row.waist || '',
        hip: row.hip || '',
        blood_type: row.blood_type || '',
        aliases: splitList(row.aliases),
        rating: row.rating || 0,
        tags: splitList(row.tags),
        has_image: includeImageFlag ? !!row.has_image : undefined,
    };
}

// GET /ext/api/performers?q=...   タイプアヘッド/一覧
exports.list = (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        let rows;
        if (q) {
            const like = `%${q}%`;
            rows = db.prepare(`
                SELECT id, name, furigana, (image IS NOT NULL) AS has_image
                FROM ext_performers
                WHERE name LIKE ? OR IFNULL(furigana,'') LIKE ? OR IFNULL(aliases,'') LIKE ?
                ORDER BY name LIMIT 30
            `).all(like, like, like);
        } else {
            rows = db.prepare(`
                SELECT id, name, furigana, (image IS NOT NULL) AS has_image
                FROM ext_performers ORDER BY name LIMIT 200
            `).all();
        }
        res.json(rows.map(r => ({ id: r.id, name: r.name, furigana: r.furigana, has_image: !!r.has_image })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/performers/all  出演者一覧ページ用 (全件 + 重複判定)
exports.all = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, name, furigana, birthday, height, weight, bust, cup, waist, hip,
                   blood_type, rating, aliases, tags, (image IS NOT NULL) AS has_image
            FROM ext_performers
        `).all();

        // 別名/氏名の重複判定 (同一人物が別名で複数登録されているもの)
        const norm = (s) => (s || '').trim().toLowerCase();
        const idMap = new Map(); // identity -> Set(performer id)
        rows.forEach(r => {
            const idents = [norm(r.name), ...splitList(r.aliases).map(norm)].filter(s => s.length >= 2);
            idents.forEach(idn => {
                if (!idMap.has(idn)) idMap.set(idn, new Set());
                idMap.get(idn).add(r.id);
            });
        });
        const dupIds = new Set();
        idMap.forEach(set => { if (set.size > 1) set.forEach(id => dupIds.add(id)); });

        const out = rows.map(r => ({
            id: r.id, name: r.name || '', furigana: r.furigana || '', birthday: r.birthday || '',
            height: r.height || '', weight: r.weight || '', bust: r.bust || '', cup: r.cup || '',
            waist: r.waist || '', hip: r.hip || '', blood_type: r.blood_type || '', rating: r.rating || 0,
            tags: splitList(r.tags), has_image: !!r.has_image, dup: dupIds.has(r.id)
        }));
        res.json(out);
    } catch (e) {
        console.error('[ext performers all]', e);
        res.status(500).json({ error: e.message });
    }
};

// POST /ext/api/performers/cleanup-unused  {dryRun}
// どの動画にも出演者として登録されていない出演者を一括削除する
exports.cleanupUnused = (req, res) => {
    try {
        const dryRun = !!(req.body && req.body.dryRun);
        const rows = db.prepare("SELECT performers FROM ext_video_meta WHERE performers IS NOT NULL AND performers != ''").all();
        const used = new Set();
        rows.forEach(r => splitList(r.performers).forEach(id => { const n = parseInt(id, 10); if (!isNaN(n)) used.add(n); }));

        const all = db.prepare('SELECT id FROM ext_performers').all();
        const unused = all.filter(p => !used.has(p.id)).map(p => p.id);

        if (dryRun) return res.json({ count: unused.length, total: all.length });

        const del = db.prepare('DELETE FROM ext_performers WHERE id = ?');
        db.transaction(() => unused.forEach(id => del.run(id)))();
        res.json({ success: true, deleted: unused.length });
    } catch (e) {
        console.error('[ext performers cleanup]', e);
        res.status(500).json({ error: e.message });
    }
};

// POST /ext/api/performers  {name}  -> 既存があればそれを返す(冪等)
exports.create = (req, res) => {
    try {
        const name = (req.body && req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name required' });

        db.prepare('INSERT OR IGNORE INTO ext_performers (name) VALUES (?)').run(name);
        const row = db.prepare('SELECT id, name FROM ext_performers WHERE name = ?').get(name);
        res.json({ id: row.id, name: row.name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/performer/:id
exports.get = (req, res) => {
    try {
        const row = db.prepare('SELECT *, (image IS NOT NULL) AS has_image FROM ext_performers WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'performer not found' });
        res.json(rowToPerformer(row));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// PUT /ext/api/performer/:id
exports.update = (req, res) => {
    try {
        const id = req.params.id;
        const exists = db.prepare('SELECT id FROM ext_performers WHERE id = ?').get(id);
        if (!exists) return res.status(404).json({ error: 'performer not found' });

        const b = req.body || {};
        const fields = {
            name: (b.name || '').trim() || null,
            furigana: (b.furigana || '').trim() || null,
            birthday: (b.birthday || '').trim() || null,
            height: (b.height || '').toString().trim() || null,
            weight: (b.weight || '').toString().trim() || null,
            bust: (b.bust || '').toString().trim() || null,
            cup: (b.cup || '').toString().trim() || null,
            waist: (b.waist || '').toString().trim() || null,
            hip: (b.hip || '').toString().trim() || null,
            blood_type: (b.blood_type || '').trim() || null,
            aliases: joinList(b.aliases),
            rating: Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0)),
            tags: joinList(b.tags),
        };

        try {
            db.prepare(`
                UPDATE ext_performers SET
                    name=?, furigana=?, birthday=?, height=?, weight=?, bust=?, cup=?, waist=?, hip=?,
                    blood_type=?, aliases=?, rating=?, tags=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            `).run(
                fields.name, fields.furigana, fields.birthday, fields.height, fields.weight,
                fields.bust, fields.cup, fields.waist, fields.hip, fields.blood_type,
                fields.aliases, fields.rating, fields.tags, id
            );
        } catch (err) {
            if (String(err.message).includes('UNIQUE')) {
                return res.status(409).json({ error: '同名の出演者が既に存在します' });
            }
            throw err;
        }
        res.json({ success: true });
    } catch (e) {
        console.error('[ext performer update]', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/performer/:id/image
exports.getImage = (req, res) => {
    try {
        const row = db.prepare('SELECT image FROM ext_performers WHERE id = ?').get(req.params.id);
        if (!row || !row.image) return res.status(404).end();
        const buf = row.image;
        const isPng = buf[0] === 0x89;
        const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
        res.set('Content-Type', isPng ? 'image/png' : (isJpeg ? 'image/jpeg' : 'image/webp'));
        res.set('Cache-Control', 'no-cache');
        res.send(buf);
    } catch (e) {
        if (!res.headersSent) res.status(500).end();
    }
};

// POST /ext/api/performer/:id/image  {image: dataURL}
exports.setImage = async (req, res) => {
    try {
        const id = req.params.id;
        const exists = db.prepare('SELECT id FROM ext_performers WHERE id = ?').get(id);
        if (!exists) return res.status(404).json({ error: 'performer not found' });

        const dataUrl = (req.body && req.body.image) || '';
        const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
        if (!m) return res.status(400).json({ error: 'invalid image data' });

        let buf = Buffer.from(m[1], 'base64');
        if (sharp) {
            try {
                buf = await sharp(buf).resize(600, 600, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
            } catch (err) {
                console.warn('[ext] 画像変換に失敗、元データを保存します:', err.message);
            }
        }
        db.prepare('UPDATE ext_performers SET image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(buf, id);
        res.json({ success: true });
    } catch (e) {
        console.error('[ext performer image]', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/performer/:id/videos  関連動画
exports.relatedVideos = (req, res) => {
    try {
        const like = `%\n${parseInt(req.params.id, 10)}\n%`;
        const rows = db.prepare(`
            SELECT ${VIDEO_FIELDS}
            FROM files f
            JOIN metadata m ON f.hash = m.hash
            JOIN ext_video_meta e ON e.hash = f.hash
            WHERE ('\n' || IFNULL(e.performers,'') || '\n') LIKE ?
            GROUP BY f.id
            ORDER BY f.updated_at DESC
            LIMIT 24
        `).all(like);
        res.json(rows);
    } catch (e) {
        console.error('[ext performer videos]', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/performer/:id/screenshots  関連スクリーンショット(最大8)
exports.relatedScreenshots = (req, res) => {
    try {
        const like = `%\n${parseInt(req.params.id, 10)}\n%`;
        const rows = db.prepare(`
            SELECT s.id, s.timestamp, MIN(f.id) AS video_id
            FROM screenshots s
            JOIN files f ON f.hash = s.hash
            JOIN ext_video_meta e ON e.hash = f.hash
            WHERE ('\n' || IFNULL(e.performers,'') || '\n') LIKE ?
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT 8
        `).all(like);
        res.json(rows);
    } catch (e) {
        console.error('[ext performer screenshots]', e);
        res.status(500).json({ error: e.message });
    }
};
