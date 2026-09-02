// =============================================================
// 動画ファイルの配信 (モバイルの「端末に保存」/「アプリで開く」用)
//  本家の /api/stream/:id は設定によっては変換したストリームを返すので、
//  ここでは常に元のファイルをそのまま返す。
//  外部プレイヤーがシークできるように Range に対応する。
//   ?dl=1 … Content-Disposition: attachment (ブラウザのダウンロード)
// =============================================================
const fs = require('fs');
const path = require('path');
const { db } = require('../db');

const TYPES = {
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.mov': 'video/quicktime',
    '.flv': 'video/x-flv', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.vob': 'video/mpeg',
    '.ts': 'video/mp2t', '.m2ts': 'video/mp2t', '.asf': 'video/x-ms-asf',
    '.rm': 'application/vnd.rn-realmedia', '.rmvb': 'application/vnd.rn-realmedia-vbr',
};

// GET /ext/api/video/:id/file[?dl=1]
exports.file = (req, res) => {
    try {
        const row = db.prepare('SELECT path, filename FROM files WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: '動画が見つかりません' });
        if (!fs.existsSync(row.path)) return res.status(404).json({ error: 'ファイルが見つかりません' });

        const stat = fs.statSync(row.path);
        const name = row.filename || path.basename(row.path);
        res.set('Content-Type', TYPES[path.extname(row.path).toLowerCase()] || 'application/octet-stream');
        res.set('Accept-Ranges', 'bytes');
        res.set('Cache-Control', 'no-cache');
        if (req.query.dl) {
            // 日本語ファイル名は filename* 側で渡す (ASCII だけの filename も互換のため付ける)
            res.set('Content-Disposition',
                'attachment; filename="' + name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '') + '"' +
                "; filename*=UTF-8''" + encodeURIComponent(name));
        }

        const range = req.headers.range;
        if (range) {
            const m = /bytes=(\d*)-(\d*)/.exec(range);
            const start = m && m[1] ? parseInt(m[1], 10) : 0;
            const wantEnd = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
            if (isNaN(start) || start >= stat.size) {
                return res.status(416).set('Content-Range', 'bytes */' + stat.size).end();
            }
            const end = Math.min(isNaN(wantEnd) ? stat.size - 1 : wantEnd, stat.size - 1);
            res.status(206);
            res.set('Content-Range', 'bytes ' + start + '-' + end + '/' + stat.size);
            res.set('Content-Length', end - start + 1);
            const s = fs.createReadStream(row.path, { start, end });
            req.on('close', () => s.destroy());
            s.on('error', () => { if (!res.headersSent) res.status(500).end(); s.destroy(); });
            return s.pipe(res);
        }

        res.set('Content-Length', stat.size);
        const s = fs.createReadStream(row.path);
        req.on('close', () => s.destroy());
        s.on('error', () => { if (!res.headersSent) res.status(500).end(); s.destroy(); });
        s.pipe(res);
    } catch (e) {
        console.error('[ext video file]', e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
};
