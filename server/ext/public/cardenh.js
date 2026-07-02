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
            // グリッド表示 .gdn66kd / リスト表示 .l1wadlm1 どちらのサムネ枠も対象にする
            const thumb = card.querySelector('.gdn66kd, .l1wadlm1');
            const folderEl = WL.findFolderName(card);  // folderName (grid/list 共通)
            if (!thumb || !folderEl) return;
            // 折りたたみバッジ(フォルダ名/メーカー)が枠内に収まるよう、サムネ枠を相対配置に
            if (getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative';
            const id = Number(m[1]);
            applyCard(id, thumb, folderEl, card);
            applyTags(card, id);
            if (WL._cardMeta[id] === undefined && !missing.includes(id)) missing.push(id);
        });
        if (missing.length && !pending) fetchMeta(missing);
    }

    /* ---------- リスト表示: タグを幅に合わせて表示 ('…' で省略・マウスオーバーで全表示) ---------- */
    function splitTags(s) { return String(s == null ? '' : s).split('\n').map(t => t.trim()).filter(Boolean); }

    // 本家のタグ枠(.trl3mnc)はグリッドと共有のため触らず、リスト時のみ隠して別枠(.wlext-tagrow)で表示する。
    function applyTags(card, id) {
        const isList = !!card.querySelector('.l1wadlm1');
        const native = card.querySelector('.trl3mnc:not(.wlext-tagrow)');
        let mine = card.querySelector('.wlext-tagrow');
        if (!isList || !native) { if (mine) mine.remove(); if (native) native.style.display = ''; return; }
        const tags = splitTags(WL._videoTags && WL._videoTags[id]);
        if (!tags.length) { if (mine) mine.remove(); native.style.display = ''; return; }
        native.style.display = 'none';
        if (!mine) { mine = h('div', { class: 'trl3mnc wlext-tagrow' }); native.insertAdjacentElement('afterend', mine); }
        const sig = mine.clientWidth + '|' + tags.join('');
        if (mine.getAttribute('data-sig') === sig) return;   // 同じ幅・タグなら再フィットしない
        mine.setAttribute('data-sig', sig);
        fitTags(mine, tags);
    }

    function fitTags(cont, tags) {
        cont.innerHTML = '';
        tags.forEach(t => cont.appendChild(h('span', { class: 't3g6pxg' }, t)));
        const ell = h('span', { class: 't3g6pxg wlext-tag-ell', title: tags.join(' / ') }, '…');
        cont.appendChild(ell);
        ell.style.display = 'none';
        if (cont.scrollWidth <= cont.clientWidth) { ell.remove(); return; } // 全部入る
        ell.style.display = '';
        const badges = [...cont.querySelectorAll('.t3g6pxg:not(.wlext-tag-ell)')];
        while (cont.scrollWidth > cont.clientWidth && badges.length) badges.pop().remove();
    }

    // 注入はすべて「カード内で1つ」に統一し、毎回 現在のビュー(グリッド/リスト)の
    // 正しい位置へ再配置する。これにより グリッド⇔リスト 切替で重複しない。
    function applyCard(id, thumb, folderEl, card) {
        const meta = WL._cardMeta[id];

        // 1) フォルダ名 → サムネ左下 (長さバッジ .dnjkqxo の形式を流用)
        const txt = (folderEl.textContent || '').trim();
        let fo = card.querySelector('.wlext-folder-ov');
        if (!fo && txt) fo = h('div', { class: 'dnjkqxo wlext-folder-ov', title: txt }, txt);
        if (fo && fo.parentElement !== thumb) thumb.appendChild(fo);   // 現ビューのサムネへ寄せる
        // 元のフォルダ名は隠す (テキストは残す: 既存のブックマーク/スクショ注入が参照するため)
        folderEl.style.display = 'none';

        // 2) 評価を「フォルダ名があった位置」(フォルダ名の直前)へ
        let rc = card.querySelector('.wlext-card-rating');
        if (!rc) rc = h('div', { class: 'wlext-card-rating' });
        if (folderEl.previousElementSibling !== rc) folderEl.insertAdjacentElement('beforebegin', rc);
        const rating = meta ? (meta.rating || 0) : 0;
        if (rc.getAttribute('data-r') !== String(rating)) {
            rc.setAttribute('data-r', String(rating));
            rc.innerHTML = '';
            if (rating > 0) rc.appendChild(WL.starsEl(rating)); // 読み取り専用
        }

        // 3) メーカー → サムネ右上 (半透明の白字)
        if (meta && meta.maker) {
            let mk = card.querySelector('.wlext-maker-ov');
            if (!mk) mk = h('div', { class: 'wlext-maker-ov' });
            if (mk.parentElement !== thumb) thumb.appendChild(mk);
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
    // ウィンドウ幅が変わったらタグの表示数を再計算する
    window.addEventListener('resize', WL.debounce(ensure, 150));
})();
