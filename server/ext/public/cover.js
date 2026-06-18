/* =============================================================
   WomanLive 拡張 - カバー画像
   スクリーンショット欄の先頭にカバー画像を挿入し、クリックで拡大。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    const coverState = {}; // vid -> 'yes' | 'no'

    function findScreenshotsGrid() {
        const root = document.getElementById('root'); if (!root) return null;

        // 1) スクリーンショット画像がある場合
        const img = root.querySelector('img[src*="/api/screenshot/"]');
        if (img) {
            let el = img.parentElement, guard = 0;
            while (el && guard++ < 6) {
                const st = getComputedStyle(el);
                if (st.display === 'flex' && st.flexWrap === 'wrap') return el;
                el = el.parentElement;
            }
            return img.parentElement && img.parentElement.parentElement
                ? img.parentElement.parentElement.parentElement : null;
        }
        // 2) 「スクリーンショットはありません」メッセージの親
        const divs = root.querySelectorAll('div');
        for (const d of divs) {
            if (d.childElementCount === 0 && d.textContent.trim() === 'スクリーンショットはありません') {
                return d.parentElement;
            }
        }
        return null;
    }

    function ensureCover() {
        const vid = WL.matchWatch();
        if (!vid) return;
        if (coverState[vid] === 'no') return;

        const grid = findScreenshotsGrid();
        if (!grid) return;
        if (grid.querySelector('.wlext-cover-card')) return;

        const imgEl = h('img', { alt: 'カバー画像' });
        const card = h('div', { class: 'wlext-cover-card', title: 'カバー画像 (クリックで拡大)' }, [
            imgEl, h('div', { class: 'wlext-cover-badge' }, 'カバー')
        ]);
        imgEl.onload = () => { coverState[vid] = 'yes'; };
        imgEl.onerror = () => { coverState[vid] = 'no'; card.remove(); };
        imgEl.src = WL.api.coverUrl(vid);
        card.addEventListener('click', () => WL.lightbox(WL.api.coverUrl(vid)));

        grid.insertBefore(card, grid.firstChild);
    }

    WL.onEnsure(ensureCover);
    // 動画が変わったら古いカバーカードを除去 (新しい動画用に作り直す)
    WL.onRoute(() => {
        const root = document.getElementById('root');
        if (root) root.querySelectorAll('.wlext-cover-card').forEach(e => e.remove());
    });

    // カバーを再取得 (DMM適用後などに呼ぶ): 判定をリセットしカードを作り直す
    WL.refreshCover = (vid) => {
        delete coverState[vid];
        const root = document.getElementById('root');
        if (root) root.querySelectorAll('.wlext-cover-card').forEach(e => e.remove());
        WL.requestEnsure();
    };
})();
