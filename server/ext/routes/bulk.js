// =============================================================
// 一括操作 (検索結果で選択した複数動画への処理)
//  ・タグ追加(union) / 詳細メタ上書き(ジャンルはunion) / ブックマーク一括追加 / 削除
// =============================================================
const fs = require('fs');
const path = require('path');
const { db, splitList, joinList, getSetting, IMG_EXTS } = require('../db');

// 選択 id 群を hash 単位(重複排除)で処理するためのヘルパ
function eachHash(ids, fn) {
    const getHash = db.prepare('SELECT hash FROM files WHERE id = ?');
    const seen = new Set();
    let n = 0;
    (ids || []).forEach(id => {
        const r = getHash.get(id);
        if (r && r.hash && !seen.has(r.hash)) { seen.add(r.hash); fn(r.hash); n++; }
    });
    return n;
}

// POST /ext/api/bulk/tags  { ids, tags }  既存タグは保持・重複は無視して追加
exports.tags = (req, res) => {
    try {
        const { ids, tags } = req.body || {};
        const add = (Array.isArray(tags) ? tags : []).map(t => String(t).trim()).filter(Boolean);
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids が必要です' });

        const getTags = db.prepare('SELECT tags FROM metadata WHERE hash = ?');
        const setTags = db.prepare('UPDATE metadata SET tags = ? WHERE hash = ?');
        let count = 0;
        db.transaction(() => {
            count = eachHash(ids, (hash) => {
                const row = getTags.get(hash);
                if (!row) return;
                const cur = row.tags ? row.tags.split('\n').map(t => t.trim()).filter(Boolean) : [];
                let changed = false;
                add.forEach(t => { if (!cur.includes(t)) { cur.push(t); changed = true; } });
                if (changed) setTags.run(cur.length ? '\n' + cur.join('\n') + '\n' : null, hash);
            });
        })();
        res.json({ success: true, count });
    } catch (e) { console.error('[ext bulk tags]', e); res.status(500).json({ error: e.message }); }
};

// POST /ext/api/bulk/meta  { ids, meta }
//  入力された項目のみ上書き(空欄は変更なし)。ジャンルは既存に追加(union)。表示動画名は不変。
exports.meta = (req, res) => {
    try {
        const { ids, meta } = req.body || {};
        const m = meta || {};
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids が必要です' });

        const rating = Math.max(0, Math.min(5, parseInt(m.rating, 10) || 0));
        const performerIds = Array.isArray(m.performers)
            ? m.performers.map(p => (typeof p === 'object' ? p && p.id : p)).filter(x => x !== undefined && x !== null).map(String)
            : [];
        const directors = Array.isArray(m.directors) ? m.directors : [];
        const genresIn = Array.isArray(m.genres) ? m.genres : [];
        const sv = (k) => (m[k] == null ? '' : String(m[k])).trim();

        const getMeta = db.prepare('SELECT * FROM ext_video_meta WHERE hash = ?');
        const upsert = db.prepare(`
            INSERT INTO ext_video_meta
                (hash, rating, display_name, model_no, release_date, series, maker, label, directors, genres, performers, updated_at)
            VALUES (@hash, @rating, @display_name, @model_no, @release_date, @series, @maker, @label, @directors, @genres, @performers, CURRENT_TIMESTAMP)
            ON CONFLICT(hash) DO UPDATE SET
                rating=@rating, model_no=@model_no, release_date=@release_date, series=@series,
                maker=@maker, label=@label, directors=@directors, genres=@genres, performers=@performers,
                updated_at=CURRENT_TIMESTAMP
        `); // display_name は ON CONFLICT で更新しない(=保持)

        let count = 0;
        db.transaction(() => {
            count = eachHash(ids, (hash) => {
                const cur = getMeta.get(hash) || {};
                // ジャンル: 既存 + 入力 (union)
                const genres = splitList(cur.genres);
                genresIn.forEach(g => { const gg = String(g).trim(); if (gg && !genres.includes(gg)) genres.push(gg); });

                upsert.run({
                    hash,
                    rating: rating > 0 ? rating : (cur.rating || 0),
                    display_name: cur.display_name || null,
                    model_no: sv('model_no') || cur.model_no || null,
                    release_date: sv('release_date') || cur.release_date || null,
                    series: sv('series') || cur.series || null,
                    maker: sv('maker') || cur.maker || null,
                    label: sv('label') || cur.label || null,
                    directors: directors.length ? joinList(directors) : (cur.directors || null),
                    performers: performerIds.length ? joinList(performerIds) : (cur.performers || null),
                    genres: joinList(genres),
                });
            });
        })();
        res.json({ success: true, count });
    } catch (e) { console.error('[ext bulk meta]', e); res.status(500).json({ error: e.message }); }
};

// POST /ext/api/bulk/bookmark  { ids, folderId }
exports.bookmark = (req, res) => {
    try {
        const { ids, folderId } = req.body || {};
        if (!folderId) return res.status(400).json({ error: 'folderId が必要です' });
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids が必要です' });
        const ins = db.prepare('INSERT OR IGNORE INTO ext_bookmarks (folder_id, hash) VALUES (?, ?)');
        let count = 0;
        db.transaction(() => { count = eachHash(ids, (hash) => { ins.run(folderId, hash); }); })();
        res.json({ success: true, count });
    } catch (e) { console.error('[ext bulk bookmark]', e); res.status(500).json({ error: e.message }); }
};

// POST /ext/api/bulk/delete  { ids }
//  元ファイル + 関連(スクリーンショット/カバー/メタ/ブックマーク)を削除
exports.delete = (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids が必要です' });

        const coverFolder = getSetting('ext_cover_folder', '');
        const getFile = db.prepare('SELECT id, path, hash, filename FROM files WHERE id = ?');
        const delFile = db.prepare('DELETE FROM files WHERE id = ?');
        const countHash = db.prepare('SELECT COUNT(*) AS c FROM files WHERE hash = ?');
        const delScr = db.prepare('DELETE FROM screenshots WHERE hash = ?');
        const delMeta = db.prepare('DELETE FROM metadata WHERE hash = ?');
        const delExtMeta = db.prepare('DELETE FROM ext_video_meta WHERE hash = ?');
        const delExtCover = db.prepare('DELETE FROM ext_video_cover WHERE hash = ?');
        const delBm = db.prepare('DELETE FROM ext_bookmarks WHERE hash = ?');
        const delExtRelated = db.prepare('DELETE FROM ext_related WHERE src_hash = ? OR rel_hash = ?');

        function deleteFolderCover(filename, filePath) {
            if (!coverFolder) return;
            const base = path.parse(filename || path.basename(filePath || '')).name;
            if (!base) return;
            IMG_EXTS.forEach(ext => { const p = path.join(coverFolder, base + ext); try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { } });
        }

        let deleted = 0, fileErrors = 0;
        (ids || []).forEach(id => {
            const f = getFile.get(id);
            if (!f) return;
            // 1) 物理ファイル削除 (best-effort)
            try { if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) { fileErrors++; }
            // 2) このファイル名のカバー画像(フォルダ側)も削除
            deleteFolderCover(f.filename, f.path);
            // 3) DB 整理 (この hash を参照するファイルが無くなったら関連も削除)
            db.transaction(() => {
                delFile.run(id);
                const remaining = countHash.get(f.hash).c;
                if (remaining === 0) {
                    delScr.run(f.hash);
                    delMeta.run(f.hash);
                    delExtMeta.run(f.hash);
                    delExtCover.run(f.hash);
                    delBm.run(f.hash);
                    delExtRelated.run(f.hash, f.hash);
                }
            })();
            deleted++;
        });
        res.json({ success: true, deleted, fileErrors });
    } catch (e) { console.error('[ext bulk delete]', e); res.status(500).json({ error: e.message }); }
};
