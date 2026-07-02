/* =============================================================
   WomanLive 拡張 - シリーズ一覧 (/series)
   シリーズ別にサムネイル・名前(本数)・平均評価を表示。
   ソート: シリーズ名 / 動画本数 / 評価。クリックでそのシリーズを検索。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    function ensure() {
        const on = location.pathname === '/series';
        const existing = document.querySelector('.wlext-series-page');
        if (!on) { if (existing) existing.remove(); return; }
        if (existing) return;
        render();
    }

    async function render() {
        const page = h('div', { class: 'wlext-series-page wlext-ext-page' });
        page.appendChild(WL.pageHeader());
        const container = h('div', { class: 'wlext-pp-container' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        page.appendChild(container);
        document.body.appendChild(page);
        window.scrollTo(0, 0);

        let list;
        try { list = await WL.api.seriesList(); }
        catch (e) { container.innerHTML = ''; container.appendChild(h('div', null, '読み込みに失敗しました: ' + e.message)); return; }

        const state = { sort: 'name', dir: 'asc' };

        container.innerHTML = '';
        container.appendChild(WL.pageTitle('library', 'シリーズ一覧（' + list.length + '件）'));

        // ---- 並び替え ----
        const controls = h('div', { class: 'wlext-plist-controls' });
        const sorter = WL.sortRow([['name', 'シリーズ名', 'asc'], ['count', '動画本数', 'desc'], ['rating', '評価', 'desc']], state, renderGrid);
        controls.appendChild(sorter.el);
        container.appendChild(controls);

        const grid = h('div', { class: 'wlext-series-grid' });
        container.appendChild(grid);

        function cmp(a, b) {
            const dir = state.dir === 'asc' ? 1 : -1;
            const byName = WL.nameCompare(a.name, b.name);
            if (state.sort === 'name') return byName * dir;
            if (state.sort === 'count') return ((a.count || 0) - (b.count || 0)) * dir || byName;
            // rating: 未評価(null)は常に末尾
            const ra = a.avgRating, rb = b.avgRating;
            if (ra == null && rb == null) return byName;
            if (ra == null) return 1; if (rb == null) return -1;
            return (ra - rb) * dir || byName;
        }

        function renderGrid() {
            const sorted = list.slice().sort(cmp);
            grid.innerHTML = '';
            if (!sorted.length) { grid.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, 'シリーズが設定された動画がありません')); return; }
            sorted.forEach(s => grid.appendChild(card(s)));
        }

        function card(s) {
            const thumb = h('div', { class: 'wlext-video-thumb' });
            if (s.thumbId) thumb.appendChild(h('img', { src: '/api/video/' + s.thumbId + '/thumbnail', loading: 'lazy', alt: s.name }));
            else thumb.appendChild(h('div', { class: 'noimg' }, 'NO IMAGE'));
            // 動画本数: サムネイル右上の角丸バッジ
            thumb.appendChild(h('div', { class: 'wlext-series-count', title: s.count + '本' }, String(s.count)));

            const nameEl = h('div', { class: 'wlext-series-name' }, s.name || '(無題)');

            const ratingEl = h('div', { class: 'wlext-series-rating' });
            if (s.avgRating != null) {
                ratingEl.appendChild(WL.starsEl(Math.round(s.avgRating)));
                ratingEl.appendChild(h('span', { class: 'wlext-series-ratingnum' }, s.avgRating.toFixed(1)));
            } else {
                ratingEl.appendChild(h('span', { style: { color: 'var(--text-secondary,#888)', fontSize: '0.75rem' } }, '評価なし'));
            }

            const url = '/search?q=' + encodeURIComponent('@series:"' + s.name + '"');
            return WL.navA(url, { class: 'wlext-series-card', title: '「' + s.name + '」で検索' }, [thumb, nameEl, ratingEl]);
        }

        sorter.paint();
        renderGrid();
    }

    WL.onEnsure(ensure);
})();
