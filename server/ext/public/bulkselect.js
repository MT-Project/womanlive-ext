/* =============================================================
   WomanLive 拡張 - 検索結果の一括操作 (選択モード)
   ・選択モードFAB(下) → 全選択/全選択解除(上) → メニュー(さらに上)
   ・選択した複数動画へ タグ追加 / 詳細情報編集 / ブックマーク追加 / 削除
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    let selectionMode = false;
    const selected = new Set();   // 動画id(number)

    /* ---------- 対象カード ---------- */
    function getCards() {
        const root = document.getElementById('root');
        return root ? root.querySelectorAll('a[href^="/watch/"]') : [];
    }
    function cardId(card) {
        const m = (card.getAttribute('href') || '').match(/\/watch\/(\d+)/);
        return m ? Number(m[1]) : null;
    }

    /* ---------- 選択の見た目 ---------- */
    function applyVisuals() {
        getCards().forEach(card => {
            const id = cardId(card); if (id == null) return;
            let badge = card.querySelector(':scope > .wlext-sel-badge');
            if (selectionMode) {
                if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
                if (!badge) { badge = h('div', { class: 'wlext-sel-badge' }); card.appendChild(badge); }
                const on = selected.has(id);
                badge.classList.toggle('on', on);
                badge.textContent = on ? '✓' : '';
                card.classList.toggle('wlext-sel-on', on);
            } else {
                if (badge) badge.remove();
                card.classList.remove('wlext-sel-on');
            }
        });
    }

    function toggleSelect(id) {
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        applyVisuals(); updateFabs();
    }
    function selectAllVisible() {
        getCards().forEach(card => { const id = cardId(card); if (id != null) selected.add(id); });
        applyVisuals(); updateFabs();
    }
    function deselectAll() { selected.clear(); applyVisuals(); updateFabs(); }
    function setSelectionMode(on) {
        selectionMode = on;
        if (!on) selected.clear();
        closeMenu();
        applyVisuals(); updateFabs();
    }

    // 選択モード中はカードのクリックを選択トグルに変える (キャプチャ段階でReact遷移を抑止)
    document.addEventListener('click', (e) => {
        if (!selectionMode) return;
        const t = e.target;
        const card = t && t.closest ? t.closest('a[href^="/watch/"]') : null;
        if (!card) return;
        const root = document.getElementById('root');
        if (!root || !root.contains(card)) return;
        e.preventDefault(); e.stopPropagation();
        const id = cardId(card); if (id != null) toggleSelect(id);
    }, true);

    /* ---------- FAB ---------- */
    let fabs = null, btnMenu, btnAll, btnNone, btnMode;
    function svg(p, fill) {
        return '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="' + (fill || 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
    }
    const ICON_MODE = svg('<path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>');
    const ICON_ALL = svg('<polyline points="20 6 9 17 4 12"></polyline>');
    const ICON_NONE = svg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>');
    const ICON_MENU = svg('<circle cx="12" cy="5" r="1.6" fill="currentColor"></circle><circle cx="12" cy="12" r="1.6" fill="currentColor"></circle><circle cx="12" cy="19" r="1.6" fill="currentColor"></circle>');

    function buildFabs() {
        btnMenu = h('button', { class: 'wlext-sel-fab wlext-sel-menu-btn', title: '一括操作メニュー', html: ICON_MENU, onClick: (e) => { e.stopPropagation(); toggleMenu(); } });
        btnAll = h('button', { class: 'wlext-sel-fab', title: '表示中をすべて選択', html: ICON_ALL, onClick: (e) => { e.stopPropagation(); selectAllVisible(); } });
        btnNone = h('button', { class: 'wlext-sel-fab', title: '選択をすべて解除', html: ICON_NONE, onClick: (e) => { e.stopPropagation(); deselectAll(); } });
        btnMode = h('button', { class: 'wlext-sel-fab wlext-sel-mode-btn', title: '選択モード', html: ICON_MODE, onClick: (e) => { e.stopPropagation(); setSelectionMode(!selectionMode); } });
        fabs = h('div', { class: 'wlext-sel-fabs' }, [btnMenu, btnAll, btnNone, btnMode]);
        document.body.appendChild(fabs);
        updateFabs();
    }
    function updateFabs() {
        if (!fabs) return;
        btnMode.classList.toggle('active', selectionMode);
        btnAll.style.display = selectionMode ? '' : 'none';
        btnNone.style.display = selectionMode ? '' : 'none';
        btnMenu.style.display = (selectionMode && selected.size > 0) ? '' : 'none';
        btnMenu.setAttribute('data-count', selected.size);
        btnMenu.title = '一括操作 (' + selected.size + '件選択中)';
    }
    function removeFabs() { if (fabs) { fabs.remove(); fabs = null; } closeMenu(); }

    /* ---------- メニュー ---------- */
    let menuEl = null, menuBackdrop = null;
    function closeMenu() { if (menuEl) menuEl.remove(); if (menuBackdrop) menuBackdrop.remove(); menuEl = menuBackdrop = null; }
    function toggleMenu() { if (menuEl) { closeMenu(); return; } openMenu(); }
    function openMenu() {
        const ids = [...selected];
        if (!ids.length) return;
        menuBackdrop = h('div', { class: 'wlext-sel-menu-backdrop', onClick: closeMenu });
        menuEl = h('div', { class: 'wlext-sel-menu' }, [
            h('div', { class: 'wlext-sel-menu-head' }, ids.length + '件を一括操作'),
            h('div', { class: 'wlext-sel-menu-item', onClick: () => { closeMenu(); doTags(ids); } }, '🏷 タグ追加'),
            h('div', { class: 'wlext-sel-menu-item', onClick: () => { closeMenu(); doMeta(ids); } }, '✎ 詳細情報編集'),
            h('div', { class: 'wlext-sel-menu-item', onClick: () => { closeMenu(); doBookmark(ids); } }, '🔖 ブックマーク追加'),
            h('div', { class: 'wlext-sel-menu-item danger', onClick: () => { closeMenu(); doDelete(ids); } }, '🗑 動画の削除'),
        ]);
        document.body.appendChild(menuBackdrop);
        document.body.appendChild(menuEl);
    }

    function afterAction(refresh) {
        deselectAll();
        if (refresh !== false) window.dispatchEvent(new Event('library-updated'));
    }

    /* ---------- タグ追加 ---------- */
    function doTags(ids) {
        WL.presetTagDialog({
            title: 'タグを追加（' + ids.length + '件）',
            current: [],
            // グループ対応の動画タグプリセット (動画単体ページと共用)
            loadPresets: () => WL.loadVideoTagPresets(),
            savePresets: (arr) => WL.saveVideoTagPresets(arr),
            onSave: async (tags) => {
                if (!tags.length) { WL.toast('追加するタグを選んでください', 'error'); return; }
                try { const r = await WL.api.bulkTags(ids, tags); WL.toast(r.count + '件にタグを追加しました', 'success'); afterAction(); }
                catch (e) { WL.toast('失敗: ' + e.message, 'error'); }
            }
        });
    }

    /* ---------- 詳細情報編集 (表示動画名なし) ---------- */
    function doMeta(ids) {
        const temp = { rating: 0 };
        const ratingHost = h('div');
        ratingHost.appendChild(WL.starsEl(0, (n) => { temp.rating = n; }));
        const inModel = h('input', { class: 'wlext-input' });
        const inRelease = h('input', { class: 'wlext-input', type: 'date' });
        const inSeries = h('input', { class: 'wlext-input' });
        const inMaker = h('input', { class: 'wlext-input' });
        const inLabel = h('input', { class: 'wlext-input' });
        const directorsInput = WL.chipInput([], '監督名を入力してEnter');
        const performersInput = WL.performerInput([]);
        const genresInput = WL.chipInput([], 'ジャンルを入力してEnter');
        const field = (label, node) => h('div', { class: 'wlext-field' }, [h('label', null, label), node]);

        const body = h('div', null, [
            h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#888)', marginBottom: '0.6rem' } },
                '入力した項目のみ上書きします（空欄は変更しません）。ジャンルは既存に追加します。表示動画名は一括では変更できません。'),
            field('評価（★を選ぶと一括設定）', ratingHost),
            field('出演者（上書き）', performersInput.el),
            field('ジャンル（追加）', genresInput.el),
            h('div', { class: 'wlext-row2' }, [field('公開日', inRelease), field('品番', inModel)]),
            h('div', { class: 'wlext-row2' }, [field('シリーズ名', inSeries), field('作品監督', directorsInput.el)]),
            h('div', { class: 'wlext-row2' }, [field('メーカー', inMaker), field('レーベル', inLabel)]),
        ]);

        WL.dialog('詳細情報を一括編集（' + ids.length + '件）', body, {
            saveLabel: '適用',
            onSave: async (close) => {
                const meta = {
                    rating: temp.rating,
                    model_no: inModel.value.trim(),
                    release_date: inRelease.value.trim(),
                    series: inSeries.value.trim(),
                    maker: inMaker.value.trim(),
                    label: inLabel.value.trim(),
                    directors: directorsInput.getValues(),
                    genres: genresInput.getValues(),
                    performers: performersInput.getValues().map(p => p.id),
                };
                try { const r = await WL.api.bulkEditMeta(ids, meta); WL.toast(r.count + '件を更新しました', 'success'); close(); afterAction(); }
                catch (e) { WL.toast('失敗: ' + e.message, 'error'); }
            }
        });
    }

    /* ---------- ブックマーク一括追加 ---------- */
    async function doBookmark(ids) {
        let folders;
        try { folders = await WL.api.bmFolders(); } catch (e) { WL.toast('読み込み失敗: ' + e.message, 'error'); return; }

        const listHost = h('div', { class: 'wlext-bm-dlg-list' });
        function render() {
            listHost.innerHTML = '';
            if (!folders.length) listHost.appendChild(h('div', { style: { color: 'var(--text-secondary,#888)', fontSize: '0.85rem', padding: '0.5rem' } }, 'フォルダがありません。下で追加してください。'));
            folders.forEach(f => {
                listHost.appendChild(h('div', {
                    class: 'wlext-bm-dlg-item',
                    onClick: async () => {
                        try {
                            const r = await WL.api.bulkBookmark(ids, f.id);
                            ids.forEach(id => { if (WL._bmIds) WL._bmIds.add(Number(id)); });
                            if (WL.repaintBookmarks) WL.repaintBookmarks();
                            WL.toast('「' + f.name + '」に ' + r.count + '件追加しました', 'success');
                        } catch (e) { WL.toast('失敗: ' + e.message, 'error'); }
                    }
                }, [h('span', { class: 'name' }, f.name), h('span', { class: 'chk' }, '＋')]));
            });
        }
        render();
        const input = h('input', { class: 'wlext-input', placeholder: '新しいフォルダ名' });
        const addBtn = h('button', {
            class: 'wlext-btn', onClick: async () => {
                const name = input.value.trim(); if (!name) return;
                try {
                    const nf = await WL.api.bmCreateFolder(name);
                    const r = await WL.api.bulkBookmark(ids, nf.id);
                    ids.forEach(id => { if (WL._bmIds) WL._bmIds.add(Number(id)); });
                    if (WL.repaintBookmarks) WL.repaintBookmarks();
                    folders.push({ id: nf.id, name: nf.name, count: r.count });
                    input.value = ''; render();
                    WL.toast('「' + nf.name + '」に追加しました', 'success');
                } catch (e) { WL.toast('失敗: ' + e.message, 'error'); }
            }
        }, '＋追加');

        const body = h('div', null, [
            h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary,#888)', marginBottom: '0.5rem' } }, '選択した ' + ids.length + '件を追加するフォルダをタップしてください。'),
            listHost,
            h('div', { class: 'wlext-inline', style: { marginTop: '0.8rem' } }, [input, addBtn])
        ]);
        WL.dialog('ブックマークに一括追加', body, {});
    }

    /* ---------- 削除 ---------- */
    function doDelete(ids) {
        const body = h('div', { style: { fontSize: '0.9rem', lineHeight: '1.7' } }, [
            h('div', { style: { color: 'var(--status-error,#e51400)', fontWeight: 'bold', marginBottom: '0.4rem' } }, '⚠ 選択した ' + ids.length + '件の動画を削除します'),
            h('div', null, '元の動画ファイルが削除され、関連するスクリーンショット・カバー画像・追加情報・ブックマークも削除されます。'),
            h('div', { style: { marginTop: '0.4rem', fontWeight: 'bold' } }, 'この操作は元に戻せません。よろしいですか？')
        ]);
        WL.dialog('動画の削除', body, {
            saveLabel: '削除する', danger: true,
            onSave: async (close) => {
                try {
                    const r = await WL.api.bulkDelete(ids);
                    WL.toast(r.deleted + '件を削除しました' + (r.fileErrors ? '（ファイル削除に失敗 ' + r.fileErrors + '件）' : ''), 'success');
                    close(); afterAction();
                } catch (e) { WL.toast('削除に失敗: ' + e.message, 'error'); }
            }
        });
    }

    /* ---------- ensure ---------- */
    function ensure() {
        if (location.pathname !== '/search') { if (fabs) { setSelectionMode(false); removeFabs(); } return; }
        if (!fabs) buildFabs();
        if (selectionMode) applyVisuals();
    }
    WL.onEnsure(ensure);
    WL.onRoute(() => { if (location.pathname !== '/search') { setSelectionMode(false); removeFabs(); } });
})();
