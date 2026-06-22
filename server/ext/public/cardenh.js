/* =============================================================
   WomanLive 拡張 - 検索結果カードの表示拡張
   ・サムネ右上にメーカー名 (半透明の白字)
   ・フォルダ名をサムネ左下へ (動画の長さバッジと同じ形式)
   ・もともとフォルダ名があった位置に評価(★)を表示
   メーカー/評価は bulkMeta でまとめて取得・キャッシュ。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    WL._cardMeta = WL._cardMeta || {}; // id -> { rating, maker, ... } (取得済み)
    let pending = false;

    function ensure() {
        if (location.pathname !== '/search') return;       // 検索結果画面のみ
        const root = document.getElementById('root'); if (!root) return;
        const missing = [];
        root.querySelectorAll('a[href^="/watch/"]').forEach(card => {
            const m = (card.getAttribute('href') || '').match(/\/watch\/(\d+)/); if (!m) return;
            const thumb = card.querySelector('.gdn66kd');     // gridThumbnailWrapper
            const folderEl = card.querySelector('.fywxlxv');  // folderName
            if (!thumb || !folderEl) return;
            const id = Number(m[1]);
            applyCard(id, thumb, folderEl);
            if (WL._cardMeta[id] === undefined && !missing.includes(id)) missing.push(id);
        });
        if (missing.length && !pending) fetchMeta(missing);
    }

    function applyCard(id, thumb, folderEl) {
        const meta = WL._cardMeta[id];

        // 1) フォルダ名 → サムネ左下 (長さバッジ .dnjkqxo の形式を流用)
        if (!thumb.querySelector('.wlext-folder-ov')) {
            const txt = (folderEl.textContent || '').trim();
            if (txt) thumb.appendChild(h('div', { class: 'dnjkqxo wlext-folder-ov', title: txt }, txt));
        }
        // 元のフォルダ名は隠す (テキストは残す: 既存のブックマーク/スクショ注入が参照するため)
        folderEl.style.display = 'none';

        // 2) 評価を「フォルダ名があった位置」に
        if (folderEl.parentElement) {
            let rc = folderEl.parentElement.querySelector('.wlext-card-rating');
            if (!rc) { rc = h('div', { class: 'wlext-card-rating' }); folderEl.insertAdjacentElement('beforebegin', rc); }
            const rating = meta ? (meta.rating || 0) : 0;
            if (rc.getAttribute('data-r') !== String(rating)) {
                rc.setAttribute('data-r', String(rating));
                rc.innerHTML = '';
                if (rating > 0) rc.appendChild(WL.starsEl(rating)); // 読み取り専用
            }
        }

        // 3) メーカー → サムネ右上 (半透明の白字)
        if (meta && meta.maker) {
            let mk = thumb.querySelector('.wlext-maker-ov');
            if (!mk) { mk = h('div', { class: 'wlext-maker-ov' }); thumb.appendChild(mk); }
            if (mk.textContent !== meta.maker) { mk.textContent = meta.maker; mk.title = meta.maker; }
        }
    }

    function fetchMeta(ids) {
        pending = true;
        WL.api.bulkMeta(ids)
            .then(map => {
                ids.forEach(id => { WL._cardMeta[id] = map[id] || {}; });
                pending = false;
                ensure(); // 取得後に再描画
            })
            .catch(() => { pending = false; });
    }

    WL.onEnsure(ensure);
})();
