/* =============================================================
   WomanLive 拡張 - ブックマークページ (/bookmarks)
   ブックマークフォルダを一覧表示。サムネ/本数/平均評価。
   ソート(名前/本数/評価)、フォルダ追加・名称変更・削除、フォルダを開く(検索)。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    function ensure() {
        const on = location.pathname === '/bookmarks';
        const existing = document.querySelector('.wlext-bm-page');
        if (!on) { if (existing) existing.remove(); return; }
        if (existing) return;
        render();
    }

    async function render() {
        const page = h('div', { class: 'wlext-bm-page wlext-ext-page' });
        page.appendChild(WL.pageHeader());
        const container = h('div', { class: 'wlext-pp-container' }, h('div', { style: { color: 'var(--text-secondary,#888)' } }, '読み込み中...'));
        page.appendChild(container);
        document.body.appendChild(page);
        window.scrollTo(0, 0);

        const state = { sort: 'name', dir: 'asc' };
        let list = [];

        async function reload() {
            try { list = await WL.api.bmFolders(); } catch (e) { return; }
            titleEl.setText('ブックマーク（' + list.length + 'フォルダ）');
            renderGrid();
        }

        container.innerHTML = '';
        const titleEl = WL.pageTitle('bookmark', 'ブックマーク');
        container.appendChild(titleEl);

        // ---- コントロール ----
        const controls = h('div', { class: 'wlext-plist-controls' });
        const sortRow = h('div', { class: 'wlext-plist-sortrow' });
        sortRow.appendChild(h('span', { class: 'wlext-plist-ctl-label' }, '並び替え:'));
        const sortDefs = [['name', 'フォルダ名'], ['count', '動画本数'], ['rating', '評価']];
        const btns = {};
        sortDefs.forEach(([key, label]) => {
            const b = h('div', {
                class: 'wlext-plist-sortbtn', onClick: () => {
                    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                    else { state.sort = key; state.dir = (key === 'name') ? 'asc' : 'desc'; }
                    paint(); renderGrid();
                }
            }, label);
            btns[key] = b; sortRow.appendChild(b);
        });
        function paint() {
            sortDefs.forEach(([key, label]) => { const b = btns[key]; const a = state.sort === key; b.classList.toggle('active', a); b.textContent = label + (a ? (state.dir === 'asc' ? ' ↑' : ' ↓') : ''); });
        }
        controls.appendChild(sortRow);

        const addRow = h('div', { class: 'wlext-plist-sortrow' });
        addRow.appendChild(h('button', { class: 'wlext-btn', onClick: addFolder }, '＋ フォルダを追加'));
        controls.appendChild(addRow);
        container.appendChild(controls);

        const grid = h('div', { class: 'wlext-series-grid' });
        container.appendChild(grid);

        function cmp(a, b) {
            const dir = state.dir === 'asc' ? 1 : -1;
            if (state.sort === 'name') return (a.name || '').localeCompare(b.name || '', 'ja') * dir;
            if (state.sort === 'count') return ((a.count || 0) - (b.count || 0)) * dir || (a.name || '').localeCompare(b.name || '', 'ja');
            const ra = a.avgRating, rb = b.avgRating;
            if (ra == null && rb == null) return (a.name || '').localeCompare(b.name || '', 'ja');
            if (ra == null) return 1; if (rb == null) return -1;
            return (ra - rb) * dir || (a.name || '').localeCompare(b.name || '', 'ja');
        }

        function renderGrid() {
            const sorted = list.slice().sort(cmp);
            grid.innerHTML = '';
            if (!sorted.length) { grid.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)' } }, 'ブックマークフォルダがありません。「＋ フォルダを追加」または各動画の🔖ボタンから作成できます。')); return; }
            sorted.forEach(s => grid.appendChild(card(s)));
        }

        function card(s) {
            const thumb = h('div', { class: 'wlext-video-thumb', onClick: () => openFolder(s), title: '開く' });
            if (s.thumbId) thumb.appendChild(h('img', { src: '/api/video/' + s.thumbId + '/thumbnail', loading: 'lazy', alt: s.name }));
            else thumb.appendChild(h('div', { class: 'noimg' }, 'NO IMAGE'));
            thumb.appendChild(h('div', { class: 'wlext-series-count', title: s.count + '本' }, String(s.count)));

            const nameEl = h('div', { class: 'wlext-series-name', style: { cursor: 'pointer' }, onClick: () => openFolder(s), title: '開く' }, s.name || '(無題)');

            const ratingEl = h('div', { class: 'wlext-series-rating' });
            if (s.avgRating != null) { ratingEl.appendChild(WL.starsEl(Math.round(s.avgRating))); ratingEl.appendChild(h('span', { class: 'wlext-series-ratingnum' }, s.avgRating.toFixed(1))); }
            else ratingEl.appendChild(h('span', { style: { color: 'var(--text-secondary,#888)', fontSize: '0.75rem' } }, '評価なし'));

            const actions = h('div', { class: 'wlext-bm-actions' }, [
                h('span', { class: 'wlext-link', onClick: () => renameFolder(s) }, '✎名称変更'),
                h('span', { class: 'wlext-link', style: { color: 'var(--status-error,#e51400)' }, onClick: () => deleteFolder(s) }, '🗑削除')
            ]);

            return h('div', { class: 'wlext-series-card' }, [thumb, nameEl, ratingEl, actions]);
        }

        function openFolder(s) { WL.searchBy('@bookmark:' + s.id); }

        function addFolder() {
            const input = h('input', { class: 'wlext-input', placeholder: 'フォルダ名' });
            WL.dialog('フォルダを追加', h('div', { class: 'wlext-field' }, [h('label', null, 'フォルダ名'), input]), {
                saveLabel: '追加',
                onSave: async (close) => { const name = input.value.trim(); if (!name) { WL.toast('フォルダ名を入力してください', 'error'); return; } try { await WL.api.bmCreateFolder(name); close(); reload(); } catch (e) { WL.toast('追加に失敗: ' + e.message, 'error'); } }
            });
            setTimeout(() => input.focus(), 50);
        }

        function renameFolder(s) {
            const input = h('input', { class: 'wlext-input', value: s.name || '' });
            WL.dialog('フォルダ名を変更', h('div', { class: 'wlext-field' }, [h('label', null, 'フォルダ名'), input]), {
                saveLabel: '変更',
                onSave: async (close) => { const name = input.value.trim(); if (!name) return; try { await WL.api.bmRenameFolder(s.id, name); close(); reload(); } catch (e) { WL.toast('変更に失敗: ' + e.message, 'error'); } }
            });
            setTimeout(() => input.focus(), 50);
        }

        function deleteFolder(s) {
            WL.dialog('フォルダを削除', h('div', { style: { fontSize: '0.9rem', lineHeight: '1.6' } }, '「' + s.name + '」を削除します（中のブックマークも削除されます。動画自体は削除されません）。よろしいですか？'), {
                saveLabel: '削除する',
                onSave: async (close) => { try { await WL.api.bmDeleteFolder(s.id); close(); reload(); } catch (e) { WL.toast('削除に失敗: ' + e.message, 'error'); } }
            });
        }

        paint();
        await reload();
    }

    WL.onEnsure(ensure);
})();
