/* =============================================================
   WomanLive 拡張 - サムネイル表示の切替 (スクリーンショット / ジャケット)
   検索画面の表示形式ボタンの右にトグルを置き、ジャケット選択時は
   カードのサムネ画像をカバー画像へ差し替える。カバーが無い動画は本家のまま。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;
    const KEY = 'wlext_thumb_mode';   // 'cover' | それ以外(スクショ)

    function isCover() { try { return localStorage.getItem(KEY) === 'cover'; } catch (e) { return false; } }
    function setCover(on) { try { localStorage.setItem(KEY, on ? 'cover' : 'ss'); } catch (e) { } }

    const coverState = {}; // id -> 'yes' | 'no' | 'loading'

    // トグル: 本家の表示形式ボタン群(controlGroup_/viewModeButton_)のクラスを借りて見た目・テーマを揃える
    function ensureToggle() {
        const group = document.querySelector('[class*="statusBar_"] [class*="controlGroup_"]:not(.wlext-thumbmode)');
        if (!group) return;
        const sample = group.querySelector('[class*="viewModeButton_"]');
        const btnCls = sample ? sample.className.split(/\s+/).filter(c => c && c !== 'active').join(' ') : '';
        let tg = group.parentElement.querySelector('.wlext-thumbmode');
        if (!tg) {
            const mk = (mode, icon, title) => {
                const svg = WL.icon(icon, 20);
                return h('div', { class: btnCls, title, 'data-mode': mode, onClick: () => { setCover(mode === 'cover'); ensure(); } }, svg);
            };
            tg = h('div', { class: group.className + ' wlext-thumbmode', title: 'サムネイル' }, [
                mk('ss', 'camera', 'スクリーンショット'), mk('cover', 'image', 'ジャケット画像')
            ]);
        }
        if (group.nextElementSibling !== tg) group.insertAdjacentElement('afterend', tg);
        const cover = isCover();
        tg.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', (b.getAttribute('data-mode') === 'cover') === cover));
    }

    function applyCards() {
        const cover = isCover();
        document.querySelectorAll('#root a[href^="/watch/"] img[class*="thumbnailImg_"]').forEach(img => {
            const m = (img.closest('a').getAttribute('href') || '').match(/\/watch\/(\d+)/); if (!m) return;
            const id = m[1], url = WL.api.coverUrl(id);
            const src = img.getAttribute('src');
            if (!cover) {   // スクショへ戻す (本家が付けた元の src)
                if (src === url && img.dataset.wlextOrig) img.setAttribute('src', img.dataset.wlextOrig);
                img.classList.remove('wlext-thumb-cover');
                return;
            }
            if (src === url || coverState[id] === 'no') return;
            img.dataset.wlextOrig = src;   // React が別動画用に src を変えたらここで取り直す
            const swap = () => { if (isCover() && img.getAttribute('src') === img.dataset.wlextOrig) { img.setAttribute('src', url); img.classList.add('wlext-thumb-cover'); } };
            if (coverState[id] === 'yes') return swap();
            if (coverState[id] === 'loading') return;
            // 先読みしてから差し替える (カバー無し=404 のときに空白を挟まない)
            coverState[id] = 'loading';
            const pre = new Image();
            pre.onload = () => { coverState[id] = 'yes'; applyCards(); };
            pre.onerror = () => { coverState[id] = 'no'; };
            pre.src = url;
        });
    }

    function ensure() {
        if (location.pathname !== '/search') return;
        ensureToggle();
        applyCards();
    }

    WL.onEnsure(ensure);
})();
