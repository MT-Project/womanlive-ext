// =============================================================
// メタデータの一括置換
//  本家の「タグ置換」(routes.js renameTag) を置き換える形で、タグ以外の
//  拡張メタデータ(ジャンル/出演者/シリーズ名/メーカー/レーベル)も置換できるようにする。
//  ・タグは本家と同じ保存形式(前後を改行で囲む)を扱い、プリセットも合わせて更新する
//  ・完全一致のみ置換する(部分一致では置換しない)
// =============================================================
const { db, splitList, joinList, getSetting, setSetting } = require('../db');

const PRESET_TAGS_KEY = 'preset_tags';
const TAG_LAYOUT_KEY = 'ext_video_tag_layout';

// 置換できる種類。label は設定画面の選択肢にそのまま出す。
const KINDS = [
    { key: 'tag', label: 'タグ' },
    { key: 'genre', label: 'ジャンル' },
    { key: 'performer', label: '出演者' },
    { key: 'series', label: 'シリーズ名' },
    { key: 'maker', label: 'メーカー' },
    { key: 'label', label: 'レーベル' },
];
const COLUMN_KINDS = { series: 'series', maker: 'maker', label: 'label' };

exports.kinds = (req, res) => res.json(KINDS);

// settings に入っている文字列配列(JSON)の要素を置換する。
// タグレイアウトの見出し行(# 始まり)は対象外。
function replaceInStringArraySetting(key, before, after, skipHeadings) {
    const arr = getSetting(key, null);
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    const next = arr.map(v => {
        const s = String(v == null ? '' : v);
        if (skipHeadings && /^[#＃]/.test(s.trim())) return v;
        if (s !== before) return v;
        n++;
        return after;
    });
    if (n) setSetting(key, next);
    return n;
}

function replaceTag(before, after) {
    // 本家 renameTag と同じ更新 (metadata.tags は前後を改行で囲んだ形式)
    const info = db.prepare(`
        UPDATE metadata
        SET tags = REPLACE(tags, '\n' || ? || '\n', '\n' || ? || '\n')
        WHERE tags LIKE '%\n' || ? || '\n%'
    `).run(before, after, before);

    // 本家のプリセットと、拡張のグループレイアウトも追従させる
    replaceInStringArraySetting(PRESET_TAGS_KEY, before, after, false);
    replaceInStringArraySetting(TAG_LAYOUT_KEY, before, after, true);
    return info.changes;
}

// 改行区切りのリスト列(ジャンル)を、要素の完全一致で置換する。
function replaceListColumn(column, before, after) {
    const rows = db.prepare(`SELECT hash, ${column} AS val FROM ext_video_meta WHERE ${column} IS NOT NULL`).all();
    const upd = db.prepare(`UPDATE ext_video_meta SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE hash = ?`);
    let n = 0;
    rows.forEach(r => {
        const list = splitList(r.val);
        if (!list.includes(before)) return;
        // 置換先が既にある場合は重複させない
        const next = [...new Set(list.map(v => (v === before ? after : v)))];
        upd.run(joinList(next), r.hash);
        n++;
    });
    return n;
}

function replacePerformer(before, after) {
    const src = db.prepare('SELECT id FROM ext_performers WHERE name = ?').get(before);
    if (!src) return 0;
    const dup = db.prepare('SELECT id FROM ext_performers WHERE name = ? AND id != ?').get(after, src.id);
    if (dup) {
        // 出演者は名前が一意。統合は動画ごとの紐づけ付け替えが必要になるため、ここでは行わない。
        // 入力の問題なので 400 で返す (バグではないのでスタックトレースは出さない)。
        const err = new Error('「' + after + '」は既に登録されています。出演者の統合は出演者ページで行ってください。');
        err.badRequest = true;
        throw err;
    }
    return db.prepare('UPDATE ext_performers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(after, src.id).changes;
}

// POST /ext/api/metadata/replace  { kind, before, after }
exports.replace = (req, res) => {
    try {
        const b = req.body || {};
        const kind = String(b.kind || '').trim();
        const before = String(b.before == null ? '' : b.before).trim();
        const after = String(b.after == null ? '' : b.after).trim();

        if (!KINDS.some(k => k.key === kind)) return res.status(400).json({ error: '置換するメタデータ種が不正です' });
        if (!before || !after) return res.status(400).json({ error: '置換対象と置換後の両方を入力してください' });
        if (before === after) return res.status(400).json({ error: '置換対象と置換後が同じです' });

        const changed = db.transaction(() => {
            if (kind === 'tag') return replaceTag(before, after);
            if (kind === 'genre') return replaceListColumn('genres', before, after);
            if (kind === 'performer') return replacePerformer(before, after);
            const col = COLUMN_KINDS[kind];
            return db.prepare(`UPDATE ext_video_meta SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE ${col} = ?`)
                .run(after, before).changes;
        })();

        res.json({ success: true, kind, changed });
    } catch (e) {
        if (e.badRequest) return res.status(400).json({ error: e.message });
        console.error('[ext metadata replace]', e);
        res.status(500).json({ error: e.message });
    }
};
