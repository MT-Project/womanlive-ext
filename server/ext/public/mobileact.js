/* =============================================================
   WomanLive 拡張 - 動画ページのモバイル向け操作
   本家の「フォルダーを開く」「アプリで再生」は、サーバー機のエクスプローラや
   既定プレイヤーを開くもので、localhost で見ているときしか表示されない。
   手元の端末から見ているときに使えるよう、タッチ端末では次の2つを出す。
     ・端末に保存  … ブラウザの標準ダウンロード (Content-Disposition: attachment)
     ・アプリで開く … OS のアプリへ渡して再生 (Android は intent:、その他は別タブ)
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    // コマ送りのタッチ操作(framestep.js)と同じ判定基準
    const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

    function fileUrl(id, dl) {
        return location.origin + '/ext/api/video/' + id + '/file' + (dl ? '?dl=1' : '');
    }

    // Android は intent: でアプリ選択に渡せる。開けなければ元のURLへ戻る(browser_fallback_url)。
    // iOS などは別タブで開く(標準プレイヤーで再生し、共有メニューから他アプリへ渡せる)。
    function openInApp(id) {
        const url = fileUrl(id, false);
        if (/Android/i.test(navigator.userAgent)) {
            const scheme = location.protocol.replace(':', '');
            location.href = 'intent://' + url.replace(/^https?:\/\//, '') +
                '#Intent;scheme=' + scheme +
                ';action=android.intent.action.VIEW;type=video/*' +
                ';S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
            return;
        }
        window.open(url, '_blank', 'noopener');
    }

    // 本家のボタンと同じ見た目にするため、クラス名は隣のボタンから借りる
    function nativeButtonClass(root) {
        for (const b of root.querySelectorAll('button')) {
            if ((b.textContent || '').trim() === 'コーデック情報') return b.className;
        }
        return '';
    }

    function ensure() {
        const id = WL.matchWatch();
        if (!id || !isTouch()) return;
        const root = document.getElementById('root'); if (!root) return;
        if (root.querySelector('.wlext-mobileact')) return;

        // 「コーデック情報」のあるボックスの直後に置く (本家の操作ボタンと同じ位置)
        let codecBtn = null;
        for (const b of root.querySelectorAll('button')) {
            if ((b.textContent || '').trim() === 'コーデック情報') { codecBtn = b; break; }
        }
        if (!codecBtn) return;
        const box = codecBtn.closest('[class*="infoBox_"]') || codecBtn.parentElement;
        if (!box || !box.parentElement) return;

        // localhost で見ているときは本家の2つも出る(サーバー機側を開くもの)ので、
        // 枠ごと隠して置き換える
        [...root.querySelectorAll('button')].forEach(b => {
            const t = (b.textContent || '').trim();
            if (t !== 'フォルダーを開く' && t !== 'アプリで再生') return;
            const nativeBox = b.closest('[class*="infoBox_"]') || b.parentElement;
            if (nativeBox) nativeBox.style.display = 'none';
        });

        const cls = nativeButtonClass(root);
        const save = h('a', {
            class: cls, href: fileUrl(id, true), download: '',
            style: { textDecoration: 'none', display: 'inline-block' }
        }, '端末に保存');
        const open = h('button', { class: cls, onClick: () => openInApp(id) }, 'アプリで開く');

        box.insertAdjacentElement('afterend', h('div', {
            class: box.className + ' wlext-mobileact'
        }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } }, [save, open])));
    }

    WL.onEnsure(ensure);
})();
