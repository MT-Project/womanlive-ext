// =============================================================
// 関連動画 (拡張メタデータによる類似度スコアリング・事前計算)
//
// 本体の関連動画はファイルパスの前後12件(同フォルダ近傍)を返すだけで、
// 拡張メタデータを考慮しません。ここでは シリーズ/出演者/メーカー/レーベル/
// 監督/ジャンル/タグ/公開時期/評価 の一致度を加重スコアで採点し、
// 類似動画の上位を返します(本体は無改変。クライアントの fetch フックが差し替え)。
//
// 事前計算: 結果は ext_related に保存。ソースの ext_video_meta.updated_at が
// キャッシュの計算時刻より新しければ自動で再計算(=その動画を編集すれば反映)。
// 設定画面の「全再計算」で全体を一括計算(横断的な変化も反映)できます。
// =============================================================
const { db, splitList, getSetting, setSetting, hashOfVideo } = require('../db');

const LIMIT = 12;

// 重み(初期値)。シリーズ最重視。パス近接は使わない。
const DEFAULT_WEIGHTS = {
    series: 100,       // 同一シリーズ
    performer: 60,     // 出演者の一致(1名ごと)
    maker: 25,         // 同一メーカー
    label: 20,         // 同一レーベル
    director: 25,      // 監督の一致(共有あり)
    genre: 8,          // ジャンルの一致(1つごと)
    genreCap: 5,       // ジャンル加点の上限個数
    tag: 4,            // タグの一致(1つごと)
    tagCap: 6,         // タグ加点の上限個数
    releaseYear: 6,    // 公開年が同じ
    releaseMonth: 4,   // 公開月も同じ(年に加算)
    rating: 5          // 評価の近さ(最大)
};

function getWeights() {
    const w = getSetting('ext_related_weights', {}) || {};
    const out = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
        const v = Number(w[k]);
        out[k] = Number.isFinite(v) ? v : DEFAULT_WEIGHTS[k];
    }
    return out;
}

const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();

// 対象 hash のメタから類似候補を採点して上位を返す [{hash, score}]
function computeRelated(srcHash, W) {
    const src = db.prepare('SELECT * FROM ext_video_meta WHERE hash = ?').get(srcHash);
    if (!src) return [];
    const tagRow = db.prepare('SELECT tags FROM metadata WHERE hash = ?').get(srcHash);

    const sPerf = splitList(src.performers);                 // performer id (完全一致)
    const sDir = splitList(src.directors).map(lc);
    const sGen = splitList(src.genres).map(lc);
    const sTags = splitList(tagRow && tagRow.tags).map(lc);
    const sSeries = (src.series || '').trim();
    const sMaker = (src.maker || '').trim();
    const sLabel = (src.label || '').trim();
    const sYear = (src.release_date || '').slice(0, 4);
    const sMonth = (src.release_date || '').slice(0, 7);
    const sRating = src.rating || 0;

    // --- 候補収集: いずれかの拡張属性を共有する動画のみ ---
    const conds = [], params = [];
    if (sSeries) { conds.push('e.series = ? COLLATE NOCASE'); params.push(sSeries); }
    if (sMaker) { conds.push('e.maker = ? COLLATE NOCASE'); params.push(sMaker); }
    if (sLabel) { conds.push('e.label = ? COLLATE NOCASE'); params.push(sLabel); }
    sPerf.forEach(p => { conds.push("(char(10) || IFNULL(e.performers,'') || char(10)) LIKE ?"); params.push('%' + '\n' + p + '\n' + '%'); });
    splitList(src.directors).forEach(d => { conds.push("(char(10) || IFNULL(e.directors,'') || char(10)) LIKE ? COLLATE NOCASE"); params.push('%' + '\n' + d + '\n' + '%'); });
    splitList(src.genres).forEach(g => { conds.push("(char(10) || IFNULL(e.genres,'') || char(10)) LIKE ? COLLATE NOCASE"); params.push('%' + '\n' + g + '\n' + '%'); });
    if (!conds.length) return []; // 共有できる属性が無い → 関連なし

    const cands = db.prepare(`
        SELECT e.hash, e.rating, e.series, e.maker, e.label, e.directors, e.genres, e.performers, e.release_date, m.tags
        FROM ext_video_meta e
        JOIN metadata m ON m.hash = e.hash
        WHERE e.hash != ? AND (${conds.join(' OR ')})
    `).all(srcHash, ...params);

    const scored = [];
    for (const c of cands) {
        let s = 0;
        if (sSeries && lc(c.series) === lc(sSeries)) s += W.series;
        if (sPerf.length) { const cp = splitList(c.performers); s += cp.filter(x => sPerf.includes(x)).length * W.performer; }
        if (sMaker && lc(c.maker) === lc(sMaker)) s += W.maker;
        if (sLabel && lc(c.label) === lc(sLabel)) s += W.label;
        if (sDir.length) { const cd = splitList(c.directors).map(lc); if (sDir.some(d => cd.includes(d))) s += W.director; }
        if (sGen.length) { const cg = splitList(c.genres).map(lc); const sh = sGen.filter(g => cg.includes(g)).length; s += Math.min(sh, W.genreCap) * W.genre; }
        if (sTags.length) { const ct = splitList(c.tags).map(lc); const sh = sTags.filter(t => ct.includes(t)).length; s += Math.min(sh, W.tagCap) * W.tag; }
        if (sYear && (c.release_date || '').slice(0, 4) === sYear) { s += W.releaseYear; if (sMonth && (c.release_date || '').slice(0, 7) === sMonth) s += W.releaseMonth; }
        if (sRating && c.rating) s += Math.round(W.rating * (5 - Math.abs(sRating - c.rating)) / 5);
        if (s > 0) scored.push({ hash: c.hash, score: s, rating: c.rating || 0 });
    }
    scored.sort((a, b) => b.score - a.score || b.rating - a.rating || (a.hash < b.hash ? -1 : 1));
    return scored.slice(0, LIMIT);
}

// ext_related を src_hash 単位で置き換え(該当なしはマーカー行を残す)
function storeRelated(srcHash, scored) {
    db.prepare('DELETE FROM ext_related WHERE src_hash = ?').run(srcHash);
    const ins = db.prepare('INSERT INTO ext_related (src_hash, rank, rel_hash, score, computed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
    if (scored.length) scored.forEach((r, i) => ins.run(srcHash, i, r.hash, r.score));
    else ins.run(srcHash, 0, null, 0); // 計算済み(該当なし)マーカー
}

// キャッシュが最新か (ソースの更新時刻と比較)
function isFresh(srcHash) {
    const cached = db.prepare('SELECT MAX(computed_at) AS at FROM ext_related WHERE src_hash = ?').get(srcHash);
    if (!cached || !cached.at) return false;
    const src = db.prepare('SELECT updated_at FROM ext_video_meta WHERE hash = ?').get(srcHash);
    if (!src) return true; // メタ無し → 再計算しても空。マーカーを維持
    return cached.at >= src.updated_at;
}

// rel_hash 群を「代表ファイル1件ずつ」に解決(本体 relatedVideos と同形)
function resolveFiles(hashes, excludeHash) {
    const stmt = db.prepare(`
        SELECT f.id, f.path, f.filename,
               (m.thumbnail IS NOT NULL) AS has_thumbnail, LENGTH(m.thumbnail) AS thumbnail_size,
               m.duration, m.tags, m.display_name, m.last_pos, m.use_transcode
        FROM files f JOIN metadata m ON m.hash = f.hash
        WHERE f.hash = ?
        ORDER BY (m.thumbnail IS NOT NULL) DESC, f.id ASC LIMIT 1
    `);
    const out = [];
    for (const hsh of hashes) {
        if (!hsh || hsh === excludeHash) continue;
        const row = stmt.get(hsh);
        if (row) out.push(row);
    }
    return out;
}

// GET /ext/api/video/:id/related
exports.getForVideo = (req, res) => {
    try {
        const hash = hashOfVideo(req.params.id);
        if (!hash) return res.json({ videos: [] });
        if (!isFresh(hash)) {
            const W = getWeights();
            const scored = computeRelated(hash, W);
            db.transaction(() => storeRelated(hash, scored))();
        }
        const hashes = db.prepare('SELECT rel_hash FROM ext_related WHERE src_hash = ? AND rel_hash IS NOT NULL ORDER BY rank ASC').all(hash).map(r => r.rel_hash);
        res.json({ videos: resolveFiles(hashes, hash) });
    } catch (e) {
        console.error('[ext related]', e);
        res.status(500).json({ error: e.message });
    }
};

// POST /ext/api/related/rebuild  全件を事前計算
exports.rebuild = (req, res) => {
    try {
        const W = getWeights();
        const hashes = db.prepare('SELECT hash FROM ext_video_meta').all().map(r => r.hash);
        let count = 0;
        db.transaction(() => {
            db.prepare('DELETE FROM ext_related').run();
            for (const hsh of hashes) { storeRelated(hsh, computeRelated(hsh, W)); count++; }
        })();
        res.json({ success: true, count });
    } catch (e) {
        console.error('[ext related rebuild]', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /ext/api/related/weights
exports.getWeightsRoute = (req, res) => {
    res.json({ weights: getWeights(), defaults: DEFAULT_WEIGHTS });
};

// PUT /ext/api/related/weights  { weights }
exports.setWeightsRoute = (req, res) => {
    try {
        const incoming = (req.body && req.body.weights) || {};
        const clean = {};
        for (const k of Object.keys(DEFAULT_WEIGHTS)) {
            const v = Number(incoming[k]);
            clean[k] = Number.isFinite(v) ? v : DEFAULT_WEIGHTS[k];
        }
        setSetting('ext_related_weights', clean);
        db.prepare('DELETE FROM ext_related').run(); // 重み変更 → 全キャッシュ破棄(以後 再計算)
        res.json({ success: true, weights: clean });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
