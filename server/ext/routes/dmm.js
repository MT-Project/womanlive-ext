// =============================================================
// DMM.com (FANZA) 商品検索 API 連携
//  ・動画の品番(model_no)で商品を検索し、メタデータへ反映する
//  ・キーワード検索(仕様どおり)を先に行い、0件なら cid 厳密一致でフォールバック
// =============================================================
const { db, getSetting, splitList, joinList, hashOfVideo } = require('../db');
const cover = require('./cover');

// 品番 -> content_id 形式 (英字小文字 + 数字5桁ゼロ埋め)  例: AARM-004 -> aarm00004
function toCid(pn) {
    const m = String(pn || '').trim().match(/^([A-Za-z]+)[-_ ]?0*(\d+)/);
    if (!m) return null;
    return m[1].toLowerCase() + String(m[2]).padStart(5, '0');
}

function normDate(s) {
    if (!s) return '';
    const m = String(s).trim().match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
}

function names(arr) { return (arr || []).map(x => x && x.name).filter(Boolean); }
function firstName(arr) { const n = names(arr); return n.length ? n[0] : ''; }

// 通販(mono)の item は imageURL.large を返さず list/small (数KBのサムネ) しか無い。
// 同じ場所に大判の *pl.jpg があるので、末尾を差し替えた URL を候補に加える。
function largeImageUrl(url) {
    return /(ps|pt)\.jpg$/i.test(url) ? url.replace(/(ps|pt)\.jpg$/i, 'pl.jpg') : '';
}

// DMM は存在しない画像にも 200 で数KBの代替画像を返すため、URL の有無では判定できない。
// HEAD で実際のバイト数を比べ、一番大きいものをカバーに使う(代替画像は必ず小さい)。
async function pickLargestImage(urls) {
    const cands = urls.filter((u, i, a) => u && a.indexOf(u) === i);
    let best = cands[0] || '', bestLen = -1;
    for (const u of cands) {
        let len = 0;
        try {
            const r = await fetch(u, { method: 'HEAD' });
            if (r.ok) len = Number(r.headers.get('content-length') || 0);
        } catch (e) { /* 測れなければ 0 扱いで次の候補へ */ }
        if (len > bestLen) { best = u; bestLen = len; }
    }
    return best;
}

function mapItem(it) {
    const ii = it.iteminfo || {};
    const img = (it.imageURL && (it.imageURL.large || it.imageURL.list || it.imageURL.small)) || '';
    return {
        content_id: it.content_id || '',
        title: it.title || '',
        date: normDate(it.date),
        genres: names(ii.genre),
        series: firstName(ii.series),
        maker: firstName(ii.maker),
        label: firstName(ii.label),
        actresses: names(ii.actress),
        directors: names(ii.director),
        imageLarge: largeImageUrl(img) || img,
        imageAlt: img          // 大判が無かったとき用のフォールバック
    };
}

// 検索する売り場。ItemList API は service/floor ごとに引くので、動画(digital/videoa)に
// 無い作品(DVD のみの作品など)を拾えるよう、通販(mono/dvd)も順に試す。
// 例: ODVHJ-067 は digital/videoa では 0 件、mono/dvd の keyword 検索で 1 件ヒットする。
const FLOORS = [
    { service: 'digital', floor: 'videoa' },
    { service: 'mono', floor: 'dvd' }
];

async function callDmm(apiId, affId, fl, extraParam) {
    const url = `https://api.dmm.com/affiliate/v3/ItemList?api_id=${encodeURIComponent(apiId)}&affiliate_id=${encodeURIComponent(affId)}&site=FANZA&service=${fl.service}&floor=${fl.floor}&hits=20&sort=date&${extraParam}&output=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('DMM API エラー (' + r.status + ')');
    const data = await r.json();
    return data.result || {};
}

// GET /ext/api/dmm/search?id=<videoId>
exports.search = async (req, res) => {
    try {
        const apiId = getSetting('ext_dmm_api_id', '');
        const affId = getSetting('ext_dmm_affiliate_id', '');
        if (!apiId || !affId) {
            return res.status(400).json({ error: 'DMM API ID / アフィリエイトID が未設定です。設定画面で登録してください。' });
        }

        const idForMeta = req.query.id || req.params.id;
        const fileRow = db.prepare('SELECT hash FROM files WHERE id = ?').get(idForMeta);
        if (!fileRow) return res.status(404).json({ error: '動画が見つかりません' });

        const meta = db.prepare('SELECT model_no FROM ext_video_meta WHERE hash = ?').get(fileRow.hash);
        const pn = meta && meta.model_no ? meta.model_no.trim() : '';
        if (!pn) return res.status(400).json({ error: '品番が設定されていません。先に品番を登録してください。' });

        // 売り場ごとに 1)キーワード検索(仕様どおり品番をキーワードに) →
        // 2) 0件なら cid 厳密一致 の順で試し、最初に見つかったものを使う。
        const cid = toCid(pn);
        let result = {}, method = '';
        for (const fl of FLOORS) {
            const byKeyword = await callDmm(apiId, affId, fl, 'keyword=' + encodeURIComponent(pn));
            if (byKeyword.items && byKeyword.items.length > 0) {
                result = byKeyword; method = fl.floor + '/keyword'; break;
            }
            if (cid) {
                const byCid = await callDmm(apiId, affId, fl, 'cid=' + encodeURIComponent(cid));
                if (byCid.items && byCid.items.length > 0) {
                    result = byCid; method = fl.floor + '/cid'; break;
                }
            }
        }

        const items = (result.items || []).map(mapItem);
        res.json({
            status: result.status,
            total_count: Number(result.total_count || items.length),
            method,
            keyword: pn,
            items
        });
    } catch (e) {
        console.error('[ext dmm search]', e);
        res.status(502).json({ error: 'DMM 検索に失敗しました: ' + e.message });
    }
};

// POST /ext/api/dmm/apply  { id, item }
// item = mapItem() の戻り(クライアントが選んだもの)
exports.apply = async (req, res) => {
    try {
        const { id, item } = req.body || {};
        if (!item) return res.status(400).json({ error: 'item がありません' });

        const fileRow = db.prepare('SELECT hash, filename, path FROM files WHERE id = ?').get(id);
        if (!fileRow) return res.status(404).json({ error: '動画が見つかりません' });
        const hash = fileRow.hash;

        // 出演者名 -> id (作成 or 取得)
        const getPerf = db.prepare('SELECT id FROM ext_performers WHERE name = ?');
        const insPerf = db.prepare('INSERT OR IGNORE INTO ext_performers (name) VALUES (?)');
        const performerIds = [];
        (item.actresses || []).forEach(name => {
            const n = String(name).trim(); if (!n) return;
            let row = getPerf.get(n);
            if (!row) { insPerf.run(n); row = getPerf.get(n); }
            if (row) performerIds.push(String(row.id));
        });

        // 既存メタ (品番・評価は維持。DMM項目は上書き)
        const cur = db.prepare('SELECT * FROM ext_video_meta WHERE hash = ?').get(hash) || {};

        // ジャンルだけは上書きせず、既存 + DMM の和集合にする (手で足したジャンルを消さない)
        const genres = splitList(cur.genres);
        (item.genres || []).forEach(g => {
            const gg = String(g).trim();
            if (gg && !genres.includes(gg)) genres.push(gg);
        });
        db.prepare(`
            INSERT INTO ext_video_meta
                (hash, rating, display_name, model_no, release_date, series, maker, label, directors, genres, performers, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(hash) DO UPDATE SET
                display_name=excluded.display_name, release_date=excluded.release_date,
                series=excluded.series, maker=excluded.maker, label=excluded.label,
                directors=excluded.directors, genres=excluded.genres, performers=excluded.performers,
                updated_at=CURRENT_TIMESTAMP
        `).run(
            hash,
            cur.rating || 0,
            (item.title || '').trim() || null,
            cur.model_no || null,
            (item.date || '').trim() || null,
            (item.series || '').trim() || null,
            (item.maker || '').trim() || null,
            (item.label || '').trim() || null,
            joinList(item.directors || []),
            joinList(genres),
            joinList(performerIds)
        );

        // カバー画像: 未設定かつ URL があれば取得して保存
        let coverSet = false;
        if (item.imageLarge && !cover.hasCover(fileRow)) {
            const url = await pickLargestImage([item.imageLarge, item.imageAlt]);
            try { await cover.storeCoverFromUrl(hash, url); coverSet = true; }
            catch (e) { console.warn('[ext dmm] カバー取得失敗:', e.message); }
        }

        res.json({ success: true, performers: performerIds.length, coverSet });
    } catch (e) {
        console.error('[ext dmm apply]', e);
        res.status(500).json({ error: e.message });
    }
};
