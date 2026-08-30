// =============================================================
// 拡張検索 ルート
// クライアントの fetch フックが、@ で始まる検索語や rating ソート時に
// /api/videos の代わりにこのエンドポイントを呼びます。
// 戻り値の形は /api/videos と同じ { videos, totalCount } に揃えます。
// =============================================================
const { db, splitList, SORT_MAP } = require('../db');

const VIDEO_FIELDS = `
    f.id, f.path, f.filename, f.size,
    m.hash, m.duration,
    (m.thumbnail IS NOT NULL) AS has_thumbnail,
    LENGTH(m.thumbnail) AS thumbnail_size,
    m.tags, m.use_transcode, m.last_pos,
    e.display_name AS ext_display_name,
    e.rating AS ext_rating
`;

// "@maker:\"X\" rating:>=4 director:\"Y\"" のような文字列をトークンに分解
function tokenize(q) {
    if (!q) return [];
    let s = q.trim();
    if (s.startsWith('@')) s = s.slice(1);
    const tokens = [];
    // field:"quoted value"  または field:value
    const re = /(\w+)\s*:\s*("([^"]*)"|[^\s]+)/g;
    let match;
    while ((match = re.exec(s)) !== null) {
        const field = match[1].toLowerCase();
        let value = match[3] !== undefined ? match[3] : match[2];
        tokens.push({ field, value });
    }
    return tokens;
}

function buildConditions(tokens) {
    const where = [];
    const params = [];
    for (const { field, value } of tokens) {
        switch (field) {
            case 'maker': where.push('e.maker = ? COLLATE NOCASE'); params.push(value); break;
            case 'series': where.push('e.series = ? COLLATE NOCASE'); params.push(value); break;
            case 'label':
                // release:none と同じ書き方で「レーベルなし」を引けるようにする
                if (value === 'none') where.push("(e.label IS NULL OR e.label = '')");
                else { where.push('e.label = ? COLLATE NOCASE'); params.push(value); }
                break;
            case 'model': where.push('e.model_no = ? COLLATE NOCASE'); params.push(value); break;
            case 'director':
                where.push("('\n' || IFNULL(e.directors,'') || '\n') LIKE ? COLLATE NOCASE");
                params.push(`%\n${value}\n%`); break;
            case 'genre':
                where.push("('\n' || IFNULL(e.genres,'') || '\n') LIKE ? COLLATE NOCASE");
                params.push(`%\n${value}\n%`); break;
            case 'performer':
                where.push("('\n' || IFNULL(e.performers,'') || '\n') LIKE ?");
                params.push(`%\n${value}\n%`); break;
            case 'tag':
                where.push("IFNULL(m.tags,'') LIKE ?");
                params.push(`%\n${value}\n%`); break;
            case 'rating': {
                const mm = /^(>=|<=|>|<|=)?\s*(\d)/.exec(value);
                if (mm) {
                    const op = mm[1] || '=';
                    where.push(`IFNULL(e.rating,0) ${op} ?`);
                    params.push(parseInt(mm[2], 10));
                }
                break;
            }
            case 'releasemonth': // YYYY-MM
                where.push("substr(IFNULL(e.release_date,''),1,7) = ?");
                params.push(value);
                break;
            case 'releaseyear': // YYYY
                where.push("substr(IFNULL(e.release_date,''),1,4) = ?");
                params.push(value);
                break;
            case 'release':
                if (value === 'none') where.push("(e.release_date IS NULL OR e.release_date = '')");
                break;
            case 'bookmark': {
                // ブックマークフォルダ名で指定する(同名のフォルダがあれば両方が対象)。
                // 名前に一致しなければ旧形式のフォルダIDとしても解釈する(古いリンクを壊さないため)。
                const ids = db.prepare('SELECT id FROM ext_bookmark_folders WHERE name = ? COLLATE NOCASE').all(value).map(r => r.id);
                if (!ids.length) { const n = parseInt(value, 10); if (Number.isInteger(n)) ids.push(n); }
                if (!ids.length) { where.push('1 = 0'); break; }   // 該当なしは0件
                where.push(`f.hash IN (SELECT hash FROM ext_bookmarks WHERE folder_id IN (${ids.map(() => '?').join(',')}))`);
                ids.forEach(i => params.push(i));
                break;
            }
            // --- 除外 (含まない) 検索 ---
            case 'notmaker': where.push("IFNULL(e.maker,'') != ? COLLATE NOCASE"); params.push(value); break;
            case 'notseries': where.push("IFNULL(e.series,'') != ? COLLATE NOCASE"); params.push(value); break;
            case 'notlabel': where.push("IFNULL(e.label,'') != ? COLLATE NOCASE"); params.push(value); break;
            case 'notdirector':
                where.push("('\n' || IFNULL(e.directors,'') || '\n') NOT LIKE ? COLLATE NOCASE");
                params.push(`%\n${value}\n%`); break;
            case 'notgenre':
                where.push("('\n' || IFNULL(e.genres,'') || '\n') NOT LIKE ? COLLATE NOCASE");
                params.push(`%\n${value}\n%`); break;
            case 'notperformer':
                where.push("('\n' || IFNULL(e.performers,'') || '\n') NOT LIKE ?");
                params.push(`%\n${value}\n%`); break;
            default: break;
        }
    }
    return { where, params };
}

exports.search = (req, res) => {
    try {
        const { q = '', page = 1, perPage = 20, sort = 'updated_desc' } = req.query;
        const limit = Math.max(1, parseInt(perPage, 10) || 20);
        const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;

        const tokens = tokenize(q);
        const { where, params } = buildConditions(tokens);

        // ext テーブルが必須となる条件があるか (performer/rating など) で JOIN種別を決める
        const joinType = 'LEFT JOIN';
        let base = `
            FROM files f
            JOIN metadata m ON f.hash = m.hash
            ${joinType} ext_video_meta e ON e.hash = f.hash
        `;
        const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

        const orderBy = SORT_MAP[sort] || SORT_MAP['updated_desc'];

        const total = db.prepare(`SELECT COUNT(*) AS total ${base}${whereSql}`).get(...params).total;

        const videos = db.prepare(`
            SELECT ${VIDEO_FIELDS}
            ${base}${whereSql}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        res.json({ videos, totalCount: total });
    } catch (e) {
        console.error('[ext search]', e);
        res.status(500).json({ error: e.message });
    }
};

// シリーズ別に集計 (シリーズ一覧用)
//  name: シリーズ名 / count: 動画(ファイル)本数 / avgRating: 評価平均(0は除外) / thumbId: サムネ用動画id
exports.seriesList = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT e.series AS name,
                   COUNT(f.id) AS count,
                   AVG(CASE WHEN e.rating > 0 THEN e.rating END) AS avg_rating,
                   MAX(CASE WHEN m.thumbnail IS NOT NULL THEN f.id END) AS thumb_id
            FROM ext_video_meta e
            JOIN files f ON f.hash = e.hash
            JOIN metadata m ON m.hash = f.hash
            WHERE e.series IS NOT NULL AND e.series != ''
            GROUP BY e.series
        `).all();

        const series = rows.map(r => ({
            name: r.name,
            count: r.count,
            avgRating: r.avg_rating != null ? Math.round(r.avg_rating * 10) / 10 : null,
            thumbId: r.thumb_id || null
        }));
        res.json(series);
    } catch (e) {
        console.error('[ext series]', e);
        res.status(500).json({ error: e.message });
    }
};

// 公開日(release_date)で年月別に集計 (公開カレンダー用)
exports.releaseCalendar = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT substr(e.release_date, 1, 7) AS ym, COUNT(*) AS count
            FROM files f
            JOIN ext_video_meta e ON e.hash = f.hash
            WHERE e.release_date IS NOT NULL AND e.release_date != ''
            GROUP BY ym
            ORDER BY ym DESC
        `).all();

        const uncategorized = db.prepare(`
            SELECT COUNT(*) AS c
            FROM files f
            LEFT JOIN ext_video_meta e ON e.hash = f.hash
            WHERE e.release_date IS NULL OR e.release_date = ''
        `).get().c;

        const months = rows
            .filter(r => r.ym && /^\d{4}-\d{2}/.test(r.ym))
            .map(r => ({ year: r.ym.slice(0, 4), month: r.ym.slice(5, 7), count: r.count }));

        res.json({ months, uncategorized });
    } catch (e) {
        console.error('[ext release-calendar]', e);
        res.status(500).json({ error: e.message });
    }
};

// 検索結果の絞り込み候補 (サイドメニュー用)
//   GET /ext/api/search/facets?q=...
//   今の検索条件に合う動画すべてを対象に、ジャンル/タグ/メーカー/出演者/シリーズを数える。
//   件数の多い順に並べ、そのまま検索トークンに使える値(value)と表示名(label)を返す。
//   出演者だけは検索が id 指定なので value=id / label=氏名 と分かれる。
exports.facets = (req, res) => {
    try {
        const tokens = tokenize(req.query.q || '');
        const { where, params } = buildConditions(tokens);
        const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

        const rows = db.prepare(`
            SELECT m.tags AS tags, e.genres AS genres, e.maker AS maker, e.series AS series, e.performers AS performers
            FROM files f
            JOIN metadata m ON f.hash = m.hash
            LEFT JOIN ext_video_meta e ON e.hash = f.hash
            ${whereSql}
        `).all(...params);

        const counts = { genre: new Map(), tag: new Map(), maker: new Map(), performer: new Map(), series: new Map() };
        const bump = (kind, v) => { const s = String(v == null ? '' : v).trim(); if (s) counts[kind].set(s, (counts[kind].get(s) || 0) + 1); };
        rows.forEach(r => {
            splitList(r.genres).forEach(v => bump('genre', v));
            splitList(r.tags).forEach(v => bump('tag', v));
            splitList(r.performers).forEach(v => bump('performer', v));
            bump('maker', r.maker);
            bump('series', r.series);
        });

        // 出演者は id で数えているので氏名を引く
        const names = new Map();
        const pids = [...counts.performer.keys()].map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        if (pids.length) {
            db.prepare(`SELECT id, name FROM ext_performers WHERE id IN (${pids.map(() => '?').join(',')})`)
                .all(...pids).forEach(p => names.set(String(p.id), p.name));
        }

        const list = (kind) => [...counts[kind]]
            .map(([value, count]) => ({ value, count, label: kind === 'performer' ? (names.get(value) || '') : value }))
            .filter(x => x.label)      // 出演者マスタから消えた id は出さない
            .sort((a, b) => (b.count - a.count) || String(a.label).localeCompare(String(b.label), 'ja'));

        res.json({
            total: rows.length,
            genre: list('genre'),
            tag: list('tag'),
            maker: list('maker'),
            performer: list('performer'),
            series: list('series'),
        });
    } catch (e) {
        console.error('[ext search facets]', e);
        res.status(500).json({ error: e.message });
    }
};
