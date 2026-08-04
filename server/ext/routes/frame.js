// =============================================================
// コマ送り用のフレーム情報
//  ・ffprobe で動画のフレームレートを取得する (本家はどこにも保持していない)
//  ・1動画あたり 1 秒弱かかるので hash をキーにメモリへキャッシュする
//    (ext_* テーブルを増やすほどの情報ではないため、プロセス内キャッシュに留める)
// =============================================================
const { spawn } = require('child_process');
const { db } = require('../db');

const ffprobePath = 'ffprobe';   // 本家 mediaService と同じく PATH 上の ffprobe を使う
const cache = new Map();         // hash -> fps(number) | null

// "30000/1001" や "30/1" のような分数表記を数値へ。
function parseRate(s) {
    const m = /^(\d+)\/(\d+)$/.exec(String(s || '').trim());
    if (m) {
        const n = Number(m[1]), d = Number(m[2]);
        return d > 0 ? n / d : 0;
    }
    const v = Number(s);
    return isNaN(v) ? 0 : v;
}

function probeFps(filePath) {
    return new Promise((resolve) => {
        const ffprobe = spawn(ffprobePath, [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=r_frame_rate,avg_frame_rate',
            '-of', 'default=noprint_wrappers=1',
            filePath
        ], { timeout: 15000, killSignal: 'SIGKILL' });

        let output = '';
        ffprobe.stdout?.on('data', (d) => output += d.toString());
        ffprobe.stderr?.on('data', () => { });

        ffprobe.on('close', () => {
            const get = (k) => {
                const m = new RegExp('^' + k + '=(.+)$', 'm').exec(output);
                return m ? parseRate(m[1]) : 0;
            };
            // r_frame_rate が 0/0 等で取れないコンテナもあるので avg_frame_rate も見る
            const fps = get('r_frame_rate') || get('avg_frame_rate');
            // 明らかに異常な値(可変フレームレートで巨大な r_frame_rate が返る等)は捨てる
            resolve(fps > 0 && fps <= 480 ? fps : null);
        });
        ffprobe.on('error', (err) => {
            console.warn('[ext frame] ffprobe 失敗:', err.message);
            resolve(null);
        });
    });
}

// GET /ext/api/video/:id/frameinfo -> { native, fps }
// native=false (トランスコード再生) のときはコマ送りできないので fps は返さない。
exports.frameInfo = async (req, res) => {
    try {
        const row = db.prepare(`
            SELECT f.hash, f.path, m.use_transcode
            FROM files f LEFT JOIN metadata m ON m.hash = f.hash
            WHERE f.id = ?
        `).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'video not found' });

        const native = row.use_transcode === 0;
        if (!native) return res.json({ native: false, fps: null });

        if (!cache.has(row.hash)) cache.set(row.hash, await probeFps(row.path));
        res.json({ native: true, fps: cache.get(row.hash) });
    } catch (e) {
        console.error('[ext frameinfo]', e);
        res.status(500).json({ error: e.message });
    }
};
