// =============================================================
// タグ一覧 ルート
//   - GET  /ext/api/tags            登録動画のタグを集計 (本数・既定サムネ・カスタム有無)
//   - GET  /ext/api/tag/thumb       カスタムサムネイル画像 (?name=...)
//   - POST /ext/api/tag/thumb       カスタムサムネイルを保存 ({name, image})
//   - DELETE /ext/api/tag/thumb     カスタムサムネイルを削除 (既定に戻す) (?name=...)
//
// 動画タグは本体 metadata.tags に改行区切りで保存されている (無改変)。
// =============================================================
const { db, splitList, getSetting, setSetting, imageContentType, sharp } = require('../db');

// 推奨サムネイル: 16:9 (シリーズ一覧カードと同じ比率)
const THUMB_W = 640;
const THUMB_H = 360;

// --- 動画タグのプリセット グループレイアウト ---
// 本家 preset_tags は実タグのみ(無改変)。"#" を含むグループ定義は ext 側に保持する。
const VIDEO_TAG_LAYOUT_KEY = 'ext_video_tag_layout';
exports.getVideoTagLayout = (req, res) => {
    try {
        const arr = getSetting(VIDEO_TAG_LAYOUT_KEY, []);
        res.json(Array.isArray(arr) ? arr : []);
    } catch (e) { res.status(500).json({ error: e.message }); }
};
exports.setVideoTagLayout = (req, res) => {
    try {
        const arr = (req.body && req.body.layout) || [];
        const clean = Array.isArray(arr) ? arr.map(s => String(s)).map(s => s.trim()).filter(Boolean) : [];
        setSetting(VIDEO_TAG_LAYOUT_KEY, clean);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// --- 動画単体のタグ 取得/設定 (本家 metadata.tags を直接読み書き) ---
exports.getVideoTags = (req, res) => {
    try {
        const row = db.prepare('SELECT m.tags AS tags FROM files f JOIN metadata m ON m.hash = f.hash WHERE f.id = ?').get(req.params.id);
        res.json({ tags: row ? splitList(row.tags) : [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
exports.setVideoTags = (req, res) => {
    try {
        const row = db.prepare('SELECT hash FROM files WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: '動画が見つかりません' });
        const arr = (req.body && req.body.tags) || [];
        const clean = Array.isArray(arr) ? [...new Set(arr.map(s => String(s).trim()).filter(Boolean))] : [];
        // 本家と同じ保存形式 (前後を改行で囲む)。空なら NULL。
        const val = clean.length ? '\n' + clean.join('\n') + '\n' : null;
        db.prepare('UPDATE metadata SET tags = ? WHERE hash = ?').run(val, row.hash);
        res.json({ success: true, tags: clean });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /ext/api/tags  タグごとに { name, count, thumbId, hasThumb }
exports.list = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT f.id AS file_id, m.tags AS tags, (m.thumbnail IS NOT NULL) AS has_thumb
            FROM files f
            JOIN metadata m ON m.hash = f.hash
            WHERE m.tags IS NOT NULL AND m.tags != ''
        `).all();

        // タグ名は大文字小文字を区別せず集計 (本体の検索/タグ保存が NOCASE のため)
        const map = new Map(); // key(lower) -> { name, count, thumbId }
        for (const r of rows) {
            for (const t of splitList(r.tags)) {
                const key = t.toLowerCase();
                let e = map.get(key);
                if (!e) { e = { name: t, count: 0, thumbId: null }; map.set(key, e); }
                e.count++;
                if (e.thumbId == null && r.has_thumb) e.thumbId = r.file_id;
            }
        }

        // カスタムサムネイルを持つタグ
        const thumbSet = new Set(db.prepare('SELECT name FROM ext_tag_thumb').all().map(x => String(x.name).toLowerCase()));

        const out = [...map.values()].map(e => ({
            name: e.name,
            count: e.count,
            thumbId: e.thumbId,
            hasThumb: thumbSet.has(e.name.toLowerCase())
        }));
        res.json(out);
    } catch (e) {
        console.error('[ext tags]', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/tag/thumb?name=...  カスタムサムネイル本体
exports.getThumb = (req, res) => {
    try {
        const name = (req.query.name || '').trim();
        if (!name) return res.status(400).end();
        const row = db.prepare('SELECT image FROM ext_tag_thumb WHERE name = ?').get(name);
        if (!row || !row.image) return res.status(404).end();
        const buf = row.image;
        res.set('Content-Type', imageContentType(buf));
        res.set('Cache-Control', 'no-cache');
        res.send(buf);
    } catch (e) {
        if (!res.headersSent) res.status(500).end();
    }
};

// POST /ext/api/tag/thumb  {name, image: dataURL}
exports.setThumb = async (req, res) => {
    try {
        const b = req.body || {};
        const name = (b.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name required' });

        const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(b.image || '');
        if (!m) return res.status(400).json({ error: 'invalid image data' });

        let buf = Buffer.from(m[1], 'base64');
        if (sharp) {
            try {
                buf = await sharp(buf).resize(THUMB_W, THUMB_H, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
            } catch (err) {
                console.warn('[ext] タグ画像変換に失敗、元データを保存します:', err.message);
            }
        }
        db.prepare('INSERT OR REPLACE INTO ext_tag_thumb (name, image, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(name, buf);
        res.json({ success: true });
    } catch (e) {
        console.error('[ext tag thumb set]', e);
        res.status(500).json({ error: e.message });
    }
};

// DELETE /ext/api/tag/thumb?name=...  カスタムサムネイルを削除 (既定サムネに戻す)
exports.deleteThumb = (req, res) => {
    try {
        const name = (req.query.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name required' });
        db.prepare('DELETE FROM ext_tag_thumb WHERE name = ?').run(name);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// 指定タグが付いた動画の hash 一覧を集める (タグ名は大文字小文字を区別しない)
function hashesForTag(name) {
    const key = name.toLowerCase();
    const rows = db.prepare(`
        SELECT f.hash AS hash, m.tags AS tags
        FROM files f
        JOIN metadata m ON m.hash = f.hash
        WHERE m.tags IS NOT NULL AND m.tags != ''
    `).all();
    const hashes = [];
    const seen = new Set();
    for (const r of rows) {
        if (seen.has(r.hash)) continue;
        if (splitList(r.tags).some(t => t.toLowerCase() === key)) { hashes.push(r.hash); seen.add(r.hash); }
    }
    return hashes;
}

// GET /ext/api/tag/screenshots?name=...&limit=9
// 当該タグが付いた動画のスクリーンショットからランダムに最大 limit 枚返す。
exports.screenshots = (req, res) => {
    try {
        const name = (req.query.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name required' });
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 30);

        let hashes = hashesForTag(name);
        if (!hashes.length) return res.json([]);
        // SQLite のプレースホルダ上限を超えないようにランダムサンプリング
        if (hashes.length > 800) {
            for (let i = hashes.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[hashes[i], hashes[j]] = [hashes[j], hashes[i]]; }
            hashes = hashes.slice(0, 800);
        }
        const ph = hashes.map(() => '?').join(',');
        const shots = db.prepare(`
            SELECT s.id, s.timestamp, MIN(f.id) AS video_id
            FROM screenshots s
            JOIN files f ON f.hash = s.hash
            WHERE s.hash IN (${ph})
            GROUP BY s.id
            ORDER BY RANDOM()
            LIMIT ?
        `).all(...hashes, limit);
        res.json(shots);
    } catch (e) {
        console.error('[ext tag screenshots]', e);
        res.status(500).json({ error: e.message });
    }
};

// POST /ext/api/tag/thumb/from-screenshot  {name, screenshotId}
// スクリーンショット画像をタグのカスタムサムネイルとして保存する。
exports.setThumbFromScreenshot = async (req, res) => {
    try {
        const b = req.body || {};
        const name = (b.name || '').trim();
        const sid = parseInt(b.screenshotId, 10);
        if (!name) return res.status(400).json({ error: 'name required' });
        if (!Number.isInteger(sid)) return res.status(400).json({ error: 'screenshotId required' });

        const shot = db.prepare('SELECT image_data FROM screenshots WHERE id = ?').get(sid);
        if (!shot || !shot.image_data) return res.status(404).json({ error: 'スクリーンショットが見つかりません' });

        let buf = shot.image_data;
        if (sharp) {
            try {
                buf = await sharp(buf).resize(THUMB_W, THUMB_H, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
            } catch (err) {
                console.warn('[ext] タグ画像変換に失敗、元データを保存します:', err.message);
            }
        }
        db.prepare('INSERT OR REPLACE INTO ext_tag_thumb (name, image, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(name, buf);
        res.json({ success: true });
    } catch (e) {
        console.error('[ext tag thumb from screenshot]', e);
        res.status(500).json({ error: e.message });
    }
};
