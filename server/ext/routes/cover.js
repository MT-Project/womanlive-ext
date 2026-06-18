// =============================================================
// カバー画像 / 拡張設定 ルート
// =============================================================
const fs = require('fs');
const path = require('path');
const { db, getSetting, setSetting } = require('../db');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { /* 変換なしでも動作 */ }

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'];
const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif'
};

// --- 拡張設定 (カバー画像フォルダ / DMM API) ---
exports.getSettings = (req, res) => {
    res.json({
        cover_folder: getSetting('ext_cover_folder', ''),
        dmm_api_id: getSetting('ext_dmm_api_id', ''),
        dmm_affiliate_id: getSetting('ext_dmm_affiliate_id', '')
    });
};

exports.updateSettings = (req, res) => {
    try {
        const b = req.body || {};
        if (b.cover_folder !== undefined) setSetting('ext_cover_folder', b.cover_folder);
        if (b.dmm_api_id !== undefined) setSetting('ext_dmm_api_id', String(b.dmm_api_id).trim());
        if (b.dmm_affiliate_id !== undefined) setSetting('ext_dmm_affiliate_id', String(b.dmm_affiliate_id).trim());
        res.json({
            success: true,
            cover_folder: getSetting('ext_cover_folder', ''),
            dmm_api_id: getSetting('ext_dmm_api_id', ''),
            dmm_affiliate_id: getSetting('ext_dmm_affiliate_id', '')
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// フォルダ内に該当ファイルがあればそのパスを返す
function findFolderCover(fileRow) {
    const folder = getSetting('ext_cover_folder', '');
    if (!folder || !fileRow) return null;
    const baseName = path.parse(fileRow.filename || path.basename(fileRow.path)).name;
    for (const ext of IMG_EXTS) {
        const candidate = path.join(folder, baseName + ext);
        if (fs.existsSync(candidate)) return { path: candidate, ext };
    }
    return null;
}

// この動画にカバー画像が存在するか (DB保存 or フォルダ)
function hasCover(fileRow) {
    if (!fileRow) return false;
    const dbRow = db.prepare('SELECT 1 AS x FROM ext_video_cover WHERE hash = ?').get(fileRow.hash);
    if (dbRow) return true;
    return !!findFolderCover(fileRow);
}
exports.hasCover = hasCover;

// URL から画像を取得して DB に保存 (カバー未設定時のみ呼ぶ想定)
async function storeCoverFromUrl(hash, url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('画像の取得に失敗 (' + r.status + ')');
    let buf = Buffer.from(await r.arrayBuffer());
    if (sharp) {
        try { buf = await sharp(buf).webp({ quality: 85 }).toBuffer(); } catch (e) { /* 変換失敗時は元データ */ }
    }
    db.prepare('INSERT OR REPLACE INTO ext_video_cover (hash, image, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(hash, buf);
}
exports.storeCoverFromUrl = storeCoverFromUrl;

// --- カバー画像本体 ---
// 1) DB保存(ext_video_cover) を優先 2) なければ cover_folder から同名画像
exports.getCover = (req, res) => {
    try {
        const row = db.prepare('SELECT filename, path, hash FROM files WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).end();

        // 1) DB 保存のカバー
        const dbCover = db.prepare('SELECT image FROM ext_video_cover WHERE hash = ?').get(row.hash);
        if (dbCover && dbCover.image) {
            const buf = dbCover.image;
            const isPng = buf[0] === 0x89, isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
            res.set('Content-Type', isPng ? 'image/png' : (isJpeg ? 'image/jpeg' : 'image/webp'));
            res.set('Cache-Control', 'no-cache');
            return res.send(buf);
        }

        // 2) フォルダのカバー
        const folderCover = findFolderCover(row);
        if (folderCover) {
            res.set('Content-Type', MIME[folderCover.ext] || 'application/octet-stream');
            res.set('Cache-Control', 'no-cache');
            const stream = fs.createReadStream(folderCover.path);
            stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
            return stream.pipe(res);
        }

        return res.status(404).end();
    } catch (e) {
        console.error('[ext cover]', e);
        if (!res.headersSent) res.status(500).end();
    }
};
