// =============================================================
// 拡張全文検索
// 元の videoService.getVideos と同じ検索仕様を保ちつつ、
// 照合対象に ext_video_meta.display_name (表示動画名) を追加します。
// 通常のキーワード検索はクライアントの fetch フックからここへ振り向けられます。
// (元ファイルは一切変更しません)
// =============================================================
const { db } = require('../db');

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
    let sqlCondition = "";

    if (q) {
        let enableNormalization = false;
        let queryText = q.trim();
        if (queryText.startsWith('~')) {
            enableNormalization = true;
            queryText = queryText.substring(1).trim();
        }

        const quoteCount = (queryText.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
            return res.status(400).json({ error: '引用符のペアが不完全です' });
        }

        const rawTerms = queryText.match(/[!><-]*"[^"]*"|[!><-]*\S+/g) || [];

        if (rawTerms.length > 0) {
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
                            throw new Error(`不正な形式です: ${term}`);
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

            try {
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

                if (sqlCondition) {
                    baseQuery += " WHERE " + sqlCondition;
                }
            } catch (err) {
                return res.status(400).json({ error: err.message });
            }
        }
    }

    let orderBy;
    let dataParams = [...params];
    if (sort === 'random') {
        const seedVal = parseInt(seed, 10);
        if (!isNaN(seedVal)) {
            orderBy = `seeded_random(?, f.id)`;
            dataParams.push(seedVal);
        } else {
            orderBy = 'RANDOM()';
        }
    } else {
        const sortMap = {
            'updated_desc': 'f.updated_at DESC',
            'updated_asc': 'f.updated_at ASC',
            'name_asc': 'ext_namekey(f.filename) ASC',
            'duration_desc': 'm.duration DESC',
            'created_desc': 'm.created_at DESC',
            'history_desc': 'm.last_played_at DESC',
            'play_count_desc': 'm.play_count DESC',
            'ext_rating_desc': 'IFNULL(e.rating,0) DESC, f.updated_at DESC',
            'ext_rating_asc': 'IFNULL(e.rating,0) ASC, f.updated_at DESC',
            'ext_screenshots_desc': '(SELECT COUNT(*) FROM screenshots s WHERE s.hash = f.hash) DESC, f.updated_at DESC',
            'ext_screenshots_asc': '(SELECT COUNT(*) FROM screenshots s WHERE s.hash = f.hash) ASC, f.updated_at DESC',
            'ext_displayname_asc': "ext_namekey(COALESCE(NULLIF(e.display_name,''), f.filename)) ASC",
            'ext_displayname_desc': "ext_namekey(COALESCE(NULLIF(e.display_name,''), f.filename)) DESC",
        };
        orderBy = sortMap[sort] || 'f.updated_at DESC';
    }

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
