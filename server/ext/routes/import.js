// =============================================================
// MovieBrowser 形式 JSON からのメタデータ一括取込
// クライアントが JSON を読み込み、entries 配列として POST します。
//  - "fileName"(拡張子なし) と DB の動画ファイル名(拡張子除去)を突合
//  - 値がある項目のみ設定 / rate は切り上げ・0 はスキップ
//  - tag は既存タグ(metadata.tags)へ統合、その他は ext_video_meta へ
// =============================================================
const fs = require('fs');
const { db, splitList, joinList } = require('../db');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { /* 画像変換なしでも動作 */ }

function ceilRate(v) {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return 0;
    return Math.min(5, Math.ceil(n));
}
// 半角/全角スペース・カンマ・読点で分割 (人名内の「・」は保持)
function splitMulti(s) {
    return s ? String(s).split(/[\s,、]+/).map(x => x.trim()).filter(Boolean) : [];
}
function normDate(s) {
    if (!s) return '';
    const m = String(s).trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
}
function clean(s) { return (s == null ? '' : String(s)).trim(); }
// 別名: 半角/全角イコールで分割
function splitAliases(s) {
    return s ? String(s).split(/[=＝]/).map(x => x.trim()).filter(Boolean) : [];
}

exports.importMb = (req, res) => {
    try {
        const { entries, overwrite = false, dryRun = false } = req.body || {};
        if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries(配列)が必要です' });

        // fileName(小文字) -> entry
        const map = new Map();
        for (const e of entries) {
            if (e && e.fileName) map.set(String(e.fileName).toLowerCase(), e);
        }

        const files = db.prepare('SELECT id, filename, hash FROM files').all();

        const getPerf = db.prepare('SELECT id FROM ext_performers WHERE name = ?');
        const insPerf = db.prepare('INSERT OR IGNORE INTO ext_performers (name) VALUES (?)');
        const perfCache = new Map();
        let performersCreated = 0;
        function performerId(name) {
            if (perfCache.has(name)) return perfCache.get(name);
            let row = getPerf.get(name);
            if (!row) {
                if (dryRun) { performersCreated++; perfCache.set(name, -1); return -1; }
                insPerf.run(name); performersCreated++; row = getPerf.get(name);
            }
            perfCache.set(name, row.id); return row.id;
        }

        const getMeta = db.prepare('SELECT * FROM ext_video_meta WHERE hash = ?');
        const getTags = db.prepare('SELECT tags FROM metadata WHERE hash = ?');
        const setTags = db.prepare('UPDATE metadata SET tags = ? WHERE hash = ?');
        const upsert = db.prepare(`
            INSERT INTO ext_video_meta
                (hash, rating, display_name, model_no, release_date, series, maker, label, directors, genres, performers, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(hash) DO UPDATE SET
                rating=excluded.rating, display_name=excluded.display_name, model_no=excluded.model_no,
                release_date=excluded.release_date, series=excluded.series, maker=excluded.maker,
                label=excluded.label, directors=excluded.directors, genres=excluded.genres,
                performers=excluded.performers, updated_at=CURRENT_TIMESTAMP
        `);

        const stats = { total: files.length, jsonCount: entries.length, matched: 0, updated: 0, tagUpdated: 0, skippedNoInfo: 0, unmatched: 0, performersCreated: 0 };

        const apply = () => {
            for (const f of files) {
                const base = f.filename.replace(/\.[^.]+$/, '').toLowerCase();
                const e = map.get(base);
                if (!e) { stats.unmatched++; continue; }
                stats.matched++;

                const vals = {
                    rating: ceilRate(e.rate),
                    display_name: clean(e.title),
                    model_no: clean(e.pn),
                    release_date: normDate(e.createDate),
                    series: clean(e.series),
                    maker: clean(e.mfr),
                    label: clean(e.label),
                    directors: splitMulti(e.director),
                    genres: splitMulti(e.genre),
                    performers: splitMulti(e.artist),
                    tags: splitMulti(e.tag),
                };

                const hasAny = vals.rating > 0 || vals.display_name || vals.model_no || vals.release_date ||
                    vals.series || vals.maker || vals.label || vals.directors.length ||
                    vals.genres.length || vals.performers.length || vals.tags.length;
                if (!hasAny) { stats.skippedNoInfo++; continue; }

                const hash = f.hash;
                const cur = getMeta.get(hash) || {};

                // --- タグ統合 (metadata.tags) ---
                if (vals.tags.length) {
                    const tagRow = getTags.get(hash);
                    const existing = tagRow && tagRow.tags ? tagRow.tags.split('\n').map(t => t.trim()).filter(Boolean) : [];
                    const merged = existing.slice();
                    vals.tags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
                    if (merged.length !== existing.length) {
                        if (!dryRun) setTags.run(merged.length ? '\n' + merged.join('\n') + '\n' : null, hash);
                        stats.tagUpdated++;
                    }
                }

                // --- ext_video_meta ---
                const out = {
                    rating: cur.rating || 0,
                    display_name: cur.display_name || '',
                    model_no: cur.model_no || '',
                    release_date: cur.release_date || '',
                    series: cur.series || '',
                    maker: cur.maker || '',
                    label: cur.label || '',
                    directors: splitList(cur.directors),
                    genres: splitList(cur.genres),
                    performers: splitList(cur.performers),
                };

                const scalar = (key, nv) => {
                    if (overwrite) { if (nv) out[key] = nv; }
                    else { if (!clean(out[key]) && nv) out[key] = nv; }
                };
                const arr = (key, na) => {
                    if (overwrite) { out[key] = na.length ? na.slice() : out[key]; }
                    else { na.forEach(x => { if (!out[key].includes(x)) out[key].push(x); }); }
                };

                if (overwrite) { if (vals.rating > 0) out.rating = vals.rating; }
                else { if (!(out.rating > 0) && vals.rating > 0) out.rating = vals.rating; }
                scalar('display_name', vals.display_name);
                scalar('model_no', vals.model_no);
                scalar('release_date', vals.release_date);
                scalar('series', vals.series);
                scalar('maker', vals.maker);
                scalar('label', vals.label);
                arr('directors', vals.directors);
                arr('genres', vals.genres);

                // performers (id 化)
                const perfIds = vals.performers.map(n => performerId(n)).filter(id => id !== -1 || dryRun).map(String);
                if (overwrite) { if (perfIds.length) out.performers = perfIds.slice(); }
                else { perfIds.forEach(id => { if (!out.performers.includes(id)) out.performers.push(id); }); }

                if (!dryRun) {
                    upsert.run(
                        hash, out.rating || 0,
                        out.display_name || null, out.model_no || null, out.release_date || null,
                        out.series || null, out.maker || null, out.label || null,
                        joinList(out.directors), joinList(out.genres), joinList(out.performers)
                    );
                }
                stats.updated++;
            }
        };

        if (dryRun) apply();
        else db.transaction(apply)();

        stats.performersCreated = performersCreated;
        res.json({ success: true, dryRun, overwrite, ...stats });
    } catch (err) {
        console.error('[ext import]', err);
        res.status(500).json({ error: err.message });
    }
};


// =============================================================
// 出演者情報 JSON の取込
//  - "name" が一致する既存の出演者(ext_performers)に情報を設定
//  - 値がある項目のみ / rate は切り上げ・0 はスキップ
//  - anotherName は「＝」で別名分割(本人名は除外) / tag はスペース分割
//  - thum(noimage 以外)は実ファイルを読み込み正方形 webp で画像登録
// =============================================================
exports.importPerformers = async (req, res) => {
    try {
        const { entries, overwrite = false, dryRun = false } = req.body || {};
        if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries(配列)が必要です' });

        const getByName = db.prepare("SELECT *, (image IS NOT NULL) AS has_image FROM ext_performers WHERE name = ?");
        const upd = db.prepare(`
            UPDATE ext_performers SET
                furigana=?, birthday=?, height=?, weight=?, bust=?, cup=?, waist=?, hip=?,
                blood_type=?, aliases=?, rating=?, tags=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        `);

        const stats = { jsonCount: entries.length, matched: 0, updated: 0, unmatched: 0, skippedNoInfo: 0, imageSet: 0, imageMissing: 0 };
        const imageJobs = []; // {id, path}

        const applyOne = (e) => {
            const name = clean(e && e.name);
            if (!name) return;
            const cur = getByName.get(name);
            if (!cur) { stats.unmatched++; return; }
            stats.matched++;

            const vals = {
                furigana: clean(e.yomi),
                birthday: normDate(e.barth),
                height: clean(e.T),
                weight: clean(e.Wt),
                bust: clean(e.B),
                cup: clean(e.Cup),
                waist: clean(e.W),
                hip: clean(e.H),
                blood_type: clean(e.Blood),
                rating: ceilRate(e.rate),
                aliases: splitAliases(e.anotherName).filter(a => a.toLowerCase() !== name.toLowerCase()),
                tags: splitMulti(e.tag),
            };
            const thum = clean(e.thum);
            const hasRealImage = !!thum && !/noimage/i.test(thum);

            const hasAny = vals.furigana || vals.birthday || vals.height || vals.weight || vals.bust ||
                vals.cup || vals.waist || vals.hip || vals.blood_type || vals.rating > 0 ||
                vals.aliases.length || vals.tags.length || hasRealImage;
            if (!hasAny) { stats.skippedNoInfo++; return; }

            const out = {
                furigana: cur.furigana || '', birthday: cur.birthday || '', height: cur.height || '',
                weight: cur.weight || '', bust: cur.bust || '', cup: cur.cup || '', waist: cur.waist || '',
                hip: cur.hip || '', blood_type: cur.blood_type || '', rating: cur.rating || 0,
                aliases: splitList(cur.aliases), tags: splitList(cur.tags),
            };
            const scalar = (k, nv) => { if (overwrite) { if (nv) out[k] = nv; } else { if (!clean(out[k]) && nv) out[k] = nv; } };
            const arr = (k, na) => { if (overwrite) { out[k] = na.length ? na.slice() : out[k]; } else { na.forEach(x => { if (!out[k].includes(x)) out[k].push(x); }); } };

            scalar('furigana', vals.furigana); scalar('birthday', vals.birthday); scalar('height', vals.height);
            scalar('weight', vals.weight); scalar('bust', vals.bust); scalar('cup', vals.cup);
            scalar('waist', vals.waist); scalar('hip', vals.hip); scalar('blood_type', vals.blood_type);
            if (overwrite) { if (vals.rating > 0) out.rating = vals.rating; }
            else { if (!(out.rating > 0) && vals.rating > 0) out.rating = vals.rating; }
            arr('aliases', vals.aliases); arr('tags', vals.tags);

            if (!dryRun) {
                upd.run(out.furigana || null, out.birthday || null, out.height || null, out.weight || null,
                    out.bust || null, out.cup || null, out.waist || null, out.hip || null,
                    out.blood_type || null, joinList(out.aliases), out.rating || 0, joinList(out.tags), cur.id);
            }
            stats.updated++;

            if (hasRealImage && (overwrite || !cur.has_image)) {
                imageJobs.push({ id: cur.id, path: thum });
            }
        };

        if (dryRun) {
            for (const e of entries) applyOne(e);
            for (const job of imageJobs) { if (fs.existsSync(job.path)) stats.imageSet++; else stats.imageMissing++; }
            return res.json({ success: true, dryRun, overwrite, ...stats });
        }

        db.transaction(() => { for (const e of entries) applyOne(e); })();

        // 画像はトランザクション外で処理 (ファイル読込 + 変換)
        const setImg = db.prepare('UPDATE ext_performers SET image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        for (const job of imageJobs) {
            try {
                if (!fs.existsSync(job.path)) { stats.imageMissing++; continue; }
                let buf = fs.readFileSync(job.path);
                if (sharp) {
                    try { buf = await sharp(buf).resize(600, 600, { fit: 'cover' }).webp({ quality: 85 }).toBuffer(); }
                    catch (err) { /* 変換失敗時は元データ保存 */ }
                }
                setImg.run(buf, job.id);
                stats.imageSet++;
            } catch (err) { stats.imageMissing++; }
        }

        // タグ自動付与ルールを適用 (付与のみ)
        try {
            const rr = require('./tagrules').applyRules(false);
            stats.ruleTagsAdded = rr.tagsAdded;
        } catch (e) { stats.ruleTagsAdded = 0; }

        res.json({ success: true, dryRun: false, overwrite, ...stats });
    } catch (err) {
        console.error('[ext import performers]', err);
        res.status(500).json({ error: err.message });
    }
};
