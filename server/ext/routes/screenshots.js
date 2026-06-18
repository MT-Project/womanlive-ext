// =============================================================
// スクリーンショット枚数 ルート
// 指定された動画(file id)ごとのスクリーンショット枚数を返します。
// 検索結果カードのカメラアイコン横の数字表示に使います。
// スクショは screenshots テーブルに metadata.hash で紐付くため、
// ファイルの hash 一致でカウントします(同一内容の重複ファイルも同数)。
// =============================================================
const { db } = require('../db');

exports.counts = (req, res) => {
    try {
        const ids = String(req.query.ids || '')
            .split(',')
            .map(s => parseInt(s, 10))
            .filter(n => Number.isInteger(n))
            .slice(0, 500); // 1リクエストあたりの上限
        if (!ids.length) return res.json({ counts: {} });

        const placeholders = ids.map(() => '?').join(',');
        const rows = db.prepare(`
            SELECT f.id AS id, COUNT(s.id) AS cnt
            FROM files f
            LEFT JOIN screenshots s ON s.hash = f.hash
            WHERE f.id IN (${placeholders})
            GROUP BY f.id
        `).all(...ids);

        const counts = {};
        rows.forEach(r => { counts[r.id] = r.cnt; });
        res.json({ counts });
    } catch (e) {
        console.error('[ext screenshots counts]', e);
        res.status(500).json({ error: e.message });
    }
};
