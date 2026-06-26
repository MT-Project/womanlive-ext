/* =============================================================
   WomanLive 拡張 - スクリーンショット枚数の表示
   検索結果カードのフォルダ名の右・ブックマークボタンの左に、
   単色カメラアイコン＋枚数を表示します。枚数は bulk API で取得・キャッシュ。
   (bookmark.js の後に登録され、ブックマークボタンの左へ配置します)
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    WL._ssCount = WL._ssCount || {}; // id(number) -> 枚数(number)
    let pending = false;

    // 検索カード内のフォルダ名要素 (bookmark.js と同じ判定。folderName クラスを優先)
    function findFolderName(card) {
        const fav = card.querySelector('.fywxlxv');
        if (fav) return fav;
        const divs = card.querySelectorAll('div');
        for (const d of divs) {
            const s = getComputedStyle(d);
            if (s.whiteSpace === 'nowrap' && s.textOverflow === 'ellipsis' && d.textContent.trim()) return d;
        }
        return null;
    }

    function paintBadge(badge) {
        const vid = Number(badge.getAttribute('data-vid'));
        const n = WL._ssCount[vid];
        const num = badge.querySelector('.wlext-ss-num');
        if (n == null) { num.textContent = ''; badge.classList.add('loading'); badge.title = 'スクリーンショット枚数'; }
        else { num.textContent = String(n); badge.classList.remove('loading'); badge.title = 'スクリーンショット ' + n + ' 枚'; }
    }
    function repaintAll() { document.querySelectorAll('.wlext-ss-badge').forEach(paintBadge); }

    function makeBadge(vid) {
        const badge = h('span', { class: 'wlext-ss-badge', attrs: { 'data-vid': vid } }, [
            WL.icon('camera', 14),
            h('span', { class: 'wlext-ss-num' }, '')
        ]);
        paintBadge(badge);
        return badge;
    }

    function ensure() {
        const root = document.getElementById('root'); if (!root) return;
        const missing = [];
        root.querySelectorAll('a[href^="/watch/"]').forEach(card => {
            const m = (card.getAttribute('href') || '').match(/\/watch\/(\d+)/); if (!m) return;
            const vid = m[1];
            const folderEl = findFolderName(card); if (!folderEl) return;

            let badge = card.querySelector('.wlext-ss-badge');
            const bm = card.querySelector('.wlext-bm-btn');
            if (!badge) {
                badge = makeBadge(vid);
                if (bm) bm.insertAdjacentElement('beforebegin', badge); // ブックマークボタンの左
                else folderEl.insertAdjacentElement('afterend', badge);  // 無ければフォルダ名の右
            } else if (bm && badge.nextElementSibling !== bm) {
                // 後からブックマークボタンが入った等で順序が崩れたら、左へ寄せ直す
                bm.insertAdjacentElement('beforebegin', badge);
            }
            if (WL._ssCount[Number(vid)] == null) missing.push(Number(vid));
        });
        if (missing.length && !pending) fetchCounts(missing);
    }

    function fetchCounts(ids) {
        pending = true;
        WL.api.ssCounts(ids)
            .then(res => {
                const counts = (res && res.counts) || {};
                ids.forEach(id => { WL._ssCount[id] = (counts[id] != null ? counts[id] : 0); });
                pending = false;
                repaintAll();
            })
            .catch(() => { pending = false; });
    }

    WL.onEnsure(ensure);
})();
