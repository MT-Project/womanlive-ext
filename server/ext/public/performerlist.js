/* =============================================================
   WomanLive 拡張 - 出演者一覧 (/performers)
   ソート(評価/ふりがな/身長/体重/B/カップ/W/H/年齢)・タグ絞込・別名重複絞込
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    function ensure() {
        const on = location.pathname === '/performers';
        const existing = document.querySelector('.wlext-plist-page');
        if (!on) { if (existing) existing.remove(); return; }
        if (existing) return;
        render();
    }

    function numOrNull(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
    function ageMonths(birthday) {
        const d = WL.parseDate(birthday); if (!d) return null;
        const now = new Date();
        let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        if (now.getDate() < d.getDate()) m--;
        return m < 0 ? null : m;
    }
    function ageLabel(birthday) {
        const m = ageMonths(birthday); if (m === null) return '';
        return Math.floor(m / 12) + '歳' + (m % 12) + 'ヶ月';
    }

    async function render() {
        const page = h('div', { class: 'wlext-plist-page wlext-ext-page' });
        page.appendChild(WL.pageHeader());
        const container = h('div', { class: 'wlext-pp-container' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        page.appendChild(container);
        document.body.appendChild(page);
        window.scrollTo(0, 0);

        let all;
        try { all = await WL.api.performersAll(); }
        catch (e) { container.innerHTML = ''; container.appendChild(h('div', null, '読み込みに失敗しました: ' + e.message)); return; }

        const state = { sort: 'furigana', dir: 'asc', tag: '', dupOnly: false };

        // 全タグ収集
        const tagSet = new Set();
        all.forEach(p => p.tags.forEach(t => tagSet.add(t)));
        const allTags = [...tagSet].sort(WL.nameCompare);

        container.innerHTML = '';
        const titleEl = WL.pageTitle('users', '出演者一覧（' + all.length + '名）');
        container.appendChild(titleEl);

        // ---- コントロール ----
        const controls = h('div', { class: 'wlext-plist-controls' });
        const sorter = WL.sortRow([
            ['rating', '評価', 'desc'], ['videoCount', '出演数', 'desc'], ['furigana', 'ふりがな', 'asc'], ['height', '身長', 'asc'], ['weight', '体重', 'asc'],
            ['bust', 'バスト', 'asc'], ['cup', 'カップ数', 'asc'], ['waist', 'ウェスト', 'asc'], ['hip', 'ヒップ', 'asc'], ['age', '年齢', 'desc']
        ], state, renderGrid);
        controls.appendChild(sorter.el);

        // フィルタ行
        const filterRow = h('div', { class: 'wlext-plist-sortrow' });
        filterRow.appendChild(h('span', { class: 'wlext-plist-ctl-label' }, '絞り込み:'));
        const tagSel = h('select', { class: 'wlext-plist-select', onChange: (e) => { state.tag = e.target.value; renderGrid(); } });
        tagSel.appendChild(h('option', { value: '' }, 'タグ: すべて'));
        allTags.forEach(t => tagSel.appendChild(h('option', { value: t }, t)));
        filterRow.appendChild(tagSel);

        const dupChk = h('input', { type: 'checkbox' });
        dupChk.addEventListener('change', () => { state.dupOnly = dupChk.checked; renderGrid(); });
        filterRow.appendChild(h('label', { class: 'wlext-plist-ctl-label', style: { cursor: 'pointer' } }, [dupChk, ' 別名/氏名が重複する出演者のみ']));
        controls.appendChild(filterRow);

        // メンテナンス行
        const maintRow = h('div', { class: 'wlext-plist-sortrow' });
        maintRow.appendChild(h('button', { class: 'wlext-btn', onClick: cleanupUnused }, '🗑 関連動画のない出演者を一括削除'));
        controls.appendChild(maintRow);

        container.appendChild(controls);

        async function reload() {
            try { all = await WL.api.performersAll(); } catch (e) { return; }
            titleEl.setText('出演者一覧（' + all.length + '名）');
            renderGrid();
        }

        async function cleanupUnused() {
            let pv;
            try { pv = await WL.api.cleanupUnusedPerformers(true); }
            catch (e) { WL.toast('取得に失敗: ' + e.message, 'error'); return; }
            if (!pv.count) { WL.toast('関連動画のない出演者はいません', 'success'); return; }
            WL.dialog('関連動画のない出演者を削除',
                h('div', { style: { fontSize: '0.9rem', lineHeight: '1.6' } },
                    '関連動画が無い出演者 ' + pv.count + ' 名（全 ' + pv.total + ' 名中）を削除します。\nこの操作は元に戻せません。よろしいですか？'),
                {
                    saveLabel: '削除する',
                    onSave: async (close) => {
                        try { const r = await WL.api.cleanupUnusedPerformers(false); WL.toast(r.deleted + ' 名を削除しました', 'success'); close(); reload(); }
                        catch (e) { WL.toast('削除に失敗: ' + e.message, 'error'); }
                    }
                });
        }

        // ---- グリッド ----
        const grid = h('div', { class: 'wlext-plist-grid' });
        const countLabel = h('div', { class: 'wlext-plist-count' });
        container.appendChild(countLabel);
        container.appendChild(grid);

        function sortVal(p) {
            switch (state.sort) {
                case 'rating': return p.rating || 0;
                case 'videoCount': return p.videoCount || 0;
                case 'furigana': return p.furigana || p.name || '';
                case 'height': return numOrNull(p.height);
                case 'weight': return numOrNull(p.weight);
                case 'bust': return numOrNull(p.bust);
                case 'waist': return numOrNull(p.waist);
                case 'hip': return numOrNull(p.hip);
                case 'cup': return p.cup || '';
                case 'age': return ageMonths(p.birthday);
                default: return '';
            }
        }
        function cmp(a, b) {
            const dir = state.dir === 'asc' ? 1 : -1;
            let va = sortVal(a), vb = sortVal(b);
            const ea = (va === null || va === ''), eb = (vb === null || vb === '');
            if (ea && eb) return WL.nameCompare(a.name, b.name);
            if (ea) return 1; if (eb) return -1;           // 未設定は常に末尾
            if (typeof va === 'number') return (va - vb) * dir;
            return WL.nameCompare(String(va), String(vb)) * dir;
        }

        function renderGrid() {
            let list = all.slice();
            if (state.tag) list = list.filter(p => p.tags.includes(state.tag));
            if (state.dupOnly) list = list.filter(p => p.dup);
            list.sort(cmp);

            countLabel.textContent = list.length + ' 名';
            grid.innerHTML = '';
            if (!list.length) { grid.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, '該当する出演者がいません')); return; }
            list.forEach(p => grid.appendChild(card(p)));
        }

        function card(p) {
            const imgHost = h('div', { class: 'wlext-plist-img' });
            if (p.has_image) {
                const im = h('img', { alt: p.name, loading: 'lazy' });
                im.onerror = () => { im.remove(); imgHost.appendChild(document.createTextNode('👤')); };
                im.src = WL.api.performerImageUrl(p.id);
                imgHost.appendChild(im);
            } else { imgHost.appendChild(document.createTextNode('👤')); }
            // 関連動画数バッジ (画像右上, シリーズ一覧と同形式)
            imgHost.appendChild(h('div', { class: 'wlext-series-count', title: (p.videoCount || 0) + '本' }, String(p.videoCount || 0)));

            const small = h('div', { class: 'wlext-plist-stars' }, WL.starsEl(p.rating || 0)); // 読み取り専用

            const age = ageLabel(p.birthday);
            const meta = metaLine(p);

            return WL.navA('/performer/' + p.id, { class: 'wlext-plist-card' + (p.dup ? ' dup' : ''), title: '出演者ページを開く' }, [
                imgHost,
                h('div', { class: 'wlext-plist-name' }, p.name || '(無名)'),
                p.furigana ? h('div', { class: 'wlext-plist-furi' }, p.furigana) : null,
                small,
                age ? h('div', { class: 'wlext-plist-age' }, age) : null,
                meta ? h('div', { class: 'wlext-plist-stat' }, meta) : null
            ]);
        }

        // 現在のソート基準に応じた補助表示
        function metaLine(p) {
            switch (state.sort) {
                case 'height': return p.height ? p.height + 'cm' : '';
                case 'weight': return p.weight ? p.weight + 'kg' : '';
                case 'bust': return p.bust ? 'B' + p.bust + (p.cup ? '(' + p.cup + ')' : '') : '';
                case 'cup': return p.cup ? 'カップ ' + p.cup : '';
                case 'waist': return p.waist ? 'W' + p.waist : '';
                case 'hip': return p.hip ? 'H' + p.hip : '';
                default: return '';
            }
        }

        sorter.paint();
        renderGrid();
    }

    WL.onEnsure(ensure);
})();
