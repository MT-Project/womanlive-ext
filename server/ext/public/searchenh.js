/* =============================================================
   WomanLive 拡張 - 検索ページの拡張 (評価ソート / 評価で絞り込み)
   既存ソートボタンと同一クラスを流用して見た目を統一し、
   並び替え状態が変わったら自分のボタンも作り直して整合させる。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    function findSortBar() {
        const root = document.getElementById('root'); if (!root) return null;
        const divs = root.querySelectorAll('div');
        for (const d of divs) {
            if (d.childElementCount === 0 && d.textContent.trim() === '新しい') return d.parentElement;
        }
        return null;
    }

    // 既存ソートボタンの (hash された) クラス名を取得して流用する
    function nativeSortClass(bar) {
        for (const c of bar.children) {
            const t = (c.textContent || '').trim();
            if (c.tagName === 'DIV' && ['新しい', '古い', '名前', '長さ', '新着', '再生履歴', '再生数', 'ランダム'].includes(t)) {
                return c.className.split(/\s+/).filter(x => x !== 'active').join(' ');
            }
        }
        return '';
    }

    function params() { return new URLSearchParams(location.search); }

    // 「表示名」ソートを、既存の「名前」ボタンの右隣に配置する
    function ensureDisplayNameBtn(bar, sort, sortClass) {
        let nameBtn = null;
        for (const c of bar.children) {
            const t = (c.textContent || '').trim().replace(/[ ↑↓]/g, '');
            if (c.tagName === 'DIV' && t === '名前') { nameBtn = c; break; }
        }
        if (!nameBtn) return;
        const active = sort.startsWith('ext_displayname');
        const label = '表示名' + (sort === 'ext_displayname_asc' ? ' ↑' : sort === 'ext_displayname_desc' ? ' ↓' : '');
        const cls = ((sortClass ? sortClass + ' ' : '') + 'wlext-sort-dispname' + (active ? ' active' : '')).trim();
        let btn = bar.querySelector('.wlext-sort-dispname');
        if (!btn) {
            btn = h('div', {
                class: cls, onClick: () => {
                    const np = params();
                    np.set('sort', sort === 'ext_displayname_asc' ? 'ext_displayname_desc' : 'ext_displayname_asc');
                    np.set('page', '1');
                    WL.navigate('/search?' + np.toString());
                }
            }, label);
            if (!sortClass) Object.assign(btn.style, { cursor: 'pointer', padding: '0.375rem 0.75rem', borderRadius: '0.25rem', background: active ? 'var(--accent,#007acc)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary,#888)' });
            nameBtn.insertAdjacentElement('afterend', btn);
        } else {
            btn.className = cls;
            btn.textContent = label;
            if (nameBtn.nextElementSibling !== btn) nameBtn.insertAdjacentElement('afterend', btn);
        }
    }

    function ensure() {
        if (location.pathname !== '/search') return;
        const bar = findSortBar();
        if (!bar) return;

        const p = params();
        const sort = p.get('sort') || '';
        const q = (p.get('q') || '').trim();
        const sortClass = nativeSortClass(bar);

        // 表示名ソート (名前の右)。末尾の wrap とは独立に維持する。
        ensureDisplayNameBtn(bar, sort, sortClass);

        const sig = sort + '|' + q;
        const existing = bar.querySelector('.wlext-sortenh-wrap');
        if (existing && existing.dataset.sig === sig) return; // 最新なので何もしない
        if (existing) existing.remove();
        const wrap = h('span', { class: 'wlext-sortenh-wrap', style: { display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' } });
        wrap.dataset.sig = sig;

        const mkBtn = (label, active, onClick) => {
            const cls = sortClass ? (sortClass + (active ? ' active' : '')) : '';
            const el = h('div', { class: cls, onClick }, label);
            if (!sortClass) Object.assign(el.style, { cursor: 'pointer', padding: '0.375rem 0.75rem', borderRadius: '0.25rem', background: active ? 'var(--accent,#007acc)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary,#888)' });
            return el;
        };

        // 評価ソート (押すたび 降順→昇順 をトグル)
        const ratingActive = sort.startsWith('ext_rating');
        const label = '評価' + (sort === 'ext_rating_desc' ? ' ↓' : sort === 'ext_rating_asc' ? ' ↑' : '');
        wrap.appendChild(mkBtn(label, ratingActive, () => {
            const np = params();
            np.set('sort', sort === 'ext_rating_desc' ? 'ext_rating_asc' : 'ext_rating_desc');
            np.set('page', '1');
            WL.navigate('/search?' + np.toString());
        }));

        // スクリーンショット枚数ソート (押すたび 降順→昇順 をトグル)
        const ssActive = sort.startsWith('ext_screenshots');
        const ssLabel = 'スクショ数' + (sort === 'ext_screenshots_desc' ? ' ↓' : sort === 'ext_screenshots_asc' ? ' ↑' : '');
        wrap.appendChild(mkBtn(ssLabel, ssActive, () => {
            const np = params();
            np.set('sort', sort === 'ext_screenshots_desc' ? 'ext_screenshots_asc' : 'ext_screenshots_desc');
            np.set('page', '1');
            WL.navigate('/search?' + np.toString());
        }));

        // 評価で絞り込み ★1〜★5
        wrap.appendChild(h('span', { style: { color: 'var(--text-secondary,#999)', fontSize: '0.8rem' } }, '評価:'));
        for (let n = 1; n <= 5; n++) {
            const token = '@rating:' + n;
            const active = q === token;
            wrap.appendChild(mkBtn('★' + n, active, () => {
                const np = params();
                np.set('q', active ? '' : token);
                np.set('page', '1');
                WL.navigate('/search?' + np.toString());
            }));
        }

        bar.appendChild(wrap);
    }

    WL.onEnsure(ensure);
})();
