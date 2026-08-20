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

// DMM アフィリエイト API の共通呼び出し (ItemList / FloorList / MakerSearch)
const auth = (apiId, affId) => `api_id=${encodeURIComponent(apiId)}&affiliate_id=${encodeURIComponent(affId)}`;
async function dmmApi(path, params) {
    const r = await fetch(`https://api.dmm.com/affiliate/v3/${path}?${params}&output=json`);
    if (!r.ok) throw new Error('DMM API エラー (' + r.status + ')');
    const data = await r.json();
    return data.result || {};
}

function callDmm(apiId, affId, fl, extraParam) {
    return dmmApi('ItemList', `${auth(apiId, affId)}&site=FANZA&service=${fl.service}&floor=${fl.floor}&hits=20&sort=date&${extraParam}`);
}

// 品番から商品を探す。売り場ごとに次の順で試し、最初に見つかったものを返す。
//   1) 品番そのままをキーワード検索 (仕様どおりの引き方)
//   2) cid 厳密一致
//   3) cid 形の文字列をキーワード検索
// 3 は content_id に接頭辞が付く作品のための逃げ道。例: TOTTE-283 の content_id は
// "1totte00283" で、1(ハイフン付き品番は索引に無い)・2(接頭辞を知らない)のどちらでも 0件になるが、
// "totte00283" をキーワードにすると 1件で見つかる。
async function findItems(apiId, affId, pn) {
    const cid = toCid(pn);
    const attempts = [
        { label: 'keyword', param: 'keyword=' + encodeURIComponent(pn) },
        cid ? { label: 'cid', param: 'cid=' + encodeURIComponent(cid) } : null,
        cid ? { label: 'cid-keyword', param: 'keyword=' + encodeURIComponent(cid) } : null,
    ].filter(Boolean);

    for (const fl of FLOORS) {
        for (const a of attempts) {
            const r = await callDmm(apiId, affId, fl, a.param);
            if (r.items && r.items.length > 0) return { result: r, method: fl.floor + '/' + a.label };
        }
    }
    return { result: {}, method: '' };
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

        const { result, method } = await findItems(apiId, affId, pn);
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

        // DMM 側が空だった項目は既存の値を残す (一括編集 bulk.meta と同じ考え方)。
        // 確認画面は値のある項目しか出さないので、そこに出ていない項目を消さないためでもある。
        // 例: 出演者情報を持たない商品を反映すると、手で入れた出演者が消えてしまっていた。
        const sv = (v) => String(v == null ? '' : v).trim();

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
            sv(item.title) || cur.display_name || null,
            cur.model_no || null,
            sv(item.date) || cur.release_date || null,
            sv(item.series) || cur.series || null,
            sv(item.maker) || cur.maker || null,
            sv(item.label) || cur.label || null,
            (item.directors || []).length ? joinList(item.directors) : (cur.directors || null),
            joinList(genres),
            performerIds.length ? joinList(performerIds) : (cur.performers || null)
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

// =============================================================
// メーカー検索 (MakerSearch API) — メーカー一覧ページの「メーカー情報取得」
//  MakerSearch は floor_id が必須で、キーワード検索が無い(頭文字 initial での絞り込みのみ)。
//  そのため 動画(digital/videoa) のメーカーを全件取ってプロセス内にキャッシュし、
//  名前の完全一致/部分一致でこちらから絞り込む。
// =============================================================
const MAKER_CACHE_MS = 60 * 60 * 1000;   // キャッシュの寿命 (1時間)
const MAKER_HITS = 500;                  // MakerSearch の 1回あたり最大件数
const MAKER_MAX = 20000;                 // 暴走防止の上限
let makerCache = null;                   // { at, list }

// FANZA 動画(digital/videoa)のフロアID。MakerSearch に必須。
async function videoFloorId(apiId, affId) {
    const r = await dmmApi('FloorList', auth(apiId, affId));
    for (const site of r.site || []) {
        for (const svc of site.service || []) {
            if (svc.code !== 'digital') continue;
            for (const fl of svc.floor || []) if (fl.code === 'videoa') return fl.id;
        }
    }
    throw new Error('FANZA 動画のフロアIDを取得できませんでした');
}

async function allMakers(apiId, affId) {
    if (makerCache && Date.now() - makerCache.at < MAKER_CACHE_MS) return makerCache.list;
    const floorId = await videoFloorId(apiId, affId);
    const list = [];
    for (let offset = 1; offset <= MAKER_MAX; offset += MAKER_HITS) {
        const r = await dmmApi('MakerSearch', `${auth(apiId, affId)}&floor_id=${encodeURIComponent(floorId)}&hits=${MAKER_HITS}&offset=${offset}`);
        const arr = r.maker || [];
        arr.forEach(m => list.push({ name: m.name || '', ruby: m.ruby || '', listUrl: m.list_url || '' }));
        if (!arr.length || list.length >= Number(r.total_count || 0)) break;
    }
    makerCache = { at: Date.now(), list };
    return list;
}

// 全角英数・空白・大文字小文字の違いを無視して突き合わせる
function normName(s) {
    return String(s == null ? '' : s)
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[\s　]+/g, '')
        .toLowerCase();
}

const CANDIDATE_LIMIT = 50;

// GET /ext/api/dmm/makers?name=<メーカー名>
//   { total, exact: [...], candidates: [...], limited }
exports.makerSearch = async (req, res) => {
    try {
        const apiId = getSetting('ext_dmm_api_id', '');
        const affId = getSetting('ext_dmm_affiliate_id', '');
        if (!apiId || !affId) {
            return res.status(400).json({ error: 'DMM API ID / アフィリエイトID が未設定です。設定画面で登録してください。' });
        }
        const name = String(req.query.name || '').trim();
        if (!name) return res.status(400).json({ error: 'メーカー名がありません' });

        const list = await allMakers(apiId, affId);
        const key = normName(name);
        const exact = list.filter(m => normName(m.name) === key);
        // 完全一致が無いときだけ候補を返す (部分一致は双方向で見る: 「〇〇」⇔「〇〇 Premium」)
        const hits = exact.length ? [] : list.filter(m => {
            const n = normName(m.name);
            return n && (n.includes(key) || key.includes(n));
        });

        res.json({
            total: list.length,
            exact,
            candidates: hits.slice(0, CANDIDATE_LIMIT),
            limited: hits.length > CANDIDATE_LIMIT
        });
    } catch (e) {
        console.error('[ext dmm makers]', e);
        res.status(502).json({ error: 'メーカー検索に失敗しました: ' + e.message });
    }
};
