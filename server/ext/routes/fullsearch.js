// =============================================================
// 拡張全文検索
// 元の videoService.getVideos と同じ検索仕様を保ちつつ、
// 照合対象に ext_video_meta.display_name (表示動画名) を追加します。
// 通常のキーワード検索はクライアントの fetch フックからここへ振り向けられます。
// (元ファイルは一切変更しません)
//
// 条件の組み立ては keywordWhere() に切り出してあり、項目検索(search.js)からも
// 使います。キーワードと項目トークンを混ぜた検索ができるのはこのためです。
// =============================================================
const path = require('path');
const { db, SORT_MAP } = require('../db');

// フォルダ絞り込み (本家 ver.260914 の buildSearchQuery と同じ条件)。
// path=root は「すべて」の意味なので条件を付けない。
function pathWhere(filterPath) {
    const p = String(filterPath == null ? '' : filterPath).trim();
    if (!p || p === 'root') return { sql: '', params: [] };
    const prefix = p.endsWith(path.sep) ? p : p + path.sep;
    return { sql: 'f.path LIKE ?', params: [prefix + '%'] };
}
exports.pathWhere = pathWhere;

// 再生履歴ソートのときは未再生を除く (本家と同じ。付けないと拡張経由だけ未再生が混ざる)
function sortWhere(sort) {
    return sort === 'history_desc' ? 'm.last_played_at IS NOT NULL' : '';
}
exports.sortWhere = sortWhere;

// キーワード検索の WHERE を組み立てる → { sql, params } (sql は '' のことがある)
// 書式が不正なときは badRequest 付きの例外を投げる (呼び出し側で 400 にする)。
function keywordWhere(q) {
    const params = [];
    let sqlCondition = "";
    if (!q) return { sql: sqlCondition, params };

    let enableNormalization = false;
    let queryText = String(q).trim();
    if (queryText.startsWith('~')) {
        enableNormalization = true;
        queryText = queryText.substring(1).trim();
    }

    const quoteCount = (queryText.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        const err = new Error('引用符のペアが不完全です');
        err.badRequest = true;
        throw err;
    }

    const rawTerms = queryText.match(/[!><-]*"[^"]*"|[!><-]*\S+/g) || [];
    if (rawTerms.length === 0) return { sql: sqlCondition, params };

    const parseDate = (dateStr) => {
        const parts = dateStr.split(/[/\-.]/);
        if (parts.length !== 3) return null;
        let [y, m, d] = parts;
        if (y.length === 2) y = "20" + y;
        const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        if (isNaN(date.getTime())) return null;
        const pad = (n) => n.toString().padStart(2, '0');
        return `${y}-${pad(m)}-${pad(d)}`;
    };

    const getTermCondition = (term) => {
        let isNot = false;
        let isTagOnly = false;
        let cleanTerm = term;

        if (cleanTerm.startsWith('-') && cleanTerm.length > 1) {
            isNot = true;
            cleanTerm = cleanTerm.substring(1);
        } else if (cleanTerm.startsWith('!') && cleanTerm.length > 1) {
            isTagOnly = true;
            cleanTerm = cleanTerm.substring(1);
        }

        if (cleanTerm.startsWith('"') && cleanTerm.endsWith('"')) {
            cleanTerm = cleanTerm.substring(1, cleanTerm.length - 1);
        }

        if ((cleanTerm.startsWith('>') || cleanTerm.startsWith('<')) && cleanTerm.length > 1) {
            const op = cleanTerm[0];
            const val = cleanTerm.substring(1);
            const parsedDate = parseDate(val);

            if (parsedDate) {
                if (op === '>') {
                    params.push(`${parsedDate} 00:00:00`);
                    return `f.updated_at >= ?`;
                } else {
                    params.push(`${parsedDate} 23:59:59`);
                    return `f.updated_at <= ?`;
                }
            } else {
                const mins = parseFloat(val);
                if (!isNaN(mins)) {
                    params.push(mins * 60);
                    return `m.duration ${op} ?`;
                } else {
                    const err = new Error(`不正な形式です: ${term}`);
                    err.badRequest = true;
                    throw err;
                }
            }
        }

        const like = `%${cleanTerm}%`;
        const tagLike = `%\n${cleanTerm}\n%`;

        if (enableNormalization) {
            if (isTagOnly) {
                params.push(tagLike);
                return `normalize(IFNULL(m.tags, '')) ${isNot ? 'NOT LIKE' : 'LIKE'} normalize(?)`;
            } else {
                if (isNot) {
                    params.push(like, like, like, like);
                    return `(normalize(IFNULL(f.path, '')) NOT LIKE normalize(?) AND normalize(IFNULL(m.display_name, '')) NOT LIKE normalize(?) AND normalize(IFNULL(m.tags, '')) NOT LIKE normalize(?) AND normalize(IFNULL(e.display_name, '')) NOT LIKE normalize(?))`;
                } else {
                    params.push(like, like, like, like);
                    return `(normalize(IFNULL(f.path, '')) LIKE normalize(?) OR normalize(IFNULL(m.display_name, '')) LIKE normalize(?) OR normalize(IFNULL(m.tags, '')) LIKE normalize(?) OR normalize(IFNULL(e.display_name, '')) LIKE normalize(?))`;
                }
            }
        } else {
            if (isTagOnly) {
                params.push(tagLike);
                return `IFNULL(m.tags, '') ${isNot ? 'NOT LIKE' : 'LIKE'} ?`;
            } else {
                if (isNot) {
                    params.push(like, like, like, like);
                    return `(IFNULL(f.path, '') NOT LIKE ? AND IFNULL(m.display_name, '') NOT LIKE ? AND IFNULL(m.tags, '') NOT LIKE ? AND IFNULL(e.display_name, '') NOT LIKE ?)`;
                } else {
                    params.push(like, like, like, like);
                    return `(IFNULL(f.path, '') LIKE ? OR IFNULL(m.display_name, '') LIKE ? OR IFNULL(m.tags, '') LIKE ? OR IFNULL(e.display_name, '') LIKE ?)`;
                }
            }
        }
    };

    for (let i = 0; i < rawTerms.length; i++) {
        const term = rawTerms[i];
        if (term.toUpperCase() === 'OR') continue;

        const cond = getTermCondition(term);
        if (!cond) continue;

        if (sqlCondition === "") {
            sqlCondition = cond;
        } else {
            const isOr = i > 0 && rawTerms[i - 1].toUpperCase() === 'OR';
            sqlCondition = `(${sqlCondition} ${isOr ? 'OR' : 'AND'} ${cond})`;
        }
    }

    return { sql: sqlCondition, params };
}
exports.keywordWhere = keywordWhere;

// sort=random のときだけ ORDER BY にシード付き乱数を使う (項目検索 search.js と共用)
// 戻り: { orderBy, extraParams }  extraParams は本体クエリにだけ足す。
function orderByFor(sort, seed) {
    if (sort !== 'random') return { orderBy: SORT_MAP[sort] || SORT_MAP['updated_desc'], extraParams: [] };
    const seedVal = parseInt(seed, 10);
    if (isNaN(seedVal)) return { orderBy: 'RANDOM()', extraParams: [] };
    return { orderBy: 'seeded_random(?, f.id)', extraParams: [seedVal] };
}
exports.orderByFor = orderByFor;

exports.fullSearch = (req, res) => {
    const { q, page = 1, perPage = 20, sort = 'updated_desc', seed } = req.query;
    const limit = parseInt(perPage, 10);
    const offset = (parseInt(page, 10) - 1) * limit;

    // ext_video_meta を LEFT JOIN して表示名/評価も扱う
    let baseQuery = `
        FROM files f
        JOIN metadata m ON f.hash = m.hash
        LEFT JOIN ext_video_meta e ON e.hash = f.hash
    `;

    let params = [];

    try {
        const kw = keywordWhere(q);
        const pw = pathWhere(req.query.path);
        params = [...kw.params, ...pw.params];
        const conds = [kw.sql, pw.sql, sortWhere(sort)].filter(Boolean);
        if (conds.length) baseQuery += " WHERE " + conds.map(c => '(' + c + ')').join(' AND ');
    } catch (err) {
        return res.status(err.badRequest ? 400 : 500).json({ error: err.message });
    }

    const { orderBy, extraParams } = orderByFor(sort, seed);
    const dataParams = [...params, ...extraParams];

    try {
        const countSql = `SELECT count(*) as total ${baseQuery}`;
        const countRes = db.prepare(countSql).get(...params);
        const total = countRes ? countRes.total : 0;

        const dataQuery = `
            SELECT
                f.id, f.path, f.filename, f.size,
                m.hash, m.duration, (m.thumbnail IS NOT NULL) AS has_thumbnail, LENGTH(m.thumbnail) as thumbnail_size,
                m.tags, m.use_transcode, m.display_name, m.last_pos,
                e.display_name AS ext_display_name, e.rating AS ext_rating
            ${baseQuery}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;
        const videos = db.prepare(dataQuery).all(...dataParams, limit, offset);

        res.json({ videos, totalCount: total });
    } catch (err) {
        console.error("[ext fullsearch] エラー:", err);
        res.status(500).json({ error: "検索に失敗しました" });
    }
};
