/* =============================================================
   WomanLive 拡張 - コマ送り
   ・「,」で1コマ戻し / 「.」で1コマ送り (本家は Space と矢印しか使っていないので横取り不要)
   ・プレイヤー上の Shift+ホイールでも同じ操作 (本家のホイール5秒送りは修飾キーを見ないため、
     document のキャプチャ段階で先に奪う)
   ・フレームレートは /ext/api/video/:id/frameinfo (ffprobe) から取得
   ・トランスコード再生(native でない動画)はセグメント取得を挟むためコマ送りできない。
     操作されたら一度だけ通知して何もしない。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    let curVid = null;      // 情報を取得済みの動画id
    let info = null;        // { native, fps }
    let notified = false;   // 非対応の通知を出したか (動画ごとに1回)

    function videoEl() {
        const root = document.getElementById('root');
        return root ? root.querySelector('video') : null;
    }
    // 本家プレイヤーの外枠。ハッシュ付きクラスではなく、同じ要素に付く素クラスで拾う。
    function playerBox() {
        const v = videoEl();
        return v ? v.closest('.embedded, .fullscreen') : null;
    }

    // 動画ページを開くたびにフレーム情報を取り直す (取得は1動画1回)
    function load(vid) {
        if (curVid === vid) return;
        curVid = vid; info = null; notified = false;
        WL.api.frameInfo(vid)
            .then(d => { if (curVid === vid) info = d; })
            .catch(() => { if (curVid === vid) info = { native: false, fps: null }; });
    }

    /* ---------- 表示 ---------- */
    let ind = null, indTimer = null;
    function showIndicator(text) {
        if (!ind) { ind = h('div', { class: 'wlext-frame-ind' }); document.body.appendChild(ind); }
        // 全画面表示中は body 直下だと隠れるので、全画面要素の中へ移す
        const host = document.fullscreenElement || document.body;
        if (ind.parentElement !== host) host.appendChild(ind);
        ind.textContent = text;
        ind.classList.add('on');
        clearTimeout(indTimer);
        indTimer = setTimeout(() => ind.classList.remove('on'), 900);
    }
    function fmt(t) {
        const s = Math.max(0, t);
        const m = Math.floor(s / 60);
        return m + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' +
            String(Math.floor((s % 1) * 1000)).padStart(3, '0');
    }

    /* ---------- コマ送り本体 ---------- */
    function step(dir) {
        const v = videoEl();
        if (!v || !info) return false;
        if (!info.native || !info.fps) {
            if (!notified) {
                notified = true;
                WL.toast(info.native
                    ? 'フレームレートを取得できないためコマ送りできません'
                    : 'この動画は変換再生のためコマ送りできません', 'error');
            }
            return true;   // 操作自体は受け取ったので、本家の5秒送りには渡さない
        }
        v.pause();
        const dt = 1 / info.fps;
        const dur = isFinite(v.duration) ? v.duration : 0;
        // 端で止める。最終フレームを踏み越えて ended にしないよう 1コマ手前までにする。
        const next = Math.min(dur > 0 ? dur - dt : Infinity, Math.max(0, v.currentTime + dir * dt));
        v.currentTime = next;
        const frame = Math.round(next * info.fps) + 1;
        showIndicator((dir < 0 ? '◀ ' : '▶ ') + fmt(next) + '  (' + frame + 'F / ' + info.fps.toFixed(2) + 'fps)');
        return true;
    }

    /* ---------- 「,」「.」 ---------- */
    // 本家と同じく入力欄では無視する。拡張のダイアログが開いているときも避ける。
    function typing() {
        const a = document.activeElement;
        if (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) return true;
        if (a && a.isContentEditable) return true;
        return !!document.querySelector('.wlext-overlay');
    }
    document.addEventListener('keydown', (e) => {
        if (e.key !== ',' && e.key !== '.') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (!WL.matchWatch() || typing()) return;
        if (!videoEl()) return;
        e.preventDefault();
        step(e.key === ',' ? -1 : 1);
    });

    /* ---------- Shift+ホイール ---------- */
    // 本家のホイール(5秒送り)はプレイヤー外枠の bubble に付いていて修飾キーを見ないので、
    // document のキャプチャ段階で止めてからコマ送りに回す。
    document.addEventListener('wheel', (e) => {
        if (!e.shiftKey || !e.deltaY) return;
        const box = playerBox();
        if (!box || !box.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        step(e.deltaY < 0 ? -1 : 1);
    }, { capture: true, passive: false });

    /* ---------- ページ検知 ---------- */
    WL.onEnsure(() => {
        const vid = WL.matchWatch();
        if (!vid) { curVid = null; info = null; return; }
        load(vid);
    });
})();
