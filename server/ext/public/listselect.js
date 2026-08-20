/* =============================================================
   WomanLive 拡張 - 一覧ページの選択モードと一括削除
   シリーズ一覧 / 出演者一覧 / タグ一覧 (＋個人用のジャンル一覧) で、
   検索結果の一括操作 (bulkselect.js) と同じ操作・同じ見た目のまま、
   選択した項目を全動画のメタデータから削除する。

   使い方: カード要素に data-wl-target(削除対象の値) と data-wl-name(表示名) を付け、
   一覧を描画したあとに WL.listSelect({ page, kind, kindLabel }) を呼ぶ。
   FAB はページ要素の中に入れる (.wlext-ext-page が z-index 4000 の重ね面のため)。
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    // FAB のアイコン (bulkselect.js と同じ図形で揃える)
    const svg = (p) => '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
    const ICON_MODE = svg('<path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>');
    const ICON_ALL = svg('<polyline points="20 6 9 17 4 12"></polyline>');
    const ICON_NONE = svg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>');
    const ICON_MENU = svg('<circle cx="12" cy="5" r="1.6" fill="currentColor"></circle><circle cx="12" cy="12" r="1.6" fill="currentColor"></circle><circle cx="12" cy="19" r="1.6" fill="currentColor"></circle>');

    // opts: { page, kind, kindLabel }
    //   kind      … サーバーの削除種別 (series / performer / tag / genre)
    //   kindLabel … メニューや確認ダイアログに出す日本語 (シリーズ / 出演者 / タグ / ジャンル)
    WL.listSelect = function (opts) {
        const page = opts.page;
        if (!page || page.querySelector('.wlext-sel-fabs')) return;

        let mode = false;
        const selected = new Map();   // target -> 表示名

        const cards = () => page.querySelectorAll('[data-wl-target]');
        const targetOf = (card) => card.getAttribute('data-wl-target');
        const nameOf = (card) => card.getAttribute('data-wl-name') || targetOf(card);

        function applyVisuals() {
            cards().forEach(card => {
                let badge = card.querySelector(':scope > .wlext-sel-badge');
                if (mode) {
                    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
                    if (!badge) { badge = h('div', { class: 'wlext-sel-badge' }); card.appendChild(badge); }
                    const on = selected.has(targetOf(card));
                    badge.classList.toggle('on', on);
                    badge.textContent = on ? '✓' : '';
                    card.classList.toggle('wlext-sel-on', on);
                } else {
                    if (badge) badge.remove();
                    card.classList.remove('wlext-sel-on');
                }
            });
        }

        function toggle(card) {
            const key = targetOf(card);
            if (selected.has(key)) selected.delete(key); else selected.set(key, nameOf(card));
            applyVisuals(); updateFabs();
        }
        function selectAll() { cards().forEach(c => selected.set(targetOf(c), nameOf(c))); applyVisuals(); updateFabs(); }
        function deselectAll() { selected.clear(); applyVisuals(); updateFabs(); }
        function setMode(on) { mode = on; if (!on) selected.clear(); closeMenu(); applyVisuals(); updateFabs(); }

        // 並び替えや絞り込みでカードが作り直されるとバッジが消えるので、
        // バッジの無いカードが現れたら付け直す (付け直した後は stale=false になり止まる)。
        const mo = new MutationObserver(() => {
            if (!page.isConnected) { mo.disconnect(); return; }
            if (!mode) return;
            const stale = [...cards()].some(c => !c.querySelector(':scope > .wlext-sel-badge'));
            if (stale) applyVisuals();
        });
        mo.observe(page, { childList: true, subtree: true });

        // 選択モード中はカードのクリックを選択トグルに変える。
        // カード(WL.navA の <a>)自身の onClick より先に止めたいので、キャプチャ段階で拾う。
        page.addEventListener('click', (e) => {
            if (!mode) return;
            const card = e.target && e.target.closest ? e.target.closest('[data-wl-target]') : null;
            if (!card) return;
            e.preventDefault(); e.stopPropagation();
            toggle(card);
        }, true);

        /* ---------- FAB ---------- */
        const btnMenu = h('button', { class: 'wlext-sel-fab wlext-sel-menu-btn', title: '一括操作メニュー', html: ICON_MENU, onClick: (e) => { e.stopPropagation(); toggleMenu(); } });
        const btnAll = h('button', { class: 'wlext-sel-fab', title: '表示中をすべて選択', html: ICON_ALL, onClick: (e) => { e.stopPropagation(); selectAll(); } });
        const btnNone = h('button', { class: 'wlext-sel-fab', title: '選択をすべて解除', html: ICON_NONE, onClick: (e) => { e.stopPropagation(); deselectAll(); } });
        const btnMode = h('button', { class: 'wlext-sel-fab wlext-sel-mode-btn', title: '選択モード', html: ICON_MODE, onClick: (e) => { e.stopPropagation(); setMode(!mode); } });
        page.appendChild(h('div', { class: 'wlext-sel-fabs' }, [btnMenu, btnAll, btnNone, btnMode]));

        function updateFabs() {
            btnMode.classList.toggle('active', mode);
            btnAll.style.display = mode ? '' : 'none';
            btnNone.style.display = mode ? '' : 'none';
            btnMenu.style.display = (mode && selected.size > 0) ? '' : 'none';
            btnMenu.setAttribute('data-count', selected.size);
            btnMenu.title = '一括操作 (' + selected.size + '件選択中)';
        }
        updateFabs();

        /* ---------- メニュー ---------- */
        let menuEl = null, backdrop = null;
        function closeMenu() { if (menuEl) menuEl.remove(); if (backdrop) backdrop.remove(); menuEl = backdrop = null; }
        function toggleMenu() { if (menuEl) { closeMenu(); return; } openMenu(); }
        function openMenu() {
            if (!selected.size) return;
            backdrop = h('div', { class: 'wlext-sel-menu-backdrop', onClick: closeMenu });
            menuEl = h('div', { class: 'wlext-sel-menu' }, [
                h('div', { class: 'wlext-sel-menu-head' }, selected.size + '件を一括操作'),
                h('div', { class: 'wlext-sel-menu-item danger', onClick: () => { closeMenu(); confirmDelete(); } },
                    [WL.icon('trash', 15), h('span', null, opts.kindLabel + 'の削除')])
            ]);
            document.body.appendChild(backdrop);
            document.body.appendChild(menuEl);
        }

        /* ---------- 削除 ---------- */
        function confirmDelete() {
            const names = [...selected.values()];
            const label = opts.kindLabel;
            const body = h('div', { style: { fontSize: '0.9rem', lineHeight: '1.7' } }, [
                h('div', { style: { color: 'var(--status-error,#e51400)', fontWeight: 'bold', marginBottom: '0.4rem' } },
                    '⚠ 選択した ' + names.length + '件の' + label + 'を削除します'),
                h('div', { class: 'wlext-sel-del-names' }, names.join('、')),
                h('div', { style: { marginTop: '0.5rem' } },
                    'すべての動画のメタデータから' + label + 'を取り除きます。動画そのものは削除しません。'),
                h('div', { style: { marginTop: '0.4rem', fontWeight: 'bold' } }, 'この操作は元に戻せません。よろしいですか？')
            ]);
            WL.dialog(label + 'の削除', body, {
                saveLabel: '削除する', danger: true,
                onSave: async (close) => {
                    try {
                        const r = await WL.api.deleteMetadataValues(opts.kind, [...selected.keys()]);
                        WL.toast(r.deleted + '件の' + label + 'を削除しました（動画 ' + r.videos + '件を更新）', 'success');
                        close();
                        setTimeout(() => location.reload(), 500);
                    } catch (e) { WL.toast('削除に失敗: ' + e.message, 'error'); }
                }
            });
        }
    };
})();
