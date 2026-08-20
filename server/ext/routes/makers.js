// =============================================================
// メーカー一覧 ルート
//   - GET  /ext/api/makers        メーカーごとの集計 (本数/平均評価/TOP10タグ/レーベル) + 登録情報
//   - PUT  /ext/api/maker         メーカー情報 (ふりがな/キャッチコピー/リストページURL)
//   - GET  /ext/api/maker/image   メーカー画像 (無ければ 404 → クライアント側で既定表示)
//   - POST /ext/api/maker/image   メーカー画像を保存
//
// メーカー名は ext_video_meta.maker の文字列がそのままキー (タグ一覧と同じ考え方)。
// =============================================================
const { db, splitList, imageContentType, sharp } = require('../db');

// 出演者画像と同じ 1:1
const IMG_SIZE = 600;
// カードに出すタグの数 (多い順)
const TOP_TAGS = 10;

const nocase = (s) => String(s == null ? '' : s).toLowerCase();

// GET /ext/api/makers
exports.list = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT e.maker AS name,
                   COUNT(f.id) AS count,
                   AVG(CASE WHEN e.rating > 0 THEN e.rating END) AS avg_rating
            FROM ext_video_meta e
            JOIN files f ON f.hash = e.hash
            WHERE e.maker IS NOT NULL AND e.maker != ''
            GROUP BY e.maker
        `).all();

        // レーベル (メーカー×レーベルの本数)
        const labels = new Map();
        db.prepare(`
            SELECT e.maker AS maker, e.label AS name, COUNT(f.id) AS count
            FROM ext_video_meta e
            JOIN files f ON f.hash = e.hash
            WHERE e.maker IS NOT NULL AND e.maker != '' AND e.label IS NOT NULL AND e.label != ''
            GROUP BY e.maker, e.label
        `).all().forEach(r => {
            if (!labels.has(r.maker)) labels.set(r.maker, []);
            labels.get(r.maker).push({ name: r.name, count: r.count });
        });

        // レーベル未設定の本数 (レーベル一覧の末尾に「レーベルなし」として出す)
        const noLabel = new Map();
        db.prepare(`
            SELECT e.maker AS maker, COUNT(f.id) AS count
            FROM ext_video_meta e
            JOIN files f ON f.hash = e.hash
            WHERE e.maker IS NOT NULL AND e.maker != '' AND (e.label IS NULL OR e.label = '')
            GROUP BY e.maker
        `).all().forEach(r => noLabel.set(r.maker, r.count));

        // タグ (本家 metadata.tags は改行区切り。メーカーごとに出現数を数える)
        const tagCounts = new Map();
        db.prepare(`
            SELECT e.maker AS maker, m.tags AS tags
            FROM ext_video_meta e
            JOIN files f ON f.hash = e.hash
            JOIN metadata m ON m.hash = f.hash
            WHERE e.maker IS NOT NULL AND e.maker != '' AND m.tags IS NOT NULL
        `).all().forEach(r => {
            if (!tagCounts.has(r.maker)) tagCounts.set(r.maker, new Map());
            const cnt = tagCounts.get(r.maker);
            splitList(r.tags).forEach(t => cnt.set(t, (cnt.get(t) || 0) + 1));
        });

        // 登録済みのメーカー情報 (name は COLLATE NOCASE なので小文字で突き合わせる)
        const info = new Map();
        db.prepare('SELECT name, furigana, catch_copy, list_url, (image IS NOT NULL) AS has_image FROM ext_makers')
            .all().forEach(r => info.set(nocase(r.name), r));

        const byCountDesc = (a, b) => (b.count - a.count) || String(a.name).localeCompare(String(b.name), 'ja');

        res.json(rows.map(r => {
            const inf = info.get(nocase(r.name)) || {};
            const tags = [...(tagCounts.get(r.name) || new Map())].map(([name, count]) => ({ name, count }));
            tags.sort(byCountDesc);
            const labelList = (labels.get(r.name) || []).slice().sort(byCountDesc);
            // 「レーベルなし」は本数によらず必ず末尾
            const none = noLabel.get(r.name);
            if (none) labelList.push({ name: 'レーベルなし', count: none, none: true });
            return {
                name: r.name,
                count: r.count,
                avgRating: r.avg_rating != null ? Math.round(r.avg_rating * 10) / 10 : null,
                furigana: inf.furigana || '',
                catchCopy: inf.catch_copy || '',
                listUrl: inf.list_url || '',
                hasImage: !!inf.has_image,
                topTags: tags.slice(0, TOP_TAGS),
                labels: labelList
            };
        }));
    } catch (e) {
        console.error('[ext makers]', e);
        res.status(500).json({ error: e.message });
    }
};

// 行が無ければ作ってから更新する (メーカーは動画メタ側の文字列が実体なので、行は情報を持つときだけ作る)
function upsert(name, cols) {
    const keys = Object.keys(cols);
    db.prepare(`INSERT OR IGNORE INTO ext_makers (name) VALUES (?)`).run(name);
    db.prepare(`UPDATE ext_makers SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE name = ?`)
        .run(...keys.map(k => cols[k]), name);
}

// PUT /ext/api/maker  { name, furigana, catch_copy, list_url }
exports.update = (req, res) => {
    try {
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (!name) return res.status(400).json({ error: 'メーカー名がありません' });

        const cols = {};
        if (b.furigana !== undefined) cols.furigana = String(b.furigana).trim() || null;
        if (b.catch_copy !== undefined) cols.catch_copy = String(b.catch_copy).trim() || null;
        if (b.list_url !== undefined) {
            const url = String(b.list_url).trim();
            // 外部リンクとして開くので http(s) 以外は受け付けない
            if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'リストページURLは http(s) で入力してください' });
            cols.list_url = url || null;
        }
        if (!Object.keys(cols).length) return res.status(400).json({ error: '更新する項目がありません' });

        upsert(name, cols);
        res.json({ success: true });
    } catch (e) {
        console.error('[ext maker update]', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/maker/image?name=...
exports.getImage = (req, res) => {
    try {
        const row = db.prepare('SELECT image FROM ext_makers WHERE name = ?').get(String(req.query.name || '').trim());
        if (!row || !row.image) return res.status(404).end();
        res.set('Content-Type', imageContentType(row.image));
        res.set('Cache-Control', 'no-cache');
        res.send(row.image);
    } catch (e) {
        if (!res.headersSent) res.status(500).end();
    }
};

// POST /ext/api/maker/image  { name, image: dataURL }
exports.setImage = async (req, res) => {
    try {
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (!name) return res.status(400).json({ error: 'メーカー名がありません' });

        const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(b.image || '');
        if (!m) return res.status(400).json({ error: 'invalid image data' });

        let buf = Buffer.from(m[1], 'base64');
        if (sharp) {
            try {
                buf = await sharp(buf).resize(IMG_SIZE, IMG_SIZE, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
            } catch (err) {
                console.warn('[ext] 画像変換に失敗、元データを保存します:', err.message);
            }
        }
        upsert(name, { image: buf });
        res.json({ success: true });
    } catch (e) {
        console.error('[ext maker image]', e);
        res.status(500).json({ error: e.message });
    }
};
