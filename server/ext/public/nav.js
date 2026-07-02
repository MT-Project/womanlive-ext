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
        // ブックマークに追加 (動画ページFABと同じ「+」付きアイコン。一括操作メニュー等でも共用)
        'bookmark-add': '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3"></path><line x1="16" y1="5" x2="22" y2="5"></line><line x1="19" y1="2" x2="19" y2="8"></line>',
        // 公開カレンダー: 本家「カレンダー」とは別アイコン(チェック付き)
        'calendar-check': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
        library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
        'qr-code': '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
        settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
        search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
        'zoom-out': '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
        moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
        menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        puzzle: '<path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/>'
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
        { href: '/tags', icon: 'tag', label: 'タグ一覧' },
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

    /* ---------- 検索ヘルプ (？ボタン + ポップオーバー) ---------- */
    // PCはホバー、タッチはタップで表示。本家の検索構文と拡張の検索方法を案内。
    let helpPop = null, helpPinned = false, helpTimer = null, helpAnchor = null;

    function helpRow(code, desc) {
        return h('div', { class: 'wlext-help-row' }, [
            h('code', { class: 'wlext-help-code' }, code),
            h('span', { class: 'wlext-help-desc' }, desc)
        ]);
    }
    function buildHelpContent() {
        return [
            h('div', { class: 'wlext-help-title' }, '検索のヘルプ'),
            h('h4', null, '基本 (WomanLive)'),
            helpRow('犬 猫', 'AND 検索（すべて含む）'),
            helpRow('犬 OR 猫', 'OR 検索（どちらかを含む）'),
            helpRow('"Woman Live"', '空白を含む語句をそのまま検索'),
            helpRow('-犬', '除外（その語を含まない）'),
            helpRow('!犬', '指定したタグを含む動画'),
            helpRow('~ (先頭)', '正規化検索（全角/半角・ひらがな/カタカナを区別しない）'),
            h('div', { class: 'wlext-help-note' }, '照合対象: ファイルパス・タグ・表示動画名'),
            h('h4', null, '日付・再生時間'),
            helpRow('>2024/01/01', '指定した日以降に登録した動画'),
            helpRow('<2024/12/31', '指定した日以前に登録した動画'),
            helpRow('>30', '再生時間が 30 分より長い'),
            helpRow('<10', '再生時間が 10 分より短い'),
            h('h4', null, '拡張機能の検索'),
            h('div', { class: 'wlext-help-note' }, '動画ページや各一覧のリンク・ボタンから自動入力されます（手入力も可）。'),
            helpRow('@maker:"名前"', 'メーカー名で検索（series / label / genre / director も同様）'),
            helpRow('@model:"品番"', '品番で検索'),
            helpRow('@tag:"名前"', 'タグで検索'),
            helpRow('@performer:ID', '出演者で検索'),
            helpRow('@rating:4', '評価で検索（@rating:>=4 など演算子も可）'),
            helpRow('@releaseyear:"2024"', '公開年（@releasemonth:"2024-01" / @release:none も可）'),
            helpRow('@bookmark:ID', 'ブックマークフォルダで検索'),
            helpRow('@notmaker:"名前"', '除外（notseries / notlabel / notgenre / notdirector / notperformer）')
        ];
    }
    function ensureHelpPop() {
        if (helpPop) return helpPop;
        helpPop = h('div', { class: 'wlext-help-pop' }, buildHelpContent());
        helpPop.addEventListener('mouseenter', () => clearTimeout(helpTimer));
        helpPop.addEventListener('mouseleave', () => { if (!helpPinned) helpTimer = setTimeout(hideHelp, 200); });
        document.body.appendChild(helpPop);
        return helpPop;
    }
    function positionHelp() {
        if (!helpPop || !helpAnchor) return;
        const r = helpAnchor.getBoundingClientRect();
        helpPop.style.top = (r.bottom + 8) + 'px';
        const w = helpPop.offsetWidth || 360;
        let left = r.right - w;
        const maxLeft = window.innerWidth - 8 - w;
        if (left > maxLeft) left = maxLeft;
        if (left < 8) left = 8;
        helpPop.style.left = left + 'px';
    }
    function showHelp(anchor) { helpAnchor = anchor; ensureHelpPop(); helpPop.style.display = 'block'; positionHelp(); }
    function hideHelp() { if (helpPop) helpPop.style.display = 'none'; helpPinned = false; }

    function makeHelpBtn() {
        const btn = h('button', { class: 'wlext-action wlext-help-btn', type: 'button', title: '検索のヘルプ' });
        btn.innerHTML = iconSvg('help', 20, 2);
        btn.addEventListener('mouseenter', () => { clearTimeout(helpTimer); showHelp(btn); });
        btn.addEventListener('mouseleave', () => { if (helpPinned) return; helpTimer = setTimeout(hideHelp, 200); });
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const open = helpPop && helpPop.style.display === 'block';
            if (helpPinned && open) hideHelp();
            else { helpPinned = true; showHelp(btn); }
        });
        return btn;
    }
    WL.makeHelpBtn = makeHelpBtn;

    document.addEventListener('click', (e) => {
        if (helpPop && helpPop.style.display === 'block' &&
            !helpPop.contains(e.target) && !(e.target.closest && e.target.closest('.wlext-help-btn'))) hideHelp();
    });
    window.addEventListener('resize', () => { if (helpPop && helpPop.style.display === 'block') positionHelp(); });

    // 本家ヘッダーの検索(虫めがね)ボタンの右に ? を差し込む (拡張ヘッダーは pageHeader 側で配置)
    function patchSearchHelp() {
        document.querySelectorAll('nav').forEach(nav => {
            if (nav.classList.contains('wlext-nav')) return;
            const searchBtn = nav.querySelector('div[title="検索"]');
            if (!searchBtn || !searchBtn.parentElement) return;
            if (searchBtn.parentElement.querySelector('.wlext-help-btn')) return;
            searchBtn.insertAdjacentElement('afterend', makeHelpBtn());
        });
    }

    /* ---------- 本家カレンダー(/calendar)の中クリック対応 ---------- */
    // 月/年は <a href> ではない div/h2 のクリックハンドラで遷移するため、そのままでは
    // 中クリック(新規タブ)が効かない。本体無改変のまま、本体と同じ URL 計算で
    // auxclick(中クリック)だけをフックして新規タブを開けるようにする。
    function calendarMonthUrl(year, month) {
        const lastDay = new Date(new Date(parseInt(year, 10), parseInt(month, 10), 1) - 1).getDate();
        return '/search?q=' + encodeURIComponent(`>${year}/${month}/01 <${year}/${month}/${lastDay}`);
    }
    function calendarYearUrl(year) {
        return '/search?q=' + encodeURIComponent(`>${year}/01/01 <${year}/12/31`);
    }
    function attachMiddleClick(el, urlFn) {
        el.dataset.wlextMid = '1';
        el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
        el.addEventListener('auxclick', (e) => { if (e.button !== 1) return; e.preventDefault(); window.open(urlFn(), '_blank'); });
    }
    function patchCalendarLinks() {
        if (location.pathname !== '/calendar') return;
        const root = document.getElementById('root'); if (!root) return;
        root.querySelectorAll('.y1ulw4s2').forEach(sec => {
            const yearEl = sec.querySelector('.y14kbhkq');
            const ym = yearEl && yearEl.textContent.match(/^(\d+)年/);
            if (!ym) return;
            const year = ym[1];
            if (!yearEl.dataset.wlextMid) attachMiddleClick(yearEl, () => calendarYearUrl(year));
            sec.querySelectorAll('.m9tt3rv').forEach(monthEl => {
                if (monthEl.dataset.wlextMid) return;
                const mm = monthEl.textContent.match(/^(\d+)月/);
                if (!mm) return;
                attachMiddleClick(monthEl, () => calendarMonthUrl(year, mm[1]));
            });
        });
    }

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
            h('a', { class: 'wlext-brand', href: '/', onClick: (e) => { e.preventDefault(); WL.navigate('/'); } }, 'WomanLiveEX'));
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
            searchBtn,
            makeHelpBtn()
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

    // 本家ヘッダーのロゴ「WomanLive」を「WomanLiveEX」へ置換 (拡張起動中の目印)
    function patchBrand() {
        document.querySelectorAll('a[href="/"]').forEach(a => {
            if (a.childElementCount === 0 && a.textContent.trim() === 'WomanLive') a.textContent = 'WomanLiveEX';
        });
    }

    WL.onEnsure(() => { patchReactHeader(); patchBrand(); patchSearchHelp(); maybeOpenQR(); patchCalendarLinks(); });

    /* ---------- ページ見出し (アイコン + テキスト) ---------- */
    WL.pageTitle = function (iconName, text) {
        const txt = h('span', null, text);
        const el = h('h2', { class: 'wlext-relcal-title' }, [WL.icon(iconName, 20), txt]);
        el.setText = (t) => { txt.textContent = t; };
        return el;
    };
})();
