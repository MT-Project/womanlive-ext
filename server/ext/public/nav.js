/* =============================================================
   WomanLive 拡張 - ナビゲーション統一
   ・モノクロ(lucide風)アイコン (本家ホーム/ヘッダーと同系統)
   ・拡張ページ共通ヘッダー (本家ヘッダーと同じ構成: ロゴ/検索/操作)
   ・ヘッダーのメニュー(ハンバーガー)とドロップダウン
   ・本家ヘッダーの「設定(⚙)」リンクをメニューへ差し替え
   ・テーマ(ダーク/ライト)切替を本家と同じ仕組みで再現
   ============================================================= */
(function () {
    'use strict';
    const WL = window.WLExt; const h = WL.h;

    /* ---------- アイコン (本家と同じ lucide のパスを使用; 単色 currentColor) ---------- */
    // viewBox 0 0 24 24 / fill:none / stroke:currentColor
    const ICONS = {
        image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
        camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
        calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
        folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
        // ブックマーク追加ボタン(塗り版)から「+」を除いた輪郭アイコン
        bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
        // 公開カレンダー: 本家「カレンダー」とは別アイコン(チェック付き)
        'calendar-check': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
        library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        'qr-code': '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
        settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
        search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
        'zoom-out': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
        moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
        menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>'
    };

    function iconSvg(name, size, sw) {
        size = size || 24;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
            '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) +
            '" stroke-linecap="round" stroke-linejoin="round" class="wlext-ico wlext-ico-' + name + '">' +
            (ICONS[name] || '') + '</svg>';
    }
    function iconNode(name, size, sw) {
        const t = document.createElement('div');
        t.innerHTML = iconSvg(name, size, sw);
        return t.firstElementChild;
    }
    WL.iconSvg = iconSvg;
    WL.icon = iconNode;

    /* ---------- テーマ (本家: localStorage 'theme_mode' + <html>.dark) ---------- */
    WL.isDark = () => document.documentElement.classList.contains('dark');
    WL.toggleTheme = () => {
        const dark = !WL.isDark();
        document.documentElement.classList.toggle('dark', dark);
        try { localStorage.setItem('theme_mode', dark ? 'dark' : 'light'); } catch (e) { }
    };

    /* ---------- メニュー項目 (ホーム画面の並び順) ---------- */
    const NAV_ITEMS = [
        { href: '/screenshots', icon: 'image', label: 'スクリーンショットギャラリー' },
        { href: '/calendar', icon: 'calendar', label: 'カレンダー' },
        { href: '/folder-tree', icon: 'folder', label: 'フォルダーツリー' },
        { href: '/bookmarks', icon: 'bookmark', label: 'ブックマーク' },
        { href: '/release-calendar', icon: 'calendar-check', label: '公開カレンダー' },
        { href: '/series', icon: 'library', label: 'シリーズ一覧' },
        { href: '/performers', icon: 'users', label: '出演者一覧' },
        { qr: true, icon: 'qr-code', label: 'QRコードでアクセス' }
    ];
    const SETTINGS_ITEM = { href: '/settings', icon: 'settings', label: '設定' };

    /* ---------- QR (本家ホームのダイアログを再利用) ---------- */
    function findHomeQRSpan() {
        const root = document.getElementById('root'); if (!root) return null;
        const spans = root.querySelectorAll('span');
        for (const sp of spans) { if (sp.textContent.trim() === 'QRコードでアクセス') return sp; }
        return null;
    }
    function openQR() {
        if (location.pathname === '/') {
            const span = findHomeQRSpan();
            if (span) { span.click(); return; }
        }
        try { sessionStorage.setItem('wlext_open_qr', '1'); } catch (e) { }
        WL.navigate('/');
    }
    // ホームへ遷移してきた時にフラグがあれば QR ダイアログを開く
    function maybeOpenQR() {
        if (location.pathname !== '/') return;
        let flag; try { flag = sessionStorage.getItem('wlext_open_qr'); } catch (e) { }
        if (!flag) return;
        const span = findHomeQRSpan();
        if (span) { try { sessionStorage.removeItem('wlext_open_qr'); } catch (e) { } span.click(); }
    }

    /* ---------- ドロップダウンメニュー ---------- */
    let menuEl = null, backdropEl = null;
    function closeMenu() {
        if (menuEl) { menuEl.remove(); menuEl = null; }
        if (backdropEl) { backdropEl.remove(); backdropEl = null; }
        document.removeEventListener('keydown', onMenuKey);
        window.removeEventListener('resize', closeMenu);
    }
    function onMenuKey(e) { if (e.key === 'Escape') closeMenu(); }
    function menuItemEl(it) {
        const el = h('div', { class: 'wlext-navmenu-item' }, [WL.icon(it.icon, 18), h('span', null, it.label)]);
        el.addEventListener('click', () => { closeMenu(); if (it.qr) openQR(); else WL.navigate(it.href); });
        return el;
    }
    function openMenu(anchor) {
        backdropEl = h('div', { class: 'wlext-navmenu-backdrop', onClick: closeMenu });
        menuEl = h('div', { class: 'wlext-navmenu' });
        NAV_ITEMS.forEach(it => menuEl.appendChild(menuItemEl(it)));
        menuEl.appendChild(h('div', { class: 'wlext-navmenu-sep' }));
        menuEl.appendChild(menuItemEl(SETTINGS_ITEM));
        document.body.appendChild(backdropEl);
        document.body.appendChild(menuEl);
        // アンカー(メニューボタン)の右下に配置
        const r = anchor.getBoundingClientRect();
        const w = menuEl.offsetWidth;
        let left = r.right - w; if (left < 8) left = 8;
        menuEl.style.position = 'fixed';
        menuEl.style.top = (r.bottom + 6) + 'px';
        menuEl.style.left = left + 'px';
        document.addEventListener('keydown', onMenuKey);
        window.addEventListener('resize', closeMenu);
    }
    function toggleMenu(anchor) { if (menuEl) closeMenu(); else openMenu(anchor); }

    function makeMenuBtn() {
        const btn = h('button', { class: 'wlext-action wlext-menu-btn', type: 'button', title: 'メニュー' });
        btn.innerHTML = iconSvg('menu', 20, 1.5);
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleMenu(btn); });
        return btn;
    }
    WL.makeMenuBtn = makeMenuBtn;

    /* ---------- 拡張ページ共通ヘッダー (本家ヘッダーと同じ構成) ---------- */
    function themeBtn() {
        const b = h('button', { class: 'wlext-action', type: 'button' });
        function paint() {
            const dark = WL.isDark();
            b.innerHTML = iconSvg(dark ? 'sun' : 'moon', 20, 1.5);
            b.title = dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
        }
        b.addEventListener('click', () => { WL.toggleTheme(); paint(); });
        paint();
        return b;
    }

    WL.pageHeader = function () {
        // ロゴ
        const logo = h('div', { class: 'wlext-logo' },
            h('a', { class: 'wlext-brand', href: '/', onClick: (e) => { e.preventDefault(); WL.navigate('/'); } }, 'WomanLive'));
        // 検索
        const input = h('input', { class: 'wlext-search-input', type: 'text', placeholder: '動画を検索...', spellcheck: 'false' });
        const submit = () => {
            const q = input.value.trim();
            const sort = localStorage.getItem('search_sort') || 'updated_desc';
            const per = localStorage.getItem('search_perPage') || '20';
            WL.navigate('/search?q=' + encodeURIComponent(q) + '&sort=' + sort + '&page=1&perPage=' + per);
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        const searchBtn = h('div', { class: 'wlext-action wlext-search-btn', title: '検索', onClick: submit }, WL.icon('search', 20));
        const search = h('div', { class: 'wlext-search' }, [
            h('div', { class: 'wlext-search-wrap' }, input),
            searchBtn
        ]);
        // 右側操作
        const actions = h('div', { class: 'wlext-actions' }, [themeBtn(), makeMenuBtn()]);
        return h('nav', { class: 'wlext-nav' }, [logo, search, actions]);
    };

    /* ---------- 本家ヘッダーへの差し込み (設定⚙ → メニュー) ---------- */
    function patchReactHeader() {
        const gear = document.querySelector('nav a[href="/settings"]');
        if (!gear) return;
        const nav = gear.closest('nav'); if (!nav) return;
        const actions = gear.parentElement;
        const mbtn = (actions || nav).querySelector('.wlext-menu-btn');

        // 設定ページは現状維持 (⚙のまま / メニュー無し)
        if (location.pathname === '/settings') {
            gear.style.display = '';
            if (actions) actions.classList.remove('wlext-actions-force');
            if (mbtn) mbtn.remove();
            return;
        }
        gear.style.display = 'none';
        if (actions) {
            actions.classList.add('wlext-actions-force');
            if (!mbtn) actions.appendChild(makeMenuBtn());
        } else if (!mbtn) {
            nav.appendChild(makeMenuBtn());
        }
    }

    WL.onEnsure(() => { patchReactHeader(); maybeOpenQR(); });

    /* ---------- ページ見出し (アイコン + テキスト) ---------- */
    WL.pageTitle = function (iconName, text) {
        const txt = h('span', null, text);
        const el = h('h2', { class: 'wlext-relcal-title' }, [WL.icon(iconName, 20), txt]);
        el.setText = (t) => { txt.textContent = t; };
        return el;
    };
})();
