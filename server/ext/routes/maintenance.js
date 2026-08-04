// =============================================================
// メンテナンス: 参照されていない拡張データの掃除
//  本家の「クリーンアップ」(DELETE /api/maintenance/metadata) は
//  screenshots と metadata しか消さないため、動画ファイルが無くなると
//  ext_* 側だけが hash をキーに残り続ける。同じ条件で ext_* も掃除する。
//  ・本家のクリーンアップに便乗 (index.js のフック) → purgeOrphans()
//  ・設定画面から件数確認と単独実行 → orphans / cleanup
// =============================================================
const { db } = require('../db');

const NOT_IN_FILES = 'NOT IN (SELECT hash FROM files)';

// ラベルは設定画面にそのまま出す
const TARGETS = [
    { key: 'meta', label: '拡張メタデータ', table: 'ext_video_meta', where: `hash ${NOT_IN_FILES}` },
    { key: 'cover', label: 'カバー画像', table: 'ext_video_cover', where: `hash ${NOT_IN_FILES}` },
    { key: 'bookmark', label: 'ブックマーク', table: 'ext_bookmarks', where: `hash ${NOT_IN_FILES}` },
    // 関連動画キャッシュは、元動画が消えた行と、参照先が消えた行の両方が対象。
    // rel_hash が NULL の行は「計算済みだが該当なし」の印なので、元動画が生きていれば残す。
    {
        key: 'related', label: '関連動画キャッシュ', table: 'ext_related',
        where: `src_hash ${NOT_IN_FILES} OR (rel_hash IS NOT NULL AND rel_hash ${NOT_IN_FILES})`
    },
];

function orphanCounts() {
    const out = { total: 0, items: [] };
    TARGETS.forEach(t => {
        const c = db.prepare(`SELECT COUNT(*) AS c FROM ${t.table} WHERE ${t.where}`).get().c;
        out[t.key] = c;
        out.total += c;
        out.items.push({ key: t.key, label: t.label, table: t.table, count: c });
    });
    return out;
}

// 孤立行を削除して、削除件数を返す。呼び出し側のトランザクションに乗ることがあるので
// ここでは transaction を張らない(better-sqlite3 は入れ子トランザクションを張れない)。
function purgeOrphans() {
    const out = { total: 0 };
    TARGETS.forEach(t => {
        const n = db.prepare(`DELETE FROM ${t.table} WHERE ${t.where}`).run().changes;
        out[t.key] = n;
        out.total += n;
    });
    return out;
}

// GET /ext/api/maintenance/orphans
exports.orphans = (req, res) => {
    try { res.json(orphanCounts()); }
    catch (e) { console.error('[ext maintenance orphans]', e); res.status(500).json({ error: e.message }); }
};

// POST /ext/api/maintenance/cleanup
exports.cleanup = (req, res) => {
    try { res.json(db.transaction(purgeOrphans)()); }
    catch (e) { console.error('[ext maintenance cleanup]', e); res.status(500).json({ error: e.message }); }
};

exports.orphanCounts = orphanCounts;
exports.purgeOrphans = purgeOrphans;
